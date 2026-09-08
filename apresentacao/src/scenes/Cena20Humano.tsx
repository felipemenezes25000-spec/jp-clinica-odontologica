import { Hand, UserRound } from "lucide-react";
import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { Balao, CabecalhoConversa, Conversa, Fone } from "@/components/Fone";
import { HUMANO } from "@/data/conteudo";
import { Cartao, Em, Palco, Selo } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Crescer } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";

/**
 * CENA 20 — O caso humano.
 *
 * O espelho da cena 14: mesma tela, mesmo canal, resultado oposto. Ali a
 * automação seguiu; aqui ela para, e a etiqueta do balão muda de "Automação"
 * para "Raphaela · CRC".
 *
 * Repetir a composição de propósito é o que faz a diferença ser lida sem
 * narração. Se esta cena tivesse outro layout, o corte pareceria mudança de
 * assunto em vez de mudança de decisão.
 */

const FONE = { x: 190, y: 128 };
const COLUNA = { x: 740, largura: 1010 };

const FALA = 24;
const VEREDICTO = 74;
const PARADA = 118;
const REPASSE = 148;

export function Cena20Humano() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Quando a equipe entra"
        titulo={HUMANO.titulo}
        em={2}
        y={92}
        x={COLUNA.x}
        largura={COLUNA.largura}
        nivel={3}
      />

      <Em x={FONE.x} y={FONE.y} zIndex={10}>
        <Crescer em={2} dur={32} deEscala={0.96}>
          <Fone altura={752}>
            <CabecalhoConversa subtitulo="conversa em andamento" />
            <Conversa>
              <Balao de="paciente" em={FALA} hora="14:07">
                {HUMANO.fala}
              </Balao>

              <Balao de="clinica" em={REPASSE + 26} hora="14:09" autor="Raphaela · CRC" entregue>
                Oi, Ana. Sou a Raphaela, da JP. Sinto muito pela dor — vou falar agora com a
                dentista e já te retorno com um horário de urgência.
              </Balao>
            </Conversa>
          </Fone>
        </Crescer>
      </Em>

      {/* A leitura da IA -------------------------------------------------- */}
      <Em x={COLUNA.x} y={272} largura={COLUNA.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, VEREDICTO, 24),
            transform: `translate3d(${(1 - progresso(frame, VEREDICTO, 30, easeOutQuint)) * 20}px, 0, 0)`,
          }}
        >
          <Cartao acento={cor.ia} elevado padding={30}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <Selo fundo={cor.iaFraco} cor={cor.ia}>
O que o sistema entendeu
              </Selo>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.tintaFraca,
                }}
              >
                com 94% de certeza
              </span>
            </div>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: 40,
                fontWeight: 800,
                color: cor.tinta,
                letterSpacing: "-0.028em",
              }}
            >
              {HUMANO.classificacao}
            </div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.corpo,
                color: cor.tintaSuave,
                marginTop: 12,
                lineHeight: 1.5,
              }}
            >
              Dor é sintoma. Nenhuma resposta automática é segura aqui — nem para marcar, nem
              para tranquilizar.
            </div>
          </Cartao>
        </div>
      </Em>

      {/* A automação para -------------------------------------------------- */}
      <Em x={COLUNA.x} y={558} largura={COLUNA.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, PARADA, 22),
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "20px 28px",
            borderRadius: raio.grande,
            background: cor.alertaFraco,
            border: "1px solid #F3DFC0",
          }}
        >
          <Hand size={26} strokeWidth={2.2} color={cor.alerta} />
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.destaque,
              fontWeight: 600,
              color: cor.alerta,
            }}
          >
            A rotina automática para aqui, nesta conversa.
          </span>
        </div>
      </Em>

      {/* O repasse -------------------------------------------------------- */}
      <Em x={COLUNA.x} y={674} largura={COLUNA.largura} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, REPASSE, 24),
            transform: `translate3d(0, ${(1 - progresso(frame, REPASSE, 30, easeOutQuint)) * 18}px, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 4, background: cor.verdeEscuro }} />
          <div style={{ padding: "26px 30px", display: "flex", alignItems: "center", gap: 22 }}>
            <span
              style={{
                width: 58,
                height: 58,
                borderRadius: 999,
                background: cor.menta,
                color: cor.verdeEscuro,
                display: "grid",
                placeItems: "center",
                flex: "none",
              }}
            >
              <UserRound size={27} strokeWidth={2.1} />
            </span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.micro,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  color: cor.tintaSuave,
                }}
              >
A conversa foi para
              </div>
              <div
                style={{
                  fontFamily: fonte.display,
                  fontSize: 32,
                  fontWeight: 800,
                  color: cor.tinta,
                  marginTop: 6,
                  letterSpacing: "-0.025em",
                }}
              >
                {HUMANO.destino}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <Selo>Prioridade alta</Selo>
              <span
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: cor.tintaFraca,
                }}
              >
                com o histórico já anexado
              </span>
            </div>
          </div>
        </div>
      </Em>

      <NotaDeCena em={REPASSE + 30} x={COLUNA.x} largura={COLUNA.largura} y={856}>
        {HUMANO.nota}
      </NotaDeCena>
    </Palco>
  );
}
