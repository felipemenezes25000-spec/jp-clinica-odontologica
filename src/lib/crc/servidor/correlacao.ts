/**
 * Correlação — Fase I, item 36.
 *
 * O PROBLEMA QUE ISTO RESOLVE aparece na primeira investigação séria e não
 * aparece antes: **os registros existem e não se ligam.**
 *
 * Hoje, quando um paciente reclama de uma resposta, o caminho é:
 *
 *   achar a mensagem na Inbox → procurar a run daquela conversa naquele
 *   horário → procurar no log da Vercel as linhas daquele minuto → torcer para
 *   nenhuma outra clínica ter tido atividade no mesmo minuto.
 *
 * Cada passo é uma busca por aproximação, e o último é sorte. Com duas clínicas
 * ativas, o log vira intercalação de duas histórias e não dá para separar.
 *
 * ========================================================================
 *  A CORRELAÇÃO É UM ID QUE ATRAVESSA TUDO: log, span, run, job, auditoria,
 *  chamada ao provedor. Com ele, a investigação vira uma busca só.
 * ========================================================================
 *
 * POR QUE NÃO `AsyncLocalStorage`. Seria a resposta certa num servidor Node
 * comum: contexto implícito, sem passar parâmetro. Em ambiente serverless com
 * `await import()` por toda parte, o custo é um ponto de falha silencioso — se o
 * contexto se perde numa fronteira de import, os registros param de correlacionar
 * e ninguém percebe até precisar deles.
 *
 * Aqui o id é EXPLÍCITO. Mais verboso, e nunca se perde sem alguém ver.
 */

/**
 * Um id de correlação legível por gente.
 *
 * O FORMATO IMPORTA: `crc-20260911-a3f2c8`. Quem investiga costuma ter só uma
 * hora aproximada e o nome da clínica — o prefixo de data deixa buscar por
 * `crc-20260911` e reduzir de um mês para um dia sem precisar de índice nenhum.
 *
 * Um uuid seria mais "correto" e inútil para isso: `550e8400-e29b-...` não diz
 * quando aconteceu, e quem procura precisa exatamente disso.
 */
export function novaCorrelacao(agora = new Date()): string {
  const dia = agora.toISOString().slice(0, 10).replace(/-/gu, "");
  const sufixo = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0");
  return `crc-${dia}-${sufixo}`;
}

/**
 * O que atravessa junto com o id.
 *
 * SÃO POUCOS CAMPOS DE PROPÓSITO. Cada um aqui vai para TODA linha de log do
 * pedido; um campo a mais é um campo a mais em milhares de linhas por dia. O
 * critério para entrar é estreito: só o que serve para FILTRAR uma investigação.
 */
export type Correlacao = {
  id: string;
  organizationId: string | null;
  /** `turno`, `motor`, `webhook`, `tela`, `cron`, `mcp`. */
  origem: string;
  conversationId?: string | null;
  jobId?: string | null;
  runId?: string | null;
};

/**
 * O contexto atual do processo.
 *
 * VARIÁVEL DE MÓDULO, e a limitação precisa estar escrita: numa função
 * serverless, cada invocação é um processo (ou um isolate reaproveitado), e um
 * lote do worker processa vários jobs em sequência. Trocar a correlação a cada
 * job é responsabilidade de quem itera — `comCorrelacao` faz isso.
 *
 * Duas execuções REALMENTE simultâneas no mesmo processo se misturariam. Isso
 * não acontece hoje: o worker processa o lote em série, de propósito, porque
 * paralelizar dentro da invocação estouraria o limite de conexões antes de
 * ganhar tempo.
 */
let atual: Correlacao | null = null;

export function correlacaoAtual(): Correlacao | null {
  return atual;
}

export function definirCorrelacao(c: Correlacao | null): void {
  atual = c;
}

/**
 * Roda algo dentro de uma correlação, e RESTAURA a anterior no fim.
 *
 * O `finally` restaura em vez de limpar — e a diferença aparece em chamada
 * aninhada. Limpar faria a correlação de fora sumir quando a de dentro
 * terminasse, e as linhas seguintes ficariam órfãs no meio da investigação.
 */
export async function comCorrelacao<T>(c: Correlacao, fn: () => Promise<T>): Promise<T> {
  const anterior = atual;
  atual = c;
  try {
    return await fn();
  } finally {
    atual = anterior;
  }
}

/**
 * Os campos da correlação, prontos para entrar numa linha de log.
 *
 * OMITE O QUE É NULO. Uma linha com `jobId: null` ocupa espaço para dizer
 * "não havia job" — e quem lê log lê muitas linhas.
 */
export function camposDeCorrelacao(): Record<string, unknown> {
  if (atual === null) return {};

  const campos: Record<string, unknown> = { cid: atual.id, origem: atual.origem };
  if (atual.organizationId !== null) campos["organizationId"] = atual.organizationId;
  if (atual.conversationId != null) campos["conversationId"] = atual.conversationId;
  if (atual.jobId != null) campos["jobId"] = atual.jobId;
  if (atual.runId != null) campos["runId"] = atual.runId;
  return campos;
}

/**
 * Acrescenta o id da run à correlação em curso.
 *
 * EXISTE PORQUE A RUN NASCE NO MEIO. Desde a Fase B ela é criada logo antes da
 * primeira chamada de modelo — depois de o job já estar rodando e já ter gerado
 * linhas de log. Sem esta função, essas primeiras linhas ficariam sem `runId`, e
 * a busca por run perderia justamente o começo do turno, que é onde costuma
 * estar a causa.
 */
export function anotarRun(runId: string): void {
  if (atual !== null && runId.length > 0) atual = { ...atual, runId };
}
