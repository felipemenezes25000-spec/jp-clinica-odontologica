-- ============================================================================
-- CRC AI OS — Fatia 8: gateway de modelos, chave da própria clínica, orçamento
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A credencial da clínica (BYOK)
-- ----------------------------------------------------------------------------
--
-- O SEGREDO ENTRA CIFRADO, E A CHAVE DE CIFRA NÃO ESTÁ NO BANCO.
--
-- `segredo_cifrado` é AES-256-GCM com chave em variável de ambiente do servidor
-- (`CRC_SEGREDO_CHAVE`). O que isto protege é um cenário concreto: um dump do
-- banco, um backup vazado, um `select *` de alguém com acesso de leitura. Nesses
-- casos a coluna é ruído.
--
-- O QUE ISTO NÃO PROTEGE, e está escrito aqui para ninguém se enganar: o
-- servidor da aplicação pode decifrar, porque é o trabalho dele. Quem tiver o
-- ambiente do servidor tem as chaves das clínicas. Não existe BYOK em SaaS que
-- resolva isso sem um HSM por cliente.
--
-- E O PREFIXO FICA EM CLARO de propósito: `sk-proj-...abcd` na tela é como uma
-- pessoa confere que colou a chave certa sem ninguém precisar decifrar nada.
create table if not exists public.crc_ai_credentials (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,

  -- 'openai' | 'anthropic'
  provedor        text not null,
  -- Como a pessoa chama esta chave. "Conta da clínica", "chave do contador"…
  apelido         text not null,

  segredo_cifrado text not null,
  -- Primeiros e últimos caracteres, para conferência visual. Nunca o meio.
  dica            text not null,

  -- ATIVA | REVOGADA
  status          text not null default 'ATIVA',

  criado_por      uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  ultimo_uso_em   timestamptz,

  -- Uma chave ativa por provedor por clínica. Duas seria uma pergunta sem
  -- resposta: qual das duas o gateway usa?
  unique (organization_id, provedor, apelido)
);

create index if not exists idx_crc_ai_credentials_ativa
  on public.crc_ai_credentials (organization_id, provedor, status);

-- ----------------------------------------------------------------------------
-- 2. O roteamento por finalidade
-- ----------------------------------------------------------------------------
--
-- POR QUE POR FINALIDADE, E NÃO UM MODELO SÓ.
--
-- As quatro tarefas de IA do CRC têm exigências opostas. Classificar mensagem
-- curta é volume alto e tolera modelo pequeno. Conversar com paciente é a única
-- que o paciente lê. Supervisionar roda depois do fato e pode ser o mais barato
-- que existir. Embedding é outra família de modelo.
--
-- Um modelo único para as quatro significa pagar o preço da conversa em toda
-- classificação, ou aceitar a qualidade da classificação na conversa.
create table if not exists public.crc_ai_bindings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,

  -- 'conversa' | 'classificacao' | 'supervisor' | 'embeddings'
  finalidade      text not null,
  provedor        text not null,
  modelo          text not null,
  -- Nula = usa a chave da plataforma. Preenchida = chave da clínica.
  credential_id   uuid references public.crc_ai_credentials(id) on delete set null,
  max_tokens      integer,

  atualizado_em   timestamptz not null default now(),

  -- Uma rota por finalidade. Ver o comentário acima: duas seria ambiguidade.
  unique (organization_id, finalidade)
);

-- ----------------------------------------------------------------------------
-- 3. O orçamento
-- ----------------------------------------------------------------------------
--
-- EM MICRO-REAIS INTEIROS, e não em `numeric` de reais.
--
-- É a mesma decisão de `dominio/custo.ts`, tomada pelo mesmo motivo: somar
-- centavos em ponto flutuante inventa centavo. `200 * 0.034` dá
-- 6.800000000000001 em JavaScript, e um teto comparado contra isso recusa
-- chamada um centavo antes ou depois do que a pessoa configurou.
--
-- 1 real = 1.000.000 micro-reais. `bigint` porque um ano de operação de uma
-- clínica passa de 2^31 micro-reais.
create table if not exists public.crc_ai_orcamentos (
  organization_id uuid primary key references public.crc_organizations(id) on delete cascade,

  -- Nulo = sem teto. Zero = tudo bloqueado (é um jeito legítimo de desligar).
  teto_dia_micro  bigint,
  teto_mes_micro  bigint,

  -- Quando o teto é atingido, o turno vira caso humano em vez de erro (ADR-12).
  -- Esta coluna existe para uma clínica poder escolher o oposto: parar quieto.
  abrir_caso      boolean not null default true,

  atualizado_em   timestamptz not null default now()
);

-- O gasto, em baldes diários.
--
-- UM BALDE POR DIA, e não uma linha por chamada. A verificação acontece ANTES de
-- cada chamada de modelo (ADR-12), então ela precisa ser barata: somar 31 linhas
-- é barato, somar 40 mil chamadas do mês não é.
--
-- As chamadas individuais continuam em `crc_ai_runs` e `crc_ai_calls`, que é
-- onde se investiga "por que gastou tanto". Aqui é só o contador.
create table if not exists public.crc_ai_gastos (
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  dia             date not null,
  micro_reais     bigint not null default 0,
  chamadas        integer not null default 0,
  atualizado_em   timestamptz not null default now(),

  primary key (organization_id, dia)
);

-- ----------------------------------------------------------------------------
-- 4. A soma atômica
-- ----------------------------------------------------------------------------
--
-- PRECISA SER FUNÇÃO, e não upsert do PostgREST: `micro_reais = micro_reais + x`
-- não se expressa em `resolution=merge-duplicates`. Fazer leitura-soma-escrita na
-- aplicação perderia gasto sempre que dois turnos terminassem no mesmo
-- milissegundo — que é o caso normal num horário de pico.
create or replace function public.crc_somar_gasto(
  p_organization_id uuid,
  p_dia             date,
  p_micro           bigint
)
returns table (dia_micro bigint, chamadas_dia integer)
language plpgsql
as $$
begin
  insert into public.crc_ai_gastos (organization_id, dia, micro_reais, chamadas, atualizado_em)
  values (p_organization_id, p_dia, greatest(p_micro, 0), 1, now())
  on conflict (organization_id, dia) do update
    set micro_reais   = public.crc_ai_gastos.micro_reais + greatest(p_micro, 0),
        chamadas      = public.crc_ai_gastos.chamadas + 1,
        atualizado_em = now();

  return query
    select g.micro_reais, g.chamadas
    from public.crc_ai_gastos g
    where g.organization_id = p_organization_id and g.dia = p_dia;
end;
$$;

alter table public.crc_ai_credentials enable row level security;
alter table public.crc_ai_bindings    enable row level security;
alter table public.crc_ai_orcamentos  enable row level security;
alter table public.crc_ai_gastos      enable row level security;
