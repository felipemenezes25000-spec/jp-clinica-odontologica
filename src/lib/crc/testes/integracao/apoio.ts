/**
 * O apoio dos testes contra Postgres de verdade — Fase E.
 *
 * A DIFERENÇA EM RELAÇÃO A `banco-memoria.ts`, que é a razão de tudo isto
 * existir: lá, o banco é um objeto JavaScript, e JavaScript é uma thread só.
 * Nenhum teste do fake jamais provou — nem poderia — que:
 *
 *   `FOR UPDATE SKIP LOCKED` impede dois workers de pegarem o mesmo job;
 *   um índice único recusa a segunda mensagem sob concorrência;
 *   o `rollback` desfaz o arquivamento quando a publicação falha;
 *   a RLS barra a leitura de outra clínica;
 *   o teto de gasto segura quando vinte chamadas chegam juntas.
 *
 * Tudo isso é comportamento DO POSTGRES. O fake reproduz os índices e as
 * regras, e isso já pegou defeito de verdade — mas reproduzir uma constraint é
 * diferente de executá-la.
 *
 * AS CHAMADAS PASSAM PELO ADAPTADOR DE PRODUÇÃO. Estes testes não abrem conexão
 * própria: usam `servidor/banco.ts`, apontado para um PostgREST de teste. É o
 * mesmo caminho que o app percorre no ar, incluindo serialização, filtros e
 * tratamento de erro — um cliente paralelo testaria outro sistema.
 */

/** O endereço do PostgREST de teste. Sem isto, nada aqui pode rodar. */
export const URL_TESTE = process.env["SUPABASE_URL"] ?? "";

/**
 * Falha ALTO quando o ambiente não está montado.
 *
 * A tentação aqui é `describe.skipIf(!temBanco)`. Não: um teste de integração
 * que passa sem integração é a pior linha verde do repositório — ele vira um
 * "tudo certo" permanente que ninguém confere. Se o banco não está lá, isto tem
 * que doer.
 */
export function exigirBanco(): void {
  if (URL_TESTE.length === 0 || (process.env["SUPABASE_SERVICE_ROLE"] ?? "").length === 0) {
    throw new Error(
      [
        "Os testes de integração precisam de um Postgres de verdade.",
        "",
        "  docker run -d --name crc-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg16",
        "  node scripts/aplicar-schema.mjs",
        "  # e um PostgREST apontado para ele; ver .github/workflows/crc-integracao.yml",
        "",
        "Depois: SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... npm run test:integracao",
      ].join("\n"),
    );
  }
}

/**
 * Executa SQL cru pelo PostgREST.
 *
 * PRECISA EXISTIR porque algumas verificações não têm como passar pelo
 * adaptador: conferir se uma coluna existe, ler `pg_indexes`, provocar um
 * `pg_sleep` dentro de uma transação. São perguntas SOBRE o banco, e não
 * perguntas AO banco no sentido do app.
 *
 * Depende de `crc_teste_sql`, criada só no ambiente de teste — ver
 * `supabase/99-teste-apenas.sql`. Ela NÃO existe em produção, e o arquivo diz
 * em letras garrafais por quê.
 */
export async function sql<T = Record<string, unknown>>(texto: string): Promise<T[]> {
  const chave = process.env["SUPABASE_SERVICE_ROLE"] ?? "";
  const r = await fetch(`${URL_TESTE}/rpc/crc_teste_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: chave,
      Authorization: `Bearer ${chave}`,
    },
    body: JSON.stringify({ p_sql: texto }),
  });

  if (!r.ok) {
    throw new Error(`SQL falhou (${String(r.status)}): ${(await r.text()).slice(0, 500)}`);
  }

  const dados: unknown = await r.json();
  return (Array.isArray(dados) ? dados : []) as T[];
}

/**
 * Apaga os dados das tabelas do CRC, preservando o schema.
 *
 * `truncate ... cascade` numa lista montada do catálogo, e não à mão: a lista à
 * mão envelhece em silêncio. Uma tabela nova não entraria nela, os dados de um
 * teste vazariam para o seguinte, e a falha apareceria como intermitência num
 * arquivo que não tem nada a ver com a tabela esquecida.
 */
export async function limparTudo(): Promise<void> {
  await sql(`
    do $$
    declare
      lista text;
    begin
      select string_agg(format('%I.%I', schemaname, tablename), ', ')
        into lista
        from pg_tables
       where schemaname = 'public'
         and tablename like 'crc\\_%'
         -- A MARCA DO BANCO DE TESTE FICA DE FORA.
         --
         -- Ela começa com \`crc_\` e por isso entrava no truncate — e sem a marca,
         -- \`crc_teste_sql\` se recusa a rodar. O resultado era o primeiro
         -- \`limparTudo()\` desarmar o ambiente inteiro, e todos os testes
         -- seguintes falharem com "só roda em banco marcado como de teste".
         --
         -- A trava funcionou exatamente como projetada. Contra o projetista.
         and tablename <> 'crc_banco_de_teste';

      if lista is not null then
        execute 'truncate table ' || lista || ' restart identity cascade';
      end if;
    end $$;
  `);
}

/* -------------------------------------------------------------------------- */
/* Cenário mínimo                                                             */
/* -------------------------------------------------------------------------- */

export const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const CLINICA_A = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
export const CLINICA_B = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";

/**
 * DUAS ORGANIZAÇÕES, SEMPRE.
 *
 * Um cenário de um tenant só não consegue provar isolamento: toda consulta
 * "acerta", porque não existe o que errar. A clínica B existe em cada teste para
 * que vazamento tenha onde aparecer.
 */
export async function semearDuasClinicas(): Promise<void> {
  await sql(`
    insert into public.crc_organizations (id, nome, slug) values
      ('${ORG_A}', 'Clinica A', 'clinica-a'),
      ('${ORG_B}', 'Clinica B', 'clinica-b')
    on conflict (id) do nothing;

    insert into public.crc_clinics (id, organization_id, nome, slug) values
      ('${CLINICA_A}', '${ORG_A}', 'Matriz A', 'matriz-a'),
      ('${CLINICA_B}', '${ORG_B}', 'Matriz B', 'matriz-b')
    on conflict (id) do nothing;
  `);
}

/** Um uuid determinístico por nome, para os testes não dependerem de sorte. */
export function uuidDe(semente: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < semente.length; i += 1) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, "0");
  return `${hex}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(2, 5)}-${hex}${hex.slice(0, 4)}`;
}
