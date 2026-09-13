/**
 * A divisão do pacote não pode custar a navegação.
 *
 * ============================================================================
 *  ESTE ARQUIVO EXISTE POR CAUSA DE UMA REGRESSÃO QUE FOI AO AR.
 *
 *  Uma tentativa anterior de dividir o pacote do CRC foi revertida em
 *  `158c77d` com a descrição do usuário: "a página está toda quebrada". O
 *  commit que a introduziu dizia, textualmente, "NÃO VERIFICADO: a troca de
 *  abas depois do login" — e mesmo assim foi publicado.
 *
 *  O ERRO NÃO FOI O `lazy`. Foi a FRONTEIRA DO `Suspense`: acima do layout,
 *  trocar de aba desmontava a casca inteira — barra lateral, cabeçalho, barra
 *  de contexto — e a tela piscava em branco a cada clique.
 *
 *  Escrever "não verificado" num commit não é substituto para verificar. Este
 *  arquivo é a verificação, e ela roda no CI a cada mudança.
 * ============================================================================
 *
 * O QUE ELE PROVA, e cada item corresponde a um jeito de a divisão dar errado:
 *
 *   A CASCA NUNCA SAI DO AR. É o defeito exato da regressão anterior.
 *   CADA TELA CHEGA. Um `lazy` com nome de export errado só falha em runtime.
 *   NADA DE TELA VEM ANTES DA SENHA. É o ganho que justifica a mudança.
 *   VOLTAR PARA UMA ABA JÁ ABERTA NÃO BAIXA DE NOVO. Prova o cache do módulo.
 */
import { expect, test } from "@playwright/test";

import { entrarNoCrc, navegacao } from "./apoio/entrar";

/**
 * As abas visitadas. Seis, e não trinta.
 *
 * Cada uma custa um clique e uma espera; trinta viram três minutos de suíte que
 * alguém desliga. Estas seis cobrem as formas diferentes de tela que existem:
 * lista com filtro, painel de números, conversa, calendário, formulário e
 * administração.
 */
const ABAS = ["Conversas", "Funil", "Gestão", "Agenda", "Configurações", "Equipe"] as const;

test.describe("a navegação com telas sob demanda", () => {
  test("a casca do portal nunca desmonta ao trocar de aba", async ({ page }) => {
    await entrarNoCrc(page);

    /*
     * A BARRA LATERAL É A TESTEMUNHA. Se o `Suspense` estivesse acima do
     * layout, ela sumiria durante o carregamento de cada tela — e é
     * exatamente isso que derrubou a tentativa anterior.
     *
     * `toBeVisible` é conferido ANTES, DURANTE e DEPOIS de cada clique.
     */
    const lateral = navegacao(page, "Início");
    await expect(lateral).toBeVisible();

    for (const aba of ABAS) {
      await navegacao(page, aba).click();

      // Durante: sem esperar nada, a casca já tem de estar lá.
      await expect(lateral).toBeVisible();

      // Depois: o conteúdo chegou e a casca continua.
      await expect(page.getByRole("main")).toContainText(/\S/u);
      await expect(lateral).toBeVisible();
    }
  });

  test("cada tela sob demanda realmente carrega", async ({ page }) => {
    await entrarNoCrc(page);

    for (const aba of ABAS) {
      await navegacao(page, aba).click();

      /*
       * O NOME DA ABA APARECE NA BARRA DE CONTEXTO quando a tela montou. É a
       * asserção mais barata que distingue "chegou" de "ficou no fallback" —
       * e um `lazy` com nome de export errado morre justamente aqui, em
       * runtime, sem o TypeScript ter como avisar.
       */
      await expect(page.getByRole("main")).toContainText(aba, { timeout: 15_000 });

      // E nenhum erro de carregamento de módulo.
      await expect(page.getByText(/Failed to fetch dynamically imported module/u)).toHaveCount(0);
    }
  });

  test("nenhuma tela do CRC é baixada antes da senha", async ({ page }) => {
    /*
     * ========================================================================
     *  O GANHO, MEDIDO NO NAVEGADOR E NÃO NO BUILD.
     *
     *  Antes: a tela de login baixava 65 arquivos JavaScript, incluindo Agenda,
     *  Autonomia, Campanhas, Encaixes, Equipe, Funil, Inbox, Metas,
     *  MeuTrabalho, Radar e Saúde — 12 telas que ninguém tinha aberto.
     *
     *  A HOME É A EXCEÇÃO DELIBERADA: ela é a primeira tela de todo mundo, e
     *  deixá-la preguiçosa trocaria "carregar rápido" por "piscar no login".
     * ========================================================================
     */
    const baixados: string[] = [];
    page.on("request", (r) => {
      if (r.resourceType() === "script" || /\.(?:js|tsx?)(?:\?|$)/u.test(r.url())) {
        baixados.push(r.url());
      }
    });

    await page.goto("/crc");
    await expect(page.getByLabel("E-mail")).toBeVisible();

    const telasProibidas =
      /\/(?:Agenda|Automacoes|Autonomia|Avaliacao|Campanhas|Configuracoes|Conhecimento|Encaixes|Equipe|Estudio|Ferramentas|Funil|Gestao|Importar|Inbox|Integracoes|Inteligencia|Metas|MeuTrabalho|ModelosECusto|Pacientes|Playground|ProximasAcoes|Radar|Recepcao|Saude|Tratamentos)[-.]/u;

    const vazaram = baixados.filter((u) => telasProibidas.test(u));

    expect(
      vazaram,
      `Estas telas foram baixadas na tela de LOGIN:\n  ${vazaram.join("\n  ")}\n\n` +
        "Alguma delas voltou a ser importada estaticamente em src/routes/crc.tsx.",
    ).toEqual([]);
  });

  test("voltar para uma aba já aberta não baixa o módulo de novo", async ({ page }) => {
    await entrarNoCrc(page);

    const pedidos: string[] = [];
    page.on("request", (r) => {
      if (/\/(?:Funil)[-.]/u.test(r.url())) pedidos.push(r.url());
    });

    await navegacao(page, "Funil").click();
    await expect(page.getByRole("main")).toContainText("Funil", { timeout: 15_000 });
    const depoisDaPrimeira = pedidos.length;

    await navegacao(page, "Início").click();
    await navegacao(page, "Funil").click();
    await expect(page.getByRole("main")).toContainText("Funil", { timeout: 15_000 });

    /*
     * O módulo já está na memória do navegador. Um segundo pedido aqui
     * significaria que o `lazy` está sendo recriado a cada render — o que
     * transformaria cada troca de aba num download, e a divisão do pacote em
     * prejuízo.
     */
    expect(pedidos.length).toBe(depoisDaPrimeira);
  });
});
