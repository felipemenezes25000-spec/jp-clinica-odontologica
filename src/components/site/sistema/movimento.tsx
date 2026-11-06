import { useEffect } from "react";

/**
 * O MOTOR DE MOVIMENTO DO SITE.
 *
 * Uma peça só, montada uma vez por página (vive dentro do <Header>, que todas
 * as páginas públicas usam). Ela cuida da camada "quieta" de movimento,
 * declarada por atributos no JSX — ninguém precisa importar GSAP para ganhar
 * entrada, linha que sobe ou número que rola:
 *
 *   data-entra            grupo que entra quando aparece na tela. Os filhos
 *     data-item           marcados sobem 28px e acendem, em cascata de 80ms.
 *                         Não aninhe um data-entra dentro de outro.
 *   data-linhas           título cujas linhas sobem de trás da própria linha
 *                         de base (SplitText, máscara por linha).
 *   data-tinta            frase que se acende palavra por palavra conforme a
 *                         rolagem. UMA por página.
 *   data-numero="210"     número que rola de 0 até o valor ao aparecer.
 *     data-casas="1"      casas decimais (vírgula, à brasileira).
 *   data-obturador        moldura cuja foto abre de baixo para cima.
 *   data-deriva           foto que deriva poucos % dentro da moldura.
 *   data-ima              botão que puxa levemente na direção do cursor.
 *
 * Sem JavaScript, ou com "reduzir movimento", tudo já está no lugar: os
 * estados escondidos só existem em `@media (scripting: enabled)` com
 * `prefers-reduced-motion: no-preference`, e a regra de segurança do CSS
 * revela tudo em 2,5s se este motor nunca chegar (bundle quebrado, rede ruim).
 *
 * GSAP, ScrollTrigger, SplitText e Lenis entram por import dinâmico, depois da
 * hidratação: não pesam no primeiro desenho nem no LCP.
 */

import { carregarGsap, ponteiroFino, querMenosMovimento, registrarRolagem, type Kit } from "./gsap";

const formatar = (valor: number, casas: number) =>
  valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/* ------------------------------------------------------------------ */
/* Entradas — IntersectionObserver puro, sem GSAP.                     */
/* ------------------------------------------------------------------ */

