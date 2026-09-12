-- ============================================================================
-- CRC — o orçamento que não virou tratamento, e o motivo real.  (FASE C)
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
-- ============================================================================
--
--  O NÚMERO QUE ESTA MIGRATION EXISTE PARA MOVER: a taxa de conversão de
--  orçamento. Num consultório típico ela fica entre 35% e 55% — o que significa
--  que quase metade do que a clínica já examinou, diagnosticou e orçou nunca
--  vira tratamento.
--
--  Esse é o dinheiro mais barato que existe: o paciente já veio, já foi
--  atendido, já ouviu a proposta. Não precisa de anúncio, não precisa de
--  captação. Precisa de alguém retomando a conversa no momento certo, com o
--  argumento certo.
--
--  E "o argumento certo" depende de saber POR QUE não fechou — que é
--  exatamente o que nenhum sistema guarda.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O funil de aceitação, dentro do orçamento que já existe
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  O §18 PEDE `crc_treatment_opportunities`. Ela já existe: é `crc_budgets`,
--  do `supabase/02`, com paciente, clínica, valor total, valor aprovado,
--  status, data de emissão e validade — mais os itens em tabela separada.
--
--  O que ela NÃO sabe é o que acontece DEPOIS de emitida. `status` guarda o
--  estado formal do documento (aberto, aprovado, expirado), e o funil de
--  aceitação é outra coisa: a pessoa está pensando? já disse que está caro?
--  aceitou e não marcou? começou e parou?
--
--  Duas informações diferentes sobre a mesma linha. A primeira vem do Dental
--  Office; a segunda nasce da conversa, e é a que o CRC produz.
-- ============================================================================

-- PROPOSED | THINKING | PRICE_OBJECTION | FEAR_OBJECTION | TIME_OBJECTION |
-- FAMILY_DECISION | PAYMENT_OBJECTION | NO_RESPONSE | ACCEPTED | SCHEDULED |
-- STARTED | LOST
--
-- NASCE NULO, e não em 'PROPOSED'. Nulo significa "o CRC ainda não olhou para
-- este orçamento"; 'PROPOSED' significa "olhou, e está no começo do funil". A
-- diferença é o que separa a base histórica importada do trabalho novo — e sem
-- ela, os 8.000 orçamentos antigos entrariam no funil como se tivessem sido
-- propostos hoje.
alter table public.crc_budgets
  add column if not exists funil text;

alter table public.crc_budgets
  add column if not exists dentist_id uuid references public.crc_dentists(id) on delete set null;

/*
 * A OBJEÇÃO ATUAL, desnormalizada de propósito.
 *
 * O histórico completo vive em `crc_objections`. Esta coluna guarda a MAIS
 * RECENTE, porque toda listagem do funil precisa dela — e um join com
 * `order by ... limit 1` por linha, numa tela que mostra cinquenta orçamentos,
 * é cinquenta subconsultas para mostrar uma etiqueta.
 *
 * A duplicação é escrita por um lugar só (`registrarObjecao`), o que é a
 * condição para desnormalizar sem criar divergência.
 */
alter table public.crc_budgets
  add column if not exists objecao_atual text;

alter table public.crc_budgets
  add column if not exists ultimo_contato_em timestamptz;

-- Quantas vezes já retomamos este orçamento. É o que faz o follow-up parar —
-- ver `crc_opportunities.tentativas` para a mesma ideia no Radar.
alter table public.crc_budgets
  add column if not exists tentativas integer not null default 0;

-- 0..1, do modelo de `dominio/aceitacao.ts`. Junto com a confiança, pela mesma
-- regra do Radar: probabilidade sem confiança vira promessa.
alter table public.crc_budgets
  add column if not exists conversao_prob numeric(4,3);

alter table public.crc_budgets
  add column if not exists conversao_conf numeric(4,3);

alter table public.crc_budgets
  add column if not exists conversao_versao text;

-- A próxima ação, em código. O texto humano fica na oportunidade do Radar; aqui
-- é o que o motor lê.
alter table public.crc_budgets
  add column if not exists proxima_acao text;

alter table public.crc_budgets
  add column if not exists proxima_acao_em timestamptz;

-- Quando o funil terminou, e como. `aceito_em` é o momento em que a pessoa
-- disse sim — que NÃO é o mesmo que `approved_value` mudar no Dental Office,
-- e a diferença entre os dois é o tempo que a clínica leva para formalizar.
alter table public.crc_budgets
  add column if not exists aceito_em timestamptz;

alter table public.crc_budgets
  add column if not exists perdido_em timestamptz;

alter table public.crc_budgets
  add column if not exists perdido_motivo text;

/*
 * O ÍNDICE DO FUNIL.
 *
 * A pergunta é sempre "os orçamentos abertos desta clínica, em ordem de valor".
 * O parcial exclui os terminais — que num ano são a maioria das linhas, e
 * nenhuma tela do funil os pede.
 */
create index if not exists idx_crc_budgets_funil
  on public.crc_budgets (organization_id, clinic_id, total_value desc)
  where funil is not null and aceito_em is null and perdido_em is null;

-- A varredura de follow-up: "quais estão na hora de retomar".
create index if not exists idx_crc_budgets_proxima_acao
  on public.crc_budgets (proxima_acao_em)
  where proxima_acao_em is not null and aceito_em is null and perdido_em is null;

-- A passagem de pontuação: "quais ainda não foram avaliados por esta versão".
create index if not exists idx_crc_budgets_a_pontuar
  on public.crc_budgets (organization_id, id)
  where aceito_em is null and perdido_em is null;

