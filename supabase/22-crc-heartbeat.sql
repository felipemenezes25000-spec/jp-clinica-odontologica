-- ============================================================================
-- CRC — heartbeat e fencing. O reclaim para de roubar turno de quem está vivo.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão.
--
-- O DEFEITO, e ele é consequência de um conserto anterior.
--
-- O lease do job e da run é de 180 segundos. Um turno do agente aceita até
-- cinco passos, e cada chamada de modelo pode esperar ~25s, com retentativa de
-- structured output por cima. A cadeia real é:
--
--     modelo → ferramenta → Dental Office → modelo → ferramenta → modelo
--
-- Um turno lento mas PERFEITAMENTE VIVO passa dos 180s. E aí:
--
--     worker A ainda executando
--       ↓
--     o lease vence
--       ↓
--     worker B encontra "abandonado"
--       ↓
--     RECLAIM
--
-- O reclaim — que existe justamente para recuperar crash — passa a agir contra
-- um worker que não caiu. Duas execuções do mesmo turno, ao mesmo tempo: duas
-- chamadas de modelo, e possivelmente duas mensagens para o paciente.
--
-- AUMENTAR O LEASE NÃO RESOLVE. Dez minutos só troca o limite de lugar, e
-- piora a recuperação: um worker que morre de verdade segura o trabalho por dez
-- minutos em vez de três. O que resolve são duas coisas:
--
--   HEARTBEAT   quem está vivo renova o próprio lease. "Vivo" deixa de ser uma
--               aposta sobre duração e passa a ser um fato observado.
--
--   FENCING     quem PERDEU o lease não pode mais concluir. Sem isso, o worker
--               A acorda depois do reclaim e grava o desfecho por cima do que o
--               worker B está fazendo — e o último a escrever vence, que é o
--               pior critério possível.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O token de posse
-- ----------------------------------------------------------------------------
--
-- POR QUE UM TOKEN, E NÃO O `travado_por`. O identificador do worker se repete:
-- a mesma invocação pode pegar o job, morrer, e outra invocação do mesmo cron
-- reivindicar com um nome parecido. O token é gerado A CADA RESERVA, então
-- "sou o dono" vira uma comparação exata de um valor que só a reserva atual
-- conhece.
alter table public.crc_agent_jobs
  add column if not exists lease_token uuid;

alter table public.crc_ai_runs
  add column if not exists lease_token uuid;

-- ----------------------------------------------------------------------------
-- 2. A reserva passa a emitir token
-- ----------------------------------------------------------------------------
--
-- Mesma função de sempre, com `lease_token = gen_random_uuid()` no update. Quem
-- reserva recebe o token na linha devolvida e o carrega pelo resto do turno.
-- A FUNÇÃO É A DO ARQUIVO 17, PALAVRA POR PALAVRA, com UMA linha a mais:
-- `lease_token = gen_random_uuid()`. Reescrevê-la de memória para acrescentar um
-- campo é como se perdem guardas sutis — a primeira tentativa deste arquivo já
-- tinha perdido o `and (travado_ate is null or travado_ate < now())` e trocado a
-- ordenação de `disponivel_em` para `criado_em`, sem querer.
create or replace function public.crc_reservar_agent_jobs(
  limite        integer default 5,
  lock_segundos integer default 180,
  quem          text default null
)
returns setof public.crc_agent_jobs
language plpgsql
as $corpo$
begin
  return query
  update public.crc_agent_jobs j
     set status      = 'RODANDO',
         travado_ate = now() + make_interval(secs => lock_segundos),
         travado_por = quem,
         -- A ÚNICA LINHA NOVA. Um token por reserva: "sou o dono" passa a ser
         -- uma comparação exata de um valor que só a reserva atual conhece.
         lease_token = gen_random_uuid(),
         comecou_em  = now(),
         tentativas  = j.tentativas + 1,
         atualizado_em = now()
   where j.id in (
     select id from public.crc_agent_jobs
      where (
              status in ('PENDENTE', 'REPETIR')
              or (status = 'RODANDO' and travado_ate is not null and travado_ate < now())
            )
        and disponivel_em <= now()
        and (travado_ate is null or travado_ate < now())
        and tentativas < 5
      order by disponivel_em
      limit limite
      for update skip locked
   )
  returning j.*;
end $corpo$;

-- ----------------------------------------------------------------------------
-- 3. O heartbeat
-- ----------------------------------------------------------------------------
--
-- Renova o lease do job E da run, numa chamada só, e SOMENTE se o token bater.
--
-- O RETORNO É O QUE IMPORTA: `false` significa "você não é mais o dono". Quem
-- chama precisa PARAR — outro worker já assumiu, e continuar produziria a
-- execução dupla que todo este arquivo existe para evitar.
create or replace function public.crc_renovar_lease(
  p_job_id      uuid,
  p_lease_token uuid,
  p_segundos    integer default 180
)
returns boolean
language plpgsql
as $corpo$
declare
  renovados integer;
begin
  update public.crc_agent_jobs
     set travado_ate = now() + make_interval(secs => p_segundos),
         atualizado_em = now()
   where id = p_job_id
     and lease_token = p_lease_token
     -- SÓ RENOVA O QUE AINDA ESTÁ RODANDO. Um job já concluído ou já falhado
     -- não volta ao estado de trabalho por causa de um heartbeat atrasado que
     -- chegou depois do desfecho.
     and status = 'RODANDO';

  get diagnostics renovados = row_count;
  if renovados = 0 then
    return false;
  end if;

  -- A run acompanha o job: os dois leases precisam vencer juntos, senão a run
  -- é assumida por outro worker enquanto o dono do job ainda trabalha.
  update public.crc_ai_runs
     set travado_ate = now() + make_interval(secs => p_segundos)
   where job_id = p_job_id
     and resultado = 'RODANDO';

  return true;
end $corpo$;

-- ----------------------------------------------------------------------------
-- 4. O fencing na conclusão
-- ----------------------------------------------------------------------------
--
-- CONCLUIR TAMBÉM PRECISA PROVAR POSSE, e este é o lado que falta em quase toda
-- implementação de lease.
--
-- Sem isto: o worker A perde o lease, o B assume e responde o paciente, e então
-- o A — que continuou rodando, lento mas vivo — grava `CONCLUIDO` por cima. O
-- job sai da fila com o desfecho do perdedor, e o trabalho do B fica sem
-- registro. O último a escrever vence, que é o pior critério possível para
-- decidir o que aconteceu.
create or replace function public.crc_encerrar_agent_job(
  p_job_id      uuid,
  p_lease_token uuid,
  p_status      text,
  p_erro        text default null,
  p_duracao_ms  integer default null
)
returns boolean
language plpgsql
as $corpo$
declare
  afetados integer;
begin
  update public.crc_agent_jobs
     set status      = p_status,
         ultimo_erro = coalesce(p_erro, ultimo_erro),
         duracao_ms  = coalesce(p_duracao_ms, duracao_ms),
         terminou_em = now(),
         travado_ate = null,
         atualizado_em = now()
   where id = p_job_id
     and lease_token = p_lease_token
     and status = 'RODANDO';

  get diagnostics afetados = row_count;
  return afetados > 0;
end $corpo$;

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
