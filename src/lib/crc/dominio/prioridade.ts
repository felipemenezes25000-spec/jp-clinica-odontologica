/**
 * O score que decide a ordem da fila do dia.
 *
 * O item 31 do Mega Prompt pede um score auditável: a tela precisa conseguir
 * mostrar "Prioridade 92/100 — +25 pediu para agendar, +20 respondeu hoje".
 * Por isso esta função não devolve um número: devolve o número E os fatores que
 * o formaram. O que ordenou a fila e o que a tela explica são a mesma coisa,
 * calculada uma vez só.
 *
 * O QUE NÃO ENTRA AQUI, DE PROPÓSITO
 * Nada de gênero, idade, bairro ou qualquer característica da pessoa. O item 31
 * proíbe característica sensível irrelevante, e a proibição é fácil de cumprir
 * porque nenhuma delas prevê nada útil: o que prevê é comportamento recente —
 * respondeu, faltou, tem orçamento parado.
 *
 * A ESCALA É 0..100 e o teto é rígido. Sem teto, um paciente com muitos sinais
 * chegaria a 180 e a tela mostraria "Prioridade 180/100", que não significa
 * nada para quem lê.
 */
import type { FatorPrioridade, TipoOportunidade } from "./tipos";

/** Tudo que o score precisa saber. Sem isto, a função pediria o banco inteiro. */
export type ContextoPrioridade = {
  tipo: TipoOportunidade;
  /** Horas desde a última mensagem RECEBIDA do paciente. `null` = nunca. */
  horasDesdeRespostaPaciente: number | null;
  /** Horas desde o último contato NOSSO. `null` = nunca contatamos. */
  horasDesdeUltimoContato: number | null;
  /** Dias desde a criação da oportunidade. */
  diasEsperando: number;
  /** Valor potencial em reais. `null` quando não há orçamento conhecido. */
  valorPotencial: number | null;
  temConsultaFutura: boolean;
  /** Quantas consultas concluídas o paciente já teve. Mede vínculo. */
  consultasConcluidas: number;
  /** Última classificação da IA para a conversa, quando existe. */
  temperatura: "HOT" | "WARM" | "COLD" | null;
  intencaoAgendar: boolean;
};

/**
 * Peso base por tipo de oportunidade.
 *
 * Um faltante de ontem vale mais que um recall de seis meses porque a janela de
 * recuperação é curta: quem faltou ainda está no assunto, quem some há meio ano
 * não tem pressa. É a mesma lógica do item 259 (o rollout começa por faltantes).
 */
const PESO_POR_TIPO: Readonly<Record<TipoOportunidade, number>> = {
  NEW_LEAD: 30,
  MISSED_APPOINTMENT: 26,
  CANCELLED_APPOINTMENT: 22,
  BUDGET_RECOVERY: 24,
  RECALL: 14,
  ABANDONED_TREATMENT: 18,
  INACTIVE_PATIENT: 12,
  BIRTHDAY: 5,
  MANUAL: 20,
};

const ROTULO_POR_TIPO: Readonly<Record<TipoOportunidade, string>> = {
  NEW_LEAD: "Lead novo",
  MISSED_APPOINTMENT: "Faltou na consulta",
  CANCELLED_APPOINTMENT: "Cancelou a consulta",
  BUDGET_RECOVERY: "Orçamento parado",
  RECALL: "Retorno previsto",
  ABANDONED_TREATMENT: "Tratamento abandonado",
  INACTIVE_PATIENT: "Paciente inativo",
  BIRTHDAY: "Aniversário",
  MANUAL: "Criada à mão",
};

export const PRIORIDADE_MAXIMA = 100;

export type ResultadoPrioridade = { score: number; fatores: FatorPrioridade[] };

