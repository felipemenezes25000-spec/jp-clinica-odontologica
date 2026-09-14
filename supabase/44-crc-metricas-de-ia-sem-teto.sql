-- ============================================================================
--  O último teto da analítica: as métricas dos turnos de IA.
--
--  Rodar UMA VEZ, à mão, no editor do Supabase.
--  Depois: `notify pgrst, 'reload schema';`
-- ============================================================================
--
--  `metricasDeIa` lia até 1.000 `crc_ai_runs` e agregava em memória. O código
--  trazia uma justificativa escrita:
--
--    "Mil é o teto de leitura de um painel. Acima disso a pergunta deixa de
--     ser 'como foi o mês' e passa a ser um relatório, que tem outro caminho."
--
--  A JUSTIFICATIVA É RAZOÁVEL E NÃO É UMA GARANTIA. Ela descreve a intenção de
--  quem escreveu; não descreve o que acontece. O que acontece, a partir da
--  1.001ª run, é que:
--
--    · `taxaDeEntrega`, `taxaDeHandoff` e `taxaDeFalha` passam a ser calculadas
--      sobre as 1.000 primeiras runs do período — que não é amostra, é o começo
--      de uma ordenação, e portanto o início do mês;
--    · `custoTotal` sai menor;
--    · a lista de `portoes` perde os bloqueios que só aconteceram depois.
--
--  E MIL TURNOS NÃO É MUITO. Uma clínica com automação ligada passa disso num
--  mês sem esforço — é justamente a clínica cujo painel de IA alguém vai olhar.
--
--  As taxas são o pior dos três: um painel de segurança calculado sobre a
--  primeira semana do mês, mostrado como se fosse o mês.
-- ============================================================================

create or replace function public.crc_metricas_de_ia(
  p_organization_id uuid,
  p_de              timestamptz,
  p_ate             timestamptz
)
returns table (
  resultado       text,
  portao          text,
  quantidade      bigint,
  custo           numeric
)
language sql
stable
set search_path = public, pg_temp
as $corpo$
  /*
   * AGRUPA POR (resultado, portão) E DEIXA A COMPOSIÇÃO PARA O CÓDIGO.
   *
   * A alternativa seria devolver `taxa_de_entrega` já calculada. Não: a REGRA
   * de quais resultados entram no denominador — `rodando` fica de fora, porque
   * é turno que não terminou — é decisão de produto, está documentada em
   * `analytics-ia.ts`, e duplicá-la aqui criaria duas fontes de verdade que um
   * dia discordam em silêncio.
   *
   * O SQL responde "quantas de cada tipo, e quanto custaram". A composição
   * continua em um lugar só.
   */
  select
      coalesce(r.resultado, '')                         as resultado,
      coalesce(nullif(r.portao_bloqueou, ''), '')       as portao,
      count(*)                                          as quantidade,
      coalesce(sum(r.custo_estimado), 0)                as custo
    from public.crc_ai_runs r
   where r.organization_id = p_organization_id
     and r.criado_em >= p_de
     and r.criado_em <  p_ate
   group by 1, 2;
$corpo$;

-- O caminho: organização, depois tempo.
create index if not exists crc_ai_runs_periodo
  on public.crc_ai_runs (organization_id, criado_em desc);

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
values ('44-crc-metricas-de-ia-sem-teto.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();
