/**
 * As invariantes que o TypeScript não consegue expressar — Fase 2 da auditoria.
 *
 * ============================================================================
 *  POR QUE UM TESTE QUE LÊ CÓDIGO-FONTE, e não mais um teste de comportamento.
 *
 *  Os defeitos que mais voltaram neste sistema não são erros de lógica: são
 *  CLASSES. O mesmo engano, escrito de novo por uma pessoa diferente, num
 *  arquivo diferente, seis meses depois. Nenhum teste de comportamento pega
 *  isso, porque o comportamento novo nunca foi testado — ele é novo.
 *
 *  O exemplo desta casa é o `limite:`. Ele apareceu QUATRO VEZES:
 *
 *    · o recall lia 200 pacientes e chamava de base;
 *    · o aniversário lia 2.000 e chamava de base;
 *    · a campanha lia 5.000 e chamava de público;
 *    · a analítica lia 3.000 e chamava de total.
 *
 *  Quatro pessoas-momento diferentes escrevendo a mesma frase: um número que
 *  foi posto como PROTEÇÃO e foi lido como RESULTADO. Corrigir as quatro não
 *  impede a quinta. Um teste que lê o fonte, sim.
 * ============================================================================
 *
 * CADA INVARIANTE AQUI TEM TRÊS PARTES, e nenhuma é opcional:
 *
 *   A REGRA, escrita como varredura.
 *   UM CONTROLE POSITIVO, provando que a varredura enxerga os arquivos certos
 *     — sem ele, um scanner quebrado que devolve lista vazia passa para sempre.
 *   UMA INJEÇÃO DE DEFEITO, em `scripts/injetar-defeitos-arquitetura.mjs`,
 *     provando que a regra REPROVA quando o defeito volta.
 *
 * AS EXCEÇÕES SÃO EXPLÍCITAS E DATADAS, e nunca heurísticas. Uma heurística
 * que "sabe" quando um caso é aceitável é uma regra que ninguém consegue
 * auditar — e, no dia em que ela erra, erra em silêncio.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/* -------------------------------------------------------------------------- */
/* Varredura                                                                  */
/* -------------------------------------------------------------------------- */

function arquivosTs(raiz: string, incluirTeste = false): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) {
      saida.push(...arquivosTs(caminho, incluirTeste));
    } else if (/\.tsx?$/u.test(nome) && (incluirTeste || !/\.test\.tsx?$/u.test(nome))) {
      saida.push(caminho);
    }
  }
  return saida;
}

/** Caminho com `/`, para a exceção não depender do separador do sistema. */
const comBarras = (caminho: string): string => caminho.split("\\").join("/");

/**
 * Tira comentários PRESERVANDO AS QUEBRAS DE LINHA.
 *
 * A versão ingênua disto — apagar o trecho — desloca todos os números de linha
 * depois do primeiro comentário, e o relatório passa a apontar dezenas de
 * linhas fora do lugar. Já aconteceu neste repositório, em
 * `escopo-de-tenant.test.ts`, e custou meia hora de procurar bug onde não tinha.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//gu, (bloco) => bloco.replace(/[^\n]/gu, " "))
    .replace(/(^|[^:])\/\/[^\n]*/gu, (_t, antes: string) => antes);
}

/* ========================================================================== */
/* 1. Consulta limitada tratada como base inteira                             */
/* ========================================================================== */

/**
 * Sinais de que o resultado de uma leitura está sendo usado como TOTAL.
 *
 * `.length` entra apenas quando NÃO é comparação: `linhas.length === 0` é uma
 * guarda de "veio alguma coisa?", e não uma afirmação sobre o tamanho da base.
 */
function sinaisDeAgregacao(janela: string, nome: string): string[] {
  const sinais: string[] = [];
  if (janela.includes(`${nome}.reduce(`)) sinais.push("reduce");
  if (new RegExp(`somarDinheiro\\([^)]*${nome}`, "u").test(janela)) sinais.push("somarDinheiro");
  if (new RegExp(`new Set\\(\\s*${nome}`, "u").test(janela)) sinais.push("Set");
  if (new RegExp(`for\\s*\\(const \\w+ of ${nome}\\)`, "u").test(janela)) sinais.push("for-of");
  if (new RegExp(`${nome}\\.length(?!\\s*[=><!]==?)`, "u").test(janela)) sinais.push(".length");
  return sinais;
}

