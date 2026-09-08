/**
 * De onde vêm os arquivos de `public/`.
 *
 * O Vite serve `public/` na raiz, então `/brands/jp/logo-jp.svg` basta. O
 * Remotion serve pelo `staticFile()`, que resolve para a origem do bundle no
 * momento do render — e é diferente entre Studio, render local e Lambda.
 *
 * Em vez de espalhar `import { staticFile }` pelas cenas (o que arrastaria o
 * Remotion para dentro do bundle da web), há um resolvedor único: a raiz do
 * Remotion o registra; a web deixa o padrão.
 */

type Resolvedor = (caminho: string) => string;

let resolvedor: Resolvedor | null = null;

export function definirResolvedorDeAsset(fn: Resolvedor): void {
  resolvedor = fn;
}

/** `asset("brands/jp/logo-jp.svg")` → URL utilizável no destino atual. */
export function asset(caminho: string): string {
  const limpo = caminho.replace(/^\/+/, "");
  return resolvedor === null ? `/${limpo}` : resolvedor(limpo);
}

/**
 * Quando a peça é servida em subpasta.
 *
 * No site da clínica ela mora em `/crc-institucional/`, e um caminho começando
 * com `/` apontaria para a raiz do domínio — o logo e a narração sumiriam. O
 * `main.tsx` registra a base do Vite por aqui.
 */
export function resolverPelaBase(base: string): (caminho: string) => string {
  const prefixo = base.endsWith("/") ? base : `${base}/`;
  return (caminho) => `${prefixo}${caminho}`;
}
