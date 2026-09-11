import { CSSProperties, HTMLAttributes, useEffect, useRef } from "react";

export function DepthCard({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const rafRef = useRef(0);
  const pontoRef = useRef({ x: 0, y: 0 });
  const podeInclinarRef = useRef(false);

  useEffect(() => {
    const pointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sincronizar = () => {
      podeInclinarRef.current = pointer.matches && !reducedMotion.matches;
      if (!podeInclinarRef.current) {
        rectRef.current = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        if (ref.current) {
          ref.current.style.setProperty("--tilt-x", "0deg");
          ref.current.style.setProperty("--tilt-y", "0deg");
        }
      }
    };

    sincronizar();
    pointer.addEventListener("change", sincronizar);
    reducedMotion.addEventListener("change", sincronizar);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      pointer.removeEventListener("change", sincronizar);
      reducedMotion.removeEventListener("change", sincronizar);
    };
  }, []);

  const atualizar = () => {
    const el = ref.current;
    const rect = rectRef.current;
    if (!el || !rect || rect.width <= 0 || rect.height <= 0) {
      rafRef.current = 0;
      return;
    }

    const x = Math.min(1, Math.max(0, (pontoRef.current.x - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (pontoRef.current.y - rect.top) / rect.height));

    el.style.setProperty("--tilt-x", `${((0.5 - y) * 8).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${((x - 0.5) * 9).toFixed(2)}deg`);
    el.style.setProperty("--spot-x", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--spot-y", `${(y * 100).toFixed(1)}%`);
    rafRef.current = 0;
  };

  const onPointerEnter: HTMLAttributes<HTMLDivElement>["onPointerEnter"] = (event) => {
    props.onPointerEnter?.(event);
    if (!podeInclinarRef.current || event.pointerType !== "mouse" || !ref.current) return;
    rectRef.current = ref.current.getBoundingClientRect();
  };

  const onPointerMove: HTMLAttributes<HTMLDivElement>["onPointerMove"] = (event) => {
    props.onPointerMove?.(event);
    if (!podeInclinarRef.current || event.pointerType !== "mouse" || !ref.current) return;

    if (!rectRef.current) rectRef.current = ref.current.getBoundingClientRect();
    pontoRef.current = { x: event.clientX, y: event.clientY };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(atualizar);
  };

  const reset = () => {
    rectRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (!ref.current) return;
    ref.current.style.setProperty("--tilt-x", "0deg");
    ref.current.style.setProperty("--tilt-y", "0deg");
  };

  const onPointerLeave: HTMLAttributes<HTMLDivElement>["onPointerLeave"] = (event) => {
    props.onPointerLeave?.(event);
    reset();
  };

  return (
    <div
      {...props}
      ref={ref}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`depth-card ${className}`}
      style={{ "--tilt-x": "0deg", "--tilt-y": "0deg", ...props.style } as CSSProperties}
    >
      {children}
    </div>
  );
}
