/**
 * O Centro de Autonomia — e o que estes testes realmente protegem.
 *
 * ============================================================================
 *  A REGRA QUE VALE MAIS QUE TODAS AS OUTRAS AQUI:
 *
 *      O NÍVEL NUNCA PASSA POR CIMA DA FLAG.
 *
 *  Sem ela, o Centro de Autonomia vira um SEGUNDO caminho para ligar envio
 *  automático — e o kill switch de madrugada deixa de ser confiável, porque
 *  alguém precisaria lembrar de desligar os dois lugares.
 *
 *  Os testes de precedência abaixo existem para que essa regra quebre alto se
 *  alguém "simplificar" a checagem para `nivel >= minimo`.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  CATALOGO,
  ESCADA,
  descreverDominio,
  descreverNivel,
  deveObservar,
  deveSugerir,
  nivelValido,
  podeAgir,
  type PedidoDeAcao,
} from "./autonomia";

const TUDO_LIGADO: Readonly<Record<string, boolean>> = {
  ai_agente_envio: true,
  automatic_whatsapp: true,
  auto_scheduling: true,
  dental_office_writeback: true,
};

function pedido(parcial: Partial<PedidoDeAcao> = {}): PedidoDeAcao {
  return {
    dominio: "mensagens",
    risco: "BAIXO",
    nivel: 5,
    flags: TUDO_LIGADO,
    killSwitch: false,
    ...parcial,
  };
}

/* -------------------------------------------------------------------------- */

describe("a escada", () => {
  it("tem seis degraus, indexados pelo próprio nível", () => {
    expect(ESCADA).toHaveLength(6);
    for (let i = 0; i < 6; i += 1) {
      expect(ESCADA[i]?.nivel).toBe(i);
      expect(descreverNivel(i as 0 | 1 | 2 | 3 | 4 | 5).nivel).toBe(i);
    }
  });

  it("observar começa no 1, sugerir no 2", () => {
    expect(deveObservar(0)).toBe(false);
    expect(deveObservar(1)).toBe(true);
    expect(deveSugerir(1)).toBe(false);
    expect(deveSugerir(2)).toBe(true);
  });

  it("todo domínio do catálogo tem rótulo e explicação", () => {
    for (const d of CATALOGO) {
      expect(d.rotulo.length).toBeGreaterThan(0);
      expect(d.explicacao.length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("a precedência das recusas", () => {
  it("o kill switch ganha de tudo, inclusive do autopilot com tudo ligado", () => {
    const v = podeAgir(pedido({ killSwitch: true, nivel: 5 }));

    expect(v.pode).toBe(false);
    if (v.pode) return;
    expect(v.motivo).toContain("Kill switch");
    // E NÃO sugere aprovação humana: no meio de um incidente, a fila de
    // aprovação não é o lugar para onde o trabalho deve escorrer.
    expect(v.sugestao).toBe("NADA");
  });

  it("a flag desligada recusa mesmo no nível 5", () => {
    /*
     * É O TESTE QUE IMPEDE O CENTRO DE AUTONOMIA DE VIRAR UM BYPASS.
     * Nível máximo, sem kill switch, risco baixo — e continua recusando,
     * porque `ai_agente_envio` é o teto do domínio.
     */
    const v = podeAgir(
      pedido({ nivel: 5, risco: "BAIXO", flags: { ...TUDO_LIGADO, ai_agente_envio: false } }),
    );

    expect(v.pode).toBe(false);
    if (v.pode) return;
    expect(v.motivo).toContain("ai_agente_envio");
    expect(v.motivo).toContain("teto");
  });

  it("com kill switch E flag desligada, o motivo mostrado é o kill switch", () => {
    /*
     * A MENSAGEM PRECISA SER O MOTIVO REAL. Invertida, a clínica leria "ligue a
     * flag" e alguém ligaria — às três da manhã, no meio do incidente que
     * motivou o kill switch.
     */
    const v = podeAgir(
      pedido({ killSwitch: true, flags: { ...TUDO_LIGADO, ai_agente_envio: false } }),
    );

    expect(v.pode).toBe(false);
    if (v.pode) return;
    expect(v.motivo).toContain("Kill switch");
    expect(v.motivo).not.toContain("ai_agente_envio");
  });

  it("flag AUSENTE é flag desligada — o caso da voz", () => {
    /*
     * `voice_ai` não existe no catálogo de flags: não há provedor de voz ligado.
     * `flags["voice_ai"]` é `undefined`, e tratar `undefined` como permitido
     * abriria justamente o domínio que menos está pronto.
     */
    const v = podeAgir(pedido({ dominio: "voz", nivel: 5, risco: "BAIXO" }));

    expect(v.pode).toBe(false);
    if (v.pode) return;
    expect(v.motivo).toContain("voice_ai");
  });
});

/* -------------------------------------------------------------------------- */

describe("o nível mínimo por risco", () => {
  it("risco baixo precisa de 3", () => {
    expect(podeAgir(pedido({ risco: "BAIXO", nivel: 2 })).pode).toBe(false);
    expect(podeAgir(pedido({ risco: "BAIXO", nivel: 3 })).pode).toBe(true);
  });

  it("risco médio precisa de 4", () => {
    expect(podeAgir(pedido({ risco: "MEDIO", nivel: 3 })).pode).toBe(false);
    expect(podeAgir(pedido({ risco: "MEDIO", nivel: 4 })).pode).toBe(true);
  });

  it("risco alto exige 5 — o 4 não basta", () => {
    /*
     * O nível 4 é "executa e escala": age sozinho e chama gente quando vê algo
     * estranho. Mas "estranho" é julgamento NOSSO, e para o que é caro de
     * desfazer o critério não pode ser o nosso julgamento.
     */
    expect(podeAgir(pedido({ risco: "ALTO", nivel: 4 })).pode).toBe(false);
    expect(podeAgir(pedido({ risco: "ALTO", nivel: 5 })).pode).toBe(true);
  });

  it("nível 0 não manda nem para a fila de aprovação", () => {
    const v = podeAgir(pedido({ nivel: 0 }));
    expect(v.pode).toBe(false);
    if (v.pode) return;
    // Desligado que enche fila de aprovação é uma fila crescendo em silêncio.
    expect(v.sugestao).toBe("NADA");
  });

  it("nível intermediário manda para aprovação humana", () => {
    const v = podeAgir(pedido({ nivel: 2, risco: "MEDIO" }));
    expect(v.pode).toBe(false);
    if (v.pode) return;
    expect(v.sugestao).toBe("APROVACAO_HUMANA");
  });
});

/* -------------------------------------------------------------------------- */

describe("o domínio sem efeito externo próprio", () => {
  it("marketing não tem teto de flag: quem envia é campanhas", () => {
    expect(descreverDominio("marketing").tetoDaFlag).toBeNull();

    // Com nível suficiente, decide — mesmo com todo envio desligado, porque a
    // decisão dele não fala com ninguém.
    const v = podeAgir(pedido({ dominio: "marketing", risco: "MEDIO", nivel: 4, flags: {} }));
    expect(v.pode).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("o nível vindo do banco", () => {
  it("recusa fechando: qualquer coisa fora de 0..5 vira 0", () => {
    expect(nivelValido(9)).toBe(0);
    expect(nivelValido(-1)).toBe(0);
    expect(nivelValido(null)).toBe(0);
    expect(nivelValido("banana")).toBe(0);
    expect(nivelValido(Number.NaN)).toBe(0);
    expect(nivelValido(3.9)).toBe(3);
    expect(nivelValido("4")).toBe(4);
  });
});
