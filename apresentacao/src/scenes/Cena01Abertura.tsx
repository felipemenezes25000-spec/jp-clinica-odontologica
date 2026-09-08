import { Marca } from "@/components/Marca";
import { ABERTURA } from "@/data/conteudo";
import { Em, Grade, Halo, Palco } from "@/design-system/primitivas";
import { cor, fonte, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer, Entrar } from "@/motion/primitivas";
import { easeOut, easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 01 — Abertura.
 *
 * Papel branco, a marca, o nome do produto. Os seis pilares entram UM DE CADA
 * VEZ (item do storyboard: "não mostrar tudo simultaneamente") — seis palavras
 * chegando juntas viram um bloco de texto, e o olho não lê nenhuma.
 *
 * O último gesto é um ponto verde que começa a andar. Ele é a costura para a
 * cena 2: o filme não corta, ele segue um objeto.
 */
export function Cena01Abertura() {
  const frame = useFrame();

  // Cada pilar tem sua janela. O anterior sai enquanto o próximo entra, então
  // há sempre no máximo dois em tela — e o de baixo nunca some por completo,
  // o que daria a impressão de erro.
  const inicioPilares = 128;
  const passo = 26;

  const pontoSai = progresso(frame, 268, 62, easeOut);

  return (
    <Palco>
      <Grade opacidade={0.4} passo={72} />
      <Halo x={960} y={430} raio={520} intensidade={0.1} />

      {/* Marca ---------------------------------------------------------- */}
      <Em x={960} y={318} ancora="centro" zIndex={10}>
        <Crescer em={6} dur={40} deEscala={0.94}>
          <Marca chave="jp" altura={104} />
        </Crescer>
      </Em>

      {/* Nome do produto ------------------------------------------------ */}
      <Em x={960} y={452} ancora="topo-centro" largura={1200} zIndex={10}>
        <div style={{ textAlign: "center" }}>
          <Entrar em={40} dur={34} de="baixo" distancia={20}>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: 132,
                fontWeight: 800,
                letterSpacing: "-0.045em",
                color: cor.verdeEscuro,
                lineHeight: 1,
              }}
            >
              {ABERTURA.titulo}
            </div>
          </Entrar>

          <Entrar em={62} dur={30} de="baixo" distancia={16}>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.destaque,
                color: cor.tintaSuave,
                marginTop: 26,
                maxWidth: 780,
                marginInline: "auto",
                lineHeight: 1.5,
              }}
            >
              {ABERTURA.subtitulo}
            </div>
          </Entrar>
        </div>
      </Em>

      {/* Pilares, um de cada vez ---------------------------------------- */}
      <Em x={960} y={730} ancora="topo-centro" largura={900} zIndex={10}>
        <div style={{ position: "relative", height: 92 }}>
          {ABERTURA.pilares.map((pilar, i) => {
            const inicio = inicioPilares + i * passo;
            // A palavra que sai começa a sair ANTES de a próxima entrar (−8) e
            // sai mais rápido (10 frames). Sem essa defasagem, duas ficavam
            // legíveis no mesmo pixel e o quadro virava borrão.
            const entra = progresso(frame, inicio, 14, easeOutQuint);
            const sai = progresso(frame, inicio + passo - 8, 10, easeOutQuint);
            const visivel = Math.max(0, entra - sai);
            if (visivel <= 0.002) return null;

            return (
              <div
                key={pilar}
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  opacity: visivel,
                  transform: `translate3d(0, ${(1 - entra) * 30 - sai * 34}px, 0)`,
                }}
              >
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontSize: 62,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    color: cor.tinta,
                  }}
                >
                  {pilar}
                </span>
              </div>
            );
          })}

          {/* Depois da sequência, os seis assentam juntos como um resumo. */}
          <Entrar em={inicioPilares + ABERTURA.pilares.length * passo + 6} dur={26} de="baixo" distancia={14}>
            <div
              style={{
                display: "flex",
                gap: 14,
                justifyContent: "center",
                flexWrap: "wrap",
                paddingTop: 22,
              }}
            >
              {ABERTURA.pilares.map((pilar) => (
                <span
                  key={pilar}
                  style={{
                    padding: "10px 20px",
                    borderRadius: 999,
                    background: cor.branco,
                    border: `1px solid ${cor.borda}`,
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    fontWeight: 600,
                    color: cor.verdeEscuro,
                  }}
                >
                  {pilar}
                </span>
              ))}
            </div>
          </Entrar>
        </div>
      </Em>

      {/* O ponto que inicia a história ---------------------------------- */}
      <Em x={0} y={0} zIndex={30}>
        <div
          style={{
            position: "absolute",
            left: 960 + pontoSai * 1150,
            top: 962,
            width: 16,
            height: 16,
            marginLeft: -8,
            borderRadius: 999,
            background: cor.verde,
            boxShadow: `0 0 0 ${8 + pontoSai * 10}px ${cor.verde}1f`,
            opacity: progresso(frame, 262, 14),
          }}
        />
      </Em>
    </Palco>
  );
}
