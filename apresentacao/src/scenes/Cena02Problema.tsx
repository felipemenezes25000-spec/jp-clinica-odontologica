import { CamadaDeConexoes, Conexao } from "@/components/Conexao";
import { PROBLEMA } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeIn, easeOut, easeOutQuint, progresso } from "@/motion/timing";
import { curvaV } from "@/utils/caminho";

/**
 * CENA 02 — O problema.
 *
 * A única cena apagada da peça. Os sinais existem, os sistemas existem, e as
 * linhas entre eles se cruzam — porque hoje a ligação é a memória de alguém.
 *
 * O emaranhado precisa ser legível como emaranhado e não como erro de layout:
 * por isso as posições são fixas e escolhidas à mão, não sorteadas. Um caos
 * aleatório de verdade parece bug; este parece uma quarta-feira na recepção.
 */

const SINAIS: readonly { x: number; y: number; largura: number; destino: number }[] = [
  { x: 168, y: 236, largura: 300, destino: 0 },
  { x: 560, y: 190, largura: 320, destino: 2 },
  { x: 980, y: 244, largura: 340, destino: 1 },
  { x: 1410, y: 196, largura: 330, destino: 3 },
  { x: 300, y: 402, largura: 380, destino: 3 },
  { x: 860, y: 420, largura: 330, destino: 0 },
];

const SISTEMAS_X = [280, 700, 1120, 1540];
const SISTEMAS_Y = 720;

export function Cena02Problema() {
  const frame = useFrame();

  const entradaSinais = 4;
  const entradaSistemas = 74;
  const entradaLinhas = 104;
  const entradaFrase = 158;
  // A partir daqui a confusão recua — e é isso, não um corte, que abre a cena 3.
  const dissolve = progresso(frame, 236, 56, easeIn);

  return (
    <Palco>
      <div style={{ position: "absolute", inset: 0, opacity: 1 - dissolve * 0.86 }}>
        {/* As ligações emaranhadas ------------------------------------- */}
        <CamadaDeConexoes zIndex={3}>
          {SINAIS.map((sinal, i) => {
            const origemX = sinal.x + sinal.largura / 2;
            const origemY = sinal.y + 62;
            const destinoX = (SISTEMAS_X[sinal.destino] ?? 280) + 130;
            const caminho = curvaV(origemX, origemY, destinoX, SISTEMAS_Y, 0.75);
            return (
              <Conexao
                key={i}
                caminho={caminho}
                em={entradaLinhas + i * 6}
                dur={26}
                cor="#C9D2C4"
                largura={1.6}
                tracejada
                opacidade={0.85}
              />
            );
          })}
        </CamadaDeConexoes>

        {/* Os sinais ---------------------------------------------------- */}
        {PROBLEMA.sinais.map((texto, i) => {
          const pos = SINAIS[i]!;
          const t = progresso(frame, entradaSinais + i * 9, 18, easeOutQuint);
          return (
            <Em key={texto} x={pos.x} y={pos.y} largura={pos.largura} zIndex={6}>
              <div
                style={{
                  opacity: t * 0.94,
                  transform: `translate3d(0, ${(1 - t) * 14}px, 0)`,
                  background: "#F1F3EE",
                  border: "1px solid #E1E6DC",
                  borderRadius: raio.grande,
                  padding: "20px 24px",
                  boxShadow: "none",
                }}
              >
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.destaque,
                    color: "#6B776C",
                    fontWeight: 500,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {texto}
                </div>
              </div>
            </Em>
          );
        })}

        {/* Onde a informação mora hoje --------------------------------- */}
        {PROBLEMA.ondeMora.map((nome, i) => {
          const t = progresso(frame, entradaSistemas + i * 10, 20, easeOutQuint);
          return (
            <Em key={nome} x={SISTEMAS_X[i] ?? 280} y={SISTEMAS_Y} largura={260} zIndex={6}>
              <div
                style={{
                  opacity: t,
                  transform: `translate3d(0, ${(1 - t) * 16}px, 0)`,
                  background: "#EDEFE9",
                  border: "1px dashed #CBD4C5",
                  borderRadius: raio.medio,
                  padding: "22px 20px",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.corpo,
                    fontWeight: 700,
                    color: "#77836F",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {nome}
                </div>
              </div>
            </Em>
          );
        })}
      </div>

      {/* A frase que nomeia o problema ---------------------------------- */}
      <Em x={960} y={868} ancora="topo-centro" largura={1400} zIndex={20}>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              opacity: progresso(frame, entradaFrase, 26, easeOut),
              transform: `translate3d(0, ${(1 - progresso(frame, entradaFrase, 26, easeOutQuint)) * 18}px, 0)`,
              fontFamily: fonte.display,
              fontSize: tamanho.subtitulo,
              fontWeight: 700,
              color: cor.tinta,
              letterSpacing: "-0.025em",
              lineHeight: 1.18,
            }}
          >
            {PROBLEMA.frase}
          </div>
          <div
            style={{
              opacity: progresso(frame, entradaFrase + 22, 26, easeOut),
              transform: `translate3d(0, ${(1 - progresso(frame, entradaFrase + 22, 26, easeOutQuint)) * 14}px, 0)`,
              fontFamily: fonte.texto,
              fontSize: tamanho.destaque,
              color: cor.tintaSuave,
              marginTop: 14,
              lineHeight: 1.45,
            }}
          >
            {PROBLEMA.fraseDois}
          </div>
        </div>
      </Em>
    </Palco>
  );
}
