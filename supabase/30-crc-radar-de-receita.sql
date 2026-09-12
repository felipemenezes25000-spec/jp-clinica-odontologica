-- ============================================================================
-- CRC — o Radar de Receita, a atribuição, a autonomia e a timeline da IA.
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
-- ============================================================================
--
--  A DECISÃO QUE GOVERNA ESTA MIGRATION, e ela contraria a letra do pedido.
--
--  O Prompt Mestre pede uma tabela nova, `crc_revenue_opportunities`, com
--  patient_id, tipo, valor, score, motivo, próxima ação e estado.
--
--  O CRC JÁ TEM ESSA TABELA. Chama-se `crc_opportunities`, e ela já carrega
--  tenant, clínica, paciente, tipo, valor potencial, score COM os fatores que
--  o formaram, próxima ação, motivo, dedupe por índice parcial e histórico de
--  etapa em tabela separada. Trinta e poucos arquivos leem dela; o Funil, a
--  fila do dia e as jornadas são construídos em cima dela.
--
--  Criar a segunda tabela produziria exatamente o que a REGRA ARQUITETURAL
--  ABSOLUTA do mesmo documento proíbe: dois cadastros de oportunidade, dois
--  lugares para dedupe, duas respostas para "quanto está parado no funil" — o
--  "vinte projetos colados" com outro nome.
--
--  ENTÃO O RADAR ESTENDE A LINHA QUE JÁ EXISTE. O que a tabela não sabia
--  responder — e são cinco perguntas de verdade — vira coluna:
--
--    de ONDE isto veio          source_type / source_id
--    QUANTO vale de fato        confirmed_value  (≠ potential_value)
--    QUAL A CHANCE              probability / confidence
--    QUÃO URGENTE               urgency / impact / expires_at
--    o que ACONTECEU no fim     converted_at / lost_at / dismissed_em
--
--  A diferença está documentada em `docs/crc/RADAR-DE-RECEITA.md`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O Radar, dentro da oportunidade que já existe
-- ----------------------------------------------------------------------------

-- DE ONDE VEIO. Hoje `origem` é texto livre e mistura duas coisas: o canal que
-- trouxe a pessoa ("instagram") e o fato que gerou a oportunidade (a consulta
-- 2001 cancelada). O Radar precisa do segundo para poder voltar à fonte.
alter table public.crc_opportunities
  add column if not exists source_type text;

alter table public.crc_opportunities
  add column if not exists source_id text;

-- QUANTO VALE, DE VERDADE.
--
-- `potential_value` é estimativa: o valor do orçamento parado, a média do
-- procedimento. `confirmed_value` só é preenchido quando existe um evento
-- financeiro confiável. Os dois NUNCA somam no mesmo número — é a mesma regra
-- que `crc_revenue_events.natureza` já sustenta, agora na linha da
-- oportunidade, para a tela não precisar de um join para dizer a verdade.
alter table public.crc_opportunities
  add column if not exists confirmed_value numeric(12,2);

/*
 * PROBABILIDADE E CONFIANÇA SÃO COISAS DIFERENTES, e confundir as duas é o erro
 * clássico de painel de previsão.
 *
 *   probability  chance de esta oportunidade virar dinheiro.  0..1
 *   confidence   quanto acreditamos na PRÓPRIA probabilidade. 0..1
 *
 * Uma oportunidade de recall com 12% de chance medida sobre 4.000 casos tem
 * probabilidade baixa e confiança alta. Uma de implante com 60% estimada sobre
 * três casos tem probabilidade alta e confiança baixa. Somar as duas num
 * "score de 0 a 100" apaga a diferença — e é a segunda que decide se o número
 * pode virar decisão automática.
 */
alter table public.crc_opportunities
  add column if not exists probability numeric(4,3);

alter table public.crc_opportunities
  add column if not exists confidence numeric(4,3);

