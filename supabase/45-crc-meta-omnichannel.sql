-- ============================================================================
-- CRC — Instagram, Messenger, comentários e Lead Ads entram no MESMO CRC.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. Idempotente: pode rodar de novo sem estrago.
--
-- ============================================================================
--  O QUE ESTE ARQUIVO NÃO FAZ, e vale dizer primeiro: ele NÃO cria uma
--  segunda Inbox, um segundo paciente, nem um segundo funil.
--
--  `crc_conversations` já tem `canal` e `contato_externo`, com
--  `unique (organization_id, canal, contato_externo)`. Era exatamente o desenho
--  necessário: `('org', 'instagram', '<IGSID>')` cabe ali sem uma coluna nova.
--  `crc_messages`, `crc_leads`, `crc_opportunities` e `crc_webhook_inbox`
--  também servem como estão.
--
--  O que falta é de quatro tipos, e só isso é criado aqui:
--
--    1. A CHAVE DA IDENTIDADE ESTAVA INCOMPLETA. `EXTERNAL_ID / 123` do Dental
--       Office e `EXTERNAL_ID / 123` do Instagram eram a MESMA linha.
--    2. NÃO HAVIA ONDE CADASTRAR UMA CONTA DA META. `crc_canais_whatsapp` é
--       do WhatsApp — a chave dela é `(provedor, identificador)` e o
--       identificador é um número.
--    3. COMENTÁRIO NÃO É MENSAGEM. Ele não tem conversa, não tem destinatário,
--       e precisa de dedupe por id de comentário.
--    4. LEAD ADS TRAZ ATRIBUIÇÃO QUE `crc_leads` NÃO GUARDAVA: campanha,
--       conjunto, anúncio, formulário.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A identidade passa a carregar o SISTEMA de origem — §10
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  O DEFEITO, e ele é do tipo que não dá alarme.
--
--  `crc_patient_identities` guardava `(tipo, valor)`. `tipo = 'EXTERNAL_ID'`
--  significava, por convenção NÃO ESCRITA, "id do paciente no Dental Office" —
--  e o Dental Office numera pacientes com inteiros pequenos: 123, 456, 1087.
--
--  O Instagram emite identificadores numéricos. O Messenger emite
--  identificadores numéricos. O Lead Ads emite identificadores numéricos.
--
--      EXTERNAL_ID / 123     ← o paciente 123 do prontuário
--      EXTERNAL_ID / 123     ← o IGSID de quem mandou um direct
--
--  A MESMA LINHA. E a resolução devolveria `UNICO`, com confiança total: do
--  ponto de vista da tabela não existe ambiguidade nenhuma — é um valor, um
--  paciente. O mecanismo de `compartilhada` nem dispara.
--
--  O resultado é o direct de um estranho entrando no prontuário comercial de
--  um paciente. Irreversível, porque a informação que separava os dois — de
--  qual sistema o número veio — nunca foi gravada.
--
--  A CORREÇÃO É NA CHAVE, e não numa validação de aplicação: `namespace` entra
--  no índice único e no índice de busca. Uma consulta que esqueça o namespace
--  passa a devolver zero linhas em vez da linha errada — falha fechada.
-- ============================================================================
--
-- POR QUE `namespace` E NÃO TIPOS NOVOS (`INSTAGRAM_IGSID`, `FACEBOOK_PSID`):
-- porque o §10 oferece as duas e esta preserva o código que já existe. Com
-- tipos novos, todo `switch` sobre `TipoDeIdentidade` — força, rótulo,
-- comparação de duplicata — passaria a ter cinco ramos novos, e cada canal
-- futuro acrescentaria um. Com namespace, a força e o rótulo consultam um
-- campo, e nada mais muda.

alter table public.crc_patient_identities
  -- VAZIO PARA TIPO GLOBAL, e é a parte que quase se erra: telefone, e-mail e
  -- CPF NÃO devem ter namespace. `11999990000` é o mesmo número em qualquer
  -- sistema, e namespeá-los quebraria o cruzamento que a tabela existe para
  -- fazer — o telefone vindo do Dental Office deixaria de casar com o telefone
  -- digitado no site.
  add column if not exists namespace text not null default '';

/*
 * O BACKFILL, e ele é a razão de o default ser vazio em vez de 'dental-office'.
 *
 * Um default de 'dental-office' marcaria também as linhas de TELEFONE e EMAIL,
 * que não têm origem nenhuma — e a busca por telefone passaria a exigir o
 * namespace errado. O default neutro mais este UPDATE dirigido acertam os dois
 * casos.
 *
 * TODA linha de EXTERNAL_ID que existe hoje VEIO do Dental Office: era a única
 * coisa que escrevia ali (`sincronizacao.ts`). Não é suposição — é o estado do
 * código antes desta migração.
 */
