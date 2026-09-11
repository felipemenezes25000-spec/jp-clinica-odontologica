-- ============================================================================
-- Os papéis que o schema pressupõe — Fase E
-- ============================================================================
--
-- ESTE ARQUIVO NASCEU DE UM DEFEITO ENCONTRADO PELO PRÓPRIO ITEM 21.
--
-- Ao aplicar `supabase/*.sql` num Postgres vazio pela primeira vez na vida do
-- projeto, o arquivo 01 falhou na linha 142:
--
--     ERROR:  role "anon" does not exist
--
-- A causa é simples e nunca tinha aparecido: `anon`, `authenticated` e
-- `service_role` são criados pelo SUPABASE, não pelo nosso schema. Todo arquivo
-- daqui foi escrito contra um banco que já os tinha — e por isso a dependência
-- nunca foi declarada em lugar nenhum.
--
-- O QUE ISSO SIGNIFICAVA NA PRÁTICA: instalar o JP CRC OS em qualquer Postgres
-- que não fosse um projeto Supabase era impossível, e ninguém sabia. Não havia
-- mensagem de erro guardada, nem documentação, nem teste. O sistema tinha uma
-- dependência de infraestrutura invisível.
--
-- POR QUE `IF NOT EXISTS` E NÃO `CREATE` DIRETO. Num projeto Supabase os três
-- papéis JÁ EXISTEM, com privilégios que o Supabase gerencia. Recriá-los seria,
-- na melhor das hipóteses, um erro que interrompe a aplicação do schema; na
-- pior, uma alteração nos privilégios de um papel que o painel também mexe.
-- Este arquivo é um NO-OP em produção, de propósito.
--
-- O QUE ELE NÃO FAZ: conceder privilégio nenhum. Quem decide o que cada papel
-- pode fazer continua sendo o Supabase em produção, e o workflow de CI no teste.
-- Aqui mora só a existência.
-- ============================================================================

do $$
begin
  -- `anon` é o papel da chave pública, a que vai no navegador. Todas as tabelas
  -- do CRC têm RLS ligada e ZERO policies, então ele não alcança nada — e os
  -- `revoke` do arquivo 01 existem para tornar isso explícito em vez de
  -- implícito.
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;

  -- `authenticated` é o usuário logado pelo Supabase Auth. O CRC não o usa: todo
  -- acesso passa pelo servidor, que já resolveu quem é a pessoa. O papel existe
  -- porque o schema do RH o menciona nos `revoke`.
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;

  -- `service_role` é o papel do servidor, e ele IGNORA RLS por definição. É o
  -- que `servidor/banco.ts` usa, e é por isso que aquele arquivo diz, no topo,
  -- que nunca pode ser importado de código que a tela carrega.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;
