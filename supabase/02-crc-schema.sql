-- ============================================================================
-- JP CRC OS — schema
--
-- Cole inteiro no SQL Editor do Supabase e rode. É IDEMPOTENTE: rodar de novo
-- não apaga dado nem quebra nada.
--
-- REGRA DE OURO DESTE ARQUIVO: ele só cria coisas com prefixo `crc_`. Nenhuma
-- tabela `rh_*` é tocada. O item 206 do contrato ("desenvolvimento não pode
-- quebrar RH") vale também para o banco.
--
-- POR QUE COLUNAS DE VERDADE, E NÃO `dados jsonb` COMO NO RH
-- O RH acertou ao usar jsonb: a Candidatura mudou de forma três vezes e o
-- TypeScript continuou sendo a única fonte de verdade. Aqui a escolha é outra
-- porque o problema é outro:
--   1. O CRC precisa de UNIQUE reais para idempotência (item 13). Um UNIQUE
--      sobre coluna gerada de jsonb funciona, mas some quando o campo está
--      ausente no objeto — e "some" num índice de deduplicação significa
--      paciente duplicado.
--   2. O motor de automação faz varredura por `resume_at <= now()` a cada
--      minuto, sobre uma tabela que cresce sem teto.
--   3. `FOR UPDATE SKIP LOCKED` (item 32) sobre coluna gerada é frágil.
-- Onde a forma É genuinamente instável — payload de evento, contexto de IA,
-- definição de passo de automação — o jsonb continua, de propósito.
--
-- SEGURANÇA: toda tabela tem RLS ligado e ZERO policies. Só a service_role
-- (servidor) enxerga. A chave anon que vai ao navegador não alcança nada.
-- Item 72 do contrato.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ============================================================================
-- 1. TENANT — organização, clínica, usuário, papel
-- ============================================================================

create table if not exists public.crc_organizations (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  slug          text not null unique,
  fuso          text not null default 'America/Sao_Paulo',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.crc_clinics (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.crc_organizations(id) on delete cascade,
  nome             text not null,
  slug             text not null,
  -- ID da clínica no Dental Office. Nullable porque a clínica existe no CRC
  -- antes de a integração ser ligada.
  external_id      text,
  fuso             text not null default 'America/Sao_Paulo',
  ativa            boolean not null default true,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (organization_id, slug)
);

-- Papéis do item 37: Admin, Gestor, CRC, Recepção, Dentista, Marketing.
-- Guardados como texto e não enum do Postgres: adicionar papel novo com enum
-- exige ALTER TYPE, que trava a tabela. A validação real mora no TypeScript,
-- que é onde a lista de permissões por papel vive.
create table if not exists public.crc_users (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  nome            text not null,
  email           text not null,
  -- scrypt: sal e hash em hex, separados por ':'. Mesmo formato do RH.
  senha_hash      text,
  papel           text not null default 'crc',
  ativo           boolean not null default true,
  ultimo_acesso   timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (organization_id, email)
);

-- Um usuário pode atender mais de uma unidade. Sem esta tabela o CRC seria
-- mono-clínica na prática, e o item 168 pede o contrário.
create table if not exists public.crc_user_clinics (
  user_id   uuid not null references public.crc_users(id) on delete cascade,
  clinic_id uuid not null references public.crc_clinics(id) on delete cascade,
  primary key (user_id, clinic_id)
);

-- ============================================================================
-- 2. PACIENTES
-- ============================================================================

create table if not exists public.crc_patients (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,

  -- Item 13: a chave de idempotência da sincronização. NUNCA nome ou telefone.
  external_source text not null default 'dental_office',
  external_id     text not null,

  nome            text not null,
  nascimento      date,
  genero          text,

  -- Normalizado pelo mapper: PRIMEIRA_CONSULTA, EM_TRATAMENTO, CONCLUIDO,
  -- ALTA, ABANDONO, DESCONHECIDO. Os números 1..7 do Dental Office não
  -- vazam para cá (item 18).
  situacao        text not null default 'DESCONHECIDO',
  especialidade   text,
  ativo           boolean not null default true,

  -- E.164 sem o '+': 5511999999999. É por aqui que a mensagem de WhatsApp
  -- encontra o paciente (itens 166/167).
  telefone        text,
  telefone_bruto  text,
  email           text,

  -- Espelho denormalizado do que a agenda diz. Recalculado pelo sync; existe
  -- porque "quem não tem consulta futura" é a condição mais consultada do
  -- sistema inteiro, e fazer NOT EXISTS em crc_appointments a cada regra
  -- custaria caro sobre 20 mil pacientes.
  ultima_consulta_em   timestamptz,
  proxima_consulta_em  timestamptz,

  -- Opt-out (item 39). Uma vez marcado, nenhuma mensagem promocional sai.
  opt_out_em      timestamptz,
  opt_out_motivo  text,

  arquivado       boolean not null default false,
  sincronizado_em timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  unique (organization_id, external_source, external_id)
);

create index if not exists crc_patients_busca_nome
  on public.crc_patients using gin (nome gin_trgm_ops);
create index if not exists crc_patients_telefone
  on public.crc_patients (organization_id, telefone) where telefone is not null;
create index if not exists crc_patients_clinica
  on public.crc_patients (clinic_id) where arquivado = false;
-- Suporta a regra de recall sem varrer a tabela inteira.
create index if not exists crc_patients_recall
  on public.crc_patients (organization_id, ultima_consulta_em)
  where arquivado = false and ativo = true and opt_out_em is null;

create table if not exists public.crc_patient_tags (
  patient_id uuid not null references public.crc_patients(id) on delete cascade,
  tag        text not null,
  criado_em  timestamptz not null default now(),
  primary key (patient_id, tag)
);

-- ============================================================================
-- 3. AGENDA
-- ============================================================================

create table if not exists public.crc_appointments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,

  external_source text not null default 'dental_office',
  external_id     text not null,

  dentista_externo_id text,
  dentista_nome       text,
  cadeira_externa_id  text,

  inicio_em       timestamptz not null,
  fim_em          timestamptz,
  descricao       text,

  -- TO_CONFIRM | CONFIRMED | IN_PROGRESS | COMPLETED | MISSED | CANCELLED
  status          text not null default 'TO_CONFIRM',
  -- Guarda o código cru só para auditoria de mapeamento. Nenhuma regra lê.
  status_externo  text,

  sincronizado_em timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  unique (organization_id, external_source, external_id)
);

create index if not exists crc_appointments_paciente
  on public.crc_appointments (patient_id, inicio_em desc);
create index if not exists crc_appointments_agenda
  on public.crc_appointments (clinic_id, inicio_em);
-- A automação de confirmação varre "amanhã e ainda por confirmar".
create index if not exists crc_appointments_confirmar
  on public.crc_appointments (organization_id, inicio_em)
  where status = 'TO_CONFIRM';

-- ============================================================================
-- 4. LEADS E ATRIBUIÇÃO
-- ============================================================================

create table if not exists public.crc_leads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete set null,
  patient_id      uuid references public.crc_patients(id) on delete set null,

  nome            text not null,
  telefone        text,
  email           text,
  origem          text not null default 'DESCONHECIDA',

  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  gclid           text,
  fbclid          text,
  landing_page    text,

  -- Itens 157/158: speed to lead. `primeira_resposta_em - criado_em`.
  primeira_resposta_em timestamptz,

  -- Impede o mesmo lead entrar duas vezes pelo mesmo formulário.
  chave_dedupe    text,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create unique index if not exists crc_leads_dedupe
  on public.crc_leads (organization_id, chave_dedupe) where chave_dedupe is not null;

-- ============================================================================
-- 5. OPORTUNIDADES
-- ============================================================================

create table if not exists public.crc_opportunity_stages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  chave           text not null,
  nome            text not null,
  ordem           integer not null default 0,
  -- ABERTA | GANHA | PERDIDA. Define o que conta como conversão.
  categoria       text not null default 'ABERTA',
  criado_em       timestamptz not null default now(),
  unique (organization_id, chave)
);

