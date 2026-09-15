import { Receipt } from "lucide-react";
import { NotaDeCena, Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { CUSTO_IA } from "@/data/conteudo";
import { ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 45 — O que a inteligência artificial custa.
 *
 * Uma cena sobre dinheiro que o vídeo poderia omitir, e é justamente por isso
 * que ela entra: custo de IA que ninguém vê é a conta que surpreende no cartão,
 * e a primeira coisa que alguém desliga com raiva.
 *
 * A BARRA MOSTRA O TETO, e não só o gasto. Ver R$ 84 sozinho não informa nada;
 * ver R$ 84 dentro de um teto de R$ 300 responde a pergunta que a pessoa tem —
 * "isso pode explodir?".
 */

const CARTOES = { y: 308, largura: 500 };
const CARTAO_X = [160, 710, 1260];

export function Cena45CustoIa() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Resultados"
        titulo={CUSTO_IA.titulo}
        subtitulo={CUSTO_IA.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1100}
      />

      {CUSTO_IA.numeros.map((n, i) => {
        const t = progresso(frame, 18 + i * 14, 26, easeOutQuint);
        const teto = i === 1;
        return (
          <Em key={n.rotulo} x={CARTAO_X[i]!} y={CARTOES.y} largura={CARTOES.largura} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 16}px, 0)`,
                background: i === 0 ? cor.profundo : cor.branco,
                border: `1px solid ${i === 0 ? cor.profundo : cor.borda}`,
                borderRadius: raio.enorme,
                boxShadow: i === 0 ? sombra.alta : sombra.suave,
                padding: "32px 34px",
              }}
            >
              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.micro,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  color: i === 0 ? cor.verde : cor.tintaSuave,
                }}
              >
                {n.rotulo}
              </div>
              <div
                style={{
                  fontFamily: fonte.display,
                  fontSize: 58,
                  fontWeight: 800,
                  color: i === 0 ? cor.branco : teto ? cor.tintaSuave : cor.verdeEscuro,
                  letterSpacing: "-0.045em",
                  lineHeight: 1,
                  marginTop: 16,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {n.valor}
              </div>
            </div>
          </Em>
        );
      })}

      {/* Gasto dentro do teto — a barra responde "isso pode explodir?". */}
      <Em x={160} y={520} largura={1600} zIndex={8}>
        <div style={{ opacity: progresso(frame, 78, 26) }}>
          <div
            style={{
              height: 30,
              borderRadius: raio.pilula,
              background: cor.linha,
              overflow: "hidden",
            }}
          >
            <span
              style={{
                display: "block",
                // 84,20 de 300,00 = 28%. A largura anima até lá e para.
                width: `${28 * progresso(frame, 88, 40, easeOutQuint)}%`,
                height: "100%",
                borderRadius: raio.pilula,
                background: cor.verde,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 12,
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              color: cor.tintaSuave,
            }}
          >
            <span>Gasto até agora</span>
            <span style={{ fontWeight: 700, color: cor.tinta }}>
              O teto — daqui o sistema para
            </span>
          </div>
        </div>
      </Em>

      <Em x={160} y={620} largura={1200} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 140, 26),
            display: "flex",
            gap: 15,
            alignItems: "flex-start",
          }}
        >
          <Receipt size={19} strokeWidth={2.2} color={cor.verdeEscuro} style={{ flex: "none", marginTop: 2 }} />
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.corpo,
              color: cor.tinta,
              lineHeight: 1.45,
            }}
          >
            {CUSTO_IA.nota}
          </span>
        </div>
      </Em>

      {ILUSTRATIVO && (
        <Em x={160} y={712} zIndex={9}>
          <div style={{ opacity: progresso(frame, 160, 24) }}>
            <Ilustrativo />
          </div>
        </Em>
      )}

      <Raciocinio em={172}>{CUSTO_IA.raciocinio}</Raciocinio>
    </Palco>
  );
}
