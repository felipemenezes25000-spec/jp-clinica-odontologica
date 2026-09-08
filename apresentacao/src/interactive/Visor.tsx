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
  radius = 26,
  sombra = true,
  className,
}: {
  children: ReactNode;
  radius?: number;
  sombra?: boolean;
  className?: string;
}) {
  const caixaRef = useRef<HTMLDivElement | null>(null);
  const { escala, caixa } = useEscalaDoPalco(caixaRef);

  return (
    <div
      ref={caixaRef}
      className={className}
      style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}
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
      </div>
    </div>
  );
}
