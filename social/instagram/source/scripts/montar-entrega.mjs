/**
 * PASTA DE ENTREGA — exports/  →  ENTREGA/
 *
 *   node social/instagram/source/scripts/montar-entrega.mjs
 *
 * Junta TODAS as imagens numa árvore de pastas numeradas, na ordem em que o
 * material vai ser usado, para ser compactada e enviada. Vídeo não entra: são
 * 108 MB contra 77 MB de imagem, e quem recebe o zip normalmente quer as artes.
 *
 * ============================================================================
 *  TRÊS DECISÕES QUE PARECEM DETALHE E NÃO SÃO.
 *
 *  1. NOME DE PASTA SEM ACENTO. O compactador nativo do Windows grava o nome
 *     na página de código local, não em UTF-8. "CARROSSÉIS" vira "CARROSSÉIS"
 *     ao abrir o zip em outro computador — e aí a pessoa que recebeu o material
 *     acha que veio corrompido. O nome sem acento continua legível em qualquer
 *     lugar. Os NOMES DE ARQUIVO já eram ASCII por causa da nomenclatura do kit.
 *
 *  2. A NUMERAÇÃO É A ORDEM DE USO, não a ordem alfabética. Quem abre o zip
 *     precisa começar pelo perfil e terminar pelos anúncios; uma árvore em
 *     ordem alfabética começaria por "ANUNCIOS", que é a última coisa a fazer.
 *
 *  3. O NOME ORIGINAL DO ARQUIVO É PRESERVADO. Ele carrega o rastro de volta
 *     ao manifest que o gerou (`jp_ig_car_c03_04_v01` → `52-car-c03.json`,
 *     slide 4). Renomear para "Slide 4.png" deixaria o zip mais bonito e
 *     tornaria impossível descobrir de onde a peça saiu quando ela precisar de
 *     correção. A pasta carrega o nome humano; o arquivo carrega a origem.
 * ============================================================================
 */
