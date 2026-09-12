/**
 * Resolução de identidade.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o do telefone de família.
 *
 *  Mãe e filho de oito anos compartilham o número. O sistema resolve por
 *  telefone, escreve no prontuário errado — ou manda para o menor uma mensagem
 *  destinada à mãe.
 *
 *  A saída correta não é escolher melhor: é RECUSAR ESCOLHER. Se algum dia
 *  `resolver()` passar a devolver UNICO num identificador compartilhado, o
 *  teste cai.
 *
 *  INJEÇÃO DE DEFEITO:
 *    ignorar `compartilhado`        → "telefone de família" quebra;
 *    deixar nome iniciar suspeita   → "nome não funde sozinho" quebra;
 *    aceitar telefone de 4 dígitos  → "recusa lixo" quebra.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  compararCadastros,
  CONFIANCA_PARA_SUGERIR,
  forcaDoIdentificador,
  nomeParecido,
  normalizar,
  resolver,
  type Candidato,
  type ParaComparar,
} from "./identidade";

function candidato(parcial: Partial<Candidato> = {}): Candidato {
  return {
    patientId: "p1",
    nome: "Ana Souza",
    porQual: "TELEFONE",
    compartilhado: false,
    confirmado: false,
    ...parcial,
  };
}

function cadastro(parcial: Partial<ParaComparar> = {}): ParaComparar {
  return {
    patientId: "p1",
    nome: "Ana Souza",
    telefone: null,
    email: null,
    documento: null,
    externalId: null,
    ...parcial,
  };
}

/* -------------------------------------------------------------------------- */

describe("a normalização", () => {
  it("telefone perde máscara", () => {
    expect(normalizar("TELEFONE", "(11) 99999-0000")).toBe("11999990000");
    expect(normalizar("TELEFONE", "+55 11 99999-0000")).toBe("5511999990000");
  });

  it("RECUSA telefone curto demais", () => {
    /*
     * Um campo com "9999" casaria com qualquer outro cadastro truncado da base
     * — e a fusão resultante juntaria pessoas cuja única semelhança é o
     * telefone estar mal preenchido.
     */
    expect(normalizar("TELEFONE", "9999")).toBeNull();
    expect(normalizar("TELEFONE", "")).toBeNull();
    expect(normalizar("TELEFONE", "   ")).toBeNull();
  });

  it("e-mail vira minúsculo, e lixo é recusado", () => {
    expect(normalizar("EMAIL", "  Ana@Clinica.COM ")).toBe("ana@clinica.com");
    expect(normalizar("EMAIL", "ana@")).toBeNull();
    expect(normalizar("EMAIL", "sem arroba")).toBeNull();
  });

  it("documento aceita só CPF ou CNPJ", () => {
    expect(normalizar("DOCUMENTO", "123.456.789-00")).toBe("12345678900");
    expect(normalizar("DOCUMENTO", "123")).toBeNull();
  });

  it("external id NÃO é normalizado — mexer nele quebra o casamento com a fonte", () => {
    expect(normalizar("EXTERNAL_ID", "AB-0012")).toBe("AB-0012");
  });
});

/* -------------------------------------------------------------------------- */

describe("a força dos identificadores", () => {
  it("id externo e documento valem mais que telefone", () => {
    /*
     * Um sistema que trata os quatro como equivalentes resolve pelo que chegou
     * primeiro — e o que chega primeiro é quase sempre o telefone, justamente o
     * mais compartilhado.
     */
    expect(forcaDoIdentificador("EXTERNAL_ID")).toBeGreaterThan(forcaDoIdentificador("EMAIL"));
    expect(forcaDoIdentificador("DOCUMENTO")).toBeGreaterThan(forcaDoIdentificador("TELEFONE"));
    expect(forcaDoIdentificador("EMAIL")).toBeGreaterThan(forcaDoIdentificador("TELEFONE"));
  });
});

/* -------------------------------------------------------------------------- */

