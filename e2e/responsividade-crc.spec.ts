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

async function esperarTela(page: Page, aba: string): Promise<void> {
  await navegacao(page, aba).click();
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
      await expect(navegacao(page, "Início")).toBeVisible();
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

    const inicio = navegacao(page, "Início");
    const textoInicio = inicio.locator("span").last();
    await expect(textoInicio).toBeVisible();

    const display = await textoInicio.evaluate((elemento) => getComputedStyle(elemento).display);
    expect(display).not.toBe("none");

    for (const aba of ["Conversas", "Funil", "Agenda"] as const) {
      await esperarTela(page, aba);
      await exigirSemOverflowHorizontal(page, `${aba} em 390x844`);
    }

    // A barra de contexto usa a mesma variavel da altura do rail; nao pode
    // ficar escondida sob a navegacao quando o rail cresce no celular.
    const nav = page.locator(".crc-lateral");
    const contexto = page.locator(".crc-barra-contexto");
    const offsets = await Promise.all([
      nav.evaluate((elemento) => elemento.getBoundingClientRect().height),
      contexto.evaluate((elemento) => Number.parseFloat(getComputedStyle(elemento).top)),
    ]);
    expect(Math.abs(offsets[0] - offsets[1])).toBeLessThanOrEqual(1);
  });
});
