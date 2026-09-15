import { ArrowRight, Eye, PenLine, CalendarCheck } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { AGENTE } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 27 — O agente deixou de só entender e passou a agir.
 *
 * A cena mais delicada do filme para contar. "A IA age sozinha" é, para quem
 * assiste, a frase que produz medo — então a composição separa em três colunas
 * pelo RISCO do que ela toca, e não pelo que é tecnicamente parecido: ler
 * histórico e mexer na agenda real da clínica não podem aparecer no mesmo bloco.
 *
 * A cadeia embaixo é o argumento de verdade: o modelo ESCOLHE, o sistema
 * AUTORIZA, e só então o efeito acontece. É a diferença entre uma permissão e
 * uma torcida — e é a única coisa desta cena que o espectador precisa levar.
 */

const COLUNA = { y: 286, largura: 520, altura: 344 };
const COLUNA_X = [120, 700, 1280];
const ICONES = [Eye, PenLine, CalendarCheck];

/** Cada grupo tem a cor do seu risco. Ler é neutro; mexer na agenda não é. */
const PALETA = {
  leitura: { fundo: cor.branco, barra: cor.bordaForte, chip: cor.fundo, texto: cor.tinta },
  escrita: { fundo: cor.branco, barra: cor.verde, chip: cor.menta, texto: cor.tinta },
  sensivel: { fundo: cor.branco, barra: cor.dentalOffice, chip: cor.dentalOfficeFraco, texto: cor.tinta },
} as const;

export function Cena27Agente() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="O agente"
        titulo={AGENTE.titulo}
        subtitulo={AGENTE.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {/* Os três grupos, por risco ---------------------------------------- */}
      {AGENTE.grupos.map((grupo, i) => {
        const Icone = ICONES[i]!;
        const paleta = PALETA[grupo.cor];
        const t = progresso(frame, 18 + i * 14, 26, easeOutQuint);

        return (
          <Em key={grupo.rotulo} x={COLUNA_X[i]!} y={COLUNA.y} largura={COLUNA.largura} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 18}px, 0)`,
                minHeight: COLUNA.altura,
                background: paleta.fundo,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.enorme,
                boxShadow: sombra.media,
                overflow: "hidden",
              }}
            >
              <div style={{ height: 4, background: paleta.barra }} />
              <div style={{ padding: "26px 28px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 13,
                      background: paleta.chip,
                      color: paleta.barra === cor.bordaForte ? cor.tintaSuave : paleta.barra,
                      display: "grid",
                      placeItems: "center",
                      flex: "none",
                    }}
                  >
                    <Icone size={20} strokeWidth={2.1} />
                  </span>
                  <span
                    style={{
                      fontFamily: fonte.display,
                      fontSize: tamanho.destaque,
                      fontWeight: 800,
                      color: cor.tinta,
                      letterSpacing: "-0.022em",
                    }}
                  >
                    {grupo.rotulo}
                  </span>
                </div>

                {grupo.itens.map((item, j) => (
                  <div
                    key={item}
                    style={{
                      opacity: progresso(frame, 52 + i * 14 + j * 6, 20),
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "13px 0",
                      borderBottom: j === grupo.itens.length - 1 ? "none" : `1px solid ${cor.linha}`,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 999,
                        background: paleta.barra,
                        flex: "none",
                        marginTop: 8,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.apoio,
                        color: paleta.texto,
                        lineHeight: 1.4,
                      }}
                    >
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Em>
        );
      })}

      {/* A cadeia: quem escolhe, quem autoriza ---------------------------- */}
      <Em x={120} y={672} largura={1680} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 116, 28),
            transform: `translate3d(0, ${(1 - progresso(frame, 116, 34, easeOutQuint)) * 14}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            padding: "24px 32px",
            display: "flex",
            alignItems: "center",
            gap: 22,
          }}
        >
          <span
            style={{
              fontFamily: fonte.display,
              fontSize: 46,
              fontWeight: 800,
              color: cor.branco,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              flex: "none",
            }}
          >
            <Contador ate={AGENTE.total.valor} em={124} dur={38} />
          </span>
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.apoio,
              color: "#B8D9A4",
              width: 250,
              lineHeight: 1.35,
              flex: "none",
            }}
          >
            {AGENTE.total.rotulo}
          </span>

          <span style={{ width: 1, height: 52, background: "#0B4A05", flex: "none" }} />

          {/* Três passos, e a ordem é o argumento. */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
            {[AGENTE.cadeia.modelo, AGENTE.cadeia.politica, AGENTE.cadeia.efeito].map(
              (passo, i) => (
                <div
                  key={passo}
                  style={{
                    opacity: progresso(frame, 140 + i * 14, 20),
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <span
                    style={{
                      background: i === 1 ? cor.verde : "#0B4A05",
                      color: i === 1 ? cor.profundo : cor.branco,
                      borderRadius: raio.pilula,
                      padding: "12px 22px",
                      fontFamily: fonte.texto,
                      fontSize: tamanho.apoio,
                      fontWeight: i === 1 ? 700 : 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {passo}
                  </span>
                  {i < 2 && <ArrowRight size={18} strokeWidth={2.4} color="#5E8A52" />}
                </div>
              ),
            )}
          </div>
        </div>
      </Em>

      <Raciocinio em={186}>{AGENTE.raciocinio}</Raciocinio>
    </Palco>
  );
}
