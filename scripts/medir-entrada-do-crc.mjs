#!/usr/bin/env node
/**
 * Quanto JavaScript a tela de LOGIN do CRC baixa — medido no build, e não no
 * palpite.
 *
 * ============================================================================
 *  POR QUE ESTA MEDIDA E NÃO "O TAMANHO DO BUNDLE".
 *
 *  O total do build não diz nada: ele soma o site público, o portal de RH e o
 *  CRC, e ninguém baixa os três. A pergunta que importa é outra —
 *
 *      quantos bytes chegam ao navegador da recepcionista ANTES de ela
 *      digitar a senha?
 *
 *  Isso é a FECHADURA ESTÁTICA a partir do pedaço da rota `/crc`: tudo que é
 *  alcançável por `import` estático. O que só é alcançável por `import()`
 *  dinâmico fica de fora, porque só chega quando alguém abre a tela.
 * ============================================================================
 *
 *  Uso:
 *    npm run build && node scripts/medir-entrada-do-crc.mjs
 */
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PASTA = [".vercel/output/static/assets", "dist/client/assets"].find((c) => existsSync(c));

if (PASTA === undefined) {
  console.error("Build não encontrado. Rode `npm run build` antes.");
  process.exit(1);
}

const arquivos = readdirSync(PASTA).filter((f) => f.endsWith(".js"));

/**
 * As duas formas de um chunk puxar outro, e a diferença entre elas é todo o
 * ponto deste script:
 *
 *   `from "./X.js"` / `import "./X.js"`  →  ESTÁTICO. Vem junto, sempre.
 *   `import("./X.js")`                   →  DINÂMICO. Vem quando for pedido.
 */
/*
 * AS EXPRESSÕES PRECISAM CASAR CÓDIGO MINIFICADO, e a primeira versão deste
 * script não casava: ela exigia espaço antes do `from`, e o Rollup emite
 * `import{a}from"./x.js"` sem espaço nenhum. O resultado foi um relatório
 * dizendo "1 arquivo antes da senha" e listando a Home como adiada — quando a
 * Home é estática de propósito.
 *
 * O número absurdo é o que salvou: 73 kB de fechadura com 1 arquivo não fecha
 * conta com um chunk de 73 kB que importa React.
 */
const ESTATICO_FROM = /from\s*["'](\.\/[\w.-]+\.js)["']/gu;
const ESTATICO_NU = /(?:^|[;\s}])import\s*["'](\.\/[\w.-]+\.js)["']/gu;
const DINAMICO = /import\s*\(\s*["'](\.\/[\w.-]+\.js)["']\s*\)/gu;

const grafo = new Map();
for (const f of arquivos) {
  const texto = readFileSync(join(PASTA, f), "utf8");
  const dinamicos = new Set([...texto.matchAll(DINAMICO)].map((m) => m[1].slice(2)));
  const estaticos = new Set(
    [...texto.matchAll(ESTATICO_FROM), ...texto.matchAll(ESTATICO_NU)]
      .map((m) => m[1].slice(2))
      // Um módulo pode ser importado dos dois jeitos pelo mesmo arquivo. Se
      // existe um caminho estático, ele vem junto — o dinâmico não o adia.
      .filter((x) => arquivos.includes(x)),
  );
  grafo.set(f, { estaticos, dinamicos });
}

/** Tudo que `raiz` arrasta por import estático, incluindo ela mesma. */
function fechaduraEstatica(raiz) {
  const vistos = new Set([raiz]);
  const fila = [raiz];
  while (fila.length > 0) {
    const atual = fila.pop();
    for (const vizinho of grafo.get(atual)?.estaticos ?? []) {
      if (!vistos.has(vizinho)) {
        vistos.add(vizinho);
        fila.push(vizinho);
      }
    }
  }
  return vistos;
}

const raizCrc = arquivos.find((f) => /^crc-[\w-]+\.js$/u.test(f));
if (raizCrc === undefined) {
  console.error("Não achei o pedaço da rota /crc.");
  process.exit(1);
}

const fechadura = fechaduraEstatica(raizCrc);

let cru = 0;
let comprimido = 0;
for (const f of fechadura) {
  const conteudo = readFileSync(join(PASTA, f));
  cru += conteudo.length;
  comprimido += gzipSync(conteudo).length;
}

/** As telas do CRC, para dizer quantas ainda vêm antes da senha. */
const TELAS =
  /^(Agenda|Automacoes|Autonomia|Avaliacao|Campanhas|Configuracoes|Conhecimento|Encaixes|Equipe|Estudio|Ferramentas|Funil|Gestao|Home|Importar|Inbox|Integracoes|Inteligencia|Metas|MeuTrabalho|ModelosECusto|Pacientes|Playground|PrimeirosPassos|ProximasAcoes|Radar|Recepcao|Saude|Tratamentos)-/u;

const telasNaEntrada = [...fechadura].filter((f) => TELAS.test(f)).sort();
const telasAdiadas = arquivos.filter((f) => TELAS.test(f) && !fechadura.has(f)).sort();

console.log(`Raiz da rota:            ${raizCrc}`);
console.log(`Arquivos antes da senha: ${String(fechadura.size)}`);
console.log(`Bytes crus:              ${(cru / 1024).toFixed(0)} kB`);
console.log(`Bytes gzip:              ${(comprimido / 1024).toFixed(0)} kB`);
console.log("");
console.log(`Telas que vêm antes da senha (${String(telasNaEntrada.length)}):`);
for (const t of telasNaEntrada) console.log(`  ${t.split("-")[0]}`);
console.log("");
console.log(`Telas adiadas para o clique (${String(telasAdiadas.length)}):`);
console.log(`  ${telasAdiadas.map((t) => t.split("-")[0]).join(", ") || "(nenhuma)"}`);
