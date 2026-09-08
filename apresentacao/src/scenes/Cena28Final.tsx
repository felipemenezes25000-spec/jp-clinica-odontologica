import { Marca } from "@/components/Marca";
import { FINAL } from "@/data/conteudo";
import { Em, Halo, Palco } from "@/design-system/primitivas";
import { cor, fonte, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer, Entrar } from "@/motion/primitivas";
import { easeIn, easeOutQuint, progresso } from "@/motion/timing";
import { asset } from "@/utils/asset";

/**
 * CENA 28 — Final.
 *
 * A fachada da clínica entra no fundo com 12% de opacidade sob um véu claro. É
 * o único momento em que a peça mostra o lugar físico — e ele fecha o arco:
 * começou em dado, terminou na porta por onde o paciente entra.
 *
 * A foto é a do próprio site (`src/assets/fachada-letreiro.webp`), copiada para
 * `public/fotos/`. Nada é buscado de fora: o render precisa funcionar sem rede.
 */
export function Cena28Final() {
  const frame = useFrame();
  const saida = progresso(frame, 226, 44, easeIn);

  return (
    <Palco>
      {/* A fachada, quase imperceptível ---------------------------------- */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${asset("fotos/fachada-letreiro.webp")})`,
          backgroundSize: "cover",
          backgroundPosition: "center 62%",
          opacity: progresso(frame, 10, 70) * 0.14,
          filter: "grayscale(0.35)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(247,248,242,0.97) 0%, rgba(247,248,242,0.86) 46%, rgba(247,248,242,0.98) 100%)",
        }}
      />

      <Halo x={960} y={430} raio={520} intensidade={0.09} />

      <div style={{ position: "absolute", inset: 0, opacity: 1 - saida }}>
        {/* Marca -------------------------------------------------------- */}
        <Em x={960} y={300} ancora="centro" zIndex={10}>
          <Crescer em={6} dur={38} deEscala={0.95}>
            <Marca chave="jpSimbolo" altura={112} />
          </Crescer>
        </Em>

        {/* Nome do produto ---------------------------------------------- */}
        <Em x={960} y={396} ancora="topo-centro" largura={1200} zIndex={10}>
          <div style={{ textAlign: "center" }}>
            <Entrar em={30} dur={32} de="baixo" distancia={18}>
              <div
                style={{
                  fontFamily: fonte.display,
                  fontSize: 116,
                  fontWeight: 800,
                  letterSpacing: "-0.045em",
                  color: cor.verdeEscuro,
                  lineHeight: 1,
                }}
              >
                {FINAL.titulo}
              </div>
            </Entrar>
          </div>
        </Em>

        {/* As quatro promessas ------------------------------------------ */}
        <Em x={960} y={558} ancora="topo-centro" largura={1200} zIndex={10}>
          <div style={{ textAlign: "center" }}>
            {FINAL.subtitulo.map((linha, i) => {
              const t = progresso(frame, 62 + i * 18, 26, easeOutQuint);
              return (
                <div
                  key={linha}
                  style={{
                    opacity: t,
                    transform: `translate3d(0, ${(1 - t) * 14}px, 0)`,
                    fontFamily: fonte.display,
                    fontSize: 38,
                    fontWeight: 700,
                    color: cor.tinta,
                    letterSpacing: "-0.025em",
                    lineHeight: 1.5,
                  }}
                >
                  {linha}
                </div>
              );
            })}
          </div>
        </Em>

        {/* Assinatura --------------------------------------------------- */}
        <Em x={960} y={846} ancora="topo-centro" zIndex={10}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22 }}>
            <div
              style={{
                width: 90,
                height: 1.5,
                background: cor.bordaForte,
                opacity: progresso(frame, 142, 26),
              }}
            />
            <div style={{ opacity: progresso(frame, 152, 30) }}>
              <Marca chave="jp" altura={62} />
            </div>
            <div
              style={{
                opacity: progresso(frame, 176, 30),
                fontFamily: fonte.texto,
                fontSize: tamanho.apoio,
                color: cor.tintaSuave,
                letterSpacing: "0.06em",
              }}
            >
              Ver seu sorriso é nossa missão.
            </div>
          </div>
        </Em>
      </div>
    </Palco>
  );
}
