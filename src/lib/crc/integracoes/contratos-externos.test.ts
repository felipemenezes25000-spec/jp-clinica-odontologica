/**
 * Voz e pagamento sem provedor — o que precisa ser verdade enquanto não há um.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o de `conferirAssinatura` devolver
 *  `false` sem provedor.
 *
 *  É a única função das duas interfaces que não lança, e a diferença importa:
 *
 *    lançasse   → a rota de webhook responderia 500 a qualquer requisição, e
 *                 um atacante saberia que há endpoint ali;
 *    `true`     → aceitaria qualquer webhook forjado dizendo "pago";
 *    `false`    → a rota responde 401 como responde a qualquer assinatura
 *                 errada. O comportamento é o mesmo com ou sem provedor.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  ESTADOS_QUE_LIBERAM,
  liberaAtendimento,
  pagamentoDisponivel,
  PAGAMENTO_SEM_PROVEDOR,
  provedorDePagamento,
} from "./pagamento/contrato";
import { provedorDeVoz, VOZ_SEM_PROVEDOR, vozDisponivel } from "./voz/contrato";

/* -------------------------------------------------------------------------- */

describe("voz sem provedor", () => {
  it("recusa TUDO em vez de fingir que funcionou", async () => {
    /*
     * Um stub que resolve sem fazer nada é a pior opção: o CRC acharia que
     * atendeu, gravaria transcrição vazia, e a pessoa do outro lado teria
     * escutado o telefone tocar até cair.
     */
    const v = VOZ_SEM_PROVEDOR;

    await expect(
      v.atender({
        idExterno: "x",
        direcao: "ENTRADA",
        de: "5511999990000",
        para: "5511888880000",
        iniciadaEm: "2026-09-15T14:00:00.000Z",
      }),
    ).rejects.toThrow();

    await expect(v.falar("x", "oi")).rejects.toThrow();
    await expect(v.ouvir("x")).rejects.toThrow();
    await expect(v.transferir("x", "100")).rejects.toThrow();
    await expect(v.desligar("x")).rejects.toThrow();
  });

  it("o erro diz BLOCKED_EXTERNAL — que é diferente de quebrado", async () => {
    /*
     * A camada de cima precisa distinguir "não contratado" de "caiu". A
     * primeira não é incidente; a segunda é.
     */
    await expect(VOZ_SEM_PROVEDOR.falar("x", "oi")).rejects.toMatchObject({
      code: "BLOCKED_EXTERNAL",
    });
  });

  it("diz em voz alta que não está disponível", () => {
    expect(vozDisponivel()).toBe(false);
    expect(provedorDeVoz().nome).toBe("sem-provedor");
  });
});

/* -------------------------------------------------------------------------- */

describe("pagamento sem provedor", () => {
  it("conferirAssinatura devolve FALSE — nunca lança, nunca aceita", () => {
    /*
     * ============================================================================
     *  ESTE É O TESTE MAIS IMPORTANTE DOS DOIS ARQUIVOS.
     *
     *  `true` aceitaria qualquer webhook forjado dizendo "pago", e o CRC
     *  liberaria atendimento sem ninguém ter pagado nada.
     * ============================================================================
     */
    expect(PAGAMENTO_SEM_PROVEDOR.conferirAssinatura("{}", {})).toBe(false);
    expect(
      PAGAMENTO_SEM_PROVEDOR.conferirAssinatura('{"status":"pago"}', {
        "x-assinatura": "qualquer",
      }),
    ).toBe(false);
  });

  it("criar, consultar e estornar recusam", async () => {
    await expect(
      PAGAMENTO_SEM_PROVEDOR.criar({
        centavos: 10_000,
        meio: "PIX",
        descricao: "teste",
        chaveDeIdempotencia: "k",
        expiraEmMinutos: 30,
      }),
    ).rejects.toMatchObject({ code: "BLOCKED_EXTERNAL" });

    await expect(PAGAMENTO_SEM_PROVEDOR.consultar("x")).rejects.toThrow();
    await expect(PAGAMENTO_SEM_PROVEDOR.estornar("x", 100)).rejects.toThrow();
  });

  it("diz em voz alta que não está disponível", () => {
    expect(pagamentoDisponivel()).toBe(false);
    expect(provedorDePagamento().nome).toBe("sem-provedor");
  });
});

/* -------------------------------------------------------------------------- */

describe("os estados do pagamento", () => {
  it("SÓ pago libera atendimento", () => {
    /*
     * ============================================================================
     *  `DESCONHECIDO` É O ESTADO QUE ESTE TESTE EXISTE PARA PROTEGER.
     *
     *  Toda integração de pagamento cai no meio de alguma transação: o CRC
     *  pediu, o provedor recebeu, e a resposta se perdeu. O dinheiro pode ter
     *  saído ou não.
     *
     *  Tratá-lo como pago libera atendimento que ninguém pagou. Tratá-lo como
     *  não pago barra quem pagou. Ele fica sendo o que é — desconhecido — e
     *  NÃO libera, porque entre cobrar de novo e trabalhar de graça, a primeira
     *  tem conserto.
     * ============================================================================
     */
    expect(liberaAtendimento("PAGO")).toBe(true);

    for (const e of [
      "CRIADO",
      "AGUARDANDO",
      "RECUSADO",
      "ESTORNADO",
      "EXPIRADO",
      "DESCONHECIDO",
    ] as const) {
      expect(liberaAtendimento(e)).toBe(false);
    }
  });

  it("a lista do que libera tem exatamente um estado", () => {
    // Se um dia virar dois, que seja uma decisão consciente e não um acidente
    // de merge.
    expect(ESTADOS_QUE_LIBERAM).toEqual(["PAGO"]);
  });
});

/* -------------------------------------------------------------------------- */

describe("o que a arquitetura recusa a ter", () => {
  it("nenhum tipo de pagamento tem campo de cartão", async () => {
    /*
     * ============================================================================
     *  O §28 diz "não armazenar cartão bruto". Isto é uma decisão de
     *  ARQUITETURA: não há onde escrever, e o que não existe não vaza.
     *
     *  O teste lê o próprio arquivo, porque um tipo TypeScript some na
     *  compilação e nenhuma asserção de runtime alcançaria isso.
     * ============================================================================
     */
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("src/lib/crc/integracoes/pagamento/contrato.ts", "utf8");

    // Fora dos comentários, nenhum campo com nome de dado de cartão.
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    for (const proibido of ["cvv", "numeroDoCartao", "cardNumber", "validade", "titular"]) {
      expect(semComentarios.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
  });
});
