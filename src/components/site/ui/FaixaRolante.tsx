import type { CSSProperties, ReactNode } from "react";

import "./ui.css";

/**
 * Faixa que corre sozinha, em laço — para a fileira de convênios.
 *
 * O conteúdo aparece duas vezes lado a lado e a trilha anda metade da largura:
 * quando a cópia chega onde o original começou, a animação recomeça sem
 * emenda. A cópia é `inert` e `aria-hidden`: o leitor de tela e o Tab passam
 * por cada item uma vez só. Para no hover e com o foco dentro; com "reduzir
 * movimento" vira uma fileira parada que quebra linha.
 */
export function FaixaRolante({
  children,
  duracao = 40,
  className = "",
  rotulo,
}: {
  children: ReactNode;
  /** Segundos para uma volta inteira. */
  duracao?: number;
  className?: string;
  rotulo?: string;
}) {
  return (
    <div
      className={`faixa-rolante ${className}`}
      style={{ "--duracao": `${String(duracao)}s` } as CSSProperties}
      role={rotulo ? "region" : undefined}
      aria-label={rotulo}
    >
      <div className="faixa-rolante-trilho">
        <div className="faixa-rolante-grupo">{children}</div>
        <div className="faixa-rolante-grupo" aria-hidden="true" inert>
          {children}
        </div>
      </div>
    </div>
  );
}
