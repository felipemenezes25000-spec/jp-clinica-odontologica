/**
 * RENDERIZADOR — manifests JSON  →  PNG prontos para publicar.
 *
 *   node social/instagram/source/scripts/renderizar.mjs             # tudo
 *   node social/instagram/source/scripts/renderizar.mjs feed prova  # só esses
 *   node social/instagram/source/scripts/renderizar.mjs --qa        # com guias
 *
 * O ciclo de trabalho que este script existe para servir:
 *   abrir o manifest → trocar uma headline → rodar → olhar o PNG.
 * Nada além do manifest precisa ser tocado para uma peça nova entrar no ar.
 *
 * DUAS COISAS ACONTECEM AQUI ALÉM DE FOTOGRAFAR A TELA.
 *
 * 1. `{{caminho}}` é resolvido contra `dados-jp.json`, que sai de
 *    `src/lib/jp.ts`. É assim que a nota do Google chega à arte sem ninguém
 *    digitar "4,6" — e é por isso que um token que não resolve DERRUBA o
 *    render em vez de virar a string "{{avaliacoes.nota}}" impressa na peça.
 *
 * 2. Cada peça volta do navegador com um relatório de transbordo. Texto que
 *    passou da safe area é registrado e some do olho quando são 300 arquivos;
 *    aqui ele vira linha vermelha no terminal e entra no relatório de QA.
 */
import { chromium } from "playwright";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { servirRaiz } from "./lib/servidor.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(AQUI, "../..");
const RAIZ = resolve(KIT, "../..");

const args = process.argv.slice(2);
const QA = args.includes("--qa");
const alvos = args.filter((a) => !a.startsWith("--"));

const dados = JSON.parse(await readFile(join(KIT, "source/dados-jp.json"), "utf8"));

/** Resolve `{{a.b.c}}` contra o JSON de dados. Falha alto quando não existe. */
function resolverTokens(valor, contexto) {
  if (typeof valor === "string") {
    return valor.replace(/\{\{([\w.]+)\}\}/g, (_, caminho) => {
      const v = caminho.split(".").reduce((o, k) => (o == null ? undefined : o[k]), dados);
      if (v === undefined || v === null) {
        throw new Error(`token {{${caminho}}} não existe em dados-jp.json (em ${contexto})`);
      }
      return String(v);
    });
  }
  if (Array.isArray(valor)) return valor.map((v) => resolverTokens(v, contexto));
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) => [k, resolverTokens(v, contexto)]),
    );
  }
  return valor;
}

const VIEWPORT = {
  feed: { width: 1080, height: 1350 },
  quadrado: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

const arquivos = (await readdir(join(KIT, "source/manifests")))
  .filter((f) => f.endsWith(".json"))
  .sort();

const manifests = [];
for (const f of arquivos) {
  const m = JSON.parse(await readFile(join(KIT, "source/manifests", f), "utf8"));
  m._arquivo = f;
  if (alvos.length === 0 || alvos.some((a) => f.includes(a) || m.grupo === a)) manifests.push(m);
}

if (manifests.length === 0) {
  console.error(`Nenhum manifest casou com: ${alvos.join(", ")}`);
  process.exit(1);
}

const servidor = await servirRaiz(RAIZ);
const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  viewport: VIEWPORT.feed,
  deviceScaleFactor: 1,
  locale: "pt-BR",
});
const pagina = await contexto.newPage();

const erros = [];
const avisos = [];
let total = 0;
const t0 = Date.now();

pagina.on("pageerror", (err) => {
  erros.push(`erro de página: ${err.message}`);
});

await pagina.goto(`${servidor.url}/social/instagram/source/templates/renderer.html`, {
  waitUntil: "networkidle",
});

for (const m of manifests) {
  const saida = join(KIT, m.saida);
  await mkdir(saida, { recursive: true });
  console.log(`\n▸ ${m.grupo}  →  ${m.saida}  (${String(m.pecas.length)} peças)`);

  for (const bruta of m.pecas) {
    const peca = resolverTokens({ ...m.padrao, ...bruta }, bruta.arquivo ?? "?");
    const formato = peca.formato ?? "feed";
    await pagina.setViewportSize(VIEWPORT[formato]);

    let relatorio;
    try {
      relatorio = await pagina.evaluate((d) => window.montar(d), { ...peca, qa: QA });
    } catch (err) {
      erros.push(`${peca.arquivo}: ${err.message}`);
      console.log(`  ✗ ${peca.arquivo} — ${err.message}`);
      continue;
    }

    if (relatorio.transbordo > 1) {
      avisos.push(`${peca.arquivo}: conteúdo ${String(relatorio.transbordo)}px maior que a peça`);
    }
    if (relatorio.vazamentos.length > 0) {
      avisos.push(`${peca.arquivo}: fora da moldura → ${relatorio.vazamentos.join(", ")}`);
    }

    const destino = join(saida, `${peca.arquivo}.png`);
    await pagina.locator("#peca").screenshot({ path: destino, animations: "disabled" });
    total += 1;
    const marca = relatorio.transbordo > 1 ? "!" : "·";
    console.log(`  ${marca} ${peca.arquivo}.png`);
  }
}

await navegador.close();
await servidor.fechar();

const segundos = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n${String(total)} peças em ${segundos}s`);

if (avisos.length > 0) {
  console.log(`\n⚠ ${String(avisos.length)} aviso(s) de layout:`);
  for (const a of avisos) console.log(`  - ${a}`);
}
if (erros.length > 0) {
  console.log(`\n✗ ${String(erros.length)} erro(s):`);
  for (const x of erros) console.log(`  - ${x}`);
}

await writeFile(
  join(KIT, "source/ultimo-render.json"),
  `${JSON.stringify({ total, segundos: Number(segundos), avisos, erros }, null, 2)}\n`,
  "utf8",
);

process.exit(erros.length > 0 ? 1 : 0);
