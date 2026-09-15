/**
 * A camada de atribuição.
 *
 * Os dois primeiros casos são as URLs REAIS das campanhas que vão ao ar — a do
 * Google Search de implante e a da Meta. Eles existem para que a pergunta "qual
 * anúncio gerou este contato?" tenha resposta verificável antes de alguém gastar
 * o primeiro real, e não depois.
 *
 * O resto do arquivo é sobre o que NÃO pode acontecer: dado pessoal entrando na
 * atribuição, valor sem teto, URL quebrada derrubando a página, e a referência
 * curta aparecendo para quem chegou pela busca orgânica.
 */
import { describe, expect, it } from "vitest";

import { lerAtribuicao, referenciaCurta, temCampanha } from "./atribuicao";

const BASE = "https://www.jpclinicaodontologica.com.br";

describe("Google Ads Search — a campanha de implante", () => {
  const url =
    `${BASE}/implante-dentario` +
    "?utm_source=google&utm_medium=cpc&utm_campaign=implante_search&utm_content=a01&gclid=ABC123";

  it("lê a campanha inteira", () => {
    const a = lerAtribuicao(url);

    expect(a.utmSource).toBe("google");
    expect(a.utmMedium).toBe("cpc");
    expect(a.utmCampaign).toBe("implante_search");
    expect(a.utmContent).toBe("a01");
    expect(a.gclid).toBe("ABC123");
  });

  it("reconhece o tratamento pela URL de anúncio", () => {
    expect(lerAtribuicao(url).tratamento).toBe("implantes-dentarios");
    expect(lerAtribuicao(url).landingPage).toBe("/implante-dentario");
  });

  it("a referência que chega à recepção é IMP-G-A01", () => {
    expect(referenciaCurta(lerAtribuicao(url))).toBe("IMP-G-A01");
  });
});

describe("Meta Ads — a mesma campanha pelo Instagram", () => {
  const url =
    `${BASE}/implante-dentario` +
    "?utm_source=instagram&utm_medium=paid_social&utm_campaign=implante_meta&utm_content=video03&fbclid=XYZ";

  it("lê a campanha inteira", () => {
    const a = lerAtribuicao(url);

    expect(a.utmSource).toBe("instagram");
    expect(a.utmCampaign).toBe("implante_meta");
    expect(a.utmContent).toBe("video03");
    expect(a.fbclid).toBe("XYZ");
    expect(a.tratamento).toBe("implantes-dentarios");
  });

  it("a referência distingue o canal — M, não G", () => {
    expect(referenciaCurta(lerAtribuicao(url))).toBe("IMP-M-VIDEO0");
  });
});

describe("o identificador de clique vence a UTM", () => {
  it("gclid manda, mesmo com utm_source dizendo outra coisa", () => {
    // Acontece de verdade: alguém copia a URL da campanha da Meta, troca o
    // destino e esquece de trocar o `utm_source`. O `gclid` não se engana.
    const a = lerAtribuicao(`${BASE}/implante-dentario?utm_source=instagram&gclid=ABC`);
    expect(referenciaCurta(a)?.split("-")[1]).toBe("G");
  });

  it("gbraid e wbraid também contam como Google", () => {
    expect(
      referenciaCurta(lerAtribuicao(`${BASE}/implante-dentario?gbraid=AB`))?.split("-")[1],
    ).toBe("G");
    expect(
      referenciaCurta(lerAtribuicao(`${BASE}/implante-dentario?wbraid=AB`))?.split("-")[1],
    ).toBe("G");
  });

  it("'gogle' no utm_source ainda cai em Google — humano digita errado", () => {
    const a = lerAtribuicao(`${BASE}/implante-dentario?utm_source=Google%20Ads`);
    expect(referenciaCurta(a)?.split("-")[1]).toBe("G");
  });
});

describe("sem campanha, nada muda para o paciente", () => {
  it("visita orgânica não tem atribuição", () => {
    const a = lerAtribuicao(`${BASE}/tratamentos/implantes-dentarios`);
    expect(temCampanha(a)).toBe(false);
    expect(a.utmSource).toBeNull();
    expect(a.gclid).toBeNull();
  });

  it("e não recebe referência nenhuma na mensagem", () => {
    expect(referenciaCurta(lerAtribuicao(`${BASE}/implante-dentario`))).toBeNull();
    expect(referenciaCurta(lerAtribuicao(`${BASE}/`))).toBeNull();
  });
});

describe("o que a atribuição se recusa a guardar", () => {
  it("a querystring inteira não é guardada — só os campos conhecidos", () => {
    // O dia em que alguém montar uma URL com o telefone dentro, ele não pode
    // entrar no relatório de campanha junto com a UTM.
    const a = lerAtribuicao(`${BASE}/implante-dentario?utm_source=google&telefone=11976165117`);

    expect(a.landingPage).toBe("/implante-dentario");
    expect(JSON.stringify(a)).not.toContain("11976165117");
  });

  it("valor gigante é cortado em 120 caracteres", () => {
    const enorme = "x".repeat(500);
    const a = lerAtribuicao(`${BASE}/implante-dentario?utm_campaign=${enorme}`);
    expect(a.utmCampaign).toHaveLength(120);
  });

  it("quebra de linha numa UTM não viaja para a mensagem do WhatsApp", () => {
    const a = lerAtribuicao(`${BASE}/implante-dentario?utm_campaign=a%0Ab`);
    expect(a.utmCampaign).toBe("a b");
  });

  it("URL malformada devolve vazio em vez de lançar", () => {
    expect(() => lerAtribuicao("nao-e-uma-url")).not.toThrow();
    expect(lerAtribuicao("nao-e-uma-url").utmSource).toBeNull();
    expect(lerAtribuicao(null).utmSource).toBeNull();
    expect(lerAtribuicao(undefined).utmSource).toBeNull();
    expect(lerAtribuicao("").utmSource).toBeNull();
  });
});

describe("a referência curta é para ser lida por gente", () => {
  it("nunca carrega o gclid — são 90 caracteres que o paciente leria", () => {
    const gclid = "EAIaIQobChMIx7ampleLongIdentifier1234567890";
    const ref = referenciaCurta(lerAtribuicao(`${BASE}/implante-dentario?gclid=${gclid}`));
    expect(ref).not.toContain(gclid);
    expect((ref ?? "").length).toBeLessThanOrEqual(16);
  });

  it("o criativo entra só com letra e dígito", () => {
    const a = lerAtribuicao(`${BASE}/implante-dentario?utm_source=google&utm_content=a-01_x!`);
    expect(referenciaCurta(a)).toBe("IMP-G-A01X");
  });

  it("fora de página de tratamento, a sigla é JP", () => {
    expect(referenciaCurta(lerAtribuicao(`${BASE}/?utm_source=google&utm_content=a01`))).toBe(
      "JP-G-A01",
    );
  });

  it("campanha sem criativo devolve só tratamento e canal", () => {
    expect(referenciaCurta(lerAtribuicao(`${BASE}/implante-dentario?gclid=ABC`))).toBe("IMP-G");
  });
});
