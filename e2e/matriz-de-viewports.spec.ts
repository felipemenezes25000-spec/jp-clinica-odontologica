/**
 * A matriz do §15: todas as telas, em treze larguras.
 *
 * ============================================================================
 *  POR QUE ESTE ARQUIVO EXISTE SEPARADO.
 *
 *  `responsividade-crc.spec.ts` já verifica geometria — mas em UMA tela por
 *  viewport, escolhida a dedo. Ele é rápido de propósito, e o cabeçalho dele
 *  explica por quê: "um E2E por tela vira uma suíte de vinte minutos que
 *  alguém desliga".
 *
 *  O critério de aceite pede a matriz inteira: 28 telas × 13 viewports. As
 *  duas coisas são verdadeiras ao mesmo tempo, e a saída não é escolher uma —
 *  é separar por CUSTO:
 *
 *    o arquivo rápido continua em todo push, e é ele que trava o merge;
 *    este aqui varre tudo, e roda inteiro quando alguém pede.
 *
 *  O QUE ELE NÃO FAZ: screenshot por tela. 364 imagens por execução não são
 *  revisadas por ninguém — viram peso no repositório e uma pasta que se ignora.
 *  O Playwright já captura a tela QUANDO FALHA, que é o único momento em que
 *  alguém de fato olha. A asserção aqui é de geometria, que é objetiva e não
 *  precisa de olho humano para julgar.
 * ============================================================================
 *
 * A REGRA, e ela é uma só: **o DOCUMENTO nunca rola na horizontal**. Quando
 * algo precisa rolar de lado — tabela larga, board do funil, faixa de KPIs —
 * o scroll pertence ao componente, e o `<body>` continua parado.
 */
import { expect, test, type Page } from "@playwright/test";

import { entrarNoCrc, navegacao } from "./apoio/entrar";

/** As treze larguras do critério de aceite, do menor celular ao 4K. */
const VIEWPORTS = [
  { nome: "320x568", width: 320, height: 568 },
  { nome: "360x640", width: 360, height: 640 },
  { nome: "390x844", width: 390, height: 844 },
  { nome: "844x390 (paisagem)", width: 844, height: 390 },
  { nome: "430x932", width: 430, height: 932 },
  { nome: "768x1024", width: 768, height: 1024 },
  { nome: "820x1180", width: 820, height: 1180 },
  { nome: "1024x768", width: 1024, height: 768 },
  { nome: "1280x800", width: 1280, height: 800 },
  { nome: "1440x900", width: 1440, height: 900 },
  { nome: "1680x1050", width: 1680, height: 1050 },
  { nome: "1920x1080", width: 1920, height: 1080 },
  { nome: "2560x1440", width: 2560, height: 1440 },
] as const;

/**
 * Os endereços de todas as telas.
 *
 * Escrito à mão e não importado de `src/components/crc/rotas.ts` porque o E2E
 * roda contra o BUILD: importar do código-fonte faria o teste concordar com o
 * código por construção, inclusive quando os dois estivessem errados. Uma lista
 * que diverge é um teste que reprova — que é o comportamento desejado.
 */
const TELAS = [
  "/crc",
  "/crc/radar",
  "/crc/encaixes",
  "/crc/tratamentos",
  "/crc/recepcao",
  "/crc/trabalho",
  "/crc/inbox",
  "/crc/agenda",
  "/crc/funil",
  "/crc/pacientes",
  "/crc/gestao",
  "/crc/metas",
  "/crc/autonomia",
  "/crc/importar",
  "/crc/automacoes",
  "/crc/campanhas",
  "/crc/inteligencia",
  "/crc/conhecimento",
  "/crc/modelos",
  "/crc/avaliacao",
  "/crc/estudio",
  "/crc/playground",
  "/crc/ferramentas",
  "/crc/proximas",
  "/crc/saude",
  "/crc/integracoes",
  "/crc/configuracoes",
  "/crc/equipe",
] as const;

/** Espera o layout assentar: fontes, imagens e dois quadros de reflow. */
async function esperarLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

