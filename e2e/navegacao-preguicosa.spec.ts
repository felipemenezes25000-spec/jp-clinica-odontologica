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
        "Alguma delas voltou a ser importada estaticamente em src/routes/crc/$tela.tsx " +
        "(ou no layout, src/routes/crc.tsx).",
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

/* ========================================================================== */
/* O endereço é a tela                                                        */
/* ========================================================================== */

/**
 * ============================================================================
 *  ESTES QUATRO CASOS SÓ EXISTEM PORQUE AS TELAS GANHARAM ENDEREÇO.
 *
 *  Até então o CRC tinha uma rota só — `/crc` — e trinta telas que trocavam por
 *  `useState`. Os sintomas eram todos do mesmo defeito, e todos diários:
 *  recarregar voltava para o Início, "voltar" saía do aplicativo, nenhuma tela
 *  tinha link para mandar a um colega, e Ctrl+clique no menu não fazia nada
 *  porque não havia link nenhum para abrir.
 *
 *  Nenhum teste de unidade pega isto: o que está sendo verificado é o
 *  NAVEGADOR — barra de endereço, histórico e a natureza do elemento clicado.
 * ============================================================================
 */
test.describe("cada tela tem endereço próprio", () => {
  test("clicar no menu muda a URL, e o item é um link de verdade", async ({ page }) => {
    await entrarNoCrc(page);

    const item = navegacao(page, "Funil");
    /*
     * O `href` É O PONTO. Um `<button>` com `onClick` também trocaria a tela —
     * e seria impossível abrir em aba nova, copiar o endereço ou usar o botão
     * do meio. Afirmar o atributo é afirmar a capacidade.
     */
    await expect(item).toHaveAttribute("href", "/crc/funil");

    await item.click();
    await expect(page).toHaveURL(/\/crc\/funil$/u);
    await expect(page.getByRole("main")).toContainText("Funil", { timeout: 15_000 });
  });

  test("recarregar mantém a tela, e não volta para o Início", async ({ page }) => {
    await entrarNoCrc(page);
    await navegacao(page, "Radar").click();
    await expect(page).toHaveURL(/\/crc\/radar$/u);

    await page.reload();

    await expect(page).toHaveURL(/\/crc\/radar$/u);
    await expect(page.getByRole("main")).toContainText("Radar", { timeout: 15_000 });
  });

  test("voltar do navegador anda dentro do CRC, e não sai dele", async ({ page }) => {
    await entrarNoCrc(page);
    await navegacao(page, "Funil").click();
    await expect(page).toHaveURL(/\/crc\/funil$/u);

    await navegacao(page, "Radar").click();
    await expect(page).toHaveURL(/\/crc\/radar$/u);

    await page.goBack();

    await expect(page).toHaveURL(/\/crc\/funil$/u);
    // O shell continua de pé: voltar é navegação, não recarregamento.
    await expect(navegacao(page, "Radar")).toBeVisible();
  });

  test("abrir o endereço direto leva à tela, sem passar pelo Início", async ({ page }) => {
    await entrarNoCrc(page);

    // Como quem recebeu o link de um colega e colou na barra de endereço.
    await page.goto("/crc/funil");

    await expect(page.getByRole("main")).toContainText("Funil", { timeout: 15_000 });
    await expect(navegacao(page, "Funil")).toHaveAttribute("aria-current", "page");
  });

  test("só UM item do menu é a página atual", async ({ page }) => {
    /*
     * ========================================================================
     *  ESTE CASO NASCEU DE OLHAR A TELA, e não de imaginar o que poderia dar
     *  errado.
     *
     *  O `<Link>` do TanStack considera um link ativo quando o caminho atual
     *  COMEÇA com o dele. Como `/crc` é prefixo de `/crc/funil`, o Início
     *  ficava aceso em todas as telas — dois `aria-current="page"` ao mesmo
     *  tempo, o menu com dois itens destacados, e o leitor de tela anunciando
     *  duas "páginas atuais".
     *
     *  O caso anterior não pegava: ele afirmava que o Funil TEM a marca, e
     *  estava certo. Faltava dizer que ele é o ÚNICO que tem.
     * ========================================================================
     */
    await entrarNoCrc(page);
    await navegacao(page, "Funil").click();
    await expect(page).toHaveURL(/\/crc\/funil$/u);

    const marcados = page.locator(".crc-nav-item[aria-current='page']");
    await expect(marcados).toHaveCount(1);
    await expect(marcados).toHaveText(/Funil/u);
  });
});
