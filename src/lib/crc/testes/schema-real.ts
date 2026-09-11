/**
 * O schema real, lido dos arquivos SQL — a fonte de verdade sobre colunas.
 *
 * POR QUE ISTO EXISTE, e a história é curta e cara: o banco em memória de
 * `banco-memoria.ts` não tem schema. Ele guarda objetos. Um teste que semeia
 * `{ direcao: "IN" }` e um código que lê `direcao === "IN"` concordam
 * perfeitamente entre si — e os dois estão errados, porque a coluna real só
 * aceita `ENTRADA` e `SAIDA`.
 *
 * Foi exatamente o que aconteceu: três consultas do runtime referenciavam
 * colunas que não existem (`crc_conversations.telefone`,
 * `crc_opportunities.etapa`, `crc_opportunities.status`), os testes passavam
 * todos, e o agente jamais teria montado contexto contra o Postgres de verdade.
 *
 * A CORREÇÃO NÃO É CONFERIR AS TRÊS. É tornar impossível a quarta.
 *
 * Este módulo lê `supabase/*.sql` e devolve, por tabela, o conjunto de colunas
 * que existem de fato. Dois consumidores usam isso:
 *
 *   `banco-memoria.ts`  recusa semear ou gravar coluna inexistente, o que faz
 *                       TODOS os testes virarem teste de schema sem que nenhum
 *                       deles precise ser reescrito.
 *
 *   `schema.test.ts`    varre o código-fonte e falha quando encontra uma
 *                       coluna que o SQL não declara — inclusive em caminho que
 *                       nenhum teste exercita.
 *
 * NÃO É UM PARSER DE SQL. É um leitor de um dialeto restrito: o que os arquivos
 * `supabase/*.sql` deste projeto usam. Se alguém escrever DDL exótico, o
 * conjunto fica incompleto — e o efeito é uma coluna real ser recusada, que é
 * barulhento e fácil de achar, em vez de uma coluna falsa ser aceita.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Palavras que começam uma linha de restrição, não de coluna. */
const NAO_E_COLUNA = new Set([
  "primary",
  "unique",
  "foreign",
  "constraint",
  "check",
  "exclude",
  "like",
  "inherits",
]);

export type Schema = Readonly<Record<string, ReadonlySet<string>>>;

let cache: Schema | null = null;

/**
 * Tira os comentários `--` do SQL antes de qualquer análise.
 *
 * NÃO É FRESCURA DE PARSER. O `10-crc-casos-humanos.sql` escreve:
 *
 *     alter table public.crc_conversations
 *       -- 'ia' | 'humano' | 'ninguem'
 *       add column if not exists dono text ...
 *
 * O comentário no meio faz qualquer regex de `alter … add column` errar, e o
 * efeito é a coluna `dono` — que existe — ser reportada como inexistente. Um
 * verificador que dá alarme falso é desligado, e aí ele não verifica mais nada.
 */
export function semComentariosSql(sql: string): string {
  return sql
    .split("\n")
    .map((linha) => {
      const i = linha.indexOf("--");
      return i < 0 ? linha : linha.slice(0, i);
    })
    .join("\n");
}

/** A pasta `supabase/`, a partir da raiz do repositório. */
function pastaSql(): string {
  // `process.cwd()` é a raiz do projeto tanto no vitest quanto nos scripts.
  return join(process.cwd(), "supabase");
}

/**
 * Lê todos os `.sql` e monta tabela → colunas.
 *
 * A ORDEM DOS ARQUIVOS IMPORTA: `create table` vem antes dos `alter table add
 * column` que outros arquivos acrescentam. Ordenar por nome dá a mesma ordem em
 * que eles são rodados à mão, que é a ordem em que fazem sentido.
 */
