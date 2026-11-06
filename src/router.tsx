import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Telas de trabalho (portal de RH e CRC): trocar de aba não é trocar de página. */
const TELA_DE_TRABALHO = /^\/(rh|crc)(\/|$)/;

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Troca de rota com View Transition: a página velha sai, a nova sobe, e o
    // cabeçalho (view-transition-name: cabecalho) fica parado entre as duas.
    // O CSS da transição e a versão sem movimento estão no fim de styles.css.
    // Só quando o caminho muda: filtro, aba e busca mexem só na query e não
    // podem esmaecer a página inteira, e as telas de trabalho trocam seco.
    defaultViewTransition: {
      types: ({ fromLocation, toLocation, pathChanged }) => {
        if (!pathChanged) return false;
        if (TELA_DE_TRABALHO.test(toLocation.pathname)) return false;
        if (fromLocation && TELA_DE_TRABALHO.test(fromLocation.pathname)) return false;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
        return ["pagina"];
      },
    },
    defaultPreloadStaleTime: 0,
  });

  return router;
};
