import { Ban, Check, ShieldCheck } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { PORTOES } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 28 — Os nove portões.
 *
 * A cena que desarma o medo da anterior, e por isso vem imediatamente depois.
 *
 * O DESENHO: os nove portões acendem em verde, um a um, como uma esteira — e no
 * meio da sequência um deles fica VERMELHO e para a mensagem. Ver a coisa
 * funcionando sobre um caso concreto ensina mais do que qualquer lista: o
 * espectador entende que a trava existe porque ele a viu barrando.
 *
 * O texto barrado é uma orientação clínica plausível, e não uma bobagem óbvia.
 * Um exemplo bobo faria a trava parecer fácil; o que assusta é justamente a
 * frase que soa razoável.
 */

const GRADE = { x: 120, y: 292, largura: 780, alturaLinha: 52, espaco: 8 };
const EXEMPLO = { x: 960, y: 292, largura: 840 };

/** O portão barrado acende em vermelho neste frame; os anteriores, em verde. */
const EM_POR_PORTAO = 24;
const INICIO_PORTOES = 20;

export function Cena28Portoes() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="O agente"
        titulo={PORTOES.titulo}
        subtitulo={PORTOES.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {/* Os nove portões -------------------------------------------------- */}
      {PORTOES.lista.map((portao, i) => {
        const em = INICIO_PORTOES + i * EM_POR_PORTAO;
        const t = progresso(frame, em, 18, easeOutQuint);
        const barra = i === PORTOES.barrado;
        // Depois do portão que barra, os seguintes não são avaliados — a cadeia
        // para no primeiro veto, e mostrá-los acesos seria mentira.
        const naoAvaliado = i > PORTOES.barrado && frame > em;
        const aceso = t > 0.5;

        return (
          <Em
            key={portao}
            x={GRADE.x}
            y={GRADE.y + i * (GRADE.alturaLinha + GRADE.espaco)}
            largura={GRADE.largura}
            zIndex={8}
          >
            <div
              style={{
                opacity: naoAvaliado ? 0.32 : t,
                transform: `translate3d(${(1 - t) * -12}px, 0, 0)`,
                height: GRADE.alturaLinha,
                background: barra && aceso ? cor.perigoFraco : cor.branco,
                border: `1px solid ${barra && aceso ? "#F0C6C1" : cor.borda}`,
                borderRadius: raio.grande,
                padding: "0 20px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                boxShadow: barra && aceso ? "0 14px 34px -26px rgba(180,35,24,0.5)" : "none",
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: barra && aceso ? cor.perigo : naoAvaliado ? cor.linha : cor.menta,
                  color: barra && aceso ? cor.branco : cor.verdeEscuro,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                {barra && aceso ? (
                  <Ban size={14} strokeWidth={2.6} />
                ) : (
                  <Check size={14} strokeWidth={3} />
                )}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: barra && aceso ? cor.perigo : cor.tinta,
                  fontWeight: barra && aceso ? 700 : 500,
                  flex: 1,
                }}
              >
                {portao}
              </span>
              <span
                style={{
                  fontFamily: fonte.mono,
                  fontSize: tamanho.micro,
                  color: barra && aceso ? cor.perigo : cor.tintaFraca,
                  letterSpacing: "0.08em",
                  flex: "none",
                }}
              >
                {barra && aceso ? "BARROU" : naoAvaliado ? "—" : "passou"}
              </span>
            </div>
          </Em>
        );
      })}

      {/* O caso concreto -------------------------------------------------- */}
      <Em x={EXEMPLO.x} y={EXEMPLO.y} largura={EXEMPLO.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 40, 26),
            transform: `translate3d(${(1 - progresso(frame, 40, 32, easeOutQuint)) * 18}px, 0, 0)`,
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
            O agente escreveu
          </div>

          {/* O texto que o modelo produziu — riscado depois que o portão barra. */}
          <div
            style={{
              background: cor.branco,
              border: `1px solid ${cor.borda}`,
              borderRadius: raio.grande,
              padding: "22px 26px",
              fontFamily: fonte.texto,
              fontSize: tamanho.corpo,
              color: frame > 182 ? cor.tintaFraca : cor.tinta,
              lineHeight: 1.5,
              textDecoration: frame > 182 ? "line-through" : "none",
            }}
          >
            “{PORTOES.exemplo.escreveu}”
          </div>

          <div
            style={{
              opacity: progresso(frame, 186, 22),
              marginTop: 20,
              background: cor.perigoFraco,
              border: `1px solid #F0C6C1`,
              borderRadius: raio.grande,
              padding: "20px 26px",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: cor.perigo,
                color: cor.branco,
                display: "grid",
                placeItems: "center",
                flex: "none",
              }}
            >
              <ShieldCheck size={19} strokeWidth={2.2} />
            </span>
            <div>
              <div
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.destaque,
                  fontWeight: 800,
                  color: cor.perigo,
                  letterSpacing: "-0.022em",
                }}
              >
                {PORTOES.exemplo.portao}
              </div>
              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tinta,
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                {PORTOES.exemplo.destino}
              </div>
            </div>
          </div>
        </div>
      </Em>

      <Raciocinio em={230}>{PORTOES.raciocinio}</Raciocinio>
    </Palco>
  );
}
