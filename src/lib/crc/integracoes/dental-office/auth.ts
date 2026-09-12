/**
 * Autenticação no Dental Office.
 *
 * Fluxo do item 10 do contrato: `POST /v1/auth/tokens` com `{client_id, secret}`
 * devolve um token. O token fica em cache no servidor, é renovado sozinho, e
 * ao receber 401 o cache é invalidado e um novo é pedido — uma vez só.
 *
 * TRÊS REGRAS QUE NÃO PODEM SER QUEBRADAS (item 9):
 *   1. O secret NUNCA vai para o navegador. Este módulo é importado só por
 *      `await import()` dentro de handler de servidor.
 *   2. O secret NUNCA aparece em log. Nem truncado: um prefixo de secret é
 *      material para ataque, e não ajuda a depurar nada.
 *   3. O token NUNCA é gravado no banco. Ele vive em memória do processo.
 *
 * SOBRE O CACHE EM MEMÓRIA NUM AMBIENTE SERVERLESS
 * Cada instância da função na Vercel tem o seu. Isso significa mais chamadas de
 * autenticação do que num servidor residente — uma por instância fria, não uma
 * por requisição, porque a instância é reaproveitada entre invocações. Guardar
 * o token no banco pouparia essas chamadas e criaria um alvo persistente com
 * credencial viva dentro; a troca não compensa.
 */
import { ErroHttp, pedir } from "../../servidor/http";
import { campo, ehObjeto, numeroOpcional, textoOpcional } from "../../dominio/validar";
import type { CredenciaisDentalOffice } from "../credenciais";

/*
 * A LEITURA DAS CREDENCIAIS SAIU DAQUI, e foi para `integracoes/credenciais.ts`.
 *
 * Ela lia `process.env` — uma conta do Dental Office para a instalação inteira.
 * Num SaaS isso é a Clínica B escrevendo na conta da A, e o ambiente não tem
 * como dizer de quem é. A resolução agora é: clínica → organização → ambiente,
 * com o último degrau se desligando sozinho quando existe mais de um tenant.
 *
 * Aqui ficou o que é MESMO deste arquivo: trocar credencial por token, e o
 * cache disso.
 */

/* -------------------------------------------------------------------------- */
/* Cache do token                                                             */
/* -------------------------------------------------------------------------- */

type TokenEmCache = { token: string; expiraEm: number };

/**
 * ============================================================================
 *  O CACHE É POR CREDENCIAL, E ANTES ERA UM SINGLETON.
 *
 *  `let cache: TokenEmCache | null` — um token, para o processo inteiro. Isso
 *  funcionou enquanto existia uma conta de Dental Office por instalação. No
 *  momento em que a credencial passou a vir do banco, por clínica, o mesmo
 *  `cache` passaria a servir o token da Clínica A para uma chamada da Clínica
 *  B — e a chamada não falharia: ela funcionaria, escrevendo na conta errada.
 *
 *  É o pior modo de falha possível de um cache: silencioso, correto do ponto
 *  de vista do HTTP, e errado do ponto de vista do dono do dado.
 *
 *  A CHAVE VEM DE `integracoes/credenciais.ts` e carrega base, client id e uma
 *  IMPRESSÃO do segredo — nunca o segredo. A impressão faz a rotação invalidar
 *  o cache sozinha.
 * ============================================================================
 */
const cache = new Map<string, TokenEmCache>();

/**
 * As autenticações em voo, também por credencial.
 *
 * Sem isto, dez chamadas paralelas numa instância fria disparariam dez
 * autenticações simultâneas. Guardar a promessa faz as nove seguintes esperarem
 * a primeira — e é o mesmo padrão de fila que o RH usa no geocodificador.
 */
const emVoo = new Map<string, Promise<string>>();

/** Margem antes do vencimento. Renovar em cima da hora é pedir 401 no meio. */
const MARGEM_MS = 60_000;

/** Quando a API não informa validade, assume-se uma hora. Conservador. */
const VALIDADE_PADRAO_MS = 55 * 60 * 1000;

