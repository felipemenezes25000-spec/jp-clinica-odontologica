/**
 * Política de pagamento e pré-consulta.
 *
 * ============================================================================
 *  A LINHA QUE ESTES TESTES DEFENDEM:
 *
 *      INFORMAR uma condição já decidida  →  a automação pode.
 *      NEGOCIAR uma condição nova         →  a automação não pode.
 *
 *  E o corolário que mais importa: a política PADRÃO é toda fechada. Uma
 *  política que nasce permissiva é uma política que ninguém configurou — e o
 *  primeiro efeito dela seria o agente falando de parcelamento que a clínica
 *  não oferece.
 *
 *  INJEÇÃO DE DEFEITO:
 *    dar desconto padrão > 0                → "nasce fechada" quebra;
 *    permitir exceção sem alçada            → "teto rígido" quebra;
 *    fazer CONVENIO resolver por automação  → "convênio é humano" quebra;
 *    ignorar a parcela mínima               → "12× de R$ 50" quebra.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  avaliarDesconto,
  bloqueiaAtendimento,
  fraseParaOPaciente,
  opcoesDeParcelamento,
  pendenciasDaPreConsulta,
  POLITICA_PADRAO,
  type ContextoDaPreConsulta,
  type Politica,
} from "./pagamento";

function politica(parcial: Partial<Politica> = {}): Politica {
  return { ...POLITICA_PADRAO, ...parcial };
}

function preConsulta(parcial: Partial<ContextoDaPreConsulta> = {}): ContextoDaPreConsulta {
  return {
    horasAteAConsulta: 24,
    confirmada: true,
    primeiraVez: false,
    usaConvenio: false,
    convenioAutorizado: false,
    riscoDeFalta: "BAIXO",
    temDebito: false,
    ...parcial,
  };
}

/* -------------------------------------------------------------------------- */

describe("a política padrão", () => {
  it("nasce TODA fechada", () => {
    /*
     * ============================================================================
     *  Uma política que nasce permissiva é uma política que ninguém configurou —
     *  e o primeiro efeito seria o agente falando de parcelamento que a clínica
     *  não oferece.
     * ============================================================================
     */
    expect(POLITICA_PADRAO.descontoMaxPct).toBe(0);
    expect(POLITICA_PADRAO.parcelasMax).toBe(1);
    expect(POLITICA_PADRAO.aprovadorPapel).toBeNull();
    expect(POLITICA_PADRAO.textoParaPaciente).toBeNull();
  });

  it("sem texto configurado, o agente CALA", () => {
    /*
     * O silêncio sobre preço é recuperável; uma promessa errada não.
     */
    expect(fraseParaOPaciente(POLITICA_PADRAO)).toBeNull();
    expect(fraseParaOPaciente(politica({ textoParaPaciente: "   " }))).toBeNull();
  });

  it("com texto, ele cita — e não formula", () => {
    const frase = fraseParaOPaciente(
      politica({ textoParaPaciente: "  Parcelamos em até 6× sem juros no cartão.  " }),
    );

    expect(frase).toBe("Parcelamos em até 6× sem juros no cartão.");
  });
});

/* -------------------------------------------------------------------------- */

