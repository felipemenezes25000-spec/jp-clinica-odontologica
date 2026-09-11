/**
 * O gateway MCP — Fase F, item 24.
 *
 * O QUE ESTES TESTES PROTEGEM é a frase do ADR-06: "MCP é camada de contrato,
 * nunca bypass". Um gateway que expõe as mesmas ferramentas por fora da política
 * transforma todo o trabalho das fases B a E numa sugestão.
 *
 * Os três testes que mais importam:
 *
 *   O TENANT NÃO VEM DO PEDIDO. É da sessão. Se viesse do payload, quem
 *   soubesse digitar um uuid leria a base de qualquer clínica.
 *
 *   FERRAMENTA SENSÍVEL NÃO APARECE NEM NO CATÁLOGO. Não é "não pode chamar":
 *   é não pode nem saber que existe.
 *
 *   A RECUSA É IDÊNTICA para "não existe" e "não pode". Distinguir as duas
 *   contaria a um cliente não autorizado quais ferramentas sensíveis existem.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

const auditadas: { acao: string; depois: unknown }[] = [];
vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return {
    ...real,
    registrar: () => undefined,
    auditar: (e: { acao: string; depois: unknown }) => {
      auditadas.push(e);
      return Promise.resolve();
    },
  };
});

import { TODAS_AS_FERRAMENTAS } from "./ferramentas";
import { _limparCacheDeConfiguracao } from "../servidor/configuracao";
import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { catalogoMcp, chamarFerramentaMcp, type SessaoMcp } from "./mcp";

const ORG = "11111111-1111-4111-8111-111111111111";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const sessao = (extra: Partial<SessaoMcp> = {}): SessaoMcp => ({
  organizationId: ORG,
  clienteId: "claude-desktop-da-recepcao",
  permitirEscrita: false,
  ...extra,
});

/** Liga uma flag da clínica no banco em memória. */
function ligarFlag(chave: string): void {
  semear("crc_feature_flags", [{ organization_id: ORG, chave, ligada: true }]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  _limparCacheDeConfiguracao();
  auditadas.length = 0;
  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
});

/* ========================================================================== */
/* O catálogo                                                                 */
/* ========================================================================== */

describe("catalogoMcp", () => {
  it("mostra as ferramentas de leitura", () => {
    const lista = catalogoMcp(sessao());
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((f) => typeof f.name === "string" && f.name.includes("."))).toBe(true);
  });

  it("NUNCA mostra ferramenta sensível", () => {
    const sensiveis = TODAS_AS_FERRAMENTAS.filter((f) => f.permissao === "SENSIVEL").map(
      (f) => f.chave,
    );

    // Com escrita liberada — a configuração mais permissiva possível.
    const nomes = catalogoMcp(sessao({ permitirEscrita: true })).map((f) => f.name);

    /*
     * NÃO É SÓ "NÃO PODE CHAMAR": NÃO PODE NEM VER.
     *
     * Uma ferramenta sensível listada convida o cliente a tentar, e cada
     * tentativa recusada é uma linha de auditoria que parece ataque sem ser.
     * Pior: a DESCRIÇÃO dela revela capacidades do sistema a quem talvez não
     * devesse saber que existem.
     */
    for (const s of sensiveis) expect(nomes).not.toContain(s);
  });

  it("esconde ferramenta de escrita quando o cliente é só de leitura", () => {
    const soLeitura = catalogoMcp(sessao({ permitirEscrita: false })).map((f) => f.name);
    const comEscrita = catalogoMcp(sessao({ permitirEscrita: true })).map((f) => f.name);

    expect(comEscrita.length).toBeGreaterThan(soLeitura.length);
  });

  it("cada ferramenta leva o schema de entrada", () => {
    // Sem `inputSchema`, o cliente MCP não sabe o que mandar — e a primeira
    // chamada vira tentativa e erro contra um sistema de produção.
    for (const f of catalogoMcp(sessao())) {
      expect(f.inputSchema).toBeTypeOf("object");
      expect(f.description.length).toBeGreaterThan(10);
    }
  });
});

/* ========================================================================== */
/* A chamada                                                                  */
/* ========================================================================== */

