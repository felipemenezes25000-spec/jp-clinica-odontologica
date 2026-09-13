/**
 * Toda escrita com filtro carrega o `organization_id` — verificado no fonte.
 *
 * ============================================================================
 *  O PROBLEMA NÃO É UM BUG. É UMA PROTEÇÃO QUE FICA INVISÍVEL.
 *
 *  Hoje nenhuma das escritas sem escopo é explorável, e o motivo é sempre o
 *  mesmo: logo acima dela existe uma LEITURA com `organization_id`, e o id que
 *  a escrita usa veio de lá. É o padrão "confere, depois age" — e ele funciona.
 *
 *  O que ele não faz é SOBREVIVER A UMA EDIÇÃO. Quem abrir esse trecho daqui a
 *  três meses vê:
 *
 *      await atualizar("crc_charges", [{ coluna: "id", op: "eq", valor: id }], …)
 *
 *  e não tem como saber que a única coisa que impede aquilo de escrever na
 *  clínica errada está numa linha anterior, que ele talvez esteja justamente
 *  reescrevendo. Trocar a leitura por um parâmetro, mover a escrita para outra
 *  função, reaproveitar o trecho num caminho novo — qualquer um dos três
 *  quebra a proteção sem tocar na linha que a expressa.
 *
 *  RLS NÃO É A RESPOSTA AQUI. Ela existe e vale, mas o CRC escreve com a chave
 *  de serviço nos caminhos de automação — que é justamente onde a varredura, o
 *  motor e os webhooks escrevem. Nesses, quem separa as clínicas é o filtro.
 *
 *  A CORREÇÃO É DEFESA EM PROFUNDIDADE: o filtro passa a dizer sozinho o que
 *  antes dependia do contexto. Se a leitura de cima sumir, a escrita continua
 *  presa ao tenant; se o id vier errado, ela não acha linha nenhuma.
 * ============================================================================
 *
 * COMO ESTE TESTE FUNCIONA: varre `src/lib/crc/**`, acha cada `atualizar` e
 * `apagar`, extrai a tabela e o bloco de filtros balanceando parênteses, e
 * reprova quando a tabela TEM `organization_id` e o filtro não cita.
 *
 * O QUE ELE NÃO PEGA, dito para ninguém confiar demais: filtro montado em
 * variável fora da chamada, e tabela escolhida em runtime. Nos dois casos o
 * texto da chamada não carrega a informação — e é por isso que a lista de
 * exceções abaixo é explícita e datada em vez de heurística.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { colunaExiste } from "./schema-real";

/**
 * Tira comentário SEM MEXER NA CONTAGEM DE LINHAS.
 *
 * `semComentariosTs` do `schema-real` serve ao vizinho e não serve aqui: ele
 * apaga o conteúdo do comentário inteiro, quebras de linha inclusive. Para
 * conferir coluna isso é indiferente; para APONTAR o sítio, não — a mensagem
 * mandaria a pessoa para uma linha que não tem nada a ver, e neste arquivo os
 * comentários são longos, então o desvio é de dezenas de linhas.
 *
 * Aqui cada caractere de comentário vira espaço e cada `\n` sobrevive: o texto
 * fica com o mesmo comprimento e as mesmas linhas do original.
 */
function semComentariosMantendoLinhas(fonte: string): string {
  let fora = "";
  let aspas: string | null = null;
  let i = 0;

  const vazio = (c: string): string => (c === "\n" ? "\n" : " ");

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
      while (i < fonte.length && fonte[i] !== "\n") {
        fora += " ";
        i += 1;
      }
      continue;
    }

    if (c === "/" && prox === "*") {
      fora += "  ";
      i += 2;
      while (i < fonte.length && !(fonte[i] === "*" && fonte[i + 1] === "/")) {
        fora += vazio(fonte[i] ?? "");
        i += 1;
      }
      fora += "  ";
      i += 2;
      continue;
    }

    fora += c;
    i += 1;
  }

  return fora;
}

const RAIZ = "src/lib/crc";

