import { useCurrentFrame } from "remotion";
import { falaNoFrame } from "@/data/narracao";
import { cor, fonte } from "@/design-system/tokens";

/**
 * A legenda queimada no vídeo.
 *
 * POR QUE NÃO É A MESMA DA WEB
 * Na web a legenda fica fora do palco escalado, com tamanho em pixels de tela:
 * num celular o filme encolhe para 20% e uma legenda escalada junto teria 6 px
 * de altura. No MP4 não existe "tela pequena" — o quadro é sempre 1920×1080 —,
 * então aqui ela é desenhada em coordenadas de palco, e sai gravada na imagem.
 *
 * O texto e o tempo vêm da mesma fonte (`falaNoFrame`), então as duas dizem
 * sempre a mesma coisa no mesmo instante.
 *
 * A faixa ocupa de y=940 para baixo. Nenhuma cena põe conteúdo abaixo de 915 —
 * é a "área segura de legenda" que as 28 cenas respeitam.
 */
export function LegendaGravada() {
  const fala = falaNoFrame(useCurrentFrame());
  if (fala === null) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: 38,
        transform: "translateX(-50%)",
        maxWidth: 1380,
        padding: "18px 34px",
        borderRadius: 20,
        background: "rgba(3, 47, 1, 0.88)",
        color: "#F4F8F1",
        fontFamily: fonte.texto,
        fontSize: 34,
        lineHeight: 1.32,
        fontWeight: 500,
        textAlign: "center",
        letterSpacing: "-0.005em",
        boxShadow: `0 18px 50px -30px ${cor.profundo}`,
      }}
    >
      {fala.texto}
    </div>
  );
}
