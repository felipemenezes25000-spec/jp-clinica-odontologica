/**
 * Next Best Action — Fase H.
 *
 * A PERGUNTA QUE ISTO RESPONDE, e ela é da recepção às 8h da manhã: **com quem
 * eu falo primeiro hoje?**
 *
 * Hoje a resposta é a lista de tarefas, ordenada por prazo. Prazo é uma
 * ordenação ruim para este trabalho: põe no topo o que alguém agendou, e não o
 * que mais importa agora. Uma pessoa que aprovou um orçamento ontem e não marcou
 * fica atrás de um lembrete de rotina que venceu hoje de manhã.
 *
 * O QUE MUDA AQUI: a lista é ordenada por VALOR DA AÇÃO — quanto a clínica ganha
 * (ou deixa de perder) se essa ligação acontecer nos próximos minutos.
 *
 * ========================================================================
 *  TRÊS COISAS QUE ESTE MÓDULO DELIBERADAMENTE NÃO FAZ:
 *
 *  NÃO AGE. Devolve uma lista ordenada. Quem executa é uma pessoa, ou uma
 *  jornada que já tem os próprios portões.
 *
 *  NÃO ESCONDE O RESTO. Ordenar não é filtrar. O que ficou em último continua
 *  na lista, porque o critério pode estar errado para o caso de hoje.
 *
 *  NÃO USA MODELO. Cada ponto tem uma frase que o explica. "Ligue para a Ana
 *  primeiro" sem motivo é uma ordem; com motivo, é uma sugestão que a pessoa
 *  pode contestar — e contestar é como o critério melhora.
 * ========================================================================
 */
import type { RiscoDeChurn } from "./churn";

export type Candidato = {
  patientId: string;
  nome: string;
  /** O risco de sumir, já calculado. */
  risco: RiscoDeChurn;
  /** Valor em aberto — orçamento aprovado e não iniciado, em reais. */
  valorEmAberto: number;
  /** Consulta futura marcada? Quem tem, sai da frente. */
  temConsultaMarcada: boolean;
  /** Dias desde o último contato NOSSO. Serve para não insistir demais. */
  diasDesdeUltimoContato: number | null;
  /** A pessoa pediu para não ser contatada. */
  optOut: boolean;
};

export type AcaoSugerida = {
  patientId: string;
  nome: string;
  /** 0 a 100. Não é probabilidade: é ordem de prioridade. */
  prioridade: number;
  /** O que fazer, em uma frase. */
  acao: string;
  /** Por que esta pessoa está aqui. Em português, para quem vai ligar. */
  porque: string;
  /** `true` quando o sistema recomenda NÃO contatar agora. */
  aguardar: boolean;
};

/**
 * Quantos dias esperar antes de insistir com a mesma pessoa.
 *
 * SETE, e o número é sobre a pessoa, não sobre a clínica. Ligar de novo três
 * dias depois de não ter resposta não aumenta a chance de retorno: aumenta a
 * chance de virar a clínica que liga demais. E uma clínica que liga demais deixa
 * de ser atendida por quem ainda atenderia.
 */
export const COOLDOWN_DIAS = 7;

export function ordenarProximasAcoes(
  candidatos: readonly Candidato[],
  limite = 20,
): AcaoSugerida[] {
  return candidatos
    .map(avaliar)
    .sort((a, b) => b.prioridade - a.prioridade)
    .slice(0, limite);
}

