/**
 * Os contratos do runtime agentic. Puro: nenhum I/O, nenhum import de infra.
 *
 * ESTE ARQUIVO É O QUE IMPEDE O RUNTIME DE VIRAR UM SEGUNDO SISTEMA. Cada tipo
 * aqui descreve uma fronteira que já existe no CRC — conversa, paciente,
 * oportunidade, oferta — e nenhum deles carrega prontuário, odontograma ou
 * anamnese. O que não está declarado aqui não chega ao modelo.
 *
 * Ver `docs/crc/AI-PLATFORM-ADR.md` para as decisões que moldaram estes tipos.
 */

/* -------------------------------------------------------------------------- */
/* O desfecho de um turno                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Como um turno termina. União fechada de propósito.
 *
 * NÃO EXISTE VARIANTE "deu erro e não sei o que fazer". Toda falha cai em
 * `falha_segura`, que é um estado nomeado com motivo — e o motivo vira tarefa
 * humana. Silêncio inexplicado é o único desfecho que este sistema não aceita,
 * porque do outro lado existe um paciente esperando (ADR-11).
 */
export type ResultadoTurno =
  | { tipo: "enviado"; mensagemId: string }
  | { tipo: "candidato"; texto: string; motivo: string }
  | { tipo: "aguardando"; retomarEm: string }
  | { tipo: "humano"; motivo: string }
  | { tipo: "sem_acao"; motivo: string }
  | { tipo: "falha_segura"; motivo: string };

/** O tipo, isolado, para gravar em coluna e filtrar. */
export type TipoResultadoTurno = ResultadoTurno["tipo"];

/* -------------------------------------------------------------------------- */
/* O contexto que o modelo recebe                                             */
/* -------------------------------------------------------------------------- */

/**
 * O paciente, reduzido ao que muda a decisão do agente.
 *
 * Compare com `crc_patients`: fora ficaram CPF, endereço, nascimento completo,
 * convênio, especialidade e todo o resto. Não porque seriam inúteis num
 * relatório, mas porque nenhum deles muda o que o agente responde — e cada
 * campo enviado é um campo que pode vazar numa resposta.
 */
export type PacienteDoTurno = {
  id: string;
  primeiroNome: string;
  situacao: string | null;
  ultimaConsultaEm: string | null;
  proximaConsultaEm: string | null;
  temOptOut: boolean;
};

export type OportunidadeDoTurno = {
  id: string;
  tipo: string;
  etapa: string;
  valorPotencial: string | null;
};

/** A oferta de horários aberta, quando existe uma. */
export type OfertaDoTurno = {
  id: string;
  expiraEm: string;
  opcoes: readonly { inicioEm: string; dentista: string | null }[];
};

export type MensagemDoTurno = {
  direcao: "recebida" | "enviada";
  texto: string;
  em: string;
};

/**
 * Tudo que o agente sabe quando decide. Nada mais existe para ele.
 *
 * `agora` entra por parâmetro, como no resto do domínio: um turno tem UM
 * relógio, e o mesmo turno não pode julgar a janela de atendimento com um
 * instante e calcular a espera com outro.
 */
export type ContextoTurno = {
  organizationId: string;
  clinicId: string | null;
  conversationId: string;
  agora: Date;
  paciente: PacienteDoTurno | null;
  oportunidade: OportunidadeDoTurno | null;
  oferta: OfertaDoTurno | null;
  mensagens: readonly MensagemDoTurno[];
  /** O resumo que o classificador já produziu, quando existe. */
  resumo: string | null;
  /** A última leitura do classificador, reaproveitada em vez de refeita. */
  intencao: string | null;
  temperatura: string | null;
};

/* -------------------------------------------------------------------------- */
/* A resposta candidata                                                       */
/* -------------------------------------------------------------------------- */

/**
 * O que o modelo devolve num turno de sombra.
 *
 * `precisaHumano` é campo do modelo, não inferência nossa sobre o texto dele.
 * Perguntar diretamente sai mais barato e mais confiável do que tentar deduzir
 * a partir da resposta — e deixa o modelo declarar dúvida em vez de inventar
 * confiança.
 */
export type RespostaCandidata = {
  texto: string;
  raciocinio: string;
  precisaHumano: boolean;
  motivoHumano: string | null;
};

/** O esquema que a `PortaIa` vai exigir do provedor. */
export const ESQUEMA_RESPOSTA_CANDIDATA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["texto", "raciocinio", "precisaHumano", "motivoHumano"],
  properties: {
    texto: {
      type: "string",
      description: "A resposta que seria enviada ao paciente, em português do Brasil.",
    },
    raciocinio: {
      type: "string",
      description: "Em uma frase, por que esta é a resposta certa agora.",
    },
    precisaHumano: {
      type: "boolean",
      description: "true quando a conversa exige uma pessoa da clínica.",
    },
    motivoHumano: {
      type: ["string", "null"],
      description: "Quando precisaHumano for true, o motivo em poucas palavras.",
    },
  },
};

/** A versão lógica do prompt, gravada em cada chamada para a decisão ser auditável. */
export const PROMPT_TURNO_SOMBRA = "agent_shadow_turn_v1";

/* -------------------------------------------------------------------------- */
/* Validação                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Valida o que veio do modelo antes de qualquer coisa tocar nisso.
 *
 * A porta já exige saída estruturada, mas "estruturada" não é "válida": um
 * provedor pode devolver `texto: ""` ou `precisaHumano: true` sem motivo, e as
 * duas coisas passam por qualquer JSON Schema razoável. A validação de
 * conteúdo é aqui, e é pura — testável sem provedor.
 */
export type ValidacaoCandidata =
  { ok: true; resposta: RespostaCandidata } | { ok: false; motivo: string };

/** Acima disso não é resposta de WhatsApp, é artigo. */
export const MAX_CARACTERES_RESPOSTA = 900;

export function validarRespostaCandidata(dados: Record<string, unknown>): ValidacaoCandidata {
  const texto = dados["texto"];
  const raciocinio = dados["raciocinio"];
  const precisaHumano = dados["precisaHumano"];
  const motivoHumano = dados["motivoHumano"];

  if (typeof texto !== "string" || texto.trim().length === 0) {
    return { ok: false, motivo: "resposta sem texto" };
  }
  if (texto.length > MAX_CARACTERES_RESPOSTA) {
    return { ok: false, motivo: `resposta com ${String(texto.length)} caracteres` };
  }
  if (typeof precisaHumano !== "boolean") {
    return { ok: false, motivo: "precisaHumano ausente ou não booleano" };
  }
  // Pedir humano sem dizer por quê deixa a recepção com uma tarefa sem
  // enunciado — que é pior do que não ter a tarefa.
  const motivo = typeof motivoHumano === "string" ? motivoHumano.trim() : "";
  if (precisaHumano && motivo.length === 0) {
    return { ok: false, motivo: "pediu humano sem motivo" };
  }

  return {
    ok: true,
    resposta: {
      texto: texto.trim(),
      raciocinio: typeof raciocinio === "string" ? raciocinio.trim() : "",
      precisaHumano,
      motivoHumano: motivo.length > 0 ? motivo : null,
    },
  };
}
