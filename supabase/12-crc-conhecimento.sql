-- ============================================================================
-- CRC AI OS — Fatia 7: conhecimento com busca por significado (pgvector)
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
--
-- SE A PRIMEIRA LINHA FALHAR, o resto não serve: sem a extensão `vector` não há
-- coluna de embedding e não há busca por significado. No Supabase ela existe e
-- só precisa ser habilitada.
-- ============================================================================

create extension if not exists vector;

-- ----------------------------------------------------------------------------
-- 1. A fonte
-- ----------------------------------------------------------------------------
--
-- O TEXTO ORIGINAL FICA GUARDADO INTEIRO, e não só os pedaços.
--
-- Parece redundante — os chunks somados dão quase o texto. Mas o chunker vai
-- mudar: hoje corta em 700 caracteres, amanhã em 400 com mais sobreposição. Sem
-- o original, reprocessar significaria pedir o documento de volta a quem o
-- escreveu, e na prática significaria nunca reprocessar.
create table if not exists public.crc_knowledge_sources (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,

  titulo          text not null,
  -- 'faq' | 'procedimento' | 'politica' | 'texto'
  tipo            text not null default 'texto',
  corpo           text not null,

  -- RASCUNHO | PUBLICADA | ARQUIVADA
  --
  -- SÓ PUBLICADA RESPONDE PACIENTE. A trava está DENTRO da função de busca, não
  -- no código que chama — ver o item 3. Um rascunho mal escrito não pode virar
  -- resposta por alguém ter esquecido uma cláusula no TypeScript.
  status          text not null default 'RASCUNHO',
  versao          integer not null default 1,

  criado_por      uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  -- Mesmo título duas vezes ATUALIZA, e não cria uma segunda fonte homônima que
  -- responderia junto com a primeira.
  unique (organization_id, titulo)
);

-- ----------------------------------------------------------------------------
-- 2. Os pedaços
-- ----------------------------------------------------------------------------
create table if not exists public.crc_knowledge_chunks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  source_id       uuid not null references public.crc_knowledge_sources(id) on delete cascade,

  ordem           integer not null,
  conteudo        text not null,
  -- Quantos caracteres. Serve para a tela mostrar tamanho sem ler o conteúdo.
  tamanho         integer not null default 0,

  -- 1536 dimensões = text-embedding-3-small.
  --
  -- O NÚMERO ESTÁ FIXO NA COLUNA, e é por isso que a aplicação recusa gravar
  -- quando o modelo de embedding configurado tem outra dimensão. Descobrir isso
  -- por erro do Postgres no meio de uma ingestão de trinta pedaços deixaria
  -- metade gravada.
  embedding       vector(1536),

  -- Conteúdo normalizado. É o que faz reingestão do mesmo texto não duplicar
  -- pedaço — e, junto com o `delete` da reingestão, o que mantém a contagem
  -- honesta.
  chave_dedupe    text not null,
  criado_em       timestamptz not null default now(),

  unique (organization_id, chave_dedupe)
);

create index if not exists idx_crc_knowledge_chunks_fonte
  on public.crc_knowledge_chunks (organization_id, source_id, ordem);

-- O índice que torna a busca viável.
--
-- HNSW e não IVFFlat: IVFFlat precisa de `lists` afinado ao volume e degrada
-- silenciosamente quando o volume muda. Uma clínica vai ter centenas de pedaços,
-- não milhões — HNSW é mais caro para construir e não precisa de ajuste.
--
-- `vector_cosine_ops` porque a busca usa `<=>`. Índice com o operador errado é
-- índice que o planner ignora, e a query cai para varredura completa sem avisar.
create index if not exists idx_crc_knowledge_chunks_embedding
  on public.crc_knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

-- ----------------------------------------------------------------------------
-- 3. A busca
-- ----------------------------------------------------------------------------
--
-- O FILTRO DE ORGANIZAÇÃO ESTÁ DENTRO DA FUNÇÃO. É o ponto inteiro de ela
-- existir como função em vez de uma query montada no TypeScript.
--
-- Busca vetorial tem uma armadilha que filtro por tabela normal não tem: se
-- alguém pegar os 5 vizinhos mais próximos e DEPOIS filtrar por organização, o
-- resultado pode vir vazio tendo conteúdo relevante — ou, na versão pior,
-- alguém esquece o filtro e o conteúdo de uma clínica responde pela outra. Aqui
-- o filtro é parte do `where` que o índice percorre, e não há caminho de código
-- que possa omiti-lo.
--
-- `p_limite` maior do que o que o agente vai ver de propósito: quem chama pede
-- 20 candidatos e reordena em memória antes de escolher 4. Ver
-- `aplicacao/conhecimento.ts`.
create or replace function public.crc_buscar_conhecimento(
  p_organization_id uuid,
  p_embedding       vector(1536),
  p_limite          integer default 20,
  p_minimo          double precision default 0.0
)
returns table (
  id            uuid,
  source_id     uuid,
  titulo        text,
  tipo          text,
  ordem         integer,
  conteudo      text,
  similaridade  double precision
)
language sql
stable
as $$
  select
    c.id,
    c.source_id,
    s.titulo,
    s.tipo,
    c.ordem,
    c.conteudo,
    -- `<=>` é distância de cosseno: 0 é idêntico, 2 é oposto. A similaridade
    -- que o resto do sistema usa é 1 - distância, porque "maior é melhor" é o
    -- que se espera de um número chamado similaridade.
    1 - (c.embedding <=> p_embedding) as similaridade
  from public.crc_knowledge_chunks c
  join public.crc_knowledge_sources s on s.id = c.source_id
  where c.organization_id = p_organization_id
    and s.organization_id = p_organization_id
    -- Rascunho não responde paciente. Ver o item 1.
    and s.status = 'PUBLICADA'
    and c.embedding is not null
    and 1 - (c.embedding <=> p_embedding) >= p_minimo
  order by c.embedding <=> p_embedding
  limit greatest(1, least(p_limite, 50));
$$;

alter table public.crc_knowledge_sources enable row level security;
alter table public.crc_knowledge_chunks  enable row level security;
