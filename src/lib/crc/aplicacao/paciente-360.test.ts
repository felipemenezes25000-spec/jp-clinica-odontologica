/**
 * Patient 360, com banco.
 *
 * ============================================================================
 *  METADE DO VALOR DESTE ARQUIVO É A CONFERÊNCIA DE COLUNA DO FAKE.
 *
 *  A ficha lê SETE tabelas — pacientes, receita, oportunidades, orçamentos,
 *  consultas, identidades, atividade, preferências, mensagens e contatos. É a
 *  função com a maior superfície de nomes de coluna do sistema inteiro, e
 *  nenhum deles é verificado pelo TypeScript.
 *
 *  A primeira versão lia `canais` e `janelas` de `crc_waitlist_preferences`.
 *  Nenhuma das duas existe: as reais são `dias`, `hora_inicio` e `hora_fim`.
 *  Quem pegou foi o fake.
 * ============================================================================
 *
 *  INJEÇÃO DE DEFEITO:
 *    somar POTENCIAL no LTV            → "LTV é só produção" quebra;
 *    filtrar identidades por paciente  → "household precisa dos outros" quebra;
 *    usar média em vez de mediana      → "uma reabilitação não rebaixa" quebra.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { montarFicha } from "./paciente-360";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-15T14:00:00.000Z");
const RECALL = 180;

let seq = 0;

function paciente(id: string, nome: string, p: { ultima?: string | null; optOut?: string } = {}) {
  semear("crc_patients", [
    {
      id,
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "dental_office",
      external_id: id,
      nome,
      telefone: "11999990000",
      ultima_consulta_em: p.ultima ?? null,
      opt_out_em: p.optOut ?? null,
      criado_em: "2026-01-01T10:00:00.000Z",
      atualizado_em: "2026-01-01T10:00:00.000Z",
    },
  ]);
}

function receita(patientId: string, valor: number, natureza: string, recuperada = false) {
  seq += 1;
  semear("crc_revenue_events", [
    {
      id: `rv-${String(seq)}`,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: patientId,
      opportunity_id: null,
      enrollment_id: null,
      natureza,
      valor,
      motivo: "teste",
      recuperada,
      ocorrido_em: "2026-06-01T10:00:00.000Z",
      criado_em: "2026-06-01T10:00:00.000Z",
      chave_dedupe: `rv-${String(seq)}`,
    },
  ]);
}

function identidade(patientId: string, valor: string, confirmada: string | null = null) {
  seq += 1;
  semear("crc_patient_identities", [
    {
      id: `idt-${String(seq)}`,
      organization_id: ORG,
      patient_id: patientId,
      tipo: "TELEFONE",
      valor,
      compartilhada: true,
      confirmada_em: confirmada,
      confirmada_por: null,
      criado_em: "2026-01-01T10:00:00.000Z",
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  seq = 0;
});

/* -------------------------------------------------------------------------- */

describe("o LTV", () => {
  it("é só PRODUÇÃO — potencial não é dinheiro que entrou", async () => {
    /*
     * Item 63 aplicado à ficha: contar potencial faria a recepção ver
     * "R$ 50.000" de um paciente que nunca pagou nada, e tratá-lo como VIP.
     */
    paciente("p1", "Ana");
    receita("p1", 50_000, "POTENCIAL");
    receita("p1", 3_000, "PRODUCAO");

    const f = await montarFicha(ORG, [CLINICA], "p1", RECALL, AGORA);
    expect(f?.ltv).toBe(3_000);
  });

  it("a receita atribuída é o subconjunto que o CRC recuperou", async () => {
    paciente("p1", "Ana");
    receita("p1", 5_000, "PRODUCAO", false);
    receita("p1", 2_000, "PRODUCAO", true);

    const f = await montarFicha(ORG, [CLINICA], "p1", RECALL, AGORA);

    expect(f?.ltv).toBe(7_000);
    expect(f?.receitaAtribuida).toBe(2_000);
  });

  it("uma reabilitação cara não rebaixa a base inteira", async () => {
    /*
     * ============================================================================
     *  É a razão de a régua ser MEDIANA e não média.
     *
     *  Quatro pacientes de R$ 1.000 e um de R$ 100.000: a média é R$ 20.800 e
     *  faria os quatro virarem "valor baixo". A mediana é R$ 1.000, e eles
     *  ficam onde deveriam.
     * ============================================================================
     */
    for (const id of ["p1", "p2", "p3", "p4"]) {
      paciente(id, `Paciente ${id}`);
      receita(id, 1_000, "PRODUCAO");
    }
    paciente("rico", "Reabilitação");
    receita("rico", 100_000, "PRODUCAO");

    const f = await montarFicha(ORG, [CLINICA], "p1", RECALL, AGORA);

    // Com média, 1.000 contra 20.800 seria BAIXO. Com mediana, é MEDIO.
    expect(f?.faixaDeValor).toBe("MEDIO");
  });
});

/* -------------------------------------------------------------------------- */

describe("o household", () => {
  it("encontra quem divide o telefone", async () => {
    /*
     * A inferência precisa ver as identidades dos OUTROS pacientes. Filtrar por
     * `patient_id` devolveria só as dele, e a casa estaria sempre vazia.
     */
    paciente("mae", "Ana");
    paciente("filho", "Bruno");
    identidade("mae", "11999990000");
    identidade("filho", "11999990000");

    const f = await montarFicha(ORG, [CLINICA], "mae", RECALL, AGORA);

    expect(f?.household).toHaveLength(1);
    expect(f?.household[0]?.patientId).toBe("filho");
    expect(f?.household[0]?.confirmado).toBe(false);
  });

  it("telefone diferente não forma casa", async () => {
    paciente("mae", "Ana");
    paciente("estranho", "Carlos");
    identidade("mae", "11999990000");
    identidade("estranho", "11888880000");

    const f = await montarFicha(ORG, [CLINICA], "mae", RECALL, AGORA);
    expect(f?.household).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("o risco de abandono na ficha", () => {
  it("consulta futura marcada zera o risco", async () => {
    paciente("p1", "Ana", { ultima: "2024-01-01T10:00:00.000Z" });
    semear("crc_appointments", [
      {
        id: "ag-futura",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: "p1",
        external_source: "dental_office",
        external_id: "ag-futura",
        inicio_em: "2026-10-01T10:00:00.000Z",
        fim_em: "2026-10-01T11:00:00.000Z",
        status: "SCHEDULED",
        risco_fatores: [],
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);

    const f = await montarFicha(ORG, [CLINICA], "p1", RECALL, AGORA);
    expect(f?.riscoDeAbandono.score).toBe(0);
  });

  it("sumido há muito tempo, sem consulta futura, é risco", async () => {
    paciente("p1", "Ana", { ultima: "2024-01-01T10:00:00.000Z" });

    const f = await montarFicha(ORG, [CLINICA], "p1", RECALL, AGORA);

    expect(f?.riscoDeAbandono.score).toBeGreaterThan(0);
    expect(f?.riscoDeAbandono.fatores.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("o escopo", () => {
  it("paciente de outra organização não é encontrado", async () => {
    paciente("p1", "Ana");

    const f = await montarFicha(
      "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      [CLINICA],
      "p1",
      RECALL,
      AGORA,
    );
    expect(f).toBeNull();
  });

  it("sem clínica alcançada, não monta ficha", async () => {
    paciente("p1", "Ana");
    expect(await montarFicha(ORG, [], "p1", RECALL, AGORA)).toBeNull();
  });
});
