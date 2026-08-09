import { useEffect } from "react";

export function CinematicMotion() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;
    let latestX = window.innerWidth / 2;
    let latestY = window.innerHeight / 2;

    const commitPointer = () => {
      const x = latestX / Math.max(window.innerWidth, 1);
      const y = latestY / Math.max(window.innerHeight, 1);
      root.style.setProperty("--pointer-x", `${(x * 100).toFixed(2)}%`);
      root.style.setProperty("--pointer-y", `${(y * 100).toFixed(2)}%`);
      root.style.setProperty("--pointer-nx", (x - 0.5).toFixed(3));
      root.style.setProperty("--pointer-ny", (y - 0.5).toFixed(3));
      raf = 0;
    };

    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      latestX = event.clientX;
      latestY = event.clientY;
      if (!raf) raf = requestAnimationFrame(commitPointer);
    };

    const onScroll = () => {
      const max = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(1, Math.max(0, window.scrollY / max));
      root.style.setProperty("--scroll-progress", progress.toFixed(4));
      root.style.setProperty("--scroll-y", `${window.scrollY}px`);
    };

    onScroll();
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    document.body.classList.add("motion-ready");

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
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
