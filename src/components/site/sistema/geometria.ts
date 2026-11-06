/**
 * A COROA — a forma única do site desde o redesenho de 11/2026.
 *
 * Sai da marca: o dente do símbolo da JP é desenhado por dois traços que se
 * encontram numa covinha no alto, e a maçã verde do material impresso tem o
 * mesmo topo de dois lobos. Esse topo, com laterais retas e base cortada pela
 * moldura, é a única forma "com caráter" da página: máscara de toda foto,
 * forma gigante do topo, marcador de lista e faixa que divide a página.
 *
 * A geometria é medida em LARGURAS, não em alturas. Os lobos têm sempre a
 * mesma proporção em relação à largura da peça; a altura só decide até onde
 * as laterais descem. Por isso a mesma coroa serve a um retrato 4:5 e a uma
 * janela que ocupa meia tela, sem os lobos esticarem.
 */

/** Pontos do topo, em frações da LARGURA. */
const OMBRO = 0.3; // onde a lateral reta começa a curvar
const CURVA = 0.12; // controle da curva do ombro
const COVINHA = 0.11; // fundo da covinha entre os dois lobos
const COVINHA_CTRL = 0.05;

const n = (v: number) => (Math.round(v * 10000) / 10000).toString();

/**
 * Caminho em `objectBoundingBox` (0–1 nos dois eixos) para uma peça de
 * proporção `p` = largura / altura. Use com `clipPathUnits="objectBoundingBox"`.
 */
export function caminhoCoroa(p: number): string {
  const y = (v: number) => n(Math.min(v * p, 1));
  return [
    `M0,1 L0,${y(OMBRO)}`,
    `C0,${y(CURVA)} 0.12,0 0.27,0`,
    `C0.38,0 0.45,${y(COVINHA_CTRL)} 0.5,${y(COVINHA)}`,
    `C0.55,${y(COVINHA_CTRL)} 0.62,0 0.73,0`,
    `C0.88,0 1,${y(CURVA)} 1,${y(OMBRO)}`,
    `L1,1 Z`,
  ].join(" ");
}

/**
 * Caminho em pixels, para `clip-path: path()` animado quadro a quadro.
 *
 * `k` é a intensidade dos lobos: 1 é a coroa, 0 é um retângulo. A cena de
 * abertura do topo interpola a caixa E o `k` ao mesmo tempo, então a janela
 * cresce até a tela inteira e os lobos se desfazem no caminho.
 */
export function caminhoCoroaPx(x: number, y: number, w: number, h: number, k = 1): string {
  const v = (f: number) => n(y + Math.min(f * w * k, h));
  const hx = (f: number) => n(x + f * w);
  return [
    `M${n(x)},${n(y + h)} L${n(x)},${v(OMBRO)}`,
    `C${n(x)},${v(CURVA)} ${hx(0.12)},${n(y)} ${hx(0.27)},${n(y)}`,
    `C${hx(0.38)},${n(y)} ${hx(0.45)},${v(COVINHA_CTRL)} ${hx(0.5)},${v(COVINHA)}`,
    `C${hx(0.55)},${v(COVINHA_CTRL)} ${hx(0.62)},${n(y)} ${hx(0.73)},${n(y)}`,
    `C${hx(0.88)},${n(y)} ${hx(1)},${v(CURVA)} ${hx(1)},${v(OMBRO)}`,
    `L${hx(1)},${n(y + h)} Z`,
  ].join(" ");
}

/** `useId` do React traz caracteres que `url(#…)` do CSS não aceita sem escape. */
export function idSeguro(bruto: string, prefixo = "coroa"): string {
  return `${prefixo}-${bruto.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
