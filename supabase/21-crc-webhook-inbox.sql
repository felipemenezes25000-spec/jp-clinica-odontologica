-- ============================================================================
-- CRC — a inbox de webhook vira fila de verdade. Corrige um P0.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
--
-- O DEFEITO: a tabela existia, era escrita, e ninguém a lia.
--
-- `crc_webhook_inbox` nasceu como "inbox pattern": grava o envelope antes de
-- processar, para poder repescar se algo falhar. A gravação foi feita. A
-- repescagem nunca existiu — não havia consumidor. O resultado:
--
--     Meta envia o webhook
--       ↓
--     CRC grava o envelope                          ✅
--       ↓
--     começa a processar
--       ↓
--     💥 o banco pisca
--       ↓
--     a linha vira FALHOU
--       ↓
--     o CRC responde 200 para a Meta
--       ↓
--     a Meta considera entregue e nunca reenvia
--       ↓
--     ninguém repesca
--
-- A mensagem do paciente fica perdida. Não há erro, não há alerta, e a Meta
-- não vai ajudar: do lado dela deu certo.
--
-- O 200 está CERTO — reenviar não conserta defeito nosso, e webhook que não
-- responde 200 rápido é webhook que a Meta acaba desligando. O que faltava era
-- o outro lado do trato: se assumimos a responsabilidade de reprocessar, é
-- preciso reprocessar de verdade.
--
-- O QUE ESTA MIGRAÇÃO FAZ: dá a esta tabela a mesma maquinaria que
-- `crc_agent_jobs` já tem e que funciona — reserva atômica, lease, backoff,
-- teto de tentativas e dead letter.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. As colunas de fila
-- ----------------------------------------------------------------------------

-- Quando esta linha volta a estar disponível. É o backoff: uma falha não
-- devolve o envelope à fila no mesmo segundo para falhar de novo.
alter table public.crc_webhook_inbox
  add column if not exists disponivel_em timestamptz not null default now();

alter table public.crc_webhook_inbox
  add column if not exists travado_ate timestamptz;

-- Quem está processando. A mesma pergunta operacional dos outros leases:
-- quando um envelope trava sempre, é o envelope ou é o worker?
alter table public.crc_webhook_inbox
  add column if not exists travado_por text;

/*
 * O ÍNDICE DA FILA PRECISA SER REFEITO.
 *
 * O antigo era `(status, criado_em) where status = 'PENDENTE'`. Com retry, a
 * fila deixou de ser só PENDENTE: ela é "PENDENTE ou FALHOU, cujo backoff já
 * venceu". O índice antigo não cobre isso e a reserva viraria varredura de
 * tabela — barata hoje, cara no dia do incidente, que é exatamente o dia em que
 * a tabela tem volume.
 */
drop index if exists public.crc_webhook_inbox_fila;

create index if not exists idx_crc_webhook_inbox_fila
  on public.crc_webhook_inbox (disponivel_em)
  where status in ('PENDENTE', 'FALHOU');

-- Os travados: é o que a limpeza de presos olha.
create index if not exists idx_crc_webhook_inbox_travados
  on public.crc_webhook_inbox (travado_ate)
  where status = 'PROCESSANDO';

