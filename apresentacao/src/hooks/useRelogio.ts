import { useCallback, useEffect, useRef, useState } from "react";
import { FPS } from "@/design-system/tokens";
import { DURACAO_TOTAL } from "@/data/linhaDoTempo";

/**
 * O relógio do visualizador web.
 *
 * Ele avança pelo TEMPO REAL decorrido (`performance.now()`), e não somando um
 * frame por quadro do navegador. Numa tela de 120 Hz o segundo caminho faria o
 * filme rodar em dobro; numa aba em segundo plano, pararia e depois pularia.
 * Com relógio de parede, 4 minutos de vídeo levam 4 minutos em qualquer tela.
 *
 * O `frame` que sai daqui é o mesmo número que o Remotion passa para o filme —
 * é essa igualdade que faz o tour e o MP4 serem a mesma peça.
 */

export type Relogio = {
  frame: number;
  tocando: boolean;
  tocar: () => void;
  pausar: () => void;
  alternar: () => void;
  irPara: (frame: number) => void;
  avancar: (frames: number) => void;
  reiniciar: () => void;
  terminou: boolean;
};

export function useRelogio(): Relogio {
  const [frame, setFrame] = useState(0);
  const [tocando, setTocando] = useState(false);

  // Refs porque o laço de animação não pode depender de estado: recriar o
  // callback a cada frame cancelaria e reagendaria o rAF 30 vezes por segundo.
  const frameRef = useRef(0);
  const ultimoTempo = useRef<number | null>(null);
  const pedido = useRef<number | null>(null);

  const escrever = useCallback((valor: number) => {
    const limitado = Math.max(0, Math.min(DURACAO_TOTAL - 1, valor));
    frameRef.current = limitado;
    setFrame(limitado);
    return limitado;
  }, []);

  useEffect(() => {
    if (!tocando) {
      ultimoTempo.current = null;
      return;
    }

    const passo = (agora: number) => {
      if (ultimoTempo.current === null) ultimoTempo.current = agora;
      const decorrido = agora - ultimoTempo.current;
      ultimoTempo.current = agora;

      // Teto de 250 ms por quadro: se a aba ficou parada em segundo plano, o
      // filme retoma de onde estava em vez de saltar meio minuto de uma vez.
      const avanco = (Math.min(decorrido, 250) / 1000) * FPS;
      const proximo = frameRef.current + avanco;

      if (proximo >= DURACAO_TOTAL - 1) {
        escrever(DURACAO_TOTAL - 1);
        setTocando(false);
        return;
      }

      escrever(proximo);
      pedido.current = requestAnimationFrame(passo);
    };

    pedido.current = requestAnimationFrame(passo);
    return () => {
      if (pedido.current !== null) cancelAnimationFrame(pedido.current);
      pedido.current = null;
    };
  }, [tocando, escrever]);

  const tocar = useCallback(() => {
    // Dar play no fim reinicia — é o que a pessoa espera do botão.
    if (frameRef.current >= DURACAO_TOTAL - 2) escrever(0);
    setTocando(true);
  }, [escrever]);

  const pausar = useCallback(() => setTocando(false), []);

  const alternar = useCallback(() => {
    setTocando((t) => {
      if (!t && frameRef.current >= DURACAO_TOTAL - 2) escrever(0);
      return !t;
    });
  }, [escrever]);

  const irPara = useCallback(
    (valor: number) => {
      escrever(valor);
      ultimoTempo.current = null;
    },
    [escrever],
  );

  const avancar = useCallback(
    (delta: number) => {
      escrever(frameRef.current + delta);
      ultimoTempo.current = null;
    },
    [escrever],
  );

  const reiniciar = useCallback(() => {
    escrever(0);
    ultimoTempo.current = null;
    setTocando(true);
  }, [escrever]);

  return {
    frame,
    tocando,
    tocar,
    pausar,
    alternar,
    irPara,
    avancar,
    reiniciar,
    terminou: frame >= DURACAO_TOTAL - 2,
  };
}
