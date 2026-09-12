/**
 * A conta da cadência — pura, sem banco e sem relógio de parede.
 *
 * O QUE ELA PRECISA ACERTAR são duas coisas que puxam para lados opostos:
 * espalhar o envio pelo dia sem deixar sobra para depois do fechamento.
 */
import { describe, expect, it } from "vitest";

import { cotaAcumulada, fracaoDaJanela, inicioDoDiaLocal } from "./cadencia";
import type { HorarioComercial } from "./configuracao";

/** Segunda a sexta, 08h–19h em São Paulo. Domingo fechado. */
const HORARIO: HorarioComercial = {
  dias: [
    null,
    { inicio: "08:00", fim: "19:00" },
    { inicio: "08:00", fim: "19:00" },
    { inicio: "08:00", fim: "19:00" },
    { inicio: "08:00", fim: "19:00" },
    { inicio: "08:00", fim: "19:00" },
    { inicio: "08:00", fim: "13:00" },
  ],
  feriados: ["2026-09-07"],
  fuso: "America/Sao_Paulo",
};

/**
 * Uma hora local de terça-feira, 8 de setembro de 2026.
 *
 * `Date.UTC` e não interpolação de string: São Paulo é UTC-3, e `23:00 + 3`
 * escrito à mão vira "26:00", que não é uma data. `Date.UTC` transborda para o
 * dia seguinte sozinho — que é exatamente o comportamento certo, e é o mesmo
 * transbordo que o código de produção precisa acertar.
 */
const emSP = (hhmm: string): Date => {
  const [h, m] = hhmm.split(":");
  return new Date(
    Date.UTC(2026, 8, 8, Number.parseInt(h ?? "0", 10) + 3, Number.parseInt(m ?? "0", 10)),
  );
};

/* -------------------------------------------------------------------------- */

describe("a fração da janela", () => {
  it("é zero na abertura e um no fechamento", () => {
    expect(fracaoDaJanela(emSP("08:00"), HORARIO)).toBe(0);
    expect(fracaoDaJanela(emSP("19:00"), HORARIO)).toBe(1);
  });

  it("antes de abrir é zero; depois de fechar é um", () => {
    /*
     * A ASSIMETRIA É DELIBERADA. Devolver zero depois do fechamento faria a
     * campanha "esquecer" o que já mandou e tentar de novo; devolver um antes de
     * abrir liberaria a cota inteira às 3h da manhã.
     */
    expect(fracaoDaJanela(emSP("03:00"), HORARIO)).toBe(0);
    expect(fracaoDaJanela(emSP("22:00"), HORARIO)).toBe(1);
  });

  it("no meio da janela, é proporcional", () => {
    // 13h30 de uma janela 08h–19h: 5h30 de 11h.
    expect(fracaoDaJanela(emSP("13:30"), HORARIO)).toBeCloseTo(0.5, 5);
  });

  it("dia sem janela e feriado devolvem um, e não zero", () => {
    /*
     * Quem decide não enviar em feriado é a política de contato. Devolver zero
     * aqui proibiria pelo segundo caminho, e um envio bloqueado teria duas
     * causas possíveis — que é como um sintoma deixa de apontar para a causa.
     */
    const domingo = new Date("2026-09-13T15:00:00.000Z");
    expect(fracaoDaJanela(domingo, HORARIO)).toBe(1);

    const feriado = new Date("2026-09-07T15:00:00.000Z");
    expect(fracaoDaJanela(feriado, HORARIO)).toBe(1);
  });
});

describe("a cota acumulada", () => {
  it("libera a primeira mensagem já na primeira volta", () => {
    // Com `floor`, uma campanha de 10/dia numa janela de 11h só mandaria a
    // primeira depois de mais de uma hora.
    expect(cotaAcumulada(10, emSP("08:15"), HORARIO)).toBe(1);
  });

  it("ATINGE a meta antes do fechamento, e não no minuto dele", () => {
    /*
     * ========================================================================
     *  ESTE É O TESTE QUE NASCEU DE UMA FALHA REAL: 96 de 100.
     *
     *  Com a proporção pura, `porDia` só é alcançado quando a fração chega a 1
     *  — ou seja, no minuto do FECHAMENTO. E nesse minuto a política de contato
     *  já recusa: as últimas mensagens do dia não saem. Todo dia, sempre as
     *  mesmas últimas, sem erro nenhum.
     * ========================================================================
     */
    expect(cotaAcumulada(100, emSP("18:00"), HORARIO)).toBe(100);
    // E ainda há uma hora de janela para o pulso entregá-las.
    expect(fracaoDaJanela(emSP("18:00"), HORARIO)).toBeLessThan(1);
  });

  it("não passa da meta", () => {
    expect(cotaAcumulada(100, emSP("18:59"), HORARIO)).toBe(100);
    expect(cotaAcumulada(100, emSP("23:00"), HORARIO)).toBe(100);
  });

  it("meta zero não libera nada", () => {
    expect(cotaAcumulada(0, emSP("13:00"), HORARIO)).toBe(0);
  });
});

describe("o início do dia", () => {
  it("é meia-noite NA CLÍNICA, e não no servidor", () => {
    /*
     * ========================================================================
     *  `setHours(0,0,0,0)` — o que estava no código — usa o fuso do PROCESSO.
     *  Na Vercel isso é UTC, então o contador diário da campanha virava às 21h
     *  de São Paulo: a partir dali ela esquecia tudo que tinha mandado e
     *  liberava a cota inteira de novo. Cem durante o dia, cem de madrugada — e
     *  o relatório mostrando dois dias dentro da meta.
     * ========================================================================
     */
    // 22h de São Paulo = 01h UTC do dia seguinte.
    const noite = new Date("2026-09-09T01:00:00.000Z");
    const inicio = inicioDoDiaLocal(noite, "America/Sao_Paulo");

    // O dia local ainda é 8 de setembro: meia-noite em SP = 03h UTC do dia 8.
    expect(inicio.toISOString()).toBe("2026-09-08T03:00:00.000Z");
  });

  it("no começo do dia local, devolve o próprio instante", () => {
    const meiaNoite = new Date("2026-09-08T03:00:00.000Z");
    expect(inicioDoDiaLocal(meiaNoite, "America/Sao_Paulo").toISOString()).toBe(
      "2026-09-08T03:00:00.000Z",
    );
  });
});
