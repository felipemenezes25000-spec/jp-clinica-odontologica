/**
 * Risco de falta.
 *
 * ============================================================================
 *  O TESTE MAIS IMPORTANTE DESTE ARQUIVO É O ÚLTIMO: o modelo não pode usar
 *  atributo protegido.
 *
 *  Não é só o §17. É que nenhum deles prevê falta, e usá-los produz um sistema
 *  que trata pior quem mora longe — quando quem mora longe e vem assim mesmo é
 *  o paciente mais fiel que a clínica tem.
 *
 *  O teste é estrutural: o TIPO de contexto não tem campo de idade, gênero,
 *  bairro ou convênio. Acrescentar um obrigaria a mexer no tipo, e isso aparece
 *  na revisão.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  calcularRiscoDeFalta,
  ehDiaDeRisco,
  ehHorarioExtremo,
  VERSAO_DO_RISCO,
  type ContextoDeFalta,
} from "./no-show";

function ctx(parcial: Partial<ContextoDeFalta> = {}): ContextoDeFalta {
  return {
    consultasConcluidas: 3,
    faltas: 0,
    faltouNaUltima: false,
    remarcacoes: 0,
    horasDeAntecedencia: 24 * 7,
    confirmada: false,
    horasAteAConsulta: 24 * 5,
    primeiraVez: false,
    respondeMensagens: true,
    horarioExtremo: false,
    diaDeRisco: false,
    ...parcial,
  };
}

/* -------------------------------------------------------------------------- */

describe("o histórico de falta", () => {
  it("faltar na ÚLTIMA pesa mais que a taxa histórica", () => {
    /*
     * Alguém com 20 consultas e 2 faltas antigas é um paciente fiel; alguém com
     * 3 consultas e a última falta é outra história. A taxa sozinha (ambos
     * ~10%) não distingue os dois, e é por isso que a última tem fator próprio.
     */
    const antigo = calcularRiscoDeFalta(ctx({ consultasConcluidas: 18, faltas: 2 }));
    const recente = calcularRiscoDeFalta(
      ctx({ consultasConcluidas: 2, faltas: 1, faltouNaUltima: true }),
    );

    expect(recente.pontos).toBeGreaterThan(antigo.pontos + 20);
  });

  it("quem nunca faltou e vem sempre é risco BAIXO", () => {
    const r = calcularRiscoDeFalta(ctx({ consultasConcluidas: 12, confirmada: true }));

    expect(r.nivel).toBe("BAIXO");
    expect(r.acao).toContain("lembrete padrão");
  });

  it("quem faltou muito e não confirmou é ALTO", () => {
    const r = calcularRiscoDeFalta(
      ctx({
        consultasConcluidas: 2,
        faltas: 3,
        faltouNaUltima: true,
        confirmada: false,
        horasAteAConsulta: 12,
      }),
    );

    expect(r.nivel).toBe("ALTO");
  });
});

describe("a confirmação", () => {
  it("confirmar DERRUBA o risco — é o que faz a intervenção valer a pena", () => {
    const semConfirmar = calcularRiscoDeFalta(
      ctx({ faltas: 2, confirmada: false, horasAteAConsulta: 12 }),
    );
    const confirmada = calcularRiscoDeFalta(
      ctx({ faltas: 2, confirmada: true, horasAteAConsulta: 12 }),
    );

    expect(confirmada.pontos).toBeLessThan(semConfirmar.pontos - 30);
  });

  it("não ter confirmado só pesa PERTO da hora", () => {
    /*
     * Ninguém confirma uma consulta que é daqui a duas semanas. Pesar a falta
     * de confirmação ali produziria "risco alto" para a agenda inteira do mês
     * que vem — e um alerta que dispara para tudo não é alerta.
     */
    const longe = calcularRiscoDeFalta(ctx({ confirmada: false, horasAteAConsulta: 24 * 14 }));
    const amanha = calcularRiscoDeFalta(ctx({ confirmada: false, horasAteAConsulta: 12 }));

    expect(longe.fatores.some((f) => f.chave === "confirmacao")).toBe(false);
    expect(amanha.fatores.some((f) => f.chave === "confirmacao")).toBe(true);
  });
});

describe("a antecedência", () => {
  it("marcada com dois meses pesa; marcada ontem alivia", () => {
    const antiga = calcularRiscoDeFalta(ctx({ horasDeAntecedencia: 24 * 60 }));
    const fresca = calcularRiscoDeFalta(ctx({ horasDeAntecedencia: 24 }));

    expect(antiga.pontos).toBeGreaterThan(fresca.pontos);
  });
});

