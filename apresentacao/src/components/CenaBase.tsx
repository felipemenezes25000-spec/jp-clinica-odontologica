import type { CSSProperties, ReactNode } from "react";
import { Corpo, Em, Kicker, Titulo } from "@/design-system/primitivas";
import { cor, fonte, tamanho } from "@/design-system/tokens";
import { useCena } from "@/motion/frame";
import { Entrar } from "@/motion/primitivas";

/**
 * O cabeçalho de cena.
 *
 * Item 9: toda cena tem intro → foco → explicação → transição, e a intro é
 * sempre o mesmo par kicker + título, no mesmo lugar. Repetir a posição é o que
 * deixa o olho livre para o conteúdo: se o título pulasse de canto a cada cena,
 * cada corte custaria meio segundo de reorientação.
 *
 * A margem de 120 px vem da regra de 6,25% da largura — a mesma respiração do
 * site da clínica.
 */
export const MARGEM = 120;

/**
 * A linha onde a legenda começa a desenhar por cima.
 *
 * A legenda é ancorada no rodapé do quadro e CRESCE PARA CIMA conforme o texto:
 * uma fala de uma linha começa em y≈954, uma de duas linhas em y≈895. Como o
 * texto da fala vem da narração e pode mudar a qualquer revisão, o número que
 * vale é o da pior legenda — daí 890, com uma folga pequena.
 *
 * Nenhum conteúdo de cena pode cruzar esta linha. Não é questão de estética: a
 * legenda é opaca e é desenhada depois, então o que cruzar some da tela sem
 * deixar rastro — o elemento continua no DOM, o build passa, e ninguém percebe
 * até assistir. Foi assim que a frase de duas cenas e a assinatura final ficaram
 * invisíveis por um tempo.
 */
export const TETO_DA_LEGENDA = 890;

/**
 * Onde um rodapé de uma linha começa para terminar acima do teto.
 * Uma linha de texto de apoio tem ~24 px: 858 + 24 = 882, com folga de 8.
 */
export const RODAPE = 858;

export function TituloDeCena({
  kicker,
  titulo,
  subtitulo,
  em = 0,
  y = 96,
  x = MARGEM,
  largura = 1100,
  alinhamento = "esquerda",
  corTitulo = cor.tinta,
  corKicker = cor.verdeEscuro,
  corSubtitulo = cor.tintaSuave,
  nivel = 1,
}: {
  kicker?: string;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  em?: number;
  y?: number;
  x?: number;
  largura?: number;
  alinhamento?: "esquerda" | "centro";
  corTitulo?: string;
  corKicker?: string;
  corSubtitulo?: string;
  nivel?: 1 | 2 | 3;
}) {
  const centrado = alinhamento === "centro";
  return (
    <Em
      x={centrado ? 960 : x}
      y={y}
      largura={largura}
      ancora={centrado ? "topo-centro" : "topo-esquerda"}
      zIndex={20}
    >
      <div style={{ textAlign: centrado ? "center" : "left" }}>
        {kicker !== undefined && (
          <Entrar em={em} dur={20} de="baixo" distancia={14}>
            <Kicker cor={corKicker} style={{ marginBottom: 18 }}>
              {kicker}
            </Kicker>
          </Entrar>
        )}
        <Entrar em={em + 5} dur={26} de="baixo" distancia={22}>
          <Titulo nivel={nivel} cor={corTitulo}>
            {titulo}
          </Titulo>
        </Entrar>
        {subtitulo !== undefined && (
          <Entrar em={em + 12} dur={24} de="baixo" distancia={16}>
            <Corpo
              cor={corSubtitulo}
              tamanho={tamanho.destaque}
              style={{ marginTop: 16, maxWidth: centrado ? 900 : 780, marginInline: centrado ? "auto" : undefined }}
            >
              {subtitulo}
            </Corpo>
          </Entrar>
        )}
      </div>
    </Em>
  );
}