create table if not exists public.crc_opportunities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete cascade,
  lead_id         uuid references public.crc_leads(id) on delete set null,

  -- NEW_LEAD | MISSED_APPOINTMENT | CANCELLED_APPOINTMENT | RECALL |
  -- INACTIVE_PATIENT | ABANDONED_TREATMENT | BUDGET_RECOVERY | BIRTHDAY | MANUAL
  tipo            text not null,
  stage_id        uuid references public.crc_opportunity_stages(id) on delete set null,
  assigned_to     uuid references public.crc_users(id) on delete set null,

  priority_score  integer not null default 0,
  -- Item 173: os fatores que somaram o score, para a UI explicar "por quê".
  priority_fatores jsonb not null default '[]'::jsonb,

  -- Item 221: dinheiro NUNCA em float.
  potential_value numeric(12,2),
  origem          text,

  -- Item 185: toda oportunidade tenta ter próxima ação.
  next_action     text,
  next_action_at  timestamptz,

  motivo          text,
  lost_reason     text,
  reactivate_at   timestamptz,

  fechada_em      timestamptz,

  -- Item 121: impede duas oportunidades para o mesmo fato. Ex.:
  -- 'MISSED_APPOINTMENT:<external_id>'. Só vale enquanto está aberta —
  -- daí o índice parcial abaixo.
  chave_dedupe    text,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create unique index if not exists crc_opportunities_dedupe_aberta
  on public.crc_opportunities (organization_id, chave_dedupe)
  where chave_dedupe is not null and fechada_em is null;
