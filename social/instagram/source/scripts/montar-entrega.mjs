/**
 * PASTA DE ENTREGA — exports/  →  ENTREGA/  +  ENTREGA-INSTAGRAM-JP.zip
 *
 *   node social/instagram/source/scripts/montar-entrega.mjs
 *   node social/instagram/source/scripts/montar-entrega.mjs --copiar-para "C:/Users/Felipe/Downloads"
 *
 * A pasta segue AO PÉ DA LETRA o documento da clínica
 * `social/instagram/ORDEM_DE_PUBLICACAO_JP.md` (18/09/2026): os nomes das
 * pastas, o que existe dentro de cada uma e a ordem. Quem abre o zip não
 * precisa do repositório para saber o que fazer: a pasta É a instrução.
 *
 *   POSTAR/       01_REEL_Conheca-a-JP … 22_POST_Sorrir-muda-tudo
 *                 Reel: VIDEO.mp4 + CAPA.png + LEGENDA.txt
 *                 Carrossel: 01.png, 02.png… + LEGENDA.txt
 *                 Post e card de equipe: POST.png + LEGENDA.txt
 *   DESTAQUES/    01_A-Clinica … 10_Onde-estamos
 *                 CAPA.png (a capa da bolinha) + os cartões numerados
 *
 * Fora do documento, e por isso em pastas próprias que não se misturam com as
 * duas acima: FOTO-DE-PERFIL, STORIES, ANUNCIOS e PROXIMO-MES.
 *
 * ============================================================================
 *  AS REGRAS DA PASTA, E O PORQUÊ DE CADA UMA.
 *
 *  1. O DOCUMENTO É CONFERIDO, NÃO SÓ SEGUIDO. Depois de montar, o script lê
 *     cada pasta de POSTAR/ e DESTAQUES/ do disco e compara com a lista exata
 *     de arquivos que o documento pede. Arquivo sobrando ou faltando: FALHA.
 *
 *  2. NO MÁXIMO 10 IMAGENS POR PASTA — exceto onde o documento pede mais
 *     (Implantes e Dúvidas, nos Destaques, têm 14 por decisão da clínica).
 *
 *  3. NOMES SEM ACENTO. O compactador do Windows grava o nome na página de
 *     código local, e "Próteses" chega como "PrÃ³teses" do outro lado. O texto
 *     das legendas mantém acento: ele é publicado. Sai em UTF-8 com BOM para o
 *     Bloco de Notas abrir certo.
 *
 *  4. CAPA NÃO É POST. A capa do Reel mora dentro da pasta do Reel; a capa do
 *     Destaque, dentro da pasta do Destaque. Nenhuma das duas tem pasta de feed.
 * ============================================================================
 */