/**
 * A nota de rodapé da cena — onde vão as ressalvas honestas ("exemplo
 * ilustrativo", "a tela de celular é ilustração"). Discreta de propósito:
 * informa sem virar aviso legal no meio da composição.
 *
 * Começa em `RODAPE` porque abaixo de `TETO_DA_LEGENDA` a legenda desenha por
 * cima. Uma nota de duas linhas cruza esse teto — se precisar de duas linhas,
 * encurte o texto ou suba o `y`.
 */
export function NotaDeCena({
  children,
  em = 40,
  y = RODAPE,
  x = MARGEM,
  largura = 1000,
  style,
}: {
  children: ReactNode;
  em?: number;
  y?: number;
  x?: number;
  largura?: number;
  style?: CSSProperties;
}) {
  return (
    <Em x={x} y={y} largura={largura} zIndex={20}>
      <Entrar em={em} dur={22} de="baixo" distancia={10}>
        <div
          style={{
            fontFamily: fonte.texto,
            fontSize: tamanho.legenda,
            color: cor.tintaFraca,
            lineHeight: 1.5,
            ...style,
          }}
        >
          {children}
        </div>
      </Entrar>
    </Em>
  );
}

/**
 * O raciocínio do sistema — por que ele fez o que acabou de fazer.
 *
 * É o fio que atravessa o filme. Uma tela que só mostra o RESULTADO parece
 * mágica, e mágica não se compra: quem assiste precisa entender que existe um
 * critério por trás, senão a impressão que sobra é "mandou mensagem para todo
 * mundo". Então, nas cenas em que o sistema decide alguma coisa, aparece embaixo
 * uma linha explicando a decisão — sempre no mesmo lugar, sempre com o mesmo
 * rótulo, para o olho aprender que aquela faixa é a voz do sistema pensando.
 *
 * Mora na mesma faixa da `NotaDeCena` — o único rodapé livre do quadro, logo
 * acima de `TETO_DA_LEGENDA`. Por isso as duas nunca aparecem na mesma cena.
 */
export function Raciocinio({
  children,
  em = 40,
  y = RODAPE,
  x = MARGEM,
  largura = 1100,
}: {
  children: ReactNode;
  em?: number;
  y?: number;
  x?: number;
  largura?: number;
}) {
  return (
    <Em x={x} y={y} largura={largura} zIndex={20}>
      <Entrar em={em} dur={24} de="baixo" distancia={10}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.micro,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: cor.verdeEscuro,
              flex: "none",
              // `translateY` e não `alignItems: center`: alinhado pela linha de
              // base, o rótulo em caixa alta sobe demais ao lado do texto.
              transform: "translateY(-1px)",
            }}
          >
            Por que
          </span>
          <span
            style={{
              width: 1,
              height: 13,
              background: cor.bordaForte,
              flex: "none",
              transform: "translateY(2px)",
            }}
          />
          <span
            style={{
              fontFamily: fonte.texto,
              fontSize: tamanho.legenda,
              color: cor.tintaSuave,
              lineHeight: 1.5,
            }}
          >
            {children}
          </span>
        </div>
      </Entrar>
    </Em>
  );
}

/**
 * Numeração discreta da cena, no canto. Serve de âncora para quem revisa
 * ("ajusta o timing da 14") e some visualmente na composição.
 *
 * O número vem da linha do tempo, não de um argumento: escrito à mão em cada
 * arquivo, ele ficava errado toda vez que uma cena entrava no meio do filme.
 */
export function SeloDeCena() {
  const { indice, total } = useCena();
  const numero = indice + 1;
  return (
    <Em x={1920 - MARGEM - 70} y={70} largura={70} zIndex={25}>
      <div
        style={{
          fontFamily: fonte.mono,
          fontSize: tamanho.micro,
          color: "#B4BDB2",
          letterSpacing: "0.1em",
          textAlign: "right",
        }}
      >
        {String(numero).padStart(2, "0")} / {total}
      </div>
    </Em>
  );
}
