/**
 * GERADOR DE VÍDEO — roteiros JSON  →  MP4 1080×1920 com trilha própria.
 *
 *   node social/instagram/source/scripts/gerar-videos.mjs           # todos
 *   node social/instagram/source/scripts/gerar-videos.mjs R01 R04   # só esses
 *   node social/instagram/source/scripts/gerar-videos.mjs --previa  # 6 fps, teste
 *   node social/instagram/source/scripts/gerar-videos.mjs --mudo    # sem trilha
 *   node social/instagram/source/scripts/gerar-videos.mjs --leve --pular-prontos
 *
 * ============================================================================
 *  --leve: O MODO PARA ESTE COMPUTADOR.
 *
 *  O render a toda velocidade prende a CPU em 100% por 25 minutos seguidos, e
 *  numa máquina da clínica isso já deu tela azul (18/09/2026). O modo leve
 *  troca velocidade por folga, em cinco travas:
 *
 *    1. prioridade abaixo do normal — e o Windows passa a mesma prioridade
 *       para o Chromium, o ffmpeg e o Python que este processo abrir;
 *    2. ffmpeg em 2 threads e preset `medium`, em vez de todos os núcleos em
 *       `slow` (diferença de qualidade invisível no CRF usado);
 *    3. Chromium com UMA thread de desenho;
 *    4. um freio: a cada 30 quadros mede o uso total da CPU e, acima de 70%,
 *       pausa 1,5 s antes de seguir;
 *    5. um vídeo por vez: o Chromium é FECHADO depois de cada vídeo e há 20 s
 *       de pausa com nada rodando antes do próximo.
 *
 *  --pular-prontos: não refaz o MP4 que já é mais novo que o roteiro, o motor
 *  e a trilha. É o que permite interromper e retomar sem perder nada.
 * ============================================================================
 *
 * ============================================================================
 *  O QUE ACONTECE COM CADA ROTEIRO, EM TRÊS PASSOS.
 *
 *  1. IMAGEM. O motor (`templates/video.html`) monta o vídeo inteiro no DOM e
 *     devolve, além da duração, a LISTA DE EVENTOS: cada transição em arco,
 *     cada palavra que acende, cada check que se desenha, cada número que
 *     começa a contar. Os quadros são capturados a 30 fps e vão por pipe
 *     direto para o ffmpeg, sem passar pelo disco.
 *
 *  2. SOM. `trilha.py` recebe a lista de eventos e compõe uma trilha que
 *     obedece a ela — a bateria entra no quadro exato da virada, cada item de
 *     lista tem a sua nota, o cartão final resolve na tônica. Nada é sample:
 *     tudo é síntese, então a trilha é da clínica e pode ir para anúncio.
 *
 *  3. JUNÇÃO. Vídeo e áudio viram um MP4 só, AAC 192k, com `+faststart` para
 *     o player começar antes de baixar o arquivo inteiro.
 *
 *  A semente da trilha é o CONCEITO, não o vídeo: os três ganchos de um mesmo
 *  anúncio saem com a mesma música. Num teste de gancho, trilha diferente
 *  seria uma segunda variável — e aí o resultado não ensina nada.
 * ============================================================================
 */
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import os, { tmpdir } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { servirRaiz } from "./lib/servidor.mjs";
import { abrirNavegador } from "./lib/navegador.mjs";
import { aplicarVoz, filtroMixagem, VOZ_PADRAO } from "./lib/voz.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(AQUI, "../..");
const RAIZ = resolve(KIT, "../..");

const args = process.argv.slice(2);
const PREVIA = args.includes("--previa");
const MUDO = args.includes("--mudo");
/* --sem-voz: rende a imagem e a trilha, sem narração. Serve para conferir
   movimento sem esperar o sintetizador — e para o caso de a rede cair. */
const SEM_VOZ = args.includes("--sem-voz") || MUDO;
const argVoz = args.find((a) => a.startsWith("--voz="));
const VOZ = argVoz ? argVoz.split("=")[1] : VOZ_PADRAO;
/* --conferir: monta cada roteiro no motor e relata as cenas com pouco tempo de
   leitura, sem capturar nenhum quadro. Leva segundos para os 34 — é o passo
   que vem antes de gastar 25 minutos de render. */
