import { MousePointerClick, Megaphone, Send, Timer } from "lucide-react";
import { NotaDeCena, SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { CamadaDeConexoes, Conexao } from "@/components/Conexao";
import { Balao, CabecalhoConversa, Conversa, Fone } from "@/components/Fone";
import { Marca } from "@/components/Marca";
import { LEAD_PAGO } from "@/data/conteudo";
import { Em, Palco } from "@/design-system/primitivas";
import { cor, fonte, raio, sombra, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { Contador, Crescer } from "@/motion/primitivas";
import { easeOutQuint, progresso } from "@/motion/timing";
import { curvaH } from "@/utils/caminho";

/**
 * CENA 16 — O lead que veio do anúncio pago.
 *
 * A cena existe para responder à pergunta que todo dono de clínica faz sobre
 * tráfego pago: "e o que acontece depois que a pessoa clica?". A resposta em
 * quase toda clínica é "alguém vê amanhã de manhã" — e é aí que o dinheiro do
 * anúncio evapora.
 *
 * Por isso o número grande da tela é o TEMPO até a primeira resposta, e não a
 * quantidade de leads. Quantidade se compra; velocidade não.
 *
 * O painel da esquerda mostra o que fica GUARDADO sobre a origem. É esse
 * registro que torna a cena seguinte possível: sem saber de qual anúncio a
 * pessoa veio, não existe custo por paciente.
 */

const ICONES_CADEIA = [Megaphone, MousePointerClick, Send, null];
const CADEIA_X = [170, 560, 950, 1370];
const CADEIA_Y = 268;
const CADEIA_LARGURA = 340;

const FONE = { x: 1300, y: 452 };

export function Cena16LeadPago() {
  const frame = useFrame();

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena
        kicker="Tráfego pago"
        titulo={LEAD_PAGO.titulo}
        subtitulo={LEAD_PAGO.subtitulo}
        em={2}
        y={82}
        nivel={2}
        largura={1180}
      />

      {/* Do anúncio até o sistema ---------------------------------------- */}
      <CamadaDeConexoes zIndex={4}>
        {[0, 1, 2].map((i) => (
          <Conexao
            key={i}
            caminho={curvaH(
              CADEIA_X[i]! + CADEIA_LARGURA,
              CADEIA_Y + 46,
              CADEIA_X[i + 1]!,
              CADEIA_Y + 46,
              0.8,
            )}
            em={26 + i * 10}
            dur={18}
            cor={cor.bordaForte}
            largura={2}
            pulsos={2}
            corPulso={i === 2 ? cor.verde : cor.dentalOffice}
            cicloPulso={50}
            raioPulso={4.5}
            semente={i + 2}
          />
        ))}
      </CamadaDeConexoes>

      {LEAD_PAGO.cadeia.map((etapa, i) => {
        // O `?? null` fecha o índice para o TypeScript: sem ele o ícone entra
        // como `Componente | undefined` e não pode ser usado como elemento JSX.
        const Icone = ICONES_CADEIA[i] ?? null;
        const t = progresso(frame, 14 + i * 10, 20, easeOutQuint);
        const chegada = i === LEAD_PAGO.cadeia.length - 1;

        return (
          <Em key={etapa} x={CADEIA_X[i]!} y={CADEIA_Y} largura={CADEIA_LARGURA} zIndex={8}>
            <div
              style={{
                opacity: t,
                transform: `translate3d(0, ${(1 - t) * 12}px, 0)`,
                height: 92,
                background: cor.branco,
                border: `1px solid ${chegada ? `${cor.verde}66` : cor.borda}`,
                borderRadius: raio.grande,
                padding: "0 24px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                boxShadow: chegada
                  ? "0 22px 52px -36px rgba(3,47,1,0.55)"
                  : "0 12px 32px -28px rgba(3,47,1,0.45)",
              }}
            >
              {Icone === null ? (
                <Marca chave="jpSimbolo" altura={32} />
              ) : (
                <span
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    background: cor.menta,
                    color: cor.verdeEscuro,
                    display: "grid",
                    placeItems: "center",
                    flex: "none",
                  }}
                >
                  <Icone size={19} strokeWidth={2.1} />
                </span>
              )}
              <span
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.corpo,
                  fontWeight: 700,
                  color: cor.tinta,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.2,
                }}
              >
                {etapa}
              </span>
            </div>
          </Em>
        );
      })}

      {/* O que fica guardado sobre a origem ------------------------------ */}
      <Em x={170} y={430} largura={720} zIndex={8}>
        <div
          style={{
            opacity: progresso(frame, 62, 26),
            transform: `translate3d(0, ${(1 - progresso(frame, 62, 32, easeOutQuint)) * 16}px, 0)`,
            background: cor.branco,
            border: `1px solid ${cor.borda}`,
            borderRadius: raio.enorme,
            boxShadow: sombra.media,
            overflow: "hidden",
          }}
        >
          <div style={{ height: 4, background: cor.dentalOffice }} />
          <div style={{ padding: "24px 28px" }}>
            <div
              style={{
                fontFamily: fonte.display,
                fontSize: tamanho.destaque,
                fontWeight: 800,
                color: cor.tinta,
                letterSpacing: "-0.025em",
              }}
            >
              {LEAD_PAGO.lead.nome}
            </div>
            <div
              style={{
                fontFamily: fonte.texto,
                fontSize: tamanho.apoio,
                color: cor.tintaSuave,
                marginTop: 6,
              }}
            >
              “{LEAD_PAGO.lead.pedido}”
            </div>

            <div style={{ marginTop: 20 }}>
              {LEAD_PAGO.origem.map((linha, i) => {
                const t = progresso(frame, 78 + i * 10, 20, easeOutQuint);
                return (
                  <div
                    key={linha.campo}
                    style={{
                      opacity: t,
                      transform: `translate3d(${(1 - t) * 12}px, 0, 0)`,
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 20,
                      padding: "12px 0",
                      borderBottom:
                        i === LEAD_PAGO.origem.length - 1 ? "none" : `1px solid ${cor.linha}`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.legenda,
                        color: cor.tintaSuave,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        flex: "none",
                      }}
                    >
                      {linha.campo}
                    </span>
                    <span
                      style={{
                        fontFamily: fonte.texto,
                        fontSize: tamanho.apoio,
                        color: cor.tinta,
                        fontWeight: 600,
                        textAlign: "right",
                      }}
                    >
                      {linha.valor}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Em>

      {/* O tempo de resposta — o número que importa --------------------- */}
      <Em x={950} y={430} largura={300} zIndex={9}>
        <div
          style={{
            opacity: progresso(frame, 132, 26),
            transform: `translate3d(0, ${(1 - progresso(frame, 132, 32, easeOutQuint)) * 14}px, 0)`,
            background: cor.profundo,
            borderRadius: raio.enorme,
            padding: "28px 26px",
            textAlign: "center",
          }}
        >
          <Timer size={26} strokeWidth={2.1} color={cor.verde} />
          <div
            style={{
              fontFamily: fonte.display,
              fontSize: 82,
              fontWeight: 800,
              color: cor.branco,
              letterSpacing: "-0.05em",
              lineHeight: 1,
              marginTop: 12,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <Contador ate={LEAD_PAGO.tempo.valor} em={140} dur={42} />
          </div>
          <div
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              color: "#B8D9A4",
              marginTop: 12,
              lineHeight: 1.4,
            }}
          >
            {LEAD_PAGO.tempo.rotulo}
          </div>
        </div>
      </Em>

      {/* A resposta que sai sozinha ------------------------------------- */}
      <Em x={FONE.x} y={FONE.y} zIndex={10}>
        <Crescer em={100} dur={34} deEscala={0.96}>
          <Fone largura={380} altura={400}>
            <CabecalhoConversa subtitulo="respondendo agora" />
            <Conversa>
              <Balao
                de="clinica"
                em={148}
                hora={LEAD_PAGO.resposta.hora}
                autor={LEAD_PAGO.resposta.autor}
                entregue
                lida={frame > 220}
              >
                {LEAD_PAGO.resposta.texto}
              </Balao>
            </Conversa>
          </Fone>
        </Crescer>
      </Em>

      <NotaDeCena em={196} x={170} largura={1100}>
        {LEAD_PAGO.nota}
      </NotaDeCena>
    </Palco>
  );
}
