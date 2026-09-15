/**
 * EXTRATOR DE DADOS — src/lib/jp.ts  →  source/dados-jp.json
 *
 * Por que existe, e por que não é um arquivo de dados escrito à mão.
 *
 * O kit do Instagram precisa de nota do Google, total de avaliações, CRO de
 * cada profissional, telefone, WhatsApp e endereço. Todos esses números já
 * existem, com dono, em `src/lib/jp.ts` — e o comentário no topo daquele
 * arquivo conta o que aconteceu quando o total de avaliações foi digitado em
 * três componentes: o site publicou três respostas para a mesma pergunta.
 *
 * Copiá-los para cá repetiria o erro num lugar pior: uma arte exportada não
 * tem como ser corrigida por um `git grep`. Um PNG com "4,6 · 192 avaliações"
 * queimado no pixel continua no feed depois que o número mudou.
 *
 * Então este script LÊ o arquivo de verdade e emite um JSON derivado. Quando a
 * clínica atualizar a nota, o caminho é:
 *
 *   1. editar `src/lib/jp.ts` (a fonte);
 *   2. `node social/instagram/source/scripts/extrair-dados.mjs`;
 *   3. `node social/instagram/source/scripts/renderizar.mjs prova-social`.
 *
 * Não é parser de TypeScript: é leitura de literais com expressão regular.
 * Isso é suficiente porque `jp.ts` guarda dados públicos em objetos literais
 * planos, e é frágil se alguém trocar aspas por template literal ou mover um
 * campo para função. Por isso cada campo obrigatório é CONFERIDO no fim, e o
 * script FALHA em vez de emitir um JSON com buraco — um `undefined` que vira
 * "undefined avaliações" numa arte é pior do que um erro no terminal.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "../../../..");
const ORIGEM = resolve(RAIZ, "src/lib/jp.ts");
const DESTINO = resolve(AQUI, "../dados-jp.json");

/**
 * Tira comentários antes de procurar valores.
 *
 * Sem isso, `nome: "Dra. X"` escrito dentro de um comentário de aviso — e
 * `jp.ts` tem vários — casaria antes do dado real. Comentário de linha só sai
 * quando começa a linha: `https://` tem duas barras e não é comentário.
 */
function semComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Um literal de string simples, `campo: "valor"`, dentro de um trecho. */
function str(trecho, campo) {
  const m = new RegExp(`\\b${campo}:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(trecho);
  return m ? m[1].replace(/\\"/g, '"') : undefined;
}

/** Um literal numérico, `campo: 4.6`. */
function num(trecho, campo) {
  const m = new RegExp(`\\b${campo}:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(trecho);
  return m ? Number(m[1]) : undefined;
}

/**
 * O corpo de uma declaração `export const NOME = { ... }`.
 *
 * Conta chaves em vez de casar `{[\s\S]*?}` porque os objetos de `jp.ts` têm
 * objetos aninhados — o não-guloso pararia na primeira chave interna.
 */
function bloco(texto, nome) {
  const abre = new RegExp(`(?:export\\s+)?const\\s+${nome}\\b[^=]*=\\s*([{[])`).exec(texto);
  if (!abre) return undefined;
  const inicio = abre.index + abre[0].length - 1;
  const fecha = abre[1] === "{" ? "}" : "]";
  let nivel = 0;
  let emString = null;
  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];
    if (emString) {
      if (c === "\\") i += 1;
      else if (c === emString) emString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") emString = c;
    else if (c === abre[1]) nivel += 1;
    else if (c === fecha) {
      nivel -= 1;
      if (nivel === 0) return texto.slice(inicio, i + 1);
    }
  }
  return undefined;
}

/** Quebra o corpo de um array de objetos nos `{...}` de primeiro nível. */
function objetosDoArray(corpoArray) {
  const itens = [];
  let nivel = 0;
  let inicio = -1;
  let emString = null;
  for (let i = 0; i < corpoArray.length; i += 1) {
    const c = corpoArray[i];
    if (emString) {
      if (c === "\\") i += 1;
      else if (c === emString) emString = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") emString = c;
    else if (c === "{") {
      if (nivel === 0) inicio = i;
      nivel += 1;
    } else if (c === "}") {
      nivel -= 1;
      if (nivel === 0 && inicio >= 0) {
        itens.push(corpoArray.slice(inicio, i + 1));
        inicio = -1;
      }
    }
  }
  return itens;
}

const cru = await readFile(ORIGEM, "utf8");
const t = semComentarios(cru);

const bAval = bloco(t, "AVALIACOES");
const bClinica = bloco(t, "CLINICA");
const bEndereco = bloco(t, "ENDERECO");
const bHistoria = bloco(t, "HISTORIA");
const bRT = bloco(t, "RESPONSAVEL_TECNICA");
const bGestor = bloco(t, "GESTOR");
const bEquipe = bloco(t, "EQUIPE");
const bTrat = bloco(t, "TRATAMENTOS");
const bDep = bloco(t, "DEPOIMENTOS");

const nota = num(bAval, "nota");
const total = num(bAval, "total");

const equipe = objetosDoArray(bEquipe ?? "").map((o) => ({
  nome: str(o, "nome"),
  registro: str(o, "registro") ?? null,
  papel: str(o, "papel") ?? null,
}));

const tratamentos = objetosDoArray(bTrat ?? "").map((o) => ({
  slug: str(o, "slug"),
  titulo: str(o, "titulo"),
  short: str(o, "short"),
  headline: str(o, "headline"),
  desc: str(o, "desc"),
  kicker: str(o, "kicker"),
}));

const depoimentos = objetosDoArray(bDep ?? "").map((o) => ({
  autor: str(o, "autor"),
  texto: str(o, "texto"),
}));

const siteUrl = /export const SITE_URL = "([^"]+)"/.exec(t)?.[1];

