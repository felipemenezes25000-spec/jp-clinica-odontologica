import { Check, FlaskConical, X } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { PROVA } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 31 — A prova que o agente faz antes de falar com paciente.
 *
 * O VEREDICTO VEM PRIMEIRO, e grande, porque é a única coisa que alguém quer
 * saber ao abrir isso: pode ligar o envio? A lista de casos explica a resposta,
 * ela não é a resposta.
 *
 * O CASO REPROVADO FICA NA TELA, de propósito. Uma prova com 36 de 36 parece
 * enfeite; 34 de 36 com o caso que falhou à vista é a prova de que a régua é
 * real. E é justamente o caso que falha — "isso é normal doer 3 dias?" — que
 * mostra onde a linha entre conversa e consulta é fina.
 */

const VEREDICTO = { x: 120, y: 302, largura: 620 };
const CASOS = { x: 800, y: 302, largura: 1000 };

export function Cena31Prova() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="O agente"
        titulo={PROVA.titulo}
        subtitulo={PROVA.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {/* O veredicto ------------------------------------------------------ */}
      <Em x={VEREDICTO.x} y={VEREDICTO.y} largura={VEREDICTO.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 16, 26),
            transform: `translate3d(0, ${(1 - progresso(frame, 16, 32, easeOutQuint)) * 16}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            padding: "32px 34px",
          }}
        >
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.micro,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: cor.verde,
            }}
          >
            {PROVA.veredicto.rotulo}
          </div>
          <div
            style={{
              fontFamily: fonte.display,
              fontSize: 76,
              fontWeight: 800,
              color: cor.branco,
              letterSpacing: "-0.05em",
              lineHeight: 1,
              marginTop: 14,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Contador ate={PROVA.veredicto.acertos} em={24} dur={40} />
            <span style={{ fontSize: 40, color: "#5E8A52" }}> / {PROVA.veredicto.total}</span>
          </div>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              color: "#B8D9A4",
              marginTop: 14,
            }}
          >
            casos de teste · {PROVA.veredicto.validade}
          </div>
        </div>
      </Em>

      {/* O playground ----------------------------------------------------- */}
      <Em x={VEREDICTO.x} y={556} largura={VEREDICTO.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 168, 26),
            transform: `translate3d(0, ${(1 - progresso(frame, 168, 32, easeOutQuint)) * 12}px, 0)`,
            background: cor.iaFraco,
            border: `1px solid ${cor.ia}2e`,
            borderRadius: raio.enorme,
            padding: "24px 28px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
            <FlaskConical size={19} strokeWidth={2.2} color={cor.ia} />
            <span
              style={{
                fontFamily: fonte.display,
                fontSize: tamanho.corpo,
                fontWeight: 700,
                color: cor.tinta,
                letterSpacing: "-0.018em",
              }}
            >
              {PROVA.playground.titulo}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PROVA.playground.itens.map((item, i) => (
              <span
                key={item}
                style={{
                  opacity: progresso(frame, 182 + i * 8, 18),
                  background: cor.branco,
                  border: `1px solid ${cor.ia}33`,
                  borderRadius: raio.pilula,
                  padding: "9px 16px",
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.ia,
                  fontWeight: 600,
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </Em>

      {/* Os casos --------------------------------------------------------- */}
      {PROVA.casos.map((caso, i) => {
        const t = progresso(frame, 48 + i * 15, 22, easeOutQuint);
        return (
          <Em
            key={caso.caso}
            x={CASOS.x}
            y={CASOS.y + i * 74}
            largura={CASOS.largura}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * 14}px, 0, 0)`,
                height: 62,
                background: caso.ok ? cor.branco : cor.alertaFraco,
                border: `1px solid ${caso.ok ? cor.borda : "#F3DFC0"}`,
                borderRadius: raio.grande,
                padding: "0 22px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                boxShadow: caso.ok ? "none" : "0 12px 32px -28px rgba(180,83,9,0.45)",
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: caso.ok ? cor.menta : cor.alerta,
                  color: caso.ok ? cor.verdeEscuro : cor.branco,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                }}
              >
                {caso.ok ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tinta,
                  fontWeight: 600,
                  width: 340,
                  flex: "none",
                }}
              >
                {caso.caso}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: caso.ok ? cor.tintaSuave : cor.alerta,
                  flex: 1,
                  lineHeight: 1.35,
                }}
              >
                {caso.esperado}
              </span>
            </div>
          </Em>
        );
      })}

      <Raciocinio em={216}>{PROVA.raciocinio}</Raciocinio>
    </Palco>
  );
}