-- ----------------------------------------------------------------------------
-- 2. A reserva atômica
-- ----------------------------------------------------------------------------
--
-- `FOR UPDATE SKIP LOCKED`, igual às outras três filas do CRC. Dois workers no
-- mesmo minuto — o que acontece quando o agendador do pulso se sobrepõe à volta
-- diária — nunca pegam o mesmo envelope.
--
-- A TENTATIVA É INCREMENTADA NA RESERVA, e não no fim. Um envelope que derruba
-- o worker toda vez nunca chegaria ao teto se o incremento fosse no fim: ele
-- morreria antes de escrever. É a mesma lição de `crc_reservar_agent_jobs`.
create or replace function public.crc_reservar_webhooks(
  limite        integer default 10,
  lock_segundos integer default 120,
  quem          text default null,
  max_tentativas integer default 5
)
returns setof public.crc_webhook_inbox
language plpgsql
as $corpo$
begin
  return query
  update public.crc_webhook_inbox w
     set status      = 'PROCESSANDO',
         travado_ate = now() + make_interval(secs => lock_segundos),
         travado_por = quem,
         tentativas  = w.tentativas + 1
   where w.id in (
     select i.id
       from public.crc_webhook_inbox i
      where (
              i.status in ('PENDENTE', 'FALHOU')
              -- Lease vencido: o worker morreu e o trabalho volta a ser de quem
              -- pegar. É o que torna crash recuperável aqui também.
              or (i.status = 'PROCESSANDO'
                  and i.travado_ate is not null
                  and i.travado_ate < now())
            )
        and i.disponivel_em <= now()
        and i.tentativas < max_tentativas
      order by i.disponivel_em
      limit limite
      for update skip locked
   )
  returning w.*;
end $corpo$;

-- ----------------------------------------------------------------------------
-- 3. Os presos
-- ----------------------------------------------------------------------------
--
-- Um envelope PROCESSANDO com lease vencido E o teto estourado não aparece na
-- fila (a reserva ignora quem passou do teto) nem na lista de falhas (o status
-- é PROCESSANDO). Ele some — e do outro lado tem um paciente que escreveu.
create or replace function public.crc_liberar_webhooks_presos(
  max_tentativas integer default 5
)
returns integer
language plpgsql
as $corpo$
declare
  quantos integer;
begin
  update public.crc_webhook_inbox
     set status = 'FALHOU',
         travado_ate = null,
         ultimo_erro = coalesce(ultimo_erro, 'O worker não terminou o webhook e o lease venceu.')
   where status = 'PROCESSANDO'
     and travado_ate is not null
     and travado_ate < now()
     and tentativas >= max_tentativas;

  get diagnostics quantos = row_count;
  return quantos;
end $corpo$;

-- ----------------------------------------------------------------------------
-- 4. Retenção
-- ----------------------------------------------------------------------------
--
-- POR QUE APAGAR, E NÃO GUARDAR PARA SEMPRE. Enquanto o envelope está pendente
-- ou falho, o `payload` guarda o telefone e o texto da mensagem — é o que o
-- replay precisa. Depois de processado, esse conteúdo já está em
-- `crc_messages`, com as regras de acesso de lá, e manter a cópia aqui seria um
-- segundo lugar com PII e outra política de retenção (item 75).
--
-- O código apaga o payload ao concluir; esta função apaga a LINHA depois, para
-- a tabela não virar histórico. Fila é fila.
create or replace function public.crc_limpar_webhooks_antigos(
  p_dias integer default 30
)
returns integer
language plpgsql
as $corpo$
declare
  quantos integer;
begin
  delete from public.crc_webhook_inbox
   where status = 'PROCESSADO'
     and processado_em < now() - make_interval(days => p_dias);

  get diagnostics quantos = row_count;
  return quantos;
end $corpo$;

alter table public.crc_webhook_inbox enable row level security;

-- ----------------------------------------------------------------------------
-- Privilégios
-- ----------------------------------------------------------------------------
--
-- POR QUE A MIGRAÇÃO CONCEDE, em vez de confiar no default.
--
-- Tabela criada DEPOIS dos `grant` de instalação nasce sem privilégio para
-- `service_role` — e o app inteiro fala com o banco por ela. O sintoma é
-- `permission denied`, e ele aparece só quando alguém exercita o caminho novo,
-- que costuma ser em produção.
--
-- No Supabase o `alter default privileges` geralmente cobre isso. "Geralmente"
-- não é bom o bastante para uma migração aplicada à mão: repetir o grant é
-- idempotente e remove a dependência de como a instalação foi configurada.
do $privilegios$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant all on all functions in schema public to service_role';
  end if;

  -- `anon` só lê, e só o que a RLS deixar. É o papel do cliente não
  -- autenticado; dar escrita a ele seria dar escrita à internet.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on all tables in schema public to anon';
  end if;
end $privilegios$;
