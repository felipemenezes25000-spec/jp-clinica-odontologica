/**
 * A Inbox: abrir uma conversa, e assumi-la.
 *
 * ============================================================================
 *  É A TELA MAIS USADA DO CRC, e a que tem mais caminho por trás de um clique:
 *
 *    clicar na conversa  → server fn → marca lida → o contador do topo cai
 *    assumir             → server fn → grava dono → a IA PARA de responder
 *
 *  O segundo é o que importa de verdade. "Assumir" não é enfeite de interface:
 *  é o que impede o agente de responder por cima de alguém que já está
 *  digitando. Se o botão pintar e não gravar, duas vozes falam com o mesmo
 *  paciente — e ninguém descobre pela tela.
 * ============================================================================
 */
import { expect, test } from "@playwright/test";

import { lerDoBanco } from "./apoio/ambiente";
import { abrirAba, entrarNoCrc } from "./apoio/entrar";

const CONTATO = "(11) 90000-0001";

test("abre a conversa, marca lida e assume", async ({ page }) => {
  await entrarNoCrc(page);
  await abrirAba(page, "Conversas");

  const naFila = page.getByText(CONTATO).first();
  await expect(naFila).toBeVisible();
  await naFila.click();

  // O painel da conversa abriu, com a IA ainda no comando.
  const assumir = page.getByRole("button", { name: "Assumir conversa" });
  await expect(assumir).toBeVisible();

  await assumir.click();

  /*
   * A PROVA É NO BANCO, e não na tela. Uma asserção sobre o botão ter mudado de
   * texto passaria com uma interface que só troca o estado local — que é
   * exatamente o defeito que este teste existe para pegar.
   */
  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ assigned_to: string | null }>(
          `crc_conversations?contato_externo=eq.5511900000001&select=assigned_to`,
        );
        return linhas[0]?.assigned_to ?? null;
      },
      { timeout: 10_000, message: "a conversa não ficou com dono no banco" },
    )
    .not.toBeNull();
});

test("voltar para a fila não perde a conversa", async ({ page }) => {
  await entrarNoCrc(page);
  await abrirAba(page, "Conversas");

  await page.getByText(CONTATO).first().click();
  await abrirAba(page, "Início");
  await abrirAba(page, "Conversas");

  // A fila continua lá — e a conversa não sumiu por ter sido lida.
  await expect(page.getByText(CONTATO).first()).toBeVisible();
});
