/**
 * O teste de contrato entre o código e o schema SQL.
 *
 * ELE EXISTE POR CAUSA DE TRÊS BUGS QUE TODOS OS OUTROS TESTES DEIXARAM PASSAR:
 *
 *   `crc_conversations.telefone`      não existe. A coluna é `contato_externo`.
 *   `crc_opportunities.etapa`         não existe. É `stage_id`, uma FK.
 *   `crc_opportunities.status`        não existe. O que fecha é `fechada_em`.
 *
 * Nenhum deles aparecia, porque o banco em memória guarda objetos e não tem
 * schema: um teste que semeia `{ telefone: "..." }` e um código que lê
 * `telefone` concordam entre si, e os dois estão errados.
 *
 * COMO ESTE TESTE FUNCIONA: ele varre `src/lib/crc/**` procurando chamadas a
 * `selecionar`, `inserir`, `atualizar` e companhia, extrai o nome da tabela e
 * todas as colunas citadas, e confere contra `supabase/*.sql`.
 *
 * O QUE ELE NÃO PEGA, dito para ninguém confiar demais: coluna montada em
 * variável, tabela escolhida em runtime, e valor de enum errado (`"IN"` em vez
 * de `"ENTRADA"`). Para o enum existe teste próprio, e o banco em memória
 * passou a recusar coluna inexistente — o que cobre o caminho que os testes
 * exercitam de verdade.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { colunaExiste, lerSchemaReal, semComentariosTs, tabelasConhecidas } from "./schema-real";

/* -------------------------------------------------------------------------- */
/* A varredura do código                                                      */
/* -------------------------------------------------------------------------- */

/** As funções de `servidor/banco.ts` cuja primeira string é uma tabela. */
const FUNCOES = [
  "selecionar",
  "selecionarUm",
  "inserir",
  "gravar",
  "atualizar",
  "apagar",
  "contar",
];

/**
 * Chaves que são OPÇÃO da consulta, e não coluna da tabela.
 *
 * Sem esta lista, `filtros:` e `limite:` seriam reportados como colunas
 * inexistentes em toda chamada — e o teste viraria ruído.
 */
const OPCOES = new Set([
  "colunas",
  "filtros",
  "ordenar",
  "limite",
  "deslocamento",
  "contarTotal",
  "ou",
  "coluna",
  "op",
  "valor",
  "ascendente",
  "nullsPrimeiro",
]);

function arquivosTs(raiz: string): string[] {
  const fora: string[] = [];
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) {
      fora.push(...arquivosTs(caminho));
    } else if (/\.tsx?$/u.test(nome) && !/\.test\.tsx?$/u.test(nome)) {
      fora.push(caminho);
    }
  }
  return fora;
}

/** Devolve o texto da chamada inteira, balanceando parênteses. */
function spanDaChamada(fonte: string, inicio: number): string {
  let profundidade = 0;
  for (let i = inicio; i < fonte.length; i += 1) {
    const c = fonte[i];
    if (c === "(") profundidade += 1;
    else if (c === ")") {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(inicio, i + 1);
    }
  }
  return fonte.slice(inicio, inicio + 2000);
}

/**
 * As chaves de objeto que estão exatamente UM nível de chaves dentro da chamada.
 *
 * `inserir("t", { a: 1, b: { c: 2 } })` devolve `a` e `b`, nunca `c`. É a
 * diferença entre "coluna da tabela" e "campo dentro de um jsonb".
 *
 * Ignora o que está dentro de string: um `texto: "algo: assim"` não pode virar
 * uma coluna chamada `assim`.
 */
