/**
 * Testes de atribuição e origem de lead.
 *
 * A atribuição é gravada UMA vez, no instante em que a pessoa chega. Se ela
 * sair errada, não há como recuperar depois — e a pergunta "qual campanha
 * trouxe este paciente?" fica sem resposta para sempre.
 */
import { describe, expect, it } from "vitest";

import { deduzirOrigem, lerAtribuicao } from "./leads";

describe("leitura de atribuição", () => {
  it("extrai os parâmetros de campanha", () => {
    const a = lerAtribuicao(
      "https://jp.com.br/tratamentos/implante?utm_source=google&utm_medium=cpc&utm_campaign=implantes-set&gclid=ABC123",
    );
    expect(a.utmSource).toBe("google");
    expect(a.utmMedium).toBe("cpc");
    expect(a.utmCampaign).toBe("implantes-set");
    expect(a.gclid).toBe("ABC123");
    expect(a.landingPage).toBe("/tratamentos/implante");
  });

  it("guarda só o caminho, sem a querystring", () => {
    // A querystring já foi decomposta em campos. Guardá-la de novo duplicaria
    // dado pessoal quando alguém puser telefone num parâmetro.
    const a = lerAtribuicao("https://jp.com.br/x?telefone=5511999998888&utm_source=meta");
    expect(a.landingPage).toBe("/x");
    expect(a.landingPage).not.toContain("5511");
  });

  it("URL malformada não estoura — perder origem é melhor que perder o lead", () => {
    const a = lerAtribuicao("não é uma url");
    expect(a.utmSource).toBeNull();
    expect(a.landingPage).toBeNull();
    expect(lerAtribuicao(null).gclid).toBeNull();
  });
});

describe("dedução de origem", () => {
  const vazia = lerAtribuicao(null);

  it("o identificador de clique VENCE o utm_source", () => {
    // gclid é posto pela plataforma; utm é convenção humana, e humano escreve
    // "Google", "google" e "gogle".
    expect(deduzirOrigem({ ...vazia, gclid: "ABC", utmSource: "facebook" })).toBe("GOOGLE");
    expect(deduzirOrigem({ ...vazia, fbclid: "XYZ", utmSource: "google" })).toBe("META");
  });

  it("reconhece as grafias comuns de utm_source", () => {
    expect(deduzirOrigem({ ...vazia, utmSource: "Google Ads" })).toBe("GOOGLE");
    expect(deduzirOrigem({ ...vazia, utmSource: "instagram_bio" })).toBe("INSTAGRAM");
    expect(deduzirOrigem({ ...vazia, utmSource: "facebook" })).toBe("META");
    expect(deduzirOrigem({ ...vazia, utmSource: "meta-ads" })).toBe("META");
    expect(deduzirOrigem({ ...vazia, utmSource: "whatsapp" })).toBe("WHATSAPP");
    expect(deduzirOrigem({ ...vazia, utmSource: "indicacao" })).toBe("INDICACAO");
  });

  it("site sem parâmetro nenhum é orgânico, e não desconhecido", () => {
    // "Não pagamos por este clique" é a distinção que importa no relatório.
    expect(deduzirOrigem({ ...vazia, landingPage: "/carreiras" })).toBe("ORGANICO");
  });

  it("sem nada, é desconhecida — e não inventa origem", () => {
    expect(deduzirOrigem(vazia)).toBe("DESCONHECIDA");
  });
});
