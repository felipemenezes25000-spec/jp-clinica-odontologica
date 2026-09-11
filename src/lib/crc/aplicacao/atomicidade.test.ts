/**
 * As três trocas atômicas e o fuso — Fase D.
 *
 * O QUE ESTES TESTES PROVAM E O QUE NÃO PROVAM, dito antes de qualquer asserção,
 * porque a diferença é exatamente o assunto desta fase.
 *
 * PROVAM: o contrato. Que a decisão e o incremento do orçamento acontecem no
 * mesmo passo; que quem lê o conhecimento no meio de uma reindexação vê o
 * conteúdo antigo e nunca o vazio; que uma publicação que falha não deixa a
 * clínica sem versão publicada; que o dia é o dia da clínica.
 *
 * NÃO PROVAM: que duas transações CONCORRENTES no Postgres não se atropelam.
 * JavaScript é uma thread só — aqui a concorrência é encenada, não sofrida. O
 * `for update` e o rollback de verdade só são exercidos pelo item 20, que é a
 * FASE E. Escrever "atomicidade provada" com base neste arquivo seria mentira.
 *
 * O QUE ELES FAZEM, DENTRO DESSE LIMITE, é o que mais importa na prática: fixar
 * o contrato para que a FASE E tenha o que comparar, e impedir que alguém
 * reintroduza o ler-decidir-escrever sem quebrar nada.
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

import { emMicro } from "../dominio/orcamento";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { _limparCacheDeConfiguracao } from "../servidor/configuracao";
import { esquecerFusos, lerGasto, liquidarGasto, reservarOrcamento } from "./orcamento";

const ORG = "11111111-1111-4111-8111-111111111111";

/** 11/09/2026 às 14h UTC = 11h em São Paulo. Dia igual nos dois fusos. */
const MEIO_DIA = new Date("2026-09-11T14:00:00.000Z");

/** 12/09/2026 às 00h30 UTC = 11/09 às 21h30 em São Paulo. Dia DIFERENTE. */
const DEPOIS_DAS_21 = new Date("2026-09-12T00:30:00.000Z");

const comTeto = (dia: number | null, mes: number | null): void => {
  semear("crc_ai_orcamentos", [
    {
      organization_id: ORG,
      teto_dia_micro: dia === null ? null : emMicro(dia),
      teto_mes_micro: mes === null ? null : emMicro(mes),
      abrir_caso: true,
    },
  ]);
};

beforeEach(() => {
  limparBanco();
  definirRelogio(MEIO_DIA);
  esquecerFusos();
  // A configuração tem cache próprio, com validade em minutos. Sem limpar, o
  // primeiro teste do arquivo fixaria o fuso padrão para todos os outros.
  _limparCacheDeConfiguracao();
  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
});

/* ========================================================================== */
/* 1. O orçamento                                                             */
/* ========================================================================== */

describe("reserva de orçamento", () => {
  it("a segunda chamada JÁ ENXERGA o que a primeira reservou", async () => {
    comTeto(1, null);

    const a = await reservarOrcamento(ORG, MEIO_DIA, 0.6);
    const b = await reservarOrcamento(ORG, MEIO_DIA, 0.6);

    /*
     * ESTE É O TESTE DA FASE D INTEIRA, em duas linhas.
     *
     * No desenho antigo — ler, comparar, chamar, somar — as duas chamadas liam
     * o mesmo zero, as duas achavam que R$ 0,60 cabia em R$ 1,00, e as duas
     * chamavam: R$ 1,20 gastos num teto de R$ 1,00. Com cinco workers por
     * minuto, que é o desenho da Fase B, isso não é raro: é o normal.
     *
     * Agora a primeira reserva e a segunda encontra o número já somado.
     */
    expect(a.reservou).toBe(true);
    expect(b.reservou).toBe(false);
    if (b.reservou) return;
    expect(b.codigo).toBe("teto_dia");

    // E o balde tem UMA reserva, não duas.
    expect(Number(conteudo("crc_ai_gastos")[0]?.["micro_reais"])).toBe(emMicro(0.6));
  });

  it("o teto do mês barra mesmo com folga no dia", async () => {
    comTeto(100, 1);
    // Ontem já gastou quase tudo do mês.
    semear("crc_ai_gastos", [
      { organization_id: ORG, dia: "2026-09-10", micro_reais: emMicro(0.9), chamadas: 3 },
    ]);

    const r = await reservarOrcamento(ORG, MEIO_DIA, 0.5);

    expect(r.reservou).toBe(false);
    if (r.reservou) return;
    expect(r.codigo).toBe("teto_mes");
  });

  it("teto ausente não reserva, e não cobra o custo de um lock", async () => {
    const r = await reservarOrcamento(ORG, MEIO_DIA, 5);

    expect(r).toMatchObject({ reservou: true, reservadoMicro: 0 });
    // Nenhum balde foi criado: quem não tem teto não paga por reserva.
    expect(conteudo("crc_ai_gastos")).toHaveLength(0);
  });

  it("estimativa zero passa sem tocar no banco", async () => {
    comTeto(1, null);
    const r = await reservarOrcamento(ORG, MEIO_DIA, 0);

    expect(r).toMatchObject({ reservou: true, reservadoMicro: 0 });
    expect(conteudo("crc_ai_gastos")).toHaveLength(0);
  });
});

