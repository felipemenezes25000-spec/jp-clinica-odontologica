/**
 * O Estúdio: escrever o texto do agente e ele continuar lá.
 *
 * ============================================================================
 *  O QUE ESTE FLUXO PROTEGE É O CICLO INTEIRO DA FATIA 10: editar cria um
 *  RASCUNHO, e rascunho não fala com paciente. As duas metades importam.
 *
 *    SE O SALVAR NÃO GRAVAR, alguém reescreve o prompt, fecha a aba, e o agente
 *    continua com o texto antigo — sem aviso nenhum.
 *
 *    SE O RASCUNHO ENTRASSE EM USO, um texto não avaliado passaria a responder
 *    paciente no instante em que alguém digitou nele.
 *
 *  A segunda é asserção de banco: a versão gravada nasce `RASCUNHO`, e não
 *  `PUBLICADA`. Uma tela que "salva e publica" pareceria idêntica.
 * ============================================================================
 */
import { expect, test } from "@playwright/test";

import { lerDoBanco } from "./apoio/ambiente";
import { abrirAba, entrarNoCrc } from "./apoio/entrar";

const MARCA =
  "Fale sempre em no máximo duas linhas, e confirme o nome da pessoa antes de qualquer coisa.";

test("salvar o texto do agente cria RASCUNHO, e ele sobrevive ao reload", async ({ page }) => {
  await entrarNoCrc(page);
  await abrirAba(page, "Estúdio");

  const editor = page.getByRole("textbox").first();
  await expect(editor).toBeVisible();

  const original = await editor.inputValue();
  // O texto precisa ter corpo: o servidor recusa instrução curta demais, e um
  // teste que manda "abc" estaria provando a validação, não o salvamento.
  const novo = `${original}\n\n${MARCA}`;

  await editor.fill(novo);
  await page
    .getByRole("button", { name: /^Salvar/u })
    .first()
    .click();

  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ status: string; instrucoes: string }>(
          `crc_agent_versions?status=eq.RASCUNHO&select=status,instrucoes`,
        );
        return linhas[0]?.instrucoes ?? "";
      },
      { timeout: 15_000, message: "o rascunho não chegou ao banco" },
    )
    .toContain(MARCA);

  /*
   * NASCE RASCUNHO. A asserção é sobre O TEXTO, e não sobre a tabela estar
   * vazia: o banco de teste é compartilhado com a suíte de integração, que
   * publica versões próprias. "Nenhuma publicada" reprovaria por causa de um
   * vizinho, e um teste que reprova por vizinho é um teste que se aprende a
   * reexecutar sem ler.
   */
  const publicadas = await lerDoBanco<{ instrucoes: string }>(
    `crc_agent_versions?status=eq.PUBLICADA&select=instrucoes`,
  );
  expect(publicadas.some((v) => v.instrucoes.includes(MARCA))).toBe(false);

  // E a tela relê do servidor.
  await page.reload();
  await abrirAba(page, "Estúdio");
  await expect(page.getByRole("textbox").first()).toHaveValue(new RegExp(MARCA.slice(0, 30), "u"));
});