/**
 * Escritas que ficam sem o filtro, cada uma com o motivo.
 *
 * CURTA DE PROPÓSITO, e cada linha é uma afirmação que alguém pode contestar.
 * O valor da lista está em ser explícita: uma escrita fora do tenant que
 * ninguém escreveu aqui é um esquecimento; uma que está aqui é uma decisão.
 *
 * A forma é `arquivo:linha  op tabela`, igual à da mensagem de falha — então
 * quando o número da linha mudar, o teste volta a reprovar e a exceção precisa
 * ser reconfirmada. Isso é de propósito: exceção que sobrevive sozinha a um
 * refactor deixa de ser decisão e vira herança.
 */
const EXCECOES: readonly string[] = [
  /*
   * RETENÇÃO DA PLATAFORMA INTEIRA. `limparConcluidos` apaga job CONCLUÍDO ou
   * DESCARTADO com mais de 30 dias, e é chamada uma vez por `faxina()` — que é
   * manutenção do sistema, não trabalho de uma clínica. Prender ao tenant
   * exigiria varrer organização por organização para apagar lixo que não é de
   * ninguém, e a fila voltaria a crescer sem limite se uma delas falhasse.
   */
  "src/lib/crc/aplicacao/agent-jobs.ts:617  apagar crc_agent_jobs",

  /*
   * `crc_webhook_inbox` É ANTERIOR AO TENANT. Um envelope chega num endpoint só,
   * de todas as clínicas, e a organização só é descoberta depois de o conteúdo
   * ser lido — quando é descoberta. `marcar` precisa registrar "FALHOU" também
   * no caso em que a organização não existe, que é exatamente o caso em que o
   * filtro não teria valor para comparar.
   */
  "src/lib/crc/aplicacao/webhooks.ts:244  atualizar crc_webhook_inbox",

  /*
   * ESTA ESCRITA É A QUE ATRIBUI O TENANT. Ela preenche `organization_id` numa
   * linha que chegou sem ele. Filtrar por `organization_id` aqui seria procurar
   * o valor que a escrita existe para gravar — e ela nunca acharia linha
   * nenhuma.
   */
  "src/lib/crc/aplicacao/webhooks.ts:537  atualizar crc_webhook_inbox",
];

function arquivosTs(raiz: string): string[] {
  const fora: string[] = [];
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) {
      // `testes/` fica de fora: o fake não tem tenant, e semear é montar cenário.
      if (nome !== "testes") fora.push(...arquivosTs(caminho));
    } else if (/\.tsx?$/u.test(nome) && !/\.test\.tsx?$/u.test(nome)) {
      fora.push(caminho);
    }
  }
  return fora;
}

/**
 * O trecho delimitado que começa em `inicio`, respeitando aninhamento.
 *
 * PRECISA SER BALANCEADO, e isto foi um defeito de verdade neste arquivo: com
 * um `\[[\s\S]*?\]` preguiçoso, o bloco de filtros de
 *
 *     [{ coluna: "id", op: "eq", valor: String(linha["id"] ?? "") }, { … }]
 *
 * terminava no `]` de `linha["id"]`. O segundo filtro — justamente o do tenant —
 * ficava de fora da leitura, e o teste reprovava escritas que ESTAVAM certas.
 * Um guarda que acusa o inocente é pior que guarda nenhum: alguém "conserta" o
 * que já estava bom e para de acreditar no teste.
 */
function span(fonte: string, inicio: number, abre: string, fecha: string): string {
  let profundidade = 0;
  for (let i = inicio; i < fonte.length; i += 1) {
    const c = fonte[i];
    if (c === abre) profundidade += 1;
    else if (c === fecha) {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(inicio, i + 1);
    }
  }
  return fonte.slice(inicio);
}

type Escrita = {
  arquivo: string;
  linha: number;
  op: string;
  tabela: string;
  temFiltroDeTenant: boolean;
};

