/**
 * O cliente HTTP que toda integração do CRC usa: Dental Office, WhatsApp, IA.
 *
 * POR QUE UM SÓ, EM VEZ DE UM `fetch` EM CADA ADAPTER
 * Porque os itens 11, 12 e 194 do contrato pedem a mesma coisa das três
 * integrações — timeout obrigatório, retry só em erro transitório, backoff com
 * jitter, e cuidado para não repetir uma escrita que já pode ter sido aceita.
 * Escrito três vezes, isso vira três comportamentos ligeiramente diferentes, e
 * o que falha às 3h da manhã é sempre a cópia que ninguém revisou.
 *
 * DUAS DECISÕES QUE NÃO SÃO ÓBVIAS:
 *
 * 1. RETRY DE MÉTODO NÃO IDEMPOTENTE É OPT-IN.
 *    Um POST que devolveu timeout pode ter sido processado do outro lado. O
 *    item 194 é explícito: antes de repetir um envio, verificar se o provedor
 *    já processou. Como daqui não dá para verificar, o padrão é NÃO repetir
 *    POST/PUT/PATCH/DELETE. Quem tem chave de idempotência de verdade — e o
 *    Dental Office não tem — liga `repetirEscrita: true` conscientemente.
 *
 * 2. JITTER É OBRIGATÓRIO, NÃO ENFEITE.
 *    Numa sincronização de 5.000 pacientes que tomou 429, backoff sem jitter
 *    faz todas as requisições pendentes voltarem no mesmo milissegundo e
 *    tomarem 429 de novo. O jitter espalha a volta.
 *
 * Este módulo é SÓ SERVIDOR. Entra por `await import()` dentro de handler.
 */

export type MetodoHttp = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type OpcoesHttp = {
  metodo?: MetodoHttp;
  cabecalhos?: Record<string, string>;
  corpo?: unknown;
  /**
   * Como o corpo vai no fio.
   *
   * `json` (padrão) cobre Dental Office, Meta Cloud e OpenAI. `form` existe
   * porque a API do Twilio só aceita `application/x-www-form-urlencoded` — e
   * mandar JSON para ela devolve 400 sem explicar o motivo.
   *
   * Em `form`, o corpo precisa ser um objeto raso: `URLSearchParams` não sabe
   * serializar objeto aninhado, e o que sairia seria `[object Object]` no
   * valor do campo.
   */
  formato?: "json" | "form";
  /** Teto por tentativa, em ms. Nunca ausente: o item 11 proíbe request pendurado. */
  timeoutMs?: number;
  /** Quantas tentativas no total (1 = sem retry). */
  tentativas?: number;
  /** Ver a decisão 1 no cabeçalho do arquivo. */
  repetirEscrita?: boolean;
  /** Correlação: vai no cabeçalho e no log. Item 75/12 da observabilidade. */
  requestId?: string;
  /** Chamado a cada tentativa concluída — é por onde o log de integração entra. */
  aoRegistrar?: (evento: EventoHttp) => void;
};

export type EventoHttp = {
  metodo: MetodoHttp;
  /** Já mascarado: nunca contém token nem querystring com dado pessoal. */
  caminho: string;
  statusHttp: number | null;
  sucesso: boolean;
  erro: string | null;
  duracaoMs: number;
  tentativa: number;
};

export type RespostaHttp = {
  status: number;
  corpo: unknown;
  /** O texto cru, para quando a resposta não é JSON. */
  texto: string;
  cabecalhos: Headers;
};

/**
 * Erro de integração com a informação que o chamador precisa para decidir.
 *
 * `transitorio` é o campo que importa: é a diferença entre "tente de novo mais
 * tarde" e "o pedido está errado, repetir não adianta". O sync usa isso para
 * decidir entre reagendar o job e mandar para a dead letter.
 */
export class ErroHttp extends Error {
  readonly status: number | null;
  readonly transitorio: boolean;
  readonly corpo: unknown;
  readonly requestId: string | undefined;

  constructor(
    mensagem: string,
    opcoes: { status?: number | null; transitorio?: boolean; corpo?: unknown; requestId?: string },
  ) {
    super(mensagem);
    this.name = "ErroHttp";
    this.status = opcoes.status ?? null;
    this.transitorio = opcoes.transitorio ?? false;
    this.corpo = opcoes.corpo;
    this.requestId = opcoes.requestId;
  }
}

