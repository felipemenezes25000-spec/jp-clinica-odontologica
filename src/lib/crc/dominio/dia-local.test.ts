/**
 * O dia da clínica — Fase D.
 *
 * O TESTE DECISIVO é o das 21h: se ele passa com `toISOString().slice(0,10)`,
 * ele não está testando nada. Por isso quase todos os casos aqui usam instantes
 * entre 21h e meia-noite de São Paulo, que é a janela em que o dia UTC e o dia
 * local discordam.
 */
import { describe, expect, it } from "vitest";

import {
  diaLocal,
  diasLocaisEntre,
  FUSO_PADRAO,
  primeiroDiaDoMesLocal,
  proximaViradaDeDia,
} from "./dia-local";

describe("diaLocal", () => {
  it("às 21h de São Paulo ainda é o mesmo dia — o UTC já virou", () => {
    // 2026-09-11T21:30 em São Paulo = 2026-09-12T00:30Z.
    const instante = new Date("2026-09-12T00:30:00.000Z");

    expect(diaLocal(instante, FUSO_PADRAO)).toBe("2026-09-11");
    // A prova de que o teste morde: o caminho antigo dava outro dia.
    expect(instante.toISOString().slice(0, 10)).toBe("2026-09-12");
  });

  it("de manhã os dois concordam", () => {
    const instante = new Date("2026-09-11T13:00:00.000Z");
    expect(diaLocal(instante, FUSO_PADRAO)).toBe("2026-09-11");
  });

  it("vira o dia exatamente às 00:00 locais", () => {
    expect(diaLocal(new Date("2026-09-12T02:59:59.000Z"), FUSO_PADRAO)).toBe("2026-09-11");
    expect(diaLocal(new Date("2026-09-12T03:00:00.000Z"), FUSO_PADRAO)).toBe("2026-09-12");
  });

  it("respeita outros fusos, e não um offset fixo", () => {
    const instante = new Date("2026-09-12T00:30:00.000Z");
    expect(diaLocal(instante, "America/Sao_Paulo")).toBe("2026-09-11");
    expect(diaLocal(instante, "UTC")).toBe("2026-09-12");
    expect(diaLocal(instante, "Asia/Tokyo")).toBe("2026-09-12");
  });

  it("fuso inválido cai no padrão em vez de lançar", () => {
    // Um campo de configuração digitado errado não pode derrubar o turno que
    // está somando o gasto de uma chamada que já aconteceu.
    const instante = new Date("2026-09-12T00:30:00.000Z");
    expect(diaLocal(instante, "Marte/Olympus")).toBe("2026-09-11");
  });

  it("usa São Paulo quando ninguém informa fuso", () => {
    expect(diaLocal(new Date("2026-09-12T00:30:00.000Z"))).toBe("2026-09-11");
  });
});

describe("primeiroDiaDoMesLocal", () => {
  it("na virada do mês, olha o mês LOCAL", () => {
    // 2026-09-30T21:30 local = 2026-10-01T00:30Z. Pelo UTC já é outubro, e a
    // janela do teto mensal começaria no dia 1º — zerando o mês um dia cedo.
    const instante = new Date("2026-10-01T00:30:00.000Z");

    expect(primeiroDiaDoMesLocal(instante, FUSO_PADRAO)).toBe("2026-09-01");
    expect(`${instante.toISOString().slice(0, 7)}-01`).toBe("2026-10-01");
  });
});

describe("proximaViradaDeDia", () => {
  it("devolve a meia-noite local seguinte, em UTC", () => {
    const instante = new Date("2026-09-11T18:00:00.000Z"); // 15h em SP
    const virada = proximaViradaDeDia(instante, FUSO_PADRAO);

    // 2026-09-12T00:00 em SP = 2026-09-12T03:00Z.
    expect(virada.toISOString()).toBe("2026-09-12T03:00:00.000Z");
  });

  it("das 21h locais, a virada é daqui a três horas — não daqui a 27", () => {
    const instante = new Date("2026-09-12T00:30:00.000Z"); // 21h30 em SP
    const virada = proximaViradaDeDia(instante, FUSO_PADRAO);

    expect(virada.toISOString()).toBe("2026-09-12T03:00:00.000Z");
    expect(virada.getTime() - instante.getTime()).toBe(2.5 * 3_600_000);
  });

  it("a virada é sempre no futuro, em qualquer hora do dia", () => {
    for (let h = 0; h < 24; h += 1) {
      const instante = new Date(Date.UTC(2026, 8, 11, h, 17, 0));
      expect(proximaViradaDeDia(instante, FUSO_PADRAO).getTime()).toBeGreaterThan(
        instante.getTime(),
      );
    }
  });
});

describe("diasLocaisEntre", () => {
  it("uma hora que atravessa a meia-noite conta como um dia", () => {
    // 23h30 de 11/09 → 00h30 de 12/09, hora local. São 60 minutos e é um dia.
    const de = new Date("2026-09-12T02:30:00.000Z");
    const ate = new Date("2026-09-12T03:30:00.000Z");

    expect(diasLocaisEntre(de, ate, FUSO_PADRAO)).toBe(1);
    // Dividir milissegundos por 86.400.000 responderia zero — e é assim que se
    // escreve um recall de 30 dias que nunca dispara no dia certo.
    expect(Math.floor((ate.getTime() - de.getTime()) / 86_400_000)).toBe(0);
  });

  it("vinte e três horas dentro do mesmo dia contam como zero", () => {
    const de = new Date("2026-09-11T03:10:00.000Z"); // 00h10 local
    const ate = new Date("2026-09-12T02:50:00.000Z"); // 23h50 local, mesmo dia
    expect(diasLocaisEntre(de, ate, FUSO_PADRAO)).toBe(0);
  });

  it("conta para trás quando a ordem se inverte", () => {
    const a = new Date("2026-09-11T15:00:00.000Z");
    const b = new Date("2026-10-11T15:00:00.000Z");
    expect(diasLocaisEntre(a, b, FUSO_PADRAO)).toBe(30);
    expect(diasLocaisEntre(b, a, FUSO_PADRAO)).toBe(-30);
  });
});