describe("o desconto", () => {
  it("dentro do teto, permite", () => {
    const v = avaliarDesconto({
      valorOriginal: 1000,
      valorProposto: 900,
      politica: politica({ descontoMaxPct: 10 }),
      papel: "recepcao",
    });

    expect(v.permitido).toBe(true);
    expect(v.pct).toBe(10);
  });

  it("acima do teto SEM alçada configurada é recusa seca", () => {
    /*
     * A política diz que o teto é rígido. Inventar um caminho de exceção aqui
     * contornaria a decisão que a clínica tomou.
     */
    const v = avaliarDesconto({
      valorOriginal: 1000,
      valorProposto: 700,
      politica: politica({ descontoMaxPct: 10, aprovadorPapel: null }),
      papel: "admin",
    });

    expect(v.permitido).toBe(false);
    if (v.permitido) return;
    expect(v.precisaDe).toBeNull();
    expect(v.motivo).toContain("alçada");
  });

  it("acima do teto COM alçada diz de quem é a alçada", () => {
    const v = avaliarDesconto({
      valorOriginal: 1000,
      valorProposto: 700,
      politica: politica({ descontoMaxPct: 10, aprovadorPapel: "gestor" }),
      papel: "recepcao",
    });

    expect(v.permitido).toBe(false);
    if (v.permitido) return;
    expect(v.precisaDe).toBe("gestor");
  });

  it("quem TEM a alçada aprova", () => {
    const v = avaliarDesconto({
      valorOriginal: 1000,
      valorProposto: 700,
      politica: politica({ descontoMaxPct: 10, aprovadorPapel: "gestor" }),
      papel: "gestor",
    });

    expect(v.permitido).toBe(true);
  });

  it("valor maior que o original não é desconto negativo", () => {
    const v = avaliarDesconto({
      valorOriginal: 1000,
      valorProposto: 1200,
      politica: politica(),
      papel: "recepcao",
    });

    expect(v.permitido).toBe(true);
    expect(v.pct).toBe(0);
  });

  it("valor original zero não divide por zero", () => {
    const v = avaliarDesconto({
      valorOriginal: 0,
      valorProposto: 0,
      politica: politica(),
      papel: "admin",
    });

    expect(v.permitido).toBe(false);
    expect(Number.isFinite(v.pct)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("o parcelamento", () => {
  it("respeita o máximo da política", () => {
    const o = opcoesDeParcelamento(1200, politica({ parcelasMax: 6, parcelasSemJuros: 3 }));

    expect(o).toHaveLength(6);
    expect(o[0]?.semJuros).toBe(true);
    expect(o[2]?.semJuros).toBe(true);
    expect(o[3]?.semJuros).toBe(false);
  });

  it("a PARCELA MÍNIMA corta a lista onde ela fica ridícula", () => {
    /*
     * ============================================================================
     *  Sem ela, R$ 600 em 12× vira parcela de R$ 50 — que custa mais para cobrar
     *  do que vale, e que a clínica não quer oferecer.
     * ============================================================================
     */
    const o = opcoesDeParcelamento(600, politica({ parcelasMax: 12, parcelaMinima: 100 }));

    expect(o.length).toBeLessThanOrEqual(6);
    expect(o.every((x) => x.parcelas === 1 || x.valorDaParcela >= 100)).toBe(true);
  });

  it("valor zero não devolve opção nenhuma", () => {
    expect(opcoesDeParcelamento(0, politica({ parcelasMax: 6 }))).toHaveLength(0);
  });

  it("a política padrão só oferece à vista", () => {
    const o = opcoesDeParcelamento(1000, POLITICA_PADRAO);
    expect(o).toHaveLength(1);
    expect(o[0]?.parcelas).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("a pré-consulta", () => {
  it("fora da janela de 72h, nada é pendência", () => {
    /*
     * Ninguém confirma com duas semanas, e cobrar documento com antecedência
     * demais é incômodo. Vazia é a resposta certa.
     */
    expect(pendenciasDaPreConsulta(preConsulta({ horasAteAConsulta: 200 }))).toHaveLength(0);
  });

  it("dentro da janela e sem confirmação, o CRC resolve sozinho", () => {
    const p = pendenciasDaPreConsulta(preConsulta({ confirmada: false }));
    const conf = p.find((x) => x.item === "CONFIRMACAO");

    expect(conf?.resolveQuem).toBe("automacao");
  });

  it("primeira consulta pede formulário E documento", () => {
    const p = pendenciasDaPreConsulta(preConsulta({ primeiraVez: true }));

    expect(p.map((x) => x.item)).toContain("FORMULARIO");
    expect(p.map((x) => x.item)).toContain("DOCUMENTO");
  });

  it("CONVÊNIO é sempre de HUMANO — e bloqueia", () => {
    /*
     * ============================================================================
     *  O §31 é nominal: nunca dizer "autorizado" sem prova externa. A autorização
     *  depende de falar com o plano, e é a única pendência que impede de verdade
     *  o atendimento — o procedimento não pode ser cobrado do plano depois.
     * ============================================================================
     */
    const p = pendenciasDaPreConsulta(
      preConsulta({ usaConvenio: true, convenioAutorizado: false }),
    );
    const conv = p.find((x) => x.item === "CONVENIO");

    expect(conv?.resolveQuem).toBe("humano");
    expect(bloqueiaAtendimento(p)).toBe(true);
  });

  it("as OUTRAS pendências NÃO bloqueiam", () => {
    /*
     * Falta de formulário se resolve na recepção em dois minutos; falta de
     * confirmação não impede ninguém de ser atendido. Chamar tudo de bloqueio
     * faria a tela gritar em todo caso, e ninguém distinguiria o que impede.
     */
    const p = pendenciasDaPreConsulta(
      preConsulta({ confirmada: false, primeiraVez: true, riscoDeFalta: "ALTO", temDebito: true }),
    );

    expect(p.length).toBeGreaterThan(3);
    expect(bloqueiaAtendimento(p)).toBe(false);
  });

  it("débito em aberto é de HUMANO — cobrar na recepção é constrangimento", () => {
    const p = pendenciasDaPreConsulta(preConsulta({ temDebito: true }));
    const deb = p.find((x) => x.item === "PAGAMENTO");

    expect(deb?.resolveQuem).toBe("humano");
    expect(deb?.detalhe).toContain("constrangimento");
  });

  it("tudo em ordem devolve lista vazia", () => {
    expect(pendenciasDaPreConsulta(preConsulta())).toHaveLength(0);
  });

  it("consulta no passado não gera pendência", () => {
    expect(
      pendenciasDaPreConsulta(preConsulta({ horasAteAConsulta: -5, confirmada: false })),
    ).toHaveLength(0);
  });
});
