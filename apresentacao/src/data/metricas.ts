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
  { rotulo: "Sumiu há 6 meses a 1 ano", quantidade: 1187, cor: "#7FC241" },
  { rotulo: "Sumiu há 1 a 2 anos", quantidade: 1342, cor: "#56A805" },
  { rotulo: "Sumiu há mais de 2 anos", quantidade: 964, cor: "#3B7A04" },
  { rotulo: "Parou no meio do tratamento", quantidade: 512, cor: "#B45309" },
  { rotulo: "Veio uma vez e não voltou", quantidade: 276, cor: "#8B978C" },
] as const;

/* -------------------------------------------------------------------------- */
/* Resultados acumulados                                                      */
/* -------------------------------------------------------------------------- */

export const RESULTADOS = [
  { rotulo: "Pacientes chamados", valor: 4281 },
  { rotulo: "Responderam", valor: 1012 },
  { rotulo: "Marcaram consulta", valor: 287 },
  { rotulo: "Voltaram a se tratar", valor: 193 },
] as const;

/* -------------------------------------------------------------------------- */
/* Funil                                                                      */
/* -------------------------------------------------------------------------- */

export const FUNIL = [
  { etapa: "Podiam ser chamados", valor: 4281 },
  { etapa: "Foram chamados", valor: 3410 },
  { etapa: "Responderam", valor: 1012 },
  { etapa: "Marcaram consulta", valor: 287 },
  { etapa: "Vieram na consulta", valor: 214 },
  { etapa: "Começaram o tratamento", valor: 138 },
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
  /** Cobrança: quanto está vencido e quanto voltou a ser pago depois do contato. */
  valorEmAtraso: 86_400,
  cobrancasResolvidas: 47,
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
  { nome: "Quem faltou", quando: "no dia seguinte à falta", emJornada: 24, ativa: true },
  { nome: "Hora de voltar", quando: "quando vence o retorno", emJornada: 31, ativa: true },
  { nome: "Quem desmarcou", quando: "logo após o cancelamento", emJornada: 11, ativa: true },
  { nome: "Aniversário", quando: "na manhã do aniversário", emJornada: 6, ativa: true },
  { nome: "Pacientes antigos", quando: "em lotes, todo dia", emJornada: 250, ativa: true },
  { nome: "Confirmar consulta", quando: "um dia antes", emJornada: 43, ativa: true },
  { nome: "Parcela vencida", quando: "3 dias depois do vencimento", emJornada: 18, ativa: true },
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
    motivo: "Pediu uma avaliação hoje de manhã",
    sinal: "Muito interessado",
    prioridade: 84,
    tipo: "NEW_LEAD" as const,
  },
  {
    nome: "Ana Costa",
    motivo: "Devia ter voltado há 7 meses",
    sinal: "Sem consulta marcada",
    prioridade: 71,
    tipo: "RECALL" as const,
  },
  {
    nome: "Carlos Antunes",
    motivo: "Parcela vencida há 12 dias",
    sinal: "Sem retorno",
    prioridade: 42,
    tipo: "COBRANCA" as const,
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
  { rotulo: "Disse que quer marcar", pontos: 25 },
  { rotulo: "Respondeu hoje de manhã", pontos: 18 },
  { rotulo: "Não tem outra consulta marcada", pontos: 12 },
  { rotulo: "Já é paciente da casa", pontos: 11 },
] as const;
