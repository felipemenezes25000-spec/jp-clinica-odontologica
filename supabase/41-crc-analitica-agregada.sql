-- ============================================================================
--  A analítica somada no banco — receita por mês e funil do período.
--
--  O QUE ISTO SUBSTITUI, e o tamanho do problema:
--
--    `receitaPorMes` roda um LAÇO DE SEIS MESES e, em cada volta, lê até 5.000
--    linhas de `crc_revenue_events`. São até TRINTA MIL LINHAS em SEIS IDAS ao
--    banco, para produzir seis pares de soma.
--
--    `funilDoPeriodo` faz seis `count(*)` sequenciais — seis viagens para seis
--    números que uma consulta devolve de uma vez.
--
--  E O TETO DE 5.000 ERA ERRADO, não só lento: um mês com mais de cinco mil
--  eventos teria a lista cortada e a receita do relatório sairia MENOR que a
--  real, sem aviso.
--
--  ============================================================================
--   DE QUEBRA, O FUSO FICA CERTO — e isto o código não tinha como fazer.
--
--   `analytics.ts` já registrava a limitação: "o primeiro dia do mês é
--   calculado em UTC. A clínica opera em -03, então o mês do relatório começa
--   às 21h do último dia do mês anterior no horário local."
--
--   Ou seja: todo evento entre 21h e meia-noite do último dia do mês caía no
--   mês seguinte. Aqui o `date_trunc` roda sobre o horário de São Paulo, e o
--   mês do relatório passa a ser o mês que a clínica viveu.
--  ============================================================================
--
--  Sem `security definer`: roda com o privilégio de quem chama e a organização
--  é parâmetro obrigatório, como o resto do CRC.
-- ============================================================================

create or replace function public.crc_receita_por_mes(
  p_organization_id uuid,
  p_meses           integer default 6,
  p_agora           timestamptz default now()
)
returns table (
  mes         date,
  confirmada  numeric,
  potencial   numeric,
  eventos     bigint
)
language sql
stable
as $corpo$
  with meses as (
    -- A grade de meses vem do `generate_series`, e não dos dados: um mês SEM
    -- evento precisa aparecer no gráfico como zero. Montar a grade a partir do
    -- que existe faria o mês vazio sumir, e a linha do gráfico saltaria por
    -- cima dele como se o tempo não tivesse passado.
    select generate_series(
             date_trunc('month', (p_agora at time zone 'America/Sao_Paulo'))
               - make_interval(months => p_meses - 1),
             date_trunc('month', (p_agora at time zone 'America/Sao_Paulo')),
             interval '1 month'
           )::date as mes
  )
  select
      m.mes,
      coalesce(sum(e.valor) filter (where e.natureza = 'CONFIRMADA'), 0) as confirmada,
      -- Tudo que NÃO é confirmada é potencial. Escrito pela negativa de
      -- propósito: uma natureza nova que alguém acrescente amanhã entra no
      -- potencial, que é o lado conservador. Listar as naturezas por nome faria
      -- a nova sumir dos dois números.
      coalesce(sum(e.valor) filter (where e.natureza <> 'CONFIRMADA'), 0) as potencial,
      count(e.id)                                                        as eventos
    from meses m
    left join public.crc_revenue_events e
      on e.organization_id = p_organization_id
     and date_trunc('month', (e.ocorrido_em at time zone 'America/Sao_Paulo'))::date = m.mes
   group by m.mes
   order by m.mes;
$corpo$;

-- ----------------------------------------------------------------------------

create or replace function public.crc_funil_do_periodo(
  p_organization_id uuid,
  p_de              timestamptz,
  p_ate             timestamptz
)
returns table (
  etapa      text,
  quantidade bigint
)
language sql
stable
as $corpo$
  -- A ORDEM DAS ETAPAS FICA NO CÓDIGO, e não aqui. A conversão de cada etapa é
  -- medida contra a ANTERIOR, e essa sequência é decisão de produto: mudá-la é
  -- mudar o que o número significa. Duplicá-la no SQL criaria duas fontes de
  -- verdade que um dia discordam em silêncio.
  select e.etapa, count(*) as quantidade
    from public.crc_funnel_events e
   where e.organization_id = p_organization_id
     and e.ocorrido_em >= p_de
     and e.ocorrido_em <  p_ate
   group by e.etapa;
$corpo$;

-- O caminho que as duas varrem: organização, depois tempo.
create index if not exists crc_revenue_events_periodo
  on public.crc_revenue_events (organization_id, ocorrido_em desc);

create index if not exists crc_funnel_events_periodo
  on public.crc_funnel_events (organization_id, ocorrido_em desc);

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
values ('41-crc-analitica-agregada.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();
