/**
 * Gera a narração falada e — o mais importante — os tempos das legendas.
 *
 * O PROBLEMA QUE ELE RESOLVE
 * Legenda escrita à mão nunca bate com a voz. Ou some antes de a frase acabar,
 * ou fica sobrando. Aqui a ordem é invertida: primeiro o áudio é sintetizado,
 * depois a duração REAL de cada frase é medida e gravada em
 * `src/data/narracao.duracoes.json`. A tela lê esse arquivo. Resultado: a
 * legenda entra e sai junto com a voz, por construção.
 *
 * DOIS MOTORES DE VOZ
 *
 *   neural  (padrão) — vozes neurais da Microsoft, as mesmas do Edge. Soam como
 *                      gente. Precisam de internet.
 *   windows (reserva) — a voz que vem no Windows. Robótica, mas funciona offline
 *                      e sem depender de serviço de terceiro.
 *
 * O script tenta a neural e cai para a do Windows sozinho se a rede falhar, para
 * que nunca exista um estado em que a peça fica sem áudio.
 *
 * O QUE ELE PRODUZ
 *   public/audio/narracao.mp3        — trilha única, alinhada ao frame 0
 *   src/data/narracao.duracoes.json  — duração medida de cada frase, em segundos
 *   out/roteiro-narracao.txt         — o roteiro com marcações, para estúdio
 *
 * Uso:
 *   node scripts/gerar-narracao.mjs
 *   node scripts/gerar-narracao.mjs --voz pt-BR-ThalitaNeural
 *   node scripts/gerar-narracao.mjs --motor windows
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

/** Tudo é normalizado para este formato antes de virar trilha. */
const TAXA = 24000;
const BYTES_POR_AMOSTRA = 2;

/* -------------------------------------------------------------------------- */
/* Entrada                                                                    */
/* -------------------------------------------------------------------------- */

const argumentos = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = argumentos.indexOf(`--${nome}`);
  return i >= 0 && argumentos[i + 1] !== undefined ? argumentos[i + 1] : padrao;
};

/**
 * `pt-BR-FranciscaNeural` — voz feminina brasileira, quente e sem sotaque
 * marcado. Testei também a Thalita (mais jovem) e o Antônio (masculino); trocar
 * é passar `--voz`.
 */
let VOZ_NEURAL = opcao("voz", "pt-BR-FranciscaNeural");
/** −4%: a fala fica um pouco abaixo do ritmo natural. Quem assiste está lendo a
 *  tela ao mesmo tempo, e essa folga é o que evita ter que voltar o vídeo. */
const RITMO = opcao("ritmo", "-4%");
const VOZ_WINDOWS = opcao("voz-windows", "Microsoft Maria Desktop");
let MOTOR = opcao("motor", "neural");

const cenasJson = JSON.parse(readFileSync(join(RAIZ, "src/data/cenas.json"), "utf8"));
const narracaoJson = JSON.parse(readFileSync(join(RAIZ, "src/data/narracao.json"), "utf8"));

const FPS = cenasJson.fps;

// O mesmo cálculo que `linhaDoTempo.ts` faz: início = soma das durações anteriores.
const inicioDaCena = new Map();
const duracaoDaCena = new Map();
let cursor = 0;
for (const cena of cenasJson.cenas) {
  inicioDaCena.set(cena.id, cursor);
  duracaoDaCena.set(cena.id, cena.segundos);
  cursor += cena.segundos;
}
const DURACAO_FILME = cursor;

const linhas = narracaoJson.linhas.map((linha, i) => {
  if (inicioDaCena.get(linha.cena) === undefined) {
    throw new Error(`Cena desconhecida em narracao.json: "${linha.cena}"`);
  }
  return {
    ...linha,
    chave: `${linha.cena}-${i}`,
    indice: i,
    inicioGlobal: inicioDaCena.get(linha.cena) + linha.inicio,
  };
});

const pasta = join(tmpdir(), "jp-crc-narracao");
rmSync(pasta, { recursive: true, force: true });
mkdirSync(pasta, { recursive: true });

/* -------------------------------------------------------------------------- */
/* ffmpeg                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O ffmpeg que já vem com o Remotion.
 *
 * Evita pedir uma instalação à parte só para converter áudio — e garante que a
 * mesma versão que renderiza o vídeo é a que prepara a voz.
 */
