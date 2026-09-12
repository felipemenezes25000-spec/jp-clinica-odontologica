/**
 * Benchmarking — §42.
 *
 * ============================================================================
 *  DENTRO DA ORGANIZAÇÃO, E SÓ.
 *
 *  O §42 pede quatro comparações internas — clínica vs clínica, dentista vs
 *  dentista, período vs período, campanha vs campanha — e uma quinta entre
 *  tenants, que exige "agregação anônima com base legal".
 *
 *  Este arquivo faz as quatro internas. A quinta não está aqui e não deve
 *  estar: comparar clínicas de donos diferentes sem contrato que autorize é
 *  vazar dado de um cliente para outro, e nenhuma métrica vale isso.
 * ============================================================================
 *
 * ============================================================================
 *  A REGRA QUE GOVERNA O ARQUIVO INTEIRO: COMPARAÇÃO SEM VOLUME É RUÍDO.
 *
 *  Um dentista com três consultas e 100% de comparecimento não é o melhor da
 *  clínica — ele é um dentista com três consultas. Ranquear os dois lado a
 *  lado produz uma tabela em que o topo é sempre quem trabalhou menos, e a
 *  primeira vez que alguém nota isso o painel inteiro perde a credibilidade.
 * ============================================================================
 */

/** Abaixo disto, a linha aparece mas NÃO é ranqueada. */
export const VOLUME_MINIMO = 20;

export type Comparavel = {
  chave: string;
  rotulo: string;
  /** O numerador — o que se quer maximizar (ou minimizar). */
  valor: number;
  /** O denominador: quantos eventos sustentam esse valor. */
  volume: number;
};

export type LinhaDoRanking = {
  chave: string;
  rotulo: string;
  valor: number;
  volume: number;
  /** `null` quando o volume não sustenta comparação. */
  posicao: number | null;
  /** Diferença para a mediana do grupo, em pontos da própria unidade. */
  contraMediana: number;
  /** `true` quando o volume é baixo demais para ranquear. */
  amostraPequena: boolean;
};

export type Ranking = {
  linhas: LinhaDoRanking[];
  mediana: number;
  /** Quantos entraram no ranking de verdade. */
  comparaveis: number;
  /** A frase que a tela mostra quando não dá para comparar. */
  aviso: string | null;
};

function mediana(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? ((ordenados[meio - 1] ?? 0) + (ordenados[meio] ?? 0)) / 2
    : (ordenados[meio] ?? 0);
}

/**
 * Ordena e compara, respeitando o volume mínimo.
 *
 * ============================================================================
 *  A RÉGUA É A MEDIANA DO GRUPO, e não a média nem o primeiro colocado.
 *
 *  Contra a média, um único outlier desloca todo mundo. Contra o primeiro, a
 *  tabela vira uma lista de derrotas — e o segundo colocado de um grupo
 *  excelente aparece "abaixo" enquanto vai muito bem.
 *
 *  A mediana responde a pergunta certa: esta clínica está acima ou abaixo do
 *  TÍPICO da organização?
 * ============================================================================
 */
export function ranquear(itens: readonly Comparavel[], maiorEhMelhor = true): Ranking {
  const comVolume = itens.filter((i) => i.volume >= VOLUME_MINIMO);

  const med = mediana(comVolume.map((i) => i.valor));

  const ordenados = [...itens].sort((a, b) => {
    // Quem não tem volume vai para o fim, sem posição.
    const aPequena = a.volume < VOLUME_MINIMO;
    const bPequena = b.volume < VOLUME_MINIMO;
    if (aPequena !== bPequena) return aPequena ? 1 : -1;
    return maiorEhMelhor ? b.valor - a.valor : a.valor - b.valor;
  });

  let posicao = 0;
  const linhas = ordenados.map((i) => {
    const pequena = i.volume < VOLUME_MINIMO;
    if (!pequena) posicao += 1;

    return {
      chave: i.chave,
      rotulo: i.rotulo,
      valor: i.valor,
      volume: i.volume,
      posicao: pequena ? null : posicao,
      contraMediana: Number((i.valor - med).toFixed(2)),
      amostraPequena: pequena,
    };
  });

  /*
   * COM MENOS DE DOIS COMPARÁVEIS NÃO HÁ COMPARAÇÃO, e a tela precisa dizer
   * isso em vez de mostrar um ranking de um item só — que sempre tem um
   * primeiro colocado e não significa nada.
   */
  let aviso: string | null = null;
  if (comVolume.length === 0) {
    aviso = `Ninguém tem volume suficiente para comparar. São necessários ao menos ${String(VOLUME_MINIMO)} registros no período.`;
  } else if (comVolume.length === 1) {
    aviso =
      "Só um item tem volume suficiente. Um ranking de um elemento sempre tem um primeiro colocado, e não diz nada.";
  }

  return { linhas, mediana: med, comparaveis: comVolume.length, aviso };
}

/* -------------------------------------------------------------------------- */
/* Período contra período                                                     */
/* -------------------------------------------------------------------------- */

export type Variacao = {
  rotulo: string;
  atual: number;
  anterior: number;
  /** Em porcentagem. `null` quando não havia base para comparar. */
  variacaoPct: number | null;
  melhorou: boolean;
  frase: string;
};

/**
 * Este período contra o anterior.
 *
 * ============================================================================
 *  DIVIDIR POR ZERO DEVOLVE `null`, E NÃO INFINITO.
 *
 *  Sair de 0 para 5 não é "aumento de infinito por cento" — é "começou". A
 *  tela precisa poder dizer isso, e um `Infinity` vazando para o React
 *  aparece como "Infinity%" na cara do usuário.
 * ============================================================================
 */
export function compararPeriodos(
  rotulo: string,
  atual: number,
  anterior: number,
  maiorEhMelhor = true,
): Variacao {
  if (anterior === 0) {
    const comecou = atual > 0;
    return {
      rotulo,
      atual,
      anterior,
      variacaoPct: null,
      melhorou: maiorEhMelhor ? comecou : !comecou,
      frase: comecou
        ? `Começou neste período: ${String(atual)}. Não havia base anterior para comparar.`
        : "Sem registro nos dois períodos.",
    };
  }

  const variacao = ((atual - anterior) / anterior) * 100;
  const subiu = variacao > 0;
  const melhorou = maiorEhMelhor ? subiu : !subiu;

  return {
    rotulo,
    atual,
    anterior,
    variacaoPct: Number(variacao.toFixed(1)),
    melhorou,
    frase: `${String(atual)} contra ${String(anterior)} no período anterior (${subiu ? "+" : ""}${String(Number(variacao.toFixed(1)))}%).`,
  };
}
