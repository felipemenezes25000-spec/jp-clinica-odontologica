import { expect, test } from "@playwright/test";

/**
 * Regressão da LP paga: o cabeçalho enxuto precisa ser enxuto também no menu
 * móvel. O teste olha o DOM, não apenas visibilidade, porque no projeto desktop
 * a navegação móvel fica escondida por CSS mas continua sendo o mesmo markup que
 * o celular receberá.
 *
 * São dois cabeçalhos enxutos. As LPs curtas (`/ortodontia`, `/limpeza-dental`…)
 * mantêm o menu móvel, só que sem os caminhos de fuga. As experiências dedicadas
 * de implante e clareamento (6334b23) nem têm menu: o lugar dele é do WhatsApp.
 * A comparação orgânica usa ortodontia porque, desde 7f7b09a,
 * `/tratamentos/implantes-dentarios` também serve a landing de implante.
 */
const SAIDAS = ["/#clinica", "/#tratamentos", "/#equipe", "/#depoimentos", "/#fale", "/carreiras"];

test.describe("menu móvel da landing paga", () => {
  test("não oferece caminhos de fuga e preserva telefone + WhatsApp", async ({ page }) => {
    await page.goto("/ortodontia");

    const menuMovel = page.locator('nav[aria-label="Navegação móvel"]');
    await expect(menuMovel).toHaveCount(1);

    for (const href of SAIDAS) {
      await expect(menuMovel.locator(`a[href="${href}"]`)).toHaveCount(0);
    }

    await expect(menuMovel.locator('a[href^="tel:"]')).toHaveCount(1);
    await expect(menuMovel.locator('a[href*="wa.me"]')).toHaveCount(1);
  });

  test("na conversão direta não há menu: o topo fica com telefone e WhatsApp", async ({ page }) => {
    await page.goto("/implante-dentario");

    const header = page.locator("header");
    await expect(page.locator('nav[aria-label="Navegação móvel"]')).toHaveCount(0);
    await expect(header.locator('[aria-controls="menu-mobile"]')).toHaveCount(0);

    for (const href of SAIDAS) {
      await expect(header.locator(`a[href="${href}"]`)).toHaveCount(0);
    }

    // Sem menu, os dois contatos precisam estar À VISTA no topo, em qualquer
    // largura; não basta existirem no HTML.
    await expect(header.locator('a[href^="tel:"]:visible').first()).toBeVisible();
    await expect(header.locator('a[href*="wa.me"]:visible').first()).toBeVisible();
  });

  test("a página orgânica continua com a navegação móvel completa", async ({ page }) => {
    await page.goto("/tratamentos/ortodontia");

    const menuMovel = page.locator('nav[aria-label="Navegação móvel"]');
    await expect(menuMovel.locator('a[href="/#tratamentos"]')).toHaveCount(1);
    await expect(menuMovel.locator('a[href="/carreiras"]')).toHaveCount(1);
    await expect(menuMovel.locator('a[href^="tel:"]')).toHaveCount(1);
    await expect(menuMovel.locator('a[href*="wa.me"]')).toHaveCount(1);
  });
});
