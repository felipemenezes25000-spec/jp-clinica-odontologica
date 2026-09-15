import { Ruler, Target } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { METAS } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 43 — A meta do dono, com a régua à vista.
 *
 * A COISA QUE A CENA PRECISA COMUNICAR não é que o sistema tem metas — todo
 * sistema tem. É que ele diz COMO VAI MEDIR antes de a pessoa escolher o
 * número. Por isso a régua aparece como um bloco próprio, colado na meta, e não
 * como um campo de formulário.
 *
 * E o selo de "rascunho" fica na tela porque é o que impede a cena de prometer
 * automação irrestrita: a meta nasce com plano montado e não faz nada até
 * alguém aprovar, com os limites à vista na hora de aprovar.
 */

const ESQ = { x: 120, y: 296, largura: 840 };
const DIR = { x: 1020, y: 296, largura: 780 };

export function Cena43Metas() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Resultados"
        titulo={METAS.titulo}
        subtitulo={METAS.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {/* A meta e a régua ------------------------------------------------- */}
      <Em x={ESQ.x} y={ESQ.y} largura={ESQ.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 16, 28),
            transform: `translate3d(0, ${(1 - progresso(frame, 16, 34, easeOutQuint)) * 16}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            boxShadow: sombra.alta,
            padding: "34px 36px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Target size={19} strokeWidth={2.2} color={cor.verde} />
            <span
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.micro,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: cor.verde,
              }}
            >
              A meta
            </span>
          </div>

          <div
            style={{
              fontFamily: fonte.display,
              fontSize: 84,
              fontWeight: 800,
              color: cor.branco,
              letterSpacing: "-0.05em",
              lineHeight: 1,
              marginTop: 16,
            }}
          >
            {METAS.meta.alvo}
          </div>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.corpo,
              color: cor.branco,
              marginTop: 12,
            }}
          >
            {METAS.meta.assunto} · {METAS.meta.prazo}
          </div>

          {/* A régua, colada na meta. */}
          <div
            style={{
              opacity: progresso(frame, 48, 26),
              marginTop: 26,
              paddingTop: 22,
              borderTop: `1px solid #0B4A05`,
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
            }}
          >
            <Ruler size={17} strokeWidth={2.3} color={cor.verde} style={{ flex: "none", marginTop: 3 }} />
            <div>
              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.micro,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  color: cor.verde,
                }}
              >
                Como o sistema vai medir
              </div>
              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: "#B8D9A4",
                  marginTop: 8,
                  lineHeight: 1.4,
                }}
              >
                {METAS.comoMede}
              </div>
            </div>
          </div>
        </div>
      </Em>

      {/* O plano e os limites -------------------------------------------- */}
      <Em x={DIR.x} y={DIR.y} largura={DIR.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 78, 26),
            transform: `translate3d(${(1 - progresso(frame, 78, 32, easeOutQuint)) * 18}px, 0, 0)`,
          }}
        >
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
            O plano que ele monta
          </div>

          {METAS.plano.map((item, i) => (
            <div
              key={item}
              style={{
                opacity: progresso(frame, 90 + i * 12, 22),
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.grande,
                padding: "17px 22px",
                marginBottom: 9,
                fontFamily: fonte.texto,
                fontSize: tamanho.apoio,
                color: cor.tinta,
                lineHeight: 1.4,
              }}
            >
              {item}
            </div>
          ))}

          {/* Os limites aparecem na hora de aprovar, e não escondidos. */}
          <div
            style={{
              opacity: progresso(frame, 136, 26),
              marginTop: 18,
              background: cor.menta,
              border: `1px solid #CDE7B4`,
              borderRadius: raio.grande,
              padding: "20px 24px",
            }}
          >
            {METAS.limites.map((l, i) => (
              <div
                key={l.rotulo}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 16,
                  padding: "8px 0",
                  borderBottom: i === METAS.limites.length - 1 ? "none" : `1px solid #CDE7B4`,
                }}
              >
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: cor.verdeEscuro,
                  }}
                >
                  {l.rotulo}
                </span>
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    fontWeight: 700,
                    color: cor.verdeEscuro,
                    flex: "none",
                  }}
                >
                  {l.valor}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              opacity: progresso(frame, 162, 24),
              marginTop: 16,
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              color: cor.alerta,
              fontWeight: 600,
            }}
          >
            {METAS.estado}
          </div>
        </div>
      </Em>

      <Raciocinio em={186}>{METAS.raciocinio}</Raciocinio>
    </Palco>
  );
}
