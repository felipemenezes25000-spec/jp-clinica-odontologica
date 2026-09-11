/**
 * Testes do orçamento puro.
 *
 * A COISA QUE ESTE ARQUIVO EXISTE PARA PROVAR não é "recusa quando estoura" —
 * isso é uma comparação. É que a conta é feita em INTEIROS: um teto de R$ 6,80
 * comparado contra 200 mensagens de R$ 0,034 não pode recusar a ducentésima por
 * causa do `6.800000000000001` que o ponto flutuante produz.
 *
 * É o mesmo defeito que já apareceu uma vez neste projeto, em
 * `dominio/custo.ts`, e ele não aparece em teste que usa números redondos.
 */
import { describe, expect, it } from "vitest";

import {
  avaliarOrcamento,
  ehFinalidade,
  emMicro,
  emReais,
  FINALIDADES,
  formatar,
  LIMIAR_ALERTA,
} from "./orcamento";

const semTeto = { diaMicro: null, mesMicro: null };

describe("dinheiro em inteiro", () => {
  it("200 chamadas de R$ 0,034 dão exatamente R$ 6,80", () => {
    // Em ponto flutuante, `200 * 0.034` é 6.800000000000001 — e um teto de
    // R$ 6,80 recusaria a última chamada por um milionésimo de real.
    const uma = emMicro(0.034);
    const total = uma * 200;

    expect(total).toBe(6_800_000);
    const r = avaliarOrcamento(
      { diaMicro: 6_800_000, mesMicro: null },
      { diaMicro: total, mesMicro: total },
    );
    expect(r.pode).toBe(true);
  });

  it("o centavo seguinte estoura", () => {
    const r = avaliarOrcamento(
      { diaMicro: 6_800_000, mesMicro: null },
      { diaMicro: 6_800_000, mesMicro: 6_800_000 },
      emMicro(0.01),
    );
    expect(r.pode).toBe(false);
  });

  it("ida e volta entre reais e micro não perde centavo", () => {
    for (const reais of [0.034, 0.3125, 1.99, 12.5, 999.99]) {
      expect(emReais(emMicro(reais))).toBeCloseTo(reais, 6);
    }
  });
});

describe("os tetos", () => {
  it("sem teto configurado, tudo passa", () => {
    const r = avaliarOrcamento(semTeto, { diaMicro: 99_000_000, mesMicro: 999_000_000 });
    expect(r).toEqual({ pode: true, alerta: false });
  });

  it("teto ZERO bloqueia — é um jeito legítimo de desligar", () => {
    const r = avaliarOrcamento({ diaMicro: 0, mesMicro: null }, { diaMicro: 0, mesMicro: 0 }, 1);
    expect(r.pode).toBe(false);
  });

  it("a estimativa da PRÓXIMA chamada conta, e é o ponto do ADR-12", () => {
    // Gasto atual cabe; com a chamada que está por vir, não cabe. Verificar
    // depois só serviria para descobrir o prejuízo.
    const tetos = { diaMicro: emMicro(10), mesMicro: null };
    const gasto = { diaMicro: emMicro(9.9), mesMicro: emMicro(9.9) };

    expect(avaliarOrcamento(tetos, gasto).pode).toBe(true);
    expect(avaliarOrcamento(tetos, gasto, emMicro(0.5)).pode).toBe(false);
  });

  it("o teto do MÊS é reportado antes do teto do dia", () => {
    // Um dia caro no fim de um mês estourado tem que reportar o mês: é a notícia
    // que importa, e a que muda o que a pessoa vai fazer.
    const r = avaliarOrcamento(
      { diaMicro: emMicro(10), mesMicro: emMicro(100) },
      { diaMicro: emMicro(50), mesMicro: emMicro(200) },
    );
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.codigo).toBe("teto_do_mes");
  });

  it("a mensagem de recusa traz o valor do teto, não só o fato", () => {
    const r = avaliarOrcamento(
      { diaMicro: emMicro(7.5), mesMicro: null },
      { diaMicro: emMicro(8), mesMicro: 0 },
    );
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.motivo).toContain("7,50");
  });
});

describe("o alerta", () => {
  it("avisa a partir de 80% do teto, antes de a máquina parar", () => {
    const r = avaliarOrcamento(
      { diaMicro: emMicro(10), mesMicro: null },
      { diaMicro: emMicro(10 * LIMIAR_ALERTA), mesMicro: 0 },
    );
    // `toMatchObject` e não o `if` estreitando: um `if` que não entra deixaria
    // este teste passando sem afirmar nada — que é o pior teste possível.
    expect(r).toMatchObject({ pode: true, alerta: true, periodo: "dia" });
    if (r.pode && r.alerta) expect(r.usado).toBeCloseTo(LIMIAR_ALERTA, 5);
  });

  it("abaixo do limiar não alerta", () => {
    const r = avaliarOrcamento(
      { diaMicro: emMicro(10), mesMicro: null },
      { diaMicro: emMicro(7.9), mesMicro: 0 },
    );
    expect(r).toEqual({ pode: true, alerta: false });
  });

  it("sem teto não existe alerta — não há de quanto", () => {
    const r = avaliarOrcamento(semTeto, { diaMicro: emMicro(1000), mesMicro: emMicro(9000) });
    expect(r).toEqual({ pode: true, alerta: false });
  });
});

describe("formato e finalidades", () => {
  it("mostra reais com duas casas", () => {
    expect(formatar(emMicro(1234.5))).toContain("1.234,50");
  });

  it("a lista de finalidades é fechada", () => {
    expect(ehFinalidade("conversa")).toBe(true);
    expect(ehFinalidade("qualquer_outra")).toBe(false);
    // Finalidade criada por string solta viraria rota que ninguém sabe se
    // existe, com fallback silencioso para o modelo caro da conversa.
    expect(FINALIDADES).toHaveLength(4);
  });
});
