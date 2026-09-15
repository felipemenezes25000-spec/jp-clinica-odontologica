/**
 * DOCUMENTOS DE CONTEÚDO — manifests e roteiros  →  content/*.md
 *
 *   node social/instagram/source/scripts/gerar-docs.mjs
 *
 * Por que isto é gerado e não escrito.
 *
 * Os roteiros e os manifests são a fonte: é deles que saem o MP4 e o PNG. Um
 * documento de leitura escrito à mão ao lado deles vira, na terceira edição, a
 * versão que discorda do que foi publicado — e é ele que a pessoa vai imprimir
 * para gravar, porque é ele que dá para ler.
 *
 * Gerar resolve isso: quem muda a headline no manifest e roda os dois comandos
 * publica a peça nova e o documento novo. Quem muda só o Markdown não muda nada,
 * e descobre isso na próxima geração.
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(AQUI, "../..");

const dados = JSON.parse(await readFile(join(KIT, "source/dados-jp.json"), "utf8"));

const tk = (s) =>
  typeof s === "string"
    ? s.replace(/\{\{([\w.]+)\}\}/g, (_, c) => {
        const v = c.split(".").reduce((o, k) => (o == null ? undefined : o[k]), dados);
        return v === undefined ? `{{${c}}}` : String(v);
      })
    : s;

/** Texto de peça → texto de documento: tira a marcação de layout. */
const limpo = (s) =>
  tk(s ?? "")
    .replace(/\[\[|\]\]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\n/g, " ")
    .trim();

async function carregar(pasta) {
  const arquivos = (await readdir(join(KIT, pasta))).filter((f) => f.endsWith(".json")).sort();
  const saida = [];
  for (const f of arquivos) {
    saida.push({ nome: f, dados: JSON.parse(await readFile(join(KIT, pasta, f), "utf8")) });
  }
  return saida;
}

const roteiros = await carregar("source/roteiros");
const manifests = await carregar("source/manifests");

const cabecalho = (titulo, aviso) =>
  `# ${titulo}\n\n> ⚙️ **Documento gerado.** Não edite este arquivo: ele é reescrito por ` +
  `\`node social/instagram/source/scripts/gerar-docs.mjs\`. ${aviso}\n`;

/* ==========================================================================
   REELS
   ========================================================================== */
{
  const reels = roteiros.filter((r) => !r.dados.anuncio);
  let md = cabecalho("Reels — roteiros", "A fonte é `source/roteiros/*.json`.");
  md +=
    `\nSão **${String(reels.length)} Reels**, todos já renderizados em ` +
    `\`exports/reels/\`. Cada um tem o MP4, a legenda \`.srt\` e a capa 9:16 ` +
    `em \`exports/reel-covers/\`.\n\n` +
    "A coluna **narração** é o texto para ler na câmera quando a versão com " +
    "a equipe for gravada — ela é a mesma frase que está na tela, e é também " +
    "o conteúdo do arquivo `.srt`.\n\n---\n";

  for (const { dados: r } of reels) {
    const dur = r.cenas.reduce((s, c) => s + c.t, 0);
    md += `\n## ${r.id} — ${limpo(r.titulo)}\n\n`;
    md += `| | |\n| --- | --- |\n`;
    md += `| **Arquivo** | \`exports/reels/${r.arquivo}.mp4\` |\n`;
    md += `| **Capa** | \`exports/reel-covers/jp_ig_reel_${r.id.toLowerCase()}_cover_v01.png\` |\n`;
    md += `| **Legenda** | \`exports/reels/${r.arquivo}.srt\` |\n`;
    md += `| **Duração** | ${dur.toFixed(1)} s · ${String(r.cenas.length)} cenas · ${String(r.fps)} fps |\n`;
    md += `| **Pilar** | ${r.pilar} |\n`;
    md += `| **Objetivo** | ${r.objetivo} |\n`;
    md += `| **Caption** | ver \`CAPTIONS.md\` → ${r.id} |\n\n`;

    let t = 0;
    md += `| Tempo | Na tela | Narração (versão com a equipe) |\n| --- | --- | --- |\n`;
    for (const c of r.cenas) {
      const ini = t.toFixed(1);
      t += c.t;
      const tela = [
        c.chip ? `**${limpo(c.chip)}**` : "",
        c.titulo ? limpo(c.titulo) : "",
        c.corpo ? `_${limpo(c.corpo)}_` : "",
        ...(c.itens ?? []).map((i) => `• ${limpo(i)}`),
        c.selo ? `\`${limpo(c.selo)}\`` : "",
      ]
        .filter(Boolean)
        .join("<br>");
      md += `| ${ini}–${t.toFixed(1)} s | ${tela} | ${limpo(c.narracao)} |\n`;
    }
    md += "\n";
  }
  await mkdir(join(KIT, "content/reels"), { recursive: true });
  await writeFile(join(KIT, "content/reels/REELS.md"), md, "utf8");
  console.log(`content/reels/REELS.md — ${String(reels.length)} roteiros`);
}