const CONFERIR = args.includes("--conferir");
/* --quadros[=0.2,0.8,…]: fotografa o palco nesses instantes (ou a cada 0,5 s)
   e monta uma folha de contato em PNG, sem gravar vídeo. É como se revisa um
   efeito novo quadro a quadro antes de gastar um render inteiro. */
const argQuadros = args.find((a) => a.startsWith("--quadros"));
const QUADROS = argQuadros
  ? argQuadros.includes("=")
    ? argQuadros.split("=")[1].split(",").map(Number)
    : "todos"
  : null;
const LEVE = args.includes("--leve");
const PULAR = args.includes("--pular-prontos");
const PAUSA_ENTRE_VIDEOS = 20; // segundos, só no modo leve
/* 60%, medido a cada 15 quadros. Com 70% a cada 30, três filas ainda batiam
   picos de 84–89% — o freio reagia depois do pico, não antes. */
const TETO_CPU = 0.6;
const PASSO_FREIO = 15;
/* Chromium novo só abre com a máquina abaixo disto: os picos mais altos
   vinham de duas filas abrindo navegador no mesmo segundo. */
const TETO_PARA_ABRIR = 0.5;
const alvos = args.filter((a) => !a.startsWith("--"));

if (LEVE) {
  // O Windows passa BELOW_NORMAL adiante para todo processo filho que não
  // pedir outra prioridade: Chromium, ffmpeg e Python herdam esta.
  try {
    os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    /* sem permissão para baixar a prioridade: segue com as outras travas */
  }
}

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Uso total da CPU entre duas leituras — a máquina inteira, não só este
 *  processo. É o que faz o freio funcionar com vários renders em paralelo. */
function lerCpu() {
  let ocioso = 0;
  let total = 0;
  for (const c of os.cpus()) {
    ocioso += c.times.idle;
    total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle;
  }
  return { ocioso, total };
}
const usoEntre = (a, b) => 1 - (b.ocioso - a.ocioso) / Math.max(1, b.total - a.total);

/** Espera a máquina ficar abaixo de `teto`, medindo em janelas de 1 s. */
async function esperarCpu(teto) {
  for (let tentativas = 0; tentativas < 60; tentativas += 1) {
    const a = lerCpu();
    await dormir(1000);
    if (usoEntre(a, lerCpu()) < teto) return;
  }
}

const dados = JSON.parse(await readFile(join(KIT, "source/dados-jp.json"), "utf8"));

function resolverTokens(v, onde) {
  if (typeof v === "string") {
    return v.replace(/\{\{([\w.]+)\}\}/g, (_, c) => {
      const x = c.split(".").reduce((o, k) => (o == null ? undefined : o[k]), dados);
      if (x === undefined || x === null) throw new Error(`token {{${c}}} inexistente em ${onde}`);
      // "Freguesia do Ó": palavra de uma ou duas letras no fim de um dado
      // nunca quebra sozinha para a linha de baixo.
      return String(x).replace(/ (\p{L}{1,2})$/u, "\u00a0$1");
    });
  }
  if (Array.isArray(v)) return v.map((i) => resolverTokens(i, onde));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, i]) => [k, resolverTokens(i, onde)]));
  }
  return v;
}

/**
 * LEGENDA .SRT — a mesma fala, no tempo em que ela realmente acontece.
 *
 * A primeira versão datava cada bloco pelos LIMITES DA CENA: a legenda
 * começava com a cena e terminava com ela, o que punha o texto na tela até
 * 0,3 s depois de a voz calar e jogava uma frase de 105 caracteres numa
 * linha só. Num player de legenda isso é uma parede de texto piscando.
 *
 * Agora o tempo vem das MARCAS DE PALAVRA da narração, e o texto é quebrado
 * em blocos de no máximo duas linhas de ~42 caracteres — o limite que a
 * legenda de vídeo usa há trinta anos porque é o que o olho lê num relance.
 * A quebra prefere cair depois de pontuação: frase partida no meio de uma
 * oração custa mais leitura do que uma linha curta.
 */
