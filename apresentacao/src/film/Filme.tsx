import { CENAS_POSICIONADAS, cenasVisiveis, DURACAO_TOTAL } from "@/data/linhaDoTempo";
import { PALCO } from "@/design-system/tokens";
import { ProvedorDeCena, ProvedorDeFrame, ProvedorDeMovimento } from "@/motion/frame";
import { COMPONENTES } from "@/scenes";

/**
 * O filme.
 *
 * O contrato entre a web e o Remotion é este componente: dado um `frame`, ele
 * desenha o quadro. Nada mais. Quem conta o tempo é de fora — o player usa
 * `requestAnimationFrame`, o Remotion usa `useCurrentFrame()` — e por isso o
 * mesmo pixel sai nos dois.
 *
 * Duas cenas podem aparecer ao mesmo tempo durante a sobreposição de meio
 * segundo. É de propósito: é o que faz o corte parecer continuação em vez de
 * troca de slide.
 */
export function Filme({
  frame,
  movimentoReduzido = false,
}: {
  frame: number;
  movimentoReduzido?: boolean;
}) {
  const visiveis = cenasVisiveis(frame);

  return (
    <ProvedorDeFrame frame={frame} duracaoTotal={DURACAO_TOTAL}>
      <ProvedorDeMovimento reduzido={movimentoReduzido}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: PALCO.largura,
            height: PALCO.altura,
            overflow: "hidden",
            background: "#F7F8F2",
          }}
        >
          {visiveis.map(({ cena, frameLocal, opacidade }) => {
            const Componente = COMPONENTES[cena.id];
            return (
              <div
                key={cena.id}
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: opacidade,
                  // Só a cena que entra recebe o leve avanço de escala. Aplicar
                  // nas duas faria o quadro inteiro "respirar" a cada corte.
                  transform:
                    opacidade < 1 && frameLocal < 0
                      ? `scale(${0.995 + 0.005 * opacidade})`
                      : undefined,
                  willChange: "opacity",
                }}
              >
                <ProvedorDeCena
                  frameLocal={frameLocal}
                  duracao={cena.duracao}
                  transicao={opacidade}
                  indice={cena.indice}
                  total={CENAS_POSICIONADAS.length}
                >
                  <Componente />
                </ProvedorDeCena>
              </div>
            );
          })}
        </div>
      </ProvedorDeMovimento>
    </ProvedorDeFrame>
  );
}
