import { ArrowUpRight, Sunrise } from "lucide-react";
import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { BRIEFING } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 44 — A manhã de quem é dono.
 *
 * Quatro linhas com a VARIAÇÃO ao lado, porque o número sozinho não responde a
 * pergunta da manhã. "Ocupação 78%" não diz nada; "78%, +6 pontos" diz que a
 * semana está melhor, e é isso que faz alguém continuar lendo.
 *
 * E a cena termina dizendo que este painel NÃO AGE. É contra-intuitivo num
 * vídeo de vendas, e é justamente o que impede o painel de virar um lugar de
 * disparar coisa em cima da própria métrica — a ação mora na tela do assunto.
 */

const LINHAS = { x: 160, y: 300, largura: 940, altura: 88, espaco: 10 };
const ONDE = { x: 1160, y: 300, largura: 640 };

export function Cena44Briefing() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Resultados"
        titulo={BRIEFING.titulo}
        subtitulo={BRIEFING.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {/* O que mudou ------------------------------------------------------ */}
      {BRIEFING.linhas.map((linha, i) => {
        const t = progresso(frame, 16 + i * 12, 24, easeOutQuint);
        const bom = linha.bom;
        return (
          <Em
            key={linha.rotulo}
            x={LINHAS.x}
            y={LINHAS.y + i * (LINHAS.altura + LINHAS.espaco)}
            largura={LINHAS.largura}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * -12}px, 0, 0)`,
                height: LINHAS.altura,
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.grande,
                padding: "0 28px",
                display: "flex",
                alignItems: "center",
                gap: 22,
                boxShadow: "0 12px 32px -28px rgba(3,47,1,0.4)",
              }}
            >
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tintaSuave,
                  flex: 1,
                }}
              >
                {linha.rotulo}
              </span>
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: 40,
                  fontWeight: 800,
                  color: cor.tinta,
                  letterSpacing: "-0.035em",
                  fontVariantNumeric: "tabular-nums",
                  flex: "none",
                }}
              >
                {linha.valor}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  fontWeight: 700,
                  color: bom ? cor.verdeEscuro : cor.alerta,
                  background: bom ? cor.menta : cor.alertaFraco,
                  borderRadius: raio.pilula,
                  padding: "7px 14px",
                  width: 118,
                  textAlign: "center",
                  flex: "none",
                }}
              >
                {linha.variacao}
              </span>
            </div>
          </Em>
        );
      })}

      {/* Para onde ir ----------------------------------------------------- */}
      <Em x={ONDE.x} y={ONDE.y} largura={ONDE.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 70, 26),
            transform: `translate3d(${(1 - progresso(frame, 70, 32, easeOutQuint)) * 18}px, 0, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            padding: "28px 30px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 20 }}>
            <Sunrise size={19} strokeWidth={2.2} color={cor.verde} />
            <span
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.micro,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: cor.verde,
              }}
            >
              Para onde ir
            </span>
          </div>

          {BRIEFING.paraOnde.map((item, i) => (
            <div
              key={item.assunto}
              style={{
                opacity: progresso(frame, 86 + i * 12, 22),
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "15px 0",
                borderBottom:
                  i === BRIEFING.paraOnde.length - 1 ? "none" : `1px solid #0B4A05`,
              }}
            >
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: "#B8D9A4",
                  flex: 1,
                }}
              >
                {item.assunto}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  fontWeight: 700,
                  color: cor.branco,
                  flex: "none",
                }}
              >
                {item.tela}
              </span>
              <ArrowUpRight size={16} strokeWidth={2.4} color={cor.verde} style={{ flex: "none" }} />
            </div>
          ))}

          <div
            style={{
              opacity: progresso(frame, 132, 24),
              marginTop: 22,
              paddingTop: 20,
              borderTop: `1px solid #0B4A05`,
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              color: cor.verde,
              fontWeight: 600,
              lineHeight: 1.45,
            }}
          >
            {BRIEFING.nota}
          </div>
        </div>
      </Em>

      <NotaDeCena em={156} x={LINHAS.x} largura={940}>
        {BRIEFING.raciocinio}
      </NotaDeCena>
    </Palco>
  );
}