function chavesDeNivelUm(span: string): string[] {
  const fora: string[] = [];
  let chaves = 0;
  let aspas: string | null = null;

  for (let i = 0; i < span.length; i += 1) {
    const c = span[i] ?? "";

    if (aspas !== null) {
      if (c === "\\") i += 1;
      else if (c === aspas) aspas = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      aspas = c;
      continue;
    }
    if (c === "{") {
      chaves += 1;
      continue;
    }
    if (c === "}") {
      chaves -= 1;
      continue;
    }

    if (chaves !== 1) continue;

    const resto = span.slice(i);
    const m = /^([a-z_][a-z0-9_]*):\s/u.exec(resto);
    if (m !== null) {
      // Só conta quando o que vem antes é abertura, vírgula ou espaço — senão
      // `a ? b : c` e nomes qualificados entrariam.
      const anterior = i === 0 ? "{" : (span[i - 1] ?? "");
      if (/[{,\s]/u.test(anterior)) {
        fora.push(m[1] ?? "");
        i += (m[1] ?? "").length;
      }
    }
  }

  return fora;
}

export type Uso = {
  arquivo: string;
  tabela: string;
  coluna: string;
};

/** Todas as colunas citadas por chamada de banco, com a tabela de cada uma. */
function coletarUsos(): Uso[] {
  const raiz = join(process.cwd(), "src", "lib", "crc");
  const usos: Uso[] = [];

  for (const arquivo of arquivosTs(raiz)) {
    // Sem comentário: este projeto escreve "Palavra: explicação" o tempo todo,
    // e `rebaixamento:` num comentário é igual a uma chave de objeto para
    // qualquer regex.
    const fonte = semComentariosTs(readFileSync(arquivo, "utf8"));
    const curto = arquivo.slice(arquivo.indexOf("src"));

    for (const fn of FUNCOES) {
      const re = new RegExp(`\\b${fn}(?:<[^>]*>)?\\s*\\(\\s*"([a-z0-9_]+)"`, "gu");
      for (const m of fonte.matchAll(re)) {
        const tabela = m[1] ?? "";
        const abre = fonte.indexOf("(", m.index);
        const span = spanDaChamada(fonte, abre);

        // `colunas: "a,b,c"`
        for (const c of span.matchAll(/colunas:\s*"([^"]*)"/gu)) {
          for (const nome of (c[1] ?? "").split(",")) {
            const limpo = nome.trim();
            if (limpo.length > 0 && limpo !== "*")
              usos.push({ arquivo: curto, tabela, coluna: limpo });
          }
        }

        // `{ coluna: "x", op: ... }` — filtros e ordenação.
        for (const c of span.matchAll(/coluna:\s*"([a-z0-9_]+)"/gu)) {
          usos.push({ arquivo: curto, tabela, coluna: c[1] ?? "" });
        }

        // As chaves de objeto de PRIMEIRO NÍVEL são colunas de escrita.
        //
        // A profundidade importa: `{ bloqueios: [{ categoria, caso }] }` grava
        // UMA coluna `jsonb` chamada `bloqueios`. `categoria` e `caso` são
        // conteúdo do jsonb, não colunas — e reportá-las faria o verificador
        // acusar três bugs onde não há nenhum.
        for (const chave of chavesDeNivelUm(span)) {
          if (!OPCOES.has(chave)) usos.push({ arquivo: curto, tabela, coluna: chave });
        }
      }
    }
  }

  return usos;
}

/* -------------------------------------------------------------------------- */

describe("o leitor do schema real", () => {
  it("consegue ler as tabelas do CRC", () => {
    const tabelas = tabelasConhecidas();
    // Se o parser quebrar, ele devolve pouca coisa — e o teste abaixo passaria
    // por vacuidade, sem conferir nada. Este `it` é a guarda contra isso.
    expect(tabelas.length).toBeGreaterThan(40);
    expect(tabelas).toContain("crc_conversations");
    expect(tabelas).toContain("crc_messages");
    expect(tabelas).toContain("crc_opportunities");
    expect(tabelas).toContain("crc_agent_versions");
  });

  it("lê as colunas que os três bugs citavam errado", () => {
    const schema = lerSchemaReal();

    // O que EXISTE:
    expect(schema["crc_conversations"]?.has("contato_externo")).toBe(true);
    expect(schema["crc_opportunities"]?.has("stage_id")).toBe(true);
    expect(schema["crc_opportunities"]?.has("potential_value")).toBe(true);
    expect(schema["crc_opportunities"]?.has("fechada_em")).toBe(true);

    // O que NÃO existe, e que o runtime pedia:
    expect(schema["crc_conversations"]?.has("telefone")).toBe(false);
    expect(schema["crc_opportunities"]?.has("etapa")).toBe(false);
    expect(schema["crc_opportunities"]?.has("status")).toBe(false);
  });

  it("lê coluna acrescentada por `alter table` em arquivo posterior", () => {
    // `dono` vem do 10 e `agent_version_id` do 15 — os dois por ALTER.
    expect(lerSchemaReal()["crc_conversations"]?.has("dono")).toBe(true);
    expect(lerSchemaReal()["crc_eval_rodadas"]?.has("agent_version_id")).toBe(true);
  });
});

describe("toda coluna que o código pede existe no SQL", () => {
  it("nenhuma consulta do CRC referencia coluna inexistente", () => {
    const usos = coletarUsos();

    // Guarda contra a varredura não ter encontrado nada e passar por vacuidade.
    expect(usos.length).toBeGreaterThan(200);

    const erros = usos
      .filter((u) => !colunaExiste(u.tabela, u.coluna))
      .map((u) => `${u.arquivo}: ${u.tabela}.${u.coluna} não existe no SQL`);

    // A mensagem lista TODAS as divergências, e não a primeira: quem for
    // consertar precisa ver o tamanho do problema de uma vez.
    expect([...new Set(erros)].sort()).toEqual([]);
  });
});
