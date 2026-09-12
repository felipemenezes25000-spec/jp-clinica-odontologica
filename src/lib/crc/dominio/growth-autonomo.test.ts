/**
 * Growth autônomo — as duas pontas que faltavam no §35.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o da ORDEM DAS DECISÕES: o guardrail
 *  vem ANTES da amostra.
 *
 *  Esperar 100 envios para parar uma variante que está fazendo gente sair da
 *  lista já é tarde demais. Perder o canal é pior do que perder a campanha —
 *  a campanha se refaz, o opt-out não.
 *
 *  INJEÇÃO DE DEFEITO:
 *    checar amostra antes do guardrail → "para mesmo com pouca amostra" quebra;
 *    promover sem piso de ganho        → "meio ponto é acaso" quebra;
 *    público "todos" sem alerta        → "receita genérica avisa" quebra.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import { AMOSTRA_PARA_DECIDIR, otimizar, publicoParaMeta } from "./growth-autonomo";

/* -------------------------------------------------------------------------- */

describe("goal → audience", () => {
  it("cada meta puxa o público que pode movê-la", () => {
    expect(publicoParaMeta("REATIVAR_PACIENTES").criterio).toBe("INATIVOS");
    expect(publicoParaMeta("CONVERSAO_ORCAMENTO").criterio).toBe("ORCAMENTO_ABERTO");
    expect(publicoParaMeta("OCUPACAO_AGENDA").criterio).toBe("SEM_RETORNO_MARCADO");
    expect(publicoParaMeta("AGENDAMENTOS").criterio).toBe("SEM_RETORNO_MARCADO");
    expect(publicoParaMeta("REDUZIR_FALTAS").criterio).toBe("FALTARAM_RECENTEMENTE");
  });

  it("meta de receita cai em TODOS — e o texto avisa que isso é suspeito", () => {
    /*
     * ============================================================================
     *  "Recuperar receita" não diz DE QUEM. O dinheiro pode estar no orçamento
     *  parado, no paciente sumido ou na agenda vazia.
     *
     *  Uma campanha para todos é quase sempre a resposta errada, e o texto
     *  precisa dizer isso para quem for aprovar — em vez de entregar a base
     *  inteira com cara de sugestão do sistema.
     * ============================================================================
     */
    const p = publicoParaMeta("RECEITA_RECUPERADA");

    expect(p.criterio).toBe("TODOS");
    expect(p.rotulo).toContain("reveja");
    expect(p.porque).toContain("mais específica");
    // E o teto sugerido é o MENOR de todos, e não o maior.
    expect(p.tetoSugerido).toBeLessThan(publicoParaMeta("REATIVAR_PACIENTES").tetoSugerido);
  });

  it("todo público explica por que é ele, numa frase", () => {
    for (const tipo of [
      "OCUPACAO_AGENDA",
      "RECEITA_RECUPERADA",
      "AGENDAMENTOS",
      "CONVERSAO_ORCAMENTO",
      "REDUZIR_FALTAS",
      "REATIVAR_PACIENTES",
    ] as const) {
      const p = publicoParaMeta(tipo);
      expect(p.porque.length).toBeGreaterThan(40);
      expect(p.tetoSugerido).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("outcome → optimization", () => {
  const controle = {
    nome: "controle",
    controle: true,
    enviados: 100,
    responderam: 20,
    converteram: 10,
    optOuts: 0,
  };

  it("PARA mesmo com pouca amostra, se estiver queimando o canal", () => {
    /*
     * ============================================================================
     *  ESTE É O TESTE QUE JUSTIFICA A ORDEM DAS DECISÕES.
     *
     *  Trinta envios é pouco para decidir qual mensagem é melhor. NÃO é pouco
     *  para perceber que uma delas fez 20% das pessoas saírem da lista.
     *
     *  Se a amostra fosse checada primeiro, a resposta seria "esperar" — e o
     *  sistema continuaria disparando a variante que está queimando o canal
     *  até chegar a 100.
     * ============================================================================
     */
    const r = otimizar(
      [
        { ...controle, enviados: 10 },
        {
          nome: "agressiva",
          controle: false,
          enviados: 30,
          responderam: 2,
          converteram: 1,
          optOuts: 6,
        },
      ],
      { optOutMaxPct: 5 },
    );

    expect(r.decisao).toBe("PARAR_TUDO");
    expect(r.variante).toBe("agressiva");
    expect(r.motivo).toContain("Perder o canal");
  });

  it("com pouca amostra e sem dano, espera", () => {
    const r = otimizar(
      [
        { ...controle, enviados: 20, converteram: 2 },
        {
          nome: "b",
          controle: false,
          enviados: 20,
          responderam: 8,
          converteram: 6,
          optOuts: 0,
        },
      ],
      { optOutMaxPct: 5 },
    );

    expect(r.decisao).toBe("ESPERAR");
    expect(r.motivo).toContain(String(AMOSTRA_PARA_DECIDIR));
  });

  it("meio ponto de ganho é acaso, e não vitória", () => {
    /*
     * Promover por uma diferença desse tamanho ensina o sistema a perseguir
     * sombras — e cada promoção dessas é uma mensagem que passa a sair para
     * todo mundo sem ter provado nada.
     */
    const r = otimizar(
      [
        controle,
        {
          nome: "quase igual",
          controle: false,
          enviados: 100,
          responderam: 21,
          converteram: 11,
          optOuts: 0,
        },
      ],
      { optOutMaxPct: 5 },
    );

    expect(r.decisao).toBe("MANTER_CONTROLE");
    expect(r.motivo).toContain("indistinguível de acaso");
  });

  it("ganho claro promove, e diz os dois números", () => {
    const r = otimizar(
      [
        controle,
        {
          nome: "vencedora",
          controle: false,
          enviados: 100,
          responderam: 40,
          converteram: 25,
          optOuts: 0,
        },
      ],
      { optOutMaxPct: 5 },
    );

    expect(r.decisao).toBe("PROMOVER");
    expect(r.variante).toBe("vencedora");
    expect(r.motivo).toContain("25.0%");
    expect(r.motivo).toContain("10.0%");
  });

  it("sem controle não há contra o que comparar", () => {
    const r = otimizar(
      [
        {
          nome: "a",
          controle: false,
          enviados: 100,
          responderam: 30,
          converteram: 20,
          optOuts: 0,
        },
      ],
      { optOutMaxPct: 5 },
    );

    expect(r.decisao).toBe("ESPERAR");
    expect(r.motivo).toContain("controle");
  });

  it("uma variante com 2 envios e 1 opt-out não para tudo", () => {
    // 50% de saída em 2 envios é uma pessoa. O piso de 20 envios existe para
    // o guardrail não disparar com barulho de fundo.
    const r = otimizar(
      [
        controle,
        {
          nome: "nova",
          controle: false,
          enviados: 2,
          responderam: 0,
          converteram: 0,
          optOuts: 1,
        },
      ],
      { optOutMaxPct: 5 },
    );

    expect(r.decisao).not.toBe("PARAR_TUDO");
  });
});
