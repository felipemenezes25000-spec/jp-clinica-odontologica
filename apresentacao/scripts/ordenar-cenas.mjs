/**
 * Põe os arquivos de cena na ordem do filme.
 *
 * O PROBLEMA
 * Toda vez que uma cena entra no meio do roteiro, os arquivos seguintes passam a
 * mentir: `Cena13WhatsApp.tsx` vira a décima quarta cena e ninguém percebe até
 * abrir a pasta procurando alguma coisa. Renomear à mão são trinta arquivos,
 * trinta nomes de função e um índice — exatamente o tipo de tarefa que se faz
 * errado na terceira vez.
 *
 * O QUE ELE FAZ
 * Lê a ordem verdadeira em `cenas.json`, descobre qual componente serve cada
 * cena pelo `index.ts` atual, e reescreve tudo para bater: nome do arquivo, nome
 * da função, número no cabeçalho do comentário e o índice inteiro.
 *
 * A troca acontece em duas fases — tudo para a memória, só então tudo para o
 * disco — porque renomear `Cena13` para `Cena14` atropelaria o `Cena14` que
 * ainda existe.
 *
 * O que ele NÃO mexe: o número que aparece na tela. Esse vem da linha do tempo
 * (`SeloDeCena`) e já se corrige sozinho — o nome do arquivo é para quem lê o
 * código, não para quem assiste.
 *
 * Uso:  npm run cenas:ordenar
 */

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA = join(RAIZ, "src/scenes");
const INDICE = join(PASTA, "index.ts");

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

const ordem = JSON.parse(readFileSync(join(RAIZ, "src/data/cenas.json"), "utf8")).cenas.map(
  (c) => c.id,
);

/**
 * `  abertura: Cena01Abertura,` → { abertura: "Cena01Abertura" }
 *
 * O corte por `\r?\n` é necessário: um arquivo salvo em CRLF deixaria um `\r`
 * pendurado no fim de cada linha e o `$` do regex falharia em todas elas — o
 * mapa sairia vazio e o script acusaria que nenhuma cena existe.
 */
const componentePorId = new Map();
for (const linha of readFileSync(INDICE, "utf8").split(/\r?\n/)) {
  const m = linha.match(/^ {2}([A-Za-z0-9_]+): ([A-Za-z0-9_]+),$/);
  if (m !== null) componentePorId.set(m[1], m[2]);
}

const semComponente = ordem.filter((id) => !componentePorId.has(id));
if (semComponente.length > 0) {
  throw new Error(
    `Sem componente no index.ts para: ${semComponente.join(", ")}.\n` +
      "Crie a cena, acrescente o import e a linha do mapa, e rode de novo.",
  );
}

const sobrando = [...componentePorId.keys()].filter((id) => !ordem.includes(id));
if (sobrando.length > 0) {
  throw new Error(
    `No index.ts mas fora de cenas.json: ${sobrando.join(", ")}.\n` +
      "Toda cena registrada precisa estar no filme.",
  );
}

/* -------------------------------------------------------------------------- */
/* Plano                                                                      */
/* -------------------------------------------------------------------------- */

const plano = ordem.map((id, i) => {
  const atual = componentePorId.get(id);
  // Tira o `Cena` e os dígitos; o que sobra é o nome de verdade ("WhatsApp").
  const sufixo = atual.replace(/^Cena\d*/, "");
  const numero = i + 1;
  return { id, atual, novo: `Cena${String(numero).padStart(2, "0")}${sufixo}`, numero };
});

/* -------------------------------------------------------------------------- */
/* Reescrita — memória primeiro, disco depois                                 */
/* -------------------------------------------------------------------------- */

const emMemoria = plano.map((p) => {
  let texto = readFileSync(join(PASTA, `${p.atual}.tsx`), "utf8");
  texto = texto.replace(`export function ${p.atual}(`, `export function ${p.novo}(`);
  texto = texto.replace(
    /^ \* CENA(?: \d+)? — /m,
    ` * CENA ${String(p.numero).padStart(2, "0")} — `,
  );
  return { ...p, texto };
});

for (const p of emMemoria) {
  if (p.atual !== p.novo) rmSync(join(PASTA, `${p.atual}.tsx`));
}
for (const p of emMemoria) {
  writeFileSync(join(PASTA, `${p.novo}.tsx`), p.texto, "utf8");
  if (p.atual !== p.novo) console.log(`  ${p.atual} → ${p.novo}`);
}

/* -------------------------------------------------------------------------- */
/* Índice                                                                     */
/* -------------------------------------------------------------------------- */

writeFileSync(
  INDICE,
  `import type { ComponentType } from "react";
import type { IdCena } from "@/data/linhaDoTempo";

${plano.map((p) => `import { ${p.novo} } from "./${p.novo}";`).join("\n")}

/**
 * O índice das cenas. ARQUIVO GERADO por \`npm run cenas:ordenar\`.
 *
 * Um mapa estático, e não \`lazy()\`: o filme roda a 30 fps e a linha do tempo
 * pode saltar para qualquer frame (arrastar a barra, pular capítulo, render de
 * frame avulso no Remotion). Uma cena que chegasse por import dinâmico
 * apareceria em branco no primeiro frame depois do salto — e no render, em
 * branco de vez, já que ninguém espera a promessa resolver.
 *
 * O custo é o bundle inteiro no primeiro paint. A ${plano.length} cenas de componente
 * puro isso é pequeno; o que pesa em bundle de vídeo é asset, e os assets aqui
 * são SVG.
 *
 * A ordem abaixo é a ordem do filme, e os arquivos são numerados para bater com
 * ela. Para inserir uma cena no meio: crie o arquivo, some a linha em
 * \`cenas.json\`, acrescente aqui em qualquer posição, e rode
 * \`npm run cenas:ordenar\`.
 */
export const COMPONENTES: Readonly<Record<IdCena, ComponentType>> = {
${plano.map((p) => `  ${p.id}: ${p.novo},`).join("\n")}
};
`,
  "utf8",
);

console.log(`Índice reescrito: ${plano.length} cenas, na ordem do filme.`);
