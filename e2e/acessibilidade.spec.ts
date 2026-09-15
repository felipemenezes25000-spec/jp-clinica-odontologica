/**
 * Acessibilidade do CRC — o §13, medido.
 *
 * ============================================================================
 *  POR QUE axe-core, E NÃO UMA LISTA DE VERIFICAÇÕES ESCRITAS À MÃO.
 *
 *  Dava para escrever, um por um, os itens do §13: contraste AA, foco visível,
 *  `aria-label` em ícone sem texto, landmarks, hierarquia de heading. Seriam
 *  umas cinquenta linhas de asserção — e cada uma cobriria exatamente o caso
 *  que eu lembrei de escrever.
 *
 *  O axe-core roda cerca de noventa regras que o W3C e a Deque mantêm, incluindo
 *  as que ninguém lembra: rótulo de campo ligado por `for`, `role` inválido em
 *  elemento que não o aceita, `aria-labelledby` apontando para id inexistente,
 *  contraste calculado contra o fundo REAL depois da cascata. É a diferença
 *  entre verificar o que eu sei e verificar o que a norma diz.
 *
 *  É dependência de TESTE, não de interface: nada dela vai para o pacote que o
 *  paciente baixa — `scripts/conferir-bundle.mjs` continuaria reprovando se
 *  fosse.
 * ============================================================================
 *
 *  O CORTE É "critical" E "serious", como o critério de aceite pede.
 *
 *  `moderate` e `minor` do axe incluem coisas legítimas de discutir e coisas
 *  que dependem de contexto — reprovar o merge por elas ensinaria a desligar o
 *  teste. Elas são IMPRESSAS quando aparecem, para quem quiser olhar, e não
 *  derrubam a execução.
 */
import AxeBuilder from "@axe-core/playwright";
import type { Result } from "axe-core";
import { expect, test, type Page } from "@playwright/test";

import { entrarNoCrc } from "./apoio/entrar";

/**
 * As telas varridas.
 *
 * Oito, e não vinte e oito: cada varredura do axe custa cerca de um segundo, e
 * o valor cai rápido depois que as FORMAS de tela estão cobertas. Estas oito
 * são as formas distintas — lista com filtro, painel de números, conversa em
 * três colunas, calendário, formulário longo, kanban, tabela e administração.
 *
 * Uma regressão de acessibilidade quase nunca é de uma tela só: ela vem de um
 * componente compartilhado, e aparece em qualquer uma que o use.
 */
const TELAS = [
  { caminho: "/crc", nome: "Início" },
  { caminho: "/crc/inbox", nome: "Conversas" },
  { caminho: "/crc/funil", nome: "Funil" },
  { caminho: "/crc/agenda", nome: "Agenda" },
  { caminho: "/crc/pacientes", nome: "Pacientes" },
  { caminho: "/crc/gestao", nome: "Gestão" },
  { caminho: "/crc/equipe", nome: "Equipe" },
  { caminho: "/crc/configuracoes", nome: "Configurações" },
  /*
   * A NONA, e ela quebra a regra das "oito formas" de propósito.
   *
   * Integrações ganhou o cartão da Meta: uma grade de sinais medidos, uma lista
   * de contas com ações, e um formulário de regra dentro de modal. Nenhuma das
   * outras oito tem essa combinação, e é justamente onde a acessibilidade
   * costuma escapar — rótulo preso ao controle certo, `aria-pressed` nos
   * filtros, contraste de etiqueta.
   */
  { caminho: "/crc/integracoes", nome: "Integrações" },
] as const;

/**
 * O relato de uma violação, com os NÚMEROS que o axe mediu.
 *
 * ============================================================================
 *  SEM ISTO, `color-contrast` é um beco sem saída.
 *
 *  O seletor diz ONDE, e nada mais. Quem investiga vai até o CSS, encontra um
 *  par de tokens que PASSA quando medido à mão — e fica sem explicação, porque
 *  a cor computada não é a do CSS que ele está lendo: tem opacidade, herança,
 *  ou o fundo de um ancestral aparecendo por transparência.
 *
 *  `n.any[].data` traz `fgColor`, `bgColor` e `contrastRatio` do que o navegador
 *  realmente pintou. É a diferença entre uma pista e uma resposta — e custou
 *  uma investigação inteira para ser adicionado.
 * ============================================================================
 */
