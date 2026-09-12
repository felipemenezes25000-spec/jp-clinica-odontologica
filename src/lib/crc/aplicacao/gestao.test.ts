/**
 * Gestão, com banco.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o das JANELAS: recente e base não podem
 *  se sobrepor, e a base tem que ser quatro vezes maior.
 *
 *  Se elas se sobrepusessem, cada evento contaria nos dois lados e a variação
 *  seria sempre menor que a real. Se a base fosse de uma semana, um feriado na
 *  semana passada viraria "as faltas dobraram" nesta.
 *
 *  INJEÇÃO DE DEFEITO:
 *    sobrepor as janelas            → "sem sobreposição" quebra;
 *    somar a janela do PERÍODO      → "capacidade por dia" quebra;
 *    contar pendência de automação  → "só o que é seu" quebra.
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

import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { briefingDoDia, detectarAnomalias, lerCapacidades, medirCenario } from "./gestao";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

let seq = 0;

function consulta(p: {
  quando: string;
  status?: string;
  dentista?: string;
  nome?: string;
  fim?: string;
}): void {
  seq += 1;
  semear("crc_appointments", [
    {
      id: `ag-${String(seq)}`,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: null,
      external_source: "dental_office",
      external_id: `ag-${String(seq)}`,
      dentista_externo_id: p.dentista ?? "d-1",
      dentista_nome: p.nome ?? "Dra. Juliana",
      inicio_em: p.quando,
      fim_em: p.fim ?? new Date(Date.parse(p.quando) + 60 * 60_000).toISOString(),
      status: p.status ?? "COMPLETED",
      risco_fatores: [],
      criado_em: "2026-01-01T10:00:00.000Z",
      atualizado_em: "2026-01-01T10:00:00.000Z",
    },
  ]);
}

/** Um instante N dias atrás. */
function diasAtras(n: number): string {
  return new Date(AGORA.getTime() - n * 86_400_000).toISOString();
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  seq = 0;
});

/* -------------------------------------------------------------------------- */

