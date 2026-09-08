import { AbsoluteFill } from "remotion";
import { Marca } from "@/components/Marca";
import { Halo } from "@/design-system/primitivas";
import { cor, fonte, raio } from "@/design-system/tokens";
import { useEsperarFontes } from "./FilmeRemotion";

/**
 * A capa (thumbnail).
 *
 * `npm run video:thumbnail` gera o PNG. É a imagem que vai no player, no
 * WhatsApp e no slide — e é a única peça aqui que precisa funcionar como imagem
 * PARADA: sem movimento para explicar nada, a cadeia dos quatro blocos tem que
 * contar a história sozinha.
 *
 * Não usa as primitivas de movimento de propósito: elas dependem de
 * `useFrame()`, e um still não tem linha do tempo.
 */

const CADEIA = [
  { titulo: "Dental Office", legenda: "os dados da clínica", cor: cor.dentalOffice },
  { titulo: "JP CRC", legenda: "vira oportunidade", cor: cor.verdeEscuro },
  { titulo: "IA + WhatsApp", legenda: "vira conversa", cor: cor.whatsapp },
  { titulo: "Mais pacientes", legenda: "recuperados", cor: cor.verde },
] as const;

export function Capa() {
  useEsperarFontes();

  return (
    <AbsoluteFill style={{ background: cor.fundo, overflow: "hidden" }}>
      <Halo x={960} y={470} raio={620} intensidade={0.11} />

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 120px",
        }}
      >
        <Marca chave="jp" altura={78} />

        <div
          style={{
            fontFamily: fonte.display,
            fontSize: 132,
            fontWeight: 800,
            letterSpacing: "-0.05em",
            color: cor.verdeEscuro,
            marginTop: 44,
            lineHeight: 1,
          }}
        >
          JP CRC
        </div>

        <div
          style={{
            fontFamily: fonte.texto,
            fontSize: 34,
            color: cor.tintaSuave,
            marginTop: 22,
            textAlign: "center",
          }}
        >
          Inteligência que transforma dados em ação.
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 18,
            marginTop: 72,
          }}
        >
          {CADEIA.map((bloco, i) => (
            <div key={bloco.titulo} style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div
                style={{
                  width: 336,
                  background: cor.branco,
                  border: `1px solid ${cor.borda}`,
                  borderRadius: raio.enorme,
                  boxShadow: "0 26px 64px -44px rgba(3,47,1,0.5)",
                  overflow: "hidden",
                }}
              >
                <div style={{ height: 5, background: bloco.cor }} />
                <div style={{ padding: "26px 28px" }}>
                  <div
                    style={{
                      fontFamily: fonte.display,
                      fontSize: 30,
                      fontWeight: 800,
                      color: cor.tinta,
                      letterSpacing: "-0.022em",
                    }}
                  >
                    {bloco.titulo}
                  </div>
                  <div
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: 20,
                      color: cor.tintaSuave,
                      marginTop: 8,
                    }}
                  >
                    {bloco.legenda}
                  </div>
                </div>
              </div>

              {i < CADEIA.length - 1 && (
                <span style={{ color: cor.bordaForte, fontSize: 30, lineHeight: 1 }}>→</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}
