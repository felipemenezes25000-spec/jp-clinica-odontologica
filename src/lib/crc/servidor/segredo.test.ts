/**
 * Testes da cifra de segredo.
 *
 * O TESTE QUE IMPORTA AQUI É O DE ADULTERAÇÃO. Cifrar e decifrar de volta é o
 * caso fácil, e qualquer implementação errada passa nele. O que separa GCM de
 * CBC — e é a razão de este arquivo usar GCM — é o texto cifrado alterado ser
 * DETECTADO em vez de decifrado como lixo.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cifraConfigurada, cifrar, decifrar, dicaDoSegredo } from "./segredo";

const CHAVE = Buffer.alloc(32, 7).toString("base64");
const OUTRA = Buffer.alloc(32, 9).toString("base64");
const SEGREDO = "sk-proj-uma-chave-de-api-bem-comprida-1234";

const ambiente = { ...process.env };

beforeEach(() => {
  process.env["CRC_SEGREDO_CHAVE"] = CHAVE;
});

afterEach(() => {
  process.env = { ...ambiente };
});

describe("configuração", () => {
  it("sem a chave no ambiente, diz o que falta", () => {
    delete process.env["CRC_SEGREDO_CHAVE"];
    const r = cifraConfigurada();
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("CRC_SEGREDO_CHAVE");
  });

  it("chave de tamanho errado é tratada como ausente", () => {
    // "Funcionaria" com `createCipheriv` lançando no meio de uma gravação, em
    // vez de falhar na verificação de configuração.
    process.env["CRC_SEGREDO_CHAVE"] = Buffer.alloc(16, 1).toString("base64");
    expect(cifraConfigurada().ok).toBe(false);
  });

  it("aceita hexa além de base64", () => {
    process.env["CRC_SEGREDO_CHAVE"] = Buffer.alloc(32, 3).toString("hex");
    expect(cifraConfigurada().ok).toBe(true);
  });
});

describe("ida e volta", () => {
  it("decifra o que cifrou", () => {
    expect(decifrar(cifrar(SEGREDO))).toBe(SEGREDO);
  });

  it("o texto original não aparece no resultado", () => {
    const guardado = cifrar(SEGREDO);
    expect(guardado).not.toContain("uma-chave");
    expect(guardado.startsWith("v1:")).toBe(true);
  });

  it("cifrar duas vezes dá resultados DIFERENTES", () => {
    // IV aleatório por chamada. Sem isso, duas clínicas com a mesma chave teriam
    // a mesma linha no banco — e a igualdade delas seria visível a olho nu.
    expect(cifrar(SEGREDO)).not.toBe(cifrar(SEGREDO));
  });
});

describe("o que não decifra", () => {
  it("texto cifrado ADULTERADO é recusado, não decifrado como lixo", () => {
    const guardado = cifrar(SEGREDO);
    const partes = guardado.split(":");
    const conteudo = Buffer.from(partes[3] ?? "", "base64url");
    conteudo[0] = (conteudo[0] ?? 0) ^ 0xff;
    const adulterado = [partes[0], partes[1], partes[2], conteudo.toString("base64url")].join(":");

    expect(decifrar(adulterado)).toBeNull();
  });

  it("chave trocada devolve null em vez de lançar", () => {
    const guardado = cifrar(SEGREDO);
    process.env["CRC_SEGREDO_CHAVE"] = OUTRA;
    // `null` e não exceção: quem chama é o gateway no meio de um turno, e isto
    // tem que virar "provedor indisponível", não derrubar o atendimento.
    expect(decifrar(guardado)).toBeNull();
  });

  it("formato desconhecido devolve null", () => {
    expect(decifrar("isso nao e um segredo")).toBeNull();
    expect(decifrar("v9:a:b:c")).toBeNull();
  });

  it("sem chave no ambiente, decifrar devolve null", () => {
    const guardado = cifrar(SEGREDO);
    delete process.env["CRC_SEGREDO_CHAVE"];
    expect(decifrar(guardado)).toBeNull();
  });
});

describe("a dica", () => {
  it("mostra começo e fim, nunca o meio", () => {
    const dica = dicaDoSegredo(SEGREDO);
    expect(dica).toContain("sk-proj");
    expect(dica).toContain("1234");
    expect(dica).not.toContain("uma-chave");
  });

  it("segredo curto vira só marcadores", () => {
    expect(dicaDoSegredo("abc")).not.toContain("abc");
  });
});
