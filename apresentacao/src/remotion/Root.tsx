import { Composition, staticFile } from "remotion";
import { DURACAO_TOTAL } from "@/data/linhaDoTempo";
import { FPS, PALCO, PALCO_VERTICAL } from "@/design-system/tokens";
import { definirResolvedorDeAsset } from "@/utils/asset";
import { FilmeRemotion } from "./FilmeRemotion";
import { FilmeVertical } from "./FilmeVertical";
import { Capa } from "./Capa";
import "../styles.css";

/**
 * A raiz do Remotion.
 *
 * Três composições, um filme só. `JPCRCMain` é a entrega principal;
 * `JPCRCVertical` reenquadra o MESMO filme para 9:16 (ver `FilmeVertical`); e
 * `JPCRCThumbnail` é um still para capa.
 *
 * A primeira linha executada aqui é o registro do resolvedor de assets: dentro
 * do Remotion, `public/` é servido por `staticFile()`, e não pela raiz do
 * servidor. Registrar aqui — e não dentro dos componentes — mantém o Remotion
 * fora do bundle da web.
 */
definirResolvedorDeAsset((caminho) => staticFile(caminho));

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="JPCRCMain"
        component={FilmeRemotion}
        durationInFrames={DURACAO_TOTAL}
        fps={FPS}
        width={PALCO.largura}
        height={PALCO.altura}
      />

      <Composition
        id="JPCRCVertical"
        component={FilmeVertical}
        durationInFrames={DURACAO_TOTAL}
        fps={FPS}
        width={PALCO_VERTICAL.largura}
        height={PALCO_VERTICAL.altura}
      />

      <Composition
        id="JPCRCThumbnail"
        component={Capa}
        durationInFrames={1}
        fps={FPS}
        width={PALCO.largura}
        height={PALCO.altura}
      />
    </>
  );
}
