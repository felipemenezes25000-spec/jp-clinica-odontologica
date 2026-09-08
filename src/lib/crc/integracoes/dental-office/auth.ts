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

export type CredenciaisDentalOffice = {
  baseUrl: string;
  clientId: string;
  secret: string;
};

export type EstadoCredenciais =
  | { configurado: true; credenciais: CredenciaisDentalOffice }
  | { configurado: false; faltando: string[] };

/**
 * Lê as credenciais do ambiente.
 *
 * Devolve o que falta em vez de lançar: o item 248 manda construir toda a
 * infraestrutura possível e MARCAR claramente a dependência externa, não fingir
 * que funciona. A tela de integrações usa isto para dizer exatamente qual
 * variável ainda não foi cadastrada.
 */
export function lerCredenciais(): EstadoCredenciais {
  const baseUrl = (process.env["DENTAL_OFFICE_BASE_URL"] ?? "").trim().replace(/\/+$/u, "");
  const clientId = (process.env["DENTAL_OFFICE_CLIENT_ID"] ?? "").trim();
  const secret = process.env["DENTAL_OFFICE_SECRET"] ?? "";

  const faltando: string[] = [];
  if (baseUrl.length === 0) faltando.push("DENTAL_OFFICE_BASE_URL");
  if (clientId.length === 0) faltando.push("DENTAL_OFFICE_CLIENT_ID");
  if (secret.length === 0) faltando.push("DENTAL_OFFICE_SECRET");

  if (faltando.length > 0) return { configurado: false, faltando };
  return { configurado: true, credenciais: { baseUrl, clientId, secret } };
}

/* -------------------------------------------------------------------------- */
/* Cache do token                                                             */
/* -------------------------------------------------------------------------- */

type TokenEmCache = { token: string; expiraEm: number };

let cache: TokenEmCache | null = null;
/**
 * A autenticação em voo.
 *
 * Sem isto, dez chamadas paralelas numa instância fria disparariam dez
 * autenticações simultâneas. Guardar a promessa faz as nove seguintes esperarem
 * a primeira — e é o mesmo padrão de fila que o RH usa no geocodificador.
 */
let autenticandoAgora: Promise<string> | null = null;

/** Margem antes do vencimento. Renovar em cima da hora é pedir 401 no meio. */
const MARGEM_MS = 60_000;

/** Quando a API não informa validade, assume-se uma hora. Conservador. */
const VALIDADE_PADRAO_MS = 55 * 60 * 1000;

export function invalidarToken(): void {
  cache = null;
  autenticandoAgora = null;
}

/** Só para teste: zera tudo entre casos. */
export function _limparCacheDeToken(): void {
  invalidarToken();
}

export async function obterToken(
  credenciais: CredenciaisDentalOffice,
  requestId?: string,
): Promise<string> {
  const agora = Date.now();
  if (cache !== null && cache.expiraEm - MARGEM_MS > agora) return cache.token;
  if (autenticandoAgora !== null) return autenticandoAgora;

  autenticandoAgora = autenticar(credenciais, requestId)
    .then((novo) => {
      cache = novo;
      return novo.token;
    })
    .finally(() => {
      autenticandoAgora = null;
    });

  return autenticandoAgora;
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
