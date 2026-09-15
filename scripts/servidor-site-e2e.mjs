#!/usr/bin/env node
/**
 * Sobe o SITE PÚBLICO construído — sem banco, sem CRC, sem RH.
 *
 * ============================================================================
 *  POR QUE UM SEGUNDO SERVIDOR DE E2E.
 *
 *  `servidor-e2e.mjs` existe para o CRC e EXIGE um Postgres de teste: ele
 *  recusa subir sem `SUPABASE_URL`, e o `globalSetup` do Playwright instala uma
 *  organização antes do primeiro teste.
 *
 *  O funil de tráfego pago não tem nada disso. Ele é: anúncio → landing →
 *  WhatsApp. E o requisito mais importante dele é justamente **funcionar com o
 *  CRC desligado** — porque na primeira fase de campanha o CRC não está
 *  operacional.
 *
 *  Então este servidor sobe DE PROPÓSITO sem variável nenhuma de banco. Não é
 *  simplificação de teste: é o ambiente que a campanha vai encontrar. Se o CTA
 *  de WhatsApp depender do CRC em algum ponto, é aqui que fica vermelho.
 * ============================================================================
 *
 * O PRESET É `node-server` pelo mesmo motivo do outro script: `vite.config.ts`
 * usa `vercel`, que gera funções serverless — uma pasta que não se executa com
 * `node`.
 *
 * SEM `VITE_GTM_ID` E SEM `VITE_META_PIXEL_ID`, também de propósito: o E2E
 * prova que o site funciona sem container de medição instalado, que é o estado
 * de hoje. O `dataLayer` continua recebendo os eventos — ele é só um array —,
 * e é assim que o teste consegue conferir a contagem sem depender do Google.
 */
import { spawnSync } from "node:child_process";

const PORTA = process.env.PORT ?? "3220";

const ambiente = {
  ...process.env,
  NITRO_PRESET: "node-server",
  PORT: PORTA,

  /*
   * APAGADAS EXPLICITAMENTE, e não apenas "não definidas".
   *
   * Quem roda isto na própria máquina costuma ter um `.env` com o Supabase de
   * desenvolvimento exportado no shell. Herdar essas variáveis faria o teste
   * passar por um caminho que a campanha não terá — e o dia em que o CTA
   * voltasse a depender do CRC, este arquivo estaria verde.
   */
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE: "",
  CRC_SESSION_SECRET: "",
  RH_SESSION_SECRET: "",
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
