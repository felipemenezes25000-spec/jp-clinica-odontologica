/**
 * O reconhecimento das rotas pagas.
 *
 * O TESTE DECISIVO é o primeiro: `/implante-dentario` tem de virar
 * `implantes-dentarios`. Era exatamente isso que não acontecia — o rastreio
 * perguntava `pathname.startsWith("/tratamentos/")`, e a única rota que a
 * clínica vai pagar para trazer gente respondia "não sou tratamento".
 *
 * O segundo grupo existe para um defeito futuro, não para um passado: se alguém
 * renomear um slug em `jp.ts` e esquecer do mapa, as duas URLs do mesmo
 * procedimento passam a devolver coisas diferentes, e o relatório racha em duas
 * linhas sem ninguém perceber. Aqui isso é CI vermelho.
 */
import { describe, expect, it } from "vitest";

import { TRATAMENTOS } from "@/lib/jp";

import { ROTAS_PAGAS, ehRotaPaga, tratamentoDaRota, tituloDaRota } from "./rotas";

const PARES: [string, string][] = [
  ["/implante-dentario", "implantes-dentarios"],
  ["/protese-dentaria", "proteses-dentarias"],
  ["/ortodontia", "ortodontia"],
  ["/clareamento-dental", "clareamento-dental"],
  ["/odontopediatria", "odontopediatria"],
  ["/restauracao-dentaria", "restauracoes"],
  ["/limpeza-dental", "limpeza-profilaxia"],
  ["/harmonizacao-facial", "harmonizacao-orofacial"],
];

describe("as oito rotas de anúncio entram no funil", () => {
  it.each(PARES)("%s é reconhecida como %s", (rota, slug) => {
    expect(tratamentoDaRota(rota)).toBe(slug);
    expect(ehRotaPaga(rota)).toBe(true);
  });

  it("a rota paga e a orgânica devolvem o MESMO slug", () => {
    for (const [rota, slug] of PARES) {
      expect(tratamentoDaRota(rota)).toBe(tratamentoDaRota(`/tratamentos/${slug}`));
    }
  });

  it("a barra final não cria uma segunda rota", () => {
    expect(tratamentoDaRota("/implante-dentario/")).toBe("implantes-dentarios");
    expect(tratamentoDaRota("/tratamentos/ortodontia/")).toBe("ortodontia");
  });
});

describe("o mapa não pode divergir de jp.ts", () => {
  it("todo slug do mapa existe em TRATAMENTOS", () => {
    for (const slug of Object.values(ROTAS_PAGAS)) {
      expect(TRATAMENTOS.some((t) => t.slug === slug)).toBe(true);
    }
  });

  it("os oito tratamentos têm rota paga — nenhum ficou de fora", () => {
    const cobertos = new Set(Object.values(ROTAS_PAGAS));
    for (const t of TRATAMENTOS) expect(cobertos.has(t.slug)).toBe(true);
    expect(cobertos.size).toBe(TRATAMENTOS.length);
  });

  it("o título vem de jp.ts, e é ele que entra na mensagem do WhatsApp", () => {
    expect(tituloDaRota("/implante-dentario")).toBe("Implantes dentários");
    expect(tituloDaRota("/tratamentos/implantes-dentarios")).toBe("Implantes dentários");
  });
});

describe("o que NÃO é página de tratamento", () => {
  it.each(["/", "/carreiras", "/politica-de-privacidade", "/rh", "/crc"])(
    "%s não entra no funil de tratamento",
    (rota) => {
      expect(tratamentoDaRota(rota)).toBeNull();
      expect(ehRotaPaga(rota)).toBe(false);
    },
  );

  it("slug inexistente não vira tratamento — a rota é 404, e 404 não é funil", () => {
    expect(tratamentoDaRota("/tratamentos/canal-de-raiz")).toBeNull();
    expect(tratamentoDaRota("/tratamentos/")).toBeNull();
  });
});
