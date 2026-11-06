import { useEffect } from "react";

import { ponteiroFino, querMenosMovimento, registrarRolagem } from "./ambiente";

/**
 * O MOTOR DE MOVIMENTO DO SITE.
 *
 * Uma peça só, montada uma vez por página (vive dentro do <Header>, que todas
 * as páginas públicas usam). Ela cuida da camada "quieta" de movimento,
 * declarada por atributos no JSX:
 *
 *   data-entra            grupo que entra quando aparece na tela. Os filhos
 *     data-item           marcados sobem 28px e acendem, em cascata de 80ms.
 *                         Não aninhe um data-entra dentro de outro.
 *   data-linhas           título que sobe e acende ao aparecer.
 *   data-numero="211"     número que rola de 0 até o valor ao aparecer.
 *     data-casas="1"      casas decimais (vírgula, à brasileira).
 *   data-obturador        moldura cuja foto abre de baixo para cima.
 *   data-deriva           foto que deriva poucos % dentro da moldura (CSS
 *                         ligado à rolagem, em styles.css; aqui não há nada).
 *   data-ima              botão que puxa levemente na direção do cursor.
 *
 * SEM GSAP desde 06/11/2026. Tudo aqui é IntersectionObserver, Web Animations
 * e CSS: o GSAP com ScrollTrigger e SplitText eram ~110 KB baixados em toda
 * página, inclusive nas landings pagas, para efeitos que o redesenho quase não
 * usa mais.
 *
 * Sem JavaScript, ou com "reduzir movimento", tudo já está no lugar: os
 * estados escondidos de `data-entra` só existem em `@media (scripting:
 * enabled)` com `prefers-reduced-motion: no-preference`, a regra de segurança
 * do CSS revela tudo em 2,5s se este motor nunca chegar, e os outros efeitos
 * só escondem algo depois que o motor montou e viu que está fora da tela.
 *
 * A Lenis (rolagem com peso, só mouse/trackpad) entra por import dinâmico.
 */

const EXPO = "cubic-bezier(0.16, 1, 0.3, 1)";
const IN_OUT = "cubic-bezier(0.76, 0, 0.24, 1)";

const formatar = (valor: number, casas: number) =>
  valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

const foraDaTela = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.top >= window.innerHeight || r.bottom <= 0;
};

/**
 * Chama `aoEntrar` uma vez, quando o elemento aparece. `preparar` roda já, e
 * só para quem está fora da tela: o que a pessoa já está vendo não some para
 * reaparecer.
 */
function umaVezAoAparecer(
  seletor: string,
  preparar: (el: HTMLElement) => void,
  aoEntrar: (el: HTMLElement) => void,
  rootMargin = "0px 0px -12% 0px",
): () => void {
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        aoEntrar(e.target as HTMLElement);
      }
    },
    { rootMargin, threshold: 0.08 },
  );
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(seletor))) {
    if (!foraDaTela(el)) continue;
    preparar(el);
    io.observe(el);
  }
  return () => io.disconnect();
}

/* ------------------------------------------------------------------ */
/* Entradas — o CSS esconde e revela; aqui só se marca quem entrou.     */
/* ------------------------------------------------------------------ */

function prepararEntradas(): IntersectionObserver | null {
  const grupos = Array.from(document.querySelectorAll<HTMLElement>("[data-entra]"));
  for (const grupo of grupos) {
    const itens = Array.from(grupo.querySelectorAll<HTMLElement>("[data-item]")).filter(
      (item) => item.closest("[data-entra]") === grupo,
    );
    itens.forEach((item, i) => item.style.setProperty("--i", String(Math.min(i, 8))));
  }

  if (querMenosMovimento() || !("IntersectionObserver" in window)) {
    grupos.forEach((g) => g.setAttribute("data-entrou", ""));
    return null;
  }

  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        e.target.setAttribute("data-entrou", "");
        io.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
  );
  grupos.forEach((g) => io.observe(g));
  return io;
}

/* ------------------------------------------------------------------ */
/* Os efeitos pontuais                                                   */
/* ------------------------------------------------------------------ */

