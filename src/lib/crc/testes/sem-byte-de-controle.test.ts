/**
 * Nenhum arquivo-fonte guarda byte de controle cru.
 *
 * ============================================================================
 *  ESTE DEFEITO ENTROU TRÊS VEZES EM UM DIA, POR TRÊS CAMINHOS DIFERENTES.
 *
 *  Quem escreve `\x00` num template, ou `\n` numa mensagem, e faz isso passar
 *  por um heredoc de shell ou por um script Python, às vezes entrega o BYTE em
 *  vez do TEXTO do escape. O arquivo continua compilando, o teste continua
 *  passando, e a regex continua casando — porque um byte 0x00 dentro de uma
 *  classe de caracteres faz exatamente o que `\x00` faria.
 *
 *  O que quebra é tudo em volta:
 *
 *    `git` passa a tratar o arquivo como BINÁRIO — `git diff` deixa de mostrar
 *    as mudanças, e a revisão de código para naquele arquivo;
 *
 *    editores mostram o byte como caixinha, ou o apagam em silêncio ao salvar;
 *
 *    `grep`, `sed` e qualquer ferramenta de linha param no meio.
 *
 *  Casos reais, todos no mesmo dia:
 *
 *    `banco-memoria.ts` — `${resultado}<NUL>${portao}` entrou no repositório e
 *    ficou, porque `git diff` não mostrava nada de errado;
 *
 *    `analytics/atribuicao.ts` — `[<NUL>-<0x1F><0x7F>]` numa regex cujo próprio
 *    comentário `eslint-disable no-control-regex` provava a intenção do escape;
 *
 *    um `\n` dentro de uma string de mensagem de teste, que virou quebra de
 *    linha literal e deixou a string sem fechar.
 *
 *  Nenhum dos três foi pego por lint, tipo ou teste. Este arquivo pega.
 * ============================================================================
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Onde vive código escrito à mão. */
const RAIZES = ["src", "e2e", "scripts"];

/** O que é fonte. Imagem, fonte tipográfica e PDF são binários por natureza. */
const EXTENSOES = [".ts", ".tsx", ".mjs", ".js", ".css", ".sql", ".json", ".md", ".yml"];

/**
 * Os bytes que não têm o que fazer num arquivo de texto.
 *
 * Tab (9), LF (10) e CR (13) ficam de fora porque são espaçamento legítimo.
 * O 0x7F (DEL) entra: ele não é espaçamento e não aparece por acidente
 * benigno.
 */
function ehDeControle(b: number): boolean {
  return b < 9 || (b > 13 && b < 32) || b === 127;
}

function arquivos(raiz: string): string[] {
  const saida: string[] = [];
  let entradas: string[];
  try {
    entradas = readdirSync(raiz);
  } catch {
    return saida;
  }
  for (const nome of entradas) {
    if (nome === "node_modules" || nome === "dist" || nome.startsWith(".")) continue;
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho));
    else if (EXTENSOES.some((e) => nome.endsWith(e))) saida.push(caminho);
  }
  return saida;
}

describe("nenhum arquivo-fonte tem byte de controle cru", () => {
  const todos = RAIZES.flatMap((r) => arquivos(r));

  it("a varredura encontrou arquivos — senão ela passa por vazio", () => {
    /*
     * CONTROLE POSITIVO. Se as raízes mudarem de nome, ou a extensão deixar de
     * casar, a lista vem vazia e o caso abaixo passa sem ter aberto nada.
     */
    expect(todos.length).toBeGreaterThan(200);
  });

  it("nenhum deles guarda um byte que deveria ser escape", () => {
    const culpados: string[] = [];

    for (const caminho of todos) {
      const dados = readFileSync(caminho);
      const achados: string[] = [];

      for (let i = 0; i < dados.length; i += 1) {
        const b = dados[i];
        if (b === undefined || !ehDeControle(b)) continue;

        /*
         * O CONTEXTO VAI JUNTO, e em forma legível. "tem byte 0x00 no offset
         * 63294" manda alguém abrir um editor hexadecimal; mostrar a linha
         * deixa o conserto óbvio — quase sempre é trocar o byte pelo texto do
         * escape que o autor quis escrever.
         */
        const ini = Math.max(0, i - 45);
        /*
         * SEM REGEX COM ESCAPE, e a razão é deliciosa: a primeira versão desta
         * linha usava `.replace(/[\u0000-\u001f\u007f]/gu, "·")` — e o
         * formatador colapsou os escapes em BYTES CRUS, fazendo este arquivo
         * virar exatamente o que ele existe para proibir.
         *
         * O teste reprovou apontando para si mesmo. Trocar por comparação de
         * código de caractere tira o escape do caminho de vez.
         */
        const trecho = [...dados.subarray(ini, i + 20).toString("utf8")]
          .map((c) => (ehDeControle(c.charCodeAt(0)) ? "·" : c))
          .join("");
        achados.push(`byte 0x${b.toString(16).padStart(2, "0")} — …${trecho}…`);
        if (achados.length >= 2) break;
      }

      if (achados.length > 0) culpados.push(`${caminho}\n      ${achados.join("\n      ")}`);
    }

    expect(
      culpados,
      "Estes arquivos guardam um byte de controle cru onde quase certamente\n" +
        "deveria haver o TEXTO de um escape (`\\x00`, `\\n`, …):\n\n  " +
        `${culpados.join("\n  ")}\n\n` +
        "Isso faz o git tratar o arquivo como binário e o `git diff` parar de\n" +
        "mostrar as mudanças dele. Costuma vir de escrever o arquivo por heredoc\n" +
        "de shell ou por script Python — nesses casos o escape é consumido antes\n" +
        "de chegar ao disco. Escreva o arquivo por uma ferramenta de edição.",
    ).toEqual([]);
  });
});
