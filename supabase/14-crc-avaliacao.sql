-- ============================================================================
-- CRC AI OS — Fatia 9: avaliação, replay e gate de publicação
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O caso
-- ----------------------------------------------------------------------------
--
-- UM CASO É UMA CONVERSA MAIS UMA AFIRMAÇÃO SOBRE ELA.
--
-- A conversa vive em `mensagens`; a afirmação em `esperado`. Os dois em jsonb
-- porque a forma deles muda junto com o que o agente sabe fazer — uma coluna por
-- expectativa exigiria migração a cada categoria nova de teste, e o resultado
-- previsível é ninguém criar categoria nova.
--
-- `ferramentas` guarda as saídas que o caso serve. É o que faz a avaliação ser
-- determinística: a suíte não depende de a agenda da clínica estar do mesmo jeito
-- que estava ontem.
create table if not exists public.crc_eval_casos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,

  nome            text not null,
  -- seguranca | autorizacao | tenant | handoff | qualidade | tom
  --
  -- As quatro primeiras BLOQUEIAM publicação. Ver `dominio/avaliacao.ts`.
  categoria       text not null,

  mensagens       jsonb not null default '[]'::jsonb,
  cenario         jsonb not null default '{}'::jsonb,
  ferramentas     jsonb not null default '{}'::jsonb,
  esperado        jsonb not null default '{}'::jsonb,

  ativo           boolean not null default true,
  criado_por      uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now(),

  -- Mesmo nome duas vezes ATUALIZA. Dois casos homônimos numa lista de quarenta
  -- é a forma mais rápida de ninguém confiar no relatório.
  unique (organization_id, nome)
);

-- ----------------------------------------------------------------------------
-- 2. A rodada
-- ----------------------------------------------------------------------------
--
-- A rodada guarda o VEREDICTO, e não só a contagem.
--
-- `liberado` é o que o gate de publicação lê depois. Recalcular a partir das
-- execuções significaria reimplementar a regra de bloqueio numa query — e a
-- primeira divergência entre a regra do código e a da query seria uma publicação
-- liberada por engano.
create table if not exists public.crc_eval_rodadas (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,

  rotulo          text,
  modelo          text,
  total           integer not null default 0,
  passaram        integer not null default 0,

  liberado        boolean not null default false,
  bloqueios       jsonb not null default '[]'::jsonb,
  avisos          jsonb not null default '[]'::jsonb,
  -- Categorias bloqueantes sem nenhum caso. Não impedem, e são reportadas.
  categorias_sem_caso jsonb not null default '[]'::jsonb,

  custo_estimado  numeric(12, 6),
  duracao_ms      integer,

  criado_por      uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now()
);

create index if not exists idx_crc_eval_rodadas_recentes
  on public.crc_eval_rodadas (organization_id, criado_em desc);

-- ----------------------------------------------------------------------------
-- 3. A execução de um caso
-- ----------------------------------------------------------------------------
--
-- O texto que o agente produziu FICA GUARDADO, inclusive quando o portão barrou.
-- É o que permite ler "o que ele quase disse" no caso que falhou — que é a única
-- informação útil de um relatório de avaliação.
create table if not exists public.crc_eval_execucoes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  rodada_id       uuid not null references public.crc_eval_rodadas(id) on delete cascade,
  caso_id         uuid references public.crc_eval_casos(id) on delete set null,

  nome            text not null,
  categoria       text not null,
  passou          boolean not null default false,
  falhas          jsonb not null default '[]'::jsonb,

  desfecho        text,
  resposta        text,
  portao          text,
  ferramentas_usadas jsonb not null default '[]'::jsonb,

  custo_estimado  numeric(12, 6),
  duracao_ms      integer,
  criado_em       timestamptz not null default now()
);

create index if not exists idx_crc_eval_execucoes_rodada
  on public.crc_eval_execucoes (rodada_id, passou);

alter table public.crc_eval_casos     enable row level security;
alter table public.crc_eval_rodadas   enable row level security;
alter table public.crc_eval_execucoes enable row level security;
