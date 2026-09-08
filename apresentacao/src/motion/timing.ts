/**
 * A matemática do movimento. Nenhum import — nem React, nem Remotion.
 *
 * É a peça que permite o filme ser um só nos dois destinos: a animação inteira é
 * função pura de `frame`, e não do relógio. O Remotion pede o frame 1234 e recebe
 * exatamente o mesmo pixel que o navegador desenha quando o player chega lá.
 * Nada de `setTimeout`, `Date.now()` ou transição CSS dentro do palco.
 */

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/* -------------------------------------------------------------------------- */
/* Curvas                                                                     */
/* -------------------------------------------------------------------------- */

export type Curva = (t: number) => number;

export const linear: Curva = (t) => t;
export const easeOut: Curva = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuint: Curva = (t) => 1 - Math.pow(1 - t, 5);
export const easeIn: Curva = (t) => t * t * t;
export const easeInOut: Curva = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Desaceleração longa — o movimento "de câmera" da peça. */
export const cinema: Curva = (t) => 1 - Math.pow(1 - t, 4);
/** Um repique mínimo, para card que assenta. Nada de mola de brinquedo. */
export const assentar: Curva = (t) => {
  const c = 1.70158 * 0.45;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/* -------------------------------------------------------------------------- */
/* Interpolação                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Mapeia `frame` de um intervalo de entrada para um de saída, com curva.
 *
 * Assinatura igual à do `interpolate` do Remotion de propósito: quem já leu
 * código de Remotion não precisa aprender outra coisa, e a implementação própria
 * mantém `src/motion` sem dependência (o bundler da web não puxa o Remotion).
 */
export function interpolar(
  frame: number,
  entrada: readonly [number, number] | readonly number[],
  saida: readonly [number, number] | readonly number[],
  opcoes?: { curva?: Curva; travar?: boolean },
): number {
  const curva = opcoes?.curva ?? linear;
  const travar = opcoes?.travar ?? true;

  if (entrada.length !== saida.length || entrada.length < 2) {
    throw new Error("interpolar: entrada e saída precisam ter o mesmo tamanho, ≥ 2.");
  }

  // Fora dos extremos, com travamento (o padrão) devolve a ponta.
  const primeiro = entrada[0] as number;
  const ultimo = entrada[entrada.length - 1] as number;
  if (travar) {
    if (frame <= primeiro) return saida[0] as number;
    if (frame >= ultimo) return saida[saida.length - 1] as number;
  }

  let i = 0;
  while (i < entrada.length - 2 && frame >= (entrada[i + 1] as number)) i++;

  const de = entrada[i] as number;
  const ate = entrada[i + 1] as number;
  const vDe = saida[i] as number;
  const vAte = saida[i + 1] as number;

  if (ate === de) return vAte;
  const t = (frame - de) / (ate - de);
  return vDe + (vAte - vDe) * curva(travar ? clamp(t, 0, 1) : t);
}

/** Progresso 0→1 de uma janela de frames. O tijolo de quase toda cena. */
export function progresso(frame: number, inicio: number, duracao: number, curva: Curva = easeOut) {
  if (duracao <= 0) return frame >= inicio ? 1 : 0;
  return curva(clamp((frame - inicio) / duracao, 0, 1));
}

/**
 * Entrada e saída numa chamada só: sobe em `entra` frames, fica, e desce nos
 * últimos `sai` frames da janela. Devolve 0..1.
 */
export function janela(
  frame: number,
  inicio: number,
  duracao: number,
  entra = 14,
  sai = 12,
): number {
  const fim = inicio + duracao;
  if (frame <= inicio || frame >= fim) return 0;
  const subida = progresso(frame, inicio, entra, easeOut);
  const descida = 1 - progresso(frame, fim - sai, sai, easeIn);
  return Math.min(subida, descida);
}

/** Atraso escalonado por índice, com teto para listas longas não arrastarem. */
export function escalonar(indice: number, passo = 6, teto = 14): number {
  return Math.min(indice, teto) * passo;
}

/**
 * Uma mola crítica em versão determinística e barata.
 *
 * Não é a mola do Remotion (que integra por frame); é a solução analítica de um
 * oscilador amortecido. Serve ao mesmo propósito visual e não exige import.
 */
export function mola(frame: number, inicio: number, opcoes?: { rigidez?: number; massa?: number }) {
  const t = Math.max(0, frame - inicio) / 30;
  const rigidez = opcoes?.rigidez ?? 120;
  const massa = opcoes?.massa ?? 1;
  const omega = Math.sqrt(rigidez / massa);
  const amortecimento = 0.86;
  const decaimento = Math.exp(-amortecimento * omega * t);
  const livre = omega * Math.sqrt(Math.max(0, 1 - amortecimento * amortecimento));
  return 1 - decaimento * (Math.cos(livre * t) + ((amortecimento * omega) / (livre || 1)) * Math.sin(livre * t));
}

/* -------------------------------------------------------------------------- */
/* Aleatoriedade determinística                                               */
/* -------------------------------------------------------------------------- */

/**
 * Ruído estável a partir de uma semente inteira.
 *
 * `Math.random()` deixaria a partícula num lugar no preview e em outro no render
 * do mesmo frame — e o vídeo tremeria. Aqui a posição de cada ponto é uma função
 * do seu índice, então ela é a mesma para sempre.
 */
export function aleatorio(semente: number): number {
  let x = Math.sin(semente * 127.1 + 311.7) * 43758.5453123;
  x = x - Math.floor(x);
  return x;
}

export function aleatorioEntre(semente: number, min: number, max: number): number {
  return min + aleatorio(semente) * (max - min);
}

/* -------------------------------------------------------------------------- */
/* Formatação de número animado                                               */
/* -------------------------------------------------------------------------- */

const AGRUPADOR = new Intl.NumberFormat("pt-BR");

export function formatarNumero(valor: number): string {
  return AGRUPADOR.format(Math.round(valor));
}

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Math.round(valor));
}

/** Segundos → `m:ss`, para a barra do player. */
export function formatarTempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
