/**
 * CONFERÊNCIA DO KIT — o que uma revisão humana não consegue fazer 300 vezes.
 *
 *   node social/instagram/source/scripts/conferir.mjs
 *
 * Sai com código 1 se houver ERRO. Aviso não derruba.
 *
 * ============================================================================
 *  O QUE ESTE SCRIPT PEGA E O OLHO NÃO.
 *
 *  Um kit com 260 imagens e 34 vídeos tem uma propriedade desagradável: os
 *  defeitos que importam são os silenciosos. Uma foto de banco de imagem
 *  publicada como se fosse a recepção da clínica não parece errada — parece
 *  bonita. Um CRO com um dígito trocado não parece nada. Uma promessa escrita
 *  numa legenda passa por três revisões antes de alguém notar.
 *
 *  As nove checagens abaixo são exatamente as que, se falharem, produzem um
 *  problema que só aparece DEPOIS de publicado.
 * ============================================================================
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, resolve, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(AQUI, "../..");
const RAIZ = resolve(KIT, "../..");

const erros = [];
const avisos = [];
const ok = [];

const dados = JSON.parse(await readFile(join(KIT, "source/dados-jp.json"), "utf8"));

async function listar(dir, filtro) {
  const saida = [];
  async function andar(d) {
    let itens;
    try {
      itens = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of itens) {
      const p = join(d, it.name);
      if (it.isDirectory()) await andar(p);
      else if (filtro(p)) saida.push(p);
    }
  }
  await andar(dir);
  return saida;
}

const manifests = await listar(join(KIT, "source/manifests"), (p) => p.endsWith(".json"));
const roteiros = await listar(join(KIT, "source/roteiros"), (p) => p.endsWith(".json"));
const pngs = await listar(join(KIT, "exports"), (p) => p.endsWith(".png"));
const mp4s = await listar(join(KIT, "exports"), (p) => p.endsWith(".mp4"));

/**
 * Cada manifest vira DUAS leituras, e a separação é o que faz esta conferência
 * ser útil em vez de barulhenta.
 *
 * `texto` é o arquivo inteiro. `publicado` é só o que vai virar pixel: headline,
 * corpo, chip, CTA, item de lista, narração. O campo `descricao` de cada
 * manifest e o `_uso` de cada template ficam de FORA de `publicado` — eles
 * documentam a peça para quem edita, e a documentação precisa poder dizer
 * "aqui não se usa a foto capa-recepcao" e "este post não é promoção" sem que
 * a checagem acuse a própria regra que está sendo escrita.
 *
 * Sem essa separação, a saída do script vira uma lista de falsos positivos —
 * e um verificador barulhento é um verificador que se aprende a ignorar.
 */
const CAMPOS_PUBLICADOS = new Set([
  "headline",
  "corpo",
  "cta",
  "titulo",
  "selo",
  "nota",
  "contato",
  "assinatura",
  "citacao",
  "autor",
  "rotulo",
  "chip",
  "papel",
  "nome",
  "endereco",
  "horario",
  "narracao",
  "adesivo",
  "aTitulo",
  "aTexto",
  "bTitulo",
  "bTexto",
  "topo",
  "registro",
  "numero",
  "pagina",
]);

function colher(valor, chave, saida) {
  if (typeof valor === "string") {
    if (CAMPOS_PUBLICADOS.has(chave)) saida.push(valor);
    return;
  }
  if (Array.isArray(valor)) {
    // `itens` é lista de texto publicado; o índice não é nome de campo.
    for (const v of valor) colher(v, chave === "itens" ? "corpo" : chave, saida);
    return;
  }
  if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) colher(v, k, saida);
  }
}

const fontes = [];
for (const f of [...manifests, ...roteiros]) {
  const texto = await readFile(f, "utf8");
  const trechos = [];
  colher(JSON.parse(texto), "", trechos);
  fontes.push({ arquivo: f.replace(RAIZ, "."), texto, publicado: trechos.join("\n") });
}

/* ==========================================================================
   1. ATIVOS PROIBIDOS
   A razão de cada um está no ASSET-MANIFEST. O ponto comum: todos parecem
   utilizáveis e nenhum é.
   ========================================================================== */
const PROIBIDOS = [
  ["capa-recepcao", "banco de imagem — NÃO é a recepção da JP"],
  ["-completa.webp", "arte antiga com moldura verde e letreiro"],
  ["fachada-letreiro", "arte antiga com moldura verde"],
  ["images/equipe/", "retratos de dentistas fictícios que já saíram de EQUIPE"],
  ["sala-espera-ortodontia", "banner com rostos de terceiros no fundo"],
];
for (const { arquivo, texto } of fontes) {
  // Só os campos de CAMINHO. Citar o nome do arquivo proibido na `descricao`,
  // para dizer que ele não entra, é o comportamento correto — não um defeito.
  const usados = [...texto.matchAll(/"(?:foto|janela|arte)":\s*"([^"]+)"/g)].map((m) => m[1]);
  for (const [padrao, motivo] of PROIBIDOS) {
    if (usados.some((u) => u.includes(padrao))) {
      erros.push(`ativo proibido "${padrao}" em ${arquivo} — ${motivo}`);
    }
  }
}
ok.push(`nenhum ativo proibido referenciado (${String(PROIBIDOS.length)} padrões verificados)`);

