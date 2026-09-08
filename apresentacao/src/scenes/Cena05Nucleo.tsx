import { SeloDeCena } from "@/components/CenaBase";
import { CamadaDeConexoes, Conexao } from "@/components/Conexao";
import { Marca } from "@/components/Marca";
import { Modulo } from "@/components/No";
import { NUCLEO } from "@/data/conteudo";
import { Em, Halo, Kicker, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer, Entrar, Respirar } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";
import { curvaH } from "@/utils/caminho";

/**
 * CENA 05 — O núcleo.
 *
 * A revelação do produto. Os oito módulos acendem em sequência, e não juntos:
 * acender junto vira "um painel", acender em ordem vira "um sistema ligando".
 *
 * A respiração de 1,2% no card existe por um motivo só — dizer que aquilo está
 * rodando agora, e não é uma captura de tela. É o único elemento da peça com
 * movimento contínuo.
 */

const CAIXA = { x: 430, y: 262, largura: 1060, altura: 640 };

export function Cena05Nucleo() {
  const frame = useFrame();
  const acendeEm = 96;
  const passo = 13;

  return (
    <Palco>
      <SeloDeCena numero={5} />
      <Halo x={960} y={560} raio={560} intensidade={0.13} />

      <CamadaDeConexoes zIndex={3}>
        <Conexao
          caminho={curvaH(20, 562, CAIXA.x - 12, 562, 0.5)}
          em={0}
          dur={22}
          cor={cor.bordaForte}
          largura={2.6}
          pulsos={3}
          corPulso={cor.verde}
          cicloPulso={58}
          raioPulso={6}
          semente={4}
        />
      </CamadaDeConexoes>

      {/* Cabeçalho ------------------------------------------------------ */}
      <Em x={960} y={110} ancora="topo-centro" largura={1200} zIndex={20}>
        <div style={{ textAlign: "center" }}>
          <Entrar em={4} dur={22} de="baixo" distancia={12}>
            <Kicker style={{ marginBottom: 16 }}>O núcleo</Kicker>
          </Entrar>
          <Entrar em={10} dur={28} de="baixo" distancia={18}>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: tamanho.subtitulo,
                fontWeight: 800,
                color: cor.tinta,
                letterSpacing: "-0.028em",
                lineHeight: 1.14,
              }}
            >
              {NUCLEO.titulo}{" "}
              <span style={{ color: cor.verdeEscuro }}>{NUCLEO.subtitulo}</span>
            </div>
          </Entrar>
        </div>
      </Em>

      {/* O núcleo ------------------------------------------------------- */}
      <Em x={CAIXA.x} y={CAIXA.y} largura={CAIXA.largura} zIndex={10}>
        <Crescer em={26} dur={40} deEscala={0.955}>
          <Respirar amplitude={0.006} ciclo={150}>
            <div
              style={{
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.enorme + 8,
                boxShadow: `${sombra.alta}, 0 0 0 10px ${cor.verde}0d`,
                overflow: "hidden",
              }}
            >
              {/* Faixa de identidade */}
              <div
                style={{
                  padding: "26px 34px",
                  borderBottom: `1px solid ${cor.linha}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "linear-gradient(180deg, #FFFFFF 0%, #FBFDF8 100%)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <Marca chave="jpSimbolo" altura={46} />
                  <div>
                    <div
                      style={{
                        fontFamily: fonte.display,
                        fontSize: 36,
                        fontWeight: 800,
                        color: cor.verdeEscuro,
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                      }}
                    >
                      JP CRC
                    </div>
                    <div
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.legenda,
                        color: cor.tintaSuave,
                        marginTop: 5,
                        letterSpacing: "0.09em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      Revenue OS
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity: progresso(frame, acendeEm + 8 * passo, 24),
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 999,
                      background: cor.verde,
                      boxShadow: `0 0 0 4px ${cor.verde}22`,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.legenda,
                      color: cor.tintaSuave,
                      fontWeight: 500,
                    }}
                  >
                    Observando a operação
                  </span>
                </div>
              </div>

              {/* Módulos */}
              <div
                style={{
                  padding: 30,
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                }}
              >
                {NUCLEO.modulos.map((modulo, i) => (
                  <Modulo
                    key={modulo.nome}
                    nome={modulo.nome}
                    detalhe={modulo.detalhe}
                    aceso={frame >= acendeEm + i * passo}
                  />
                ))}
              </div>

              {/* Rodapé: o que entra e o que sai */}
              <div
                style={{
                  padding: "20px 34px",
                  borderTop: `1px solid ${cor.linha}`,
                  background: "#FBFCF9",
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.tintaSuave,
                  opacity: progresso(frame, acendeEm + 8 * passo + 10, 26),
                }}
              >
                <span>
                  Entra: <strong style={{ color: cor.tinta }}>pacientes, agenda, status</strong>
                </span>
                <span>
                  Sai: <strong style={{ color: cor.verdeEscuro }}>oportunidades e ações</strong>
                </span>
              </div>
            </div>
          </Respirar>
        </Crescer>
      </Em>

      {/* Costura para a cena 6: o núcleo já começa a emitir. */}
      <CamadaDeConexoes zIndex={11}>
        <Conexao
          caminho={curvaH(CAIXA.x + CAIXA.largura + 10, 562, 1900, 562, 0.5)}
          em={218}
          dur={26}
          cor={cor.bordaForte}
          largura={2.6}
          pulsos={3}
          corPulso={cor.verde}
          cicloPulso={54}
          raioPulso={6}
          semente={9}
        />
      </CamadaDeConexoes>
    </Palco>
  );
}
