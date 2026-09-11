/**
 * O adapter da OpenAI, e o de sandbox.
 *
 * POR QUE `fetch` DIRETO, E NÃO O SDK
 * Mesma razão do driver do Supabase no RH: o projeto tem cinco dependências de
 * runtime e nenhuma é SDK de provedor. O que precisamos daqui é uma chamada
 * HTTP com `response_format: json_schema` — o SDK acrescentaria megabytes ao
 * bundle para embrulhar isso.
 *
 * O RETRY CONTROLADO DO ITEM 13 DO MEGA PROMPT MORA AQUI: se o modelo devolver
 * algo que não bate com o schema, tentamos UMA vez mais, com a mensagem de erro
 * anexada. Duas tentativas e desiste — insistir com um modelo que não entendeu
 * o formato queima dinheiro sem convergir, e o fallback (tarefa humana) é
 * melhor do que uma terceira tentativa.
 *
 * ESTADO: a `OPENAI_API_KEY` do portal de RH já existe no ambiente e é
 * reaproveitada. O modelo é configurável em separado (`OPENAI_MODEL_CRC`),
 * porque a tarefa é outra: o RH lê currículo em texto longo, o CRC classifica
 * mensagem curta com schema.
 */
import { ehObjeto, campo, numeroOpcional, textoOpcional } from "../../dominio/validar";
import { pedir, type EventoHttp } from "../../servidor/http";
import { registrarIntegracao } from "../../servidor/registro";

import type { EstadoIa, PedidoIa, PortaIa, RespostaIa, UsoIa } from "./porta";

/**
 * Preço por milhão de tokens, em dólar, para a estimativa de custo (item 46).
 *
 * É ESTIMATIVA E O NOME DIZ ISSO. Tabela de preço muda sem aviso, e o objetivo
 * do número não é contabilidade: é a operação perceber quando o custo saiu da
 * ordem de grandeza esperada. Modelo desconhecido devolve `null` em vez de
 * inventar — item 205, "não inventar número".
 */
const PRECOS_USD_POR_MILHAO: Readonly<Record<string, { entrada: number; saida: number }>> = {
  "gpt-5.6-luna": { entrada: 0.1, saida: 0.4 },
  "gpt-5-mini": { entrada: 0.25, saida: 2.0 },
  "gpt-5.5": { entrada: 1.25, saida: 10.0 },
};

/** Câmbio para o custo aparecer em reais na tela do admin. Configurável. */
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

/* -------------------------------------------------------------------------- */
/* OpenAI                                                                     */
/* -------------------------------------------------------------------------- */

class ProvedorOpenAi implements PortaIa {
  readonly nome = "openai";
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

      // Na segunda volta, o erro da primeira entra na conversa. Repetir a
      // mesma pergunta idêntica daria a mesma resposta ruim.
      const entrada =
        tentativa === 1
          ? pedido.entrada
          : `${pedido.entrada}\n\nA resposta anterior foi recusada por este motivo: ${ultimoErro}\nResponda de novo, respeitando exatamente o formato pedido.`;