function avaliar(c: Candidato): AcaoSugerida {
  /*
   * O OPT-OUT É A PRIMEIRA CHECAGEM, e ele não reduz a prioridade: zera.
   *
   * Uma pessoa que pediu para não ser contatada não é "prioridade baixa": é
   * proibida. Pontuá-la e deixá-la no fim da lista significaria que num dia
   * devagar alguém chegaria lá — e ligaria.
   */
  if (c.optOut) {
    return {
      patientId: c.patientId,
      nome: c.nome,
      prioridade: 0,
      acao: "Não contatar.",
      porque: "Esta pessoa pediu para não receber contato.",
      aguardar: true,
    };
  }

  if (c.temConsultaMarcada) {
    return {
      patientId: c.patientId,
      nome: c.nome,
      prioridade: 0,
      acao: "Nada a fazer.",
      porque: "Já tem consulta marcada.",
      aguardar: true,
    };
  }

  /*
   * O COOLDOWN NÃO ZERA: ADIA.
   *
   * A diferença importa. Zerar tiraria da lista alguém que continua sendo o caso
   * mais valioso da clínica — e amanhã, quando o cooldown vencer, ninguém
   * lembraria dele. Marcar `aguardar` mantém a pessoa visível, no lugar certo da
   * ordem, com o motivo escrito.
   */
  const emEspera = c.diasDesdeUltimoContato !== null && c.diasDesdeUltimoContato < COOLDOWN_DIAS;

  if (emEspera) {
    return {
      patientId: c.patientId,
      nome: c.nome,
      prioridade: Math.round(pontuar(c) * 0.2),
      acao: "Aguardar.",
      porque: `Falamos com esta pessoa há ${String(c.diasDesdeUltimoContato)} dias. Insistir antes de ${String(COOLDOWN_DIAS)} não aumenta o retorno: aumenta o incômodo.`,
      aguardar: true,
    };
  }

  const prioridade = pontuar(c);
  const maisForte = [...c.risco.fatores].sort((a, b) => b.pontos - a.pontos)[0];

  return {
    patientId: c.patientId,
    nome: c.nome,
    prioridade,
    acao: c.risco.acaoSugerida,
    porque: maisForte?.motivo ?? "Está no ponto de retorno.",
    aguardar: false,
  };
}

/**
 * A pontuação: risco de perder × quanto se perde.
 *
 * A MULTIPLICAÇÃO É O DESENHO INTEIRO, e ela resolve o erro dos dois extremos:
 *
 *   SÓ RISCO poria no topo quem vai sumir e nunca gastou nada — verdade
 *   irrelevante.
 *
 *   SÓ VALOR poria no topo quem tem o maior orçamento aberto, inclusive quem
 *   está voltando na terça — ligação desnecessária.
 *
 * O produto responde à pergunta certa: **quanto a clínica perde se ninguém fizer
 * nada?** É o que a recepção decide todo dia sem ter o número na frente.
 */
function pontuar(c: Candidato): number {
  const risco = c.risco.escore / 100;

  /*
   * O VALOR ENTRA EM ESCALA LOGARÍTMICA, e não linear.
   *
   * Um orçamento de R$ 20.000 não vale vinte vezes mais atenção que um de
   * R$ 1.000 — vale mais, e não vinte vezes. Em escala linear, três casos
   * grandes ocupariam a lista inteira e a recepção nunca ligaria para o resto.
   *
   * `log10(1 + valor/1000)` põe R$ 1.000 em 0,30 e R$ 20.000 em 1,32: quatro
   * vezes mais peso para vinte vezes mais dinheiro.
   */
  const valor = Math.min(Math.log10(1 + Math.max(c.valorEmAberto, 0) / 1000), 2) / 2;

  // O piso de 0,15 no valor é o que mantém na lista quem não tem orçamento
  // aberto: paciente antigo sumindo continua valendo uma ligação, mesmo sem
  // dinheiro em aberto agora.
  const peso = 0.15 + valor * 0.85;

  return Math.round(risco * peso * 100);
}

/**
 * A lista do dia, com a conta feita.
 *
 * O TOTAL EM RISCO É O QUE FAZ A TELA SER LIDA. Uma lista de vinte nomes é
 * trabalho; "R$ 34.200 em risco nesta lista" é motivo para fazer o trabalho.
 */
export type PainelDoDia = {
  acoes: AcaoSugerida[];
  /** Quantos estão aguardando cooldown. */
  emEspera: number;
  /** Soma do valor em aberto de quem está na lista e NÃO está em espera. */
  valorEmRisco: number;
};

export function painelDoDia(candidatos: readonly Candidato[], limite = 20): PainelDoDia {
  const acoes = ordenarProximasAcoes(candidatos, limite);
  const porId = new Map(candidatos.map((c) => [c.patientId, c]));

  let valorEmRisco = 0;
  let emEspera = 0;

  for (const a of acoes) {
    if (a.aguardar) {
      emEspera += 1;
      continue;
    }
    valorEmRisco += porId.get(a.patientId)?.valorEmAberto ?? 0;
  }

  return { acoes, emEspera, valorEmRisco };
}
