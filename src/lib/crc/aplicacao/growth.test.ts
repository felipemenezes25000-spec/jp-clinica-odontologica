/**
 * Growth, com banco.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o do guardrail: a variante que gera
 *  saída para SOZINHA, e o experimento inteiro para junto.
 *
 *  Parar só a variante ruim parece mais fino, e é pior: o experimento passaria
 *  a rodar com uma variante só, virando um disparo normal disfarçado de teste —
 *  e o relatório depois compararia grupos de tamanhos incomparáveis.
 *
 *  INJEÇÃO DE DEFEITO:
 *    parar só a variante, não o experimento → "para os dois" quebra;
 *    perguntar de novo a cada volta         → "não repergunta" quebra;
 *    deixar `decidirAprendizado` sem userId → "aplicado tem dono" quebra.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import {
  avancarIndicacao,
  codigoDoPaciente,
  conferirExperimentos,
  decidirAprendizado,
  expirarAprendizados,
  funilDeIndicacao,
  perguntarComoFoi,
  registrarAprendizado,
  registrarIndicacao,
  registrarResposta,
  resumoDaReputacao,
} from "./growth";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PACIENTE = "aaaa9999-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

function paciente(id: string): void {
  semear("crc_patients", [
    {
      id,
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "dental_office",
      external_id: id,
      nome: "Paciente",
      ativo: true,
      arquivado: false,
      criado_em: "2026-01-01T10:00:00.000Z",
      atualizado_em: "2026-01-01T10:00:00.000Z",
    },
  ]);
}

function consultaConcluida(id: string, quando: string): void {
  semear("crc_appointments", [
    {
      id,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      external_source: "dental_office",
      external_id: id,
      inicio_em: quando,
      status: "COMPLETED",
      risco_fatores: [],
      criado_em: "2026-09-01T10:00:00.000Z",
      atualizado_em: "2026-09-01T10:00:00.000Z",
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

/* -------------------------------------------------------------------------- */

describe("a pesquisa", () => {
  it("pergunta a quem foi atendido ONTEM", async () => {
    paciente(PACIENTE);
    // Ontem às 14h: 24h atrás.
    consultaConcluida("ag-1", "2026-09-11T14:00:00.000Z");

    const r = await perguntarComoFoi(ORG, AGORA);

    expect(r.perguntas).toBe(1);
    expect(conteudo("crc_feedback")[0]?.["status"]).toBe("PERGUNTADO");
  });

  it("NÃO pergunta de novo a cada volta", async () => {
    /*
     * Nada irrita mais que a mesma pesquisa quatro vezes. A chave é a consulta.
     */
    paciente(PACIENTE);
    consultaConcluida("ag-1", "2026-09-11T14:00:00.000Z");

    await perguntarComoFoi(ORG, AGORA);
    const segunda = await perguntarComoFoi(ORG, AGORA);

    expect(segunda.perguntas).toBe(0);
    expect(conteudo("crc_feedback")).toHaveLength(1);
  });

  it("não pergunta a quem foi atendido agora", async () => {
    /*
     * Perguntar na saída pega a pessoa ainda na clínica, com a recepcionista na
     * frente — e a nota sai alta por educação.
     */
    paciente(PACIENTE);
    consultaConcluida("ag-1", "2026-09-12T13:00:00.000Z");

    expect((await perguntarComoFoi(ORG, AGORA)).perguntas).toBe(0);
  });
});