      try {
        const resposta = await pedir("https://api.openai.com/v1/chat/completions", {
          metodo: "POST",
          cabecalhos: { Authorization: `Bearer ${this.chave}` },
          corpo: {
            model: this.modelo,
            messages: [
              { role: "system", content: pedido.instrucoes },
              { role: "user", content: entrada },
            ],
            // O que faz o structured output ser garantia e não pedido: com
            // `strict: true` o provedor recusa gerar fora do schema.
            response_format: {
              type: "json_schema",
              json_schema: {
                name: pedido.esquema.nome,
                strict: true,
                schema: pedido.esquema.schema,
              },
            },
            max_completion_tokens: pedido.maxTokens ?? 500,
          },
          timeoutMs: pedido.timeoutMs ?? 25_000,
          // Chamada de IA é cara e não idempotente do ponto de vista de custo.
          // O retry aqui é o de schema, controlado acima — não o do http.
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
          // 4xx que não seja 429 não melhora tentando de novo.
          if (resposta.status < 500 && resposta.status !== 429) {
            return { ok: false, motivo: "recusada", detalhe, uso };
          }
          ultimoErro = detalhe;
          continue;
        }

        const conteudo = textoOpcional(campo(resposta.corpo, "choices.0.message.content"));
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
    const entrada = numeroOpcional(campo(corpo, "usage.prompt_tokens"));
    const saida = numeroOpcional(campo(corpo, "usage.completion_tokens"));
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
      caminho: "/v1/chat/completions",
      statusHttp: ultimo.statusHttp,
      sucesso: ultimo.sucesso,
      erro: ultimo.erro,
      duracaoMs: ultimo.duracaoMs,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Sandbox                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Uma IA determinística por palavra-chave.
 *
 * NÃO É "IA FALSA PARA FINGIR QUE FUNCIONA". Ela existe para duas coisas
 * concretas: rodar o fluxo E2E sem gastar token, e — mais importante — provar
 * que o sistema continua operando quando a IA está fora (item 117). Trocar o
 * provedor real por este e ver a Inbox, as jornadas e as tarefas seguirem
 * funcionando é o teste desse requisito.
 *
 * As palavras-chave são propositalmente óbvias: qualquer coisa mais esperta
 * daria a impressão de que o sandbox "quase" substitui o modelo, e ele não
 * substitui.
 */
class ProvedorSandboxIa implements PortaIa {
  readonly nome = "sandbox";
  readonly modelo = "sandbox-regras";

  gerarEstruturado(pedido: PedidoIa): Promise<RespostaIa> {
    const texto = pedido.entrada.toLowerCase();
    const contem = (...termos: string[]): boolean => termos.some((t) => texto.includes(t));

    let intencao = "OUTRO";
    let temperatura = "COLD";
    let acao = "ASSIGN_HUMAN";
    let exigeHumano = false;
    let motivo: string | null = null;

    if (contem("cancelar", "não vou poder", "nao vou poder", "desmarcar")) {
      intencao = "CANCELAR";
      temperatura = "WARM";
      acao = "SHOW_AVAILABLE_SLOTS";
    } else if (contem("remarcar", "mudar", "outro dia", "outro horário", "outro horario")) {
      intencao = "REMARCAR";
      temperatura = "HOT";
      acao = "SHOW_AVAILABLE_SLOTS";
    } else if (contem("agendar", "marcar", "quero uma consulta", "horário", "horario", "vaga")) {
      intencao = "AGENDAR";
      temperatura = "HOT";
      acao = "SHOW_AVAILABLE_SLOTS";
    } else if (contem("sim", "confirmo", "confirmado", "ok", "estarei")) {
      intencao = "CONFIRMAR";
      temperatura = "WARM";
      acao = "UPDATE_OPPORTUNITY";
    } else if (contem("preço", "preco", "quanto custa", "valor")) {
      intencao = "PRECO";
      temperatura = "WARM";
      acao = "ASSIGN_HUMAN";
    } else if (contem("dói", "doi", "dor", "inflamad", "sangrando", "remédio", "remedio")) {
      intencao = "DUVIDA_CLINICA";
      exigeHumano = true;
      motivo = "clinical_question";
      acao = "ASSIGN_HUMAN";
    } else if (contem("péssimo", "pessimo", "absurdo", "reclamação", "reclamacao", "processo")) {
      intencao = "RECLAMACAO";
      exigeHumano = true;
      motivo = "complaint";
      acao = "ASSIGN_HUMAN";
    } else if (contem("não quero", "nao quero", "parar", "descadastr")) {
      intencao = "DESCADASTRO";
      acao = "UPDATE_OPPORTUNITY";
    }

    return Promise.resolve({
      ok: true,
      dados: {
        intencao,
        temperatura,
        // Abaixo do limiar de ação automática de propósito: o sandbox nunca
        // deve autorizar a IA a agir sozinha.
        confianca: 0.7,
        exigeHumano,
        motivoEscalonamento: motivo,
        acaoSugerida: acao,
        resumo: "Classificação de sandbox, por palavra-chave.",
      },
      uso: {
        modelo: this.modelo,
        inputTokens: null,
        outputTokens: null,
        custoEstimado: 0,
        duracaoMs: 0,
      },
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Fábrica                                                                    */
/* -------------------------------------------------------------------------- */

export function criarProvedorIa(organizationId: string | null): EstadoIa {
  const producao = process.env["NODE_ENV"] === "production";
  const pediuSandbox = (process.env["CRC_IA_SANDBOX"] ?? "").trim() === "1";

  if (pediuSandbox && !producao) {
    return { configurado: true, porta: new ProvedorSandboxIa() };
  }

  const chave = (process.env["OPENAI_API_KEY"] ?? "").trim();
  if (chave.length === 0) {
    return {
      configurado: false,
      motivo: "A leitura automática de conversas ainda não foi configurada.",
      faltando: ["OPENAI_API_KEY"],
    };
  }

  const modelo = (process.env["OPENAI_MODEL_CRC"] ?? "gpt-5.6-luna").trim();
  return { configurado: true, porta: new ProvedorOpenAi(chave, modelo, organizationId) };
}

/**
 * A porta da OpenAI com chave e modelo escolhidos por quem chama — Fatia 8.
 *
 * Existe para o gateway de modelos poder montar a porta com a chave DA CLÍNICA e
 * o modelo que a rota daquela finalidade declara. `criarProvedorIa` continua
 * sendo o caminho de quem não tem rota configurada: lê o ambiente e pronto.
 */
export function criarPortaOpenAi(
  chave: string,
  modelo: string,
  organizationId: string | null,
): PortaIa {
  return new ProvedorOpenAi(chave, modelo, organizationId);
}

/** A IA de sandbox, para o gateway poder rotear para ela explicitamente. */
export function criarPortaSandboxIa(): PortaIa {
  return new ProvedorSandboxIa();
}

/** Exposta para o gateway estimar custo ANTES da chamada (ADR-12). */
export function precoDoModelo(modelo: string): { entrada: number; saida: number } | null {
  return PRECOS_USD_POR_MILHAO[modelo] ?? null;
}

/** O câmbio em uso, para a estimativa do gateway sair na mesma moeda. */
export function cambioUsdBrl(): number {
  return cambio();
}
