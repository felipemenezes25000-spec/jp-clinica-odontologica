/**
 * A maçã verde é um motivo recorrente da JP — aparece no material impresso e nas
 * capas do Instagram da clínica.
 *
 * Desenhada em traço, no mesmo vocabulário dos ícones de tratamento (viewBox
 * 24x24, cantos arredondados), para funcionar tanto como marca d'água grande
 * quanto como detalhe pequeno, sem depender de um recorte de imagem.
 */
export function AppleMark({
  className,
  strokeWidth = 1.5,
}: {
  className?: string | undefined;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {/* corpo: dois lobos que se encontram no topo */}
      <path d="M12 8.1c-1.3-1.3-3.1-1.8-4.6-1.1-1.8.8-2.8 2.7-2.8 4.9 0 4.4 3.1 9 5.5 9 .9 0 1.3-.5 1.9-.5s1 .5 1.9.5c2.4 0 5.5-4.6 5.5-9 0-2.2-1-4.1-2.8-4.9-1.5-.7-3.3-.2-4.6 1.1Z" />
      {/* cabo */}
      <path d="M12 8.1V4.9" />
      {/* folha */}
      <path d="M12.3 5.8c.7-1.7 2.4-2.6 4.2-2.3-.1 1.9-1.6 3.4-3.4 3.6" />
    </svg>
  );
}
