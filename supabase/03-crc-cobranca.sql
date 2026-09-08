-- ============================================================================
-- JP CRC OS — cobrança de pacientes inadimplentes
--
-- Rode DEPOIS de `02-crc-schema.sql`. É idempotente e ADITIVO: não altera nem
-- apaga nada do que já existe (item 116 — migration compatível com o que está
-- em produção).
--
-- POR QUE UMA TABELA PRÓPRIA, E NÃO UM CAMPO EM `crc_budgets`
-- Porque são dois fatos comerciais diferentes, e confundi-los produz a pior
-- mensagem possível:
--
--   ORÇAMENTO ABERTO  = o paciente ainda não decidiu. A conversa é "ficou
--                       alguma dúvida?". Perder isso custa uma venda.
--
--   COBRANÇA EM ABERTO = o paciente já decidiu, o tratamento aconteceu (ou
--                       está acontecendo) e a parcela venceu. A conversa é
--                       "está tudo bem com o pagamento?". Errar isso custa a
--                       relação — e pode custar processo.
--
-- Um paciente pode ter os dois ao mesmo tempo, e o sistema precisa saber
-- distinguir. Com um campo só em `budgets`, "orçamento aprovado e não pago"
-- não teria como existir.
--
-- A GRANULARIDADE É A PARCELA, e não o contrato. Um tratamento de R$ 4.800 em
-- 6x tem seis vencimentos diferentes: cobrar o contrato inteiro quando uma
-- parcela atrasa é errado, e é exatamente o tipo de erro que gera reclamação.
-- ============================================================================

create table if not exists public.crc_charges (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete cascade,
  -- De qual orçamento veio, quando dá para saber. Nullable porque a cobrança
  -- pode ser importada de um financeiro que não conhece o orçamento.
  budget_id       uuid references public.crc_budgets(id) on delete set null,

  provider        text not null default 'CSV_IMPORT',
  external_id     text,
  -- Mesma lógica do orçamento: sem ID externo, chave derivada do conteúdo.
  fingerprint     text not null,

  -- Item 221: dinheiro NUNCA em float.
  valor           numeric(12,2) not null,
  valor_pago      numeric(12,2) not null default 0,

  -- A parcela dentro do contrato. `2/6` é legível para quem atende ao
  -- telefone, e é o que o paciente reconhece quando ouve.
  parcela         integer,
  total_parcelas  integer,

  vencimento_em   date not null,
  pago_em         timestamptz,

  -- ABERTA | PAGA | PARCIAL | RENEGOCIADA | CANCELADA | INCOBRAVEL
  --
  -- RENEGOCIADA e INCOBRAVEL existem para tirar da fila SEM apagar o registro:
  -- o histórico precisa continuar respondendo "o que aconteceu com essa
  -- dívida", e apagar a linha destruiria isso.
  status          text not null default 'ABERTA',

  descricao       text,
  forma_pagamento text,

  -- Quantas vezes já falamos sobre ESTA cobrança. É o teto do item 99
  -- aplicado à cobrança, e ele é mais rígido: insistir demais numa dívida é
  -- o que o art. 42 do CDC chama de constrangimento.
  tentativas_contato integer not null default 0,
  ultimo_contato_em  timestamptz,

  -- Quando o paciente pede para tratar direto com a clínica, a automação para
  -- e não volta. Item 100: o humano sempre pode assumir.
  negociacao_humana boolean not null default false,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  unique (organization_id, fingerprint)
);

-- A consulta que a varredura diária faz. Sem este índice ela varre a tabela
-- inteira todo dia.
create index if not exists crc_charges_cobranca
  on public.crc_charges (organization_id, vencimento_em)
  where status in ('ABERTA', 'PARCIAL') and negociacao_humana = false;

create index if not exists crc_charges_paciente
  on public.crc_charges (patient_id, vencimento_em desc);

alter table public.crc_charges enable row level security;

-- ----------------------------------------------------------------------------
-- Acordo de renegociação
--
-- Separado da cobrança porque um acordo SUBSTITUI várias parcelas por outras.
-- Sem esta tabela, renegociar significaria editar as parcelas originais — e o
-- histórico do que foi combinado antes desapareceria, que é justamente o que
-- alguém vai querer consultar quando o acordo também não for cumprido.
-- ----------------------------------------------------------------------------
create table if not exists public.crc_payment_agreements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  patient_id      uuid not null references public.crc_patients(id) on delete cascade,

  valor_original  numeric(12,2) not null,
  valor_acordado  numeric(12,2) not null,
  parcelas        integer not null default 1,
  primeira_em     date not null,

  -- ATIVO | CUMPRIDO | QUEBRADO | CANCELADO
  status          text not null default 'ATIVO',
  observacao      text,

  criado_por      uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists crc_agreements_paciente
  on public.crc_payment_agreements (patient_id, criado_em desc);

alter table public.crc_payment_agreements enable row level security;