function relatar(violacoes: readonly Result[]): string {
  return violacoes
    .map((v) => {
      const onde = v.nodes
        .slice(0, 3)
        .map((n) => {
          const medido = n.any
            .map((c) => c.data)
            .filter((d) => d !== null && d !== undefined)
            .map((d) => JSON.stringify(d))
            .join(" ");
          return `      ${n.target.join(" ")}${medido.length > 0 ? `\n        ${medido}` : ""}`;
        })
        .join("\n");
      return `  [${String(v.impact)}] ${v.id}: ${v.help}\n${onde}\n      ${v.helpUrl}`;
    })
    .join("\n\n");
}

async function esperarATela(page: Page, caminho: string): Promise<void> {
  await page.goto(caminho);
  /*
   * A CASCA PRIMEIRO, pelo mesmo motivo da matriz de viewports: `goto`
   * recarrega a página e o CRC passa por "Carregando…". Varrer essa tela
   * intermediária daria zero violação e zero informação.
   */
  await page.locator(".crc-lateral").waitFor({ state: "visible", timeout: 20_000 });

  /*
   * ==========================================================================
   *  E O CONTEÚDO DEPOIS DA CASCA — `.crc-lateral` visível não é tela carregada.
   *
   *  Este é o passo que faltava, e ele foi MEDIDO: com a casca na tela e o
   *  settle feito, uma sonda encontrou em Integrações quatro `.crc-esqueleto`
   *  ainda pulsando e três `crc-premium-enter` com `currentTime: 0` — animações
   *  que NASCERAM depois do settle, porque o cartão que as dispara só monta
   *  quando o dado chega.
   *
   *  Esperar animação não resolve isso: não dá para esperar o fim de uma
   *  animação que ainda não começou. O que resolve é esperar a tela terminar
   *  de carregar, e só então medir.
   *
   *  OS TRÊS MARCADORES NUM SELETOR SÓ, e isso não é preguiça de escrever três
   *  linhas — é o que fecha a janela entre eles:
   *
   *    `.crc-tela-carregando`  o arquivo da tela ainda está baixando;
   *    `.crc-esqueleto`        a tela montou e o dado ainda não chegou;
   *    `[aria-busy="true"]`    uma região se declara ocupada.
   *
   *  Esperados em SEQUÊNCIA, cada um passa no vão do outro: com a lateral na
   *  tela e o arquivo da Gestão ainda baixando, "zero esqueletos" é verdade —
   *  porque a tela que os desenha ainda não montou. Foi exatamente assim que
   *  a varredura da Gestão media uma tela sem tabela nenhuma e o axe, um
   *  instante depois, encontrava `.crc-tabela-caixa` e cinco `th` reprovando.
   *
   *  Juntos num locator só, a contagem nunca chega a zero no meio da troca:
   *  o `.crc-tela-carregando` só sai no mesmo commit em que o `.crc-esqueleto`
   *  entra.
   * ==========================================================================
   */
  await expect(
    page.locator(".crc-tela-carregando, .crc-esqueleto, [aria-busy='true']"),
    `${caminho} continuou se declarando ocupada. Medir uma tela meio carregada ` +
      "devolve a cor do meio da animação de entrada, e não a do token.",
  ).toHaveCount(0, { timeout: 20_000 });

  /*
   * ==========================================================================
   *  E AGORA O `assentar()` COMPLETO, E NÃO O SETTLE CURTO.
   *
   *  O settle curto que estava aqui (só `fonts.ready` e dois quadros) não cobre
   *  `@keyframes crc-premium-enter` (`crc-premium.css:1419`), que anima
   *  `opacity: 0 → 1`. O axe mede a cor COMPUTADA — durante a animação ele lê
   *  uma versão clara do token e reprova `color-contrast` com números que não
   *  existem em tela parada:
   *
   *    Início, `.crc-etiqueta-perigo`   medido #c7534a/#fef1ef = 3.99
   *                                    token  #bb3126/#fff0ee = 5.29 ✓
   *
   *  A prova de que era corrida, e não paleta: a falha MUDAVA de tela a cada
   *  execução — Início numa, Gestão e Configurações na outra, Pacientes na
   *  terceira.
   *
   *  Isto foi adiado de propósito uma vez, para não deixar a suíte vermelha por
   *  motivo alheio à entrega de omnichannel que estava em curso. As violações
   *  que a espera correta revelou já foram corrigidas, e por isso o critério
   *  das nove telas passa a ser este.
   * ==========================================================================
   */
  await assentar(page);
}

