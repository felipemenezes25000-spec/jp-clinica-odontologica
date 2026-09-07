/**
 * Migra o acervo do disco local (.data/rh) para o Supabase.
 *
 * Uso:
 *   node --env-file=.env scripts/migrar-para-supabase.mjs [--conferir] [--forcar]
 *
 *   --conferir  não escreve nada; só compara os dois lados e mostra o que falta
 *   --forcar    reenvia tudo, inclusive o que já está lá
 *
 * É RETOMÁVEL e IDEMPOTENTE: as tabelas usam upsert pela chave primária e o
 * Storage usa x-upsert. Rodar duas vezes não duplica ninguém.
 *
 * ANTES DE RODAR: cole supabase/01-schema.sql no SQL Editor do projeto. Sem as
 * tabelas, este script para no primeiro registro com uma mensagem explicando.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.RH_DATA_DIR ?? path.join(RAIZ, ".data", "rh");

const URL_BASE = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const CHAVE = process.env.SUPABASE_SERVICE_ROLE ?? "";
const BUCKET = process.env.SUPABASE_BUCKET ?? "curriculos";

const conferir = process.argv.includes("--conferir");
const forcar = process.argv.includes("--forcar");

if (!URL_BASE || !CHAVE) {
  console.error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE no .env.");
  process.exit(1);
}

const cab = (extra = {}) => ({ apikey: CHAVE, Authorization: "Bearer " + CHAVE, ...extra });

const MIMES = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/* -------------------------------------------------------------------------- */

async function api(caminho, opcoes = {}) {
  const r = await fetch(URL_BASE + caminho, { ...opcoes, headers: cab(opcoes.headers ?? {}) });
  if (!r.ok) {
    const corpo = (await r.text()).slice(0, 400);
    if (r.status === 404 && corpo.includes("does not exist")) {
      throw new Error(
        "As tabelas ainda não existem. Cole supabase/01-schema.sql no SQL Editor do Supabase e rode uma vez.\n" +
          corpo,
      );
    }
    throw new Error(r.status + " em " + caminho + ": " + corpo);
  }
  return r;
}

async function lerJson(arquivo) {
  try {
    return JSON.parse(await readFile(arquivo, "utf8"));
  } catch {
    return null;
  }
}

async function listarArquivos(dir) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

async function idsExistentes(tabela) {
  const r = await api("/rest/v1/" + tabela + "?select=id");
  return new Set((await r.json()).map((l) => l.id));
}

async function enviarLinhas(tabela, linhas) {
  if (!linhas.length) return;
  // Em lotes: um POST com 53 objetos é uma transação só e uma viagem só.
  for (let i = 0; i < linhas.length; i += 25) {
    await api("/rest/v1/" + tabela, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(linhas.slice(i, i + 25)),
    });
  }
}

/* -------------------------------------------------------------------------- */

console.log("Origem : " + BASE);
console.log("Destino: " + URL_BASE + (conferir ? "   (modo conferência, não escreve)" : ""));
console.log("");

const resumo = {
  candidaturas: 0,
  vagas: 0,
  guias: 0,
  arquivos: 0,
  bytes: 0,
  pulados: 0,
  erros: [],
};

/* ---- CANDIDATURAS ---- */
const dirCand = path.join(BASE, "candidaturas");
const arqCand = await listarArquivos(dirCand);
const jaTem = forcar ? new Set() : await idsExistentes("rh_candidaturas");

const linhasCand = [];
for (const f of arqCand) {
  const d = await lerJson(path.join(dirCand, f));
  if (!d?.id) continue;
  if (jaTem.has(d.id)) {
    resumo.pulados++;
    continue;
  }
  linhasCand.push({ id: d.id, dados: d, criado_em: d.criadoEm || new Date().toISOString() });
}
console.log(
  "Candidaturas: " +
    arqCand.length +
    " no disco, " +
    linhasCand.length +
    " a enviar, " +
    resumo.pulados +
    " já lá",
);
if (!conferir) await enviarLinhas("rh_candidaturas", linhasCand);
resumo.candidaturas = linhasCand.length;

/* ---- VAGAS ---- */
const dirVagas = path.join(BASE, "vagas");
const arqVagas = await listarArquivos(dirVagas);
const jaVagas = forcar ? new Set() : await idsExistentes("rh_vagas");
const linhasVagas = [];
for (const f of arqVagas) {
  const d = await lerJson(path.join(dirVagas, f));
  if (!d?.id || jaVagas.has(d.id)) continue;
  linhasVagas.push({ id: d.id, dados: d, criado_em: d.criadoEm || new Date().toISOString() });
}
console.log("Vagas: " + arqVagas.length + " no disco, " + linhasVagas.length + " a enviar");
if (!conferir) await enviarLinhas("rh_vagas", linhasVagas);
resumo.vagas = linhasVagas.length;

