/**
 * Correlação — Fase I.
 *
 * O QUE ESTES TESTES PROTEGEM é a única propriedade que faz a correlação valer
 * alguma coisa: **um lote não pode virar uma história só.**
 *
 * O worker processa até cinco pacientes por rodada, de clínicas possivelmente
 * diferentes. Um id por lote intercalaria cinco histórias numa — exatamente o
 * problema que a correlação existe para resolver, com uma camada a mais de
 * confusão por cima.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  anotarRun,
  camposDeCorrelacao,
  comCorrelacao,
  correlacaoAtual,
  definirCorrelacao,
  novaCorrelacao,
} from "./correlacao";

const ORG = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  definirCorrelacao(null);
});

describe("o id", () => {
  it("carrega a DATA, para dar para buscar por dia", () => {
    const id = novaCorrelacao(new Date("2026-09-11T14:00:00.000Z"));

    /*
     * Um uuid seria mais "correto" e inútil aqui. Quem investiga costuma ter só
     * uma hora aproximada e o nome da clínica; `crc-20260911` reduz um mês de
     * log para um dia sem precisar de índice nenhum.
     */
    expect(id).toMatch(/^crc-20260911-[0-9a-f]{6}$/u);
  });

  it("não repete", () => {
    const ids = new Set(Array.from({ length: 200 }, () => novaCorrelacao()));
    // Colisão faria duas investigações se misturarem — o oposto do objetivo.
    expect(ids.size).toBeGreaterThan(190);
  });
});

describe("comCorrelacao", () => {
  it("os campos entram no log enquanto ela está ativa", async () => {
    await comCorrelacao(
      { id: "crc-1", organizationId: ORG, origem: "turno", conversationId: "c1" },
      () => {
        const campos = camposDeCorrelacao();
        expect(campos["cid"]).toBe("crc-1");
        expect(campos["origem"]).toBe("turno");
        expect(campos["conversationId"]).toBe("c1");
        return Promise.resolve();
      },
    );
  });

  it("omite o que é nulo", async () => {
    await comCorrelacao({ id: "crc-2", organizationId: null, origem: "cron" }, () => {
      // Uma linha com `jobId: null` ocupa espaço para dizer "não havia job", e
      // quem lê log lê muitas linhas.
      expect(camposDeCorrelacao()).toEqual({ cid: "crc-2", origem: "cron" });
      return Promise.resolve();
    });
  });

  it("RESTAURA a anterior, e não limpa", async () => {
    await comCorrelacao({ id: "fora", organizationId: ORG, origem: "motor" }, async () => {
      await comCorrelacao({ id: "dentro", organizationId: ORG, origem: "turno" }, () => {
        expect(correlacaoAtual()?.id).toBe("dentro");
        return Promise.resolve();
      });

      /*
       * A DIFERENÇA ENTRE RESTAURAR E LIMPAR aparece exatamente aqui. Limpar
       * faria a correlação de fora sumir quando a de dentro terminasse, e as
       * linhas seguintes ficariam órfãs no meio da investigação — bem na hora em
       * que o turno devolve o resultado ao motor, que é onde os erros aparecem.
       */
      expect(correlacaoAtual()?.id).toBe("fora");
    });
  });

  it("restaura mesmo quando o de dentro EXPLODE", async () => {
    await comCorrelacao({ id: "fora", organizationId: ORG, origem: "motor" }, async () => {
      await expect(
        comCorrelacao({ id: "dentro", organizationId: ORG, origem: "turno" }, () =>
          Promise.reject(new Error("falhou")),
        ),
      ).rejects.toThrow();

      // É justamente a execução que falha que mais precisa das linhas
      // seguintes correlacionadas.
      expect(correlacaoAtual()?.id).toBe("fora");
    });
  });

  it("cada job do lote tem a PRÓPRIA correlação", async () => {
    const vistos: string[] = [];
    const jobs = ["job-a", "job-b", "job-c"];

    for (const job of jobs) {
      await comCorrelacao(
        { id: novaCorrelacao(), organizationId: ORG, origem: "turno", jobId: job },
        () => {
          vistos.push(String(camposDeCorrelacao()["cid"]));
          return Promise.resolve();
        },
      );
    }

    /*
     * A PROPRIEDADE QUE JUSTIFICA O MÓDULO. Um id por LOTE intercalaria cinco
     * pacientes — possivelmente de clínicas diferentes — numa história só.
     */
    expect(new Set(vistos).size).toBe(3);
  });

  it("no fim do lote, não sobra correlação pendurada", async () => {
    await comCorrelacao({ id: "x", organizationId: ORG, origem: "turno" }, () => Promise.resolve());

    // Sem isto, a rodada seguinte do cron herdaria o id da anterior e as duas
    // apareceriam como a mesma execução.
    expect(correlacaoAtual()).toBeNull();
    expect(camposDeCorrelacao()).toEqual({});
  });
});

describe("anotarRun", () => {
  it("acrescenta o runId à correlação em curso", async () => {
    await comCorrelacao({ id: "crc-3", organizationId: ORG, origem: "turno" }, () => {
      anotarRun("run-42");
      expect(camposDeCorrelacao()["runId"]).toBe("run-42");
      return Promise.resolve();
    });
  });

  it("run vazia não polui a linha", async () => {
    await comCorrelacao({ id: "crc-4", organizationId: ORG, origem: "turno" }, () => {
      /*
       * `trace.reservar` devolve `runId: ""` quando o banco falhou e o turno
       * seguiu mesmo assim — é a degradação deliberada da Fase B. Gravar string
       * vazia faria a busca por run devolver lixo.
       */
      anotarRun("");
      expect(camposDeCorrelacao()["runId"]).toBeUndefined();
      return Promise.resolve();
    });
  });

  it("sem correlação ativa, não quebra", () => {
    // O turno também roda fora do worker — em teste, no replay, no Playground.
    expect(() => {
      anotarRun("run-1");
    }).not.toThrow();
  });
});