import { readdir, mkdir, copyFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(AQUI, "../..");
const EXPORTS = join(KIT, "exports");
const ENTREGA = join(KIT, "ENTREGA");

/* `exports/highlights` e `exports/ads` têm arquivos soltos E subpastas na mesma
   pasta. A cópia só olha arquivos, então a raiz vem sozinha sem precisar de
   flag — as capas de Destaque em (02) e os estáticos de anúncio em (10). */
const MAPA = [
  { destino: "01 - PERFIL (foto de perfil)", de: "avatar" },
  { destino: "02 - DESTAQUES - CAPAS (as bolinhas)", de: "highlights" },
  {
    destino: "03 - DESTAQUES - CARTOES DE DENTRO",
    subpastas: [
      ["01 - Implantes", "highlights/implantes"],
      ["02 - A clinica", "highlights/clinica"],
      ["03 - Avaliacoes", "highlights/avaliacoes"],
      ["04 - Equipe", "highlights/equipe"],
      ["05 - Onde estamos", "highlights/localizacao"],
      ["06 - Proteses", "highlights/proteses"],
      ["07 - Duvidas", "highlights/duvidas"],
      ["08 - Ortodontia", "highlights/ortodontia"],
      ["09 - Criancas", "highlights/criancas"],
      ["10 - Estetica", "highlights/estetica"],
    ],
  },
  {
    destino: "04 - POSTS FIXADOS",
    subpastas: [
      ["PIN 02 - Implantes na JP", "carousel/pin02-implantes-na-jp"],
      ["PIN 03 - Prova de confianca", "carousel/pin03-prova-de-confianca"],
    ],
  },
  {
    destino: "05 - CARROSSEIS",
    subpastas: [
      ["C01 - 5 duvidas sobre implantes", "carousel/c01-duvidas-implantes"],
      ["C02 - Implante x protese", "carousel/c02-implante-x-protese"],
      ["C03 - Dentadura x protocolo", "carousel/c03-dentadura-x-protocolo"],
      ["C04 - Como funciona a avaliacao", "carousel/c04-como-e-a-avaliacao"],
      ["C05 - Cuidados com implantes", "carousel/c05-cuidados-com-implantes"],
      ["C06 - Quando marcar uma avaliacao", "carousel/c06-hora-de-avaliar"],
      ["C07 - Aparelho x alinhador", "carousel/c07-aparelho-x-alinhador"],
      ["C08 - Conheca a estrutura da JP", "carousel/c08-conheca-a-estrutura"],
    ],
  },
  { destino: "06 - POSTS DO FEED", de: "feed", filtro: /_s\d\d_/ },
  { destino: "07 - CARDS DA EQUIPE", de: "feed", filtro: /_equipe_/ },
  { destino: "08 - CAPAS DOS REELS", de: "reel-covers" },
  { destino: "09 - TEMPLATES DE STORY", de: "story/templates" },
  {
    destino: "10 - ANUNCIOS (imagens)",
    subpastas: [
      ["01 - Estaticos 4x5", "ads"],
      ["02 - AD11 - Duvidas sobre implantes", "ads/ad11-implantes-duvidas"],
      ["03 - AD12 - Conheca a clinica", "ads/ad12-conheca-a-clinica"],
    ],
  },
  { destino: "11 - GRID DO PERFIL (previa)", de: "grid" },
];

/** Copia os PNG de uma pasta de origem para um destino. Devolve quantos foram. */
async function copiarPasta(origemRel, destinoAbs, { filtro = null } = {}) {
  const origem = join(EXPORTS, origemRel);
  let itens;
  try {
    itens = await readdir(origem, { withFileTypes: true });
  } catch {
    console.log(`  ! pasta inexistente: exports/${origemRel}`);
    return 0;
  }
  const arquivos = itens
    .filter((i) => i.isFile() && i.name.endsWith(".png"))
    .map((i) => i.name)
    .filter((n) => (filtro ? filtro.test(n) : true))
    .sort();
  if (arquivos.length === 0) return 0;

  await mkdir(destinoAbs, { recursive: true });
  for (const nome of arquivos) {
    await copyFile(join(origem, nome), join(destinoAbs, nome));
  }
  return arquivos.length;
}

await rm(ENTREGA, { recursive: true, force: true });
await mkdir(ENTREGA, { recursive: true });

let total = 0;
const arvore = [];

for (const grupo of MAPA) {
  const destinoAbs = join(ENTREGA, grupo.destino);
  let doGrupo = 0;
  const filhos = [];

  if (grupo.subpastas) {
    for (const [nome, origemRel] of grupo.subpastas) {
      const n = await copiarPasta(origemRel, join(destinoAbs, nome));
      doGrupo += n;
      filhos.push(`    ${nome}  (${String(n)})`);
    }
  } else {
    doGrupo = await copiarPasta(grupo.de, destinoAbs, { filtro: grupo.filtro });
  }

  total += doGrupo;
  arvore.push(`  ${grupo.destino}  (${String(doGrupo)})`);
  arvore.push(...filhos);
}

/* Um índice curto dentro do zip. Quem recebe o material não tem o repositório
   e não vai adivinhar que "jp_ig_dst_implantes_07_doi" é o sétimo cartão do
   Destaque Implantes. */
const leiaMe = [
  "ENTREGA - INSTAGRAM JP CLINICA ODONTOLOGICA",
  "",
  `${String(total)} imagens, prontas para publicar.`,
  "",
  "COMO USAR",
  "  As pastas estao numeradas na ORDEM DE USO, nao em ordem alfabetica.",
  "  Comece pela 01 e siga.",
  "  Dentro de cada pasta, os arquivos ja estao na ordem de publicacao.",
  "",
  "O QUE TEM EM CADA PASTA",
  ...arvore,
  "",
  "O QUE NAO ESTA AQUI",
  "  Os 34 videos (16 Reels + 18 anuncios) e as legendas .srt.",
  "  Eles ficam em social/instagram/exports/reels/ e /ads/, por peso.",
  "  A documentacao (calendario, legendas, midia paga) fica em social/instagram/.",
  "",
  "ANTES DE PUBLICAR",
  "  As legendas prontas de cada peca estao em social/instagram/CAPTIONS.md.",
  "  O calendario dia a dia esta em social/instagram/CALENDAR-30D.md.",
  "",
  "DUAS PENDENCIAS QUE DEPENDEM DA CLINICA",
  "  1. A placa da fachada traz o WhatsApp 9 7169-4647; o site usa",
  "     (11) 97616-5117. Confirmar qual esta em uso.",
  "  2. capa-recepcao-*.webp, no repositorio, NAO e a recepcao da JP.",
  "     E banco de imagem. Nenhuma peca daqui usa. Conferir se esta no site.",
  "",
  "Gerado por social/instagram/source/scripts/montar-entrega.mjs",
].join("\r\n");

/* O texto sai em ASCII puro e com CRLF. Os dois por causa do mesmo leitor: o
   Bloco de Notas de uma maquina que nao e esta. Acento em .txt sem BOM ainda
   sai trocado em Windows antigo, e LF sozinho ainda mostra o arquivo inteiro
   numa linha so. O zip vai para quem nao tem o repositorio. */
const naoAscii = [...leiaMe].filter((c) => c.charCodeAt(0) > 126);
if (naoAscii.length > 0) {
  console.log(
    `  ! LEIA-ME tem ${String(naoAscii.length)} caractere(s) fora do ASCII: ${[...new Set(naoAscii)].join(" ")}`,
  );
}
await writeFile(join(ENTREGA, "LEIA-ME.txt"), leiaMe, "utf8");

/* Conferência: a pasta tem de bater com os PNG de exports, menos os pilotos —
   que são peças de conferência da Etapa B, não material de publicação. */
const pilotos = (await readdir(join(EXPORTS, "piloto")).catch(() => [])).filter((f) =>
  f.endsWith(".png"),
).length;
async function contarPng(dir) {
  let n = 0;
  for (const i of await readdir(dir, { withFileTypes: true })) {
    if (i.isDirectory()) n += await contarPng(join(dir, i.name));
    else if (i.name.endsWith(".png")) n += 1;
  }
  return n;
}
const noExports = await contarPng(EXPORTS);
const esperado = noExports - pilotos;

console.log(`\nENTREGA/ montada em ${ENTREGA.replace(KIT, "social/instagram")}\n`);
console.log(arvore.join("\n"));
console.log(`\n  ${String(total)} imagens`);
if (total !== esperado) {
  console.log(
    `\n  ✗ FALTOU ALGUMA COISA: exports tem ${String(esperado)} PNG publicáveis ` +
      `(${String(noExports)} menos ${String(pilotos)} pilotos), a entrega tem ${String(total)}.`,
  );
  process.exit(1);
}
console.log(`  ✓ bate com exports/ (${String(noExports)} PNG − ${String(pilotos)} pilotos)\n`);
console.log("  Agora: botão direito na pasta ENTREGA → Enviar para → Pasta compactada.\n");