update public.crc_patient_identities
   set namespace = 'dental-office'
 where tipo = 'EXTERNAL_ID'
   and namespace = '';

/*
 * A CHAVE ANTIGA SAI, E A NOVA ENTRA — nesta ordem, e numa transação implícita
 * do arquivo.
 *
 * `unique (organization_id, patient_id, tipo, valor)` nasceu como CONSTRAINT
 * (declarada dentro do `create table`), e por isso o nome dela é o que o
 * Postgres gerou: `crc_patient_identities_organization_id_patient_id_tipo_va_key`.
 * Depender desse nome seria depender de um detalhe de geração; o `do $$` abaixo
 * o descobre pelas COLUNAS, que é o que se sabe de verdade.
 */
do $$
declare
  nome_da_constraint text;
begin
  select con.conname
    into nome_da_constraint
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
   where cls.relname = 'crc_patient_identities'
     and con.contype = 'u'
     -- Quatro colunas, e sem `namespace` entre elas: é a chave antiga.
     and array_length(con.conkey, 1) = 4
     and not exists (
       select 1
         from unnest(con.conkey) as k
         join pg_attribute att
           on att.attrelid = con.conrelid and att.attnum = k
        where att.attname = 'namespace'
     )
   limit 1;

  if nome_da_constraint is not null then
    execute format(
      'alter table public.crc_patient_identities drop constraint %I',
      nome_da_constraint
    );
  end if;
end
$$;

-- A CHAVE NOVA, com o namespace dentro. Um valor por tipo, por namespace, por
-- paciente — e o mesmo telefone em dois pacientes continua LEGÍTIMO (família),
-- porque o paciente faz parte da chave.
create unique index if not exists crc_identities_chave
  on public.crc_patient_identities (organization_id, patient_id, tipo, namespace, valor);

/*
 * O ÍNDICE DA BUSCA: dado este identificador, DESTE sistema, quem é?
 *
 * O antigo (`idx_crc_identities_busca`) não tinha namespace, então uma consulta
 * filtrando por ele faria varredura — e a consulta de webhook roda a cada
 * mensagem recebida. O antigo é apagado em vez de mantido: dois índices com o
 * mesmo prefixo custam escrita e não acrescentam leitura.
 */
create index if not exists idx_crc_identities_busca_ns
  on public.crc_patient_identities (organization_id, tipo, namespace, valor);

drop index if exists public.idx_crc_identities_busca;

