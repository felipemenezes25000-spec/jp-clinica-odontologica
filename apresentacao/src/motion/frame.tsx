import { createContext, useContext, useMemo, type ReactNode } from "react";
import { FPS } from "@/design-system/tokens";

/**
 * O relógio único do filme.
 *
 * Quem entrega o frame muda conforme o destino — o player da web usa
 * `requestAnimationFrame`, o Remotion usa `useCurrentFrame()` —, mas as cenas
 * nunca sabem disso. Elas pedem `useFrame()` e recebem um número.
 *
 * `useCena()` devolve o frame RELATIVO à cena atual. Sem isso, cada cena teria
 * que subtrair o próprio `startFrame` na mão em toda animação, e mover uma cena
 * na linha do tempo obrigaria a reescrever todos os números dela.
 */

type Relogio = {
  /** Frame global, contado desde o início do filme. */
  frame: number;
  fps: number;
  duracaoTotal: number;
};

const RelogioContexto = createContext<Relogio | null>(null);

export function ProvedorDeFrame({
  frame,
  duracaoTotal,
  fps = FPS,
  children,
}: {
  frame: number;
  duracaoTotal: number;
  fps?: number;
  children: ReactNode;
}) {
  const valor = useMemo(() => ({ frame, fps, duracaoTotal }), [frame, fps, duracaoTotal]);
  return <RelogioContexto.Provider value={valor}>{children}</RelogioContexto.Provider>;
}

export function useRelogio(): Relogio {
  const ctx = useContext(RelogioContexto);
  if (ctx === null) {
    throw new Error("useRelogio() precisa estar dentro de <ProvedorDeFrame>.");
  }
  return ctx;
}

/* -------------------------------------------------------------------------- */
/* Frame local da cena                                                        */
/* -------------------------------------------------------------------------- */

type Cena = {
  /** Frame contado a partir do primeiro frame desta cena. Pode ser negativo
   *  durante o pré-roll da transição, e é por isso que ele não é travado em 0:
   *  a cena que entra já começa a desenhar enquanto a anterior sai. */
  frame: number;
  duracao: number;
  /** 0..1 — quanto da cena já passou. Útil para saídas. */
  progresso: number;
  /** Opacidade que a transição impõe. A cena pode ler para reforçar o efeito. */
  transicao: number;
};

const CenaContexto = createContext<Cena | null>(null);

export function ProvedorDeCena({
  frameLocal,
  duracao,
  transicao,
  children,
}: {
  frameLocal: number;
  duracao: number;
  transicao: number;
  children: ReactNode;
}) {
  const valor = useMemo(
    () => ({
      frame: frameLocal,
      duracao,
      progresso: duracao > 0 ? Math.max(0, Math.min(1, frameLocal / duracao)) : 0,
      transicao,
    }),
    [frameLocal, duracao, transicao],
  );
  return <CenaContexto.Provider value={valor}>{children}</CenaContexto.Provider>;
}

export function useCena(): Cena {
  const ctx = useContext(CenaContexto);
  if (ctx === null) {
    throw new Error("useCena() só funciona dentro de uma cena da linha do tempo.");
  }
  return ctx;
}

/** Atalho: o frame local da cena. É o que 90% dos componentes precisam. */
export function useFrame(): number {
  return useCena().frame;
}

/* -------------------------------------------------------------------------- */
/* Movimento reduzido                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `prefers-reduced-motion` não pode simplesmente congelar o filme: a informação
 * está no movimento. O que ele faz aqui é encurtar deslocamentos e desligar
 * paralaxe e partículas — o conteúdo continua aparecendo, só que sem viagem.
 *
 * O contexto existe (em vez de ler a media query direto) porque o render do
 * Remotion nunca deve herdar a preferência da máquina de quem renderiza.
 */
const MovimentoContexto = createContext<boolean>(false);

export function ProvedorDeMovimento({
  reduzido,
  children,
}: {
  reduzido: boolean;
  children: ReactNode;
}) {
  return <MovimentoContexto.Provider value={reduzido}>{children}</MovimentoContexto.Provider>;
}

export function useMovimentoReduzido(): boolean {
  return useContext(MovimentoContexto);
}

/** Multiplicador de deslocamento: 0 quando o movimento está reduzido. */
export function useDeslocamento(): number {
  return useMovimentoReduzido() ? 0 : 1;
}
