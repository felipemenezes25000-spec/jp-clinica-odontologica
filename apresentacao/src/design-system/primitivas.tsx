import type { CSSProperties, ReactNode } from "react";
import { cor, fonte, raio, sombra, tamanho } from "./tokens";

/**
 * Os blocos visuais da apresentação.
 *
 * Estilo em linha, e não classe: metade destes componentes recebe cor de acento
 * calculada por cena, e o Remotion não compartilha o pipeline de CSS do Vite.
 * Um objeto de estilo é o denominador comum dos dois — e mantém o componente
 * legível sem ida e volta a um arquivo de CSS.
 */

/* -------------------------------------------------------------------------- */
/* Texto                                                                      */
/* -------------------------------------------------------------------------- */

export function Kicker({
  children,
  cor: c = cor.verdeEscuro,
  style,
}: {
  children: ReactNode;
  cor?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: fonte.texto,
        fontSize: tamanho.legenda,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: c,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Titulo({
  children,
  nivel = 1,
  cor: c = cor.tinta,
  style,
}: {
  children: ReactNode;
  nivel?: 1 | 2 | 3;
  cor?: string;
  style?: CSSProperties;
}) {
  const tam = nivel === 1 ? tamanho.titulo : nivel === 2 ? tamanho.subtitulo : tamanho.cabecalho;
  return (
    <div
      style={{
        fontFamily: fonte.display,
        fontSize: tam,
        fontWeight: 800,
        lineHeight: 1.04,
        letterSpacing: "-0.025em",
        color: c,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Corpo({
  children,
  cor: c = cor.tintaSuave,
  tamanho: t = tamanho.corpo,
  style,
}: {
  children: ReactNode;
  cor?: string;
  tamanho?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: fonte.texto,
        fontSize: t,
        lineHeight: 1.55,
        color: c,
        fontWeight: 400,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Superfícies                                                                */
/* -------------------------------------------------------------------------- */

export function Cartao({
  children,
  acento: a,
  elevado = false,
  apagado = false,
  padding = 22,
  style,
}: {
  children: ReactNode;
  /** Cor do fio de acento à esquerda. Ausente = card neutro. */
  acento?: string;
  elevado?: boolean;
  /** Estado "antes": o card existe, mas a operação não o enxerga. */
  apagado?: boolean;
  padding?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: "relative",
        background: apagado ? "#F3F4F0" : cor.branco,
        border: `1px solid ${apagado ? "#E6E9E2" : cor.borda}`,
        borderRadius: raio.grande,
        padding,
        boxShadow: elevado ? sombra.media : apagado ? "none" : sombra.suave,
        overflow: "hidden",
        ...style,
      }}
    >
      {a !== undefined && (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            background: a,
            opacity: apagado ? 0.3 : 1,
          }}
        />
      )}
      {children}
    </div>
  );
}

export function Painel({
  children,
  titulo,
  acao,
  padding = 26,
  style,
}: {
  children: ReactNode;
  titulo?: ReactNode;
  acao?: ReactNode;
  padding?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: cor.branco,
        border: `1px solid ${cor.borda}`,
        borderRadius: raio.enorme,
        boxShadow: sombra.media,
        overflow: "hidden",
        ...style,
      }}
    >
      {(titulo !== undefined || acao !== undefined) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `${padding - 6}px ${padding}px`,
            borderBottom: `1px solid ${cor.linha}`,
          }}
        >
          <div
            style={{
              fontFamily: fonte.display,
              fontWeight: 700,
              fontSize: tamanho.destaque,
              color: cor.tinta,
              letterSpacing: "-0.015em",
            }}
          >
            {titulo}
          </div>
          {acao}
        </div>
      )}
      <div style={{ padding }}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Marcadores                                                                 */
/* -------------------------------------------------------------------------- */

export function Selo({
  children,
  cor: texto = cor.verdeEscuro,
  fundo = cor.menta,
  icone,
  tamanho: t = tamanho.legenda,
  style,
}: {
  children: ReactNode;
  cor?: string;
  fundo?: string;
  icone?: ReactNode;
  tamanho?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: `${Math.round(t * 0.36)}px ${Math.round(t * 0.72)}px`,
        borderRadius: raio.pilula,
        background: fundo,
        color: texto,
        fontFamily: fonte.texto,
        fontSize: t,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icone}
      {children}
    </span>
  );
}

