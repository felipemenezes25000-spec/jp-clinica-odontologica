import { SeloDeCena } from "@/components/CenaBase";
import { Janela, LinhaDeFila } from "@/components/Janela";
import { HOME } from "@/data/conteudo";
import { BASE, FILA, ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador, Crescer } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 18 — A home operacional.
 *
 * Aqui a peça sai do diagrama e mostra o produto. A primeira frase da tela é a
 * tese inteira do sistema em duas linhas: um número que exige a pessoa, e outro
 * que já está sendo cuidado sem ela.
 *
 * Os dois números são de tamanhos diferentes de propósito — o que precisa de
 * atenção é o que a tela grita.
 */

export function Cena18Home() {
  const frame = useFrame();

  return (
    <Palco fundo="#EEF1EA">
      <SeloDeCena numero={18} />

      <Em x={140} y={140} zIndex={8}>
        <Crescer em={2} dur={40} deEscala={0.965}>
          <Janela ativo="Home">
            <div style={{ padding: "36px 40px", height: "100%", display: "flex", gap: 34 }}>
              {/* Coluna principal ------------------------------------- */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    opacity: progresso(frame, 20, 24),
                    fontFamily: fonte.texto,
                    fontSize: tamanho.corpo,
                    color: cor.tintaSuave,
                  }}
                >
                  {HOME.saudacao}
                </div>

                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      opacity: progresso(frame, 34, 26),
                      transform: `translate3d(0, ${(1 - progresso(frame, 34, 30, easeOutQuint)) * 14}px, 0)`,
                      fontFamily: fonte.display,
                      fontSize: 50,
                      fontWeight: 800,
                      color: cor.tinta,
                      letterSpacing: "-0.032em",
                      lineHeight: 1.1,
                    }}
                  >
                    <span style={{ color: cor.verdeEscuro }}>
                      <Contador ate={BASE.precisamDeAtencao} em={38} dur={40} />
                    </span>{" "}
                    {HOME.linhaUm}
                  </div>
                  <div
                    style={{
                      opacity: progresso(frame, 54, 26),
                      transform: `translate3d(0, ${(1 - progresso(frame, 54, 30, easeOutQuint)) * 12}px, 0)`,
                      fontFamily: fonte.texto,
                      fontSize: tamanho.destaque,
                      color: cor.tintaSuave,
                      marginTop: 12,
                    }}
                  >
                    <strong style={{ color: cor.tinta, fontWeight: 700 }}>
                      <Contador ate={BASE.emJornada} em={58} dur={40} />
                    </strong>{" "}
                    {HOME.linhaDois}
                  </div>
                </div>

                {/* Cartões de métrica */}
                <div
                  style={{
                    marginTop: 34,
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 16,
                  }}
                >
                  {HOME.cartoes.map((cartao, i) => {
                    const t = progresso(frame, 74 + i * 10, 24, easeOutQuint);
                    return (
                      <div
                        key={cartao.rotulo}
                        style={{
                          opacity: t,
                          transform: `translate3d(0, ${(1 - t) * 14}px, 0)`,
                          background: cor.branco,
                          border: `1px solid ${cor.linha}`,
                          borderRadius: raio.grande,
                          padding: "22px 24px",
                        }}
                      >
                        <div
                          style={{
                            fontFamily: fonte.texto,
                            fontSize: tamanho.legenda,
                            color: cor.tintaSuave,
                            fontWeight: 500,
                          }}
                        >
                          {cartao.rotulo}
                        </div>
                        <div
                          style={{
                            fontFamily: fonte.display,
                            fontSize: 42,
                            fontWeight: 800,
                            color: cor.verdeEscuro,
                            letterSpacing: "-0.03em",
                            marginTop: 8,
                            fontVariantNumeric: "tabular-nums",
                            lineHeight: 1,
                          }}
                        >
                          <Contador ate={cartao.valor} em={86 + i * 10} dur={44} />
                        </div>
                        <div
                          style={{
                            fontFamily: fonte.texto,
                            fontSize: tamanho.micro,
                            color: cor.tintaFraca,
                            marginTop: 8,
                          }}
                        >
                          {cartao.detalhe}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* A fila do dia ---------------------------------------- */}
              <div
                style={{
                  width: 560,
                  flex: "none",
                  opacity: progresso(frame, 108, 26),
                  transform: `translate3d(${(1 - progresso(frame, 108, 32, easeOutQuint)) * 18}px, 0, 0)`,
                  background: cor.branco,
                  border: `1px solid ${cor.linha}`,
                  borderRadius: raio.enorme,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 18,
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonte.display,
                      fontSize: tamanho.corpo,
                      fontWeight: 700,
                      color: cor.tinta,
                    }}
                  >
                    Precisam de você agora
                  </span>
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.micro,
                      color: cor.tintaFraca,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    por prioridade
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {FILA.map((paciente, i) => {
                    const t = progresso(frame, 122 + i * 12, 22, easeOutQuint);
                    return (
                      <LinhaDeFila
                        key={paciente.nome}
                        nome={paciente.nome}
                        motivo={paciente.motivo}
                        sinal={paciente.sinal}
                        prioridade={paciente.prioridade}
                        destacada={i === 0}
                        opacidade={t}
                        deslocamento={(1 - t) * 14}
                      />
                    );
                  })}
                </div>

                <div
                  style={{
                    marginTop: "auto",
                    paddingTop: 20,
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaFraca,
                    opacity: progresso(frame, 176, 24),
                  }}
                >
                  + {BASE.precisamDeAtencao - FILA.length} na fila de hoje
                </div>
              </div>
            </div>
          </Janela>
        </Crescer>
      </Em>

      {ILUSTRATIVO && (
        <Em x={140} y={962} zIndex={9}>
          <div style={{ opacity: progresso(frame, 196, 24) }}>
            <Ilustrativo />
          </div>
        </Em>
      )}
    </Palco>
  );
}
