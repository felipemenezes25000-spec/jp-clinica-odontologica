/**
 * O formato em que a escolha do aviso de cookies chega ao Google.
 *
 * Este arquivo existe por causa de um defeito que passou por lint, typecheck,
 * unitários e E2E sem acender nada: o "Aceitar" ia para o `dataLayer` como
 * Array. O Google ignora esse formato em silêncio e seguia tratando a visita
 * como recusada. Nenhum teste olhava o FORMATO do comando, só a presença dele.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { definirConsentimento } from "./consentimento";

const ehArguments = (m: unknown): m is IArguments =>
  Object.prototype.toString.call(m) === "[object Arguments]";

function sinais(v: "granted" | "denied") {
  return { analytics_storage: v, ad_storage: v, ad_user_data: v, ad_personalization: v };
}

describe("consentimento → Google", () => {
  let dataLayer: unknown[];

  beforeEach(() => {
    dataLayer = [];
    vi.stubGlobal("window", { dataLayer });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("o aceite sai como `arguments`, o único formato que o Google lê como comando", () => {
    definirConsentimento("aceito");

    const comandos = dataLayer.filter(ehArguments);
    expect(comandos).toHaveLength(1);
    expect(Array.from(comandos[0] as IArguments)).toEqual(["consent", "update", sinais("granted")]);
    expect(dataLayer.some((m) => Array.isArray(m))).toBe(false);
  });

  it("a recusa também, com os quatro sinais negados", () => {
    definirConsentimento("recusado");

    const comandos = dataLayer.filter(ehArguments);
    expect(comandos).toHaveLength(1);
    expect(Array.from(comandos[0] as IArguments)).toEqual(["consent", "update", sinais("denied")]);
  });

  it("o comando vem antes do evento `jp_consentimento`, que aciona tag no GTM", () => {
    definirConsentimento("aceito");

    const comando = dataLayer.findIndex(ehArguments);
    const evento = dataLayer.findIndex(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>)["event"] === "jp_consentimento",
    );
    expect(comando).toBeGreaterThanOrEqual(0);
    expect(evento).toBeGreaterThan(comando);
  });
});
