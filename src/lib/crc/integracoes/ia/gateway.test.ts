/**
 * Testes do gateway de modelos.
 *
 * O QUE ESTE ARQUIVO EXISTE PARA PROVAR, e cada item é uma forma de perder
 * dinheiro ou vazar chave:
 *
 *   O TETO BARRA ANTES DA CHAMADA. Não "barra e registra": a porta do provedor
 *   não pode ser tocada. O teste conta as chamadas do adapter, que é o que
 *   aparece na fatura.
 *
 *   O GASTO É SOMADO MESMO QUANDO A CHAMADA FALHA. Um 500 depois de o provedor
 *   processar o prompt foi cobrado. Ignorar isso faz o contador divergir da
 *   fatura justamente nos dias ruins.
 *
 *   CHAVE REVOGADA NÃO CAI NA CHAVE DA PLATAFORMA. Seria cobrar da plataforma um
 *   consumo que a clínica pediu para cobrar dela, calado.
 *
 *   O SEGREDO NÃO SAI EM LEITURA DE TELA. Nunca.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../servidor/banco", async () => {
  const fake = await import("../../testes/banco-memoria");
  return fake;
});

vi.mock("../../servidor/registro", async () => {
  const real =
    await vi.importActual<typeof import("../../servidor/registro")>("../../servidor/registro");
  return { ...real, registrar: () => undefined, registrarIntegracao: () => Promise.resolve() };
});

import { conteudo, definirRelogio, limparBanco, semear } from "../../testes/banco-memoria";
import { emMicro } from "../../dominio/orcamento";
import { salvarOrcamento } from "../../aplicacao/orcamento";
import {
  cadastrarCredencial,
  listarCredenciais,
  revogarCredencial,
  salvarRota,
  _lerSegredoCifrado,
} from "../../aplicacao/modelos";
import { comOrcamento, lerRota, portaParaFinalidade } from "./gateway";
import type { PortaIa, RespostaIa } from "./porta";

const ORG = "11111111-1111-4111-8111-111111111111";
const AGORA = new Date("2026-09-11T14:00:00.000Z");
const CHAVE_DE_CIFRA = Buffer.alloc(32, 7).toString("base64");

const uso = {
  modelo: "fake-1",
  inputTokens: 100,
  outputTokens: 40,
  custoEstimado: 0.5,
  duracaoMs: 10,
};

const pedido = {
  promptVersao: "teste_v1",
  instrucoes: "",
  entrada: "",
  esquema: { nome: "x", schema: {} },
  maxTokens: 100,
};

/** Um adapter que conta quantas vezes foi realmente chamado. */
function portaContada(resposta: RespostaIa): PortaIa & { chamadas: number } {
  const porta = {
    nome: "openai",
    modelo: "gpt-5.6-luna",
    chamadas: 0,
    gerarEstruturado: () => {
      porta.chamadas += 1;
      return Promise.resolve(resposta);
    },
  };
  return porta;
}

const ambiente = { ...process.env };

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  process.env["CRC_SEGREDO_CHAVE"] = CHAVE_DE_CIFRA;
  delete process.env["CRC_IA_SANDBOX"];
  process.env["OPENAI_API_KEY"] = "sk-plataforma-0000000000000000";
});

afterEach(() => {
  process.env = { ...ambiente };
});

/* -------------------------------------------------------------------------- */

