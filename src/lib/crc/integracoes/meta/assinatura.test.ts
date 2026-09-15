/**
 * A assinatura e o handshake — §11, §52.
 *
 * ============================================================================
 *  SEM ISTO, QUALQUER PESSOA QUE DESCUBRA A URL É A META.
 *
 *  E o efeito não é abstrato: um POST forjado dizendo "a paciente Ana escreveu:
 *  cancele minha consulta de amanhã" faria o CRC criar a mensagem no histórico
 *  dela, classificar a intenção, e — com autonomia em 4 — RESPONDER,
 *  cancelando.
 * ============================================================================
 */
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CABECALHO_ASSINATURA, responderDesafio, verificarAssinaturaMeta } from "./assinatura";

const SEGREDO = "app-secret-de-teste";
const CORPO = JSON.stringify({ object: "instagram", entry: [{ id: "1" }] });

function assinar(corpo: string, segredo = SEGREDO): string {
  return "sha256=" + createHmac("sha256", segredo).update(corpo, "utf8").digest("hex");
}

function cabecalhos(valor?: string): Headers {
  const h = new Headers();
  if (valor !== undefined) h.set(CABECALHO_ASSINATURA, valor);
  return h;
}

describe("a assinatura confere os BYTES CRUS", () => {
  it("aceita a assinatura correta", () => {
    const r = verificarAssinaturaMeta(
      { corpoCru: CORPO, cabecalhos: cabecalhos(assinar(CORPO)) },
      SEGREDO,
    );
    expect(r.valida).toBe(true);
  });

  it("recusa quando o corpo mudou UM byte", () => {
    const outro = CORPO.replace('"1"', '"2"');
    const r = verificarAssinaturaMeta(
      { corpoCru: outro, cabecalhos: cabecalhos(assinar(CORPO)) },
      SEGREDO,
    );
    expect(r.valida).toBe(false);
    if (!r.valida) expect(r.motivo).toBe("nao_confere");
  });

  it("recusa a assinatura de OUTRO app", () => {
    /*
     * É O CENÁRIO DO SEGUNDO CLIENTE. Com dois Meta Apps, o segredo de A não
     * valida a assinatura de B — e se A for o único cadastrado, qualquer corpo
     * assinado por A passaria dizendo ser de quem quiser.
     */
    const r = verificarAssinaturaMeta(
      { corpoCru: CORPO, cabecalhos: cabecalhos(assinar(CORPO, "segredo-do-outro-app")) },
      SEGREDO,
    );
    expect(r.valida).toBe(false);
  });

  it("um `JSON.parse` + `stringify` no meio QUEBRARIA a conferência", () => {
    /*
     * ==========================================================================
     *  ESTE TESTE EXISTE PARA DOCUMENTAR O ERRO, e não para permitir que ele
     *  aconteça.
     *
     *  A Meta assina os bytes EXATOS. Reserializar muda ordem de chave,
     *  espaçamento e escape de unicode — e a conferência falharia em 100% dos
     *  webhooks legítimos.
     *
     *  O sintoma é traiçoeiro: parece "a Meta não está mandando nada".
     * ==========================================================================
     */
    const reserializado = JSON.stringify(JSON.parse(CORPO.replace('{"object"', '{ "object"')));
    const comEspaco = CORPO.replace('{"object"', '{ "object"');
    expect(comEspaco).not.toBe(reserializado);

    const r = verificarAssinaturaMeta(
      { corpoCru: reserializado, cabecalhos: cabecalhos(assinar(comEspaco)) },
      SEGREDO,
    );
    expect(r.valida).toBe(false);
  });
});

describe("falha fechado em todos os caminhos", () => {
  it("sem cabeçalho de assinatura", () => {
    const r = verificarAssinaturaMeta({ corpoCru: CORPO, cabecalhos: cabecalhos() }, SEGREDO);
    expect(r.valida).toBe(false);
    if (!r.valida) expect(r.motivo).toBe("sem_cabecalho");
  });

  it("cabeçalho em formato desconhecido", () => {
    const r = verificarAssinaturaMeta(
      { corpoCru: CORPO, cabecalhos: cabecalhos("md5=deadbeef") },
      SEGREDO,
    );
    expect(r.valida).toBe(false);
    if (!r.valida) expect(r.motivo).toBe("formato_invalido");
  });

  it("SEM SEGREDO recusa — e não aceita", () => {
    /*
     * A alternativa — aceitar quando não há segredo para conferir — é a porta
     * aberta com uma placa de "temporário".
     */
    const r = verificarAssinaturaMeta(
      { corpoCru: CORPO, cabecalhos: cabecalhos(assinar(CORPO)) },
      "",
    );
    expect(r.valida).toBe(false);
    if (!r.valida) expect(r.motivo).toBe("sem_segredo");
  });

  it("SHA-1 não é aceito, mesmo correto", () => {
    /*
     * A Meta ainda envia `x-hub-signature` (SHA-1) por compatibilidade. Aceitar
     * os dois faz a verificação valer o do MAIS FRACO: quem forja escolhe qual
     * mandar, e SHA-1 tem colisões práticas.
     */
    const h = new Headers();
    h.set("x-hub-signature", "sha1=" + createHmac("sha1", SEGREDO).update(CORPO).digest("hex"));
    const r = verificarAssinaturaMeta({ corpoCru: CORPO, cabecalhos: h }, SEGREDO);
    expect(r.valida).toBe(false);
  });

  it("assinatura de tamanho diferente não lança", () => {
    // `timingSafeEqual` LANÇA com buffers de tamanhos diferentes. O tamanho é
    // conferido antes, e ele é público (71 caracteres, sempre).
    const r = verificarAssinaturaMeta(
      { corpoCru: CORPO, cabecalhos: cabecalhos("sha256=abc") },
      SEGREDO,
    );
    expect(r.valida).toBe(false);
  });
});

describe("o handshake de verificação", () => {
  it("devolve o desafio como TEXTO PURO", async () => {
    const r = await responderDesafio({
      modo: "subscribe",
      token: "token-certo",
      desafio: "1158201444",
      esperado: "token-certo",
    });
    expect(r.ok).toBe(true);
    // SEM ASPAS E SEM JSON: a Meta compara byte a byte, e `JSON.stringify`
    // falharia com "The URL couldn't be validated".
    if (r.ok) expect(r.resposta).toBe("1158201444");
  });

  it("recusa token errado com 403", async () => {
    const r = await responderDesafio({
      modo: "subscribe",
      token: "token-errado",
      esperado: "token-certo",
      desafio: "x",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });

  it("recusa modo diferente de `subscribe`", async () => {
    const r = await responderDesafio({
      modo: "unsubscribe",
      token: "token-certo",
      esperado: "token-certo",
      desafio: "x",
    });
    expect(r.ok).toBe(false);
  });

  it("503 quando falta configuração — e NÃO 403", async () => {
    /*
     * A Meta REENVIA em 503, e a falha desaparece assim que alguém define o
     * token. Um 403 faria ela desistir, e quem estivesse configurando veria
     * "URL inválida" sem saber por quê.
     */
    const r = await responderDesafio({
      modo: "subscribe",
      token: "x",
      esperado: "  ",
      desafio: "y",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });
});
