/**
 * A analítica do gestor não tem mais teto — e isto prova acima do teto antigo.
 *
 * ============================================================================
 *  O DEFEITO ERA UM `limite: 3000` EM QUATRO CONSULTAS.
 *
 *      const linhas = await selecionar("crc_opportunities", {
 *        ...,
 *        limite: 3000,
 *      });
 *      // e então somava `linhas`
 *
 *  Da 3.001ª linha em diante, o PostgREST devolvia as 3.000 primeiras e o
 *  código somava o que recebeu. Sem erro, sem aviso, sem linha de log. O
 *  painel mostrava um número plausível e MENOR que a realidade.
 *
 *  É o pior formato de defeito possível num painel financeiro: invisível
 *  enquanto a clínica é pequena, e mentiroso exatamente a partir do tamanho em
 *  que a decisão fica cara.
 *
 *  ==========================================================================
 *   E A MEDIANA DO `speedToLead` ERA UM CASO À PARTE.
 *
 *   Soma truncada erra em proporção — 3.000 de 4.000 linhas dão 75% do valor,
 *   e quem sabe do teto corrige de cabeça.
 *
 *   Mediana truncada não erra em proporção nenhuma: ela passa a descrever a
 *   metade das linhas que o banco devolveu PRIMEIRO, que não é amostra, é o
 *   começo de uma ordenação. O teste `a mediana truncada não é "quase a
 *   mediana"` abaixo mede essa diferença em minutos.
 *  ==========================================================================
 *
 *  INJEÇÃO DE DEFEITO, reproduzível: `scratchpad/injetar-defeitos-analytics.mjs`
 *  devolve o teto a cada uma das quatro consultas, uma de cada vez, e confere
 *  que um teste NOMEADO reprova em cada caso. Seis de seis em 13/09/2026.
 * ============================================================================
 *
 * O QUE ESTE ARQUIVO NÃO PROVA, e é importante dizer: ele roda contra o banco
 * em memória, que REPRODUZ a semântica do `supabase/42` mas não a EXECUTA. Quem
 * prova o SQL de verdade é `testes/integracao/analitica-sem-teto.test.ts`,
 * contra Postgres criado do zero — inclusive `percentile_cont`, que aqui é
 * aritmética de array.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => import("../testes/banco-memoria"));

import { limparBanco, semear } from "../testes/banco-memoria";

import { motivosDePerda, panoramaDoGestor, speedToLead, ultimosMeses } from "./analytics";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "22222222-2222-4222-8222-222222222222";
const CLINICA = "33333333-3333-4333-8333-333333333333";

/** Um período largo o bastante para nada cair fora dele por acidente. */
const PERIODO = { de: "2026-01-01T00:00:00.000Z", ate: "2027-01-01T00:00:00.000Z", rotulo: "2026" };

/** `2026-06-01T00:00:00.000Z` mais `minutos`. Instantes dentro do período. */
const instante = (minutos: number): string =>
  new Date(Date.parse("2026-06-01T00:00:00.000Z") + minutos * 60_000).toISOString();

beforeEach(() => {
  limparBanco();
});

/* -------------------------------------------------------------------------- */

