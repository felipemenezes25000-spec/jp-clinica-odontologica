import { SeloDeCena } from "@/components/CenaBase";
import { MapaEcossistema } from "@/components/MapaEcossistema";
import { ECOSSISTEMA } from "@/data/conteudo";
import { Em, Kicker, Palco } from "@/design-system/primitivas";
import { cor, fonte, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Camera, Entrar } from "@/motion/primitivas";
import { progresso } from "@/motion/timing";

/**
 * CENA 26 — O ecossistema completo.
 *
 * A câmera se afasta. Literalmente: o palco entra em 1,14 e volta para 1 ao
 * longo de dois segundos, então o mapa parece revelado por afastamento, e não
 * montado peça a peça.
 *
 * Aqui a peça paga a dívida das cenas anteriores — tudo que foi visto de perto
 * aparece junto, na mesma escala, e o espectador confere que era um sistema só.
 */
export function Cena26Ecossistema() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena numero={26} />

      <Em x={960} y={110} ancora="topo-centro" largura={1200} zIndex={20}>
        <div style={{ textAlign: "center" }}>
          <Entrar em={4} dur={22} de="baixo" distancia={12}>
            <Kicker style={{ marginBottom: 14 }}>Visão geral</Kicker>
          </Entrar>
          <Entrar em={10} dur={28} de="baixo" distancia={16}>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: tamanho.subtitulo,
                fontWeight: 800,
                color: cor.tinta,
                letterSpacing: "-0.03em",
              }}
            >
              {ECOSSISTEMA.titulo}
            </div>
          </Entrar>
        </div>
      </Em>

      <Camera
        chaves={[
          { frame: 0, posicao: { x: 0, y: 40, escala: 1.14 } },
          { frame: 76, posicao: { x: 0, y: 0, escala: 1 } },
        ]}
      >
        <MapaEcossistema em={16} passo={11} />
      </Camera>

      {/* A leitura do caminho, escrita, para quem prefere a frase ao desenho. */}
      <Em x={960} y={880} ancora="topo-centro" largura={1700} zIndex={20}>
        <div
          style={{
            opacity: progresso(frame, 168, 30),
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 14,
            fontFamily: fonte.texto,
            fontSize: tamanho.apoio,
            color: cor.tintaSuave,
          }}
        >
          {ECOSSISTEMA.cadeia.map((etapa, i) => (
            <span key={etapa} style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontWeight: i === 2 ? 700 : 500, color: i === 2 ? cor.verdeEscuro : cor.tintaSuave }}>
                {etapa}
              </span>
              {i < ECOSSISTEMA.cadeia.length - 1 && (
                <span style={{ color: cor.bordaForte }}>→</span>
              )}
            </span>
          ))}
        </div>
      </Em>
    </Palco>
  );
}
