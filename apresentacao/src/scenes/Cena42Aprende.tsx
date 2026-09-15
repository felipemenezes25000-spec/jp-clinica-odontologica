import { Brain, Scale } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { APRENDE } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 42 — O sistema aprende, e desconfia de si mesmo.
 *
 * As duas metades são deliberadamente opostas, e é o contraste que faz a cena:
 * à esquerda o sistema guarda uma preferência a partir de uma frase solta; à
 * direita ele se RECUSA a declarar o vencedor de um teste porque a amostra é
 * pequena.
 *
 * Um sistema que só faz a primeira coisa parece esperto e erra junto com o
 * acaso. É a segunda metade que faz a primeira ser confiável — e é o tipo de
 * recusa que nenhum concorrente coloca num vídeo, porque ela é menos vistosa
 * que um "+5 pontos" em verde.
 */

const ESQ = { x: 120, y: 300, largura: 810 };
const DIR = { x: 990, y: 300, largura: 810 };

export function Cena42Aprende() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Resultados"
        titulo={APRENDE.titulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {/* A memória -------------------------------------------------------- */}
      <Em x={ESQ.x} y={ESQ.y} largura={ESQ.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 16, 28),
            transform: `translate3d(${(1 - progresso(frame, 16, 34, easeOutQuint)) * -18}px, 0, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 4, background: cor.ia }} />
          <div style={{ padding: "28px 30px 30px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 13,
                  background: cor.iaFraco,
                  color: cor.ia,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                <Brain size={20} strokeWidth={2.1} />
              </span>
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.destaque,
                  fontWeight: 800,
                  color: cor.tinta,
                  letterSpacing: "-0.022em",
                }}
              >
                {APRENDE.memoria.titulo}
              </span>
            </div>

            <div
              style={{
                opacity: progresso(frame, 40, 24),
                fontFamily: fonte.texto,
                fontSize: tamanho.corpo,
                color: cor.tintaSuave,
                lineHeight: 1.5,
                fontStyle: "italic",
              }}
            >
              {APRENDE.memoria.frase}
            </div>

            <div
              style={{
                opacity: progresso(frame, 62, 24),
                marginTop: 20,
                background: cor.iaFraco,
                border: `1px solid ${cor.ia}2e`,
                borderRadius: raio.grande,
                padding: "18px 22px",
                fontFamily: fonte.display,
                fontSize: tamanho.destaque,
                fontWeight: 800,
                color: cor.ia,
                letterSpacing: "-0.022em",
              }}
            >
              {APRENDE.memoria.virou}
            </div>

            <div
              style={{
                opacity: progresso(frame, 84, 24),
                fontFamily: fonte.texto,
                fontSize: tamanho.legenda,
                color: cor.tintaSuave,
                marginTop: 18,
                lineHeight: 1.5,
              }}
            >
              {APRENDE.memoria.detalhe}
            </div>
          </div>
        </div>
      </Em>

      {/* O teste que se recusa a concluir -------------------------------- */}
      <Em x={DIR.x} y={DIR.y} largura={DIR.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 110, 28),
            transform: `translate3d(${(1 - progresso(frame, 110, 34, easeOutQuint)) * 18}px, 0, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 4, background: cor.verdeEscuro }} />
          <div style={{ padding: "28px 30px 30px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 13,
                  background: cor.menta,
                  color: cor.verdeEscuro,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                <Scale size={20} strokeWidth={2.1} />
              </span>
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.destaque,
                  fontWeight: 800,
                  color: cor.tinta,
                  letterSpacing: "-0.022em",
                }}
              >
                {APRENDE.teste.titulo}
              </span>
            </div>

            {APRENDE.teste.variantes.map((v, i) => (
              <div
                key={v.nome}
                style={{
                  opacity: progresso(frame, 128 + i * 12, 22),
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "16px 0",
                  borderBottom: `1px solid ${cor.linha}`,
                }}
              >
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    color: cor.tinta,
                    fontWeight: 600,
                    flex: 1,
                  }}
                >
                  {v.nome}
                </span>
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaFraca,
                    flex: "none",
                  }}
                >
                  {v.envios} envios
                </span>
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.destaque,
                    fontWeight: 800,
                    color: cor.tintaSuave,
                    width: 86,
                    textAlign: "right",
                    flex: "none",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {v.taxa}
                </span>
              </div>
            ))}

            {/* O veredicto que não é veredicto. É o ponto da cena. */}
            <div
              style={{
                opacity: progresso(frame, 158, 26),
                marginTop: 22,
                background: cor.alertaFraco,
                border: `1px solid #F3DFC0`,
                borderRadius: raio.grande,
                padding: "20px 24px",
                fontFamily: fonte.display,
                fontSize: tamanho.corpo,
                fontWeight: 700,
                color: cor.alerta,
                lineHeight: 1.35,
              }}
            >
              {APRENDE.teste.veredicto}
            </div>
          </div>
        </div>
      </Em>

      <Raciocinio em={196}>{APRENDE.raciocinio}</Raciocinio>
    </Palco>
  );
}
