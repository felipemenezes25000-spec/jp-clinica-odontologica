/**
 * Omnichannel, com banco.
 *
 * ============================================================================
 *  DOIS TESTES CARREGAM ESTE ARQUIVO:
 *
 *  1. A NOTA INTERNA NÃO ENTRA NA LINHA DO TEMPO. Ela é conversa da equipe
 *     SOBRE o paciente — "essa aí reclama de tudo", "não atender no sábado".
 *     Misturá-la com o que o paciente disse é o caminho mais curto para alguém
 *     ler em voz alta para a pessoa errada.
 *
 *  2. O TELEFONE COMPARTILHADO MARCA OS DOIS LADOS. Marcar só a linha nova
 *     deixaria a antiga resolvendo sozinha para sempre — e a proteção contra o
 *     telefone de família valeria só para quem chegou depois.
 *
 *  INJEÇÃO DE DEFEITO:
 *    tirar `nota_interna = false` do fake      → (1) quebra;
 *    marcar só a identidade nova               → (2) quebra;
 *    fundir duplicata automaticamente          → "nunca funde" quebra.
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
  linhaDoTempo,
  painelDoAtendimento,
  podarTranscricoes,
  procurarDuplicados,
  quemE,
  registrarChamada,
  registrarContato,
  registrarIdentidade,
  RETENCAO_DA_TRANSCRICAO_DIAS,
} from "./omnichannel";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PACIENTE = "aaaa9999-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

function paciente(id: string, nome: string, extras: Record<string, unknown> = {}): void {
  semear("crc_patients", [
    {
      id,
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "dental_office",
      external_id: id,
      nome,
      telefone: null,
      email: null,
      ativo: true,
      arquivado: false,
      criado_em: "2026-01-01T10:00:00.000Z",
      atualizado_em: "2026-01-01T10:00:00.000Z",
      ...extras,
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

/* -------------------------------------------------------------------------- */

