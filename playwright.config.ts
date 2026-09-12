/**
 * E2E de navegador — poucos, e de alto valor.
 *
 * ============================================================================
 *  O QUE ESTES TESTES PROVAM QUE NENHUM OUTRO PROVA.
 *
 *  A suíte do CRC tem 1157 testes de unidade e 68 de integração contra Postgres
 *  real. Eles cobrem domínio, aplicação, filas, concorrência e schema. O que
 *  NÃO cobrem é a camada por onde a clínica realmente usa o sistema:
 *
 *    o cookie de sessão sobrevive a um `reload`?
 *    o `createServerFn` chega ao servidor com o tenant do usuário logado?
 *    salvar uma configuração pela tela GRAVA, ou só pinta a tela de verde?
 *    o kill switch da tela é o mesmo que o motor lê?
 *    um usuário que só enxerga a Clínica A vê dados da B?
 *
 *  Cada um desses é um caminho inteiro — navegador → rota → server fn →
 *  domínio → banco — e nenhum teste de unidade o exercita.
 * ============================================================================
 *
 * POUCOS DE PROPÓSITO. Um E2E por tela vira uma suíte de vinte minutos que
 * quebra quando alguém muda um texto — e aí ela é desligada, que é o pior
 * desfecho. O critério para entrar aqui é: **se isto quebrar em produção,
 * alguém não consegue trabalhar?**
 *
 * NUNCA CONTRA PRODUÇÃO. `globalSetup` INSTALA uma organização do zero e semeia
 * dados de exemplo. Apontar isto para o Supabase real criaria organização e
 * pacientes fictícios numa base com gente de verdade — e a semente de exemplo
 * recusa em produção justamente por isso. A checagem de `SUPABASE_URL` em
 * `e2e/apoio/ambiente.ts` é a segunda tranca.
 */
import { defineConfig, devices } from "@playwright/test";

const PORTA = Number(process.env["E2E_PORTA"] ?? 3210);
export const BASE_URL = `http://127.0.0.1:${String(PORTA)}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/apoio/instalar.ts",

  /*
   * SEM PARALELISMO ENTRE ARQUIVOS, pelo mesmo motivo dos testes de integração:
   * eles compartilham o MESMO banco. Rodando junto, o que um arquivo escreve
   * aparece na tela do outro no meio de uma asserção — e o resultado é falha
   * intermitente, que é o tipo de teste que as pessoas aprendem a reexecutar sem
   * ler.
   */
  fullyParallel: false,
  workers: 1,

  // ZERO RETENTATIVAS, inclusive em CI. Um E2E que só passa na terceira
  // tentativa está dizendo alguma coisa, e `retries` é como se aprende a não
  // ouvir.
  retries: 0,

  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: process.env["CI"] === undefined ? [["list"]] : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    // Rastro só do que falhou: o vídeo de vinte testes verdes é lixo de CI.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  /*
   * O SERVIDOR É O BUILD DE VERDADE, e não o `vite dev`.
   *
   * O `dev` serve os módulos sem passar pelo bundler de produção — e o CRC tem
   * uma regra que só o build exercita: `createServerFn` com `await import()`
   * dentro, que é o que mantém o grafo do servidor fora do pacote do navegador.
   * Um E2E contra o `dev` não veria um segredo vazando para o cliente.
   */
  webServer: {
    command: "node scripts/servidor-e2e.mjs",
    url: `${BASE_URL}/crc`,
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: { PORT: String(PORTA) },
  },
});
