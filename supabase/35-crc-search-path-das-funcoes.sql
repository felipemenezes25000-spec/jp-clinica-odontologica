-- ============================================================================
-- CRC — as funções deixam de herdar o `search_path` de quem as chama.
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
-- ============================================================================
--
--  ISTO SAI DO LINTER DO SUPABASE (`0011_function_search_path_mutable`), e é o
--  único dos avisos dele que vale código. O que ele aponta e NÃO é para
--  consertar está explicado no fim deste arquivo.
--
-- ============================================================================
--  O ATAQUE QUE `search_path` MUTÁVEL PERMITE, em uma frase:
--
--  Uma função sem `search_path` fixo resolve os nomes que usa pelo caminho de
--  quem a CHAMA. Se um papel conseguir criar uma tabela ou função num schema
--  que venha antes de `public` nesse caminho, ele passa a decidir o que a
--  função enxerga.
--
--  Concretamente: alguém cria `meu_schema.crc_patients`, põe `meu_schema` na
--  frente do `search_path`, chama `crc_radar_resumo` — e a função soma os dados
--  da tabela dele em vez da real.
--
--  NO CASO DESTE PROJETO O RISCO É BAIXO, e vale dizer por quê em vez de fingir
--  urgência: nenhuma destas funções é `SECURITY DEFINER` (conferido — a única
--  do banco está em `01-schema.sql`, do módulo de RH), todas já qualificam os
--  nomes com `public.`, e quem chama é sempre a `service_role` a partir do
--  servidor.
--
--  Mas "baixo" não é "nenhum". E o ganho real é para o FUTURO: com o caminho
--  fixo, esquecer um `public.` numa função nova vira erro na criação, alto e
--  imediato, em vez de uma resolução silenciosa que funciona até o dia em que
--  não funciona.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- O ajuste, derivado do CATÁLOGO
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  A PRIMEIRA VERSÃO DESTE ARQUIVO LISTAVA AS ASSINATURAS À MÃO, e 14 das 26
--  não casaram — os nomes e tipos de parâmetro que eu supus estavam errados.
--
--  Isso só apareceu porque havia um `raise notice` em cada falha. Sem ele, a
--  migration teria rodado "com sucesso" ajustando metade das funções, e o
--  linter continuaria apontando a outra metade sem ninguém entender por quê.
--
--  A correção não foi arrumar a lista: foi PARAR DE MANTER UMA LISTA. O laço
--  abaixo lê `pg_proc` e endereça cada função pelo OID (`::regprocedure`), o
--  que resolve de uma vez os dois problemas que uma lista tem — assinatura
--  errada, e função nova que alguém esquece de acrescentar.
--
--  Homônimas com assinaturas diferentes também deixam de ser risco: cada OID é
--  uma função, e o laço passa por todas.
-- ============================================================================
do $ajustar$
declare
  f record;
  vazias integer := 0;
  com_public integer := 0;
  caminho text;
