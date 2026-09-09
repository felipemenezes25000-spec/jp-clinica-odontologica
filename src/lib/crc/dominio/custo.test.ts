/**
 * Testes da estimativa de custo do WhatsApp.
 *
 * O QUE ESTES TESTES PROTEGEM não é a aritmética — é a decisão. O número que
 * eles verificam é o que aparece ao lado de "964 entram nesse filtro", e o
 * único jeito de ele cumprir a função é estar certo na ordem de grandeza e
 * nunca para baixo.
 *
 * Por isso há um teste que afirma R$ 301,25 para 964 pessoas: se alguém trocar
 * a categoria de campanha para utilidade "porque a mensagem é sobre a consulta
 * dele", o número cai para R$ 32,78 e este teste quebra antes do deploy.
 */
import { describe, expect, it } from "vitest";

import {
  CATEGORIA_DO_MODELO,
  FRANQUIA_SERVICO_MES,
  categoriaDeCampanha,
  categoriaDoModelo,
  estimarCusto,
  reais,
  tarifaVigente,
} from "./custo";
import { TEMPLATES_PADRAO } from "../automacao/templates";

const ANTES = new Date("2026-09-09T12:00:00.000Z");
const DEPOIS = new Date("2026-10-01T00:00:00.000Z");

describe("estimativa de custo", () => {
  it("cobra marketing nove vezes mais caro que utilidade", () => {
    const marketing = estimarCusto(1000, "marketing", ANTES).total;
    const utilidade = estimarCusto(1000, "utilidade", ANTES).total;
    expect(marketing).toBeCloseTo(312.5, 2);
    expect(utilidade).toBeCloseTo(34, 2);
    expect(marketing / utilidade).toBeGreaterThan(9);
  });

  it("dá o número que aparece ao lado do público da campanha", () => {
    // 964 pessoas — o caso concreto que motivou a funcionalidade inteira.
    const e = estimarCusto(964, categoriaDeCampanha(), ANTES);
    expect(e.categoria).toBe("marketing");
    expect(reais(e.total)).toBe(reais(301.25));
  });

  it("arredonda para cima, nunca para baixo", () => {
    // 3 × 0,3125 = 0,9375. Para baixo daria R$ 0,93 — a fatura viria 0,94.
    expect(estimarCusto(3, "marketing", ANTES).total).toBeCloseTo(0.94, 2);
  });

  it("trata público vazio, negativo e quebrado como zero", () => {
    expect(estimarCusto(0, "marketing", ANTES).total).toBe(0);
    expect(estimarCusto(-40, "marketing", ANTES).total).toBe(0);
    expect(estimarCusto(Number.NaN, "marketing", ANTES).total).toBe(0);
  });
});

describe("a virada de 01/10/2026", () => {
  it("responder paciente é gratuito antes da data", () => {
    const e = estimarCusto(5000, "servico", ANTES);
    expect(e.total).toBe(0);
    expect(e.gratuitoPorEnquanto).toBe(true);
    expect(tarifaVigente("servico", ANTES)).toBe(0);
  });

  it("passa a custar como utilidade a partir dela", () => {
    expect(tarifaVigente("servico", DEPOIS)).toBeCloseTo(0.034, 3);
    expect(estimarCusto(5000, "servico", DEPOIS).gratuitoPorEnquanto).toBe(false);
  });

  it("libera as primeiras mil do mês e cobra o excedente", () => {
    expect(estimarCusto(FRANQUIA_SERVICO_MES, "servico", DEPOIS).total).toBe(0);
    // 1.200 no mês: 200 cobradas × R$ 0,034 = R$ 6,80.
    expect(estimarCusto(1200, "servico", DEPOIS).total).toBeCloseTo(6.8, 2);
  });

  it("aplica a franquia sobre o mês, e não sobre cada lote", () => {
    // Segundo lote de 200 com 1.000 já enviadas: tudo cobrado.
    const segundo = estimarCusto(200, "servico", DEPOIS, FRANQUIA_SERVICO_MES);
    expect(segundo.cobradas).toBe(200);
    expect(segundo.total).toBeCloseTo(6.8, 2);
  });

  it("a virada não mexe nas outras categorias", () => {
    expect(tarifaVigente("marketing", ANTES)).toBe(tarifaVigente("marketing", DEPOIS));
    expect(tarifaVigente("utilidade", ANTES)).toBe(tarifaVigente("utilidade", DEPOIS));
  });
});

describe("a categoria de cada modelo", () => {
  it("classifica os 17 modelos do catálogo — nenhum cai no padrão", () => {
    // Sem este teste, renomear um modelo o deixaria silenciosamente em
    // "marketing" por fallback, e a estimativa da jornada ficaria 9x errada.
    for (const chave of Object.keys(TEMPLATES_PADRAO)) {
      expect(CATEGORIA_DO_MODELO[chave], `modelo sem categoria: ${chave}`).toBeDefined();
    }
    expect(Object.keys(CATEGORIA_DO_MODELO).sort()).toEqual(Object.keys(TEMPLATES_PADRAO).sort());
  });

  it("chuta para o lado caro quando não conhece o modelo", () => {
    expect(categoriaDoModelo("modelo_que_alguem_criou_hoje")).toBe("marketing");
  });

  it("recall e reativação são marketing, não utilidade", () => {
    // Reclassificar para baixo é o erro que a Meta pune. Ver o comentário em
    // CATEGORIA_DO_MODELO.
    expect(categoriaDoModelo("recall_seis_meses")).toBe("marketing");
    expect(categoriaDoModelo("reativacao_inativo")).toBe("marketing");
    expect(categoriaDoModelo("aniversario")).toBe("marketing");
  });

  it("cobrança e confirmação são utilidade", () => {
    expect(categoriaDoModelo("cobranca_atrasada")).toBe("utilidade");
    expect(categoriaDoModelo("confirmacao_consulta")).toBe("utilidade");
  });

  it("campanha é sempre marketing, independente do texto", () => {
    expect(categoriaDeCampanha()).toBe("marketing");
  });
});
