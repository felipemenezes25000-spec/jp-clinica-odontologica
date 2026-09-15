import { Info } from "lucide-react";
import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { RADAR } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 40 — O Radar de Receita, e a decisão de honestidade que o define.
 *
 * ESTA CENA EXISTE PARA MOSTRAR UM NÚMERO MENOR DO QUE O SISTEMA PODERIA
 * MOSTRAR. O valor potencial — a soma de tudo que aconteceria se todos
 * fechassem tudo — é maior, mais bonito e é o que um concorrente colocaria no
 * meio da tela. Aqui ele fica ao lado, menor, com a etiqueta "se tudo fechar".
 *
 * O destaque é o valor ESPERADO, que já tem a probabilidade dentro. É a única
 * versão do número que sobrevive à conferência do fim do mês — e depois dessa
 * conferência, ou o sistema inteiro tem credibilidade, ou nenhuma tela dele tem.
 *
 * O aviso de estimativa está na cena pelo mesmo motivo, e não como rodapé
 * jurídico: enquanto a clínica não tem histórico próprio, a chance é palpite
 * calibrado, e dizer isso é o que autoriza o número a existir.
 */

const ESPERADO = { x: 120, y: 306, largura: 900 };
const FAIXAS = { x: 1100, y: 306, largura: 700 };

export function Cena40Radar() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Resultados"
        titulo={RADAR.titulo}
        subtitulo={RADAR.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1050}
      />

      {/* O esperado, grande ---------------------------------------------- */}
      <Em x={ESPERADO.x} y={ESPERADO.y} largura={ESPERADO.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 16, 28),
            transform: `translate3d(0, ${(1 - progresso(frame, 16, 34, easeOutQuint)) * 16}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            boxShadow: sombra.alta,
            padding: "36px 38px",
          }}
        >
          <div
            style={{
              fontFamily: fonte.display,
              fontSize: 82,
              fontWeight: 800,
              color: cor.branco,
              letterSpacing: "-0.05em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {RADAR.esperado.valor}
          </div>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.corpo,
              color: cor.verde,
              marginTop: 16,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            {RADAR.esperado.rotulo}
          </div>
        </div>
      </Em>

      {/* O potencial, ao lado e menor ------------------------------------ */}
      <Em x={ESPERADO.x} y={518} largura={ESPERADO.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 56, 26),
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.grande,
            padding: "22px 28px",
            display: "flex",
            alignItems: "baseline",
            gap: 20,
          }}
        >
          <span
            style={{
              fontFamily: fonte.display,
              fontSize: 40,
              fontWeight: 800,
              color: cor.tintaSuave,
              letterSpacing: "-0.035em",
              fontVariantNumeric: "tabular-nums",
              flex: "none",
            }}
          >
            {RADAR.potencial.valor}
          </span>
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.apoio,
              color: cor.tintaFraca,
            }}
          >
            {RADAR.potencial.rotulo}
          </span>
        </div>
      </Em>

      {/* Por chance ------------------------------------------------------- */}
      <Em x={FAIXAS.x} y={FAIXAS.y} largura={FAIXAS.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 84, 26),
            transform: `translate3d(${(1 - progresso(frame, 84, 32, easeOutQuint)) * 18}px, 0, 0)`,
          }}
        >
          {RADAR.faixas.map((faixa, i) => {
            const t = progresso(frame, 96 + i * 14, 22, easeOutQuint);
            const intensidade = [cor.verde, "#8FC46A", cor.bordaForte][i] ?? cor.bordaForte;
            return (
              <div
                key={faixa.rotulo}
                style={{
                  opacity: t,
                  background: cor.branco,
                  border: `1px solid ${cor.borda}`,
                  borderRadius: raio.grande,
                  padding: "20px 24px",
                  marginBottom: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 40,
                    borderRadius: 999,
                    background: intensidade,
                    flex: "none",
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.apoio,
                      color: cor.tinta,
                      fontWeight: 600,
                    }}
                  >
                    {faixa.rotulo}
                  </div>
                  <div
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.legenda,
                      color: cor.tintaFraca,
                      marginTop: 4,
                    }}
                  >
                    {faixa.quantos} pacientes
                  </div>
                </div>
                <span
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.destaque,
                    fontWeight: 800,
                    color: cor.verdeEscuro,
                    letterSpacing: "-0.025em",
                    fontVariantNumeric: "tabular-nums",
                    flex: "none",
                  }}
                >
                  {faixa.valor}
                </span>
              </div>
            );
          })}

          <div
            style={{
              opacity: progresso(frame, 150, 24),
              marginTop: 18,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
            }}
          >
            <Info size={16} strokeWidth={2.3} color={cor.alerta} style={{ flex: "none", marginTop: 2 }} />
            <span
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.legenda,
                color: cor.tintaSuave,
                lineHeight: 1.45,
              }}
            >
              {RADAR.aviso}
            </span>
          </div>
        </div>
      </Em>

      <NotaDeCena em={170} x={ESPERADO.x} largura={900} y={650}>
        {RADAR.raciocinio}
      </NotaDeCena>
    </Palco>
  );
}
