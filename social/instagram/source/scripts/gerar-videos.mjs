/**
 * GERADOR DE VÍDEO — roteiros JSON  →  MP4 1080×1920 prontos para publicar.
 *
 *   node social/instagram/source/scripts/gerar-videos.mjs           # todos
 *   node social/instagram/source/scripts/gerar-videos.mjs R01 R04   # só esses
 *   node social/instagram/source/scripts/gerar-videos.mjs --previa  # 1 fps, teste
 *
 * ============================================================================
 *  POR QUE ESTES VÍDEOS EXISTEM, E O QUE ELES NÃO SÃO.
 *
 *  Metade do conteúdo de um perfil de clínica é a dentista falando para a
 *  câmera, e isso depende de gravar — de agenda, de luz, de alguém disponível.
 *  A outra metade não depende: "implante dói?" é uma pergunta que se responde
 *  com palavra na tela e foto do consultório real.
 *
 *  Estes MP4 são a segunda metade, prontos hoje. Eles NÃO substituem o rosto da
 *  equipe: o SHOT-LIST existe justamente para a versão com gente entrar depois,
 *  e cada roteiro traz o texto palavra por palavra para ser lido na câmera.
 *
 *  SEM ÁUDIO, e de propósito. Trilha licenciada não pode ser embutida num
 *  arquivo que a clínica vai distribuir, e áudio sintetizado soa a apresentação
 *  de PowerPoint. O caminho certo é escolher o som DENTRO do Instagram, onde a
 *  licença é da plataforma e o áudio em alta ainda ajuda o alcance. As versões
 *  de anúncio saem com uma faixa muda de verdade (AAC silencioso) porque alguns
 *  players do Gerenciador de Anúncios engasgam com arquivo sem trilha de áudio.
 * ============================================================================
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { servirRaiz } from "./lib/servidor.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(AQUI, "../..");
const RAIZ = resolve(KIT, "../..");

const args = process.argv.slice(2);
const PREVIA = args.includes("--previa");
const alvos = args.filter((a) => !a.startsWith("--"));

const dados = JSON.parse(await readFile(join(KIT, "source/dados-jp.json"), "utf8"));

function resolverTokens(v, onde) {
  if (typeof v === "string") {
    return v.replace(/\{\{([\w.]+)\}\}/g, (_, c) => {
      const x = c.split(".").reduce((o, k) => (o == null ? undefined : o[k]), dados);
      if (x === undefined || x === null) throw new Error(`token {{${c}}} inexistente em ${onde}`);
      return String(x);
    });
  }
  if (Array.isArray(v)) return v.map((i) => resolverTokens(i, onde));
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, i]) => [k, resolverTokens(i, onde)]));
  }
  return v;
}

/** Legenda .srt derivada do próprio roteiro — a mesma frase que está na tela. */
function srt(cenas) {
  const hhmmss = (s) => {
    const ms = Math.round((s % 1) * 1000);
    const total = Math.floor(s);
    const h = String(Math.floor(total / 3600)).padStart(2, "0");
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
    const seg = String(total % 60).padStart(2, "0");
    return `${h}:${m}:${seg},${String(ms).padStart(3, "0")}`;
  };
  let t = 0;
  const linhas = [];
  cenas.forEach((c, i) => {
    const texto = (c.narracao ?? c.titulo ?? c.corpo ?? "")
      .replace(/\[\[|\]\]/g, "")
      .replace(/\n/g, " ")
      .trim();
    if (texto) {
      linhas.push(
        `${String(linhas.length + 1)}\n${hhmmss(t + 0.15)} --> ${hhmmss(t + c.t - 0.1)}\n${texto}\n`,
      );
    }
    t += c.t;
  });
  return `${linhas.join("\n")}`;
}

const pasta = join(KIT, "source/roteiros");
const arquivos = (await readdir(pasta)).filter((f) => f.endsWith(".json")).sort();
const roteiros = [];
for (const f of arquivos) {
  const r = resolverTokens(JSON.parse(await readFile(join(pasta, f), "utf8")), f);
  if (alvos.length === 0 || alvos.some((a) => r.id === a || f.includes(a))) roteiros.push(r);
}
if (roteiros.length === 0) {
  console.error(`Nenhum roteiro casou com: ${alvos.join(", ")}`);
  process.exit(1);
}

const servidor = await servirRaiz(RAIZ);
const navegador = await chromium.launch();
const contexto = await navegador.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
  locale: "pt-BR",
});
const pagina = await contexto.newPage();
pagina.on("pageerror", (err) => {
  console.error(`  erro de página: ${err.message}`);
});
await pagina.goto(`${servidor.url}/social/instagram/source/templates/video.html`, {
  waitUntil: "networkidle",
});

const saidaBase = join(KIT, "exports/reels");
await mkdir(saidaBase, { recursive: true });
await mkdir(join(KIT, "exports/ads"), { recursive: true });

const relatorio = [];

for (const r of roteiros) {
  const fps = PREVIA ? 6 : (r.fps ?? 30);
  const destinoPasta = r.anuncio ? join(KIT, "exports/ads") : saidaBase;
  const destino = join(destinoPasta, `${r.arquivo}.mp4`);

  const info = await pagina.evaluate((rot) => window.prepararVideo(rot), r);
  const totalQuadros = Math.round(info.duracao * fps);

  console.log(
    `\n▸ ${r.id} — ${r.titulo}\n  ${info.duracao.toFixed(1)}s · ${String(info.cenas)} cenas · ` +
      `${String(totalQuadros)} quadros @ ${String(fps)}fps`,
  );

  const argsFF = ["-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-"];
  if (r.anuncio) {
    // Faixa muda real: compatibilidade com o player do Gerenciador de Anúncios.
    argsFF.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");
  }
  argsFF.push(
    "-vf",
    "format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    PREVIA ? "veryfast" : "slow",
    "-crf",
    PREVIA ? "28" : "18",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
  );
  if (r.anuncio) argsFF.push("-c:a", "aac", "-b:a", "96k", "-shortest");
  argsFF.push(destino);

  const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...argsFF], {
    stdio: ["pipe", "inherit", "inherit"],
  });
  const fimFF = new Promise((ok, falha) => {
    ff.on("close", (code) => (code === 0 ? ok() : falha(new Error(`ffmpeg saiu com ${code}`))));
    ff.on("error", falha);
  });

  const t0 = Date.now();
  for (let f = 0; f < totalQuadros; f += 1) {
    const t = f / fps;
    await pagina.evaluate((tt) => window.quadro(tt), t);
    const buf = await pagina.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once("drain", ok));
    if (f % 120 === 0 && f > 0) {
      process.stdout.write(`  ${String(Math.round((f / totalQuadros) * 100))}%\r`);
    }
  }
  ff.stdin.end();
  await fimFF;

  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  ✓ ${r.arquivo}.mp4  (${seg}s de render)`);

  await writeFile(join(destinoPasta, `${r.arquivo}.srt`), srt(r.cenas), "utf8");
  relatorio.push({ id: r.id, arquivo: `${r.arquivo}.mp4`, duracao: info.duracao, fps });
}

await navegador.close();
await servidor.fechar();

await writeFile(
  join(KIT, "source/ultimo-render-video.json"),
  `${JSON.stringify({ previa: PREVIA, videos: relatorio }, null, 2)}\n`,
  "utf8",
);
console.log(`\n${String(relatorio.length)} vídeo(s) gerado(s).`);