create index if not exists crc_opportunities_fila
  on public.crc_opportunities (organization_id, priority_score desc, criado_em)
  where fechada_em is null;
create index if not exists crc_opportunities_responsavel
  on public.crc_opportunities (assigned_to, next_action_at) where fechada_em is null;
create index if not exists crc_opportunities_paciente
  on public.crc_opportunities (patient_id, criado_em desc);

-- Item 23: trocar de etapa SEMPRE gera histórico. Nunca sobrescrever e pronto.
create table if not exists public.crc_opportunity_history (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  uuid not null references public.crc_opportunities(id) on delete cascade,
  de_stage_id     uuid references public.crc_opportunity_stages(id) on delete set null,
  para_stage_id   uuid references public.crc_opportunity_stages(id) on delete set null,
  changed_by      uuid references public.crc_users(id) on delete set null,
  -- 'automacao' quando não houve humano.
  origem          text not null default 'humano',
  motivo          text,
  criado_em       timestamptz not null default now()
);

create index if not exists crc_opportunity_history_op
  on public.crc_opportunity_history (opportunity_id, criado_em desc);

-- ============================================================================
-- 6. TAREFAS
-- ============================================================================

create table if not exists public.crc_tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete cascade,
  opportunity_id  uuid references public.crc_opportunities(id) on delete cascade,

  titulo          text not null,
  -- LIGAR | WHATSAPP | REVISAR | NEGOCIAR | CONFIRMAR | RETORNAR
  tipo            text not null default 'LIGAR',
  -- OPEN | IN_PROGRESS | COMPLETED | CANCELLED
  status          text not null default 'OPEN',
  prioridade      integer not null default 0,
  assigned_to     uuid references public.crc_users(id) on delete set null,
  due_at          timestamptz,
  notas           text,
  motivo          text,

  -- Impede a automação criar a mesma tarefa a cada execução repetida.
  chave_dedupe    text,

  concluida_em    timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create unique index if not exists crc_tasks_dedupe_aberta
  on public.crc_tasks (organization_id, chave_dedupe)
  where chave_dedupe is not null and status in ('OPEN', 'IN_PROGRESS');
create index if not exists crc_tasks_minhas
  on public.crc_tasks (assigned_to, due_at) where status in ('OPEN', 'IN_PROGRESS');
create index if not exists crc_tasks_paciente
  on public.crc_tasks (patient_id, criado_em desc);

-- ============================================================================
-- 7. CONVERSAS E MENSAGENS
-- ============================================================================

create table if not exists public.crc_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,

  canal           text not null default 'whatsapp',
  -- Chave do contato no provedor. Para WhatsApp, o telefone E.164 sem '+'.
  contato_externo text not null,

  -- ABERTA | AGUARDANDO | RESOLVIDA
  status          text not null default 'ABERTA',
  assigned_to     uuid references public.crc_users(id) on delete set null,

  -- Item 41: dois atendentes não podem responder ao mesmo tempo sem saber.
  bloqueada_por     uuid references public.crc_users(id) on delete set null,
  bloqueada_ate     timestamptz,

  nao_lidas       integer not null default 0,
  ultima_mensagem_em     timestamptz,
  ultima_mensagem_trecho text,
  -- Espelho da última classificação da IA, para a lista não precisar de join.
  temperatura     text,
  intencao        text,
  resumo_ia       text,
  resumo_ia_em    timestamptz,

  -- Item 167: quando o telefone casa com mais de um paciente, ninguém escolhe
  -- por chute. A conversa fica marcada e vai para revisão humana.
  revisao_pendente boolean not null default false,
  candidatos      jsonb,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  unique (organization_id, canal, contato_externo)
);