describe("a resolução", () => {
  it("um candidato só, identificador exclusivo: resolve", () => {
    const r = resolver([candidato()]);
    expect(r.tipo).toBe("UNICO");
  });

  it("nenhum candidato devolve NENHUM, e não erro", () => {
    expect(resolver([]).tipo).toBe("NENHUM");
  });

  it("TELEFONE DE FAMÍLIA não resolve — nem com um candidato só", () => {
    /*
     * ============================================================================
     *  Mesmo com um candidato hoje, o identificador foi MARCADO como
     *  compartilhado porque alguém já viu duas pessoas nele — e o segundo
     *  cadastro pode simplesmente não ter sido criado ainda.
     * ============================================================================
     */
    const r = resolver([candidato({ compartilhado: true })]);

    expect(r.tipo).toBe("AMBIGUO");
    if (r.tipo !== "AMBIGUO") return;
    expect(r.porque).toContain("mais de uma pessoa");
  });

  it("confirmado à mão ganha de tudo", () => {
    const r = resolver([
      candidato({ patientId: "inferido", porQual: "EXTERNAL_ID" }),
      candidato({ patientId: "confirmado", porQual: "TELEFONE", confirmado: true }),
    ]);

    expect(r.tipo).toBe("UNICO");
    if (r.tipo !== "UNICO") return;
    expect(r.patientId).toBe("confirmado");
  });

  it("dois confirmados é ambiguidade — alguém errou, e o sistema não conserta", () => {
    const r = resolver([
      candidato({ patientId: "a", confirmado: true }),
      candidato({ patientId: "b", confirmado: true }),
    ]);

    expect(r.tipo).toBe("AMBIGUO");
  });

  it("o identificador mais forte vence quando vence sozinho", () => {
    const r = resolver([
      candidato({ patientId: "fraco", porQual: "TELEFONE" }),
      candidato({ patientId: "forte", porQual: "EXTERNAL_ID" }),
    ]);

    expect(r.tipo).toBe("UNICO");
    if (r.tipo !== "UNICO") return;
    expect(r.patientId).toBe("forte");
  });

  it("dois com o MESMO documento é cadastro duplicado, e não resolução", () => {
    /*
     * Fundir automaticamente aqui é exatamente o que o §64 proíbe. Dois
     * pacientes com o mesmo CPF significa duplicata, e quem decide é gente.
     */
    const r = resolver([
      candidato({ patientId: "a", porQual: "DOCUMENTO" }),
      candidato({ patientId: "b", porQual: "DOCUMENTO" }),
    ]);

    expect(r.tipo).toBe("AMBIGUO");
    if (r.tipo !== "AMBIGUO") return;
    expect(r.porque).toContain("duplicado");
  });

  it("toda resolução explica o porquê", () => {
    const casos: Candidato[][] = [
      [],
      [candidato()],
      [candidato({ compartilhado: true })],
      [candidato({ confirmado: true })],
      [candidato({ patientId: "a" }), candidato({ patientId: "b" })],
    ];

    for (const c of casos) {
      expect(resolver(c).porque.length).toBeGreaterThan(20);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("os duplicados", () => {
  it("mesmo documento é quase certeza", () => {
    const s = compararCadastros(
      cadastro({ patientId: "a", documento: "12345678900" }),
      cadastro({ patientId: "b", documento: "12345678900" }),
    );

    expect(s?.confianca).toBeGreaterThan(CONFIANCA_PARA_SUGERIR);
  });

  it("MESMO TELEFONE sozinho NÃO chega ao limiar — é o caso da família", () => {
    /*
     * ============================================================================
     *  Mãe e filho têm o mesmo telefone e nomes diferentes. Se telefone sozinho
     *  cruzasse a linha, o sistema sugeriria fundir os dois — e alguém, num dia
     *  corrido, clicaria em "sim".
     * ============================================================================
     */
    const s = compararCadastros(
      cadastro({ patientId: "mae", nome: "Ana Souza", telefone: "11999990000" }),
      cadastro({ patientId: "filho", nome: "Pedro Souza", telefone: "11999990000" }),
    );

    expect(s).not.toBeNull();
    expect(s?.confianca).toBeLessThan(CONFIANCA_PARA_SUGERIR);
  });

  it("telefone igual MAIS nome parecido já vale sugerir", () => {
    const s = compararCadastros(
      cadastro({ patientId: "a", nome: "Ana Maria Souza", telefone: "11999990000" }),
      cadastro({ patientId: "b", nome: "Ana Souza", telefone: "11999990000" }),
    );

    expect(s?.confianca).toBeGreaterThanOrEqual(CONFIANCA_PARA_SUGERIR);
  });

  it("NOME sozinho não gera suspeita nenhuma", () => {
    /*
     * ============================================================================
     *  A REGRA DO §21, e o teste que a prende: dois "Maria Silva" sem nenhum
     *  identificador em comum não são a mesma pessoa. Numa base de 8.000, são
     *  várias pessoas — e fundi-las apaga a fronteira entre prontuários.
     * ============================================================================
     */
    const s = compararCadastros(
      cadastro({ patientId: "a", nome: "Maria Silva" }),
      cadastro({ patientId: "b", nome: "Maria Silva" }),
    );

    expect(s).toBeNull();
  });

  it("o mesmo cadastro não é duplicata de si mesmo", () => {
    expect(
      compararCadastros(cadastro({ patientId: "x" }), cadastro({ patientId: "x" })),
    ).toBeNull();
  });
});

describe("nomes parecidos", () => {
  it("ignora acento, caixa e partícula", () => {
    expect(nomeParecido("José da Silva Santos", "Jose Silva Santos")).toBe(true);
    expect(nomeParecido("ANA SOUZA", "ana souza")).toBe(true);
  });

  it("sobrenome diferente não é parecido", () => {
    expect(nomeParecido("Maria Silva", "Maria Souza")).toBe(false);
  });

  it("nome vazio não casa com nada", () => {
    expect(nomeParecido("", "Ana Souza")).toBe(false);
    expect(nomeParecido("Jo", "Jo")).toBe(false);
  });
});
