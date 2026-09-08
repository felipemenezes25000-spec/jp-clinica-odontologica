import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { Escada } from "@/components/Graficos";
import { IMPACTO } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { progresso } from "@/motion/timing";

/**
 * CENA 24 — Impacto financeiro.
 *
 * A cena que o briefing pede e que mais precisa de contenção. A escada cresce,
 * mas o eixo NÃO tem número — porque não existe número honesto para colocar ali.
 * O que a peça pode afirmar é o encadeamento: mais contato produz mais resposta,
 * mais resposta produz mais agenda. Onde isso chega depende da clínica.
 *
 * O item 55 é explícito: nada de "aumenta a receita em X%". A frase de rodapé
 * está em tela, não só na documentação.
 */
export function Cena24Impacto() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena numero={24} />
      <TituloDeCena
        kicker="Impacto"
        titulo={IMPACTO.titulo}
        alinhamento="centro"
        em={2}
        y={116}
        nivel={2}
      />

      <Em x={320} y={330} zIndex={8}>
        <Escada etapas={IMPACTO.cadeia} em={26} largura={1280} altura={390} />
      </Em>

      <Em x={960} y={862} ancora="topo-centro" largura={1180} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 150, 28),
            textAlign: "center",
            fontFamily: fonte.display,
            fontSize: tamanho.cabecalho,
            fontWeight: 700,
            color: cor.tinta,
            letterSpacing: "-0.022em",
            lineHeight: 1.25,
          }}
        >
          O sistema aumenta a chance de o paciente voltar.
          <br />
          Quanto isso vira em receita depende da clínica.
        </div>
      </Em>

      <NotaDeCena em={172} x={360} largura={1200} y={962} style={{ textAlign: "center" }}>
        {IMPACTO.aviso}
      </NotaDeCena>
    </Palco>
  );
}
