/**
 * A trilha de fundo — sintetizada aqui, não baixada de lugar nenhum.
 *
 * POR QUE GERAR EM VEZ DE USAR UMA PRONTA
 * A peça é exportada em MP4 e mostrada a terceiros. Música protegida nesse
 * contexto é problema de licença, não detalhe técnico — e "royalty-free" de site
 * aleatório costuma vir com cláusula de atribuição que ninguém lê. Um pad
 * gerado por código não tem dono além de quem rodou o script.
 *
 * O QUE ELE TOCA
 * Um colchão em Ré maior, 72 BPM, quatro acordes que giram a cada 26 segundos:
 * Ré maior 9 → Si menor 7 → Sol maior 7 → Lá com sexta. É a progressão mais
 * neutra que existe — resolve sem chamar atenção, que é exatamente o que uma
 * trilha de vídeo explicativo precisa fazer. Por cima, um arpejo esparso marca
 * o tempo sem virar batida.
 *
 * A PARTE QUE IMPORTA: ELA ABAIXA QUANDO A VOZ FALA
 * O script lê os mesmos tempos de narração que a legenda usa e aplica uma queda
 * de volume durante cada frase, com rampa de 0,3 s. Isso é o que impede a música
 * de brigar com a explicação — e é feito no arquivo, então vale igual no site e
 * no MP4, sem depender de processamento em tempo real.
 *
 * Uso:  npm run trilha
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const TAXA = 44100;
const CANAIS = 2;
const BPM = 72;
const SEGUNDOS_POR_BATIDA = 60 / BPM;
const COMPASSO = SEGUNDOS_POR_BATIDA * 4;

/* -------------------------------------------------------------------------- */
/* Duração e pontos de fala                                                   */
/* -------------------------------------------------------------------------- */

const cenas = JSON.parse(readFileSync(join(RAIZ, "src/data/cenas.json"), "utf8"));
const narracao = JSON.parse(readFileSync(join(RAIZ, "src/data/narracao.json"), "utf8"));

let duracoesMedidas = {};
try {
  duracoesMedidas = JSON.parse(
    readFileSync(join(RAIZ, "src/data/narracao.duracoes.json"), "utf8"),
  ).duracoes;
} catch {
  // Sem áudio gerado ainda: a trilha sai sem abaixar. Continua utilizável.
}

const inicioDaCena = new Map();
let cursor = 0;
for (const cena of cenas.cenas) {
  inicioDaCena.set(cena.id, cursor);
  cursor += cena.segundos;
}
const DURACAO = cursor;

/** Janelas em que alguém está falando — é onde a música recua. */
const FALAS = narracao.linhas.map((linha, i) => {
  const inicio = inicioDaCena.get(linha.cena) + linha.inicio;
  const segundos =
    duracoesMedidas[`${linha.cena}-${i}`] ??
    Math.max(2, linha.texto.trim().split(/\s+/).length / 2.4);
  return { inicio, fim: inicio + segundos };
});

/* -------------------------------------------------------------------------- */
/* Notas                                                                      */
/* -------------------------------------------------------------------------- */

/** Frequência de uma nota MIDI. 69 = Lá 440 Hz. */
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Ré 3 = 50. As vozes ficam entre Sol 2 e Si 4: grave o bastante para preencher,
// agudo o bastante para não sumir num alto-falante de celular.
const PROGRESSAO = [
  { nome: "Rémaj9", baixo: 38, notas: [50, 54, 57, 61, 64] },
  { nome: "Sim7", baixo: 35, notas: [47, 50, 54, 57, 62] },
  { nome: "Solmaj7", baixo: 31, notas: [43, 47, 50, 54, 59] },
  { nome: "Lá6", baixo: 33, notas: [45, 49, 52, 54, 59] },
];

/** Dois compassos por acorde. */
const DURACAO_ACORDE = COMPASSO * 2;

/* -------------------------------------------------------------------------- */
/* Osciladores                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Uma voz do pad: fundamental mais dois harmônicos fracos.
 *
 * Seno puro soa fino e barato; três parciais já dão corpo de órgão suave sem
 * chegar perto de sintetizador de anos 80.
 */
function vozPad(t, frequencia) {
  const w = 2 * Math.PI * frequencia * t;
  return Math.sin(w) + 0.26 * Math.sin(2 * w) + 0.1 * Math.sin(3 * w);
}

