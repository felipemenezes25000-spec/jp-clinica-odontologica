/**
 * Gestão.
 *
 * ============================================================================
 *  A REGRA DO §39 GOVERNA TUDO AQUI: número simples é CÁLCULO, o modelo só
 *  explica. Nada neste arquivo chama modelo, e é por isso que ele é testável.
 *
 *  OS TRÊS TESTES QUE CARREGAM O ARQUIVO:
 *
 *  1. a anomalia compara MÉDIA DIÁRIA, não total — senão "as faltas caíram 75%"
 *     toda semana, porque 7 dias têm menos que 28;
 *  2. o briefing só lista o que é maior que zero — "0 conversas esperando" é
 *     boa notícia, e boa notícia é a ausência de linha;
 *  3. a simulação devolve as PREMISSAS — um número sem elas é uma conta com
 *     quatro chutes dentro parecendo medição.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  acharAnomalias,
  lerCapacidade,
  montarBriefing,
  simularMaisHoras,
  VARIACAO_MINIMA_PCT,
  VOLUME_MINIMO,
  type Cenario,
  type NumerosDoDia,
  type Serie,
} from "./gestao";

function serie(parcial: Partial<Serie> = {}): Serie {
  return {
    chave: "faltas",
    rotulo: "Faltas",
    recente: 10,
    base: 40,
    diasRecente: 7,
    diasBase: 28,
    subirEhRuim: true,
    ...parcial,
  };
}

function numeros(parcial: Partial<NumerosDoDia> = {}): NumerosDoDia {
  return {
    horasVagas: 0,
    receitaEsperada: 0,
    emRisco: 0,
    conversasEsperando: 0,
    aceitosSemData: 0,
    pendenciasHumanas: 0,
    tarefasAbertas: 0,
    ...parcial,
  };
}

function cenario(parcial: Partial<Cenario> = {}): Cenario {
  return {
    ocupacaoAtual: 0.7,
    horasPorSemana: 40,
    valorPorHora: 250,
    taxaDeFalta: 0.1,
    ...parcial,
  };
}

/* -------------------------------------------------------------------------- */

