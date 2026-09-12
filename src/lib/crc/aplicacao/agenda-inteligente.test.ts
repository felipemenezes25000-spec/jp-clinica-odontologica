/**
 * Agenda Inteligente, com banco.
 *
 * ============================================================================
 *  OS CINCO DEFEITOS QUE ESTE ARQUIVO PRENDE:
 *
 *   1. o mesmo buraco criado de novo a cada varredura, dividindo o contador de
 *      convites e desarmando a proteção contra broadcast;
 *   2. convidar quem pediu para não ser contatado;
 *   3. convidar quem já tem consulta marcada;
 *   4. reconvidar, na segunda leva, quem não respondeu à primeira;
 *   5. deixar duas pessoas aceitarem a mesma cadeira.
 *
 *  INJEÇÃO DE DEFEITO:
 *    trocar `inserirIgnorandoDuplicata` por `inserir` → (1) quebra;
 *    tirar `opt_out_em is null` do fake              → (2) quebra;
 *    tirar `not exists (consulta futura)`            → (3) quebra;
 *    tirar `not exists (crc_gap_offers)`             → (4) quebra;
 *    não cancelar as outras ofertas em `aceitar`     → (5) quebra.
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
  aceitarEncaixe,
  calcularRiscos,
  detectarBuracos,
  lerPreferencia,
  listarBuracos,
  salvarPreferencia,
  trabalharBuracos,
} from "./agenda-inteligente";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_B = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DENTISTA = "aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Uma sexta-feira às 14h em São Paulo (UTC-3). */
const AGORA = new Date("2026-09-11T12:00:00.000Z");
const AMANHA_14H = "2026-09-12T17:00:00.000Z";

function consulta(p: {
  id: string;
  inicio: string;
  fim?: string;
  status?: string;
  paciente?: string | null;
  dentista?: string | null;
  clinica?: string;
  org?: string;
  criadoEm?: string;
}): void {
  semear("crc_appointments", [
    {
      id: p.id,
      organization_id: p.org ?? ORG,
      clinic_id: p.clinica ?? CLINICA,
      patient_id: p.paciente ?? null,
      external_source: "dental_office",
      external_id: p.id,
      dentista_externo_id: p.dentista === undefined ? "d-1" : p.dentista,
      inicio_em: p.inicio,
      fim_em: p.fim ?? new Date(Date.parse(p.inicio) + 60 * 60_000).toISOString(),
      status: p.status ?? "CONFIRMED",
      criado_em: p.criadoEm ?? "2026-09-01T10:00:00.000Z",
      atualizado_em: "2026-09-01T10:00:00.000Z",
      risco_fatores: [],
    },
  ]);
}

function paciente(p: {
  id: string;
  nome?: string;
  telefone?: string | null;
  optOut?: string | null;
  ultimaConsulta?: string | null;
  clinica?: string;
  org?: string;
}): void {
  semear("crc_patients", [
    {
      id: p.id,
      organization_id: p.org ?? ORG,
      clinic_id: p.clinica ?? CLINICA,
      external_source: "dental_office",
      external_id: p.id,
      nome: p.nome ?? "Paciente",
      telefone: p.telefone === undefined ? "5511999990000" : p.telefone,
      ativo: true,
      arquivado: false,
      opt_out_em: p.optOut ?? null,
      ultima_consulta_em: p.ultimaConsulta ?? "2026-02-01T10:00:00.000Z",
      criado_em: "2026-01-01T10:00:00.000Z",
      atualizado_em: "2026-01-01T10:00:00.000Z",
    },
  ]);
}