function acharFfmpeg() {
  const base = join(RAIZ, "node_modules/@remotion");
  if (!existsSync(base)) return null;
  for (const pasta of readdirSync(base)) {
    if (!pasta.startsWith("compositor-")) continue;
    for (const nome of ["ffmpeg.exe", "ffmpeg"]) {
      const caminho = join(base, pasta, nome);
      if (existsSync(caminho)) return caminho;
    }
  }
  return null;
}

const FFMPEG = acharFfmpeg();
if (FFMPEG === null) {
  throw new Error(
    "ffmpeg não encontrado. Ele vem com o Remotion — rode `npm install` antes.",
  );
}

/**
 * Qualquer áudio → PCM 16 bits, mono, 24 kHz. É o denominador comum.
 *
 * Passa por um WAV em disco em vez de canalizar `s16le` pela saída padrão: o
 * ffmpeg que vem com o Remotion é uma compilação enxuta e não conhece o
 * contêiner cru `s16le`. WAV ele conhece — e o cabeçalho é descartado logo em
 * seguida.
 */
function paraPcm(arquivo) {
  const temporario = `${arquivo}.pcm.wav`;
  execFileSync(FFMPEG, [
    "-v", "error", "-y",
    "-i", arquivo,
    "-ar", String(TAXA), "-ac", "1", "-c:a", "pcm_s16le",
    temporario,
  ]);
  return blocoDeDados(readFileSync(temporario));
}

/** O bloco `data` de um WAV, percorrendo os chunks do RIFF. */
function blocoDeDados(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Saída do ffmpeg não é um WAV válido.");
  }
  let posicao = 12;
  while (posicao + 8 <= buffer.length) {
    const id = buffer.toString("ascii", posicao, posicao + 4);
    const tamanho = buffer.readUInt32LE(posicao + 4);
    if (id === "data") return buffer.subarray(posicao + 8, posicao + 8 + tamanho);
    posicao += 8 + tamanho + (tamanho % 2);
  }
  throw new Error("WAV sem chunk de dados.");
}

/* -------------------------------------------------------------------------- */
/* Motor neural                                                               */
/* -------------------------------------------------------------------------- */

async function sintetizarNeural() {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");

  const saidas = [];
  for (const linha of linhas) {
    const arquivo = join(pasta, `${String(linha.indice).padStart(3, "0")}.mp3`);

    // Uma conexão por frase, e não uma para todas: o serviço fecha o socket
    // entre sínteses, e reaproveitar dá "stream closed" na segunda frase.
    let ultimoErro = null;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const tts = new MsEdgeTTS();
        await tts.setMetadata(VOZ_NEURAL, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
        const { audioStream } = await tts.toStream(linha.texto, { rate: RITMO });
        const pedacos = [];
        for await (const pedaco of audioStream) pedacos.push(pedaco);
        const bytes = Buffer.concat(pedacos);
        if (bytes.length < 500) throw new Error("áudio vazio");
        writeFileSync(arquivo, bytes);
        ultimoErro = null;
        break;
      } catch (erro) {
        ultimoErro = erro;
      }
    }
    if (ultimoErro !== null) throw ultimoErro;

    saidas.push(arquivo);
    process.stdout.write(`\r  ${saidas.length}/${linhas.length} frases`);
  }
  process.stdout.write("\n");
  return saidas;
}

/* -------------------------------------------------------------------------- */
/* Motor do Windows (reserva)                                                 */
/* -------------------------------------------------------------------------- */

function sintetizarWindows() {
  const lista = linhas.map((linha) => ({
    arquivo: join(pasta, `${String(linha.indice).padStart(3, "0")}.wav`),
    texto: linha.texto,
  }));
  const entrada = join(pasta, "entrada.json");
  writeFileSync(entrada, JSON.stringify(lista), "utf8");

  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(AQUI, "sintetizar.ps1"),
      "-Entrada",
      entrada,
      "-Voz",
      VOZ_WINDOWS,
      "-Velocidade",
      "1",
    ],
    { stdio: "inherit" },
  );

  return lista.map((l) => l.arquivo);
}

/* -------------------------------------------------------------------------- */
/* Síntese                                                                    */
/* -------------------------------------------------------------------------- */