describe("a anomalia", () => {
  it("compara MÉDIA DIÁRIA, e não total", () => {
    /*
     * ============================================================================
     *  Sete dias contra vinte e oito são volumes diferentes por construção.
     *  Comparar os totais diria que "as faltas caíram 75%" toda santa semana.
     *
     *  10 em 7 dias = 1,43/dia. 40 em 28 = 1,43/dia. É estabilidade, não queda.
     * ============================================================================
     */
    expect(acharAnomalias([serie()])).toHaveLength(0);
  });

  it("acha o que subiu de verdade", () => {
    // 20 em 7 dias = 2,86/dia contra 1,43/dia → +100%.
    const a = acharAnomalias([serie({ recente: 20 })]);

    expect(a).toHaveLength(1);
    expect(a[0]?.direcao).toBe("SUBIU");
    expect(a[0]?.gravidade).toBe("ALTA");
    expect(a[0]?.fato).toContain("100%");
  });

  it("variação pequena NÃO vira alerta", () => {
    /*
     * Numa clínica a semana varia sozinha: feriado, férias do dentista, chuva.
     * Um detector de 10% dispara toda semana, e um alerta que dispara toda
     * semana deixa de ser lido em duas.
     */
    const a = acharAnomalias([serie({ recente: 12 })]);
    expect(a).toHaveLength(0);
    expect(VARIACAO_MINIMA_PCT).toBeGreaterThanOrEqual(25);
  });

  it("volume baixo não gera alerta, por maior que seja a variação", () => {
    /*
     * De 2 para 3 é "50% de aumento" e é uma pessoa. Sem piso, o detector
     * passaria a vida anunciando aumentos de 100% em coisas que aconteceram
     * duas vezes.
     */
    const a = acharAnomalias([
      serie({ base: VOLUME_MINIMO - 1, recente: 20, diasBase: 28, diasRecente: 7 }),
    ]);
    expect(a).toHaveLength(0);
  });

  it("mudança BOA também é anomalia — em INFO", () => {
    /*
     * Um detector que só mostra o que piorou faz a clínica achar que nada dá
     * certo. E a mudança boa é acionável: se a conversão subiu 40%, vale
     * entender o que mudou para repetir.
     */
    const a = acharAnomalias([
      serie({ chave: "conversao", rotulo: "Conversão", recente: 30, subirEhRuim: false }),
    ]);

    expect(a[0]?.gravidade).toBe("INFO");
    expect(a[0]?.direcao).toBe("SUBIU");
  });

  it("o que piorou vem PRIMEIRO, mesmo com variação menor", () => {
    const a = acharAnomalias([
      serie({ chave: "boa", rotulo: "Conversão", recente: 60, subirEhRuim: false }),
      serie({ chave: "ruim", rotulo: "Faltas", recente: 25, subirEhRuim: true }),
    ]);

    expect(a[0]?.chave).toBe("ruim");
  });

  it("base zerada não divide por zero", () => {
    const a = acharAnomalias([serie({ base: 0, recente: 10 })]);
    expect(a).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("a capacidade", () => {
  it("mede a janela REAL, e não a grade contratada", () => {
    /*
     * O CRC não conhece a grade horária de cada profissional. Medir a janela
     * real — da primeira à última consulta — é mais conservador e mais honesto:
     * diz quanto da presença na clínica virou atendimento.
     */
    const l = lerCapacidade({
      dentistId: "d1",
      nome: "Dra. Juliana",
      minutosOcupados: 240,
      minutosDeJanela: 480,
      diasTrabalhados: 1,
    });

    expect(l.ocupacao).toBe(0.5);
    expect(l.horasOciosas).toBe(4);
    expect(l.situacao).toBe("OCIOSO");
  });

  it("agenda 95% cheia é APERTADO — e isso não é elogio", () => {
    /*
     * Sem folga não cabe encaixe, consulta que estende, nem urgência. A
     * primeira coisa que quebra é o horário, que vira atraso para todo mundo
     * depois.
     */
    const l = lerCapacidade({
      dentistId: "d1",
      nome: "Dra. Juliana",
      minutosOcupados: 456,
      minutosDeJanela: 480,
      diasTrabalhados: 1,
    });

    expect(l.situacao).toBe("APERTADO");
  });

  it("janela zerada não divide por zero", () => {
    const l = lerCapacidade({
      dentistId: "d1",
      nome: "X",
      minutosOcupados: 0,
      minutosDeJanela: 0,
      diasTrabalhados: 0,
    });

    expect(Number.isFinite(l.ocupacao)).toBe(true);
    expect(l.situacao).toBe("OCIOSO");
  });

  it("ocupação nunca passa de 1", () => {
    const l = lerCapacidade({
      dentistId: "d1",
      nome: "X",
      minutosOcupados: 600,
      minutosDeJanela: 480,
      diasTrabalhados: 1,
    });

    expect(l.ocupacao).toBeLessThanOrEqual(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("o briefing", () => {
  it("só lista o que é MAIOR QUE ZERO", () => {
    /*
     * ============================================================================
     *  "0 conversas esperando" é boa notícia, e boa notícia não precisa de
     *  linha: ela é a AUSÊNCIA de linha. Um briefing que lista tudo é um
     *  relatório, e ninguém lê relatório às oito da manhã.
     * ============================================================================
     */
    const b = montarBriefing(numeros({ conversasEsperando: 3 }), [], "Bom dia.");

    expect(b.linhas).toHaveLength(1);
    expect(b.linhas[0]?.chave).toBe("conversas");
  });

  it("com nada pendente, DIZ que não há nada", () => {
    /*
     * Uma tela vazia parece defeito. Dizer "nada pedindo atenção" é o que
     * transforma silêncio em informação.
     */
    const b = montarBriefing(numeros(), [], "Bom dia.");

    expect(b.linhas).toHaveLength(0);
    expect(b.abertura).toContain("Nada pedindo atenção");
  });

  it("singular e plural saem certos", () => {
    const um = montarBriefing(numeros({ horasVagas: 1 }), [], "Bom dia.");
    const varios = montarBriefing(numeros({ horasVagas: 4 }), [], "Bom dia.");

    expect(um.linhas[0]?.texto).toBe("1 hora vaga na agenda.");
    expect(varios.linhas[0]?.texto).toBe("4 horas vagas na agenda.");

    /*
     * A ABERTURA CONTA LINHAS, e nao horas. Quatro horas vagas sao UMA coisa
     * pedindo atencao — a primeira versao deste teste esperava "4 coisas", e
     * confundia o numero dentro da linha com o numero de linhas.
     */
    expect(um.abertura).toContain("Uma coisa");
    expect(varios.abertura).toContain("Uma coisa");

    const duasCoisas = montarBriefing(
      numeros({ horasVagas: 4, conversasEsperando: 2 }),
      [],
      "Bom dia.",
    );
    expect(duasCoisas.abertura).toContain("2 coisas");
  });

  it("a conversa esperando vem ANTES da receita", () => {
    /*
     * Conversa esperando é alguém do outro lado, agora. Receita esperada é um
     * número para a semana. Ordenar por dinheiro poria o relatório na frente da
     * pessoa esperando resposta.
     */
    const b = montarBriefing(
      numeros({ conversasEsperando: 2, receitaEsperada: 90000 }),
      [],
      "Bom dia.",
    );

    expect(b.linhas[0]?.chave).toBe("conversas");
  });

  it("a receita entra como CONTEXTO, e não como ação", () => {
    const b = montarBriefing(numeros({ receitaEsperada: 40000 }), [], "Bom dia.");

    expect(b.linhas[0]?.acionavel).toBe(false);
    // E por isso a abertura continua dizendo que nada pede atenção.
    expect(b.abertura).toContain("Nada pedindo atenção");
  });

  it("as anomalias viajam junto", () => {
    const anomalias = acharAnomalias([serie({ recente: 25 })]);
    const b = montarBriefing(numeros(), anomalias, "Bom dia.");

    expect(b.anomalias).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("a simulação", () => {
  it("devolve as PREMISSAS junto do número", () => {
    /*
     * ============================================================================
     *  Um simulador que diz "abrir sábado rende R$ 14.000/mês" sem dizer o que
     *  assumiu é um gerador de decisões ruins: o número parece medido, e é uma
     *  conta com quatro chutes dentro.
     * ============================================================================
     */
    const s = simularMaisHoras(cenario(), 8);

    expect(s.premissas.length).toBeGreaterThanOrEqual(4);
    expect(s.premissas.some((p) => p.includes("custo"))).toBe(true);
  });

  it("assume que o horário NOVO enche MENOS que o atual", () => {
    /*
     * Sábado de manhã não enche na mesma proporção que a terça à tarde. Assumir
     * a ocupação atual infla o resultado em quase o dobro.
     */
    const s = simularMaisHoras(cenario({ ocupacaoAtual: 0.8 }), 10);

    // Com 80% de ocupação e 10h novas, o otimista diria 8h ganhas.
    expect(s.horasGanhas).toBeLessThan(8);
    expect(s.premissas[0]).toContain("enche menos");
  });

  it("desconta a falta", () => {
    const semFalta = simularMaisHoras(cenario({ taxaDeFalta: 0 }), 8);
    const comFalta = simularMaisHoras(cenario({ taxaDeFalta: 0.3 }), 8);

    expect(comFalta.receitaMes).toBeLessThan(semFalta.receitaMes);
  });

  it("usa 4,33 semanas por mês, e não 4", () => {
    // O erro de 8% aparece no fim do ano — e é o tipo de erro que ninguém
    // procura, porque o número "parece certo".
    const s = simularMaisHoras(cenario({ taxaDeFalta: 0, ocupacaoAtual: 1 }), 10);

    /*
     * 10h × 0,7 × 1 × 250 × 4,33 = 7.577,50.
     *
     * O 0,7 e o desconto da ocupacao nova (`ocupacaoAtual * 0.7`), e nao o teto
     * de 0,85 — `min` escolhe o menor, e com ocupacao atual de 100% o menor e
     * 0,7. A primeira versao deste teste errou essa conta.
     *
     * Com 4 semanas em vez de 4,33 daria 7.000. A diferenca de 8% e o ponto.
     */
    expect(s.receitaMes).toBeCloseTo(7577.5, 1);
    expect(s.receitaMes).toBeGreaterThan(10 * 0.7 * 250 * 4);
  });

  it("zero horas a mais não rende nada", () => {
    const s = simularMaisHoras(cenario(), 0);
    expect(s.receitaMes).toBe(0);
  });
});