export function calcularPrioridade(ctx: ContextoPrioridade): ResultadoPrioridade {
  const fatores: FatorPrioridade[] = [];

  const adicionar = (chave: string, rotulo: string, pontos: number): void => {
    if (pontos === 0) return;
    fatores.push({ chave, rotulo, pontos });
  };

  // 1. Por que esta oportunidade existe.
  adicionar("tipo", ROTULO_POR_TIPO[ctx.tipo], PESO_POR_TIPO[ctx.tipo]);

  // 2. Intenção declarada. É o sinal mais forte que existe: a pessoa já disse o
  // que quer, só falta alguém atender.
  if (ctx.intencaoAgendar) adicionar("intencao", "Pediu para agendar", 25);

  // 3. Frescor da resposta. Responder em minutos é outro jogo (item 158): a
  // conversa ainda está aberta na cabeça da pessoa.
  if (ctx.horasDesdeRespostaPaciente !== null) {
    const h = ctx.horasDesdeRespostaPaciente;
    if (h <= 1) adicionar("resposta", "Respondeu agora", 22);
    else if (h <= 6) adicionar("resposta", "Respondeu há poucas horas", 18);
    else if (h <= 24) adicionar("resposta", "Respondeu hoje", 14);
    else if (h <= 72) adicionar("resposta", "Respondeu nos últimos 3 dias", 8);
  }

  // 4. Temperatura da IA. Vale menos que a intenção explícita porque é
  // inferência, não fato.
  if (ctx.temperatura === "HOT") adicionar("temperatura", "Conversa quente", 12);
  else if (ctx.temperatura === "WARM") adicionar("temperatura", "Conversa morna", 5);

  // 5. Dinheiro na mesa. Cresce em degraus, não linearmente: a diferença entre
  // R$ 500 e R$ 5.000 importa; entre R$ 40 mil e R$ 60 mil, quase nada para
  // decidir quem ligar primeiro.
  if (ctx.valorPotencial !== null && ctx.valorPotencial > 0) {
    const v = ctx.valorPotencial;
    if (v >= 10000) adicionar("valor", "Valor potencial alto", 18);
    else if (v >= 4000) adicionar("valor", "Valor potencial relevante", 12);
    else if (v >= 1000) adicionar("valor", "Tem orçamento aberto", 7);
    else adicionar("valor", "Tem orçamento aberto", 3);
  }

  // 6. Sem consulta futura é o que transforma "paciente" em "oportunidade".
  // Com consulta marcada, quase nada aqui precisa de humano hoje.
  if (!ctx.temConsultaFutura) adicionar("agenda", "Sem próxima consulta", 15);
  else adicionar("agenda", "Já tem consulta marcada", -20);

  // 7. Vínculo. Paciente recorrente responde mais e vale mais a insistência.
  if (ctx.consultasConcluidas >= 5) adicionar("vinculo", "Paciente recorrente", 14);
  else if (ctx.consultasConcluidas >= 2) adicionar("vinculo", "Já se tratou aqui", 8);

  // 8. Espera. Sobe devagar e para: uma oportunidade de 40 dias não deve
  // ultrapassar quem respondeu agora só por ter envelhecido.
  if (ctx.diasEsperando >= 21) adicionar("espera", "Esperando há semanas", 10);
  else if (ctx.diasEsperando >= 7) adicionar("espera", "Esperando há mais de uma semana", 6);
  else if (ctx.diasEsperando >= 3) adicionar("espera", "Esperando há alguns dias", 3);

  // 9. Contato recente NOSSO derruba a prioridade. Não é castigo: é o que
  // impede a fila oferecer de novo hoje quem já foi contatado hoje — e o que
  // sustenta a promessa do item 279 (a automação não parece assédio).
  if (ctx.horasDesdeUltimoContato !== null && ctx.horasDesdeUltimoContato < 24) {
    adicionar("cooldown", "Contatado nas últimas 24h", -18);
  }

  const bruto = fatores.reduce((soma, f) => soma + f.pontos, 0);
  const score = Math.max(0, Math.min(PRIORIDADE_MAXIMA, bruto));

  // Ordena por impacto para a tela listar o que mais pesou primeiro.
  fatores.sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos));

  return { score, fatores };
}

/** Faixa para a UI. É o que vira 🔥 / 🟡 / ⚪ na lista de prioridades. */
export type FaixaPrioridade = "ALTA" | "MEDIA" | "BAIXA";

export function faixaDePrioridade(score: number): FaixaPrioridade {
  if (score >= 65) return "ALTA";
  if (score >= 35) return "MEDIA";
  return "BAIXA";
}
