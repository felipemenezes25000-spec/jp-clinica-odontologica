-- ============================================================================
-- JP CRC OS — campanhas. Aditivo: rode depois do 02.
--
-- POR QUE UMA CAMPANHA NÃO É UMA AUTOMAÇÃO
-- A automação reage a um FATO de um paciente ("faltou", "cancelou") e o
-- gatilho decide quando ela começa. A campanha parte de um RECORTE da base
-- ("quem não volta há mais de um ano") e quem decide quando ela começa é uma
-- pessoa. São dois modelos diferentes de decisão, e forçar os dois na mesma
-- tabela produziria uma automação com gatilho "alguém clicou em enviar".
--
-- POR QUE O PÚBLICO É MATERIALIZADO, e não recalculado a cada envio
-- Porque o recorte muda embaixo da campanha. "Quem não volta há 12 meses" no
-- dia 1 é um conjunto; no dia 20 é outro, porque gente entrou no critério e
-- gente saiu dele ao marcar consulta. Recalcular todo dia faria a campanha
-- nunca terminar e mandar mensagem para quem entrou no filtro DEPOIS de a
-- pessoa ter revisado o público — que é exatamente o que a revisão existe para
-- impedir.
--
-- Congelar na hora do agendamento tem o efeito oposto e desejado: o que foi
-- revisado é o que sai. Quem marcou consulta no meio do caminho continua sendo
-- protegido, mas pela política de contato, na hora do envio — não por um
-- recorte que se move.
-- ============================================================================

create table if not exists public.crc_campaigns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete set null,

  nome            text not null,
  -- O recorte, do jeito que a tela montou. Validado na entrada e na saída pela
  -- mesma função — jsonb que ninguém confere vira filtro inventado.
  filtros         jsonb not null default '{}'::jsonb,
  -- O texto com {{primeiroNome}} e {{clinica}}. Guardado na campanha, e não em
  -- `crc_templates`: template é catálogo reutilizável, campanha é uma peça de
  -- uma vez só.
  mensagem        text not null,

  -- RASCUNHO | AGENDADA | RODANDO | PAUSADA | CONCLUIDA
  status          text not null default 'RASCUNHO',
  -- Quantas mensagens por dia. Espalhar é o que impede queimar a base.
  por_dia         integer not null default 120 check (por_dia > 0 and por_dia <= 2000),
  inicia_em       date,

  criado_por      uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists crc_campaigns_org
  on public.crc_campaigns (organization_id, status, criado_em desc);

-- ============================================================================
-- O público congelado. Uma linha por pessoa, e o índice único é o que garante
-- que reprocessar a campanha nunca manda duas mensagens para a mesma pessoa —
-- idempotência por constraint, como no resto do sistema.
-- ============================================================================

create table if not exists public.crc_campaign_targets (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.crc_campaigns(id) on delete cascade,
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  patient_id      uuid not null references public.crc_patients(id) on delete cascade,

  -- PENDENTE | ENVIADA | PULADA
  status          text not null default 'PENDENTE',
  -- Por que foi pulada: opt-out, sem telefone, fora do teto. Fica legível na
  -- tela, senão "312 enviadas de 964" não explica os 652 que faltam.
  motivo          text,
  message_id      uuid references public.crc_messages(id) on delete set null,
  processado_em   timestamptz,
  criado_em       timestamptz not null default now()
);

create unique index if not exists crc_campaign_targets_unico
  on public.crc_campaign_targets (campaign_id, patient_id);

-- A consulta do worker: os pendentes de uma campanha, na ordem em que entraram.
create index if not exists crc_campaign_targets_fila
  on public.crc_campaign_targets (campaign_id, status, criado_em);

alter table public.crc_campaigns enable row level security;
alter table public.crc_campaign_targets enable row level security;