create index if not exists crc_conversations_inbox
  on public.crc_conversations (organization_id, ultima_mensagem_em desc);
create index if not exists crc_conversations_minhas
  on public.crc_conversations (assigned_to, ultima_mensagem_em desc);

create table if not exists public.crc_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  conversation_id uuid not null references public.crc_conversations(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,

  -- ENTRADA | SAIDA
  direcao         text not null,
  -- paciente | atendente | automacao | ia | sistema
  remetente       text not null,
  autor_id        uuid references public.crc_users(id) on delete set null,

  conteudo        text not null,
  -- Item 163: nota interna NUNCA vai para o paciente.
  nota_interna    boolean not null default false,

  template_id     uuid,
  automation_execution_id uuid,

  -- QUEUED | SENT | DELIVERED | READ | FAILED
  status_entrega  text not null default 'QUEUED',
  erro            text,

  -- Item 37: o provedor reenvia webhook. Esta é a chave que impede duplicar.
  provider_message_id text,
  -- Item 120: impede a automação mandar a mesma coisa duas vezes.
  chave_dedupe    text,

  enviado_em      timestamptz,
  criado_em       timestamptz not null default now()
);

create unique index if not exists crc_messages_provider
  on public.crc_messages (organization_id, provider_message_id)
  where provider_message_id is not null;
create unique index if not exists crc_messages_dedupe
  on public.crc_messages (organization_id, chave_dedupe)
  where chave_dedupe is not null;
create index if not exists crc_messages_conversa
  on public.crc_messages (conversation_id, criado_em);

-- ============================================================================
-- 8. TEMPLATES (item 103: versionar; nunca editar histórico já enviado)
-- ============================================================================

create table if not exists public.crc_templates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  chave           text not null,
  versao          integer not null default 1,
  canal           text not null default 'whatsapp',
  nome            text not null,
  conteudo        text not null,
  -- Nome do template aprovado no provedor, quando for template oficial.
  provider_nome   text,
  ativo           boolean not null default true,
  aprovado_por    uuid references public.crc_users(id) on delete set null,
  aprovado_em     timestamptz,
  criado_em       timestamptz not null default now(),
  unique (organization_id, chave, versao)
);

-- ============================================================================
-- 9. EVENTOS (Milestone 3)
-- ============================================================================

create table if not exists public.crc_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,

  tipo            text not null,
  entity_type     text,
  entity_id       uuid,
  payload         jsonb not null default '{}'::jsonb,

  -- Item 26: a mesma falta detectada em 5 sincronizações gera UM evento.
  -- Ex.: 'appointment.missed:<external_id>'.
  fingerprint     text not null,

  -- PENDENTE | PROCESSANDO | PROCESSADO | FALHOU | DESCARTADO
  status          text not null default 'PENDENTE',
  tentativas      integer not null default 0,
  ultimo_erro     text,
  -- Item 32: lock cooperativo. Worker marca; worker morto libera pelo tempo.
  travado_ate     timestamptz,

  ocorrido_em     timestamptz not null default now(),
  processado_em   timestamptz,
  criado_em       timestamptz not null default now(),

  unique (organization_id, fingerprint)
);

create index if not exists crc_events_fila
  on public.crc_events (status, ocorrido_em)
  where status in ('PENDENTE', 'FALHOU');

-- ============================================================================
-- 10. AUTOMAÇÕES (Milestone 4)
-- ============================================================================

create table if not exists public.crc_automations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  chave           text not null,
  nome            text not null,
  descricao       text,

  -- ATIVA | PAUSADA | RASCUNHO
  status          text not null default 'RASCUNHO',
  -- Item 96: SHADOW calcula tudo e não executa nada. É como toda automação
  -- nova nasce. RECOMENDAR cria tarefa humana. EXECUTAR age sozinha.
  modo            text not null default 'SHADOW',

  versao_ativa    integer not null default 1,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (organization_id, chave)
);

