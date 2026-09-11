-- ============================================================================
-- CRC AI OS — Fase B: o turno do agente vira job durável
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
--
-- O QUE MUDA, E POR QUE IMPORTA.
--
-- Até aqui o agente rodava DENTRO do handler de `message.received`: a mensagem
-- chegava, o handler chamava o modelo, esperava, aplicava portões e respondia —
-- tudo na mesma execução. Numa função serverless isso significa que qualquer
-- interrupção no meio — deploy, timeout, reinício, 5xx do provedor — deixa o
-- turno pela metade e ninguém volta nele. O paciente fica sem resposta e não há
-- registro de que faltou responder.
--
-- Com job, a mensagem só ENFILEIRA. Um worker reserva, executa e marca. Se cair
-- no meio, o lease expira e outro worker retoma.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A fila
-- ----------------------------------------------------------------------------
create table if not exists public.crc_agent_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  conversation_id uuid not null references public.crc_conversations(id) on delete cascade,
  -- O evento que originou. É a ponte para o trace e para a auditoria.
  event_id        uuid references public.crc_events(id) on delete set null,

  -- PENDENTE | RODANDO | REPETIR | CONCLUIDO | FALHOU | DESCARTADO
  --
  -- `DESCARTADO` não é erro: é o turno que foi enfileirado e, na hora de rodar,
  -- não tinha mais o que fazer — a conversa foi assumida por gente, a flag foi
  -- desligada, o paciente pediu opt-out. Separar de `FALHOU` é o que permite
  -- olhar a fila de falhas e ver só o que realmente quebrou.
  status          text not null default 'PENDENTE',

  tentativas      integer not null default 0,
  -- Quando o job fica elegível. O backoff escreve o futuro aqui.
  disponivel_em   timestamptz not null default now(),
  -- Até quando a reserva vale. Passou disso, outro worker pode retomar.
  travado_ate     timestamptz,
  -- Quem reservou. Serve para investigar worker que trava sempre no mesmo ponto.
  travado_por     text,

  comecou_em      timestamptz,
  terminou_em     timestamptz,
  ultimo_erro     text,
  duracao_ms      integer,

  -- O TENANT VEM DAQUI, e não do payload que o modelo produziu.
  --
  -- É a regra mais importante desta tabela. Um turno agentic manipula texto que
  -- veio de fora; se o `organization_id` viesse de qualquer coisa que passou
  -- perto do modelo, uma injeção bem escrita poderia fazer o worker ler a base
  -- de outra clínica. Aqui ele é coluna, gravada por quem enfileirou.

  -- IDEMPOTÊNCIA DA FILA: um evento enfileira UM job.
  --
  -- O motor de eventos reprocessa em restart, e sem esta constraint o mesmo
  -- turno entraria na fila duas vezes — duas chamadas de modelo pagas para
  -- produzir a mesma resposta.
  chave_dedupe    text not null,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  unique (organization_id, chave_dedupe)
);

-- A fila de trabalho: o que está pronto para rodar, mais antigo primeiro.
--
-- `RODANDO` ENTRA NO ÍNDICE porque a reserva também retoma job com lease
-- vencido. Um índice parcial que não cobre a consulta é um índice que o planner
-- ignora — e a varredura completa só aparece quando a fila já está grande.
create index if not exists idx_crc_agent_jobs_fila
  on public.crc_agent_jobs (status, disponivel_em)
  where status in ('PENDENTE', 'REPETIR', 'RODANDO');

create index if not exists idx_crc_agent_jobs_org
  on public.crc_agent_jobs (organization_id, status, criado_em desc);