-- ----------------------------------------------------------------------------
-- 2. As contas da Meta — §31
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  POR QUE NÃO REUSAR `crc_canais_whatsapp`.
--
--  A chave dela é `unique (provedor, identificador)`, e `identificador` é
--  documentado como "`phone_number_id` na Meta, o número no Twilio, a sessão no
--  WAHA". Uma conta da Meta tem DUAS chaves de roteamento simultâneas:
--
--      Page ID               → roteia Messenger e Lead Ads
--      Instagram account ID  → roteia direct e comentários do Instagram
--
--  E as duas apontam para a mesma credencial (o Page Access Token). Espremer
--  isso em `identificador` exigiria duas linhas com o mesmo segredo, e a
--  rotação do token teria que acertar as duas — o tipo de coisa que acerta na
--  primeira vez e erra na terceira.
--
--  A TABELA É NOVA E O PADRÃO É O MESMO: identificador externo → organização +
--  clínica, segredo cifrado com `cifrar()`/`decifrar()`, `config` para o que
--  não é secreto, `ativo` valendo na porta de entrada.
-- ============================================================================
create table if not exists public.crc_canais_meta (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null,

  -- Hoje sempre 'meta'. A coluna existe para a tabela não precisar ser
  -- renomeada no dia em que outra plataforma social entrar pelo mesmo desenho.
  provider        text not null default 'meta',

  /*
   * QUAIS PRODUTOS ESTA CONTA ATENDE.
   *
   * Uma linha, vários produtos: a mesma Página serve Messenger e Lead Ads, e a
   * conta do Instagram ligada a ela serve direct e comentários. Separar em uma
   * linha por produto multiplicaria a credencial.
   *
   * Cada elemento é 'instagram' | 'messenger' | 'lead_ads' | 'comentarios'.
   */
  produtos        text[] not null default '{}'::text[],

  /*
   * AS DUAS CHAVES DE ROTEAMENTO, EM COLUNAS SEPARADAS.
   *
   * `page_id` vem de `entry[].id` num webhook `object: "page"`.
   * `instagram_account_id` vem de `entry[].id` num webhook `object: "instagram"`.
   *
   * Nulo é legítimo: uma clínica pode ter Página sem Instagram profissional
   * ligado, ou o contrário (Instagram Login sem Página).
   */
  page_id              text,
  instagram_account_id text,

  -- Para a tela dizer de quem é o canal sem decifrar nada nem chamar a Graph.
  display_name    text not null default '',
  username        text not null default '',

  /*
   * O TOKEN, CIFRADO. Mesmo mecanismo de `crc_canais_whatsapp`.
   *
   * NUNCA vai para a UI, nunca para log, nunca para o bundle (§32). A `dica`
   * mostra começo e fim para alguém conferir visualmente que colou o token
   * certo — nunca o meio.
   */
  segredo_cifrado text,
  dica            text not null default '',

  /*
   * O QUE NÃO É SECRETO: `appId`, `appSecret`, `verifyToken`, `graphVersion`,
   * `businessId`, `humanAgentAprovado`, `loginTipo`.
   *
   * ATENÇÃO: `appSecret` É SECRETO no sentido comum da palavra, e mora aqui de
   * propósito — ele é do APLICATIVO, não do canal, e a verificação de
   * assinatura precisa dele ANTES de o corpo ser confiável. Decifrar um segredo
   * por canal para conferir uma assinatura que pode ser forjada abriria um
   * oráculo de tempo. É o mesmo desenho de `crc_canais_whatsapp.config`.
   */
  config          jsonb not null default '{}'::jsonb,

  /*
   * QUANDO O TOKEN VENCE, quando a Meta informa.
   *
   * Page Access Token de System User não vence; o de usuário vence em 60 dias.
   * Nulo significa "não sabemos", e a tela diz isso em vez de "válido" — §74.
   */
  token_expira_em timestamptz,

  /*
   * AS PERMISSÕES CONFERIDAS, com a data.
   *
   * `{"instagram_business_manage_messages": "2026-09-15", …}`. Elas existem
   * para a tela do §31 mostrar "permissões confirmadas" sem chamar a Graph a
   * cada abertura — e para o runbook poder dizer o que mudou desde a última
   * conferência.
   */
  permissoes      jsonb not null default '{}'::jsonb,

  /*
   * OS FATOS DATADOS QUE A SAÚDE MEDE — §39.
   *
   * "Conectado" nunca é declarado: ele sai destes carimbos. Ver `lerHub()` e o
   * cabeçalho de `aplicacao/hub-integracoes.ts`. Sem estas colunas, a tela
   * mostraria verde porque existe uma credencial — que é a mentira que o §74
   * proíbe.
   */
  ultimo_webhook_em   timestamptz,
  ultima_mensagem_em  timestamptz,
  ultimo_lead_em      timestamptz,
  ultimo_erro         text,
  ultimo_erro_em      timestamptz,

  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  -- A mesma FK composta do `supabase/19`: impede canal de uma organização
  -- apontando para clínica de outra.
  foreign key (organization_id, clinic_id)
    references public.crc_clinics (organization_id, id) on delete cascade
);

/*
 * OS DOIS ÍNDICES QUE FAZEM O ROTEAMENTO SER CORRETO, e não só rápido.
 *
 * Duas linhas com o mesmo `page_id` significaria um webhook com dois donos
 * possíveis — e a escolha voltaria a ser arbitrária, que é o defeito que o
 * `supabase/23` existiu para matar. O banco recusa.
 *
 * PARCIAIS, `where … is not null`: nulo é legítimo (Página sem Instagram), e em
 * Postgres dois NULL não são iguais — sem a condição o índice existiria e não
 * protegeria nada, o que é pior do que não existir, porque parece proteger.
 */
create unique index if not exists crc_canais_meta_page
  on public.crc_canais_meta (provider, page_id)
  where page_id is not null;

create unique index if not exists crc_canais_meta_ig
  on public.crc_canais_meta (provider, instagram_account_id)
  where instagram_account_id is not null;

create index if not exists idx_crc_canais_meta_org
  on public.crc_canais_meta (organization_id, clinic_id)
  where ativo;

alter table public.crc_canais_meta enable row level security;

