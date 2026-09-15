/**
 * As regras de comentário — §16, §43, §17, §52.
 *
 * ============================================================================
 *  DOIS FALSOS POSITIVOS GOVERNAM ESTE ARQUIVO, e os dois acontecem de verdade:
 *
 *      "linda doutora ❤️"     não pode virar oportunidade de implante (§43)
 *      "adorei o resultado!"  não pode casar a palavra "dor"
 *
 *  O segundo é o que um `includes` ingênuo produz, e o efeito é uma regra de
 *  urgência disparando em elogio — com private reply ligado, a clínica manda
 *  direct perguntando da dor de quem estava elogiando.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  casarRegra,
  chaveDeCooldown,
  contemPalavra,
  COPY_PADRAO_PRIVATE_REPLY,
  normalizarTextoSocial,
  type ComentarioParaAvaliar,
  type RegraSocial,
} from "./regras-sociais";

function regra(p: Partial<RegraSocial> = {}): RegraSocial {
  return {
    id: "r1",
    nome: "Implante",
    canal: "instagram",
    evento: "comment.created",
    contem: ["implante"],
    naoContem: [],
    exigirCaptacao: false,
    midias: [],
    criarLead: true,
    criarOportunidade: true,
    enviarPrivateReply: false,
    tipoOportunidade: null,
    intencao: "INTERESSE",
    templateId: null,
    copy: null,
    cooldownHoras: 168,
    ativa: true,
    clinicId: null,
    ...p,
  };
}

function comentario(p: Partial<ComentarioParaAvaliar> = {}): ComentarioParaAvaliar {
  return {
    canal: "instagram",
    evento: "comment.created",
    texto: "quero saber do implante",
    midiaId: "m1",
    ehCaptacao: true,
    ...p,
  };
}

/* -------------------------------------------------------------------------- */

describe("a normalização vale para os DOIS lados", () => {
  it("tira acento, caixa e pontuação", () => {
    expect(normalizarTextoSocial("Avaliação GRÁTIS?!")).toBe("avaliacao gratis");
  });

  it("tira emoji, inclusive colado na palavra", () => {
    /*
     * EMOJI COLA NA PALAVRA. "quero implante🦷" tem o emoji encostado, e
     * "🦷implante" tem antes — a fronteira de palavra quebra nos dois sem a
     * limpeza.
     */
    expect(normalizarTextoSocial("quero implante🦷")).toBe("quero implante");
    expect(normalizarTextoSocial("🦷implante")).toBe("implante");
  });

  it("colapsa espaço", () => {
    expect(normalizarTextoSocial("  quero    implante  ")).toBe("quero implante");
  });

  it("IMPLANTE cadastrado casa com implante escrito", () => {
    // O defeito mais previsível possível: normalizar só um dos lados.
    expect(contemPalavra(normalizarTextoSocial("quero implante"), "IMPLANTE")).toBe(true);
  });
});

