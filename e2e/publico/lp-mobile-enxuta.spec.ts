import { expect, test } from "@playwright/test";

/**
 * Regressão da LP paga: o cabeçalho enxuto precisa ser enxuto também no menu
 * móvel. O teste olha o DOM, não apenas visibilidade, porque no projeto desktop
 * a navegação móvel fica escondida por CSS mas continua sendo o mesmo markup que
 * o celular receberá.
 */
test.describe("menu móvel da landing paga", () => {
  test("não oferece caminhos de fuga e preserva telefone + WhatsApp", async ({ page }) => {
    await page.goto("/implante-dentario");

    const menuMovel = page.locator('nav[aria-label="Navegação móvel"]');
    await expect(menuMovel).toHaveCount(1);

    for (const href of [
      "/#clinica",
      "/#tratamentos",
      "/#equipe",
      "/#depoimentos",
      "/#fale",
      "/carreiras",
    ]) {
      await expect(menuMovel.locator(`a[href="${href}"]`)).toHaveCount(0);
    }

    await expect(menuMovel.locator('a[href^="tel:"]')).toHaveCount(1);
    await expect(menuMovel.locator('a[href*="wa.me"]')).toHaveCount(1);
  });

  test("a página orgânica continua com a navegação móvel completa", async ({ page }) => {
    await page.goto("/tratamentos/implantes-dentarios");

    const menuMovel = page.locator('nav[aria-label="Navegação móvel"]');
    await expect(menuMovel.locator('a[href="/#tratamentos"]')).toHaveCount(1);
    await expect(menuMovel.locator('a[href="/carreiras"]')).toHaveCount(1);
    await expect(menuMovel.locator('a[href^="tel:"]')).toHaveCount(1);
    await expect(menuMovel.locator('a[href*="wa.me"]')).toHaveCount(1);
  });
});
