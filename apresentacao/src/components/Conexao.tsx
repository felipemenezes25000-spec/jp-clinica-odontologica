import type { ReactNode } from "react";
import { Pulsos, Traco } from "@/motion/primitivas";
import { cor } from "@/design-system/tokens";
import type { Caminho } from "@/utils/caminho";

/**
 * A camada de conexões.
 *
 * Um `<svg>` de 1920×1080 por cima do palco, com `pointerEvents: none`, onde
 * moram todas as linhas. Um SVG só (em vez de um por linha) porque assim as
 * conexões compartilham o mesmo sistema de coordenadas dos nós posicionados por
 * `<Em>` — o que permite ligar dois cards escrevendo os pixels deles, sem medir
 * nada em tempo de execução.
 */
export function CamadaDeConexoes({
  children,
  zIndex = 5,
}: {
  children: ReactNode;
  zIndex?: number;
}) {
  return (
    <svg
      width="1920"
      height="1080"
      viewBox="0 0 1920 1080"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex }}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/**
 * Uma conexão entre dois nós: a linha que se desenha, o pulso de dado que a
 * percorre e — opcionalmente — um rótulo no meio.
 *
 * O pulso só entra depois que a linha terminou de ser desenhada. Ver dado
 * andando por um caminho que ainda não existe é o tipo de detalhe que faz uma
 * peça parecer amadora.
 */
export function Conexao({
  caminho,
  em = 0,
  dur = 34,
  cor: traco = cor.bordaForte,
  largura = 2,
  pulsos = 0,
  corPulso = cor.verde,
  cicloPulso = 96,
  raioPulso = 5,
  semente = 1,
  tracejada = false,
  opacidade = 1,
}: {
  caminho: Caminho;
  em?: number;
  dur?: number;
  cor?: string;
  largura?: number;
  pulsos?: number;
  corPulso?: string;
  cicloPulso?: number;
  raioPulso?: number;
  semente?: number;
  tracejada?: boolean;
  opacidade?: number;
}) {
  return (
    <>
      <Traco
        d={caminho.d}
        comprimento={caminho.comprimento}
        em={em}
        dur={dur}
        cor={traco}
        largura={largura}
        opacidade={opacidade}
        {...(tracejada ? { tracejado: "7 9" } : {})}
      />
      {pulsos > 0 && (
        <Pulsos
          d={caminho.d}
          comprimento={caminho.comprimento}
          quantidade={pulsos}
          em={em + dur}
          ciclo={cicloPulso}
          cor={corPulso}
          raio={raioPulso}
          semente={semente}
        />
      )}
    </>
  );
}

/** Seta discreta na ponta de uma conexão. Só onde a direção não é óbvia. */
export function Ponta({
  x,
  y,
  angulo = 0,
  cor: preenchimento = cor.bordaForte,
  tamanho = 9,
  opacidade = 1,
}: {
  x: number;
  y: number;
  angulo?: number;
  cor?: string;
  tamanho?: number;
  opacidade?: number;
}) {
  return (
    <polygon
      points={`0,${-tamanho * 0.62} ${tamanho},0 0,${tamanho * 0.62}`}
      fill={preenchimento}
      opacity={opacidade}
      transform={`translate(${x} ${y}) rotate(${angulo})`}
    />
  );
}
