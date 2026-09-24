import { expect, test, type Locator, type Page } from "@playwright/test";

const URL_ANUNCIO =
  "/clareamento-dental?utm_source=google&utm_medium=cpc&utm_campaign=clareamento_search&utm_content=c01&gclid=TESTCLAREAMENTO";

async function esperarReferenciaNoWhatsApp(link: Locator) {
  await expect
    .poll(async () => {
      const href = (await link.getAttribute("href")) ?? "";
      return decodeURIComponent(href.split("text=")[1] ?? "");
    })
    .toContain("Ref.:");
}

async function eventos(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => {
    const camada = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return camada.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null && !Array.isArray(item) && "event" in item,
    );
  });
}

async function impedirSaidaParaWhatsApp(page: Page) {
  await page.evaluate(() => {
    document.addEventListener(
      "click",
      (evento) => {
        const alvo = evento.target;
        if (alvo instanceof Element && alvo.closest('a[href*="wa.me"]')) {
          evento.preventDefault();
        }
      },
      { capture: false },
    );
  });
}

test.describe("landing de clareamento para Ads", () => {
  test("a primeira dobra responde à busca e oferece WhatsApp de baixa fricção", async ({
    page,
  }) => {
    const resposta = await page.goto(URL_ANUNCIO);
    expect(resposta?.status()).toBe(200);

    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(/clareamento dental/i);
    await expect(h1).toContainText(/freguesia do ó/i);

    const cta = page.locator('#hero-clareamento a[href*="wa.me"]').first();
    await expect(cta).toBeVisible();
    await expect(cta).toContainText(/valores e horários/i);
    await esperarReferenciaNoWhatsApp(cta);

    const href = (await cta.getAttribute("href")) ?? "";
    const mensagem = decodeURIComponent(href.split("text=")[1] ?? "");
    expect(mensagem.toLowerCase()).toContain("clareamento dental");
    expect(mensagem.toLowerCase()).toContain("valores");
    expect(mensagem.toLowerCase()).toContain("horários");
    expect(mensagem.toLowerCase()).toContain("avaliação");
  });

  test("mantém a animação explicativa de clareamento na experiência premium", async ({ page }) => {
    await page.goto(URL_ANUNCIO);

    const secao = page.locator("#video-clareamento");
    await expect(secao).toBeVisible();
    await expect(secao.locator("video")).toHaveCount(1);
    await expect(secao.getByText(/animação ilustrativa/i)).toBeVisible();
    await expect(secao.getByText(/avaliação de cada paciente/i)).toBeVisible();

    const cta = secao.locator('a[href*="wa.me"]').first();
    await expect(cta).toBeVisible();
    await expect(cta).toContainText(/valores e horários/i);
    await esperarReferenciaNoWhatsApp(cta);
  });

  test("não desvia o clique pago para outros tratamentos nas duas URLs", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    await expect(page.getByText("Outros caminhos de cuidado")).toHaveCount(0);

    await page.goto("/tratamentos/clareamento-dental");
    await expect(page.getByText("Outros caminhos de cuidado")).toHaveCount(0);
  });

  test("um clique no CTA do hero gera exatamente um lead comercial", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    await impedirSaidaParaWhatsApp(page);

    const cta = page.locator('#hero-clareamento a[href*="wa.me"]').first();
    await expect(cta).toBeVisible();
    await cta.click();

    await expect
      .poll(
        async () =>
          (await eventos(page)).filter((item) => item["event"] === "generate_lead").length,
      )
      .toBe(1);

    const leads = (await eventos(page)).filter((item) => item["event"] === "generate_lead");
    expect(leads).toHaveLength(1);
    expect(String(leads[0]?.["treatment"] ?? "").toLowerCase()).toContain("clareamento");
    expect(String(leads[0]?.["channel"] ?? "")).toBe("whatsapp");
    expect(String(leads[0]?.["origem"] ?? "")).toBe("hero-clareamento");
  });

  test("o CTA do vídeo gera lead separado com origem própria", async ({ page }) => {
    await page.goto(URL_ANUNCIO);
    await impedirSaidaParaWhatsApp(page);

    const cta = page.locator('#video-clareamento a[href*="wa.me"]').first();
    await expect(cta).toBeVisible();
    await cta.click();

    await expect
      .poll(
        async () =>
          (await eventos(page)).filter((item) => item["event"] === "generate_lead").length,
      )
      .toBe(1);

    const leads = (await eventos(page)).filter((item) => item["event"] === "generate_lead");
    expect(String(leads[0]?.["origem"] ?? "")).toBe("video-clareamento");
    expect(String(leads[0]?.["channel"] ?? "")).toBe("whatsapp");
  });

  test("o CTA persistente mantém a intenção comercial do clareamento", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(URL_ANUNCIO);
    await page.evaluate(() => window.scrollTo(0, 900));

    const barra = page.locator("#cta-mobile");
    await expect(barra).toBeVisible();

    const cta = barra.locator('a[href*="wa.me"]');
    await expect(cta).toContainText(/falar no whatsapp/i);
    await esperarReferenciaNoWhatsApp(cta);

    const href = (await cta.getAttribute("href")) ?? "";
    const mensagem = decodeURIComponent(href.split("text=")[1] ?? "");
    expect(mensagem.toLowerCase()).toContain("valores");
    expect(mensagem.toLowerCase()).toContain("horários");
  });
});