-- ----------------------------------------------------------------------------
-- 3. Os eventos sociais — §9.2, §16
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  POR QUE `crc_webhook_inbox` NÃO BASTA, e a pergunta é justa: ela já guarda
--  todo webhook.
--
--  Porque ela é uma FILA, e o ciclo de vida dela é o oposto do que um
--  comentário precisa. Ver `marcar()` em `aplicacao/webhooks.ts`: quando o
--  envelope chega a estado terminal, o `payload` é ZERADO — de propósito, para
--  não haver um segundo lugar com PII e outra política de retenção.
--
--  Ou seja: depois de processado, `crc_webhook_inbox` não sabe mais o que o
--  comentário dizia, quem comentou, nem em qual post. E é exatamente isso que
--  três coisas precisam consultar DEPOIS:
--
--    o cooldown de private reply       "esta pessoa já recebeu nos 7 dias?"
--    a atribuição de conteúdo          "qual reel trouxe este lead?"
--    a auditoria do §63                "por que mandamos direct para ela?"
--
--  E `crc_messages` também não serve: ela exige `conversation_id not null`, e
--  um comentário não tem conversa. Criar uma conversa por comentário poluiria a
--  Inbox com threads que nunca recebem nem mandam mensagem.
--
--  UMA TABELA, E NÃO UMA POR ENDPOINT (§9.2). `event_type` discrimina; mention,
--  reply e reação futura entram como valor, não como tabela.
-- ============================================================================
create table if not exists public.crc_social_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,

  provider        text not null default 'meta',
  -- instagram | facebook
  canal           text not null,
  -- comment.created | comment.deleted | mention.created | private_reply.sent
  event_type      text not null,

  /*
   * O ID DO PROVEDOR. É ele que impede processar o mesmo comentário duas vezes.
   *
   * §34 é explícito: a dedupe é do BANCO, e não `if (!array.includes(id))`. O
   * índice único abaixo é a garantia; o código só lê o resultado dele.
   */
  external_event_id text not null,
  external_actor_id text,
  external_media_id text,
  external_comment_id text,

  /*
   * O TEXTO DO COMENTÁRIO. É público — a pessoa o escreveu num post aberto —,
   * o que muda a base legal mas não a minimização: ele é truncado na entrada e
   * entra na retenção do §64 junto com o resto.
   */
  texto           text,

  /*
   * OS DOIS RELÓGIOS — §49.
   *
   * `ocorrido_em` é quando a pessoa comentou. `recebido_em` é quando o webhook
   * chegou aqui. Eles DIVERGEM: a Meta reentrega, a fila repesca, um incidente
   * atrasa horas.
   *
   * A regra de 7 dias do private reply mede `ocorrido_em` — medir por
   * `recebido_em` faria um webhook atrasado parecer fresco, e a Meta recusaria
   * o envio com um erro que ninguém saberia explicar.
   */
  ocorrido_em     timestamptz not null,
  recebido_em     timestamptz not null default now(),

  -- O que este evento produziu no CRC. Tudo nulável: comentário que não casa
  -- regra nenhuma é evento registrado e nada mais.
  lead_id         uuid references public.crc_leads(id) on delete set null,
  patient_id      uuid references public.crc_patients(id) on delete set null,
  conversation_id uuid references public.crc_conversations(id) on delete set null,
  opportunity_id  uuid references public.crc_opportunities(id) on delete set null,
  regra_id        uuid,

  -- PENDENTE | PROCESSADO | IGNORADO | FALHOU
  processing_status text not null default 'PENDENTE',
  -- A frase do porquê. "Nenhuma regra casou", "private reply fora da janela".
  resultado       text,

  criado_em       timestamptz not null default now(),

  -- A dedupe, no banco. O escopo inclui a organização: ids de provedor são
  -- únicos globalmente, mas a fronteira de tenant não se apoia nessa promessa.
  unique (organization_id, provider, external_event_id)
);

-- A consulta do cooldown: "o que esta pessoa recebeu desta regra ultimamente?"
create index if not exists idx_crc_social_ator
  on public.crc_social_events (organization_id, external_actor_id, ocorrido_em desc);

-- A consulta da atribuição: "quais eventos este post gerou?"
create index if not exists idx_crc_social_midia
  on public.crc_social_events (organization_id, external_media_id, ocorrido_em desc);

create index if not exists idx_crc_social_periodo
  on public.crc_social_events (organization_id, clinic_id, event_type, ocorrido_em desc);

alter table public.crc_social_events enable row level security;

