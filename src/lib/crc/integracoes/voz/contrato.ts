/**
 * Voz — a abstração, sem provedor.
 *
 * ============================================================================
 *  ESTE ARQUIVO EXISTE POR CAUSA DO ITEM 131: quando o provedor externo não
 *  está contratado, a ARQUITETURA precisa estar pronta mesmo assim.
 *
 *  A diferença entre "não temos voz" e "temos voz sem provedor" é o dia em que
 *  a clínica contratar um: no primeiro caso, alguém começa a escrever o módulo
 *  de voz; no segundo, alguém escreve UM adaptador de cem linhas e liga.
 * ============================================================================
 *
 * ============================================================================
 *  A DECISÃO MAIS IMPORTANTE AQUI É O QUE **NÃO** É DO PROVEDOR.
 *
 *  `CallToolExecutor` — o que a IA pode FAZER durante uma ligação — não é
 *  interface de provedor nenhum. Marcar consulta, criar lead e transferir para
 *  humano são regras da clínica, e continuam valendo igual se o provedor for
 *  Twilio, Vonage ou um PABX na sala dos fundos.
 *
 *  Deixar isso do lado do provedor seria reimplementar a política de
 *  agendamento uma vez por fornecedor — e na terceira vez elas já discordam.
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/* O que o provedor precisa saber fazer                                       */
/* -------------------------------------------------------------------------- */

export type DirecaoDaChamada = "ENTRADA" | "SAIDA";

export type SessaoDeChamada = {
  /** O id do provedor. É a chave de idempotência de tudo que vier depois. */
  idExterno: string;
  direcao: DirecaoDaChamada;
  /** E.164 sem o "+". O mesmo formato do resto do CRC. */
  de: string;
  para: string;
  iniciadaEm: string;
};

export type TrechoDeFala = {
  /** Quem falou. `PACIENTE` ou `SISTEMA` — nunca o nome de uma pessoa. */
  quem: "PACIENTE" | "SISTEMA";
  texto: string;
  /** 0..1. Abaixo de um limiar, a transcrição não deve virar decisão. */
  confianca: number;
  emSegundos: number;
};

export type ResultadoDeFala = { ok: true; trecho: TrechoDeFala } | { ok: false; motivo: string };

/**
 * O provedor de voz.
 *
 * TUDO AQUI É TRANSPORTE. Nenhum método decide coisa alguma sobre a clínica:
 * atender, falar, ouvir, desligar e transferir. A inteligência fica fora.
 */
export type ProvedorDeVoz = {
  nome: string;

  atender(sessao: SessaoDeChamada): Promise<void>;
  falar(idExterno: string, texto: string): Promise<void>;
  /** Escuta até o silêncio. O provedor decide o que é silêncio. */
  ouvir(idExterno: string): Promise<ResultadoDeFala>;
  transferir(idExterno: string, paraRamal: string): Promise<void>;
  desligar(idExterno: string): Promise<void>;
};

/* -------------------------------------------------------------------------- */
/* O que a IA pode fazer durante a ligação                                    */
/* -------------------------------------------------------------------------- */

export type FerramentaDeChamada =
  | "IDENTIFICAR_PACIENTE"
  | "CONSULTAR_AGENDA"
  | "MARCAR_CONSULTA"
  | "REMARCAR_CONSULTA"
  | "RESPONDER_ADMINISTRATIVO"
  | "CRIAR_LEAD"
  | "TRANSFERIR_HUMANO"
  | "RESUMIR_E_REGISTRAR"
  | "CONFIRMAR_POR_WHATSAPP";

/**
 * As ferramentas que EXIGEM gente, sempre.
 *
 * ============================================================================
 *  A LISTA É CURTA E NÃO DEPENDE DO NÍVEL DE AUTONOMIA.
 *
 *  Remarcar fora da política e qualquer coisa clínica não são "nível 5": são
 *  coisas que uma máquina não decide numa ligação, em que ninguém revisa antes
 *  de a frase sair da boca dela.
 *
 *  Num chat há uma mensagem para alguém ler depois; numa ligação a pessoa já
 *  ouviu.
 * ============================================================================
 */
export const SEMPRE_HUMANO: readonly FerramentaDeChamada[] = ["TRANSFERIR_HUMANO"];

export type PedidoDeFerramenta = {
  ferramenta: FerramentaDeChamada;
  argumentos: Record<string, unknown>;
};

export type RespostaDeFerramenta =
  | { ok: true; resumo: string; dados?: Record<string, unknown> }
  | { ok: false; motivo: string; transferir: boolean };

/**
 * Quem executa as ferramentas. NÃO é o provedor.
 *
 * É implementado pelo CRC, contra as regras da clínica, e o mesmo executor
 * serve para qualquer provedor de voz.
 */
export type ExecutorDeFerramentas = {
  executar(idExterno: string, pedido: PedidoDeFerramenta): Promise<RespostaDeFerramenta>;
};

/* -------------------------------------------------------------------------- */
/* O estado quando não há provedor                                            */
/* -------------------------------------------------------------------------- */

export class VozBloqueadaExternamente extends Error {
  readonly code = "BLOCKED_EXTERNAL";

  constructor(operacao: string) {
    super(
      `Voz não está disponível: nenhum provedor foi contratado. A operação "${operacao}" ` +
        `existe na arquitetura e não tem para onde ir. Ligações continuam sendo registradas ` +
        `à mão em crc_calls.`,
    );
    this.name = "VozBloqueadaExternamente";
  }
}

/**
 * O provedor que recusa tudo, com honestidade.
 *
 * ============================================================================
 *  ELE LANÇA EM VEZ DE DEVOLVER SILÊNCIO.
 *
 *  Um stub que resolve sem fazer nada é a pior opção das três: o CRC acharia
 *  que atendeu a ligação, gravaria a transcrição vazia, e a pessoa do outro
 *  lado teria escutado o telefone tocar até cair.
 *
 *  O erro carrega `code = BLOCKED_EXTERNAL`, que é o que a camada de cima
 *  precisa para distinguir "não contratado" de "quebrou".
 * ============================================================================
 */
export const VOZ_SEM_PROVEDOR: ProvedorDeVoz = {
  nome: "sem-provedor",
  atender: () => Promise.reject(new VozBloqueadaExternamente("atender")),
  falar: () => Promise.reject(new VozBloqueadaExternamente("falar")),
  ouvir: () => Promise.reject(new VozBloqueadaExternamente("ouvir")),
  transferir: () => Promise.reject(new VozBloqueadaExternamente("transferir")),
  desligar: () => Promise.reject(new VozBloqueadaExternamente("desligar")),
};

/**
 * Escolhe o provedor configurado.
 *
 * Hoje devolve sempre o que recusa. Quando houver adaptador, este é o único
 * lugar que muda — e é de propósito: um `if` espalhado por dez arquivos é como
 * metade do sistema continua chamando o provedor velho depois da migração.
 */
export function provedorDeVoz(): ProvedorDeVoz {
  return VOZ_SEM_PROVEDOR;
}

export function vozDisponivel(): boolean {
  return provedorDeVoz().nome !== "sem-provedor";
}
