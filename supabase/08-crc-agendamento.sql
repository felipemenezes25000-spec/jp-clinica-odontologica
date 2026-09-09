-- ============================================================================
-- 08 · AGENDAMENTO — dentistas e ofertas de horário
--
-- POR QUE ESTE ARQUIVO EXISTE
-- O adapter do Dental Office já sabia ler horários livres e criar consulta, mas
-- faltavam duas coisas no banco para que isso virasse fluxo:
--
--   `crc_dentists` — a agenda é consultada POR DENTISTA. Sem a lista deles
--   persistida, não há por quem perguntar. Até aqui o nome do dentista só
--   existia desnormalizado dentro de `crc_appointments`, o que serve para
--   mostrar na tela e não serve para varrer a agenda.
--
--   `crc_scheduling_offers` — entre "seguem três horários" e "o das 10:40",
--   passa tempo. Alguém precisa lembrar o que foi oferecido, e precisa lembrar
--   de forma durável: memória de processo morre no próximo deploy, e o paciente
--   responde no dia seguinte.
--
-- ADITIVO E IDEMPOTENTE, como os anteriores: pode rodar duas vezes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Dentistas
-- ----------------------------------------------------------------------------
create table if not exists public.crc_dentists (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,

  external_source text not null default 'dental_office',
  external_id     text not null,

  nome            text not null,
  especialidade   text,
  cro             text,

  -- Desligar um dentista tira a agenda dele das ofertas sem apagar o histórico
  -- das consultas que ele já atendeu.
  ativo           boolean not null default true,

  sincronizado_em timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  unique (organization_id, external_source, external_id)
);

create index if not exists crc_dentists_da_clinica
  on public.crc_dentists (organization_id, clinic_id)
  where ativo;

-- ----------------------------------------------------------------------------
-- Ofertas de horário
-- ----------------------------------------------------------------------------
create table if not exists public.crc_scheduling_offers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  conversation_id uuid not null references public.crc_conversations(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,
  opportunity_id  uuid references public.crc_opportunities(id) on delete set null,

  -- O que foi oferecido, na ordem em que apareceu na mensagem. Guardado por
  -- valor, e não por referência à agenda: o que importa reconstituir depois é
  -- o que o PACIENTE LEU, mesmo que a agenda já tenha mudado.
  opcoes          jsonb not null default '[]'::jsonb,

  -- ABERTA | ACEITA | EXPIRADA | CANCELADA
  status          text not null default 'ABERTA',
  appointment_id  uuid references public.crc_appointments(id) on delete set null,
  aceito_em       timestamptz,

  expira_em       timestamptz not null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- A REGRA MAIS IMPORTANTE DESTE ARQUIVO.
-- Duas ofertas abertas na mesma conversa fazem "pode ser às 10:40" virar
-- loteria entre dois conjuntos de opções. O índice parcial recusa a segunda no
-- banco — a idempotência mora aqui, e não na disciplina de quem chama.
create unique index if not exists crc_scheduling_offers_uma_aberta
  on public.crc_scheduling_offers (conversation_id)
  where status = 'ABERTA';

create index if not exists crc_scheduling_offers_vencendo
  on public.crc_scheduling_offers (organization_id, expira_em)
  where status = 'ABERTA';

-- ----------------------------------------------------------------------------
-- RLS — mesmo desenho das demais tabelas do CRC: nada passa pelo anon.
-- ----------------------------------------------------------------------------
alter table public.crc_dentists          enable row level security;
alter table public.crc_scheduling_offers enable row level security;