describe("o teto barra antes da chamada", () => {
  it("com teto estourado, o provedor NÃO é chamado", async () => {
    await salvarOrcamento({
      organizationId: ORG,
      tetoDiaReais: 1,
      tetoMesReais: null,
      abrirCaso: true,
    });
    semear("crc_ai_gastos", [
      { organization_id: ORG, dia: "2026-09-11", micro_reais: emMicro(5), chamadas: 3 },
    ]);

    const bruta = portaContada({ ok: true, dados: {}, uso });
    const porta = comOrcamento(bruta, {
      organizationId: ORG,
      finalidade: "conversa",
      agora: () => AGORA,
    });

    const r = await porta.gerarEstruturado(pedido);

    expect(r.ok).toBe(false);
    // O ponto do ADR-12: a chamada não aconteceu.
    expect(bruta.chamadas).toBe(0);
    if (!r.ok) {
      expect(r.uso).toBeNull();
      // O prefixo estável é o que `turno.ts` reconhece para abrir caso humano.
      expect(r.detalhe).toContain("orcamento_estourado");
    }
  });

  it("dentro do teto, chama e soma o gasto", async () => {
    await salvarOrcamento({
      organizationId: ORG,
      tetoDiaReais: 100,
      tetoMesReais: null,
      abrirCaso: true,
    });

    const bruta = portaContada({ ok: true, dados: {}, uso });
    const porta = comOrcamento(bruta, {
      organizationId: ORG,
      finalidade: "conversa",
      agora: () => AGORA,
    });

    await porta.gerarEstruturado(pedido);

    expect(bruta.chamadas).toBe(1);
    expect(Number(conteudo("crc_ai_gastos")[0]?.["micro_reais"])).toBe(emMicro(0.5));
  });

  it("duas chamadas somam no MESMO balde do dia", async () => {
    const bruta = portaContada({ ok: true, dados: {}, uso });
    const porta = comOrcamento(bruta, {
      organizationId: ORG,
      finalidade: "conversa",
      agora: () => AGORA,
    });

    await porta.gerarEstruturado(pedido);
    await porta.gerarEstruturado(pedido);

    // Dois baldes do mesmo dia fariam o teto valer o dobro.
    expect(conteudo("crc_ai_gastos")).toHaveLength(1);
    expect(Number(conteudo("crc_ai_gastos")[0]?.["micro_reais"])).toBe(emMicro(1));
  });

  it("chamada que FALHA depois de gastar também soma", async () => {
    // Um 500 depois de o provedor processar o prompt foi cobrado. Ignorar faria o
    // contador divergir da fatura justamente nos dias ruins.
    const bruta = portaContada({
      ok: false,
      motivo: "indisponivel",
      detalhe: "500",
      uso: { ...uso, custoEstimado: 0.2 },
    });
    const porta = comOrcamento(bruta, {
      organizationId: ORG,
      finalidade: "conversa",
      agora: () => AGORA,
    });

    await porta.gerarEstruturado(pedido);
    expect(Number(conteudo("crc_ai_gastos")[0]?.["micro_reais"])).toBe(emMicro(0.2));
  });

  it("sem teto configurado, nada barra", async () => {
    const bruta = portaContada({ ok: true, dados: {}, uso });
    const porta = comOrcamento(bruta, {
      organizationId: ORG,
      finalidade: "conversa",
      agora: () => AGORA,
    });

    const r = await porta.gerarEstruturado(pedido);
    expect(r.ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("a chave da clínica", () => {
  it("o segredo entra cifrado e NÃO volta em leitura de tela", async () => {
    const segredo = "sk-proj-chave-secreta-da-clinica-1234";
    const r = await cadastrarCredencial({
      organizationId: ORG,
      provedor: "openai",
      apelido: "Conta da clínica",
      segredo,
    });
    expect(r.ok).toBe(true);

    const guardado = await _lerSegredoCifrado(ORG, r.ok ? r.id : "");
    expect(guardado).not.toBeNull();
    // Cifrado de verdade: o texto original não aparece na coluna.
    expect(guardado).not.toContain("chave-secreta");
    expect(guardado?.startsWith("v1:")).toBe(true);

    const visiveis = await listarCredenciais(ORG);
    const serializado = JSON.stringify(visiveis);
    expect(serializado).not.toContain("chave-secreta");
    // A dica basta para conferir visualmente que a chave certa foi colada.
    expect(visiveis[0]?.dica).toContain("sk-proj");
    expect(visiveis[0]?.dica).toContain("1234");
  });

  it("sem CRC_SEGREDO_CHAVE, recusa em vez de guardar em claro", async () => {
    delete process.env["CRC_SEGREDO_CHAVE"];
    const r = await cadastrarCredencial({
      organizationId: ORG,
      provedor: "openai",
      apelido: "Conta",
      segredo: "sk-proj-chave-secreta-da-clinica-1234",
    });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("sem_cifra");
    expect(conteudo("crc_ai_credentials")).toHaveLength(0);
  });

  it("o gateway usa a chave da clínica quando a rota aponta para ela", async () => {
    const cadastro = await cadastrarCredencial({
      organizationId: ORG,
      provedor: "openai",
      apelido: "Conta da clínica",
      segredo: "sk-proj-chave-secreta-da-clinica-1234",
    });
    await salvarRota({
      organizationId: ORG,
      finalidade: "conversa",
      provedor: "openai",
      modelo: "gpt-5-mini",
      credentialId: cadastro.ok ? cadastro.id : null,
    });

    const estado = await portaParaFinalidade(ORG, "conversa");
    expect(estado.configurado).toBe(true);
    if (estado.configurado) {
      expect(estado.usandoChaveDaClinica).toBe(true);
      expect(estado.rota.modelo).toBe("gpt-5-mini");
    }
  });

  it("chave REVOGADA não cai calada na chave da plataforma", async () => {
    const cadastro = await cadastrarCredencial({
      organizationId: ORG,
      provedor: "openai",
      apelido: "Conta da clínica",
      segredo: "sk-proj-chave-secreta-da-clinica-1234",
    });
    const id = cadastro.ok ? cadastro.id : "";
    await salvarRota({
      organizationId: ORG,
      finalidade: "conversa",
      provedor: "openai",
      modelo: "gpt-5-mini",
      credentialId: id,
    });
    await revogarCredencial(ORG, id);

    const estado = await portaParaFinalidade(ORG, "conversa");

    // Cair na chave da plataforma seria cobrar dela um consumo que a clínica
    // pediu para cobrar da conta dela — e ninguém veria.
    expect(estado.configurado).toBe(false);
    if (!estado.configurado) expect(estado.motivo).toContain("revogada");
  });
});

/* -------------------------------------------------------------------------- */

describe("as rotas", () => {
  it("sem rota configurada, cai no padrão do código", async () => {
    const rota = await lerRota(ORG, "supervisor");
    expect(rota.provedor).toBe("openai");
    expect(rota.credentialId).toBeNull();
  });

  it("cada finalidade tem rota própria", async () => {
    await salvarRota({
      organizationId: ORG,
      finalidade: "supervisor",
      provedor: "anthropic",
      modelo: "claude-haiku-4-5-20251001",
      credentialId: null,
    });

    expect((await lerRota(ORG, "supervisor")).provedor).toBe("anthropic");
    // A conversa não foi tocada: é o ponto de rotear por finalidade.
    expect((await lerRota(ORG, "conversa")).provedor).toBe("openai");
  });

  it("salvar a mesma finalidade duas vezes ATUALIZA a rota", async () => {
    const salvar = (modelo: string) =>
      salvarRota({
        organizationId: ORG,
        finalidade: "conversa",
        provedor: "openai",
        modelo,
        credentialId: null,
      });

    await salvar("gpt-5-mini");
    await salvar("gpt-5.5");

    // Duas rotas para a mesma finalidade seria ambiguidade sobre qual o gateway
    // usa.
    expect(conteudo("crc_ai_bindings")).toHaveLength(1);
    expect((await lerRota(ORG, "conversa")).modelo).toBe("gpt-5.5");
  });

  it("recusa rotear embeddings para um provedor sem adapter", async () => {
    // Aceitar gravaria uma rota que o gateway ignora em silêncio, e a pessoa
    // acreditaria ter configurado algo.
    const r = await salvarRota({
      organizationId: ORG,
      finalidade: "embeddings",
      provedor: "anthropic",
      modelo: "claude-haiku-4-5-20251001",
      credentialId: null,
    });

    expect(r.ok).toBe(false);
    expect(conteudo("crc_ai_bindings")).toHaveLength(0);
  });

  it("finalidade inventada é recusada", async () => {
    const r = await salvarRota({
      organizationId: ORG,
      finalidade: "qualquer_coisa",
      provedor: "openai",
      modelo: "gpt-5-mini",
      credentialId: null,
    });
    expect(r.ok).toBe(false);
  });
});
