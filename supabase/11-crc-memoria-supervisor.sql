-- ============================================================================
-- CRC AI OS — Fatia 6: memória e supervisor
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Memória
-- ----------------------------------------------------------------------------
--
-- O QUE ENTRA AQUI É FATO ÚTIL, NÃO INFERÊNCIA SOBRE A PESSOA.
--
-- "Prefere horários depois das 17h" é memória: o paciente disse, é verificável
-- na conversa, e muda o que o agente oferece amanhã.
--
-- "Paciente não tem dinheiro" NÃO é memória. É leitura de entrelinha, envelhece
-- mal, e vira um rótulo que segue a pessoa por anos numa clínica. A diferença
-- está codificada em `origem` + `confianca` + a validação na aplicação — não na
-- boa vontade de quem escreve o prompt.
create table if not exists public.crc_ai_memories (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,

  -- 'paciente' | 'organizacao'
  escopo          text not null,
  -- O paciente, quando escopo = 'paciente'. Nulo para memória da clínica.
  subject_id      uuid,

  conteudo        text not null,
  -- 'conversa' | 'operador' | 'sistema'
  origem          text not null,
  -- De onde veio: `conversation:<id>` ou `run:<id>`. É o que permite conferir.
  origem_ref      text,
  -- 0 a 1. Abaixo do limiar da aplicação, a memória nasce PENDENTE.
  confianca       numeric(3, 2) not null default 0.5,

  -- 'ATIVA' | 'PENDENTE' | 'INVALIDADA'
  status          text not null default 'PENDENTE',

  valido_de       timestamptz not null default now(),
  -- Memória sem prazo é rótulo permanente. Ver o comentário da aplicação.
  expira_em       timestamptz,

  criado_por      uuid references public.crc_users(id) on delete set null,
  invalidado_por  uuid references public.crc_users(id) on delete set null,
  invalidado_em   timestamptz,
  criado_em       timestamptz not null default now(),

  -- A MESMA memória não entra duas vezes. Sem isto, cada conversa em que a
  -- pessoa repetisse "prefiro de tarde" criaria mais uma linha idêntica.
  chave_dedupe    text not null,
  unique (organization_id, chave_dedupe)
);

create index if not exists idx_crc_ai_memories_sujeito
  on public.crc_ai_memories (organization_id, escopo, subject_id, status);

-- ----------------------------------------------------------------------------
-- 2. Supervisor
-- ----------------------------------------------------------------------------
--
-- O supervisor NÃO conversa com o paciente e NÃO executa nada irreversível.
-- Ele lê o turno depois que aconteceu e produz leitura estruturada: deu certo?
-- qual foi a objeção? precisa de follow-up? o agente violou alguma política?
--
-- É o que alimenta avaliação, analytics e a descoberta de erro do agente —
-- sem nenhuma dessas coisas dependerem de alguém reler conversa à mão.
create table if not exists public.crc_ai_supervisoes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  run_id          uuid not null references public.crc_ai_runs(id) on delete cascade,
  conversation_id uuid not null references public.crc_conversations(id) on delete cascade,

  resolvido         boolean not null default false,
  intencao          text,
  desfecho          text,
  objecao           text,
  sentimento        text,
  precisa_humano    boolean not null default false,
  precisa_followup  boolean not null default false,
  -- 0 a 10. Serve para achar os piores turnos sem ler todos.
  nota_qualidade    numeric(3, 1),
  -- Lista de códigos. Vazia quando o agente se comportou.
  violacoes         jsonb not null default '[]'::jsonb,

  -- QUANTAS FRASES O EXTRATOR TENTOU EMPURRAR, e quantas o código barrou.
  --
  -- Este par de números é o alarme de degradação do prompt de extração. Se as
  -- recusas sobem de duas por semana para quarenta por dia, alguma coisa mudou
  -- no que o modelo considera "fato sobre o paciente" — e a recusa em massa é o
  -- único lugar onde isso aparece antes de alguém reclamar.
  memorias_gravadas   integer not null default 0,
  memorias_recusadas  integer not null default 0,

  criado_em       timestamptz not null default now(),

  -- Um supervisor por turno.
  unique (run_id)
);

create index if not exists idx_crc_ai_supervisoes_nota
  on public.crc_ai_supervisoes (organization_id, nota_qualidade, criado_em desc);

alter table public.crc_ai_memories    enable row level security;
alter table public.crc_ai_supervisoes enable row level security;
