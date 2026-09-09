/**
 * Entender qual horário o paciente escolheu.
 *
 * O QUE ESTES TESTES PROTEGEM não é "o sistema entende português". É que ele
 * **prefira perguntar a chutar**. Marcar consulta errada é o erro mais caro
 * desta automação: o paciente aparece na terça, a agenda diz quinta, e ninguém
 * descobre até a recepção olhar na cara dele.
 *
 * Por isso metade dos casos aqui verifica RECUSA de resposta, e não acerto.
 */
import { describe, expect, it } from "vitest";

import { interpretarEscolha, type OpcaoOferecida } from "./escolha";

/** Duas opções em dias diferentes — o caso comum de uma oferta real. */
const DUAS: OpcaoOferecida[] = [
  { inicioEm: "2026-09-10T12:20:00.000Z", horaLocal: "09:20", diaLocal: "2026-09-10" },
  { inicioEm: "2026-09-10T13:40:00.000Z", horaLocal: "10:40", diaLocal: "2026-09-10" },
];

describe("acerta o que dá para acertar", () => {
  it("casa pela hora exata", () => {
    expect(interpretarEscolha("10:40 tá ótimo", DUAS)).toEqual({ tipo: "opcao", indice: 1 });
    expect(interpretarEscolha("pode ser 09:20", DUAS)).toEqual({ tipo: "opcao", indice: 0 });
  });

  it("aceita as formas que o paciente realmente escreve", () => {
    // "10h40", "10 h 40", "10 horas" — a mesma intenção, três teclados.
    expect(interpretarEscolha("as 10h40 por favor", DUAS)).toEqual({ tipo: "opcao", indice: 1 });
    expect(interpretarEscolha("9h20 fica bom", DUAS)).toEqual({ tipo: "opcao", indice: 0 });
  });

  it("entende ordinal", () => {
    expect(interpretarEscolha("pode ser a segunda", DUAS)).toEqual({ tipo: "opcao", indice: 1 });
    expect(interpretarEscolha("quero a primeira", DUAS)).toEqual({ tipo: "opcao", indice: 0 });
  });

  it("aceita 'pode ser' quando só há uma opção na mesa", () => {
    const uma = [DUAS[0] as OpcaoOferecida];
    expect(interpretarEscolha("pode ser", uma)).toEqual({ tipo: "opcao", indice: 0 });
    // Com duas, o mesmo "pode ser" não escolhe nada — e é isso que se quer.
    expect(interpretarEscolha("pode ser", DUAS)).toEqual({ tipo: "nenhuma" });
  });

  it("resolve o relógio de 12 horas quando só uma leitura foi oferecida", () => {
    const tarde: OpcaoOferecida[] = [
      { inicioEm: "2026-09-10T17:00:00.000Z", horaLocal: "14:00", diaLocal: "2026-09-10" },
    ];
    // "as 2" num contexto comercial é 14h. Só vale porque 02:00 não foi oferecido.
    expect(interpretarEscolha("as 2 da tarde", tarde)).toEqual({ tipo: "opcao", indice: 0 });
  });
});

describe("prefere perguntar a chutar", () => {
  it("duas opções na mesma hora viram ambiguidade, não sorteio", () => {
    const mesmaHora: OpcaoOferecida[] = [
      { inicioEm: "2026-09-10T13:40:00.000Z", horaLocal: "10:40", diaLocal: "2026-09-10" },
      { inicioEm: "2026-09-11T13:40:00.000Z", horaLocal: "10:40", diaLocal: "2026-09-11" },
    ];
    expect(interpretarEscolha("10:40", mesmaHora)).toEqual({ tipo: "ambigua" });
  });

  it("hora que não foi oferecida é contraproposta, não escolha", () => {
    // Marcar 15:00 porque o paciente pediu 15:00 seria inventar horário.
    expect(interpretarEscolha("consegue 15:00?", DUAS)).toEqual({ tipo: "nenhuma" });
  });

  it("número solto não marca consulta", () => {
    // "sou o paciente 10" e "quero as 10 primeiras" existem.
    expect(interpretarEscolha("10", DUAS)).toEqual({ tipo: "nenhuma" });
  });

  it("recusa vence a hora citada", () => {
    // Este é o caso que justifica a ordem das tentativas: a frase cita 10:40 e
    // ainda assim é recusa. Ler a hora antes marcaria contra a vontade dita.
    expect(interpretarEscolha("nenhum desses, 10:40 de outro dia dá?", DUAS)).toEqual({
      tipo: "recusa",
    });
    expect(interpretarEscolha("não consigo nesses horários", DUAS)).toEqual({ tipo: "recusa" });
  });

  it("assunto diferente não vira escolha", () => {
    expect(interpretarEscolha("quanto custa o implante?", DUAS)).toEqual({ tipo: "nenhuma" });
    expect(interpretarEscolha("", DUAS)).toEqual({ tipo: "nenhuma" });
  });

  it("sem opções oferecidas, nada é escolha", () => {
    expect(interpretarEscolha("10:40", [])).toEqual({ tipo: "nenhuma" });
  });

  it("hora impossível é ignorada", () => {
    expect(interpretarEscolha("as 99:99", DUAS)).toEqual({ tipo: "nenhuma" });
  });
});
