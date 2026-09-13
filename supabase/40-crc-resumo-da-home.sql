-- ============================================================================
--  O resumo da Home, somado NO BANCO.
--
--  O QUE ISTO SUBSTITUI: `carregarHome` lia até 2.000 linhas de
--  `crc_funnel_events` e mais 2.000 de `crc_revenue_events` — quatro mil linhas
--  atravessando a rede — para produzir TRÊS NÚMEROS: quantas consultas foram
--  recuperadas, quantos pacientes distintos elas representam, e quanto de
--  dinheiro somam.
--
--  Com a base vazia isso custa zero, e foi por isso que passou despercebido. O
--  custo aparece exatamente quando a clínica começa a usar: cada abertura da
--  Home puxando milhares de linhas para contá-las em JavaScript.
--
--  E O TETO DE 2.000 ERA PIOR QUE LENTO — ERA ERRADO. Passando de dois mil
--  eventos no mês, o `limite` cortava a lista e os números da Home ficavam
--  MENORES que a realidade, sem aviso nenhum. Um painel que subnotifica
--  receita é pior que um painel lento.
--
--  `stable` e não `volatile`: a função só lê. Isso permite ao planejador
--  reaproveitá-la dentro da mesma consulta.
--
--  SEM `security definer`, de propósito. Ela roda com os privilégios de quem
--  chama, e o filtro de organização é parâmetro obrigatório — o mesmo escopo
--  que o resto do CRC aplica. Uma função `definer` aqui viraria um caminho que
--  ignora RLS, e o ganho não paga esse risco.
-- ============================================================================

create or replace function public.crc_resumo_da_home(
  p_organization_id uuid,
  p_desde           timestamptz
)
returns table (
  consultas_recuperadas bigint,
  pacientes_reativados  bigint,
  valor_potencial       numeric,
  receita_confirmada    numeric
)
language sql
stable
as $corpo$
  select
      coalesce(f.n, 0)          as consultas_recuperadas,
      coalesce(f.pacientes, 0)  as pacientes_reativados,
      coalesce(f.valor, 0)      as valor_potencial,
      coalesce(r.valor, 0)      as receita_confirmada
    from
      (select
           count(*)                        as n,
           -- DISTINTOS, e não a contagem de eventos: o mesmo paciente pode ter
           -- duas consultas recuperadas no mês, e ele continua sendo uma pessoa
           -- reativada. Contar eventos infla o número que o dono lê como
           -- "quantas pessoas voltaram".
           count(distinct e.patient_id)    as pacientes,
           coalesce(sum(e.valor), 0)       as valor
         from public.crc_funnel_events e
        where e.organization_id = p_organization_id
          and e.etapa = 'consulta_recuperada'
          and e.ocorrido_em >= p_desde
      ) f
      cross join
      (select coalesce(sum(v.valor), 0) as valor
         from public.crc_revenue_events v
        where v.organization_id = p_organization_id
          -- CONFIRMADA só. O item 63 proíbe somar potencial com recebido no
          -- mesmo número, e é aqui que essa regra vira SQL em vez de disciplina.
          and v.natureza = 'CONFIRMADA'
          and v.ocorrido_em >= p_desde
      ) r;
$corpo$;

-- Os dois caminhos que a função varre. Sem eles ela fica correta e lenta.
create index if not exists crc_funnel_events_recuperadas
  on public.crc_funnel_events (organization_id, etapa, ocorrido_em desc);

create index if not exists crc_revenue_events_confirmadas
  on public.crc_revenue_events (organization_id, natureza, ocorrido_em desc);
