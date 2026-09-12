-- ============================================================================
-- CRC — dá para responder "o agente parou, por quê?" sem abrir o log da Vercel.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
--
-- DUAS PERGUNTAS OPERACIONAIS QUE O SISTEMA NÃO SABIA RESPONDER:
--
--   "O PULSO ESTÁ VIVO?"   O caminho rápido do CRC é webhook → `tocarPulso()` →
--                          `/api/crc/pulso`, com o GitHub Actions como rede. Se
--                          os DOIS pararem, o sintoma é silêncio: a fila enche
--                          devagar e ninguém é avisado. O painel de Saúde
--                          mostrava "há pacientes esperando há 40 minutos" e
--                          mandava conferir `/api/crc/motor` — que é o worker
--                          errado.
--
--   "ESTE BANCO TEM O SCHEMA QUE ESTE CÓDIGO ESPERA?"  Não havia registro
--                          nenhum. O deploy dependia de alguém lembrar se rodou
--                          o SQL — e o `supabase/23` provou o custo disso: o
--                          código foi para produção esperando uma chave que o
--                          banco ainda não tinha.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O batimento dos workers
-- ----------------------------------------------------------------------------
--
-- A CHAVE É SÓ O `worker`, E ISSO É DELIBERADO.
--
-- A tentação é `primary key (worker, organization_id)`, para ter um batimento
-- por tenant. Duas coisas contra:
--
--   O PULSO É GLOBAL. Ele reserva eventos e turnos sem filtrar organização —
--   uma volta atende todo mundo. Um batimento por tenant registraria N vezes o
--   mesmo fato.
--
--   PK COM COLUNA NULA NÃO EXISTE no Postgres, e o `organization_id` seria nulo
--   justamente no caso global. Foi exatamente essa a armadilha do `supabase/23`
--   — que a resolveu com uma coluna GERADA e cobrou o preço todo dia, até o
--   `supabase/24` desfazer. Não repetir.
--
-- O que é POR ORGANIZAÇÃO vai em `metricas`, que é jsonb e não precisa de chave.
create table if not exists public.crc_runtime_heartbeats (
  -- 'pulso' | 'motor'. Texto e não enum: acrescentar worker não pode exigir
  -- migração de tipo.
  worker            text primary key,

  ultimo_inicio_em  timestamptz,
  /*
   * O CAMPO QUE O PAINEL LÊ. "Começou" não é notícia — um worker que começa e
   * morre no meio, a cada cinco minutos, tem `ultimo_inicio_em` sempre fresco e
   * não está fazendo nada.
   */
  ultimo_sucesso_em timestamptz,
  ultimo_erro_em    timestamptz,
  ultimo_erro       text,
  duracao_ms        integer,

  /*
   * O RESUMO DA ÚLTIMA VOLTA: quantos eventos, turnos, webhooks, campanhas.
   *
   * Serve para a pergunta seguinte à do painel — "o pulso está vivo, então por
   * que a fila não anda?". Um pulso vivo com `turnos: 0` e fila cheia é um
   * problema diferente de um pulso morto, e sem isto os dois têm a mesma cara.
   */
  metricas          jsonb not null default '{}'::jsonb,
  atualizado_em     timestamptz not null default now()
);

alter table public.crc_runtime_heartbeats enable row level security;

/*
 * O REGISTRO É UMA RPC, e não dois `update` do código.
 *
 * Porque são duas escritas com significados diferentes — "comecei" e "terminei
 * bem" — e elas precisam não se atropelar: um erro não pode apagar o
 * `ultimo_sucesso_em`, que é justamente o campo que diz há quanto tempo o
 * sistema funciona. `coalesce` em cada linha é o que garante isso.
 */
