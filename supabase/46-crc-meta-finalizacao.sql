-- ============================================================================
-- CRC — fechamento do Meta omnichannel: segredos, exclusão e analytics.
-- ============================================================================
--
-- Esta migração fecha três lacunas que ficaram declaradas no aceite do
-- supabase/45:
--
--   1. appSecret/verifyToken não podem permanecer em JSONB em claro;
--   2. o Data Deletion Callback da Meta precisa ter um caminho automático;
--   3. os fatos já gravados precisam virar analítica por canal, sem duplicar
--      uma segunda camada de tracking.
--
-- Idempotente. Rode depois do 45-crc-meta-omnichannel.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Segredos de aplicação não ficam em `crc_canais_meta.config`.
-- ----------------------------------------------------------------------------
--
-- O Page Access Token já é cifrado em `segredo_cifrado`. `appSecret` e
-- `verifyToken`, porém, podiam entrar pelo formulário e cair em `config` JSONB.
-- Para a JP existe UM Meta App: esses dois valores pertencem ao aplicativo e
-- ficam no ambiente (`META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN`).
--
-- O trigger é a defesa no banco: mesmo que uma versão antiga da aplicação tente
-- gravar os campos, eles são removidos ANTES do INSERT/UPDATE. Dados legados são
-- saneados logo abaixo.

update public.crc_canais_meta
   set config = coalesce(config, '{}'::jsonb) - 'appSecret' - 'verifyToken',
       atualizado_em = now()
 where coalesce(config, '{}'::jsonb) ? 'appSecret'
    or coalesce(config, '{}'::jsonb) ? 'verifyToken';

create or replace function public.crc_meta_sanitizar_config()
returns trigger
language plpgsql
as $corpo$
begin
  new.config := coalesce(new.config, '{}'::jsonb) - 'appSecret' - 'verifyToken';
  return new;
end $corpo$;

drop trigger if exists crc_meta_sanitizar_config on public.crc_canais_meta;
create trigger crc_meta_sanitizar_config
before insert or update of config on public.crc_canais_meta
for each row execute function public.crc_meta_sanitizar_config();

-- ----------------------------------------------------------------------------
-- 2. Data Deletion Callback.
-- ----------------------------------------------------------------------------
--
-- O `signed_request` chega antes de existir sessão de CRC e não traz um tenant
-- nosso. Por isso o pedido nasce numa tabela global, sem organization_id. O
-- processamento só apaga quando o identificador social resolve para EXATAMENTE
-- uma pessoa dentro do banco. Zero correspondências significa "não há dado
-- indexado por esse identificador"; duas ou mais significam REVISÃO e nada é
-- apagado. Nunca há merge/exclusão por nome, username, telefone parecido ou
-- qualquer heurística.

create table if not exists public.crc_meta_data_deletion_requests (
  id                uuid primary key default gen_random_uuid(),
  confirmation_code text not null unique,
  meta_user_id      text not null,
  status            text not null default 'RECEBIDO',
  detalhe           text,
  solicitado_em     timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  concluido_em      timestamptz,

  constraint crc_meta_data_deletion_status
    check (status in ('RECEBIDO', 'PROCESSANDO', 'CONCLUIDO', 'REVISAO', 'FALHOU'))
);

create index if not exists crc_meta_data_deletion_status_idx
  on public.crc_meta_data_deletion_requests (status, solicitado_em);

alter table public.crc_meta_data_deletion_requests enable row level security;