/**
 * Um teto é "grande" a partir de 100.
 *
 * Abaixo disso o número quase sempre é um limite de NEGÓCIO — "os 3 orçamentos
 * mais recentes", "as 20 cobranças abertas" —, e não uma tentativa de ler a
 * base. Pôr o piso em zero encheria o relatório de ruído, e um relatório
 * ruidoso é um relatório que as pessoas param de ler.
 */
const PISO_DE_TETO_GRANDE = 100;

type Achado = { local: string; teto: string; variavel: string; sinais: string[] };

function lerTetosAgregados(): Achado[] {
  const achados: Achado[] = [];

  for (const caminho of arquivosTs("src/lib/crc")) {
    if (comBarras(caminho).includes("/testes/")) continue;
    const linhas = semComentarios(readFileSync(caminho, "utf8")).split("\n");

    linhas.forEach((linha, i) => {
      const m = /^\s*limite:\s*([^,]+),?\s*$/u.exec(linha);
      if (m === null) return;

      const bruto = (m[1] ?? "").trim();
      const literal = /^\d+$/u.test(bruto) ? Number.parseInt(bruto, 10) : null;
      const constante = /^[A-Z_]{3,}$/u.test(bruto);

      // Teto pequeno: limite de negócio, não tentativa de ler a base.
      if (literal !== null && literal < PISO_DE_TETO_GRANDE) return;
      // Expressão derivada do próprio dado (`ids.length`, `Math.min(...)`):
      // o tamanho vem de quem chama, e não é um teto fixo escondido.
      if (literal === null && !constante) return;

      let variavel: string | null = null;
      for (let j = i; j >= Math.max(0, i - 25); j -= 1) {
        const d = /const\s+(\w+)\s*=\s*await\s+(?:selecionar|rpc)\(/u.exec(linhas[j] ?? "");
        if (d?.[1] !== undefined) {
          variavel = d[1];
          break;
        }
      }
      if (variavel === null) return;

      const sinais = sinaisDeAgregacao(linhas.slice(i, i + 60).join("\n"), variavel);
      if (sinais.length > 0) {
        achados.push({
          local: `${comBarras(caminho)}:${String(i + 1)}`,
          teto: bruto,
          variavel,
          sinais,
        });
      }
    });
  }

  return achados;
}

/**
 * Os casos conhecidos, com o motivo de cada um e o tamanho em que ele deixa
 * de valer — auditado à mão em 13/09/2026.
 *
 * NÃO É UMA LISTA DE PERDÃO. É a diferença entre "não sabemos" e "sabemos,
 * medimos, e este é o ponto em que passa a doer". Quem acrescentar uma linha
 * aqui está assumindo essa conta por escrito.
 */
const TETOS_CONHECIDOS: readonly { local: string; porque: string }[] = [
  {
    local: "src/lib/crc/aplicacao/agendamento.ts",
    porque:
      "crc_dentists, teto 100. Mapa de nomes; dentista faltando cai num rótulo " +
      "genérico e nada some. Uma clínica com mais de 100 dentistas é outro produto.",
  },
  {
    local: "src/lib/crc/aplicacao/agent-jobs.ts",
    porque:
      "crc_agent_jobs, teto 500. Painel da fila: com mais de 500 jobs a contagem " +
      "sai menor — e fila cheia é exatamente quando o número importa. " +
      "PENDENTE DE CORREÇÃO, e não aceito para sempre.",
  },
  {
    local: "src/lib/crc/aplicacao/avaliacao.ts",
    porque:
      "crc_eval_casos, teto 200. Instalação idempotente dos casos padrão. " +
      "Acima de 200 casos existentes, um nome padrão além do corte seria " +
      "reinserido. A lista padrão é fixa e pequena.",
  },
  {
    local: "src/lib/crc/aplicacao/campanhas.ts",
    porque:
      "crc_patients, teto 5000. Monta as opções de especialidade e convênio do " +
      "filtro. Numa base maior, uma especialidade inteira some do seletor e o " +
      "segmento fica inalcançável. PENDENTE DE CORREÇÃO — é o mais provável " +
      "desta lista, porque 5.000 pacientes é uma clínica comum.",
  },
  {
    local: "src/lib/crc/aplicacao/conhecimento.ts",
    porque:
      "crc_knowledge_chunks, teto 2000. Contagem de pedaços por fonte. Acima " +
      "disso a contagem sai menor. É número informativo, não decisório.",
  },
  {
    local: "src/lib/crc/aplicacao/equipe.ts",
    porque: "crc_users, teto 200. Lista a equipe da clínica. 200 pessoas é outro porte.",
  },
  {
    local: "src/lib/crc/aplicacao/estudios.ts",
    porque: "crc_agent_studios, teto 100. Listagem de estúdios; o número é pequeno por desenho.",
  },
  {
    local: "src/lib/crc/aplicacao/exportacao.ts",
    porque:
      "Exportação pagina explicitamente com LIMITE e cursor — o teto é o tamanho " +
      "da PÁGINA, e o laço percorre a base inteira.",
  },
  {
    local: "src/lib/crc/aplicacao/investimento.ts",
    porque:
      "crc_ad_spend, teto 200. Uma linha por (mês, campanha), digitada à mão. " +
      "200 campanhas num mês só acontece em conta gerida por agência.",
  },
  {
    local: "src/lib/crc/aplicacao/metas.ts",
    porque:
      "crc_goal_actions, teto 1000, para as metas da página. Acima disso uma " +
      "meta perderia ações na tela. PENDENTE DE CORREÇÃO.",
  },
  {
    local: "src/lib/crc/aplicacao/repositorios.ts",
    porque: "Leitura em lote por lista de ids; o teto acompanha o tamanho do lote.",
  },
  {
    local: "src/lib/crc/aplicacao/saude.ts",
    porque:
      "Painel de saúde: os tetos limitam listas de INCIDENTES mostradas na tela, " +
      "e a tela diz que são os primeiros. Não são totais.",
  },
  {
    local: "src/lib/crc/aplicacao/sincronizacao.ts",
    porque: "Sincronização em lotes; o teto é o tamanho do lote e o laço avança com cursor.",
  },
  {
    local: "src/lib/crc/automacao/volta-pesada.ts",
    porque: "crc_clinics, teto 500. Clínicas de uma organização; 500 é outro produto.",
  },
];

describe("nenhuma consulta limitada é tratada como base inteira", () => {
  const achados = lerTetosAgregados();

  it("a varredura enxerga o código — controle positivo", () => {
    /*
     * Sem isto, um `lerTetosAgregados` quebrado que devolvesse `[]` faria o
     * teste abaixo passar para sempre, e a invariante viraria enfeite.
     */
    expect(arquivosTs("src/lib/crc").length).toBeGreaterThan(50);
    expect(achados.length).toBeGreaterThan(0);
  });

  it("toda leitura com teto grande que vira total está na lista auditada", () => {
    const conhecidos = new Set(TETOS_CONHECIDOS.map((t) => t.local));
    const novos = achados.filter((a) => !conhecidos.has(a.local.split(":")[0] ?? ""));

    expect(
      novos.map((a) => `${a.local}  limite: ${a.teto}  ${a.variavel} -> ${a.sinais.join(", ")}`),
      [
        "Uma leitura com teto grande está sendo usada como se fosse a base inteira.",
        "",
        "Esse é o defeito que já apareceu quatro vezes neste sistema: um número",
        "escrito como PROTEÇÃO e lido como RESULTADO. Ele não dá erro, não dá",
        "aviso, e produz um número plausível e menor que a realidade.",
        "",
        "Três saídas, nesta ordem de preferência:",
        "  1. agregue no Postgres — é o caminho de supabase/40 a 44;",
        "  2. pagine com cursor e percorra a base, como exportacao.ts faz;",
        "  3. se o teto for mesmo aceitável, acrescente a TETOS_CONHECIDOS",
        "     dizendo POR QUE e a partir de que tamanho deixa de valer.",
      ].join("\n"),
    ).toEqual([]);
  });
});

/* ========================================================================== */
/* 2. O domínio não lê o relógio global                                       */
/* ========================================================================== */

/**
 * O `new Date()` desta posição é o PADRÃO DE UM PARÂMETRO?
 *
 * ============================================================================
 *  A PRIMEIRA VERSÃO DESTA REGRA ACEITAVA QUALQUER ATRIBUIÇÃO — o teste dizia
 *  "fora de parâmetro com padrão" e a varredura perguntava só se havia um
 *  `nome = ` antes. `export const agora = new Date()` passava direto.
 *
 *  Quem pegou isso foi a injeção de defeito: 3 de 4 invariantes morderam, e
 *  esta não. Sem ela, a regra teria sido comitada verde e inútil — que é
 *  exatamente o estado mais perigoso de uma fitness function, porque ela
 *  parece proteção.
 * ============================================================================
 *
 * DUAS FORMAS VALEM, e nada mais:
 *
 *   dentro de uma lista de parâmetros aberta na mesma linha —
 *       function f(x: X, agora = new Date()) {}
 *
 *   sozinha numa linha de assinatura quebrada —
 *       function f(
 *         agora = new Date(),
 *       ) {}
 *
 * `const`, `let`, `var`, `return` e propriedade de objeto NÃO valem: nenhum
 * deles é um parâmetro, e todos tornam a função impura.
 */
function ehPadraoDeParametro(linha: string, posicao: number): boolean {
  const antes = linha.slice(0, posicao);

  // Declaração é o oposto de parâmetro. Se há uma antes, não é padrão.
  if (/\b(?:const|let|var|return)\b/u.test(antes)) return false;

  const terminaEmAtribuicao = /\w+\s*(?::\s*[\w<>[\]|. ]+)?\s*=\s*$/u.test(antes);
  if (!terminaEmAtribuicao) return false;

  // Parêntese aberto e não fechado antes: estamos dentro da assinatura.
  const abertos = (antes.match(/\(/gu) ?? []).length - (antes.match(/\)/gu) ?? []).length;
  if (abertos > 0) return true;

  // Assinatura quebrada em várias linhas: a linha é só o parâmetro.
  return /^\s*\w+\s*(?::\s*[\w<>[\]|. ]+)?\s*=\s*(?:new Date\(\s*\)|Date\.now\(\s*\)),?\s*$/u.test(
    linha,
  );
}

describe("o domínio recebe o instante, e não vai buscá-lo", () => {
  /*
   * POR QUE ISTO IMPORTA MAIS AQUI DO QUE EM OUTRAS CAMADAS.
   *
   * `dominio/` é a camada pura: dado entra, decisão sai. Um `new Date()` no
   * meio de uma decisão faz três estragos de uma vez —
   *
   *   o teste não consegue fixar o instante sem mexer no relógio do processo;
   *   a mesma entrada passa a dar saídas diferentes;
   *   e o bug de fuso volta pela porta dos fundos, porque o instante deixa de
   *   vir de quem conhece o fuso da clínica.
   *
   * A FORMA PERMITIDA É O PARÂMETRO COM PADRÃO — `agora = new Date()`. Ela dá
   * o mesmo conforto para quem chama e mantém o teste no controle.
   */
  const arquivos = arquivosTs("src/lib/crc/dominio");

  it("a varredura enxerga o domínio — controle positivo", () => {
    expect(arquivos.length).toBeGreaterThan(10);
  });

  it("nenhum `new Date()` ou `Date.now()` fora de parâmetro com padrão", () => {
    const violacoes: string[] = [];

    for (const caminho of arquivos) {
      const linhas = semComentarios(readFileSync(caminho, "utf8")).split("\n");
      linhas.forEach((linha, i) => {
        const achado = /new Date\(\s*\)|Date\.now\(\s*\)/u.exec(linha);
        if (achado?.index === undefined) return;
        if (ehPadraoDeParametro(linha, achado.index)) return;
        violacoes.push(`${comBarras(caminho)}:${String(i + 1)}  ${linha.trim()}`);
      });
    }

    expect(
      violacoes,
      [
        "O domínio leu o relógio em vez de recebê-lo.",
        "",
        "Troque por um parâmetro com padrão:",
        "",
        "    export function decidir(x: X, agora = new Date()) { ... }",
        "",
        "Quem chama continua podendo omitir; o teste passa a poder fixar.",
      ].join("\n"),
    ).toEqual([]);
  });
});

/* ========================================================================== */
/* 3. Receita potencial nunca é somada como confirmada                        */
/* ========================================================================== */

describe("receita confirmada e potencial não se misturam", () => {
  /*
   * O item 63 é explícito: enquanto não houver registro financeiro, o número
   * grande da tela é "valor potencial", porque é o que ele é.
   *
   * A regra vira SQL em `natureza = 'CONFIRMADA'`. Um `sum(valor)` sobre
   * `crc_revenue_events` sem esse filtro soma orçamento aberto com dinheiro
   * recebido — e o resultado é o número mais bonito e menos verdadeiro que este
   * sistema consegue produzir.
   */
  const sqls = readdirSync("supabase")
    .filter((n) => n.endsWith(".sql"))
    .map((n) => ({ nome: n, texto: readFileSync(join("supabase", n), "utf8") }));

  it("a varredura enxerga as migrações — controle positivo", () => {
    expect(sqls.length).toBeGreaterThan(30);
    expect(sqls.some((s) => s.texto.includes("crc_revenue_events"))).toBe(true);
  });

  it("todo `sum` sobre crc_revenue_events fala de `natureza`", () => {
    const violacoes: string[] = [];

    for (const { nome, texto } of sqls) {
      // Cada `create ... function` é analisada isoladamente: um `natureza` que
      // aparece na função de cima não vale de álibi para a função de baixo.
      for (const corpo of texto.split(/create\s+or\s+replace\s+function/iu)) {
        if (!/sum\s*\(/iu.test(corpo)) continue;
        if (!/crc_revenue_events/u.test(corpo)) continue;
        if (/natureza/u.test(corpo)) continue;
        violacoes.push(`${nome}: soma crc_revenue_events sem falar de natureza`);
      }
    }

    expect(
      violacoes,
      "Somar `crc_revenue_events` sem separar por `natureza` mistura orçamento " +
        "aberto com dinheiro recebido. O item 63 proíbe — e o número resultante é " +
        "o mais bonito e menos verdadeiro que este sistema consegue produzir.",
    ).toEqual([]);
  });
});

/* ========================================================================== */
/* 4. A superfície do cliente não importa o servidor estaticamente            */
/* ========================================================================== */

describe("nenhuma tela importa o servidor estaticamente", () => {
  /*
   * ==========================================================================
   *  O QUE ESTÁ EM JOGO NÃO É ORGANIZAÇÃO. É SEGREDO.
   *
   *  `servidor/banco.ts` lê `SUPABASE_SERVICE_ROLE`. Um import ESTÁTICO desse
   *  módulo a partir de um componente arrasta o módulo para o grafo do bundle
   *  do navegador. Se algum dia uma dessas chaves virar `VITE_`, ou se um
   *  bundler resolver embutir o valor, o segredo vai junto — e o sintoma é
   *  nenhum: a tela funciona igual.
   *
   *  A FORMA CERTA é o `await import()` DENTRO do handler, que é o que todas as
   *  rotas de API deste projeto já fazem. O import dinâmico dentro de uma
   *  server fn fica no lado do servidor; o estático, não.
   * ==========================================================================
   */
  const telas = [...arquivosTs("src/components", true), ...arquivosTs("src/routes", true)];

  it("a varredura enxerga as telas — controle positivo", () => {
    expect(telas.length).toBeGreaterThan(30);
  });

  it("`servidor/` só entra por `await import()`", () => {
    const violacoes: string[] = [];

    for (const caminho of telas) {
      const fonte = semComentarios(readFileSync(caminho, "utf8"));
      for (const achado of fonte.matchAll(
        /^\s*import\s[^;]*?from\s*["']([^"']*(?:@\/lib\/crc|\.\.?)\/(?:.*\/)?servidor\/[^"']*)["']/gmu,
      )) {
        violacoes.push(`${comBarras(caminho)}  import estático de ${achado[1] ?? "?"}`);
      }
    }

    expect(
      violacoes,
      [
        "Uma tela importou `servidor/` estaticamente.",
        "",
        "Isso puxa o módulo para o grafo do bundle do navegador — e `servidor/`",
        "é onde vive a chave de serviço do banco. O sintoma seria nenhum: a tela",
        "continua funcionando.",
        "",
        "Use `await import()` DENTRO do handler, como as rotas de API fazem:",
        "",
        '    const { selecionar } = await import("@/lib/crc/servidor/banco");',
      ].join("\n"),
    ).toEqual([]);
  });
});