-- Item 28: alterar automação ativa cria versão nova. Quem já está na v1
-- termina na v1.
create table if not exists public.crc_automation_versions (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.crc_automations(id) on delete cascade,
  versao        integer not null,
  -- { gatilho, condicoes[], passos[], saidas[] } — a forma muda conforme o
  -- builder evolui, e por isso é jsonb de propósito.
  definicao     jsonb not null,
  criado_por    uuid references public.crc_users(id) on delete set null,
  criado_em     timestamptz not null default now(),
  unique (automation_id, versao)
);

create table if not exists public.crc_automation_enrollments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  automation_id   uuid not null references public.crc_automations(id) on delete cascade,
  versao          integer not null,
  patient_id      uuid references public.crc_patients(id) on delete cascade,
  opportunity_id  uuid references public.crc_opportunities(id) on delete set null,
  event_id        uuid references public.crc_events(id) on delete set null,

  -- ACTIVE | WAITING | PAUSED | COMPLETED | FAILED | CANCELLED | EXITED
  status          text not null default 'ACTIVE',
  passo_atual     integer not null default 0,
  -- Item 30: NUNCA setTimeout. A espera vive no banco.
  resume_at       timestamptz,
  contexto        jsonb not null default '{}'::jsonb,

  tentativas      integer not null default 0,
  travado_ate     timestamptz,
  ultimo_erro     text,

  saiu_por        text,
  concluido_em    timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  -- Item 84: o mesmo evento processado duas vezes gera UMA jornada.
  chave_dedupe    text
);

create unique index if not exists crc_enrollments_dedupe
  on public.crc_automation_enrollments (organization_id, automation_id, chave_dedupe)
  where chave_dedupe is not null;
-- O worker de automação vive desta consulta. Sem este índice ele varre tudo.
create index if not exists crc_enrollments_scheduler
  on public.crc_automation_enrollments (resume_at)
  where status in ('ACTIVE', 'WAITING');
create index if not exists crc_enrollments_paciente
  on public.crc_automation_enrollments (patient_id, criado_em desc);

-- Item 180: a automação nunca é caixa preta.
create table if not exists public.crc_automation_logs (
  id              uuid primary key default gen_random_uuid(),
  enrollment_id   uuid not null references public.crc_automation_enrollments(id) on delete cascade,
  passo           integer,
  -- entrou | condicao | espera | acao | saida | erro | shadow
  tipo            text not null,
  descricao       text not null,
  detalhe         jsonb,
  criado_em       timestamptz not null default now()
);

create index if not exists crc_automation_logs_enr
  on public.crc_automation_logs (enrollment_id, criado_em);

-- ============================================================================
-- 11. JOBS (scheduler durável — itens 31, 32, 268, 269)
-- ============================================================================

create table if not exists public.crc_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.crc_organizations(id) on delete cascade,
  tipo            text not null,
  payload         jsonb not null default '{}'::jsonb,

  -- PENDENTE | RODANDO | CONCLUIDO | FALHOU | MORTO
  status          text not null default 'PENDENTE',
  run_at          timestamptz not null default now(),
  tentativas      integer not null default 0,
  max_tentativas  integer not null default 5,
  travado_ate     timestamptz,
  -- Item 270: job longo sinaliza progresso.
  batimento_em    timestamptz,
  progresso       integer,
  ultimo_erro     text,

  concluido_em    timestamptz,
  criado_em       timestamptz not null default now(),

  -- Item 269: cron não processa o mesmo lote duas vezes.
  chave_unica     text
);

create unique index if not exists crc_jobs_unico
  on public.crc_jobs (chave_unica) where chave_unica is not null;
create index if not exists crc_jobs_fila
  on public.crc_jobs (run_at) where status in ('PENDENTE', 'FALHOU');

-- ============================================================================
-- 12. SINCRONIZAÇÃO (itens 15, 16, 135)
-- ============================================================================

create table if not exists public.crc_sync_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,
  recurso         text not null,
  modo            text not null default 'INCREMENTAL',
  status          text not null default 'RODANDO',

  paginas         integer not null default 0,
  processados     integer not null default 0,
  criados         integer not null default 0,
  atualizados     integer not null default 0,
  falhados        integer not null default 0,

  cursor_inicial  text,
  cursor_final    text,
  ultimo_erro     text,

  iniciado_em     timestamptz not null default now(),
  terminado_em    timestamptz
);

