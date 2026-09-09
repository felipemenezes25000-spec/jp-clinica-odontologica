/**
 * Confere se os áudios têm som do começo ao fim.
 *
 * POR QUE ISSO EXISTE
 * A trilha já saiu uma vez com 3 minutos de silêncio no meio. O arquivo tinha o
 * tamanho certo, tocava normalmente nos primeiros dois minutos e emudecia — um
 * `NaN` nascido de erro de ponto flutuante entrava no filtro passa-baixa, que é
 * com estado, e daí para a frente toda amostra virava zero. Nada no build
 * acusou; quem descobriu foi o cliente assistindo.
 *
 * Então: em vez de confiar que o gerador está certo, escuta-se o resultado. O
 * arquivo é decodificado e medido em blocos de 15 segundos. Se qualquer bloco
 * que deveria ter música vier mudo, este script falha.
 *
 * Uso:  npm run audio:conferir
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLOCO = 15;

/**
 * O ffmpeg que o Remotion já baixou. Usar o dele evita exigir um ffmpeg
 * instalado na máquina só para rodar a conferência.
 */
function acharFfmpeg() {
  const base = join(RAIZ, "node_modules/@remotion/compositor-win32-x64-msvc");
  const caminho = join(base, "ffmpeg.exe");
  if (existsSync(caminho)) return caminho;
  return "ffmpeg";
}

/**
 * Decodifica para WAV e devolve as amostras.
 *
 * Passa por arquivo, e não por `stdout`, porque o ffmpeg que vem com o Remotion
 * é uma compilação reduzida: ela não traz o muxer `s16le`, então pedir PCM cru
 * na saída padrão simplesmente falha. WAV ela escreve.
 */
function amostras(mp3) {
  const pasta = mkdtempSync(join(tmpdir(), "jp-audio-"));
  const wav = join(pasta, "a.wav");
  try {
    execFileSync(acharFfmpeg(), ["-v", "error", "-i", mp3, "-ac", "1", "-ar", "16000", wav], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const bytes = readFileSync(wav);

    // Procura o cabeçalho "data"; os chunks antes dele variam de tamanho.
    let i = 12;
    while (i < bytes.length - 8) {
      const tipo = bytes.toString("ascii", i, i + 4);
      const tamanho = bytes.readUInt32LE(i + 4);
      if (tipo === "data") {
        const total = Math.floor(tamanho / 2);
        const saida = new Float32Array(total);
        for (let n = 0; n < total; n++) saida[n] = bytes.readInt16LE(i + 8 + n * 2) / 32768;
        return { dados: saida, taxa: 16000 };
      }
      i += 8 + tamanho + (tamanho % 2);
    }
    throw new Error("WAV sem bloco de dados.");
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

function medir(caminho, { pisoRms, ignorarUltimoBloco = false }) {
  const nome = caminho.split(/[\\/]/).pop();
  if (!existsSync(caminho)) throw new Error(`${nome} não existe. Gere o áudio antes.`);

  const { dados, taxa } = amostras(caminho);
  const duracao = dados.length / taxa;
  const blocos = [];

  for (let inicio = 0; inicio < duracao; inicio += BLOCO) {
    const de = Math.floor(inicio * taxa);
    const ate = Math.min(dados.length, Math.floor((inicio + BLOCO) * taxa));
    let soma = 0;
    let pico = 0;
    for (let n = de; n < ate; n++) {
      soma += dados[n] * dados[n];
      pico = Math.max(pico, Math.abs(dados[n]));
    }
    blocos.push({ inicio, rms: Math.sqrt(soma / (ate - de)), pico });
  }

  // O último bloco não conta: na trilha ele pega a queda final do volume e na
  // narração pega o silêncio que fecha o filme depois da última fala. Os dois
  // são de propósito.
  const conferir = ignorarUltimoBloco ? blocos.slice(0, -1) : blocos;
  const mudos = conferir.filter((b) => b.rms < pisoRms);

  console.log(
    `${nome}: ${Math.floor(duracao / 60)}:${String(Math.floor(duracao % 60)).padStart(2, "0")}, ` +
      `${blocos.length} blocos de ${BLOCO}s, ` +
      `rms ${Math.min(...conferir.map((b) => b.rms)).toFixed(3)}–${Math.max(...conferir.map((b) => b.rms)).toFixed(3)}`,
  );

  if (mudos.length > 0) {
    const onde = mudos
      .map((b) => `${Math.floor(b.inicio / 60)}:${String(b.inicio % 60).padStart(2, "0")}`)
      .join(", ");
    throw new Error(`${nome} tem ${mudos.length} bloco(s) sem som: ${onde}`);
  }
}

// A trilha toca sem parar: todo bloco tem que ter música, e o piso é alto.
medir(join(RAIZ, "public/audio/trilha.mp3"), { pisoRms: 0.02, ignorarUltimoBloco: true });

// A narração tem pausas longas de propósito, então o piso aqui só denuncia
// arquivo truncado ou bloco inteiro perdido.
medir(join(RAIZ, "public/audio/narracao.mp3"), { pisoRms: 0.002, ignorarUltimoBloco: true });

console.log("Os dois áudios têm som do começo ao fim.");
