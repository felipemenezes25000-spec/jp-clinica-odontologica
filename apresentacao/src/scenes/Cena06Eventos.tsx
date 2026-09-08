import { SeloDeCena, TituloDeCena } from "@/components/CenaBase";
import { EVENTOS } from "@/data/conteudo";
import { Em, Palco, Selo } from "@/design-system/primitivas";
import { cor, fonte, raio, tamanho } from "@/design-system/tokens";
import { useFrame } from "@/motion/frame";
import { clamp, easeOut, easeOutQuint, interpolar, progresso } from "@/motion/timing";

/**
 * CENA 06 — O motor de eventos.
 *
 * Nove cartões e um scanner que passa por eles. O scanner não é enfeite: ele é
 * a única forma honesta de mostrar o que o sistema faz de fato — varrer a
 * operação continuamente, e não esperar alguém abrir uma tela.
 *
 * Um cartão acende quando o scanner passa em cima, e o último a acender é
 * "Faltou": é o paciente que a peça vai seguir até o agendamento, e ele precisa
 * ser escolhido em tela, não aparecer do nada na cena 7.
 */

const COLUNAS = 5;
const CARTAO = { largura: 292, altura: 152 };
const GRADE_X = 170;
const GRADE_Y = 348;
const ESPACO_X = 30;
const ESPACO_Y = 30;

const SCANNER_INICIO = 84;
const SCANNER_DURACAO = 84;
const DESTAQUE = 0; // índice de "Faltou"

function posicao(indice: number) {
  const coluna = indice % COLUNAS;
  const linha = Math.floor(indice / COLUNAS);
  return {
    x: GRADE_X + coluna * (CARTAO.largura + ESPACO_X),
    y: GRADE_Y + linha * (CARTAO.altura + ESPACO_Y),
  };
}

export function Cena06Eventos() {
  const frame = useFrame();

  const scannerX = interpolar(
    frame,
    [SCANNER_INICIO, SCANNER_INICIO + SCANNER_DURACAO],
    [GRADE_X - 90, GRADE_X + COLUNAS * (CARTAO.largura + ESPACO_X) + 30],
    { curva: easeOut },
  );
  const scannerVisivel =
    progresso(frame, SCANNER_INICIO - 8, 12) *
    (1 - progresso(frame, SCANNER_INICIO + SCANNER_DURACAO, 16));

  return (
    <Palco>
      <SeloDeCena />
      <TituloDeCena kicker="O que ele percebe" titulo={EVENTOS.titulo} em={2} />

      {/* Os cartões ----------------------------------------------------- */}
      {EVENTOS.cartoes.map((cartao, i) => {
        const { x, y } = posicao(i);
        const entrada = progresso(frame, 24 + i * 6, 22, easeOutQuint);

        // Quanto o scanner está perto do centro deste cartão.
        const centro = x + CARTAO.largura / 2;
        const distancia = Math.abs(scannerX - centro);
        const varrido = clamp(1 - distancia / 190, 0, 1) * scannerVisivel;

        // Depois da varredura, só o escolhido continua aceso.
        const escolhido = i === DESTAQUE ? progresso(frame, 176, 20) : 0;
        const aceso = Math.max(varrido, escolhido);

        return (
          <Em key={cartao.rotulo} x={x} y={y} largura={CARTAO.largura} zIndex={8}>
            <div
              style={{
                opacity: entrada,
                transform: `translate3d(0, ${(1 - entrada) * 16 - aceso * 4}px, 0)`,
                height: CARTAO.altura,
                background: cor.branco,
                border: `1px solid ${aceso > 0.08 ? `${cor.verde}77` : cor.borda}`,
                borderRadius: raio.grande,
                padding: "20px 24px",
                boxShadow:
                  aceso > 0.08
                    ? `0 24px 54px -34px rgba(3,47,1,0.55), 0 0 0 ${4 * aceso}px ${cor.verde}1a`
                    : "0 12px 30px -26px rgba(3,47,1,0.45)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontFamily: fonte.display,
                  fontSize: tamanho.corpo,
                  fontWeight: 700,
                  color: cor.tinta,
                  letterSpacing: "-0.015em",
                  lineHeight: 1.15,
                }}
              >
                {cartao.rotulo}
              </div>
              <div
                style={{
                  fontFamily: fonte.texto,
                  fontSize: tamanho.legenda,
                  color: aceso > 0.3 ? cor.verdeEscuro : cor.tintaSuave,
                  marginTop: 8,
                }}
              >
                {cartao.quando}
              </div>
            </div>
          </Em>
        );
      })}

      {/* O scanner ------------------------------------------------------ */}
      {scannerVisivel > 0.01 && (
        <Em x={scannerX} y={GRADE_Y - 40} zIndex={14}>
          <div
            style={{
              width: 3,
              height: 2 * (CARTAO.altura + ESPACO_Y) + 60,
              background: `linear-gradient(180deg, transparent, ${cor.verde}, transparent)`,
              opacity: scannerVisivel,
              boxShadow: `0 0 26px 6px ${cor.verde}44`,
            }}
          />
        </Em>
      )}

      {/* O carimbo ------------------------------------------------------ */}
      <Em x={960} y={758} ancora="topo-centro" zIndex={20}>
        <div
          style={{
            opacity: progresso(frame, 184, 22),
            transform: `scale(${0.94 + 0.06 * progresso(frame, 184, 24, easeOutQuint)})`,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Selo
            cor={cor.branco}
            fundo={cor.verdeEscuro}
            tamanho={tamanho.corpo}
            style={{ letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}
          >
            {EVENTOS.carimbo}
          </Selo>
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.corpo,
              color: cor.tintaSuave,
            }}
          >
            Maria Souza · consulta de ontem, 14:30
          </span>
        </div>
      </Em>
    </Palco>
  );
}
