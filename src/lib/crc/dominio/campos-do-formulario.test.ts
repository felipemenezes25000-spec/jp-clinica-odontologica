/**
 * O `field_data` do Instant Form — §18.2, §52.
 *
 * ============================================================================
 *  O TESTE QUE O §52 PEDE NOMINALMENTE É "field order muda", e ele existe
 *  porque o defeito acontece toda vez:
 *
 *  Alguém edita o Instant Form no Gerenciador de Anúncios e sobe a pergunta
 *  "melhor horário para ligar?" para o segundo lugar. A partir daquele
 *  instante, todo lead novo entra com "manhã" no campo de telefone.
 *
 *  Ninguém descobre no dia. Descobre-se quando a recepção liga para "manhã".
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  interesseDeclarado,
  normalizarCampos,
  type CampoDoFormulario,
} from "./campos-do-formulario";

const NOME: CampoDoFormulario = { name: "full_name", values: ["Ana Maria Souza"] };
const FONE: CampoDoFormulario = { name: "phone_number", values: ["+55 11 99999-0000"] };
const MAIL: CampoDoFormulario = { name: "email", values: ["Ana@Clinica.COM"] };
const HORA: CampoDoFormulario = { name: "Melhor horário para ligar?", values: ["Manhã"] };

describe("a ordem dos campos não importa — §18.2", () => {
  it("nome, telefone e e-mail na ordem canônica", () => {
    const r = normalizarCampos([NOME, FONE, MAIL]);
    expect(r.nome).toBe("Ana Maria Souza");
    expect(r.telefone).toBe("+55 11 99999-0000");
    expect(r.email).toBe("ana@clinica.com");
  });

  it("a MESMA leitura com a ordem invertida", () => {
    const r = normalizarCampos([MAIL, FONE, NOME]);
    expect(r.nome).toBe("Ana Maria Souza");
    expect(r.telefone).toBe("+55 11 99999-0000");
  });

  it("uma pergunta nova no MEIO não desloca nada", () => {
    /*
     * ESTE É O CENÁRIO EXATO DO DEFEITO. Com leitura por posição,
     * `campo[1]` seria "Manhã" e o telefone iria para a coluna de telefone
     * errada — ou para lugar nenhum.
     */
    const r = normalizarCampos([NOME, HORA, FONE, MAIL]);
    expect(r.telefone).toBe("+55 11 99999-0000");
    expect(r.extras["Melhor horário para ligar?"]).toBe("Manhã");
  });
});

describe("o importador NUNCA quebra por campo desconhecido — §18.2", () => {
  it("campo novo vai para `extras` com a pergunta original como chave", () => {
    /*
     * A CHAVE É O `name` ORIGINAL, e não um slug nosso: é assim que quem for
     * conferir no Gerenciador de Anúncios encontra a mesma pergunta.
     */
    const r = normalizarCampos([NOME, { name: "Você tem convênio?", values: ["Sim"] }]);
    expect(r.extras["Você tem convênio?"]).toBe("Sim");
    expect(r.desconhecidos).toBe(1);
  });

  it("formulário só com perguntas desconhecidas não lança nem perde nada", () => {
    const r = normalizarCampos([
      { name: "a", values: ["1"] },
      { name: "b", values: ["2"] },
    ]);
    expect(r.nome).toBeNull();
    expect(r.telefone).toBeNull();
    expect(r.desconhecidos).toBe(2);
  });

  it("formulário vazio devolve tudo nulo", () => {
    const r = normalizarCampos([]);
    expect(r.nome).toBeNull();
    expect(r.telefone).toBeNull();
    expect(r.email).toBeNull();
    expect(r.desconhecidos).toBe(0);
  });

  it("campo sem nome e campo sem valor são ignorados sem lançar", () => {
    const r = normalizarCampos([
      { name: "", values: ["x"] },
      { name: "phone_number", values: [] },
      { name: "email", values: ["  "] },
      NOME,
    ]);
    expect(r.nome).toBe("Ana Maria Souza");
    expect(r.telefone).toBeNull();
    expect(r.email).toBeNull();
  });
});

