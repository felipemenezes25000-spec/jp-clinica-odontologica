/**
 * Atalho para pular a navegação.
 *
 * Existia só na home. Nas páginas de tratamento, quem navega por teclado
 * atravessava 13 elementos focáveis antes de chegar ao conteúdo — em toda
 * página que abrisse.
 *
 * Fica invisível até receber foco, então não ocupa espaço no layout.
 */
export function SkipLink({ href = "#conteudo" }: { href?: string }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-full focus:bg-lime focus:px-5 focus:py-3 focus:font-bold focus:text-forest-2"
    >
      Pular para o conteúdo
    </a>
  );
}
