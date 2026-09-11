-- ============================================================================
-- CRC AI OS — o reclaim da run. Corrige um P0 de recuperação.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
--
-- O DEFEITO, e ele anula boa parte do que a Fase B construiu.
--
-- A run passou a nascer ANTES da chamada de modelo, para a idempotência vir
-- antes do gasto. A reserva era um `insert ... on conflict do nothing`: linha
-- criada, sou dono; conflito, não sou.
--
-- Essa leitura de "conflito" está errada num mundo com crash e retry:
--
--     paciente escreve
--       ↓
--     job reservado, run criada com resultado = RODANDO
--       ↓
--     💥 o processo morre no meio
--       ↓
--     o lease do JOB expira e outro worker o retoma      ← isto funcionava
--       ↓
--     ele tenta reservar a run: a linha JÁ EXISTE
--       ↓
--     conflito → "não sou dono" → o turno devolve `sem_acao`
--       ↓
--     o worker lê `sem_acao` como desfecho legítimo e CONCLUI o job
--       ↓
--     o paciente nunca é respondido, e nada na fila indica isso
--
-- Ou seja: o job se recuperava e a run não, e o resultado era pior do que não
-- ter recuperação nenhuma — porque o job saía da fila marcado como concluído.
--
-- O QUE ESTA MIGRAÇÃO FAZ: dá à run a mesma semântica de LEASE que o job já
-- tinha. Existir não é mais sinônimo de "outro dono": é preciso que o lease
-- esteja vivo.
--
-- OS QUATRO ESTADOS QUE A FUNÇÃO DISTINGUE, e por que cada um:
--
--   NOVA          nenhuma linha. Cria e executa.
--
--   OCUPADA       RODANDO com lease vivo. Outro worker está nela agora —
--                 este desiste, e desistir está certo.
--
--   RECLAIM       RODANDO com lease vencido. O dono anterior morreu. Este
--                 assume, incrementa a tentativa e executa. É o caso que
--                 estava quebrado.
--
--   TERMINAL      já tem desfecho. O trabalho aconteceu; repetir gastaria
--                 modelo de novo para produzir a mesma resposta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A run ganha lease
-- ----------------------------------------------------------------------------
alter table public.crc_ai_runs
  add column if not exists travado_ate timestamptz;

alter table public.crc_ai_runs
  add column if not exists tentativa integer not null default 1;

-- Quem está executando. Mesmo papel do `travado_por` do job: quando um turno
-- trava sempre, a pergunta é se é o turno ou se é o worker.
alter table public.crc_ai_runs
  add column if not exists travado_por text;

-- As runs cujo lease venceu e ninguém retomou. É o que o painel de saúde olha,
-- e agora ele consegue separar "rodando" de "abandonada".
create index if not exists idx_crc_ai_runs_lease
  on public.crc_ai_runs (organization_id, travado_ate)
  where resultado = 'RODANDO';

-- ----------------------------------------------------------------------------
-- 2. A reivindicação
-- ----------------------------------------------------------------------------
--
-- `insert ... on conflict do update` COM PREDICADO no `where` é o que torna
-- isto atômico. A alternativa — ler, decidir, escrever — reabriria exatamente a
-- corrida que a função existe para fechar: dois workers leriam "lease vencido"
-- e os dois assumiriam.
--
-- O `where` do `do update` é avaliado DENTRO da mesma instrução, com a linha já
-- travada pelo conflito. Se ele não casar, nada é atualizado e o `returning`
-- não devolve linha — e é assim que se distingue "assumi" de "não assumi".
--
-- O DROP ANTES DO CREATE não é cerimônia: `create or replace function` recusa
-- mudar as colunas de saída ("cannot change return type of existing function").
-- Sem ele, este arquivo roda limpo num banco novo e falha em qualquer banco que
-- já tenha uma versão anterior — que é exatamente quando a migração importa.
drop function if exists public.crc_reivindicar_ai_run;

create function public.crc_reivindicar_ai_run(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_chave_dedupe    text,
  p_job_id          uuid,
  p_lease_segundos  integer default 180,
  p_quem            text default null
)
-- `numero_tentativa`, e não `tentativa`: uma coluna de saída em `returns table`
-- vira variável PL/pgSQL, e `tentativa` também é coluna desta tabela. Com o
-- mesmo nome nos dois papéis, o `returning tentativa` lá embaixo não compila —
-- "column reference is ambiguous", e só na primeira CHAMADA, porque o corpo é
-- compilado tarde. Um nome diferente resolve sem precisar de pragma.
returns table (situacao text, run_id uuid, numero_tentativa integer)
language plpgsql
as $corpo$
declare
  v_id        uuid;
  v_tentativa integer;
  v_resultado text;
