-- ============================================================================
-- CRC AI OS — Fatia 1: o turno de sombra
-- ============================================================================
--
-- Duas tabelas, e nenhuma a mais. A tentação aqui é criar as vinte entidades do
-- plano de uma vez; o roadmap é explícito contra isso (fatias verticais, não
-- camadas eternas). Sem um turno rodando ponta a ponta, dezoito dessas tabelas
-- seriam suposições sobre o que o runtime vai precisar.
--
-- Rodar UMA VEZ, à mão, no SQL editor do Supabase. A API PostgREST não executa
-- DDL — é a mesma regra dos oito arquivos anteriores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A execução de um turno
-- ----------------------------------------------------------------------------
--
-- Uma linha por turno do agente. Guarda o desfecho, o custo e a resposta
-- candidata — que na Fatia 1 NÃO é enviada a ninguém.
create table if not exists public.crc_ai_runs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id          uuid references public.crc_clinics(id) on delete set null,
  conversation_id    uuid not null references public.crc_conversations(id) on delete cascade,
  patient_id         uuid references public.crc_patients(id) on delete set null,

  -- A IDEMPOTÊNCIA MORA AQUI, e não na disciplina de quem chama. O motor pode
  -- reprocessar um evento depois de um restart; sem esta chave, o mesmo turno
  -- rodaria de novo e gastaria modelo de novo.
  chave_dedupe       text not null,

  -- 'candidato' | 'enviado' | 'aguardando' | 'humano' | 'sem_acao' | 'falha_segura'
  resultado          text not null,
  -- O porquê do desfecho, em português. É o enunciado da tarefa humana quando
  -- o turno vira uma.
  motivo             text,

  resposta_candidata text,
  raciocinio         text,
  precisa_humano     boolean not null default false,

  modelo             text,
  prompt_versao      text,
  input_tokens       integer,
  output_tokens      integer,
  custo_estimado     numeric(12, 6),
  duracao_ms         integer,

  -- Qual portão barrou, quando barrou. Em branco quando passou.
  portao_bloqueou    text,

  criado_em          timestamptz not null default now(),

  unique (organization_id, chave_dedupe)
);

create index if not exists idx_crc_ai_runs_conversa
  on public.crc_ai_runs (organization_id, conversation_id, criado_em desc);

create index if not exists idx_crc_ai_runs_resultado
  on public.crc_ai_runs (organization_id, resultado, criado_em desc);

-- ----------------------------------------------------------------------------
-- 2. O trace, em spans
-- ----------------------------------------------------------------------------
--
-- Um span por etapa do turno: montar contexto, chamar modelo, avaliar portões.
-- É o que responde "por que este turno demorou 3 segundos e custou R$ 0,04".
--
-- NÃO GUARDA PII NEM SEGREDO. `resumo` é para número e código, não para o
-- conteúdo da conversa — que já está em crc_messages, com as regras dele.
create table if not exists public.crc_ai_spans (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.crc_ai_runs(id) on delete cascade,
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,

  nome            text not null,
  -- 'contexto' | 'modelo' | 'portao' | 'persistencia'
  tipo            text not null,
  ordem           integer not null,

  duracao_ms      integer not null,
  -- 'ok' | 'erro' | 'bloqueado'
  status          text not null,
  resumo          text,

  criado_em       timestamptz not null default now()
);

create index if not exists idx_crc_ai_spans_run
  on public.crc_ai_spans (run_id, ordem);

-- ----------------------------------------------------------------------------
-- 3. RLS
-- ----------------------------------------------------------------------------
--
-- Mesmo padrão das outras tabelas do CRC: RLS ligada, e o acesso vem pela
-- service role do servidor. O cliente nunca fala com estas tabelas.
alter table public.crc_ai_runs  enable row level security;
alter table public.crc_ai_spans enable row level security;