create index if not exists crc_sync_jobs_historico
  on public.crc_sync_jobs (organization_id, iniciado_em desc);

-- Item 16: uma falha individual não cancela o lote. Ela aterrissa aqui.
create table if not exists public.crc_sync_falhas (
  id           uuid primary key default gen_random_uuid(),
  sync_job_id  uuid not null references public.crc_sync_jobs(id) on delete cascade,
  external_id  text,
  erro         text not null,
  payload      jsonb,
  criado_em    timestamptz not null default now()
);

-- Estado do cursor por recurso, entre execuções.
create table if not exists public.crc_sync_state (
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  recurso         text not null,
  cursor          text,
  last_sync_at            timestamptz,
  last_successful_sync    timestamptz,
  sync_status     text not null default 'NUNCA',
  primary key (organization_id, recurso)
);

-- ============================================================================
-- 13. ORÇAMENTOS (Milestone 8 — provider-agnóstico)
-- ============================================================================

create table if not exists public.crc_budgets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete cascade,

  -- CSV_IMPORT | DENTAL_OFFICE_API | MANUAL
  provider        text not null default 'CSV_IMPORT',
  external_id     text,
  -- Item 55: sem ID externo, fingerprint determinístico.
  fingerprint     text not null,

  total_value     numeric(12,2) not null default 0,
  approved_value  numeric(12,2),
  -- OPEN | PARTIALLY_APPROVED | APPROVED | REJECTED | EXPIRED | CANCELLED | UNKNOWN
  status          text not null default 'UNKNOWN',
  emitido_em      timestamptz,
  expira_em       timestamptz,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (organization_id, fingerprint)
);

create index if not exists crc_budgets_recuperacao
  on public.crc_budgets (organization_id, status, emitido_em)
  where status in ('OPEN', 'PARTIALLY_APPROVED');

create table if not exists public.crc_budget_items (
  id             uuid primary key default gen_random_uuid(),
  budget_id      uuid not null references public.crc_budgets(id) on delete cascade,
  descricao      text not null,
  codigo         text,
  quantidade     numeric(10,2) not null default 1,
  valor_unitario numeric(12,2) not null default 0,
  valor_total    numeric(12,2) not null default 0
);

-- ============================================================================
-- 14. RECEITA E ATRIBUIÇÃO (itens 61, 62, 63)
-- ============================================================================

create table if not exists public.crc_revenue_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,
  opportunity_id  uuid references public.crc_opportunities(id) on delete set null,
  enrollment_id   uuid references public.crc_automation_enrollments(id) on delete set null,

  -- POTENCIAL   = orçamento aberto, agendamento recuperado sem financeiro.
  -- CONFIRMADA  = existe evento financeiro confiável.
  -- O dashboard NUNCA soma os dois no mesmo número (item 63).
  natureza        text not null default 'POTENCIAL',
  valor           numeric(12,2) not null,
  motivo          text not null,
  recuperada      boolean not null default false,

  ocorrido_em     timestamptz not null default now(),
  criado_em       timestamptz not null default now(),
  chave_dedupe    text
);

create unique index if not exists crc_revenue_dedupe
  on public.crc_revenue_events (organization_id, chave_dedupe)
  where chave_dedupe is not null;
create index if not exists crc_revenue_periodo
  on public.crc_revenue_events (organization_id, ocorrido_em desc);

-- Item 59: o funil, medido no servidor e não no navegador.
create table if not exists public.crc_funnel_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,
  opportunity_id  uuid references public.crc_opportunities(id) on delete set null,
  etapa           text not null,
  origem          text,
  valor           numeric(12,2),
  ocorrido_em     timestamptz not null default now(),
  chave_dedupe    text
);

create unique index if not exists crc_funnel_dedupe
  on public.crc_funnel_events (organization_id, chave_dedupe)
  where chave_dedupe is not null;
create index if not exists crc_funnel_periodo
  on public.crc_funnel_events (organization_id, etapa, ocorrido_em desc);

-- ============================================================================
-- 15. IA (itens 46, 172)
-- ============================================================================