console.log(`Sintetizando ${linhas.length} frases…`);
let arquivos;
if (MOTOR === "neural") {
  console.log(`  voz neural: ${VOZ_NEURAL} (ritmo ${RITMO})`);
  try {
    arquivos = await sintetizarNeural();
  } catch (erro) {
    console.log(`\n  A voz neural falhou (${String(erro.message).slice(0, 80)}).`);
    console.log("  Caindo para a voz do Windows — o resultado sai robótico.\n");
    MOTOR = "windows";
  }
}
if (MOTOR !== "neural") {
  console.log(`  voz do Windows: ${VOZ_WINDOWS}`);
  arquivos = sintetizarWindows();
}

/* -------------------------------------------------------------------------- */
/* Corte de silêncio                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Tira o silêncio das pontas.
 *
 * Toda síntese põe um respiro antes e depois da frase. Sem cortar, a legenda
 * entraria antes da voz e sairia depois dela — exatamente o defeito que este
 * script existe para evitar. Sobra uma margem de 60 ms para o ataque da primeira
 * sílaba não ficar cortado.
 */
function cortarSilencio(pcm) {
  const LIMIAR = 420; // de 32768
  const MARGEM = Math.floor(TAXA * 0.06) * BYTES_POR_AMOSTRA;
  const total = Math.floor(pcm.length / BYTES_POR_AMOSTRA);

  let inicio = 0;
  while (inicio < total && Math.abs(pcm.readInt16LE(inicio * 2)) < LIMIAR) inicio++;
  let fim = total - 1;
  while (fim > inicio && Math.abs(pcm.readInt16LE(fim * 2)) < LIMIAR) fim--;

  if (inicio >= fim) return pcm;
  return pcm.subarray(
    Math.max(0, inicio * 2 - MARGEM),
    Math.min(pcm.length, fim * 2 + MARGEM),
  );
}

const trechos = linhas.map((linha, i) => {
  const pcm = cortarSilencio(paraPcm(arquivos[i]));
  return { ...linha, pcm, segundos: pcm.length / BYTES_POR_AMOSTRA / TAXA };
});

/* -------------------------------------------------------------------------- */
/* Conferência de encaixe                                                     */
/* -------------------------------------------------------------------------- */

