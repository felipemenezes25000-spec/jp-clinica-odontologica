/**
 * O orçamento de IA — decidido antes da chamada, nunca depois.
 *
 * ADR-12 em código. Checar depois só serve para descobrir o prejuízo: a chamada
 * já foi feita, o token já foi pago, e a única coisa que a verificação produz é
 * um número triste num relatório.
 *
 * TUDO EM MICRO-REAIS INTEIROS, pela mesma razão de `dominio/custo.ts`: somar
 * centavos em ponto flutuante inventa centavo. `200 * 0,034` dá
 * 6.800000000000001 em JavaScript, e um teto comparado contra isso recusa
 * chamada um centavo antes — ou depois — do que a pessoa configurou.
 *
 * O VEREDICTO NÃO É BOOLEANO. "Pode" e "não pode" deixariam de fora o estado que
 * mais importa na prática: está perto. Uma clínica que descobre o teto no momento
 * em que ele estoura descobre tarde; `alerta` existe para a tela poder avisar
 * antes de a máquina parar.
 */

/** 1 real = 1.000.000 micro-reais. */
export const MICRO_POR_REAL = 1_000_000;

export const emMicro = (reais: number): number => Math.round(reais * MICRO_POR_REAL);
export const emReais = (micro: number): number => micro / MICRO_POR_REAL;

/** A partir de quanto do teto a tela começa a avisar. */
export const LIMIAR_ALERTA = 0.8;

export type Tetos = {
  /** Nulo = sem teto. Zero = tudo bloqueado, que é um jeito legítimo de desligar. */
  diaMicro: number | null;
  mesMicro: number | null;
};

export type GastoAtual = {
  diaMicro: number;
  mesMicro: number;
};

export type VeredictoOrcamento =
  | { pode: true; alerta: false }
  | {
      pode: true;
      alerta: true;
      /** Qual teto está perto, e quanto dele já foi usado (0 a 1). */
      periodo: "dia" | "mes";
      usado: number;
    }
  | {
      pode: false;
      /** Estável, para métrica e para o caso humano. */
      codigo: "teto_do_dia" | "teto_do_mes";
      /** Em português, para quem vai ler a tarefa que nasce disto. */
      motivo: string;
    };

/**
 * Decide se a próxima chamada cabe no orçamento.
 *
 * `estimativaMicro` é o custo previsto da chamada que está por vir. Quando não há
 * estimativa — modelo sem preço na tabela, que é o caso honesto de "não sei" —
 * passa zero: o teto continua valendo sobre o que JÁ foi gasto, e o que não se
 * sabe medir não vira um palpite que bloqueia atendimento.
 */
export function avaliarOrcamento(
  tetos: Tetos,
  gasto: GastoAtual,
  estimativaMicro = 0,
): VeredictoOrcamento {
  const previstoDia = gasto.diaMicro + Math.max(estimativaMicro, 0);
  const previstoMes = gasto.mesMicro + Math.max(estimativaMicro, 0);

  // O teto do MÊS é verificado primeiro, e não é detalhe de ordem: estourar o
  // mês é o problema maior, e o motivo que a pessoa precisa ler é esse. Na ordem
  // inversa, um dia caro no fim de um mês estourado reportaria "teto do dia" e
  // esconderia a notícia que importa.
  if (tetos.mesMicro !== null && previstoMes > tetos.mesMicro) {
    return {
      pode: false,
      codigo: "teto_do_mes",
      motivo: `O limite de gasto de IA do mês (${formatar(tetos.mesMicro)}) foi atingido.`,
    };
  }
  if (tetos.diaMicro !== null && previstoDia > tetos.diaMicro) {
    return {
      pode: false,
      codigo: "teto_do_dia",
      motivo: `O limite de gasto de IA de hoje (${formatar(tetos.diaMicro)}) foi atingido.`,
    };
  }

  const fracaoMes = fracao(previstoMes, tetos.mesMicro);
  const fracaoDia = fracao(previstoDia, tetos.diaMicro);

  if (fracaoMes !== null && fracaoMes >= LIMIAR_ALERTA) {
    return { pode: true, alerta: true, periodo: "mes", usado: fracaoMes };
  }
  if (fracaoDia !== null && fracaoDia >= LIMIAR_ALERTA) {
    return { pode: true, alerta: true, periodo: "dia", usado: fracaoDia };
  }

  return { pode: true, alerta: false };
}

/** `null` quando não há teto — e não 0, que significaria "nada usado". */
function fracao(gasto: number, teto: number | null): number | null {
  if (teto === null || teto <= 0) return null;
  return gasto / teto;
}

/**
 * Reais com duas casas, a partir de micro-reais inteiros.
 *
 * A divisão acontece UMA vez, no fim, e é só para mostrar. Nenhuma comparação de
 * teto passa por aqui.
 */
export function formatar(micro: number): string {
  return `R$ ${(micro / MICRO_POR_REAL).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* -------------------------------------------------------------------------- */
/* Finalidades                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Para que serve cada chamada de modelo. União fechada.
 *
 * É a chave do roteamento: cada finalidade pode ter provedor e modelo próprios.
 * Fechada porque finalidade criada por string solta vira rota que ninguém sabe
 * se existe — e o fallback silencioso para o modelo caro da conversa seria
 * exatamente o tipo de custo que aparece na fatura antes de aparecer no código.
 */
export const FINALIDADES = ["conversa", "classificacao", "supervisor", "embeddings"] as const;

export type Finalidade = (typeof FINALIDADES)[number];

export const ROTULO_FINALIDADE: Readonly<Record<Finalidade, string>> = {
  conversa: "Conversar com o paciente",
  classificacao: "Ler e classificar mensagem",
  supervisor: "Revisar o atendimento depois",
  embeddings: "Busca por significado no material",
};

export function ehFinalidade(v: unknown): v is Finalidade {
  return typeof v === "string" && (FINALIDADES as readonly string[]).includes(v);
}
