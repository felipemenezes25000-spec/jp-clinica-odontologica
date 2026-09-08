import { SeloDeCena } from "@/components/CenaBase";
import { FRASE } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 27 — A frase.
 *
 * Tela limpa, três linhas, uma de cada vez, no mesmo lugar. É o respiro antes do
 * fim — depois de 25 cenas de informação, a peça para de mostrar e só afirma.
 *
 * A linha anterior não some por completo (cai para 22%): sumir de todo faria
 * cada frase parecer um slide isolado; ficar inteira faria três frases
 * competindo. O rastro é o que costura as três numa só ideia.
 */

const PRIMEIRA = 26;
const PASSO = 62;

export function Cena27Frase() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena numero={27} />

      <Em x={960} y={540} ancora="centro" largura={1500} zIndex={10}>
        <div style={{ textAlign: "center" }}>
          {FRASE.linhas.map((linha, i) => {
            const em = PRIMEIRA + i * PASSO;
            const entra = progresso(frame, em, 26, easeOutQuint);
            const proxima = progresso(frame, em + PASSO, 26, easeOutQuint);
            const ultima = i === FRASE.linhas.length - 1;
            const opacidade = ultima ? entra : entra * (1 - proxima * 0.78);

            return (
              <div
                key={linha}
                style={{
                  opacity: opacidade,
                  transform: `translate3d(0, ${(1 - entra) * 26}px, 0)`,
                  fontFamily: fonte.display,
                  fontSize: i === FRASE.linhas.length - 1 ? 76 : 66,
                  fontWeight: 800,
                  letterSpacing: "-0.035em",
                  lineHeight: 1.2,
                  color: ultima ? cor.verdeEscuro : cor.tinta,
                  marginBottom: 26,
                }}
              >
                {linha}
              </div>
            );
          })}
        </div>
      </Em>
    </Palco>
  );
}
