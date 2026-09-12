-- ============================================================================
-- CRC — o cursor de sync, simplificado. Conserta um P0 que EU criei no 23.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. **Rodar ANTES do próximo deploy de código.**
--
-- O DEFEITO, e ele é meu.
--
-- O `supabase/23` trocou a chave primária de `crc_sync_state` para incluir a
-- clínica — o que estava certo. E não atualizou quem dependia da chave antiga:
--
--     gravar("crc_sync_state", {...}, "organization_id,recurso")
--
-- Esse upsert vira `ON CONFLICT (organization_id, recurso)`, e essa constraint
-- deixou de existir. O Postgres responde:
--
--     ERROR: there is no unique or exclusion constraint matching
--            the ON CONFLICT specification
--
-- Ou seja: **depois do 23, toda sincronização falha.** Em produção ainda não
-- quebrou por um acidente feliz — o Dental Office não tem credencial, e o sync é
-- pulado antes de chegar aqui. Bastaria configurá-lo para a sincronização morrer
-- na primeira gravação de cursor.
--
-- É a mesma lição do próprio 23, vista do outro lado. Lá eu escrevi que
-- "acrescentar uma restrição nova não remove a antiga". A metade que faltou:
-- **remover a antiga quebra quem dependia dela.** Mudar chave é mudar contrato.
--
-- ----------------------------------------------------------------------------
-- E POR QUE ESTA MIGRAÇÃO SIMPLIFICA EM VEZ DE SÓ CONSERTAR O CÓDIGO
-- ----------------------------------------------------------------------------
--
-- O 23 resolveu o "uma PK não aceita coluna nula" com uma coluna GERADA:
--
--     clinic_key = coalesce(clinic_id, '000...0')
--
-- Funciona, e cobra um preço todo dia: quem grava precisa mandar `clinic_id` e
-- declarar conflito em `clinic_key`. São dois nomes para a mesma ideia, e a
-- diferença entre eles não aparece em lugar nenhum na hora de escrever a query.
-- É exatamente o tipo de esperteza que produz o erro que estamos consertando.
--
-- Aqui a coluna `clinic_id` passa a ser NOT NULL com o mesmo sentinela como
-- PADRÃO. O upsert volta a ser óbvio — `on_conflict=organization_id,recurso,
-- clinic_id` — e a coluna gerada some.
--
-- O SENTINELA É UM UUID DE ZEROS, e vale dizer o que ele significa: "este cursor
-- é da organização inteira, e não de uma clínica". É o caso do recurso que não
-- tem clínica, e o valor das linhas legadas.
--
-- SEGURO EM PRODUÇÃO: `crc_sync_state` está com zero linhas hoje (conferido). O
-- `update` abaixo existe para bancos de desenvolvimento que já sincronizaram.
-- ============================================================================

-- 1. As linhas legadas ganham o sentinela.
update public.crc_sync_state
   set clinic_id = '00000000-0000-0000-0000-000000000000'::uuid
 where clinic_id is null;

-- 2. A coluna passa a ser obrigatória, com o sentinela como padrão.
alter table public.crc_sync_state
  alter column clinic_id set default '00000000-0000-0000-0000-000000000000'::uuid;

alter table public.crc_sync_state
  alter column clinic_id set not null;

-- 3. A chave primária passa a ser a natural — três colunas reais.
alter table public.crc_sync_state
  drop constraint if exists crc_sync_state_pk_por_clinica;

alter table public.crc_sync_state
  drop constraint if exists crc_sync_state_pkey;

do $pk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crc_sync_state_pk_clinica'
  ) then
    alter table public.crc_sync_state
      add constraint crc_sync_state_pk_clinica
      primary key (organization_id, recurso, clinic_id);
  end if;
end $pk$;

-- 4. A coluna gerada sai. Ela não tem mais função, e mantê-la seria manter a
--    armadilha: alguém escreveria `on_conflict` mirando nela de novo.
alter table public.crc_sync_state
  drop column if exists clinic_key;

-- E o índice do 23, que já era redundante com a PK de lá e é com a daqui.
drop index if exists public.idx_crc_sync_state_por_clinica;

-- ----------------------------------------------------------------------------
-- Privilégios
-- ----------------------------------------------------------------------------
do $privilegios$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant all on all functions in schema public to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on all tables in schema public to anon';
  end if;
end $privilegios$;