/**
 * Invalida o token DESTA credencial.
 *
 * A chave é obrigatória de propósito. A versão anterior zerava tudo, e num SaaS
 * isso significa um 401 da Clínica A derrubando o token de todas as outras —
 * uma credencial vencida virando uma rajada de reautenticação geral.
 */
export function invalidarToken(chave: string): void {
  cache.delete(chave);
  emVoo.delete(chave);
}

/** Só para teste: zera tudo entre casos. */
export function _limparCacheDeToken(): void {
  cache.clear();
  emVoo.clear();
}

export async function obterToken(
  chave: string,
  credenciais: CredenciaisDentalOffice,
  requestId?: string,
): Promise<string> {
  const agora = Date.now();
  const guardado = cache.get(chave);
  if (guardado !== undefined && guardado.expiraEm - MARGEM_MS > agora) return guardado.token;

  const jaPedindo = emVoo.get(chave);
  if (jaPedindo !== undefined) return await jaPedindo;

  const pedido = autenticar(credenciais, requestId)
    .then((novo) => {
      cache.set(chave, novo);
      return novo.token;
    })
    .finally(() => {
      emVoo.delete(chave);
    });

  emVoo.set(chave, pedido);
  return await pedido;
}

async function autenticar(
  credenciais: CredenciaisDentalOffice,
  requestId?: string,
): Promise<TokenEmCache> {
  const resposta = await pedir(`${credenciais.baseUrl}/v1/auth/tokens`, {
    metodo: "POST",
    corpo: { client_id: credenciais.clientId, secret: credenciais.secret },
    // Autenticar é idempotente na prática (não cria nada do lado de lá), então
    // repetir é seguro e evita que uma instabilidade de rede derrube o sync.
    repetirEscrita: true,
    tentativas: 3,
    timeoutMs: 12_000,
    ...(requestId !== undefined ? { requestId } : {}),
  });

  if (resposta.status === 401 || resposta.status === 403) {
    // Credencial errada não se resolve tentando de novo. A mensagem NÃO
    // repete nada do secret.
    throw new ErroHttp("O Dental Office recusou as credenciais configuradas.", {
      status: resposta.status,
      transitorio: false,
    });
  }

  if (resposta.status >= 400) {
    throw new ErroHttp(`A autenticação no Dental Office falhou (${String(resposta.status)}).`, {
      status: resposta.status,
      transitorio: false,
    });
  }

  const token = extrairToken(resposta.corpo);
  if (token === null) {
    throw new ErroHttp("O Dental Office autenticou mas não devolveu token reconhecível.", {
      status: resposta.status,
      transitorio: false,
    });
  }

  return { token, expiraEm: Date.now() + calcularValidade(resposta.corpo) };
}

/**
 * Onde o token pode estar.
 *
 * A documentação mostra o token na raiz, mas endpoints de autenticação
 * costumam aninhar em `data`. Procurar nos dois é mais barato do que descobrir
 * a diferença em produção.
 */
function extrairToken(corpo: unknown): string | null {
  if (!ehObjeto(corpo)) return null;
  for (const caminho of [
    "token",
    "access_token",
    "accessToken",
    "data.token",
    "data.access_token",
  ]) {
    const v = textoOpcional(campo(corpo, caminho));
    if (v !== null) return v;
  }
  return null;
}

function calcularValidade(corpo: unknown): number {
  for (const caminho of ["expires_in", "expiresIn", "data.expires_in"]) {
    const segundos = numeroOpcional(campo(corpo, caminho));
    if (segundos !== null && segundos > 0) return segundos * 1000;
  }
  for (const caminho of ["expires_at", "expiresAt", "data.expires_at"]) {
    const quando = textoOpcional(campo(corpo, caminho));
    if (quando !== null) {
      const t = Date.parse(quando);
      if (Number.isFinite(t) && t > Date.now()) return t - Date.now();
    }
  }
  return VALIDADE_PADRAO_MS;
}