describe("as janelas da anomalia", () => {
  it("não se sobrepõem: um evento conta de UM lado só", async () => {
    /*
     * ============================================================================
     *  Se as janelas se sobrepusessem, cada evento contaria nos dois lados e a
     *  variação seria sempre menor que a real — o detector ficaria surdo na
     *  exata proporção da sobreposição.
     *
     *  Aqui: 14 faltas nos últimos 7 dias (2/dia) e NENHUMA antes. Se a base
     *  incluísse os 7 dias recentes, ela contaria 14 e a variação sumiria.
     * ============================================================================
     */
    for (let i = 0; i < 14; i += 1) {
      consulta({ quando: diasAtras(1), status: "MISSED" });
    }
    // E volume na base, para o piso de volume não barrar.
    for (let i = 0; i < 20; i += 1) {
      consulta({ quando: diasAtras(20), status: "MISSED" });
    }

    const lista = await detectarAnomalias(ORG, [CLINICA], AGORA);
    const faltas = lista.find((x) => x.chave === "faltas");

    // 14/7 = 2/dia contra 20/28 = 0,71/dia → +180%.
    expect(faltas).toBeDefined();
    expect(faltas?.direcao).toBe("SUBIU");
    expect(faltas?.variacaoPct).toBeGreaterThan(100);
  });

  it("estabilidade não vira alerta", async () => {
    // 7 nos últimos 7 dias e 28 nos 28 anteriores: 1/dia dos dois lados.
    for (let i = 0; i < 7; i += 1) consulta({ quando: diasAtras(3), status: "MISSED" });
    for (let i = 0; i < 28; i += 1) consulta({ quando: diasAtras(20), status: "MISSED" });

    const a = await detectarAnomalias(ORG, [CLINICA], AGORA);
    expect(a.find((x) => x.chave === "faltas")).toBeUndefined();
  });

  it("sem clínica alcançada, não olha nada", async () => {
    for (let i = 0; i < 30; i += 1) consulta({ quando: diasAtras(1), status: "MISSED" });

    expect(await detectarAnomalias(ORG, [], AGORA)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("a capacidade", () => {
  it("a janela é POR DIA, e não do período inteiro", async () => {
    /*
     * ============================================================================
     *  Somar "da primeira à última consulta do PERÍODO" daria a distância entre
     *  segunda de manhã e sexta à noite — incluindo as noites e o fim de semana.
     *
     *  Aqui: duas consultas de 1h, em dois dias diferentes, cada uma isolada.
     *  Por dia, a janela é 1h em cada → 2h de janela, 2h ocupadas, 100%.
     *  Pelo período, seriam ~24h de janela e 8% de ocupação.
     * ============================================================================
     */
    consulta({ quando: diasAtras(3) });
    consulta({ quando: diasAtras(2) });

    const c = await lerCapacidades(ORG, [CLINICA], AGORA);

    expect(c).toHaveLength(1);
    expect(c[0]?.ocupacao).toBe(1);
  });

  it("vão no meio do dia aparece como ociosidade", async () => {
    const dia = "2026-09-10";
    consulta({ quando: `${dia}T12:00:00.000Z`, fim: `${dia}T13:00:00.000Z` });
    consulta({ quando: `${dia}T17:00:00.000Z`, fim: `${dia}T18:00:00.000Z` });

    const c = await lerCapacidades(ORG, [CLINICA], AGORA);

    // Janela de 6h, 2h ocupadas → 33%.
    expect(c[0]?.ocupacao).toBeCloseTo(0.333, 2);
    expect(c[0]?.horasOciosas).toBeCloseTo(4, 1);
    expect(c[0]?.situacao).toBe("OCIOSO");
  });

  it("separa por dentista", async () => {
    consulta({ quando: diasAtras(2), dentista: "d-1", nome: "Dra. A" });
    consulta({ quando: diasAtras(2), dentista: "d-2", nome: "Dr. B" });

    const c = await lerCapacidades(ORG, [CLINICA], AGORA);
    expect(c).toHaveLength(2);
  });

  it("o mais ocioso vem primeiro — é onde há o que fazer", async () => {
    const dia = "2026-09-10";
    // d-1: cheio.
    consulta({ quando: `${dia}T12:00:00.000Z`, fim: `${dia}T13:00:00.000Z`, dentista: "d-1" });
    // d-2: vão grande.
    consulta({ quando: `${dia}T12:00:00.000Z`, fim: `${dia}T13:00:00.000Z`, dentista: "d-2" });
    consulta({ quando: `${dia}T19:00:00.000Z`, fim: `${dia}T20:00:00.000Z`, dentista: "d-2" });

    const c = await lerCapacidades(ORG, [CLINICA], AGORA);
    expect(c[0]?.dentistId).toBe("d-2");
  });
});

/* -------------------------------------------------------------------------- */

describe("o cenário do simulador", () => {
  it("o cancelamento fica FORA dos dois lados da taxa de falta", async () => {
    /*
     * ============================================================================
     *  Cancelamento com aviso não é falta: a cadeira dá tempo de ser reocupada.
     *
     *  Se ele entrasse no numerador, a taxa inflaria; se entrasse só no
     *  denominador, ela afundaria. Aqui: 2 faltas, 8 comparecimentos e 90
     *  cancelamentos. A taxa é 2/10 = 20% — e não 2/100 = 2%.
     * ============================================================================
     */
    for (let i = 0; i < 2; i += 1) consulta({ quando: diasAtras(10), status: "MISSED" });
    for (let i = 0; i < 8; i += 1) consulta({ quando: diasAtras(10), status: "COMPLETED" });
    for (let i = 0; i < 90; i += 1) consulta({ quando: diasAtras(10), status: "CANCELLED" });

    const c = await medirCenario(ORG, [CLINICA], 300, AGORA);
    expect(c.taxaDeFalta).toBeCloseTo(0.2, 3);
  });

  it("sem histórico, não inventa falta", async () => {
    const c = await medirCenario(ORG, [CLINICA], 300, AGORA);

    expect(c.taxaDeFalta).toBe(0);
    expect(c.ocupacaoAtual).toBe(0);
    expect(c.valorPorHora).toBe(300);
  });

  it("a ocupação é média simples entre dentistas — o vazio não some", async () => {
    /*
     * O dentista cheio não pode abafar o vazio na média: é justamente a agenda
     * vazia que a simulação quer olhar.
     *
     * d-1 atende o dia inteiro em 1 consulta → janela = ocupação = 100%.
     * d-2 tem 2 consultas de 1h com 4h de vão → 2h de 6h = 33%.
     * Média simples: ~66%. Ponderada por volume (1 contra 2) daria ~55%.
     */
    const dia = "2026-09-10";
    consulta({ quando: `${dia}T12:00:00.000Z`, fim: `${dia}T13:00:00.000Z`, dentista: "d-1" });
    consulta({ quando: `${dia}T12:00:00.000Z`, fim: `${dia}T13:00:00.000Z`, dentista: "d-2" });
    consulta({ quando: `${dia}T17:00:00.000Z`, fim: `${dia}T18:00:00.000Z`, dentista: "d-2" });

    const c = await medirCenario(ORG, [CLINICA], 300, AGORA);
    expect(c.ocupacaoAtual).toBeCloseTo(0.667, 2);
  });

  it("sem clínica alcançada, o cenário é vazio", async () => {
    for (let i = 0; i < 20; i += 1) consulta({ quando: diasAtras(10), status: "MISSED" });

    const c = await medirCenario(ORG, [], 300, AGORA);
    expect(c.taxaDeFalta).toBe(0);
    expect(c.ocupacaoAtual).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("o briefing", () => {
  it("com a base vazia, diz que não há nada", async () => {
    const b = await briefingDoDia(ORG, [CLINICA], "Bom dia.", AGORA);

    expect(b.linhas).toHaveLength(0);
    expect(b.abertura).toContain("Nada pedindo atenção");
  });

  it("conta a conversa esperando", async () => {
    semear("crc_conversations", [
      {
        id: "conv-1",
        organization_id: ORG,
        clinic_id: CLINICA,
        canal: "whatsapp",
        contato_externo: "551199999",
        status: "ABERTA",
        nao_lidas: 2,
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);

    const b = await briefingDoDia(ORG, [CLINICA], "Bom dia.", AGORA);

    expect(b.linhas.some((l) => l.chave === "conversas")).toBe(true);
  });

  it("conta SÓ a pendência que exige gente", async () => {
    /*
     * As que a automação resolve não são trabalho de ninguém — listá-las faria
     * a manhã começar com uma lista que não é sua.
     */
    semear("crc_previsit_checks", [
      {
        id: "p-humano",
        organization_id: ORG,
        clinic_id: CLINICA,
        appointment_id: "ag-x",
        item: "CONVENIO",
        status: "PENDENTE",
        resolve_quem: "humano",
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
      {
        id: "p-auto",
        organization_id: ORG,
        clinic_id: CLINICA,
        appointment_id: "ag-y",
        item: "CONFIRMACAO",
        status: "PENDENTE",
        resolve_quem: "automacao",
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);

    const b = await briefingDoDia(ORG, [CLINICA], "Bom dia.", AGORA);
    const linha = b.linhas.find((l) => l.chave === "pendencias");

    expect(linha?.texto).toContain("1 pendência");
  });

  it("sem clínica alcançada, o briefing é vazio — e não da organização", async () => {
    semear("crc_conversations", [
      {
        id: "conv-1",
        organization_id: ORG,
        clinic_id: CLINICA,
        canal: "whatsapp",
        contato_externo: "551199999",
        status: "ABERTA",
        nao_lidas: 5,
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);

    const b = await briefingDoDia(ORG, [], "Bom dia.", AGORA);
    expect(b.linhas).toHaveLength(0);
  });
});
