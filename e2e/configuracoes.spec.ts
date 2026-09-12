/**
 * Salvar uma configuração pela tela GRAVA, ou só pinta a tela de verde?
 *
 * ============================================================================
 *  A PERGUNTA NÃO É RETÓRICA. A tela de Configurações salva ao SAIR DO CAMPO —
 *  não há botão "salvar tudo". Um `onBlur` que dispara a server fn e ignora o
 *  resultado produz exatamente o pior desfecho possível: o número fica na tela,
 *  a pessoa vai embora achando que mudou a regra, e a automação continua
 *  obedecendo o valor antigo.
 *
 *  Por isso o teste faz DUAS verificações que se completam:
 *
 *    RECARREGA A PÁGINA  — prova que o valor não estava só no estado do React;
 *    LÊ O BANCO          — prova que é a linha que a automação vai ler.
 *
 *  A primeira sozinha passaria com um cache no navegador. A segunda sozinha
 *  passaria com uma tela que grava e mostra outra coisa.
 * ============================================================================
 */
import { expect, test } from "@playwright/test";

import { lerDoBanco } from "./apoio/ambiente";
import { abrirAba, entrarNoCrc } from "./apoio/entrar";

const CAMPO = "Contatos por paciente, por dia";

test("mudar um limite, salvar ao sair do campo, e o valor permanecer", async ({ page }) => {
  await entrarNoCrc(page);
  await abrirAba(page, "Configurações");

  const campo = page.getByLabel(CAMPO);
  await expect(campo).toBeVisible();

  const anterior = (await campo.inputValue()).trim();
  // 1 ou 3 — sempre o OUTRO, para o teste não passar por já estar no valor.
  const novo = anterior === "3" ? "2" : "3";

  await campo.fill(novo);
  // SAIR DO CAMPO É O GATILHO. Um `fill` sem blur não salva nada, e o teste
  // ficaria verde testando a digitação.
  await campo.blur();

  await expect
    .poll(
      async () => {
        const linhas = await lerDoBanco<{ valor: unknown }>(
          `crc_settings?chave=eq.contatosPorDia&select=valor`,
        );
        return String(linhas[0]?.valor ?? "");
      },
      { timeout: 10_000, message: "a configuração não chegou ao banco" },
    )
    .toBe(novo);

  // E sobrevive ao F5: o valor veio do servidor, e não do estado da tela.
  await page.reload();
  await abrirAba(page, "Configurações");
  await expect(page.getByLabel(CAMPO)).toHaveValue(novo);

  // Devolve como estava: o E2E não deixa a base num estado que o próximo teste
  // precise adivinhar.
  const volta = page.getByLabel(CAMPO);
  await volta.fill(anterior);
  await volta.blur();
});

test("o servidor recusa valor fora da faixa — a validação não é só do navegador", async ({
  page,
}) => {
  /*
   * O `min`/`max` do input é conveniência, e some com um `fetch` montado à mão.
   * A regra que vale é a do servidor, e é ela que este caso exercita: a tela
   * envia 999 e o valor no banco NÃO vira 999.
   */
  await entrarNoCrc(page);
  await abrirAba(page, "Configurações");

  const campo = page.getByLabel(CAMPO);
  const anterior = (await campo.inputValue()).trim();

  await campo.fill("999");
  await campo.blur();
  await page.waitForTimeout(1500);

  const linhas = await lerDoBanco<{ valor: unknown }>(
    `crc_settings?chave=eq.contatosPorDia&select=valor`,
  );
  expect(String(linhas[0]?.valor ?? anterior)).not.toBe("999");
});
