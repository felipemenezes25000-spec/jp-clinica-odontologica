import { TrendingDown } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { RISCO } from "@/data/conteudo";
import { ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 09 — Quem está no caminho de sumir.
 *
 * A frase do título é o argumento inteiro: ninguém cancela um dentista. Não
 * existe evento de saída, não existe data de cancelamento — existe uma ausência
 * que vai ficando longa até alguém notar, e normalmente ninguém nota.
 *
 * O NÚMERO DE RISCO VEM COM O MOTIVO ao lado, como todo número do filme: "78"
 * sozinho é palpite; "78 — limpeza a cada 6 meses, está em 11" é leitura.
 */

const SINAIS = { x: 120, y: 344, largura: 940, altura: 96, espaco: 12 };
const CARTAO = { x: 1140, y: 344, largura: 660 };

export function Cena09Risco() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Quem precisa de contato"
        titulo={RISCO.titulo}
        subtitulo={RISCO.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1080}
      />

      {/* Os quatro sinais ------------------------------------------------- */}
      {RISCO.sinais.map((sinal, i) => {
        const t = progresso(frame, 18 + i * 12, 24, easeOutQuint);
        return (
          <Em
            key={sinal.rotulo}
            x={SINAIS.x}
            y={SINAIS.y + i * (SINAIS.altura + SINAIS.espaco)}
            largura={SINAIS.largura}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(${(1 - t) * -14}px, 0, 0)`,
                height: SINAIS.altura,
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.grande,
                padding: "0 26px",
                display: "flex",
                alignItems: "center",
                gap: 20,
                boxShadow: "0 12px 32px -28px rgba(3,47,1,0.42)",
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: cor.alertaFraco,
                  color: cor.alerta,
                  display: "grid",
                  placeItems: "center",
                  flex: "none",
                  fontFamily: fonte.display,
                  fontWeight: 800,
                  fontSize: tamanho.legenda,
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.destaque,
                  fontWeight: 700,
                  color: cor.tinta,
                  letterSpacing: "-0.018em",
                  width: 330,
                  flex: "none",
                }}
              >
                {sinal.rotulo}
              </span>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.apoio,
                  color: cor.tintaSuave,
                  lineHeight: 1.35,
                }}
              >
                {sinal.detalhe}
              </span>
            </div>
          </Em>
        );
      })}

      {/* O caso, com o número e o porquê --------------------------------- */}
      <Em x={CARTAO.x} y={CARTAO.y} largura={CARTAO.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 88, 28),
            transform: `translate3d(${(1 - progresso(frame, 88, 34, easeOutQuint)) * 20}px, 0, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            boxShadow: sombra.alta,
            padding: "34px 36px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <TrendingDown size={20} strokeWidth={2.2} color={cor.verde} />
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
              Risco de não voltar
            </span>
          </div>

          <div
            style={{
              fontFamily: fonte.display,
              fontSize: 96,
              fontWeight: 800,
              color: cor.branco,
              letterSpacing: "-0.05em",
              lineHeight: 1,
              marginTop: 18,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Contador ate={RISCO.exemplo.risco} em={96} dur={44} />
          </div>

          <div
            style={{
              fontFamily: fonte.display,
              fontSize: tamanho.destaque,
              fontWeight: 700,
              color: cor.branco,
              marginTop: 22,
              letterSpacing: "-0.02em",
            }}
          >
            {RISCO.exemplo.nome}
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
            {RISCO.exemplo.motivo}
          </div>
        </div>
      </Em>

      {ILUSTRATIVO && (
        <Em x={CARTAO.x} y={766} zIndex={9}>
          <div style={{ opacity: progresso(frame, 158, 24) }}>
            <Ilustrativo />
          </div>
        </Em>
      )}

      <Raciocinio em={168}>{RISCO.raciocinio}</Raciocinio>
    </Palco>
  );
}
