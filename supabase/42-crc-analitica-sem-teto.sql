-- ============================================================================
--  Os últimos tetos da analítica — motivos de perda, speed to lead e panorama.
--
--  Rodar UMA VEZ, à mão, no editor do Supabase.
--  Depois: `notify pgrst, 'reload schema';`
-- ============================================================================
--
--  O DEFEITO QUE ISTO MATA NÃO É LENTIDÃO. É NÚMERO ERRADO.
--
--  Três consultas ainda liam até 3.000 linhas e somavam em memória:
--
--    motivosDePerda        3.000 oportunidades fechadas com motivo
--    speedToLead           3.000 leads do período
--    panoramaDoGestor      3.000 oportunidades abertas + 3.000 recuperações
--
--  Passando do teto, o PostgREST devolve as 3.000 primeiras e o código soma o
--  que recebeu. Não há erro, não há aviso, não há linha no log. O relatório
--  mostra um número plausível e MENOR que a realidade.
--
--  É o pior formato possível de defeito num painel financeiro: enquanto a
--  clínica é pequena ele nunca aparece, e no dia em que ela cresce o número
--  passa a mentir exatamente onde a decisão fica mais cara.
--
--  ==========================================================================
--   E `speedToLead` era pior que os outros dois, por causa da MEDIANA.
--
--   Uma soma truncada erra proporcionalmente: 3.000 de 4.000 linhas dão 75%
--   do valor. Uma MEDIANA truncada erra sem proporção nenhuma — ela passa a
--   descrever a metade dos leads que o banco decidiu devolver primeiro, que
--   não é uma amostra, é o começo de uma ordenação.
--
--   Se a ordem de chegada tiver qualquer correlação com o tempo de resposta
--   (e tem: campanha nova, fim de semana, turno da noite), a mediana não fica
--   "um pouco menor" — ela fica de outro assunto.
--  ==========================================================================
--
--  SEM `security definer`, como o resto do CRC: roda com o privilégio de quem
--  chama, e a organização é parâmetro obrigatório.
--
--  `set search_path` fixo em cada função pela razão do `supabase/35`: nome não
--  qualificado passa a ser erro na criação, e não resolução silenciosa. Vale
--  re-rodar o `35` depois deste arquivo — ele lê o catálogo e cobre tudo que
--  for criado daqui para a frente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Onde os pacientes estão sendo perdidos
-- ----------------------------------------------------------------------------

create or replace function public.crc_motivos_de_perda(
  p_organization_id uuid,
  p_de              timestamptz,
  p_ate             timestamptz
)
returns table (
  motivo        text,
  quantidade    bigint,
  valor_perdido numeric
)
language sql
stable
set search_path = public, pg_temp
as $corpo$
  select
      o.lost_reason                          as motivo,
      count(*)                               as quantidade,
      coalesce(sum(o.potential_value), 0)    as valor_perdido
    from public.crc_opportunities o
   where o.organization_id = p_organization_id
     and o.fechada_em >= p_de
     and o.fechada_em <  p_ate
     and o.lost_reason is not null
   group by o.lost_reason
   -- A ORDEM SAI DAQUI JÁ RESOLVIDA, e o desempate é pelo nome de propósito.
   -- Em memória o desempate era a ordem de chegada das linhas, que o Postgres
   -- não promete estável — dois motivos empatados podiam trocar de lugar entre
   -- dois carregamentos da mesma tela, sem nada ter mudado.
   order by count(*) desc, o.lost_reason;
$corpo$;

-- ----------------------------------------------------------------------------
-- 2. Quanto tempo a clínica leva para responder um lead
-- ----------------------------------------------------------------------------