const TIMEOUT_PADRAO_MS = 15_000;
const TENTATIVAS_PADRAO = 3;

/**
 * O que vale a pena repetir.
 *
 * 408 e 425 entram porque são "tente de novo" declarados pelo servidor. 401
 * NÃO entra: quem trata 401 é a camada de autenticação, que invalida o token e
 * refaz a chamada uma vez — repetir aqui só gastaria as tentativas antes de o
 * refresh acontecer.
 */
const STATUS_TRANSITORIOS = new Set([408, 425, 429, 500, 502, 503, 504]);

const METODOS_IDEMPOTENTES = new Set<MetodoHttp>(["GET"]);

export function statusEhTransitorio(status: number): boolean {
  return STATUS_TRANSITORIOS.has(status);
}

/**
 * Espera antes da próxima tentativa: exponencial com jitter completo.
 *
 * `Retry-After` do servidor sempre ganha do nosso cálculo — quando o provedor
 * diz quanto esperar, insistir antes disso é o caminho mais rápido para um
 * bloqueio mais longo.
 */
export function calcularEspera(
  tentativa: number,
  retryAfterSegundos: number | null,
  aleatorio: () => number = Math.random,
): number {
  if (retryAfterSegundos !== null && retryAfterSegundos > 0) {
    return Math.min(retryAfterSegundos * 1000, 60_000);
  }
  const base = Math.min(500 * Math.pow(2, tentativa - 1), 8000);
  // Jitter completo (AWS "Full Jitter"): espalha melhor que jitter parcial
  // quando muitos clientes caem juntos, que é exatamente o caso do sync.
  return Math.floor(base * (0.5 + aleatorio() * 0.5));
}

function lerRetryAfter(cabecalhos: Headers): number | null {
  const bruto = cabecalhos.get("retry-after");
  if (bruto === null) return null;
  const segundos = Number.parseInt(bruto.trim(), 10);
  if (Number.isFinite(segundos)) return segundos;
  // Também pode vir como data HTTP.
  const quando = Date.parse(bruto);
  if (!Number.isFinite(quando)) return null;
  return Math.max(0, Math.ceil((quando - Date.now()) / 1000));
}

