/**
 * UM CLIQUE, UM EVENTO — o teste de regressão da dupla contagem.
 *
 * ============================================================================
 *  O DEFEITO QUE ESTE ARQUIVO IMPEDE DE VOLTAR.
 *
 *  Um clique em "Agendar avaliação" dentro de uma página de tratamento
 *  produzia três eventos: `whatsapp_click`, `schedule_click` e
 *  `treatment_cta_click`. Traduzidos para a Meta, viravam um `Contact` e DOIS
 *  `Lead`. Um paciente, três conversões.
 *
 *  Isso não é erro de relatório: é o Google Ads e a Meta aprendendo que aquele
 *  clique valeu três e subindo o lance para comprar mais cliques iguais. A
 *  clínica pagaria mais caro por uma inflação que ela mesma produziu.
 *
 *  `decidirEventoDeClique` é pura e devolve NO MÁXIMO UM evento. Este arquivo
 *  fixa isso: a asserção que importa é a contagem, não o nome.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import { decidirEventoDeClique, type Clique } from "./eventos";

const MSG_AGENDAR = encodeURIComponent(
  "Olá! Vi a página sobre Implantes dentários no site da JP Clínica Integrada Odontológica e gostaria de agendar uma avaliação.",
);
const MSG_DUVIDA = encodeURIComponent(
  "Olá! Vim pelo site da JP Clínica Integrada Odontológica e fiquei com uma dúvida.",
);

const clique = (parcial: Partial<Clique>): Clique => ({
  href: "",
  rotulo: "",
  origem: "hero",
  pathname: "/",
  ...parcial,
});

describe("o clique de agendamento na LP paga", () => {
  const acao = clique({
    href: `https://wa.me/5511976165117?text=${MSG_AGENDAR}`,
    rotulo: "Agendar avaliação",
    pathname: "/implante-dentario",
  });

  it("produz UM evento, e ele é generate_lead", () => {
    const resultado = decidirEventoDeClique(acao);
    expect(resultado).not.toBeNull();
    expect(resultado?.evento).toBe("generate_lead");
  });

  it("carrega o tratamento e o canal — é o que o Google Ads otimiza", () => {
    const dados = decidirEventoDeClique(acao)?.dados ?? {};
    expect(dados["treatment"]).toBe("implantes-dentarios");
    expect(dados["channel"]).toBe("whatsapp");
    expect(dados["pagina"]).toBe("/implante-dentario");
  });

  it("NÃO produz também um contact_click — era o Contact a mais na Meta", () => {
    // A função devolve um objeto, não uma lista: não existe forma de este
    // caminho emitir um segundo evento. A asserção documenta a garantia.
    const resultado = decidirEventoDeClique(acao);
    expect(Array.isArray(resultado)).toBe(false);
    expect(resultado?.evento).not.toBe("contact_click");
  });
});

describe("a mesma decisão vale nas duas URLs do mesmo tratamento", () => {
  it("a orgânica também gera lead com o tratamento certo", () => {
    const resultado = decidirEventoDeClique(
      clique({
        href: `https://wa.me/5511976165117?text=${MSG_AGENDAR}`,
        rotulo: "Agendar avaliação",
        pathname: "/tratamentos/implantes-dentarios",
      }),
    );
    expect(resultado?.evento).toBe("generate_lead");
    expect(resultado?.dados["treatment"]).toBe("implantes-dentarios");
  });
});

describe("a intenção é lida da mensagem, não do rótulo", () => {
  it("o cartão que mostra o telefone mas pede avaliação conta como lead", () => {
    // Acontece na home: o rótulo é "(11) 97616-5117" e a mensagem pede
    // avaliação. Pelo rótulo, este clique sumia da conta de agendamentos.
    const resultado = decidirEventoDeClique(
      clique({
        href: `https://wa.me/5511976165117?text=${MSG_AGENDAR}`,
        rotulo: "(11) 97616-5117",
        origem: "fale",
      }),
    );
    expect(resultado?.evento).toBe("generate_lead");
  });

  it("'fiquei com uma dúvida' é contato, não lead", () => {
    const resultado = decidirEventoDeClique(
      clique({
        href: `https://wa.me/5511976165117?text=${MSG_DUVIDA}`,
        rotulo: "Tirar dúvidas",
        origem: "faq",
      }),
    );
    expect(resultado?.evento).toBe("contact_click");
  });
});

describe("cada tipo de link produz exatamente um evento", () => {
  const casos: [string, Clique, string | null][] = [
    ["telefone", clique({ href: "tel:+551139759902", rotulo: "(11) 3975-9902" }), "phone_click"],
    [
      "mapa",
      clique({ href: "https://www.google.com/maps/search/?api=1&query=x", rotulo: "Como chegar" }),
      "map_click",
    ],
    [
      "selo de avaliações (mesmo apontando para o Maps)",
      clique({
        href: "https://www.google.com/maps/search/?api=1&query=x",
        rotulo: "192 avaliações",
      }),
      "review_click",
    ],
    [
      "candidatura",
      clique({ href: "/trabalhe-conosco?vaga=recepcao", rotulo: "Quero me candidatar" }),
      "career_apply",
    ],
    ["link interno comum", clique({ href: "/tratamentos/ortodontia", rotulo: "Saiba mais" }), null],
    ["âncora da home", clique({ href: "/#equipe", rotulo: "Equipe" }), null],
  ];

  it.each(casos)("%s → %s", (_nome, acao, esperado) => {
    const resultado = decidirEventoDeClique(acao);
    expect(resultado === null ? null : resultado.evento).toBe(esperado);
  });
});

describe("candidatura nunca é conversão comercial", () => {
  it("não vira generate_lead — ensinaria o algoritmo a buscar candidato", () => {
    const resultado = decidirEventoDeClique(
      clique({ href: "/trabalhe-conosco?vaga=recepcao", rotulo: "Candidatar-se" }),
    );
    expect(resultado?.evento).toBe("career_apply");
    expect(resultado?.evento).not.toBe("generate_lead");
  });
});

describe("todas as oito rotas pagas geram lead com o tratamento certo", () => {
  const rotas: [string, string][] = [
    ["/implante-dentario", "implantes-dentarios"],
    ["/protese-dentaria", "proteses-dentarias"],
    ["/ortodontia", "ortodontia"],
    ["/clareamento-dental", "clareamento-dental"],
    ["/odontopediatria", "odontopediatria"],
    ["/restauracao-dentaria", "restauracoes"],
    ["/limpeza-dental", "limpeza-profilaxia"],
    ["/harmonizacao-facial", "harmonizacao-orofacial"],
  ];

  it.each(rotas)("%s → treatment=%s", (pathname, slug) => {
    const resultado = decidirEventoDeClique(
      clique({
        href: `https://wa.me/5511976165117?text=${MSG_AGENDAR}`,
        rotulo: "Agendar avaliação",
        pathname,
      }),
    );
    expect(resultado?.evento).toBe("generate_lead");
    expect(resultado?.dados["treatment"]).toBe(slug);
  });
});
