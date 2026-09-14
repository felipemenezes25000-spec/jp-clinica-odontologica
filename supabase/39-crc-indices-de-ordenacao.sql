-- ============================================================================
--  Índices para as ordenações que o código faz e o banco não cobria.
--
--  COMO ESTES QUATRO FORAM ESCOLHIDOS: uma varredura comparou toda chamada de
--  `selecionar(...)` com `ordenar:` contra os índices declarados em
--  `supabase/*.sql`. Catorze ordenações não tinham índice que as cobrisse. Dez
--  são de tabela pequena — clínica, usuário, meta, etapa do funil — onde o
--  Postgres varre tudo em microssegundos e um índice só custaria escrita.
--
--  Estes quatro são os que crescem sem teto:
--
--    crc_leads          uma linha por pessoa que clicou num anúncio;
--    crc_patients       a base inteira da clínica;
--    crc_budgets        um por orçamento apresentado;
--    crc_opportunities  vários por paciente, ao longo dos anos.
--
--  HOJE NÃO MUDA NADA: com a base vazia, qualquer plano é instantâneo. Isto é
--  para o dia em que a tela de leads começar a demorar e ninguém souber por quê.
--
--  A ORGANIZAÇÃO VEM PRIMEIRO em todos, porque toda consulta filtra por ela
--  antes de ordenar. Um índice só na coluna de ordenação obrigaria o Postgres a
--  ler linha de outras clínicas para depois descartar.
-- ============================================================================

-- A lista de leads, da mais recente para a mais antiga.
create index if not exists crc_leads_recentes
  on public.crc_leads (organization_id, criado_em desc);

-- ORDER BY nome — e este é o caso que engana.
--
-- Já existe `crc_patients_busca_nome`, mas é GIN de trigrama: serve para
-- `ILIKE '%maria%'` e NÃO serve para ordenar. Ordenação alfabética precisa de
-- b-tree, e sem ele a lista de pacientes vira sort em memória da base inteira.
create index if not exists crc_patients_ordem_nome
  on public.crc_patients (organization_id, nome);

-- Orçamentos do mais novo para o mais velho — a ordem do funil de aceitação.
create index if not exists crc_budgets_recentes
  on public.crc_budgets (organization_id, criado_em desc);

-- Oportunidades por última movimentação: é como a fila de trabalho se ordena.
create index if not exists crc_opportunities_movimentadas
  on public.crc_opportunities (organization_id, atualizado_em desc);

-- ----------------------------------------------------------------------------
-- O registro
-- ----------------------------------------------------------------------------
--
--  A LINHA ABAIXO NAO E PROVA, e o `schema-status` sabe disso: ela diz que
--  alguem ANOTOU, e a sonda diz o que esta no banco. Quando as duas discordam,
--  a sonda vence.
--
--  Ela existe porque a DISCORDANCIA e o alarme. Sem o registro, um arquivo que
--  nunca rodou e um arquivo que rodou ficam com a mesma aparencia — e o
--  relatorio perde a unica linha que faz alguem parar e conferir.
--
--  Da 30 a 38 todo arquivo se registrava. Da 39 a 44 o habito se perdeu, e o
--  relatorio de 13/09/2026 mostrou as seis como NAO anotadas com a sonda OK.

insert into public.crc_schema_migrations (nome, presumido)
values ('39-crc-indices-de-ordenacao.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();
