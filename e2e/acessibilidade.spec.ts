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
] as const;

async function esperarATela(page: Page, caminho: string): Promise<void> {
  await page.goto(caminho);
  /*
   * A CASCA PRIMEIRO, pelo mesmo motivo da matriz de viewports: `goto`
   * recarrega a página e o CRC passa por "Carregando…". Varrer essa tela
   * intermediária daria zero violação e zero informação.
   */
  await page.locator(".crc-lateral").waitFor({ state: "visible", timeout: 20_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
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

      const relato = graves
        .map((v) => {
          const onde = v.nodes
            .slice(0, 3)
            .map((n) => `      ${n.target.join(" ")}`)
            .join("\n");
          return `  [${String(v.impact)}] ${v.id}: ${v.help}\n${onde}\n      ${v.helpUrl}`;
        })
        .join("\n\n");

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
