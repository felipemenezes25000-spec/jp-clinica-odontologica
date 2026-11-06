/**
 * A FORMA DAS PEÇAS — retângulo de cantos arredondados.
 *
 * O redesenho de 11/2026 nasceu com uma "coroa" de dois lobos no topo de toda
 * foto e forma chapada. A clínica reprovou o desenho em 06/11/2026 (os dois
 * lobos lembravam outra coisa) e ele saiu do site inteiro. Os nomes
 * `caminhoCoroa`, `MolduraCoroa` e família ficaram por histórico: hoje eles
 * desenham só o retângulo de cantos suaves, o mesmo raio dos cartões.
 *
 * O raio é medido em LARGURAS, não em alturas: numa peça de proporção `p`
 * (largura / altura), o raio vertical é `RAIO * p` em frações da altura, e o
 * canto sai redondo em vez de oval, num retrato 4:5 ou numa forma de meia tela.
 */

/** Raio dos cantos, em fração da LARGURA da peça. */
const RAIO = 0.06;

const n = (v: number) => (Math.round(v * 10000) / 10000).toString();

/**
 * Caminho em `objectBoundingBox` (0–1 nos dois eixos) para uma peça de
 * proporção `p` = largura / altura: retângulo com os quatro cantos redondos.
 */
export function caminhoCoroa(p: number, raio = RAIO): string {
  const rx = Math.min(raio, 0.5);
  const ry = Math.min(raio * p, 0.5);
  return [
    `M${n(rx)},0 L${n(1 - rx)},0`,
    `A${n(rx)},${n(ry)} 0 0 1 1,${n(ry)}`,
    `L1,${n(1 - ry)}`,
    `A${n(rx)},${n(ry)} 0 0 1 ${n(1 - rx)},1`,
    `L${n(rx)},1`,
    `A${n(rx)},${n(ry)} 0 0 1 0,${n(1 - ry)}`,
    `L0,${n(ry)}`,
    `A${n(rx)},${n(ry)} 0 0 1 ${n(rx)},0 Z`,
  ].join(" ");
}

/**
 * Caminho em pixels de uma peça que nasce do chão: topo com os dois cantos
 * redondos, base reta (a fileira do rodapé apoia as peças na mesma linha).
 * `k` escala o raio: 1 é o canto do sistema, 0 é o retângulo seco.
 */
export function caminhoCoroaPx(x: number, y: number, w: number, h: number, k = 1): string {
  const r = Math.min(RAIO * w * k, w / 2, h);
  return [
    `M${n(x)},${n(y + h)} L${n(x)},${n(y + r)}`,
    `A${n(r)},${n(r)} 0 0 1 ${n(x + r)},${n(y)}`,
    `L${n(x + w - r)},${n(y)}`,
    `A${n(r)},${n(r)} 0 0 1 ${n(x + w)},${n(y + r)}`,
    `L${n(x + w)},${n(y + h)} Z`,
  ].join(" ");
}