-- ----------------------------------------------------------------------------
-- 4. As regras de comentário — §16, §43, §66
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  O §16 PROÍBE EXPLICITAMENTE `if (texto.includes("implante"))`.
--
--  E o motivo não é elegância: é que a clínica muda de campanha toda semana. Um
--  `IMPLANTE` no código significa um deploy por campanha — e, na prática,
--  significa que a segunda campanha nunca ganha regra.
--
--  O §43 acrescenta o limite que importa: NEM TODO COMENTÁRIO É LEAD.
--  "linda doutora ❤️" não pode virar oportunidade de implante. Por isso
--  `exigir_captacao`: a regra só olha mídia marcada como captação, e marcar é
--  decisão de quem publicou.
-- ============================================================================
create table if not exists public.crc_regras_sociais (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  -- Nulo = vale para toda a organização. Mesmo desenho de `crc_autonomia`.
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,

  nome            text not null,
  -- instagram | facebook
  canal           text not null default 'instagram',
  -- comment.created | mention.created
  evento          text not null default 'comment.created',

  /*
   * AS PALAVRAS, normalizadas na GRAVAÇÃO e não na comparação.
   *
   * Sem acento, em minúsculas, sem pontuação — é o que `dominio/regras-sociais.ts`
   * faz com o comentário também. Normalizar só um dos lados faria "IMPLANTE" não
   * casar com "implante", que é o defeito mais previsível possível.
   */
  contem          text[] not null default '{}'::text[],
  -- Palavras que VETAM. "implante capilar" não é odontologia.
  nao_contem      text[] not null default '{}'::text[],

  /*
   * SÓ EM CONTEÚDO MARCADO COMO CAPTAÇÃO — §43.
   *
   * `true` é o padrão porque é o seguro: uma regra recém-criada não sai
   * respondendo comentário de post institucional.
   */
  exigir_captacao boolean not null default true,
  -- Mídias específicas. Vazio = qualquer mídia que satisfaça `exigir_captacao`.
  midias          text[] not null default '{}'::text[],

  -- O que a regra FAZ. Tudo desligado por padrão — §4.5, falhar fechado.
  criar_lead      boolean not null default false,
  criar_oportunidade boolean not null default false,
  enviar_private_reply boolean not null default false,

  -- O tipo de oportunidade a abrir. Ver `crc_opportunities.tipo`.
  tipo_oportunidade text,
  -- A intenção administrativa detectada. Ver `dominio/rotulos.ts`.
  intencao        text,

  /*
   * A COPY, versionada pelo mecanismo que já existe (§67).
   *
   * `template_id` aponta para `crc_templates` quando a clínica quer a copy
   * versionada e auditada. `copy` é o caminho curto, para a regra que nasce
   * numa tarde. Os dois nulos = regra que não manda private reply.
   */
  template_id     uuid,
  copy            text,

  /*
   * O ANTI-SPAM — §17.
   *
   * A mesma pessoa comentando dez vezes não pode receber dez directs. 168 horas
   * (7 dias) é o padrão porque coincide com a janela do private reply: dentro
   * dela, uma resposta; passada, o comentário novo é um convite novo.
   */
  cooldown_horas  integer not null default 168,

  ativa           boolean not null default false,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  constraint crc_regras_sociais_cooldown check (cooldown_horas between 0 and 8760)
);

create index if not exists idx_crc_regras_sociais_busca
  on public.crc_regras_sociais (organization_id, canal, evento)
  where ativa;

alter table public.crc_regras_sociais enable row level security;

-- ----------------------------------------------------------------------------
-- 5. A reserva do private reply — §17, §34, §35
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  POR QUE UMA TABELA DE RESERVA, E NÃO UMA CONSULTA ANTES DE ENVIAR.
--
--  A consulta tem corrida. Dois webhooks do mesmo comentário chegam juntos —
--  a Meta reentrega quando não recebe 200 rápido —, as duas execuções
--  perguntam "já mandei?", as duas leem "não", e a pessoa recebe DOIS directs
--  idênticos.
--
--  A reserva não tem corrida: `unique (organization_id, chave_reserva)` faz o
--  BANCO decidir quem ganha. Quem perde o INSERT não chama a Graph API. É o
--  mesmo desenho de `crc_messages.chave_dedupe` — "grava antes de mandar".
--
--  E A CHAVE NÃO É O ID DO COMENTÁRIO, e essa é a parte que o §17 pede com
--  cuidado: ela é `regra + ator + mídia + janela`. Dedupe por comentário
--  deixaria a mesma pessoa receber dez directs comentando dez vezes no mesmo
--  post — cada comentário tem id próprio, e cada um passaria.
-- ============================================================================
create table if not exists public.crc_private_replies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,

  regra_id        uuid references public.crc_regras_sociais(id) on delete set null,
  external_comment_id text,
  external_actor_id   text,
  external_media_id   text,

  /*
   * `<regra>:<ator>:<midia>:<janela>` — montada em
   * `aplicacao/social.ts`, e a janela é o número do bucket de cooldown.
   */
  chave_reserva   text not null,

  provider_message_id text,

  /*
   * RESERVADO | ENVIADO | FALHOU | INCERTO
   *
   * `INCERTO` é o estado do §35, e ele existe porque o POST pode ter saído sem
   * a resposta voltar. Marcar `FALHOU` faria a próxima volta reenviar, e o
   * §35 é explícito: NÃO reenviar automaticamente quando isso pode duplicar
   * efeito externo. A reserva permanece ocupada, e uma pessoa decide.
   */
  status          text not null default 'RESERVADO',
  erro            text,
  enviado_em      timestamptz,
  criado_em       timestamptz not null default now(),

  unique (organization_id, chave_reserva)
);

