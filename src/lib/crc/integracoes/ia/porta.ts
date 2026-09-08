/**
 * A porta da IA — item 41 do contrato: "criar abstração `AIProvider`; não
 * espalhar SDK do provedor pelo domínio".
 *
 * O CONTRATO É ESTREITO DE PROPÓSITO: um método só, `gerarEstruturado`. Não
 * existe `gerarTexto`, e a ausência é a decisão mais importante deste arquivo.
 * O item 43 exige structured output obrigatório; expor um caminho que devolve
 * texto solto seria abrir a porta para alguém usá-lo "só nesse caso", e a
 * validação vira opcional na prática.
 *
 * O QUE SAI DAQUI PARA O MODELO: só o que o `construirContexto` montou. Nunca
 * prontuário, nunca histórico clínico, nunca a base inteira (itens 14 e 47).
 */

/** O esquema esperado, descrito de um jeito que o provedor entenda. */
export type EsquemaSaida = {
  /** Nome lógico, para o log e para o provedor. */
  nome: string;
  /** JSON Schema do objeto esperado. */
  schema: Record<string, unknown>;
};

export type PedidoIa = {
  /**
   * Versão LÓGICA do prompt (item 42). Ex.: `conversation_classifier_v1`.
   * Guardada em cada chamada para a decisão ser auditável depois de o prompt
   * evoluir.
   */
  promptVersao: string;
  instrucoes: string;
  entrada: string;
  esquema: EsquemaSaida;
  /** Teto de tokens de saída. Protege contra resposta gigante e cara. */
  maxTokens?: number;
  timeoutMs?: number;
};

export type UsoIa = {
  modelo: string;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Em reais, estimado a partir da tabela de preços do provedor. */
  custoEstimado: number | null;
  duracaoMs: number;
};

export type RespostaIa =
  | { ok: true; dados: Record<string, unknown>; uso: UsoIa }
  | {
      ok: false;
      motivo: "invalida" | "indisponivel" | "recusada";
      detalhe: string;
      uso: UsoIa | null;
    };

export type PortaIa = {
  readonly nome: string;
  readonly modelo: string;
  gerarEstruturado(pedido: PedidoIa): Promise<RespostaIa>;
};

export type EstadoIa =
  | { configurado: true; porta: PortaIa }
  | { configurado: false; motivo: string; faltando: string[] };