/** Envelope do acorde: entra devagar, sai devagar, e os acordes se emendam. */
function envelopeAcorde(tNoAcorde) {
  const ataque = 1.4;
  const solta = 1.8;
  if (tNoAcorde < ataque) return Math.pow(tNoAcorde / ataque, 1.6);
  const restante = DURACAO_ACORDE - tNoAcorde;
  if (restante < solta) return Math.pow(Math.max(0, restante) / solta, 1.2);
  return 1;
}

/** Ruído estável: a mesma semente dá sempre o mesmo valor. */
function aleatorio(semente) {
  const x = Math.sin(semente * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/**
 * O arpejo. Uma nota a cada duas batidas, escolhida entre as do acorde, com
 * decaimento curto. Ele marca o tempo sem criar ritmo — se virasse batida, o
 * vídeo passaria a parecer propaganda.
 */
function construirArpejo() {
  const notas = [];
  const passo = SEGUNDOS_POR_BATIDA * 2;
  for (let i = 0; t(i) < DURACAO; i++) {
    const inicio = t(i);
    const acorde = PROGRESSAO[Math.floor(inicio / DURACAO_ACORDE) % PROGRESSAO.length];
    // Sobe uma oitava: o arpejo mora acima do pad, não dentro dele.
    const escolha = acorde.notas[2 + Math.floor(aleatorio(i * 7.3) * 3)] + 12;
    notas.push({ inicio, frequencia: hz(escolha), forca: 0.55 + aleatorio(i * 3.1) * 0.45 });
  }
  return notas;

  function t(i) {
    return i * passo;
  }
}

const ARPEJO = construirArpejo();

/* -------------------------------------------------------------------------- */
/* Render                                                                     */
/* -------------------------------------------------------------------------- */

const amostras = Math.ceil((DURACAO + 2) * TAXA);

/**
 * Acumula em ponto flutuante e só no fim converte para 16 bits.
 *
 * A primeira versão escrevia direto em Int16 e o arquivo saía com pico em
 * −20 dBFS — inaudível depois de o player abaixar ainda mais. Com o buffer em
 * float dá para medir o pico real e normalizar uma vez, sem estourar.
 */
const canalEsq = new Float32Array(amostras);
const canalDir = new Float32Array(amostras);

/** Filtro passa-baixa de um polo, por canal. Tira o brilho do harmônico agudo. */
const anterior = [0, 0];
const CORTE = 0.16;

// Quanto a música cede durante a fala. 0,38 é o ponto em que ela some do
// primeiro plano mas continua sustentando o silêncio entre as frases.
const NIVEL_SOB_VOZ = 0.38;
const RAMPA = 0.3;

let indiceFala = 0;

for (let n = 0; n < amostras; n++) {
  const t = n / TAXA;

  /* Acorde atual e o seguinte, para o cruzamento -------------------------- */
  const indiceAcorde = Math.floor(t / DURACAO_ACORDE);
  const acorde = PROGRESSAO[indiceAcorde % PROGRESSAO.length];
  const tNoAcorde = t - indiceAcorde * DURACAO_ACORDE;
  const env = envelopeAcorde(tNoAcorde);

  let esquerda = 0;
  let direita = 0;

  /* Pad ------------------------------------------------------------------- */
  for (let i = 0; i < acorde.notas.length; i++) {
    const f = hz(acorde.notas[i]);
    // Desafinação mínima entre os lados: dá largura sem soar desafinado.
    esquerda += vozPad(t, f * 0.9995);
    direita += vozPad(t, f * 1.0005);
  }
  const ganhoPad = (0.052 * env) / acorde.notas.length;
  esquerda *= ganhoPad;
  direita *= ganhoPad;

  /* Sub ------------------------------------------------------------------- */
  const sub = Math.sin(2 * Math.PI * hz(acorde.baixo) * t) * 0.055 * env;
  esquerda += sub;
  direita += sub;

  /* Arpejo ---------------------------------------------------------------- */
  for (const nota of ARPEJO) {
    const dt = t - nota.inicio;
    if (dt < 0 || dt > 1.6) continue;
    const decaimento = Math.exp(-dt * 3.2);
    const voz = Math.sin(2 * Math.PI * nota.frequencia * dt) * decaimento * nota.forca * 0.026;
    esquerda += voz;
    direita += voz * 0.92;
  }

  /* Passa-baixa ----------------------------------------------------------- */
  anterior[0] += CORTE * (esquerda - anterior[0]);
  anterior[1] += CORTE * (direita - anterior[1]);
  esquerda = anterior[0];
  direita = anterior[1];

  /* Recuo sob a voz -------------------------------------------------------- */
  while (indiceFala < FALAS.length - 1 && t > FALAS[indiceFala].fim + RAMPA) indiceFala++;
  let recuo = 1;
  for (let k = Math.max(0, indiceFala - 1); k <= Math.min(FALAS.length - 1, indiceFala + 1); k++) {
    const fala = FALAS[k];
    if (t < fala.inicio - RAMPA || t > fala.fim + RAMPA) continue;
    let f = 1;
    if (t < fala.inicio) f = 1 - (t - (fala.inicio - RAMPA)) / RAMPA;
    else if (t > fala.fim) f = (t - fala.fim) / RAMPA;
    else f = 0;
    recuo = Math.min(recuo, NIVEL_SOB_VOZ + (1 - NIVEL_SOB_VOZ) * f);
  }

  /* Entrada e saída do filme ---------------------------------------------- */
  const entrada = Math.min(1, t / 4);
  const saida = Math.min(1, Math.max(0, DURACAO - t) / 6);

  const ganho = recuo * entrada * saida;
  canalEsq[n] = esquerda * ganho;
  canalDir[n] = direita * ganho;
}

/* -------------------------------------------------------------------------- */
/* Normalização                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Pico em −3 dBFS.
 *
 * A trilha sai forte no arquivo e é o player que a coloca no lugar
 * (`VOLUME_TRILHA` em `src/data/audio.ts`). Assim existe um número só para
 * ajustar a mistura, em vez de dois — e o arquivo continua utilizável sozinho,
 * caso alguém queira ouvi-lo fora da peça.
 */
let pico = 0;
for (let n = 0; n < amostras; n++) {
  const a = Math.abs(canalEsq[n]);
  const b = Math.abs(canalDir[n]);
  if (a > pico) pico = a;
  if (b > pico) pico = b;
}
const fator = pico > 0 ? 0.71 / pico : 1;

const pcm = Buffer.alloc(amostras * CANAIS * 2);
for (let n = 0; n < amostras; n++) {
  const posicao = n * CANAIS * 2;
  const e = Math.max(-1, Math.min(1, canalEsq[n] * fator));
  const d = Math.max(-1, Math.min(1, canalDir[n] * fator));
  pcm.writeInt16LE(Math.round(e * 32767), posicao);
  pcm.writeInt16LE(Math.round(d * 32767), posicao + 2);
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                    */
/* -------------------------------------------------------------------------- */

function cabecalhoWav(tamanho) {
  const c = Buffer.alloc(44);
  c.write("RIFF", 0, "ascii");
  c.writeUInt32LE(36 + tamanho, 4);
  c.write("WAVE", 8, "ascii");
  c.write("fmt ", 12, "ascii");
  c.writeUInt32LE(16, 16);
  c.writeUInt16LE(1, 20);
  c.writeUInt16LE(CANAIS, 22);
  c.writeUInt32LE(TAXA, 24);
  c.writeUInt32LE(TAXA * CANAIS * 2, 28);
  c.writeUInt16LE(CANAIS * 2, 32);
  c.writeUInt16LE(16, 34);
  c.write("data", 36, "ascii");
  c.writeUInt32LE(tamanho, 40);
  return c;
}

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

const pasta = join(tmpdir(), "jp-crc-trilha");
rmSync(pasta, { recursive: true, force: true });
mkdirSync(pasta, { recursive: true });
const temporario = join(pasta, "trilha.wav");
writeFileSync(temporario, Buffer.concat([cabecalhoWav(pcm.length), pcm]));

const destino = join(RAIZ, "public/audio/trilha.mp3");
mkdirSync(dirname(destino), { recursive: true });
execFileSync(acharFfmpeg(), [
  "-v", "error", "-y",
  "-i", temporario,
  "-codec:a", "libmp3lame", "-b:a", "112k",
  destino,
]);
rmSync(pasta, { recursive: true, force: true });

const minutos = Math.floor(DURACAO / 60);
console.log(
  `public/audio/trilha.mp3 — ${minutos}:${String(Math.round(DURACAO % 60)).padStart(2, "0")}, ` +
    `${(readFileSync(destino).length / 1e6).toFixed(1)} MB`,
);
console.log(
  `Ré maior, ${BPM} BPM, pico normalizado em −3 dBFS, ` +
    `recuando para ${Math.round(NIVEL_SOB_VOZ * 100)}% em ${FALAS.length} falas.`,
);
