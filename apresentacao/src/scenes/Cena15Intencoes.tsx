import { ArrowRight } from "lucide-react";
import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { INTENCOES } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 15 — Outras intenções.
 *
 * A cena que impede a peça de vender uma IA que só sabe lidar com o caso feliz.
 * Cinco respostas reais, e o que o sistema faz com cada uma — inclusive as duas
 * que ele NÃO resolve sozinho.
 *
 * "Não quero receber mensagens" está no meio da lista de propósito. Opt-out
 * tratado como caso normal, e não como exceção envergonhada, é o que dá
 * credibilidade ao resto.
 */

const LINHA = { x: 200, largura: 1520, altura: 98, espaco: 20, y0: 306 };
const COL_FALA = 660;
const COL_SAIDA = 380;

export function Cena15Intencoes() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena numero={15} />
      <TituloDeCena kicker="Leitura de intenção" titulo={INTENCOES.titulo} em={2} />

      {INTENCOES.casos.map((caso, i) => {
        const em = 26 + i * 14;
        const t = progresso(frame, em, 22, easeOutQuint);
        const humano = caso.acao.includes("humano") || caso.acao.includes("Humano");
        const saida = progresso(frame, em + 8, 18, easeOutQuint);
        const acao = progresso(frame, em + 14, 18, easeOutQuint);

        return (
          <Em
            key={caso.fala}
            x={LINHA.x}
            y={LINHA.y0 + i * (LINHA.altura + LINHA.espaco)}
            largura={LINHA.largura}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 14}px, 0)`,
                height: LINHA.altura,
                display: "flex",
                alignItems: "center",
                gap: 22,
              }}
            >
              {/* O que o paciente escreveu */}
              <div
                style={{
                  width: COL_FALA,
                  flex: "none",
                  background: cor.whatsappFraco,
                  border: "1px solid #CFEEDC",
                  borderRadius: 20,
                  borderBottomRightRadius: 7,
                  padding: "20px 26px",
                }}
              >
                <span
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.destaque,
                    color: cor.tinta,
                    fontWeight: 500,
                  }}
                >
                  “{caso.fala}”
                </span>
              </div>

              <ArrowRight
                size={22}
                strokeWidth={2.4}
                color={cor.bordaForte}
                style={{ opacity: saida, flex: "none" }}
              />

              {/* Como a IA classificou */}
              <div
                style={{
                  width: COL_SAIDA,
                  flex: "none",
                  opacity: saida,
                  padding: "16px 22px",
                  borderRadius: raio.medio,
                  background: cor.iaFraco,
                  border: `1px solid ${cor.ia}2e`,
                }}
              >
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.micro,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    color: cor.ia,
                    marginBottom: 6,
                  }}
                >
                  Intenção
                </div>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.corpo,
                    color: cor.tinta,
                    fontWeight: 600,
                  }}
                >
                  {caso.saida}
                </div>
              </div>

              <ArrowRight
                size={22}
                strokeWidth={2.4}
                color={cor.bordaForte}
                style={{ opacity: acao, flex: "none" }}
              />

              {/* O que acontece em seguida */}
              <div
                style={{
                  flex: 1,
                  opacity: acao,
                  padding: "16px 22px",
                  borderRadius: raio.medio,
                  background: humano ? cor.branco : cor.menta,
                  border: `1px solid ${humano ? cor.bordaForte : "#CDE7B4"}`,
                }}
              >
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.micro,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    fontWeight: 700,
                    color: humano ? cor.tintaSuave : cor.verdeEscuro,
                    marginBottom: 6,
                  }}
                >
                  {humano ? "Passa para a equipe" : "Ação"}
                </div>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.corpo,
                    color: cor.tinta,
                    fontWeight: 600,
                  }}
                >
                  {caso.acao}
                </div>
              </div>
            </div>
          </Em>
        );
      })}

      {/* A régua que separa o que a automação faz do que ela não faz. */}
      <Em x={LINHA.x} y={LINHA.y0 + 5 * (LINHA.altura + LINHA.espaco) + 8} largura={LINHA.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 128, 26),
            display: "flex",
            gap: 34,
            fontFamily: fonte.texto,
            fontSize: tamanho.legenda,
            color: cor.tintaSuave,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <span
              style={{ width: 11, height: 11, borderRadius: 3, background: cor.menta, border: "1px solid #CDE7B4" }}
            />
            Automação resolve
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
            <span
              style={{ width: 11, height: 11, borderRadius: 3, background: cor.branco, border: `1px solid ${cor.bordaForte}` }}
            />
            Equipe assume
          </span>
        </div>
      </Em>
    </Palco>
  );
}