function dormir(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/**
 * Tira da URL o que não pode aparecer em log (item 75).
 *
 * Guarda só caminho e nomes de parâmetro — `?telefone=5511999998888` vira
 * `?telefone`. O nome do parâmetro é o que ajuda a depurar; o valor é o que
 * seria vazamento.
 */
export function caminhoParaLog(url: string): string {
  try {
    const u = new URL(url);
    const chaves = [...u.searchParams.keys()];
    return u.pathname + (chaves.length > 0 ? "?" + chaves.join("&") : "");
  } catch {
    return url.split("?")[0] ?? url;
  }
}

/**
 * Faz a requisição com timeout, retry e backoff.
 *
 * Devolve a resposta mesmo em 4xx: erro de negócio (paciente não existe,
 * horário ocupado) é resposta, não exceção — quem chama precisa ler o corpo
 * para saber qual foi. Só vira `ErroHttp` o que impediu a conversa de
 * acontecer: rede, timeout, ou 5xx que sobreviveu a todas as tentativas.
 */
export async function pedir(url: string, opcoes: OpcoesHttp = {}): Promise<RespostaHttp> {
  const metodo = opcoes.metodo ?? "GET";
  const timeoutMs = opcoes.timeoutMs ?? TIMEOUT_PADRAO_MS;
  const podeRepetir = METODOS_IDEMPOTENTES.has(metodo) || opcoes.repetirEscrita === true;
  const tentativasMax = podeRepetir ? (opcoes.tentativas ?? TENTATIVAS_PADRAO) : 1;
  const caminho = caminhoParaLog(url);

  let ultimoErro: ErroHttp | null = null;

  for (let tentativa = 1; tentativa <= tentativasMax; tentativa += 1) {
    const comecou = Date.now();
    try {
      const cabecalhos: Record<string, string> = {
        accept: "application/json",
        ...opcoes.cabecalhos,
      };
      let corpo: string | undefined;
      if (opcoes.corpo !== undefined) {
        if (opcoes.formato === "form") {
          corpo = paraFormulario(opcoes.corpo);
          cabecalhos["content-type"] =
            cabecalhos["content-type"] ?? "application/x-www-form-urlencoded";
        } else {
          corpo = JSON.stringify(opcoes.corpo);
          cabecalhos["content-type"] = cabecalhos["content-type"] ?? "application/json";
        }
      }
      if (opcoes.requestId !== undefined) cabecalhos["x-request-id"] = opcoes.requestId;

      const init: RequestInit = {
        method: metodo,
        headers: cabecalhos,
        signal: AbortSignal.timeout(timeoutMs),
      };
      if (corpo !== undefined) init.body = corpo;

      const resposta = await fetch(url, init);
      const texto = await resposta.text();
      const duracaoMs = Date.now() - comecou;

      // 5xx e 429 são candidatos a retry. Se ainda há tentativa, espera e volta.
      if (statusEhTransitorio(resposta.status) && tentativa < tentativasMax) {
        opcoes.aoRegistrar?.({
          metodo,
          caminho,
          statusHttp: resposta.status,
          sucesso: false,
          erro: `HTTP ${String(resposta.status)}`,
          duracaoMs,
          tentativa,
        });
        await dormir(calcularEspera(tentativa, lerRetryAfter(resposta.headers)));
        continue;
      }

      opcoes.aoRegistrar?.({
        metodo,
        caminho,
        statusHttp: resposta.status,
        sucesso: resposta.ok,
        erro: resposta.ok ? null : `HTTP ${String(resposta.status)}`,
        duracaoMs,
        tentativa,
      });

      // 5xx que esgotou as tentativas vira exceção: não há resposta útil ali.
      if (resposta.status >= 500) {
        throw new ErroHttp(`O serviço respondeu ${String(resposta.status)}.`, {
          status: resposta.status,
          transitorio: true,
          corpo: texto.slice(0, 500),
          ...(opcoes.requestId !== undefined ? { requestId: opcoes.requestId } : {}),
        });
      }

      return {
        status: resposta.status,
        corpo: interpretarJson(texto),
        texto,
        cabecalhos: resposta.headers,
      };
    } catch (erro) {
      const duracaoMs = Date.now() - comecou;

      if (erro instanceof ErroHttp) {
        ultimoErro = erro;
        if (!erro.transitorio || tentativa >= tentativasMax) throw erro;
      } else {
        // Timeout do AbortSignal, DNS, conexão recusada. Tudo transitório.
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        const ehTimeout = erro instanceof Error && erro.name === "TimeoutError";
        ultimoErro = new ErroHttp(
          ehTimeout ? "O serviço não respondeu a tempo." : `Falha de rede: ${mensagem}`,
          {
            status: null,
            transitorio: true,
            ...(opcoes.requestId !== undefined ? { requestId: opcoes.requestId } : {}),
          },
        );
        opcoes.aoRegistrar?.({
          metodo,
          caminho,
          statusHttp: null,
          sucesso: false,
          erro: ultimoErro.message,
          duracaoMs,
          tentativa,
        });
        if (tentativa >= tentativasMax) throw ultimoErro;
      }

      await dormir(calcularEspera(tentativa, null));
    }
  }

  // Inalcançável pelo fluxo acima (o laço só sai por return ou throw), mas o
  // compilador não sabe disso e o item 113 proíbe caminho sem tratamento.
  throw ultimoErro ?? new ErroHttp("Falha desconhecida na chamada externa.", { transitorio: true });
}

/**
 * Objeto raso → `a=1&b=2`, com escape.
 *
 * `URLSearchParams` faz o percent-encoding sozinho, o que importa aqui: o
 * corpo de uma mensagem de WhatsApp tem acento, quebra de linha e emoji, e
 * concatenar à mão produziria um corpo inválido no primeiro "ç".
 *
 * Campo `undefined` ou `null` é OMITIDO, e não enviado como a string
 * "undefined" — que é o que `String(undefined)` faria, e que o provedor
 * gravaria como conteúdo literal.
 */
function paraFormulario(corpo: unknown): string {
  if (typeof corpo === "string") return corpo;
  if (typeof corpo !== "object" || corpo === null) return "";

  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(corpo as Record<string, unknown>)) {
    if (valor === undefined || valor === null) continue;
    params.append(chave, typeof valor === "string" ? valor : JSON.stringify(valor));
  }
  return params.toString();
}

function interpretarJson(texto: string): unknown {
  if (texto.trim().length === 0) return null;
  try {
    return JSON.parse(texto);
  } catch {
    // Não é erro: alguns endpoints devolvem texto puro. Quem chama decide.
    return null;
  }
}
