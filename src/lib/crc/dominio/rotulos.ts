/**
 * O dicionário: código interno → palavra que a pessoa lê.
 *
 * Itens 222 a 225 do contrato, resolvidos num lugar só. A tela nunca mostra
 * `MISSED_APPOINTMENT`; mostra "Faltou". E nunca mostra "customer" numa página
 * e "cliente" na outra — o termo é **Paciente**, sempre.
 *
 * POR QUE UM ARQUIVO E NÃO UM TERNÁRIO NO JSX
 * Porque o mesmo status aparece na lista, no card, no filtro e no e-mail. Com a
 * tradução espalhada, "Faltou" vira "Faltante" numa tela e "Não compareceu" em
 * outra, e o usuário passa a achar que são coisas diferentes.
 *
 * Este arquivo também é PURO — nada de React aqui. Ele é usado por tela e por
 * gerador de mensagem.
 */
import type {
  AcaoIa,
  Intencao,
  SituacaoPaciente,
  StatusAgendamento,
  StatusConversa,
  StatusEntrega,
  StatusJornada,
  StatusTarefa,
  Temperatura,
  TipoOportunidade,
  TipoTarefa,
} from "./tipos";
import type { ModoAutomacao } from "./tipos";
import type { CodigoErro } from "./tipos";

export const ROTULO_SITUACAO: Readonly<Record<SituacaoPaciente, string>> = {
  PRIMEIRA_CONSULTA: "Primeira consulta",
  EM_TRATAMENTO: "Em tratamento",
  CONCLUIDO: "Tratamento concluído",
  ALTA: "Alta",
  ABANDONO: "Abandonou o tratamento",
  DESCONHECIDO: "Situação não informada",
};

export const ROTULO_STATUS_AGENDA: Readonly<Record<StatusAgendamento, string>> = {
  TO_CONFIRM: "A confirmar",
  CONFIRMED: "Confirmada",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Atendida",
  MISSED: "Faltou",
  CANCELLED: "Cancelada",
};

export const ROTULO_TIPO_OPORTUNIDADE: Readonly<Record<TipoOportunidade, string>> = {
  NEW_LEAD: "Lead novo",
  MISSED_APPOINTMENT: "Faltou",
  CANCELLED_APPOINTMENT: "Cancelou",
  RECALL: "Retorno",
  INACTIVE_PATIENT: "Paciente inativo",
  ABANDONED_TREATMENT: "Tratamento abandonado",
  BUDGET_RECOVERY: "Orçamento parado",
  BIRTHDAY: "Aniversário",
  MANUAL: "Criada à mão",
};

export const ROTULO_TIPO_TAREFA: Readonly<Record<TipoTarefa, string>> = {
  LIGAR: "Ligar",
  WHATSAPP: "Mandar WhatsApp",
  REVISAR: "Revisar",
  NEGOCIAR: "Negociar",
  CONFIRMAR: "Confirmar",
  RETORNAR: "Retornar contato",
};

export const ROTULO_STATUS_TAREFA: Readonly<Record<StatusTarefa, string>> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const ROTULO_STATUS_CONVERSA: Readonly<Record<StatusConversa, string>> = {
  ABERTA: "Aberta",
  AGUARDANDO: "Aguardando paciente",
  RESOLVIDA: "Resolvida",
};

export const ROTULO_ENTREGA: Readonly<Record<StatusEntrega, string>> = {
  QUEUED: "Na fila",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  READ: "Lida",
  FAILED: "Falhou",
};

export const ROTULO_INTENCAO: Readonly<Record<Intencao, string>> = {
  AGENDAR: "Quer agendar",
  REMARCAR: "Quer remarcar",
  CANCELAR: "Quer cancelar",
  CONFIRMAR: "Confirmou a consulta",
  PRECO: "Perguntou preço",
  FORMA_DE_PAGAMENTO: "Perguntou forma de pagamento",
  INTERESSE: "Demonstrou interesse",
  SEM_INTERESSE: "Não tem interesse",
  VAI_PENSAR: "Vai pensar",
  RETORNAR_DEPOIS: "Pediu para retornar depois",
  RECLAMACAO: "Reclamação",
  DUVIDA_CLINICA: "Dúvida clínica",
  DESCADASTRO: "Pediu para não receber mensagens",
  OUTRO: "Outro assunto",
};

export const ROTULO_TEMPERATURA: Readonly<Record<Temperatura, string>> = {
  HOT: "Quente",
  WARM: "Morna",
  COLD: "Fria",
};

export const ROTULO_ACAO_IA: Readonly<Record<AcaoIa, string>> = {
  SEND_TEMPLATE: "Enviar mensagem",
  SHOW_AVAILABLE_SLOTS: "Oferecer horários",
  CREATE_TASK: "Criar tarefa",
  ASSIGN_HUMAN: "Passar para um atendente",
  UPDATE_OPPORTUNITY: "Atualizar a oportunidade",
  BOOK_APPOINTMENT: "Marcar a consulta",
  NENHUMA: "Nenhuma ação",
};