describe("os apelidos que a Meta usa para a mesma coisa", () => {
  it("`phone` e `telefone` também são telefone", () => {
    expect(normalizarCampos([{ name: "phone", values: ["11999990000"] }]).telefone).toBe(
      "11999990000",
    );
    expect(normalizarCampos([{ name: "telefone", values: ["11999990000"] }]).telefone).toBe(
      "11999990000",
    );
  });

  it("`first_name` + `last_name` formam o nome", () => {
    const r = normalizarCampos([
      { name: "first_name", values: ["Ana"] },
      { name: "last_name", values: ["Souza"] },
    ]);
    expect(r.nome).toBe("Ana Souza");
  });

  it("`full_name` VENCE `first_name` + `last_name`", () => {
    /*
     * ALGUNS FORMULÁRIOS MANDAM OS TRÊS. Concatenar por cima do completo
     * produziria "Ana Souza Ana Souza" em metade dos leads — e a recepção
     * começaria a mensagem chamando a pessoa pelo nome duplicado.
     */
    const r = normalizarCampos([
      { name: "first_name", values: ["Ana"] },
      { name: "last_name", values: ["Souza"] },
      { name: "full_name", values: ["Ana Maria Souza"] },
    ]);
    expect(r.nome).toBe("Ana Maria Souza");
  });

  it("nome de campo com acento e interrogação é normalizado para comparar", () => {
    expect(normalizarCampos([{ name: "E-mail", values: ["a@b.com"] }]).email).toBe("a@b.com");
  });

  it("o e-mail vem em minúsculas", () => {
    expect(normalizarCampos([MAIL]).email).toBe("ana@clinica.com");
  });
});

describe("checkbox múltiplo não perde metade da resposta", () => {
  it("vários valores viram uma frase", () => {
    /*
     * Pegar só o primeiro perderia metade do interesse declarado — e é
     * justamente o interesse que decide para qual fila o lead vai.
     */
    const r = normalizarCampos([
      { name: "O que você procura?", values: ["Implante", "Clareamento"] },
    ]);
    expect(r.extras["O que você procura?"]).toBe("Implante, Clareamento");
  });
});

/* -------------------------------------------------------------------------- */

describe("o interesse declarado é administrativo, e não diagnóstico — §4.4, §44", () => {
  it("reconhece tratamento que a pessoa ESCOLHEU numa lista", () => {
    expect(interesseDeclarado("Quero implante")).toBe("IMPLANTE");
    expect(interesseDeclarado("aparelho invisível")).toBe("ORTODONTIA");
    expect(interesseDeclarado("Clareamento dental")).toBe("CLAREAMENTO");
  });

  it("funciona sem acento e em qualquer caixa", () => {
    expect(interesseDeclarado("PROTESE")).toBe("PROTESE");
    expect(interesseDeclarado("prótese")).toBe("PROTESE");
  });

  it("NÃO infere tratamento a partir de sintoma", () => {
    /*
     * A FRONTEIRA EXATA DO §4.4.
     *
     * "dói ao morder" é sintoma, e inferir "canal" a partir dele é diagnóstico
     * — proibido. A função devolve `null`, e `null` é resposta legítima: o §44
     * manda usar `OUTRO`/`REVISAR` abaixo do limiar em vez de chutar.
     */
    expect(interesseDeclarado("dói ao morder do lado esquerdo")).toBeNull();
    expect(interesseDeclarado("minha gengiva está sangrando")).toBeNull();
    expect(interesseDeclarado("acho que é cárie")).toBeNull();
  });

  it("texto vazio devolve null", () => {
    expect(interesseDeclarado("")).toBeNull();
    expect(interesseDeclarado("   ")).toBeNull();
  });

  it("texto sem nenhuma palavra conhecida devolve null", () => {
    expect(interesseDeclarado("bom dia, tudo bem?")).toBeNull();
  });
});
