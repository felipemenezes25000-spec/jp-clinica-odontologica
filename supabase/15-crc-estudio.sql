-- ============================================================================
-- CRC AI OS — Fatia 10: o Estúdio (versões do agente)
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. As versões do texto do agente
-- ----------------------------------------------------------------------------
--
-- PUBLICADO NÃO SE EDITA NO LUGAR (ADR-09).
--
-- Editar a instrução publicada direto na coluna faria a pergunta "por que o
-- agente respondeu assim na terça?" perder resposta — e ela é a pergunta que mais
-- vai aparecer. Aqui se edita um RASCUNHO e se publica de novo; a versão antiga
-- fica.
--
-- `rodada_id` é o que liga a versão à avaliação que a aprovou. Sem esse vínculo, a
-- suíte poderia aprovar um texto e alguém publicar outro — o gate ficaria
-- aprovando o passado.
create table if not exists public.crc_agent_versions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,

  versao          integer not null,
  instrucoes      text not null,

  -- RASCUNHO | PUBLICADA | ARQUIVADA
  status          text not null default 'RASCUNHO',

  -- A rodada de avaliação que liberou a publicação desta versão.
  rodada_id       uuid references public.crc_eval_rodadas(id) on delete set null,

  criado_por      uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  publicado_por   uuid references public.crc_users(id) on delete set null,
  publicado_em    timestamptz,

  unique (organization_id, versao)
);

-- Uma publicada por clínica. O índice PARCIAL é quem garante — sem ele, duas
-- versões publicadas deixariam "qual o agente usa?" sem resposta.
create unique index if not exists uq_crc_agent_versions_publicada
  on public.crc_agent_versions (organization_id)
  where status = 'PUBLICADA';

-- Um rascunho por clínica também: dois rascunhos abertos é a forma mais rápida de
-- alguém publicar o que não revisou.
create unique index if not exists uq_crc_agent_versions_rascunho
  on public.crc_agent_versions (organization_id)
  where status = 'RASCUNHO';

-- ----------------------------------------------------------------------------
-- 2. A rodada passa a saber QUAL versão ela avaliou
-- ----------------------------------------------------------------------------
--
-- Sem esta coluna, o gate da Fatia 9 aprovaria "a última rodada" sem saber sobre
-- que texto ela rodou. Uma pessoa poderia avaliar a versão 3, publicar a versão 4
-- e o gate continuaria dizendo que está tudo aprovado.
--
-- `null` significa "avaliou o texto que vem no código", que é o estado de quem
-- nunca publicou versão nenhuma.
alter table public.crc_eval_rodadas
  add column if not exists agent_version_id uuid references public.crc_agent_versions(id) on delete set null;

create index if not exists idx_crc_eval_rodadas_por_versao
  on public.crc_eval_rodadas (organization_id, agent_version_id, criado_em desc);

alter table public.crc_agent_versions enable row level security;