const dados = {
  _origem: "src/lib/jp.ts",
  _gerador: "social/instagram/source/scripts/extrair-dados.mjs",
  _aviso: "ARQUIVO DERIVADO. Não edite à mão: rode o gerador depois de mudar src/lib/jp.ts.",
  siteUrl,
  avaliacoes: {
    nota,
    total,
    conferidoEm: str(bAval, "conferidoEm"),
    /* A data como o Brasil escreve. `jp.ts` guarda ISO porque é o formato que
       não depende de quem lê; numa arte, "2026-09-10" parece número de
       protocolo. A conversão mora aqui e não no manifest para a peça não poder
       discordar da fonte. */
    conferidoEmBR: str(bAval, "conferidoEm")?.split("-").reverse().join("/"),
    notaBR: nota?.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    provaCurta: `${nota?.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} no Google`,
    provaLonga: `${nota?.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}★ no Google · ${String(total)} avaliações`,
  },
  clinica: {
    nome: str(bClinica, "nome"),
    nomeCurto: "JP Clínica Odontológica",
    razaoSocial: str(bClinica, "razaoSocial"),
    cnpj: str(bClinica, "cnpj"),
    assinatura: str(bClinica, "assinatura"),
    telefone: str(bClinica, "telefone"),
    whatsapp: str(bClinica, "whatsapp"),
    whatsappHref: str(bClinica, "whatsappHref"),
    horario: str(bClinica, "horario"),
    instagram: str(bClinica, "instagram"),
    mapsHref: str(bClinica, "mapsHref"),
    bairroExibicao: str(bClinica, "bairro"),
    endereco: {
      logradouro: str(bEndereco, "logradouro"),
      bairro: str(bEndereco, "bairro"),
      cidade: str(bEndereco, "cidade"),
      uf: str(bEndereco, "uf"),
      cep: str(bEndereco, "cep"),
    },
  },
  historia: {
    fundacao: num(bHistoria, "fundacao"),
    fundacaoData: str(bHistoria, "fundacaoData"),
    anos: num(bHistoria, "anos"),
    regiaoAnterior: str(bHistoria, "regiaoAnterior"),
    bairroAnterior: str(bHistoria, "bairroAnterior"),
    regiaoAtual: str(bHistoria, "regiaoAtual"),
    mudanca: num(bHistoria, "mudanca"),
  },
  responsavelTecnica: {
    nome: str(bRT, "nome"),
    registro: str(bRT, "registro"),
    papel: str(bRT, "papel"),
  },
  gestor: {
    nome: str(bGestor, "nome"),
    papel: str(bGestor, "papel"),
    formacao: str(bGestor, "formacao"),
  },
  equipe,
  tratamentos,
  depoimentos,
  missao: /export const MISSAO =\s*\n?\s*"((?:[^"\\]|\\.)*)"/.exec(t)?.[1],
};

dados.clinica.enderecoLinha = `${dados.clinica.endereco.logradouro} — ${dados.clinica.endereco.bairro}, ${dados.clinica.endereco.cidade} - ${dados.clinica.endereco.uf}`;

/**
 * A TRANCA. Um campo que não veio vira erro aqui, e não "undefined" num PNG.
 *
 * `historia.anos` e `avaliacoes.total` entram na lista porque são exatamente os
 * dois que aparecem em arte e que mudam com o tempo — se o formato de `jp.ts`
 * mudar e o regex parar de casar, é melhor o render nem começar.
 */
const obrigatorios = [
  ["siteUrl", dados.siteUrl],
  ["avaliacoes.nota", dados.avaliacoes.nota],
  ["avaliacoes.total", dados.avaliacoes.total],
  ["clinica.nome", dados.clinica.nome],
  ["clinica.telefone", dados.clinica.telefone],
  ["clinica.whatsapp", dados.clinica.whatsapp],
  ["clinica.horario", dados.clinica.horario],
  ["clinica.endereco.logradouro", dados.clinica.endereco.logradouro],
  ["historia.anos", dados.historia.anos],
  ["historia.fundacao", dados.historia.fundacao],
  ["historia.regiaoAtual", dados.historia.regiaoAtual],
  ["responsavelTecnica.nome", dados.responsavelTecnica.nome],
  ["responsavelTecnica.registro", dados.responsavelTecnica.registro],
];

const faltando = obrigatorios.filter(([, v]) => v === undefined || v === null).map(([k]) => k);
if (faltando.length > 0) {
  console.error("Campos não encontrados em src/lib/jp.ts:", faltando.join(", "));
  process.exit(1);
}
if (dados.equipe.length === 0) {
  console.error("EQUIPE veio vazia — o formato de src/lib/jp.ts mudou.");
  process.exit(1);
}
if (dados.equipe.some((p) => !p.nome)) {
  console.error("Membro de EQUIPE sem nome — conferir o extrator.");
  process.exit(1);
}
if (dados.tratamentos.length === 0) {
  console.error("TRATAMENTOS veio vazio — o formato de src/lib/jp.ts mudou.");
  process.exit(1);
}

await mkdir(dirname(DESTINO), { recursive: true });
await writeFile(DESTINO, `${JSON.stringify(dados, null, 2)}\n`, "utf8");

console.log(`dados-jp.json gerado a partir de ${ORIGEM}`);
console.log(
  `  ${dados.avaliacoes.notaBR} no Google · ${String(dados.avaliacoes.total)} avaliações · ` +
    `${String(dados.historia.anos)} anos · ${String(dados.equipe.length)} pessoas na equipe · ` +
    `${String(dados.tratamentos.length)} tratamentos`,
);
