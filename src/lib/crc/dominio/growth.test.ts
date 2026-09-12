/**
 * Growth.
 *
 * ============================================================================
 *  TRÊS TESTES CARREGAM ESTE ARQUIVO, um por regra:
 *
 *  §32  perguntar a TODOS e rotear — e não escolher a quem perguntar;
 *  §36  a variante que gera saída para SOZINHA, com amostra mínima;
 *  §37  nenhum aprendizado chega a APLICADO pelo cálculo.
 *
 *  INJEÇÃO DE DEFEITO:
 *    fazer `destinoDoFeedback` filtrar quem responde → "não manipula" quebra;
 *    tirar a amostra mínima do guardrail             → "3 envios" quebra;
 *    deixar `avaliarAprendizado` devolver APLICADO   → "nunca aplica" quebra;
 *    anunciar vencedora com 30 envios                → "sem amostra" quebra.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  AMOSTRA_PARA_CONCLUIR,
  avaliarAprendizado,
  calcularNps,
  conferirGuardrail,
  destinoDoFeedback,
  expirou,
  gerarCodigo,
  lerExperimento,
  podeAvancar,
  VALIDADE_DO_APRENDIZADO_DIAS,
  type NumerosDaVariante,
} from "./growth";

function variante(parcial: Partial<NumerosDaVariante> = {}): NumerosDaVariante {
  return {
    nome: "A",
    controle: false,
    enviados: 100,
    responderam: 30,
    converteram: 10,
    optOuts: 0,
    ...parcial,
  };
}

/* -------------------------------------------------------------------------- */