function srt(cenas) {
  const hhmmss = (s) => {
    const ms = Math.round((s % 1) * 1000);
    const total = Math.floor(s);
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const seg = String(total % 60).padStart(2, "0");
    return `${h}:${m}:${seg},${String(ms).padStart(3, "0")}`;
  };

  const LARGURA = 42;
  const MAX = LARGURA * 2;

  /** Quebra a fala em blocos legíveis, cada um com o instante das suas
   *  palavras. `marcas` vem de lib/voz.mjs, em tempo da cena. */
  function blocos(texto, marcas) {
    const palavras = texto.split(/\s+/).filter(Boolean);
    const saida = [];
    let atual = [];
    let iniIdx = 0;
    palavras.forEach((w, i) => {
      atual.push(w);
      const corrido = atual.join(" ");
      const pontua = /[.,;:!?]$/.test(w);
      const ultima = i === palavras.length - 1;
      // fecha no fim, ao estourar a largura, ou numa pontuação que já
      // rendeu texto suficiente para o bloco não ficar ralo
      if (ultima || corrido.length >= MAX || (pontua && corrido.length >= LARGURA)) {
        const a = marcas[Math.min(iniIdx, marcas.length - 1)];
        const b = marcas[Math.min(i, marcas.length - 1)];
        saida.push({ texto: corrido, ini: a?.ini ?? 0, fim: b?.fim ?? 0 });
        atual = [];
        iniIdx = i + 1;
      }
    });
    return saida;
  }

  /** Duas linhas equilibradas, não uma linha cheia e uma sobra. */
  function duasLinhas(texto) {
    if (texto.length <= LARGURA) return texto;
    const palavras = texto.split(" ");
    let melhor = texto;
    let menorDiferenca = Infinity;
    for (let k = 1; k < palavras.length; k += 1) {
      const a = palavras.slice(0, k).join(" ");
      const b = palavras.slice(k).join(" ");
      if (a.length > LARGURA + 6 || b.length > LARGURA + 6) continue;
      const d = Math.abs(a.length - b.length);
      if (d < menorDiferenca) {
        menorDiferenca = d;
        melhor = `${a}\n${b}`;
      }
    }
    return melhor;
  }

  const cues = [];
  let t = 0;
  cenas.forEach((c) => {
    const texto = (c.narracao ?? c.titulo ?? c.corpo ?? "")
      .replace(/\[\[|\]\]/g, "")
      .replace(/[\n\u00a0]/g, " ")
      .trim();
    if (texto) {
      const marcas = c._voz?.palavras;
      if (marcas?.length) {
        for (const b of blocos(texto, marcas)) {
          cues.push({ ini: t + b.ini, fim: t + b.fim + 0.22, texto: b.texto });
        }
      } else {
        // cena sem narração sintetizada (render --sem-voz): o tempo da cena
        // é tudo o que existe, e é melhor que legenda nenhuma
        cues.push({ ini: t + 0.15, fim: t + c.t - 0.1, texto });
      }
    }
    t += c.t;
  });

  // nenhuma legenda pisa na seguinte
  for (let i = 0; i < cues.length - 1; i += 1) {
    cues[i].fim = Math.min(cues[i].fim, cues[i + 1].ini - 0.04);
  }

  return cues
    .map(
      (q, i) =>
        `${String(i + 1)}\n${hhmmss(q.ini)} --> ${hhmmss(q.fim)}\n${duasLinhas(q.texto)}\n`,
    )
    .join("\n");
}

/** Semente estável a partir de um texto — o mesmo conceito, a mesma música. */
function semente(texto) {
  let h = 2166136261;
  for (const ch of texto) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 997;
}

function rodar(cmd, argv, entrada) {
  return new Promise((ok, falha) => {
    const p = spawn(cmd, argv, { stdio: [entrada ? "pipe" : "ignore", "pipe", "pipe"] });
    let saida = "";
    let erro = "";
    p.stdout.on("data", (d) => (saida += String(d)));
    p.stderr.on("data", (d) => (erro += String(d)));
    p.on("error", falha);
    p.on("close", (code) =>
      code === 0 ? ok(saida.trim()) : falha(new Error(`${cmd} saiu com ${String(code)}: ${erro}`)),
    );
  });
}

