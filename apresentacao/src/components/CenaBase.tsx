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
 * y=862 e não 966: dali para baixo é a ÁREA SEGURA DA LEGENDA. A legenda ocupa
 * de y≈915 até o rodapé do quadro, e é o único elemento que pode morar lá.
 * Nenhuma cena põe conteúdo abaixo de 915 — foi assim que a legenda deixou de
 * cobrir texto.
 */
export function NotaDeCena({
  children,
  em = 40,
  y = 862,
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
