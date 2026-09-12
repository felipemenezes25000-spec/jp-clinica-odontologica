-- ============================================================================
-- CRC — as varreduras passam a percorrer a base, e não a reler o começo dela.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
--
-- DOIS DEFEITOS COM O MESMO SINTOMA: a varredura "converge" no comentário e não
-- converge no banco. Nenhum dos dois aparece com 500 pacientes — os dois
-- aparecem com 8.000, silenciosos, sem erro nenhum.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O estado das varreduras — o cursor que faltava
-- ----------------------------------------------------------------------------
--
-- `varrerRecall` fazia:
--
--     select ... from crc_patients
--      where ultima_consulta_em < <limite>
--      order by ultima_consulta_em asc
--      limit 200
--
-- SEM CURSOR. A execução seguinte lê exatamente as mesmas 200 linhas — porque
-- são as mesmas 200 mais antigas, e elas continuam elegíveis: quem não respondeu
-- ao recall não mudou `ultima_consulta_em`.
--
-- O dedupe por ciclo impede o efeito duplicado, e é por isso que o defeito é
-- invisível: nada acontece duas vezes, nada dá erro, e o número de "avaliados"
-- é sempre 200. O que acontece é que os pacientes 201 em diante NUNCA SÃO
-- AVALIADOS. Com 8.000 pacientes, 97,5% da base fica fora do recall para sempre.
--
-- O comentário do código dizia "ela processa um lote por dia e converge". Não
-- convergia: ela processava o MESMO lote por dia.
--
-- POR QUE KEYSET E NÃO `OFFSET`. A tabela muda embaixo da varredura — paciente
-- agenda, é arquivado, muda de telefone. Com `offset` crescente, uma linha que
-- sai do conjunto desloca todas as seguintes e a varredura PULA registros. Com
-- keyset, o cursor é um ponto no espaço de ordenação: o que mudou de lugar é
-- reavaliado no ciclo seguinte, e nada é pulado por causa de vizinho.
create table if not exists public.crc_scan_state (
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,

  -- 'recall', e no futuro outras. Texto e não enum: acrescentar varredura não
  -- pode exigir migração de tipo.
  varredura       text not null,

  /*
   * O CURSOR, em duas colunas.
   *
   * `ultima_consulta_em` sozinho não é único — dezenas de pacientes têm o mesmo
   * instante, sobretudo em base importada, onde a data vem truncada no dia. Um
   * cursor só por data pularia todos os empates depois do primeiro, ou os
   * releria para sempre. O `id` desempata.
   */
  cursor_data     timestamptz,
  cursor_id       uuid,

  /*
   * QUANTAS PASSADAS COMPLETAS JÁ ACONTECERAM.
   *
   * É o número que responde "a varredura está andando?" — e a pergunta importa:
   * um ciclo que não incrementa há uma semana significa que a base cresceu mais
   * rápido que a capacidade de varrê-la, e o teto por execução precisa subir.
   */
  ciclo           integer not null default 0,
  atualizado_em   timestamptz not null default now(),

  primary key (organization_id, varredura)
);

alter table public.crc_scan_state enable row level security;

-- O índice que sustenta o keyset. A ordem das colunas é a da cláusula
-- `order by`, e é o que permite ao Postgres percorrer sem ordenar.
create index if not exists idx_crc_patients_recall_keyset
  on public.crc_patients (organization_id, ultima_consulta_em, id)
  where ultima_consulta_em is not null and not arquivado and ativo;

/*
 * A PÁGINA DO RECALL.
 *
 * POR QUE RPC E NÃO CONSULTA NO CÓDIGO: a comparação de keyset é
 *
 *     (ultima_consulta_em, id) > (cursor_data, cursor_id)
 *
 * uma comparação de TUPLA, e o PostgREST não sabe expressá-la. Escrita como
 * `(a > x) or (a = x and b > y)` ela funciona e o planejador deixa de usar o
 * índice composto direito. Aqui a tupla é literal, e o `order by` casa com o
 * índice.
 */
