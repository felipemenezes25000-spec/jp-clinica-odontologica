/**
 * Adapter do Gemini — Fase F, item 25.
 *
 * O TERCEIRO PROVEDOR. OpenAI e Anthropic já existiam; este fecha a lista que o
 * roadmap previu. Os três implementam `PortaIa`, e o turno não sabe qual está
 * atrás — trocar é mudar a rota daquela finalidade.
 *
 * POR QUE UM TERCEIRO IMPORTA, e não é colecionismo: a Fase F existe para o
 * sistema sobreviver à queda de um provedor. Disjuntor corta a perna, mas com um
 * provedor só, cortar a perna significa parar. Com três, a clínica pode apontar
 * a finalidade `conversa` para outro lugar enquanto o primeiro volta.
 *
 * A DIFERENÇA TÉCNICA QUE MAIS IMPORTA AQUI. A OpenAI tem `strict: true`, que
 * faz o provedor RECUSAR gerar fora do schema — a garantia é dele. O Gemini tem
 * `responseSchema`, que é mais fraco: ele guia a geração, e na prática acerta
 * quase sempre, mas não promete. O laço de duas tentativas com o erro
 * realimentado, que na OpenAI é rede de segurança, aqui é parte do desenho.
 *
 * E O SCHEMA PRECISA SER TRADUZIDO. O Gemini não aceita JSON Schema puro: ele
 * quer um subconjunto do OpenAPI, com `type` em MAIÚSCULAS e sem várias chaves
 * que o JSON Schema permite. Mandar o schema cru faz a chamada falhar com 400 —
 * e o 400 não diz qual campo está sobrando.
 */
import { campo, ehObjeto, numeroOpcional, textoOpcional } from "../../dominio/validar";
import { pedir, type EventoHttp } from "../../servidor/http";
import { registrarIntegracao } from "../../servidor/registro";

import type { PedidoIa, PortaIa, RespostaIa, UsoIa } from "./porta";

/**
 * Preço por milhão de tokens, em dólar.
 *
 * ESTÁ AQUI E NÃO NA TABELA CENTRAL porque o gateway estima custo ANTES da
 * chamada, e uma estimativa que não conhece o modelo vira zero — o que
 * desarmaria o teto de gasto justamente para o provedor recém-adicionado.
 */
const PRECOS: Readonly<Record<string, { entrada: number; saida: number }>> = {
  "gemini-2.5-flash": { entrada: 0.3, saida: 2.5 },
  "gemini-2.5-pro": { entrada: 1.25, saida: 10 },
};

export class ProvedorGemini implements PortaIa {
  readonly nome = "gemini";
  readonly modelo: string;

  private readonly chave: string;
  private readonly organizationId: string | null;

  constructor(chave: string, modelo: string, organizationId: string | null) {
    this.chave = chave;
    this.modelo = modelo;
    this.organizationId = organizationId;
  }