test.describe("a matriz do §15", () => {
  for (const viewport of VIEWPORTS) {
    test(`nenhuma tela vaza horizontalmente em ${viewport.nome}`, async ({ page }) => {
      /*
       * 28 telas numa execução: o tempo padrão de 30 s não cobre. O número é
       * generoso de propósito — um teste que expira no meio manda investigar
       * performance quando o problema era o relógio.
       */
      test.setTimeout(180_000);

      await page.setViewportSize({ width: 1366, height: 768 });
      await entrarNoCrc(page);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const vazaram: string[] = [];
      const foraDoApp: string[] = [];

      for (const caminho of TELAS) {
        await page.goto(caminho);

        /*
         * ESPERAR A CASCA É OBRIGATÓRIO, e descobri isso da pior maneira.
         *
         * `page.goto()` recarrega a página inteira, e o CRC passa por
         * "Carregando…" enquanto confere a sessão. Medir logo depois do `goto`
         * media essa tela intermediária — que não tem conteúdo e nunca vaza.
         * Oito das 28 telas caíam nisso, e a matriz inteira ficava verde
         * medindo um spinner.
         *
         * O `catch` existe para o diagnóstico continuar sendo uma LISTA. Se a
         * espera estourasse, o teste morreria na primeira tela e ninguém
         * saberia das outras 27.
         *
         * E A TESTEMUNHA É A BARRA DE CONTEXTO, e não a lateral.
         *
         * A primeira versão esperava `.crc-lateral` visível. Funcionava
         * enquanto o menu estava sempre na tela; abaixo de 768 px ele virou
         * gaveta e começa FECHADO — então a espera estourava os 20 s em cada
         * uma das 28 telas, e o teste morria por tempo (180 s) sem ter medido
         * nada. Quatro viewports de celular caíram assim.
         *
         * A barra de contexto existe em toda largura e só depois da sessão.
         */
        await page
          .locator(".crc-barra-contexto")
          .waitFor({ state: "visible", timeout: 20_000 })
          .catch(() => undefined);

        await esperarLayout(page);

        const medida = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          /*
           * A PROVA DE QUE A TELA ABRIU MESMO.
           *
           * A barra de contexto só existe COM sessão; o campo de e-mail só
           * existe SEM ela. Exigir os dois, nos dois sentidos, fecha a porta
           * para o teste medir a tela de login vinte e oito vezes achando que
           * está medindo o CRC.
           */
          temShell: document.querySelector(".crc-barra-contexto") !== null,
          temLogin: document.querySelector('input[type="email"]') !== null,
        }));

        if (!medida.temShell || medida.temLogin) foraDoApp.push(caminho);

        /*
         * A TOLERÂNCIA É DE 1 PIXEL, e não zero: em larguras fracionárias o
         * arredondamento do navegador produz 1 px de diferença que ninguém vê
         * e que nenhuma mudança de CSS resolve. Zero aqui daria falha
         * intermitente — o tipo de teste que as pessoas aprendem a reexecutar.
         */
        if (medida.scrollWidth - medida.clientWidth > 1) {
          vazaram.push(
            `${caminho} (${String(medida.scrollWidth)} > ${String(medida.clientWidth)})`,
          );
        }
      }

      /*
       * ESTA AFIRMAÇÃO VEM PRIMEIRO, e é a que segura o teste de pé.
       *
       * Sem ela a matriz é uma armadilha: se a sessão caísse, as 28 navegações
       * parariam na tela de login — que é estreita, simples e nunca vaza — e os
       * treze viewports ficariam verdes sem ter medido uma única tela do CRC.
       * Verde por não ter chegado lá é indistinguível de verde por estar certo,
       * e é o pior resultado que um teste pode dar.
       */
      expect(
        foraDoApp,
        `Em ${viewport.nome}, estas telas não chegaram a abrir dentro do CRC ` +
          `(caíram no login ou não montaram a casca):\n  ${foraDoApp.join("\n  ")}\n\n` +
          "Enquanto isso durar, a medição de overflow abaixo não vale nada.",
      ).toEqual([]);

      expect(
        vazaram,
        `Em ${viewport.nome}, estas telas deram scroll horizontal no DOCUMENTO:\n  ` +
          `${vazaram.join("\n  ")}\n\n` +
          "O scroll de tabela, board ou faixa larga pertence ao componente — " +
          "use `overflow-x: auto` no container, não deixe vazar para a página.",
      ).toEqual([]);
    });
  }
});

