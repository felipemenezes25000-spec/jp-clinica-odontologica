/**
 * Atalho para pular a navegação.
 *
 * Existia só na home. Nas páginas de tratamento, quem navega por teclado
 * atravessava 13 elementos focáveis antes de chegar ao conteúdo — em toda
 * página que abrisse.
 *
 * Fica invisível até receber foco, então não ocupa espaço no layout.
 *
 * Veste o sistema: pílula em acento com letra em tinta (4,96:1), a mesma do
 * botão principal. Aparece só no estado focado — o único que alguém vê.
 */
export function SkipLink({ href = "#conteudo" }: { href?: string }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-full focus:bg-acento focus:px-6 focus:py-3 focus:font-semibold focus:text-tinta"
    >
      Pular para o conteúdo
    </a>
  );
}