import { readdir, mkdir, copyFile, rm, writeFile, readFile, stat, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve, join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(AQUI, "../..");
const EX = join(KIT, "exports");
const ENTREGA = join(KIT, "ENTREGA");
const NOME_ZIP = "ENTREGA-INSTAGRAM-JP.zip";
const DOC_ORDEM = "ORDEM_DE_PUBLICACAO_JP.md";
const iCopiar = process.argv.indexOf("--copiar-para");
const COPIAR_PARA = iCopiar > 0 ? process.argv[iCopiar + 1] : null;
const BOM = String.fromCharCode(0xfeff);

const dados = JSON.parse(await readFile(join(KIT, "source/dados-jp.json"), "utf8"));

/* ==========================================================================
   LEGENDAS — lidas de CAPTIONS.md, hashtags de HASHTAGS-LOCAL.md
   ========================================================================== */
const captionsMd = await readFile(join(KIT, "CAPTIONS.md"), "utf8");
const hashtagsMd = await readFile(join(KIT, "HASHTAGS-LOCAL.md"), "utf8");

const primeiroBloco = (trecho) => /```text\r?\n([\s\S]*?)\r?\n```/.exec(trecho)?.[1] ?? null;

const HASHTAGS = {};
for (const parte of hashtagsMd.split(/\n### /).slice(1)) {
  const nome = /^`\[(\w+)\]`/.exec(parte)?.[1];
  const bloco = primeiroBloco(parte);
  if (nome && bloco) HASHTAGS[nome] = bloco.trim().toLowerCase();
}

const LEGENDAS = {};
for (const parte of captionsMd.split(/\n## /).slice(1)) {
  const id = /^([A-Z]+ ?\d+)/.exec(parte)?.[1];
  const bloco = primeiroBloco(parte);
  if (id && bloco) LEGENDAS[id] = bloco;
}

function legenda(id) {
  const texto = LEGENDAS[id];
  if (!texto) throw new Error(`legenda "${id}" não encontrada em CAPTIONS.md`);
  return texto.replace(/\[(\w+)\]/g, (m, nome) => HASHTAGS[nome] ?? m);
}

/** Legenda de card de equipe: o modelo de CAPTIONS.md com a pessoa real. */
function legendaEquipe(p) {
  const reg = p.registro ? ` — ${p.registro}` : "";
  return [
    "Quem atende você na JP tem nome e registro.",
    "",
    `${p.nome}${reg}`,
    p.papel,
    "",
    'Conheça a equipe inteira no Destaque "Equipe".',
    "",
    `${dados.clinica.endereco.logradouro} — ${dados.clinica.endereco.bairro}, região da ${dados.historia.regiaoAtual}.`,
    "",
    [HASHTAGS.MARCA, HASHTAGS.LOCAL, HASHTAGS.CLINICA].join(" "),
  ].join("\n");
}
const pessoa = (nome) => {
  if (nome === "juliana") return dados.responsavelTecnica;
  if (nome === "jeferson")
    return { nome: dados.gestor.nome, papel: `${dados.gestor.papel} · ${dados.gestor.formacao}` };
  return dados.equipe.find((p) => p.nome.toLowerCase().includes(nome));
};

/* ==========================================================================
   O DOCUMENTO DA CLÍNICA, EM DADOS
   ========================================================================== */

/* §1 e §2 — as 22 publicações. [pasta, título no calendário, forma, fonte, legenda]
   Forma: R = Reel (número do roteiro), C = carrossel (pasta em exports/carousel),
   P = post ou card (arquivo em exports/feed). */
const POSTAR = [
  ["01_REEL_Conheca-a-JP", "Reel “Conheça a JP por dentro”", "R", 11, "PIN 01"],
  [
    "02_CARROSSEL_Implantes-na-JP",
    "Carrossel “Implantes na JP: começa pela avaliação”",
    "C",
    "pin02-implantes-na-jp",
    "PIN 02",
  ],
  [
    "03_CARROSSEL_24-anos",
    "Carrossel “24 anos / prova de confiança”",
    "C",
    "pin03-prova-de-confianca",
    "PIN 03",
  ],
  ["04_REEL_Implante-doi", "Reel “Implante dói?”", "R", 1, "R01"],
  ["05_POST_Aqui-comeca-o-cuidado", "Post da recepção", "P", "jp_ig_feed_s04_recepcao_v01", "S04"],
  ["06_REEL_Perdeu-um-dente", "Reel “Perdeu um dente. E agora?”", "R", 5, "R05"],
  [
    "07_POST_Avaliacoes-Google",
    "Post de avaliações do Google",
    "P",
    "jp_ig_feed_s03_google_v01",
    "S03",
  ],
  [
    "08_POST_Todas-as-fases-da-vida",
    "Post “Odontologia para todas as fases da vida”",
    "P",
    "jp_ig_feed_s11_todas_as_fases_v01",
    "S11",
  ],
  [
    "09_CARROSSEL_5-duvidas-sobre-implantes",
    "Carrossel “5 dúvidas sobre implantes”",
    "C",
    "c01-duvidas-implantes",
    "C01",
  ],
  [
    "10_POST_Equipe-Ana-Beatriz",
    "Card Dra. Ana Beatriz",
    "P",
    "jp_ig_feed_equipe_ana_beatriz_v01",
    "S06",
  ],
  [
    "11_REEL_Implante-precisa-de-enxerto",
    "Reel “Todo implante precisa de enxerto?”",
    "R",
    3,
    "R03",
  ],
  [
    "12_POST_Implantes-dentarios",
    "Post “Implantes dentários”",
    "P",
    "jp_ig_feed_s09_implantes_v01",
    "S09",
  ],
  ["13_REEL_Primeira-avaliacao", "Reel “Como é a primeira avaliação?”", "R", 13, "R13"],
  [
    "14_CARROSSEL_Como-funciona-a-avaliacao",
    "Carrossel “Como funciona a avaliação”",
    "C",
    "c04-como-e-a-avaliacao",
    "C04",
  ],
  [
    "15_POST_24-anos-na-Freguesia",
    "Post “24 anos de história. Hoje, na Freguesia do Ó”",
    "P",
    "jp_ig_feed_s08_freguesia_v01",
    "S08",
  ],
  ["16_REEL_Dentadura-e-a-unica-opcao", "Reel “Dentadura é a única opção?”", "R", 2, "R02"],
  [
    "17_POST_Equipe-Matheus-Fraga",
    "Card Dr. Matheus Fraga",
    "P",
    "jp_ig_feed_equipe_matheus_fraga_v01",
    "equipe:matheus",
  ],
  ["18_REEL_Aparelho-ou-alinhador", "Reel “Aparelho ou alinhador?”", "R", 14, "R14"],
  [
    "19_CARROSSEL_Dentadura-x-protocolo",
    "Carrossel “Dentadura x protocolo”",
    "C",
    "c03-dentadura-x-protocolo",
    "C03",
  ],
  [
    "20_POST_Esterilizacao",
    "Post “A sala que ninguém mostra”",
    "P",
    "jp_ig_feed_s05_estrutura_v01",
    "S05",
  ],
  ["21_REEL_24-anos-em-30-segundos", "Reel “24 anos em 30 segundos”", "R", 16, "R16"],
  [
    "22_POST_Sorrir-muda-tudo",
    "Post “Sorrir muda tudo”",
    "P",
    "jp_ig_feed_s01_sorrir_muda_tudo_v01",
    "S01",
  ],
];
const FIXADOS = 3; // §4 — os três primeiros

/* §2 — início na segunda, 21/09/2026, um conteúdo por dia útil. */
const INICIO = Date.UTC(2026, 8, 21);
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const FERIADOS = {
  "12/10/2026":
    "é feriado nacional (Nossa Senhora Aparecida). Dá para agendar antes pelo Instagram.",
};
const dd = (n) => String(n).padStart(2, "0");
const CALENDARIO = [];
for (let t = INICIO; CALENDARIO.length < POSTAR.length; t += 86400000) {
  const d = new Date(t);
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
  const data = `${dd(d.getUTCDate())}/${dd(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear())}`;
  CALENDARIO.push({ data, dia: DIAS[d.getUTCDay()], feriado: FERIADOS[data] ?? null });
}
// O documento fixa a primeira e a última data. Se a conta divergir, o calendário
// impresso na pasta estaria errado — melhor parar aqui.
if (CALENDARIO[0].data !== "21/09/2026" || CALENDARIO.at(-1).data !== "20/10/2026") {
  throw new Error(
    `calendário não bate com o documento: ${CALENDARIO[0].data} a ${CALENDARIO.at(-1).data}`,
  );
}

/* §5 e §6 — os Destaques. [pasta, pasta em exports/highlights, prefixo, capa da bolinha, cartões]
   CAPA.png é a capa da bolinha (a imagem que se escolhe em "Editar capa"), pelo
   mesmo raciocínio da capa do Reel: não é Story nem post. O cartão de abertura
   "01_capa" dos exports fica de fora — o documento não tem posição para ele. */
const DESTAQUES = [
  [
    "01_A-Clinica",
    "clinica",
    "clinica",
    "clinica",
    [
      ["01_Fachada", "02_fachada"],
      ["02_Recepcao", "03_recepcao"],
      ["03_Sala-de-espera", "04_espera"],
      ["04_Consultorio-1", "05_consultorio1"],
      ["05_Consultorio-2", "06_consultorio2"],
      ["06_Esterilizacao", "07_esterilizacao"],
      ["07_Equipamento", "08_equipamento"],
      ["08_Horario", "09_horario"],
      ["09_CTA", "10_cta"],
    ],
  ],
  [
    "02_Implantes",
    "implantes",
    "implantes",
    "implantes",
    [
      ["01_O-que-e", "02_oque"],
      ["02_Quando", "03_quando"],
      ["03_Avaliacao", "04_avaliacao"],
      ["04_Plano", "05_plano"],
      ["05_Etapas", "06_etapas"],
      ["06_Implante-doi", "07_doi"],
      ["07_Enxerto", "08_enxerto"],
      ["08_Tempo", "09_tempo"],
      ["09_Cuidados", "10_cuidados"],
      ["10_Unitario", "11_unitario"],
      ["11_Multiplos", "12_multiplos"],
      ["12_Protese", "13_protese"],
      ["13_CTA", "14_cta"],
    ],
  ],
  [
    "03_Proteses",
    "proteses",
    "proteses",
    "proteses",
    [
      ["01_Tipos", "02_tipos"],
      ["02_Finalidade", "03_finalidade"],
      ["03_Removivel", "04_removivel"],
      ["04_Fixa", "05_fixa"],
      ["05_Protocolo", "06_protocolo"],
      ["06_Manutencao", "07_manutencao"],
      ["07_Avaliacao", "08_avaliacao"],
      ["08_CTA", "09_cta"],
    ],
  ],
  [
    "04_Ortodontia",
    "ortodontia",
    "ortodontia",
    "ortodontia",
    [
      ["01_Avaliacao", "02_avaliacao"],
      ["02_Convencional", "03_convencional"],
      ["03_Alternativas-esteticas", "04_esteticas"],
      ["04_Manutencao", "05_manutencao"],
      ["05_Higiene", "06_higiene"],
      ["06_Idades", "07_idades"],
      ["07_CTA", "08_cta"],
    ],
  ],
  [
    "05_Estetica",
    "estetica",
    "estetica",
    "estetica",
    [
      ["01_Clareamento", "02_clareamento"],
      ["02_Sensibilidade", "03_sensibilidade"],
      ["03_Restauracoes", "04_restauracoes"],
      ["04_Facetas", "05_facetas"],
      ["05_Harmonia", "06_harmonia"],
      ["06_Avaliacao", "07_avaliacao"],
      ["07_CTA", "08_cta"],
    ],
  ],
  [
    "06_Criancas",
    "criancas",
    "criancas",
    "criancas",
    [
      ["01_Primeira-consulta", "02_primeira"],
      ["02_Prevencao", "03_prevencao"],
      ["03_Acolhimento", "04_acolhimento"],
      ["04_Orientacao-aos-pais", "05_pais"],
      ["05_Higiene", "06_higiene"],
      ["06_Rotina", "07_rotina"],
      ["07_CTA", "08_cta"],
    ],
  ],
  [
    "07_Avaliacoes",
    "avaliacoes",
    "avaliacoes",
    "avaliacoes",
    [
      ["01_Nota-Google", "02_nota"],
      ["02_Avaliacao-1", "03_review"],
      ["03_Avaliacao-2", "04_review"],
      ["04_Avaliacao-3", "05_review"],
      ["05_Avaliacao-4", "06_review"],
      ["06_Avaliacao-5", "07_review"],
      ["07_CTA", "08_cta"],
    ],
  ],
  [
    "08_Equipe",
    "equipe",
    "equipe",
    "equipe",
    [
      ["01_Juliana", "02_juliana"],
      ["02_Ana-Beatriz", "03_ana_beatriz"],
      ["03_Matheus-Fraga", "04_matheus_fraga"],
      ["05_Hugo-Leonardo", "06_hugo_leonardo"],
      ["06_Sabrina", "07_sabrina_vamszer"],
      ["08_Jeferson", "09_jeferson"],
      ["09_CTA", "10_cta"],
    ],
  ],
  [
    "09_Duvidas",
    "duvidas",
    "duvidas",
    "duvidas",
    [
      ["01", "02"],
      ["02", "03"],
      ["03", "04"],
      ["04", "05"],
      ["05", "06"],
      ["06", "07"],
      ["07", "08"],
      ["08", "09"],
      ["09", "10"],
      ["10", "11"],
      ["11", "12"],
      ["12", "13"],
      ["13_CTA", "14_cta"],
    ],
  ],
  [
    "10_Onde-estamos",
    "localizacao",
    "local",
    "localizacao",
    [
      ["01_Endereco", "02_endereco"],
      ["02_Fachada", "03_fachada"],
      ["03_Regiao", "04_regiao"],
      ["04_Horario", "05_horario"],
      ["05_CTA", "06_cta"],
    ],
  ],
];

/* §7 — Stories acompanham o feed, não entram na sequência. */
const STORIES_DEPOIS = [
  ["01_Novo-Reel", "jp_ig_st13_novo_reel_v01"],
  ["02_Novo-carrossel", "jp_ig_st14_novo_carrossel_v01"],
];
const STORIES_OUTROS_DIAS = [
  ["01_Bastidor", "jp_ig_st02_bastidor_v01"],
  ["02_Avaliacao-Google", "jp_ig_st07_avaliacao_google_v01"],
  ["03_Equipe", "jp_ig_st10_equipe_v01"],
  ["04_Localizacao", "jp_ig_st11_localizacao_v01"],
  ["05_Dica", "jp_ig_st15_dica_v01"],
  ["06_Enquete", "jp_ig_st04_enquete_v01"],
  ["07_Duvida-caixinha", "jp_ig_st05_caixa_perguntas_v01"],
  ["08_Estrutura", "jp_ig_st09_estrutura_v01"],
  ["09_WhatsApp", "jp_ig_st12_whatsapp_v01"],
];

/* Fora do documento: anúncios e o banco do mês seguinte. */
const ANUNCIOS = [
  ["AD01_Implante-doi", "ad01", "implante-dentario", "IMP-M-A01"],
  ["AD02_Dentadura-e-a-unica-opcao", "ad02", "protese-dentaria", "PRO-M-A02"],
  ["AD03_Implante-precisa-de-enxerto", "ad03", "implante-dentario", "IMP-M-A03"],
  ["AD04_Conheca-a-JP", "ad04", null, "CLI-M-A04"],
  ["AD05_Implantes-na-Freguesia", "ad05", "implante-dentario", "IMP-M-A05"],
  ["AD06_Prova-social", "ad06", null, "CLI-M-A06"],
];
const ANUNCIOS_ESTATICOS = [
  ["AD07_Implantes-com-planejamento", "jp_ig_ad07_implante_planejamento_v01"],
  ["AD08_Clinica-real-na-Freguesia", "jp_ig_ad08_local_clinica_real_v01"],
  ["AD09_Prova-social-Google", "jp_ig_ad09_prova_google_v01"],
  ["AD10_Estrutura-e-equipe", "jp_ig_ad10_estrutura_equipe_v01"],
];

const MES2_REELS = [
  ["REEL_Quanto-tempo-leva-um-implante", 4, "R04"],
  ["REEL_Um-implante-para-cada-dente", 6, "R06"],
  ["REEL_Idade-maxima-para-implante", 7, "R07"],
  ["REEL_O-que-avaliamos-antes", 8, "R08"],
  ["REEL_O-que-e-protese-protocolo", 9, "R09"],
  ["REEL_Implante-x-protese", 10, "R10"],
  ["REEL_Por-que-planejamento-importa", 12, "R12"],
  ["REEL_Clareamento-enfraquece-os-dentes", 15, "R15"],
];
const MES2_CARROSSEIS = [
  ["CARROSSEL_Implante-x-protese", "c02-implante-x-protese", "C02"],
  ["CARROSSEL_Cuidados-com-implantes", "c05-cuidados-com-implantes", "C05"],
  ["CARROSSEL_Quando-marcar-uma-avaliacao", "c06-hora-de-avaliar", "C06"],
  ["CARROSSEL_Aparelho-x-alinhador", "c07-aparelho-x-alinhador", "C07"],
  ["CARROSSEL_Conheca-a-estrutura", "c08-conheca-a-estrutura", "C08"],
];
const MES2_POSTS = [
  ["POST_24-anos-cuidando-de-sorrisos", "jp_ig_feed_s02_24_anos_v01", "S02"],
  ["POST_Plano-antes-de-proposta", "jp_ig_feed_s07_planejamento_v01", "S07"],
  ["POST_Proteses-e-reabilitacao", "jp_ig_feed_s10_proteses_v01", "S10"],
  ["POST_Fale-com-a-JP", "jp_ig_feed_s12_whatsapp_v01", "S12"],
  ["POST_Equipe-Juliana", "jp_ig_feed_equipe_juliana_pelisser_v01", "equipe:juliana"],
  ["POST_Equipe-Hugo-Leonardo", "jp_ig_feed_equipe_hugo_leonardo_v01", "equipe:hugo"],
  ["POST_Equipe-Sabrina", "jp_ig_feed_equipe_sabrina_vamszer_v01", "equipe:sabrina"],
  ["POST_Equipe-Jeferson", "jp_ig_feed_equipe_jeferson_barbosa_v01", "equipe:jeferson"],
];
const MES2_STORIES = [
  ["01_Bom-dia", "jp_ig_st01_bom_dia_v01"],
  ["02_Pergunta-aberta", "jp_ig_st03_pergunta_v01"],
  ["03_Quem-responde", "jp_ig_st06_resposta_profissional_v01"],
  ["04_Conceito-educativo", "jp_ig_st08_educativo_v01"],
  ["05_Mito-ou-verdade", "jp_ig_st16_mito_verdade_v01"],
];

/* ==========================================================================
   MOTOR DA CÓPIA
   ========================================================================== */
const origem = []; // [destino relativo, origem relativa] — vai para ENTREGA-ORIGEM.txt
const usados = new Set();
const ausentes = [];
/** pasta → nomes de arquivo que o DOCUMENTO pede nela (conferido no fim). */
const esperado = new Map();
const espera = (pasta, nome) => {
  if (!esperado.has(pasta)) esperado.set(pasta, []);
  esperado.get(pasta).push(nome);
};

async function copia(de, para) {
  const fonte = join(EX, de);
  const rel = relative(EX, fonte).replaceAll("\\", "/"); // resolve "carousel/../ads/…"
  if (!existsSync(fonte)) {
    ausentes.push(rel);
    return false;
  }
  await mkdir(dirname(para), { recursive: true });
  await copyFile(fonte, para);
  origem.push([relative(ENTREGA, para).replaceAll("\\", "/"), rel]);
  usados.add(rel);
  return true;
}

/** Texto para o Bloco de Notas de qualquer máquina: UTF-8 com BOM e CRLF. */
async function texto(para, conteudo) {
  await mkdir(dirname(para), { recursive: true });
  await writeFile(para, `${BOM}${conteudo.replace(/\r?\n/g, "\r\n")}\r\n`, "utf8");
}

/** Prefixo do arquivo de um Reel pelo número; o resto do nome é achado em disco. */
const prefixoReel = (n) => `jp_ig_reel_r${dd(n)}_`;

async function arquivoDoReel(n, ext) {
  const pasta = ext === "mp4" ? "reels" : "reel-covers";
  const alvo =
    ext === "mp4"
      ? new RegExp(`^${prefixoReel(n)}(?!cover).*_v\\d+\\.mp4$`)
      : new RegExp(`^${prefixoReel(n)}cover_v\\d+\\.png$`);
  const achado = (await readdir(join(EX, pasta))).find((f) => alvo.test(f));
  return achado ? `${pasta}/${achado}` : `${pasta}/${prefixoReel(n)}(ausente).${ext}`;
}

const textoLegenda = (id) =>
  id.startsWith("equipe:") ? legendaEquipe(pessoa(id.slice(7))) : legenda(id);

async function pastaReel(destino, n, idLegenda) {
  await copia(await arquivoDoReel(n, "mp4"), join(destino, "VIDEO.mp4"));
  await copia(await arquivoDoReel(n, "png"), join(destino, "CAPA.png"));
  await texto(join(destino, "LEGENDA.txt"), textoLegenda(idLegenda));
  ["VIDEO.mp4", "CAPA.png", "LEGENDA.txt"].forEach((f) => espera(destino, f));
}

async function pastaCarrossel(destino, pastaOrigem, idLegenda) {
  const slides = (await readdir(join(EX, "carousel", pastaOrigem)))
    .filter((f) => f.endsWith(".png"))
    .sort();
  for (const [k, s] of slides.entries()) {
    await copia(`carousel/${pastaOrigem}/${s}`, join(destino, `${dd(k + 1)}.png`));
    espera(destino, `${dd(k + 1)}.png`);
  }
  if (idLegenda) {
    await texto(join(destino, "LEGENDA.txt"), textoLegenda(idLegenda));
    espera(destino, "LEGENDA.txt");
  }
}

async function pastaPost(destino, arquivo, idLegenda) {
  await copia(`feed/${arquivo}.png`, join(destino, "POST.png"));
  await texto(join(destino, "LEGENDA.txt"), textoLegenda(idLegenda));
  ["POST.png", "LEGENDA.txt"].forEach((f) => espera(destino, f));
}

/* ==========================================================================
   MONTAGEM
   ========================================================================== */
await rm(ENTREGA, { recursive: true, force: true });
await mkdir(ENTREGA, { recursive: true });

// POSTAR — §1, §3
const P = join(ENTREGA, "POSTAR");
for (const [pasta, , forma, fonte, idLeg] of POSTAR) {
  const destino = join(P, pasta);
  if (forma === "R") await pastaReel(destino, fonte, idLeg);
  else if (forma === "C") await pastaCarrossel(destino, fonte, idLeg);
  else await pastaPost(destino, fonte, idLeg);
}

// DESTAQUES — §5, §6
const D = join(ENTREGA, "DESTAQUES");
for (const [pasta, origemPasta, prefixo, bolinha, cartoes] of DESTAQUES) {
  const destino = join(D, pasta);
  await copia(`highlights/jp_ig_highlight_${bolinha}_v01.png`, join(destino, "CAPA.png"));
  espera(destino, "CAPA.png");
  for (const [nome, sufixo] of cartoes) {
    await copia(
      `highlights/${origemPasta}/jp_ig_dst_${prefixo}_${sufixo}.png`,
      join(destino, `${nome}.png`),
    );
    espera(destino, `${nome}.png`);
  }
}

// FOTO DE PERFIL — a escolha da clínica: a logo inteira sobre papel
await copia(
  "avatar/jp_ig_avatar_a_papel_v01.png",
  join(ENTREGA, "FOTO-DE-PERFIL", "FOTO-DE-PERFIL.png"),
);

// STORIES — §7
const S = join(ENTREGA, "STORIES");
for (const [nome, arq] of STORIES_DEPOIS)
  await copia(`story/templates/${arq}.png`, join(S, "01_Depois-de-publicar", `${nome}.png`));
for (const [nome, arq] of STORIES_OUTROS_DIAS)
  await copia(`story/templates/${arq}.png`, join(S, "02_Outros-dias", `${nome}.png`));

// ANÚNCIOS
const A = join(ENTREGA, "ANUNCIOS");
const site = dados.siteUrl;
for (const [pasta, cod, rota, ref] of ANUNCIOS) {
  const destino = join(A, pasta);
  const linhas = [
    `${pasta} — 3 GANCHOS PARA TESTE A/B`,
    "",
    "Os três têm o MESMO corpo e a MESMA música; só o começo muda.",
    "",
  ];
  for (const letra of ["a", "b", "c"]) {
    const L = letra.toUpperCase();
    await copia(`ads/jp_ig_ad_${cod}_hook${letra}_v01.mp4`, join(destino, `GANCHO-${L}.mp4`));
    await copia(`ads/jp_ig_ad_${cod}_hook${letra}_v01.srt`, join(destino, `GANCHO-${L}.srt`));
    const utm = `utm_source=meta&utm_medium=cpc&utm_campaign=implante_freguesia_meta&utm_content=${cod}_hook${letra}`;
    const destinoLink = rota
      ? `${site}/${rota}?${utm}`
      : `${dados.clinica.whatsappHref}?text=${encodeURIComponent(`Olá! Vim pelo Instagram da JP e gostaria de agendar uma avaliação. Ref.: ${ref}`)}`;
    linhas.push(`GANCHO ${L}`, `  utm_content: ${cod}_hook${letra}`, `  link: ${destinoLink}`, "");
  }
  linhas.push("Textos, títulos e público: social/instagram/PAID-MEDIA.md");
  await texto(join(destino, "LINKS-E-UTM.txt"), linhas.join("\n"));
}
for (const [nome, arq] of ANUNCIOS_ESTATICOS)
  await copia(`ads/${arq}.png`, join(A, "AD07-a-AD10_Imagens-estaticas", `${nome}.png`));
await pastaCarrossel(
  join(A, "AD11_CARROSSEL_Duvidas-sobre-implantes"),
  "../ads/ad11-implantes-duvidas",
  null,
);
await pastaCarrossel(
  join(A, "AD12_CARROSSEL_Conheca-a-clinica"),
  "../ads/ad12-conheca-a-clinica",
  null,
);

// PRÓXIMO MÊS
const M = join(ENTREGA, "PROXIMO-MES");
for (const [pasta, n, id] of MES2_REELS) await pastaReel(join(M, pasta), n, id);
for (const [pasta, origemPasta, id] of MES2_CARROSSEIS)
  await pastaCarrossel(join(M, pasta), origemPasta, id);
for (const [pasta, arq, id] of MES2_POSTS) await pastaPost(join(M, pasta), arq, id);
for (const [nome, arq] of MES2_STORIES)
  await copia(`story/templates/${arq}.png`, join(M, "STORIES-EXTRAS", `${nome}.png`));

// O documento da clínica vai junto, na raiz
await copyFile(join(KIT, DOC_ORDEM), join(ENTREGA, DOC_ORDEM));

/* ==========================================================================
   PRÉVIA DO PERFIL — como o grid fica depois das 22 publicações
   ========================================================================== */
const miniaturas = [];
// os fixados no topo, depois o mais novo primeiro (22 → 04)
const ordemPerfil = [
  ...Array.from({ length: FIXADOS }, (_, i) => i),
  ...Array.from({ length: POSTAR.length - FIXADOS }, (_, i) => POSTAR.length - 1 - i),
];
for (const k of ordemPerfil) {
  const [, , forma, fonte] = POSTAR[k];
  if (forma === "R")
    miniaturas.push({ arq: join(EX, await arquivoDoReel(fonte, "png")), reel: true });
  else if (forma === "C") {
    const s = (await readdir(join(EX, "carousel", fonte)))
      .filter((f) => f.endsWith(".png"))
      .sort()[0];
    miniaturas.push({ arq: join(EX, "carousel", fonte, s), reel: false });
  } else miniaturas.push({ arq: join(EX, "feed", `${fonte}.png`), reel: false });
}
const NOME_PREVIA = "PREVIA_como-o-perfil-fica.png";
const cfgGrid = join(KIT, "_grid-entrega.json");
await writeFile(cfgGrid, JSON.stringify({ itens: miniaturas, saida: join(ENTREGA, NOME_PREVIA) }));
const pyGrid = `
import json, sys
from PIL import Image
cfg = json.load(open(sys.argv[1], encoding="utf-8"))
W, H, G = 360, 450, 6
itens = cfg["itens"]
linhas = (len(itens) + 2) // 3
folha = Image.new("RGB", (3 * W + 2 * G, linhas * H + (linhas - 1) * G), (255, 255, 255))
for i, it in enumerate(itens):
    im = Image.open(it["arq"]).convert("RGB")
    if it["reel"]:
        topo = (im.height - 1350) // 2
        im = im.crop((0, topo, im.width, topo + 1350))
    im = im.resize((W, H), Image.LANCZOS)
    folha.paste(im, ((i % 3) * (W + G), (i // 3) * (H + G)))
folha.save(cfg["saida"])
`;
function rodarPython(codigo, argv) {
  return new Promise((ok, falha) => {
    const p = spawn("python", ["-c", codigo, ...argv], { stdio: "inherit" });
    p.on("close", (c) => (c === 0 ? ok() : falha(new Error(`python saiu com ${String(c)}`))));
  });
}
await rodarPython(pyGrid, [cfgGrid]);
await rm(cfgGrid);

/* ==========================================================================
   LEIA-ME
   ========================================================================== */
const linhaCalendario = ([pasta, titulo], k) => {
  const c = CALENDARIO[k];
  const fixar = k < FIXADOS ? "  → FIXAR" : "";
  const recuo = " ".repeat(31);
  return [
    `  ${pasta.slice(0, 2)}  ${c.data} ${c.dia.padEnd(7)}  ${pasta}${fixar}`,
    `${recuo}${titulo}`,
    ...(c.feriado ? [`${recuo}ATENÇÃO: ${c.feriado}`] : []),
  ];
};
const ordemInversa = [...DESTAQUES].reverse().map(([p]) => p);

await texto(
  join(ENTREGA, "LEIA-ME.txt"),
  [
    "ENTREGA - INSTAGRAM JP CLÍNICA ODONTOLÓGICA",
    `Segue o documento ${DOC_ORDEM}, que está nesta mesma pasta.`,
    "",
    "======================================================================",
    "ANTES DE 21/09 — uma vez só",
    "======================================================================",
    "",
    "1. FOTO-DE-PERFIL",
    "   Troque a foto do perfil por FOTO-DE-PERFIL.png.",
    "",
    "2. DESTAQUES",
    "   O Instagram coloca na frente o Destaque atualizado por último.",
    "   Por isso, CRIE DO 10 PARA O 01:",
    `   ${ordemInversa.slice(0, 5).join(" → ")} →`,
    `   ${ordemInversa.slice(5).join(" → ")}`,
    "   No perfil, eles aparecem na ordem certa: A Clínica primeiro.",
    "",
    "   Em cada pasta:",
    "     a) poste 01, 02, 03… como Stories, na ordem dos números;",
    "     b) crie o Destaque com esses Stories;",
    '     c) em "Editar capa", escolha CAPA.png.',
    "   CAPA.png é só a capa da bolinha: não vai como Story nem como post.",
    "",
    "======================================================================",
    "A PARTIR DE 21/09 — POSTAR, da pasta 01 até a 22, um por dia útil",
    "======================================================================",
    "",
    "  REEL       VIDEO.mp4 como Reel. Em Capa → Adicionar da galeria → CAPA.png.",
    "             Legenda: copie tudo de LEGENDA.txt.",
    "  CARROSSEL  01.png, 02.png, 03.png… sempre na ordem dos números.",
    "             Legenda: LEGENDA.txt.",
    "  POST       POST.png + LEGENDA.txt. O card da equipe funciona igual.",
    "",
    "  Depois de publicar 01, 02 e 03, FIXE OS TRÊS no perfil",
    '  (três pontinhos do post → "Fixar no perfil").',
    "",
    "  Não publique como post separado: capa de Reel, capa de Destaque.",
    "",
    "CALENDÁRIO",
    "",
    ...POSTAR.flatMap(linhaCalendario),
    "",
    "  Sábado e domingo: só Stories.",
    "",
    "======================================================================",
    "STORIES — acompanham o feed, não entram na sequência 01 → 22",
    "======================================================================",
    "",
    "  publicou Reel      → 30 a 60 min depois: STORIES/01_Depois-de-publicar/01_Novo-Reel.png",
    "  publicou carrossel → STORIES/01_Depois-de-publicar/02_Novo-carrossel.png",
    "  nos outros dias    → STORIES/02_Outros-dias: bastidor, avaliação, equipe,",
    "                       localização, dica, enquete, dúvida, estrutura, WhatsApp",
    "",
    "  Onde o template tem moldura tracejada, cole por cima o adesivo NATIVO do",
    "  Instagram (enquete, caixinha de perguntas, localização).",
    "  Um Story de WhatsApp por dia, no máximo. Bastidor real, tirado com o",
    "  celular, vale mais que qualquer template.",
    "",
    "======================================================================",
    "AS OUTRAS PASTAS",
    "======================================================================",
    "",
    "  ANUNCIOS     só quando for impulsionar no Meta Ads. Cada pasta de vídeo",
    "               tem 3 ganchos para teste A/B e o link com UTM de cada um.",
    "  PROXIMO-MES  o que fica para depois de 20/10: 8 Reels, 5 carrosséis,",
    "               10 posts (6 da equipe) e 5 Stories extras.",
    `  ${NOME_PREVIA}`,
    "               como o perfil fica depois das 22 publicações.",
    "",
    "  Os vídeos têm trilha sonora própria, liberada para post e anúncio. Para",
    "  usar um áudio do Instagram no lugar, abaixe o áudio original a zero no",
    "  editor antes de escolher o som. Em anúncio, nunca use áudio do Instagram.",
    "",
    "======================================================================",
    "DUAS PENDÊNCIAS QUE DEPENDEM DA CLÍNICA",
    "======================================================================",
    "",
    `  1. O WhatsApp certo é ${dados.clinica.whatsapp}. A placa da fachada ainda`,
    "     mostra um número antigo (9 7169-4647): vale corrigir ou cobrir.",
    "  2. capa-recepcao-*.webp, no repositório, NÃO é a recepção da JP",
    "     (é banco de imagem). Nenhuma peça daqui usa. Conferir se está no site.",
    "",
    "Gerado por social/instagram/source/scripts/montar-entrega.mjs",
  ].join("\n"),
);

// A rastreabilidade fica FORA da pasta de entrega: é para quem mantém o kit.
await texto(
  join(KIT, "ENTREGA-ORIGEM.txt"),
  [
    "De onde veio cada arquivo de ENTREGA/ (caminho em social/instagram/exports/).",
    "",
    ...origem.map(([d, o]) => `${d}  <-  ${o}`),
  ].join("\n"),
);

/* ==========================================================================
   CONFERÊNCIA — a pasta contra o documento, lida do disco
   ========================================================================== */
async function listar(dir) {
  const saida = [];
  for (const i of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, i.name);
    if (i.isDirectory()) saida.push(...(await listar(p)));
    else saida.push(p);
  }
  return saida;
}
const problemas = [];
const igual = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// 1. POSTAR e DESTAQUES têm exatamente as pastas do documento, nesta ordem
const pastasDe = async (dir) =>
  (await readdir(dir, { withFileTypes: true }))
    .filter((i) => i.isDirectory())
    .map((i) => i.name)
    .sort();
if (
  !igual(
    await pastasDe(P),
    POSTAR.map(([p]) => p),
  )
)
  problemas.push("POSTAR/ não tem exatamente as 22 pastas do documento");
if (
  !igual(
    await pastasDe(D),
    DESTAQUES.map(([p]) => p),
  )
)
  problemas.push("DESTAQUES/ não tem exatamente as 10 pastas do documento");

// 2. cada pasta tem exatamente os arquivos pedidos, nem um a mais
for (const [pasta, nomes] of esperado) {
  const noDisco = (await readdir(pasta)).sort();
  const pedidos = [...nomes].sort();
  if (!igual(noDisco, pedidos)) {
    const faltam = pedidos.filter((n) => !noDisco.includes(n));
    const sobram = noDisco.filter((n) => !pedidos.includes(n));
    problemas.push(
      `${relative(ENTREGA, pasta)}: ${faltam.length ? `faltam ${faltam.join(", ")}` : ""}${sobram.length ? ` sobram ${sobram.join(", ")}` : ""}`,
    );
  }
}

// 3. carrossel numerado sem buraco: 01, 02, 03…
for (const [pasta, nomes] of esperado) {
  const nums = nomes.filter((n) => /^\d{2}\.png$/.test(n)).map((n) => Number(n.slice(0, 2)));
  if (nums.some((n, i) => n !== i + 1))
    problemas.push(`${relative(ENTREGA, pasta)}: slides fora de sequência`);
}

const tudo = await listar(ENTREGA);

// 4. nenhum arquivo vazio, nenhuma legenda com hashtag por resolver
for (const p of tudo) {
  if ((await stat(p)).size === 0) problemas.push(`${relative(ENTREGA, p)}: arquivo vazio`);
  if (basename(p) === "LEGENDA.txt") {
    const t = await readFile(p, "utf8");
    if (/\[[A-Z]+\]/.test(t)) problemas.push(`${relative(ENTREGA, p)}: hashtag por resolver`);
  }
}

// 5. no máximo 10 imagens por pasta — DESTAQUES segue o documento, que pede 14 em dois
const porPasta = new Map();
for (const p of tudo.filter((x) => x.endsWith(".png")))
  porPasta.set(dirname(p), (porPasta.get(dirname(p)) ?? 0) + 1);
for (const [pasta, n] of porPasta)
  if (n > 10 && !pasta.startsWith(D))
    problemas.push(`${relative(ENTREGA, pasta)}: ${String(n)} imagens`);

// 6. nome fora do ASCII quebra no compactador do Windows
for (const r of tudo.map((p) => relative(ENTREGA, p)))
  if ([...r].some((c) => c.charCodeAt(0) > 126) && basename(r) !== DOC_ORDEM)
    problemas.push(`nome com acento: ${r}`);

// 7. arquivo do plano que não existe em exports/
for (const a of ausentes) problemas.push(`não existe em exports/: ${a}`);

/* ==========================================================================
   ZIP
   ========================================================================== */
const zip = join(KIT, NOME_ZIP);
await rm(zip, { force: true });
const pyZip = `
import os, sys, zipfile
raiz, destino = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(destino, "w") as z:
    for base, pastas, arqs in os.walk(raiz):
        pastas.sort()
        for a in sorted(arqs):
            p = os.path.join(base, a)
            nome = os.path.join("ENTREGA-INSTAGRAM-JP", os.path.relpath(p, raiz)).replace(os.sep, "/")
            modo = zipfile.ZIP_DEFLATED if a.endswith((".txt", ".srt", ".md")) else zipfile.ZIP_STORED
            z.write(p, nome, compress_type=modo)
`;
await rodarPython(pyZip, [ENTREGA, zip]);
const mb = (await stat(zip)).size / 1048576;

// ------------------------------------------------------------------ relatório
const nPng = tudo.filter((p) => p.endsWith(".png")).length;
const nMp4 = tudo.filter((p) => p.endsWith(".mp4")).length;
const nTxt = tudo.filter((p) => p.endsWith(".txt")).length;
console.log(
  `\nENTREGA montada: ${String(nPng)} imagens · ${String(nMp4)} vídeos · ${String(nTxt)} textos`,
);
console.log(`${NOME_ZIP}: ${mb.toFixed(0)} MB`);
console.log(
  `POSTAR: ${String(POSTAR.length)} pastas · DESTAQUES: ${String(DESTAQUES.length)} pastas`,
);
console.log(`calendário: ${CALENDARIO[0].data} a ${CALENDARIO.at(-1).data}`);

const exportados = (await listar(EX))
  .map((p) => relative(EX, p).replaceAll("\\", "/"))
  .filter((r) => /\.(png|mp4)$/.test(r));
const foraDeProposito = exportados.filter((r) => !usados.has(r));
console.log(`\nFicaram de fora de propósito (${String(foraDeProposito.length)}):`);
for (const r of foraDeProposito) console.log(`  - ${r}`);

if (problemas.length) {
  console.log(`\n✗ A PASTA NÃO BATE COM O DOCUMENTO (${String(problemas.length)}):`);
  problemas.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
console.log(
  "\n✓ POSTAR e DESTAQUES idênticos ao documento · slides em sequência · nada vazio · nomes sem acento",
);

if (COPIAR_PARA) {
  const alvo = join(COPIAR_PARA, "ENTREGA-INSTAGRAM-JP");
  await rm(alvo, { recursive: true, force: true });
  await cp(ENTREGA, alvo, { recursive: true });
  await copyFile(zip, join(COPIAR_PARA, NOME_ZIP));
  console.log(`\ncopiado para ${alvo}\ne ${join(COPIAR_PARA, NOME_ZIP)}`);
}
