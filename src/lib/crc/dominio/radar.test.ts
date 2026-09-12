/**
 * O Radar — o que estes testes prendem é a HONESTIDADE dos números.
 *
 * Um painel que diz "R$ 184.320 recuperáveis" só vale alguma coisa se esse
 * número sobreviver a uma conferência no fim do mês. Os testes abaixo são todos
 * sobre as formas de esse número mentir:
 *
 *   somar potencial como se fosse esperado;
 *   tratar um palpite como medição;
 *   contar oportunidade vencida;
 *   deixar a probabilidade passar de 1;
 *   deixar uma amostra de três casos virar "100% de conversão".
 */
import { describe, expect, it } from "vitest";

import {
  CONFIANCA_SEM_HISTORICO,
  aindaRecuperavel,
  calcularUrgencia,
  estadoDoRadar,
  estimarChance,
  resumirRadar,
  valorDoRadar,
  VERSAO_DO_SCORE,
  type ContextoProbabilidade,
  type FatosDaOportunidade,
} from "./radar";

const AGORA = new Date("2026-09-12T14:00:00.000Z");

function fatos(parcial: Partial<FatosDaOportunidade> = {}): FatosDaOportunidade {
  return {
    convertedAt: null,
    lostAt: null,
    dismissedEm: null,
    expiresAt: null,
    acionadaEm: null,
    aguardando: null,
    probability: null,
    ...parcial,
  };
}

function chanceDe(parcial: Partial<ContextoProbabilidade> = {}): ContextoProbabilidade {
  return {
    tipo: "BUDGET_RECOVERY",
    amostra: null,
    respondeu: false,
    intencaoAgendar: false,
    tentativasSemResposta: 0,
    diasEsperando: 0,
    ...parcial,
  };
}

/* -------------------------------------------------------------------------- */

