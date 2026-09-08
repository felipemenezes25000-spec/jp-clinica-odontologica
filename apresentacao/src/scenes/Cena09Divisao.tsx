import { Bot, UserRound } from "lucide-react";
import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { DIVISAO } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOut, easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 09 — Humano × automação.
 *
 * A cena que evita o mal-entendido mais caro da peça: "então a máquina fala com
 * o paciente no meu lugar". Não. A tela se divide e cada lado ganha uma lista
 * concreta — e os itens do lado humano são justamente os que dariam problema se
 * uma automação tentasse resolver.
 *
 * Os dois lados têm o mesmo tamanho de propósito. Um lado maior sugeriria uma
 * hierarquia que não existe.
 */

const PAINEL = { largura: 720, y: 300, altura: 520 };
const ESQUERDA = 190;
const DIREITA = 1010;

function Lado({
  x,
  titulo,
  itens,
  icone,
  acento,
  em,
  legenda,
}: {
  x: number;
  titulo: string;
  itens: readonly string[];
  icone: React.ReactNode;
  acento: string;
  em: number;
  legenda: string;
}) {
  const frame = useFrame();
  const t = progresso(frame, em, 28, easeOutQuint);

  return (
    <Em x={x} y={PAINEL.y} largura={PAINEL.largura} zIndex={8}>
      <div
        style={{
          opacity: t,
          transform: `translate3d(${(1 - t) * (x < 960 ? -26 : 26)}px, 0, 0)`,
          minHeight: PAINEL.altura,
          background: cor.branco,
          border: `1px solid ${cor.borda}`,
          borderRadius: raio.enorme,
          overflow: "hidden",
          boxShadow: "0 26px 64px -44px rgba(3,47,1,0.55)",
        }}
      >
        <div style={{ height: 4, background: acento }} />
        <div style={{ padding: "28px 32px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span
              style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: `${acento}16`,
                color: acento,
                display: "grid",
                placeItems: "center",
                flex: "none",
              }}
            >
              {icone}
            </span>
            <div>
              <div
                style={{
                  fontFamily: fonte.display,
                  fontSize: 40,
                  fontWeight: 800,
                  color: cor.tinta,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                {titulo}
              </div>
              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.tintaSuave,
                  marginTop: 6,
                }}
              >
                {legenda}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 26 }}>
            {itens.map((item, i) => {
              const tt = progresso(frame, em + 24 + i * 12, 20, easeOutQuint);
              return (
                <div
                  key={item}
                  style={{
                    opacity: tt,
                    transform: `translate3d(0, ${(1 - tt) * 12}px, 0)`,
                    padding: "16px 0",
                    borderBottom: i === itens.length - 1 ? "none" : `1px solid ${cor.linha}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 999,
                      background: acento,
                      flex: "none",
                    }}
                  />
                  <span
                    style={{
                      fontFamily: fonte.texto,
                      fontSize: tamanho.corpo,
                      color: cor.tinta,
                      fontWeight: 500,
                    }}
                  >
                    {item}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Em>
  );
}

export function Cena09Divisao() {
  const frame = useFrame();
  const divisor = progresso(frame, 16, 40, easeOut);

  return (
    <Palco>
      <SeloDeCena numero={9} />
      <TituloDeCena
        kicker="Quem faz o quê"
        titulo={DIVISAO.titulo}
        subtitulo={DIVISAO.subtitulo}
        alinhamento="centro"
        em={2}
        y={92}
        nivel={2}
      />

      {/* O divisor que rasga a tela em dois. */}
      <Em x={960} y={PAINEL.y - 24} zIndex={6}>
        <div
          style={{
            width: 1.5,
            height: (PAINEL.altura + 48) * divisor,
            background: `linear-gradient(180deg, transparent, ${cor.bordaForte} 12%, ${cor.bordaForte} 88%, transparent)`,
          }}
        />
      </Em>

      <Lado
        x={ESQUERDA}
        titulo={DIVISAO.automacao.titulo}
        itens={DIVISAO.automacao.itens}
        icone={<Bot size={26} strokeWidth={2.1} />}
        acento={cor.verde}
        em={34}
        legenda="Casos simples, com regra clara"
      />

      <Lado
        x={DIREITA}
        titulo={DIVISAO.humano.titulo}
        itens={DIVISAO.humano.itens}
        icone={<UserRound size={26} strokeWidth={2.1} />}
        acento={cor.verdeEscuro}
        em={52}
        legenda="Casos que pedem julgamento"
      />
    </Palco>
  );
}
