import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verificarSignedRequestMeta } from "./data-deletion";

const SEGREDO = "segredo-meta-comprido-para-testes-123456";

function assinar(payload: Record<string, unknown>, segredo = SEGREDO): string {
  const corpo = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const assinatura = createHmac("sha256", segredo).update(corpo).digest("base64url");
  return `${assinatura}.${corpo}`;
}

describe("signed_request da Meta", () => {
  it("aceita HMAC-SHA256 válido e devolve somente o user_id depois da assinatura", () => {
    const r = verificarSignedRequestMeta(
      assinar({ algorithm: "HMAC-SHA256", user_id: "123456789", issued_at: 1_789_000_000 }),
      SEGREDO,
    );

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.userId).toBe("123456789");
  });

  it("recusa quando UM byte do payload muda depois de assinado", () => {
    const original = assinar({ algorithm: "HMAC-SHA256", user_id: "123" });
    const [assinatura] = original.split(".");
    const adulterado = Buffer.from(
      JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "124" }),
      "utf8",
    ).toString("base64url");

    expect(verificarSignedRequestMeta(`${assinatura}.${adulterado}`, SEGREDO)).toEqual({
      ok: false,
      motivo: "assinatura",
    });
  });

  it("recusa assinatura criada com outro App Secret", () => {
    const pedido = assinar({ algorithm: "HMAC-SHA256", user_id: "123" }, "outro-segredo");
    expect(verificarSignedRequestMeta(pedido, SEGREDO)).toEqual({
      ok: false,
      motivo: "assinatura",
    });
  });

  it("recusa algoritmo diferente mesmo com assinatura válida", () => {
    const pedido = assinar({ algorithm: "HMAC-SHA1", user_id: "123" });
    expect(verificarSignedRequestMeta(pedido, SEGREDO)).toEqual({
      ok: false,
      motivo: "algoritmo",
    });
  });

  it("recusa payload assinado que não traz user_id", () => {
    const pedido = assinar({ algorithm: "HMAC-SHA256" });
    expect(verificarSignedRequestMeta(pedido, SEGREDO)).toEqual({
      ok: false,
      motivo: "sem_usuario",
    });
  });

  it("recusa formato inválido e segredo ausente", () => {
    expect(verificarSignedRequestMeta("nao-e-signed-request", SEGREDO)).toEqual({
      ok: false,
      motivo: "formato",
    });
    expect(verificarSignedRequestMeta(assinar({ user_id: "123" }), "")).toEqual({
      ok: false,
      motivo: "sem_segredo",
    });
  });
});
