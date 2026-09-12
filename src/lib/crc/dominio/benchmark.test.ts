/**
 * Benchmarking — as regras puras.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o do VOLUME MÍNIMO.
 *
 *  Um dentista com três consultas e 100% de comparecimento não é o melhor da
 *  clínica — é um dentista com três consultas. Sem o piso, o topo do ranking é
 *  sempre quem trabalhou menos, e na primeira vez que alguém nota isso o
 *  painel inteiro perde a credibilidade.
 *
 *  INJEÇÃO DE DEFEITO:
 *    ranquear sem piso de volume   → "três consultas não lideram" quebra;
 *    comparar contra a média       → "a régua é a mediana" quebra;
 *    dividir por zero sem guarda   → "de zero para cinco" quebra.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import { compararPeriodos, ranquear, VOLUME_MINIMO } from "./benchmark";

/* -------------------------------------------------------------------------- */

describe("o ranking", () => {
  it("três consultas não lideram uma clínica", () => {
    /*
     * ============================================================================
     *  O caso que o piso existe para impedir. O "novato" tem 100% e 3 consultas;
     *  a "veterana" tem 85% e 400. Sem piso, o novato é o primeiro colocado e o
     *  painel ensina a coisa errada.
     * ============================================================================
     */
    const r = ranquear([
      { chave: "novato", rotulo: "Dr. Novato", valor: 100, volume: 3 },
      { chave: "veterana", rotulo: "Dra. Veterana", valor: 85, volume: 400 },
      { chave: "medio", rotulo: "Dr. Médio", valor: 80, volume: 120 },
    ]);

    expect(r.linhas[0]?.chave).toBe("veterana");
    expect(r.linhas[0]?.posicao).toBe(1);

    const novato = r.linhas.find((l) => l.chave === "novato");
    expect(novato?.amostraPequena).toBe(true);
    expect(novato?.posicao).toBeNull();
  });

  it("quem não tem volume ainda APARECE — só não é ranqueado", () => {
    /*
     * Esconder seria pior: o dentista sumiria do painel e ninguém saberia que
     * ele existe. Aparecer sem posição diz a verdade — "ainda não dá para
     * comparar" — em vez de omitir.
     */
    const r = ranquear([{ chave: "novo", rotulo: "Novo", valor: 100, volume: 1 }]);

    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]?.amostraPequena).toBe(true);
  });

  it("a régua é a MEDIANA, e um outlier não desloca todo mundo", () => {
    /*
     * Quatro em torno de 80 e um de 200. Contra a média (104), os quatro
     * ficariam "abaixo do padrão" — sendo que quatro de cinco É o padrão.
     */
    const r = ranquear([
      { chave: "a", rotulo: "A", valor: 78, volume: 100 },
      { chave: "b", rotulo: "B", valor: 80, volume: 100 },
      { chave: "c", rotulo: "C", valor: 82, volume: 100 },
      { chave: "d", rotulo: "D", valor: 80, volume: 100 },
      { chave: "outlier", rotulo: "Outlier", valor: 200, volume: 100 },
    ]);

    expect(r.mediana).toBe(80);

    const b = r.linhas.find((l) => l.chave === "b");
    expect(b?.contraMediana).toBe(0);
  });

  it("menor é melhor inverte a ordem — faltas não são troféu", () => {
    const r = ranquear(
      [
        { chave: "poucas", rotulo: "Poucas faltas", valor: 5, volume: 100 },
        { chave: "muitas", rotulo: "Muitas faltas", valor: 30, volume: 100 },
      ],
      false,
    );

    expect(r.linhas[0]?.chave).toBe("poucas");
  });

  it("um comparável só não é comparação, e a tela precisa saber", () => {
    const r = ranquear([
      { chave: "unica", rotulo: "Única", valor: 90, volume: 100 },
      { chave: "pequena", rotulo: "Pequena", valor: 99, volume: 2 },
    ]);

    expect(r.comparaveis).toBe(1);
    expect(r.aviso).toContain("Um ranking de um elemento");
  });

  it("ninguém com volume devolve aviso, e não um ranking vazio", () => {
    const r = ranquear([{ chave: "a", rotulo: "A", valor: 100, volume: 1 }]);

    expect(r.comparaveis).toBe(0);
    expect(r.aviso).toContain(String(VOLUME_MINIMO));
  });
});

/* -------------------------------------------------------------------------- */

describe("período contra período", () => {
  it("de zero para cinco NÃO é aumento infinito", () => {
    /*
     * ============================================================================
     *  Sair de 0 para 5 é "começou", e não "+∞%". Um `Infinity` vazando para o
     *  React aparece como "Infinity%" na cara do usuário.
     * ============================================================================
     */
    const v = compararPeriodos("Leads", 5, 0);

    expect(v.variacaoPct).toBeNull();
    expect(Number.isFinite(v.atual)).toBe(true);
    expect(v.frase).toContain("Começou");
    expect(v.melhorou).toBe(true);
  });

  it("zero nos dois períodos não é melhora", () => {
    const v = compararPeriodos("Leads", 0, 0);

    expect(v.melhorou).toBe(false);
    expect(v.frase).toContain("Sem registro");
  });

  it("cair é melhorar quando menor é melhor", () => {
    const faltas = compararPeriodos("Faltas", 5, 20, false);

    expect(faltas.melhorou).toBe(true);
    expect(faltas.variacaoPct).toBe(-75);
  });

  it("cair é piorar quando maior é melhor", () => {
    const receita = compararPeriodos("Receita", 5, 20, true);
    expect(receita.melhorou).toBe(false);
  });
});