describe("a escala", () => {
  it("nunca passa de 100, nem com todos os sinais ruins", () => {
    const r = calcularRiscoDeFalta(
      ctx({
        consultasConcluidas: 0,
        faltas: 9,
        faltouNaUltima: true,
        remarcacoes: 5,
        horasDeAntecedencia: 24 * 90,
        confirmada: false,
        horasAteAConsulta: 5,
        primeiraVez: true,
        respondeMensagens: false,
        horarioExtremo: true,
        diaDeRisco: true,
      }),
    );

    expect(r.pontos).toBeLessThanOrEqual(100);
    expect(r.nivel).toBe("ALTO");
  });

  it("nunca cai abaixo de zero, nem com todos os sinais bons", () => {
    const r = calcularRiscoDeFalta(
      ctx({ consultasConcluidas: 30, confirmada: true, horasDeAntecedencia: 12 }),
    );

    expect(r.pontos).toBeGreaterThanOrEqual(0);
    expect(r.nivel).toBe("BAIXO");
  });

  it("carrega a versão da régua", () => {
    expect(calcularRiscoDeFalta(ctx()).versao).toBe(VERSAO_DO_RISCO);
  });
});

describe("a ação recomendada", () => {
  it("risco alto NÃO é 'ligar mais' — é preparar encaixe", () => {
    /*
     * ============================================================================
     *  A DECISÃO DE PRODUTO DESTE ARQUIVO.
     *
     *  Insistir com quem vai faltar não faz a pessoa vir: ela já decidiu, ou a
     *  vida decidiu por ela. O que recupera a hora é deixar a lista de espera
     *  pronta para ocupar a cadeira.
     *
     *  A clínica não controla se a pessoa vem. Controla se a cadeira fica vazia.
     * ============================================================================
     */
    const r = calcularRiscoDeFalta(
      ctx({ faltas: 4, faltouNaUltima: true, consultasConcluidas: 1, confirmada: true }),
    );

    expect(r.nivel).toBe("ALTO");
    expect(r.acao.toLowerCase()).toContain("encaixe");
  });

  it("toda avaliação traz fatores legíveis", () => {
    const casos: Partial<ContextoDeFalta>[] = [
      {},
      { faltouNaUltima: true },
      { confirmada: true },
      { primeiraVez: true },
      { remarcacoes: 3 },
      { respondeMensagens: false },
      { consultasConcluidas: 20 },
    ];

    for (const c of casos) {
      const r = calcularRiscoDeFalta(ctx(c));
      expect(
        r.fatores.every((f) => f.rotulo.length > 3),
        JSON.stringify(c),
      ).toBe(true);
      expect(r.acao.length, JSON.stringify(c)).toBeGreaterThan(10);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("horário e dia", () => {
  it("extremos do dia", () => {
    expect(ehHorarioExtremo(8)).toBe(true);
    expect(ehHorarioExtremo(19)).toBe(true);
    expect(ehHorarioExtremo(14)).toBe(false);
  });

  it("segunda de manhã e sexta à tarde", () => {
    expect(ehDiaDeRisco(1, 9)).toBe(true);
    expect(ehDiaDeRisco(5, 16)).toBe(true);
    expect(ehDiaDeRisco(3, 10)).toBe(false);
    expect(ehDiaDeRisco(1, 15)).toBe(false);
  });

  it("pesam POUCO — senão a clínica para de marcar segunda de manhã", () => {
    /*
     * São regularidades reais e fracas. Peso grande faria a clínica concluir
     * que "segunda de manhã é ruim" e parar de usar o horário — quando o
     * problema é o lembrete, não o dia.
     */
    const comum = calcularRiscoDeFalta(ctx());
    const ruim = calcularRiscoDeFalta(ctx({ horarioExtremo: true, diaDeRisco: true }));

    expect(ruim.pontos - comum.pontos).toBeLessThanOrEqual(12);
  });
});

/* -------------------------------------------------------------------------- */

describe("os atributos que o modelo NÃO pode usar", () => {
  it("o contexto não tem idade, gênero, bairro nem convênio", () => {
    /*
     * ============================================================================
     *  TESTE ESTRUTURAL, e é de propósito.
     *
     *  Não dá para testar "o modelo não usa bairro" olhando a saída: ele não usa
     *  porque o dado não chega até ele. Esta asserção prende o TIPO — acrescentar
     *  um desses campos quebra aqui, e aparece na revisão.
     * ============================================================================
     */
    const chaves = Object.keys(ctx());
    const proibidos = ["idade", "genero", "sexo", "bairro", "cep", "convenio", "renda", "nome"];

    for (const p of proibidos) {
      expect(
        chaves.some((k) => k.toLowerCase().includes(p)),
        p,
      ).toBe(false);
    }
  });
});
