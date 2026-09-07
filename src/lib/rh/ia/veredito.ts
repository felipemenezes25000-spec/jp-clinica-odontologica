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
 * ONDE CORTAR, E POR QUE NÃO É ONDE PARECE
 *
 * A primeira versão desta régua usava a escala nominal — média 7,0 vira quatro
 * estrelas, média 8,5 vira cinco. Simulado contra o acervo real, o resultado foi
 * absurdo: 23 das 51 candidatas caíam em "descartar", e DUAS das nove que a
 * clínica já tinha marcado como favoritas iam junto.
 *
 * O erro foi tratar a nota como se fosse uma prova escolar. Ela não é. A rubrica
 * ancorada desconta de propósito o que o currículo não prova: falta de datas,
 * passagem curta, ausência de experiência odontológica, progressão que não
 * aparece. Quase ninguém tira 7 em seis critérios ao mesmo tempo — a mediana do
 * acervo real ficou perto de 50. Sob ESTA rubrica, 65 não é medíocre: é uma
 * candidata que a clínica chamaria.
 *
 * Então os cortes vêm da rubrica, não da escala nominal, e são conferidos contra
 * a única verdade externa que existe aqui: as nove candidatas que a Dra. Ana
 * Beatriz e o Jefferson escolheram antes de qualquer IA. A régua abaixo põe
 * seis delas em "entrevistar" ou acima, as outras três em "talvez", e NENHUMA
 * em "descartar" — que era o defeito que reprovou a primeira tentativa.
 *
 *     5 estrelas  80 ou mais   perfil raro; chamar esta semana
 *     4 estrelas  62 a 79      chamar para entrevista
 *     3 estrelas  45 a 61      depende da conversa
 *     2 estrelas  30 a 44      só se faltar gente
 *     1 estrela   abaixo de 30 não serve para esta vaga
 *
 * Se a rubrica mudar, estes números precisam ser reconferidos contra as
 * favoritas de novo — é essa aferição que os sustenta, não o desenho redondo.
 */
export const FAIXAS_ESTRELA: { estrelas: number; minimo: number; rotulo: string }[] = [
  { estrelas: 5, minimo: 80, rotulo: "Perfil raro para a vaga" },
  { estrelas: 4, minimo: 62, rotulo: "Chamar para entrevista" },
  { estrelas: 3, minimo: 45, rotulo: "Depende da conversa" },
  { estrelas: 2, minimo: 30, rotulo: "Só se faltar gente" },
  { estrelas: 1, minimo: 0, rotulo: "Não serve para esta vaga" },
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
