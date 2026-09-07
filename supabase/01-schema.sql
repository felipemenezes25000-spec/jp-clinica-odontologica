-- ============================================================================
-- Portal de RH da JP Clínica Integrada Odontológica — schema no Supabase
--
-- Cole este arquivo inteiro no SQL Editor do Supabase e rode uma vez:
--   https://supabase.com/dashboard/project/buxylpysrtybutjmkwtd/sql/new
--
-- É idempotente: rodar de novo não quebra nada nem apaga dado.
--
-- POR QUE `dados jsonb` EM VEZ DE UMA COLUNA POR CAMPO
-- A Candidatura já mudou de forma três vezes durante o desenvolvimento (ganhou
-- vaga, depois análise da IA, depois ficha de entrevista). Com uma coluna por
-- campo, cada mudança dessas vira migração de banco e um deploy sincronizado
-- com o código. Com o objeto inteiro em jsonb, o TypeScript continua sendo a
-- única fonte da verdade sobre o formato, e o banco não precisa saber.
-- O preço disso seria perder filtro e índice — que a gente recupera abaixo com
-- colunas GERADAS a partir do próprio jsonb. Elas são só espelho: ninguém
-- escreve nelas, o Postgres as mantém sozinho.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CANDIDATURAS
-- ----------------------------------------------------------------------------
create table if not exists public.rh_candidaturas (
  id            text primary key,
  dados         jsonb not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  protocolo    text generated always as (dados ->> 'protocolo') stored,
  status       text generated always as (dados ->> 'status') stored,
  area         text generated always as (dados ->> 'area') stored,
  vaga_id      text generated always as (dados ->> 'vagaId') stored,
  hash_arquivo text generated always as (dados ->> 'hashArquivo') stored,
  arquivada    boolean generated always as ((dados ->> 'arquivada')::boolean) stored
);

create index if not exists rh_candidaturas_criado_em_idx on public.rh_candidaturas (criado_em desc);
create index if not exists rh_candidaturas_status_idx    on public.rh_candidaturas (status);
create index if not exists rh_candidaturas_area_idx      on public.rh_candidaturas (area);
create index if not exists rh_candidaturas_vaga_idx      on public.rh_candidaturas (vaga_id);

-- Deduplicação de currículo por conteúdo, garantida pelo banco e não só pelo
-- código: dois processos importando a mesma pasta ao mesmo tempo não conseguem
-- criar a mesma pessoa duas vezes. O índice ignora hash vazio (candidatura sem
-- anexo, que veio pelo site).
create unique index if not exists rh_candidaturas_hash_uk
  on public.rh_candidaturas (hash_arquivo)
  where hash_arquivo is not null and hash_arquivo <> '';

-- ----------------------------------------------------------------------------
-- VAGAS
-- ----------------------------------------------------------------------------
create table if not exists public.rh_vagas (
  id            text primary key,
  dados         jsonb not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  slug   text generated always as (dados ->> 'slug') stored,
  status text generated always as (dados ->> 'status') stored,
  area   text generated always as (dados ->> 'area') stored
);

-- O slug é o endereço público da vaga (/carreiras/<slug>). Duas vagas com o
-- mesmo slug fariam uma sumir do site sem aviso.
create unique index if not exists rh_vagas_slug_uk on public.rh_vagas (slug);
create index if not exists rh_vagas_status_idx     on public.rh_vagas (status);

-- ----------------------------------------------------------------------------
-- GUIAS DE ENTREVISTA
-- ----------------------------------------------------------------------------
create table if not exists public.rh_guias (
  id            text primary key,
  dados         jsonb not null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  slug    text generated always as (dados ->> 'slug') stored,
  area    text generated always as (dados ->> 'area') stored,
  vaga_id text generated always as (dados ->> 'vagaId') stored,
  padrao  boolean generated always as ((dados ->> 'padrao')::boolean) stored
);

create index if not exists rh_guias_area_idx on public.rh_guias (area);

-- ----------------------------------------------------------------------------
-- CONFIGURAÇÕES E RANKINGS (chave → objeto)
-- ----------------------------------------------------------------------------
create table if not exists public.rh_chave_valor (
  chave         text primary key,
  dados         jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CONTADOR DE PROTOCOLO
--
-- O número do protocolo é o que a candidata guarda para falar com a clínica.
-- Dois envios simultâneos NÃO podem receber o mesmo número. No disco isso era
-- resolvido por uma fila em memória, que só funciona dentro de um processo — na
-- Vercel, com várias instâncias, ela não vale nada. Aqui quem garante é o
-- Postgres, com um UPDATE atômico.
-- ----------------------------------------------------------------------------
create table if not exists public.rh_protocolos (
  ano    integer primary key,
  ultimo integer not null default 0
);

create or replace function public.rh_proximo_protocolo(p_ano integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proximo integer;
begin
  insert into public.rh_protocolos (ano, ultimo)
       values (p_ano, 1)
  on conflict (ano)
    do update set ultimo = public.rh_protocolos.ultimo + 1
  returning ultimo into v_proximo;
  return v_proximo;
end;
$$;

-- ----------------------------------------------------------------------------
-- SEGURANÇA
--
-- RLS ligado em tudo e NENHUMA policy criada. Isso não é esquecimento: sem
-- policy, ninguém passa — exceto a service_role, que ignora RLS por definição e
-- só existe no servidor. Ou seja, a chave `anon` que vai no navegador não lê
-- currículo, não lê CPF, não lê nada. Se um dia alguém precisar de acesso pelo
-- cliente, a policy tem que ser escrita de propósito, e não herdada por acidente.
-- ----------------------------------------------------------------------------
alter table public.rh_candidaturas enable row level security;
alter table public.rh_vagas        enable row level security;
alter table public.rh_guias        enable row level security;
alter table public.rh_chave_valor  enable row level security;
alter table public.rh_protocolos   enable row level security;

revoke all on public.rh_candidaturas from anon, authenticated;
revoke all on public.rh_vagas        from anon, authenticated;
revoke all on public.rh_guias        from anon, authenticated;
revoke all on public.rh_chave_valor  from anon, authenticated;
revoke all on public.rh_protocolos   from anon, authenticated;

revoke execute on function public.rh_proximo_protocolo(integer) from anon, authenticated;

-- ----------------------------------------------------------------------------
-- CARIMBO DE ATUALIZAÇÃO
-- ----------------------------------------------------------------------------
create or replace function public.rh_toca_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists rh_candidaturas_touch on public.rh_candidaturas;
create trigger rh_candidaturas_touch before update on public.rh_candidaturas
  for each row execute function public.rh_toca_atualizado_em();

drop trigger if exists rh_vagas_touch on public.rh_vagas;
create trigger rh_vagas_touch before update on public.rh_vagas
  for each row execute function public.rh_toca_atualizado_em();

drop trigger if exists rh_guias_touch on public.rh_guias;
create trigger rh_guias_touch before update on public.rh_guias
  for each row execute function public.rh_toca_atualizado_em();

drop trigger if exists rh_chave_valor_touch on public.rh_chave_valor;
create trigger rh_chave_valor_touch before update on public.rh_chave_valor
  for each row execute function public.rh_toca_atualizado_em();

-- ============================================================================
-- Depois de rodar, confira no dashboard:
--   Table Editor  → as 5 tabelas existem e aparecem com o cadeado de RLS
--   Storage       → o bucket "curriculos" existe e está PRIVADO
-- ============================================================================
