/**
 * Estrela e recomendação, calculadas em código a partir da nota.
 *
 * POR QUE ISSO SAIU DAS MÃOS DO MODELO
 * A nota geral já era determinística: média ponderada das notas de 0 a 10 dos
 * seis critérios, pelos pesos da rubrica. Mas a estrela e a recomendação
 * continuavam vindo do modelo — e as três andaram separadas. Medindo o acervo
 * real de 28 candidatas de recepção, deu isto:
 *
 *     4 estrelas → notas de 63 a 90
 *     3 estrelas → notas de 36 a 68     ← faixa sobreposta
 *
 * Ou seja: com 65 de nota, a mesma pessoa podia levar 3 ou 4 estrelas conforme
 * a rodada. E a recomendação desabou para o meio — 18 das 28 caíram em "talvez",
 * o que não ajuda ninguém a decidir quem chamar primeiro.
 *
 * Com o cálculo aqui, as três viram a MESMA função dos seis critérios. Não é
 * possível a tela mostrar 4 estrelas ao lado de uma nota de 3 estrelas, e o RH
 * consegue apontar para o número e reproduzir de onde ele veio.
 *
 * O modelo continua fazendo o que só ele faz: ler o currículo e julgar cada
 * critério. A régua é nossa.
 */
import type { AnaliseIa, RecomendacaoIa, Sinal } from "./tipos";

/**
/**
 * Corte de cada faixa, na régua ditada pelo dono da clínica:
 *
 *   80-100  chamar para entrevista com prioridade
 *   65-79   boa candidata
 *   50-64   avaliar se faltar candidata melhor
 *   abaixo de 50  baixa prioridade
 *
 * ESTES NÚMEROS SÃO DO CLIENTE, NÃO DE AFERIÇÃO NOSSA — e a diferença importa.
 * Os cortes anteriores (62 e 45) tinham sido calibrados contra as nove fichas
 * que a clínica marcou como favoritas, justamente para que nenhuma delas caísse
 * na faixa de descarte.
 *
 * Com 65 e 50, oito das 60 fichas já lidas mudam de estrela, e uma delas é a
 * Daniele Xavier (nota 63), que ESTÁ entre as favoritas e passa de 4 para 3
 * estrelas. Foi uma escolha informada: a régua do cliente prevalece sobre a
 * calibragem, e o registro fica aqui para quem for reconferir depois.
 *
 * Cinco estrelas para quatro faixas de propósito: a estrela é o que ordena a
 * fila no painel, e distinguir 2 de 1 mantém a ordenação útil dentro da faixa
 * de baixa prioridade, mesmo que as duas digam a mesma coisa ao RH.
 */
export const FAIXAS_ESTRELA: { estrelas: number; minimo: number; rotulo: string }[] = [
  { estrelas: 5, minimo: 80, rotulo: "Chamar para entrevista com prioridade" },
  { estrelas: 4, minimo: 65, rotulo: "Boa candidata" },
  { estrelas: 3, minimo: 50, rotulo: "Avaliar se faltar candidata melhor" },
  { estrelas: 2, minimo: 30, rotulo: "Baixa prioridade" },
  { estrelas: 1, minimo: 0, rotulo: "Baixa prioridade" },
];

export function estrelasPor(nota: number): number {
  const n = Number.isFinite(nota) ? Math.min(100, Math.max(0, nota)) : 0;
  for (const faixa of FAIXAS_ESTRELA) {
    if (n >= faixa.minimo) return faixa.estrelas;
  }
  return 1;
}

export function faixaDaNota(nota: number): { estrelas: number; minimo: number; rotulo: string } {
  const n = Number.isFinite(nota) ? Math.min(100, Math.max(0, nota)) : 0;
  for (const faixa of FAIXAS_ESTRELA) {
    if (n >= faixa.minimo) return faixa;
  }
  const ultima = FAIXAS_ESTRELA[FAIXAS_ESTRELA.length - 1];
  return ultima ?? { estrelas: 1, minimo: 0, rotulo: "Não serve para esta vaga" };
}

/**
 * Sinal crítico que pesa na nota. O de dado sensível fica de fora porque ele
 * existe justamente para dizer que NÃO foi considerado — travar a recomendação
 * por causa dele seria usar contra a candidata a informação que a gente jurou
 * ignorar.
 */
function temCriticoQueConta(sinais: Sinal[]): boolean {
  return sinais.some((s) => s.severidade === "critico" && s.contaNaNota);
}

/**
 * A recomendação segue a estrela, com duas travas que a nota sozinha não pega.
 *
 * A primeira: documento que não é currículo não tem o que recomendar. A segunda:
 * um sinal crítico — CRO ausente para dentista, último emprego de dois meses,
 * currículo ilegível — não pode ser compensado por nota alta nos outros
 * critérios. Uma dentista sem registro ativo com 92 de nota continua sendo
 * alguém que a clínica não pode colocar na cadeira. Nesses casos a recomendação
 * trava em "talvez": não descarta ninguém sozinha, mas obriga a conversa antes.
 */
export function recomendacaoPor(
  nota: number,
  sinais: Sinal[],
  documentoValido: boolean,
): RecomendacaoIa {
  if (!documentoValido) return "descartar";

  const estrelas = estrelasPor(nota);
  const base: RecomendacaoIa =
    estrelas >= 5
      ? "entrevistar-ja"
      : estrelas === 4
        ? "entrevistar"
        : estrelas === 3
          ? "talvez"
          : "descartar";

  if (temCriticoQueConta(sinais) && (base === "entrevistar-ja" || base === "entrevistar")) {
    return "talvez";
  }
  return base;
}

/**
 * Aplica a régua a uma análise já pronta. Serve tanto para a análise nova
 * quanto para recalcular as antigas sem gastar uma única chamada de API — os
 * critérios já estão gravados, e a régua é conta.
 */
export function comVeredito(analise: AnaliseIa): AnaliseIa {
  const documentoValido = analise.extracao.documentoValido;
  const estrelas = documentoValido ? estrelasPor(analise.notaGeral) : 1;
  return {
    ...analise,
    estrelas,
    recomendacao: recomendacaoPor(analise.notaGeral, analise.sinais, documentoValido),
  };
}
