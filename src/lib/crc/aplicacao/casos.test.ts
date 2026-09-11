/**
 * Testes dos casos humanos e do dono da conversa.
 *
 * O QUE ESTA FATIA PRECISA PROVAR são duas coisas que, se falharem, aparecem
 * na frente do paciente:
 *
 *   A IA CALA quando um atendente assume. O contrário é o pior desfecho da
 *   Inbox — duas respostas ao mesmo paciente com segundos de diferença.
 *
 *   UMA CONVERSA NÃO VIRA DOIS CASOS. Duas mensagens em sequência não podem
 *   colocar a mesma pessoa duas vezes na fila da recepção.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import {
  abrirCaso,
  assumirCaso,
  assumirConversa,
  devolverParaIa,
  donoDaConversa,
  listarCasosAbertos,
  resolverCaso,
} from "./casos";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const OUTRA = "66666666-6666-4666-8666-666666666666";
const ATENDENTE = "77777777-7777-4777-8777-777777777777";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const pedido = (mudancas: Partial<Parameters<typeof abrirCaso>[0]> = {}) => ({
  organizationId: ORG,
  clinicId: null,
  conversationId: CONVERSA,
  patientId: null,
  motivoCodigo: "conteudo_clinico",
  motivo: "A resposta continha orientação clínica.",
  resumo: "Paciente perguntou sobre remédio.",
  respostaBarrada: "Tome dipirona.",
  proximaAcao: null,
  chaveDedupe: "turno:evt-1",
  ...mudancas,
});

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_conversations", [
    { id: CONVERSA, organization_id: ORG, clinic_id: null, dono: "ia" },
    { id: OUTRA, organization_id: ORG, clinic_id: null, dono: "ia" },
  ]);
});

describe("o dono da conversa é estado, não inferência", () => {
  it("nasce com a IA", async () => {
    expect((await donoDaConversa(ORG, CONVERSA)).dono).toBe("ia");
  });

  it("assumir transfere para a pessoa, com nome", async () => {
    await assumirConversa(ORG, CONVERSA, ATENDENTE);
    const d = await donoDaConversa(ORG, CONVERSA);
    expect(d.dono).toBe("humano");
    expect(d.userId).toBe(ATENDENTE);
  });

  it("devolver é um ato explícito, e limpa o dono", async () => {
    await assumirConversa(ORG, CONVERSA, ATENDENTE);
    await devolverParaIa(ORG, CONVERSA);
    const d = await donoDaConversa(ORG, CONVERSA);
    expect(d.dono).toBe("ia");
    expect(d.userId).toBeNull();
  });

  it("conversa sem a coluna preenchida conta como da IA", async () => {
    // Migração: as conversas que já existiam antes desta fatia não têm `dono`.
    // Tratá-las como "ninguem" calaria a automação no dia do deploy.
    semear("crc_conversations", [{ id: "sem-dono", organization_id: ORG }]);
    expect((await donoDaConversa(ORG, "sem-dono")).dono).toBe("ia");
  });
});

describe("abrir caso", () => {
  it("abre, e abrir CALA a IA na conversa", async () => {
    const r = await abrirCaso(pedido());
    expect(r.criado).toBe(true);

    // O ponto da fatia: o agente disse que não é ele quem resolve. Continuar
    // respondendo depois disso seria ignorar a própria decisão.
    expect((await donoDaConversa(ORG, CONVERSA)).dono).toBe("ninguem");
  });

  it("guarda o que o agente ia dizer, como rascunho e como evidência", async () => {
    await abrirCaso(pedido());
    expect(conteudo("crc_human_cases")[0]?.["resposta_barrada"]).toBe("Tome dipirona.");
  });

  it("uma conversa não acumula dois casos abertos", async () => {
    await abrirCaso(pedido());
    const segundo = await abrirCaso(
      pedido({ chaveDedupe: "turno:evt-2", motivo: "O paciente pediu humano." }),
    );

    expect(segundo.criado).toBe(false);
    expect(conteudo("crc_human_cases")).toHaveLength(1);
  });

  it("o segundo motivo é anexado ao caso que já existe", async () => {
    await abrirCaso(pedido());
    await abrirCaso(pedido({ chaveDedupe: "turno:evt-2", motivo: "O paciente pediu humano." }));

    const motivo = String(conteudo("crc_human_cases")[0]?.["motivo"] ?? "");
    expect(motivo).toContain("orientação clínica");
    expect(motivo).toContain("pediu humano");
  });

  it("conversas diferentes abrem casos diferentes", async () => {
    await abrirCaso(pedido());
    await abrirCaso(pedido({ conversationId: OUTRA, chaveDedupe: "turno:evt-9" }));
    expect(conteudo("crc_human_cases")).toHaveLength(2);
  });

  it("conteúdo clínico entra como ALTA; o resto espera", async () => {
    await abrirCaso(pedido({ prioridade: "ALTA" }));
    expect(conteudo("crc_human_cases")[0]?.["prioridade"]).toBe("ALTA");
  });
});

describe("assumir e resolver", () => {
  it("assumir o caso assume a conversa no mesmo gesto", async () => {
    const r = await abrirCaso(pedido());
    await assumirCaso(ORG, r.id ?? "", ATENDENTE);

    // Separar os dois produziria o estado em que alguém é dono do caso e a IA
    // continua respondendo.
    const d = await donoDaConversa(ORG, CONVERSA);
    expect(d.dono).toBe("humano");
    expect(d.userId).toBe(ATENDENTE);
    expect(conteudo("crc_human_cases")[0]?.["status"]).toBe("ASSUMIDO");
  });

  it("resolver NÃO devolve a conversa para a IA", async () => {
    const r = await abrirCaso(pedido());
    await assumirCaso(ORG, r.id ?? "", ATENDENTE);
    await resolverCaso(ORG, r.id ?? "", "Liguei para a paciente.");

    // Quem resolveu um caso clínico não quer a máquina de volta na mesma
    // conversa sem alguém decidir isso. Devolver é um segundo botão.
    expect((await donoDaConversa(ORG, CONVERSA)).dono).toBe("humano");
    expect(conteudo("crc_human_cases")[0]?.["status"]).toBe("RESOLVIDO");
  });

  it("caso resolvido sai da fila e libera a conversa para um caso novo", async () => {
    const r = await abrirCaso(pedido());
    await resolverCaso(ORG, r.id ?? "", "ok");
    expect(await listarCasosAbertos(ORG)).toHaveLength(0);

    const novo = await abrirCaso(pedido({ chaveDedupe: "turno:evt-3" }));
    expect(novo.criado).toBe(true);
  });

  it("a fila vem com o mais antigo no topo", async () => {
    await abrirCaso(pedido({ chaveDedupe: "a" }));
    definirRelogio(new Date(AGORA.getTime() + 60_000));
    await abrirCaso(pedido({ conversationId: OUTRA, chaveDedupe: "b" }));

    const fila = await listarCasosAbertos(ORG);
    expect(fila).toHaveLength(2);
    // Quem espera há mais tempo vem primeiro. Ordenar por prioridade deixaria
    // um caso normal esperando para sempre atrás de um fluxo de casos altos.
    expect(fila[0]?.conversationId).toBe(CONVERSA);
  });
});
