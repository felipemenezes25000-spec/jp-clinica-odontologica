/**
 * O interruptor de emergência.
 *
 * ============================================================================
 *  É O BOTÃO QUE ALGUÉM APERTA COM AS MÃOS TREMENDO, e por isso ele é o único
 *  desta suíte que vale por si só. O cenário é uma mensagem saindo errada para
 *  a base inteira: a pessoa abre Integrações e desliga os envios.
 *
 *  Se a chave pintar de vermelho e não gravar, o disparo CONTINUA — e quem
 *  apertou vai embora achando que parou. É o pior desfecho possível de uma
 *  interface: a falsa segurança.
 *
 *  A ASSERÇÃO É NO BANCO, e não no visual da chave, porque é a linha de
 *  `crc_feature_flags` que o motor lê. Tela e motor concordando é justamente o
 *  que precisa ser provado.
 * ============================================================================
 */
import { expect, test } from "@playwright/test";

import { lerDoBanco } from "./apoio/ambiente";
import { abrirAba, entrarNoCrc } from "./apoio/entrar";

const CHAVE = "kill_envios";
const ROTULO = "Pausar envios de WhatsApp";

async function ligada(): Promise<boolean> {
  const linhas = await lerDoBanco<{ ligada: boolean }>(
    `crc_feature_flags?chave=eq.${CHAVE}&select=ligada`,
  );
  return linhas[0]?.ligada === true;
}

test("ligar e desligar o kill switch de envios", async ({ page }) => {
  await entrarNoCrc(page);
  await abrirAba(page, "Integrações");

  const chave = page.getByRole("switch", { name: ROTULO });
  await expect(chave).toBeVisible();

  // --- LIGAR ---------------------------------------------------------------
  await chave.click();

  /*
   * LIGAR PEDE CONFIRMACAO, e desligar nao. A assimetria e deliberada e vale
   * ser afirmada aqui: pausar o envio para a clinica inteira nao pode acontecer
   * por um toque errado no trackpad, e RELIGAR precisa ser imediato — quem
   * apertou por engano as 9h nao pode esperar um dialogo para voltar.
   */
  await expect(page.getByRole("button", { name: "Pausar agora" })).toBeVisible();
  await page.getByRole("button", { name: "Pausar agora" }).click();

  await expect
    .poll(ligada, { timeout: 10_000, message: "o kill switch não chegou ao banco" })
    .toBe(true);

  // A UI REFLETE, e reflete depois de recarregar — não é só o estado local.
  await page.reload();
  await abrirAba(page, "Integrações");
  await expect(page.getByRole("switch", { name: ROTULO })).toHaveAttribute("aria-checked", "true");

  // --- DESLIGAR ------------------------------------------------------------
  /*
   * DESLIGAR É PARTE DO TESTE, e não limpeza. Um interruptor que só liga é uma
   * armadilha: a clínica para o envio numa terça e descobre na quinta que não
   * consegue voltar.
   */
  await page.getByRole("switch", { name: ROTULO }).click();

  await expect
    .poll(ligada, { timeout: 10_000, message: "o kill switch não voltou a desligar" })
    .toBe(false);

  await page.reload();
  await abrirAba(page, "Integrações");
  await expect(page.getByRole("switch", { name: ROTULO })).toHaveAttribute("aria-checked", "false");
});
