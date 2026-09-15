/**
 * Atalho para pular a navegação.
 *
 * Existia só na home. Nas páginas de tratamento, quem navega por teclado
 * atravessava 13 elementos focáveis antes de chegar ao conteúdo — em toda
 * página que abrisse.
 *
 * Fica invisível até receber foco, então não ocupa espaço no layout.
 *
 * A LETRA É `--brand-deep`, E NÃO `--forest-2`. Os dois são verde escuro e
 * parecem intercambiáveis; sobre o limão do fundo, `--forest-2` mede 2,87:1 e
 * `--brand-deep` mede 4,96:1. Este link é recurso de acessibilidade e só existe
 * no estado focado — o estado que reprovava era o único que alguém vê.
 */
export function SkipLink({ href = "#conteudo" }: { href?: string }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[90] focus:rounded-full focus:bg-lime focus:px-5 focus:py-3 focus:font-bold focus:text-brand-deep"
    >
      Pular para o conteúdo
    </a>
  );
}
