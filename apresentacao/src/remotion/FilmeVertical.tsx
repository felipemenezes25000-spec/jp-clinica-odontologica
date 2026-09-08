import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import { Marca } from "@/components/Marca";
import { NARRACAO, TRILHA, VOLUME_NARRACAO, VOLUME_TRILHA } from "@/data/audio";
import { falaNoFrame } from "@/data/narracao";
import { cor, fonte, PALCO, PALCO_VERTICAL } from "@/design-system/tokens";
import { Filme } from "@/film/Filme";
import { useEsperarFontes } from "./FilmeRemotion";

/**
 * A versão 9:16, para Reels e Stories.
 *
 * DECISÃO EXPLÍCITA: o vertical **reenquadra** o filme; não o reescreve. As 28
 * cenas são compostas para 16:9 — recompor cada uma para 9:16 seria um segundo
 * filme, com um segundo conjunto de bugs, e as duas versões divergiriam na
 * primeira alteração de texto.
 *
 * O que o formato ganha em troca: a marca no topo, a legenda grande embaixo (que
 * no vertical é o que de fato se lê, já que o vídeo costuma rodar sem som) e uma
 * barra de progresso. O filme fica no meio, na largura inteira.
 *
 * Se um dia o vertical merecer composições próprias, o caminho é criar cenas
 * `*Vertical.tsx` e um segundo mapa em `scenes/` — a linha do tempo, o conteúdo
 * e as primitivas continuam servindo os dois.
 */

const ESCALA = PALCO_VERTICAL.largura / PALCO.largura;
const ALTURA_FILME = PALCO.altura * ESCALA;
const TOPO = (PALCO_VERTICAL.altura - ALTURA_FILME) / 2;

export function FilmeVertical() {
  const frame = useCurrentFrame();
  useEsperarFontes();
  const fala = falaNoFrame(frame);

  return (
    <AbsoluteFill style={{ background: cor.fundo }}>
      {/* Marca no topo */}
      <div
        style={{
          position: "absolute",
          top: 96,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Marca chave="jp" altura={78} />
      </div>

      {/* O filme, reenquadrado */}
      <div
        style={{
          position: "absolute",
          top: TOPO,
          left: 0,
          width: PALCO_VERTICAL.largura,
          height: ALTURA_FILME,
          overflow: "hidden",
          borderRadius: 28,
        }}
      >
        <div
          style={{
            width: PALCO.largura,
            height: PALCO.altura,
            transform: `scale(${ESCALA})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <Filme frame={frame} movimentoReduzido={false} />
        </div>
      </div>

      {/* Legenda: no vertical, ela é o áudio. */}
      {fala !== null && (
        <div
          style={{
            position: "absolute",
            left: 72,
            right: 72,
            top: TOPO + ALTURA_FILME + 96,
            textAlign: "center",
            fontFamily: fonte.display,
            fontSize: 46,
            fontWeight: 700,
            lineHeight: 1.32,
            letterSpacing: "-0.02em",
            color: cor.tinta,
          }}
        >
          {fala.texto}
        </div>
      )}

      {NARRACAO !== null && <Audio src={staticFile(NARRACAO)} volume={VOLUME_NARRACAO} />}
      {TRILHA !== null && <Audio src={staticFile(TRILHA)} volume={VOLUME_TRILHA} />}
    </AbsoluteFill>
  );
}
