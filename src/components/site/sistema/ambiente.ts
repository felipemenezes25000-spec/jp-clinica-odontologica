/**
 * Perguntas de ambiente e a pausa da rolagem suave, compartilhadas pelo motor
 * de movimento (movimento.tsx), pelo cabeçalho e pelas peças de interface.
 * Separado de movimento.tsx para o Fast Refresh: um arquivo de componente só
 * pode exportar componente.
 *
 * (Até 06/11/2026 isto se chamava gsap.ts e também carregava o GSAP. O motor
 * deixou de precisar dele: ver movimento.tsx.)
 */

/* ------------------------------------------------------------------ */
/* Pausa da rolagem suave                                                */
/* ------------------------------------------------------------------ */

type Rolagem = { stop: () => void; start: () => void };

let rolagem: Rolagem | null = null;
let pausas = 0;

/** O motor (movimento.tsx) registra a Lenis aqui ao montar e limpa ao desmontar. */
export function registrarRolagem(r: Rolagem | null): void {
  rolagem = r;
  if (r && pausas > 0) r.stop();
}

/**
 * Para a rolagem suave enquanto algo cobre a página (o menu do cabeçalho).
 *
 * `overflow: hidden` no body não basta: a Lenis escuta a roda do mouse na
 * janela e rola o documento por conta própria. Devolve a função que retoma;
 * pausas aninhadas só retomam quando a última sai.
 */
export function pausarRolagem(): () => void {
  pausas += 1;
  rolagem?.stop();
  let retomada = false;
  return () => {
    if (retomada) return;
    retomada = true;
    pausas = Math.max(0, pausas - 1);
    if (pausas === 0) rolagem?.start();
  };
}

export function querMenosMovimento(): boolean {
  return (
    typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ponteiroFino(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}
