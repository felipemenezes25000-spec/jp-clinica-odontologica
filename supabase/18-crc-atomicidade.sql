-- ============================================================================
-- CRC AI OS — Fase D: as três trocas que precisavam ser atômicas
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
--
-- O QUE UNE AS TRÊS COISAS DESTE ARQUIVO. Todas eram sequências de duas ou mais
-- chamadas pela API do PostgREST, e cada chamada é uma transação separada. Entre
-- uma e outra cabe tudo: um timeout, um deploy, uma segunda execução.
--
-- Não dá para resolver isso do lado do TypeScript. Um `try/catch` que tenta
-- desfazer o passo anterior é só mais uma chamada que pode falhar — e falha
-- exatamente quando o motivo da primeira falha ainda está acontecendo. A
-- transação tem que existir onde ela existe de verdade: dentro do Postgres.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. A troca do conhecimento
-- ----------------------------------------------------------------------------
--
-- O QUE ACONTECIA. `ingerirFonte` fazia DELETE dos pedaços antigos e depois
-- INSERT dos novos, em duas chamadas. Entre elas, a fonte tem ZERO pedaços.
--
-- Nesse intervalo o agente continua atendendo, e a busca semântica devolve nada.
-- O paciente pergunta "vocês aceitam meu convênio?" e recebe "não tenho essa
-- informação" — de uma clínica que tem a informação cadastrada, no exato
-- segundo em que alguém estava atualizando o texto. Depois volta ao normal, e
-- ninguém consegue reproduzir.
--
-- E se o INSERT falhar, o buraco é permanente: o conhecimento antigo já foi.
--
-- Com uma função, DELETE e INSERT ficam na mesma transação. Quem lê no meio vê
-- o conteúdo ANTIGO, inteiro — nunca o vazio.
create or replace function public.crc_trocar_conhecimento(
  p_organization_id uuid,
  p_source_id       uuid,
  p_pedacos         jsonb
)
returns integer
language plpgsql
as $$
declare
  quantos integer;
begin
  -- O TENANT ENTRA NO WHERE, e não só no payload. É a mesma regra do resto do
  -- sistema: uma função que apaga por `source_id` sozinho apagaria o pedaço de
  -- outra clínica se o id vazasse.
  delete from public.crc_knowledge_chunks
   where organization_id = p_organization_id
     and source_id = p_source_id;

  insert into public.crc_knowledge_chunks
    (organization_id, source_id, ordem, conteudo, tamanho, embedding, chave_dedupe)
  select p_organization_id,
         p_source_id,
         (p->>'ordem')::integer,
         p->>'conteudo',
         (p->>'tamanho')::integer,
         (p->>'embedding')::vector,
         p->>'chave_dedupe'
    from jsonb_array_elements(p_pedacos) as p;

  get diagnostics quantos = row_count;
  return quantos;
end $$;

-- ----------------------------------------------------------------------------
-- 2. A reserva de orçamento
-- ----------------------------------------------------------------------------
--
-- O QUE ACONTECIA. O teto era: ler o gasto → comparar com o teto → chamar o
-- modelo → somar o gasto. Quatro passos, e a soma só no fim.
--
-- Dois turnos simultâneos leem o mesmo gasto, os dois acham que cabe, os dois
-- chamam. Com cinco workers por minuto — que é o desenho da Fase B —, o teto de
-- R$ 50 vira R$ 50 mais o que couber nas leituras concorrentes. Não é um
-- estouro teórico: é o comportamento normal de um contador lido antes de ser
-- escrito.
--
-- A INVERSÃO QUE RESOLVE: reservar ANTES de chamar, na mesma transação que lê.
-- `insert ... on conflict do update` com a comparação no `where` faz a decisão e
-- o incremento virarem uma operação só. Quem perde a corrida recebe `false`.
--
-- SOBRE O ESTORNO. A função devolve o que reservou para o caso de a chamada
-- falhar — `crc_estornar_gasto` existe para isso. Estorno não é garantido (o
-- processo pode morrer antes), e é por isso que a reserva usa a ESTIMATIVA e o
-- ajuste vem depois com o custo real: errar para mais e corrigir para baixo
-- mantém o teto como teto.
create or replace function public.crc_reservar_orcamento(
  p_organization_id uuid,
  p_dia             date,
  p_micro           bigint,
  p_teto_dia_micro  bigint,
  p_teto_mes_micro  bigint
)
returns table (reservou boolean, dia_micro bigint, mes_micro bigint)
language plpgsql
as $$
declare
  v_dia_atual bigint;
  v_mes_atual bigint;
  v_primeiro  date := date_trunc('month', p_dia)::date;
