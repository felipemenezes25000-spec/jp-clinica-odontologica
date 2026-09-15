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

  /*
   * A META, TAMBÉM EM SANDBOX — §54.
   *
   * ==========================================================================
   *  O §54 é explícito: "não dependa da Meta real para CI". E a razão é
   *  aritmética: o App Review leva semanas, a conta de teste tem cota própria, e
   *  um pipeline que precisa de Instagram real para rodar é um pipeline que roda
   *  uma vez e é desligado.
   *
   *  `META_SANDBOX=1` substitui os adapters de Instagram e Messenger por um
   *  fake em memória que REGISTRA os envios. A prova, do lado do teste, é a
   *  mensagem em `crc_messages` com `provider_message_id` começando em
   *  `sandbox-meta-` — o fake vive no processo do SERVIDOR, e o banco é o que os
   *  dois lados compartilham.
   *
   *  A trava de produção é `NODE_ENV === "production"` em `sandboxLigado()`, e
   *  ela não é contornável por variável.
   * ==========================================================================
   */
  META_SANDBOX: "1",

  /*
   * O APP SECRET DO E2E É PÚBLICO DE PROPÓSITO.
   *
   * O teste precisa ASSINAR o webhook que ele mesmo manda — é o único jeito de
   * exercitar a verificação de assinatura de ponta a ponta, que é a fronteira
   * de segurança da integração (§11). Um segredo que o teste não conhece faria
   * o E2E ou pular a verificação (provando nada) ou receber 401 sempre.
   *
   * É um servidor efêmero contra um banco efêmero, e o segredo de produção
   * nunca passa por aqui — o mesmo argumento de `CRC_SESSION_SECRET` acima.
   */
  /*
   * AS TRES, E NAO DUAS. `appDoAmbiente()` só devolve o app quando
   * `META_APP_ID`, `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` estão os
   * três presentes — é uma decisão de falhar fechado, e não um descuido.
   *
   * Faltando só o `META_APP_ID`, `appSecretDoCanal` devolve string vazia e TODO
   * webhook é recusado com `motivo: "sem_segredo"`. O sintoma na tela é "a Meta
   * não está mandando nada", e a causa é uma variável que ninguém associaria a
   * assinatura. Foi exatamente esse o defeito na primeira volta deste E2E.
   */
  META_APP_ID: "app-id-de-e2e-do-crc",
  META_APP_SECRET: "app-secret-de-e2e-do-crc",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-de-e2e-do-crc",

  /*
   * A CHAVE DE CIFRA. Sem ela, `conectarCanalMeta` RECUSA gravar o token — por
   * construção, e não por descuido (ver `servidor/segredo.ts`). O E2E semeia o
   * canal direto no banco, mas a tela de Integrações precisa dela para o teste
   * de conexão funcionar.
   *
   * 32 bytes em base64, fixos: um valor aleatório por execução tornaria
   * ilegível o que a execução anterior gravou, e o cenário do E2E é recriado do
   * zero a cada volta de qualquer forma.
   */
  CRC_SEGREDO_CHAVE: Buffer.alloc(32, 42).toString("base64"),

  // A URL pública que a tela de Integrações mostra. Aqui é o próprio servidor
  // efêmero: o que o teste confere é que a tela NÃO mostra a URL incompleta.
  CRC_URL_PUBLICA: `http://127.0.0.1:${PORTA}`,
};

/*
 * ============================================================================
 *  O BUILD E O DE PRODUCAO, E ISSO E DELIBERADO.
 *
 *  `playwright.config.ts` exige o bundle de verdade: e ele que mantem o grafo do
 *  servidor fora do pacote do navegador, e e nele que um segredo vazando para o
 *  cliente apareceria. Construir em outro modo trocaria o artefato que vai ao ar
 *  por um parecido — e o E2E existe justamente para exercitar o que vai ao ar.
 *
 *  ISTO JA FOI DIFERENTE, POR UM MOTIVO REAL. As travas de sandbox liam
 *  `process.env["NODE_ENV"]` direto, o bundler dobrava a comparacao em tempo de
 *  build, e o caminho do sandbox era REMOVIDO do artefato — em qualquer modo. A
 *  saida provisoria foi construir em `development`; a saida definitiva foi
 *  `servidor/ambiente.ts`, que mantem a pergunta para o runtime.
 *
 *  Com a trava em runtime, o build volta a ser o de producao e o `NODE_ENV` do
 *  PROCESSO passa a decidir — que e o que a linha abaixo faz.
 * ============================================================================
 */
const build = spawnSync("npx", ["vite", "build"], {
  stdio: "inherit",
  env: ambiente,
  shell: process.platform === "win32",
});
if (build.status !== 0) process.exit(build.status ?? 1);

/*
 * ============================================================================
 *  E O SERVIDOR RODA COM `NODE_ENV=test` — e e ISTO que liga os sandboxes.
 *
 *  O preset `node-server` do Nitro define `NODE_ENV=production` no processo. Sem
 *  esta linha, o servidor do E2E se declara producao e `ehProducao()` fecha as
 *  duas travas: `WHATSAPP_SANDBOX=1` e `META_SANDBOX=1` passam a ser ignorados,
 *  e o E2E deixa de provar qualquer envio.
 *
 *  AS TRAVAS CONTINUAM CERTAS EM PRODUCAO: la a variavel esta definida pelo
 *  runtime, e ninguem a apaga por acidente. Ligar sandbox em producao exigiria
 *  apagar `NODE_ENV` E definir `META_SANDBOX=1` — duas coisas, uma delas
 *  desfazendo o que a plataforma faz sozinha.
 * ============================================================================
 */
const servidor = spawnSync("node", [".output/server/index.mjs"], {
  stdio: "inherit",
  env: { ...ambiente, NODE_ENV: "test" },
});
process.exit(servidor.status ?? 0);
