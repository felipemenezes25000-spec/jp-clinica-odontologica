/**
 * A fila de cliques anteriores à hidratação (SCRIPT_CLIQUES_ANTES).
 *
 * O script vai inline no `<head>`; aqui ele roda contra um `document` mínimo
 * que só guarda ouvintes. O que importa provar: anota o link clicado, ignora
 * clique fora de link e, ao ser parado, devolve a fila UMA vez e deixa de ouvir.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { NOME_FILA_DE_CLIQUES, SCRIPT_CLIQUES_ANTES } from "./scripts";

type Ouvinte = (e: { target: unknown }) => void;

function ambiente() {
  const ouvintes = new Set<Ouvinte>();
  const documento = {
    addEventListener: (_tipo: string, f: Ouvinte) => ouvintes.add(f),
    removeEventListener: (_tipo: string, f: Ouvinte) => ouvintes.delete(f),
  };
  const janela: Record<string, unknown> = {};
  vi.stubGlobal("document", documento);
  vi.stubGlobal("window", janela);
  // O script é texto: roda como rodaria no <head>.
  new Function(SCRIPT_CLIQUES_ANTES)();
  const clicar = (alvo: unknown) => {
    for (const f of ouvintes) f({ target: alvo });
  };
  const parar = janela[NOME_FILA_DE_CLIQUES] as () => unknown[];
  return { ouvintes, clicar, parar };
}

/** Um "elemento" cujo `closest` acha (ou não) um link. */
const dentroDe = (link: object | null) => ({ closest: () => link });

describe("SCRIPT_CLIQUES_ANTES", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("anota o link clicado antes de o React montar", () => {
    const { clicar, parar } = ambiente();
    const whatsapp = { href: "https://wa.me/5511976165117" };
    clicar(dentroDe(whatsapp));
    expect(parar()).toEqual([whatsapp]);
  });

  it("ignora clique fora de link", () => {
    const { clicar, parar } = ambiente();
    clicar(dentroDe(null));
    clicar({});
    expect(parar()).toEqual([]);
  });

  it("parar desliga a escuta e não devolve a mesma fila duas vezes", () => {
    const { ouvintes, clicar, parar } = ambiente();
    clicar(dentroDe({ href: "tel:+551139759902" }));
    expect(parar()).toHaveLength(1);
    expect(ouvintes.size).toBe(0);
    clicar(dentroDe({ href: "https://wa.me/1" }));
    expect(parar()).toEqual([]);
  });
});