const pasta = join(KIT, "source/roteiros");
const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".json")).sort();
const roteiros = [];
for (const f of arquivos) {
  const bruto = JSON.parse(await readFile(join(pasta, f), "utf8"));
  /* DECISÃO: o cartão final mostra a prova (nota e anos) junto do WhatsApp,
     no instante em que a pessoa decide. Vem de src/lib/jp.ts como todo
     número do kit; um roteiro pode trocar ou desligar com "prova": "". */
  const final = bruto.cenas.at(-1);
  if (final?.selo && final.prova === undefined)
    final.prova = "{{avaliacoes.notaBR}} no Google · {{historia.anos}} anos de história";
  const r = resolverTokens(bruto, f);
  r._fonte = join(pasta, f);
  if (alvos.length === 0 || alvos.some((a) => r.id === a || f.includes(a))) roteiros.push(r);
}
if (roteiros.length === 0) {
  console.error(`Nenhum roteiro casou com: ${alvos.join(", ")}`);
  process.exit(1);
}
// Com alvos na linha de comando, a ORDEM deles vale: é assim que se renderiza
// primeiro o que vai ser publicado primeiro.
if (alvos.length) {
  const posicao = (r) => alvos.findIndex((a) => r.id === a || r._fonte.includes(a));
  roteiros.sort((a, b) => posicao(a) - posicao(b));
}

const servidor = await servirRaiz(RAIZ);

/* O PALCO É DESCARTÁVEL. Um Chromium que captura 20 mil quadros seguidos
   acumula memória até cair — e antes desta função, uma queda no vídeo 2
   derrubava os 32 seguintes. Agora o navegador é reaberto a cada 6 vídeos por
   precaução, e reaberto na hora quando cai, com nova tentativa do vídeo que
   estava no meio. */
let navegador = null;
let pagina = null;
async function abrirPalco() {
  if (navegador) await navegador.close().catch(() => {});
  navegador = await abrirNavegador(LEVE ? { args: ["--num-raster-threads=1"] } : {});
  const contexto = await navegador.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    locale: "pt-BR",
  });
  pagina = await contexto.newPage();
  pagina.on("pageerror", (err) => {
    console.error(`  erro de página: ${err.message}`);
  });
  await pagina.goto(`${servidor.url}/social/instagram/source/templates/video.html`, {
    waitUntil: "networkidle",
  });
}

await mkdir(join(KIT, "exports/reels"), { recursive: true });
await mkdir(join(KIT, "exports/ads"), { recursive: true });
const TMP = join(tmpdir(), "jp-social-video");
await mkdir(TMP, { recursive: true });

const relatorio = [];
const avisosGerais = [];

