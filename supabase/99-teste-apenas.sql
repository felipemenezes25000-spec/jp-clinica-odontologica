-- ============================================================================
-- ⚠️  ESTE ARQUIVO NÃO VAI PARA PRODUÇÃO. NUNCA.
-- ============================================================================
--
-- Ele cria uma função que executa SQL arbitrário vindo de fora. Num banco que
-- atende a internet, isso é entregar a chave: qualquer chamada autenticada
-- passa a poder ler, alterar e apagar tudo, incluindo prontuário de paciente.
--
-- POR QUE ELE EXISTE ASSIM MESMO. Os testes de integração precisam fazer
-- perguntas SOBRE o banco — "esta coluna existe?", "quais índices existem?",
-- "o que acontece se duas transações disputarem esta linha?" — e nenhuma delas
-- cabe na API que o app usa. A alternativa seria abrir uma conexão Postgres
-- direta no teste, o que exigiria uma dependência nova só para isso.
--
-- COMO ELE FICA FORA DO AR:
--
--   1. O prefixo `99-` o deixa fora do intervalo que a documentação manda rodar.
--   2. `scripts/aplicar-schema.mjs` aplica TUDO, e por isso ele só deve ser
--      usado contra bancos efêmeros.
--   3. A função checa uma variável de ambiente do banco na primeira linha e
--      recusa rodar em qualquer instância que não tenha sido marcada como de
--      teste.
--
-- A terceira é a que vale, porque é a única que não depende de alguém lembrar.
-- ============================================================================

-- A marca. Um banco de produção não tem esta tabela, e a função se recusa a
-- existir sem ela.
create table if not exists public.crc_banco_de_teste (
  marca boolean primary key default true,
  criado_em timestamptz not null default now()
);

insert into public.crc_banco_de_teste (marca) values (true) on conflict do nothing;

create or replace function public.crc_teste_sql(p_sql text)
returns jsonb
language plpgsql
as $corpo$
declare
  resultado jsonb;
begin
  -- O PORTÃO. Sem a marca, a função não faz nada — e o erro diz exatamente o
  -- que aconteceu, para ninguém perder uma tarde achando que é permissão.
  if not exists (select 1 from public.crc_banco_de_teste) then
    raise exception 'crc_teste_sql só roda em banco marcado como de teste';
  end if;

  -- `execute` de comando que não devolve linhas — truncate, bloco anônimo,
  -- insert sem returning — não pode ser lido com `into`. Tentar os dois em
  -- ordem é o que permite ao apoio ter uma função só.
  --
  -- (E sim: a primeira versão deste comentário continha um cifrão duplo, que
  -- encerrava o corpo da função no meio. O schema do zero pegou na hora.)
  begin
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', p_sql)
       into resultado;
  exception
    when others then
      execute p_sql;
      resultado := '[]'::jsonb;
  end;

  return resultado;
end $corpo$;

comment on function public.crc_teste_sql(text) is
  'APENAS TESTE. Executa SQL arbitrário. Jamais aplicar em produção.';
