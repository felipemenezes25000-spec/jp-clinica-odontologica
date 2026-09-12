-- ============================================================================
-- CRC — o filtro deixa de esconder valores, e o ciclo deixa de mentir.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
--
-- DOIS DEFEITOS QUE TÊM A MESMA FORMA: um número que parece uma resposta e é
-- outra coisa. Um `limite` lido como "a base"; um `atualizado_em` lido como "o
-- ciclo fechou".
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. As opções do filtro de campanha
-- ----------------------------------------------------------------------------
--
-- `opcoesDoPublico()` fazia:
--
--     select especialidade, convenio from crc_patients limit 5000
--     → Set em memória
--
-- O comentário chamava 5.000 de "teto alto". Não é: com 8.000 pacientes, tudo
-- que existisse SÓ depois da linha 5.000 sumia da tela.
--
-- E o efeito é pior do que uma lista incompleta. O filtro de especialidade não
-- mostra "Endodontia"; a pessoa conclui que a clínica não tem esse recorte, e
-- monta a campanha sem ele. O dado existe, e a interface jura que não.
--
-- DUAS COLUNAS NUMA FUNÇÃO SÓ, com `tipo` discriminando, porque são duas listas
-- pequenas lidas sempre juntas — na abertura do mesmo modal. Duas RPCs seriam
-- duas idas ao banco para montar uma tela.
create or replace function public.crc_opcoes_de_publico(
  p_organization_id uuid,
  -- Quando a campanha é de uma unidade, as opções são as DELA. Nulo = a
  -- organização inteira, que é o caso de quem tem uma clínica só.
  p_clinic_id       uuid default null
)
returns table (tipo text, valor text)
language sql
stable
as $corpo$
  select 'especialidade'::text, p.especialidade
    from public.crc_patients p
   where p.organization_id = p_organization_id
     and p.arquivado = false
     and p.especialidade is not null
     and length(btrim(p.especialidade)) > 0
     and (p_clinic_id is null or p.clinic_id = p_clinic_id)
   group by p.especialidade

  union all

  select 'convenio'::text, p.convenio
    from public.crc_patients p
   where p.organization_id = p_organization_id
     and p.arquivado = false
     and p.convenio is not null
     and length(btrim(p.convenio)) > 0
     and (p_clinic_id is null or p.clinic_id = p_clinic_id)
   group by p.convenio

   order by 1, 2;
$corpo$;

/*
 * OS ÍNDICES QUE FAZEM O `group by` NÃO VARRER A TABELA.
 *
 * Parciais, porque a pergunta é sempre sobre paciente não arquivado com o campo
 * preenchido — e num consultório a maioria dos pacientes não tem convênio. Um
 * índice cheio seria maior e responderia a mesma coisa.
 */
create index if not exists idx_crc_patients_especialidade
  on public.crc_patients (organization_id, especialidade)
  where arquivado = false and especialidade is not null;

create index if not exists idx_crc_patients_convenio
  on public.crc_patients (organization_id, convenio)
  where arquivado = false and convenio is not null;

-- O keyset do congelamento de campanha percorre por `id` dentro do recorte.
create index if not exists idx_crc_patients_org_id
  on public.crc_patients (organization_id, id);

-- ----------------------------------------------------------------------------
-- 2. O ciclo da varredura passa a ser observável
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  O ALERTA QUE EU CRIEI NO `supabase/27` NÃO MEDIA O QUE PROMETIA.
--
--  Ele olhava `crc_scan_state.atualizado_em` e dizia "uma varredura não
--  completa uma volta há mais de dez dias". Mas `atualizado_em` muda A CADA
--  PÁGINA — então uma varredura que rasteja, avançando 200 pacientes por dia
--  numa base de 8.000, tem `atualizado_em` sempre fresco e nunca dispara nada.
--
--  Trinta dias sem fechar um ciclo, com o painel verde. O alerta existia para
--  tornar a correção do recall visível, e era exatamente tão cego quanto o
--  defeito que ela consertou.
--
--  TRÊS ESTADOS, E O MODELO PRECISA DISTINGUIR OS TRÊS:
--
--    PARADA        o cursor não anda           → `atualizado_em` antigo
--    CICLO LENTO   anda, mas a volta não fecha → `ciclo_iniciado_em` antigo
--    SAUDÁVEL      fecha na cadência esperada  → `ultimo_ciclo_completo_em` recente
--
--  Com uma coluna só era impossível separar a segunda da terceira.
-- ============================================================================
--
-- AS COLUNAS NASCEM NULAS e a PK não muda — é migration aditiva, e a lição do
-- `supabase/23` continua valendo: mudar chave é mudar contrato.
alter table public.crc_scan_state
  add column if not exists ciclo_iniciado_em timestamptz;

alter table public.crc_scan_state
  add column if not exists ultimo_ciclo_completo_em timestamptz;

/*
 * O BACKFILL É CONSERVADOR DE PROPÓSITO.
 *
 * `ciclo_iniciado_em` recebe `atualizado_em` — o instante mais recente que
 * conhecemos. Isso faz toda varredura existente parecer que acabou de começar o
 * ciclo, e não que está atrasada há semanas.
 *
 * É deliberado: a informação de quando o ciclo REALMENTE começou não existe, e
 * inventá-la para trás produziria um alarme na primeira volta depois da
 * migração — um alarme sobre um passado que ninguém pode verificar. O primeiro
 * ciclo depois daqui é medido de verdade.
 */
update public.crc_scan_state
   set ciclo_iniciado_em = coalesce(ciclo_iniciado_em, atualizado_em)
 where ciclo_iniciado_em is null;

insert into public.crc_schema_migrations (nome, presumido)
values ('29-crc-publico-e-ciclo.sql', false)
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
