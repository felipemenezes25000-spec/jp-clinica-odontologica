/**
 * Abre o Chromium de render — e sobrevive a um cache do Playwright mexido.
 *
 * O Playwright procura o navegador numa pasta com o número exato da build que
 * ele espera (`chromium_headless_shell-1243`). Basta alguém limpar o cache, ou
 * o projeto mudar de disco e o `npm install` puxar uma versão nova, para o
 * render inteiro morrer com "Executable doesn't exist" — sem ter nada de errado
 * com as peças.
 *
 * Aqui a ordem é: tentar o normal; se falhar por navegador ausente, usar a
 * build mais nova que ESTIVER instalada. Para screenshot de HTML estático,
 * uma build de diferença não muda um pixel. `JP_CHROMIUM` força um caminho.
 */
import { chromium } from "playwright";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

async function instalado() {
  const base =
    process.env["PLAYWRIGHT_BROWSERS_PATH"] ?? join(homedir(), "AppData", "Local", "ms-playwright");
  let pastas = [];
  try {
    pastas = await readdir(base);
  } catch {
    return null;
  }
  const candidatos = pastas
    .map((p) => {
      const m = /^(chromium_headless_shell|chromium)-(\d+)$/.exec(p);
      if (!m) return null;
      const exe =
        m[1] === "chromium_headless_shell"
          ? join(base, p, "chrome-headless-shell-win64", "chrome-headless-shell.exe")
          : join(base, p, "chrome-win64", "chrome.exe");
      return existsSync(exe) ? { exe, build: Number(m[2]), shell: m[1] !== "chromium" } : null;
    })
    .filter(Boolean)
    // build mais nova primeiro; na mesma build, o headless shell (mais leve)
    .sort((a, b) => b.build - a.build || Number(b.shell) - Number(a.shell));
  return candidatos[0] ?? null;
}

/** `opcoes.args` vai direto para o Chromium — o modo leve usa isso para
 *  limitar as threads de desenho. */
export async function abrirNavegador(opcoes = {}) {
  const base = { args: opcoes.args ?? [] };
  if (process.env["JP_CHROMIUM"]) {
    return chromium.launch({ ...base, executablePath: process.env["JP_CHROMIUM"] });
  }
  try {
    return await chromium.launch(base);
  } catch (err) {
    if (!/Executable doesn't exist/.test(String(err))) throw err;
    const alt = await instalado();
    if (!alt) throw err;
    if (!avisado) console.log(`  (usando o Chromium já instalado, build ${String(alt.build)})`);
    avisado = true;
    return chromium.launch({ ...base, executablePath: alt.exe });
  }
}
let avisado = false;
