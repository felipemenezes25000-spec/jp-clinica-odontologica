/**
 * Financeiro e pré-consulta, com banco.
 *
 * ============================================================================
 *  OS DOIS DEFEITOS QUE ESTE ARQUIVO PRENDE:
 *
 *  1. A VARREDURA DIÁRIA ACUMULANDO PENDÊNCIA. Sem a chave (consulta, item), a
 *     consulta de quinta ganharia um "sem confirmação" por dia até chegar — e a
 *     tela mostraria três pendências idênticas para o mesmo paciente.
 *
 *  2. EDITAR A POLÍTICA E PERDER METADE DELA. `gravar` é upsert de linha
 *     inteira; salvar só o texto devolveria `parcelas_max` ao DEFAULT, e a
 *     clínica que oferecia 6× passaria a oferecer 1× sem ninguém pedir.
 *
 *  INJEÇÃO DE DEFEITO:
 *    trocar `inserirIgnorandoDuplicata` por `inserir` → (1) quebra;
 *    omitir colunas em `salvarPolitica`               → (2) quebra;
 *    fazer convênio nascer autorizado                 → "convênio pende" quebra.
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

import { POLITICA_PADRAO } from "../dominio/pagamento";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import {
  conferirDesconto,
  fecharPendencia,
  listarPendencias,
  parcelamentoDisponivel,
  politicaEmVigor,
  salvarPolitica,
  varrerPreConsulta,
} from "./financeiro";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_2 = "aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PACIENTE = "aaaa9999-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

function paciente(id: string, extras: Record<string, unknown> = {}): void {
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
      ...extras,
    },
  ]);
}

function consulta(id: string, extras: Record<string, unknown> = {}): void {
  semear("crc_appointments", [
    {
      id,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      external_source: "dental_office",
      external_id: id,
      // Amanhã: dentro da janela de 72h.
      inicio_em: "2026-09-13T14:00:00.000Z",
      status: "TO_CONFIRM",
      risco_fatores: [],
      criado_em: "2026-09-01T10:00:00.000Z",
      atualizado_em: "2026-09-01T10:00:00.000Z",
      ...extras,
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

/* -------------------------------------------------------------------------- */

describe("a política", () => {
  it("sem nada cadastrado, vale a padrão — toda fechada", async () => {
    const p = await politicaEmVigor(ORG, CLINICA);
    expect(p).toEqual(POLITICA_PADRAO);
  });

  it("a da clínica ganha da organização", async () => {
    await salvarPolitica(ORG, null, { ...POLITICA_PADRAO, nome: "Rede", parcelasMax: 3 }, null);
    await salvarPolitica(ORG, CLINICA, { ...POLITICA_PADRAO, nome: "Rede", parcelasMax: 10 }, null);

    expect((await politicaEmVigor(ORG, CLINICA)).parcelasMax).toBe(10);
    expect((await politicaEmVigor(ORG, CLINICA_2)).parcelasMax).toBe(3);
  });

  it("editar o TEXTO não apaga as parcelas", async () => {
    /*
     * ============================================================================
     *  A ARMADILHA DO UPSERT DE LINHA INTEIRA, pela terceira vez neste projeto.
     *
     *  `gravar` é `merge-duplicates`: coluna omitida volta ao DEFAULT. Salvar só
     *  o texto devolveria `parcelas_max` a 1 — e a clínica que oferecia 6×
     *  passaria a oferecer à vista, em silêncio.
     * ============================================================================
     */
    const base = {
      ...POLITICA_PADRAO,
      nome: "Rede",
      parcelasMax: 6,
      parcelasSemJuros: 3,
      descontoMaxPct: 10,
      aprovadorPapel: "gestor",
      parcelaMinima: 100,
    };

    await salvarPolitica(ORG, CLINICA, base, null);
    await salvarPolitica(ORG, CLINICA, { ...base, textoParaPaciente: "Parcelamos." }, null);

    const p = await politicaEmVigor(ORG, CLINICA);
    expect(p.parcelasMax).toBe(6);
    expect(p.descontoMaxPct).toBe(10);
    expect(p.aprovadorPapel).toBe("gestor");
    expect(p.textoParaPaciente).toBe("Parcelamos.");
  });

  it("uma política por nome — editar substitui", async () => {
    await salvarPolitica(ORG, CLINICA, { ...POLITICA_PADRAO, nome: "Rede" }, null);
    await salvarPolitica(ORG, CLINICA, { ...POLITICA_PADRAO, nome: "Rede" }, null);

    expect(conteudo("crc_payment_policies")).toHaveLength(1);
  });

  it("o parcelamento sai da política em vigor", async () => {
    await salvarPolitica(
      ORG,
      CLINICA,
      { ...POLITICA_PADRAO, nome: "Rede", parcelasMax: 6, parcelaMinima: 100 },
      null,
    );

    const o = await parcelamentoDisponivel(ORG, CLINICA, 600);
    expect(o.length).toBeLessThanOrEqual(6);
  });
});

