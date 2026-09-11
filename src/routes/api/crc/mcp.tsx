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
  const cabecalho = req.headers.get("authorization") ?? "";
  const enviado = cabecalho.replace(/^Bearer\s+/iu, "").trim();
  if (enviado.length === 0) return null;

  /*
   * ========================================================================
   *  PRIMEIRO O TOKEN DO BANCO, por organização.
   *
   *  `CRC_MCP_TOKEN` é UM token para a instalação inteira: não dá para dar
   *  acesso à Clínica A sem dar à B, não dá para revogar o de uma sem trocar o
   *  de todas, não há validade, não há escopo e não há registro de uso.
   *
   *  `crc_mcp_tokens` guarda o HASH, nunca o token — mesmo motivo de senha.
   *  Quem perde gera outro; ninguém, nem com acesso ao banco, lê o que foi
   *  entregue ao cliente.
   *
   *  A BUSCA É PELO HASH, e é isso que a torna segura sem comparação em tempo
   *  constante: o índice recebe o sha-256 do que veio, e um atacante não
   *  consegue aproximar um hash byte a byte como aproximaria um segredo.
   * ========================================================================
   */
  const doBanco = await sessaoDoBanco(enviado);
  if (doBanco !== null) return doBanco;

  /*
   * O TOKEN DO AMBIENTE, como caminho de transição.
   *
   * Continua valendo para não derrubar quem já usa o MCP hoje. Assim que
   * houver um token no banco para aquela organização, ele é o caminho — e
   * apagar a variável é o que desliga o modelo antigo.
   */
  const esperado = (process.env["CRC_MCP_TOKEN"] ?? "").trim();
  if (esperado.length === 0) return null;

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

/**
 * O token cadastrado, com escopo e revogação.
 *
 * NUNCA LANÇA: uma oscilação do banco aqui deve cair no caminho do ambiente, e
 * não derrubar o MCP inteiro. E devolve `null` — negar acesso — sempre que não
 * puder AFIRMAR que o token vale.
 */
async function sessaoDoBanco(
  token: string,
): Promise<{ organizationId: string; clienteId: string; permitirEscrita: boolean } | null> {
  try {
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(token).digest("hex");

    const { selecionarUm, atualizar } = await import("@/lib/crc/servidor/banco");
    const linha = await selecionarUm("crc_mcp_tokens", {
      colunas: "id,organization_id,apelido,permite_escrita,expira_em,revogado_em",
      filtros: [{ coluna: "token_hash", op: "eq", valor: hash }],
    });

    if (linha === null) return null;
    if (linha["revogado_em"] != null) return null;

    const expira = linha["expira_em"];
    if (typeof expira === "string" && Date.parse(expira) <= Date.now()) return null;

    /*
     * O ÚLTIMO USO É GRAVADO, e é o que permite revogar com confiança: sem
     * saber qual token está em uso, ninguém apaga nenhum — e um token que
     * ninguém ousa revogar é um token eterno.
     *
     * Sem `await`: o registro de uso não pode atrasar a resposta do MCP, e
     * perdê-lo numa falha de banco é aceitável.
     */
    void atualizar(
      "crc_mcp_tokens",
      [{ coluna: "id", op: "eq", valor: String(linha["id"] ?? "") }],
      { ultimo_uso_em: new Date().toISOString() },
    ).catch(() => undefined);

    return {
      organizationId: String(linha["organization_id"] ?? ""),
      clienteId: String(linha["apelido"] ?? "mcp"),
      permitirEscrita: linha["permite_escrita"] === true,
    };
  } catch {
    return null;
  }
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
