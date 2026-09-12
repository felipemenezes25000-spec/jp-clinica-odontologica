#!/usr/bin/env node
/**
 * Sobe o CRC construído, apontado para o banco de teste — só para o Playwright.
 *
 * POR QUE UM SCRIPT, E NÃO UM COMANDO NO `playwright.config.ts`:
 *
 *   O BUILD PRECISA DO PRESET CERTO. `vite.config.ts` usa `defaultPreset:
 *   "vercel"`, que gera funções serverless — uma pasta que não se executa com
 *   `node`. `NITRO_PRESET=node-server` produz um servidor HTTP comum, que é o
 *   que o Playwright sabe esperar.
 *
 *   AS VARIÁVEIS SÃO DO TESTE, E TÊM QUE SER EXPLÍCITAS. Um `.env` local
 *   apontaria o E2E para o banco de quem rodou — inclusive, num dia ruim, para
 *   o Supabase de produção. Aqui elas são montadas a partir de `SUPABASE_URL`,
 *   que a checagem de `e2e/apoio/ambiente.ts` recusa se for o de produção.
 *
 * SEMPRE CONSTRÓI. Reaproveitar `.output` economiza segundos e troca o
 * determinismo por "eu acho que está atualizado" — que é exatamente o que um
 * teste E2E não pode ter.
 */
import { spawnSync } from "node:child_process";

const PORTA = process.env.PORT ?? "3210";

const SUPABASE_URL = (process.env.SUPABASE_URL ?? "").trim();
const SUPABASE_SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE ?? "").trim();

if (SUPABASE_URL.length === 0 || SUPABASE_SERVICE_ROLE.length === 0) {
  console.error(
    [
      "O E2E precisa de um Postgres de teste com PostgREST na frente.",
      "",
      "  docker run -d --name crc-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg16",
      "  node scripts/aplicar-schema.mjs --com-teste",
      "  # e um PostgREST apontado para ele; ver .github/workflows/crc-integracao.yml",
      "",
      "Depois: SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... npm run e2e",
    ].join("\n"),
  );
  process.exit(2);
}

if (/supabase\.co/u.test(SUPABASE_URL)) {
  console.error(
    "RECUSADO: SUPABASE_URL aponta para o Supabase. O E2E INSTALA organização e semeia dados; ele nunca roda contra produção.",
  );
  process.exit(2);
}

const ambiente = {
  ...process.env,
  NITRO_PRESET: "node-server",
  PORT: PORTA,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE,

  /*
   * O POSTGREST DE TESTE SERVE NA RAIZ, e o Supabase sob `/rest/v1`.
   *
   * Era essa diferenca que impedia o adaptador de producao de falar com o banco
   * de teste — e, por consequencia, que os 68 testes de integracao passassem por
   * ele. Agora o prefixo e variavel, e o E2E exercita `servidor/banco.ts` de
   * verdade: o mesmo codigo que fala com producao.
   */
  // "/" E NAO "": no Windows, variavel de ambiente vazia e o mesmo que ausente,
  // e o adaptador cairia no padrao do Supabase. A barra sozinha e um prefixo
  // valido que vira string vazia depois do trim — explicito nos dois sistemas.
  SUPABASE_REST_PREFIXO: "/",

  // O segredo da sessão. Público de propósito: é um servidor efêmero contra um
  // banco efêmero, e o de produção nunca passa por aqui.
  CRC_SESSION_SECRET: "segredo-de-e2e-do-crc-com-no-minimo-32-caracteres",
  CRON_SECRET: "cron-de-e2e",

  CRC_ADMIN_EMAIL: "admin@e2e.local",
  CRC_ADMIN_SENHA: "senha-de-e2e-bem-comprida",
  CRC_ADMIN_NOME: "Administração E2E",

  // NENHUMA MENSAGEM SAI. O sandbox registra e não envia — e ele só sobe fora
  // de produção, o que esta ausência de `NODE_ENV=production` garante.
  WHATSAPP_SANDBOX: "1",
  WHATSAPP_PROVEDOR: "sandbox",
  DENTAL_OFFICE_SANDBOX: "1",
};

const build = spawnSync("npx", ["vite", "build"], {
  stdio: "inherit",
  env: ambiente,
  shell: process.platform === "win32",
});
if (build.status !== 0) process.exit(build.status ?? 1);

const servidor = spawnSync("node", [".output/server/index.mjs"], {
  stdio: "inherit",
  env: ambiente,
});
process.exit(servidor.status ?? 0);
