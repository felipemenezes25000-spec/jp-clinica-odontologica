/**
 * Os invariantes do que a clínica informou em 15/09/2026.
 *
 * Nenhum deles testa aparência. Todos testam uma regra que, quebrada, publica
 * uma afirmação errada sobre uma clínica real — que é a única categoria de bug
 * deste arquivo que não dá para consertar depois de alguém ter lido.
 */
import { describe, expect, it } from "vitest";

import {
  ATENDIMENTO,
  A_CONFIRMAR,
  CONVENIOS,
  CONVENIOS_POR_EXTENSO,
  CUIDADOS_COMPLEMENTARES,
  FAQ,
  PAGAMENTO,
  listaPorExtenso,
} from "@/lib/jp";

describe("listaPorExtenso", () => {
  it("usa vírgula até o penúltimo e 'e' antes do último", () => {
    expect(listaPorExtenso(["A", "B", "C"])).toBe("A, B e C");
  });

  it("não inventa conector para lista de um item", () => {
    expect(listaPorExtenso(["A"])).toBe("A");
  });

  it("devolve vazio para lista vazia, em vez de quebrar", () => {
    expect(listaPorExtenso([])).toBe("");
  });
});

describe("convênios", () => {
  /**
   * O slug é o nome do arquivo que `ConveniosSection` procura na pasta de
   * assets. Slug repetido faria dois convênios disputarem o mesmo logo; slug
   * com maiúscula ou espaço nunca encontraria arquivo nenhum, e a placa
   * tipográfica ficaria para sempre — sem erro, sem aviso, sem ninguém notar.
   */
  it("tem slug único e em kebab-case", () => {
    const slugs = CONVENIOS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("aparece por extenso na resposta da FAQ sobre convênio", () => {
    const resposta = FAQ.find((f) => f.q.toLowerCase().includes("convênio"))?.a ?? "";
    expect(resposta).toContain(CONVENIOS_POR_EXTENSO);
  });
});

describe("pagamento", () => {
  /**
   * A trava de `docs/ANUNCIAR.md` §19, em teste.
   *
   * As condições reais (6x, 24x) existem em `PAGAMENTO.condicoes` e são o
   * script da recepção. O que o site publica é `formas`, sem número — e sem
   * número quer dizer sem dígito: basta alguém escrever "cartão em até 6x" numa
   * das formas para a seção virar vitrine de preço.
   *
   * Se a clínica decidir publicar as condições, o teste some junto com a
   * decisão. Ele não está aqui para impedir a decisão; está para impedir que
   * ela aconteça por descuido.
   */
  it("não publica múltiplo de parcelamento nas formas", () => {
    expect(PAGAMENTO.publicarCondicoes).toBe(false);
    for (const forma of PAGAMENTO.formas) expect(forma).not.toMatch(/\d/);
  });
});

describe("atendimento adaptado", () => {
  /**
   * O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
   *
   * `A_CONFIRMAR` guarda afirmações que a clínica fez sem fechar — a principal
   * é o atendimento sem transferência da cadeira de rodas, que depende da
   * confirmação da Ana. Publicar isso antes da hora faz uma pessoa cadeirante
   * pedir transporte adaptado e atravessar São Paulo para descobrir que não.
   *
   * Quando a confirmação chegar, o item MUDA de lista — não é copiado. Este
   * teste é o que transforma "esqueci de tirar de lá" em CI vermelho.
   */
  it("não publica nada que ainda esteja em A_CONFIRMAR", () => {
    const publicado = ATENDIMENTO.map((p) => `${p.titulo} ${p.texto}`.toLowerCase()).join(" | ");
    for (const pendente of A_CONFIRMAR) {
      expect(publicado).not.toContain(pendente.item.toLowerCase());
    }
    expect(publicado).not.toContain("cadeira de rodas");
    expect(publicado).not.toContain("invisalign");
  });

  it("tem ícone conhecido em cada pilar", () => {
    for (const pilar of ATENDIMENTO) {
      expect(["acessibilidade", "especiais", "sedacao", "idosos"]).toContain(pilar.icone);
    }
  });
});

describe("cuidados complementares", () => {
  /**
   * A lista existe porque essas áreas NÃO têm página. No dia em que uma delas
   * ganhar página, ela sai daqui — senão o site oferece a mesma coisa em dois
   * lugares, um deles clicável e o outro não, e a pessoa conclui que são
   * serviços diferentes.
   */
  it("não repete um tratamento que já tem página", async () => {
    const { TRATAMENTOS } = await import("@/lib/jp");
    const comPagina = TRATAMENTOS.map((t) => t.titulo.toLowerCase());
    for (const area of CUIDADOS_COMPLEMENTARES) {
      expect(comPagina).not.toContain(area.toLowerCase());
    }
  });
});
