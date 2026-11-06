/**
 * O carregador do GSAP e as perguntas de ambiente que o motor e as cenas
 * compartilham. Separado de movimento.tsx para o Fast Refresh: um arquivo de
 * componente só pode exportar componente.
 */

type Gsap = typeof import("gsap").gsap;
type ScrollTriggerT = typeof import("gsap/ScrollTrigger").ScrollTrigger;
type SplitTextT = typeof import("gsap/SplitText").SplitText;

export type Kit = { gsap: Gsap; ScrollTrigger: ScrollTriggerT; SplitText: SplitTextT };

let promessa: Promise<Kit> | null = null;

/**
 * Carrega o GSAP uma vez por sessão, com os plugins registrados.
 *
 * Se o import falhar (rede instável, ou um deploy novo que trocou os nomes dos
 * pedaços), a promessa é esquecida para a próxima chamada tentar de novo; quem
 * chama trata a rejeição e a página fica na composição parada, que é legível.
 */
export function carregarGsap(): Promise<Kit> {
  promessa ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("gsap/SplitText")])
    .then(([g, s, t]) => {
      g.gsap.registerPlugin(s.ScrollTrigger, t.SplitText);
      return { gsap: g.gsap, ScrollTrigger: s.ScrollTrigger, SplitText: t.SplitText };
    })
    .catch((erro: unknown) => {
      promessa = null;
      throw erro;
    });
  return promessa;
}

/**
 * Roda `cena` com o GSAP carregado. Se o import falhar, a cena simplesmente não
 * acontece (a seção fica na composição parada) e a falha não vira "Uncaught
 * (in promise)". Erro DENTRO da cena continua aparecendo: o segundo argumento
 * do `then` só pega a rejeição do carregamento. `semGsap` é para a cena que
 * já nasce montada no CSS e precisa ser desfeita quando o motor não vem.
 */
export function comGsap(
  cena: (kit: Kit) => void | Promise<void>,
  semGsap: () => void = () => {},
): void {
  void carregarGsap().then(cena, semGsap);
}

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