create table if not exists public.crc_ai_calls (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  feature         text not null,
  prompt_versao   text not null,
  modelo          text not null,

  entity_type     text,
  entity_id       uuid,

  -- A SAÍDA estruturada. A entrada NÃO é guardada em texto: guardamos só a
  -- referência ao que foi usado (item 172), porque o contexto contém dado de
  -- paciente e retê-lo aqui seria cópia desnecessária.
  saida           jsonb,
  confianca       numeric(4,3),
  acao_tomada     text,

  input_tokens    integer,
  output_tokens   integer,
  custo_estimado  numeric(10,6),

  sucesso         boolean not null default true,
  erro            text,
  duracao_ms      integer,
  criado_em       timestamptz not null default now()
);

create index if not exists crc_ai_calls_custo
  on public.crc_ai_calls (organization_id, criado_em desc);

-- ============================================================================
-- 16. CONFIGURAÇÃO, FLAGS, AUDITORIA (itens 42, 74, 102, 171)
-- ============================================================================

-- Item 171: "Recall = 180 dias" vira 150 sem tocar em código.
create table if not exists public.crc_settings (
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  chave           text not null,
  valor           jsonb not null,
  atualizado_por  uuid references public.crc_users(id) on delete set null,
  atualizado_em   timestamptz not null default now(),
  primary key (organization_id, chave)
);

create table if not exists public.crc_feature_flags (
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  chave           text not null,
  ligada          boolean not null default false,
  -- Item 201: piloto por porcentagem/segmento.
  rollout         jsonb,
  atualizado_em   timestamptz not null default now(),
  primary key (organization_id, chave)
);

create table if not exists public.crc_audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  user_id         uuid references public.crc_users(id) on delete set null,
  -- 'automacao' / 'sync' / 'webhook' quando não houve humano.
  ator            text not null default 'humano',
  acao            text not null,
  entity_type     text not null,
  entity_id       uuid,
  antes           jsonb,
  depois          jsonb,
  request_id      text,
  criado_em       timestamptz not null default now()
);

create index if not exists crc_audit_entidade
  on public.crc_audit_logs (entity_type, entity_id, criado_em desc);
create index if not exists crc_audit_periodo
  on public.crc_audit_logs (organization_id, criado_em desc);

-- Item 237: toda escrita enviada ao Dental Office fica registrada.
create table if not exists public.crc_integration_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.crc_organizations(id) on delete cascade,
  integracao      text not null,
  operacao        text not null,
  direcao         text not null default 'SAIDA',
  metodo          text,
  caminho         text,
  status_http     integer,
  sucesso         boolean not null default true,
  erro            text,
  duracao_ms      integer,
  request_id      text,
  -- Sem secret, sem PII desnecessária (item 75). O que entra aqui já passou
  -- pelo mascarador.
  resumo          jsonb,
  criado_em       timestamptz not null default now()
);

create index if not exists crc_integration_logs_periodo
  on public.crc_integration_logs (integracao, criado_em desc);

-- Item 78: fila de revisão para o que falhou de vez.
create table if not exists public.crc_dead_letters (
  id           uuid primary key default gen_random_uuid(),
  organization_id uuid references public.crc_organizations(id) on delete cascade,
  origem       text not null,
  referencia   uuid,
  erro         text not null,
  payload      jsonb,
  -- PENDENTE | REPROCESSADO | DESCARTADO
  status       text not null default 'PENDENTE',
  resolvido_por uuid references public.crc_users(id) on delete set null,
  resolvido_em timestamptz,
  criado_em    timestamptz not null default now()
);

-- Item 126: inbox pattern. Webhook é gravado ANTES de ser processado.
create table if not exists public.crc_webhook_inbox (
  id             uuid primary key default gen_random_uuid(),
  provedor       text not null,
  -- Chave do provedor. É o que impede processar o mesmo webhook duas vezes.
  external_id    text not null,
  payload        jsonb not null,
  status         text not null default 'PENDENTE',
  tentativas     integer not null default 0,
  ultimo_erro    text,
  processado_em  timestamptz,
  criado_em      timestamptz not null default now(),
  unique (provedor, external_id)
);

create index if not exists crc_webhook_inbox_fila
  on public.crc_webhook_inbox (status, criado_em) where status = 'PENDENTE';

