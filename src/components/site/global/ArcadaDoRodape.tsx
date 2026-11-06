import { caminhoCoroaPx } from "../sistema/geometria";

/**
 * A marca construída grande — o fecho da página.
 *
 * Uma fileira de blocos de alturas diferentes, lado a lado com 4px de vão, o
 * topo de cantos suaves e as bases na mesma linha: uma arcada. Dois deles
 * carregam as letras J e P vazadas (a cor do campo aparece pelo furo), então o
 * nome da clínica fecha o site como construção, e não como texto solto.
 *
 * É um `<svg>` com `viewBox` fixo em vez de blocos em flex: cada bloco é
 * desenhado por `caminhoCoroaPx` com a largura e a altura reais dele, então o
 * canto tem sempre o mesmo raio — esticar uma `FormaCoroa` por CSS deixaria
 * o canto oval nos mais baixos. O `viewBox` escala inteiro com a largura.
 *
 * Duas versões, trocadas por breakpoint: no celular quatro blocos largos (oito
 * deixariam as letras do tamanho de um selo) e a faixa fica em ~22svh.
 */

const VAO = 4;

type Peca = {
  /** Altura em fração da faixa (0,6 a 1). */
  h: number;
  /** Variável CSS do token de cor. */
  cor: string;
  letra?: "J" | "P";
};

/* Cores só da paleta, e o acento fica de fora de propósito: no rodapé ele
   significa "ação" (o botão Agendar avaliação), e duas coroas na mesma cor o
   fariam competir com o botão. As letras são o furo na cor do campo, então as
   duas peças que as carregam são as claras: campo sobre sobre-campo 13,55:1 e
   campo sobre chao-3 11,6:1. */
const DESKTOP: Peca[] = [
  { h: 0.72, cor: "--campo-marca" },
  { h: 0.92, cor: "--sobre-campo", letra: "J" },
  { h: 1, cor: "--chao-3", letra: "P" },
  { h: 0.8, cor: "--campo-marca" },
  { h: 0.94, cor: "--sobre-campo-suave" },
  { h: 0.68, cor: "--campo-marca" },
  { h: 0.86, cor: "--chao-3" },
  { h: 0.6, cor: "--campo-marca" },
];

const CELULAR: Peca[] = [
  { h: 0.7, cor: "--campo-marca" },
  { h: 0.92, cor: "--sobre-campo", letra: "J" },
  { h: 1, cor: "--chao-3", letra: "P" },
  { h: 0.8, cor: "--campo-marca" },
];

function Arcada({
  pecas,
  largura,
  altura,
  corpo,
  className,
}: {
  pecas: Peca[];
  largura: number;
  altura: number;
  /** Tamanho da letra em unidades do viewBox. */
  corpo: number;
  className: string;
}) {
  const n = pecas.length;
  const w = (largura - VAO * (n - 1)) / n;

  return (
    <svg
      viewBox={`0 0 ${String(largura)} ${String(altura)}`}
      aria-hidden="true"
      focusable="false"
      className={`arcada-svg ${className}`}
    >
      {pecas.map((peca, i) => {
        const x = i * (w + VAO);
        const h = peca.h * altura;
        const y = altura - h;
        return (
          <g
            key={`${peca.cor}-${String(i)}`}
            className="arcada-peca"
            style={{ "--k": i } as React.CSSProperties}
          >
            <path d={caminhoCoroaPx(x, y, w, h)} style={{ fill: `var(${peca.cor})` }} />
            {peca.letra ? (
              <text
                x={x + w / 2}
                y={altura - corpo * 0.12}
                textAnchor="middle"
                fontSize={corpo}
                className="arcada-letra"
              >
                {peca.letra}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function ArcadaDoRodape({ className = "" }: { className?: string }) {
  return (
    <div data-entra className={`arcada ${className}`}>
      <Arcada pecas={DESKTOP} largura={1600} altura={400} corpo={270} className="hidden md:block" />
      <Arcada pecas={CELULAR} largura={400} altura={230} corpo={128} className="md:hidden" />
    </div>
  );
}
