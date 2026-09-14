-- ============================================================================
--  Mais dois tetos de 5.000 — custo de IA e leads por campanha.
--
--  Rodar UMA VEZ, à mão, no editor do Supabase.
--  Depois: `notify pgrst, 'reload schema';`
-- ============================================================================
--
--  MESMA CLASSE DE DEFEITO DO `supabase/42`, encontrada pela varredura que
--  aquele arquivo motivou. Duas leituras somavam até 5.000 linhas em memória e
--  apresentavam o resultado como total.
--
--  ==========================================================================
--   E ELAS ERRAVAM EM DIREÇÕES OPOSTAS, o que vale registrar porque é o que
--   torna esse defeito tão difícil de notar olhando a tela.
--
--   `resumoDeCustoIa` — o custo sai MENOR. Uma clínica que passa de 5.000
--   chamadas no período vê uma conta de IA menor do que a que vai pagar. É
--   exatamente o número que existe para segurar o teto de gasto.
--
--   `custoPorEtapa` — o custo por lead sai MAIOR. Ele divide o investido pela
--   quantidade de leads, e a quantidade truncada é um denominador menor. A
--   campanha aparece pior do que é, e alguém desliga um anúncio que estava
--   funcionando.
--
--   Nenhum dos dois emite erro. Os dois continuam plausíveis.
--  ==========================================================================
--
--  Sem `security definer`, `search_path` fixo, organização obrigatória — como
--  o resto do CRC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O que a IA custou
-- ----------------------------------------------------------------------------

create or replace function public.crc_gasto_de_ia(
  p_organization_id uuid,
  p_desde           timestamptz
)
returns table (
  chamadas        bigint,
  falhas          bigint,
  custo_total     numeric,
  tokens_entrada  bigint,
  tokens_saida    bigint
)
language sql
stable
set search_path = public, pg_temp
as $corpo$
  select
      count(*)                                                   as chamadas,
      count(*) filter (where c.sucesso is false)                 as falhas,
      -- `numeric`, e não float: é dinheiro, e o item 221 é explícito. Somar
      -- 5.000 custos em ponto flutuante acumula erro na quarta casa, que é
      -- justamente onde o custo por chamada mora.
      coalesce(sum(c.custo_estimado), 0)                         as custo_total,
      coalesce(sum(c.input_tokens), 0)                           as tokens_entrada,
      coalesce(sum(c.output_tokens), 0)                          as tokens_saida
    from public.crc_ai_calls c
   where c.organization_id = p_organization_id
     and c.criado_em >= p_desde;
$corpo$;

-- ----------------------------------------------------------------------------
-- 2. Quantos leads cada campanha trouxe, e quantos foram respondidos
-- ----------------------------------------------------------------------------

create or replace function public.crc_leads_por_campanha(
  p_organization_id uuid,
  p_de              timestamptz,
  p_ate             timestamptz
)
returns table (
  campanha    text,
  quantidade  bigint,
  responderam bigint
)
language sql
stable
set search_path = public, pg_temp
as $corpo$
  /*
   * ==========================================================================
   *  A NORMALIZAÇÃO TEM DE SER A MESMA DO `normalizarCampanha`, LETRA POR
   *  LETRA — e isto quase passou batido.
   *
   *  O gasto (`crc_ad_spend.campanha`) já é gravado normalizado: minúsculas,
   *  espaços colapsados, aparado, 120 caracteres. A tela junta gasto e leads
   *  PELO NOME.
   *
   *  Se aqui o agrupamento fosse pelo `utm_campaign` cru, "Black Friday" e
   *  "black friday" virariam duas campanhas — e nenhuma das duas casaria com o
   *  gasto, que está gravado como "black friday". O resultado seria custo por
   *  paciente infinito em uma linha e zero em outra, com o total certo.
   *
   *  `btrim` DEPOIS do `regexp_replace`, e não antes: um nome começando com
   *  tabulação vira " nome" no meio do caminho, e aparar antes deixaria o
   *  espaço que a colapsagem criou.
   * ==========================================================================
   */
  select
      coalesce(
        nullif(left(btrim(regexp_replace(lower(l.utm_campaign), '\s+', ' ', 'g')), 120), ''),
        'geral'
      )                                                  as campanha,
      count(*)                                           as quantidade,
      -- `count(coluna)` não conta nulo. É a contagem de quem foi respondido.
      count(l.primeira_resposta_em)                      as responderam
    from public.crc_leads l
   where l.organization_id = p_organization_id
     and l.criado_em >= p_de
     and l.criado_em <  p_ate
   group by 1
   -- Desempate pelo nome: sem ele, duas campanhas com o mesmo número de leads
   -- trocam de lugar entre dois carregamentos da mesma tela.
   order by count(*) desc, 1;
$corpo$;

-- ----------------------------------------------------------------------------
-- Os caminhos
-- ----------------------------------------------------------------------------

-- `crc_ai_calls_custo` (organization_id, criado_em desc) já existe desde o
-- `02` e é exatamente o caminho de `crc_gasto_de_ia`. Nada a acrescentar.

-- `crc_leads_recentes` (organization_id, criado_em desc) veio no `39` e serve
-- `crc_leads_por_campanha`. Idem.

-- ----------------------------------------------------------------------------
-- O registro
-- ----------------------------------------------------------------------------
--
--  A LINHA ABAIXO NAO E PROVA, e o `schema-status` sabe disso: ela diz que
--  alguem ANOTOU, e a sonda diz o que esta no banco. Quando as duas discordam,
--  a sonda vence.
--
--  Ela existe porque a DISCORDANCIA e o alarme. Sem o registro, um arquivo que
--  nunca rodou e um arquivo que rodou ficam com a mesma aparencia — e o
--  relatorio perde a unica linha que faz alguem parar e conferir.
--
--  Da 30 a 38 todo arquivo se registrava. Da 39 a 44 o habito se perdeu, e o
--  relatorio de 13/09/2026 mostrou as seis como NAO anotadas com a sonda OK.

insert into public.crc_schema_migrations (nome, presumido)
values ('43-crc-custo-e-campanha-sem-teto.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();
