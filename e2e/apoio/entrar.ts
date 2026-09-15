/**
 * Entrar no CRC pela tela — e não por cookie forjado.
 *
 * A TENTAÇÃO É INJETAR O COOKIE DE SESSÃO e pular o login. Não: metade do que
 * estes testes existem para provar está exatamente aí — o formulário chama a
 * server fn, o `scrypt` confere a senha, o cookie volta assinado, e o
 * carregamento seguinte o aceita. Forjar o cookie testaria o cookie que o teste
 * escreveu.
 */
import { expect, type Page } from "@playwright/test";

import { ADMIN_EMAIL, ADMIN_SENHA } from "./ambiente";

export async function entrarNoCrc(
  page: Page,
  opcoes: {
    /**
     * Deixe `false` para medir a tela COMO ELA CHEGA a quem entra pela primeira
     * vez.
     *
     * Por padrão o guia é fechado, porque com ele aberto todo clique na lateral
     * bate no overlay. Mas um teste que SEMPRE o fecha nunca consegue observar
     * o custo de ele estar aberto — e foi assim que um teste de "o conteúdo
     * aparece acima da dobra" passou com o defeito reinjetado: ele media uma
     * tela que o próprio helper já tinha limpado.
     *
     * Quem passar `false` deve navegar por URL, e não por clique.
     */
    fecharGuia?: boolean;
  } = {},
): Promise<void> {
  await page.goto("/crc");

  // O formulário só aparece quando a sessão foi conferida e não existe.
  const email = page.getByLabel("E-mail");
  await expect(email).toBeVisible();

  await email.fill(ADMIN_EMAIL);
  await page.getByLabel("Senha").fill(ADMIN_SENHA);
  await page.getByRole("button", { name: "Entrar no CRC" }).click();

  // O painel carregou: a navegação lateral só existe com sessão.
  await expect(navegacao(page, "Conversas")).toBeVisible();

  if (opcoes.fecharGuia !== false) await fecharOGuia(page);
}

/**
 * O guia de primeiro uso cobre a navegação.
 *
 * ELE É POR NAVEGADOR, e não por conta: cada contexto novo do Playwright começa
 * com ele aberto. Sem fechá-lo, todo clique na lateral bate no overlay — e o
 * erro que aparece é "elemento interceptado", que manda procurar no lugar
 * errado.
 */
async function fecharOGuia(page: Page): Promise<void> {
  const botao = page.getByRole("button", { name: "Já sei usar — não mostrar mais" });
  if (await botao.isVisible().catch(() => false)) await botao.click();
}

/**
 * Um item da navegação.
 *
 * O NOME ACESSÍVEL É "Conversas — o WhatsApp da clínica, com contexto ao lado":
 * o rótulo mais a explicação. Casar por prefixo é o que sobrevive a alguém
 * melhorar a explicação — e casar pelo texto inteiro transformaria este arquivo
 * numa cópia da interface.
 */
export function navegacao(page: Page, rotulo: string): ReturnType<Page["getByRole"]> {
  /*
   * `link`, E NÃO `button`.
   *
   * O item do menu era um `<button>` que trocava `useState`. Virou um `<a href>`
   * quando cada tela ganhou endereço próprio — e a diferença é justamente o que
   * se queria: Ctrl+clique abre em aba nova, o botão do meio também, e o leitor
   * de tela anuncia navegação em vez de ação.
   *
   * Esta linha afirmava o contrário, e por isso ela precisava mudar junto: um
   * helper que procura botão é um teste que exige que o menu continue errado.
   */
  return page.getByRole("link", { name: new RegExp(`^${rotulo}(\\s|—|$)`, "u") });
}

/** Troca de aba pela navegação, como uma pessoa faria. */
export async function abrirAba(page: Page, rotulo: string): Promise<void> {
  await navegacao(page, rotulo).click();
}
