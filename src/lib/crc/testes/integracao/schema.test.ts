/**
 * O schema que nasceu do zero — Fase E, item 21.
 *
 * O QUE ESTE ARQUIVO REALMENTE TESTA já aconteceu antes de ele rodar: o CI
 * aplicou `supabase/*.sql` em ordem, num Postgres vazio, com `ON_ERROR_STOP=1`.
 * Se algum arquivo referenciasse tabela que ainda não existe, ou dependesse de
 * extensão não declarada, nada aqui teria chegado a executar.
 *
 * POR QUE ISSO NUNCA TINHA SIDO VERIFICADO. Os arquivos foram escritos um a um
 * contra um banco que já existia, e rodados à mão pelo painel. Nesse fluxo, uma
 * ordem quebrada é invisível: a tabela que falta já estava lá desde antes.
 *
 * O CASO REAL QUE MOTIVOU ISTO foi `crc_users.foto_url`: a coluna existia em
 * produção e NÃO existia nos arquivos. Quem instalasse do zero nasceria sem ela,
 * e o botão de trocar foto falharia — só na instalação nova, nunca na que está
 * no ar. Era impossível descobrir sem instalar do zero.
 *
 * O que fica AQUI, além do próprio ato de subir, são as verificações que o
 * `psql` não faz: extensões, índices que a performance do agente depende, e a
 * coerência entre o que o TypeScript acha que existe e o que existe.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { exigirBanco, sql } from "./apoio";

beforeAll(() => {
  exigirBanco();
});

describe("extensões", () => {
  it("pgvector está instalado — sem ele não há busca semântica", async () => {
    const linhas = await sql<{ extname: string }>(
      `select extname from pg_extension where extname = 'vector'`,
    );
    expect(linhas).toHaveLength(1);
  });

  it("pgcrypto está instalado — `gen_random_uuid` é o default de toda tabela", async () => {
    const linhas = await sql<{ p: string }>(
      `select proname as p from pg_proc where proname = 'gen_random_uuid'`,
    );
    expect(linhas.length).toBeGreaterThan(0);
  });
});

describe("os índices de que o agente depende", () => {
  /**
   * ÍNDICE FALTANDO NÃO QUEBRA TESTE NENHUM — quebra a clínica em produção,
   * meses depois, quando a tabela cresce. É o tipo de defeito que não tem
   * sintoma até ter todos de uma vez.
   *
   * Cada linha aqui é um índice de que um caminho quente depende.
   */
  const ESPERADOS = [
    // A fila do worker: sem ele, cada rodada do cron varre a tabela inteira.
    { tabela: "crc_agent_jobs", contem: "status" },
    // A dedupe que impede enfileirar o mesmo evento duas vezes.
    { tabela: "crc_agent_jobs", contem: "chave_dedupe" },
    // A dedupe que impede a mensagem de sair duas vezes no retry.
    { tabela: "crc_messages", contem: "chave_dedupe" },
    // O HNSW da busca semântica. Sem ele, a busca vira varredura sequencial
    // sobre vetores de 1536 dimensões.
    { tabela: "crc_knowledge_chunks", contem: "embedding" },
    // Um caso aberto por conversa.
    { tabela: "crc_human_cases", contem: "conversation_id" },
  ];

  it.each(ESPERADOS)("$tabela tem índice cobrindo $contem", async ({ tabela, contem }) => {
    const linhas = await sql<{ indexdef: string }>(
      `select indexdef from pg_indexes where schemaname = 'public' and tablename = '${tabela}'`,
    );
    expect(linhas.some((l) => l.indexdef.includes(contem))).toBe(true);
  });

  it("o índice de vetor é HNSW com distância de cosseno", async () => {
    const linhas = await sql<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = 'public' and tablename = 'crc_knowledge_chunks'`,
    );
    const vetor = linhas.find((l) => l.indexdef.includes("embedding"));

    // A classe de operador importa: um índice criado com `vector_l2_ops` não é
    // usado por uma consulta que ordena por `<=>`. O índice existe, a consulta
    // funciona, e o plano ignora o índice — lento e silencioso.
    expect(vetor?.indexdef).toContain("hnsw");
    expect(vetor?.indexdef).toContain("vector_cosine_ops");
  });
});

describe("o SQL e o TypeScript descrevem o mesmo banco", () => {
  it("toda tabela do union `Tabela` existe de verdade", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("src/lib/crc/servidor/banco.ts", "utf8");

    const inicio = fonte.indexOf("export type Tabela");
    const fim = fonte.indexOf(";", inicio);
    const doTs = [...fonte.slice(inicio, fim).matchAll(/"(crc_[a-z_]+)"/gu)].map((m) => m[1]);

    expect(doTs.length).toBeGreaterThan(20);

    const noBanco = new Set(
      (
        await sql<{ tablename: string }>(
          `select tablename from pg_tables where schemaname = 'public'`,
        )
      ).map((l) => l.tablename),
    );

    /*
     * ESTE É O FECHO DO CICLO DA FASE A.
     *
     * Lá, o banco em memória passou a conferir COLUNAS contra os arquivos SQL.
     * Aqui, o union de TABELAS do TypeScript é conferido contra o banco de
     * verdade. Junte os dois e não sobra lugar para uma consulta mencionar algo
     * que não existe.
     */
    expect(doTs.filter((t) => t !== undefined && !noBanco.has(t))).toEqual([]);
  });

  it("as funções que o código chama por RPC existem", async () => {
    const ESPERADAS = [
      "crc_reservar_eventos",
      "crc_reservar_agent_jobs",
      "crc_liberar_agent_jobs_presos",
      "crc_buscar_conhecimento",
      "crc_somar_gasto",
      "crc_reservar_orcamento",
      "crc_ajustar_gasto",
      "crc_trocar_conhecimento",
      "crc_publicar_versao_agente",
      "crc_dia_local",
    ];

    const existentes = new Set(
      (await sql<{ proname: string }>(`select proname from pg_proc`)).map((l) => l.proname),
    );

    expect(ESPERADAS.filter((f) => !existentes.has(f))).toEqual([]);
  });
});

describe("o fuso da organização", () => {
  it("crc_dia_local devolve o dia da clínica, e não o dia UTC", async () => {
    const [r] = await sql<{ dia: string }>(`
      select public.crc_dia_local(gen_random_uuid(), '2026-09-12T00:30:00Z'::timestamptz) as dia
    `);

    // 12/09 às 00h30 UTC é 11/09 às 21h30 em São Paulo. Uma organização que não
    // existe cai no fuso padrão, e o padrão é onde a clínica fica.
    expect(String(r?.dia).slice(0, 10)).toBe("2026-09-11");
  });
});