-- URGÊNCIA e IMPACTO, 0..100, guardados separados do score final.
--
-- O score é uma combinação, e combinação não se desfaz depois. Guardar as
-- parcelas permite a tela responder "por que ela está em primeiro" com as
-- mesmas parcelas que a ordenaram — e permite mudar a fórmula sem perder a
-- explicação das linhas antigas.
alter table public.crc_opportunities
  add column if not exists urgency integer;

alter table public.crc_opportunities
  add column if not exists impact integer;

/*
 * A VERSÃO DA FÓRMULA. Sem ela, mudar o peso de um fator reescreve o passado:
 * a comparação "o score médio caiu" vira ruído da própria mudança.
 *
 * `priority_fatores` (de `supabase/02`) continua guardando as parcelas em
 * jsonb. `score_version` diz QUAL FÓRMULA as produziu.
 */
alter table public.crc_opportunities
  add column if not exists score_version text;

-- A EVIDÊNCIA. O que foi lido para chegar aqui: a consulta que faltou, o
-- orçamento parado, a data da última visita. É o que a tela mostra quando
-- alguém discorda do Radar — e discordar com o dado na frente é como o critério
-- melhora.
alter table public.crc_opportunities
  add column if not exists evidence jsonb not null default '[]'::jsonb;

/*
 * `next_best_action` É UM CÓDIGO, e `next_action` continua sendo texto humano.
 *
 * São dois destinatários. A recepcionista lê "Ligar para confirmar o horário de
 * quinta"; o motor precisa de `OFFER_SLOTS` para saber qual ferramenta chamar.
 * Guardar só o texto obrigaria o motor a interpretar português; guardar só o
 * código obrigaria a tela a traduzir de volta e perder o detalhe.
 */
alter table public.crc_opportunities
  add column if not exists next_best_action text;

-- Quem é o dono: uma PESSOA (assigned_to já existe) ou a AUTOMAÇÃO. A coluna
-- separa "ninguém pegou" de "a IA está cuidando" — dois estados que a tela
-- precisa desenhar diferente, e que `assigned_to is null` juntava num só.
alter table public.crc_opportunities
  add column if not exists owner_type text;

/*
 * OS TRÊS DESFECHOS, COM DATA. `fechada_em` já existe e diz QUANDO fechou;
 * não diz COMO. `lost_reason` diz o motivo quando alguém preenche.
 *
 * Estas três colunas existem porque o modelo de valor (§9) precisa juntar
 * "ação do CRC → consulta → produção" por data, e um `fechada_em` que tanto
 * pode ser ganho quanto perda não serve de âncora para nada.
 */
alter table public.crc_opportunities
  add column if not exists converted_at timestamptz;

alter table public.crc_opportunities
  add column if not exists lost_at timestamptz;

-- Descartada por uma PESSOA: "esse aqui não, eu conheço o caso". Não é perda —
-- é o Radar estando errado, e precisa ser contado separado para que a taxa de
-- descarte seja visível. Radar que erra muito é desligado com razão.
alter table public.crc_opportunities
  add column if not exists dismissed_em timestamptz;

-- QUANDO DEIXA DE FAZER SENTIDO. Um buraco de agenda de amanhã às 14h expira
-- amanhã às 14h. Sem isto, oportunidades vencidas continuam ocupando o topo da
-- fila para sempre, e a fila deixa de ser confiável.
alter table public.crc_opportunities
  add column if not exists expires_at timestamptz;

-- 'PACIENTE' | 'HUMANO' | null. Separa as duas esperas, porque as ações são
-- opostas: esperando o paciente, não se faz nada; esperando um humano, alguém
-- precisa ser cutucado.
alter table public.crc_opportunities
  add column if not exists aguardando text;

-- Quando a primeira ação de verdade saiu (mensagem enviada, tarefa criada).
-- É o que separa DETECTED de IN_ACTION, e é o começo da cadeia de atribuição.
alter table public.crc_opportunities
  add column if not exists acionada_em timestamptz;