describe("o desconto", () => {
  it("dentro do teto passa", async () => {
    await salvarPolitica(ORG, CLINICA, { ...POLITICA_PADRAO, nome: "R", descontoMaxPct: 10 }, null);

    const v = await conferirDesconto(ORG, CLINICA, 1000, 950, "recepcao", null);
    expect(v.permitido).toBe(true);
  });

  it("sem política cadastrada, NENHUM desconto passa", async () => {
    const v = await conferirDesconto(ORG, CLINICA, 1000, 900, "admin", null);
    expect(v.permitido).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("a pré-consulta", () => {
  it("consulta sem confirmação amanhã gera pendência que o CRC resolve", async () => {
    paciente(PACIENTE);
    consulta("ag-1");

    const r = await varrerPreConsulta(ORG, AGORA);

    expect(r.consultas).toBe(1);
    const conf = conteudo("crc_previsit_checks").find((c) => c["item"] === "CONFIRMACAO");
    expect(conf?.["resolve_quem"]).toBe("automacao");
  });

  it("a SEGUNDA varredura não acumula pendência", async () => {
    /*
     * ============================================================================
     *  Sem a chave (consulta, item), a consulta de quinta ganharia um "sem
     *  confirmação" por dia até chegar — e a tela mostraria três pendências
     *  idênticas para o mesmo paciente.
     * ============================================================================
     */
    paciente(PACIENTE);
    consulta("ag-1");

    await varrerPreConsulta(ORG, AGORA);
    const segunda = await varrerPreConsulta(ORG, AGORA);

    expect(segunda.pendenciasCriadas).toBe(0);
    expect(conteudo("crc_previsit_checks").filter((c) => c["item"] === "CONFIRMACAO")).toHaveLength(
      1,
    );
  });

  it("primeira consulta pede formulário e documento", async () => {
    paciente(PACIENTE);
    consulta("ag-1");

    await varrerPreConsulta(ORG, AGORA);

    const itens = conteudo("crc_previsit_checks").map((c) => c["item"]);
    expect(itens).toContain("FORMULARIO");
    expect(itens).toContain("DOCUMENTO");
  });

  it("quem JÁ VEIO não recebe pedido de formulário", async () => {
    paciente(PACIENTE);
    consulta("ag-passada", {
      id: "ag-passada",
      inicio_em: "2026-01-10T14:00:00.000Z",
      status: "COMPLETED",
    });
    consulta("ag-1");

    await varrerPreConsulta(ORG, AGORA);

    expect(conteudo("crc_previsit_checks").map((c) => c["item"])).not.toContain("FORMULARIO");
  });

  it("convênio SEM autorização pende, é de HUMANO, e bloqueia", async () => {
    /*
     * Não há integração com plano nenhum. A pendência nasce e fica para uma
     * pessoa — que é exatamente o que o §31 manda quando não há API, e o
     * oposto de dizer "autorizado" sem prova.
     */
    paciente(PACIENTE, { convenio: "Amil" });
    consulta("ag-1", { status: "CONFIRMED" });

    const r = await varrerPreConsulta(ORG, AGORA);

    const conv = conteudo("crc_previsit_checks").find((c) => c["item"] === "CONVENIO");
    expect(conv?.["resolve_quem"]).toBe("humano");
    expect(r.bloqueadas).toBe(1);
  });

  it("consulta longe demais não gera nada", async () => {
    paciente(PACIENTE);
    consulta("ag-1", { inicio_em: "2026-10-20T14:00:00.000Z" });

    const r = await varrerPreConsulta(ORG, AGORA);
    expect(r.pendenciasCriadas).toBe(0);
  });

  it("a lista respeita as clínicas alcançadas", async () => {
    paciente(PACIENTE);
    consulta("ag-1");
    await varrerPreConsulta(ORG, AGORA);

    expect((await listarPendencias(ORG, [CLINICA])).length).toBeGreaterThan(0);
    expect(await listarPendencias(ORG, [CLINICA_2])).toHaveLength(0);
    expect(await listarPendencias(ORG, [])).toHaveLength(0);
  });

  it("fechar tira da lista", async () => {
    paciente(PACIENTE);
    consulta("ag-1");
    await varrerPreConsulta(ORG, AGORA);

    const antes = await listarPendencias(ORG, [CLINICA]);
    await fecharPendencia(ORG, antes[0]?.id ?? "", "DISPENSADO", "user-1");

    expect(await listarPendencias(ORG, [CLINICA])).toHaveLength(antes.length - 1);
  });
});
