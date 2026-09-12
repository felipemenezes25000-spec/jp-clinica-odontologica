/**
 * O ADAPTADOR DE PRODUÇÃO, falando com Postgres de verdade.
 *
 * ============================================================================
 *  ISTO NÃO ERA POSSÍVEL ATÉ AGORA, e a impossibilidade custou um P0.
 *
 *  `servidor/banco.ts` prefixava `/rest/v1/` — a rota do SUPABASE. O PostgREST
 *  puro serve na raiz. Apontar o adaptador para o banco de teste produzia
 *  `/rest/v1/crc_patients` e devolvia 404, então os 68 testes de integração
 *  montavam as chamadas à mão.
 *
 *  O cabeçalho de `apoio.ts` registra o preço: enquanto era razoável supor que
 *  uma incompatibilidade entre código e schema apareceria nos testes, ela não
 *  apareceria. E não apareceu — o `supabase/23` trocou a chave primária de
 *  `crc_sync_state`, o `sincronizacao.ts` continuou com o `on_conflict` antigo,
 *  e os testes seguiram verdes.
 *
 *  Com `SUPABASE_REST_PREFIXO`, o adaptador de produção fala com o PostgREST de
 *  teste. Este arquivo é a consequência: as funções que o CÓDIGO usa, contra o
 *  banco de verdade.
 * ============================================================================
 *
 * O QUE ELE PROVA que os outros não provam: que a string de `on_conflict` que
 * está no código casa com a constraint que está no banco. Nenhuma reescrita de
 * query, nenhuma aproximação — as mesmas funções que rodam em produção.
 */
import { readFileSync } from "node:fs";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  exigirBanco,
  limparTudo,
  semearDuasClinicas,
  sql,
  CLINICA_A,
  CLINICA_B,
  ORG_A,
} from "./apoio";

/*
 * O PREFIXO, ANTES DE QUALQUER IMPORT DO ADAPTADOR.
 *
 * `servidor/banco.ts` lê a variável em toda chamada, então definir aqui basta —
 * e é explícito, que é o ponto: ninguém liga isto sem querer em produção.
 */
process.env["SUPABASE_REST_PREFIXO"] = "/";

beforeAll(() => {
  exigirBanco();
});

beforeEach(async () => {
  await limparTudo();
  await semearDuasClinicas();
});

/**
 * A string de conflito LIDA DO ARQUIVO DE PRODUÇÃO.
 *
 * É a amarra inteira deste bloco, e é o mesmo padrão de `tenant.test.ts`:
 * reescrever `"organization_id,varredura"` aqui testaria a query do TESTE.
 * Lendo do `handlers.ts`, uma divergência entre código e banco quebra — que é
 * exatamente o que NÃO aconteceu quando o `supabase/23` trocou a chave de
 * `crc_sync_state`.
 */
function conflitoDoCodigo(): string {
  const fonte = readFileSync("src/lib/crc/automacao/handlers.ts", "utf8");
  const m = /gravar\(\s*"crc_scan_state",[\s\S]*?"([a-z_,]+)",\s*\)/u.exec(fonte);
  if (m?.[1] === undefined)
    throw new Error("Não achei o on_conflict de crc_scan_state em handlers.ts");
  return m[1];
}

