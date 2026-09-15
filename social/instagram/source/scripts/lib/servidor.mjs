/**
 * Servidor estático de render.
 *
 * Por que um servidor em vez de abrir a página em `file://`.
 *
 * O palco é um módulo ES (`<script type="module">`), e o Chromium recusa
 * módulo carregado de `file://` por origem opaca. Além disso `@font-face` com
 * caminho relativo em `file://` cai nas mesmas regras e a peça sai com a fonte
 * do sistema — um defeito que não dá erro, só sai feio.
 *
 * Servindo a RAIZ DO REPOSITÓRIO em http://127.0.0.1, tudo o que a peça
 * precisa — fontes de `src/assets/fontes`, fotos de `src/assets`, SVGs de
 * `src/assets/marca` — vira mesma origem, e o caminho escrito no manifest é o
 * mesmo caminho do repositório. Um lugar a menos para traduzir.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
};

export async function servirRaiz(raiz, porta = 0) {
  const base = resolve(raiz);

  const servidor = createServer((req, res) => {
    void (async () => {
      try {
        const caminho = decodeURIComponent((req.url ?? "/").split("?")[0]);
        // Trava de caminho: `..` normalizado não pode sair da raiz servida.
        const destino = join(base, normalize(caminho).replace(/^([/\\])+/, ""));
        if (!destino.startsWith(base + sep) && destino !== base) {
          res.writeHead(403).end("fora da raiz");
          return;
        }
        const corpo = await readFile(destino);
        res.writeHead(200, {
          "content-type": TIPOS[extname(destino).toLowerCase()] ?? "application/octet-stream",
          "cache-control": "no-store",
        });
        res.end(corpo);
      } catch {
        res.writeHead(404).end("não encontrado");
      }
    })();
  });

  await new Promise((ok) => servidor.listen(porta, "127.0.0.1", ok));
  const { port } = servidor.address();
  return {
    url: `http://127.0.0.1:${String(port)}`,
    fechar: () => new Promise((ok) => servidor.close(ok)),
  };
}
