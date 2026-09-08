/**
 * Geração de caminhos SVG com comprimento conhecido.
 *
 * O comprimento importa porque o traço progressivo é feito com
 * `strokeDasharray`/`strokeDashoffset`, e os dois pedem um número. O caminho
 * óbvio seria `path.getTotalLength()`, mas ele exige o elemento já no DOM — e o
 * Remotion pinta o frame antes de qualquer efeito rodar, então o primeiro frame
 * de cada cena sairia com a linha inteira já desenhada.
 *
 * A saída então traz `d` e `comprimento` juntos, calculados por amostragem da
 * curva. 64 amostras dão erro abaixo de 0,1% para as curvas suaves usadas aqui.
 */

export type Caminho = { d: string; comprimento: number };

type Ponto = { x: number; y: number };

const AMOSTRAS = 64;

function comprimentoDeCubica(p0: Ponto, p1: Ponto, p2: Ponto, p3: Ponto): number {
  let total = 0;
  let anterior = p0;
  for (let i = 1; i <= AMOSTRAS; i++) {
    const t = i / AMOSTRAS;
    const u = 1 - t;
    const x =
      u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
    const y =
      u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
    total += Math.hypot(x - anterior.x, y - anterior.y);
    anterior = { x, y };
  }
  return total;
}

/** Reta simples. */
export function reta(x1: number, y1: number, x2: number, y2: number): Caminho {
  return { d: `M ${x1} ${y1} L ${x2} ${y2}`, comprimento: Math.hypot(x2 - x1, y2 - y1) };
}

/**
 * Curva que sai na horizontal e chega na horizontal.
 *
 * É a forma padrão das conexões da peça: a linha nasce da borda direita de um nó
 * e morre na borda esquerda do outro, sempre perpendicular à borda. Isso faz o
 * grafo parecer diagrama de arquitetura, e não teia.
 */
export function curvaH(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tensao = 0.5,
): Caminho {
  const dx = (x2 - x1) * tensao;
  const c1 = { x: x1 + dx, y: y1 };
  const c2 = { x: x2 - dx, y: y2 };
  return {
    d: `M ${x1} ${y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${x2} ${y2}`,
    comprimento: comprimentoDeCubica({ x: x1, y: y1 }, c1, c2, { x: x2, y: y2 }),
  };
}

/** A mesma ideia, saindo e chegando na vertical. */
export function curvaV(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tensao = 0.55,
): Caminho {
  const dy = (y2 - y1) * tensao;
  const c1 = { x: x1, y: y1 + dy };
  const c2 = { x: x2, y: y2 - dy };
  return {
    d: `M ${x1} ${y1} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${x2} ${y2}`,
    comprimento: comprimentoDeCubica({ x: x1, y: y1 }, c1, c2, { x: x2, y: y2 }),
  };
}

/**
 * Cotovelo com cantos arredondados — para ligações em L, onde a curva suave
 * ficaria frouxa demais.
 */
export function cotovelo(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  raio = 22,
): Caminho {
  const meioX = (x1 + x2) / 2;
  const sinalY = y2 > y1 ? 1 : -1;
  const sinalX = x2 > meioX ? 1 : -1;
  const r = Math.min(raio, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 4);

  const d = [
    `M ${x1} ${y1}`,
    `L ${meioX - r} ${y1}`,
    `Q ${meioX} ${y1} ${meioX} ${y1 + r * sinalY}`,
    `L ${meioX} ${y2 - r * sinalY}`,
    `Q ${meioX} ${y2} ${meioX + r * sinalX} ${y2}`,
    `L ${x2} ${y2}`,
  ].join(" ");

  const comprimento =
    Math.abs(meioX - r - x1) +
    Math.abs(y2 - y1 - 2 * r) +
    Math.abs(x2 - meioX - r * sinalX) +
    r * 3.14;

  return { d, comprimento };
}

/**
 * Arco de um ponto central para uma posição em círculo. Usado quando o núcleo
 * distribui para vários destinos ao mesmo tempo.
 */
export function raio(
  cx: number,
  cy: number,
  angulo: number,
  raioInterno: number,
  raioExterno: number,
): Caminho {
  const rad = (angulo * Math.PI) / 180;
  const x1 = cx + Math.cos(rad) * raioInterno;
  const y1 = cy + Math.sin(rad) * raioInterno;
  const x2 = cx + Math.cos(rad) * raioExterno;
  const y2 = cy + Math.sin(rad) * raioExterno;
  return reta(x1, y1, x2, y2);
}
