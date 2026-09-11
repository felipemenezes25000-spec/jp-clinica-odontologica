/**
 * Testes da memória persistida.
 *
 * AS DUAS COISAS QUE SÓ QUEBRAM COM BANCO NO MEIO, e por isso estão aqui e não
 * no teste puro:
 *
 *   REPETIR NÃO DUPLICA. A pessoa dizendo "prefiro de tarde" em três conversas
 *   não pode virar três linhas — o contexto do turno encheria de cópias da mesma
 *   frase e sobraria menos espaço para as outras.
 *
 *   INVALIDADA NÃO RESSUSCITA. É a prova de que o botão de corrigir vale mais do
 *   que a próxima extração. Sem isto, apagar uma memória errada seria apagá-la
 *   até a próxima mensagem do paciente.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

import { conteudo, definirRelogio, limparBanco } from "../testes/banco-memoria";
import { VALIDADE_DIAS_CONVERSA, type MemoriaCandidata } from "../dominio/memoria";
import {
  confirmarMemoria,
  invalidarMemoria,
  listarMemorias,
  memoriasDoContexto,
  registrarMemoriaDeOperador,
  registrarMemorias,
} from "./memoria";

const ORG = "11111111-1111-4111-8111-111111111111";
const PACIENTE = "33333333-3333-4333-8333-333333333333";
const OUTRO = "99999999-9999-4999-8999-999999999999";
const ATENDENTE = "77777777-7777-4777-8777-777777777777";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const candidata = (mudancas: Partial<MemoriaCandidata> = {}): MemoriaCandidata => ({
  escopo: "paciente",
  subjectId: PACIENTE,
  conteudo: "Prefere horários depois das 17h",
  origem: "conversa",
  origemRef: "run:abc",
  confianca: 0.9,
  ...mudancas,
});

const registrar = (candidatas: MemoriaCandidata[], agora = AGORA) =>
  registrarMemorias({ organizationId: ORG, agora, candidatas });

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

describe("gravar", () => {
  it("grava a memória boa e conta a recusa da ruim, com o motivo", async () => {
    const r = await registrar([candidata(), candidata({ conteudo: "Paciente não tem dinheiro" })]);

    expect(r.gravadas).toBe(1);
    expect(r.recusadas).toHaveLength(1);
    // O motivo é o que aparece para quem for revisar por que o extrator
    // degradou — sem ele, "uma recusa" não ensina nada.
    expect(r.recusadas[0]?.codigo).toBe("juizo_financeiro");
    expect(conteudo("crc_ai_memories")).toHaveLength(1);
  });

  it("uma candidata ruim não impede a boa do mesmo lote", async () => {
    const r = await registrar([candidata({ conteudo: "Parece nervosa" }), candidata()]);
    expect(r.gravadas).toBe(1);
  });

  it("repetir a mesma frase RENOVA, não duplica", async () => {
    await registrar([candidata()]);

    const depois = new Date(AGORA.getTime() + 30 * 86_400_000);
    definirRelogio(depois);
    const r = await registrar(
      [candidata({ conteudo: "prefere horarios depois das 17h!" })],
      depois,
    );

    expect(r.gravadas).toBe(0);
    expect(r.renovadas).toBe(1);
    expect(conteudo("crc_ai_memories")).toHaveLength(1);

    // O prazo passa a contar do dia em que ela foi confirmada de novo.
    const esperado = new Date(depois.getTime() + VALIDADE_DIAS_CONVERSA * 86_400_000).toISOString();
    expect(conteudo("crc_ai_memories")[0]?.["expira_em"]).toBe(esperado);
  });

  it("repetir com mais confiança promove a pendente", async () => {
    await registrar([candidata({ confianca: 0.4 })]);
    expect(conteudo("crc_ai_memories")[0]?.["status"]).toBe("PENDENTE");

    await registrar([candidata({ confianca: 0.95 })]);
    expect(conteudo("crc_ai_memories")[0]?.["status"]).toBe("ATIVA");
  });

  it("repetir com MENOS confiança não rebaixa uma ativa", async () => {
    await registrar([candidata({ confianca: 0.95 })]);
    await registrar([candidata({ confianca: 0.2 })]);

    const linha = conteudo("crc_ai_memories")[0];
    expect(linha?.["status"]).toBe("ATIVA");
    expect(Number(linha?.["confianca"])).toBe(0.95);
  });

  it("pacientes diferentes têm memórias independentes", async () => {
    await registrar([candidata()]);
    await registrar([candidata({ subjectId: OUTRO })]);
    expect(conteudo("crc_ai_memories")).toHaveLength(2);
  });
});

describe("o direito de correção", () => {
  it("invalidar tira do contexto mas mantém o registro", async () => {
    await registrar([candidata()]);
    const id = String(conteudo("crc_ai_memories")[0]?.["id"] ?? "");

    await invalidarMemoria(ORG, id, ATENDENTE);

    // A linha continua: quando alguém perguntar "por que o agente disse aquilo
    // em março?", a resposta precisa continuar disponível.
    expect(conteudo("crc_ai_memories")).toHaveLength(1);
    expect(conteudo("crc_ai_memories")[0]?.["status"]).toBe("INVALIDADA");
    expect(await memoriasDoContexto(ORG, PACIENTE, AGORA)).toHaveLength(0);
  });

  it("memória invalidada NÃO volta na extração seguinte", async () => {
    await registrar([candidata()]);
    const id = String(conteudo("crc_ai_memories")[0]?.["id"] ?? "");
    await invalidarMemoria(ORG, id, ATENDENTE);

    const r = await registrar([candidata()]);

    expect(r.gravadas).toBe(0);
    expect(r.renovadas).toBe(0);
    expect(r.recusadas[0]?.codigo).toBe("invalidada_por_pessoa");
    expect(conteudo("crc_ai_memories")[0]?.["status"]).toBe("INVALIDADA");
  });

  it("confirmar uma pendente a faz valer", async () => {
    await registrar([candidata({ confianca: 0.3 })]);
    const id = String(conteudo("crc_ai_memories")[0]?.["id"] ?? "");

    await confirmarMemoria(ORG, id);

    expect(await memoriasDoContexto(ORG, PACIENTE, AGORA)).toHaveLength(1);
  });

  it("confirmar NÃO ressuscita uma invalidada", async () => {
    await registrar([candidata()]);
    const id = String(conteudo("crc_ai_memories")[0]?.["id"] ?? "");
    await invalidarMemoria(ORG, id, ATENDENTE);

    await confirmarMemoria(ORG, id);

    expect(conteudo("crc_ai_memories")[0]?.["status"]).toBe("INVALIDADA");
  });
});

describe("memória de operador", () => {
  it("nasce ativa, sem prazo, e com o autor registrado", async () => {
    const r = await registrarMemoriaDeOperador({
      organizationId: ORG,
      escopo: "organizacao",
      subjectId: null,
      conteudo: "Não atendemos aos sábados em janeiro",
      userId: ATENDENTE,
      agora: AGORA,
    });

    expect(r.gravadas).toBe(1);
    const linha = conteudo("crc_ai_memories")[0];
    expect(linha?.["status"]).toBe("ATIVA");
    expect(linha?.["expira_em"]).toBeNull();
    expect(linha?.["criado_por"]).toBe(ATENDENTE);
  });

  it("operador também não escapa da recusa de rótulo", async () => {
    // A pessoa é responsável pela frase, mas "não tem dinheiro" continua sendo
    // rótulo — e o rótulo é ruim independentemente de quem digitou.
    const r = await registrarMemoriaDeOperador({
      organizationId: ORG,
      escopo: "paciente",
      subjectId: PACIENTE,
      conteudo: "Essa paciente não tem dinheiro",
      userId: ATENDENTE,
      agora: AGORA,
    });
    expect(r.gravadas).toBe(0);
    expect(r.recusadas[0]?.codigo).toBe("juizo_financeiro");
  });
});

describe("o que o agente vê", () => {
  it("junta a memória da pessoa com a da clínica", async () => {
    await registrar([candidata()]);
    await registrar([
      candidata({ escopo: "organizacao", subjectId: null, conteudo: "Fechamos ao meio-dia" }),
    ]);

    const vistas = await memoriasDoContexto(ORG, PACIENTE, AGORA);
    expect(vistas).toHaveLength(2);
  });

  it("não mostra a memória de OUTRO paciente", async () => {
    await registrar([candidata({ subjectId: OUTRO })]);
    expect(await memoriasDoContexto(ORG, PACIENTE, AGORA)).toHaveLength(0);
  });

  it("paciente não identificado vê só a memória da clínica", async () => {
    await registrar([candidata()]);
    await registrar([
      candidata({ escopo: "organizacao", subjectId: null, conteudo: "Fechamos ao meio-dia" }),
    ]);

    const vistas = await memoriasDoContexto(ORG, null, AGORA);
    expect(vistas).toHaveLength(1);
    expect(vistas[0]?.escopo).toBe("organizacao");
  });

  it("memória expirada sai do contexto sozinha", async () => {
    await registrar([candidata()]);
    const muitoDepois = new Date(AGORA.getTime() + (VALIDADE_DIAS_CONVERSA + 1) * 86_400_000);
    expect(await memoriasDoContexto(ORG, PACIENTE, muitoDepois)).toHaveLength(0);
  });

  it("pendente não vai ao modelo, mas aparece na lista de revisão", async () => {
    await registrar([candidata({ confianca: 0.3 })]);
    expect(await memoriasDoContexto(ORG, PACIENTE, AGORA)).toHaveLength(0);
    expect(await listarMemorias(ORG, { status: "PENDENTE" })).toHaveLength(1);
  });
});
