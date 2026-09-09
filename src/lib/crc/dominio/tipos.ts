/**
 * O vocabulário do JP CRC.
 *
 * Este arquivo é PURO: nenhum import de `node:`, de servidor ou de React. Ele é
 * carregado tanto pela tela quanto pelo worker, e é a única definição de forma
 * que os dois compartilham.
 *
 * REGRA QUE ORGANIZA O ARQUIVO: código interno em MAIÚSCULA (`MISSED_APPOINTMENT`)
 * nunca aparece para o usuário. O item 222 do contrato é explícito: a tela mostra
 * "Faltou". A tradução mora em `rotulos.ts`, não espalhada pelo JSX.
 */

/* -------------------------------------------------------------------------- */
/* Identidade e tenant                                                        */
/* -------------------------------------------------------------------------- */

export type Papel = "admin" | "gestor" | "crc" | "recepcao" | "dentista" | "marketing";

export const PAPEIS: readonly Papel[] = [
  "admin",
  "gestor",
  "crc",
  "recepcao",
  "dentista",
  "marketing",
] as const;

export type Usuario = {
  id: string;
  organizationId: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  clinicas: string[];
};

export type Clinica = {
  id: string;
  organizationId: string;
  nome: string;
  slug: string;
  externalId: string | null;
  fuso: string;
  ativa: boolean;
};

/* -------------------------------------------------------------------------- */
/* Paciente                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Situação do paciente, já normalizada.
 *
 * O Dental Office manda 1..7. Esses números NÃO circulam pelo sistema — item 18
 * do contrato. `status.ts` é a única porta de entrada deles.
 */
export type SituacaoPaciente =
  "PRIMEIRA_CONSULTA" | "EM_TRATAMENTO" | "CONCLUIDO" | "ALTA" | "ABANDONO" | "DESCONHECIDO";

export const SITUACOES_PACIENTE: readonly SituacaoPaciente[] = [
  "PRIMEIRA_CONSULTA",
  "EM_TRATAMENTO",
  "CONCLUIDO",
  "ALTA",
  "ABANDONO",
  "DESCONHECIDO",
] as const;