-- ============================================================================
-- O CRASH NA ÚLTIMA TENTATIVA — o trabalho que sumia sem dead letter
-- ============================================================================
--
-- O BURACO, e ele existe nas DUAS filas.
--
--     tentativa 5, worker processando
--       ↓
--     💥 o processo morre
--       ↓
--     o lease vence
--       ↓
--     a limpeza marca FALHOU
--
-- E acabou. A reserva só aceita `tentativas < 5`, então ele nunca volta. E a
-- dead letter é escrita pelo `catch` do worker — que nunca aconteceu, porque o
-- worker morreu.
--
-- Resultado: FALHOU, cinco tentativas, fora da fila, SEM registro na dead
-- letter. Do outro lado tem um paciente que escreveu.
--
-- É o mesmo estado que `crc_liberar_*_presos` foi criada para consertar — ela
-- resolvia metade, tirando a linha do limbo `PROCESSANDO`. A outra metade é
-- fazer isso VIRAR UM REGISTRO que alguém lê.
--
-- POR QUE NA FUNÇÃO, E NÃO NO WORKER: porque o worker é justamente quem não
-- estava lá. Qualquer conserto que dependa dele rodando repete o defeito.
-- ============================================================================

create or replace function public.crc_liberar_webhooks_presos(
  max_tentativas integer default 5
)
returns integer
language plpgsql
as $corpo$
declare
  quantos integer;
begin
  /*
   * UMA INSTRUÇÃO SÓ, com dois CTEs que escrevem e um `select` que conta.
   *
   * Tentei antes em duas instruções e errei duas vezes seguidas, das duas
   * formas possíveis: com `get diagnostics` depois do `insert`, o `row_count`
   * conta o INSERT (e não o que foi liberado); contando a tabela depois, vem o
   * TOTAL acumulado no lugar do delta desta chamada.
   *
   * Aqui `presos` continua em escopo para o `select` final, e é a lista exata
   * do que ESTA chamada mexeu. Em Postgres, um CTE que escreve roda sempre e
   * até o fim, mesmo que a consulta principal não leia a saída dele — então o
   * `insert` acontece de qualquer jeito.
   */
  with presos as (
    update public.crc_webhook_inbox
       set status = 'FALHOU',
           travado_ate = null,
           ultimo_erro = coalesce(ultimo_erro, 'O worker não terminou o webhook e o lease venceu.')
     where status = 'PROCESSANDO'
       and travado_ate is not null
       and travado_ate < now()
       and tentativas >= max_tentativas
    returning id, provedor, external_id, tentativas, ultimo_erro
  ),
  mortas as (
    insert into public.crc_dead_letters (organization_id, origem, referencia, erro, payload, status)
    select
      null,
      'webhook',
      p.id,
      coalesce(p.ultimo_erro, 'Esgotou as tentativas com o worker morto.'),
      jsonb_build_object('provedor', p.provedor, 'externalId', p.external_id,
                         'tentativas', p.tentativas),
      'PENDENTE'
    from presos p
    /*
     * NÃO DUPLICA. A limpeza roda a cada volta, e sem esta guarda um envelope
     * preso viraria uma linha nova por volta — até a fila de falhas ter mais
     * ruído que sinal, que é como ela deixa de ser lida.
     */
    where not exists (
      select 1 from public.crc_dead_letters d
       where d.origem = 'webhook' and d.referencia = p.id
    )
    returning 1
  )
  select count(*) into quantos from presos;

  return quantos;
end $corpo$;

create or replace function public.crc_liberar_agent_jobs_presos()
returns integer
language plpgsql
as $corpo$
declare
  quantos integer;
begin
  with presos as (
    update public.crc_agent_jobs
       set status = 'FALHOU',
           terminou_em = now(),
           travado_ate = null,
           ultimo_erro = coalesce(ultimo_erro, 'O worker não terminou o job e o lease venceu.')
     where status = 'RODANDO'
       and travado_ate is not null
       and travado_ate < now()
       and tentativas >= 5
    returning id, organization_id, conversation_id, event_id, tentativas, ultimo_erro
  ),
  mortas as (
    insert into public.crc_dead_letters (organization_id, origem, referencia, erro, payload, status)
    select
      p.organization_id,
      'agent_job',
      p.id,
      coalesce(p.ultimo_erro, 'Esgotou as tentativas com o worker morto.'),
      jsonb_build_object('conversationId', p.conversation_id, 'eventId', p.event_id,
                         'tentativas', p.tentativas),
      'PENDENTE'
    from presos p
    where not exists (
      select 1 from public.crc_dead_letters d
       where d.origem = 'agent_job' and d.referencia = p.id
    )
    returning 1
  )
  select count(*) into quantos from presos;

  return quantos;
end $corpo$;