create or replace function public.crc_meta_registrar_exclusao(
  p_confirmation_code text,
  p_meta_user_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $corpo$
declare
  v_codigo text := trim(coalesce(p_confirmation_code, ''));
  v_usuario text := trim(coalesce(p_meta_user_id, ''));
begin
  if length(v_codigo) < 16 or length(v_usuario) = 0 then
    raise exception 'pedido de exclusão inválido';
  end if;

  insert into public.crc_meta_data_deletion_requests
    (confirmation_code, meta_user_id, status)
  values
    (v_codigo, v_usuario, 'RECEBIDO');

  return jsonb_build_object(
    'ok', true,
    'confirmation_code', v_codigo,
    'status', 'RECEBIDO'
  );
end $corpo$;

create or replace function public.crc_meta_status_exclusao(
  p_confirmation_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $corpo$
declare
  v_status text;
  v_detalhe text;
  v_solicitado timestamptz;
  v_concluido timestamptz;
begin
  select status, detalhe, solicitado_em, concluido_em
    into v_status, v_detalhe, v_solicitado, v_concluido
    from public.crc_meta_data_deletion_requests
   where confirmation_code = trim(coalesce(p_confirmation_code, ''));

  if not found then
    return jsonb_build_object('ok', false, 'status', 'NAO_ENCONTRADO');
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', v_status,
    'detalhe', coalesce(v_detalhe, ''),
    'solicitado_em', v_solicitado,
    'concluido_em', v_concluido
  );
end $corpo$;

create or replace function public.crc_meta_processar_exclusao(
  p_confirmation_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $corpo$
declare
  v_codigo text := trim(coalesce(p_confirmation_code, ''));
  v_usuario text;
  v_status text;
  v_quantidade integer := 0;
  v_org uuid;
  v_patient uuid;
begin
  select meta_user_id, status
    into v_usuario, v_status
    from public.crc_meta_data_deletion_requests
   where confirmation_code = v_codigo
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'NAO_ENCONTRADO');
  end if;

  if v_status = 'CONCLUIDO' then
    return jsonb_build_object('ok', true, 'status', 'CONCLUIDO');
  end if;

  update public.crc_meta_data_deletion_requests
     set status = 'PROCESSANDO', atualizado_em = now(), detalhe = null
   where confirmation_code = v_codigo;

  select count(*)::integer
    into v_quantidade
    from (
      select distinct organization_id, patient_id
        from public.crc_patient_identities
       where tipo = 'EXTERNAL_ID'
         and namespace in ('instagram', 'messenger')
         and valor = v_usuario
    ) x;

  if v_quantidade = 0 then
    update public.crc_meta_data_deletion_requests
       set status = 'CONCLUIDO',
           detalhe = 'Nenhum dado social indexado por este identificador foi encontrado.',
           concluido_em = now(),
           atualizado_em = now()
     where confirmation_code = v_codigo;

    return jsonb_build_object('ok', true, 'status', 'CONCLUIDO');
  end if;

  if v_quantidade > 1 then
    update public.crc_meta_data_deletion_requests
       set status = 'REVISAO',
           detalhe = 'O identificador resolve para mais de uma pessoa. Nada foi apagado automaticamente.',
           atualizado_em = now()
     where confirmation_code = v_codigo;

    return jsonb_build_object('ok', true, 'status', 'REVISAO');
  end if;

  select organization_id, patient_id
    into v_org, v_patient
    from public.crc_patient_identities
   where tipo = 'EXTERNAL_ID'
     and namespace in ('instagram', 'messenger')
     and valor = v_usuario
   limit 1;

  begin
    -- Comentários/private replies guardam o identificador social diretamente.
    delete from public.crc_social_events
     where organization_id = v_org
       and external_actor_id = v_usuario;

    delete from public.crc_private_replies
     where organization_id = v_org
       and external_actor_id = v_usuario;

    -- O log de contato pode conter um resumo do atendimento social.
    delete from public.crc_contact_log
     where organization_id = v_org
       and patient_id = v_patient
       and lower(canal) in ('instagram', 'messenger');

    -- Mensagens caem por cascade ao remover a conversa.
    delete from public.crc_conversations
     where organization_id = v_org
       and canal in ('instagram', 'messenger')
       and contato_externo = v_usuario;

    -- Remove somente a identidade social que originou o pedido. Telefone,
    -- e-mail, CPF e Dental Office permanecem intactos.
    delete from public.crc_patient_identities
     where organization_id = v_org
       and patient_id = v_patient
       and tipo = 'EXTERNAL_ID'
       and namespace in ('instagram', 'messenger')
       and valor = v_usuario;

    -- Lead Ads só é removido aqui quando já havia vínculo inequívoco ao mesmo
    -- paciente. Um formulário sem patient_id não é associado por aproximação.
    delete from public.crc_leads
     where organization_id = v_org
       and patient_id = v_patient
       and meta_lead_id is not null;

    update public.crc_meta_data_deletion_requests
       set status = 'CONCLUIDO',
           detalhe = 'Dados sociais vinculados de forma inequívoca foram removidos.',
           concluido_em = now(),
           atualizado_em = now()
     where confirmation_code = v_codigo;

    return jsonb_build_object('ok', true, 'status', 'CONCLUIDO');
  exception when others then
    update public.crc_meta_data_deletion_requests
       set status = 'FALHOU',
           detalhe = left('Falha interna ao aplicar a exclusão: ' || sqlerrm, 500),
           atualizado_em = now()
     where confirmation_code = v_codigo;

    return jsonb_build_object('ok', false, 'status', 'FALHOU');
  end;
end $corpo$;

-- ----------------------------------------------------------------------------
-- 3. Analítica por canal — fatos observados, sem inventar impressão/clique.
-- ----------------------------------------------------------------------------
--
-- `meta` em leads significa aquisição por Instant Form/Meta Ads; Instagram e
-- Messenger em conversas continuam separados porque são canais operacionais.
-- Gasto vem de `crc_ad_spend`, que é mensal e organizacional. Receita confirmada
-- vem de `crc_revenue_events` através da oportunidade do lead.

create or replace function public.crc_meta_analytics(
  p_organization_id uuid,
  p_clinic_ids uuid[] default null,
  p_dias integer default 30
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $corpo$
with parametros as (
  select
    greatest(1, least(coalesce(p_dias, 30), 365))::integer as dias,
    now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365))) as desde
),
lead_base as (
  select
    l.id,
    l.clinic_id,
    l.patient_id,
    l.primeira_resposta_em,
    coalesce(l.externo_criado_em, l.criado_em) as entrada_em,
    coalesce(nullif(l.campaign_nome, ''), nullif(l.utm_campaign, '')) as campanha,
    case
      when l.meta_lead_id is not null then 'meta'
      when upper(coalesce(l.origem, '')) = 'INSTAGRAM' then 'instagram'
      when upper(coalesce(l.origem, '')) = 'WHATSAPP' then 'whatsapp'
      when upper(coalesce(l.origem, '')) = 'META' then 'meta'
      when upper(coalesce(l.origem, '')) = 'GOOGLE' then 'google'
      when lower(coalesce(l.utm_source, '')) like '%google%' then 'google'
      when lower(coalesce(l.utm_source, '')) in ('instagram', 'facebook', 'meta') then 'meta'
      else lower(coalesce(nullif(l.origem, ''), 'desconhecido'))
    end as canal
  from public.crc_leads l
  cross join parametros p
  where l.organization_id = p_organization_id
    and coalesce(l.externo_criado_em, l.criado_em) >= p.desde
    and (p_clinic_ids is null or l.clinic_id = any(p_clinic_ids))
),
conversa_agg as (
  select
    lower(c.canal) as canal,
    count(distinct c.id)::integer as conversas,
    count(m.id) filter (where m.direcao = 'ENTRADA')::integer as entradas,
    count(m.id) filter (where m.direcao = 'SAIDA')::integer as saidas
  from public.crc_conversations c
  cross join parametros p
  left join public.crc_messages m
    on m.conversation_id = c.id
   and m.organization_id = c.organization_id
   and m.criado_em >= p.desde
  where c.organization_id = p_organization_id
    and coalesce(c.ultima_mensagem_em, c.criado_em) >= p.desde
    and (p_clinic_ids is null or c.clinic_id = any(p_clinic_ids))
  group by lower(c.canal)
),
lead_agg as (
  select
    canal,
    count(*)::integer as leads,
    round(avg(
      greatest(0, extract(epoch from (primeira_resposta_em - entrada_em)))
    ) filter (where primeira_resposta_em is not null))::integer as primeira_resposta_segundos
  from lead_base
  group by canal
),
receita_por_oportunidade as (
  select
    r.opportunity_id,
    sum(r.valor) filter (where r.natureza = 'CONFIRMADA') as confirmada
  from public.crc_revenue_events r
  where r.organization_id = p_organization_id
    and r.opportunity_id is not null
  group by r.opportunity_id
),
oportunidade_agg as (
  select
    l.canal,
    count(o.id)::integer as oportunidades,
    count(o.id) filter (where s.categoria = 'GANHA')::integer as ganhas,
    count(o.id) filter (where s.categoria = 'PERDIDA')::integer as perdidas,
    count(o.id) filter (where coalesce(s.categoria, 'ABERTA') = 'ABERTA')::integer as abertas,
    coalesce(sum(o.potential_value), 0)::numeric as potencial,
    coalesce(sum(r.confirmada), 0)::numeric as receita_confirmada
  from lead_base l
  join public.crc_opportunities o
    on o.organization_id = p_organization_id
   and o.lead_id = l.id
  left join public.crc_opportunity_stages s on s.id = o.stage_id
  left join receita_por_oportunidade r on r.opportunity_id = o.id
  group by l.canal
),
gasto_agg as (
  select
    case upper(coalesce(a.canal, 'OUTRO'))
      when 'META' then 'meta'
      when 'GOOGLE' then 'google'
      else lower(coalesce(a.canal, 'outro'))
    end as canal,
    coalesce(sum(a.valor), 0)::numeric as valor
  from public.crc_ad_spend a
  cross join parametros p
  where a.organization_id = p_organization_id
    and a.mes >= date_trunc('month', p.desde)::date
  group by 1
),
campanha_agg as (
  select
    canal,
    campanha,
    count(*)::integer as leads
  from lead_base
  where campanha is not null
  group by canal, campanha
  order by count(*) desc, campanha
  limit 12
)
select jsonb_build_object(
  'periodoDias', (select dias from parametros),
  'geradoEm', now(),
  'conversas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'canal', canal,
      'conversas', conversas,
      'entradas', entradas,
      'saidas', saidas
    ) order by conversas desc)
    from conversa_agg
  ), '[]'::jsonb),
  'leads', coalesce((
    select jsonb_agg(jsonb_build_object(
      'canal', canal,
      'leads', leads,
      'primeiraRespostaSegundos', primeira_resposta_segundos
    ) order by leads desc)
    from lead_agg
  ), '[]'::jsonb),
  'oportunidades', coalesce((
    select jsonb_agg(jsonb_build_object(
      'canal', canal,
      'oportunidades', oportunidades,
      'ganhas', ganhas,
      'perdidas', perdidas,
      'abertas', abertas,
      'potencial', potencial,
      'receitaConfirmada', receita_confirmada
    ) order by oportunidades desc)
    from oportunidade_agg
  ), '[]'::jsonb),
  'gasto', coalesce((
    select jsonb_agg(jsonb_build_object('canal', canal, 'valor', valor) order by valor desc)
    from gasto_agg
  ), '[]'::jsonb),
  'campanhas', coalesce((
    select jsonb_agg(jsonb_build_object('canal', canal, 'campanha', campanha, 'leads', leads) order by leads desc)
    from campanha_agg
  ), '[]'::jsonb)
)
$corpo$;

-- As funções são backend-only. Funções SECURITY DEFINER não ficam executáveis
-- por PUBLIC/anon por acidente.
revoke all on function public.crc_meta_registrar_exclusao(text, text) from public;
revoke all on function public.crc_meta_status_exclusao(text) from public;
revoke all on function public.crc_meta_processar_exclusao(text) from public;
revoke all on function public.crc_meta_analytics(uuid, uuid[], integer) from public;

-- ----------------------------------------------------------------------------
-- Privilégios explícitos para instalações que não herdaram default privileges.
-- ----------------------------------------------------------------------------
do $privilegios$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.crc_meta_data_deletion_requests to service_role';
    execute 'grant execute on function public.crc_meta_registrar_exclusao(text,text) to service_role';
    execute 'grant execute on function public.crc_meta_status_exclusao(text) to service_role';
    execute 'grant execute on function public.crc_meta_processar_exclusao(text) to service_role';
    execute 'grant execute on function public.crc_meta_analytics(uuid,uuid[],integer) to service_role';
  end if;
end $privilegios$;