describe("reputação", () => {
  it("promotor é convidado, detrator vira recuperação, neutro só agradece", () => {
    /*
     * ============================================================================
     *  ISTO NÃO É MANIPULAR AVALIAÇÃO.
     *
     *  Manipular seria escolher A QUEM PERGUNTAR com base na nota esperada.
     *  Aqui pergunta-se a TODO MUNDO, e a resposta é roteada: quem gostou é
     *  convidado; quem não gostou é OUVIDO pela clínica em vez de escrever
     *  direto no Google.
     * ============================================================================
     */
    expect(destinoDoFeedback(10, null).destino).toBe("CONVIDAR");
    expect(destinoDoFeedback(9, null).destino).toBe("CONVIDAR");
    expect(destinoDoFeedback(8, null).destino).toBe("AGRADECER");
    expect(destinoDoFeedback(7, null).destino).toBe("AGRADECER");
    expect(destinoDoFeedback(6, null).destino).toBe("RECUPERAR");
    expect(destinoDoFeedback(0, null).destino).toBe("RECUPERAR");
  });

  it("comentário escrito eleva a urgência da recuperação", () => {
    /*
     * Quem se deu ao trabalho de escrever quer ser ouvido — e é quem mais
     * provavelmente vai escrever em outro lugar se ninguém responder.
     */
    const seco = destinoDoFeedback(6, null);
    const escrito = destinoDoFeedback(6, "esperei quarenta minutos e ninguém avisou nada");

    expect(seco.destino).toBe("RECUPERAR");
    expect(escrito.destino).toBe("RECUPERAR");
    if (seco.destino !== "RECUPERAR" || escrito.destino !== "RECUPERAR") return;

    expect(seco.urgencia).toBe("NORMAL");
    expect(escrito.urgencia).toBe("ALTA");
  });

  it("o NPS é promotores menos detratores, com neutros no denominador", () => {
    // 2 promotores, 1 neutro, 1 detrator em 4 → (2-1)/4 = 25.
    expect(calcularNps([10, 9, 8, 3])).toBe(25);
    // Todos promotores → 100.
    expect(calcularNps([9, 10, 10])).toBe(100);
    // Todos detratores → -100.
    expect(calcularNps([1, 2, 0])).toBe(-100);
  });

  it("sem nota nenhuma, o NPS é null — e não zero", () => {
    // Zero seria lido como "neutro"; a verdade é "ninguém respondeu".
    expect(calcularNps([])).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("indicação", () => {
  it("o código é ditável ao telefone", () => {
    /*
     * O alfabeto exclui 0/O, 1/I/L, 5/S e 2/Z. O código existe para funcionar
     * numa conversa na recepção, e um alfabeto completo produz códigos que
     * ninguém consegue ditar sem soletrar duas vezes.
     */
    const c = gerarCodigo("aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

    expect(c).toHaveLength(6);
    expect(c).not.toMatch(/[01ILOSZ2]/u);
  });

  it("o mesmo paciente gera sempre o mesmo código", () => {
    /*
     * Derivado do id, e não aleatório: um retry não cria o segundo código da
     * mesma pessoa, e regerar não invalida o que já foi divulgado.
     */
    const a = gerarCodigo("paciente-1");
    const b = gerarCodigo("paciente-1");
    const c = gerarCodigo("paciente-2");

    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("a cadeia não anda para trás", () => {
    /*
     * A sincronização reprocessa, e um evento antigo chegando fora de ordem
     * rebaixaria uma indicação que já converteu.
     */
    expect(podeAvancar("REGISTRADA", "AGENDOU")).toBe(true);
    expect(podeAvancar("COMPARECEU", "AGENDOU")).toBe(false);
    expect(podeAvancar("CONVERTEU", "REGISTRADA")).toBe(false);
  });

  it("dá para perder de quase qualquer ponto — menos depois de converter", () => {
    expect(podeAvancar("AGENDOU", "PERDIDA")).toBe(true);
    expect(podeAvancar("CONVERTEU", "PERDIDA")).toBe(false);
    expect(podeAvancar("PERDIDA", "AGENDOU")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("o guardrail do experimento", () => {
  it("PARA a variante que gera saída acima do limite", () => {
    /*
     * ============================================================================
     *  A FUNÇÃO MAIS IMPORTANTE DO MÓDULO.
     *
     *  Sem ela, um teste A/B numa base de pacientes é um jeito estruturado de
     *  queimar metade da lista: a variante ruim roda até alguém abrir o
     *  relatório na semana seguinte.
     * ============================================================================
     */
    const v = conferirGuardrail(
      [variante({ nome: "A", optOuts: 0 }), variante({ nome: "B", optOuts: 5 })],
      { optOutMaxPct: 2, amostraMinima: 50 },
    );

    expect(v.parar).toBe(true);
    if (!v.parar) return;
    expect(v.variante).toBe("B");
    expect(v.motivo).toContain("5.0%");
  });

  it("a AMOSTRA MÍNIMA impede o guardrail de disparar com três envios", () => {
    /*
     * Sem ela, o primeiro opt-out numa amostra de três pararia o experimento
     * com "33% de saídas" — um número sem significado nenhum.
     */
    const v = conferirGuardrail([variante({ enviados: 3, optOuts: 1 })], {
      optOutMaxPct: 2,
      amostraMinima: 50,
    });

    expect(v.parar).toBe(false);
  });

  it("dentro do limite não para", () => {
    const v = conferirGuardrail([variante({ enviados: 100, optOuts: 1 })], {
      optOutMaxPct: 2,
      amostraMinima: 50,
    });

    expect(v.parar).toBe(false);
  });
});

describe("a leitura do experimento", () => {
  it("NÃO anuncia vencedora sem amostra", () => {
    /*
     * Com 30 envios e 3 conversões contra 30 e 5, a diferença parece 66% melhor
     * e é ruído: bastaria uma pessoa mudar de ideia para inverter.
     */
    const r = lerExperimento([
      variante({ nome: "A", controle: true, enviados: 30, converteram: 3 }),
      variante({ nome: "B", enviados: 30, converteram: 5 }),
    ]);

    expect(r.vencedora).toBeNull();
    expect(r.porque).toContain("amostra");
  });

  it("com amostra e diferença clara, anuncia", () => {
    const r = lerExperimento([
      variante({ nome: "A", controle: true, enviados: AMOSTRA_PARA_CONCLUIR, converteram: 10 }),
      variante({ nome: "B", enviados: AMOSTRA_PARA_CONCLUIR, converteram: 25 }),
    ]);

    expect(r.vencedora).toBe("B");
  });

  it("empate dentro da margem NÃO tem vencedora", () => {
    /*
     * Dois pontos percentuais entre variantes de 100 envios é uma pessoa de
     * diferença — e trocar a operação por causa de uma pessoa é pior que não
     * testar.
     */
    const r = lerExperimento([
      variante({ nome: "A", controle: true, enviados: 200, converteram: 20 }),
      variante({ nome: "B", enviados: 200, converteram: 23 }),
    ]);

    expect(r.vencedora).toBeNull();
    expect(r.porque).toContain("ruído");
  });

  it("mede cada variante CONTRA O CONTROLE", () => {
    const r = lerExperimento([
      variante({ nome: "A", controle: true, enviados: 200, converteram: 20 }),
      variante({ nome: "B", enviados: 200, converteram: 40 }),
    ]);

    const b = r.variantes.find((v) => v.nome === "B");
    const a = r.variantes.find((v) => v.nome === "A");

    expect(b?.contraControle).toBe(10);
    // O controle não se compara consigo mesmo.
    expect(a?.contraControle).toBeNull();
  });

  it("variante sem envio não divide por zero", () => {
    const r = lerExperimento([variante({ nome: "A", controle: true, enviados: 0 })]);
    expect(r.variantes[0]?.taxaDeConversao).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("o aprendizado", () => {
  it("NUNCA chega a APLICADO pelo cálculo", () => {
    /*
     * ============================================================================
     *  O §37 é explícito: "não alterar política crítica silenciosamente". Um
     *  sistema que muda a própria política a partir de correlação faz besteira
     *  com confiança — e a besteira é invisível, porque ele também escolhe como
     *  se medir.
     *
     *  `VALIDADO` é o teto do cálculo. `APLICADO` é decisão de pessoa.
     * ============================================================================
     */
    const casos = [
      { amostra: 10, efeitoPct: 20, periodoDias: 30 },
      { amostra: 5000, efeitoPct: 40, periodoDias: 365 },
      { amostra: 100, efeitoPct: 10, periodoDias: 30 },
      { amostra: 1, efeitoPct: 1, periodoDias: 1 },
    ];

    for (const c of casos) {
      expect(avaliarAprendizado(c).status, JSON.stringify(c)).not.toBe("APLICADO");
    }
  });

  it("efeito pequeno é REJEITADO, mesmo com amostra enorme", () => {
    /*
     * Três pontos percentuais é real com amostra suficiente — e irrelevante
     * para uma clínica que precisa escolher onde gastar atenção. Um painel
     * cheio de aprendizados de 2% ensina a ignorar o painel.
     */
    const v = avaliarAprendizado({ amostra: 100000, efeitoPct: 3, periodoDias: 365 });
    expect(v.status).toBe("REJEITADO");
  });

  it("amostra grande em período CURTO continua candidato", () => {
    /*
     * 200 casos em três dias medem aquela semana, não um padrão. Se a semana
     * tinha feriado, o "aprendizado" é sobre o feriado.
     */
    const v = avaliarAprendizado({ amostra: 200, efeitoPct: 20, periodoDias: 3 });

    expect(v.status).toBe("CANDIDATO");
    expect(v.porque).toContain("curto");
  });

  it("amostra e período suficientes chegam a VALIDADO", () => {
    const v = avaliarAprendizado({ amostra: 300, efeitoPct: 18, periodoDias: 60 });

    expect(v.status).toBe("VALIDADO");
    expect(v.confianca).toBeGreaterThan(0.5);
    // Nunca 1: medição observacional de clínica não é experimento controlado.
    expect(v.confianca).toBeLessThanOrEqual(0.85);
  });

  it("efeito NEGATIVO grande também é aprendizado", () => {
    // Saber o que NÃO fazer vale tanto quanto saber o que fazer.
    const v = avaliarAprendizado({ amostra: 300, efeitoPct: -22, periodoDias: 60 });
    expect(v.status).toBe("VALIDADO");
  });

  it("aprendizado velho expira", () => {
    /*
     * Uma clínica muda: equipe nova, horário novo, público novo. Um aprendizado
     * de um ano atrás pode estar descrevendo uma operação que não existe mais —
     * e continuar guiando decisão.
     */
    const agora = new Date("2026-09-12T00:00:00.000Z");
    const velho = new Date(agora.getTime() - (VALIDADE_DO_APRENDIZADO_DIAS + 1) * 86_400_000);
    const novo = new Date(agora.getTime() - 10 * 86_400_000);

    expect(expirou(velho.toISOString(), agora)).toBe(true);
    expect(expirou(novo.toISOString(), agora)).toBe(false);
    // Nunca decidido não expira: ele ainda nem foi avaliado por ninguém.
    expect(expirou(null, agora)).toBe(false);
  });
});
