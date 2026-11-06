import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

/**
 * O botão de WhatsApp das landings pagas.
 *
 * Só veste o sistema; o link (`href`) já nasce de `useContatoWhatsApp`, que
 * carrega o assunto e a referência da campanha, e o rastreio de lead é um
 * ouvinte no documento — o botão não sabe nada disso, e é por isso que cada
 * clique conta uma vez só.
 *
 * `principal` usa o nome antigo `button-primary`: o E2E procura
 * `main a.button-primary[href*="wa.me"]` para achar o CTA do topo.
 */
export function BotaoWhatsApp({
  href,
  children,
  principal = false,
  ima = false,
  className = "",
}: {
  href: string;
  children: ReactNode;
  principal?: boolean;
  ima?: boolean;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${principal ? "button-primary" : "botao botao-acento"} lp-botao ${className}`}
      data-ima={ima ? "" : undefined}
    >
      <span>{children}</span>
      <ArrowUpRight aria-hidden="true" />
    </a>
  );
}