const avisos = [];
for (let i = 0; i < trechos.length; i++) {
  const t = trechos[i];
  const fimNaCena = t.inicio + t.segundos;
  const duracaoCena = duracaoDaCena.get(t.cena);

  if (fimNaCena > duracaoCena) {
    avisos.push(
      `A fala "${t.texto.slice(0, 44)}…" passa ${(fimNaCena - duracaoCena).toFixed(1)}s do fim ` +
        `da cena "${t.cena}" (${duracaoCena}s). Encurte a frase ou alongue a cena em cenas.json.`,
    );
  }

  const proximo = trechos[i + 1];
  if (proximo !== undefined && t.inicioGlobal + t.segundos > proximo.inicioGlobal) {
    const sobra = t.inicioGlobal + t.segundos - proximo.inicioGlobal;
    avisos.push(
      `A fala "${t.texto.slice(0, 44)}…" invade a seguinte em ${sobra.toFixed(1)}s. ` +
        `Adie o "inicio" da próxima em narracao.json.`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Montagem da trilha                                                         */
/* -------------------------------------------------------------------------- */

const amostrasTotais = Math.ceil((DURACAO_FILME + 1) * TAXA);
const trilha = Buffer.alloc(amostrasTotais * BYTES_POR_AMOSTRA); // zeros = silêncio

for (const t of trechos) {
  const deslocamento = Math.floor(t.inicioGlobal * TAXA) * BYTES_POR_AMOSTRA;
  const cabe = Math.min(t.pcm.length, trilha.length - deslocamento);
  if (cabe > 0) t.pcm.copy(trilha, deslocamento, 0, cabe);
}

function cabecalhoWav(tamanhoDados) {
  const c = Buffer.alloc(44);
  c.write("RIFF", 0, "ascii");
  c.writeUInt32LE(36 + tamanhoDados, 4);
  c.write("WAVE", 8, "ascii");
  c.write("fmt ", 12, "ascii");
  c.writeUInt32LE(16, 16);
  c.writeUInt16LE(1, 20); // PCM
  c.writeUInt16LE(1, 22); // mono
  c.writeUInt32LE(TAXA, 24);
  c.writeUInt32LE(TAXA * BYTES_POR_AMOSTRA, 28);
  c.writeUInt16LE(BYTES_POR_AMOSTRA, 32);
  c.writeUInt16LE(16, 34);
  c.write("data", 36, "ascii");
  c.writeUInt32LE(tamanhoDados, 40);
  return c;
}

const wavTemporario = join(pasta, "trilha.wav");
writeFileSync(wavTemporario, Buffer.concat([cabecalhoWav(trilha.length), trilha]));

/**
 * A entrega é MP3, não WAV.
 *
 * A mesma trilha em WAV dá 12 MB; em MP3 de 96 kbps mono, cerca de 2,5 MB — e
 * ela é baixada por quem abre a página no celular. O Remotion e o `<audio>` do
 * navegador leem MP3 igual.
 */
const destinoAudio = join(RAIZ, "public/audio/narracao.mp3");
mkdirSync(dirname(destinoAudio), { recursive: true });
execFileSync(FFMPEG, [
  "-v", "error", "-y",
  "-i", wavTemporario,
  "-codec:a", "libmp3lame", "-b:a", "96k", "-ac", "1",
  destinoAudio,
]);

// O WAV antigo, se existir, sai de cena: dois arquivos de narração na pasta
// convidam a peça a tocar o errado.
const wavAntigo = join(RAIZ, "public/audio/narracao.wav");
if (existsSync(wavAntigo)) rmSync(wavAntigo);

/* -------------------------------------------------------------------------- */
/* Tempos das legendas                                                        */
/* -------------------------------------------------------------------------- */

const duracoes = {};
for (const t of trechos) {
  // Um respiro de 0,35 s depois da voz: a legenda não some no meio da última
  // palavra de quem lê mais devagar que ouve.
  duracoes[t.chave] = Number((t.segundos + 0.35).toFixed(3));
}

writeFileSync(
  join(RAIZ, "src/data/narracao.duracoes.json"),
  `${JSON.stringify(
    {
      _leia_me:
        "GERADO por scripts/gerar-narracao.mjs. Duração medida de cada fala, em segundos, usada para a legenda entrar e sair junto com a voz. Não edite à mão: rode `npm run narracao`.",
      _motor: MOTOR,
      _voz: MOTOR === "neural" ? VOZ_NEURAL : VOZ_WINDOWS,
      _ritmo: RITMO,
      duracoes,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

/* -------------------------------------------------------------------------- */
/* Roteiro para estúdio                                                       */
/* -------------------------------------------------------------------------- */

const marcacao = (segundos) =>
  `${Math.floor(segundos / 60)}:${(segundos % 60).toFixed(1).padStart(4, "0")}`;

writeFileSync(
  join(RAIZ, "out/roteiro-narracao.txt"),
  `${[
    "ROTEIRO DE NARRAÇÃO — JP CRC",
    `Duração do filme: ${marcacao(DURACAO_FILME)} · ${FPS} fps`,
    `Voz usada nesta versão: ${MOTOR === "neural" ? VOZ_NEURAL : VOZ_WINDOWS}`,
    "",
    "Para regravar com locutor: leia cada linha começando na marcação indicada.",
    "Depois substitua public/audio/narracao.mp3 pela gravação.",
    "",
    ...trechos.map(
      (t) => `[${marcacao(t.inicioGlobal)}] (${t.cena}, ${t.segundos.toFixed(1)}s)\n    ${t.texto}`,
    ),
  ].join("\n")}\n`,
  "utf8",
);

/* -------------------------------------------------------------------------- */
/* Relatório                                                                  */
/* -------------------------------------------------------------------------- */

const tamanhoMp3 = readFileSync(destinoAudio).length;
const totalFalado = trechos.reduce((s, t) => s + t.segundos, 0);

console.log("");
console.log(`Trilha:   public/audio/narracao.mp3 (${(tamanhoMp3 / 1e6).toFixed(1)} MB)`);
console.log(`Tempos:   src/data/narracao.duracoes.json (${trechos.length} falas)`);
console.log(`Roteiro:  out/roteiro-narracao.txt`);
console.log(
  `Voz ocupa ${marcacao(totalFalado)} de ${marcacao(DURACAO_FILME)} ` +
    `(${Math.round((totalFalado / DURACAO_FILME) * 100)}% do filme).`,
);

if (avisos.length > 0) {
  console.log("");
  console.log(`${avisos.length} ajuste(s) de tempo recomendados:`);
  for (const aviso of avisos) console.log(`  · ${aviso}`);
} else {
  console.log("Todas as falas cabem nas suas cenas.");
}

rmSync(pasta, { recursive: true, force: true });
