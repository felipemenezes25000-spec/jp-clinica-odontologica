import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { Funil } from "@/components/Graficos";
import { FUNIL_TEXTO } from "@/data/conteudo";
import { FUNIL, ILUSTRATIVO } from "@/data/metricas";
import { Em, Ilustrativo, Palco } from "@/design-system/primitivas";
import { useFrame } from "@/motion/frame";
import { progresso } from "@/motion/timing";

/**
 * CENA 29 — O funil.
 *
 * Seis etapas, cada uma com o número e o percentual sobre o topo. O percentual é
 * o que transforma a figura de decorativa em útil: sem ele o funil é só uma
 * escada bonita; com ele dá para perguntar "por que caiu tanto entre contatado e
 * respondeu?" — que é a pergunta que faz alguém mexer na operação.
 */
export function Cena29Funil() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Etapa por etapa"
        titulo={FUNIL_TEXTO.titulo}
        em={2}
        y={104}
        largura={1240}
        nivel={2}
      />

      <Em x={170} y={288} zIndex={8}>
        <Funil etapas={FUNIL} em={26} largura={980} alturaEtapa={78} espaco={14} />
      </Em>

      {ILUSTRATIVO && (
        <Em x={1566} y={196} zIndex={9}>
          <div style={{ opacity: progresso(frame, 120, 26) }}>
            <Ilustrativo />
          </div>
        </Em>
      )}

      <NotaDeCena em={140} x={170}>
        {FUNIL_TEXTO.nota}
      </NotaDeCena>
    </Palco>
  );
}
