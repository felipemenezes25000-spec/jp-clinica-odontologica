-- ============================================================================
-- CRC — Metas: o objetivo do dono virando trabalho do sistema.  (FASE C)
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
-- ============================================================================
--
--  A FRASE QUE ESTE MÓDULO EXISTE PARA ATENDER:
--
--      "Quero aumentar a ocupação da agenda para 90% na próxima semana."
--
--  E o que ele NÃO faz é inventar capacidade nova. Ele ORQUESTRA o que o CRC já
--  sabe fazer: campanha, recall, encaixe, follow-up de orçamento. Uma meta é um
--  plano que aponta para módulos existentes, com um número esperado em cada um.
--
--  Se fosse outra coisa, seria um segundo motor — e o §1 proíbe.
--
-- ============================================================================
--  TRÊS TABELAS, E NÃO CINCO.
--
--  O §13 lista `crc_goals`, `crc_goal_plans`, `crc_goal_actions`,
--  `crc_goal_metrics` e `crc_goal_runs`.
--
--  `goal_plans` e `goal_actions` seriam a mesma coisa: um plano É o conjunto de
--  ações de uma versão. A versão cabe numa coluna. Uma tabela de planos com uma
--  linha por versão, apontada por outra tabela de ações, é um join a mais em
--  toda leitura para guardar um inteiro.
--
--  `goal_runs` e `goal_metrics` também: uma execução do monitoramento PRODUZ uma
--  medição. Separá-las daria uma tabela de execuções cujo único conteúdo é o
--  carimbo de quando a outra foi escrita.
--
--  O §132 é explícito: entregar a fatia funcional, não trinta abstrações
--  vazias. A diferença está documentada aqui em vez de ser silenciosa.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A meta
-- ----------------------------------------------------------------------------
create table if not exists public.crc_goals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,

  titulo          text not null,

  /*
   * O TIPO É FECHADO, e o motivo é que cada um sabe se MEDIR sozinho.
   *
   * Uma meta que o sistema não sabe medir é uma anotação, não uma meta — e
   * deixar o usuário digitar "aumentar a satisfação" produziria exatamente isso:
   * uma linha que nunca sai de 0% porque ninguém definiu o que ela conta.
   *
   * OCUPACAO_AGENDA | RECEITA_RECUPERADA | AGENDAMENTOS | CONVERSAO_ORCAMENTO |
   * REDUZIR_FALTAS | REATIVAR_PACIENTES
   */
  tipo            text not null,

  /*
   * ONDE ESTÁVAMOS QUANDO A META FOI CRIADA.
   *
   * Sem baseline não existe progresso: "chegamos a 72% de ocupação" só
   * significa alguma coisa ao lado de "começamos em 61%". E o baseline precisa
   * ser CONGELADO na criação — recalculá-lo depois faria a meta se mover junto
   * com o resultado, e o progresso seria sempre zero.
   */
  baseline        numeric(14,2) not null,
  baseline_em     timestamptz not null default now(),

  alvo            numeric(14,2) not null,
  -- 'PERCENTUAL' | 'REAIS' | 'QUANTIDADE'. Decide como a tela formata, e
  -- impede somar percentual com dinheiro num painel.
  unidade         text not null default 'QUANTIDADE',

  prazo_em        timestamptz not null,

  -- RASCUNHO | ATIVA | PAUSADA | ATINGIDA | VENCIDA | CANCELADA
  status          text not null default 'RASCUNHO',

  /*
   * OS LIMITES, GUARDADOS NA META.
   *
   * "Vou preencher a agenda" sem teto é uma licença para disparar mensagem para
   * a base inteira. Estes números viajam junto do plano e são conferidos na
   * execução — e ficam VISÍVEIS na tela de aprovação, que é onde o dono
   * realmente decide se autoriza.
   */
  max_contatos_dia integer not null default 100,
  -- Nível de autonomia MÁXIMO que esta meta pode usar, independente do que o
  -- Centro de Autonomia permita. É o freio da própria meta.
  max_autonomia   integer not null default 2,

  -- O último progresso medido, desnormalizado para a listagem não precisar de
  -- subconsulta. Escrito por um lugar só: `medirMeta`.
  progresso_atual numeric(14,2),
  medido_em       timestamptz,

  criado_por      uuid references public.crc_users(id) on delete set null,
  aprovado_por    uuid references public.crc_users(id) on delete set null,
  aprovado_em     timestamptz,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  constraint crc_goals_autonomia_valida check (max_autonomia between 0 and 5),
  constraint crc_goals_prazo_futuro check (prazo_em > criado_em)
);