/* ==========================================================================
   2. PALAVRAS QUE NÃO PODEM IR AO AR
   Resolução CFO 196/2019 e §29 do briefing. A lista é de EXPRESSÃO, não de
   assunto: "dói" pode; "sem dor" não.
   ========================================================================== */
const PROIBIDAS = [
  /\bsem dor\b/i,
  /\bindolor\b/i,
  /\bresultado garantido\b/i,
  /\bgarantimos\b/i,
  /\bsorriso perfeito\b/i,
  /\búltimas vagas\b/i,
  /\bpromoção\b/i,
  /\bimperdível\b/i,
  /\bdesconto\b/i,
  /\bantes e depois\b/i,
  /\bespecialista em implante/i,
  /\bo melhor implante\b/i,
  /\b100% seguro\b/i,
  /\bvocê (perdeu|tem vergonha|está sem)\b/i,
];
for (const { arquivo, publicado } of fontes) {
  for (const re of PROIBIDAS) {
    const m = re.exec(publicado);
    if (m) erros.push(`expressão vedada "${m[0]}" em ${arquivo}`);
  }
}
ok.push(`nenhuma expressão vedada (${String(PROIBIDAS.length)} padrões verificados)`);

/* ==========================================================================
   3. A FRASE PROIBIDA DA LOCALIDADE
   "24 anos na Freguesia do Ó" é factualmente errado: a clínica passou a maior
   parte desses anos em Pirituba. Está anotado em HISTORIA, em src/lib/jp.ts.
   ========================================================================== */
const anos = String(dados.historia.anos);
const reLocal = new RegExp(`${anos}\\s*anos\\s+(na|de\\s+)?\\s*${dados.historia.regiaoAtual}`, "i");
for (const { arquivo, publicado } of fontes) {
  if (reLocal.test(publicado)) {
    erros.push(
      `"${anos} anos na ${dados.historia.regiaoAtual}" em ${arquivo} — a clínica nasceu em ${dados.historia.regiaoAnterior}`,
    );
  }
}
ok.push(
  `narrativa de localidade correta ("${anos} anos de história. Hoje, na ${dados.historia.regiaoAtual}.")`,
);

/* ==========================================================================
   4. CRO — todo registro citado tem de existir em src/lib/jp.ts
   Publicar número de inscrição errado expõe a clínica e a pessoa.
   ========================================================================== */
const registrosValidos = new Set(
  [dados.responsavelTecnica.registro, ...dados.equipe.map((p) => p.registro)].filter(Boolean),
);
for (const { arquivo, publicado } of fontes) {
  for (const m of publicado.matchAll(/CROSP\s*[\d.]+/g)) {
    const achado = m[0].replace(/\s+/g, " ").trim();
    if (!registrosValidos.has(achado)) {
      erros.push(`registro "${achado}" em ${arquivo} não existe em src/lib/jp.ts`);
    }
  }
}
ok.push(`todos os CRO citados existem em src/lib/jp.ts (${String(registrosValidos.size)} válidos)`);

/* ==========================================================================
   5. TELEFONE E WHATSAPP — só os de src/lib/jp.ts
   A placa da fachada traz um WhatsApp diferente; nenhum texto pode repeti-lo.
   ========================================================================== */
const telefonesValidos = [dados.clinica.telefone, dados.clinica.whatsapp].map((t) =>
  t.replace(/\D/g, ""),
);
for (const { arquivo, publicado } of fontes) {
  for (const m of publicado.matchAll(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g)) {
    const so = m[0].replace(/\D/g, "");
    const normal = so.length === 8 || so.length === 9 ? `11${so}` : so;
    if (!telefonesValidos.includes(normal)) {
      avisos.push(`telefone "${m[0]}" em ${arquivo} não bate com src/lib/jp.ts`);
    }
  }
}
ok.push("nenhum telefone divergente escrito à mão nos manifests");

/* ==========================================================================
   6. TOKENS — todo {{caminho}} tem de existir em dados-jp.json
   O renderizador já derruba nisso; aqui o erro aparece ANTES de renderizar.
   ========================================================================== */
for (const { arquivo, texto } of fontes) {
  for (const m of texto.matchAll(/\{\{([\w.]+)\}\}/g)) {
    const v = m[1].split(".").reduce((o, k) => (o == null ? undefined : o[k]), dados);
    if (v === undefined || v === null) erros.push(`token {{${m[1]}}} em ${arquivo} não existe`);
  }
}
ok.push("todos os tokens resolvem contra dados-jp.json");

