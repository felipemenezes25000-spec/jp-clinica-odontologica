export type FiltroFunilUi = {
  tipos: string[];
  etapaChave: string | null;
  apenasMinhas: boolean;
};

/** Estado neutro do funil, compartilhado entre a tela e a barra de visões. */
export const FILTRO_VAZIO: FiltroFunilUi = {
  tipos: [],
  etapaChave: null,
  apenasMinhas: false,
};

export function filtroVazio(filtro: FiltroFunilUi): boolean {
  return filtro.tipos.length === 0 && filtro.etapaChave === null && !filtro.apenasMinhas;
}