create index if not exists idx_crc_goals_ativas
  on public.crc_goals (organization_id, clinic_id, prazo_em)
  where status = 'ATIVA';

-- ----------------------------------------------------------------------------
-- 2. As ações do plano
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  CADA AÇÃO APONTA PARA UM MÓDULO QUE JÁ EXISTE.
--
--    ENCAIXE   → `crc_schedule_gaps`, a agenda inteligente
--    RECALL    → a varredura de retorno
--    CAMPANHA  → `crc_campaigns`
--    FUNIL     → o follow-up de orçamento
--    FALTAS    → a confirmação e o risco de falta
--
--  `contribuicao_estimada` é quanto se espera que ESSA ação entregue da meta.
--  A soma delas é a previsão do plano — e é ela que a tela mostra antes de
--  alguém aprovar, porque "vou tentar chegar a 90%" sem previsão não é um plano.
-- ============================================================================
create table if not exists public.crc_goal_actions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  goal_id         uuid not null references public.crc_goals(id) on delete cascade,

  -- A VERSÃO DO PLANO. É o que substitui `crc_goal_plans`: replanejar cria
  -- ações da versão seguinte, e as anteriores ficam para comparação.
  versao          integer not null default 1,

  -- ENCAIXE | RECALL | CAMPANHA | FUNIL | FALTAS | HUMANO
  modulo          text not null,
  titulo          text not null,
  descricao       text,

  -- Quanto se espera desta ação, na unidade da meta.
  contribuicao_estimada numeric(14,2) not null default 0,
  -- 0..1 — quanta confiança nessa estimativa. Baixa por padrão: no primeiro
  -- ciclo não há histórico para calibrar.
  confianca       numeric(4,3) not null default 0.2,

  -- Quantas pessoas esta ação pretende contatar. Somado, respeita o teto da meta.
  alcance_estimado integer not null default 0,

  -- PLANEJADA | APROVADA | EM_ANDAMENTO | CONCLUIDA | BLOQUEADA | DESCARTADA
  status          text not null default 'PLANEJADA',

  -- O resultado medido depois. Nulo enquanto não houver desfecho — e a
  -- diferença entre estimado e realizado é o que calibra o próximo plano.
  contribuicao_real numeric(14,2),

  ordem           integer not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists idx_crc_goal_actions_meta
  on public.crc_goal_actions (goal_id, versao, ordem);

-- ----------------------------------------------------------------------------
-- 3. A medição ao longo do tempo
-- ----------------------------------------------------------------------------
--
-- Uma linha por medição. É a série que responde "estamos no ritmo?" — e a
-- pergunta só tem resposta com mais de um ponto.
create table if not exists public.crc_goal_metrics (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  goal_id         uuid not null references public.crc_goals(id) on delete cascade,

  valor           numeric(14,2) not null,
  /*
   * O RITMO NECESSÁRIO NAQUELE INSTANTE.
   *
   * Guardado junto porque ele MUDA: com dez dias restantes e metade do caminho,
   * o ritmo exigido é diferente do que era no começo. Recalculá-lo depois, na
   * tela, daria o ritmo de hoje aplicado a uma medição de ontem — e o gráfico
   * de "estávamos atrasados?" mentiria sobre o passado.
   */
  ritmo_necessario numeric(14,4),
  -- NO_RITMO | ATRASADA | ADIANTADA | ATINGIDA
  situacao        text not null default 'NO_RITMO',

  medido_em       timestamptz not null default now(),

  -- Uma medição por meta por dia. A varredura roda mais de uma vez; sem a
  -- chave, a série teria uma linha por execução e o gráfico viraria ruído.
  chave_dedupe    text not null
);

create unique index if not exists crc_goal_metrics_dedupe
  on public.crc_goal_metrics (organization_id, chave_dedupe);

create index if not exists idx_crc_goal_metrics_serie
  on public.crc_goal_metrics (goal_id, medido_em desc);

insert into public.crc_schema_migrations (nome, presumido)
values ('34-crc-metas.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();

-- ----------------------------------------------------------------------------
-- RLS e privilégios
-- ----------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array['crc_goals','crc_goal_actions','crc_goal_metrics']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $rls$;

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