create or replace function public.crc_pagina_de_recall(
  p_organization_id uuid,
  -- `ultima_consulta_em <` isto. Vem do `recallDias` da configuração.
  p_limite_data     timestamptz,
  p_cursor_data     timestamptz default null,
  p_cursor_id       uuid default null,
  p_limite          integer default 200
)
returns setof public.crc_patients
language sql
stable
as $corpo$
  select p.*
    from public.crc_patients p
   where p.organization_id = p_organization_id
     and p.arquivado = false
     and p.ativo = true
     and p.opt_out_em is null
     and p.telefone is not null
     and p.ultima_consulta_em is not null
     and p.ultima_consulta_em < p_limite_data
     /*
      * O CURSOR NULO É O COMEÇO DO CICLO, e não "sem filtro por engano": a
      * primeira página de cada passada não tem de onde continuar.
      */
     and (
       p_cursor_data is null
       or (p.ultima_consulta_em, p.id) > (p_cursor_data, coalesce(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
     )
   order by p.ultima_consulta_em, p.id
   limit p_limite;
$corpo$;

-- ----------------------------------------------------------------------------
-- 2. Os aniversariantes saem do banco, e não de uma leitura de 2.000 linhas
-- ----------------------------------------------------------------------------
--
-- `varrerAniversarios` fazia:
--
--     select id, clinic_id, nascimento from crc_patients
--      where nascimento is not null
--      limit 2000
--
-- e comparava mês/dia EM MEMÓRIA. O comentário justificava: "com 20 mil
-- pacientes são ~55 aniversariantes por dia, e o candidato precisa ser lido de
-- qualquer forma".
--
-- A CONTA ESTÁ CERTA E A CONCLUSÃO ESTÁ ERRADA. São 55 aniversariantes ENTRE OS
-- 20 MIL — e a consulta lia 2.000. Sem `order by`, quais 2.000 é decisão do
-- planejador, e ela muda. Com 8.000 pacientes, três em cada quatro aniversários
-- simplesmente não são vistos, e quais três muda a cada execução. O paciente
-- não recebe a mensagem, ninguém recebe erro, e o relatório diz "avaliados:
-- 2000" como se fosse a base inteira.
--
-- A EXPRESSÃO É `mes * 100 + dia`, e não `to_char(nascimento, 'MM-DD')`.
-- `to_char` de date é STABLE — depende de `DateStyle`/`lc_time` — e o Postgres
-- recusa expressão não-IMMUTABLE em índice. `extract` é IMMUTABLE, então
-- `0229` vira o inteiro 229 e o índice existe.
create index if not exists idx_crc_patients_aniversario
  on public.crc_patients (
    organization_id,
    ((extract(month from nascimento)::int * 100) + extract(day from nascimento)::int)
  )
  where nascimento is not null;

/*
 * `p_datas` é um ARRAY de `MMDD`, e não um par mês/dia.
 *
 * Por causa do 29 de fevereiro. Em ano comum ele não existe, e a convenção civil
 * brasileira celebra no dia 28 — então no dia 28 de um ano comum o CRC procura
 * `[228, 229]`. Um par mês/dia obrigaria duas chamadas, ou obrigaria o SQL a
 * saber o que é ano bissexto, que é regra de domínio e já está testada em
 * `dominio/regras.ts`.
 */
create or replace function public.crc_aniversariantes(
  p_organization_id uuid,
  p_datas           integer[],
  p_limite          integer default 500
)
returns setof public.crc_patients
language sql
stable
as $corpo$
  select p.*
    from public.crc_patients p
   where p.organization_id = p_organization_id
     and p.nascimento is not null
     and p.arquivado = false
     and p.ativo = true
     and p.opt_out_em is null
     and p.telefone is not null
     and ((extract(month from p.nascimento)::int * 100) + extract(day from p.nascimento)::int)
         = any(p_datas)
   order by p.id
   limit p_limite;
$corpo$;

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
