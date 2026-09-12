/**
 * Primeiros passos, com banco.
 *
 * ============================================================================
 *  OS DOIS TESTES QUE CARREGAM ESTE ARQUIVO:
 *
 *    1. O ADMIN NÃO CONTA como "sem unidade". Ele alcança tudo por papel, sem
 *       vínculo gravado. Contá-lo produziria uma pendência permanente que
 *       ninguém consegue resolver.
 *
 *    2. AUTOMAÇÃO EM SHADOW NÃO CONTA como ligada. Ela calcula tudo e não
 *       envia nada. Contá-la diria que o CRC está agindo enquanto ele só
 *       observa — o pior erro possível num checklist cujo trabalho é dizer o
 *       que ainda NÃO está funcionando.
 *
 *  INJEÇÃO DE DEFEITO:
 *    tirar o filtro `papel != admin`  → "o admin não conta" quebra;
 *    tirar o filtro `modo != SHADOW`  → "shadow não conta" quebra.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { lerEstadoDaInstalacao, primeirosPassos } from "./primeiros-passos";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

function pessoa(id: string, papel: string) {
  semear("crc_users", [
    {
      id,
      organization_id: ORG,
      nome: `Pessoa ${id}`,
      email: `${id}@exemplo.test`,
      senha_hash: null,
      papel,
      ativo: true,
      ultimo_acesso: null,
      criado_em: AGORA.toISOString(),
      atualizado_em: AGORA.toISOString(),
    },
  ]);
}

function automacao(id: string, status: string, modo: string) {
  semear("crc_automations", [
    {
      id,
      organization_id: ORG,
      chave: id,
      nome: id,
      descricao: null,
      status,
      modo,
      versao_ativa: 1,
      criado_em: AGORA.toISOString(),
      atualizado_em: AGORA.toISOString(),
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

/* -------------------------------------------------------------------------- */

describe("o estado da instalação", () => {
  it("o ADMIN não conta como trancado do lado de fora", async () => {
    /*
     * ============================================================================
     *  Ele alcança tudo por papel, sem nenhuma linha em `crc_user_clinics` —
     *  é assim que `servidor/sessao.ts` monta o contexto.
     *
     *  Contá-lo faria o checklist mostrar uma pendência que não some: alguém
     *  vincularia o admin a todas as unidades, o aviso sumiria, e a unidade
     *  criada no mês seguinte o traria de volta.
     * ============================================================================
     */
    pessoa("u-admin", "admin");

    const e = await lerEstadoDaInstalacao(ORG);
    expect(e.usuariosSemClinica).toBe(0);
  });

  it("a recepcionista sem unidade CONTA", async () => {
    pessoa("u-admin", "admin");
    pessoa("u1", "recepcao");

    const e = await lerEstadoDaInstalacao(ORG);
    expect(e.usuariosSemClinica).toBe(1);
  });

  it("com unidade vinculada, não conta", async () => {
    pessoa("u1", "recepcao");
    semear("crc_user_clinics", [{ user_id: "u1", clinic_id: "c1" }]);

    const e = await lerEstadoDaInstalacao(ORG);
    expect(e.usuariosSemClinica).toBe(0);
  });

  it("automação ATIVA em SHADOW não conta como ligada", async () => {
    /*
     * SHADOW calcula tudo e não executa nada — é como toda automação nasce
     * (item 96). Contá-la diria à pessoa que o CRC está agindo enquanto ele só
     * observa.
     */
    automacao("a1", "ATIVA", "SHADOW");

    const e = await lerEstadoDaInstalacao(ORG);
    expect(e.automacoesAtivas).toBe(0);
  });

  it("automação ATIVA em EXECUTAR conta", async () => {
    automacao("a1", "ATIVA", "EXECUTAR");

    const e = await lerEstadoDaInstalacao(ORG);
    expect(e.automacoesAtivas).toBe(1);
  });

  it("automação PAUSADA em EXECUTAR não conta", async () => {
    automacao("a1", "PAUSADA", "EXECUTAR");

    const e = await lerEstadoDaInstalacao(ORG);
    expect(e.automacoesAtivas).toBe(0);
  });

  it("sem ninguém cadastrado, ninguém está trancado", async () => {
    // A contagem precisa devolver 0 e não fazer a segunda consulta com uma
    // lista vazia de ids — `in.()` num filtro é um pedido que não casa nada,
    // mas pedir é desperdício e esconde a intenção.
    const e = await lerEstadoDaInstalacao(ORG);
    expect(e.usuariosSemClinica).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("os passos", () => {
  it("numa base zerada, os essenciais aparecem pendentes", async () => {
    const passos = await primeirosPassos(ORG);
    const pendentes = passos.filter((p) => p.essencial && !p.feito).map((p) => p.chave);

    expect(pendentes).toContain("clinica");
    expect(pendentes).toContain("integracao");
    expect(pendentes).toContain("pacientes");
    // Ninguém está trancado do lado de fora porque não há ninguém.
    expect(pendentes).not.toContain("escopo");
  });

  it("a clínica ativa marca o primeiro passo", async () => {
    semear("crc_clinics", [
      {
        id: "c1",
        organization_id: ORG,
        nome: "Centro",
        slug: "centro",
        external_id: null,
        fuso: "America/Sao_Paulo",
        ativa: true,
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);

    const passos = await primeirosPassos(ORG);
    expect(passos.find((p) => p.chave === "clinica")?.feito).toBe(true);
  });
});
