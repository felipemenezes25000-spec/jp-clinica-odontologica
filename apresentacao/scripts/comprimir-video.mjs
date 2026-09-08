/**
 * Uma segunda cópia do vídeo, leve o bastante para mandar por WhatsApp.
 *
 * O render principal sai em CRF 18 — praticamente sem perda visível, que é o que
 * se quer para projetar numa reunião, mas dá ~35 MB. O WhatsApp corta em 16 MB e
 * vários e-mails em 25 MB, então a peça precisa das duas versões.
 *
 * Isto NÃO re-renderiza: só reempacota o MP4 que já existe, o que leva segundos
 * em vez de minutos. Mesma imagem, mesmo áudio, mesma duração.
 *
 * Uso:  npm run video:leve
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRADA = join(RAIZ, "out/jp-crc-1080p.mp4");
const SAIDA = join(RAIZ, "out/jp-crc-leve.mp4");

if (!existsSync(ENTRADA)) {
  throw new Error("out/jp-crc-1080p.mp4 não existe. Rode `npm run video:render` antes.");
}

/** O ffmpeg que vem com o Remotion — sem instalação à parte. */
function acharFfmpeg() {
  const base = join(RAIZ, "node_modules/@remotion");
  for (const pasta of readdirSync(base)) {
    if (!pasta.startsWith("compositor-")) continue;
    for (const nome of ["ffmpeg.exe", "ffmpeg"]) {
      const caminho = join(base, pasta, nome);
      if (existsSync(caminho)) return caminho;
    }
  }
  throw new Error("ffmpeg não encontrado. Rode `npm install`.");
}

execFileSync(acharFfmpeg(), [
  "-v", "error", "-y",
  "-i", ENTRADA,
  // CRF 28 com preset lento: o conteúdo é interface, quase estática entre
  // frames, então o codec tem muito o que economizar sem borrar texto.
  "-c:v", "libx264", "-crf", "28", "-preset", "slow",
  "-profile:v", "high", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "96k",
  // Move o índice para o começo: o vídeo começa a tocar antes de baixar inteiro.
  "-movflags", "+faststart",
  SAIDA,
]);

const mb = (caminho) => (statSync(caminho).size / 1e6).toFixed(1);
console.log(`out/jp-crc-1080p.mp4  ${mb(ENTRADA)} MB  (qualidade cheia)`);
console.log(`out/jp-crc-leve.mp4   ${mb(SAIDA)} MB  (para WhatsApp e e-mail)`);