function montarEfeitos(): () => void {
  const desfazer: Array<() => void> = [];

  // Título que sobe e acende.
  desfazer.push(
    umaVezAoAparecer(
      "[data-linhas]",
      (el) => {
        el.style.opacity = "0";
        el.style.translate = "0 0.5em";
      },
      (el) => {
        el.style.opacity = "";
        el.style.translate = "";
        el.animate(
          [
            { opacity: 0, translate: "0 0.5em" },
            { opacity: 1, translate: "0 0" },
          ],
          { duration: 900, easing: EXPO },
        );
      },
      "0px 0px -14% 0px",
    ),
  );

  // Número que rola. O texto final é o que o servidor escreveu.
  desfazer.push(
    umaVezAoAparecer(
      "[data-numero]",
      (el) => {
        const alvo = Number(el.dataset["numero"]);
        if (!Number.isFinite(alvo)) return;
        el.dataset["final"] = el.textContent ?? "";
        el.textContent = formatar(0, Number(el.dataset["casas"] ?? 0));
      },
      (el) => {
        const alvo = Number(el.dataset["numero"]);
        const final = el.dataset["final"];
        if (!Number.isFinite(alvo) || final === undefined) return;
        const casas = Number(el.dataset["casas"] ?? 0);
        const inicio = performance.now();
        const passo = (agora: number) => {
          const t = Math.min((agora - inicio) / 1600, 1);
          const v = alvo * (1 - 2 ** (-10 * t));
          el.textContent = t >= 1 ? final : formatar(v, casas);
          if (t < 1) requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      },
    ),
  );

  // Obturador: a moldura abre de baixo para cima e a foto assenta.
  desfazer.push(
    umaVezAoAparecer(
      "[data-obturador]",
      (el) => {
        el.style.clipPath = "inset(100% 0% 0% 0%)";
      },
      (el) => {
        el.style.clipPath = "";
        el.animate([{ clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)" }], {
          duration: 1200,
          easing: IN_OUT,
        });
        el.querySelector("img, video")?.animate([{ scale: "1.14" }, { scale: "1" }], {
          duration: 1600,
          easing: EXPO,
        });
      },
      "0px 0px -15% 0px",
    ),
  );

  // Ímã: só com mouse. O botão anda no máximo ~12px; a volta, com a mola, é
  // a transição de `translate` em styles.css.
  if (ponteiroFino()) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-ima]"))) {
      const mover = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        el.style.translate = `${(dx * 12).toFixed(1)}px ${(dy * 10).toFixed(1)}px`;
      };
      const soltar = () => {
        el.style.translate = "";
      };
      el.addEventListener("pointermove", mover);
      el.addEventListener("pointerleave", soltar);
      desfazer.push(() => {
        el.removeEventListener("pointermove", mover);
        el.removeEventListener("pointerleave", soltar);
        el.style.translate = "";
      });
    }
  }

  return () => desfazer.reverse().forEach((f) => f());
}

/* ------------------------------------------------------------------ */
/* Rolagem com peso (Lenis) — só mouse/trackpad, nunca toque.            */
/* ------------------------------------------------------------------ */

async function montarRolagem(): Promise<() => void> {
  if (!ponteiroFino()) return () => {};
  const { default: Lenis } = await import("lenis");
  const cabecalho = document.querySelector<HTMLElement>("header");
  const lenis = new Lenis({
    lerp: 0.12,
    anchors: { offset: -((cabecalho?.offsetHeight ?? 80) + 16) },
    allowNestedScroll: true,
    autoRaf: true,
  });
  document.documentElement.classList.add("rolagem-suave");
  registrarRolagem(lenis);
  return () => {
    registrarRolagem(null);
    lenis.destroy();
    document.documentElement.classList.remove("rolagem-suave");
  };
}

/**
 * Monte UMA vez por página. Não desenha nada.
 */
export function Movimento() {
  useEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset["movimento"] = "pronto";
    const io = prepararEntradas();

    let vivo = true;
    const desmontar: Array<() => void> = [];

    if (!querMenosMovimento() && "IntersectionObserver" in window) {
      desmontar.push(montarEfeitos());
      // A Lenis é um enfeite: se o import dela falhar, a rolagem nativa segue.
      void montarRolagem()
        .then((parar) => {
          if (vivo) desmontar.push(parar);
          else parar();
        })
        .catch(() => {});
    }

    return () => {
      vivo = false;
      io?.disconnect();
      desmontar.forEach((f) => f());
      delete raiz.dataset["movimento"];
    };
  }, []);

  return null;
}
