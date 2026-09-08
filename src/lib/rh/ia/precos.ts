/**
 * Quanto custa, em dólar, mandar N currículos para a IA.
 *
 * Existe porque o dono da clínica levou um susto na fatura: o painel tinha um
 * botão "Analisar as 54 pendentes" que não dizia nada antes de rodar — nem
 * quantas, nem com qual modelo, nem quanto ia sair. Um clique distraído numa
 * segunda-feira de manhã vira conta no fim do mês, e quem paga não estava na
 * frente da tela quando o clique aconteceu.
 *
 * Módulo puro de propósito: sem React, sem I/O, sem `new Date()`. Ele é lido
 * pela tela ANTES de qualquer pedido ao servidor — a estimativa tem que existir
 * mesmo quando a chave da OpenAI não existe.
 *
 * O número é ESTIMATIVA, e a tela precisa dizer isso. O consumo real varia com
 * o tamanho do currículo (um PDF de duas páginas gasta menos que um de seis) e
 * com o quanto o modelo escreve na justificativa. O que não pode acontecer é o
 * RH clicar sem nenhuma ordem de grandeza na cabeça.
 */

/**
 * Tokens de ENTRADA por currículo: o dossiê, a rubrica e o texto do PDF.
 *
 * MEDIDO, não estimado no olho. Os dois números saem da média das 62 leituras
 * que a clínica já pagou, lidas de `analise.tokensEntrada` e
 * `analise.tokensSaida` — cada análise grava o próprio consumo.
 *
 * Estavam em 4.500 e 3.000, escritos antes de existir leitura nenhuma para
 * conferir, e subestimavam a conta em 30%. Num módulo cuja razão de existir é
 * "o dono levou um susto na fatura", errar para baixo é o único erro que não se
 * pode cometer: quem clica em "analisar as 54 pendentes" tem de ver um número
 * que a fatura confirme depois, não um que a desminta.
 */
export const TOKENS_ENTRADA_POR_CURRICULO = 8500;

/** Tokens de SAÍDA por currículo: a análise em JSON, com as seis justificativas. */
export const TOKENS_SAIDA_POR_CURRICULO = 3500;

/**
 * Preço por 1 milhão de tokens, em dólar, na forma [entrada, saída].
 *
 * Tabela fechada de propósito: um modelo que não está aqui devolve
 * `conhecido: false`, e a tela escreve "custo desconhecido". Chutar o preço de
 * um modelo novo seria pior que não estimar — o RH confiaria num número que
 * ninguém conferiu, exatamente o problema que este arquivo veio resolver.
 */
const PRECOS: Record<string, readonly [number, number]> = {
  "gpt-5.5": [5, 30],
  "gpt-5.4": [2.5, 15],
  "gpt-5.4-mini": [0.75, 4.5],
  "gpt-5-mini": [0.25, 2],
  "gpt-5.6-luna": [0.2, 1.2],
  "gpt-5.6-terra": [2, 12],
  "gpt-5.6-sol": [4, 20],
  "gpt-5-nano": [0.05, 0.4],
};

export type CustoEstimado = {
  /** `false` quando o modelo não está na tabela: a tela NÃO deve mostrar valor. */
  conhecido: boolean;
  /** Total em dólar para a quantidade pedida. Zero quando não se conhece o preço. */
  dolares: number;
};

/**
 * Estimativa para `quantidade` currículos no `modelo` informado.
 *
 * Quantidade negativa ou fracionária é tratada como zero/inteira: o valor chega
 * de contagem de lista e de campo de tela, e um total negativo na frente do RH
 * seria pior do que um zero honesto.
 */
export function custoEstimado(modelo: string, quantidade: number): CustoEstimado {
  const preco = PRECOS[modelo.trim()];
  if (preco === undefined) return { conhecido: false, dolares: 0 };

  const n = Number.isFinite(quantidade) ? Math.max(0, Math.floor(quantidade)) : 0;
  const [entrada, saida] = preco;

  const dolares =
    (n * TOKENS_ENTRADA_POR_CURRICULO * entrada) / 1_000_000 +
    (n * TOKENS_SAIDA_POR_CURRICULO * saida) / 1_000_000;

  return { conhecido: true, dolares };
}

/**
 * O valor como a tela mostra. Duas casas some em fila grande ("US$ 0.00" para
 * uma candidata no nano), então abaixo de um centavo o texto diz o que é: menos
 * de um centavo, e não zero.
 */
export function formatarDolar(dolares: number): string {
  if (dolares > 0 && dolares < 0.01) return "menos de US$ 0,01";
  return `US$ ${dolares.toFixed(2).replace(".", ",")}`;
}
