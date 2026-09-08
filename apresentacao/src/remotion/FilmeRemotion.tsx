import { useEffect, useState } from "react";
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import { TRILHA, VOLUME_TRILHA } from "@/data/audio";
import { Filme } from "@/film/Filme";

/**
 * A ponte entre o Remotion e o filme.
 *
 * Tudo que este componente faz é pegar `useCurrentFrame()` e entregar para o
 * `<Filme>`. É por isso que o MP4 e o tour são a mesma peça: a única coisa que
 * muda entre os dois é quem conta o tempo.
 *
 * `movimentoReduzido` fica em `false` fixo: a preferência da máquina que
 * renderiza não pode vazar para o arquivo entregue.
 */
export function FilmeRemotion() {
  const frame = useCurrentFrame();
  useEsperarFontes();

  return (
    <AbsoluteFill style={{ background: "#F7F8F2" }}>
      <Filme frame={frame} movimentoReduzido={false} />
      {TRILHA !== null && <Audio src={staticFile(TRILHA)} volume={VOLUME_TRILHA} />}
    </AbsoluteFill>
  );
}

/**
 * Segura o render até as webfonts estarem prontas.
 *
 * Sem isto, os primeiros frames sairiam com fonte de sistema — a quebra de linha
 * muda, e o vídeo teria um "salto" tipográfico no começo. `delayRender` é a
 * forma que o Remotion oferece de dizer "ainda não".
 */
export function useEsperarFontes(): boolean {
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const alca = delayRender("Carregando Manrope e Inter");
    let vivo = true;

    const liberar = () => {
      if (!vivo) return;
      setPronto(true);
      continueRender(alca);
    };

    if (typeof document !== "undefined" && document.fonts !== undefined) {
      void document.fonts.ready.then(liberar).catch(liberar);
    } else {
      liberar();
    }

    return () => {
      vivo = false;
    };
  }, []);

  return pronto;
}
