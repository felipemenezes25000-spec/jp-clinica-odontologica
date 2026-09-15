import { defineConfig, devices } from "@playwright/test";

/**
 * E2E do SITE PÚBLICO — o funil de tráfego pago.
 *
 * ============================================================================
 *  POR QUE UMA CONFIG SEPARADA DA DO CRC.
 *
 *  `playwright.config.ts` tem `globalSetup` que instala uma organização num
 *  Postgres de teste, e recusa rodar sem ele. É o certo para o CRC — e é
 *  exatamente o contrário do que estes testes precisam provar: que o funil de
 *  aquisição funciona **sem banco, sem CRC e sem container de medição**.
 *
 *  `globalSetup` é de config, não de projeto, então não dá para desligá-lo por
 *  projeto. Duas configs é a forma que o Playwright oferece, e a separação
 *  também é honesta: são duas suítes com pré-requisitos diferentes, e misturá-las
 *  faria `npm run e2e` do site exigir Docker.
 * ============================================================================
 *
 * MOBILE E DESKTOP, e os dois importam aqui. A maior parte do tráfego pago de
 * odontologia chega pelo celular, e o CTA do celular é outro componente (a barra
 * fixa de baixo) — testar só desktop deixaria justamente o caminho majoritário
 * sem cobertura.
 */
const PORTA = Number(process.env["E2E_SITE_PORTA"] ?? 3220);
export const BASE_URL = `http://127.0.0.1:${String(PORTA)}`;

export default defineConfig({
  testDir: "./e2e/publico",

  // Estes testes não compartilham estado nenhum — não há banco. Podem correr
  // em paralelo, ao contrário dos do CRC.
  fullyParallel: true,

  // Zero retentativas, inclusive em CI, pela mesma razão da outra suíte: um E2E
  // que só passa na terceira tentativa está dizendo alguma coisa.
  retries: 0,

  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: process.env["CI"] === undefined ? [["list"]] : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  /*
   * O BUILD DE VERDADE, e não o `vite dev` — mesma razão do CRC, mais uma que é
   * só daqui: os scripts de medição saem de `import.meta.env`, que o Vite
   * substitui por LITERAL em tempo de build. Um teste contra o `dev` não
   * provaria o que o navegador do paciente recebe.
   */
  webServer: {
    command: "node scripts/servidor-site-e2e.mjs",
    url: `${BASE_URL}/implante-dentario`,
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { PORT: String(PORTA) },
  },
});