-- ----------------------------------------------------------------------------
-- 2. A reserva atômica
-- ----------------------------------------------------------------------------
--
-- `FOR UPDATE SKIP LOCKED` é o que impede dois workers de pegarem o mesmo job.
-- É o mesmo mecanismo de `crc_reservar_eventos`, e de propósito: um segundo
-- padrão de reserva no mesmo sistema seria um segundo jeito de errar.
--
-- A TENTATIVA É INCREMENTADA NA RESERVA, e não no fim. Se fosse no fim, um job
-- que derruba o worker toda vez nunca incrementaria — e tentaria para sempre.
create or replace function public.crc_reservar_agent_jobs(
  limite        integer default 5,
  lock_segundos integer default 180,
  quem          text default null
)
returns setof public.crc_agent_jobs
language plpgsql
as $$
begin
  return query
  update public.crc_agent_jobs j
     set status      = 'RODANDO',
         travado_ate = now() + make_interval(secs => lock_segundos),
         travado_por = quem,
         comecou_em  = now(),
         tentativas  = j.tentativas + 1,
         atualizado_em = now()
   where j.id in (
     select id from public.crc_agent_jobs
      where (
              status in ('PENDENTE', 'REPETIR')
              -- O LEASE VENCIDO É O QUE TORNA CRASH RECUPERÁVEL.
              --
              -- Sem esta linha o job fica preso para sempre: ele está RODANDO,
              -- a reserva só olhava PENDENTE/REPETIR, e a limpeza de presos
              -- exige cinco tentativas — que ele nunca alcança, porque nunca é
              -- reservado de novo. O worker morre uma vez e o paciente nunca é
              -- respondido.
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
end $$;

-- ----------------------------------------------------------------------------
-- 3. Retomar o que ficou preso
-- ----------------------------------------------------------------------------
--
-- Um job que está RODANDO com o lease vencido é um job cujo worker morreu. A
-- reserva acima já o pega — esta função existe para o caso em que ele estourou
-- o teto de tentativas enquanto estava travado, e por isso a reserva o ignora.
--
-- Sem ela, esse job fica RODANDO para sempre, invisível na fila de falhas e
-- invisível na fila de trabalho. É o pior estado possível: some sem avisar.
create or replace function public.crc_liberar_agent_jobs_presos()
returns integer
language plpgsql
as $$
declare
  quantos integer;
begin
  update public.crc_agent_jobs
     set status      = 'FALHOU',
         ultimo_erro = coalesce(ultimo_erro, 'O worker não terminou o job e o lease venceu.'),
         terminou_em = now(),
         atualizado_em = now()
   where status = 'RODANDO'
     and travado_ate < now()
     and tentativas >= 5;

  get diagnostics quantos = row_count;
  return quantos;
end $$;

-- ----------------------------------------------------------------------------
-- 4. A run passa a nascer no começo do turno
-- ----------------------------------------------------------------------------
--
-- IDEMPOTÊNCIA ANTES DO EFEITO, e não depois.
--
-- `crc_ai_runs` era gravada no ENCERRAMENTO do turno. A dedupe funcionava, e
-- funcionava tarde: quando a linha era escrita, o modelo já tinha sido chamado e
-- pago. Duas execuções do mesmo turno pagavam duas vezes para depois uma delas
-- descobrir que era duplicata.
--
-- Agora a run é criada ANTES da primeira chamada, com `resultado = 'RODANDO'`, e
-- o `unique (organization_id, chave_dedupe)` decide quem executa.
--
-- ESTAS COLUNAS SÃO O QUE FALTAVA para a linha poder nascer cedo: `iniciado_em`
-- para saber há quanto tempo ela está aberta, e `job_id` para ligar a run ao job
-- que a produziu.
alter table public.crc_ai_runs
  add column if not exists iniciado_em timestamptz;

alter table public.crc_ai_runs
  add column if not exists job_id uuid references public.crc_agent_jobs(id) on delete set null;

-- Runs abertas há tempo demais: é o que o painel de saúde olha.
create index if not exists idx_crc_ai_runs_abertas
  on public.crc_ai_runs (organization_id, iniciado_em)
  where resultado = 'RODANDO';

alter table public.crc_agent_jobs enable row level security;
