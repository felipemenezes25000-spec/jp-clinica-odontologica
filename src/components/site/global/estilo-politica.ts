import "./politica.css";

/**
 * Classe do topo da Política de Privacidade.
 *
 * Existe para levar o CSS junto: um `import "x.css"` solto num arquivo de rota
 * fica na parte da rota que NÃO é dividida pelo autoCodeSplitting e acaba no
 * pacote de entrada, carregado (e bloqueando a pintura) em todas as páginas.
 * Importado por um módulo que o componente usa, o CSS vai para o pedaço da
 * página e o SSR o põe no <head> só dela.
 */
export const TOPO_DA_POLITICA = "politica-hero";
