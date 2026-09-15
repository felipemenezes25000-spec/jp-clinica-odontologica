import { ArrowRight, BookOpen, Search } from "lucide-react";
import { Raciocinio, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { CONHECIMENTO } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 30 — O que a clínica ensina ao agente.
 *
 * A cena existe para tirar do espectador a ideia de que o agente "sabe as
 * coisas". Ele não sabe: ele procura no que a clínica escreveu. E a pergunta que
 * fica de pé é "como eu tenho certeza de que ele vai achar?".
 *
 * Por isso a CAIXA DE BUSCA está no alto e é o elemento maior da tela — igual à
 * tela de verdade, e pelo mesmo motivo: é a única forma de responder aquela
 * pergunta hoje, em vez de descobrir em três semanas numa conversa real.
 *
 * As três etapas embaixo estão separadas porque os custos são diferentes, e
 * dizer isso em voz alta é o que justifica a separação para quem assiste.
 */

const BUSCA = { x: 260, y: 306, largura: 1400 };
const ETAPAS = { y: 622, largura: 440 };
const ETAPA_X = [260, 760, 1260];

export function Cena30Conhecimento() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="O agente"
        titulo={CONHECIMENTO.titulo}
        subtitulo={CONHECIMENTO.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1200}
      />

      {/* A pergunta de teste ---------------------------------------------- */}
      <Em x={BUSCA.x} y={BUSCA.y} largura={BUSCA.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 16, 26),
            transform: `translate3d(0, ${(1 - progresso(frame, 16, 32, easeOutQuint)) * 14}px, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.bordaForte}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            padding: "24px 28px",
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: cor.iaFraco,
              color: cor.ia,
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <Search size={21} strokeWidth={2.2} />
          </span>
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.destaque,
              color: cor.tinta,
              fontWeight: 500,
              flex: 1,
            }}
          >
            {CONHECIMENTO.teste.pergunta}
          </span>
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              color: cor.tintaFraca,
              flex: "none",
            }}
          >
            o que o agente acha?
          </span>
        </div>
      </Em>

      {/* O que ele achou -------------------------------------------------- */}
      <Em x={BUSCA.x} y={438} largura={BUSCA.largura} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 56, 26),
            transform: `translate3d(0, ${(1 - progresso(frame, 56, 32, easeOutQuint)) * 12}px, 0)`,
            background: cor.menta,
            border: `1px solid #CDE7B4`,
            borderRadius: raio.enorme,
            padding: "24px 28px",
            display: "flex",
            gap: 20,
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 13,
              background: cor.branco,
              color: cor.verdeEscuro,
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <BookOpen size={19} strokeWidth={2.1} />
          </span>
          <div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.micro,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontWeight: 700,
                color: cor.verdeEscuro,
              }}
            >
              {CONHECIMENTO.teste.achou}
            </div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.corpo,
                color: cor.tinta,
                marginTop: 10,
                lineHeight: 1.5,
              }}
            >
              “{CONHECIMENTO.teste.trecho}”
            </div>
          </div>
        </div>
      </Em>

      {/* As três etapas, e o custo de cada uma ---------------------------- */}
      {CONHECIMENTO.etapas.map((etapa, i) => {
        const t = progresso(frame, 100 + i * 16, 24, easeOutQuint);
        const publicar = i === 2;
        return (
          <Em key={etapa.rotulo} x={ETAPA_X[i]!} y={ETAPAS.y} largura={ETAPAS.largura} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 14}px, 0)`,
                display: "flex",
                alignItems: "center",
                gap: 14,
              }}
            >
              <div
                style={{
                  flex: 1,
                  background: publicar ? cor.profundo : cor.branco,
                  border: `1px solid ${publicar ? cor.profundo : cor.borda}`,
                  borderRadius: raio.grande,
                  padding: "20px 24px",
                }}
              >
                <div
                  style={{
                    fontFamily: fonte.display,
                    fontSize: tamanho.destaque,
                    fontWeight: 800,
                    color: publicar ? cor.branco : cor.tinta,
                    letterSpacing: "-0.022em",
                  }}
                >
                  {etapa.rotulo}
                </div>
                <div
                  style={{
                    fontFamily: fonte.texto,
                    fontSize: tamanho.legenda,
                    color: publicar ? "#B8D9A4" : cor.tintaSuave,
                    marginTop: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {etapa.detalhe}
                </div>
              </div>
              {i < 2 && (
                <ArrowRight size={20} strokeWidth={2.4} color={cor.bordaForte} style={{ flex: "none" }} />
              )}
            </div>
          </Em>
        );
      })}

      <Raciocinio em={168}>{CONHECIMENTO.raciocinio}</Raciocinio>
    </Palco>
  );
}