function prepararEntradas(raiz: ParentNode): IntersectionObserver | null {
  const grupos = Array.from(raiz.querySelectorAll<HTMLElement>("[data-entra]"));
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
/* Camada GSAP                                                          */
/* ------------------------------------------------------------------ */

function montarCamadaGsap(kit: Kit): () => void {
  const { gsap, ScrollTrigger, SplitText } = kit;
  const desfazer: Array<() => void> = [];

  const ctx = gsap.context(() => {
    // Linhas que sobem: só títulos fora da primeira dobra. O topo tem a sua
    // própria sequência de entrada em CSS, que roda antes do JS chegar.
    for (const el of gsap.utils.toArray<HTMLElement>("[data-linhas]")) {
      const split = SplitText.create(el, {
        type: "lines",
        mask: "lines",
        linesClass: "linha-split",
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 108,
            duration: 1,
            ease: "expo.out",
            stagger: 0.09,
            scrollTrigger: { trigger: el, start: "top 86%", once: true },
          }),
      });
      desfazer.push(() => split.revert());
    }

    // Tinta: as palavras começam a 22% e chegam a 100% ao longo da rolagem.
    // `aria: "none"` e `<span>`: a tinta mora num <p>, onde `aria-label` é
    // proibido. Com o padrão ("auto") o SplitText rotulava o <p> e escondia as
    // palavras, e a frase sumia para o leitor de tela. Assim o texto continua
    // texto, só que palavra a palavra.
    for (const el of gsap.utils.toArray<HTMLElement>("[data-tinta]")) {
      const split = SplitText.create(el, {
        type: "words",
        wordsClass: "palavra-tinta",
        tag: "span",
        aria: "none",
      });
      gsap.fromTo(
        split.words,
        { opacity: 0.22 },
        {
          opacity: 1,
          ease: "none",
          stagger: 0.12,
          scrollTrigger: { trigger: el, start: "top 78%", end: "bottom 42%", scrub: true },
        },
      );
      desfazer.push(() => split.revert());
    }

    // Números que rolam.
    for (const el of gsap.utils.toArray<HTMLElement>("[data-numero]")) {
      const alvo = Number(el.dataset["numero"]);
      if (!Number.isFinite(alvo)) continue;
      const casas = Number(el.dataset["casas"] ?? 0);
      const final = el.textContent ?? "";
      const estado = { v: alvo > 1000 ? alvo - 40 : 0 };
      ScrollTrigger.create({
        trigger: el,
        start: "top 88%",
        once: true,
        onEnter: () =>
          gsap.to(estado, {
            v: alvo,
            duration: 1.6,
            ease: "expo.out",
            onUpdate: () => {
              el.textContent = formatar(estado.v, casas);
            },
            onComplete: () => {
              el.textContent = final;
            },
          }),
      });
    }

    // Obturador: a moldura abre de baixo para cima e a foto assenta.
    for (const el of gsap.utils.toArray<HTMLElement>("[data-obturador]")) {
      const img = el.querySelector("img, video");
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 85%", once: true } });
      tl.fromTo(
        el,
        { clipPath: "inset(100% 0% 0% 0%)" },
        { clipPath: "inset(0% 0% 0% 0%)", duration: 1.2, ease: "power4.inOut" },
      );
      if (img) tl.fromTo(img, { scale: 1.14 }, { scale: 1, duration: 1.6, ease: "expo.out" }, 0);
    }

    // Deriva: a foto anda até 6% dentro da moldura (a moldura corta).
    for (const el of gsap.utils.toArray<HTMLElement>("[data-deriva]")) {
      gsap.fromTo(
        el,
        { yPercent: -5, scale: 1.1 },
        {
          yPercent: 5,
          scale: 1.1,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
        },
      );
    }
  });
  desfazer.push(() => ctx.revert());

  // Ímã: só com mouse. O botão anda no máximo 6px, o texto 3px.
  if (ponteiroFino()) {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-ima]"))) {
      const mover = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        gsap.to(el, { x: dx * 12, y: dy * 10, duration: 0.5, ease: "power3.out" });
      };
      const soltar = () => gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.5)" });
      el.addEventListener("pointermove", mover);
      el.addEventListener("pointerleave", soltar);
      desfazer.push(() => {
        el.removeEventListener("pointermove", mover);
        el.removeEventListener("pointerleave", soltar);
      });
    }
  }

  // Depois que as fontes chegam, as medidas mudam: recalcula tudo uma vez.
  void document.fonts?.ready.then(() => ScrollTrigger.refresh());

  return () => desfazer.reverse().forEach((f) => f());
}

/* ------------------------------------------------------------------ */
/* Rolagem com peso (Lenis) — só mouse/trackpad, nunca toque.            */
/* ------------------------------------------------------------------ */

async function montarRolagem(kit: Kit): Promise<() => void> {
  if (!ponteiroFino()) return () => {};
  const { default: Lenis } = await import("lenis");
  const cabecalho = document.querySelector<HTMLElement>("header");
  const lenis = new Lenis({
    lerp: 0.12,
    anchors: { offset: -((cabecalho?.offsetHeight ?? 80) + 16) },
    allowNestedScroll: true,
  });
  lenis.on("scroll", kit.ScrollTrigger.update);
  const tique = (t: number) => lenis.raf(t * 1000);
  kit.gsap.ticker.add(tique);
  kit.gsap.ticker.lagSmoothing(0);
  document.documentElement.classList.add("rolagem-suave");
  registrarRolagem(lenis);
  return () => {
    registrarRolagem(null);
    kit.gsap.ticker.remove(tique);
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
    const io = prepararEntradas(document);

    let vivo = true;
    let desmontar: Array<() => void> = [];

    if (!querMenosMovimento()) {
      void carregarGsap()
        .then(async (kit) => {
          if (!vivo) return;
          desmontar.push(montarCamadaGsap(kit));
          // A Lenis é um enfeite: se o import dela falhar, a rolagem nativa
          // continua e a camada do GSAP, já montada, segue valendo.
          const parar = await montarRolagem(kit).catch(() => () => {});
          if (!vivo) {
            parar();
            return;
          }
          desmontar.push(parar);
        })
        .catch(() => {
          // Sem GSAP a página fica na composição parada; o CSS de segurança
          // já revelou o que dependia das entradas.
        });
    }

    return () => {
      vivo = false;
      io?.disconnect();
      desmontar.forEach((f) => f());
      desmontar = [];
      delete raiz.dataset["movimento"];
    };
  }, []);

  return null;
}
