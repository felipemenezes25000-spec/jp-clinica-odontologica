-- ============================================================================
-- CRC — o tenant passa a vir da CONEXÃO, e não da primeira clínica cadastrada.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão.
--
-- O DEFEITO, e ele é o mais sensível de todos os que a auditoria levantou.
--
-- `resolverEscopo()`, no processamento do webhook, fazia isto:
--
--     selecionarUm("crc_clinics", { ativa = true }, ordenado por criado_em)
--
-- Ou seja: TODA mensagem recebida era atribuída à primeira clínica cadastrada,
-- independentemente de para qual número ela foi enviada. Com uma organização,
-- correto por acidente. Com duas:
--
--     paciente da Clínica B manda mensagem
--       ↓
--     o webhook chega
--       ↓
--     escopo = primeira clínica ativa = Clínica A
--       ↓
--     a mensagem entra na conversa, no paciente e no histórico DA CLÍNICA A
--
-- Num sistema de saúde, isso não é um defeito funcional: é dado de paciente
-- atravessando a fronteira de uma organização para outra. É o tipo de borda que
-- precisa ser impossível por construção — e o banco já fazia a parte dele, com
-- RLS e chaves estrangeiras compostas (`supabase/19`). Quem decidia errado era
-- a camada de cima.
--
-- A INFORMAÇÃO SEMPRE ESTEVE NO PAYLOAD. A Meta manda `phone_number_id` em todo
-- webhook; o Twilio manda o número que RECEBEU; o WAHA identifica a sessão.
-- Nenhum dos três exige adivinhação.
--
-- ESTA TABELA É A TRADUÇÃO: identificador do provedor → organização + clínica.
-- ============================================================================

create table if not exists public.crc_canais_whatsapp (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null,

  -- 'meta_cloud' | 'twilio' | 'waha'
  provedor        text not null,

  /*
   * O IDENTIFICADOR QUE O PROVEDOR MANDA NO WEBHOOK.
   *
   *   meta_cloud → `phone_number_id` (o id do número, não o número)
   *   twilio     → o número que recebeu, em E.164 sem '+'
   *   waha       → o nome da sessão
   *
   * É a CHAVE DE ROTEAMENTO. Guardar o número "bonito" aqui seria mais legível
   * e erraria: a Meta manda o id, não o número, e casar por número exigiria uma
   * segunda tradução que pode divergir.
   */
  identificador   text not null,

  -- Para a tela mostrar de quem é o canal sem decifrar nada.
  rotulo          text not null default '',

  /*
   * AS CREDENCIAIS, CIFRADAS, POR ORGANIZAÇÃO.
   *
   * Hoje elas vivem em variáveis de ambiente — o que significa uma conta de
   * WhatsApp para a INSTALAÇÃO inteira. Serve para a JP; não serve para
   * Clínica A → conta A, Clínica B → conta B.
   *
   * O padrão é o mesmo de `crc_ai_credentials`: `cifrar()`/`decifrar()` com a
   * chave do ambiente, e uma `dica` com começo e fim para conferência visual.
   * Nunca o meio.
   *
   * NULO É VÁLIDO, e é o caminho de migração: canal cadastrado sem credencial
   * cai no ambiente, que é o comportamento de hoje. Ninguém precisa recadastrar
   * nada para o roteamento passar a funcionar.
   */
  segredo_cifrado text,
  dica            text not null default '',
  -- Dados não secretos do canal: business account id, from do Twilio, url do
  -- WAHA. Ficam separados do segredo porque não precisam ser decifrados.
  config          jsonb not null default '{}'::jsonb,

  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  /*
   * O ÍNDICE QUE FAZ O ROTEAMENTO SER CORRETO, e não só rápido.
   *
   * Dois canais com o mesmo `(provedor, identificador)` significaria um webhook
   * com dois donos possíveis — e a escolha voltaria a ser arbitrária, que é
   * exatamente o defeito que esta tabela existe para matar. O banco recusa.
   */
  unique (provedor, identificador),

  -- A mesma FK composta do `supabase/19`: impede canal de uma organização
  -- apontando para clínica de outra.
  foreign key (organization_id, clinic_id)
    references public.crc_clinics (organization_id, id) on delete cascade
);

-- A busca do webhook: por provedor e identificador, só os ativos.
create index if not exists idx_crc_canais_whatsapp_roteamento
  on public.crc_canais_whatsapp (provedor, identificador)
  where ativo;

create index if not exists idx_crc_canais_whatsapp_org
  on public.crc_canais_whatsapp (organization_id);

alter table public.crc_canais_whatsapp enable row level security;

/*
 * A MESMA COISA PARA O DENTAL OFFICE.
 *
 * `DENTAL_OFFICE_BASE_URL`, `_CLIENT_ID` e `_SECRET` são do ambiente, com cache
 * global de token. Uma instalação, uma conta. Para
 * Clínica A → Dental Office A e Clínica B → Dental Office B, não funciona.
 *
 * Mesma regra de migração: linha ausente cai no ambiente.
 */
create table if not exists public.crc_integracoes_clinica (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null,

  -- 'dental_office'
  sistema         text not null,
  base_url        text not null default '',
  client_id       text not null default '',
  segredo_cifrado text,
  dica            text not null default '',
  config          jsonb not null default '{}'::jsonb,

  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  unique (organization_id, clinic_id, sistema),

  foreign key (organization_id, clinic_id)
    references public.crc_clinics (organization_id, id) on delete cascade
);

alter table public.crc_integracoes_clinica enable row level security;

/*
 * O CURSOR DE SINCRONIZAÇÃO PASSA A TER CLÍNICA.
 *
 * `crc_sync_state` tem chave `(organization_id, recurso)`. Com duas unidades da
 * mesma organização, as duas compartilham o cursor de `agendamentos`: a
 * primeira a sincronizar avança o cursor, e a segunda pede "o que mudou desde
 * então" — e recebe vazio. A agenda da segunda unidade simplesmente para de
 * atualizar, sem erro nenhum.
 *
 * A COLUNA NASCE NULA e a chave antiga continua valendo para ela. É o que
 * permite aplicar isto sem reprocessar a base: as linhas existentes seguem
 * sendo o cursor "da organização", e as novas, por clínica.
 */
alter table public.crc_sync_state
  add column if not exists clinic_id uuid;

-- A unicidade real passa a considerar a clínica. `coalesce` porque a coluna é
-- nula nas linhas antigas, e dois nulos não são iguais entre si no Postgres —
-- sem isso, a constraint deixaria passar duplicata justamente nas linhas legadas.
create unique index if not exists idx_crc_sync_state_por_clinica
  on public.crc_sync_state (
    organization_id,
    recurso,
    coalesce(clinic_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
