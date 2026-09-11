/**
 * O adapter da Anthropic — Fatia 8.
 *
 * POR QUE UM SEGUNDO PROVEDOR DE VERDADE, e não só a promessa de que a porta
 * aceita um. Uma abstração com uma implementação só é uma abstração não testada:
 * ela costuma ter, escondido no formato, algo que só o provedor original faz. O
 * caso concreto aqui é o structured output.
 *
 * COMO SE OBTÉM SAÍDA ESTRUTURADA NA ANTHROPIC. Não existe `response_format:
 * json_schema`. O jeito é declarar uma TOOL cujo `input_schema` é o esquema
 * pedido e forçar o uso dela com `tool_choice`. O modelo então "chama a
 * ferramenta", e o `input` da chamada é o objeto validado contra o schema.
 *
 * Isso é um detalhe de formato, e é exatamente por isso que ele mora aqui: a
 * `PortaIa` continua com o mesmo contrato de um método, e `turno.ts`,
 * `supervisor.ts` e a classificação não sabem que existe diferença.
 *
 * `fetch` DIRETO, pela mesma razão do adapter da OpenAI: o projeto tem cinco
 * dependências de runtime e nenhuma é SDK de provedor.
 */
import { campo, ehObjeto, numeroOpcional, textoOpcional } from "../../dominio/validar";
import { pedir, type EventoHttp } from "../../servidor/http";
import { registrarIntegracao } from "../../servidor/registro";

import type { PedidoIa, PortaIa, RespostaIa, UsoIa } from "./porta";

/** Preço por milhão de tokens, em dólar. Estimativa — ver `provedor.ts`. */
const PRECOS_USD_POR_MILHAO: Readonly<Record<string, { entrada: number; saida: number }>> = {
  "claude-haiku-4-5-20251001": { entrada: 1.0, saida: 5.0 },
  "claude-sonnet-5": { entrada: 3.0, saida: 15.0 },
  "claude-opus-5": { entrada: 15.0, saida: 75.0 },
};

/** A versão da API vai no cabeçalho, e é obrigatória. */
const VERSAO_API = "2023-06-01";

function cambio(): number {
  const v = Number.parseFloat(process.env["CRC_USD_BRL"] ?? "");
  return Number.isFinite(v) && v > 0 ? v : 5.5;
}

function estimarCusto(modelo: string, entrada: number | null, saida: number | null): number | null {
  const preco = PRECOS_USD_POR_MILHAO[modelo];
  if (preco === undefined || entrada === null || saida === null) return null;
  const usd = (entrada / 1_000_000) * preco.entrada + (saida / 1_000_000) * preco.saida;
  return Number((usd * cambio()).toFixed(6));
}

class ProvedorAnthropic implements PortaIa {
  readonly nome = "anthropic";
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

    // Duas tentativas, igual ao adapter da OpenAI e pelo mesmo motivo: insistir
    // com um modelo que não entendeu o formato queima dinheiro sem convergir.
    for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
      const comecou = Date.now();
      const eventos: EventoHttp[] = [];

      const entrada =
        tentativa === 1
          ? pedido.entrada
          : `${pedido.entrada}\n\nA resposta anterior foi recusada por este motivo: ${ultimoErro}\nResponda de novo, respeitando exatamente o formato pedido.`;

      try {
        const resposta = await pedir("https://api.anthropic.com/v1/messages", {
          metodo: "POST",
          cabecalhos: { "x-api-key": this.chave, "anthropic-version": VERSAO_API },
          corpo: {
            model: this.modelo,
            max_tokens: pedido.maxTokens ?? 500,
            // O `system` é campo próprio na Anthropic, e não uma mensagem de
            // papel "system" como na OpenAI.
            system: pedido.instrucoes,
            messages: [{ role: "user", content: entrada }],
            tools: [
              {
                name: pedido.esquema.nome,
                description: "Responda SEMPRE chamando esta ferramenta.",
                input_schema: pedido.esquema.schema,
              },
            ],
            // O que transforma "por favor devolva JSON" em garantia de formato.
            tool_choice: { type: "tool", name: pedido.esquema.nome },
          },
          timeoutMs: pedido.timeoutMs ?? 25_000,
          repetirEscrita: false,
          aoRegistrar: (e) => eventos.push(e),
        });

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
         * O objeto vem no `input` do BLOCO DE TOOL_USE, e não no primeiro bloco
         * da resposta. O modelo pode emitir um bloco de texto antes — "vou
         * consultar isto" — e ler `content[0]` funcionaria na maioria das vezes e
         * falharia de forma intermitente, que é a pior forma de falhar.
         */
        const blocos = campo(resposta.corpo, "content");
        const bloco = Array.isArray(blocos)
          ? blocos.find((b) => ehObjeto(b) && b["type"] === "tool_use")
          : undefined;

        if (!ehObjeto(bloco)) {
          ultimoErro = "O modelo não chamou a ferramenta de resposta.";
          continue;
        }
        const dados = bloco["input"];
        if (!ehObjeto(dados)) {
          ultimoErro = "A chamada de ferramenta veio sem objeto.";
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
    // Os nomes são outros: `input_tokens` e `output_tokens`, não
    // `prompt_tokens`/`completion_tokens`.
    const entrada = numeroOpcional(campo(corpo, "usage.input_tokens"));
    const saida = numeroOpcional(campo(corpo, "usage.output_tokens"));
    return {
      modelo: this.modelo,
      inputTokens: entrada,
      outputTokens: saida,
      custoEstimado: estimarCusto(this.modelo, entrada, saida),
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
      caminho: "/v1/messages",
      statusHttp: ultimo.statusHttp,
      sucesso: ultimo.sucesso,
      erro: ultimo.erro,
      duracaoMs: ultimo.duracaoMs,
    });
  }
}

export function criarPortaAnthropic(
  chave: string,
  modelo: string,
  organizationId: string | null,
): PortaIa {
  return new ProvedorAnthropic(chave, modelo, organizationId);
}

/** Exposta para o gateway estimar custo antes da chamada. */
export function precoAnthropic(modelo: string): { entrada: number; saida: number } | null {
  return PRECOS_USD_POR_MILHAO[modelo] ?? null;
}
