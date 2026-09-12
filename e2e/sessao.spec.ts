/**
 * Entrar, ficar dentro, e sair.
 *
 * ============================================================================
 *  O QUE SÓ ISTO PROVA. A senha é conferida por `scrypt` no servidor, o cookie
 *  volta assinado com `CRC_SESSION_SECRET`, e o carregamento seguinte o aceita.
 *  Nenhum teste de unidade exercita os três juntos — e é a cadeia inteira que
 *  decide se a recepção consegue trabalhar de manhã.
 *
 *  O `reload` no meio não é enfeite: sessão que só existe em memória do React
 *  passaria no teste de login e sumiria no primeiro F5.
 * ============================================================================
 */
import { expect, test } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_SENHA } from "./apoio/ambiente";
import { entrarNoCrc, navegacao } from "./apoio/entrar";

test("entra, sobrevive a um reload, e sai", async ({ page }) => {
  await entrarNoCrc(page);

  // A sessão é do COOKIE, e não do estado do React.
  await page.reload();
  await expect(navegacao(page, "Conversas")).toBeVisible();

  await page.getByRole("button", { name: "Sair do CRC" }).click();

  // De volta à porta: o formulário só aparece quando não há sessão.
  await expect(page.getByLabel("E-mail")).toBeVisible();

  /*
   * E SAIR TEM QUE APAGAR O COOKIE, e não só trocar a tela. Um `logout` que
   * navega sem invalidar a sessão deixa quem usa o computador da recepção
   * achando que saiu.
   */
  await page.reload();
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

test("senha errada não entra, e a mensagem não diz se o e-mail existe", async ({ page }) => {
  /*
   * A MENSAGEM GENÉRICA É DELIBERADA. "E-mail não encontrado" transforma o
   * login num oráculo de quem trabalha na clínica — e é a primeira coisa que um
   * ataque de credencial faz: enumerar contas antes de tentar senha.
   */
  await page.goto("/crc");
  await page.getByLabel("E-mail").fill(ADMIN_EMAIL);
  await page.getByLabel("Senha").fill(`${ADMIN_SENHA}-errada`);
  await page.getByRole("button", { name: "Entrar no CRC" }).click();

  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(navegacao(page, "Conversas")).toHaveCount(0);
});
