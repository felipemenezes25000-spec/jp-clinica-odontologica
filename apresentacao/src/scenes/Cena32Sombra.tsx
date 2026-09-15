import { EyeOff, ShieldAlert } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { SOMBRA } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 32 — O modo de observação, e o que ele deixa ler.
 *
 * A cena que fecha o capítulo do agente, e o argumento é de confiança: dá para
 * ligar a inteligência sem que ninguém receba nada, e LER o que ela teria dito.
 *
 * A FAIXA VEM ANTES DA LISTA. A pergunta de quem olha isso não é "o que ele
 * escreveu?", é "ele mandou alguma coisa?" — e a resposta precisa estar
 * respondida antes de o olho chegar no primeiro texto.
 *
 * O custo por turno aparece porque é a segunda pergunta de todo dono de clínica,
 * e porque um número pequeno à vista vale mais que qualquer promessa de "é
 * barato".
 */

const LISTA = { x: 200, y: 386, largura: 1520 };

export function Cena32Sombra() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="O agente"
        titulo={SOMBRA.titulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {/* A faixa que responde a pergunta -------------------------------- */}
      <Em x={200} y={272} largura={1520} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 14, 26),
            transform: `translate3d(0, ${(1 - progresso(frame, 14, 32, easeOutQuint)) * 12}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            padding: "22px 30px",
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              background: "#0B4A05",
              color: cor.verde,
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <EyeOff size={20} strokeWidth={2.1} />
          </span>
          <span
            style={{
              fontFamily: fonte.display,
              fontSize: tamanho.destaque,
              fontWeight: 800,
              color: cor.branco,
              letterSpacing: "-0.022em",
            }}
          >
            {SOMBRA.faixa}
          </span>
        </div>
      </Em>

      {/* Os turnos -------------------------------------------------------- */}
      {SOMBRA.turnos.map((turno, i) => {
        const t = progresso(frame, 44 + i * 22, 24, easeOutQuint);
        const barrado = turno.portao !== null;

        return (
          <Em
            key={turno.paciente}
            x={LISTA.x}
            y={LISTA.y + i * 108}
            largura={LISTA.largura}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 14}px, 0)`,
                background: cor.branco,
                border: `1px solid ${barrado ? "#F0C6C1" : cor.borda}`,
                borderRadius: raio.grande,
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                gap: 22,
                boxShadow: "0 12px 32px -28px rgba(3,47,1,0.4)",
              }}
            >
              <div style={{ width: 400, flex: "none" }}>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.micro,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    color: cor.tintaFraca,
                  }}
                >
                  O paciente escreveu
                </div>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    color: cor.tinta,
                    marginTop: 7,
                    lineHeight: 1.35,
                  }}
                >
                  {turno.paciente}
                </div>
              </div>

              <span style={{ width: 1, height: 44, background: cor.linha, flex: "none" }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.micro,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    color: cor.tintaFraca,
                  }}
                >
                  O agente teria
                </div>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.apoio,
                    color: barrado ? cor.tintaFraca : cor.tinta,
                    marginTop: 7,
                    textDecoration: barrado ? "line-through" : "none",
                  }}
                >
                  {turno.resposta}
                </div>
              </div>

              {barrado && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 9,
                    background: cor.perigoFraco,
                    color: cor.perigo,
                    borderRadius: raio.pilula,
                    padding: "9px 16px",
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    fontWeight: 700,
                    flex: "none",
                  }}
                >
                  <ShieldAlert size={15} strokeWidth={2.4} />
                  {turno.portao}
                </span>
              )}

              <span
                style={{
                  fontFamily: fonte.mono,
                  fontSize: tamanho.legenda,
                  color: cor.tintaSuave,
                  width: 86,
                  textAlign: "right",
                  flex: "none",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {turno.custo}
              </span>
            </div>
          </Em>
        );
      })}

      <Raciocinio em={182}>{SOMBRA.raciocinio}</Raciocinio>
    </Palco>
  );
}