/* ==========================================================================
   ANÚNCIOS EM VÍDEO
   ========================================================================== */
{
  const ads = roteiros.filter((r) => r.dados.anuncio);
  let md = cabecalho("Anúncios em vídeo — roteiros", "A fonte é `source/roteiros/AD-*.json`.");
  md +=
    `\nSão **${String(ads.length)} vídeos**: 6 conceitos × 3 hooks. Dentro de cada ` +
    "conceito, o corpo e o CTA são **idênticos** — só o gancho muda. É isso que " +
    "permite concluir alguma coisa do teste.\n\nRegras de campanha, UTM e " +
    "segmentação: [`PAID-MEDIA.md`](../../PAID-MEDIA.md).\n\n---\n";

  for (const { dados: r } of ads) {
    const dur = r.cenas.reduce((s, c) => s + c.t, 0);
    md += `\n## ${r.id} — ${limpo(r.titulo)}\n\n`;
    md += `\`exports/ads/${r.arquivo}.mp4\` · ${dur.toFixed(1)} s · \`utm_content=${r.utm_content}\`\n\n`;
    let t = 0;
    md += `| Tempo | Na tela |\n| --- | --- |\n`;
    for (const c of r.cenas) {
      const ini = t.toFixed(1);
      t += c.t;
      const tela = [
        c.chip ? `**${limpo(c.chip)}**` : "",
        c.titulo ? limpo(c.titulo) : "",
        c.corpo ? `_${limpo(c.corpo)}_` : "",
        ...(c.itens ?? []).map((i) => `• ${limpo(i)}`),
        c.selo ? `\`${limpo(c.selo)}\`` : "",
      ]
        .filter(Boolean)
        .join("<br>");
      md += `| ${ini}–${t.toFixed(1)} s | ${tela} |\n`;
    }
    md += "\n";
  }
  await mkdir(join(KIT, "content/ads"), { recursive: true });
  await writeFile(join(KIT, "content/ads/ADS.md"), md, "utf8");
  console.log(`content/ads/ADS.md — ${String(ads.length)} roteiros`);
}

/* ==========================================================================
   AS PEÇAS ESTÁTICAS, POR GRUPO
   ========================================================================== */
const GRUPOS = [
  {
    destino: "content/carousels/CARROSSEIS.md",
    titulo: "Carrosséis — slide a slide",
    filtro: (m) => m.grupo.startsWith("car-"),
  },
  {
    destino: "content/statics/ESTATICOS.md",
    titulo: "Estáticos e cards de equipe",
    filtro: (m) => ["estaticos", "equipe"].includes(m.grupo),
  },
  {
    destino: "content/highlights/DESTAQUES.md",
    titulo: "Destaques — capas e cartões",
    filtro: (m) => m.grupo === "destaques" || m.grupo.startsWith("dst-"),
  },
  {
    destino: "content/stories/STORIES.md",
    titulo: "Templates de Story",
    filtro: (m) => m.grupo === "story-templates",
  },
  {
    destino: "content/pinned/FIXADOS.md",
    titulo: "Posts fixados",
    filtro: (m) => m.grupo.startsWith("car-pin"),
  },
];

for (const g of GRUPOS) {
  const alvo = manifests.filter((m) => g.filtro(m.dados));
  let md = cabecalho(g.titulo, "A fonte é `source/manifests/*.json`.");
  for (const { nome, dados: m } of alvo) {
    md += `\n---\n\n## ${m.grupo}\n\n`;
    md += `\`source/manifests/${nome}\` → \`${m.saida}/\` · ${String(m.pecas.length)} peças\n\n`;
    md += `> ${m.descricao}\n\n`;
    md += `| Arquivo | Chip | Texto | Apoio |\n| --- | --- | --- | --- |\n`;
    for (const p of m.pecas) {
      const texto = [p.headline, p.titulo, p.nome, p.rotulo].filter(Boolean).map(limpo).join(" / ");
      const apoio = [
        p.corpo ? limpo(p.corpo) : "",
        p.nota ? limpo(p.nota) : "",
        p.papel ? limpo(p.papel) : "",
        p.registro ? limpo(p.registro) : "",
        p.citacao ? `"${limpo(p.citacao)}"` : "",
        ...(p.itens ?? []).map((i) => `• ${limpo(i)}`),
        p.cta ? `**CTA:** ${limpo(p.cta)}` : "",
        p.adesivo ? `_${limpo(p.adesivo)}_` : "",
        p._uso ? `📌 ${p._uso}` : "",
      ]
        .filter(Boolean)
        .join("<br>");
      md += `| \`${p.arquivo}\` | ${p.chip ? limpo(p.chip) : "—"} | ${texto || "—"} | ${apoio || "—"} |\n`;
    }
  }
  await mkdir(join(KIT, dirname(g.destino)), { recursive: true });
  await writeFile(join(KIT, g.destino), md, "utf8");
  console.log(`${g.destino} — ${String(alvo.length)} manifests`);
}