create index if not exists idx_crc_private_replies_ator
  on public.crc_private_replies (organization_id, external_actor_id, criado_em desc);

alter table public.crc_private_replies enable row level security;

-- ----------------------------------------------------------------------------
-- 6. Lead Ads entra em `crc_leads` — §9.3, §19
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  NÃO EXISTE "META LEAD". Existe LEAD, e ele veio da Meta.
--
--  O §9.3 é direto: não criar uma segunda entidade se `crc_leads` pode
--  representar o lead. E pode — ela já tem `origem`, os cinco UTM, `gclid`,
--  `fbclid`, `landing_page`, `chave_dedupe` e `primeira_resposta_em`.
--
--  O que falta é a hierarquia de anúncio, que o Google não tem e a Meta tem:
--  campanha → conjunto → anúncio → formulário. Sem ela a pergunta do §83
--  ("veio de qual campanha e quanto custou") não tem resposta.
-- ============================================================================

-- UM `alter table` POR COLUNA, e não uma lista separada por vírgula.
--
-- É o dialeto que `src/lib/crc/testes/schema-real.ts` lê — o leitor casa UM
-- `add column` por statement, e uma lista faria as colunas da segunda em diante
-- serem invisíveis para ele. O efeito não seria um erro: seria o banco em
-- memória RECUSAR uma coluna que existe de verdade, e todo teste que a semeia
-- falhar por um motivo que não é o dele.

-- O id do lead na Meta. A dedupe do §34: o mesmo `leadgen_id` chegando duas
-- vezes — webhook + reconciliação — não pode virar dois leads.
alter table public.crc_leads
  add column if not exists meta_lead_id text;

alter table public.crc_leads
  add column if not exists form_id text;

alter table public.crc_leads
  add column if not exists form_nome text;

alter table public.crc_leads
  add column if not exists page_id text;

alter table public.crc_leads
  add column if not exists ad_id text;

alter table public.crc_leads
  add column if not exists ad_nome text;

alter table public.crc_leads
  add column if not exists adset_id text;

alter table public.crc_leads
  add column if not exists adset_nome text;

alter table public.crc_leads
  add column if not exists campaign_id text;

alter table public.crc_leads
  add column if not exists campaign_nome text;

-- instagram | facebook | audience_network. Vem do campo `platform` da Meta.
alter table public.crc_leads
  add column if not exists plataforma text;

/*
 * AS RESPOSTAS DO FORMULÁRIO QUE NÃO CABEM EM COLUNA — §18.2.
 *
 * Instant Forms mudam: hoje pergunta "qual tratamento?", amanhã "melhor
 * horário para ligar?". Criar coluna por pergunta é impossível; descartar o que
 * não conhecemos é perder justamente o que a clínica pediu para perguntar.
 *
 * O importador NUNCA quebra por campo desconhecido: ele o guarda aqui.
 */
alter table public.crc_leads
  add column if not exists campos jsonb not null default '{}'::jsonb;

/*
 * QUANDO A PESSOA ENVIOU O FORMULÁRIO — §49.
 *
 * `criado_em` é quando a linha nasceu AQUI. Os dois divergem quando a
 * reconciliação importa um lead de ontem, e o speed-to-lead precisa do
 * primeiro: medir por `criado_em` mostraria "respondido em 12 segundos" para um
 * lead de 14 horas atrás.
 */
alter table public.crc_leads
  add column if not exists externo_criado_em timestamptz;