export type Paciente = {
  id: string;
  organizationId: string;
  clinicId: string;
  externalSource: string;
  externalId: string;
  nome: string;
  nascimento: string | null;
  genero: string | null;
  situacao: SituacaoPaciente;
  especialidade: string | null;
  ativo: boolean;
  /** E.164 sem '+'. Ex.: 5511999998888. */
  telefone: string | null;
  telefoneBruto: string | null;
  email: string | null;
  ultimaConsultaEm: string | null;
  proximaConsultaEm: string | null;
  optOutEm: string | null;
  optOutMotivo: string | null;
  arquivado: boolean;
  sincronizadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

/* -------------------------------------------------------------------------- */
/* Agenda                                                                     */
/* -------------------------------------------------------------------------- */

export type StatusAgendamento =
  "TO_CONFIRM" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "CANCELLED";

export const STATUS_AGENDAMENTO: readonly StatusAgendamento[] = [
  "TO_CONFIRM",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "MISSED",
  "CANCELLED",
] as const;

export type Agendamento = {
  id: string;
  organizationId: string;
  clinicId: string;
  patientId: string | null;
  externalSource: string;
  externalId: string;
  dentistaExternoId: string | null;
  dentistaNome: string | null;
  cadeiraExternaId: string | null;
  inicioEm: string;
  fimEm: string | null;
  descricao: string | null;
  status: StatusAgendamento;
  statusExterno: string | null;
  sincronizadoEm: string | null;
};

/** Slot livre devolvido pela agenda externa, já normalizado. */
export type SlotDisponivel = {
  clinicId: string;
  dentistaExternoId: string;
  /**
   * A cadeira em que ESTE horário está livre.
   *
   * Não é escolha do CRC: é parte do horário. O Dental Office devolve o
   * `chair_id` dentro de cada período livre, e exige a cadeira ao criar a
   * consulta. Um horário sem cadeira não é agendável — por isso o campo é
   * obrigatório aqui, e não opcional.
   */
  cadeiraExternaId: string;
  inicioEm: string;
  fimEm: string;
  duracaoMinutos: number;
};

/* -------------------------------------------------------------------------- */
/* Oportunidade                                                               */
/* -------------------------------------------------------------------------- */

export type TipoOportunidade =
  | "NEW_LEAD"
  | "MISSED_APPOINTMENT"
  | "CANCELLED_APPOINTMENT"
  | "RECALL"
  | "INACTIVE_PATIENT"
  | "ABANDONED_TREATMENT"
  | "BUDGET_RECOVERY"
  | "BIRTHDAY"
  | "MANUAL";

export const TIPOS_OPORTUNIDADE: readonly TipoOportunidade[] = [
  "NEW_LEAD",
  "MISSED_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "RECALL",
  "INACTIVE_PATIENT",
  "ABANDONED_TREATMENT",
  "BUDGET_RECOVERY",
  "BIRTHDAY",
  "MANUAL",
] as const;

/** Categoria da etapa: define o que conta como conversão nas métricas. */
export type CategoriaEtapa = "ABERTA" | "GANHA" | "PERDIDA";

export type EtapaFunil = {
  id: string;
  chave: string;
  nome: string;
  ordem: number;
  categoria: CategoriaEtapa;
};

/**
 * Um fator de priorização, guardado junto do score.
 *
 * Existe para a UI responder "por que prioridade alta?" (item 173) sem
 * recalcular nada — o número que o usuário vê e o número que ordenou a fila
 * são o mesmo, com a mesma explicação.
 */
export type FatorPrioridade = {
  chave: string;
  /** Texto pronto para a tela. Ex.: "Respondeu hoje". */
  rotulo: string;
  pontos: number;
};

export type Oportunidade = {
  id: string;
  organizationId: string;
  clinicId: string;
  patientId: string | null;
  leadId: string | null;
  tipo: TipoOportunidade;
  stageId: string | null;
  assignedTo: string | null;
  priorityScore: number;
  priorityFatores: FatorPrioridade[];
  /** Em reais, com duas casas. Nunca float — vem como string do banco. */
  potentialValue: string | null;
  origem: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  motivo: string | null;
  lostReason: string | null;
  reactivateAt: string | null;
  fechadaEm: string | null;
  chaveDedupe: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

/* -------------------------------------------------------------------------- */
/* Tarefa                                                                     */
/* -------------------------------------------------------------------------- */

export type TipoTarefa = "LIGAR" | "WHATSAPP" | "REVISAR" | "NEGOCIAR" | "CONFIRMAR" | "RETORNAR";
export type StatusTarefa = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export const TIPOS_TAREFA: readonly TipoTarefa[] = [
  "LIGAR",
  "WHATSAPP",
  "REVISAR",
  "NEGOCIAR",
  "CONFIRMAR",
  "RETORNAR",
] as const;

export const STATUS_TAREFA: readonly StatusTarefa[] = [
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type Tarefa = {
  id: string;
  organizationId: string;
  clinicId: string;
  patientId: string | null;
  opportunityId: string | null;
  titulo: string;
  tipo: TipoTarefa;
  status: StatusTarefa;
  prioridade: number;
  assignedTo: string | null;
  dueAt: string | null;
  notas: string | null;
  motivo: string | null;
  concluidaEm: string | null;
  criadoEm: string;
};

/* -------------------------------------------------------------------------- */
/* Conversa e mensagem                                                        */
/* -------------------------------------------------------------------------- */

export type StatusConversa = "ABERTA" | "AGUARDANDO" | "RESOLVIDA";
export type Direcao = "ENTRADA" | "SAIDA";
export type Remetente = "paciente" | "atendente" | "automacao" | "ia" | "sistema";
export type StatusEntrega = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED";

export type Conversa = {
  id: string;
  organizationId: string;
  clinicId: string;
  patientId: string | null;
  canal: string;
  contatoExterno: string;
  status: StatusConversa;
  assignedTo: string | null;
  bloqueadaPor: string | null;
  bloqueadaAte: string | null;
  naoLidas: number;
  ultimaMensagemEm: string | null;
  ultimaMensagemTrecho: string | null;
  temperatura: Temperatura | null;
  intencao: Intencao | null;
  resumoIa: string | null;
  resumoIaEm: string | null;
  revisaoPendente: boolean;
};

export type Mensagem = {
  id: string;
  conversationId: string;
  patientId: string | null;
  direcao: Direcao;
  remetente: Remetente;
  autorId: string | null;
  conteudo: string;
  notaInterna: boolean;
  statusEntrega: StatusEntrega;
  erro: string | null;
  providerMessageId: string | null;
  enviadoEm: string | null;
  criadoEm: string;
};

/* -------------------------------------------------------------------------- */
/* IA                                                                         */
/* -------------------------------------------------------------------------- */

export type Intencao =
  | "AGENDAR"
  | "REMARCAR"
  | "CANCELAR"
  | "CONFIRMAR"
  | "PRECO"
  | "FORMA_DE_PAGAMENTO"
  | "INTERESSE"
  | "SEM_INTERESSE"
  | "VAI_PENSAR"
  | "RETORNAR_DEPOIS"
  | "RECLAMACAO"
  | "DUVIDA_CLINICA"
  | "DESCADASTRO"
  | "OUTRO";

export const INTENCOES: readonly Intencao[] = [
  "AGENDAR",
  "REMARCAR",
  "CANCELAR",
  "CONFIRMAR",
  "PRECO",
  "FORMA_DE_PAGAMENTO",
  "INTERESSE",
  "SEM_INTERESSE",
  "VAI_PENSAR",
  "RETORNAR_DEPOIS",
  "RECLAMACAO",
  "DUVIDA_CLINICA",
  "DESCADASTRO",
  "OUTRO",
] as const;

export type Temperatura = "HOT" | "WARM" | "COLD";
export const TEMPERATURAS: readonly Temperatura[] = ["HOT", "WARM", "COLD"] as const;

/**
 * Item 174: a IA só executa o que está nesta lista. Nada de ação inventada
 * pelo modelo — o executor recusa qualquer string fora daqui.
 */
export type AcaoIa =
  | "SEND_TEMPLATE"
  | "SHOW_AVAILABLE_SLOTS"
  | "CREATE_TASK"
  | "ASSIGN_HUMAN"
  | "UPDATE_OPPORTUNITY"
  | "BOOK_APPOINTMENT"
  | "NENHUMA";

export const ACOES_IA: readonly AcaoIa[] = [
  "SEND_TEMPLATE",
  "SHOW_AVAILABLE_SLOTS",
  "CREATE_TASK",
  "ASSIGN_HUMAN",
  "UPDATE_OPPORTUNITY",
  "BOOK_APPOINTMENT",
  "NENHUMA",
] as const;

/** Item 48: motivos que OBRIGAM humano, sem exceção nem threshold. */
export type MotivoEscalonamento =
  | "clinical_question"
  | "complaint"
  | "legal_issue"
  | "payment_dispute"
  | "angry_patient"
  | "uncertain_intent"
  | "special_discount"
  | "medication_question"
  | "diagnosis_request";

export type ClassificacaoConversa = {
  intencao: Intencao;
  temperatura: Temperatura;
  /** 0..1 */
  confianca: number;
  exigeHumano: boolean;
  motivoEscalonamento: MotivoEscalonamento | null;
  acaoSugerida: AcaoIa;
  resumo: string;
};

/* -------------------------------------------------------------------------- */
/* Eventos                                                                    */
/* -------------------------------------------------------------------------- */

export type TipoEvento =
  | "patient.created"
  | "patient.updated"
  | "patient.inactive_detected"
  | "patient.recall_due"
  | "patient.birthday"
  | "appointment.created"
  | "appointment.confirmed"
  | "appointment.cancelled"
  | "appointment.missed"
  | "appointment.completed"
  | "appointment.upcoming"
  | "budget.created"
  | "budget.pending"
  | "budget.approved"
  | "budget.expired"
  | "message.received"
  | "message.sent"
  | "lead.created"
  | "lead.qualified"
  | "opportunity.created"
  | "opportunity.stage_changed"
  | "task.created"
  | "task.completed";

export const TIPOS_EVENTO: readonly TipoEvento[] = [
  "patient.created",
  "patient.updated",
  "patient.inactive_detected",
  "patient.recall_due",
  "patient.birthday",
  "appointment.created",
  "appointment.confirmed",
  "appointment.cancelled",
  "appointment.missed",
  "appointment.completed",
  "appointment.upcoming",
  "budget.created",
  "budget.pending",
  "budget.approved",
  "budget.expired",
  "message.received",
  "message.sent",
  "lead.created",
  "lead.qualified",
  "opportunity.created",
  "opportunity.stage_changed",
  "task.created",
  "task.completed",
] as const;

export type EventoCrc = {
  id: string;
  organizationId: string;
  clinicId: string | null;
  tipo: TipoEvento;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  fingerprint: string;
  status: "PENDENTE" | "PROCESSANDO" | "PROCESSADO" | "FALHOU" | "DESCARTADO";
  tentativas: number;
  ocorridoEm: string;
};

/* -------------------------------------------------------------------------- */
/* Automação                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Item 96 + 43 (níveis de Autopilot).
 *
 * SHADOW    calcula tudo, registra "teria feito X", não faz nada.
 * RECOMENDAR executa só ações internas (tarefa, oportunidade). Não fala com o
 *            paciente.
 * EXECUTAR   manda mensagem de verdade.
 *
 * OS CINCO NÍVEIS PEDIDOS SÃO ESTES TRÊS MAIS DUAS FLAGS, e não cinco valores
 * neste tipo. A diferença importa: modo é propriedade DA AUTOMAÇÃO (esta
 * jornada está em teste, aquela já roda), enquanto conversar e agendar são
 * permissões DA ORGANIZAÇÃO — quem as concede é a direção, uma vez, e não o
 * gestor por jornada. Fundir os dois eixos num enum só permitiria ligar
 * agendamento automático numa jornada e não em outra, o que é uma decisão que
 * ninguém deveria conseguir tomar sem perceber.
 *
 *   1. recomendar       RECOMENDAR
 *   2. criar tarefa     RECOMENDAR (as ações internas incluem tarefa)
 *   3. enviar mensagem  EXECUTAR
 *   4. conversar        EXECUTAR + flag `ai_autopilot`
 *   5. agendar          EXECUTAR + `ai_autopilot` + `auto_scheduling`
 *                       + `dental_office_writeback`
 *
 * Toda automação nasce em SHADOW — o item 95 exige. E toda flag nasce
 * desligada, então nenhuma clínica chega no nível 5 sem alguém decidir três
 * vezes.
 */
export type ModoAutomacao = "SHADOW" | "RECOMENDAR" | "EXECUTAR";
export const MODOS_AUTOMACAO: readonly ModoAutomacao[] = [
  "SHADOW",
  "RECOMENDAR",
  "EXECUTAR",
] as const;

export type StatusAutomacao = "RASCUNHO" | "ATIVA" | "PAUSADA";

export type StatusJornada =
  "ACTIVE" | "WAITING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED" | "EXITED";

/**
 * Um passo de jornada. A união discriminada é o que impede o motor de virar um
 * switch de 800 linhas com campos opcionais que só valem para metade dos casos.
 */
export type PassoAutomacao =
  | { tipo: "ESPERAR"; minutos: number; rotulo?: string }
  /** Espera até uma hora do dia dentro da janela comercial. Ex.: "17:00". */
  | { tipo: "ESPERAR_ATE"; hora: string; rotulo?: string }
  | { tipo: "ENVIAR_TEMPLATE"; template: string; rotulo?: string }
  | {
      tipo: "CRIAR_TAREFA";
      titulo: string;
      tipoTarefa: TipoTarefa;
      prazoHoras: number;
      rotulo?: string;
    }
  | { tipo: "MOVER_ETAPA"; etapa: string; rotulo?: string }
  | { tipo: "DEFINIR_PROXIMA_ACAO"; acao: string; emHoras: number; rotulo?: string }
  | { tipo: "SAIR_SE"; condicao: CondicaoAutomacao; motivo: string; rotulo?: string };

/**
 * Condição avaliável sobre o contexto de um paciente.
 *
 * Deliberadamente pequena: o item 20 do Mega Prompt manda NÃO começar
 * construindo um Zapier. Cada condição nova é uma linha aqui e um `case` no
 * avaliador — e nada mais.
 */
export type CondicaoAutomacao =
  | { tipo: "SEM_CONSULTA_FUTURA" }
  | { tipo: "TEM_CONSULTA_FUTURA" }
  | { tipo: "PACIENTE_RESPONDEU" }
  | { tipo: "PACIENTE_NAO_RESPONDEU" }
  | { tipo: "PACIENTE_ATIVO" }
  | { tipo: "SEM_OPT_OUT" }
  | { tipo: "TEM_TELEFONE" }
  | { tipo: "SITUACAO_E"; situacao: SituacaoPaciente }
  | { tipo: "DIAS_DESDE_ULTIMA_CONSULTA_MAIOR_QUE"; dias: number }
  | { tipo: "SEMPRE" };

export type GatilhoAutomacao =
  | { tipo: "EVENTO"; evento: TipoEvento }
  /** Varredura diária. O seletor mora no motor, não em cada automação. */
  | { tipo: "VARREDURA"; seletor: "RECALL" | "ANIVERSARIO" | "CONFIRMACAO" | "ABANDONO" };

export type DefinicaoAutomacao = {
  gatilho: GatilhoAutomacao;
  /** Todas precisam ser verdadeiras para a jornada começar. */
  condicoes: CondicaoAutomacao[];
  passos: PassoAutomacao[];
  /** Avaliadas antes de CADA passo. Item 33. */
  saidas: { condicao: CondicaoAutomacao; motivo: string }[];
};

export type Automacao = {
  id: string;
  organizationId: string;
  chave: string;
  nome: string;
  descricao: string | null;
  status: StatusAutomacao;
  modo: ModoAutomacao;
  versaoAtiva: number;
  definicao: DefinicaoAutomacao;
};

export type Jornada = {
  id: string;
  organizationId: string;
  automationId: string;
  versao: number;
  patientId: string | null;
  opportunityId: string | null;
  status: StatusJornada;
  passoAtual: number;
  resumeAt: string | null;
  contexto: Record<string, unknown>;
  saiuPor: string | null;
  criadoEm: string;
};

/* -------------------------------------------------------------------------- */
/* Erros do domínio — formato único (item 139)                                */
/* -------------------------------------------------------------------------- */

/**
 * Código de erro que o backend devolve e a tela sabe traduzir.
 *
 * O item 139 pede `{ code, message, requestId }` consistente. O item 48 pede
 * "nunca Erro 500" na tela. Os dois se resolvem no mesmo lugar: o código é
 * estável para o programa, a mensagem é humana para a pessoa.
 */
export type CodigoErro =
  | "NAO_AUTENTICADO"
  | "SEM_PERMISSAO"
  | "NAO_ENCONTRADO"
  | "ENTRADA_INVALIDA"
  | "SLOT_NO_LONGER_AVAILABLE"
  | "INTEGRACAO_INDISPONIVEL"
  | "INTEGRACAO_NAO_CONFIGURADA"
  | "IA_INDISPONIVEL"
  | "PACIENTE_SEM_TELEFONE"
  | "PACIENTE_OPTOU_POR_SAIR"
  | "FORA_DO_HORARIO"
  | "LIMITE_DE_CONTATO"
  | "CONFLITO"
  | "FALHA_INTERNA";

export type ErroCrc = { code: CodigoErro; message: string; requestId?: string };

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroCrc };

export function ok<T>(dados: T): Resultado<T> {
  return { ok: true, dados };
}

export function falha<T>(code: CodigoErro, message: string, requestId?: string): Resultado<T> {
  // `exactOptionalPropertyTypes` recusa `{ requestId: undefined }` quando o
  // campo é opcional. Por isso o objeto é montado em duas etapas.
  const erro: ErroCrc = { code, message };
  if (requestId !== undefined) erro.requestId = requestId;
  return { ok: false, erro };
}
