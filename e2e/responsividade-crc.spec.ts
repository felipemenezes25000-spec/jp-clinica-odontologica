/**
 * Responsividade do CRC — verifica geometria, nao apenas texto/comportamento.
 *
 * Este teste existe porque uma interface pode continuar "funcionando" para o
 * Playwright enquanto esta espremida, sobreposta ou vazando 300 px para fora
 * da tela. O contrato aqui e simples: de celular pequeno a desktop, o
 * DOCUMENTO nunca ganha scroll horizontal; quando algo precisa rolar (tabela,
 * funil, navegacao), o scroll pertence ao proprio componente.
 */
import { expect, test, type Page } from "@playwright/test";

import { entrarNoCrc, navegacao } from "./apoio/entrar";

const VIEWPORTS = [
  { nome: "celular pequeno", width: 320, height: 568 },
  { nome: "celular", width: 360, height: 800 },
  { nome: "iPhone moderno", width: 390, height: 844 },
  { nome: "celular grande", width: 430, height: 932 },
  { nome: "tablet retrato", width: 768, height: 1024 },
  { nome: "tablet/notebook antigo", width: 1024, height: 768 },
  { nome: "notebook baixo", width: 1280, height: 720 },
  { nome: "notebook 14", width: 1366, height: 768 },
  { nome: "notebook amplo", width: 1440, height: 900 },
  { nome: "full hd", width: 1920, height: 1080 },
] as const;