/*
 * ONDE A CONVERSA CONTINUOU — §69.
 *
 * Um lead começa no Instagram e termina no WhatsApp. `origem` é o canal de
 * AQUISIÇÃO e não pode ser sobrescrito; este campo guarda o de CONVERSÃO. Sem
 * os dois separados, todo relatório credita o WhatsApp e a conclusão é "corta o
 * Instagram" — no mês seguinte ninguém chega ao WhatsApp.
 */
alter table public.crc_leads
  add column if not exists canal_conversao text;

/*
 * A DEDUPE DO LEAD DA META, no banco.
 *
 * PARCIAL porque a imensa maioria dos leads não vem da Meta, e `null` não
 * participa de índice único em Postgres de qualquer forma — declarar a condição
 * deixa isso explícito em vez de depender do comportamento.
 */
create unique index if not exists crc_leads_meta_lead
  on public.crc_leads (organization_id, meta_lead_id)
  where meta_lead_id is not null;

-- O relatório do §40: leads por campanha, por período.
create index if not exists idx_crc_leads_campanha
  on public.crc_leads (organization_id, campaign_id, criado_em desc)
  where campaign_id is not null;

-- ----------------------------------------------------------------------------
-- 7. A conversa ganha o APELIDO do perfil — §24
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  UM IGSID TEM DEZESSETE DÍGITOS, e a Inbox mostrava `contato_externo` para
--  toda conversa sem paciente vinculado.
--
--  Sem apelido, a lista de conversas do Instagram é uma coluna de números de
--  dezessete dígitos — e o §24 proíbe isso: "nunca exibir identificadores Meta
--  gigantes como UX principal".
--
--  POR QUE NÃO USAR O APELIDO COMO CHAVE: porque username é editável e
--  reaproveitável. Ver o cabeçalho de `dominio/canais.ts`. Ele é RÓTULO —
--  atualizado a cada mensagem, e nunca consultado para casar nada.
-- ============================================================================

alter table public.crc_conversations
  add column if not exists apelido_externo text;

-- ----------------------------------------------------------------------------
-- 8. A mensagem separa OCORRÊNCIA de INGESTÃO, e marca o histórico — §48, §49
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  O §48 CARREGA A REGRA MAIS FÁCIL DE ERRAR DE TODO O PROMPT.
--
--  "Backfill não pode mandar 'Oi, vi sua mensagem' para conversa de seis meses
--  atrás."
--
--  `receberMensagem()` faz três coisas ao gravar: incrementa `nao_lidas`,
--  reabre a conversa, e emite `message.received` — que é o gatilho da
--  automação e da IA. Importar seis meses de histórico por esse caminho
--  produziria centenas de eventos `message.received` com data antiga, e o motor
--  responderia a todos.
--
--  A COLUNA É O QUE PERMITE O CAMINHO SER O MESMO. Sem ela, o backfill
--  precisaria de um segundo caminho de gravação — e um segundo caminho é uma
--  segunda chance de divergir do primeiro.
-- ============================================================================

alter table public.crc_messages
  add column if not exists historico_importado boolean not null default false;

/*
 * QUANDO ESTA LINHA NASCEU AQUI.
 *
 * `criado_em` guarda o instante da MENSAGEM (`receberMensagem` escreve
 * `recebidaEm` nela), e é o certo: a Inbox ordena pelo que o paciente vê. Mas
 * isso deixou o sistema sem saber a latência da própria ingestão — e é ela que
 * o §61 mede como `meta_webhook_lag_ms`.
 */
alter table public.crc_messages
  add column if not exists recebido_em timestamptz;

-- O backfill não aparece na contagem de "mensagens novas" nem no lag.
create index if not exists idx_crc_messages_historico
  on public.crc_messages (organization_id, conversation_id)
  where historico_importado;

-- ----------------------------------------------------------------------------
-- 9. Autonomia POR CANAL — §27
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  A TABELA JÁ EXISTE, E O §9 MANDA CONFERIR ANTES DE CRIAR.
--
--  `crc_autonomia` dá nível por `(organização, clínica, domínio)`. O que falta
--  é o canal: a clínica pode querer a IA respondendo WhatsApp sozinha e apenas
--  SUGERINDO no Instagram — onde a conta é a mesma que publica, e um erro é
--  público.
--
--  A COLUNA ENTRA COM DEFAULT VAZIO, e vazio significa "vale para todos os
--  canais". As linhas que existem hoje continuam valendo exatamente como
--  valiam, e o cálculo passa a ser:
--
--      autonomia_efetiva = min(teto_global, domínio, canal)
--
--  É a mesma conta do `podeAgir()`, com um termo a mais. O canal só pode
--  ABAIXAR — nunca subir acima do teto. Ver `dominio/autonomia.ts`.
-- ============================================================================

