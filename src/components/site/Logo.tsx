import lockupEscuro from "@/assets/marca/logo-jp.svg";
import lockupClaro from "@/assets/marca/logo-jp-claro.svg";
import simboloEscuro from "@/assets/marca/marca-jp.svg";
import simboloClaro from "@/assets/marca/marca-jp-claro.svg";

/**
 * A marca oficial da clínica, vetorizada a partir dos EPS entregues
 * (`docs/marca/`). Por ser SVG, o mesmo arquivo serve o cabeçalho, o rodapé e o
 * favicon sem perder nitidez em tela retina.
 *
 * Duas escolhas moram aqui em vez de espalhadas pelas telas:
 *
 * - **`fundo`** nomeia a superfície, não a arte. Sobre o verde escuro do site o
 *   contorno `#095902` da marca mede 1,73:1 e some; a arte de fundo escuro troca
 *   esse verde por branco e mantém o `#56A805`, que ali dá 4,96:1.
 * - **O vão do sorriso é furo, não retângulo branco.** As duas artes vazam o
 *   dente com `fill-rule="evenodd"`, então a marca pousa em qualquer cor sem
 *   arrastar um fundo junto.
 */

const ARTE = {
  // Proporções lidas do viewBox de cada SVG: o <img> reserva o espaço certo
  // antes do arquivo chegar, e a linha do cabeçalho não pula.
  lockup: { claro: lockupEscuro, escuro: lockupClaro, proporcao: 215.3945 / 73.9942 },
  simbolo: { claro: simboloEscuro, escuro: simboloClaro, proporcao: 50.222 / 53.2834 },
} as const;

export function Logo({
  variante = "lockup",
  fundo = "claro",
  altura,
  className,
  alt = "",
}: {
  /** `lockup` traz o nome desenhado; `simbolo` é só o dente com o JP. */
  variante?: "lockup" | "simbolo";
  /** A cor da superfície onde a marca vai pousar. */
  fundo?: "claro" | "escuro";
  /** Altura de referência em px — define a proporção reservada no layout. */
  altura: number;
  className?: string;
  /**
   * Vazio por padrão: nas telas do site a marca sempre acompanha um link ou um
   * título que já carrega o nome da clínica, e repetir vira eco no leitor.
   */
  alt?: string;
}) {
  const arte = ARTE[variante];

  return (
    <img
      src={arte[fundo]}
      alt={alt}
      width={Math.round(altura * arte.proporcao)}
      height={altura}
      className={className}
      draggable={false}
      /* A marca e o elemento LCP no celular -- medido pelo Lighthouse contra o
         build de producao. Ela abre a pagina, entao esperar a fila normal de
         download custa direto no numero que o Google olha.
         `fetchpriority="high"` poe ela na frente; `loading="eager"` impede que
         alguem, mais tarde, ache que um <img> no topo tambem merece lazy. */
      fetchPriority="high"
      loading="eager"
    />
  );
}
