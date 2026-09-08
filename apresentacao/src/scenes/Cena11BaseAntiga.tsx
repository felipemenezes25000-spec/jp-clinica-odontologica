import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { NuvemDePacientes } from "@/components/Graficos";
import { BASE_ANTIGA } from "@/data/conteudo";
import { BASE, ILUSTRATIVO, SEGMENTOS_BASE } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 11 — A base antiga.
 *
 * A cena mais importante do meio do filme, e a que mais se apoia numa única
 * imagem: milhares de pontos parados que, de repente, se organizam.
 *
 * Duas decisões que a sustentam:
 *
 * - **640 pontos, não 4.281.** Quatro mil pontos numa tela de 1080p viram
 *   textura cinza — o olho perde o indivíduo, que é justamente o que a cena
 *   precisa preservar. O número real está escrito por extenso ao lado.
 * - **A cor só chega junto com o agrupamento.** Enquanto estão dispersos, todos
 *   os pontos são iguais; é o sistema que os torna distinguíveis, e a cor
 *   aparecendo é essa afirmação.
 */

const NUVEM = { x: 170, y: 356, largura: 1580, altura: 380 };
const AGRUPA_EM = 118;

export function Cena11BaseAntiga() {
  const frame = useFrame();
  const larguraColuna = NUVEM.largura / SEGMENTOS_BASE.length;

  return (
    <Palco>
      <SeloDeCena numero={11} />
      <TituloDeCena
        kicker="Base histórica"
        titulo={BASE_ANTIGA.titulo}
        subtitulo={BASE_ANTIGA.subtitulo}
        em={2}
        largura={880}
        nivel={2}
      />

      {/* O número --------------------------------------------------------- */}
      <Em x={1290} y={112} largura={460} zIndex={12}>
        <div
          style={{
            textAlign: "right",
            opacity: progresso(frame, 26, 26),
          }}
        >
          <div
            style={{
              fontFamily: fonte.display,
              fontSize: 116,
              fontWeight: 800,
              color: cor.verdeEscuro,
              letterSpacing: "-0.045em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Contador ate={BASE.antigosElegiveis} em={30} dur={58} />
          </div>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.corpo,
              color: cor.tintaSuave,
              marginTop: 12,
            }}
          >
            {BASE_ANTIGA.rotuloTotal}
          </div>
        </div>
      </Em>

      {/* A nuvem ---------------------------------------------------------- */}
      <Em x={NUVEM.x} y={NUVEM.y} zIndex={8}>
        <NuvemDePacientes
          quantidade={BASE.pontosNaTela}
          largura={NUVEM.largura}
          altura={NUVEM.altura}
          em={14}
          agruparEm={AGRUPA_EM}
          grupos={SEGMENTOS_BASE}
        />
      </Em>

      {/* Os rótulos dos grupos, que só existem depois da organização ------ */}
      {SEGMENTOS_BASE.map((segmento, i) => {
        const t = progresso(frame, AGRUPA_EM + 34 + i * 7, 22, easeOutQuint);
        return (
          <Em
            key={segmento.rotulo}
            x={NUVEM.x + i * larguraColuna}
            y={NUVEM.y + NUVEM.altura + 22}
            largura={larguraColuna - 14}
            zIndex={9}
          >
            <div style={{ opacity: t, transform: `translate3d(0, ${(1 - t) * 10}px, 0)` }}>
              <div
                style={{
                  height: 3,
                  width: 44,
                  background: segmento.cor,
                  borderRadius: 999,
                  marginBottom: 12,
                }}
              />
              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tinta,
                  fontWeight: 600,
                  lineHeight: 1.3,
                }}
              >
                {segmento.rotulo}
              </div>
              <div
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.destaque,
                  fontWeight: 800,
                  color: cor.tintaSuave,
                  marginTop: 6,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}
              >
                <Contador ate={segmento.quantidade} em={AGRUPA_EM + 36 + i * 7} dur={34} />
              </div>
            </div>
          </Em>
        );
      })}

      {/* O fecho ---------------------------------------------------------- */}
      <Em x={170} y={922} largura={1580} zIndex={12}>
        <div
          style={{
            opacity: progresso(frame, 208, 26),
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `1px solid ${cor.borda}`,
            paddingTop: 20,
          }}
        >
          <div
            style={{
              fontFamily: fonte.display,
              fontSize: tamanho.cabecalho,
              fontWeight: 700,
              color: cor.tinta,
              letterSpacing: "-0.02em",
            }}
          >
            <span style={{ color: cor.verdeEscuro }}>
              <Contador ate={BASE.antigosElegiveis} em={212} dur={40} />
            </span>{" "}
            {BASE_ANTIGA.rotuloElegiveis}
          </div>
          {ILUSTRATIVO && <Ilustrativo />}
        </div>
      </Em>
    </Palco>
  );
}
