/**
 * Visões salvas — item 147.
 *
 * A parte que merece teste não é "salvou e apareceu". É a LEITURA DO JSONB:
 * `filtros` é um campo livre no banco, e o que sai de lá vira filtro de
 * consulta. Um validador frouxo aqui é um filtro inventado passando direto
 * para o PostgREST — e, pior, uma visão que abre mostrando a lista errada sem
 * nenhum sinal de que algo deu errado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

import {
  FILTRO_FUNIL_VAZIO,
  apagarVisao,
  lerFiltroFunil,
  listarVisoes,
  normalizarNome,
  salvarVisao,
} from "./visoes";
import { conteudo, limparBanco } from "../testes/banco-memoria";

const ORG = "org-1";
const EU = "user-eu";
const OUTRA = "user-outra";

beforeEach(() => {
  limparBanco();
});

/* ========================================================================== */

describe("leitura do filtro salvo", () => {
  it("aceita o que existe", () => {
    expect(
      lerFiltroFunil({
        tipos: ["MISSED_APPOINTMENT", "RECALL"],
        etapaChave: "contato_pendente",
        apenasMinhas: true,
      }),
    ).toEqual({
      tipos: ["MISSED_APPOINTMENT", "RECALL"],
      etapaChave: "contato_pendente",
      apenasMinhas: true,
    });
  });

  it("DESCARTA tipo que não existe, em vez de repassar", () => {
    // O caso real: alguém edita a linha no banco, ou uma versão antiga salvou
    // um tipo que foi renomeado. Repassar produziria um `in` com um valor que
    // não casa com nada — a tela mostraria "nenhuma oportunidade" e ninguém
    // saberia por quê.
    const f = lerFiltroFunil({ tipos: ["MISSED_APPOINTMENT", "TIPO_INVENTADO", 42, null] });
    expect(f.tipos).toEqual(["MISSED_APPOINTMENT"]);
  });

  it("não deixa passar chave desconhecida", () => {
    const f = lerFiltroFunil({ limite: 999999, ordenar: "criado_em", tipos: [] });
    expect(f).toEqual(FILTRO_FUNIL_VAZIO);
  });

  it("tolera lixo sem lançar", () => {
    for (const lixo of [null, undefined, 7, "texto", [], { tipos: "nada" }]) {
      expect(lerFiltroFunil(lixo)).toEqual(FILTRO_FUNIL_VAZIO);
    }
  });

  it("tira tipo repetido", () => {
    const f = lerFiltroFunil({ tipos: ["RECALL", "RECALL", "RECALL"] });
    expect(f.tipos).toEqual(["RECALL"]);
  });

  it("etapa só de espaço vira nenhuma etapa", () => {
    expect(lerFiltroFunil({ etapaChave: "   " }).etapaChave).toBeNull();
  });
});

describe("nome", () => {
  it("junta espaços e corta no limite", () => {
    expect(normalizarNome("  Faltantes   da    semana  ")).toBe("Faltantes da semana");
    expect(normalizarNome("x".repeat(80))).toHaveLength(40);
  });

  it("nome vazio é recusado", async () => {
    const r = await salvarVisao({
      organizationId: ORG,
      userId: EU,
      escopo: "funil",
      nome: "   ",
      filtros: { ...FILTRO_FUNIL_VAZIO },
      compartilhada: false,
    });
    expect(r.ok).toBe(false);
    expect(conteudo("crc_saved_views")).toHaveLength(0);
  });
});

/* ========================================================================== */

describe("salvar e listar", () => {
  const salvarFaltantes = (nome: string, compartilhada = false) =>
    salvarVisao({
      organizationId: ORG,
      userId: EU,
      escopo: "funil",
      nome,
      filtros: { tipos: ["MISSED_APPOINTMENT"], etapaChave: null, apenasMinhas: false },
      compartilhada,
    });

  it("salvar com o MESMO nome atualiza, e não duplica", async () => {
    await salvarFaltantes("Faltantes da semana");

    const segunda = await salvarVisao({
      organizationId: ORG,
      userId: EU,
      escopo: "funil",
      nome: "Faltantes da semana",
      filtros: { tipos: ["CANCELLED_APPOINTMENT"], etapaChave: "fechado", apenasMinhas: true },
      compartilhada: false,
    });

    expect(segunda.ok).toBe(true);
    expect(conteudo("crc_saved_views"), "uma linha, não duas").toHaveLength(1);

    const minhas = await listarVisoes(ORG, EU, "funil");
    expect(minhas[0]?.filtros.tipos).toEqual(["CANCELLED_APPOINTMENT"]);
    expect(minhas[0]?.filtros.etapaChave).toBe("fechado");
  });

  it("a visão de outra pessoa NÃO aparece enquanto for pessoal", async () => {
    await salvarVisao({
      organizationId: ORG,
      userId: OUTRA,
      escopo: "funil",
      nome: "A fila dela",
      filtros: { ...FILTRO_FUNIL_VAZIO, apenasMinhas: true },
      compartilhada: false,
    });

    expect(await listarVisoes(ORG, EU, "funil")).toHaveLength(0);
  });

  it("compartilhada aparece para todo mundo, marcada como não sendo minha", async () => {
    await salvarVisao({
      organizationId: ORG,
      userId: OUTRA,
      escopo: "funil",
      nome: "Recall implantes",
      filtros: { tipos: ["RECALL"], etapaChave: null, apenasMinhas: false },
      compartilhada: true,
    });

    const vistas = await listarVisoes(ORG, EU, "funil");
    expect(vistas).toHaveLength(1);
    // `minha: false` é o que esconde a lixeira na tela.
    expect(vistas[0]?.minha).toBe(false);
    expect(vistas[0]?.compartilhada).toBe(true);
  });

  it("a MINHA compartilhada aparece uma vez só, e como minha", async () => {
    await salvarFaltantes("Orçamentos quentes", true);

    const vistas = await listarVisoes(ORG, EU, "funil");
    expect(vistas, "não pode duplicar por cair nas duas consultas").toHaveLength(1);
    expect(vistas[0]?.minha).toBe(true);
  });
});

describe("apagar", () => {
  it("apaga a própria", async () => {
    await salvarVisao({
      organizationId: ORG,
      userId: EU,
      escopo: "funil",
      nome: "Minha",
      filtros: { ...FILTRO_FUNIL_VAZIO, apenasMinhas: true },
      compartilhada: false,
    });
    const id = String(conteudo("crc_saved_views")[0]?.["id"] ?? "");

    await apagarVisao(ORG, EU, id);
    expect(conteudo("crc_saved_views")).toHaveLength(0);
  });

  it("NÃO apaga a de outra pessoa, mesmo com o id na mão", async () => {
    await salvarVisao({
      organizationId: ORG,
      userId: OUTRA,
      escopo: "funil",
      nome: "Dela",
      filtros: { ...FILTRO_FUNIL_VAZIO },
      compartilhada: true,
    });
    const id = String(conteudo("crc_saved_views")[0]?.["id"] ?? "");

    // O `user_id` é filtro do DELETE, e não conferência antes dele: o id
    // adulterado simplesmente não atinge linha nenhuma.
    await apagarVisao(ORG, EU, id);
    expect(conteudo("crc_saved_views")).toHaveLength(1);
  });
});
