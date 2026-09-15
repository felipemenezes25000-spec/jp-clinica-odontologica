import { HelpCircle } from "lucide-react";
import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { RECEPCAO } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 36 — O que o atendimento deixou de fazer.
 *
 * A cena mais arriscada de mostrar para uma equipe, e o desenho existe para
 * desarmar isso: NENHUM NÚMERO TEM NOME AO LADO, e cada linha termina numa
 * pergunta em vez de um diagnóstico.
 *
 * O motivo é prático, não diplomático: ranking de atendente em clínica pequena
 * produz uma coisa só — a pessoa para de registrar o que correu mal. A partir
 * daí o painel fica bonito e cego, e a clínica perde a única fonte que tinha.
 */

const ITENS = { x: 200, y: 316, largura: 1520, altura: 124, espaco: 14 };

export function Cena36Recepcao() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="O dia da equipe"
        titulo={RECEPCAO.titulo}
        subtitulo={RECEPCAO.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {ITENS && RECEPCAO.itens.map((item, i) => {
        const t = progresso(frame, 18 + i * 16, 26, easeOutQuint);
        return (
          <Em
            key={item.rotulo}
            x={ITENS.x}
            y={ITENS.y + i * (ITENS.altura + ITENS.espaco)}
            largura={ITENS.largura}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 14}px, 0)`,
                minHeight: ITENS.altura,
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.enorme,
                padding: "24px 30px",
                display: "flex",
                alignItems: "center",
                gap: 28,
                boxShadow: "0 14px 36px -30px rgba(3,47,1,0.42)",
              }}
            >
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: 56,
                  fontWeight: 800,
                  color: cor.alerta,
                  letterSpacing: "-0.04em",
                  width: 96,
                  textAlign: "center",
                  flex: "none",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <Contador ate={item.valor} em={24 + i * 16} dur={34} />
              </span>

              <span style={{ width: 1, height: 62, background: cor.linha, flex: "none" }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.destaque,
                    fontWeight: 700,
                    color: cor.tinta,
                    letterSpacing: "-0.018em",
                  }}
                >
                  {item.rotulo}
                </div>
                {/* A pergunta, e não a conclusão. Quem responde é a equipe. */}
                <div
                  style={{
                    opacity: progresso(frame, 40 + i * 16, 22),
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    marginTop: 10,
                  }}
                >
                  <HelpCircle size={16} strokeWidth={2.3} color={cor.verdeEscuro} />
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.apoio,
                      color: cor.verdeEscuro,
                      fontWeight: 600,
                    }}
                  >
                    {item.pergunta}
                  </span>
                </div>
              </div>
            </div>
          </Em>
        );
      })}

      <NotaDeCena em={112} x={ITENS.x} largura={1300}>
        {RECEPCAO.nota}
      </NotaDeCena>
    </Palco>
  );
}
