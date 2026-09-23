/**
 * Nome completo no formulário de candidatura.
 *
 * A regra divide o nome por espaços. Ela já foi escrita como `/s+/` (sem a
 * barra), que divide pela LETRA "s": "Nicole Vieira" virava uma parte só e a
 * candidata era barrada com "Informe seu nome completo.", enquanto "Vanessa"
 * sozinha passava, porque o "s" a quebrava em duas partes.
 */
import { describe, expect, it } from "vitest";

import { candidaturaVazia } from "./tipos";
import { validarTudo } from "./validar";

const contexto = { aceitandoEspontanea: true, temCurriculo: true };

function erroDoNome(nome: string): string | undefined {
  return validarTudo({ ...candidaturaVazia(), nome }, new Date(), contexto)["nome"];
}

describe("nome completo", () => {
  it("aceita nome e sobrenome sem a letra s", () => {
    expect(erroDoNome("Nicole Vieira")).toBeUndefined();
  });

  it("aceita espaços extras entre e em volta das palavras", () => {
    expect(erroDoNome("  Ana   Paula  Costa ")).toBeUndefined();
  });

  it("recusa uma palavra só, mesmo contendo s", () => {
    expect(erroDoNome("Vanessa")).toBe("Informe seu nome completo.");
  });

  it("recusa nome em branco", () => {
    expect(erroDoNome("   ")).toBe("Informe seu nome completo.");
  });
});