begin
  -- Tenta criar OU retomar, numa instrução só.
  insert into public.crc_ai_runs (
    organization_id, conversation_id, chave_dedupe, resultado,
    iniciado_em, job_id, travado_ate, travado_por, tentativa, prompt_versao
  )
  values (
    p_organization_id, p_conversation_id, p_chave_dedupe, 'RODANDO',
    now(), p_job_id, now() + make_interval(secs => p_lease_segundos), p_quem, 1,
    'agent_shadow_turn_v1'
  )
  on conflict (organization_id, chave_dedupe) do update
     set travado_ate = now() + make_interval(secs => p_lease_segundos),
         travado_por = p_quem,
         job_id      = coalesce(p_job_id, public.crc_ai_runs.job_id),
         tentativa   = public.crc_ai_runs.tentativa + 1,
         iniciado_em = now()
   where public.crc_ai_runs.resultado = 'RODANDO'
     -- O LEASE VENCIDO É A CONDIÇÃO INTEIRA. Sem esta linha, o `do update`
     -- roubaria o turno de quem está trabalhando agora — e aí o remédio seria
     -- pior que a doença: duas execuções simultâneas, duas chamadas de modelo,
     -- possivelmente duas mensagens.
     and (public.crc_ai_runs.travado_ate is null
          or public.crc_ai_runs.travado_ate < now())
  returning id, tentativa into v_id, v_tentativa;

  if v_id is not null then
    return query select
      case when v_tentativa = 1 then 'nova' else 'reclaim' end,
      v_id,
      v_tentativa;
    return;
  end if;

  -- Não criou nem retomou. Agora é só descobrir por quê — e a distinção
  -- importa para quem chamou: "outro está nela" e "já terminou" levam a
  -- desfechos diferentes do job.
  select id, resultado
    into v_id, v_resultado
    from public.crc_ai_runs
   where organization_id = p_organization_id
     and chave_dedupe = p_chave_dedupe;

  if v_id is null then
    -- Nem inseriu, nem atualizou, nem existe. Só acontece se alguém apagou a
    -- linha entre as duas instruções. Tratar como indisponível é o seguro:
    -- quem chamou vai repetir.
    return query select 'indisponivel', null::uuid, 0;
    return;
  end if;

  if v_resultado = 'RODANDO' then
    return query select 'ocupada', v_id, 0;
  else
    return query select 'terminal', v_id, 0;
  end if;
end $corpo$;

-- ----------------------------------------------------------------------------
-- 3. As runs abandonadas
-- ----------------------------------------------------------------------------
--
-- Uma run que ficou RODANDO com lease vencido e cujo JOB já saiu da fila é um
-- turno que morreu sem ninguém para retomá-lo. O job se recuperaria sozinho
-- enquanto tivesse tentativas; passado o teto, ele vira FALHOU e a run fica
-- pendurada para sempre.
--
-- Esta função fecha essas runs com desfecho nomeado. Sem ela, o painel de saúde
-- contaria eternamente "turnos que começaram e nunca terminaram", e o número
-- pararia de significar alguma coisa — que é como uma métrica morre.
create or replace function public.crc_fechar_ai_runs_abandonadas(
  p_minutos integer default 30
)
returns integer
language plpgsql
as $corpo$
declare
  quantos integer;
begin
  update public.crc_ai_runs r
     set resultado = 'falha_segura',
         motivo = coalesce(r.motivo, 'O turno começou e o processo não voltou.')
   where r.resultado = 'RODANDO'
     and r.iniciado_em < now() - make_interval(mins => p_minutos)
     and (
       r.job_id is null
       or exists (
         select 1 from public.crc_agent_jobs j
          where j.id = r.job_id
            -- O job já saiu da fila de trabalho: ninguém mais vai retomar.
            and j.status in ('CONCLUIDO', 'FALHOU', 'DESCARTADO')
       )
     );

  get diagnostics quantos = row_count;
  return quantos;
end $corpo$;
