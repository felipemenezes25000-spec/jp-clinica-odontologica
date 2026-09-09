import { Check, FileText } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { Marca } from "@/components/Marca";
import { ORCAMENTOS } from "@/data/conteudo";
import { ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 12 — Os orçamentos parados.
 *
 * A fila mais cara do sistema, e a única em que a clínica já pagou o custo: a
 * avaliação aconteceu, a dentista montou o plano, o orçamento foi apresentado —
 * e a conversa parou ali. Não é prospecção, é retomada.
 *
 * A composição coloca o VALOR TOTAL em cima, sozinho, porque é o número que
 * faz o dono da clínica endireitar na cadeira. Os três cartões abaixo existem
 * para o total deixar de ser abstrato: são pessoas com nome, tratamento e o
 * tempo que estão esperando.
 *
 * A coluna da direita é a resposta à pergunta que vem logo depois — "e o que
 * eu faço com isso?".
 */

const PILHA = { x: 120, y: 526, largura: 900, altura: 88, espaco: 10 };
const COLUNA = { x: 1100, largura: 700 };

export function Cena12Orcamentos() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Orçamento parado"
        titulo={ORCAMENTOS.titulo}
        subtitulo={ORCAMENTOS.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1000}
      />

      {/* O total — o número que muda a conversa -------------------------- */}
      <Em x={PILHA.x} y={336} largura={900} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 24, 28),
            transform: `translate3d(0, ${(1 - progresso(frame, 24, 34, easeOutQuint)) * 16}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            padding: "26px 32px",
            display: "flex",
            alignItems: "center",
            gap: 26,
          }}
        >
          <span
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "#0B4A05",
              color: cor.verde,
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <FileText size={24} strokeWidth={2.1} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: 52,
                fontWeight: 800,
                color: cor.branco,
                letterSpacing: "-0.04em",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {ORCAMENTOS.total.valor}
            </div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.apoio,
                color: "#B8D9A4",
                marginTop: 10,
              }}
            >
              {ORCAMENTOS.total.rotulo}
            </div>
          </div>
        </div>
      </Em>

      {/* De onde vem ------------------------------------------------------ */}
      <Em x={PILHA.x} y={490} largura={900} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 48, 22),
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: fonte.texto,
            fontSize: tamanho.legenda,
            color: cor.tintaSuave,
          }}
        >
          <Marca chave="dentalOffice" altura={20} />
          {ORCAMENTOS.origem}
        </div>
      </Em>

      {/* A pilha, com nome e tempo de espera ----------------------------- */}
      {ORCAMENTOS.pilha.map((item, i) => {
        const t = progresso(frame, 62 + i * 13, 24, easeOutQuint);
        return (
          <Em
            key={item.paciente}
            x={PILHA.x}
            y={PILHA.y + i * (PILHA.altura + PILHA.espaco)}
            largura={PILHA.largura}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * -14}px, 0, 0)`,
                height: PILHA.altura,
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.grande,
                boxShadow: "0 12px 32px -28px rgba(3,47,1,0.45)",
                padding: "0 26px",
                display: "flex",
                alignItems: "center",
                gap: 20,
              }}
            >
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
                  {item.paciente}
                </div>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaSuave,
                    marginTop: 5,
                  }}
                >
                  {item.tratamento}
                </div>
              </div>

              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.alerta,
                  background: cor.alertaFraco,
                  borderRadius: raio.pilula,
                  padding: "7px 14px",
                  flex: "none",
                  fontWeight: 600,
                }}
              >
                parado {item.parado}
              </span>

              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.destaque,
                  fontWeight: 800,
                  color: cor.verdeEscuro,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  width: 170,
                  textAlign: "right",
                  flex: "none",
                }}
              >
                {item.valor}
              </span>
            </div>
          </Em>
        );
      })}

      {/* O que o sistema faz com a fila ----------------------------------- */}
      <Em x={COLUNA.x} y={336} largura={COLUNA.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 96, 28),
            transform: `translate3d(${(1 - progresso(frame, 96, 34, easeOutQuint)) * 20}px, 0, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 4, background: cor.verdeEscuro }} />
          <div style={{ padding: "28px 32px 30px" }}>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: tamanho.destaque,
                fontWeight: 800,
                color: cor.tinta,
                letterSpacing: "-0.022em",
                marginBottom: 20,
              }}
            >
              {ORCAMENTOS.comoTrata.titulo}
            </div>

            {ORCAMENTOS.comoTrata.itens.map((item, i) => {
              const t = progresso(frame, 108 + i * 12, 22, easeOutQuint);
              return (
                <div
                  key={item}
                  style={{
                    opacity: t,
                    transform: `translate3d(0, ${(1 - t) * 10}px, 0)`,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 15,
                    padding: "15px 0",
                    borderBottom:
                      i === ORCAMENTOS.comoTrata.itens.length - 1
                        ? "none"
                        : `1px solid ${cor.linha}`,
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      background: cor.menta,
                      color: cor.verdeEscuro,
                      display: "grid",
                      placeItems: "center",
                      flex: "none",
                      marginTop: 1,
                    }}
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.apoio,
                      color: cor.tinta,
                      lineHeight: 1.4,
                    }}
                  >
                    {item}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Em>

      {ILUSTRATIVO && (
        <Em x={COLUNA.x} y={790} zIndex={9}>
          <div style={{ opacity: progresso(frame, 182, 24) }}>
            <Ilustrativo />
          </div>
        </Em>
      )}

      <Raciocinio em={196}>{ORCAMENTOS.raciocinio}</Raciocinio>
    </Palco>
  );
}
