import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { RESULTADOS_TEXTO } from "@/data/conteudo";
import { ILUSTRATIVO, RESULTADOS } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { cor, fonte, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Barra, Contador } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 21 — Resultados acumulados.
 *
 * Quatro números grandes, com a barra embaixo mostrando a queda de um para o
 * outro. A barra existe para impedir a leitura errada: 287 agendamentos ao lado
 * de 4.281 trabalhados poderia parecer decepcionante lido isolado — e é a razão
 * de a proporção estar visível.
 *
 * Todos carimbados como exemplo ilustrativo (item 43). Quando houver dado real,
 * `ILUSTRATIVO` vira `false` em `data/metricas.ts` e o carimbo some.
 */

const COLUNA_LARGURA = 380;
const ESPACO = 40;
const X0 = (1920 - (4 * COLUNA_LARGURA + 3 * ESPACO)) / 2;

export function Cena21Resultados() {
  const frame = useFrame();
  const topo = RESULTADOS[0]!.valor;

  return (
    <Palco>
      <SeloDeCena numero={21} />
      <TituloDeCena
        kicker="Resultados"
        titulo={RESULTADOS_TEXTO.titulo}
        alinhamento="centro"
        em={2}
        y={128}
      />

      {RESULTADOS.map((resultado, i) => {
        const em = 40 + i * 16;
        const t = progresso(frame, em, 26, easeOutQuint);
        return (
          <Em
            key={resultado.rotulo}
            x={X0 + i * (COLUNA_LARGURA + ESPACO)}
            y={396}
            largura={COLUNA_LARGURA}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 22}px, 0)`,
              }}
            >
              <div
                style={{
                  fontFamily: fonte.display,
                  fontSize: 104,
                  fontWeight: 800,
                  color: i === 0 ? cor.tinta : cor.verdeEscuro,
                  letterSpacing: "-0.05em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <Contador ate={resultado.valor} em={em + 4} dur={56} />
              </div>

              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.destaque,
                  color: cor.tintaSuave,
                  marginTop: 18,
                  fontWeight: 500,
                }}
              >
                {resultado.rotulo}
              </div>

              <Barra
                razao={resultado.valor / topo}
                em={em + 10}
                dur={48}
                cor={i === 0 ? cor.tinta : cor.verde}
                altura={8}
                style={{ marginTop: 22 }}
              />

              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.tintaFraca,
                  marginTop: 12,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {i === 0 ? "base trabalhada" : `${((resultado.valor / topo) * 100).toFixed(1)}% da base`}
              </div>
            </div>
          </Em>
        );
      })}

      {ILUSTRATIVO && (
        <Em x={960} y={800} ancora="topo-centro" zIndex={9}>
          <div style={{ opacity: progresso(frame, 150, 26), textAlign: "center" }}>
            <Ilustrativo />
          </div>
        </Em>
      )}

      <Em x={960} y={860} ancora="topo-centro" largura={1100} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 164, 26),
            textAlign: "center",
            fontFamily: fonte.texto,
            fontSize: tamanho.corpo,
            color: cor.tintaSuave,
            lineHeight: 1.55,
          }}
        >
          Os números que a clínica vai ver aqui são os dela. Estes servem para mostrar a forma do
          relatório, não para prever resultado.
        </div>
      </Em>
    </Palco>
  );
}
