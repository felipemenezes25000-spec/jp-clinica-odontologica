import { Lightbulb } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { TRATAMENTOS } from "@/data/conteudo";
import { ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 41 — A conversão de orçamento, e as objeções.
 *
 * A primeira metade é o número que dói: quase metade do que foi examinado,
 * diagnosticado e orçado nunca vira nada. A segunda é a que ninguém tem —
 * POR QUE não virou, em proporção.
 *
 * A distinção importa para o filme porque muda o tempo verbal: a lista de
 * orçamentos responde "com quem eu falo hoje"; a analítica de objeções responde
 * "o que eu mudo no mês que vem". A segunda só existe porque o sistema guarda o
 * motivo E o desfecho, e cruza os dois.
 */

const ESQ = { x: 120, y: 300, largura: 780 };
const DIR = { x: 980, y: 300, largura: 820 };

export function Cena41Tratamentos() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Resultados"
        titulo={TRATAMENTOS.titulo}
        subtitulo={TRATAMENTOS.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {/* A conversão ------------------------------------------------------ */}
      <Em x={ESQ.x} y={ESQ.y} largura={ESQ.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 16, 28),
            transform: `translate3d(0, ${(1 - progresso(frame, 16, 34, easeOutQuint)) * 16}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            boxShadow: sombra.alta,
            padding: "34px 36px",
          }}
        >
          <div
            style={{
              fontFamily: fonte.display,
              fontSize: 96,
              fontWeight: 800,
              color: cor.branco,
              letterSpacing: "-0.05em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Contador ate={TRATAMENTOS.conversao.valor} em={24} dur={44} />%
          </div>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.corpo,
              color: cor.verde,
              marginTop: 16,
              fontWeight: 600,
            }}
          >
            {TRATAMENTOS.conversao.rotulo}
          </div>
        </div>
      </Em>

      {/* As objeções, em proporção --------------------------------------- */}
      <Em x={ESQ.x} y={542} largura={ESQ.largura} zIndex={8}>
        <div style={{ opacity: progresso(frame, 58, 26) }}>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.micro,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: cor.tintaSuave,
              marginBottom: 16,
            }}
          >
            Por que não virou
          </div>

          {TRATAMENTOS.objecoes.map((obj, i) => {
            const t = progresso(frame, 70 + i * 12, 26, easeOutQuint);
            return (
              <div
                key={obj.motivo}
                style={{
                  opacity: t,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    color: cor.tinta,
                    width: 230,
                    flex: "none",
                    fontWeight: 500,
                  }}
                >
                  {obj.motivo}
                </span>
                {/* A barra é a proporção; o número está do lado para quem lê
                    com leitor de tela e para quem quer o valor exato. */}
                <span
                  style={{
                    flex: 1,
                    height: 22,
                    borderRadius: raio.pilula,
                    background: cor.linha,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      width: `${obj.parte * t}%`,
                      height: "100%",
                      borderRadius: raio.pilula,
                      background: i === 0 ? cor.verdeEscuro : cor.verde,
                    }}
                  />
                </span>
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.corpo,
                    fontWeight: 800,
                    color: cor.verdeEscuro,
                    width: 58,
                    textAlign: "right",
                    flex: "none",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {obj.parte}%
                </span>
              </div>
            );
          })}
        </div>
      </Em>

      {/* O que isso muda -------------------------------------------------- */}
      <Em x={DIR.x} y={DIR.y} largura={DIR.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 122, 28),
            transform: `translate3d(${(1 - progresso(frame, 122, 34, easeOutQuint)) * 20}px, 0, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 4, background: cor.verdeEscuro }} />
          <div style={{ padding: "28px 32px 30px" }}>
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
                <Lightbulb size={20} strokeWidth={2.1} />
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
                {TRATAMENTOS.viradaTitulo}
              </span>
            </div>

            {TRATAMENTOS.virada.map((linha, i) => (
              <div
                key={linha}
                style={{
                  opacity: progresso(frame, 138 + i * 14, 24),
                  display: "flex",
                  gap: 15,
                  padding: "16px 0",
                  borderBottom:
                    i === TRATAMENTOS.virada.length - 1 ? "none" : `1px solid ${cor.linha}`,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 999,
                    background: cor.verde,
                    flex: "none",
                    marginTop: 9,
                  }}
                />
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    color: cor.tinta,
                    lineHeight: 1.45,
                  }}
                >
                  {linha}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Em>

      {ILUSTRATIVO && (
        <Em x={DIR.x} y={648} zIndex={9}>
          <div style={{ opacity: progresso(frame, 186, 24) }}>
            <Ilustrativo />
          </div>
        </Em>
      )}

      <Raciocinio em={196}>{TRATAMENTOS.raciocinio}</Raciocinio>
    </Palco>
  );
}