describe("o estado, derivado dos fatos", () => {
  it("sem nada, é DETECTED — o Radar viu e ainda não pontuou", () => {
    expect(estadoDoRadar(fatos(), AGORA)).toBe("DETECTED");
  });

  it("pontuada vira QUALIFIED", () => {
    expect(estadoDoRadar(fatos({ probability: 0.3 }), AGORA)).toBe("QUALIFIED");
  });

  it("acionada vira IN_ACTION, mesmo já pontuada", () => {
    const e = estadoDoRadar(
      fatos({ probability: 0.3, acionadaEm: "2026-09-12T13:00:00.000Z" }),
      AGORA,
    );
    expect(e).toBe("IN_ACTION");
  });

  it("distingue esperar o paciente de esperar um humano", () => {
    expect(estadoDoRadar(fatos({ aguardando: "PACIENTE" }), AGORA)).toBe("WAITING_PATIENT");
    expect(estadoDoRadar(fatos({ aguardando: "HUMANO" }), AGORA)).toBe("WAITING_HUMAN");
  });

  it("vencida é EXPIRED, e não continua 'esperando o paciente'", () => {
    /*
     * É O CASO QUE MAIS ENGANA NA TELA. Um buraco de agenda de ontem às 14h,
     * marcado como aguardando o paciente, apareceria para sempre como uma
     * oportunidade viva — e a soma da Home contaria dinheiro que não existe.
     */
    const e = estadoDoRadar(
      fatos({ aguardando: "PACIENTE", expiresAt: "2026-09-11T14:00:00.000Z" }),
      AGORA,
    );
    expect(e).toBe("EXPIRED");
    expect(aindaRecuperavel(e)).toBe(false);
  });

  it("expiração no futuro não expira nada", () => {
    const e = estadoDoRadar(fatos({ expiresAt: "2026-09-13T14:00:00.000Z" }), AGORA);
    expect(e).toBe("DETECTED");
  });

  it("os desfechos são absorventes e têm precedência sobre a expiração", () => {
    const convertida = fatos({
      convertedAt: "2026-09-10T10:00:00.000Z",
      expiresAt: "2026-09-11T14:00:00.000Z",
    });
    expect(estadoDoRadar(convertida, AGORA)).toBe("CONVERTED");
  });

  it("descarte humano ganha até de uma conversão posterior do sync", () => {
    /*
     * Quem descarta é uma pessoa dizendo "o Radar errou aqui". Se o sync marcar
     * conversão depois, o descarte precisa continuar visível — é ele que mede
     * se o Radar merece confiança. Contá-lo como acerto seria o painel se
     * avaliando com a régua que ele mesmo escolheu.
     */
    const d = fatos({
      dismissedEm: "2026-09-11T09:00:00.000Z",
      convertedAt: "2026-09-12T09:00:00.000Z",
    });
    expect(estadoDoRadar(d, AGORA)).toBe("DISMISSED");
  });

  it("só os cinco estados abertos contam como recuperáveis", () => {
    expect(aindaRecuperavel("DETECTED")).toBe(true);
    expect(aindaRecuperavel("WAITING_HUMAN")).toBe(true);
    expect(aindaRecuperavel("CONVERTED")).toBe(false);
    expect(aindaRecuperavel("LOST")).toBe(false);
    expect(aindaRecuperavel("DISMISSED")).toBe(false);
    expect(aindaRecuperavel("EXPIRED")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("a probabilidade", () => {
  it("sem histórico, a confiança nasce baixa e o fator diz que é estimativa", () => {
    const c = estimarChance(chanceDe());

    expect(c.confianca).toBe(CONFIANCA_SEM_HISTORICO);
    expect(c.fatores[0]?.rotulo).toContain("ainda não tem histórico");
    expect(c.versao).toBe(VERSAO_DO_SCORE);
  });

  it("uma amostra de 3 casos NÃO vira '100% de conversão'", () => {
    /*
     * É O DEFEITO QUE MAIS DESTRÓI PAINEL DE PREVISÃO: trocar o palpite pela
     * medição no primeiro acerto. Três de três é 100% observado, e qualquer
     * número que a tela mostre a partir disso é ficção.
     */
    const c = estimarChance(chanceDe({ amostra: { casos: 3, convertidos: 3 } }));

    expect(c.probabilidade).toBeLessThan(0.3);
    // E a confiança continua baixa — é isso que a tela precisa mostrar.
    expect(c.confianca).toBeLessThan(0.25);
  });

  it("uma amostra grande manda na estimativa, e a confiança sobe junto", () => {
    const c = estimarChance(chanceDe({ amostra: { casos: 600, convertidos: 300 } }));

    expect(c.probabilidade).toBeGreaterThan(0.42);
    expect(c.confianca).toBeGreaterThan(0.85);
  });

  it("responder é o maior salto único", () => {
    const calado = estimarChance(chanceDe());
    const falou = estimarChance(chanceDe({ respondeu: true }));

    expect(falou.probabilidade).toBeGreaterThan(calado.probabilidade * 1.8);
  });

  it("nunca passa de 0,95, nem com todos os sinais somados", () => {
    /*
     * Um painel que anuncia 110% de chance perde a credibilidade do resto da
     * tela de uma vez. O teto existe para o caso em que os multiplicadores se
     * empilham — o que acontece com um lead quente que respondeu e pediu hora.
     */
    const c = estimarChance(
      chanceDe({
        tipo: "NEW_LEAD",
        amostra: { casos: 500, convertidos: 480 },
        respondeu: true,
        intencaoAgendar: true,
      }),
    );

    expect(c.probabilidade).toBeLessThanOrEqual(0.95);
  });

  it("nunca cai a zero, mesmo com silêncio e idade acumulados", () => {
    const c = estimarChance(
      chanceDe({
        tipo: "BIRTHDAY",
        tentativasSemResposta: 9,
        diasEsperando: 400,
      }),
    );

    // Zero significaria "impossível", e impossível justificaria apagar a linha
    // — que é decisão de pessoa, não de fórmula.
    expect(c.probabilidade).toBeGreaterThanOrEqual(0.01);
  });

  it("cada tentativa sem resposta derruba a chance", () => {
    const uma = estimarChance(chanceDe({ tentativasSemResposta: 1 }));
    const tres = estimarChance(chanceDe({ tentativasSemResposta: 3 }));

    expect(tres.probabilidade).toBeLessThan(uma.probabilidade);
  });

  it("paciente inativo vale muito menos que lead novo", () => {
    const lead = estimarChance(chanceDe({ tipo: "NEW_LEAD" }));
    const sumido = estimarChance(chanceDe({ tipo: "INACTIVE_PATIENT" }));

    expect(sumido.probabilidade * 4).toBeLessThan(lead.probabilidade);
  });
});

/* -------------------------------------------------------------------------- */

describe("a urgência", () => {
  it("o que vence em horas é máximo", () => {
    const u = calcularUrgencia(
      { expiraEm: "2026-09-12T17:00:00.000Z", diasEsperando: 0, tipo: "CANCELLED_APPOINTMENT" },
      AGORA,
    );
    expect(u).toBe(100);
  });

  it("o que já venceu tem urgência ZERO — não dá mais", () => {
    const u = calcularUrgencia(
      { expiraEm: "2026-09-11T17:00:00.000Z", diasEsperando: 1, tipo: "CANCELLED_APPOINTMENT" },
      AGORA,
    );
    expect(u).toBe(0);
  });

  it("faltou ontem é urgente; sumiu há meses, não", () => {
    const faltou = calcularUrgencia(
      { expiraEm: null, diasEsperando: 1, tipo: "MISSED_APPOINTMENT" },
      AGORA,
    );
    const inativo = calcularUrgencia(
      { expiraEm: null, diasEsperando: 200, tipo: "INACTIVE_PATIENT" },
      AGORA,
    );

    expect(faltou).toBeGreaterThan(inativo * 3);
  });
});

/* -------------------------------------------------------------------------- */

describe("o valor", () => {
  it("o esperado é o potencial COM a chance dentro", () => {
    const chance = estimarChance(chanceDe({ tipo: "RECALL" }));
    const v = valorDoRadar(10_000, chance, 20);

    expect(v.potencial).toBe(10_000);
    expect(v.esperado).toBeCloseTo(10_000 * chance.probabilidade, 2);
    // E a diferença entre os dois é gigante: é exatamente o que a Home
    // esconderia se somasse só o potencial.
    expect(v.esperado).toBeLessThan(v.potencial / 4);
  });

  it("a urgência não passa na frente do dinheiro, mas desempata", () => {
    const chance = estimarChance(chanceDe({ tipo: "NEW_LEAD" }));

    const grandeSemPressa = valorDoRadar(20_000, chance, 10);
    const pequenaUrgente = valorDoRadar(300, chance, 100);

    expect(grandeSemPressa.impacto).toBeGreaterThan(pequenaUrgente.impacto);

    // Mas entre duas iguais, a urgente sobe.
    const a = valorDoRadar(1_000, chance, 10);
    const b = valorDoRadar(1_000, chance, 90);
    expect(b.impacto).toBeGreaterThan(a.impacto);
  });

  it("o impacto satura em 100 e não estoura", () => {
    const chance = estimarChance(
      chanceDe({ tipo: "NEW_LEAD", respondeu: true, intencaoAgendar: true }),
    );
    const v = valorDoRadar(500_000, chance, 100);

    expect(v.impacto).toBeLessThanOrEqual(100);
  });
});

/* -------------------------------------------------------------------------- */

describe("o resumo que vai para a Home", () => {
  it("separa o total potencial do total esperado", () => {
    /*
     * A ASSERÇÃO INTEIRA DESTE ARQUIVO ESTÁ AQUI. Somar `potencial` sobre a
     * base é somar o que aconteceria se todo mundo fechasse — num consultório
     * de 8.000 pacientes isso passa de R$ 2 milhões, e é a soma dos sonhos.
     */
    const r = resumirRadar([
      {
        tipo: "RECALL",
        abertas: 400,
        valorPotencial: 400_000,
        valorEsperado: 48_000,
        confianca: 0.2,
      },
      {
        tipo: "NEW_LEAD",
        abertas: 12,
        valorPotencial: 36_000,
        valorEsperado: 12_600,
        confianca: 0.9,
      },
    ]);

    expect(r.totalPotencial).toBe(436_000);
    expect(r.totalEsperado).toBe(60_600);
    expect(r.totalAbertas).toBe(412);
  });

  it("a confiança média é ponderada pela QUANTIDADE, não pelo valor", () => {
    /*
     * Ponderar por valor deixaria uma única oportunidade grande e mal medida
     * dominar o indicador de quão confiável o painel é — justamente quando ele
     * mais precisa avisar que está chutando.
     */
    const r = resumirRadar([
      {
        tipo: "RECALL",
        abertas: 900,
        valorPotencial: 90_000,
        valorEsperado: 10_800,
        confianca: 0.2,
      },
      {
        tipo: "NEW_LEAD",
        abertas: 10,
        valorPotencial: 900_000,
        valorEsperado: 300_000,
        confianca: 1,
      },
    ]);

    // Se fosse ponderada por valor, daria ~0,97. Pela quantidade dá ~0,21 — e é
    // a verdade: 900 das 910 linhas são palpite.
    expect(r.confiancaMedia).toBeLessThan(0.25);
  });

  it("ordena por valor esperado, e não por potencial", () => {
    const r = resumirRadar([
      {
        tipo: "RECALL",
        abertas: 400,
        valorPotencial: 900_000,
        valorEsperado: 20_000,
        confianca: 0.2,
      },
      {
        tipo: "NEW_LEAD",
        abertas: 12,
        valorPotencial: 36_000,
        valorEsperado: 90_000,
        confianca: 0.9,
      },
    ]);

    expect(r.linhas[0]?.tipo).toBe("NEW_LEAD");
  });

  it("resumo vazio não divide por zero", () => {
    const r = resumirRadar([]);
    expect(r.confiancaMedia).toBe(0);
    expect(r.totalEsperado).toBe(0);
  });
});