describe("a linha do tempo", () => {
  it("junta mensagem, ligação, balcão, consulta e orçamento em ordem", async () => {
    paciente(PACIENTE, "Ana Souza");

    semear("crc_conversations", [
      {
        id: "conv-1",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        canal: "whatsapp",
        contato_externo: "5511999990000",
        status: "ABERTA",
        criado_em: "2026-09-01T10:00:00.000Z",
        atualizado_em: "2026-09-01T10:00:00.000Z",
      },
    ]);
    semear("crc_messages", [
      {
        id: "msg-1",
        organization_id: ORG,
        conversation_id: "conv-1",
        patient_id: PACIENTE,
        direcao: "ENTRADA",
        remetente: "paciente",
        conteudo: "quero marcar",
        nota_interna: false,
        criado_em: "2026-09-01T10:00:00.000Z",
      },
    ]);

    await registrarChamada({
      organizationId: ORG,
      clinicId: CLINICA,
      patientId: PACIENTE,
      direcao: "ENTRADA",
      iniciadaEm: "2026-09-02T10:00:00.000Z",
      resumo: "Queria remarcar",
      chaveDedupe: "c1",
    });

    await registrarContato({
      organizationId: ORG,
      clinicId: CLINICA,
      patientId: PACIENTE,
      texto: "Conversou na recepção sobre o implante",
      ocorridoEm: "2026-09-03T10:00:00.000Z",
    });

    const linha = await linhaDoTempo(ORG, PACIENTE);

    expect(linha.map((l) => l.tipo)).toEqual(["CONTATO", "LIGACAO", "MENSAGEM"]);
    expect(linha[0]?.canal).toBe("balcao");
  });

  it("NOTA INTERNA não entra", async () => {
    /*
     * ============================================================================
     *  "Essa aí reclama de tudo" é conversa da equipe SOBRE o paciente. Se ela
     *  aparecer na mesma lista do que o paciente disse, um dia alguém lê em voz
     *  alta para a pessoa errada.
     * ============================================================================
     */
    paciente(PACIENTE, "Ana Souza");
    semear("crc_conversations", [
      {
        id: "conv-1",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        canal: "whatsapp",
        contato_externo: "5511999990000",
        status: "ABERTA",
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);
    semear("crc_messages", [
      {
        id: "publica",
        organization_id: ORG,
        conversation_id: "conv-1",
        patient_id: PACIENTE,
        direcao: "ENTRADA",
        remetente: "paciente",
        conteudo: "bom dia",
        nota_interna: false,
        criado_em: AGORA.toISOString(),
      },
      {
        id: "interna",
        organization_id: ORG,
        conversation_id: "conv-1",
        patient_id: PACIENTE,
        direcao: "SAIDA",
        remetente: "atendente",
        conteudo: "paciente difícil, não atender no sábado",
        nota_interna: true,
        criado_em: AGORA.toISOString(),
      },
    ]);

    const linha = await linhaDoTempo(ORG, PACIENTE);

    expect(linha).toHaveLength(1);
    expect(linha[0]?.referencia).toBe("publica");
  });

  it("não atravessa tenant", async () => {
    paciente(PACIENTE, "Ana Souza");
    await registrarChamada({
      organizationId: ORG_B,
      clinicId: CLINICA,
      patientId: PACIENTE,
      direcao: "ENTRADA",
      chaveDedupe: "b1",
    });

    expect(await linhaDoTempo(ORG, PACIENTE)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("as chamadas", () => {
  it("avalia e grava a oportunidade perdida", async () => {
    await registrarChamada({
      organizationId: ORG,
      clinicId: CLINICA,
      patientId: PACIENTE,
      direcao: "ENTRADA",
      intencao: "AGENDAR",
      ofereceuHorario: false,
      marcouConsulta: false,
      chaveDedupe: "c1",
    });

    const c = conteudo("crc_calls")[0];
    expect(c?.["oportunidade_perdida"]).toBe(true);
    expect(c?.["motivo_perda"]).toContain("nenhum foi oferecido");
    expect(typeof c?.["score_atendimento"]).toBe("number");
  });

  it("a transcrição nasce COM data de expiração", async () => {
    /*
     * Calcular o prazo depois, numa varredura, deixaria uma janela em que a
     * transcrição existe sem prazo — e o que não tem prazo não é podado.
     */
    await registrarChamada({
      organizationId: ORG,
      clinicId: CLINICA,
      direcao: "ENTRADA",
      transcricao: "conversa inteira aqui",
      chaveDedupe: "c1",
    });

    const c = conteudo("crc_calls")[0];
    const esperado = new Date(
      AGORA.getTime() + RETENCAO_DA_TRANSCRICAO_DIAS * 86_400_000,
    ).toISOString();

    expect(c?.["transcricao_expira_em"]).toBe(esperado);
  });

  it("chamada SEM transcrição não ganha prazo", async () => {
    await registrarChamada({
      organizationId: ORG,
      clinicId: CLINICA,
      direcao: "ENTRADA",
      chaveDedupe: "c1",
    });

    expect(conteudo("crc_calls")[0]?.["transcricao_expira_em"]).toBeNull();
  });

  it("a poda apaga o TEXTO e mantém a linha", async () => {
    /*
     * A chamada continua na linha do tempo com resumo, duração e desfecho. Some
     * só o conteúdo bruto, que era o que exigia base legal para existir.
     */
    await registrarChamada({
      organizationId: ORG,
      clinicId: CLINICA,
      patientId: PACIENTE,
      direcao: "ENTRADA",
      transcricao: "conversa inteira",
      resumo: "Queria remarcar",
      chaveDedupe: "c1",
    });

    const depois = new Date(AGORA.getTime() + (RETENCAO_DA_TRANSCRICAO_DIAS + 1) * 86_400_000);
    const podadas = await podarTranscricoes(depois);

    expect(podadas).toBe(1);

    const c = conteudo("crc_calls")[0];
    expect(c?.["transcricao"]).toBeNull();
    expect(c?.["resumo"]).toBe("Queria remarcar");
  });

  it("a poda não toca no que ainda não venceu", async () => {
    await registrarChamada({
      organizationId: ORG,
      clinicId: CLINICA,
      direcao: "ENTRADA",
      transcricao: "conversa",
      chaveDedupe: "c1",
    });

    expect(await podarTranscricoes(AGORA)).toBe(0);
    expect(conteudo("crc_calls")[0]?.["transcricao"]).toBe("conversa");
  });
});

/* -------------------------------------------------------------------------- */

describe("a identidade", () => {
  it("um telefone exclusivo resolve", async () => {
    paciente(PACIENTE, "Ana Souza");
    await registrarIdentidade(ORG, PACIENTE, "TELEFONE", "(11) 99999-0000");

    const r = await quemE(ORG, "TELEFONE", "11999990000");

    expect(r.tipo).toBe("UNICO");
    if (r.tipo !== "UNICO") return;
    expect(r.patientId).toBe(PACIENTE);
  });

  it("o telefone de família marca OS DOIS lados", async () => {
    /*
     * ============================================================================
     *  Marcar só a linha nova deixaria a antiga resolvendo sozinha para sempre.
     *  A proteção valeria apenas para quem chegou depois — e o caso real é
     *  justamente o contrário: a mãe cadastrada há anos, o filho cadastrado hoje.
     * ============================================================================
     */
    paciente("mae", "Ana Souza");
    paciente("filho", "Pedro Souza");

    await registrarIdentidade(ORG, "mae", "TELEFONE", "11999990000");
    await registrarIdentidade(ORG, "filho", "TELEFONE", "11999990000");

    const linhas = conteudo("crc_patient_identities");
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l["compartilhada"] === true)).toBe(true);

    const r = await quemE(ORG, "TELEFONE", "11999990000");
    expect(r.tipo).toBe("AMBIGUO");
  });

  it("identificador inválido é recusado antes de gravar", async () => {
    expect(await registrarIdentidade(ORG, PACIENTE, "TELEFONE", "9999")).toBe(false);
    expect(conteudo("crc_patient_identities")).toHaveLength(0);
  });

  it("valor desconhecido devolve NENHUM", async () => {
    const r = await quemE(ORG, "TELEFONE", "11988887777");
    expect(r.tipo).toBe("NENHUM");
  });

  it("não atravessa tenant", async () => {
    paciente(PACIENTE, "Ana Souza");
    await registrarIdentidade(ORG, PACIENTE, "TELEFONE", "11999990000");

    expect((await quemE(ORG_B, "TELEFONE", "11999990000")).tipo).toBe("NENHUM");
  });
});

/* -------------------------------------------------------------------------- */

describe("os duplicados", () => {
  it("NUNCA funde — só sugere", async () => {
    /*
     * O §64 pede "não merge automático de baixa confiança". A leitura correta é
     * mais dura: não há merge automático de confiança NENHUMA. Uma fusão errada
     * junta dois prontuários e não há desfazer.
     */
    paciente("a", "Ana Maria Souza", { telefone: "11999990000" });
    paciente("b", "Ana Souza", { telefone: "11999990000" });

    const r = await procurarDuplicados(ORG, null);

    expect(r.suspeitas.length).toBeGreaterThan(0);
    // E os dois cadastros continuam lá, intactos.
    expect(conteudo("crc_patients")).toHaveLength(2);
  });

  it("dois homônimos sem identificador em comum NÃO viram suspeita", async () => {
    paciente("a", "Maria Silva");
    paciente("b", "Maria Silva");

    const r = await procurarDuplicados(ORG, null);
    expect(r.suspeitas).toHaveLength(0);
  });

  it("ordena da suspeita mais forte para a mais fraca", async () => {
    paciente("a", "Ana Souza", { email: "ana@x.com", telefone: "11999990000" });
    paciente("b", "Ana Souza", { email: "ana@x.com", telefone: "11999990000" });
    paciente("c", "Joao Lima", { telefone: "11988880000" });
    paciente("d", "Pedro Lima", { telefone: "11988880000" });

    const r = await procurarDuplicados(ORG, null);

    expect(r.suspeitas.length).toBeGreaterThanOrEqual(2);
    expect(r.suspeitas[0]?.confianca).toBeGreaterThanOrEqual(
      r.suspeitas[r.suspeitas.length - 1]?.confianca ?? 0,
    );
  });
});

/* -------------------------------------------------------------------------- */

describe("o painel da recepção", () => {
  it("conta as ligações e produz observações", async () => {
    for (let i = 0; i < 5; i += 1) {
      await registrarChamada({
        organizationId: ORG,
        clinicId: CLINICA,
        direcao: "ENTRADA",
        desfecho: "NAO_ATENDIDA",
        chaveDedupe: `perdida-${String(i)}`,
      });
    }
    await registrarChamada({
      organizationId: ORG,
      clinicId: CLINICA,
      direcao: "ENTRADA",
      intencao: "AGENDAR",
      ofereceuHorario: true,
      marcouConsulta: true,
      chaveDedupe: "boa",
    });

    const p = await painelDoAtendimento(ORG, [CLINICA], "2026-01-01T00:00:00.000Z");

    expect(p.numeros.chamadas).toBe(6);
    expect(p.numeros.naoAtendidas).toBe(5);
    expect(p.observacoes.some((o) => o.chave === "nao_atendidas")).toBe(true);
  });

  it("sem clínica alcançada, devolve zero — e não tudo", async () => {
    await registrarChamada({
      organizationId: ORG,
      clinicId: CLINICA,
      direcao: "ENTRADA",
      chaveDedupe: "c1",
    });

    const p = await painelDoAtendimento(ORG, [], "2026-01-01T00:00:00.000Z");
    expect(p.numeros.chamadas).toBe(0);
  });

  it("base limpa devolve a observação de 'tudo dentro do esperado'", async () => {
    const p = await painelDoAtendimento(ORG, [CLINICA], "2026-01-01T00:00:00.000Z");

    expect(p.observacoes).toHaveLength(1);
    expect(p.observacoes[0]?.chave).toBe("ok");
  });
});