alter table public.crc_autonomia
  add column if not exists canal text not null default '';

/*
 * OS ÍNDICES ÚNICOS PASSAM A INCLUIR O CANAL.
 *
 * Os antigos são apagados DEPOIS de os novos existirem — nesta ordem, para que
 * nunca haja um instante sem proteção. E continuam sendo DOIS, pela mesma lição
 * do `supabase/23` citada no `30`: em Postgres dois NULL não são iguais, então
 * um índice com `clinic_id` nulável deixaria passar quantos padrões de
 * organização alguém quisesse criar.
 */
create unique index if not exists crc_autonomia_por_clinica_canal
  on public.crc_autonomia (organization_id, clinic_id, dominio, canal)
  where clinic_id is not null;

create unique index if not exists crc_autonomia_padrao_da_org_canal
  on public.crc_autonomia (organization_id, dominio, canal)
  where clinic_id is null;

drop index if exists public.crc_autonomia_por_clinica;
drop index if exists public.crc_autonomia_padrao_da_org;

-- ----------------------------------------------------------------------------
-- 10. A atribuição de conteúdo social — §19
-- ----------------------------------------------------------------------------
--
-- `crc_attribution_events` (supabase/30) já modela a CADEIA: ação → resposta →
-- consulta → compareceu → produção, com `canal` e `origem`. Ela serve como
-- está: `canal = 'instagram'` e `origem = 'reel:<media_id>'` cabem sem coluna
-- nova, e `atribuirReceita()` em `dominio/atribuicao.ts` já pesa 40/20/40 por
-- canal.
--
-- O QUE FALTAVA ERA O ÍNDICE para a pergunta nova: "quanto este post rendeu?".
-- Sem ele, a resposta é uma varredura da tabela inteira.

create index if not exists idx_crc_attribution_origem
  on public.crc_attribution_events (organization_id, canal, origem, ocorrido_em desc)
  where origem is not null;

-- ----------------------------------------------------------------------------
-- 11. O cursor da reconciliação de Lead Ads — §18.1, §37
-- ----------------------------------------------------------------------------
--
-- NADA A CRIAR. `crc_sync_state` (supabase/02, com clínica desde o 23) já é
-- `(organization_id, clinic_id, recurso) → cursor + last_successful_sync +
-- sync_status`. O recurso passa a aceitar `meta_lead_ads`, e o cursor guarda o
-- `created_time` da última página lida.
--
-- Registrar isto em comentário, e não em tabela, é o ponto: o §81 proíbe
-- "tabela para cada endpoint", e a reconciliação de leads é um job de
-- sincronização como os outros.

-- ----------------------------------------------------------------------------
-- Privilegios
-- ----------------------------------------------------------------------------
--
-- POR QUE A MIGRACAO CONCEDE, em vez de confiar no default. E a mesma razao do
-- `supabase/23`, e este arquivo a descobriu de novo do jeito caro:
--
-- Tabela criada DEPOIS dos `grant` de instalacao nasce sem privilegio para
-- `service_role` — e o app inteiro fala com o banco por ele. O sintoma e
-- `permission denied for table crc_canais_meta`, e ele aparece so quando alguem
-- exercita o caminho novo.
--
-- No caso deste arquivo, o primeiro a exercitar foi o `limparTudo()` dos testes
-- de integracao: ele monta a lista de tabelas pelo CATALOGO, entao as quatro
-- tabelas novas entraram no `truncate` automaticamente e o TRUNCATE inteiro
-- passou a falhar. Cem testes que nao tinham nada a ver com a Meta reprovaram
-- de uma vez.
--
-- No Supabase o `alter default privileges` geralmente cobre isso. "Geralmente"
-- nao e bom o bastante para uma migracao aplicada a mao: repetir o grant e
-- idempotente e remove a dependencia de como a instalacao foi configurada.
do $privilegios$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant all on all functions in schema public to service_role';
  end if;

  -- `anon` so le, e so o que a RLS deixar. E o papel do cliente nao
  -- autenticado; dar escrita a ele seria dar escrita a internet.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on all tables in schema public to anon';
  end if;
end $privilegios$;

-- ----------------------------------------------------------------------------
-- O registro
-- ----------------------------------------------------------------------------

insert into public.crc_schema_migrations (nome, presumido)
values ('45-crc-meta-omnichannel.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();