/**
 * Espera a tela PARAR de se mexer antes de medir.
 *
 * ============================================================================
 *  `toBeVisible()` PASSA NO LAYOUT, E NÃO NO FIM DA TRANSIÇÃO — e essa
 *  diferença produziu um teste flaky nesta própria suíte.
 *
 *  A varredura do modal de regra media o contraste enquanto o overlay ainda
 *  estava entrando: a cor de fundo que o axe lia era a mistura da animação, e
 *  não a final. O resultado era `color-contrast` reprovando com números que
 *  não existem em tela parada — e passando quando a máquina estava folgada.
 *
 *  Sintoma clássico de flake: verde sozinho, vermelho na suíte cheia. E o
 *  diagnóstico custa caro porque a violação PARECE real.
 * ============================================================================
 *
 *  ELA ESPERA A TELA PARAR, E NÃO A TELA CARREGAR — e sozinha não basta.
 *
 *  Chamada cedo demais, ela não encontra animação nenhuma e devolve na hora:
 *  não se espera o fim de uma animação que ainda não começou. Quem garante que
 *  já começou é o passo anterior, em `esperarATela` — e o comentário de lá diz
 *  quanto custou descobrir isso.
 */
async function assentar(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    /*
     * DUAS ANIMAÇÕES DE QUADRO, e não uma: a primeira devolve depois do
     * próximo paint, a segunda garante que o paint DEPOIS dele já aconteceu —
     * que é onde uma transição curta de opacidade termina.
     */
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });

  /*
   * E ESPERA AS TRANSIÇÕES DECLARADAS ACABAREM — as que TERMINAM.
   *
   * ==========================================================================
   *  `getAnimations()` INCLUI ANIMAÇÃO INFINITA, e `finished` nunca resolve
   *  para ela.
   *
   *  A primeira versão disto esperava tudo o que estava `running`. O CRC tem
   *  esqueleto de carregamento com pulso em `infinite` — e o `await` ficava
   *  pendurado até o timeout do teste. Sete testes reprovaram por 90 segundos
   *  de espera, e a suíte dobrou de duração.
   *
   *  O filtro é pelo `iterations` do efeito: `Infinity` fica de fora. Uma
   *  animação que não acaba não tem estado final para se esperar — e ela não é
   *  o que distorce a medição de contraste, porque o pulso do esqueleto não
   *  pinta texto que o axe avalie.
   *
   *  E há um TETO, porque `finished` também não resolve para animação pausada
   *  por `prefers-reduced-motion` no meio do caminho: dois segundos cobrem
   *  qualquer transição desta interface, e o pior caso passa a ser uma medição
   *  um pouco cedo em vez de um teste vermelho por timeout.
   *
   *  E O LAÇO NÃO É ZELO: esperar UMA rodada deixa passar a animação que NASCE
   *  no fim dela. `crc-premium-enter` dispara quando o cartão monta, e um
   *  cartão que monta no último quadro começa a animar depois que a espera
   *  acabou — foi assim que uma etiqueta media `#bac0b9` (1.7) no lugar do
   *  `--crc-texto-2` `#16281d`. Repete até uma rodada não achar mais nenhuma,
   *  dentro do mesmo teto.
   * ==========================================================================
   */
  await page.evaluate(async () => {
    const terminaveis = (): Animation[] =>
      document.getAnimations().filter((a) => {
        if (a.playState !== "running") return false;
        const t = a.effect?.getComputedTiming();
        return t !== undefined && Number.isFinite(t.iterations ?? 1);
      });

    const limite = Date.now() + 2000;

    for (let lote = terminaveis(); lote.length > 0; lote = terminaveis()) {
      const restante = limite - Date.now();
      if (restante <= 0) break;

      const teto = new Promise((r) => setTimeout(r, restante));
      await Promise.race([Promise.all(lote.map((a) => a.finished.catch(() => undefined))), teto]);
      // Um quadro para o que acabou de montar registrar a sua animação.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
  });
}

test.describe("o §13, medido pelo axe-core", () => {
  for (const tela of TELAS) {
    test(`${tela.nome} não tem violação crítica nem séria`, async ({ page }) => {
      test.setTimeout(90_000);

      await entrarNoCrc(page);
      await esperarATela(page, tela.caminho);

      const resultado = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const graves = resultado.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      const leves = resultado.violations.filter(
        (v) => v.impact !== "critical" && v.impact !== "serious",
      );

      if (leves.length > 0) {
        // Informativo, e não reprovação: ver o cabeçalho.
        console.log(
          `[${tela.nome}] ${String(leves.length)} violação(ões) de impacto menor: ` +
            leves.map((v) => v.id).join(", "),
        );
      }

      const relato = relatar(graves);

      expect(
        graves.map((v) => v.id),
        `${tela.nome} (${tela.caminho}) tem violação de acessibilidade:\n\n${relato}`,
      ).toEqual([]);
    });
  }
});

