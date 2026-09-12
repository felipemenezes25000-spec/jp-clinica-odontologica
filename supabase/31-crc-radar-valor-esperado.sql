-- ============================================================================
-- CRC — o resumo do Radar passa a somar VALOR ESPERADO, e o registro se corrige.
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O resumo, agora com o número honesto
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  O QUE ESTAVA FALTANDO NA `supabase/30`, e por que não dava para consertar
--  do lado de fora.
--
--  A versão anterior devolvia, por tipo: quantas, a soma do potencial e a soma
--  do confirmado. A Home precisa de um quarto número — a soma do VALOR
--  ESPERADO, que é `Σ (potential_value × probability)`.
--
--  E ISSO NÃO SE CALCULA A PARTIR DOS AGREGADOS. Com 400 oportunidades de
--  recall somando R$ 400 mil, a única forma de chegar ao esperado seria
--  multiplicar o total por uma probabilidade média — o que só daria o valor
--  certo se todas as 400 tivessem a mesma probabilidade. Elas não têm: quem
--  respondeu vale três vezes mais que quem nunca respondeu, e é justamente essa
--  diferença que o Radar existe para enxergar.
--
--  A alternativa do lado da aplicação seria ler as 400 linhas e somar em
--  JavaScript. É o mesmo defeito do `opcoesDoPublico()` corrigido na
--  `supabase/29` — uma leitura que cresce com a base, numa tela que abre
--  sempre.
-- ============================================================================
--
-- `create or replace` COM A MESMA ASSINATURA: os nomes e tipos dos parâmetros
-- não mudam, então o PostgREST continua resolvendo a mesma chamada e o
-- `drop function` não é necessário. Mudar o `returns table` de uma função
-- existente exige o drop; por isso ele está aqui, explícito.
drop function if exists public.crc_radar_resumo(uuid, uuid);

create or replace function public.crc_radar_resumo(
  p_organization_id uuid,
  p_clinic_id       uuid default null
)
returns table (
  tipo              text,
  abertas           bigint,
  valor_potencial   numeric,
  valor_confirmado  numeric,
  valor_esperado    numeric,
  confianca_media   numeric,
  score_maximo      integer,
  aguardando_humano bigint
)
language sql
stable
as $corpo$
  select
      o.tipo,
      count(*)                                        as abertas,
      coalesce(sum(o.potential_value), 0)             as valor_potencial,
      coalesce(sum(o.confirmed_value), 0)             as valor_confirmado,

      /*
       * O VALOR ESPERADO, LINHA A LINHA.
       *
       * `probability` nula significa "o Radar ainda não pontuou esta". Contá-la
       * como 1 somaria o potencial inteiro — exatamente a fantasia que este
       * número existe para evitar. Contá-la como 0 sumiria com ela.
       *
       * O `coalesce(..., 0)` DENTRO do produto é a escolha deliberada: uma
       * oportunidade não pontuada contribui com zero para o esperado, e
       * continua contando em `abertas`. A diferença entre os dois totais é
       * visível na tela, e é ela que mostra quanto do Radar ainda não foi
       * avaliado.
       */
      coalesce(sum(o.potential_value * coalesce(o.probability, 0)), 0) as valor_esperado,

      -- Ponderada pela QUANTIDADE, e não pelo valor: é a mesma regra de
      -- `resumirRadar()` em `dominio/radar.ts`, e as duas precisam concordar.
      coalesce(avg(coalesce(o.confidence, 0)), 0)     as confianca_media,

      coalesce(max(o.priority_score), 0)              as score_maximo,
      count(*) filter (where o.aguardando = 'HUMANO') as aguardando_humano
    from public.crc_opportunities o
   where o.organization_id = p_organization_id
     and (p_clinic_id is null or o.clinic_id = p_clinic_id)
     and o.fechada_em is null
     and o.dismissed_em is null
     and (o.expires_at is null or o.expires_at > now())
   group by o.tipo
   order by 5 desc;
$corpo$;

-- ----------------------------------------------------------------------------
-- 2. O índice que a passagem de qualificação usa
-- ----------------------------------------------------------------------------
--
-- A varredura do Radar pergunta "quais oportunidades abertas ainda não foram
-- pontuadas, ou foram pontuadas por uma fórmula antiga". Sem o índice, ela
-- varre todas as oportunidades da organização a cada volta.
create index if not exists idx_crc_opportunities_a_pontuar
  on public.crc_opportunities (organization_id, id)
  where fechada_em is null and dismissed_em is null;

-- ----------------------------------------------------------------------------
-- 3. O registro se corrige — sem tocar em migration aplicada
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  A 25 E A 26 NÃO SE ANOTAM SOZINHAS, e é fácil entender por quê: a tabela
--  `crc_schema_migrations` nasceu na 27. As duas foram escritas antes dela
--  existir, e por isso aparecem no painel como `presumido` — anotadas apenas
--  pelo backfill, e não por terem rodado.
--
--  NÃO SE CONSERTA EDITANDO A 25 E A 26. Elas já rodaram em produção, e o §106
--  do Prompt Mestre é claro: migration aplicada não se altera. Alguém que
--  clonasse o repositório depois e rodasse tudo do zero teria um arquivo
--  diferente do que produção executou — e a diferença seria invisível.
--
--  A CORREÇÃO É AQUI, numa migration nova, dizendo o que se sabe: as sondas do
--  `npm run schema:status` confirmam os objetos das duas no banco. `presumido`
--  vira `false` porque a EVIDÊNCIA existe — não porque alguém anotou.
-- ============================================================================
insert into public.crc_schema_migrations (nome, presumido)
values
  ('25-crc-retry-atomico-e-tenant-no-inbox.sql', false),
  ('26-crc-varreduras-convergentes.sql', false)
on conflict (nome) do update set presumido = false;

insert into public.crc_schema_migrations (nome, presumido)
values ('31-crc-radar-valor-esperado.sql', false)
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
