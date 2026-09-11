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

/*
 * E A CHAVE PRIMÁRIA ANTIGA PRECISA SAIR, senão nada disso vale.
 *
 * ISTO QUASE PASSOU DESPERCEBIDO. O índice único acima existe e está certo — e
 * sozinho não muda nada, porque `crc_sync_state_pkey` continua sendo
 * `(organization_id, recurso)` e continua recusando a segunda clínica. O teste
 * de integração é que mostrou: duas linhas, e a segunda batia na chave
 * primária.
 *
 * É a lição de sempre com `alter table`: acrescentar uma restrição nova não
 * remove a antiga, e a antiga é que estava errada.
 *
 * A NOVA PK INCLUI A CLÍNICA e usa `coalesce`, pelo mesmo motivo do índice: as
 * linhas legadas têm `clinic_id` nulo, e uma PK com coluna nula seria recusada
 * pelo Postgres. Uma coluna GERADA resolve os dois problemas de uma vez — ela é
 * `not null` por construção e a PK pode usá-la.
 */
alter table public.crc_sync_state
  add column if not exists clinic_key uuid
  generated always as (coalesce(clinic_id, '00000000-0000-0000-0000-000000000000'::uuid)) stored;

alter table public.crc_sync_state
  drop constraint if exists crc_sync_state_pkey;

do $pk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crc_sync_state_pk_por_clinica'
  ) then
    alter table public.crc_sync_state
      add constraint crc_sync_state_pk_por_clinica
      primary key (organization_id, recurso, clinic_key);
  end if;
end $pk$;

-- O índice acima vira redundante com a PK nova; deixá-lo seria um segundo
-- índice mantendo a mesma garantia, escrito a cada gravação por nada.
drop index if exists public.idx_crc_sync_state_por_clinica;

-- ----------------------------------------------------------------------------
-- Tokens de MCP, por organização
-- ----------------------------------------------------------------------------
--
-- O MCP autentica por `CRC_MCP_TOKEN`, uma variável de ambiente. UM token para
-- a instalação inteira significa:
--
--   não dá para dar acesso à Clínica A sem dar à B;
--   não dá para revogar o de uma sem trocar o de todas;
--   não há validade, não há escopo, e não há registro de quem usou.
--
-- O TOKEN NÃO É GUARDADO, só o hash — pelo mesmo motivo que senha não é. Quem
-- perde o token gera outro; ninguém, nem com acesso ao banco, consegue ler o
-- que foi entregue ao cliente.
create table if not exists public.crc_mcp_tokens (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,

  -- Como a pessoa chama este token: "Claude do Dr. João", "n8n da recepção".
  apelido         text not null,
  -- sha-256 do token inteiro. A busca é por ele.
  token_hash      text not null unique,
  -- Primeiros e últimos caracteres, para conferência visual. Nunca o meio.
  dica            text not null default '',

  /*
   * ESCRITA POR TOKEN, e não por instalação.
   *
   * `CRC_MCP_ESCRITA=1` liga escrita para todo mundo que tem o token. Aqui, um
   * token de leitura para o assistente do dentista convive com um de escrita
   * para a automação da recepção — que é o desenho que faz sentido.
   */
  permite_escrita boolean not null default false,

  expira_em       timestamptz,
  revogado_em     timestamptz,
  ultimo_uso_em   timestamptz,
  criado_por      uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now()
);

create index if not exists idx_crc_mcp_tokens_org
  on public.crc_mcp_tokens (organization_id)
  where revogado_em is null;

alter table public.crc_mcp_tokens enable row level security;

-- ----------------------------------------------------------------------------
-- Privilégios
-- ----------------------------------------------------------------------------
--
-- POR QUE A MIGRAÇÃO CONCEDE, em vez de confiar no default.
--
-- Tabela criada DEPOIS dos `grant` de instalação nasce sem privilégio para
-- `service_role` — e o app inteiro fala com o banco por ela. O sintoma é
-- `permission denied`, e ele aparece só quando alguém exercita o caminho novo,
-- que costuma ser em produção.
--
-- No Supabase o `alter default privileges` geralmente cobre isso. "Geralmente"
-- não é bom o bastante para uma migração aplicada à mão: repetir o grant é
-- idempotente e remove a dependência de como a instalação foi configurada.
do $privilegios$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant all on all functions in schema public to service_role';
  end if;

  -- `anon` só lê, e só o que a RLS deixar. É o papel do cliente não
  -- autenticado; dar escrita a ele seria dar escrita à internet.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on all tables in schema public to anon';
  end if;
end $privilegios$;
