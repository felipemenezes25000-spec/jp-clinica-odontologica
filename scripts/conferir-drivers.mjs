/**
 * Confere que os dois drivers de armazenamento oferecem a mesma coisa.
 *
 *   node scripts/conferir-drivers.mjs
 *
 * O despachante em armazenamento.ts troca um driver pelo outro por variável de
 * ambiente, e o TypeScript só confere o lado que ele escolheu tipar (o de
 * disco). Se alguém acrescentar uma função lá e esquecer aqui, o build passa e o
 * erro só aparece em produção, no dia em que a clínica clicar no botão — que é
 * exatamente o pior dia. Este teste fecha esse buraco.
 *
 * Não toca em disco nem em rede: só carrega os módulos e compara os nomes.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { createServer } = await import("vite");
const vite = await createServer({
  configFile: false,
  root: RAIZ,
  resolve: { alias: { "@": path.join(RAIZ, "src") } },
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: "custom",
  logLevel: "error",
});

let falhou = false;

try {
  const arquivo = await vite.ssrLoadModule("/src/lib/rh/servidor/arquivo.ts");
  const supabase = await vite.ssrLoadModule("/src/lib/rh/servidor/supabase.ts");
  const despachante = await vite.ssrLoadModule("/src/lib/rh/servidor/armazenamento.ts");

  const publicos = (m) =>
    new Set(Object.keys(m).filter((k) => typeof m[k] === "function" && !k.startsWith("_")));

  const noArquivo = publicos(arquivo);
  const noSupabase = publicos(supabase);
  const noDespachante = publicos(despachante);

  // O que existe no disco e o Supabase não implementa: quebra na hora da troca.
  const faltandoNoSupabase = [...noArquivo].filter((k) => !noSupabase.has(k)).sort();
  // O que o despachante não repassa: existe, mas ninguém alcança.
  const naoDespachado = [...noArquivo].filter((k) => !noDespachante.has(k)).sort();
  // Extra no Supabase é aceitável (helpers próprios), mas vale listar.
  const soNoSupabase = [...noSupabase].filter((k) => !noArquivo.has(k)).sort();

  const linha = (rot, itens, grave) => {
    if (itens.length === 0) {
      console.log(`  ok    ${rot}`);
      return;
    }
    console.log(`  ${grave ? "FALHA" : "aviso"} ${rot}: ${itens.join(", ")}`);
    if (grave) falhou = true;
  };

  console.log(
    `\ndisco: ${noArquivo.size} funções · supabase: ${noSupabase.size} · despachante: ${noDespachante.size}\n`,
  );
  linha("toda função do disco existe no Supabase", faltandoNoSupabase, true);
  linha("toda função do disco é repassada pelo despachante", naoDespachado, true);
  linha("funções que só o Supabase tem", soNoSupabase, false);

  // Aridade: uma função com menos parâmetros silenciosamente ignora o que
  // recebe a mais, e o bug fica invisível até alguém conferir o dado gravado.
  const aridade = [];
  for (const k of noArquivo) {
    if (!noSupabase.has(k)) continue;
    if (arquivo[k].length !== supabase[k].length) {
      aridade.push(`${k} (disco ${arquivo[k].length}, supabase ${supabase[k].length})`);
    }
  }
  linha("mesma quantidade de parâmetros", aridade, true);

  // O helper que mais dói divergir: ele gerou o nome dos currículos já salvos.
  const amostras = ["Currículo José Ávila.PDF", "cv (1).docx", "  ../etc/passwd  ", "ÇÃO.png", ""];
  const divergentes = amostras.filter(
    (a) => arquivo.nomeArquivoSeguro(a) !== supabase.nomeArquivoSeguro(a),
  );
  linha("nomeArquivoSeguro produz o mesmo nome nos dois", divergentes, true);
  for (const a of amostras) {
    console.log(`        ${JSON.stringify(a)} -> ${JSON.stringify(arquivo.nomeArquivoSeguro(a))}`);
  }
} finally {
  await vite.close();
}

console.log(falhou ? "\nCONTRATO QUEBRADO\n" : "\nOs dois drivers são intercambiáveis.\n");
process.exit(falhou ? 1 : 0);
