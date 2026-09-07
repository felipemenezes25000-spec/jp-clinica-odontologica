import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

/**
 * Teto de corpo aceito por este servidor, em bytes.
 *
 * O maior corpo legítimo do site é o formulário de candidatura: um currículo de
 * até 8 MB mais os campos de texto e o inchaço de
 * ~33% que o multipart/form-data cobra em base64 no pior caso. A folga de 4 MB
 * cobre isso com sobra.
 *
 * A checagem precisa morar AQUI, e não em `api.ts`: quando o handler do server
 * function roda, o framework já materializou o `FormData` inteiro na memória —
 * conferir o tamanho lá é teatro. Sem este corte, um POST de 1 GB em
 * `curriculo` derruba a instância que também serve o site público.
 */
/**
 * O NÚMERO É LITERAL, E NÃO IMPORTADO DE `lib/rh/tipos`, DE PROPÓSITO.
 *
 * Este arquivo é a ENTRADA de servidor. Tudo que ele importa entra no pedaço de
 * entrada do bundle — e importar o domínio do RH daqui arrastou o portal inteiro
 * para dentro dele. Com o grafo inchado, o fatiador passou a colocar helpers do
 * próprio framework (`createCsrfMiddleware`, `__exportAll`) nesse pedaço, que o
 * pedaço do framework então importava de volta: ciclo de ESM, símbolo indefinido
 * na hora do uso, e HTTP 500 em TODAS as rotas — inclusive a home, que não tem
 * nada a ver com o portal.
 *
 * O pior de tudo é que `npm run build` passava. A quebra só aparecia ao executar
 * o que o build produziu. Se mudar 8 MB em `TAMANHO_MAX_CURRICULO`, mude aqui
 * também — e depois RODE o build, não só compile.
 */
const TAMANHO_MAX_CURRICULO_BYTES = 8 * 1024 * 1024;

const TAMANHO_MAX_CORPO = TAMANHO_MAX_CURRICULO_BYTES + 4 * 1024 * 1024;

const METODOS_COM_CORPO = new Set(["POST", "PUT", "PATCH"]);

function corpoGrandeDemais(request: Request): boolean {
  if (!METODOS_COM_CORPO.has(request.method.toUpperCase())) return false;
  const declarado = request.headers.get("content-length");
  if (declarado === null) return false;
  const bytes = Number(declarado);
  return Number.isFinite(bytes) && bytes > TAMANHO_MAX_CORPO;
}

function respostaCorpoGrandeDemais(): Response {
  return new Response("Corpo do pedido grande demais.", {
    status: 413,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Antes de qualquer coisa: recusar o corpo grande demais sem lê-lo.
      if (corpoGrandeDemais(request)) return respostaCorpoGrandeDemais();

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