begin
  -- O LOCK VEM PRIMEIRO, e é sobre a linha do dia. Sem ele, duas transações
  -- leem o mesmo `v_mes_atual` e as duas passam no teste do mês — o teto diário
  -- seria atômico e o mensal não, que é o tipo de meia-garantia que engana.
  insert into public.crc_ai_gastos (organization_id, dia, micro_reais, chamadas)
  values (p_organization_id, p_dia, 0, 0)
  on conflict (organization_id, dia) do nothing;

  select g.micro_reais into v_dia_atual
    from public.crc_ai_gastos g
   where g.organization_id = p_organization_id
     and g.dia = p_dia
   for update;

  select coalesce(sum(g.micro_reais), 0) into v_mes_atual
    from public.crc_ai_gastos g
   where g.organization_id = p_organization_id
     and g.dia >= v_primeiro;

  -- Teto <= 0 significa SEM TETO. É a convenção do resto do sistema, e mantê-la
  -- aqui evita que "não configurou" vire "não pode gastar nada".
  if (p_teto_dia_micro > 0 and v_dia_atual + p_micro > p_teto_dia_micro)
     or (p_teto_mes_micro > 0 and v_mes_atual + p_micro > p_teto_mes_micro) then
    return query select false, v_dia_atual, v_mes_atual;
    return;
  end if;

  update public.crc_ai_gastos
     set micro_reais = micro_reais + p_micro,
         chamadas = chamadas + 1,
         atualizado_em = now()
   where organization_id = p_organization_id
     and dia = p_dia;

  return query select true, v_dia_atual + p_micro, v_mes_atual + p_micro;
end $$;

-- Ajuste depois da chamada: a estimativa vira custo real, para mais ou para
-- menos. `greatest(...,0)` porque contador negativo é pior do que impreciso.
create or replace function public.crc_ajustar_gasto(
  p_organization_id uuid,
  p_dia             date,
  p_delta_micro     bigint
)
returns void
language sql
as $$
  update public.crc_ai_gastos
     set micro_reais = greatest(micro_reais + p_delta_micro, 0),
         atualizado_em = now()
   where organization_id = p_organization_id
     and dia = p_dia;
$$;

-- ----------------------------------------------------------------------------
-- 3. A publicação da versão do agente
-- ----------------------------------------------------------------------------
--
-- O QUE ACONTECIA. Arquivar a publicada e publicar o rascunho eram dois
-- `update`. Se o processo morresse entre eles, a clínica ficava SEM versão
-- publicada — e `turno.ts` cai no texto que vem no código, silenciosamente. O
-- agente passa a falar com a personalidade padrão, e a única pista é que as
-- respostas ficaram diferentes.
--
-- A ORDEM CONTINUA SENDO ARQUIVAR PRIMEIRO, por causa do índice parcial
-- `uq_crc_agent_versions_publicada`. O que muda é que agora as duas coisas
-- acontecem ou nenhuma acontece.
--
-- AS RECUSAS CONTINUAM NO TYPESCRIPT, de propósito. O gate de avaliação — "esta
-- versão foi testada, e há menos de 72 horas" — é regra de produto, e regra de
-- produto em PL/pgSQL é regra que ninguém revisa. Aqui mora só a atomicidade.
create or replace function public.crc_publicar_versao_agente(
  p_organization_id uuid,
  p_versao_id       uuid,
  p_rodada_id       uuid,
  p_user_id         uuid
)
returns boolean
language plpgsql
as $$
declare
  v_ok boolean;
begin
  update public.crc_agent_versions
     set status = 'ARQUIVADA'
   where organization_id = p_organization_id
     and status = 'PUBLICADA'
     and id <> p_versao_id;

  update public.crc_agent_versions
     set status = 'PUBLICADA',
         rodada_id = p_rodada_id,
         publicado_por = p_user_id,
         publicado_em = now()
   where organization_id = p_organization_id
     and id = p_versao_id
     and status = 'RASCUNHO';

  get diagnostics v_ok = row_count;
  -- `false` quando o rascunho sumiu ou mudou de status entre a checagem e aqui.
  -- O rollback é automático: a transação inteira volta, incluindo o arquivamento.
  if not v_ok then
    raise exception 'rascunho_indisponivel';
  end if;

  return true;
end $$;

-- ----------------------------------------------------------------------------
-- 4. O fuso da organização
-- ----------------------------------------------------------------------------
--
-- O QUE ACONTECIA. `agora.toISOString().slice(0, 10)` define "o dia". Isso é o
-- dia UTC, e a Vercel roda em UTC.
--
-- Para uma clínica em -03, o dia UTC vira às 21h da véspera. Consequência
-- concreta: o teto diário de IA zera às 21h e a clínica ganha três horas de
-- orçamento extra todo dia — e o relatório "gasto de hoje" mostra número errado
-- exatamente no fim do expediente, que é quando alguém olha.
--
-- A COLUNA JÁ DEVERIA EXISTIR na configuração, e existe: `HorarioComercial.fuso`
-- guarda `America/Sao_Paulo`. O que faltava era o resto do sistema usá-la. Esta
-- coluna é o espelho dela no banco, para as funções SQL que precisam do dia.
alter table public.crc_organizations
  add column if not exists fuso text not null default 'America/Sao_Paulo';

-- O dia local de uma organização. Serve para relatório e para limpeza agendada,
-- onde a data é calculada dentro do banco e não passa pelo TypeScript.
create or replace function public.crc_dia_local(p_organization_id uuid, p_instante timestamptz)
returns date
language sql
stable
as $$
  select (p_instante at time zone coalesce(
           (select o.fuso from public.crc_organizations o where o.id = p_organization_id),
           'America/Sao_Paulo'
         ))::date;
$$;
