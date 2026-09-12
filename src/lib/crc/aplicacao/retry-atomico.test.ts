/**
 * O retry cercado não pode ter meio-caminho.
 *
 * ============================================================================
 *  A JANELA, e ela é curta e real.
 *
 *  `falharJob` gravava o desfecho em DUAS instruções:
 *
 *      rpc crc_encerrar_agent_job  →  status = 'REPETIR', travado_ate = null
 *      update crc_agent_jobs       →  disponivel_em = agora + backoff
 *
 *  Entre uma e outra, a linha está no banco assim:
 *
 *      status        = 'REPETIR'
 *      disponivel_em = o valor ANTIGO, que é passado
 *      travado_ate   = null
 *
 *  E é exatamente o que a reserva procura:
 *
 *      status in ('PENDENTE','REPETIR') and disponivel_em <= now()
 *                                       and (travado_ate is null or ...)
 *
 *  Outro worker reserva no ato, e o backoff que o primeiro ia escrever cai em
 *  cima de uma reserva alheia.
 *
 *  O QUE ISSO CUSTA não é "o retry acontece cedo". O backoff existe porque a
 *  maior parte das falhas é provedor fora do ar: um retry imediato bate no
 *  mesmo provedor caído, queima uma das cinco tentativas, e o job chega ao teto
 *  em segundos em vez de em minutos — a dead letter abre antes de o provedor ter
 *  tido chance de voltar. A proteção não some; ela vira o contrário do que
 *  promete.
 *
 *  INJEÇÃO DE DEFEITO: passar o backoff de novo por um `atualizar` separado
 *  quebra "sai numa instrução só" — porque o teste conta as escritas, e não o
 *  resultado final. Um teste que olhasse só `disponivel_em` no fim ficaria
 *  verde com as duas instruções, que é precisamente o defeito.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Anota toda escrita em `crc_agent_jobs` que NÃO passa pela RPC cercada. */
const espia = vi.hoisted(() => ({
  rpcs: [] as { nome: string; argumentos: Record<string, unknown> }[],
  updatesDiretos: 0,
}));

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return {
    ...fake,
    rpc: (nome: string, argumentos: Record<string, unknown>) => {
      espia.rpcs.push({ nome, argumentos });
      return fake.rpc(nome, argumentos);
    },
    atualizar: (tabela: string, filtros: never, mudancas: never) => {
      if (tabela === "crc_agent_jobs") espia.updatesDiretos += 1;
      return fake.atualizar(tabela, filtros, mudancas);
    },
  };
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { falharJob, _reativarBackoffNaRpc, type AgentJob } from "./agent-jobs";

const ORG = "11111111-1111-4111-8111-111111111111";
const JOB = "22222222-2222-4222-8222-222222222222";
const CONVERSA = "33333333-3333-4333-8333-333333333333";
const TOKEN = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

function jobRodando(tentativas: number): AgentJob {
  semear("crc_agent_jobs", [
    {
      id: JOB,
      organization_id: ORG,
      conversation_id: CONVERSA,
      status: "RODANDO",
      tentativas,
      lease_token: TOKEN,
      travado_ate: new Date(AGORA.getTime() + 60_000).toISOString(),
      // NO PASSADO, de propósito: é o valor velho que tornaria o job elegível
      // durante a janela entre as duas instruções.
      disponivel_em: new Date(AGORA.getTime() - 600_000).toISOString(),
    },
  ]);

  return {
    id: JOB,
    organizationId: ORG,
    conversationId: CONVERSA,
    eventId: null,
    status: "RODANDO",
    tentativas,
    ultimoErro: null,
    criadoEm: AGORA.toISOString(),
    leaseToken: TOKEN,
  };
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  espia.rpcs = [];
  espia.updatesDiretos = 0;
  _reativarBackoffNaRpc();
});

/* -------------------------------------------------------------------------- */

describe("a falha com retry", () => {
  it("grava status E backoff na MESMA instrução cercada", async () => {
    await falharJob(jobRodando(1), "o provedor caiu", AGORA);

    const encerrar = espia.rpcs.filter((r) => r.nome === "crc_encerrar_agent_job");
    expect(encerrar).toHaveLength(1);

    // O BACKOFF VAI JUNTO — este é o teste.
    const argumentos = encerrar[0]?.argumentos ?? {};
    expect(argumentos["p_status"]).toBe("REPETIR");
    expect(typeof argumentos["p_disponivel_em"]).toBe("string");

    // E NÃO SOBRA UM SEGUNDO `update`. É a contagem que prende a atomicidade:
    // o estado final seria idêntico nas duas versões.
    expect(espia.updatesDiretos).toBe(0);
  });

  it("o job NÃO fica elegível: o backoff está no futuro", async () => {
    await falharJob(jobRodando(1), "o provedor caiu", AGORA);

    const job = conteudo("crc_agent_jobs")[0];
    expect(job?.["status"]).toBe("REPETIR");

    const quando = Date.parse(String(job?.["disponivel_em"] ?? ""));
    expect(quando).toBeGreaterThan(AGORA.getTime());
  });

  it("no teto, vira FALHOU com dead letter — e o desfecho também é cercado", async () => {
    await falharJob(jobRodando(5), "quebrou de novo", AGORA);

    const job = conteudo("crc_agent_jobs")[0];
    expect(job?.["status"]).toBe("FALHOU");

    const mortas = conteudo("crc_dead_letters");
    expect(mortas).toHaveLength(1);
    expect(mortas[0]?.["organization_id"]).toBe(ORG);
    expect(mortas[0]?.["origem"]).toBe("agent_job");

    expect(espia.updatesDiretos).toBe(0);
  });

  it("quem PERDEU a posse não escreve desfecho nem abre dead letter", async () => {
    /*
     * O fencing, pelo lado que costuma faltar. O worker A ficou lento, o B
     * assumiu — e o token de A não bate mais. Deixar A gravar contaria duas
     * vezes o mesmo job, e abriria dead letter para um trabalho que está sendo
     * feito agora.
     */
    const job = jobRodando(5);
    const linha = conteudo("crc_agent_jobs")[0];
    if (linha !== undefined) linha["lease_token"] = "99999999-9999-4999-8999-999999999999";

    await falharJob(job, "chegou atrasado", AGORA);

    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("RODANDO");
    expect(conteudo("crc_dead_letters")).toHaveLength(0);
  });
});