/* ---- GUIAS (podem ainda não existir) ---- */
const dirGuias = path.join(BASE, "guias");
const arqGuias = await listarArquivos(dirGuias);
if (arqGuias.length) {
  const jaGuias = forcar ? new Set() : await idsExistentes("rh_guias");
  const linhasGuias = [];
  for (const f of arqGuias) {
    const d = await lerJson(path.join(dirGuias, f));
    if (!d?.id || jaGuias.has(d.id)) continue;
    linhasGuias.push({ id: d.id, dados: d, criado_em: d.criadoEm || new Date().toISOString() });
  }
  console.log("Guias: " + arqGuias.length + " no disco, " + linhasGuias.length + " a enviar");
  if (!conferir) await enviarLinhas("rh_guias", linhasGuias);
  resumo.guias = linhasGuias.length;
}

/* ---- CONFIGURAÇÕES ---- */
const config = await lerJson(path.join(BASE, "configuracoes.json"));
if (config && !conferir) {
  await api("/rest/v1/rh_chave_valor", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify([{ chave: "configuracoes", dados: config }]),
  });
  console.log("Configurações: enviadas");
}

/* ---- CONTADOR DE PROTOCOLO ---- */
const contador = await lerJson(path.join(BASE, "contador.json"));
if (contador && !conferir) {
  const linhas = Object.entries(contador).map(([ano, ultimo]) => ({
    ano: Number(ano),
    ultimo: Number(ultimo),
  }));
  if (linhas.length) {
    await api("/rest/v1/rh_protocolos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(linhas),
    });
    console.log(
      "Contador de protocolo: " +
        linhas.map((l) => l.ano + "=" + l.ultimo).join(", ") +
        " (o próximo continua de onde parou)",
    );
  }
}

/* ---- CURRÍCULOS NO STORAGE ---- */
console.log("");
const dirCurr = path.join(BASE, "curriculos");
let pastas = [];
try {
  pastas = await readdir(dirCurr);
} catch {
  /* sem currículos */
}

for (const [i, pasta] of pastas.entries()) {
  const dirPasta = path.join(dirCurr, pasta);
  let arquivos = [];
  try {
    if (!(await stat(dirPasta)).isDirectory()) continue;
    arquivos = await readdir(dirPasta);
  } catch {
    continue;
  }
  for (const nome of arquivos) {
    const completo = path.join(dirPasta, nome);
    const bytes = await readFile(completo);
    const mime = MIMES[path.extname(nome).toLowerCase()] ?? "application/octet-stream";
    const rotulo =
      (i + 1 + "/" + pastas.length).padStart(7) + "  " + (pasta + "/" + nome).slice(0, 58);
    if (conferir) {
      console.log(rotulo + "  (conferência)");
      continue;
    }
    try {
      const r = await fetch(URL_BASE + "/storage/v1/object/" + BUCKET + "/" + pasta + "/" + nome, {
        method: "POST",
        headers: cab({ "content-type": mime, "x-upsert": "true" }),
        body: bytes,
      });
      if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 160));
      resumo.arquivos++;
      resumo.bytes += bytes.length;
      console.log(rotulo + "  ok");
    } catch (e) {
      resumo.erros.push(pasta + "/" + nome + ": " + String(e).slice(0, 160));
      console.log(rotulo + "  FALHOU");
    }
  }
}

/* ---- CONFERÊNCIA FINAL ---- */
console.log("\n" + "=".repeat(70));
const rc = await api("/rest/v1/rh_candidaturas?select=id", { headers: { Prefer: "count=exact" } });
const totalRemoto = (await rc.json()).length;
const listaBucket = await fetch(URL_BASE + "/storage/v1/object/list/" + BUCKET, {
  method: "POST",
  headers: cab({ "content-type": "application/json" }),
  body: JSON.stringify({ prefix: "", limit: 1000 }),
});
const pastasRemotas = listaBucket.ok ? (await listaBucket.json()).length : "?";

console.log("RESUMO");
console.log(
  "  Candidaturas enviadas : " + resumo.candidaturas + " (puladas: " + resumo.pulados + ")",
);
console.log("  Vagas enviadas        : " + resumo.vagas);
console.log("  Guias enviados        : " + resumo.guias);
console.log(
  "  Currículos enviados   : " +
    resumo.arquivos +
    " (" +
    (resumo.bytes / 1048576).toFixed(1) +
    " MB)",
);
console.log("  ─────");
console.log("  Candidaturas no Supabase : " + totalRemoto);
console.log("  Pastas no bucket         : " + pastasRemotas);
if (resumo.erros.length) {
  console.log("\nFALHAS");
  for (const e of resumo.erros) console.log("  - " + e);
}
console.log(
  "\nPróximo passo: troque RH_STORAGE=fs por RH_STORAGE=supabase no .env (e cadastre as\n" +
    "variáveis na Vercel em Settings > Environment Variables).",
);
