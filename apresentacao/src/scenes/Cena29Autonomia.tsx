import { Lock } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { AUTONOMIA } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 29 — O centro de autonomia.
 *
 * A resposta para a pergunta que o dono da clínica faz depois de ver o agente
 * agir: "e eu controlo isso?". A resposta é uma escada de seis degraus e uma
 * lista de dez assuntos — e o ponto é que cada assunto tem o seu degrau.
 *
 * A ESCADA É DESENHADA COMO ESCADA, subindo. Uma lista vertical de seis itens
 * iguais não comunica que o degrau 5 contém o 4; a altura crescente comunica
 * sozinha, sem precisar de legenda.
 *
 * Os dois assuntos em zero aparecem com cadeado, e não apagados: apagado lê-se
 * como "não existe", e o que queremos dizer é "existe e está desligado".
 */

const ESCADA = { x: 120, y: 300, largura: 900, base: 44, passo: 34 };
/** A barra do degrau 0 precisa caber "0  Desligado" sem vazar. */
const BARRA_BASE = 250;
const BARRA_PASSO = 86;
const LISTA = { x: 1100, y: 300, largura: 700 };

export function Cena29Autonomia() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="O agente"
        titulo={AUTONOMIA.titulo}
        subtitulo={AUTONOMIA.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1000}
      />

      {/* A escada -------------------------------------------------------- */}
      {AUTONOMIA.escada.map((degrau, i) => {
        const t = progresso(frame, 20 + i * 12, 22, easeOutQuint);
        const altura = ESCADA.base + i * 6;
        const y = ESCADA.y + i * (ESCADA.passo + 20);

        return (
          <Em key={degrau.nivel} x={ESCADA.x} y={y} largura={ESCADA.largura} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * -14}px, 0, 0)`,
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              {/* A barra cresce com o nível — é o que faz a escada ser escada. */}
              <span
                style={{
                  width: BARRA_BASE + i * BARRA_PASSO,
                  height: altura,
                  borderRadius: raio.medio,
                  background: i === 0 ? cor.linha : cor.verdeSuave,
                  border: `1px solid ${i === 0 ? cor.borda : "#CDE7B4"}`,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 16,
                  flex: "none",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.corpo,
                    fontWeight: 800,
                    color: i === 0 ? cor.tintaFraca : cor.verdeEscuro,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {degrau.nivel}
                </span>
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    fontWeight: 700,
                    color: i === 0 ? cor.tintaSuave : cor.verdeEscuro,
                    whiteSpace: "nowrap",
                  }}
                >
                  {degrau.rotulo}
                </span>
              </span>

              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.tintaSuave,
                  lineHeight: 1.35,
                }}
              >
                {degrau.detalhe}
              </span>
            </div>
          </Em>
        );
      })}

      {/* Os dez assuntos, cada um no seu degrau --------------------------- */}
      <Em x={LISTA.x} y={LISTA.y} largura={LISTA.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 96, 26),
            transform: `translate3d(${(1 - progresso(frame, 96, 32, easeOutQuint)) * 18}px, 0, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 4, background: cor.verdeEscuro }} />
          <div style={{ padding: "22px 28px 24px" }}>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.micro,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: cor.tintaSuave,
                marginBottom: 14,
              }}
            >
              Como está hoje, assunto por assunto
            </div>

            {AUTONOMIA.dominios.map((dominio, i) => {
              const t = progresso(frame, 108 + i * 8, 18, easeOutQuint);
              const desligado = dominio.nivel === 0;
              return (
                <div
                  key={dominio.nome}
                  style={{
                    opacity: t,
                    transform: `translate3d(0, ${(1 - t) * 8}px, 0)`,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "11px 0",
                    borderBottom:
                      i === AUTONOMIA.dominios.length - 1 ? "none" : `1px solid ${cor.linha}`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.apoio,
                      color: cor.tinta,
                      fontWeight: 500,
                      flex: 1,
                    }}
                  >
                    {dominio.nome}
                  </span>

                  {/* Seis pontinhos: o preenchido conta o nível sem precisar de número. */}
                  <span style={{ display: "flex", gap: 5, flex: "none" }}>
                    {[0, 1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: 999,
                          background:
                            n <= dominio.nivel && dominio.nivel > 0 ? cor.verde : cor.linha,
                        }}
                      />
                    ))}
                  </span>

                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.legenda,
                      color: desligado ? cor.tintaFraca : cor.verdeEscuro,
                      fontWeight: 700,
                      width: 152,
                      textAlign: "right",
                      flex: "none",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 7,
                    }}
                  >
                    {desligado && <Lock size={13} strokeWidth={2.4} />}
                    {AUTONOMIA.escada[dominio.nivel]?.rotulo ?? ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Em>

      <Raciocinio em={216}>{AUTONOMIA.raciocinio}</Raciocinio>
    </Palco>
  );
}
