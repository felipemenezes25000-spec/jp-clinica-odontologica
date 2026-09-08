import { Sparkles } from "lucide-react";
import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { CamadaDeConexoes, Conexao } from "@/components/Conexao";
import { IA } from "@/data/conteudo";
import { Em, Halo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer } from "@/motion/primitivas";
import { aleatorio, easeOutQuint, progresso } from "@/motion/timing";
import { curvaH } from "@/utils/caminho";

/**
 * CENA 14 — A IA.
 *
 * A frase do paciente entra de um lado e sai do outro como quatro campos. É a
 * imagem que desfaz a ideia de "IA que conversa": o que ela produz aqui é dado
 * estruturado — intenção, temperatura, confiança e a ação seguinte.
 *
 * "Próxima ação PERMITIDA" é literal. A IA sugere dentro do conjunto `AcaoIa`
 * do domínio; ela não inventa uma ação nova nem age fora do que a regra
 * autoriza. Mostrar isso é o que separa a peça de uma promessa vaga.
 */

const NUCLEO = { x: 830, y: 470 };

export function Cena14Ia() {
  const frame = useFrame();
  const processando = progresso(frame, 54, 40);
  const resultado = 88;

  return (
    <Palco>
      <SeloDeCena numero={14} />
      <Halo x={NUCLEO.x} y={NUCLEO.y} raio={340} cor={cor.ia} intensidade={0.12} />

      <TituloDeCena
        kicker="Inteligência"
        titulo={IA.titulo}
        subtitulo={IA.subtitulo}
        em={2}
        largura={1000}
        nivel={2}
      />

      <CamadaDeConexoes zIndex={4}>
        <Conexao
          caminho={curvaH(640, NUCLEO.y, NUCLEO.x - 108, NUCLEO.y, 0.6)}
          em={30}
          dur={20}
          cor={cor.bordaForte}
          largura={2.2}
          pulsos={2}
          corPulso={cor.ia}
          cicloPulso={50}
          semente={2}
        />
        <Conexao
          caminho={curvaH(NUCLEO.x + 108, NUCLEO.y, 1180, NUCLEO.y, 0.6)}
          em={resultado - 14}
          dur={20}
          cor={cor.bordaForte}
          largura={2.2}
          pulsos={2}
          corPulso={cor.verde}
          cicloPulso={50}
          semente={8}
        />
      </CamadaDeConexoes>

      {/* A fala do paciente --------------------------------------------- */}
      <Em x={190} y={NUCLEO.y - 62} largura={450} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 10, 24),
            transform: `translate3d(${(1 - progresso(frame, 10, 30, easeOutQuint)) * -20}px, 0, 0)`,
            background: cor.whatsappFraco,
            border: "1px solid #C9EBD7",
            borderRadius: 24,
            borderBottomRightRadius: 8,
            padding: "24px 28px",
            boxShadow: sombra.suave,
          }}
        >
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.micro,
              color: cor.whatsappEscuro,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            Maria Souza · WhatsApp
          </div>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: 34,
              color: cor.tinta,
              fontWeight: 500,
              lineHeight: 1.35,
            }}
          >
            “{IA.entrada}”
          </div>
        </div>
      </Em>

      {/* O processamento -------------------------------------------------- */}
      <Em x={NUCLEO.x} y={NUCLEO.y} ancora="centro" zIndex={10}>
        <Crescer em={40} dur={30} deEscala={0.9}>
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 999,
              background: cor.branco,
              border: `1px solid ${cor.ia}44`,
              boxShadow: `${sombra.alta}, 0 0 0 ${10 + processando * 8}px ${cor.ia}0f`,
              display: "grid",
              placeItems: "center",
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* Os traços internos: processamento abstrato, sem "cérebro" nem
                circuito — clichê que envelhece mal. */}
            {Array.from({ length: 22 }, (_, i) => {
              const angulo = (i / 22) * Math.PI * 2;
              const raioBase = 44 + aleatorio(i) * 40;
              const fase = Math.sin(frame / 14 + i) * 0.5 + 0.5;
              return (
                <span
                  key={i}
                  style={{
                    position: "absolute",
                    left: 100 + Math.cos(angulo) * raioBase - 3,
                    top: 100 + Math.sin(angulo) * raioBase - 3,
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: cor.ia,
                    opacity: (0.18 + fase * 0.55) * processando,
                  }}
                />
              );
            })}
            <Sparkles
              size={54}
              strokeWidth={1.7}
              color={cor.ia}
              style={{ opacity: 0.35 + processando * 0.65 }}
            />
          </div>
        </Crescer>
      </Em>

      <Em x={NUCLEO.x} y={NUCLEO.y + 132} ancora="topo-centro" largura={320} zIndex={10}>
        <div
          style={{
            opacity: progresso(frame, 48, 22),
            textAlign: "center",
            fontFamily: fonte.texto,
            fontSize: tamanho.apoio,
            fontWeight: 600,
            color: cor.ia,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Classificando
        </div>
      </Em>

      {/* A saída estruturada ---------------------------------------------- */}
      <Em x={1180} y={318} largura={570} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, resultado, 24),
            transform: `translate3d(${(1 - progresso(frame, resultado, 30, easeOutQuint)) * 22}px, 0, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 4, background: cor.ia }} />
          <div
            style={{
              padding: "20px 28px",
              borderBottom: `1px solid ${cor.linha}`,
              fontFamily: fonte.texto,
              fontSize: tamanho.micro,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: cor.tintaSuave,
            }}
          >
            Classificação da conversa
          </div>

          {IA.saida.map((linha, i) => {
            const t = progresso(frame, resultado + 12 + i * 11, 20, easeOutQuint);
            const destaque = i === IA.saida.length - 1;
            return (
              <div
                key={linha.campo}
                style={{
                  opacity: t,
                  transform: `translate3d(0, ${(1 - t) * 10}px, 0)`,
                  padding: "22px 28px",
                  borderBottom: i === IA.saida.length - 1 ? "none" : `1px solid ${cor.linha}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 20,
                  background: destaque ? "#FBFCF9" : "transparent",
                }}
              >
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.tintaSuave,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  {linha.campo}
                </span>
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontSize: destaque ? 30 : 28,
                    fontWeight: 800,
                    color: destaque ? cor.verdeEscuro : cor.tinta,
                    letterSpacing: "-0.02em",
                    textAlign: "right",
                  }}
                >
                  {linha.valor}
                </span>
              </div>
            );
          })}
        </div>
      </Em>
    </Palco>
  );
}