export const ROTULO_STATUS_JORNADA: Readonly<Record<StatusJornada, string>> = {
  ACTIVE: "Em andamento",
  WAITING: "Aguardando",
  PAUSED: "Pausada",
  COMPLETED: "Concluída",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
  EXITED: "Encerrada",
};

export const ROTULO_MODO_AUTOMACAO: Readonly<Record<ModoAutomacao, string>> = {
  SHADOW: "Simulação",
  RECOMENDAR: "Só recomenda",
  EXECUTAR: "Executa",
};

/** O que a pessoa lê ao lado do modo, para saber o que ele faz de verdade. */
export const EXPLICACAO_MODO_AUTOMACAO: Readonly<Record<ModoAutomacao, string>> = {
  SHADOW: "Calcula tudo e registra o que faria, sem mandar nada para o paciente.",
  RECOMENDAR: "Cria tarefas para a equipe, mas não fala com o paciente sozinha.",
  EXECUTAR: "Envia as mensagens automaticamente, dentro das regras de contato.",
};

/**
 * Item 48: nunca "Erro 500" na tela.
 *
 * Cada código de erro tem uma frase que diz o que aconteceu e o que continua
 * verdade — "seus dados continuam seguros" não é gentileza, é a informação que
 * a pessoa precisa para decidir se refaz o trabalho.
 */
export const MENSAGEM_ERRO: Readonly<Record<CodigoErro, string>> = {
  NAO_AUTENTICADO: "Sua sessão terminou. Entre de novo para continuar.",
  SEM_PERMISSAO: "Seu acesso não inclui esta ação.",
  NAO_ENCONTRADO: "Não encontramos este registro.",
  ENTRADA_INVALIDA: "Alguns campos precisam de ajuste.",
  SLOT_NO_LONGER_AVAILABLE: "Este horário acabou de ser ocupado. Escolha outro.",
  INTEGRACAO_INDISPONIVEL:
    "Não conseguimos falar com o Dental Office agora. Seus dados continuam seguros e tentaremos de novo.",
  INTEGRACAO_NAO_CONFIGURADA: "Esta integração ainda não foi configurada.",
  IA_INDISPONIVEL: "A leitura automática está fora do ar. Você pode seguir manualmente.",
  PACIENTE_SEM_TELEFONE: "Este paciente não tem telefone cadastrado.",
  PACIENTE_OPTOU_POR_SAIR: "Este paciente pediu para não receber mensagens.",
  FORA_DO_HORARIO: "Fora do horário de atendimento configurado.",
  LIMITE_DE_CONTATO: "Este paciente já foi contatado hoje.",
  CONFLITO: "Alguém alterou este registro enquanto você trabalhava nele.",
  FALHA_INTERNA: "Algo deu errado do nosso lado. Já registramos o problema.",
};

/** Item 101: motivos de perda. Fechados, porque texto livre não vira relatório. */
export const MOTIVOS_PERDA = [
  { chave: "PRECO", rotulo: "Preço" },
  { chave: "SEM_RESPOSTA", rotulo: "Não respondeu" },
  { chave: "TRATOU_EM_OUTRO_LUGAR", rotulo: "Tratou em outro lugar" },
  { chave: "PEDIU_DEPOIS", rotulo: "Pediu para retornar depois" },
  { chave: "SEM_INTERESSE", rotulo: "Não tem interesse" },
  { chave: "DISTANCIA", rotulo: "Distância" },
  { chave: "OUTRO", rotulo: "Outro" },
] as const;

export type MotivoPerda = (typeof MOTIVOS_PERDA)[number]["chave"];

/** As etapas iniciais do funil (item 18 do Mega Prompt). */
export const ETAPAS_PADRAO = [
  { chave: "novo", nome: "Novo", ordem: 1, categoria: "ABERTA" },
  { chave: "contato_pendente", nome: "Contato pendente", ordem: 2, categoria: "ABERTA" },
  { chave: "em_contato", nome: "Em contato", ordem: 3, categoria: "ABERTA" },
  { chave: "avaliacao_agendada", nome: "Avaliação agendada", ordem: 4, categoria: "ABERTA" },
  { chave: "compareceu", nome: "Compareceu", ordem: 5, categoria: "ABERTA" },
  { chave: "orcamento", nome: "Orçamento", ordem: 6, categoria: "ABERTA" },
  { chave: "negociacao", nome: "Negociação", ordem: 7, categoria: "ABERTA" },
  { chave: "fechado", nome: "Fechado", ordem: 8, categoria: "GANHA" },
  { chave: "perdido", nome: "Perdido", ordem: 9, categoria: "PERDIDA" },
  { chave: "reativar_depois", nome: "Reativar depois", ordem: 10, categoria: "ABERTA" },
] as const;
