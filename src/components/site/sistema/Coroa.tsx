import type { CSSProperties, ReactNode } from "react";

/*
 * As peças do sistema. Os nomes vêm da "coroa" de dois lobos que o redesenho
 * de 11/2026 usou e a clínica reprovou em 06/11/2026; hoje a moldura é só o
 * canto arredondado e o marcador é um ponto.
 */

/**
 * A moldura de TODA fotografia do site: cantos com o raio dos cartões.
 *
 * O canto é `border-radius` no CSS (`.moldura-coroa`), não máscara em SVG: sai
 * nítido em qualquer tamanho, não precisa medir a caixa e não carrega um
 * `<clipPath>` por foto. `proporcao` é largura / altura e vira o
 * `aspect-ratio` da peça; `medir` diz que a caixa NÃO tem proporção fixa
 * (ocupa a altura de uma coluna, por exemplo) e quem manda é o CSS.
 */
export function MolduraCoroa({
  proporcao = 4 / 5,
  medir = false,
  className = "",
  style,
  children,
  as: Tag = "div",
  ...resto
}: {
  proporcao?: number;
  medir?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  as?: "div" | "figure" | "span";
} & Omit<React.HTMLAttributes<HTMLElement>, "style" | "className" | "children">) {
  return (
    <Tag
      className={`moldura-coroa ${className}`}
      style={{
        ...(medir ? {} : { aspectRatio: String(proporcao) }),
        ...style,
      }}
      {...resto}
    >
      {children}
    </Tag>
  );
}

/**
 * Marcador de lista na altura da letra: um ponto, centrado na caixa de 0.74em
 * (a caixa continua a mesma para nenhuma lista mudar de alinhamento).
 * Decorativo — o texto ao lado carrega o sentido.
 */
export function MarcaCoroa({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1 1"
      aria-hidden="true"
      focusable="false"
      className={`marca-coroa ${className}`}
    >
      <circle cx="0.5" cy="0.5" r="0.3" fill="currentColor" />
    </svg>
  );
}
