import { Copy, RefreshCw, Repeat, Timer, Webhook } from "lucide-react";
import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { CamadaDeConexoes, Conexao } from "@/components/Conexao";
import { No } from "@/components/No";
import { INTEGRACAO } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { easeOutQuint, progresso } from "@/motion/timing";
import { curvaH, curvaV } from "@/utils/caminho";

/**
 * CENA 04 — n8n + backend.
 *
 * A cena mais técnica da peça, e por isso a mais curta. A narração NÃO explica
 * webhook nem deduplicação — quem assiste não precisa saber o que é. O que a
 * cena precisa entregar é a sensação de que existe uma camada cuidando disso,
 * e que ela é robusta: por isso "Retry" aparece com o mesmo peso de "Sync".
 */

const ICONES = [RefreshCw, Webhook, Timer, Repeat, Copy];

const PASSO_X0 = 300;
const PASSO_LARGURA = 268;
const PASSO_ESPACO = 36;
const PASSO_Y = 690;

export function Cena04Integracao() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena numero={4} />
      <TituloDeCena kicker="A camada de integração" titulo={INTEGRACAO.titulo} em={2} />

      <CamadaDeConexoes zIndex={4}>
        {/* Entrada: o mesmo barramento que saiu da cena 3. */}
        <Conexao
          caminho={curvaH(20, 452, 500, 452, 0.5)}
          em={6}
          dur={24}
          cor={cor.bordaForte}
          largura={2.6}
          pulsos={3}
          corPulso={cor.dentalOffice}
          cicloPulso={62}
          raioPulso={6}
          semente={2}
        />

        {/* n8n ↔ backend */}
        <Conexao
          caminho={curvaH(860, 452, 940, 452, 0.9)}
          em={54}
          dur={16}
          cor={cor.bordaForte}
          largura={2.2}
          pulsos={2}
          corPulso={cor.n8n}
          cicloPulso={54}
          raioPulso={5}
          semente={5}
        />

        {/* Saída para o núcleo — costura com a cena 5. */}
        <Conexao
          caminho={curvaH(1400, 452, 1900, 452, 0.5)}
          em={104}
          dur={26}
          cor={cor.bordaForte}
          largura={2.6}
          pulsos={4}
          corPulso={cor.verde}
          cicloPulso={58}
          raioPulso={6}
          semente={7}
        />

        {/* Do backend descem os processos internos. */}
        {INTEGRACAO.etapas.map((_, i) => {
          const x = PASSO_X0 + i * (PASSO_LARGURA + PASSO_ESPACO) + PASSO_LARGURA / 2;
          return (
            <Conexao
              key={i}
              caminho={curvaV(1170, 560, x, PASSO_Y - 12, 0.7)}
              em={116 + i * 4}
              dur={20}
              cor="#DFE6D9"
              largura={1.5}
              tracejada
            />
          );
        })}
      </CamadaDeConexoes>

      {/* Os dois nós ---------------------------------------------------- */}
      <Em x={500} y={356} zIndex={8}>
        <div style={{ opacity: progresso(frame, 24, 24) }}>
          <No
            marca="n8n"
            acento={cor.n8n}
            largura={360}
            subtitulo="Orquestra workflows e integrações auxiliares."
          />
        </div>
      </Em>

      <Em x={940} y={356} zIndex={8}>
        <div style={{ opacity: progresso(frame, 40, 24) }}>
          <No
            titulo="Backend JP"
            acento={cor.verdeEscuro}
            largura={460}
            subtitulo="Normaliza, guarda e prepara os dados para decisão."
            ativo
          />
        </div>
      </Em>

      {/* Os processos --------------------------------------------------- */}
      {INTEGRACAO.etapas.map((etapa, i) => {
        const Icone = ICONES[i] ?? RefreshCw;
        const t = progresso(frame, 122 + i * 7, 22, easeOutQuint);
        return (
          <Em
            key={etapa.nome}
            x={PASSO_X0 + i * (PASSO_LARGURA + PASSO_ESPACO)}
            y={PASSO_Y}
            largura={PASSO_LARGURA}
            zIndex={8}
          >
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 16}px, 0)`,
                background: cor.branco,
                border: `1px solid ${cor.borda}`,
                borderRadius: raio.grande,
                padding: "20px 22px",
                boxShadow: "0 14px 34px -28px rgba(3,47,1,0.5)",
                height: 168,
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  background: cor.menta,
                  color: cor.verdeEscuro,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icone size={19} strokeWidth={2.1} />
              </span>
              <div
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.corpo,
                  fontWeight: 700,
                  color: cor.tinta,
                  marginTop: 14,
                  letterSpacing: "-0.015em",
                }}
              >
                {etapa.nome}
              </div>
              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda - 1,
                  color: cor.tintaSuave,
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                {etapa.detalhe}
              </div>
            </div>
          </Em>
        );
      })}
    </Palco>
  );
}
