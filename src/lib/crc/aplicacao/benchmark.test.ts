/**
 * Benchmarking interno, com banco.
 *
 * Este arquivo lê seis tabelas com filtros e ordenações próprias. Metade do
 * valor dele é a conferência de coluna do fake passar por todas elas — a outra
 * metade são as duas regras abaixo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { compararTudo } from "./benchmark";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C1 = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const C2 = "aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-15T14:00:00.000Z");

let seq = 0;

function clinica(id: string, nome: string) {
  semear("crc_clinics", [
    {
      id,
      organization_id: ORG,
      nome,
      slug: nome.toLowerCase(),
      external_id: null,
      fuso: "America/Sao_Paulo",
      ativa: true,
      criado_em: "2026-01-01T10:00:00.000Z",
      atualizado_em: "2026-01-01T10:00:00.000Z",
    },
  ]);
}

function consulta(clinicId: string, status: string, dentista: string, diasAtras: number) {
  seq += 1;
  const quando = new Date(AGORA.getTime() - diasAtras * 86_400_000).toISOString();
  semear("crc_appointments", [
    {
      id: `ag-${String(seq)}`,
      organization_id: ORG,
      clinic_id: clinicId,
      patient_id: null,
      external_source: "dental_office",
      external_id: `ag-${String(seq)}`,
      dentista_externo_id: dentista,
      dentista_nome: `Dr. ${dentista}`,
      inicio_em: quando,
      fim_em: quando,
      status,
      risco_fatores: [],
      criado_em: quando,
      atualizado_em: quando,
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  seq = 0;
});

/* -------------------------------------------------------------------------- */

describe("clínica contra clínica", () => {
  it("a unidade com pouco volume não lidera", async () => {
    /*
     * A C2 tem 100% de comparecimento com 2 consultas; a C1 tem 80% com 100.
     * Sem o piso de volume, a C2 seria a primeira colocada todo mês.
     */
    clinica(C1, "Centro");
    clinica(C2, "Norte");

    for (let i = 0; i < 80; i += 1) consulta(C1, "COMPLETED", "d1", 5);
    for (let i = 0; i < 20; i += 1) consulta(C1, "MISSED", "d1", 5);
    for (let i = 0; i < 2; i += 1) consulta(C2, "COMPLETED", "d2", 5);

    const r = await compararTudo(ORG, [C1, C2], AGORA);

    expect(r.clinicas.linhas[0]?.chave).toBe(C1);
    expect(r.clinicas.linhas.find((l) => l.chave === C2)?.amostraPequena).toBe(true);
  });

  it("cancelamento não conta nos dois lados do comparecimento", async () => {
    clinica(C1, "Centro");

    for (let i = 0; i < 30; i += 1) consulta(C1, "COMPLETED", "d1", 5);
    for (let i = 0; i < 10; i += 1) consulta(C1, "MISSED", "d1", 5);
    // Noventa cancelamentos não podem afundar o comparecimento: a cadeira deu
    // tempo de ser reocupada.
    for (let i = 0; i < 90; i += 1) consulta(C1, "CANCELLED", "d1", 5);

    const r = await compararTudo(ORG, [C1], AGORA);
    expect(r.clinicas.linhas[0]?.valor).toBe(75);
  });
});

/* -------------------------------------------------------------------------- */

describe("período contra período", () => {
  it("compara janelas que não se sobrepõem", async () => {
    clinica(C1, "Centro");

    // 10 realizadas nos últimos 30 dias, 5 nos 30 anteriores.
    for (let i = 0; i < 10; i += 1) consulta(C1, "COMPLETED", "d1", 5);
    for (let i = 0; i < 5; i += 1) consulta(C1, "COMPLETED", "d1", 45);

    const r = await compararTudo(ORG, [C1], AGORA);
    const feitas = r.periodo.find((p) => p.rotulo === "Consultas realizadas");

    expect(feitas?.atual).toBe(10);
    expect(feitas?.anterior).toBe(5);
    expect(feitas?.variacaoPct).toBe(100);
    expect(feitas?.melhorou).toBe(true);
  });

  it("menos faltas é melhora, e não queda", async () => {
    clinica(C1, "Centro");

    for (let i = 0; i < 2; i += 1) consulta(C1, "MISSED", "d1", 5);
    for (let i = 0; i < 10; i += 1) consulta(C1, "MISSED", "d1", 45);

    const r = await compararTudo(ORG, [C1], AGORA);
    const faltas = r.periodo.find((p) => p.rotulo === "Faltas");

    expect(faltas?.melhorou).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("o escopo", () => {
  it("sem clínica alcançada, não compara nada", async () => {
    clinica(C1, "Centro");
    for (let i = 0; i < 50; i += 1) consulta(C1, "COMPLETED", "d1", 5);

    const r = await compararTudo(ORG, [], AGORA);

    expect(r.clinicas.linhas).toHaveLength(0);
    expect(r.periodo).toHaveLength(0);
  });

  it("só compara as clínicas que o usuário alcança", async () => {
    clinica(C1, "Centro");
    clinica(C2, "Norte");
    for (let i = 0; i < 50; i += 1) consulta(C1, "COMPLETED", "d1", 5);
    for (let i = 0; i < 50; i += 1) consulta(C2, "COMPLETED", "d2", 5);

    const r = await compararTudo(ORG, [C1], AGORA);

    expect(r.clinicas.linhas.map((l) => l.chave)).toEqual([C1]);
  });
});
