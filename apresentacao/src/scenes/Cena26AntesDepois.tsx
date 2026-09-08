import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { ANTES_DEPOIS } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOut, easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 26 — Antes e depois.
 *
 * A comparação mais direta da peça, e a que corre mais risco de soar arrogante.
 * A saída foi o tratamento visual: o lado "antes" não é ridicularizado — é só
 * apagado, como na cena 2. Aquilo funcionava; funcionava com custo.
 *
 * A régua vertical desce entre os dois lados no mesmo gesto da cena 9. Repetir
 * o movimento amarra as duas cenas sem precisar dizer que estão relacionadas.
 */

const COLUNA = { largura: 700, y: 306 };
const ESQUERDA = 200;
const DIREITA = 1020;

export function Cena26AntesDepois() {
  const frame = useFrame();
  const divisor = progresso(frame, 14, 36, easeOut);

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Antes e depois"
        titulo={ANTES_DEPOIS.titulo}
        alinhamento="centro"
        em={2}
        y={112}
        nivel={2}
      />

      <Em x={960} y={COLUNA.y - 20} zIndex={6}>
        <div
          style={{
            width: 1.5,
            height: 440 * divisor,
            background: `linear-gradient(180deg, transparent, ${cor.bordaForte} 14%, ${cor.bordaForte} 86%, transparent)`,
          }}
        />
      </Em>

      {/* Antes ----------------------------------------------------------- */}
      <Em x={ESQUERDA} y={COLUNA.y} largura={COLUNA.largura} zIndex={8}>
        <div style={{ opacity: progresso(frame, 22, 26) }}>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: cor.tintaFraca,
              marginBottom: 26,
            }}
          >
            Antes
          </div>

          {ANTES_DEPOIS.antes.map((item, i) => {
            const t = progresso(frame, 32 + i * 10, 20, easeOutQuint);
            return (
              <div
                key={item}
                style={{
                  opacity: t * 0.82,
                  transform: `translate3d(${(1 - t) * -12}px, 0, 0)`,
                  padding: "24px 28px",
                  marginBottom: 14,
                  borderRadius: raio.grande,
                  background: "#F1F3EE",
                  border: "1px solid #E3E7DE",
                  fontFamily: fonte.texto,
                  fontSize: tamanho.destaque,
                  color: "#6B776C",
                  fontWeight: 500,
                }}
              >
                {item}
              </div>
            );
          })}
        </div>
      </Em>

      {/* Depois ---------------------------------------------------------- */}
      <Em x={DIREITA} y={COLUNA.y} largura={COLUNA.largura} zIndex={8}>
        <div style={{ opacity: progresso(frame, 44, 26) }}>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: cor.verdeEscuro,
              marginBottom: 26,
            }}
          >
            Depois
          </div>

          {ANTES_DEPOIS.depois.map((item, i) => {
            const t = progresso(frame, 56 + i * 12, 22, easeOutQuint);
            return (
              <div
                key={item}
                style={{
                  opacity: t,
                  transform: `translate3d(${(1 - t) * 14}px, 0, 0)`,
                  padding: "24px 28px",
                  marginBottom: 14,
                  borderRadius: raio.grande,
                  background: cor.branco,
                  border: `1px solid ${cor.borda}`,
                  boxShadow: "0 16px 40px -32px rgba(3,47,1,0.5)",
                  fontFamily: fonte.texto,
                  fontSize: tamanho.destaque,
                  color: cor.tinta,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: cor.verde,
                    flex: "none",
                  }}
                />
                {item}
              </div>
            );
          })}
        </div>
      </Em>

      <Em x={960} y={820} ancora="topo-centro" largura={1200} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 116, 26),
            textAlign: "center",
            fontFamily: fonte.texto,
            fontSize: tamanho.corpo,
            color: cor.tintaSuave,
            lineHeight: 1.6,
          }}
        >
          A equipe não sai do processo. O que sai é a parte em que alguém precisa lembrar de
tudo sozinho.
        </div>
      </Em>
    </Palco>
  );
}
