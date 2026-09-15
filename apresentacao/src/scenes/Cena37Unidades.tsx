import { Building2, Eye } from "lucide-react";
import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { UNIDADES } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 37 — Mais de uma unidade.
 *
 * Cena curta de propósito: é uma capacidade estrutural, não uma história. O que
 * o espectador precisa levar é que o sistema não mistura as unidades e que cada
 * pessoa vê só onde trabalha — e isso cabe em duas caixas e uma frase.
 */

const CARTAO = { y: 320, largura: 700 };
const CARTAO_X = [260, 1010];

export function Cena37Unidades() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="O dia da equipe"
        titulo={UNIDADES.titulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {UNIDADES.unidades.map((u, i) => {
        const t = progresso(frame, 16 + i * 16, 28, easeOutQuint);
        return (
          <Em key={u.nome} x={CARTAO_X[i]!} y={CARTAO.y} largura={CARTAO.largura} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 18}px, 0)`,
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.enorme,
                boxShadow: sombra.media,
                overflow: "hidden",
              }}
            >
              <div style={{ height: 4, background: i === 0 ? cor.verdeEscuro : cor.verde }} />
              <div style={{ padding: "30px 34px 32px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      background: cor.menta,
                      color: cor.verdeEscuro,
                      display: "grid",
                      placeItems: "center",
                      flex: "none",
                    }}
                  >
                    <Building2 size={21} strokeWidth={2.1} />
                  </span>
                  <span
                    style={{
                      fontFamily: fonte.display,
                      fontSize: tamanho.cabecalho,
                      fontWeight: 800,
                      color: cor.tinta,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {u.nome}
                  </span>
                </div>

                <div style={{ display: "flex", gap: 40, marginTop: 28 }}>
                  <div>
                    <div
                      style={{
                        fontFamily: fonte.display,
                        fontSize: 44,
                        fontWeight: 800,
                        color: cor.verdeEscuro,
                        letterSpacing: "-0.04em",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {u.pacientes}
                    </div>
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.legenda,
                        color: cor.tintaSuave,
                        marginTop: 6,
                      }}
                    >
                      pacientes
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: fonte.display,
                        fontSize: 44,
                        fontWeight: 800,
                        color: cor.verdeEscuro,
                        letterSpacing: "-0.04em",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {u.equipe}
                    </div>
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.legenda,
                        color: cor.tintaSuave,
                        marginTop: 6,
                      }}
                    >
                      na equipe
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Em>
        );
      })}

      {/* O escopo por pessoa --------------------------------------------- */}
      <Em x={260} y={604} largura={1450} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 74, 28),
            transform: `translate3d(0, ${(1 - progresso(frame, 74, 34, easeOutQuint)) * 14}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            padding: "26px 32px",
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              background: "#0B4A05",
              color: cor.verde,
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <Eye size={20} strokeWidth={2.1} />
          </span>
          <span
            style={{
              fontFamily: fonte.display,
              fontSize: tamanho.destaque,
              fontWeight: 700,
              color: cor.branco,
              letterSpacing: "-0.022em",
            }}
          >
            {UNIDADES.escopo}
          </span>
        </div>
      </Em>

      <NotaDeCena em={110} x={260} largura={1300}>
        {UNIDADES.raciocinio}
      </NotaDeCena>
    </Palco>
  );
}