create or replace function public.crc_speed_to_lead(
  p_organization_id uuid,
  p_de              timestamptz,
  p_ate             timestamptz
)
returns table (
  leads             bigint,
  respondidos       bigint,
  mediana_minutos   numeric,
  ate_cinco_minutos bigint
)
language sql
stable
set search_path = public, pg_temp
as $corpo$
  with base as (
    select
        case
          when l.primeira_resposta_em is null then null
          else extract(epoch from (l.primeira_resposta_em - l.criado_em)) / 60.0
        end as minutos
      from public.crc_leads l
     where l.organization_id = p_organization_id
       and l.criado_em >= p_de
       and l.criado_em <  p_ate
  )
  select
      count(*)                                                       as leads,
      count(minutos)                                                 as respondidos,
      -- `percentile_cont` interpola linearmente, o que para 0,5 devolve
      -- exatamente o elemento do meio (n ímpar) ou a média dos dois do meio
      -- (n par) — a mesma conta que o código fazia, agora sobre a base inteira.
      --
      -- MEDIANA, E NÃO MÉDIA, pela razão de sempre: um lead esquecido por três
      -- dias levanta a média até esconder que o resto foi respondido em
      -- minutos. A mediana responde "como é o caso típico", que é a pergunta.
      --
      -- ======================================================================
      --  O `::numeric` NÃO É DECORAÇÃO, e a primeira versão deste arquivo não
      --  o tinha. O teste de integração reprovou com 5000 onde esperava 5001.
      --
      --  `percentile_cont` não tem variante `numeric`: o argumento é promovido
      --  a `double precision`, e a saída volta como `double precision`. E
      --  `round(double precision)` no Postgres arredonda PARA O PAR MAIS
      --  PRÓXIMO (é o `rint()` do C), enquanto `round(numeric)` arredonda para
      --  longe do zero — que é o que `Math.round` faz no código e o que uma
      --  pessoa espera.
      --
      --  Com 10.000 leads de 1 a 10.000 minutos, a mediana interpolada é
      --  5000,5. Sem o cast: 5000. Com o cast: 5001.
      --
      --  Um minuto não muda decisão nenhuma. O que mudaria é o PADRÃO: dois
      --  jeitos de arredondar convivendo no sistema, e duas telas que somam a
      --  mesma coisa discordando de vez em quando, sem nenhuma das duas estar
      --  errada pelas suas próprias contas.
      -- ======================================================================
      round(percentile_cont(0.5) within group (order by minutos)::numeric) as mediana_minutos,
      count(*) filter (where minutos <= 5)                            as ate_cinco_minutos
    from base;
$corpo$;

-- ----------------------------------------------------------------------------
-- 3. Os totais próprios do panorama
-- ----------------------------------------------------------------------------

create or replace function public.crc_panorama_totais(
  p_organization_id uuid,
  p_de              timestamptz,
  p_ate             timestamptz
)
returns table (
  oportunidades_abertas bigint,
  valor_em_aberto       numeric,
  consultas_recuperadas bigint,
  pacientes_reativados  bigint
)
language sql
stable
set search_path = public, pg_temp
as $corpo$
  select
      a.quantidade,
      a.valor,
      r.recuperadas,
      r.reativados
    from
    -- ABERTAS NÃO TÊM PERÍODO, e isso não é esquecimento: uma oportunidade
    -- aberta há oito meses continua sendo dinheiro parado hoje. Recortá-la por
    -- mês esconderia justamente a que mais precisa de atenção.
    (select count(*)                            as quantidade,
            coalesce(sum(o.potential_value), 0) as valor
       from public.crc_opportunities o
      where o.organization_id = p_organization_id
        and o.fechada_em is null
    ) a
    cross join
    (select count(*)                        as recuperadas,
            count(distinct f.patient_id)    as reativados
       from public.crc_funnel_events f
      where f.organization_id = p_organization_id
        and f.etapa = 'consulta_recuperada'
        and f.ocorrido_em >= p_de
        and f.ocorrido_em <  p_ate
    ) r;
$corpo$;

-- ----------------------------------------------------------------------------
-- Os caminhos que as três varrem
-- ----------------------------------------------------------------------------

-- Perdas: organização, janela de fechamento, e só as que têm motivo. O índice
-- é PARCIAL porque a consulta é parcial — oportunidade sem motivo nunca entra,
-- e carregá-la no índice só faria ele ocupar espaço para ser pulada.
create index if not exists crc_opportunities_perdas
  on public.crc_opportunities (organization_id, fechada_em)
  where lost_reason is not null;

-- Speed to lead: o `39` já criou `crc_leads_recentes (organization_id,
-- criado_em desc)`, que é exatamente este caminho. Nada a acrescentar aqui —
-- registrado para quem vier conferir não procurar um índice que não falta.

-- Abertas: `crc_opportunities_fila` (02) é parcial em `fechada_em is null` e
-- serve de índice de cobertura para a contagem. Também nada a acrescentar.

-- Recuperadas: `crc_funnel_events_recuperadas` (40) é (organization_id, etapa,
-- ocorrido_em desc) — o caminho exato. Idem.