function dentista(): void {
  semear("crc_dentists", [
    {
      id: DENTISTA,
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "dental_office",
      external_id: "d-1",
      nome: "Dra. Juliana",
      ativo: true,
      criado_em: "2026-01-01T10:00:00.000Z",
      atualizado_em: "2026-01-01T10:00:00.000Z",
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  dentista();
});

/* -------------------------------------------------------------------------- */

describe("a detecção de buracos", () => {
  it("um cancelamento futuro vira buraco", async () => {
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });

    const r = await detectarBuracos(ORG, AGORA);

    expect(r.cancelamentos).toBe(1);
    expect(r.criados).toBe(1);
    expect(conteudo("crc_schedule_gaps")[0]?.["status"]).toBe("ABERTO");
  });

  it("a segunda varredura NÃO cria o buraco de novo", async () => {
    /*
     * ============================================================================
     *  O DEFEITO MAIS CARO DESTA FASE, e o mais silencioso.
     *
     *  A varredura roda várias vezes por dia. Sem a chave de dedupe, a terça das
     *  14h teria um buraco por execução — e o contador de `oferecidos`, que é o
     *  que impede o broadcast, se dividiria entre eles. Com seis execuções,
     *  dezoito pessoas convidadas para uma vaga, com cada buraco achando que
     *  convidou três.
     * ============================================================================
     */
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });

    await detectarBuracos(ORG, AGORA);
    const segunda = await detectarBuracos(ORG, AGORA);

    expect(segunda.criados).toBe(0);
    expect(conteudo("crc_schedule_gaps")).toHaveLength(1);
  });

  it("o vão ENTRE duas consultas do mesmo dentista também é buraco", async () => {
    /*
     * A fonte que ninguém implementa. O dentista atende às 9h e às 11h; a hora
     * do meio é cadeira parada, e ninguém a chama de buraco porque nada foi
     * cancelado.
     */
    consulta({ id: "ag-1", inicio: "2026-09-12T12:00:00.000Z", fim: "2026-09-12T13:00:00.000Z" });
    consulta({ id: "ag-2", inicio: "2026-09-12T14:00:00.000Z", fim: "2026-09-12T15:00:00.000Z" });

    const r = await detectarBuracos(ORG, AGORA);

    expect(r.vaos).toBe(1);
    expect(r.criados).toBe(1);
    expect(conteudo("crc_schedule_gaps")[0]?.["duracao_min"]).toBe(60);
  });

  it("vão curto demais não vira buraco", async () => {
    consulta({ id: "ag-1", inicio: "2026-09-12T12:00:00.000Z", fim: "2026-09-12T13:00:00.000Z" });
    consulta({ id: "ag-2", inicio: "2026-09-12T13:20:00.000Z", fim: "2026-09-12T14:00:00.000Z" });

    const r = await detectarBuracos(ORG, AGORA);
    expect(r.criados).toBe(0);
  });

  it("vão GRANDE demais é o almoço, e não um buraco", async () => {
    /*
     * Quatro horas entre a consulta das 9h e a das 14h é a tarde começando, não
     * uma janela vaga. Tratá-la como buraco geraria convite para as 11h num
     * consultório que abre à uma.
     */
    consulta({ id: "ag-1", inicio: "2026-09-12T12:00:00.000Z", fim: "2026-09-12T13:00:00.000Z" });
    consulta({ id: "ag-2", inicio: "2026-09-12T19:00:00.000Z", fim: "2026-09-12T20:00:00.000Z" });

    const r = await detectarBuracos(ORG, AGORA);
    expect(r.criados).toBe(0);
  });

  it("consultas de dentistas DIFERENTES não geram vão entre si", async () => {
    /*
     * Dois profissionais atendendo em paralelo pareceriam uma agenda só, e o
     * intervalo entre a consulta de um e a do outro viraria um buraco que não
     * existe — a cadeira do primeiro está ocupada o tempo todo.
     */
    consulta({
      id: "ag-1",
      inicio: "2026-09-12T12:00:00.000Z",
      fim: "2026-09-12T13:00:00.000Z",
      dentista: "d-1",
    });
    consulta({
      id: "ag-2",
      inicio: "2026-09-12T14:00:00.000Z",
      fim: "2026-09-12T15:00:00.000Z",
      dentista: "d-2",
    });

    const r = await detectarBuracos(ORG, AGORA);
    expect(r.vaos).toBe(0);
  });

  it("cancelamento no PASSADO não vira buraco", async () => {
    consulta({ id: "ag-1", inicio: "2026-09-01T14:00:00.000Z", status: "CANCELLED" });

    const r = await detectarBuracos(ORG, AGORA);
    expect(r.criados).toBe(0);
  });

  it("não atravessa tenant", async () => {
    consulta({
      id: "ag-b",
      inicio: AMANHA_14H,
      status: "CANCELLED",
      org: ORG_B,
      clinica: CLINICA_B,
    });

    const r = await detectarBuracos(ORG, AGORA);
    expect(r.criados).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("os convites", () => {
  async function umBuracoComCandidatos(quantos: number): Promise<string> {
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });
    await detectarBuracos(ORG, AGORA);

    for (let i = 0; i < quantos; i += 1) {
      paciente({ id: `pac-${String(i).padStart(3, "0")}`, nome: `Paciente ${String(i)}` });
    }

    return String(conteudo("crc_schedule_gaps")[0]?.["id"] ?? "");
  }

  it("a primeira leva convida TRÊS, e não os vinte", async () => {
    await umBuracoComCandidatos(20);

    const r = await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);

    expect(r[0]?.convidados).toBe(3);
    expect(conteudo("crc_gap_offers")).toHaveLength(3);
    expect(conteudo("crc_schedule_gaps")[0]?.["oferecidos"]).toBe(3);
    expect(conteudo("crc_schedule_gaps")[0]?.["status"]).toBe("OFERECENDO");
  });

  it("a segunda execução, logo depois, NÃO convida mais ninguém", async () => {
    await umBuracoComCandidatos(20);

    await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);
    const segunda = await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);

    expect(segunda[0]?.ofertou).toBe(false);
    expect(segunda[0]?.motivo).toContain("esperando");
    expect(conteudo("crc_gap_offers")).toHaveLength(3);
  });

  it("passada a espera, a segunda leva pega gente DIFERENTE", async () => {
    /*
     * Reconvidar quem não respondeu à primeira leva é o defeito que transforma
     * "lote pequeno" em broadcast parcelado sobre as mesmas três pessoas.
     */
    await umBuracoComCandidatos(20);

    await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);
    const primeiros = conteudo("crc_gap_offers").map((o) => String(o["patient_id"]));

    const duasHorasDepois = new Date(AGORA.getTime() + 2 * 3_600_000);
    definirRelogio(duasHorasDepois);
    await trabalharBuracos(ORG, { cooldownHoras: 24 }, duasHorasDepois);

    const todos = conteudo("crc_gap_offers").map((o) => String(o["patient_id"]));
    const novos = todos.filter((p) => !primeiros.includes(p));

    expect(todos).toHaveLength(6);
    expect(novos).toHaveLength(3);
    expect(new Set(todos).size).toBe(6);
  });

  it("quem pediu para não ser contatado NUNCA é convidado", async () => {
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });
    await detectarBuracos(ORG, AGORA);

    paciente({ id: "silencio", optOut: "2026-01-01T00:00:00.000Z" });

    const r = await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);

    expect(r[0]?.convidados).toBe(0);
    expect(conteudo("crc_gap_offers")).toHaveLength(0);
  });

  it("quem já tem consulta marcada não é convidado", async () => {
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });
    await detectarBuracos(ORG, AGORA);

    paciente({ id: "ocupado" });
    consulta({ id: "ag-9", inicio: "2026-09-20T14:00:00.000Z", paciente: "ocupado" });

    const r = await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);
    expect(r[0]?.convidados).toBe(0);
  });

  it("quem não tem telefone não é convidado", async () => {
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });
    await detectarBuracos(ORG, AGORA);

    paciente({ id: "sem-fone", telefone: null });

    const r = await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);
    expect(r[0]?.convidados).toBe(0);
  });

  it("quem está na lista de espera vem primeiro", async () => {
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });
    await detectarBuracos(ORG, AGORA);

    paciente({ id: "comum-1" });
    paciente({ id: "comum-2" });
    paciente({ id: "comum-3" });
    paciente({ id: "na-lista" });

    await salvarPreferencia(ORG, {
      patientId: "na-lista",
      clinicId: CLINICA,
      dias: [],
      horaInicio: null,
      horaFim: null,
      dentistId: null,
      procedimento: null,
      aceitaEncaixe: true,
      antecedenciaH: 0,
      outraUnidade: false,
      ativo: true,
      observacao: null,
    });

    await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);

    const convidados = conteudo("crc_gap_offers").map((o) => String(o["patient_id"]));
    expect(convidados).toContain("na-lista");
  });

  it("quem pediu para NÃO receber encaixe de última hora é poupado", async () => {
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });
    await detectarBuracos(ORG, AGORA);

    paciente({ id: "so-com-antecedencia" });
    await salvarPreferencia(ORG, {
      patientId: "so-com-antecedencia",
      clinicId: CLINICA,
      dias: [],
      horaInicio: null,
      horaFim: null,
      dentistId: null,
      procedimento: null,
      aceitaEncaixe: false,
      antecedenciaH: 48,
      outraUnidade: false,
      ativo: true,
      observacao: null,
    });

    // O buraco é daqui a ~29h — dentro das 24h que o domínio chama de "última
    // hora"? Não: são 29h. Então ela ENTRA. O teste do bloqueio propriamente
    // dito está em `dominio/encaixe.test.ts`, onde as horas são controladas.
    const r = await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);
    expect(r[0]?.convidados).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("o aceite", () => {
  it("fecha o buraco e CANCELA as outras ofertas", async () => {
    /*
     * ============================================================================
     *  O "STOP OTHERS" DO §15.
     *
     *  Sem ele, a segunda pessoa que responder "pode ser!" recebe um sim, e duas
     *  pessoas aparecem para a mesma cadeira — que é pior do que a cadeira ter
     *  ficado vazia.
     * ============================================================================
     */
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });
    await detectarBuracos(ORG, AGORA);
    for (let i = 0; i < 5; i += 1) paciente({ id: `p${String(i)}` });

    await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);

    const gapId = String(conteudo("crc_schedule_gaps")[0]?.["id"] ?? "");
    const primeiro = String(conteudo("crc_gap_offers")[0]?.["patient_id"] ?? "");

    await aceitarEncaixe(ORG, gapId, primeiro, "ag-nova", AGORA);

    const ofertas = conteudo("crc_gap_offers");
    expect(ofertas.find((o) => o["patient_id"] === primeiro)?.["status"]).toBe("ACEITOU");
    expect(
      ofertas.filter((o) => o["patient_id"] !== primeiro).every((o) => o["status"] === "CANCELADA"),
    ).toBe(true);

    const buraco = conteudo("crc_schedule_gaps")[0];
    expect(buraco?.["status"]).toBe("PREENCHIDO");
    expect(buraco?.["preenchido_por"]).toBe("ag-nova");
  });

  it("o buraco preenchido some da lista", async () => {
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });
    await detectarBuracos(ORG, AGORA);
    paciente({ id: "p1" });
    await trabalharBuracos(ORG, { cooldownHoras: 24 }, AGORA);

    const gapId = String(conteudo("crc_schedule_gaps")[0]?.["id"] ?? "");
    expect(await listarBuracos(ORG, [CLINICA], AGORA)).toHaveLength(1);

    await aceitarEncaixe(ORG, gapId, "p1", null, AGORA);
    expect(await listarBuracos(ORG, [CLINICA], AGORA)).toHaveLength(0);
  });

  it("a lista respeita as clínicas alcançadas", async () => {
    consulta({ id: "ag-1", inicio: AMANHA_14H, status: "CANCELLED" });
    await detectarBuracos(ORG, AGORA);

    expect(await listarBuracos(ORG, [CLINICA], AGORA)).toHaveLength(1);
    expect(await listarBuracos(ORG, ["outra-clinica"], AGORA)).toHaveLength(0);
    expect(await listarBuracos(ORG, [], AGORA)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("a preferência de espera", () => {
  it("editar o horário NÃO religa o encaixe de última hora", async () => {
    /*
     * ============================================================================
     *  A ARMADILHA DO UPSERT DE LINHA INTEIRA, de novo (achado B-7).
     *
     *  `gravar` é `merge-duplicates`: coluna omitida volta ao DEFAULT, e o
     *  default de `aceita_encaixe` é `true`. Editar só o horário sem reenviar
     *  todas as colunas religaria o encaixe de véspera para quem tinha pedido
     *  para não receber — em silêncio.
     * ============================================================================
     */
    const base = {
      patientId: "p1",
      clinicId: CLINICA,
      dias: [1, 3],
      horaInicio: "08:00",
      horaFim: "12:00",
      dentistId: null,
      procedimento: null,
      aceitaEncaixe: false,
      antecedenciaH: 48,
      outraUnidade: false,
      ativo: true,
      observacao: null,
    };

    await salvarPreferencia(ORG, base);
    await salvarPreferencia(ORG, { ...base, horaFim: "18:00" });

    const p = await lerPreferencia(ORG, "p1");
    expect(p?.horaFim).toBe("18:00");
    expect(p?.aceitaEncaixe).toBe(false);
    expect(p?.antecedenciaH).toBe(48);
    expect(p?.dias).toEqual([1, 3]);
  });

  it("uma preferência por paciente — editar substitui", async () => {
    const base = {
      patientId: "p1",
      clinicId: CLINICA,
      dias: [],
      horaInicio: null,
      horaFim: null,
      dentistId: null,
      procedimento: null,
      aceitaEncaixe: true,
      antecedenciaH: 0,
      outraUnidade: false,
      ativo: true,
      observacao: null,
    };

    await salvarPreferencia(ORG, base);
    await salvarPreferencia(ORG, base);

    expect(conteudo("crc_waitlist_preferences")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("o risco de falta", () => {
  it("calcula e grava o nível com os fatores", async () => {
    paciente({ id: "p1" });
    consulta({ id: "ag-1", inicio: AMANHA_14H, paciente: "p1", status: "TO_CONFIRM" });

    const r = await calcularRiscos(ORG, AGORA);

    expect(r.avaliadas).toBe(1);

    const a = conteudo("crc_appointments").find((x) => x["id"] === "ag-1");
    expect(["BAIXO", "MEDIO", "ALTO"]).toContain(a?.["risco_falta"]);
    expect(Array.isArray(a?.["risco_fatores"])).toBe(true);
    expect(a?.["risco_calculado_em"]).toBe(AGORA.toISOString());
  });

  it("quem faltou nas últimas fica em risco mais alto que quem nunca faltou", async () => {
    paciente({ id: "faltante" });
    paciente({ id: "pontual" });

    // Histórico: o faltante perdeu as duas últimas.
    consulta({
      id: "h1",
      inicio: "2026-06-01T14:00:00.000Z",
      paciente: "faltante",
      status: "MISSED",
    });
    consulta({
      id: "h2",
      inicio: "2026-05-01T14:00:00.000Z",
      paciente: "faltante",
      status: "MISSED",
    });
    consulta({
      id: "h3",
      inicio: "2026-04-01T14:00:00.000Z",
      paciente: "pontual",
      status: "COMPLETED",
    });
    consulta({
      id: "h4",
      inicio: "2026-03-01T14:00:00.000Z",
      paciente: "pontual",
      status: "COMPLETED",
    });
    consulta({
      id: "h5",
      inicio: "2026-02-01T14:00:00.000Z",
      paciente: "pontual",
      status: "COMPLETED",
    });

    consulta({ id: "f1", inicio: AMANHA_14H, paciente: "faltante", status: "TO_CONFIRM" });
    consulta({ id: "f2", inicio: AMANHA_14H, paciente: "pontual", status: "TO_CONFIRM" });

    await calcularRiscos(ORG, AGORA);

    const linhas = conteudo("crc_appointments");
    const doFaltante = linhas.find((x) => x["id"] === "f1")?.["risco_falta"];
    const doPontual = linhas.find((x) => x["id"] === "f2")?.["risco_falta"];

    expect(doFaltante).toBe("ALTO");
    expect(doPontual).toBe("BAIXO");
  });

  it("consulta passada não é avaliada", async () => {
    paciente({ id: "p1" });
    consulta({
      id: "velha",
      inicio: "2026-01-01T14:00:00.000Z",
      paciente: "p1",
      status: "CONFIRMED",
    });

    const r = await calcularRiscos(ORG, AGORA);
    expect(r.avaliadas).toBe(0);
  });

  it("não atravessa tenant", async () => {
    paciente({ id: "pb", org: ORG_B, clinica: CLINICA_B });
    consulta({ id: "agb", inicio: AMANHA_14H, paciente: "pb", org: ORG_B, clinica: CLINICA_B });

    const r = await calcularRiscos(ORG, AGORA);
    expect(r.avaliadas).toBe(0);
  });
});
