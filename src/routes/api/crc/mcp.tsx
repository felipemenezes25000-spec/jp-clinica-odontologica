/**
 * O endpoint MCP — `/api/crc/mcp`. Fase F, item 24.
 *
 * O QUE FALTAVA. `ia-platform/mcp.ts` implementa o gateway — catálogo, política,
 * auditoria, tenant da sessão. Não havia porta: o gateway existia e nenhum
 * cliente conseguia se conectar.
 *
 * ========================================================================
 *  AUTENTICAÇÃO POR TOKEN DE CLIENTE, e não por sessão de navegador.
 *
 *  Quem fala MCP é um programa — o Claude Desktop de alguém, um agente
 *  externo, um script. Nenhum deles tem cookie de sessão. O token é emitido
 *  por clínica, vive em `CRC_MCP_TOKEN` e carrega DUAS informações: quem é o
 *  cliente e a qual organização ele pertence.
 *
 *  O TENANT VEM DO TOKEN, NUNCA DO PEDIDO. É a regra mais importante desta
 *  rota: aceitar `organizationId` no corpo entregaria a base de qualquer
 *  clínica a quem soubesse digitar um uuid.
 * ========================================================================
 *
 * O PROTOCOLO É JSON-RPC 2.0, que é o que o MCP usa. Três métodos:
 * `initialize`, `tools/list` e `tools/call`. O resto devolve `-32601`, que é o
 * código de "método não existe" — e um cliente bem comportado para de tentar.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Uma resposta de erro do JSON-RPC. `id` nulo é o que a spec manda quando não dá para ler. */
const erro = (id: unknown, code: number, message: string): Response =>
  json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/**
 * Confere o token e devolve a sessão.
 *
 * O FORMATO É `organizationId:clienteId:segredo`, e a comparação do segredo é em
 * tempo constante — `===` vaza o comprimento do prefixo correto, e isso vale
 * aqui pelo mesmo motivo que vale nos webhooks.
 */
async function sessaoDoToken(
  req: Request,
): Promise<{ organizationId: string; clienteId: string; permitirEscrita: boolean } | null> {
  const esperado = (process.env["CRC_MCP_TOKEN"] ?? "").trim();
  // SEM TOKEN CONFIGURADO, A ROTA NÃO EXISTE. É o padrão seguro: um endpoint
  // MCP aberto é uma porta para o CRC inteiro.
  if (esperado.length === 0) return null;

  const cabecalho = req.headers.get("authorization") ?? "";
  const enviado = cabecalho.replace(/^Bearer\s+/iu, "").trim();
  if (enviado.length === 0) return null;

  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(enviado);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const partes = esperado.split(":");
  const organizationId = partes[0] ?? "";
  const clienteId = partes[1] ?? "mcp";
  if (organizationId.length === 0) return null;

  return {
    organizationId,
    clienteId,
    /*
     * ESCRITA SÓ COM OPT-IN EXPLÍCITO, em variável separada.
     *
     * Um cliente MCP costuma ser um assistente que alguém está usando para
     * consultar coisas. Deixá-lo escrever por padrão significa que um pedido
     * mal formulado numa janela de chat marca consulta na agenda real.
     */
    permitirEscrita: (process.env["CRC_MCP_ESCRITA"] ?? "").trim() === "1",
  };
}

export const Route = createFileRoute("/api/crc/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sessao = await sessaoDoToken(request);
        if (sessao === null) {
          // 401 sem detalhe: dizer "token errado" e "rota desligada" de formas
          // diferentes conta a quem sonda qual das duas é.
          return erro(null, -32000, "Não autorizado.");
        }

        let corpo: unknown;
        try {
          corpo = await request.json();
        } catch {
          return erro(null, -32700, "JSON inválido.");
        }

        if (typeof corpo !== "object" || corpo === null) {
          return erro(null, -32600, "Pedido inválido.");
        }

        const pedido = corpo as Record<string, unknown>;
        const id = pedido["id"] ?? null;
        const metodo = String(pedido["method"] ?? "");

        const { catalogoMcp, chamarFerramentaMcp } = await import("@/lib/crc/ia-platform/mcp");

        if (metodo === "initialize") {
          return json({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "jp-crc", version: "1.0.0" },
            },
          });
        }

        if (metodo === "tools/list") {
          return json({ jsonrpc: "2.0", id, result: { tools: catalogoMcp(sessao) } });
        }

        if (metodo === "tools/call") {
          const params = (pedido["params"] ?? {}) as Record<string, unknown>;
          const nome = String(params["name"] ?? "");
          const argumentos = params["arguments"] ?? {};

          const r = await chamarFerramentaMcp(sessao, nome, argumentos, async (chave, args) => {
            /*
             * O EXECUTOR MONTA O CONTEXTO MÍNIMO, e por isso só ferramentas de
             * CLÍNICA funcionam por aqui.
             *
             * Um cliente MCP não está dentro de uma conversa: não há paciente,
             * não há histórico, não há oferta aberta. `paciente.resumo` sem
             * conversa não tem sobre quem responder.
             *
             * A alternativa seria o cliente passar `conversationId` — e aí ele
             * escolheria de qual conversa ler, o que é o mesmo problema do
             * tenant vindo do pedido, um nível abaixo.
             */
            const { executarFerramenta } = await import("@/lib/crc/ia-platform/executor");
            const resultado = await executarFerramenta(chave, args as Record<string, unknown>, {
              ctx: {
                organizationId: sessao.organizationId,
                clinicId: null,
                conversationId: "",
                agora: new Date(),
                paciente: null,
                oportunidade: null,
                oferta: null,
                mensagens: [],
                memorias: [],
                resumo: null,
                intencao: null,
                temperatura: null,
              },
              contextoAgendamento: () => Promise.resolve(null),
              portaEmbeddings: null,
            });
            return resultado.saida;
          });

          return r.ok
            ? json({
                jsonrpc: "2.0",
                id,
                result: { content: [{ type: "text", text: r.conteudo }] },
              })
            : json({
                jsonrpc: "2.0",
                id,
                // `isError` no RESULTADO, e não no `error` do JSON-RPC: a
                // distinção é da spec do MCP. Erro de protocolo é `error`; erro
                // de ferramenta é resultado com `isError`, porque o modelo do
                // outro lado precisa LER o motivo e decidir o que fazer.
                result: { content: [{ type: "text", text: r.motivo }], isError: true },
              });
        }

        return erro(id, -32601, `Método "${metodo}" não existe.`);
      },
    },
  },
});
