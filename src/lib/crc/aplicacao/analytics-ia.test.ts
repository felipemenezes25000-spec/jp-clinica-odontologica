/**
 * Analytics de IA — Fase I.
 *
 * O QUE ESTES TESTES PROTEGEM é a interpretação, e não a soma. Somar linhas
 * qualquer um faz; o que erra é o significado:
 *
 *   A TAXA DE HANDOFF tem DUAS pontas ruins. Quase todo painel trata "menor é
 *   melhor", e zero por cento significa que o agente está respondendo o que não
 *   devia — inclusive conteúdo clínico.
 *
 *   AS RUNS ABERTAS ficam fora do denominador. Contá-las derrubaria a taxa de
 *   entrega durante um incidente, somando confusão a incidente.
 *
 *   COM POUCOS TURNOS, nenhuma conclusão. É a mesma honestidade do módulo de
 *   A/B, e pela mesma razão.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { compararPeriodos, lerMetricas, metricasDeIa } from "./analytics-ia";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-09-11T14:00:00.000Z");
const DE = new Date("2026-09-01T00:00:00.000Z");

const janela = { organizationId: ORG, de: DE, ate: AGORA };

/** Semeia N runs com um desfecho. */
function runs(
  quantas: number,
  resultado: string,
  extra: Record<string, unknown> = {},
  prefixo = "r",
): void {
  semear(
    "crc_ai_runs",
    Array.from({ length: quantas }, (_, i) => ({
      organization_id: ORG,
      conversation_id: CONVERSA,
      chave_dedupe: `${prefixo}:${resultado}:${String(i)}`,
      resultado,
      custo_estimado: 0.05,
      criado_em: new Date(DE.getTime() + i * 3_600_000).toISOString(),
      ...extra,
    })),
  );
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_conversations", [
    { id: CONVERSA, organization_id: ORG, canal: "whatsapp", contato_externo: "5511999998888" },
  ]);
});

describe("as métricas", () => {
  it("somam por desfecho e calculam as taxas", async () => {
    runs(70, "enviado");
    runs(20, "humano");
    runs(10, "sem_acao");

    const m = await metricasDeIa(janela);

    expect(m.turnos).toBe(100);
    expect(m.taxaDeEntrega).toBeCloseTo(0.7, 2);
    expect(m.taxaDeHandoff).toBeCloseTo(0.2, 2);
  });

  it("as runs ABERTAS ficam fora do denominador", async () => {
    runs(80, "enviado");
    runs(20, "RODANDO");

    const m = await metricasDeIa(janela);

    /*
     * Desde a Fase B a run nasce ANTES da chamada de modelo. Uma run aberta é um
     * turno que ainda não terminou — ou cujo worker morreu. Contá-la como turno
     * concluído baixaria a taxa de entrega de 100% para 80% por um motivo que
     * não é qualidade, e a queda apareceria justo durante um incidente.
     */
    expect(m.turnos).toBe(80);
    expect(m.taxaDeEntrega).toBe(1);
  });

  it("contam os portões que barraram", async () => {
    runs(30, "humano", { portao_bloqueou: "conteudo_clinico" }, "a");
    runs(10, "humano", { portao_bloqueou: "promessa_sem_acao" }, "b");
    runs(60, "enviado");

    const m = await metricasDeIa(janela);

    // É a única métrica da lista que aponta para uma CAUSA, e não um sintoma.
    expect(m.portoes[0]).toEqual({ codigo: "conteudo_clinico", vezes: 30 });
  });

  it("somam o custo", async () => {
    runs(20, "enviado");
    const m = await metricasDeIa(janela);

    expect(m.custoTotal).toBeCloseTo(1, 2);
    expect(m.custoPorTurno).toBeCloseTo(0.05, 3);
  });
});