  async gerarEstruturado(pedido: PedidoIa): Promise<RespostaIa> {
    let ultimoErro = "";

    for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
      const comecou = Date.now();
      const eventos: EventoHttp[] = [];

      // Na segunda volta o erro entra na conversa: repetir a pergunta idêntica
      // daria a mesma resposta ruim. Aqui isto pesa mais do que na OpenAI,
      // porque o `responseSchema` do Gemini guia sem garantir.
      const entrada =
        tentativa === 1
          ? pedido.entrada
          : `${pedido.entrada}\n\nA resposta anterior foi recusada por este motivo: ${ultimoErro}\nResponda de novo, respeitando exatamente o formato pedido.`;

      try {
        const resposta = await pedir(
          `https://generativelanguage.googleapis.com/v1beta/models/${this.modelo}:generateContent`,
          {
            metodo: "POST",
            // A chave vai no CABEÇALHO, e não na querystring. Na querystring ela
            // apareceria em log de proxy, em histórico de erro e em qualquer
            // lugar que registre URL — e `caminhoParaLog` não teria como limpar.
            cabecalhos: { "x-goog-api-key": this.chave },
            corpo: {
              systemInstruction: { parts: [{ text: pedido.instrucoes }] },
              contents: [{ role: "user", parts: [{ text: entrada }] }],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: paraSchemaDoGemini(pedido.esquema.schema),
                maxOutputTokens: pedido.maxTokens ?? 500,
              },
            },
            timeoutMs: pedido.timeoutMs ?? 25_000,
            repetirEscrita: false,
            aoRegistrar: (e) => eventos.push(e),
          },
        );

        const duracaoMs = Date.now() - comecou;
        const uso = this.lerUso(resposta.corpo, duracaoMs);
        await this.registrar(eventos, pedido.promptVersao);

        if (resposta.status >= 400) {
          const detalhe =
            textoOpcional(campo(resposta.corpo, "error.message")) ??
            `HTTP ${String(resposta.status)}`;
          if (resposta.status < 500 && resposta.status !== 429) {
            return { ok: false, motivo: "recusada", detalhe, uso };
          }
          ultimoErro = detalhe;
          continue;
        }

        /*
         * `finishReason: MAX_TOKENS` MERECE MENSAGEM PRÓPRIA.
         *
         * Quando isso acontece o JSON vem truncado, e o `JSON.parse` falha com
         * "Unexpected end of input" — que manda quem investiga procurar bug de
         * parsing em vez de aumentar `maxTokens`. É o tipo de pista errada que
         * custa uma tarde.
         */
        const motivo = textoOpcional(campo(resposta.corpo, "candidates.0.finishReason"));
        if (motivo === "MAX_TOKENS") {
          ultimoErro = "A resposta foi cortada no limite de tokens.";
          continue;
        }
        if (motivo === "SAFETY" || motivo === "PROHIBITED_CONTENT") {
          // Filtro do provedor. Repetir dá o mesmo resultado, e a mensagem
          // precisa dizer isso para o caso humano nascer com o motivo certo.
          return {
            ok: false,
            motivo: "recusada",
            detalhe: "O provedor bloqueou a resposta pelo filtro de conteúdo.",
            uso,
          };
        }

        const conteudo = textoOpcional(campo(resposta.corpo, "candidates.0.content.parts.0.text"));
        if (conteudo === null) {
          ultimoErro = "O modelo não devolveu conteúdo.";
          continue;
        }

        let dados: unknown;
        try {
          dados = JSON.parse(conteudo);
        } catch {
          ultimoErro = "A resposta não era JSON válido.";
          continue;
        }

        if (!ehObjeto(dados)) {
          ultimoErro = "A resposta não era um objeto.";
          continue;
        }

        return { ok: true, dados, uso };
      } catch (erro) {
        ultimoErro = erro instanceof Error ? erro.message : String(erro);
        await this.registrar(eventos, pedido.promptVersao);
      }
    }

    return { ok: false, motivo: "invalida", detalhe: ultimoErro, uso: null };
  }

  private lerUso(corpo: unknown, duracaoMs: number): UsoIa {
    const entrada = numeroOpcional(campo(corpo, "usageMetadata.promptTokenCount"));
    const saida = numeroOpcional(campo(corpo, "usageMetadata.candidatesTokenCount"));
    return {
      modelo: this.modelo,
      inputTokens: entrada,
      outputTokens: saida,
      custoEstimado: estimarCustoGemini(this.modelo, entrada, saida),
      duracaoMs,
    };
  }

  private async registrar(eventos: EventoHttp[], operacao: string): Promise<void> {
    const ultimo = eventos[eventos.length - 1];
    if (ultimo === undefined) return;
    await registrarIntegracao({
      organizationId: this.organizationId,
      integracao: "ia",
      operacao,
      metodo: "POST",
      caminho: `/v1beta/models/${this.modelo}:generateContent`,
      statusHttp: ultimo.statusHttp,
      sucesso: ultimo.sucesso,
      erro: ultimo.erro,
      duracaoMs: ultimo.duracaoMs,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* A tradução do schema                                                       */
/* -------------------------------------------------------------------------- */

/**
 * JSON Schema → o subconjunto de OpenAPI que o Gemini aceita.
 *
 * O QUE MUDA, e por que cada item quebra a chamada se ficar:
 *
 *   `type` VAI EM MAIÚSCULAS. `"string"` vira `"STRING"`. Minúsculo é recusado
 *   com 400 e a mensagem não diz qual campo.
 *
 *   `additionalProperties` NÃO EXISTE. A OpenAI exige com `strict: true`; o
 *   Gemini recusa a chave inteira.
 *
 *   `$schema`, `$ref`, `definitions` NÃO EXISTEM. O schema precisa ser plano.
 *
 *   `enum` FICA, mas só em `STRING`.
 *
 * ESTA FUNÇÃO É O MOTIVO DE O ADAPTER NÃO SER UM COPIAR-E-COLAR do da OpenAI.
 * Mandar o schema cru faz a chamada falhar de um jeito que não aponta para a
 * causa — e o sintoma seria "o Gemini não funciona", quando o que não funciona
 * é o formato.
 */
export function paraSchemaDoGemini(schema: unknown): unknown {
  if (!ehObjeto(schema)) return schema;

  const tipo = textoOpcional(schema["type"]);
  const saida: Record<string, unknown> = {};

  if (tipo !== null) saida["type"] = tipo.toUpperCase();

  const descricao = textoOpcional(schema["description"]);
  if (descricao !== null) saida["description"] = descricao;

  if (Array.isArray(schema["enum"])) saida["enum"] = schema["enum"].map(String);

  if (Array.isArray(schema["required"])) {
    saida["required"] = schema["required"].map(String);
  }

  const props = schema["properties"];
  if (ehObjeto(props)) {
    const traduzidas: Record<string, unknown> = {};
    for (const [nome, sub] of Object.entries(props)) {
      traduzidas[nome] = paraSchemaDoGemini(sub);
    }
    saida["properties"] = traduzidas;
    /*
     * A ORDEM DAS PROPRIEDADES É DECLARADA, e isto não é detalhe.
     *
     * O Gemini gera na ordem em que as chaves aparecem. Num objeto de decisão,
     * a ordem muda a resposta: pedir `acao` antes de `raciocinio` faz o modelo
     * escolher a ação e só então justificar — que é raciocínio ao contrário, e
     * produz justificativa de fachada.
     */
    saida["propertyOrdering"] = Object.keys(props);
  }

  const itens = schema["items"];
  if (itens !== undefined) saida["items"] = paraSchemaDoGemini(itens);

  // `additionalProperties`, `$schema`, `$ref` e `definitions` NÃO são copiados.
  return saida;
}

export function estimarCustoGemini(
  modelo: string,
  entrada: number | null,
  saida: number | null,
): number | null {
  const preco = PRECOS[modelo];
  if (preco === undefined || entrada === null) return null;
  const usd = (entrada / 1_000_000) * preco.entrada + ((saida ?? 0) / 1_000_000) * preco.saida;
  // O câmbio é o mesmo do resto do sistema: uma moeda só no contador de gasto.
  const cambio = Number(process.env["CRC_CAMBIO_USD_BRL"] ?? "5.4");
  return usd * (Number.isFinite(cambio) && cambio > 0 ? cambio : 5.4);
}

export function precoDoModeloGemini(modelo: string): { entrada: number; saida: number } | null {
  return PRECOS[modelo] ?? null;
}
