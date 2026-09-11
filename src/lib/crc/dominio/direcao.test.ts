/**
 * Testes da direção da mensagem.
 *
 * ESTE ARQUIVO PROVA A CORREÇÃO DE UM BUG QUE TROCAVA PACIENTE POR CLÍNICA — e,
 * mais importante, prova o valor que o BANCO usa, não o que o código inventou.
 *
 * A versão anterior lia `direcao === "IN"`. Os testes semeavam `"IN"`. Os dois
 * concordavam, e o schema dizia `ENTRADA`. É por isso que o primeiro `it` aqui
 * usa exatamente as strings do `02-crc-schema.sql`.
 */
import { describe, expect, it } from "vitest";

import { comoNoTurno, ehDoPaciente, lerDirecao } from "./direcao";

describe("os valores que o banco guarda", () => {
  it("ENTRADA é do paciente", () => {
    expect(lerDirecao("ENTRADA")).toBe("ENTRADA");
    expect(ehDoPaciente("ENTRADA")).toBe(true);
    expect(comoNoTurno("ENTRADA")).toBe("recebida");
  });

  it("SAIDA é da clínica", () => {
    expect(lerDirecao("SAIDA")).toBe("SAIDA");
    expect(ehDoPaciente("SAIDA")).toBe(false);
    expect(comoNoTurno("SAIDA")).toBe("enviada");
  });
});

describe("o que quebrava antes", () => {
  it("o runtime lia ENTRADA como se fosse da clínica", () => {
    // A expressão antiga era:
    //   direcao === "IN" || direcao === "recebida" ? "recebida" : "enviada"
    // Com o valor real do banco, ela caía no `else`.
    const comoEra = (d: string): string =>
      d === "IN" || d === "recebida" ? "recebida" : "enviada";

    expect(comoEra("ENTRADA")).toBe("enviada"); // o bug
    expect(comoNoTurno("ENTRADA")).toBe("recebida"); // a correção
  });
});

describe("apelidos históricos", () => {
  it("são aceitos na leitura, para linha gravada por caminho desconhecido", () => {
    for (const apelido of ["IN", "in", "recebida", "inbound"]) {
      expect(ehDoPaciente(apelido), apelido).toBe(true);
    }
    for (const apelido of ["OUT", "enviada", "outbound"]) {
      expect(ehDoPaciente(apelido), apelido).toBe(false);
    }
  });

  it("aceita variação de caixa e espaço", () => {
    expect(ehDoPaciente(" entrada ")).toBe(true);
    expect(ehDoPaciente("Entrada")).toBe(true);
  });
});

describe("o padrão errando para o lado seguro", () => {
  /*
   * Um valor irreconhecível tratado como ENTRADA abriria a janela de 24 horas e
   * contaria como mensagem do paciente — isto é, liberaria falar. Tratado como
   * SAIDA, no máximo deixa a janela fechada e exige template.
   */
  it("valor desconhecido não vira mensagem de paciente", () => {
    for (const lixo of ["", "qualquer", "0", null, undefined, 42, {}]) {
      expect(ehDoPaciente(lixo), String(lixo)).toBe(false);
    }
  });
});
