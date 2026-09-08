import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { PAINEL_AUTOMACOES } from "@/data/conteudo";
import { AUTOMACOES, BASE, ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Metrica, Palco, Ponto } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 10 — O painel de automações.
 *
 * Seis jornadas, todas ativas, cada uma com o evento que a dispara escrito em
 * baixo. O evento aparece porque é ele que torna a promessa verificável: quem
 * conhece a operação consegue conferir se a lista faz sentido.
 *
 * Os três números do rodapé são o pulso do dia — e vêm com o carimbo de exemplo
 * ilustrativo, porque não saíram do banco da clínica.
 */

const GRADE_X = 170;
const GRADE_Y = 292;
const CARTAO_LARGURA = 372;
const CARTAO_ALTURA = 166;
const ESPACO = 30;
const COLUNAS = 4;

export function Cena10Automacoes() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena kicker="O que roda sozinho" titulo={PAINEL_AUTOMACOES.titulo} em={2} />

      {AUTOMACOES.map((automacao, i) => {
        const coluna = i % COLUNAS;
        const linha = Math.floor(i / COLUNAS);
        const t = progresso(frame, 24 + i * 9, 24, easeOutQuint);

        return (
          <Em
            key={automacao.nome}
            x={GRADE_X + coluna * (CARTAO_LARGURA + ESPACO)}
            y={GRADE_Y + linha * (CARTAO_ALTURA + 26)}
            largura={CARTAO_LARGURA}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 18}px, 0)`,
                height: CARTAO_ALTURA,
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.grande,
                padding: "22px 26px",
                boxShadow: "0 16px 40px -32px rgba(3,47,1,0.5)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonte.display,
                      fontSize: tamanho.corpo,
                      fontWeight: 700,
                      color: cor.tinta,
                      letterSpacing: "-0.015em",
                    }}
                  >
                    {automacao.nome}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 13px",
                      borderRadius: 999,
                      background: cor.menta,
                      flex: "none",
                    }}
                  >
                    <Ponto tamanho={7} />
                    <span
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.micro,
                        fontWeight: 700,
                        color: cor.verdeEscuro,
                        letterSpacing: "0.1em",
                      }}
                    >
                      ATIVA
                    </span>
                  </span>
                </div>

                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaSuave,
                    marginTop: 10,
                  }}
                >
                  Dispara {automacao.quando}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontSize: 34,
                    fontWeight: 800,
                    color: cor.verdeEscuro,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.03em",
                  }}
                >
                  <Contador ate={automacao.emJornada} em={44 + i * 9} dur={40} />
                </span>
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaSuave,
                  }}
                >
pessoas nesta fila
                </span>
              </div>
            </div>
          </Em>
        );
      })}

      {/* O pulso do dia -------------------------------------------------- */}
      {(
        [
          { rotulo: "Sendo cuidados agora", valor: BASE.emJornada, detalhe: "nas seis rotinas" },
          { rotulo: "Responderam hoje", valor: BASE.responderamHoje, detalhe: "e já foram lidos" },
          { rotulo: "Marcaram hoje", valor: BASE.agendaramHoje, detalhe: "consulta na agenda" },
        ] as const
      ).map((metrica, i) => {
        const t = progresso(frame, 128 + i * 12, 26, easeOutQuint);
        return (
          <Em
            key={metrica.rotulo}
            x={GRADE_X + i * (536 + 36)}
            y={GRADE_Y + 2 * (CARTAO_ALTURA + 26) + 14}
            largura={536}
            zIndex={8}
          >
            <div style={{ opacity: t, transform: `translate3d(0, ${(1 - t) * 16}px, 0)` }}>
              <Metrica
                rotulo={metrica.rotulo}
                valor={<Contador ate={metrica.valor} em={140 + i * 12} dur={44} />}
                detalhe={metrica.detalhe}
              />
            </div>
          </Em>
        );
      })}

      {ILUSTRATIVO && (
        <Em x={GRADE_X} y={866} zIndex={9}>
          <div style={{ opacity: progresso(frame, 176, 24), display: "flex", gap: 16, alignItems: "center" }}>
            <Ilustrativo />
            <span
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.micro,
                color: cor.tintaFraca,
              }}
            >
              · {PAINEL_AUTOMACOES.legendaModo}
            </span>
          </div>
        </Em>
      )}
    </Palco>
  );
}
