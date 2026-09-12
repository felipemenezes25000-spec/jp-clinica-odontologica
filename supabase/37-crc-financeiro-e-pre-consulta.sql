-- ============================================================================
-- CRC — a política de pagamento e a checagem de pré-consulta.  (FASE E)
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
-- ============================================================================
--
-- ============================================================================
--  O QUE ESTA MIGRATION ENTREGA HOJE, e o que fica `BLOCKED_EXTERNAL`.
--
--  ENTREGA HOJE, e é a parte que muda dinheiro:
--
--    A POLÍTICA DE PAGAMENTO. Quanto de desconto pode ser dado, por quem, em
--    quantas parcelas. Hoje isso mora na cabeça de quem atende — e é por isso
--    que a resposta a "consegue fazer por menos?" depende de quem está no
--    balcão naquele dia.
--
--    A CHECAGEM DE PRÉ-CONSULTA. O que falta para a pessoa poder ser atendida
--    amanhã: formulário, documento, confirmação, autorização de convênio.
--
--  FICA `BLOCKED_EXTERNAL`: gerar cobrança, link de pagamento, PIX. Não há
--  provedor contratado, e o §131 proíbe marcar como pronto o que depende de
--  integração inexistente. `crc_payment_intents` existe como o LUGAR — com
--  máquina de estados e dedupe — e nasce vazia.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A política de pagamento
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  ESTA TABELA É O ANTÍDOTO DA FRASE "DEIXA QUE EU VEJO COM A DOUTORA".
--
--  Sem política escrita, a resposta a "consegue fazer por menos?" depende de
--  quem está no balcão. Dois pacientes com o mesmo tratamento recebem descontos
--  diferentes, ninguém sabe quanto a clínica deu de desconto no mês, e a
--  automação NÃO PODE dizer nada sobre pagamento — porque não existe nada que
--  ela possa dizer sem inventar.
--
--  Com ela, a automação informa o que já foi decidido: "dá para parcelar em
--  até 6× sem juros". Isso é INFORMAR, e não negociar — e a diferença é o que
--  separa o que a máquina pode fazer do que ela não pode.
-- ============================================================================
create table if not exists public.crc_payment_policies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  -- Nulo = vale para a organização inteira. Mesmo padrão de `crc_autonomia`.
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,

  nome            text not null,

  /*
   * O TETO DE DESCONTO, em PONTOS PERCENTUAIS.
   *
   * Percentual e não valor absoluto porque é assim que a clínica pensa e é
   * assim que escala: "10% em qualquer tratamento" funciona para R$ 500 e para
   * R$ 20.000. Um teto em reais viraria desconto de 100% no tratamento barato.
   */
  desconto_max_pct numeric(5,2) not null default 0,

  /*
   * QUEM PODE APROVAR ACIMA DO TETO.
   *
   * `null` significa NINGUÉM — o teto é rígido. É o padrão, e é deliberado:
   * uma política que nasce com alçada aberta é uma política que ninguém
   * configurou.
   */
  aprovador_papel text,

  parcelas_max    integer not null default 1,
  -- Em quantas parcelas ainda não há juros. Abaixo disso a automação pode
  -- informar; acima, o número vira negociação e sai do alcance dela.
  parcelas_sem_juros integer not null default 1,

  -- Valor mínimo de parcela. Sem ele, um tratamento de R$ 600 em 12× vira
  -- parcela de R$ 50, que custa mais para cobrar do que vale.
  parcela_minima  numeric(12,2) not null default 0,

  /*
   * O QUE A AUTOMAÇÃO PODE DIZER, em texto pronto.
   *
   * Existe para o agente NÃO FORMULAR a frase sozinho. "Dá para parcelar" dito
   * por um modelo vira "dá para parcelar em quantas vezes você quiser" na
   * terceira mensagem. Aqui o texto é escrito por uma pessoa, e o agente cita.
   */
  texto_para_paciente text,

  ativa           boolean not null default true,
  criado_por      uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  constraint crc_policies_desconto_valido check (desconto_max_pct >= 0 and desconto_max_pct <= 100),
  constraint crc_policies_parcelas_validas check (parcelas_max >= 1 and parcelas_sem_juros >= 1)
);

-- Dois índices, e não um com coluna nulável: a lição do `supabase/23`.
create unique index if not exists crc_policies_por_clinica
  on public.crc_payment_policies (organization_id, clinic_id, nome)
  where clinic_id is not null;

create unique index if not exists crc_policies_da_org
  on public.crc_payment_policies (organization_id, nome)
  where clinic_id is null;