-- Item 147: visões salvas ("Faltantes da semana").
create table if not exists public.crc_saved_views (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  user_id         uuid references public.crc_users(id) on delete cascade,
  escopo          text not null,
  nome            text not null,
  filtros         jsonb not null,
  compartilhada   boolean not null default false,
  criado_em       timestamptz not null default now()
);

-- ============================================================================
-- 17. RLS — ligado em tudo, sem policy nenhuma.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'crc_organizations','crc_clinics','crc_users','crc_user_clinics',
    'crc_patients','crc_patient_tags','crc_appointments','crc_leads',
    'crc_opportunity_stages','crc_opportunities','crc_opportunity_history',
    'crc_tasks','crc_conversations','crc_messages','crc_templates',
    'crc_events','crc_automations','crc_automation_versions',
    'crc_automation_enrollments','crc_automation_logs','crc_jobs',
    'crc_sync_jobs','crc_sync_falhas','crc_sync_state',
    'crc_budgets','crc_budget_items','crc_revenue_events','crc_funnel_events',
    'crc_ai_calls','crc_settings','crc_feature_flags','crc_audit_logs',
    'crc_integration_logs','crc_dead_letters','crc_webhook_inbox',
    'crc_saved_views'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ============================================================================
-- 18. RESERVA ATÔMICA DE TRABALHO — o coração do scheduler
--
-- O item 32 do contrato pede `FOR UPDATE SKIP LOCKED`. Pela REST do Supabase
-- não dá para emitir isso: PostgREST não expõe SELECT ... FOR UPDATE. A saída
-- é uma função no banco, chamada por RPC, que reserva e trava numa transação
-- só. Dois workers concorrentes NUNCA pegam a mesma linha.
-- ============================================================================

create or replace function public.crc_reservar_jobs(
  limite integer default 10,
  lock_segundos integer default 120
)
returns setof public.crc_jobs
language plpgsql
as $$
begin
  return query
  update public.crc_jobs j
     set status = 'RODANDO',
         travado_ate = now() + make_interval(secs => lock_segundos),
         tentativas = j.tentativas + 1,
         batimento_em = now()
   where j.id in (
     select id from public.crc_jobs
      where status in ('PENDENTE', 'FALHOU')
        and run_at <= now()
        and (travado_ate is null or travado_ate < now())
        and tentativas < max_tentativas
      order by run_at
      limit limite
      for update skip locked
   )
  returning j.*;
end $$;

create or replace function public.crc_reservar_eventos(
  limite integer default 25,
  lock_segundos integer default 120
)
returns setof public.crc_events
language plpgsql
as $$
begin
  return query
  update public.crc_events e
     set status = 'PROCESSANDO',
         travado_ate = now() + make_interval(secs => lock_segundos),
         tentativas = e.tentativas + 1
   where e.id in (
     select id from public.crc_events
      where status in ('PENDENTE', 'FALHOU')
        and (travado_ate is null or travado_ate < now())
        and tentativas < 5
      order by ocorrido_em
      limit limite
      for update skip locked
   )
  returning e.*;
end $$;

create or replace function public.crc_reservar_jornadas(
  limite integer default 25,
  lock_segundos integer default 120
)
returns setof public.crc_automation_enrollments
language plpgsql
as $$
begin
  return query
  update public.crc_automation_enrollments en
     set travado_ate = now() + make_interval(secs => lock_segundos)
   where en.id in (
     select id from public.crc_automation_enrollments
      where status in ('ACTIVE', 'WAITING')
        and resume_at is not null
        and resume_at <= now()
        and (travado_ate is null or travado_ate < now())
      order by resume_at
      limit limite
      for update skip locked
   )
  returning en.*;
end $$;

-- Contador atômico de não-lidas. `nao_lidas = nao_lidas + 1` via REST exigiria
-- ler-modificar-escrever, e duas mensagens no mesmo instante perderiam uma.
create or replace function public.crc_marcar_nao_lida(
  conversa uuid,
  trecho text,
  quando timestamptz
)
returns void
language sql
as $$
  update public.crc_conversations
     set nao_lidas = nao_lidas + 1,
         ultima_mensagem_em = quando,
         ultima_mensagem_trecho = trecho,
         atualizado_em = now()
   where id = conversa;
$$;