/** Folha de contato dos --quadros: 6 por linha, com o instante embaixo. */
const PY_FOLHA = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
cfg = json.load(open(sys.argv[1], encoding="utf-8"))
W, H, R = 300, 533, 30
fonte = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 20)
fotos = cfg["fotos"]
cols = min(6, len(fotos))
linhas = (len(fotos) + cols - 1) // cols
folha = Image.new("RGB", (cols * (W + 8), linhas * (H + R + 8)), (40, 40, 40))
d = ImageDraw.Draw(folha)
for i, f in enumerate(fotos):
    x, y = (i % cols) * (W + 8), (i // cols) * (H + R + 8)
    folha.paste(Image.open(f["arq"]).convert("RGB").resize((W, H), Image.LANCZOS), (x, y))
    d.text((x + 6, y + H + 4), f["rotulo"], fill=(230, 230, 230), font=fonte)
folha.save(cfg["saida"])
`;

async function renderizar(r) {
  const fps = PREVIA ? 6 : (r.fps ?? 30);
  const destinoPasta = join(KIT, r.anuncio ? "exports/ads" : "exports/reels");
  const destino = join(destinoPasta, `${r.arquivo}.mp4`);
  const mudo = join(TMP, `${r.arquivo}.mudo.mp4`);
  const wav = join(TMP, `${r.arquivo}.wav`);
  const cfgTrilha = join(TMP, `${r.arquivo}.trilha.json`);

  /* 0. VOZ, ANTES DE TUDO. A narração é sintetizada primeiro porque é ela que
     define quanto dura cada cena — `aplicarVoz` reescreve `t` cena a cena e
     devolve o instante de cada palavra, que o motor usa para acender a
     legenda no quadro certo. Render antes da voz seria escolher o tempo no
     chute e depois torcer para a frase caber. */
  let voz = null;
  if (!SEM_VOZ) {
    voz = await aplicarVoz(r, TMP, { voz: r.voz ?? VOZ });
    console.log(`  voz: ${String(voz.camadas.length)} falas · ${voz.voz}`);
  }

  const info = await pagina.evaluate((rot) => window.prepararVideo(rot), r);
  const totalQuadros = Math.round(info.duracao * fps);

  console.log(
    `\n▸ ${r.id} — ${r.titulo}\n  ${info.duracao.toFixed(1)}s · ${String(info.cenas)} cenas · ` +
      `${String(totalQuadros)} quadros @ ${String(fps)}fps · ${String(info.eventos.length)} eventos
  ` +
      `${String(info.batidas)} batidas visuais · uma a cada ${info.ritmo.toFixed(1)}s`,
  );
  /* Viúva: a última palavra de uma linha do título quebrando sozinha para a
     linha de baixo. "Freguesia do / Ó." passou por uma revisão inteira antes
     de alguém ver o "Ó." pendurado num anúncio. */
  const viuvas = await pagina.evaluate(() => {
    const achadas = [];
    for (const h of document.querySelectorAll("h2.vh")) {
      let linha = [];
      const fecha = () => {
        const [pen, ult] = linha.length > 1 ? linha.slice(-2) : [];
        if (pen && ult.offsetTop > pen.offsetTop) {
          const letras = ult.textContent.replace(/[^\p{L}\p{N}]/gu, "");
          const frase = [...h.querySelectorAll(".w")].map((w) => w.textContent).join(" ");
          if (letras.length <= 4)
            achadas.push(`"${frase}" — "${ult.textContent}" sozinha na última linha`);
        }
        linha = [];
      };
      for (const n of h.childNodes) {
        if (n.nodeName === "BR") fecha();
        else if (n.nodeType === 1 && n.classList.contains("w")) linha.push(n);
      }
      fecha();
    }
    // "Freguesia do / Ó" partido no meio do corpo de texto: o nome do bairro
    // não pode quebrar entre o "do" e o "Ó".
    const passo = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = passo.nextNode(); n; n = passo.nextNode()) {
      for (const m of n.data.matchAll(/\bdo[ \u00a0]Ó/gu)) {
        const topo = (a, b) => {
          const r = document.createRange();
          r.setStart(n, a);
          r.setEnd(n, b);
          return r.getBoundingClientRect().top;
        };
        if (topo(m.index + 3, m.index + 4) - topo(m.index, m.index + 2) > 2)
          achadas.push(`"${n.data.trim()}" — quebra entre "do" e "Ó"`);
      }
    }
    // Área segura do Reel: em cima, nome do perfil e áudio; embaixo, legenda
    // e botões. Nada do conteúdo da cena pode passar de 280 px ou 1452 px.
    const palcoTopo = document.getElementById("palco").getBoundingClientRect().top;
    document.querySelectorAll(".cena").forEach((cena, k) => {
      const filhos = [...cena.querySelectorAll(".conteudo > *")];
      if (!filhos.length) return;
      const topo = Math.min(...filhos.map((f) => f.getBoundingClientRect().top)) - palcoTopo;
      const base = Math.max(...filhos.map((f) => f.getBoundingClientRect().bottom)) - palcoTopo;
      if (topo < 280 || base > 1452)
        achadas.push(
          `cena ${String(k + 1)} sai da área segura (${String(Math.round(topo))}–${String(Math.round(base))} px)`,
        );
    });
    return achadas;
  });
  info.avisos.push(...viuvas.map((v) => `layout: ${v}`));

  for (const a of info.avisos) {
    console.log(`  ⚠ ${a}`);
    avisosGerais.push(`${r.id}: ${a}`);
  }
  if (CONFERIR) return;

  if (QUADROS) {
    const tempos =
      QUADROS === "todos"
        ? Array.from({ length: Math.floor(info.duracao / 0.5) + 1 }, (_, k) => k * 0.5)
        : QUADROS;
    const pastaQ = join(TMP, "quadros", r.id);
    await rm(pastaQ, { recursive: true, force: true });
    await mkdir(pastaQ, { recursive: true });
    const fotos = [];
    for (const tq of tempos) {
      await pagina.evaluate((tt) => window.quadro(tt), tq);
      const arq = join(pastaQ, `t${tq.toFixed(2).padStart(6, "0")}.png`);
      await pagina.screenshot({ path: arq });
      fotos.push({ arq, rotulo: `${tq.toFixed(2)}s` });
    }
    const folha = join(TMP, "quadros", `${r.id}.png`);
    await writeFile(join(pastaQ, "folha.json"), JSON.stringify({ fotos, saida: folha }), "utf8");
    await rodar("python", ["-c", PY_FOLHA, join(pastaQ, "folha.json")]);
    console.log(`  ▣ ${folha}`);
    return;
  }

  // 1. IMAGEM
  const ff = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-i",
      "-",
      /* COR. Os quadros chegam do navegador em RGB de faixa cheia. Sem dizer
         nada, o x264 grava `yuvj420p` com a etiqueta `bt470bg` — faixa cheia
         e colorimetria de PAL standard definition, num vídeo vertical de
         1080p para web. Player que honra a etiqueta acerta; player que a
         ignora mostra o verde da marca estourado e o creme sujo.

         Aqui a conversão é explícita — RGB cheio para YUV limitado, matriz
         bt709 — e o arquivo sai ETIQUETADO com o que realmente é. É o que o
         Instagram, o Facebook e todo player de 2026 esperam receber. */
      "-vf",
      "scale=in_range=pc:out_range=tv:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv420p",
      /* As quatro etiquetas vão por `-x264opts`, não pelas flags soltas do
         ffmpeg: nesta build (8.0.1) `-color_primaries` e `-color_trc` são
         aceitos sem erro e simplesmente NÃO chegam ao VUI do H.264 — o
         arquivo sai com primaries e transfer "unknown". Testado lado a lado
         antes de trocar. */
      "-x264opts",
      "colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off",
      "-c:v",
      "libx264",
      "-preset",
      PREVIA ? "veryfast" : LEVE ? "medium" : "slow",
      "-crf",
      PREVIA ? "28" : "17",
      "-profile:v",
      "high",
      "-level",
      "4.1",
      "-r",
      String(fps),
      ...(LEVE ? ["-threads", "2"] : []),
      mudo,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const fimFF = new Promise((ok, falha) => {
    ff.on("close", (code) =>
      code === 0 ? ok() : falha(new Error(`ffmpeg saiu com ${String(code)}`)),
    );
    ff.on("error", falha);
  });

  const t0 = Date.now();
  let leitura = lerCpu();
  let pico = 0;
  let freadas = 0;
  try {
    for (let f = 0; f < totalQuadros; f += 1) {
      await pagina.evaluate((tt) => window.quadro(tt), f / fps);
      const buf = await pagina.screenshot({ type: "jpeg", quality: 94 });
      if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once("drain", ok));
      // O FREIO: mede a CPU da máquina inteira e respira quando passa do teto.
      if (LEVE && f % PASSO_FREIO === 0 && f > 0) {
        const agora = lerCpu();
        const uso = usoEntre(leitura, agora);
        leitura = agora;
        pico = Math.max(pico, uso);
        if (uso > TETO_CPU) {
          freadas += 1;
          await dormir(1500);
          leitura = lerCpu();
        }
      }
      if (f % 120 === 0 && f > 0) {
        process.stdout.write(`  ${String(Math.round((f / totalQuadros) * 100))}%\r`);
      }
    }
  } catch (err) {
    // sem isto, o ffmpeg fica vivo esperando quadros que não vêm mais
    ff.kill();
    await fimFF.catch(() => {});
    throw err;
  }
  ff.stdin.end();
  await fimFF;

  // 2. SOM
  let linhaTrilha = "sem trilha";
  if (MUDO) {
    await rodar("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      mudo,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      destino,
    ]);
  } else {
    const conceito = r.trilha ?? (r.anuncio ? String(r.id).split("-")[0] : r.id);
    await writeFile(
      cfgTrilha,
      JSON.stringify({
        duracao: info.duracao,
        drop: info.drop,
        cta: info.cta,
        eventos: info.eventos,
        semente: semente(conceito),
      }),
      "utf8",
    );
    linhaTrilha = await rodar("python", [join(AQUI, "trilha.py"), cfgTrilha, wav]);

    // 3. JUNÇÃO
    /* Sem voz é o caso simples: vídeo + trilha. Com voz, a trilha deixa de ser
       a faixa e passa a ser a cadeia abaixada PELA voz — ver lib/voz.mjs. */
    if (voz && voz.camadas.length) {
      const entradas = ["-i", mudo, "-i", wav];
      for (const c of voz.camadas) entradas.push("-i", c.arquivo);
      await rodar("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        ...entradas,
        "-filter_complex",
        filtroMixagem(voz.camadas, r.teto),
        "-map",
        "0:v:0",
        "-map",
        "[saida]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-shortest",
        "-movflags",
        "+faststart",
        destino,
      ]);
      linhaTrilha += ` · voz ${voz.voz.replace(/Neural$/, "")}`;
    } else {
      await rodar("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        mudo,
        "-i",
        wav,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        destino,
      ]);
    }
  }

  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  const freio = LEVE
    ? ` · CPU pico ${String(Math.round(pico * 100))}%, ${String(freadas)} freada(s)`
    : "";
  console.log(`  ✓ ${r.arquivo}.mp4  (${seg}s) · ${linhaTrilha}${freio}`);

  await writeFile(join(destinoPasta, `${r.arquivo}.srt`), srt(r.cenas), "utf8");
  relatorio.push({
    id: r.id,
    arquivo: `${r.arquivo}.mp4`,
    duracao: info.duracao,
    fps,
    trilha: linhaTrilha,
  });
  await rm(mudo, { force: true });
  await rm(wav, { force: true });
  await rm(cfgTrilha, { force: true });
}

/** MP4 mais novo que o roteiro, o motor e a trilha: não há o que refazer. */
const FONTES_DO_MOTOR = [join(KIT, "source/templates/video.html"), join(AQUI, "trilha.py")];
async function pronto(r) {
  const destino = join(KIT, r.anuncio ? "exports/ads" : "exports/reels", `${r.arquivo}.mp4`);
  try {
    const feito = (await stat(destino)).mtimeMs;
    for (const f of [r._fonte, ...FONTES_DO_MOTOR]) {
      if ((await stat(f)).mtimeMs > feito) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const falhas = [];
if (!LEVE) await abrirPalco();
for (const [n, r] of roteiros.entries()) {
  if (PULAR && (await pronto(r))) {
    console.log(`· ${r.id} já está pronto`);
    continue;
  }
  // No leve, um Chromium novo por vídeo — e fechado logo depois.
  if (LEVE) {
    await esperarCpu(TETO_PARA_ABRIR);
    await abrirPalco();
  } else if (n > 0 && n % 6 === 0 && !CONFERIR) await abrirPalco();
  let feito = false;
  for (let tentativa = 1; tentativa <= 3 && !feito; tentativa += 1) {
    try {
      await renderizar(r);
      feito = true;
    } catch (err) {
      console.log(
        `\n  ✗ ${r.id}, tentativa ${String(tentativa)}: ${String(err.message).split("\n")[0]}`,
      );
      await abrirPalco();
    }
  }
  if (!feito) falhas.push(r.id);
  if (LEVE && !CONFERIR) {
    await navegador?.close().catch(() => {});
    navegador = null;
    if (n < roteiros.length - 1) await dormir(PAUSA_ENTRE_VIDEOS * 1000);
  }
}

await navegador?.close().catch(() => {});
await servidor.fechar();

await writeFile(
  join(KIT, "source/ultimo-render-video.json"),
  `${JSON.stringify({ previa: PREVIA, mudo: MUDO, videos: relatorio, avisos: avisosGerais }, null, 2)}\n`,
  "utf8",
);
console.log(`\n${String(relatorio.length)} vídeo(s) gerado(s).`);
if (falhas.length) {
  console.log(`✗ ${String(falhas.length)} falharam depois de 3 tentativas: ${falhas.join(", ")}`);
  process.exitCode = 1;
}
if (avisosGerais.length)
  console.log(`${String(avisosGerais.length)} aviso(s) de tempo de leitura.`);