export function lerSchemaReal(): Schema {
  if (cache !== null) return cache;

  const pasta = pastaSql();
  const arquivos = readdirSync(pasta)
    .filter((n) => n.endsWith(".sql"))
    .sort();

  const tabelas: Record<string, Set<string>> = {};

  for (const nome of arquivos) {
    const sql = semComentariosSql(readFileSync(join(pasta, nome), "utf8"));
    lerCreateTable(sql, tabelas);
    lerAlterTable(sql, tabelas);
  }

  cache = tabelas;
  return tabelas;
}

function lerCreateTable(sql: string, tabelas: Record<string, Set<string>>): void {
  // `create table if not exists public.X (` … até um `);` no começo da linha.
  const re =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/giu;

  for (const m of sql.matchAll(re)) {
    const tabela = (m[1] ?? "").toLowerCase();
    const corpo = m[2] ?? "";
    const colunas = tabelas[tabela] ?? new Set<string>();

    for (const linha of corpo.split("\n")) {
      const limpa = linha.trim();
      if (limpa.length === 0 || limpa.startsWith("--")) continue;

      const nome = /^([a-z_][a-z0-9_]*)\s+/u.exec(limpa)?.[1];
      if (nome === undefined || NAO_E_COLUNA.has(nome)) continue;
      colunas.add(nome);
    }

    tabelas[tabela] = colunas;
  }
}

function lerAlterTable(sql: string, tabelas: Record<string, Set<string>>): void {
  // `alter table public.X \n add column if not exists Y tipo`
  const re =
    /alter\s+table\s+(?:public\.)?([a-z0-9_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/giu;

  for (const m of sql.matchAll(re)) {
    const tabela = (m[1] ?? "").toLowerCase();
    const coluna = m[2] ?? "";
    const colunas = tabelas[tabela] ?? new Set<string>();
    colunas.add(coluna);
    tabelas[tabela] = colunas;
  }
}

/**
 * A coluna existe nesta tabela?
 *
 * TABELA DESCONHECIDA DEVOLVE `true`, e isso é deliberado: o portal de RH tem
 * tabelas próprias no `01-schema.sql` com outro estilo, e o banco em memória é
 * usado por testes que não são do CRC. Recusar o que não se conhece
 * transformaria este módulo numa fonte de falso alarme — e um alarme que grita
 * sem motivo é desligado na primeira semana.
 */
export function colunaExiste(tabela: string, coluna: string): boolean {
  const schema = lerSchemaReal();
  const colunas = schema[tabela];
  if (colunas === undefined) return true;
  return colunas.has(coluna);
}

/**
 * Tira comentário de TypeScript, respeitando string.
 *
 * PRECISA RESPEITAR STRING por causa de uma linha só: `"https://api.openai.com"`.
 * Um stripper ingênuo corta em `//` e transforma a URL em `"https:` — string
 * não terminada, e o resto do arquivo vira lixo.
 *
 * E precisa existir porque este projeto comenta MUITO em português, com o
 * padrão "Palavra: explicação". `rebaixamento:` dentro de um comentário é
 * indistinguível de uma chave de objeto para qualquer regex.
 */
export function semComentariosTs(fonte: string): string {
  let fora = "";
  let aspas: string | null = null;
  let i = 0;

  while (i < fonte.length) {
    const c = fonte[i] ?? "";
    const prox = fonte[i + 1] ?? "";

    if (aspas !== null) {
      fora += c;
      if (c === "\\") {
        fora += prox;
        i += 2;
        continue;
      }
      if (c === aspas) aspas = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      aspas = c;
      fora += c;
      i += 1;
      continue;
    }

    if (c === "/" && prox === "/") {
      while (i < fonte.length && fonte[i] !== "\n") i += 1;
      continue;
    }

    if (c === "/" && prox === "*") {
      i += 2;
      while (i < fonte.length && !(fonte[i] === "*" && fonte[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }

    fora += c;
    i += 1;
  }

  return fora;
}

/** As tabelas que este módulo conseguiu ler. Para o teste conferir a si mesmo. */
export function tabelasConhecidas(): string[] {
  return Object.keys(lerSchemaReal()).sort();
}