/*
 * O ÍNDICE DA FILA DO RADAR.
 *
 * `crc_opportunities_fila` (de `supabase/02`) já ordena por score dentro da
 * organização. Este acrescenta a clínica, porque a partir daqui a pergunta é
 * sempre "o radar DESTA unidade" — e num tenant com três clínicas o índice
 * antigo obrigaria a ler as três para mostrar uma.
 */
create index if not exists idx_crc_opportunities_radar
  on public.crc_opportunities (organization_id, clinic_id, priority_score desc, criado_em)
  where fechada_em is null and dismissed_em is null;

-- A varredura de expiração pergunta "quais já venceram e ainda estão abertas".
create index if not exists idx_crc_opportunities_expiram
  on public.crc_opportunities (expires_at)
  where expires_at is not null and fechada_em is null;

-- ----------------------------------------------------------------------------
-- 2. A cadeia de atribuição
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  POR QUE UMA TABELA NOVA AQUI, se `crc_revenue_events` já guarda valor.
--
--  Porque são perguntas diferentes. `crc_revenue_events` responde QUANTO:
--  uma linha, um valor, potencial ou confirmado. A atribuição responde POR QUE
--  ESSE DINHEIRO APARECEU — e isso é uma CADEIA, não um valor:
--
--      ação do CRC → paciente respondeu → consulta criada → compareceu → produção
--
--  Cada elo é um fato datado, com o elo anterior apontado. Espremer a cadeia
--  dentro da tabela de valor daria uma linha com cinco datas nuláveis, e a
--  primeira pergunta séria — "quantas ações viraram resposta?" — não teria
--  denominador, porque a ação que não virou nada nunca criaria linha.
--
--  A CONFIANÇA É PARTE DO DADO, e é o que impede o painel de mentir. Um
--  agendamento que veio pela nossa mensagem no mesmo dia é CONFIRMADO. O que
--  apareceu três dias depois, sem resposta, é PROVAVEL. O que a clínica marcou
--  por telefone sem nos contar é DESCONHECIDO — e precisa poder ser contado
--  como desconhecido, em vez de virar crédito nosso por omissão.
-- ============================================================================
create table if not exists public.crc_attribution_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete cascade,
  opportunity_id  uuid references public.crc_opportunities(id) on delete set null,

  -- ACAO | RESPOSTA | CONSULTA_CRIADA | COMPARECEU | PRODUCAO | PERDA
  elo             text not null,

  -- O elo anterior da mesma cadeia. Nulo no primeiro.
  anterior_id     uuid references public.crc_attribution_events(id) on delete set null,

  -- 'whatsapp' | 'ligacao' | 'campanha' | 'recall' | 'indicacao' | 'anuncio'…
  canal           text,
  -- O detalhe: qual campanha, qual jornada, qual anúncio.
  origem          text,

  -- Só no elo PRODUCAO. Nos demais é nulo — um elo de resposta não tem valor,
  -- e preencher zero faria a soma parecer completa quando não é.
  valor           numeric(12,2),

  -- CONFIRMADO | PROVAVEL | DESCONHECIDO
  confianca       text not null default 'DESCONHECIDO',

  ocorrido_em     timestamptz not null default now(),
  criado_em       timestamptz not null default now(),

  -- A mesma disciplina do resto do CRC: o elo é reprocessável.
  chave_dedupe    text
);

create unique index if not exists crc_attribution_dedupe
  on public.crc_attribution_events (organization_id, chave_dedupe)
  where chave_dedupe is not null;

create index if not exists idx_crc_attribution_oportunidade
  on public.crc_attribution_events (opportunity_id, ocorrido_em);

create index if not exists idx_crc_attribution_periodo
  on public.crc_attribution_events (organization_id, clinic_id, elo, ocorrido_em desc);