async function esperarLayout(page: Page): Promise<void> {
  // Duas frames bastam para container queries, sticky e fontes recalcularem.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * Abre a gaveta quando a largura a tem, e não faz nada quando não tem.
 *
 * Abaixo de 768 px o menu deixou de estar sempre na tela (§4). Todo teste que
 * precisa TOCAR um item da navegação passa por aqui primeiro — antes disso eles
 * falhavam com "elemento não encontrado", apontando para o item em vez de para
 * a gaveta fechada.
 */
async function abrirMenuSePrecisar(page: Page): Promise<void> {
  const botao = page.getByRole("button", { name: /Abrir menu/u });
  if (await botao.isVisible().catch(() => false)) await botao.click();
}

async function esperarTela(page: Page, aba: string): Promise<void> {
  await abrirMenuSePrecisar(page);
  const destino = navegacao(page, aba);

  /*
   * No layout móvel só os módulos do grupo atual ficam na segunda faixa. Para
   * ir a outro grupo, fazemos exatamente o que uma pessoa faz: toca o título
   * do grupo e depois o módulo. No desktop o destino já está visível e este
   * bloco simplesmente não roda.
   */
  if (!(await destino.isVisible().catch(() => false))) {
    const grupo = page.locator(".crc-nav-grupo").filter({ has: destino }).first();
    const rotulo = grupo.locator(".crc-nav-rotulo");
    await expect(rotulo).toBeVisible();
    await rotulo.click();
    await expect(destino).toBeVisible();
  }

  await destino.click();
  await expect(page.getByRole("main")).toContainText(aba, { timeout: 15_000 });
  await esperarLayout(page);
}

async function medirDocumento(page: Page): Promise<{
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
}

async function exigirSemOverflowHorizontal(page: Page, contexto: string): Promise<void> {
  const medida = await medirDocumento(page);
  expect(
    medida.scrollWidth - medida.clientWidth,
    `${contexto}: documento vazou horizontalmente (${String(medida.scrollWidth)} > ${String(medida.clientWidth)}).`,
  ).toBeLessThanOrEqual(1);
}

test.describe("CRC responsivo", () => {
  test("a casca cabe de 320 px a Full HD sem scroll horizontal da pagina", async ({ page }) => {
    test.setTimeout(120_000);

    await page.setViewportSize({ width: 1366, height: 768 });
    await entrarNoCrc(page);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await esperarLayout(page);

      await exigirSemOverflowHorizontal(page, viewport.nome);
      await expect(page.getByRole("main")).toBeVisible();

      /*
       * A NAVEGAÇÃO PRECISA ESTAR A UM TOQUE, e não necessariamente na tela.
       * Acima de 768 px ela é a lateral; abaixo, a gaveta — e o critério §15.2
       * diz exatamente isso: "visíveis OU acessíveis em 1 toque".
       */
      const naTela = await navegacao(page, "Início")
        .isVisible()
        .catch(() => false);
      if (!naTela) {
        await expect(page.getByRole("button", { name: /Abrir menu/u })).toBeVisible();
      }
    }
  });

  test("o notebook de 14 polegadas recompõe dashboards pela largura real do conteudo", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.setViewportSize({ width: 1366, height: 768 });
    await entrarNoCrc(page);
    await esperarTela(page, "Agenda");

    const resumo = page.locator(".crc-agenda-resumo-v2");
    await expect(resumo).toBeVisible();

    const colunas = await resumo.evaluate((elemento) =>
      getComputedStyle(elemento).gridTemplateColumns.split(" ").filter(Boolean),
    );

    expect(
      colunas.length,
      "Em 1366x768, a Agenda recebia ~1.050-1.100 px depois da sidebar e nao pode continuar com quatro KPIs espremidos.",
    ).toBe(2);

    await exigirSemOverflowHorizontal(page, "Agenda em 1366x768");

    await esperarTela(page, "Conversas");
    const inbox = page.locator(".crc-inbox-layout-v2");
    await expect(inbox).toBeVisible();

    const geometria = await inbox.evaluate((elemento) => {
      const estilo = getComputedStyle(elemento);
      const caixa = elemento.getBoundingClientRect();
      return {
        minHeight: estilo.minHeight,
        height: caixa.height,
        viewportHeight: window.innerHeight,
      };
    });

    expect(geometria.minHeight).not.toBe("610px");
    expect(geometria.height).toBeLessThan(geometria.viewportHeight);
    await exigirSemOverflowHorizontal(page, "Inbox em 1366x768");
  });

  test("no celular o menu conserva icone e nome e as telas operacionais recompõem", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.setViewportSize({ width: 1366, height: 768 });
    await entrarNoCrc(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await esperarLayout(page);

    // A gaveta guarda o menu no celular: para inspecionar o item, abra-a —
    // que é o que a pessoa faz.
    await abrirMenuSePrecisar(page);

    const inicio = navegacao(page, "Início");
    const textoInicio = inicio.locator("span").last();
    await expect(textoInicio).toBeVisible();

    const display = await textoInicio.evaluate((elemento) => getComputedStyle(elemento).display);
    expect(display).not.toBe("none");

    // Em celular existe uma única faixa de módulos por vez, não um rail com
    // todos os módulos do produto misturados.
    await expect(page.locator(".crc-nav-rotulo").first()).toBeVisible();

    for (const aba of ["Conversas", "Funil", "Agenda"] as const) {
      await esperarTela(page, aba);
      await exigirSemOverflowHorizontal(page, `${aba} em 390x844`);
    }

    /*
     * ========================================================================
     *  ESTA AFIRMAÇÃO MUDOU DE SENTIDO JUNTO COM O DESENHO.
     *
     *  Antes ela exigia que o `top` da barra de contexto fosse IGUAL à altura
     *  da navegação — porque a navegação era uma faixa horizontal fixa no topo,
     *  e a barra tinha de começar logo abaixo dela.
     *
     *  Com a gaveta (§4), a navegação não ocupa altura nenhuma: ela flutua por
     *  cima quando aberta. Manter a regra antiga seria exigir que o conteúdo
     *  continuasse sendo empurrado por uma faixa que não existe mais — e foi
     *  exatamente isso que ela passou a acusar: 736 px (a altura da gaveta)
     *  contra 0.
     *
     *  O que importa agora é o contrário: o conteúdo começa no TOPO, e nada o
     *  empurra.
     * ========================================================================
     */
    await expect(page.locator(".crc-lateral")).toBeHidden();

    const topoDoConteudo = await page
      .locator(".crc-barra-contexto")
      .evaluate((elemento) => Math.round(elemento.getBoundingClientRect().top));

    /*
     * O LIMITE É 32 px, e não zero.
     *
     * A primeira versão exigia 8 px e reprovava com y=22 — que é o
     * `padding-top` normal do conteúdo, respiro legítimo. O que este caso
     * precisa pegar é a FAIXA DE NAVEGAÇÃO voltando, e ela mede 72 px no
     * mínimo (108 px na configuração que existia). 32 px passa longe de um e
     * pega o outro com folga.
     */
    expect(
      topoDoConteudo,
      `a barra de contexto começa em y=${String(topoDoConteudo)}: uma faixa de ` +
        "navegação voltou a empurrar o conteúdo para baixo no celular.",
    ).toBeLessThanOrEqual(32);
  });
});

/**
 * ============================================================================
 *  O TEXTO EXPLICATIVO NAO PODE EMPURRAR O DADO PARA FORA DA TELA.
 *
 *  Medido num notebook comum, 1280x800, antes do conserto:
 *
 *      hero  237 px
 *      guia  393 px
 *      primeiro elemento acionavel da tela Metas em y = 886
 *      ou seja, 86 px ABAIXO da dobra
 *
 *  Quem abria a tela via o titulo, via a explicacao, e via o fim da tela. A
 *  auditoria descreveu Metas como "hero e nada" — e estava descrevendo isto:
 *  o conteudo existia e estava fora de vista.
 *
 *  O guia agora comeca fechado. Este teste existe para que ele nao volte a
 *  comecar aberto sem que alguem perceba o custo.
 * ============================================================================
 */