begin
  for f in
    select p.oid,
           p.oid::regprocedure::text as assinatura,
           /*
            * ==================================================================
            *  A FUNÇÃO DEPENDE DE pgvector?
            *
            *  Esta detecção nasceu dos testes de integração, que quebraram na
            *  primeira versão desta migration:
            *
            *    operator does not exist: public.vector <=> public.vector
            *    type "vector" does not exist
            *
            *  Com o caminho vazio, não são só TABELAS que param de resolver:
            *  TIPOS e OPERADORES também. E um operador não se qualifica inline
            *  sem reescrever o corpo para `OPERATOR(public.<=>)` — mudar o
            *  corpo de uma função de busca vetorial para satisfazer um linter é
            *  muito mais risco do que o aviso justifica.
            * ==================================================================
            */
           (p.prosrc like '%vector%' or p.prosrc like '%<=>%') as usa_vetor
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'crc\_%'
       /*
        * `crc_teste_sql` FICA DE FORA, e a exceção é obrigatória.
        *
        * Ela vem do `99-teste-apenas.sql` e executa SQL arbitrário vindo do
        * teste de integração. Com caminho fixo, todo comando que ela recebesse
        * precisaria vir qualificado — e os testes quebrariam em massa, por um
        * ganho de segurança nulo numa função que só existe em banco de teste.
        */
       and p.proname <> 'crc_teste_sql'
       -- Só funções, não agregadas nem de janela: `alter function` recusa as
       -- outras, e nenhuma delas existe aqui hoje.
       and p.prokind = 'f'
  loop
    /*
     * ========================================================================
     *  DOIS CAMINHOS, E OS DOIS RESOLVEM O AVISO DO LINTER.
     *
     *  O que o linter aponta é `search_path` MUTÁVEL — herdado de quem chama.
     *  O ataque é prepender um schema e sequestrar a resolução de nomes.
     *
     *  VAZIO      fecha tudo. Qualquer nome sem schema vira erro, o que
     *             transforma um esquecimento futuro em falha imediata.
     *
     *  `public`   também é FIXO, e também bloqueia o ataque: quem chama não
     *             consegue mais prepender nada. É mais fraco porque um nome não
     *             qualificado continua resolvendo — mas para as funções de
     *             pgvector é a única opção que não exige reescrever o corpo.
     *
     *  Quem já consegue criar objetos em `public` não precisa deste ataque: já
     *  tem o banco.
     * ========================================================================
     */
    if f.usa_vetor then
      caminho := 'public';
      com_public := com_public + 1;
    else
      -- Duas aspas simples dentro de literal SQL = uma aspa; quatro = duas, que
      -- é a string vazia que o `set search_path` espera.
      caminho := '''''';
      vazias := vazias + 1;
    end if;

    execute format('alter function %s set search_path = %s', f.assinatura, caminho);
  end loop;

  -- Os números vão para a saída porque são a evidência. Zero nos dois
  -- significaria que o filtro não pegou nada, e isso precisa ser visível.
  raise notice 'search_path: % funcao(oes) com caminho vazio, % com public (pgvector).',
    vazias, com_public;
end $ajustar$;

insert into public.crc_schema_migrations (nome, presumido)
values ('35-crc-search-path-das-funcoes.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();

-- ----------------------------------------------------------------------------
-- O que este arquivo NÃO faz, e por quê
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  1. NÃO CRIA POLICY DE RLS.
--
--  O linter aponta ~76 tabelas com "RLS enabled, no policies", em nível INFO.
--  No CRC isso é DELIBERADO, e está escrito desde o `supabase/02`:
--
--      "RLS — ligado em tudo, sem policy nenhuma."
--
--  RLS ligada sem nenhuma policy permissiva significa ZERO LINHAS para qualquer
--  papel sem BYPASSRLS. `anon` e `authenticated` não leem nada. O acesso é pela
--  `service_role`, do lado servidor, que já carrega o tenant em toda consulta —
--  e é lá que o isolamento é testado, em `aplicacao/*.test.ts`.
--
--  Criar policies aqui seria ABRIR o que hoje está fechado, e mudar o
--  isolamento de tenant de código testado para expressões SQL não testadas.
--
--  Conferido: as 73 tabelas que o código usa aparecem TODAS na lista do linter
--  — ou seja, todas com RLS ligada. Nenhuma escapou.
--
--  2. NÃO MEXE NO `grant select ... to anon`.
--
--  Ele existe nas migrations antigas e é inofensivo enquanto a RLS estiver
--  ligada em tudo: o grant dá permissão de TABELA, e a RLS filtra as LINHAS
--  depois. Com zero policies, o resultado é zero linhas.
--
--  Fica anotado como dívida de higiene, não como defeito. Mexer nele sem
--  necessidade arriscaria um caminho que não conheço por um ganho nulo.
--
--  3. NÃO MOVE `pg_trgm` NEM `vector` DE `public`.
--
--  Mover extensão de schema quebra toda referência a tipo e operador dela —
--  `vector` é o tipo da coluna de embedding em `crc_knowledge_chunks`. O ganho
--  é organizacional; o risco é uma coluna inteira parar de resolver. É a mesma
--  razão pela qual as funções de pgvector ficaram com `search_path = public`.
--
--  4. NÃO TOCA EM `rh_proximo_protocolo`.
--
--  É a única `SECURITY DEFINER` do banco, e o linter aponta com razão que
--  `anon` e `authenticated` podem executá-la. ELA É DO MÓDULO DE RH, fora do
--  escopo deste trabalho, e mexer nela sem saber quem a chama poderia quebrar o
--  formulário de candidatura.
--
--  Está relatada como achado externo ao escopo em
--  `docs/crc/CRC-AUTOPILOT-MASTER-IMPLEMENTATION.md`, para alguém decidir.
-- ============================================================================