describe("a leitura dos números", () => {
  it("com poucos turnos, NÃO conclui nada", async () => {
    runs(10, "enviado");
    const leituras = lerMetricas(await metricasDeIa(janela));

    // Abaixo de vinte, toda porcentagem oscila demais para significar algo.
    expect(leituras).toHaveLength(1);
    expect(leituras[0]?.detalhe).toContain("Deixe rodar mais");
  });

  it("handoff em ZERO é ATENÇÃO, e não sucesso", async () => {
    runs(100, "enviado");
    const leituras = lerMetricas(await metricasDeIa(janela));
    const handoff = leituras.find((l) => l.titulo.includes("pessoa"));

    /*
     * O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
     *
     * Quase todo painel trataria 100% de entrega e 0% de handoff como o
     * resultado ideal. É o oposto: um agente que nunca passa nada adiante está
     * respondendo coisa que não devia — e o que "não devia" inclui sintoma,
     * remédio e reclamação.
     */
    expect(handoff?.severidade).toBe("atencao");
    expect(handoff?.detalhe).toContain("respondendo coisa que não devia");
  });

  it("handoff ALTO também é atenção, pelo motivo oposto", async () => {
    runs(40, "enviado");
    runs(60, "humano");

    const leituras = lerMetricas(await metricasDeIa(janela));
    const handoff = leituras.find((l) => l.titulo.includes("pessoa"));

    // A recepção ganhou trabalho, e não perdeu. E a causa costuma ser falta de
    // material escrito, não defeito do agente.
    expect(handoff?.severidade).toBe("atencao");
    expect(handoff?.detalhe).toContain("material escrito");
  });

  it("a faixa do meio é saudável", async () => {
    runs(85, "enviado");
    runs(15, "humano");

    const leituras = lerMetricas(await metricasDeIa(janela));
    expect(leituras.some((l) => l.severidade === "ok")).toBe(true);
  });

  it("custo alto aponta para FERRAMENTA, e não para o modelo", async () => {
    runs(100, "enviado", { custo_estimado: 0.8 });

    const leituras = lerMetricas(await metricasDeIa(janela));
    const custo = leituras.find((l) => l.titulo.includes("custando"));

    // A causa quase nunca é o preço do modelo: é o agente usando ferramenta
    // demais, e cada ferramenta é uma chamada a mais.
    expect(custo?.detalhe).toContain("ferramenta demais");
    expect(custo?.detalhe).toContain("antes de trocar de modelo");
  });

  it("taxa de falha alta manda olhar o painel de saúde", async () => {
    runs(80, "enviado");
    runs(20, "falha_segura");

    const leituras = lerMetricas(await metricasDeIa(janela));
    const falha = leituras.find((l) => l.titulo.includes("falharam"));

    expect(falha?.severidade).toBe("critico");
    expect(falha?.detalhe).toContain("disjuntor");
  });

  it("o portão dominante vem com explicação", async () => {
    runs(60, "enviado");
    runs(40, "humano", { portao_bloqueou: "conteudo_clinico" }, "c");

    const leituras = lerMetricas(await metricasDeIa(janela));
    const portao = leituras.find((l) => l.titulo.includes("portão"));

    // "conteudo_clinico: 40" não diz o que fazer. A explicação diz — e o que ela
    // diz não é "conserte o agente": é "o material não cobre o que perguntam".
    expect(portao?.detalhe).toContain("material da clínica");
  });
});

describe("comparar períodos", () => {
  const metricas = (turnos: number, entrega: number, custo: number) => ({
    turnos,
    entregues: Math.round(turnos * entrega),
    humanos: 0,
    semAcao: 0,
    falhas: 0,
    taxaDeEntrega: entrega,
    taxaDeHandoff: 0,
    taxaDeFalha: 0,
    custoTotal: turnos * custo,
    custoPorTurno: custo,
    portoes: [],
  });

  it("variação com base pequena NÃO é significativa", () => {
    const c = compararPeriodos(metricas(30, 0.5, 0.1), metricas(30, 0.7, 0.1));
    const entrega = c.find((x) => x.metrica === "Entrega");

    /*
     * +20pp com trinta turnos de base. Um painel que mostra isso em verde ensina
     * a clínica a comemorar sorte — e depois a não confiar no painel quando o
     * número voltar ao normal.
     */
    expect(entrega?.significativa).toBe(false);
  });

  it("variação com base suficiente É significativa", () => {
    const c = compararPeriodos(metricas(200, 0.5, 0.1), metricas(200, 0.7, 0.1));
    expect(c.find((x) => x.metrica === "Entrega")?.significativa).toBe(true);
  });

  it("custo tem régua PRÓPRIA, em proporção", () => {
    // 0,10 → 0,14 é +40%. Em pontos absolutos parece nada; em custo é a
    // diferença entre R$ 50 e R$ 70 no mês.
    const c = compararPeriodos(metricas(200, 0.5, 0.1), metricas(200, 0.5, 0.14));
    expect(c.find((x) => x.metrica === "Custo por turno")?.significativa).toBe(true);
  });
});