-- ----------------------------------------------------------------------------
-- 2. A intenção de pagamento — BLOCKED_EXTERNAL
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  ESTA TABELA NASCE VAZIA, E ISSO ESTÁ DITO EM VEZ DE ESCONDIDO.
--
--  Não há provedor de pagamento contratado. O que existe aqui é a MÁQUINA DE
--  ESTADOS e a idempotência — que são a parte difícil e a parte que não se
--  improvisa depois, com dinheiro real passando.
--
--  O §60 pede, para todo efeito externo: dedupe, máquina de estados,
--  reconciliação, "entrega desconhecida" e retry seguro. `DESCONHECIDO` é o
--  estado que mais importa: a chamada ao provedor pode falhar DEPOIS de ele ter
--  cobrado, e um sistema que só conhece SUCESSO e FALHA vai cobrar de novo.
-- ============================================================================
create table if not exists public.crc_payment_intents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,
  charge_id       uuid references public.crc_charges(id) on delete set null,
  budget_id       uuid references public.crc_budgets(id) on delete set null,

  provedor        text not null default 'nenhum',
  external_id     text,

  valor           numeric(12,2) not null,
  -- PIX | CARTAO | BOLETO | LINK | DINHEIRO
  metodo          text not null default 'LINK',

  /*
   * CRIADA | ENVIADA | PAGA | EXPIRADA | CANCELADA | FALHOU | DESCONHECIDO
   *
   * `DESCONHECIDO` não é um estado de erro: é a verdade quando a chamada ao
   * provedor não respondeu. A reconciliação resolve depois, consultando o
   * provedor — e até lá NADA é cobrado de novo.
   */
  status          text not null default 'CRIADA',

  -- Nunca guarda cartão, nunca guarda dado bancário (§28). Só a URL que o
  -- provedor devolve, que é pública por natureza e expira.
  url             text,
  expira_em       timestamptz,

  pago_em         timestamptz,
  erro            text,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  -- A idempotência do efeito externo. Sem ela, dois cliques viram duas
  -- cobranças — e a segunda é a que chega no WhatsApp do paciente.
  chave_dedupe    text not null
);

create unique index if not exists crc_payment_intents_dedupe
  on public.crc_payment_intents (organization_id, chave_dedupe);

create index if not exists idx_crc_intents_pendentes
  on public.crc_payment_intents (organization_id, criado_em desc)
  where status in ('CRIADA', 'ENVIADA', 'DESCONHECIDO');

-- ----------------------------------------------------------------------------
-- 3. A checagem de pré-consulta
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  O §30 PEDE UM CHECKLIST. O QUE ELE RESOLVE É CONCRETO: a pessoa chega para
--  a consulta e falta a autorização do convênio, ou o formulário de anamnese,
--  ou ela nunca confirmou. O atendimento atrasa, ou não acontece.
--
--  A TABELA É DE PENDÊNCIA, E NÃO DE CHECKLIST COMPLETO. Guardar "tudo certo"
--  para cada consulta encheria a tabela com linhas que não dizem nada — uma
--  linha existe quando FALTA alguma coisa, e some quando resolve.
--
--  E o CRC resolve sozinho só o que é administrativo: pedir confirmação,
--  mandar o link do formulário. Autorização de convênio vira TAREFA para
--  gente, porque depende de ligar para o plano (§31).
-- ============================================================================
create table if not exists public.crc_previsit_checks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  appointment_id  uuid not null references public.crc_appointments(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,

  -- FORMULARIO | DOCUMENTO | CONFIRMACAO | CONVENIO | RISCO_FALTA | PAGAMENTO
  item            text not null,

  -- PENDENTE | RESOLVIDO | DISPENSADO | BLOQUEADO
  -- `DISPENSADO` existe porque a recepção sabe coisas que o sistema não sabe —
  -- "essa paciente trouxe o documento na semana passada".
  status          text not null default 'PENDENTE',

  /*
   * QUEM RESOLVE: 'automacao' ou 'humano'.
   *
   * É a coluna que separa o que o CRC pode fechar sozinho (pedir confirmação,
   * mandar link) do que ele só pode registrar (ligar para o convênio). Sem
   * ela, a tela mostraria uma lista de pendências sem dizer quais já estão
   * sendo tratadas.
   */
  resolve_quem    text not null default 'humano',

  detalhe         text,
  resolvido_em    timestamptz,
  resolvido_por   uuid references public.crc_users(id) on delete set null,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  -- Um item por consulta. A varredura roda todo dia; sem a chave, a consulta de
  -- quinta acumularia uma pendência de confirmação por dia até lá.
  unique (appointment_id, item)
);

create index if not exists idx_crc_previsit_pendentes
  on public.crc_previsit_checks (organization_id, clinic_id, status)
  where status = 'PENDENTE';

insert into public.crc_schema_migrations (nome, presumido)
values ('37-crc-financeiro-e-pre-consulta.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();

-- ----------------------------------------------------------------------------
-- RLS e privilégios
-- ----------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array[
    'crc_payment_policies','crc_payment_intents','crc_previsit_checks'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $rls$;

do $privilegios$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant all on all functions in schema public to service_role';
  end if;
end $privilegios$;
