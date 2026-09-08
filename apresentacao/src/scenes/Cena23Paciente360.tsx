import { Sparkles } from "lucide-react";
import { SeloDeCena } from "@/components/CenaBase";
import { Janela } from "@/components/Janela";
import { PACIENTE_360 } from "@/data/conteudo";
import { Em, Palco, Selo } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 23 — Paciente 360.
 *
 * A última tela de produto. A timeline mistura, na mesma coluna, o que veio do
 * Dental Office, o que a automação fez e o que o paciente respondeu — e essa
 * mistura É a entrega: hoje essas três coisas moram em três lugares, e ninguém
 * consegue ler a história inteira de um paciente sem juntar tudo de cabeça.
 *
 * A cor da bolinha diz a origem. É a única legenda de que a cena precisa.
 */

const ORIGEM_COR: Readonly<Record<string, string>> = {
  Paciente: cor.whatsapp,
  Automação: cor.verde,
  "Dental Office": cor.dentalOffice,
};

export function Cena23Paciente360() {
  const frame = useFrame();

  return (
    <Palco fundo="#EEF1EA">
      <SeloDeCena />

      <Em x={140} y={118} zIndex={8}>
        <Crescer em={2} dur={36} deEscala={0.968}>
          <Janela ativo="Pacientes">
            <div style={{ padding: "30px 36px", height: "100%", display: "flex", flexDirection: "column" }}>
              {/* Cabeçalho do paciente -------------------------------- */}
              <div
                style={{
                  opacity: progresso(frame, 16, 24),
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  paddingBottom: 22,
                  borderBottom: `1px solid ${cor.linha}`,
                }}
              >
                <span
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 999,
                    background: cor.menta,
                    color: cor.verdeEscuro,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: fonte.display,
                    fontWeight: 800,
                    fontSize: 26,
                    flex: "none",
                  }}
                >
                  M
                </span>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: fonte.display,
                      fontSize: 38,
                      fontWeight: 800,
                      color: cor.tinta,
                      letterSpacing: "-0.03em",
                      lineHeight: 1,
                    }}
                  >
                    Maria Souza
                  </div>
                  <div
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.legenda,
                      color: cor.tintaSuave,
                      marginTop: 8,
                    }}
                  >
                    Em tratamento · Ortodontia · última consulta 12/03 · (11) 9••••-••17
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <Selo>Faltou</Selo>
                  <Selo fundo={cor.iaFraco} cor={cor.ia}>
                    Quente
                  </Selo>
                  <Selo fundo="#F1F4EF" cor={cor.tintaSuave}>
                    Prioridade 92
                  </Selo>
                </div>
              </div>

              {/* Abas -------------------------------------------------- */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  padding: "18px 0 22px",
                }}
              >
                {PACIENTE_360.abas.map((aba, i) => {
                  const t = progresso(frame, 34 + i * 7, 18, easeOutQuint);
                  const ativa = i === 0;
                  return (
                    <span
                      key={aba}
                      style={{
                        opacity: t,
                        transform: `translate3d(0, ${(1 - t) * 8}px, 0)`,
                        padding: "10px 18px",
                        borderRadius: 999,
                        background: ativa ? cor.verdeEscuro : "#F1F4EF",
                        color: ativa ? cor.branco : cor.tintaSuave,
                        fontFamily: fonte.texto,
                        fontSize: tamanho.legenda,
                        fontWeight: ativa ? 700 : 500,
                      }}
                    >
                      {aba}
                    </span>
                  );
                })}
              </div>

              {/* Conteúdo --------------------------------------------- */}
              <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 26 }}>
                {/* Resumo da IA */}
                <div
                  style={{
                    width: 640,
                    flex: "none",
                    opacity: progresso(frame, 74, 26),
                    transform: `translate3d(0, ${(1 - progresso(frame, 74, 30, easeOutQuint)) * 14}px, 0)`,
                  }}
                >
                  <div
                    style={{
                      background: cor.iaFraco,
                      border: `1px solid ${cor.ia}2e`,
                      borderRadius: raio.grande,
                      padding: "24px 26px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 9,
                        fontFamily: fonte.texto,
                        fontSize: tamanho.micro,
                        letterSpacing: "0.11em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        color: cor.ia,
                      }}
                    >
                      <Sparkles size={14} strokeWidth={2.4} />
Resumo automático
                    </div>
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.corpo,
                        color: cor.tinta,
                        marginTop: 14,
                        lineHeight: 1.55,
                      }}
                    >
                      Faltou na consulta de ontem e respondeu hoje de manhã querendo remarcar.
                      Prefere fim de tarde. Está em tratamento de ortodontia — a interrupção
                      atrasa o plano.
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 20,
                      opacity: progresso(frame, 100, 26),
                      background: cor.branco,
                      border: `1px solid ${cor.linha}`,
                      borderRadius: raio.grande,
                      padding: "22px 26px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.micro,
                        letterSpacing: "0.11em",
                        textTransform: "uppercase",
                        fontWeight: 700,
                        color: cor.tintaFraca,
                      }}
                    >
O que está em aberto
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 14,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: fonte.display,
                          fontSize: tamanho.destaque,
                          fontWeight: 700,
                          color: cor.tinta,
                        }}
                      >
                        Recuperar a consulta perdida · em contato
                      </span>
                      <Selo>Próximo passo: mostrar horários</Selo>
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    opacity: progresso(frame, 86, 26),
                    background: cor.branco,
                    border: `1px solid ${cor.linha}`,
                    borderRadius: raio.grande,
                    padding: "22px 26px",
                  }}
                >
                  <div
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.micro,
                      letterSpacing: "0.11em",
                      textTransform: "uppercase",
                      fontWeight: 700,
                      color: cor.tintaFraca,
                      marginBottom: 18,
                    }}
                  >
Histórico
                  </div>

                  {PACIENTE_360.timeline.map((evento, i) => {
                    const t = progresso(frame, 100 + i * 12, 22, easeOutQuint);
                    const ultimo = i === PACIENTE_360.timeline.length - 1;
                    return (
                      <div
                        key={evento.quando}
                        style={{
                          opacity: t,
                          transform: `translate3d(${(1 - t) * 12}px, 0, 0)`,
                          display: "flex",
                          gap: 16,
                          paddingBottom: ultimo ? 0 : 20,
                          position: "relative",
                        }}
                      >
                        <div style={{ flex: "none", width: 12, position: "relative" }}>
                          <span
                            style={{
                              position: "absolute",
                              top: 6,
                              left: 1,
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: ORIGEM_COR[evento.quem] ?? cor.tintaFraca,
                            }}
                          />
                          {!ultimo && (
                            <span
                              style={{
                                position: "absolute",
                                top: 20,
                                left: 5,
                                width: 2,
                                bottom: -6,
                                background: cor.linha,
                              }}
                            />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontFamily: fonte.texto,
                              fontSize: tamanho.apoio,
                              color: cor.tinta,
                              fontWeight: 600,
                            }}
                          >
                            {evento.o_que}
                          </div>
                          <div
                            style={{
                              fontFamily: fonte.texto,
                              fontSize: tamanho.micro,
                              color: cor.tintaFraca,
                              marginTop: 4,
                            }}
                          >
                            {evento.quando} · {evento.quem}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Janela>
        </Crescer>
      </Em>

      <Em x={140} y={906} largura={1640} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 150, 26),
            fontFamily: fonte.texto,
            fontSize: tamanho.corpo,
            color: cor.tintaSuave,
          }}
        >
          {PACIENTE_360.titulo}
        </div>
      </Em>
    </Palco>
  );
}