-- ----------------------------------------------------------------------------
-- 3. A timeline operacional da IA
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  "O QUE A IA ESTÁ FAZENDO AGORA" precisa de uma tabela própria, e o motivo
--  não é a tela — é que HOJE a resposta está espalhada em cinco lugares:
--
--    crc_ai_runs        o turno do agente          (só quando houve modelo)
--    crc_ai_spans       as ferramentas do turno    (técnico demais)
--    crc_automation_logs  o passo da jornada       (por inscrição)
--    crc_audit_logs     quem mudou o quê           (só escrita)
--    crc_events         o fato do mundo            (não é ação nossa)
--
--  Nenhum deles responde "o que o sistema fez pela clínica nos últimos dez
--  minutos", porque nenhum é sobre ISSO. Um `union all` de cinco tabelas com
--  formatos diferentes, ordenado por data, numa tela que atualiza sozinha, é
--  uma consulta que fica cara exatamente quando a clínica está movimentada.
--
--  ESTA TABELA É A NARRATIVA, e é escrita de propósito por quem age. Ela não
--  substitui a auditoria: `crc_audit_logs` continua sendo a prova, com hash e
--  ator. Esta é a versão legível, e pode ser podada sem perder prova nenhuma.
-- ============================================================================
create table if not exists public.crc_ai_activity (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,
  opportunity_id  uuid references public.crc_opportunities(id) on delete set null,
  conversation_id uuid references public.crc_conversations(id) on delete set null,

  -- DETECTOU | AVALIOU | ESCOLHEU | ENVIOU | AGENDOU | ESCALOU | BLOQUEOU |
  -- APRENDEU | ENCERROU
  activity_type   text not null,

  -- Uma linha, em português, para a pessoa que está lendo a tela.
  title           text not null,
  summary         text,

  -- PLANEJADA | EM_ANDAMENTO | CONCLUIDA | BLOQUEADA | AGUARDANDO_APROVACAO |
  -- FALHOU
  status          text not null default 'CONCLUIDA',

  -- Por quê. Vazio aqui significa que quem escreveu não soube explicar, e isso
  -- é uma informação sobre o código, não sobre o caso.
  reason          text,
  confidence      numeric(4,3),

  -- 'automacao' | 'ia' | 'humano' | 'sync' — quem produziu o passo.
  source          text not null default 'automacao',
  -- O turno do agente, quando houve um. Liga a narrativa ao traço técnico.
  run_id          uuid,

  criado_em       timestamptz not null default now(),
  completed_at    timestamptz,

  chave_dedupe    text
);

create unique index if not exists crc_ai_activity_dedupe
  on public.crc_ai_activity (organization_id, chave_dedupe)
  where chave_dedupe is not null;

-- A tela é sempre "os últimos N desta clínica". É o único índice que ela usa.
create index if not exists idx_crc_ai_activity_recente
  on public.crc_ai_activity (organization_id, clinic_id, criado_em desc);

create index if not exists idx_crc_ai_activity_paciente
  on public.crc_ai_activity (patient_id, criado_em desc);

-- ----------------------------------------------------------------------------
-- 4. O Centro de Autonomia
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  AS FLAGS NÃO BASTAM, e o motivo é que elas são globais e binárias.
--
--  Hoje `ai_agente_envio` liga o envio — para recall, para campanha, para
--  faltante, para lead, para tudo. Mas o risco não é o mesmo: responder a quem
--  perguntou o horário não se parece com abordar 100 pessoas que não pediram
--  nada.
--
--  Esta tabela dá NÍVEL POR DOMÍNIO. E ela não substitui as flags: as flags
--  continuam sendo o TETO. Nível 5 em `recall` com `ai_agente_envio` desligada
--  continua não enviando nada — a checagem é `min(flag, nível)`, e está em
--  `dominio/autonomia.ts`, testada.
--
--  NÍVEL É POR CLÍNICA, com a linha de `clinic_id` nulo valendo como padrão da
--  organização. Uma rede que abre a quarta unidade não deve herdar autopilot
--  por descuido; mas também não deve ter que reconfigurar dez domínios.
-- ============================================================================
create table if not exists public.crc_autonomia (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  -- Nulo = o padrão da organização. Ver os dois índices únicos abaixo.
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,

  -- mensagens | campanhas | recall | agenda | tratamento | cobranca |
  -- reputacao | voz | writeback | marketing
  dominio         text not null,

  -- 0 OFF · 1 OBSERVE · 2 RECOMMEND · 3 EXECUTE_LOW_RISK ·
  -- 4 EXECUTE_AND_ESCALATE · 5 AUTOPILOT
  nivel           integer not null default 0,

  atualizado_por  uuid references public.crc_users(id) on delete set null,
  atualizado_em   timestamptz not null default now(),
  criado_em       timestamptz not null default now(),

  constraint crc_autonomia_nivel_valido check (nivel between 0 and 5)
);