create or replace function public.crc_bater_heartbeat(
  p_worker      text,
  -- 'inicio' | 'sucesso' | 'erro'
  p_fase        text,
  p_erro        text default null,
  p_duracao_ms  integer default null,
  p_metricas    jsonb default null
)
returns void
language plpgsql
as $corpo$
begin
  insert into public.crc_runtime_heartbeats (
    worker, ultimo_inicio_em, ultimo_sucesso_em, ultimo_erro_em, ultimo_erro,
    duracao_ms, metricas, atualizado_em
  )
  values (
    p_worker,
    case when p_fase = 'inicio'  then now() end,
    case when p_fase = 'sucesso' then now() end,
    case when p_fase = 'erro'    then now() end,
    case when p_fase = 'erro'    then left(p_erro, 500) end,
    p_duracao_ms,
    coalesce(p_metricas, '{}'::jsonb),
    now()
  )
  on conflict (worker) do update set
    ultimo_inicio_em  = coalesce(excluded.ultimo_inicio_em,  public.crc_runtime_heartbeats.ultimo_inicio_em),
    -- O SUCESSO NÃO É APAGADO POR UM ERRO. É ele que responde "há quanto tempo
    -- isto funciona", e zerá-lo no primeiro soluço perderia a única medida útil.
    ultimo_sucesso_em = coalesce(excluded.ultimo_sucesso_em, public.crc_runtime_heartbeats.ultimo_sucesso_em),
    ultimo_erro_em    = coalesce(excluded.ultimo_erro_em,    public.crc_runtime_heartbeats.ultimo_erro_em),
    ultimo_erro       = case when p_fase = 'erro' then left(p_erro, 500)
                             -- O erro ANTIGO é preservado no sucesso: "funcionou
                             -- agora, e a última falha foi esta" é mais útil do
                             -- que um campo que se limpa sozinho.
                             else public.crc_runtime_heartbeats.ultimo_erro end,
    duracao_ms        = coalesce(excluded.duracao_ms,        public.crc_runtime_heartbeats.duracao_ms),
    metricas          = case when p_metricas is null then public.crc_runtime_heartbeats.metricas
                             else p_metricas end,
    atualizado_em     = now();
end $corpo$;

-- ----------------------------------------------------------------------------
-- 2. O registro de migrações
-- ----------------------------------------------------------------------------
--
-- "ACHO QUE ALGUÉM RODOU ESSE SQL" NÃO É ESTADO DE DEPLOY.
--
-- Este projeto aplica schema à mão, por decisão — e o custo apareceu no
-- `supabase/23`: o código subiu esperando uma chave primária que o banco ainda
-- não tinha, e só não quebrou em produção porque a integração que usaria o
-- caminho estava desligada.
--
-- ESTA TABELA É BOOKKEEPING, E BOOKKEEPING MENTE. Uma linha dizendo "aplicado"
-- não prova que a coluna existe — prova que alguém (ou algum arquivo) escreveu
-- a linha. Por isso o `npm run schema:status` NÃO confia nela sozinha: ele
-- SONDA o banco atrás dos objetos que cada migração cria. A tabela responde
-- "o que dizem que foi aplicado"; a sonda responde "o que está lá".
--
-- Quando as duas discordam, a sonda vence — e a discordância em si é o alarme.
create table if not exists public.crc_schema_migrations (
  -- O nome do arquivo, exatamente como está em `supabase/`.
  nome        text primary key,
  aplicado_em timestamptz not null default now(),
  /*
   * `true` = ninguém viu esta migração rodar; foi assumida.
   *
   * As migrações 00 a 26 já estavam em produção quando esta tabela nasceu.
   * Marcá-las como observadas seria inventar uma evidência que não existe. A
   * coluna deixa a diferença visível em vez de dissolvê-la.
   */
  presumido   boolean not null default false
);

alter table public.crc_schema_migrations enable row level security;

/*
 * O BACKFILL, e o que ele afirma e o que NÃO afirma.
 *
 * Afirma: se você está rodando o arquivo 27, os 00..26 vieram antes — eles são
 * sequenciais e o procedimento é aplicá-los em ordem.
 *
 * Não afirma: que cada um deles completou. É exatamente por isso que as linhas
 * nascem com `presumido = true`, e que o `schema:status` sonda em vez de ler.
 */
insert into public.crc_schema_migrations (nome, presumido)
select nome, true
  from unnest(array[
    '00-papeis.sql','01-schema.sql','02-crc-schema.sql','03-crc-cobranca.sql',
    '04-crc-visoes.sql','05-crc-investimento.sql','06-crc-campanhas.sql',
    '07-crc-convenio.sql','08-crc-agendamento.sql','09-crc-ia-platform.sql',
    '10-crc-casos-humanos.sql','11-crc-memoria-supervisor.sql',
    '12-crc-conhecimento.sql','13-crc-modelos-orcamento.sql','14-crc-avaliacao.sql',
    '15-crc-estudio.sql','16-crc-foto-de-perfil.sql','17-crc-agent-jobs.sql',
    '18-crc-atomicidade.sql','19-crc-integridade-tenant.sql',
    '20-crc-reclaim-da-run.sql','21-crc-webhook-inbox.sql','22-crc-heartbeat.sql',
    '23-crc-canais-whatsapp.sql','24-crc-cursor-por-clinica.sql',
    '25-crc-retry-atomico-e-tenant-no-inbox.sql',
    '26-crc-varreduras-convergentes.sql'
  ]) as nome
on conflict (nome) do nothing;

-- Esta, sim, foi observada: ela está rodando agora.
insert into public.crc_schema_migrations (nome, presumido)
values ('27-crc-observabilidade.sql', false)
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
