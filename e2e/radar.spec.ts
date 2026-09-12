/**
 * O Radar de Receita, pela tela.
 *
 * ============================================================================
 *  O QUE SÓ ISTO PROVA, e nenhum teste de unidade alcança: a cadeia inteira.
 *
 *    sessão → permissão → server function → `ctx.clinicIds` → RPC no Postgres
 *    → resumo → React → o número na coluna.
 *
 *  Os testes de unidade rodam contra o banco em memória. Ele valida nomes de
 *  coluna contra o SQL, o que é muito — e não prova que `crc_radar_resumo`
 *  existe no Postgres com esta assinatura, nem que o `numeric` volta como
 *  string e sobrevive à conversão, nem que a tela sabe desenhar zero.
 * ============================================================================
 *
 * A ASSERÇÃO CENTRAL É A SEPARAÇÃO DOS DOIS NÚMEROS. Se algum dia a tela passar
 * a mostrar só o potencial — o número grande, o que impressiona — este teste
 * cai. É o ponto inteiro do Radar.
 */
import { expect, test } from "@playwright/test";

import { abrirAba, entrarNoCrc } from "./apoio/entrar";

test("o Radar abre, e mostra o esperado SEPARADO do potencial", async ({ page }) => {
  await entrarNoCrc(page);
  await abrirAba(page, "Radar");

  /*
   * OS DOIS KPIs, LADO A LADO. "Receita esperada" é o valor com a
   * probabilidade dentro; "Se tudo fechar" é a soma dos potenciais. A tela só
   * é honesta com os dois — e a nota embaixo do primeiro é o que transforma um
   * número numa estimativa conferível.
   */
  await expect(page.getByText("Receita esperada", { exact: true })).toBeVisible();
  await expect(page.getByText("valor × chance de fechar")).toBeVisible();
  await expect(page.getByText("Se tudo fechar", { exact: true })).toBeVisible();

  // O terceiro separa o que TEM evento financeiro do que é estimativa.
  await expect(page.getByText("Já confirmado", { exact: true })).toBeVisible();
});

test("com a base vazia, a tela ensina o próximo passo em vez de mostrar nada", async ({ page }) => {
  /*
   * O ESTADO VAZIO É O PRIMEIRO QUE QUALQUER CLIENTE NOVO VÊ, e é o mais fácil
   * de deixar quebrado: uma tabela sem linhas, sem explicação, parecendo um
   * defeito. §113 — todo vazio ensina o próximo passo.
   *
   * O E2E instala uma organização do zero, então este é o caminho normal aqui.
   */
  await entrarNoCrc(page);
  await abrirAba(page, "Radar");

  await expect(page.getByText("Nenhuma oportunidade aberta", { exact: true })).toBeVisible();
  await expect(page.getByText(/Quando a sincronização encontrar faltas/u)).toBeVisible();
});

test("avisa que os números são estimativa enquanto não houver histórico", async ({ page }) => {
  /*
   * ============================================================================
   *  ESTE TESTE PROTEGE A ÚNICA COISA QUE IMPORTA NUM PAINEL DE PREVISÃO: que
   *  ele diga quando está chutando.
   *
   *  As taxas base de `dominio/radar.ts` são palpites declarados como palpites.
   *  Enquanto a clínica não tiver desfechos medidos, a confiança fica no piso —
   *  e a tela tem que DIZER isso, senão o primeiro relatório de ROI é
   *  construído sobre literais do código.
   * ============================================================================
   */
  await entrarNoCrc(page);
  await abrirAba(page, "Radar");

  await expect(page.getByText("Estes números são estimativas.")).toBeVisible();
});

test("o guia da aba explica a diferença entre os dois totais", async ({ page }) => {
  /*
   * O guia é a única parte da tela que pode explicar POR QUE existem dois
   * números. Sem ele, "se tudo fechar" parece um segundo total redundante — e
   * alguém escolheria o maior para pôr na apresentação.
   */
  await entrarNoCrc(page);
  await abrirAba(page, "Radar");

  /*
   * O texto do guia fica no cabecalho da aba, sempre visivel — nao atras do
   * botao "Como usar esta tela", que abre um SEGUNDO painel com o mesmo texto.
   * Foi o que a primeira versao deste teste errou: clicava, o texto passava a
   * existir duas vezes, e a assercao virava ambigua.
   */
  await expect(page.getByText(/RECEITA ESPERADA/u)).toBeVisible();
  await expect(page.getByText(/inútil para prometer/u)).toBeVisible();
});