/*
 * DOIS ÍNDICES ÚNICOS, E NÃO UM COM COLUNA NULÁVEL.
 *
 * É a lição do `supabase/23`, cara o suficiente para ficar escrita: em Postgres
 * dois NULL não são iguais, então um `unique (organization_id, clinic_id,
 * dominio)` deixaria passar quantas linhas de padrão da organização alguém
 * quisesse criar — e a leitura devolveria a primeira, em silêncio.
 */
create unique index if not exists crc_autonomia_por_clinica
  on public.crc_autonomia (organization_id, clinic_id, dominio)
  where clinic_id is not null;

create unique index if not exists crc_autonomia_padrao_da_org
  on public.crc_autonomia (organization_id, dominio)
  where clinic_id is null;

-- ----------------------------------------------------------------------------
-- 5. O resumo do Radar, em uma ida ao banco
-- ----------------------------------------------------------------------------
--
-- A Home mostra "R$ X em oportunidades recuperáveis", quebrado por tipo. Sem
-- isto seriam nove consultas com `count` e `sum`, ou uma leitura de todas as
-- oportunidades abertas para somar em JavaScript — que é o mesmo defeito do
-- `opcoesDoPublico()` corrigido em `supabase/29`, só que numa tela mais vista.
create or replace function public.crc_radar_resumo(
  p_organization_id uuid,
  p_clinic_id       uuid default null
)
returns table (
  tipo             text,
  abertas          bigint,
  valor_potencial  numeric,
  valor_confirmado numeric,
  score_maximo     integer,
  aguardando_humano bigint
)
language sql
stable
as $corpo$
  select
      o.tipo,
      count(*)                                                   as abertas,
      coalesce(sum(o.potential_value), 0)                        as valor_potencial,
      coalesce(sum(o.confirmed_value), 0)                        as valor_confirmado,
      coalesce(max(o.priority_score), 0)                         as score_maximo,
      count(*) filter (where o.aguardando = 'HUMANO')            as aguardando_humano
    from public.crc_opportunities o
   where o.organization_id = p_organization_id
     and (p_clinic_id is null or o.clinic_id = p_clinic_id)
     and o.fechada_em is null
     and o.dismissed_em is null
     -- Vencida não é recuperável. Contá-la infla o número que a Home usa para
     -- dizer quanto dinheiro existe — e é o número que constrói ou destrói a
     -- confiança no painel inteiro.
     and (o.expires_at is null or o.expires_at > now())
   group by o.tipo
   order by 3 desc;
$corpo$;

-- ----------------------------------------------------------------------------
-- 6. RLS — ligada nas tabelas novas, sem policy (o mesmo padrão do `02`)
-- ----------------------------------------------------------------------------
--
-- Sem policy nenhuma, `anon` e `authenticated` não leem nada. O acesso é pela
-- `service_role`, do lado servidor, que já carrega o tenant em toda consulta.
do $rls$
declare t text;
begin
  foreach t in array array[
    'crc_attribution_events','crc_ai_activity','crc_autonomia'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $rls$;

insert into public.crc_schema_migrations (nome, presumido)
values ('30-crc-radar-de-receita.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();

-- ----------------------------------------------------------------------------
-- Privilégios
-- ----------------------------------------------------------------------------
do $privilegios$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant all on all functions in schema public to service_role';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on all tables in schema public to anon';
  end if;
end $privilegios$;