describe("motivos de perda", () => {
  it("agrupa, soma o valor e ordena por quantidade", async () => {
    semear("crc_opportunities", [
      op({ lost_reason: "preco", potential_value: "1000.00" }),
      op({ lost_reason: "preco", potential_value: "500.50" }),
      op({ lost_reason: "nao_respondeu", potential_value: "200.00" }),
    ]);

    const perdas = await motivosDePerda(ORG, PERIODO);

    expect(perdas).toEqual([
      { motivo: "preco", quantidade: 2, valorPerdido: "1500.50" },
      { motivo: "nao_respondeu", quantidade: 1, valorPerdido: "200.00" },
    ]);
  });

  it("3.001 perdas: a 3.001ª conta — o antigo teto cortava exatamente aqui", async () => {
    semear(
      "crc_opportunities",
      Array.from({ length: 3001 }, () => op({ lost_reason: "preco", potential_value: "10.00" })),
    );

    const perdas = await motivosDePerda(ORG, PERIODO);

    expect(perdas[0]?.quantidade).toBe(3001);
    expect(perdas[0]?.valorPerdido).toBe("30010.00");
  });

  it("10.000 perdas: o valor sai inteiro, e não 30% dele", async () => {
    semear(
      "crc_opportunities",
      Array.from({ length: 10_000 }, () => op({ lost_reason: "preco", potential_value: "37.00" })),
    );

    const perdas = await motivosDePerda(ORG, PERIODO);

    expect(perdas[0]?.quantidade).toBe(10_000);
    // Com o teto, isto daria "111000.00" — 30% do valor real, e plausível.
    expect(perdas[0]?.valorPerdido).toBe("370000.00");
  });

  it("um motivo inteiro não some por estar depois do corte", async () => {
    /*
     * O TRUNCAMENTO NÃO ERRAVA SÓ A CONTAGEM. Se um motivo aparecesse apenas
     * nas linhas além da 3.000ª, ele desaparecia da lista — e "nenhuma perda
     * por convênio" é uma conclusão comercial oposta a "quatrocentas".
     */
    semear(
      "crc_opportunities",
      Array.from({ length: 4000 }, (_, i) =>
        op({
          lost_reason: i < 3500 ? "preco" : "convenio",
          potential_value: "1.00",
        }),
      ),
    );

    const perdas = await motivosDePerda(ORG, PERIODO);
    const motivos = perdas.map((p) => p.motivo);

    expect(motivos).toContain("convenio");
    expect(perdas.find((p) => p.motivo === "convenio")?.quantidade).toBe(500);
  });

  it("empate desempata pelo nome, e não pela ordem de chegada do banco", async () => {
    semear("crc_opportunities", [
      op({ lost_reason: "zebra", potential_value: "1.00" }),
      op({ lost_reason: "abacate", potential_value: "1.00" }),
    ]);

    expect((await motivosDePerda(ORG, PERIODO)).map((p) => p.motivo)).toEqual(["abacate", "zebra"]);
  });

  it("não conta oportunidade de outra clínica", async () => {
    semear("crc_opportunities", [
      op({ lost_reason: "preco", potential_value: "100.00" }),
      op({ lost_reason: "preco", potential_value: "999.00", organization_id: OUTRA_ORG }),
    ]);

    const perdas = await motivosDePerda(ORG, PERIODO);
    expect(perdas[0]?.quantidade).toBe(1);
    expect(perdas[0]?.valorPerdido).toBe("100.00");
  });

  it("não conta oportunidade ainda aberta", async () => {
    semear("crc_opportunities", [
      op({ lost_reason: "preco", potential_value: "100.00" }),
      // Motivo preenchido mas sem fechamento: continua viva. Contá-la faria o
      // relatório declarar perdida uma oportunidade que ainda dá dinheiro.
      op({ lost_reason: "preco", potential_value: "999.00", fechada_em: null }),
    ]);

    expect((await motivosDePerda(ORG, PERIODO))[0]?.quantidade).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("speed to lead", () => {
  it("mediana, respondidos e os que ficaram abaixo de cinco minutos", async () => {
    semear("crc_leads", [
      lead(0, 2), // 2 min
      lead(1, 4), // 4 min
      lead(2, 30), // 30 min
      lead(3, null), // nunca respondido
    ]);

    expect(await speedToLead(ORG, PERIODO)).toEqual({
      leads: 4,
      respondidos: 3,
      medianaMinutos: 4,
      ateCincoMinutos: 2,
    });
  });

  it("número par de respostas: a mediana é a média das duas do meio", async () => {
    semear("crc_leads", [lead(0, 2), lead(1, 4), lead(2, 10), lead(3, 40)]);
    expect((await speedToLead(ORG, PERIODO)).medianaMinutos).toBe(7);
  });

  it("ninguém respondido devolve `null`, e não zero", async () => {
    semear("crc_leads", [lead(0, null), lead(1, null)]);

    const r = await speedToLead(ORG, PERIODO);
    // "Ninguém foi respondido" e "responderam em zero minuto" são leituras
    // opostas. Um `0` aqui seria a melhor nota possível para o pior cenário.
    expect(r.medianaMinutos).toBeNull();
    expect(r.leads).toBe(2);
    expect(r.respondidos).toBe(0);
  });

  it('a mediana truncada não é "quase a mediana" — 10.000 leads provam', async () => {
    /*
     * ========================================================================
     *  O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
     *
     *  A base é montada com uma correlação REALISTA entre ordem de chegada e
     *  tempo de resposta: os primeiros leads do período foram respondidos
     *  rápido (operação vazia), os últimos devagar (operação cheia).
     *
     *  Com teto de 3.000, a mediana era calculada só sobre os 3.000 primeiros
     *  — os rápidos. Ela não ficava "um pouco menor": ficava DE OUTRO ASSUNTO.
     * ========================================================================
     */
    const TOTAL = 10_000;
    semear(
      "crc_leads",
      Array.from({ length: TOTAL }, (_, i) => lead(i, i + 1)),
    );

    const r = await speedToLead(ORG, PERIODO);

    expect(r.leads).toBe(TOTAL);
    expect(r.respondidos).toBe(TOTAL);
    // Base inteira: os valores são 1..10.000, mediana = (5.000 + 5.001) / 2.
    expect(r.medianaMinutos).toBe(5001);

    /*
     * A PROVA DO DANO, e não só da correção: sobre os 3.000 primeiros a
     * mediana seria 1.500. O painel diria "respondemos em 25 horas" quando a
     * clínica responde em 83. Não é um erro de 30%: é um erro de 3,3×, na
     * direção que faz a operação parecer melhor do que é.
     */
    const medianaTruncada = 1500;
    expect(r.medianaMinutos).toBeGreaterThan(medianaTruncada * 3);
  });

  it("25.000 leads: nada depende do tamanho da base", async () => {
    const TOTAL = 25_000;
    semear(
      "crc_leads",
      Array.from({ length: TOTAL }, (_, i) => lead(i, i < 9000 ? 3 : 600)),
    );

    const r = await speedToLead(ORG, PERIODO);

    expect(r.leads).toBe(TOTAL);
    expect(r.ateCincoMinutos).toBe(9000);
    // Mais da metade demorou 600 min, então a mediana é 600 — e com teto de
    // 3.000 seria 3, porque os 3.000 primeiros eram todos rápidos.
    expect(r.medianaMinutos).toBe(600);
  });

  it("não conta lead de outra clínica", async () => {
    semear("crc_leads", [lead(0, 2), { ...lead(1, 999), organization_id: OUTRA_ORG }]);

    const r = await speedToLead(ORG, PERIODO);
    expect(r.leads).toBe(1);
    expect(r.medianaMinutos).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */

describe("panorama do gestor", () => {
  const agora = new Date("2026-06-15T12:00:00.000Z");

  it("conta abertas, soma o valor parado e distingue reativado de recuperado", async () => {
    semear("crc_opportunities", [
      { ...op({}), fechada_em: null, potential_value: "1000.00" },
      { ...op({}), fechada_em: null, potential_value: "250.25" },
    ]);

    semear("crc_funnel_events", [
      evento("paciente-a"),
      evento("paciente-a"), // o mesmo paciente voltou duas vezes
      evento("paciente-b"),
    ]);

    const p = await panoramaDoGestor(ORG, agora);

    expect(p.oportunidadesAbertas).toBe(2);
    expect(p.valorEmAberto).toBe("1250.25");
    expect(p.consultasRecuperadas).toBe(3);
    // Quem voltou duas vezes continua sendo UMA pessoa reativada.
    expect(p.pacientesReativados).toBe(2);
  });

  it("10.000 oportunidades abertas: o valor parado sai inteiro", async () => {
    /*
     * AS ABERTAS ERAM A LEITURA MAIS EXPOSTA DAS QUATRO, por um motivo
     * estrutural: ela não tem recorte de período — é o acumulado da clínica
     * inteira. As outras se renovam todo mês e voltam para debaixo do teto
     * sozinhas. Esta só cresce.
     */
    semear(
      "crc_opportunities",
      Array.from({ length: 10_000 }, () => ({
        ...op({}),
        fechada_em: null,
        potential_value: "80.00",
      })),
    );

    const p = await panoramaDoGestor(ORG, agora);

    expect(p.oportunidadesAbertas).toBe(10_000);
    // Com o teto: "240000.00". Plausível, e R$ 560 mil a menos que a verdade.
    expect(p.valorEmAberto).toBe("800000.00");
  });

  it("5.000 recuperações no mês: a contagem e os pacientes distintos batem", async () => {
    const mes = ultimosMeses(6, agora).at(-1);
    if (mes === undefined) throw new Error("período inválido");

    semear(
      "crc_funnel_events",
      Array.from({ length: 5000 }, (_, i) => ({
        ...evento(`paciente-${String(i % 1200)}`),
        ocorrido_em: mes.de,
      })),
    );

    const p = await panoramaDoGestor(ORG, agora);

    expect(p.consultasRecuperadas).toBe(5000);
    expect(p.pacientesReativados).toBe(1200);
  });

  it("não soma o valor em aberto de outra clínica", async () => {
    semear("crc_opportunities", [
      { ...op({}), fechada_em: null, potential_value: "100.00" },
      { ...op({}), fechada_em: null, potential_value: "9000.00", organization_id: OUTRA_ORG },
    ]);

    const p = await panoramaDoGestor(ORG, agora);
    expect(p.oportunidadesAbertas).toBe(1);
    expect(p.valorEmAberto).toBe("100.00");
  });

  it("base vazia devolve zeros, e não explode", async () => {
    const p = await panoramaDoGestor(ORG, agora);

    expect(p.oportunidadesAbertas).toBe(0);
    expect(p.valorEmAberto).toBe("0.00");
    expect(p.consultasRecuperadas).toBe(0);
    expect(p.pacientesReativados).toBe(0);
    expect(p.lead.medianaMinutos).toBeNull();
    expect(p.perdas).toEqual([]);
    // Sem financeiro confirmado, o número grande da tela não pode se chamar
    // "receita" — item 63.
    expect(p.semFinanceiroConfirmado).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Fábricas                                                                   */
/* -------------------------------------------------------------------------- */

/** Oportunidade fechada dentro do período, salvo quem passar outra coisa. */
function op(campos: Record<string, unknown>): Record<string, unknown> {
  return {
    organization_id: ORG,
    clinic_id: CLINICA,
    tipo: "BUDGET_RECOVERY",
    fechada_em: instante(0),
    ...campos,
  };
}

/** Lead criado no minuto `i`, respondido `depois` minutos mais tarde. */
function lead(i: number, depois: number | null): Record<string, unknown> {
  return {
    organization_id: ORG,
    nome: `Lead ${String(i)}`,
    origem: "SITE",
    criado_em: instante(i),
    primeira_resposta_em: depois === null ? null : instante(i + depois),
  };
}

/** Uma consulta recuperada, dentro do período. */
function evento(paciente: string): Record<string, unknown> {
  return {
    organization_id: ORG,
    patient_id: paciente,
    etapa: "consulta_recuperada",
    ocorrido_em: instante(0),
  };
}