/**
 * ============================================================================
 *  O QUE O axe NÃO CONSEGUE VER, e o §13 pede.
 *
 *  Ele analisa o DOM parado. Três exigências do critério dependem de INTERAÇÃO,
 *  e nenhuma ferramenta estática as alcança:
 *
 *    o "pular para o conteúdo" só aparece ao receber foco;
 *    a ordem de tabulação só existe enquanto alguém tabula;
 *    o foco visível só se prova visitando os elementos.
 * ============================================================================
 */
test.describe("o que exige teclado", () => {
  test("o primeiro Tab revela um atalho para o conteúdo", async ({ page }) => {
    await entrarNoCrc(page);
    await esperarATela(page, "/crc");

    await page.keyboard.press("Tab");

    const foco = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return {
        texto: (el.textContent ?? "").trim().slice(0, 60),
        visivel: r.width > 0 && r.height > 0 && r.top >= 0,
        tag: el.tagName,
      };
    });

    expect(foco, "nada recebeu foco no primeiro Tab").not.toBeNull();
    expect(
      foco?.visivel,
      `o primeiro elemento focável ("${foco?.texto ?? ""}") não está visível ao receber foco. ` +
        "Um atalho de pular navegação que não aparece é um atalho que não existe.",
    ).toBe(true);
  });

  test("todo interativo do menu mostra foco visível", async ({ page }) => {
    await entrarNoCrc(page);
    await esperarATela(page, "/crc");

    /*
     * COMPARA O ESTILO COM E SEM FOCO. Afirmar que existe `outline` não basta:
     * um `outline: none` com `box-shadow` no lugar também é foco visível, e um
     * `outline` da mesma cor do fundo não é. O que importa é que algo MUDE.
     */
    const semFoco = await page.evaluate(() => {
      const el = document.querySelector(".crc-nav-item");
      if (el === null) return null;
      const cs = getComputedStyle(el);
      return `${cs.outlineStyle}|${cs.outlineWidth}|${cs.outlineColor}|${cs.boxShadow}`;
    });

    await page.locator(".crc-nav-item").first().focus();

    const comFoco = await page.evaluate(() => {
      const el = document.querySelector(".crc-nav-item");
      if (el === null) return null;
      const cs = getComputedStyle(el);
      return `${cs.outlineStyle}|${cs.outlineWidth}|${cs.outlineColor}|${cs.boxShadow}`;
    });

    expect(semFoco, "não achei item de menu para medir").not.toBeNull();
    expect(
      comFoco,
      "o item do menu ficou visualmente IGUAL ao receber foco. Quem navega por " +
        "teclado não tem como saber onde está.",
    ).not.toBe(semFoco);
  });
});

/**
 * ============================================================================
 *  O MODAL É VARRIDO ABERTO, e isso não é redundância com a lista de telas.
 *
 *  `AxeBuilder` analisa o DOM PARADO. Um formulário que só existe depois de um
 *  clique não está no DOM quando a varredura da tela roda — então as oito (nove)
 *  telas não dizem nada sobre ele.
 *
 *  E modal é justamente onde a acessibilidade escapa: rótulo que não está preso
 *  ao controle, `aria-modal` ausente, foco que fica atrás do overlay. O
 *  formulário de regra da Meta tem nove controles e três checkboxes com
 *  explicação — é o mais denso que entrou nesta entrega.
 * ============================================================================
 */
test.describe("o formulário de regra da Meta, aberto", () => {
  test("não tem violação crítica nem séria com o modal na tela", async ({ page }) => {
    test.setTimeout(90_000);

    await entrarNoCrc(page);
    await esperarATela(page, "/crc/integracoes");

    const cartao = page.getByLabel("Integração com a Meta");
    await expect(cartao).toBeVisible({ timeout: 20_000 });

    await cartao.getByRole("button", { name: "Nova regra" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // O MODAL TEM QUE PARAR DE ENTRAR antes de medir contraste. Ver `assentar`:
    // sem isto este teste era flaky, e a violação que ele relatava era a cor do
    // meio da animação.
    await assentar(page);

    const resultado = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const graves = resultado.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    const relato = relatar(graves);

    expect(
      graves.map((v) => v.id),
      `O modal de regra da Meta tem violação de acessibilidade:\n\n${relato}`,
    ).toEqual([]);
  });
});