test.describe("o primeiro dado aparece sem rolar", () => {
  const TELAS = [
    { caminho: "/crc/metas", marca: /Nenhuma meta ainda|Criar a primeira meta|Metas ativas/u },
    { caminho: "/crc/radar", marca: /Recuperavel|Recuperável|Esperado|Nenhum/u },
    { caminho: "/crc/tratamentos", marca: /orçamento|Esperado|Nenhum/iu },
  ];

  for (const tela of TELAS) {
    test(`${tela.caminho}: o conteudo comeca acima da dobra em 1280x800`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      /*
       * `fecharGuia: false` E O PONTO DESTE TESTE.
       *
       * A primeira versao dele chamava `entrarNoCrc(page)` puro — e o helper
       * fecha o guia no login. Resultado: o teste passou com o defeito
       * REINJETADO, porque media uma tela que o proprio helper ja tinha
       * limpado. Um teste que nao consegue falhar e pior que teste nenhum.
       *
       * Aqui a tela e medida como ela chega a quem entra pela primeira vez.
       * A navegacao e por URL porque com o guia aberto o clique na lateral
       * bate no overlay — e agora cada tela tem endereco proprio.
       */
      await entrarNoCrc(page, { fecharGuia: false });
      await page.goto(tela.caminho);
      await esperarLayout(page);

      const alvo = page.getByRole("main").getByText(tela.marca).first();
      await expect(alvo).toBeVisible({ timeout: 15_000 });

      const caixa = await alvo.boundingBox();
      expect(caixa, `${tela.caminho}: nao achei o conteudo para medir`).not.toBeNull();

      /*
       * `toBeVisible` do Playwright NAO basta: ele considera visivel um
       * elemento que existe e nao esta escondido, mesmo fora da area visivel.
       * A dobra e uma medida de pixel, e so a geometria responde.
       */
      expect(
        Math.round(caixa?.y ?? 0),
        `${tela.caminho}: o primeiro conteudo comeca em y=${String(Math.round(caixa?.y ?? 0))}, ` +
          "abaixo da dobra de 800 px. Algum bloco explicativo voltou a abrir por padrao.",
      ).toBeLessThan(800);
    });
  }
});

/* ========================================================================== */
/* §4 — abaixo de 768 px o menu é gaveta                                      */
/* ========================================================================== */

/**
 * ============================================================================
 *  POR QUE A GAVETA, E O QUE ELA DEVOLVE.
 *
 *  Abaixo de 768 px a lateral era uma faixa horizontal fixa de 108 px no topo
 *  de TODA tela. Num iPhone de 844 px de altura isso é 13% da tela gasta com
 *  navegação que se usa uma vez a cada vários minutos — e que some por baixo do
 *  teclado assim que alguém digita.
 *
 *  Medido depois: o conteúdo passou a ocupar os 390 px inteiros.
 * ============================================================================
 */
test.describe("no celular o menu é gaveta", () => {
  test("começa fora da tela, e o conteúdo ocupa a largura inteira", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrarNoCrc(page);
    await esperarLayout(page);

    const lateral = page.locator(".crc-lateral");

    /*
     * `visibility: hidden` E NÃO SÓ DESLOCADA. Uma gaveta apenas translada para
     * fora continua recebendo foco: tabular passaria por trinta itens que
     * ninguém vê. É a diferença entre estar escondida e estar fora do caminho.
     */
    await expect(lateral).toBeHidden();

    const main = await page.locator("main").boundingBox();
    expect(Math.round(main?.width ?? 0), "o conteúdo não ocupou a largura toda").toBe(390);
  });

  test("abre no botão, fecha no Escape e fecha ao navegar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await entrarNoCrc(page);
    await esperarLayout(page);

    const lateral = page.locator(".crc-lateral");
    const abrir = page.getByRole("button", { name: /Abrir menu/u });

    await abrir.click();
    await expect(lateral).toBeVisible();
    await expect(page.getByRole("button", { name: /Fechar menu/u }).first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(lateral).toBeHidden();

    /*
     * FECHAR AO NAVEGAR é o caso mais esquecido: sem ele a gaveta fica aberta
     * por cima da tela que ela mesma acabou de abrir, e a pessoa tem de fechá-la
     * para ver o que pediu.
     */
    await abrir.click();
    await expect(lateral).toBeVisible();
    // Com a gaveta aberta o item já é alcançável — é para isso que ela serve.
    await navegacao(page, "Radar").click();
    await expect(page).toHaveURL(/\/crc\/radar/u);
    await expect(lateral).toBeHidden();
  });

  test("o botão de abrir não existe no desktop", async ({ page }) => {
    /*
     * A contrapartida. Um botão "abrir menu" numa tela onde o menu já está
     * sempre visível é um controle que não faz nada — e quem clica espera algo.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrarNoCrc(page);
    await esperarLayout(page);

    await expect(page.locator(".crc-lateral")).toBeVisible();
    await expect(page.getByRole("button", { name: /Abrir menu/u })).toBeHidden();
  });
});