/* ==========================================================================
   ORGÂNICO × PAGO — §52 do briefing
   --------------------------------------------------------------------------
   A classificação é DERIVADA, não digitada peça a peça. O motivo é o de
   sempre neste kit: um rótulo escrito à mão em 300 peças envelhece na
   primeira vez que alguém acrescenta "salve este post" a uma legenda e
   esquece de trocar a etiqueta — e aí um criativo com CTA orgânico sobe como
   anúncio, que em alguns formatos é motivo de reprovação na Meta.

   A regra abaixo lê o que a peça REALMENTE diz:

     PAID_FIRST        nasceu para anúncio (sai em exports/ads/)
     ORGANIC_ONLY      tem elemento de interface orgânica no texto publicado —
                       adesivo de Story, "arraste", "salve", "caixinha",
                       "comenta", "link na bio". Esses termos pedem uma ação
                       que só existe no feed; num anúncio são ruído.
     ORGANIC_AND_PAID  o resto: funciona nos dois lugares sem alteração.
   ========================================================================== */
{
  /* A lista é de VERBOS DE INTERFACE, e cada exclusão tem motivo.
     "marque" ficou de fora: em texto de clínica ele quer dizer AGENDAR
     ("marque o seu retorno"), não marcar alguém num comentário — e incluí-lo
     classificava dois CTAs perfeitamente anunciáveis como orgânicos.
     "mito ou verdade" também saiu: é formato de conteúdo, não pedido de
     interação; quando ele vem com enquete, o campo `adesivo` já denuncia. */
  const RE_ORGANICO =
    /\b(salve|salva|arraste|arrasta|caixinha|enquete|comenta|comente|responda aqui|manda para|envie para|segue a gente)\b|link na bio|marque nos coment/i;

  const classificar = (pago, textoPublicado, temAdesivo) => {
    if (pago) return "PAID_FIRST";
    if (temAdesivo || RE_ORGANICO.test(textoPublicado)) return "ORGANIC_ONLY";
    return "ORGANIC_AND_PAID";
  };

  const linhas = [];
  const contagem = { PAID_FIRST: 0, ORGANIC_ONLY: 0, ORGANIC_AND_PAID: 0 };

  for (const { dados: r } of roteiros) {
    const texto = r.cenas
      .flatMap((c) => [c.chip, c.titulo, c.corpo, c.selo, ...(c.itens ?? [])])
      .filter(Boolean)
      .join(" ");
    const cls = classificar(Boolean(r.anuncio), texto, false);
    contagem[cls] += 1;
    linhas.push({
      cls,
      grupo: r.anuncio ? "anúncio em vídeo" : "reel",
      arquivo: `${r.arquivo}.mp4`,
      o: limpo(r.titulo),
    });
  }

  for (const { dados: m } of manifests) {
    const pago = m.grupo.startsWith("ads-");
    for (const p of m.pecas) {
      const texto = [p.chip, p.headline, p.corpo, p.cta, p.nota, p.contato, ...(p.itens ?? [])]
        .filter(Boolean)
        .join(" ");
      const cls = classificar(pago, texto, Boolean(p.adesivo));
      contagem[cls] += 1;
      linhas.push({
        cls,
        grupo: m.grupo,
        arquivo: `${p.arquivo}.png`,
        o: limpo(p.headline ?? p.nome ?? p.rotulo ?? ""),
      });
    }
  }

  let md = cabecalho(
    "Orgânico × pago — classificação por peça",
    "A fonte são os manifests e roteiros; a regra está no topo de `gerar-docs.mjs`.",
  );
  md +=
    "\nA classificação é **derivada do texto de cada peça**, não digitada. " +
    "Uma peça vira `ORGANIC_ONLY` no instante em que alguém escreve “salve”, " +
    "“arraste” ou “caixinha” nela — sem ninguém precisar lembrar de trocar " +
    "uma etiqueta.\n\n" +
    `| Classificação | Peças | O que significa |\n| --- | --- | --- |\n` +
    `| \`PAID_FIRST\` | ${String(contagem.PAID_FIRST)} | nasceu para anúncio |\n` +
    `| \`ORGANIC_ONLY\` | ${String(contagem.ORGANIC_ONLY)} | tem elemento de interface orgânica; **não subir como anúncio** |\n` +
    `| \`ORGANIC_AND_PAID\` | ${String(contagem.ORGANIC_AND_PAID)} | funciona nos dois sem alteração |\n\n`;

  for (const cls of ["PAID_FIRST", "ORGANIC_ONLY", "ORGANIC_AND_PAID"]) {
    md += `\n---\n\n## ${cls} — ${String(contagem[cls])} peças\n\n`;
    md += `| Grupo | Arquivo | Conteúdo |\n| --- | --- | --- |\n`;
    for (const l of linhas.filter((x) => x.cls === cls)) {
      md += `| ${l.grupo} | \`${l.arquivo}\` | ${l.o || "—"} |\n`;
    }
  }

  await writeFile(join(KIT, "content/ORGANICO-X-PAGO.md"), md, "utf8");
  console.log(
    `content/ORGANICO-X-PAGO.md — ${String(linhas.length)} peças ` +
      `(${String(contagem.PAID_FIRST)} pago, ${String(contagem.ORGANIC_ONLY)} só orgânico, ` +
      `${String(contagem.ORGANIC_AND_PAID)} ambos)`,
  );
}