describe("o upsert do cursor de varredura", () => {
  it("a chave do CÓDIGO casa com a do BANCO", async () => {
    /*
     * ESTE É O TESTE QUE TERIA PEGO O DEFEITO DO `supabase/23`. Ele não escreve
     * `"organization_id,varredura"` em lugar nenhum: chama a função que o
     * `handlers.ts` chama, e deixa o Postgres responder.
     *
     * Com a chave errada, o PostgREST devolve 42P10 — "there is no unique or
     * exclusion constraint matching the ON CONFLICT specification" — e a
     * mensagem aparece aqui, e não em produção.
     */
    const { gravar, selecionarUm } = await import("../../servidor/banco");

    await gravar(
      "crc_scan_state",
      {
        organization_id: ORG_A,
        varredura: "recall",
        cursor_data: "2026-01-01T00:00:00.000Z",
        cursor_id: CLINICA_A,
        ciclo: 0,
      },
      conflitoDoCodigo(),
    );

    // REGRAVAR ATUALIZA, e não cria uma segunda linha: é o que faz o cursor ser
    // um cursor, e não um histórico.
    await gravar(
      "crc_scan_state",
      {
        organization_id: ORG_A,
        varredura: "recall",
        cursor_data: "2026-02-02T00:00:00.000Z",
        cursor_id: CLINICA_B,
        ciclo: 1,
      },
      conflitoDoCodigo(),
    );

    const linhas = await sql<{ n: string }>(
      `select count(*)::text as n from public.crc_scan_state where organization_id = '${ORG_A}'`,
    );
    expect(linhas[0]?.n).toBe("1");

    const atual = await selecionarUm("crc_scan_state", {
      colunas: "cursor_data,cursor_id,ciclo",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: ORG_A },
        { coluna: "varredura", op: "eq", valor: "recall" },
      ],
    });
    expect(atual?.["ciclo"]).toBe(1);
    expect(String(atual?.["cursor_id"] ?? "")).toBe(CLINICA_B);
  });

  it("varreduras diferentes da mesma organização são linhas diferentes", async () => {
    const { gravar } = await import("../../servidor/banco");

    for (const varredura of ["recall", "aniversario"]) {
      await gravar(
        "crc_scan_state",
        { organization_id: ORG_A, varredura, cursor_data: null, cursor_id: null },
        conflitoDoCodigo(),
      );
    }

    const linhas = await sql<{ n: string }>(
      `select count(*)::text as n from public.crc_scan_state where organization_id = '${ORG_A}'`,
    );
    expect(linhas[0]?.n).toBe("2");
  });
});

describe("as RPCs novas, pelo adaptador", () => {
  it("`crc_pagina_de_recall` responde com a assinatura que o código envia", async () => {
    /*
     * A SONDA MAIS BARATA DE INCOMPATIBILIDADE: o PostgREST resolve função por
     * NOME DE ARGUMENTO. Um parâmetro renomeado no SQL e não no código devolve
     * `PGRST202`, e o sintoma em produção seria a varredura de recall parando
     * sem nada aparecer.
     */
    const { rpc } = await import("../../servidor/banco");

    const linhas = await rpc("crc_pagina_de_recall", {
      p_organization_id: ORG_A,
      p_limite_data: new Date().toISOString(),
      p_cursor_data: null,
      p_cursor_id: null,
      p_limite: 10,
    });
    expect(Array.isArray(linhas)).toBe(true);
  });

  it("`crc_aniversariantes` idem", async () => {
    const { rpc } = await import("../../servidor/banco");

    const linhas = await rpc("crc_aniversariantes", {
      p_organization_id: ORG_A,
      p_datas: [908],
      p_limite: 10,
    });
    expect(Array.isArray(linhas)).toBe(true);
  });

  it("`crc_bater_heartbeat` grava e o adaptador relê", async () => {
    const { rpc, selecionarUm } = await import("../../servidor/banco");

    await rpc("crc_bater_heartbeat", {
      p_worker: "pulso",
      p_fase: "sucesso",
      p_erro: null,
      p_duracao_ms: 42,
      p_metricas: { turnos: 7 },
    });

    const linha = await selecionarUm("crc_runtime_heartbeats", {
      colunas: "worker,duracao_ms,ultimo_sucesso_em,metricas",
      filtros: [{ coluna: "worker", op: "eq", valor: "pulso" }],
    });

    expect(linha?.["duracao_ms"]).toBe(42);
    expect(linha?.["ultimo_sucesso_em"]).not.toBeNull();
    expect(linha?.["metricas"]).toEqual({ turnos: 7 });
  });

  it("o ERRO não apaga o último sucesso — a regra vive no SQL, e é testada nele", async () => {
    const { rpc, selecionarUm } = await import("../../servidor/banco");

    await rpc("crc_bater_heartbeat", { p_worker: "motor", p_fase: "sucesso" });
    await rpc("crc_bater_heartbeat", {
      p_worker: "motor",
      p_fase: "erro",
      p_erro: "credencial vencida",
    });

    const linha = await selecionarUm("crc_runtime_heartbeats", {
      colunas: "ultimo_sucesso_em,ultimo_erro",
      filtros: [{ coluna: "worker", op: "eq", valor: "motor" }],
    });

    // É o campo que o painel lê para dizer "há quanto tempo isto funciona".
    expect(linha?.["ultimo_sucesso_em"]).not.toBeNull();
    expect(linha?.["ultimo_erro"]).toBe("credencial vencida");
  });
});