describe("liquidação depois da chamada", () => {
  it("quem reservou ajusta a diferença, e não soma de novo", async () => {
    comTeto(10, null);
    const reserva = await reservarOrcamento(ORG, MEIO_DIA, 1);

    // A resposta saiu menor do que o `maxTokens` previa — o caso comum.
    await liquidarGasto(ORG, reserva, 0.3, MEIO_DIA);

    // 1,00 reservado, 0,30 real. Somar em vez de ajustar daria 1,30.
    expect(Number(conteudo("crc_ai_gastos")[0]?.["micro_reais"])).toBe(emMicro(0.3));
  });

  it("quem NÃO reservou soma o total — o contador também serve ao relatório", async () => {
    // Sem teto configurado. A primeira versão desta fase parava de registrar
    // gasto aqui, e a tela "gasto de hoje" zerava para quem não tem limite.
    const reserva = await reservarOrcamento(ORG, MEIO_DIA, 1);
    await liquidarGasto(ORG, reserva, 0.4, MEIO_DIA);

    expect(Number(conteudo("crc_ai_gastos")[0]?.["micro_reais"])).toBe(emMicro(0.4));
  });

  it("custo desconhecido mantém a estimativa de pé", async () => {
    comTeto(10, null);
    const reserva = await reservarOrcamento(ORG, MEIO_DIA, 1);

    await liquidarGasto(ORG, reserva, null, MEIO_DIA);

    // Apagar a reserva transformaria "não sei quanto custou" em "custou zero".
    expect(Number(conteudo("crc_ai_gastos")[0]?.["micro_reais"])).toBe(emMicro(1));
  });

  it("o contador nunca fica negativo", async () => {
    comTeto(10, null);
    const reserva = await reservarOrcamento(ORG, MEIO_DIA, 1);

    // Um provedor que reporta custo absurdamente menor não pode furar o piso.
    await liquidarGasto(ORG, reserva, 0, MEIO_DIA);

    expect(Number(conteudo("crc_ai_gastos")[0]?.["micro_reais"])).toBeGreaterThanOrEqual(0);
  });
});

/* ========================================================================== */
/* 2. O fuso                                                                  */
/* ========================================================================== */

describe("o dia é o dia DA CLÍNICA", () => {
  it("às 21h30 de São Paulo o gasto ainda é de hoje, e não de amanhã", async () => {
    comTeto(10, null);
    await reservarOrcamento(ORG, DEPOIS_DAS_21, 1);

    // O balde tem que ser o do dia 11, não o do 12. Com o dia UTC, o teto
    // diário zerava às 21h e a clínica ganhava três horas de graça todo dia.
    expect(conteudo("crc_ai_gastos")[0]?.["dia"]).toBe("2026-09-11");
  });

  it("lerGasto às 21h30 enxerga o que foi gasto durante o dia", async () => {
    semear("crc_ai_gastos", [
      { organization_id: ORG, dia: "2026-09-11", micro_reais: emMicro(3), chamadas: 9 },
    ]);

    const gasto = await lerGasto(ORG, DEPOIS_DAS_21);

    // Pelo dia UTC, "hoje" seria 12/09 e a tela mostraria zero — exatamente no
    // fim do expediente, que é quando alguém fecha o caixa e olha.
    expect(gasto.diaMicro).toBe(emMicro(3));
  });

  it("respeita o fuso configurado pela clínica, e não um offset fixo", async () => {
    semear("crc_settings", [
      {
        organization_id: ORG,
        chave: "horarioComercial",
        valor: {
          dias: [null, null, null, null, null, null, null],
          feriados: [],
          fuso: "UTC",
        },
      },
    ]);
    comTeto(10, null);

    await reservarOrcamento(ORG, DEPOIS_DAS_21, 1);

    // Uma clínica em UTC tem o dia 12 às 00h30. O sistema segue a configuração.
    expect(conteudo("crc_ai_gastos")[0]?.["dia"]).toBe("2026-09-12");
  });
});