/** Ponto de status com halo. Verde = ativo, âmbar = aguardando. */
export function Ponto({ cor: c = cor.verde, tamanho: t = 10 }: { cor?: string; tamanho?: number }) {
  return (
    <span
      style={{
        width: t,
        height: t,
        borderRadius: 999,
        background: c,
        display: "inline-block",
        boxShadow: `0 0 0 ${Math.round(t * 0.35)}px ${c}22`,
        flex: "none",
      }}
    />
  );
}

/**
 * A etiqueta que honra o item 43 do Mega Prompt: número que não veio do banco
 * precisa dizer que não veio. Ela é discreta de propósito — informa sem virar
 * aviso legal no meio da composição.
 */
export function Ilustrativo({ style }: { style?: CSSProperties }) {
  return (
    <span
      style={{
        fontFamily: fonte.texto,
        fontSize: tamanho.micro,
        color: cor.tintaFraca,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontWeight: 500,
        ...style,
      }}
    >
      Exemplo ilustrativo
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Métrica                                                                    */
/* -------------------------------------------------------------------------- */

export function Metrica({
  rotulo,
  valor,
  detalhe,
  acento: a = cor.verdeEscuro,
  style,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  acento?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: cor.branco,
        border: `1px solid ${cor.borda}`,
        borderRadius: raio.grande,
        padding: "20px 22px",
        boxShadow: sombra.suave,
        ...style,
      }}
    >
      <div
        style={{
          fontFamily: fonte.texto,
          fontSize: tamanho.legenda,
          color: cor.tintaSuave,
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        {rotulo}
      </div>
      <div
        style={{
          fontFamily: fonte.display,
          fontSize: tamanho.cabecalho,
          fontWeight: 800,
          color: a,
          letterSpacing: "-0.02em",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {valor}
      </div>
      {detalhe !== undefined && (
        <div
          style={{
            marginTop: 8,
            fontFamily: fonte.texto,
            fontSize: tamanho.legenda,
            color: cor.tintaFraca,
          }}
        >
          {detalhe}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Estrutura de cena                                                          */
/* -------------------------------------------------------------------------- */

/** O retângulo de 1920×1080 onde toda cena mora. */
export function Palco({
  children,
  fundo = cor.fundo,
  style,
}: {
  children: ReactNode;
  fundo?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: fundo,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Posicionamento absoluto em coordenadas de palco.
 *
 * Toda cena posiciona assim, e não com fluxo, porque a linha do tempo precisa
 * poder mover um elemento continuamente entre duas posições — o que layout de
 * fluxo não deixa fazer sem provocar reflow a cada frame.
 */
export function Em({
  x,
  y,
  largura,
  altura,
  ancora = "topo-esquerda",
  children,
  style,
  zIndex,
}: {
  x: number;
  y: number;
  largura?: number;
  altura?: number;
  ancora?: "topo-esquerda" | "centro" | "topo-centro";
  children: ReactNode;
  style?: CSSProperties;
  zIndex?: number;
}) {
  const transforma =
    ancora === "centro"
      ? "translate(-50%, -50%)"
      : ancora === "topo-centro"
        ? "translate(-50%, 0)"
        : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: largura,
        height: altura,
        transform: transforma,
        zIndex,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Linha de grade sutil ao fundo. Dá profundidade sem virar decoração. */
export function Grade({
  opacidade = 0.5,
  passo = 60,
  cor: linha = cor.linha,
}: {
  opacidade?: number;
  passo?: number;
  cor?: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: opacidade,
        backgroundImage: `linear-gradient(${linha} 1px, transparent 1px), linear-gradient(90deg, ${linha} 1px, transparent 1px)`,
        backgroundSize: `${passo}px ${passo}px`,
        maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)",
        WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, #000 30%, transparent 100%)",
        pointerEvents: "none",
      }}
    />
  );
}

/** Brilho radial atrás do núcleo. Um só por cena; mais que isso vira neon. */
export function Halo({
  x,
  y,
  raio: r = 460,
  cor: c = cor.verde,
  intensidade = 0.16,
}: {
  x: number;
  y: number;
  raio?: number;
  cor?: string;
  intensidade?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${c}${Math.round(intensidade * 255)
          .toString(16)
          .padStart(2, "0")} 0%, transparent 68%)`,
        pointerEvents: "none",
      }}
    />
  );
}
