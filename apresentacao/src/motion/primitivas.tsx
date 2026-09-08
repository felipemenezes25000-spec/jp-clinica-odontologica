import { type CSSProperties, type ReactNode } from "react";
import { useDeslocamento, useFrame } from "./frame";
import {
  aleatorioEntre,
  clamp,
  cinema,
  easeOut,
  easeOutQuint,
  escalonar,
  formatarMoeda,
  formatarNumero,
  interpolar,
  janela,
  progresso,
  type Curva,
} from "./timing";
import { cor } from "@/design-system/tokens";

/**
 * As primitivas de movimento — o vocabulário que as 28 cenas compartilham.
 *
 * Todas leem `useFrame()` (frame local da cena) e devolvem estilo calculado. Não
 * há transição CSS em nenhuma delas: transição CSS depende do relógio do
 * navegador, e o Remotion desenha frame avulso, então o resultado sairia
 * congelado no primeiro estado. Ver MOTION-SYSTEM.md.
 */

/* -------------------------------------------------------------------------- */
/* Aparições                                                                  */
/* -------------------------------------------------------------------------- */

type BaseAparicao = {
  /** Frame local em que começa. */
  em?: number;
  /** Duração da entrada. */
  dur?: number;
  /** Frame local em que sai. Sem isso, fica até o fim da cena. */
  ate?: number;
  duracaoSaida?: number;
  curva?: Curva;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

function opacidadeDe(frame: number, p: Omit<BaseAparicao, "children">): number {
  const em = p.em ?? 0;
  const dur = p.dur ?? 18;
  const entrada = progresso(frame, em, dur, p.curva ?? easeOut);
  if (p.ate === undefined) return entrada;
  const saida = 1 - progresso(frame, p.ate, p.duracaoSaida ?? 12, easeOut);
  return Math.min(entrada, saida);
}

export function Surgir({ children, ...p }: BaseAparicao) {
  const o = opacidadeDe(useFrame(), p);
  return (
    <div className={p.className} style={{ opacity: o, ...p.style }}>
      {children}
    </div>
  );
}

/** Fade + deslocamento. `de` é a direção de onde o elemento vem. */
export function Entrar({
  de = "baixo",
  distancia = 28,
  children,
  ...p
}: BaseAparicao & { de?: "baixo" | "cima" | "esquerda" | "direita"; distancia?: number }) {
  const frame = useFrame();
  const escala = useDeslocamento();
  const o = opacidadeDe(frame, p);
  const t = progresso(frame, p.em ?? 0, p.dur ?? 22, p.curva ?? easeOutQuint);
  const d = distancia * escala * (1 - t);
  const eixo =
    de === "baixo"
      ? `translate3d(0, ${d}px, 0)`
      : de === "cima"
        ? `translate3d(0, ${-d}px, 0)`
        : de === "esquerda"
          ? `translate3d(${-d}px, 0, 0)`
          : `translate3d(${d}px, 0, 0)`;

  return (
    <div className={p.className} style={{ opacity: o, transform: eixo, ...p.style }}>
      {children}
    </div>
  );
}

/** Escala suave. Nunca abaixo de 0,94: abaixo disso vira "pop" de apresentação. */
export function Crescer({
  deEscala = 0.965,
  children,
  ...p
}: BaseAparicao & { deEscala?: number }) {
  const frame = useFrame();
  const o = opacidadeDe(frame, p);
  const t = progresso(frame, p.em ?? 0, p.dur ?? 24, p.curva ?? easeOutQuint);
  const s = deEscala + (1 - deEscala) * t;
  return (
    <div
      className={p.className}
      style={{ opacity: o, transform: `scale(${s})`, transformOrigin: "center", ...p.style }}
    >
      {children}
    </div>
  );
}

/**
 * Lista escalonada. Recebe os filhos como array e distribui o atraso.
 *
 * É render prop e não `React.Children.map` porque metade das cenas precisa do
 * índice para outra coisa além do atraso (cor, posição no arco, número).
 */
export function Escalonado<T>({
  itens,
  em = 0,
  passo = 6,
  dur = 22,
  de = "baixo",
  distancia = 22,
  render,
  style,
  className,
}: {
  itens: readonly T[];
  em?: number;
  passo?: number;
  dur?: number;
  de?: "baixo" | "cima" | "esquerda" | "direita";
  distancia?: number;
  render: (item: T, indice: number) => ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div className={className} style={style}>
      {itens.map((item, i) => (
        <Entrar
          key={i}
          em={em + escalonar(i, passo)}
          dur={dur}
          de={de}
          distancia={distancia}
          style={{ display: "contents" }}
        >
          {render(item, i)}
        </Entrar>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Câmera                                                                     */
/* -------------------------------------------------------------------------- */

export type PosicaoCamera = { x: number; y: number; escala: number };

/**
 * A câmera virtual.
 *
 * O palco inteiro é transformado — não os elementos. É o que dá a sensação de
 * "a câmera se aproximou do Dental Office" em vez de "os cards ficaram maiores":
 * o enquadramento muda junto, e o que sai de quadro sai de verdade.
 *
 * `chaves` são pontos no tempo. Entre dois pontos a curva é `cinema` — uma
 * desaceleração longa, sem repique, porque câmera boa não tem mola.
 */
export function Camera({
  chaves,
  children,
}: {
  chaves: readonly { frame: number; posicao: PosicaoCamera }[];
  children: ReactNode;
}) {
  const frame = useFrame();
  const reduzido = useDeslocamento() === 0;

  if (chaves.length === 0 || reduzido) return <>{children}</>;

  const entradas = chaves.map((k) => k.frame);
  const escala = interpolar(
    frame,
    entradas,
    chaves.map((k) => k.posicao.escala),
    { curva: cinema },
  );
  const x = interpolar(
    frame,
    entradas,
    chaves.map((k) => k.posicao.x),
    { curva: cinema },
  );
  const y = interpolar(
    frame,
    entradas,
    chaves.map((k) => k.posicao.y),
    { curva: cinema },
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${escala}) translate3d(${-x}px, ${-y}px, 0)`,
        transformOrigin: "center center",
        willChange: "transform",
      }}
    >
      {children}
    </div>
  );
}

/** Paralaxe muito discreta: 1 é o plano da câmera, 0,4 é fundo distante. */
export function Plano({
  profundidade = 1,
  amplitude = 18,
  children,
  style,
}: {
  profundidade?: number;
  amplitude?: number;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const frame = useFrame();
  const escala = useDeslocamento();
  const deslocamento = ((frame / 120) * amplitude * (1 - profundidade) * escala) % 400;
  return <div style={{ transform: `translate3d(0, ${deslocamento}px, 0)`, ...style }}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* Números                                                                    */
/* -------------------------------------------------------------------------- */

export function Contador({
  ate,
  em = 0,
  dur = 55,
  prefixo = "",
  sufixo = "",
  moeda = false,
  style,
  className,
}: {
  ate: number;
  em?: number;
  dur?: number;
  prefixo?: string;
  sufixo?: string;
  moeda?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  const frame = useFrame();
  const t = progresso(frame, em, dur, easeOutQuint);
  const valor = ate * t;
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>
      {prefixo}
      {moeda ? formatarMoeda(valor) : formatarNumero(valor)}
      {sufixo}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Traço                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Desenha um `<path>` progressivamente.
 *
 * Precisa do comprimento aproximado do caminho porque `getTotalLength()` só
 * existe depois do layout — e o Remotion tira o frame antes de qualquer efeito
 * rodar. Passar o comprimento à mão é o preço de o traço ser idêntico nos dois
 * destinos.
 */
export function Traco({
  d,
  comprimento,
  em = 0,
  dur = 30,
  cor: traco = cor.borda,
  largura = 2,
  tracejado,
  opacidade = 1,
  curva = easeOut,
}: {
  d: string;
  comprimento: number;
  em?: number;
  dur?: number;
  cor?: string;
  largura?: number;
  tracejado?: string;
  opacidade?: number;
  curva?: Curva;
}) {
  const frame = useFrame();
  const t = progresso(frame, em, dur, curva);
  return (
    <path
      d={d}
      fill="none"
      stroke={traco}
      strokeWidth={largura}
      strokeLinecap="round"
      strokeDasharray={tracejado ?? `${comprimento}`}
      strokeDashoffset={tracejado ? 0 : comprimento * (1 - t)}
      opacity={tracejado ? t * opacidade : opacidade}
    />
  );
}

/**
 * Pulsos de dado percorrendo um caminho SVG.
 *
 * `offsetPath` em CSS faria isso, mas depende de animação com relógio, e o
 * Remotion desenha frame avulso. A solução que funciona nos dois: um traço de
 * comprimento ~0 com ponta redonda — visualmente um ponto — empurrado pelo
 * caminho por `strokeDashoffset`. A posição é `frame % ciclo`, então é a mesma
 * no preview e no render.
 */
export function Pulsos({
  d,
  comprimento,
  quantidade = 3,
  em = 0,
  ciclo = 90,
  cor: preenchimento = cor.verde,
  raio: r = 5,
  semente = 1,
}: {
  d: string;
  comprimento: number;
  quantidade?: number;
  em?: number;
  ciclo?: number;
  cor?: string;
  raio?: number;
  semente?: number;
}) {
  const frame = useFrame();
  const reduzido = useDeslocamento() === 0;
  if (reduzido || frame < em) return null;

  const pontos: { razao: number; o: number }[] = [];
  for (let i = 0; i < quantidade; i++) {
    const deslocamentoInicial = aleatorioEntre(semente * 31 + i, 0, ciclo);
    const t = (((frame - em + deslocamentoInicial) % ciclo) + ciclo) % ciclo;
    const razao = t / ciclo;
    // `sin` some nas duas pontas: o pulso não nasce nem morre à vista.
    pontos.push({ razao, o: Math.sin(razao * Math.PI) });
  }

  return (
    <>
      {pontos.map((p, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={preenchimento}
          strokeWidth={r * 1.6}
          strokeLinecap="round"
          strokeDasharray={`0.01 ${comprimento}`}
          strokeDashoffset={-p.razao * comprimento}
          opacity={p.o * 0.9}
        />
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Foco                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Escurece tudo menos um retângulo. É como a peça diz "olhe aqui" sem seta.
 * Coordenadas no espaço do palco (1920×1080).
 */
export function Holofote({
  x,
  y,
  largura,
  altura,
  em = 0,
  dur = 20,
  ate,
  intensidade = 0.55,
  raio = 28,
}: {
  x: number;
  y: number;
  largura: number;
  altura: number;
  em?: number;
  dur?: number;
  ate?: number;
  intensidade?: number;
  raio?: number;
}) {
  const frame = useFrame();
  const entrada = progresso(frame, em, dur, easeOut);
  const saida = ate === undefined ? 1 : 1 - progresso(frame, ate, 16, easeOut);
  const o = Math.min(entrada, saida) * intensidade;
  if (o <= 0.001) return null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 40 }}>
      <svg width="100%" height="100%" viewBox="0 0 1920 1080" style={{ display: "block" }}>
        <defs>
          <mask id={`holofote-${x}-${y}-${largura}`}>
            <rect x="0" y="0" width="1920" height="1080" fill="white" />
            <rect x={x} y={y} width={largura} height={altura} rx={raio} fill="black" />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="1920"
          height="1080"
          fill={cor.profundo}
          opacity={o}
          mask={`url(#holofote-${x}-${y}-${largura})`}
        />
      </svg>
    </div>
  );
}

/**
 * A cortina de transição entre cenas. Não é fade-to-black: é um lençol da cor do
 * papel com desfoque curto, que faz duas cenas se emendarem sem piscar.
 */
export function Cortina({
  em,
  dur = 16,
  cor: fundo = cor.fundo,
}: {
  em: number;
  dur?: number;
  cor?: string;
}) {
  const frame = useFrame();
  const t = janela(frame, em, dur * 2, dur, dur);
  if (t <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: fundo,
        opacity: t,
        pointerEvents: "none",
        zIndex: 60,
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Utilitários de estilo                                                      */
/* -------------------------------------------------------------------------- */

/** Barra de progresso animada, usada por funil e por métrica. */
export function Barra({
  razao,
  em = 0,
  dur = 40,
  cor: preenchimento = cor.verde,
  fundo = cor.linha,
  altura = 10,
  raio = 999,
  style,
}: {
  razao: number;
  em?: number;
  dur?: number;
  cor?: string;
  fundo?: string;
  altura?: number;
  raio?: number;
  style?: CSSProperties;
}) {
  const frame = useFrame();
  const t = progresso(frame, em, dur, easeOutQuint);
  return (
    <div
      style={{
        height: altura,
        borderRadius: raio,
        background: fundo,
        overflow: "hidden",
        width: "100%",
        ...style,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${clamp(razao * t, 0, 1) * 100}%`,
          background: preenchimento,
          borderRadius: raio,
        }}
      />
    </div>
  );
}

/** Respiração muito leve — 2% de escala num ciclo de 4 s. Só para o núcleo. */
export function Respirar({ children, amplitude = 0.012, ciclo = 120 }: { children: ReactNode; amplitude?: number; ciclo?: number }) {
  const frame = useFrame();
  const escala = useDeslocamento();
  const s = 1 + Math.sin((frame / ciclo) * Math.PI * 2) * amplitude * escala;
  return <div style={{ transform: `scale(${s})`, transformOrigin: "center" }}>{children}</div>;
}