function varrerEscritas(): Escrita[] {
  const fora: Escrita[] = [];

  for (const arquivo of arquivosTs(RAIZ)) {
    const fonte = semComentariosMantendoLinhas(readFileSync(arquivo, "utf8"));

    for (const m of fonte.matchAll(/\b(atualizar|apagar)\s*\(/gu)) {
      const inicio = m.index + m[0].length - 1;
      const chamada = span(fonte, inicio, "(", ")");

      const tabela = /^\(\s*"([a-z_]+)"/u.exec(chamada)?.[1];
      if (tabela === undefined) continue;

      // Só interessa tabela que TEM a coluna. As que não têm são escopadas por
      // outro caminho (FK composta), e exigir o filtro seria erro de SQL.
      if (!colunaExiste(tabela, "organization_id")) continue;

      /*
       * O bloco de filtros é o segundo argumento, e é onde a separação precisa
       * estar escrita. Procurar `organization_id` na chamada inteira aceitaria
       * uma escrita que só o menciona no objeto de MUDANÇAS — que não filtra
       * nada, e é exatamente o engano que este teste precisa não cometer.
       *
       * Quando o segundo argumento é uma VARIÁVEL (`apagar(t, filtros)`), o
       * texto da chamada não diz nada: aí a busca é pela declaração dela na
       * mesma função. Sem isso, um filtro montado acima — que é o padrão em
       * `autonomia.ts` — seria acusado por um detalhe de estilo.
       */
      const colchete = chamada.indexOf("[");
      let filtros = colchete < 0 ? "" : span(chamada, colchete, "[", "]");

      if (colchete < 0) {
        const variavel = /^\(\s*"[a-z_]+"\s*,\s*([A-Za-z_$][\w$]*)/u.exec(chamada)?.[1];
        if (variavel !== undefined) {
          /*
           * A ÚLTIMA declaração antes da chamada, e não a primeira: o mesmo
           * nome `filtros` se repete em várias funções do arquivo, e pegar a
           * primeira leria o filtro de outra função — que pode estar escopada
           * enquanto esta não está. Erraria nos dois sentidos.
           */
          const anteriores = [
            ...fonte
              .slice(0, m.index)
              .matchAll(new RegExp(`\\b(?:const|let)\\s+${variavel}\\b[^=\\n]*=\\s*\\[`, "gu")),
          ];
          const decl = anteriores.at(-1);
          if (decl !== undefined) {
            const abre = fonte.indexOf("[", decl.index + decl[0].length - 1);
            filtros = span(fonte, abre, "[", "]");
          }
        }
      }

      fora.push({
        arquivo: arquivo.replace(/\\/gu, "/"),
        linha: fonte.slice(0, m.index).split("\n").length,
        op: m[1] ?? "",
        tabela,
        temFiltroDeTenant: filtros.includes("organization_id"),
      });
    }
  }

  return fora;
}

describe("a varredura enxerga o que deveria", () => {
  it("acha um número plausível de escritas com filtro", () => {
    // Guarda contra o teste virar decoração: se o scanner parar de achar
    // chamada nenhuma, ele passaria vazio e ninguém notaria.
    expect(varrerEscritas().length).toBeGreaterThan(50);
  });

  it("reconhece o filtro quando ele está lá", () => {
    /*
     * CONTROLE. Sem ele, um scanner que respondesse `false` para tudo passaria
     * no teste de cima e reprovaria o repositório inteiro — parecendo rigoroso
     * e estando só quebrado.
     *
     * `registrarContatoDeCobranca` e `registrarPagamento` filtram por id E por
     * organização, e nenhum dos dois tem `organization_id` entre as MUDANÇAS.
     * São o caso que separa os dois blocos da chamada.
     */
    const daCobranca = varrerEscritas().filter(
      (e) => e.arquivo.endsWith("aplicacao/cobrancas.ts") && e.tabela === "crc_charges",
    );
    expect(daCobranca.length).toBeGreaterThan(1);
    expect(daCobranca.some((e) => e.temFiltroDeTenant)).toBe(true);
  });
});

describe("escopo de tenant em toda escrita", () => {
  it("nenhum update ou delete do CRC escreve sem prender a clínica", () => {
    const semEscopo = varrerEscritas()
      .filter((e) => !e.temFiltroDeTenant)
      .map((e) => `${e.arquivo}:${String(e.linha)}  ${e.op} ${e.tabela}`)
      .filter((x) => !EXCECOES.includes(x));

    expect(
      semEscopo,
      `Escrita sem \`organization_id\` no próprio filtro:\n  ${semEscopo.join("\n  ")}\n\n` +
        "Pode estar protegida por uma leitura escopada logo acima — e é esse o problema: " +
        "a proteção não sobrevive a alguém editar aquele trecho. Adicione " +
        '`{ coluna: "organization_id", op: "eq", valor: organizationId }` ao filtro.',
    ).toEqual([]);
  });
});
