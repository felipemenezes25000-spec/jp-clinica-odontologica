/**
 * Todos os números que a peça mostra. Um arquivo só.
 *
 * REGRA (itens 42, 43 e 55 do briefing)
 * Nenhum destes números veio do banco da clínica. São ilustrativos, e a tela diz
 * isso: `ILUSTRATIVO` é `true` e as cenas de resultado carimbam "Exemplo
 * ilustrativo" ao lado do bloco. Quando houver dado real, troque os valores aqui
 * e vire `ILUSTRATIVO` para `false` — o carimbo some sozinho de todas as cenas.
 *
 * A peça também NUNCA promete percentual de aumento de receita. Ela mostra o
 * caminho (mais contato → mais resposta → mais agenda) e o valor POTENCIAL do
 * que está na fila — não receita confirmada, que depende de integração
 * financeira que ainda não existe.
 */

export const ILUSTRATIVO = true;

/* -------------------------------------------------------------------------- */
/* Base                                                                       */
/* -------------------------------------------------------------------------- */

export const BASE = {
  /** Pacientes na base histórica sem retorno recente. */
  antigosElegiveis: 4281,
  /** Quantos aparecem como pontos na cena 11. Menos que o total: 4.281 pontos
   *  em tela viram textura cinza, e o número já está escrito em cima. */
  pontosNaTela: 640,
  emJornada: 82,
  responderamHoje: 14,
  agendaramHoje: 8,
  precisamDeAtencao: 16,
} as const;

export const SEGMENTOS_BASE = [
  { rotulo: "6 a 12 meses", quantidade: 1187, cor: "#7FC241" },
  { rotulo: "12 a 24 meses", quantidade: 1342, cor: "#56A805" },
  { rotulo: "24 meses ou mais", quantidade: 964, cor: "#3B7A04" },
  { rotulo: "Abandonou o tratamento", quantidade: 512, cor: "#B45309" },
  { rotulo: "Nunca retornou", quantidade: 276, cor: "#8B978C" },
] as const;

/* -------------------------------------------------------------------------- */
/* Resultados acumulados                                                      */
/* -------------------------------------------------------------------------- */

export const RESULTADOS = [
  { rotulo: "Pacientes trabalhados", valor: 4281 },
  { rotulo: "Responderam", valor: 1012 },
  { rotulo: "Agendamentos", valor: 287 },
  { rotulo: "Reativados", valor: 193 },
] as const;

/* -------------------------------------------------------------------------- */
/* Funil                                                                      */
/* -------------------------------------------------------------------------- */

export const FUNIL = [
  { etapa: "Pacientes elegíveis", valor: 4281 },
  { etapa: "Contatados", valor: 3410 },
  { etapa: "Responderam", valor: 1012 },
  { etapa: "Agendaram", valor: 287 },
  { etapa: "Compareceram", valor: 214 },
  { etapa: "Converteram", valor: 138 },
] as const;

/* -------------------------------------------------------------------------- */
/* Painel do gestor                                                           */
/* -------------------------------------------------------------------------- */

/**
 * "Valor potencial", e não "receita".
 *
 * Item 25 do storyboard: sem integração financeira fechada, o sistema conhece o
 * valor dos orçamentos em aberto na fila — não o que entrou no caixa. Chamar
 * isso de receita seria afirmar algo que o dado não sustenta.
 */
export const GESTOR = {
  pacientesReativados: 193,
  consultasRecuperadas: 128,
  conversao: 0.284,
  tempoMedioRespostaMin: 3.4,
  valorPotencial: 412_000,
  investimentoMensal: 3_900,
} as const;

/* -------------------------------------------------------------------------- */
/* Automações                                                                 */
/* -------------------------------------------------------------------------- */

export const AUTOMACOES = [
  { nome: "Recuperação de faltantes", evento: "appointment.missed", emJornada: 24, ativa: true },
  { nome: "Retorno (recall)", evento: "patient.recall_due", emJornada: 31, ativa: true },
  { nome: "Cancelamentos", evento: "appointment.cancelled", emJornada: 11, ativa: true },
  { nome: "Aniversário", evento: "patient.birthday", emJornada: 6, ativa: true },
  { nome: "Reativação de base", evento: "patient.inactive_detected", emJornada: 250, ativa: true },
  { nome: "Confirmação de consulta", evento: "appointment.upcoming", emJornada: 43, ativa: true },
] as const;

/* -------------------------------------------------------------------------- */
/* Fila do dia                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Pacientes fictícios (item 42). Nomes inventados, telefones parciais e
 * mascarados, nenhuma correspondência com paciente real da clínica.
 */
export const FILA = [
  {
    nome: "Maria Souza",
    motivo: "Faltou na consulta de ontem",
    sinal: "Respondeu agora",
    prioridade: 92,
    tipo: "MISSED_APPOINTMENT" as const,
  },
  {
    nome: "João Lima",
    motivo: "Lead novo — pediu avaliação",
    sinal: "Quente",
    prioridade: 84,
    tipo: "NEW_LEAD" as const,
  },
  {
    nome: "Ana Costa",
    motivo: "Retorno previsto há 7 meses",
    sinal: "Sem consulta futura",
    prioridade: 71,
    tipo: "RECALL" as const,
  },
  {
    nome: "Carlos Antunes",
    motivo: "Orçamento parado há 21 dias",
    sinal: "Aguardando",
    prioridade: 42,
    tipo: "BUDGET_RECOVERY" as const,
  },
] as const;

/**
 * Os fatores que formaram a prioridade da Maria.
 *
 * Somam 92 e são os mesmos rótulos que `calcularPrioridade` devolve em
 * `src/lib/crc/dominio/prioridade.ts` no sistema de verdade — a cena 8 não
 * inventa um critério para a animação ficar bonita.
 */
export const FATORES_MARIA = [
  { rotulo: "Faltou na consulta", pontos: 26 },
  { rotulo: "Pediu para agendar", pontos: 25 },
  { rotulo: "Respondeu nas últimas horas", pontos: 18 },
  { rotulo: "Sem consulta futura", pontos: 12 },
  { rotulo: "Vínculo com a clínica", pontos: 11 },
] as const;
