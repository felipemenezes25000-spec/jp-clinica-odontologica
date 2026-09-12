/**
 * Pagamento — a abstração, sem provedor.
 *
 * ============================================================================
 *  A REGRA QUE GOVERNA O ARQUIVO INTEIRO: **NUNCA GUARDAR CARTÃO**.
 *
 *  Está escrita no §28 e é uma decisão de arquitetura, não de configuração.
 *  Por isso nenhum tipo daqui tem campo de número, CVV ou validade — não há
 *  onde escrever, e o que não existe não vaza.
 *
 *  O que trafega é `PaymentLink`: o provedor hospeda a captura, o paciente
 *  digita lá, e o CRC recebe de volta um id e um status. A clínica passa a
 *  não ter dado de cartão para proteger, e é a única forma de isso ser
 *  verdade.
 * ============================================================================
 *
 * ============================================================================
 *  O SEGUNDO PONTO É O ESTADO `DESCONHECIDO`.
 *
 *  Toda integração de pagamento cai no meio de alguma transação. O que
 *  acontece é: o CRC pediu, o provedor recebeu, e a resposta se perdeu. O
 *  dinheiro pode ter saído ou não.
 *
 *  Um enum sem esse estado força quem escreve o código a escolher entre
 *  `PAGO` e `NAO_PAGO` — e as duas escolhas são erradas. `DESCONHECIDO`
 *  existe para ser reconciliado depois, e para NUNCA liberar atendimento.
 * ============================================================================
 */

export type MeioDePagamento = "PIX" | "CARTAO" | "BOLETO" | "LINK";

/**
 * Os estados, e nenhum deles é "quase pago".
 *
 * `DESCONHECIDO` e `EXPIRADO` são diferentes de propósito: o primeiro é
 * ignorância do CRC sobre o que aconteceu; o segundo é um fato — o prazo
 * acabou e nada aconteceu.
 */
export type EstadoDoPagamento =
  "CRIADO" | "AGUARDANDO" | "PAGO" | "RECUSADO" | "ESTORNADO" | "EXPIRADO" | "DESCONHECIDO";

/** Os que autorizam seguir com o atendimento. A lista é curta de propósito. */
export const ESTADOS_QUE_LIBERAM: readonly EstadoDoPagamento[] = ["PAGO"];

export function liberaAtendimento(estado: EstadoDoPagamento): boolean {
  return ESTADOS_QUE_LIBERAM.includes(estado);
}

export type IntencaoDePagamento = {
  /** O id do provedor. Chave de idempotência e de reconciliação. */
  idExterno: string;
  /** Em centavos. Ponto flutuante em dinheiro é como R$ 0,01 desaparece. */
  centavos: number;
  meio: MeioDePagamento;
  estado: EstadoDoPagamento;
  /** Para onde mandar o paciente. Nunca um formulário do CRC. */
  url: string | null;
  expiraEm: string | null;
  criadoEm: string;
};

export type PedidoDeCobranca = {
  centavos: number;
  meio: MeioDePagamento;
  descricao: string;
  /**
   * A chave de idempotência DO CRC, e não do provedor.
   *
   * Existe porque o retry é do nosso lado: sem ela, uma requisição que morreu
   * depois de o provedor receber viraria uma segunda cobrança do mesmo
   * paciente pela mesma coisa.
   */
  chaveDeIdempotencia: string;
  expiraEmMinutos: number;
};

export type ResultadoDeCobranca =
  { ok: true; intencao: IntencaoDePagamento } | { ok: false; code: string; motivo: string };

export type ProvedorDePagamento = {
  nome: string;

  criar(pedido: PedidoDeCobranca): Promise<ResultadoDeCobranca>;
  consultar(idExterno: string): Promise<ResultadoDeCobranca>;
  estornar(idExterno: string, centavos: number): Promise<ResultadoDeCobranca>;

  /**
   * Confere a assinatura do webhook.
   *
   * ============================================================================
   *  ESTÁ NA INTERFACE DO PROVEDOR, e não numa função solta, porque cada um
   *  assina de um jeito — HMAC do corpo, header próprio, timestamp no meio.
   *
   *  E devolve `boolean` em vez de lançar: a rota precisa responder 401 sem
   *  stack trace. Comparação em tempo constante é obrigação de quem
   *  implementa, e está escrita aqui para que ninguém a descubra depois.
   * ============================================================================
   */
  conferirAssinatura(corpoBruto: string, cabecalhos: Record<string, string>): boolean;
};

/* -------------------------------------------------------------------------- */
/* Sem provedor                                                               */
/* -------------------------------------------------------------------------- */

export class PagamentoBloqueadoExternamente extends Error {
  readonly code = "BLOCKED_EXTERNAL";

  constructor(operacao: string) {
    super(
      `Pagamento não está disponível: nenhum provedor foi contratado. A operação ` +
        `"${operacao}" existe na arquitetura e não tem para onde ir. A política de ` +
        `desconto e parcelamento continua valendo — ela é regra, e não integração.`,
    );
    this.name = "PagamentoBloqueadoExternamente";
  }
}

/**
 * O provedor que recusa tudo.
 *
 * ============================================================================
 *  `conferirAssinatura` DEVOLVE `false`, E ISSO NÃO É DETALHE.
 *
 *  É a única função da interface que não lança. Se ela lançasse, a rota de
 *  webhook responderia 500 a qualquer requisição — e um atacante saberia que
 *  há um endpoint ali. Devolvendo `false`, a rota responde 401 como
 *  responderia a qualquer assinatura errada, e o comportamento é o mesmo com
 *  ou sem provedor.
 *
 *  Devolver `true` seria catastrófico: aceitaria qualquer webhook forjado
 *  dizendo "pago".
 * ============================================================================
 */
export const PAGAMENTO_SEM_PROVEDOR: ProvedorDePagamento = {
  nome: "sem-provedor",
  criar: () => Promise.reject(new PagamentoBloqueadoExternamente("criar cobrança")),
  consultar: () => Promise.reject(new PagamentoBloqueadoExternamente("consultar cobrança")),
  estornar: () => Promise.reject(new PagamentoBloqueadoExternamente("estornar")),
  conferirAssinatura: () => false,
};

export function provedorDePagamento(): ProvedorDePagamento {
  return PAGAMENTO_SEM_PROVEDOR;
}

export function pagamentoDisponivel(): boolean {
  return provedorDePagamento().nome !== "sem-provedor";
}