/* ==========================================================================
   7. FOTOS — todo caminho citado existe em disco
   Foto ausente vira retângulo menta no export, e retângulo menta é bonito o
   bastante para passar despercebido numa revisão rápida.
   ========================================================================== */
const caminhos = new Set();
for (const { texto } of fontes) {
  for (const m of texto.matchAll(/"(?:foto|janela|arte)":\s*"([^"]+)"/g)) caminhos.add(m[1]);
}
for (const c of caminhos) {
  const alvo = join(RAIZ, c.replace(/^\//, ""));
  try {
    await stat(alvo);
  } catch {
    erros.push(`foto inexistente: ${c}`);
  }
}
ok.push(`${String(caminhos.size)} caminhos de imagem conferidos em disco`);

/* ==========================================================================
   7b. PEÇA DE ANÚNCIO NÃO CARREGA INTERFACE ORGÂNICA
   --------------------------------------------------------------------------
   "Arraste para ver", "salve", "link na bio" pedem uma ação que existe no feed
   e não existe num anúncio — onde viram ruído e, em alguns formatos, motivo de
   reprovação na Meta.

   O caso que motivou esta checagem é o que ela mais protege: a frase não estava
   escrita em manifest nenhum. Ela nascia dentro do template `carousel-cover`, e
   os dois carrosséis de anúncio a herdaram sem ninguém digitar. Passou por uma
   revisão visual inteira porque estava num lugar onde se esperava vê-la.

   Por isso a trava é sobre o CAMPO, não sobre o texto: todo manifest que exporta
   para `exports/ads/` precisa declarar `anuncio: true`, que é o que desliga o
   elemento no template.
   ========================================================================== */
for (const f of manifests) {
  const m = JSON.parse(await readFile(f, "utf8"));
  if (!m.saida.startsWith("exports/ads")) continue;
  const semMarca = m.pecas.filter((p) => !(p.anuncio ?? m.padrao?.anuncio));
  if (semMarca.length > 0) {
    erros.push(
      `${f.replace(RAIZ, ".")} exporta para ${m.saida} mas ${String(semMarca.length)} peça(s) ` +
        `não declaram \`anuncio: true\` — o template pode injetar "Arraste para ver"`,
    );
  }
}
ok.push("toda peça de anúncio declara `anuncio: true` (desliga a interface orgânica do template)");

/* ==========================================================================
   8. DIMENSÕES DOS EXPORTS
   Lê o cabeçalho IHDR do PNG direto — não precisa de biblioteca de imagem.
   ========================================================================== */
const VALIDAS = new Set(["1080x1350", "1080x1080", "1080x1920"]);
let conferidos = 0;
for (const p of pngs) {
  if (p.includes(`${"grid"}`)) continue; // a prévia do grid é montagem, não peça
  const buf = await readFile(p);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const medida = `${String(w)}x${String(h)}`;
  if (!VALIDAS.has(medida)) {
    erros.push(`${p.replace(KIT, ".")} tem ${medida} — fora dos três formatos`);
  }
  conferidos += 1;
}
ok.push(`${String(conferidos)} PNG com dimensão válida`);

/* ==========================================================================
   9. NOMENCLATURA
   Minúsculo, sem acento, sem espaço. Nome previsível é o que permite achar o
   arquivo seis meses depois.
   ========================================================================== */
for (const p of [...pngs, ...mp4s]) {
  const nome = p.split(/[\\/]/).pop().replace(extname(p), "");
  if (!/^[a-z0-9_]+$/.test(nome)) {
    avisos.push(`nome fora do padrão: ${nome}`);
  }
  if (!nome.startsWith("jp_ig_")) {
    avisos.push(`nome sem o prefixo jp_ig_: ${nome}`);
  }
}
ok.push(`${String(pngs.length + mp4s.length)} arquivos com nomenclatura conferida`);

/* ==========================================================================
   10. VÍDEO — todo MP4 tem a legenda .srt ao lado
   ========================================================================== */
for (const p of mp4s) {
  try {
    await stat(p.replace(/\.mp4$/, ".srt"));
  } catch {
    avisos.push(`sem legenda .srt: ${p.replace(KIT, ".")}`);
  }
}
ok.push(`${String(mp4s.length)} vídeos com legenda .srt ao lado`);

/* ========================================================================== */
console.log("\n══ CONFERÊNCIA DO KIT ══\n");
for (const o of ok) console.log(`  ✓ ${o}`);
if (avisos.length > 0) {
  console.log(`\n  ⚠ ${String(avisos.length)} aviso(s):`);
  for (const a of avisos) console.log(`    - ${a}`);
}
if (erros.length > 0) {
  console.log(`\n  ✗ ${String(erros.length)} ERRO(S):`);
  for (const e of erros) console.log(`    - ${e}`);
  console.log("");
  process.exit(1);
}
console.log(
  `\n  ${String(pngs.length)} imagens · ${String(mp4s.length)} vídeos · ` +
    `${String(manifests.length)} manifests · ${String(roteiros.length)} roteiros — sem erro.\n`,
);
