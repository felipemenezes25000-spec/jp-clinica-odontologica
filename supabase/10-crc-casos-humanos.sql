-- ============================================================================
-- CRC AI OS — Fatia 5: casos humanos e dono da conversa
-- ============================================================================
--
-- Rodar UMA VEZ, à mão, no SQL editor do Supabase. DDL não passa pela API.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Quem é dono da conversa
-- ----------------------------------------------------------------------------
--
-- ESTADO EXPLÍCITO, E NÃO INFERÊNCIA (ADR-10).
--
-- A alternativa era deduzir de "quem respondeu por último". Ela produz
-- exatamente o pior caso desta tela: o atendente digita, a IA responde no mesmo
-- segundo, e o paciente recebe duas mensagens diferentes sobre o mesmo assunto.
--
-- `crc_conversations.bloqueada_por` já resolve dois ATENDENTES ao mesmo tempo.
-- Isto resolve outra coisa: atendente versus máquina.
alter table public.crc_conversations
  -- 'ia' | 'humano' | 'ninguem'
  add column if not exists dono text not null default 'ia';

alter table public.crc_conversations
  add column if not exists dono_user_id uuid references public.crc_users(id) on delete set null;

alter table public.crc_conversations
  add column if not exists dono_desde timestamptz;

-- ----------------------------------------------------------------------------
-- 2. O caso humano
-- ----------------------------------------------------------------------------
--
-- Nasce quando o agente decide que não é ele quem resolve. É diferente de uma
-- tarefa (`crc_tasks`): tarefa é trabalho a fazer; caso é uma CONVERSA parada
-- esperando gente, com o contexto do que já aconteceu nela.
create table if not exists public.crc_human_cases (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete set null,
  conversation_id uuid not null references public.crc_conversations(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,
  -- A run do agente que abriu o caso. É o que liga o caso ao trace.
  run_id          uuid references public.crc_ai_runs(id) on delete set null,

  -- ABERTO | ASSUMIDO | RESOLVIDO
  status          text not null default 'ABERTO',
  -- Estável, para métrica: conteudo_clinico, promessa_sem_acao, teto_de_passos…
  motivo_codigo   text not null,
  -- Em português. É o enunciado que a recepção lê.
  motivo          text not null,
  prioridade      text not null default 'NORMAL',

  -- O QUE A PESSOA PRECISA SABER SEM LER A CONVERSA INTEIRA.
  resumo          text,
  -- O que o agente teria respondido. Serve de rascunho — e de evidência de por
  -- que ele foi barrado.
  resposta_barrada text,
  proxima_acao    text,

  assumido_por    uuid references public.crc_users(id) on delete set null,
  assumido_em     timestamptz,
  resolvido_em    timestamptz,
  resolucao       text,

  -- IDEMPOTÊNCIA: um turno abre no máximo um caso. Sem isto, reprocessar o
  -- evento encheria a fila da recepção com o mesmo caso repetido.
  chave_dedupe    text not null,

  criado_em       timestamptz not null default now(),

  unique (organization_id, chave_dedupe)
);

-- A fila da recepção: abertos primeiro, mais antigos no topo.
create index if not exists idx_crc_human_cases_fila
  on public.crc_human_cases (organization_id, status, criado_em);

create index if not exists idx_crc_human_cases_conversa
  on public.crc_human_cases (organization_id, conversation_id, criado_em desc);

-- Uma conversa não acumula dois casos abertos. O segundo motivo entra no
-- primeiro caso, em vez de criar uma segunda linha na fila para a mesma pessoa.
create unique index if not exists uq_crc_human_cases_aberto_por_conversa
  on public.crc_human_cases (organization_id, conversation_id)
  where status in ('ABERTO', 'ASSUMIDO');

alter table public.crc_human_cases enable row level security;
