import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { PALCO } from "@/design-system/tokens";

/**
 * A escala do palco.
 *
 * Toda cena é desenhada em 1920×1080 absolutos. Aqui se mede o espaço
 * disponível e se calcula o fator de `transform: scale()` que faz esses 1920
 * caberem — o que resolve responsividade sem uma única media query dentro do
 * filme, e garante que a proporção da tipografia no tour seja idêntica à do MP4.
 *
 * `ResizeObserver` em vez do evento `resize` da janela porque o palco também
 * muda quando o painel de capítulos aparece ou o modo explorar abre.
 */
export function useEscalaDoPalco(alvo: RefObject<HTMLElement | null>) {
  const [escala, setEscala] = useState(0.5);
  const [caixa, setCaixa] = useState({ largura: 960, altura: 540 });

  useEffect(() => {
    const elemento = alvo.current;
    if (elemento === null) return;

    const medir = () => {
      const { width, height } = elemento.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const fator = Math.min(width / PALCO.largura, height / PALCO.altura);
      setEscala(fator);
      setCaixa({ largura: PALCO.largura * fator, altura: PALCO.altura * fator });
    };

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [alvo]);

  return { escala, caixa };
}

/**
 * `prefers-reduced-motion` do sistema.
 *
 * Lido uma vez e observado: quem muda a preferência com a peça aberta vê o
 * efeito na hora, sem recarregar.
 */
export function useMovimentoReduzido(): boolean {
  const [reduzido, setReduzido] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia === undefined) return;
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduzido(consulta.matches);
    const aoMudar = (e: MediaQueryListEvent) => setReduzido(e.matches);
    consulta.addEventListener("change", aoMudar);
    return () => consulta.removeEventListener("change", aoMudar);
  }, []);

  return reduzido;
}

/** Tela cheia sobre um elemento. */
export function useTelaCheia(alvo: RefObject<HTMLElement | null>) {
  const [cheia, setCheia] = useState(false);

  useEffect(() => {
    const aoMudar = () => setCheia(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  const alternar = useCallback(() => {
    const elemento = alvo.current;
    if (elemento === null) return;
    if (document.fullscreenElement === null) {
      void elemento.requestFullscreen?.().catch(() => {
        // Alguns navegadores recusam sem gesto direto do usuário. Silenciar é
        // correto aqui: o botão simplesmente não faz nada, e nada quebra.
      });
    } else {
      void document.exitFullscreen?.();
    }
  }, [alvo]);

  return { cheia, alternar };
}

/**
 * Atalhos de teclado (item 49).
 *
 * Ignora eventos vindos de campo de texto — não há nenhum na peça hoje, mas o
 * dia em que houver, espaço deixaria de escrever espaço e viraria play.
 */
export function useTeclado(acoes: {
  alternar: () => void;
  avancar: (frames: number) => void;
  telaCheia: () => void;
  mudo: () => void;
  reiniciar: () => void;
  explorar: () => void;
  fechar: () => void;
}) {
  const ref = useRef(acoes);
  ref.current = acoes;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (
        alvo !== null &&
        (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          ref.current.alternar();
          break;
        case "ArrowRight":
          e.preventDefault();
          ref.current.avancar(e.shiftKey ? 300 : 90);
          break;
        case "ArrowLeft":
          e.preventDefault();
          ref.current.avancar(e.shiftKey ? -300 : -90);
          break;
        case "f":
        case "F":
          ref.current.telaCheia();
          break;
        case "m":
        case "M":
          ref.current.mudo();
          break;
        case "r":
        case "R":
          ref.current.reiniciar();
          break;
        case "e":
        case "E":
          ref.current.explorar();
          break;
        case "Escape":
          ref.current.fechar();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);
}