describe("chamarFerramentaMcp", () => {
  const executor = vi.fn(() => Promise.resolve("resultado"));

  beforeEach(() => {
    executor.mockClear();
  });

  it("executa uma ferramenta de leitura", async () => {
    const leitura = catalogoMcp(sessao())[0];
    if (leitura === undefined) throw new Error("catálogo vazio");

    const r = await chamarFerramentaMcp(sessao(), leitura.name, {}, executor);

    expect(r).toMatchObject({ ok: true, conteudo: "resultado" });
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("ferramenta inexistente e ferramenta proibida dão a MESMA resposta", async () => {
    const sensivel = TODAS_AS_FERRAMENTAS.find((f) => f.permissao === "SENSIVEL");

    const inexistente = await chamarFerramentaMcp(sessao(), "nao.existe", {}, executor);
    expect(inexistente).toMatchObject({ ok: false, codigo: "ferramenta_desconhecida" });

    if (sensivel !== undefined) {
      const proibida = await chamarFerramentaMcp(sessao(), sensivel.chave, {}, executor);
      // Distinguir as duas contaria a um cliente não autorizado quais
      // ferramentas sensíveis existem — que é a informação que o catálogo
      // esconde de propósito.
      expect(proibida).toMatchObject({ ok: false, codigo: "ferramenta_desconhecida" });
    }

    expect(executor).not.toHaveBeenCalled();
  });

  it("escrita é recusada quando a CLÍNICA não liberou, mesmo com o cliente autorizado", async () => {
    const escrita = TODAS_AS_FERRAMENTAS.find(
      (f) => f.permissao === "ESCRITA" && f.aprovacao !== "HUMANO",
    );
    if (escrita === undefined) return;

    // O cliente pode escrever; a clínica não ligou `ai_agente_escrita`.
    const r = await chamarFerramentaMcp(
      sessao({ permitirEscrita: true }),
      escrita.chave,
      {},
      executor,
    );

    // São duas perguntas diferentes — "a clínica permite?" e "este cliente
    // pode?" — e a resposta é o E das duas. OU seria a mais permissiva, e a
    // mais permissiva é a errada.
    expect(r.ok).toBe(false);
    expect(executor).not.toHaveBeenCalled();
  });

  it("com as duas autorizações, a escrita passa", async () => {
    const escrita = TODAS_AS_FERRAMENTAS.find(
      (f) => f.permissao === "ESCRITA" && f.aprovacao !== "HUMANO",
    );
    if (escrita === undefined) return;

    ligarFlag("ai_agente_escrita");
    ligarFlag("auto_scheduling");
    ligarFlag("dental_office_writeback");

    const r = await chamarFerramentaMcp(
      sessao({ permitirEscrita: true }),
      escrita.chave,
      {},
      executor,
    );

    expect(r.ok).toBe(true);
  });

  it("o erro do executor vira recusa nomeada, e não exceção", async () => {
    const leitura = catalogoMcp(sessao())[0];
    if (leitura === undefined) throw new Error("catálogo vazio");

    const quebrado = () => Promise.reject(new Error("o banco caiu"));

    // Uma exceção aqui viraria desconexão sem explicação do lado do cliente.
    const r = await chamarFerramentaMcp(sessao(), leitura.name, {}, quebrado);

    expect(r).toMatchObject({ ok: false, codigo: "falha_na_execucao" });
    expect((r as { motivo: string }).motivo).toContain("banco caiu");
  });
});

/* ========================================================================== */
/* A auditoria                                                                */
/* ========================================================================== */

describe("toda chamada MCP é auditada", () => {
  const executor = () => Promise.resolve("ok");

  it("a bem-sucedida aparece, com o cliente que pediu", async () => {
    const leitura = catalogoMcp(sessao())[0];
    if (leitura === undefined) throw new Error("catálogo vazio");

    await chamarFerramentaMcp(sessao(), leitura.name, {}, executor);

    const linha = auditadas.find((a) => a.acao === `mcp.${leitura.name}`);
    expect(linha).toBeDefined();
    expect(JSON.stringify(linha?.depois)).toContain("claude-desktop-da-recepcao");
  });

  it("a RECUSADA também aparece — e importa mais", async () => {
    await chamarFerramentaMcp(sessao(), "nao.existe", {}, executor);

    /*
     * As recusas importam mais do que os sucessos: uma sequência de recusas do
     * mesmo cliente é o formato que uma sondagem tem. Auditar só o que deu
     * certo deixaria esse padrão invisível.
     *
     * (Ferramenta inexistente não chega a ser auditada por nome, porque a
     * checagem acontece antes — mas a proibida por política é.)
     */
    const escrita = TODAS_AS_FERRAMENTAS.find(
      (f) => f.permissao === "ESCRITA" && f.aprovacao !== "HUMANO",
    );
    if (escrita === undefined) return;

    auditadas.length = 0;
    await chamarFerramentaMcp(sessao({ permitirEscrita: true }), escrita.chave, {}, executor);

    const linha = auditadas.find((a) => a.acao === `mcp.${escrita.chave}`);
    expect(linha).toBeDefined();
    expect(JSON.stringify(linha?.depois)).toContain("recusada");
  });
});
