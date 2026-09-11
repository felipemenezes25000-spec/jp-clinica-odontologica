import { useEffect } from "react";

export function CinematicMotion() {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(pointer: fine)");
    let pointerRaf = 0;
    let scrollRaf = 0;
    let latestX = window.innerWidth / 2;
    let latestY = window.innerHeight / 2;

    const commitPointer = () => {
      const x = latestX / Math.max(window.innerWidth, 1);
      const y = latestY / Math.max(window.innerHeight, 1);
      root.style.setProperty("--pointer-x", `${(x * 100).toFixed(2)}%`);
      root.style.setProperty("--pointer-y", `${(y * 100).toFixed(2)}%`);
      root.style.setProperty("--pointer-nx", (x - 0.5).toFixed(3));
      root.style.setProperty("--pointer-ny", (y - 0.5).toFixed(3));
      pointerRaf = 0;
    };

    const onPointer = (event: PointerEvent) => {
      latestX = event.clientX;
      latestY = event.clientY;
      if (!pointerRaf) pointerRaf = requestAnimationFrame(commitPointer);
    };

    const commitScroll = () => {
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      root.style.setProperty("--scroll-progress", progress.toFixed(4));
      root.style.setProperty("--scroll-y", `${window.scrollY}px`);
      scrollRaf = 0;
    };

    const onScroll = () => {
      if (!scrollRaf) scrollRaf = requestAnimationFrame(commitScroll);
    };

    /*
     * Movimento cinematográfico é decoração, não conteúdo. Se a pessoa pediu
     * menos movimento, não basta esconder a animação no CSS: deixar listeners
     * de scroll/pointer rodando continuaria gastando trabalho a cada frame sem
     * desenhar nada. O mesmo vale para pointermove em celular/tablet: antes o
     * callback acordava em cada gesto e só então descobria que era touch.
     *
     * Scroll também passa por rAF: alguns navegadores emitem mais de um evento
     * entre dois frames. Assim, as variáveis CSS são escritas no máximo uma vez
     * por frame, preservando o efeito sem desperdiçar trabalho na thread principal.
     */
    if (reducedMotion.matches) {
      document.body.classList.remove("motion-ready");
      return;
    }

    commitScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    if (finePointer.matches) {
      window.addEventListener("pointermove", onPointer, { passive: true });
    }

    document.body.classList.add("motion-ready");

    return () => {
      if (pointerRaf) cancelAnimationFrame(pointerRaf);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
      if (finePointer.matches) window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.body.classList.remove("motion-ready");
    };
  }, []);

  return (
    <>
      <div className="scroll-progress" aria-hidden="true" />
      <div className="cursor-aura" aria-hidden="true" />
    </>
  );
}