/* ========================================================================== */
/* A regressão do scroll da barra lateral                                     */
/* ========================================================================== */

/**
 * ============================================================================
 *  O CRITÉRIO §15.3: "scroll com o cursor sobre a sidebar não altera o layout
 *  do conteúdo".
 *
 *  Sem `overscroll-behavior: contain`, chegar ao fim do menu e continuar
 *  rolando passa a rolar a PÁGINA atrás dele: o conteúdo se mexe enquanto a
 *  pessoa está olhando para a navegação, e ela não fez nada para isso.
 *
 *  É um defeito que ninguém reporta e todo mundo sente — some no meio de
 *  "a interface é meio estranha".
 * ============================================================================
 */
test.describe("o scroll da barra lateral não vaza", () => {
  test("rolar sobre o menu não move o conteúdo", async ({ page }) => {
    // Alto o bastante para a lateral ter scroll próprio, estreito o bastante
    // para o conteúdo também ter.
    await page.setViewportSize({ width: 1280, height: 620 });
    await entrarNoCrc(page);
    await page.goto("/crc/equipe");
    await esperarLayout(page);

    const lateral = page.locator(".crc-lateral");
    await expect(lateral).toBeVisible();

    const antes = await page.evaluate(() => ({
      pagina: window.scrollY,
      conteudo: document.querySelector("main")?.scrollTop ?? 0,
    }));

    /*
     * ROLA MUITO ALÉM DO FIM, de propósito. O vazamento só acontece DEPOIS que
     * o contêiner interno chega ao fim — rolar pouco passaria sem tocar no
     * defeito, e o teste ficaria verde sem ter exercitado nada.
     */
    const caixa = await lateral.boundingBox();
    expect(caixa, "não achei a barra lateral para posicionar o cursor").not.toBeNull();
    await page.mouse.move((caixa?.x ?? 0) + (caixa?.width ?? 0) / 2, (caixa?.y ?? 0) + 100);
    for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, 600);
    await esperarLayout(page);

    const depois = await page.evaluate(() => ({
      pagina: window.scrollY,
      conteudo: document.querySelector("main")?.scrollTop ?? 0,
    }));

    expect(
      depois.pagina,
      "rolar sobre a barra lateral rolou a PÁGINA. Falta `overscroll-behavior: contain` nela.",
    ).toBe(antes.pagina);

    expect(
      depois.conteudo,
      "rolar sobre a barra lateral rolou o CONTEÚDO. O scroll vazou do menu para o `main`.",
    ).toBe(antes.conteudo);
  });

  test("a lateral rola por dentro, e chega ao fim dela", async ({ page }) => {
    /*
     * A CONTRAPARTIDA. A forma mais fácil de fazer o teste acima passar seria
     * a lateral não rolar nada — e aí os últimos itens do menu ficariam
     * inalcançáveis, que é um defeito pior do que o que se estava consertando.
     */
    await page.setViewportSize({ width: 1280, height: 620 });
    await entrarNoCrc(page);
    await esperarLayout(page);

    const rolagem = await page.evaluate(() => {
      const el = document.querySelector(".crc-lateral");
      if (el === null) return null;
      const antes = el.scrollTop;
      el.scrollTop = el.scrollHeight;
      return { antes, depois: el.scrollTop, total: el.scrollHeight, visivel: el.clientHeight };
    });

    expect(rolagem, "não achei a barra lateral").not.toBeNull();
    expect(
      rolagem === null ? 0 : rolagem.total,
      "a lateral não tem conteúdo além da altura visível — o menu foi cortado?",
    ).toBeGreaterThan(rolagem === null ? 1 : rolagem.visivel);
    expect(
      rolagem === null ? 0 : rolagem.depois,
      "a lateral não rolou por dentro: o último item do menu ficaria inalcançável.",
    ).toBeGreaterThan(0);
  });

  test("o último item do menu é alcançável em tela baixa", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 620 });
    await entrarNoCrc(page);
    await esperarLayout(page);

    const ultimo = navegacao(page, "Equipe");
    await ultimo.scrollIntoViewIfNeeded();
    await expect(ultimo).toBeVisible();
    await ultimo.click();
    await expect(page).toHaveURL(/\/crc\/equipe$/u);
  });
});