describe("a resposta", () => {
  async function umFeedback(): Promise<string> {
    paciente(PACIENTE);
    consultaConcluida("ag-1", "2026-09-11T14:00:00.000Z");
    await perguntarComoFoi(ORG, AGORA);
    return String(conteudo("crc_feedback")[0]?.["id"] ?? "");
  }

  it("nota alta vira convite para avaliar", async () => {
    const id = await umFeedback();
    const r = await registrarResposta(ORG, id, 10, null, AGORA);

    expect(r?.destino).toBe("CONVIDAR");
    expect(r?.tarefaId).toBeNull();
    expect(conteudo("crc_feedback")[0]?.["status"]).toBe("CONVIDADO_A_AVALIAR");
  });

  it("nota baixa vira TAREFA, com o comentário inteiro", async () => {
    /*
     * ============================================================================
     *  Quem vai ligar precisa das palavras da pessoa. Um resumo do tipo "paciente
     *  insatisfeito com atendimento" faz a ligação começar com "soube que você
     *  não gostou", que é a pior abertura possível.
     * ============================================================================
     */
    const id = await umFeedback();
    const texto = "esperei quarenta minutos e ninguém me avisou de nada";

    const r = await registrarResposta(ORG, id, 3, texto, AGORA);

    expect(r?.destino).toBe("RECUPERAR");
    expect(r?.tarefaId).not.toBeNull();

    const tarefa = conteudo("crc_tasks")[0];
    expect(tarefa?.["notas"]).toBe(texto);
    expect(tarefa?.["prioridade"]).toBe(90);
  });

  it("nota neutra não vira nem convite nem tarefa", async () => {
    const id = await umFeedback();
    const r = await registrarResposta(ORG, id, 8, null, AGORA);

    expect(r?.destino).toBe("AGRADECER");
    expect(conteudo("crc_tasks")).toHaveLength(0);
  });

  it("o NPS sai do conjunto de respostas", async () => {
    semear("crc_feedback", [
      {
        id: "f1",
        organization_id: ORG,
        clinic_id: CLINICA,
        nota: 10,
        status: "RESPONDEU",
        respondido_em: AGORA.toISOString(),
        perguntado_em: AGORA.toISOString(),
        chave_dedupe: "a",
      },
      {
        id: "f2",
        organization_id: ORG,
        clinic_id: CLINICA,
        nota: 9,
        status: "RESPONDEU",
        respondido_em: AGORA.toISOString(),
        perguntado_em: AGORA.toISOString(),
        chave_dedupe: "b",
      },
      {
        id: "f3",
        organization_id: ORG,
        clinic_id: CLINICA,
        nota: 8,
        status: "RESPONDEU",
        respondido_em: AGORA.toISOString(),
        perguntado_em: AGORA.toISOString(),
        chave_dedupe: "c",
      },
      {
        id: "f4",
        organization_id: ORG,
        clinic_id: CLINICA,
        nota: 2,
        status: "RECUPERACAO",
        respondido_em: AGORA.toISOString(),
        perguntado_em: AGORA.toISOString(),
        chave_dedupe: "d",
      },
    ]);

    const r = await resumoDaReputacao(ORG, [CLINICA], "2026-01-01T00:00:00.000Z");

    expect(r.respostas).toBe(4);
    expect(r.nps).toBe(25);
    expect(r.emRecuperacao).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("a indicação", () => {
  it("o código é criado uma vez e reaproveitado", async () => {
    paciente(PACIENTE);

    const a = await codigoDoPaciente(ORG, PACIENTE);
    const b = await codigoDoPaciente(ORG, PACIENTE);

    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it("a cadeia avança e NÃO volta", async () => {
    paciente(PACIENTE);
    const id = await registrarIndicacao({
      organizationId: ORG,
      clinicId: CLINICA,
      indicadorId: PACIENTE,
      indicadoNome: "Amiga da Ana",
      chaveDedupe: "i1",
    });

    expect(await avancarIndicacao(ORG, id ?? "", "AGENDOU")).toBe(true);
    // Para trás é recusado: a sincronização reprocessa, e um evento antigo
    // rebaixaria uma indicação que já andou.
    expect(await avancarIndicacao(ORG, id ?? "", "VIROU_LEAD")).toBe(false);
  });

  it("o valor só entra ao CONVERTER", async () => {
    paciente(PACIENTE);
    const id = await registrarIndicacao({
      organizationId: ORG,
      clinicId: CLINICA,
      indicadorId: PACIENTE,
      chaveDedupe: "i1",
    });

    await avancarIndicacao(ORG, id ?? "", "AGENDOU", 5000);
    expect(conteudo("crc_referrals")[0]?.["valor_gerado"]).toBeUndefined();

    await avancarIndicacao(ORG, id ?? "", "CONVERTEU", 5000);
    expect(conteudo("crc_referrals")[0]?.["valor_gerado"]).toBe(5000);
  });

  it("o funil conta quem mais indicou", async () => {
    paciente(PACIENTE);
    paciente("outro");

    for (let i = 0; i < 3; i += 1) {
      await registrarIndicacao({
        organizationId: ORG,
        clinicId: CLINICA,
        indicadorId: PACIENTE,
        chaveDedupe: `a${String(i)}`,
      });
    }
    await registrarIndicacao({
      organizationId: ORG,
      clinicId: CLINICA,
      indicadorId: "outro",
      chaveDedupe: "b1",
    });

    const f = await funilDeIndicacao(ORG, [CLINICA]);

    expect(f.registradas).toBe(4);
    expect(f.topIndicadores[0]?.patientId).toBe(PACIENTE);
    expect(f.topIndicadores[0]?.quantas).toBe(3);
  });
});

/* -------------------------------------------------------------------------- */

describe("o guardrail do experimento", () => {
  function experimento(): void {
    semear("crc_experiments", [
      {
        id: "exp-1",
        organization_id: ORG,
        nome: "Copy do recall",
        dimensao: "COPY",
        status: "RODANDO",
        opt_out_max_pct: 2,
        amostra_minima: 50,
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);
    semear("crc_experiment_variants", [
      {
        id: "v-a",
        organization_id: ORG,
        experiment_id: "exp-1",
        nome: "A",
        controle: true,
        enviados: 100,
        responderam: 30,
        converteram: 10,
        opt_outs: 1,
        status: "ATIVA",
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
      {
        id: "v-b",
        organization_id: ORG,
        experiment_id: "exp-1",
        nome: "B",
        controle: false,
        enviados: 100,
        responderam: 20,
        converteram: 5,
        opt_outs: 8,
        status: "ATIVA",
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);
  }

  it("para a variante E o experimento inteiro", async () => {
    /*
     * ============================================================================
     *  Parar só a variante ruim parece mais fino, e é pior: o experimento
     *  passaria a rodar com uma variante só, virando um disparo normal
     *  disfarçado de teste — e o relatório depois compararia grupos de tamanhos
     *  incomparáveis.
     * ============================================================================
     */
    experimento();

    const r = await conferirExperimentos(ORG, AGORA);

    expect(r.parados).toBe(1);
    expect(conteudo("crc_experiments")[0]?.["status"]).toBe("PARADO_POR_GUARDRAIL");
    expect(conteudo("crc_experiments")[0]?.["parado_motivo"]).toContain("8.0%");

    const b = conteudo("crc_experiment_variants").find((v) => v["nome"] === "B");
    expect(b?.["status"]).toBe("PARADA");
  });

  it("dentro do limite não para nada", async () => {
    semear("crc_experiments", [
      {
        id: "exp-1",
        organization_id: ORG,
        nome: "Ok",
        dimensao: "COPY",
        status: "RODANDO",
        opt_out_max_pct: 2,
        amostra_minima: 50,
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);
    semear("crc_experiment_variants", [
      {
        id: "v-a",
        organization_id: ORG,
        experiment_id: "exp-1",
        nome: "A",
        controle: true,
        enviados: 100,
        responderam: 30,
        converteram: 10,
        opt_outs: 1,
        status: "ATIVA",
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);

    const r = await conferirExperimentos(ORG, AGORA);
    expect(r.parados).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("o aprendizado", () => {
  it("nasce candidato ou validado — nunca aplicado", async () => {
    const id = await registrarAprendizado({
      organizationId: ORG,
      afirmacao: "Recall entre 17h e 19h converte 18% mais.",
      amostra: 400,
      efeitoPct: 18,
      periodoDias: 60,
      chaveDedupe: "l1",
    });

    expect(id).not.toBeNull();
    expect(conteudo("crc_learnings")[0]?.["status"]).toBe("VALIDADO");
  });

  it("APLICADO tem dono e fica auditado", async () => {
    /*
     * O §37: "não alterar política crítica silenciosamente". `APLICADO` só se
     * alcança com `userId`, e o nome fica registrado.
     */
    await registrarAprendizado({
      organizationId: ORG,
      afirmacao: "x",
      amostra: 400,
      efeitoPct: 18,
      periodoDias: 60,
      chaveDedupe: "l1",
    });
    const id = String(conteudo("crc_learnings")[0]?.["id"] ?? "");

    await decidirAprendizado(ORG, id, "APLICADO", "faz sentido", "user-1");

    const l = conteudo("crc_learnings")[0];
    expect(l?.["status"]).toBe("APLICADO");
    expect(l?.["decidido_por"]).toBe("user-1");
  });

  it("aprendizado aplicado VELHO expira", async () => {
    semear("crc_learnings", [
      {
        id: "l-velho",
        organization_id: ORG,
        afirmacao: "coisa antiga",
        dimensao: "HORARIO",
        status: "APLICADO",
        amostra: 400,
        confianca: 0.8,
        decidido_em: "2026-01-01T00:00:00.000Z",
        criado_em: "2026-01-01T00:00:00.000Z",
        atualizado_em: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(await expirarAprendizados(ORG, AGORA)).toBe(1);
    expect(conteudo("crc_learnings")[0]?.["status"]).toBe("EXPIRADO");
  });

  it("efeito pequeno nasce REJEITADO", async () => {
    await registrarAprendizado({
      organizationId: ORG,
      afirmacao: "diferença de 2 pontos",
      amostra: 5000,
      efeitoPct: 2,
      periodoDias: 200,
      chaveDedupe: "l1",
    });

    expect(conteudo("crc_learnings")[0]?.["status"]).toBe("REJEITADO");
  });
});
