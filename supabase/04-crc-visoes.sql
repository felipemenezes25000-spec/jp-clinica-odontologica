-- ============================================================================
-- JP CRC OS — visões salvas (item 147). Aditivo: rode depois do 02.
--
-- O 02 já cria `crc_saved_views`. O que falta é a trava que impede a lista de
-- virar lixo: sem ela, salvar "Faltantes da semana" três vezes deixa três
-- linhas com o mesmo nome, e quem usa não tem como saber qual é a boa.
--
-- Com o índice, salvar de novo é ATUALIZAR — que é exatamente o que a pessoa
-- espera quando ajusta um filtro e clica em salvar com o mesmo nome.
--
-- `user_id` participa da chave: a visão pessoal de uma pessoa não colide com a
-- de outra, e duas pessoas podem ter cada uma a sua "Minha fila".
-- ============================================================================

create unique index if not exists crc_saved_views_nome_unico
  on public.crc_saved_views (organization_id, user_id, escopo, nome);

-- A listagem sempre filtra por organização + escopo e ordena por nome.
create index if not exists crc_saved_views_escopo
  on public.crc_saved_views (organization_id, escopo, nome);