-- ----------------------------------------------------------------------------
-- 2. As objeções
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  POR QUE UMA TABELA, e não só a coluna `objecao_atual`.
--
--  Porque a objeção MUDA, e a mudança é o dado mais valioso do funil:
--
--      "vou pensar"           →  THINKING
--      "tá caro"              →  PRICE
--      "vou ver com meu marido" →  FAMILY
--      "esse mês não dá"      →  TIME
--
--  Quatro conversas, quatro objeções, uma pessoa. Guardar só a última apaga a
--  sequência — e a sequência é o que diz se a clínica está avançando ou
--  rodando em círculo.
--
--  E GUARDA-SE O TEXTO ORIGINAL, SEMPRE. A categoria é um índice para contar,
--  não um substituto: "tá caro pra mim agora, mês que vem eu consigo" e "tá
--  caro, achei mais barato na outra clínica" viram a mesma linha em PRECO, e
--  são conversas opostas. É a regra que `dominio/objecoes.ts` já sustenta.
-- ============================================================================
create table if not exists public.crc_objections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete cascade,
  budget_id       uuid references public.crc_budgets(id) on delete cascade,
  conversation_id uuid references public.crc_conversations(id) on delete set null,

  -- PRECO | TEMPO | MEDO | TERCEIRO | CONVENIO | CONFIANCA | OUTRO
  categoria       text not null,

  -- O TEXTO ORIGINAL. Ver o bloco acima: sem ele, a categoria é uma contagem
  -- sobre informação que foi jogada fora.
  texto           text not null,

  -- 0..1. Baixa confiança conta como OUTRO nos agregados, e continua legível
  -- na linha — é o que permite alguém revisar as duvidosas.
  confianca       numeric(4,3) not null default 0,
  -- Qual padrão casou. Serve para alguém discordar do critério.
  padrao          text,

  /*
   * REVISADA POR HUMANO.
   *
   * É o que transforma a classificação automática em dado de treino. Uma
   * objeção que alguém conferiu vale mais que mil classificadas por regex — e
   * misturá-las no mesmo agregado faria a taxa de acerto do classificador
   * medir a si mesma.
   */
  revisada_por    uuid references public.crc_users(id) on delete set null,
  revisada_em     timestamptz,
  -- Quando alguém corrige, a categoria original fica. É o par (automática,
  -- correta) que mede o classificador.
  categoria_original text,

  /*
   * O DESFECHO POSTERIOR, preenchido depois.
   *
   * É o que responde a pergunta que vale dinheiro: "objeção de preço converte
   * mais quando a gente oferece parcelamento ou quando a gente espera?". Sem
   * ele, a analítica de objeção é uma contagem de reclamações.
   */
  desfecho        text,
  desfecho_em     timestamptz,

  ocorrido_em     timestamptz not null default now(),
  criado_em       timestamptz not null default now(),

  chave_dedupe    text
);

create unique index if not exists crc_objections_dedupe
  on public.crc_objections (organization_id, chave_dedupe)
  where chave_dedupe is not null;

create index if not exists idx_crc_objections_orcamento
  on public.crc_objections (budget_id, ocorrido_em desc);

create index if not exists idx_crc_objections_analitica
  on public.crc_objections (organization_id, clinic_id, categoria, ocorrido_em desc);

-- ----------------------------------------------------------------------------
-- 3. A analítica de objeção, em uma ida ao banco
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  O NÚMERO QUE ESTA FUNÇÃO PRODUZ, e por que ele muda decisão:
--
--    "PRECO aparece em 58% das objeções, e converte em 11%."
--    "TEMPO aparece em 14%, e converte em 47%."
--
--  Com isso, a clínica para de tratar as duas do mesmo jeito. Preço não é
--  problema de treinamento de equipe: é tabela, forma de apresentar, ou
--  opção de pagamento. Tempo é só timing — basta voltar depois.
--
--  Sem a taxa de conversão ao lado da contagem, o painel diria apenas "preço é
--  a objeção mais comum", que todo mundo já sabe e ninguém age.
-- ============================================================================
create or replace function public.crc_analitica_de_objecoes(
  p_organization_id uuid,
  p_clinic_id       uuid default null,
  p_desde           timestamptz default null
)
returns table (
  categoria        text,
  total            bigint,
  convertidas      bigint,
  perdidas         bigint,
  sem_desfecho     bigint,
  valor_em_jogo    numeric,
  revisadas        bigint
)
language sql
stable
as $corpo$
  select
      o.categoria,
      count(*)                                                as total,
      count(*) filter (where o.desfecho = 'CONVERTEU')        as convertidas,
      count(*) filter (where o.desfecho = 'PERDEU')           as perdidas,
      count(*) filter (where o.desfecho is null)              as sem_desfecho,
      -- O valor dos orçamentos em que a objeção apareceu. `distinct` porque um
      -- orçamento pode ter várias objeções da mesma categoria ao longo do
      -- tempo, e somar o valor dele duas vezes inflaria o número.
      coalesce(sum(distinct b.total_value), 0)                as valor_em_jogo,
      count(*) filter (where o.revisada_em is not null)       as revisadas
    from public.crc_objections o
    left join public.crc_budgets b on b.id = o.budget_id
   where o.organization_id = p_organization_id
     and (p_clinic_id is null or o.clinic_id = p_clinic_id)
     and (p_desde is null or o.ocorrido_em >= p_desde)
   group by o.categoria
   order by 2 desc;
$corpo$;

insert into public.crc_schema_migrations (nome, presumido)
values ('33-crc-aceitacao-de-tratamento.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();

-- ----------------------------------------------------------------------------
-- RLS e privilégios
-- ----------------------------------------------------------------------------
alter table public.crc_objections enable row level security;

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
