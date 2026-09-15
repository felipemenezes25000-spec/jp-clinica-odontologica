/**
 * Validação do `signed_request` usado pela Meta no Data Deletion Callback.
 *
 * O formato é `<assinatura-base64url>.<payload-base64url>`. A assinatura é
 * HMAC-SHA256 do SEGUNDO pedaço exatamente como ele chegou, usando o App Secret.
 * O payload só é interpretado depois da comparação em tempo constante.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type ResultadoSignedRequest =
  | { ok: true; userId: string; payload: Readonly<Record<string, unknown>> }
  | {
      ok: false;
      motivo: "sem_segredo" | "formato" | "assinatura" | "payload" | "algoritmo" | "sem_usuario";
    };

function objeto(valor: unknown): Readonly<Record<string, unknown>> | null {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor)
    ? (valor as Readonly<Record<string, unknown>>)
    : null;
}

function decodificarBase64Url(valor: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(valor)) return null;
  try {
    return Buffer.from(valor, "base64url");
  } catch {
    return null;
  }
}

/**
 * Verifica sem vazar, pelo tempo de comparação, quanto da assinatura confere.
 */
export function verificarSignedRequestMeta(
  signedRequest: string,
  appSecret: string,
): ResultadoSignedRequest {
  const segredo = appSecret.trim();
  if (segredo.length === 0) return { ok: false, motivo: "sem_segredo" };

  const partes = signedRequest.trim().split(".");
  if (partes.length !== 2) return { ok: false, motivo: "formato" };

  const assinaturaCodificada = partes[0] ?? "";
  const payloadCodificado = partes[1] ?? "";
  const assinaturaRecebida = decodificarBase64Url(assinaturaCodificada);
  const payloadBytes = decodificarBase64Url(payloadCodificado);
  if (assinaturaRecebida === null || payloadBytes === null) {
    return { ok: false, motivo: "formato" };
  }

  const assinaturaEsperada = createHmac("sha256", segredo).update(payloadCodificado).digest();
  if (
    assinaturaRecebida.length !== assinaturaEsperada.length ||
    !timingSafeEqual(assinaturaRecebida, assinaturaEsperada)
  ) {
    return { ok: false, motivo: "assinatura" };
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    return { ok: false, motivo: "payload" };
  }

  const payload = objeto(bruto);
  if (payload === null) return { ok: false, motivo: "payload" };

  const algoritmo = payload["algorithm"];
  if (
    algoritmo !== undefined &&
    (typeof algoritmo !== "string" || algoritmo.toUpperCase() !== "HMAC-SHA256")
  ) {
    return { ok: false, motivo: "algoritmo" };
  }

  const userId = payload["user_id"];
  const normalizado =
    typeof userId === "string" || typeof userId === "number" ? String(userId).trim() : "";
  if (normalizado.length === 0) return { ok: false, motivo: "sem_usuario" };

  return { ok: true, userId: normalizado, payload };
}
