import { useRef, type ReactNode } from "react";
import { useEscalaDoPalco } from "@/hooks/useTela";
import { PALCO } from "@/design-system/tokens";

/**
 * A caixa que reescala o palco.
 *
 * O filme é sempre 1920×1080; esta caixa mede o espaço que tem e aplica um
 * `scale`. Duas consequências que valem o componente existir:
 *
 * - Responsividade sem media query dentro das cenas. Uma cena escrita em px
 *   absolutos funciona de 390 px a 4K.
 * - O tour e o MP4 têm exatamente a mesma composição — o que se vê no navegador
 *   é o que sai no arquivo, na proporção certa.
 */
export function Visor({
  children,
  sobreposicao,
  radius = 26,
  sombra = true,
  className,
}: {
  children: ReactNode;
  /**
   * Desenhado por CIMA do palco, mas FORA da escala dele — é onde a legenda
   * mora. Se ela fosse escalada junto com o filme, ficaria com 8 px de altura
   * num celular, que é justamente onde legenda mais importa.
   */
  sobreposicao?: ReactNode;
  radius?: number;
  sombra?: boolean;
  className?: string;
}) {
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const { escala, caixa } = useEscalaDoPalco(caixaRef);

  /**
   * `position: absolute; inset: 0` e não `width/height: 100%`.
   *
   * Com largura em porcentagem, o tamanho desta caixa acabava sendo ditado pelo
   * palco que ela contém: o palco nasce com 960 px, a caixa mede 960, a escala
   * se mantém em 0,5 e nada nunca muda. Num celular de 375 px o filme saía
   * cortado pela direita. Absoluto quebra o ciclo — a caixa passa a valer o que
   * o pai vale, e o palco se ajusta a ela.
   *
   * Exige que o pai esteja posicionado. `.jp-visor-area` e o mapa do modo
   * explorar já estão.
   */
  return (
    <div
      ref={caixaRef}
      className={className}
      style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}
    >
      <div
        className="jp-palco-caixa"
        style={{
          width: caixa.largura,
          height: caixa.altura,
          borderRadius: radius,
          boxShadow: sombra ? "0 40px 100px -46px rgba(3,47,1,0.4)" : "none",
          border: sombra ? "1px solid rgba(3,47,1,0.08)" : "none",
        }}
      >
        <div
          className="jp-palco"
          style={{
            transform: `scale(${escala})`,
            width: PALCO.largura,
            height: PALCO.altura,
          }}
        >
          {children}
        </div>
        {sobreposicao}
      </div>
    </div>
  );
}
