import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { caminhoCoroa, idSeguro } from "./geometria";

/**
 * Moldura em forma de coroa — a máscara de TODA fotografia do site.
 *
 * `proporcao` é largura / altura da peça e vira o `aspect-ratio` dela. Quando a
 * caixa não tem proporção fixa (ocupa a altura de uma coluna, por exemplo),
 * passe `medir`: um ResizeObserver refaz o caminho com a medida real, para os
 * lobos não esticarem. O servidor desenha com a `proporcao` informada; a troca
 * acontece depois da hidratação e só muda a altura dos lobos, não o tamanho.
 *
 * O `<svg>` de 0x0 mora dentro da própria moldura: assim cada moldura carrega a
 * sua definição, e o componente funciona isolado em qualquer rota.
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
  const id = idSeguro(useId());
  const ref = useRef<HTMLElement>(null);
  const [p, setP] = useState(proporcao);

  useEffect(() => {
    if (!medir) return;
    const el = ref.current;
    if (!el || !("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(([entrada]) => {
      const caixa = entrada?.contentRect;
      if (caixa && caixa.height > 0) setP(caixa.width / caixa.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [medir]);

  return (
    <Tag
      ref={ref as never}
      className={`moldura-coroa ${className}`}
      style={{
        ...(medir ? {} : { aspectRatio: String(proporcao) }),
        clipPath: `url(#${id})`,
        ...style,
      }}
      {...resto}
    >
      <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
        <clipPath id={id} clipPathUnits="objectBoundingBox">
          <path d={caminhoCoroa(p)} />
        </clipPath>
      </svg>
      {children}
    </Tag>
  );
}

/**
 * A coroa como forma chapada, sem foto: a forma gigante do topo, os blocos do
 * rodapé, o selo de destaque. A cor vem de `currentColor`.
 */
export function FormaCoroa({
  proporcao = 4 / 5,
  className = "",
  style,
}: {
  proporcao?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ aspectRatio: String(proporcao), ...style }}
    >
      <path d={caminhoCoroa(proporcao)} fill="currentColor" />
    </svg>
  );
}

/**
 * Marcador de lista na altura da letra: a mesma coroa em 0.72em.
 * Decorativo — o texto ao lado carrega o sentido.
 */
export function MarcaCoroa({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={`marca-coroa ${className}`}
    >
      <path d={caminhoCoroa(0.86)} fill="currentColor" />
    </svg>
  );
}

/**
 * Faixa de coroas lado a lado — uma arcada. É a faixa larga que separa as duas
 * metades da página e o pé do rodapé. Feita com `<pattern>`, então qualquer
 * largura vira uma fileira inteira, sem contar dentes.
 */
export function FaixaDeCoroas({
  altura = 56,
  largura = 64,
  className = "",
}: {
  altura?: number;
  largura?: number;
  className?: string;
}) {
  const id = idSeguro(useId(), "arcada");
  const p = largura / altura;
  const caminho = caminhoCoroa(p)
    .split(" ")
    .map((par) =>
      par.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, x: string, y: string) => {
        const px = Number(x) * largura;
        const py = Number(y) * altura;
        return `${Math.round(px * 100) / 100},${Math.round(py * 100) / 100}`;
      }),
    )
    .join(" ");

  return (
    <svg
      width="100%"
      height={altura}
      aria-hidden="true"
      focusable="false"
      className={`block ${className}`}
    >
      <defs>
        <pattern id={id} width={largura} height={altura} patternUnits="userSpaceOnUse">
          <path d={caminho.replace(/^M([\d.]+),/, "M$1,")} fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height={altura} fill={`url(#${id})`} />
    </svg>
  );
}
