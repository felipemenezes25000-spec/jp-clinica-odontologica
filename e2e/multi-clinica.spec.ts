/**
 * Quem só alcança a Clínica A não vê a Clínica B.
 *
 * ============================================================================
 *  O TESTE MAIS IMPORTANTE DESTA SUÍTE, e o único que é sobre dado de paciente
 *  atravessando fronteira. Num sistema de saúde, isso não é defeito funcional:
 *  é a ficha de alguém aparecendo para quem não deveria vê-la.
 *
 *  A CADEIA QUE ELE EXERCITA não existe em nenhum outro teste:
 *
 *    cookie do usuário → `contexto()` monta `clinicIds` → a server fn filtra
 *    por `ctx.alcanca(...)` → a lista chega à tela já recortada
 *
 *  Os testes de unidade provam `alcancaClinica()`. Os de integração provam a
 *  RLS. NENHUM prova que a server fn realmente chama o filtro — e é aí que o
 *  vazamento acontece: uma consulta nova que esquece a linha do `filter`.
 * ============================================================================
 *
 * POR QUE O USUÁRIO É CRIADO PELA TELA: porque a senha precisa do `scrypt` do
 * servidor. Reproduzi-lo aqui criaria uma segunda implementação do login.
 *
 * E POR QUE A CLÍNICA É TIRADA PELO BANCO: porque não existe tela para escolher
 * as unidades de quem se cadastra — o convite herda as clínicas de quem convida,
 * e o admin alcança todas. É lacuna de interface, e está registrada no relatório
 * como tal em vez de ser disfarçada aqui.
 */
import { expect, test } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_SENHA,
  lerDoBanco,
  PREFIXO,
  URL_BANCO,
  CHAVE_BANCO,
} from "./apoio/ambiente";
import { CLINICA_B } from "./apoio/instalar";
import { abrirAba, entrarNoCrc, navegacao } from "./apoio/entrar";

const RECEPCAO = {
  nome: "Recepção Centro",
  email: "recepcao@e2e.local",
  senha: "senha-da-recepcao-1",
};

test("usuário restrito à unidade A não enxerga paciente da unidade B", async ({ page }) => {
  // --- 1. O admin cadastra a pessoa, pela tela ------------------------------
  await entrarNoCrc(page);
  await abrirAba(page, "Equipe");

  const jaExiste = await lerDoBanco(`crc_users?email=eq.${RECEPCAO.email}&select=id`);
  if (jaExiste.length === 0) {
    await page.getByRole("button", { name: "Cadastrar pessoa" }).first().click();
    await page.getByLabel("Nome").fill(RECEPCAO.nome);
    await page.getByLabel("E-mail").fill(RECEPCAO.email);
    await page.getByLabel("Senha").fill(RECEPCAO.senha);
    await page.getByRole("button", { name: "Cadastrar", exact: true }).click();

    await expect
      .poll(
        async () => (await lerDoBanco(`crc_users?email=eq.${RECEPCAO.email}&select=id`)).length,
        {
          timeout: 10_000,
          message: "o usuário não foi criado",
        },
      )
      .toBe(1);
  }

  // --- 2. Tira o acesso dela à unidade vizinha ------------------------------
  const [usuario] = await lerDoBanco<{ id: string }>(
    `crc_users?email=eq.${RECEPCAO.email}&select=id`,
  );
  if (usuario === undefined) throw new Error("usuário não encontrado depois de criado");

  await fetch(
    `${URL_BANCO}${PREFIXO}/crc_user_clinics?user_id=eq.${usuario.id}&clinic_id=eq.${CLINICA_B.id}`,
    {
      method: "DELETE",
      headers: { apikey: CHAVE_BANCO, authorization: `Bearer ${CHAVE_BANCO}` },
    },
  );

  // --- 3. O admin sai, e ela entra ------------------------------------------
  await page.getByRole("button", { name: "Sair do CRC" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();

  await page.getByLabel("E-mail").fill(RECEPCAO.email);
  await page.getByLabel("Senha").fill(RECEPCAO.senha);
  await page.getByRole("button", { name: "Entrar no CRC" }).click();
  await expect(navegacao(page, "Conversas")).toBeVisible();

  const guia = page.getByRole("button", { name: "Já sei usar — não mostrar mais" });
  if (await guia.isVisible().catch(() => false)) await guia.click();

  // --- 4. A prova ------------------------------------------------------------
  await abrirAba(page, "Pacientes");
  await page.getByLabel("Buscar paciente por nome ou telefone").fill("Paciente");
  await page.waitForTimeout(1500);

  /*
   * O PACIENTE DA UNIDADE VIZINHA EXISTE NO BANCO — é o que torna a ausência
   * significativa. Sem esta asserção, o teste passaria num sistema que
   * simplesmente não achou ninguém.
   */
  const naBase = await lerDoBanco(`crc_patients?clinic_id=eq.${CLINICA_B.id}&select=id,nome`);
  expect(naBase.length).toBeGreaterThan(0);

  await expect(page.getByText(CLINICA_B.paciente)).toHaveCount(0);
});

test("o admin, esse sim, enxerga as duas unidades", async ({ page }) => {
  /*
   * O CONTRAPESO. Sem ele, "a lista está vazia" passaria como isolamento — e
   * uma tela quebrada teria a mesma aparência de uma tela segura.
   */
  await page.goto("/crc");
  await page.getByLabel("E-mail").fill(ADMIN_EMAIL);
  await page.getByLabel("Senha").fill(ADMIN_SENHA);
  await page.getByRole("button", { name: "Entrar no CRC" }).click();
  await expect(navegacao(page, "Conversas")).toBeVisible();

  const guia = page.getByRole("button", { name: "Já sei usar — não mostrar mais" });
  if (await guia.isVisible().catch(() => false)) await guia.click();

  await abrirAba(page, "Pacientes");
  await page.getByLabel("Buscar paciente por nome ou telefone").fill("Paciente");

  await expect(page.getByText(CLINICA_B.paciente)).toBeVisible({ timeout: 10_000 });
});