describe("a fronteira de palavra — o caso `dor` em `adorei`", () => {
  it("`dor` NÃO casa em `adorei o resultado`", () => {
    expect(contemPalavra(normalizarTextoSocial("adorei o resultado!"), "dor")).toBe(false);
  });

  it("`dor` casa quando é a palavra", () => {
    expect(contemPalavra(normalizarTextoSocial("estou com muita dor"), "dor")).toBe(true);
  });

  it("expressão com espaço é comparada inteira e na ordem", () => {
    expect(contemPalavra(normalizarTextoSocial("quero implante já"), "quero implante")).toBe(true);
    expect(
      contemPalavra(normalizarTextoSocial("quero clarear e vi um implante"), "quero implante"),
    ).toBe(false);
  });

  it("palavra vazia nunca casa", () => {
    expect(contemPalavra("qualquer coisa", "")).toBe(false);
    expect(contemPalavra("qualquer coisa", "  ")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("nem todo comentário é lead — §43", () => {
  it("`linda doutora ❤️` não casa a regra de implante", () => {
    const r = casarRegra(comentario({ texto: "linda doutora ❤️" }), [regra()]);
    expect(r.casou).toBe(false);
  });

  it("comentário só de emoji não casa nada", () => {
    const r = casarRegra(comentario({ texto: "❤️❤️❤️" }), [regra()]);
    expect(r.casou).toBe(false);
    expect(r.porque).toContain("não tem texto legível");
  });

  it("menção sem texto não casa nada", () => {
    // A Meta manda menção só com ids, sem conteúdo — ver `daMencao`.
    const r = casarRegra(comentario({ texto: "", evento: "mention.created" }), [
      regra({ evento: "mention.created" }),
    ]);
    expect(r.casou).toBe(false);
  });

  it("`implante capilar` é VETADO por `nao_contem`", () => {
    /*
     * O FALSO POSITIVO REAL DE UMA CLÍNICA ODONTOLÓGICA. Sem o veto, a regra
     * responde a quem procurava dermatologista — e o motivo registrado é o que
     * permite a alguém entender, olhando a tela, por que nada aconteceu.
     */
    const r = casarRegra(comentario({ texto: "quero implante capilar" }), [
      regra({ naoContem: ["capilar"] }),
    ]);
    expect(r.casou).toBe(false);
    expect(r.porque).toContain("capilar");
  });

  it("exigir captação barra comentário em post institucional", () => {
    const r = casarRegra(comentario({ ehCaptacao: false }), [regra({ exigirCaptacao: true })]);
    expect(r.casou).toBe(false);
    expect(r.porque).toContain("captação");
  });

  it("lista de mídias restringe a regra àquele conteúdo", () => {
    const r = casarRegra(comentario({ midiaId: "outro" }), [regra({ midias: ["m1"] })]);
    expect(r.casou).toBe(false);
  });

  it("regra ATIVA sem palavra nenhuma NÃO casa tudo", () => {
    /*
     * LISTA VAZIA LIDA COMO "CASA TUDO" transformaria uma regra incompleta num
     * respondedor automático de qualquer comentário. O caminho do esquecimento
     * tem que levar ao seguro — a mesma regra das flags e da autonomia.
     */
    const r = casarRegra(comentario({ texto: "qualquer coisa" }), [regra({ contem: [] })]);
    expect(r.casou).toBe(false);
    expect(r.porque).toContain("nenhuma palavra");
  });

  it("regra desligada não casa", () => {
    expect(casarRegra(comentario(), [regra({ ativa: false })]).casou).toBe(false);
  });

  it("regra de outro canal não casa", () => {
    expect(casarRegra(comentario({ canal: "facebook" }), [regra()]).casou).toBe(false);
  });

  it("regra de outro evento não casa", () => {
    expect(casarRegra(comentario({ evento: "mention.created" }), [regra()]).casou).toBe(false);
  });
});

describe("quando casa, casa com motivo", () => {
  it("diz a palavra que casou", () => {
    const r = casarRegra(comentario({ texto: "queria saber o valor do IMPLANTE" }), [
      regra({ contem: ["implante"] }),
    ]);
    expect(r.casou).toBe(true);
    if (r.casou) expect(r.porque).toContain("implante");
  });

  it("a PRIMEIRA regra da lista vence", () => {
    /*
     * DETERMINISMO, e não "a mais específica": duas regras que casam o mesmo
     * comentário produziriam dois leads e dois directs. Quem ordena é o
     * chamador, e ele põe a da unidade antes da da rede.
     */
    const r = casarRegra(comentario(), [
      regra({ id: "da-unidade", nome: "Da unidade" }),
      regra({ id: "da-rede", nome: "Da rede" }),
    ]);
    expect(r.casou).toBe(true);
    if (r.casou) expect(r.regra.id).toBe("da-unidade");
  });

  it("sem regra nenhuma, o motivo diz isso", () => {
    const r = casarRegra(comentario(), []);
    expect(r.casou).toBe(false);
    expect(r.porque).toContain("Nenhuma regra social ativa");
  });
});

/* -------------------------------------------------------------------------- */

describe("o anti-spam do private reply — §17", () => {
  const agora = new Date("2026-09-15T12:00:00.000Z");

  it("a mesma pessoa, na mesma regra e mídia, tem a MESMA chave", () => {
    /*
     * É O ANTI-SPAM. Dedupe por ID DE COMENTÁRIO deixaria a mesma pessoa
     * receber dez directs comentando dez vezes: cada comentário tem id próprio,
     * e cada um passaria pela trava.
     */
    const a = chaveDeCooldown({
      regraId: "r1",
      atorId: "ator",
      midiaId: "m1",
      cooldownHoras: 168,
      agora,
    });
    const b = chaveDeCooldown({
      regraId: "r1",
      atorId: "ator",
      midiaId: "m1",
      cooldownHoras: 168,
      agora: new Date(agora.getTime() + 60_000),
    });
    expect(a).toBe(b);
  });

  it("mídia diferente é intenção diferente", () => {
    // Comentar em DOIS posts de captação é duas intenções. Sem a mídia na
    // chave, a segunda campanha não alcançaria quem respondeu à primeira.
    const a = chaveDeCooldown({
      regraId: "r1",
      atorId: "a",
      midiaId: "m1",
      cooldownHoras: 168,
      agora,
    });
    const b = chaveDeCooldown({
      regraId: "r1",
      atorId: "a",
      midiaId: "m2",
      cooldownHoras: 168,
      agora,
    });
    expect(a).not.toBe(b);
  });

  it("regra diferente pode falar de outro assunto", () => {
    const a = chaveDeCooldown({
      regraId: "r1",
      atorId: "a",
      midiaId: "m",
      cooldownHoras: 168,
      agora,
    });
    const b = chaveDeCooldown({
      regraId: "r2",
      atorId: "a",
      midiaId: "m",
      cooldownHoras: 168,
      agora,
    });
    expect(a).not.toBe(b);
  });

  it("pessoa diferente, chave diferente", () => {
    const a = chaveDeCooldown({
      regraId: "r",
      atorId: "a",
      midiaId: "m",
      cooldownHoras: 168,
      agora,
    });
    const b = chaveDeCooldown({
      regraId: "r",
      atorId: "b",
      midiaId: "m",
      cooldownHoras: 168,
      agora,
    });
    expect(a).not.toBe(b);
  });

  it("passado o cooldown, o balde muda e a pessoa pode ser respondida de novo", () => {
    const a = chaveDeCooldown({ regraId: "r", atorId: "a", midiaId: "m", cooldownHoras: 1, agora });
    const b = chaveDeCooldown({
      regraId: "r",
      atorId: "a",
      midiaId: "m",
      cooldownHoras: 1,
      agora: new Date(agora.getTime() + 2 * 3_600_000),
    });
    expect(a).not.toBe(b);
  });

  it("sem mídia a chave continua estável", () => {
    const a = chaveDeCooldown({
      regraId: "r",
      atorId: "a",
      midiaId: null,
      cooldownHoras: 168,
      agora,
    });
    const b = chaveDeCooldown({
      regraId: "r",
      atorId: "a",
      midiaId: null,
      cooldownHoras: 168,
      agora,
    });
    expect(a).toBe(b);
    expect(a).toContain("sem-midia");
  });

  it("cooldown zero deixa cada instante ser uma chave nova", () => {
    /*
     * É configuração consciente: cooldown zero manda um direct por comentário.
     * A reserva ainda protege contra a REENTREGA do mesmo webhook (mesmo
     * instante), mas não contra comentários novos.
     */
    const a = chaveDeCooldown({ regraId: "r", atorId: "a", midiaId: "m", cooldownHoras: 0, agora });
    const b = chaveDeCooldown({
      regraId: "r",
      atorId: "a",
      midiaId: "m",
      cooldownHoras: 0,
      agora: new Date(agora.getTime() + 1_000),
    });
    expect(a).not.toBe(b);
  });
});

/* -------------------------------------------------------------------------- */

describe("a copy padrão é segura por construção — §29, §67", () => {
  const copy = COPY_PADRAO_PRIVATE_REPLY.toLowerCase();

  it("não diagnostica nem nomeia tratamento", () => {
    for (const proibida of ["implante", "cárie", "carie", "canal", "extração", "extracao"]) {
      expect(copy).not.toContain(proibida);
    }
  });

  it("não promete preço", () => {
    for (const proibida of ["r$", "reais", "a partir de", "parcel"]) {
      expect(copy).not.toContain(proibida);
    }
  });

  it("não promete resultado", () => {
    for (const proibida of ["garant", "melhor", "vai amar", "resultado"]) {
      expect(copy).not.toContain(proibida);
    }
  });

  it("devolve a palavra para a pessoa", () => {
    // O que ela FAZ: reconhece o comentário e convida a conversar. É isso que
    // abre a janela de 24 horas para uma pessoa de verdade atender.
    expect(copy).toContain("coment");
    expect(copy).toContain("me conta");
  });
});
