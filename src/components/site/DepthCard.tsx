import { CSSProperties, HTMLAttributes, useRef } from "react";

export function DepthCard({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove: HTMLAttributes<HTMLDivElement>["onPointerMove"] = (event) => {
    if (event.pointerType === "touch" || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    ref.current.style.setProperty("--tilt-x", `${((0.5 - y) * 8).toFixed(2)}deg`);
    ref.current.style.setProperty("--tilt-y", `${((x - 0.5) * 9).toFixed(2)}deg`);
    ref.current.style.setProperty("--spot-x", `${(x * 100).toFixed(1)}%`);
    ref.current.style.setProperty("--spot-y", `${(y * 100).toFixed(1)}%`);
  };

  const reset = () => {
    if (!ref.current) return;
    ref.current.style.setProperty("--tilt-x", "0deg");
    ref.current.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <div
      {...props}
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      className={`depth-card ${className}`}
      style={{ "--tilt-x": "0deg", "--tilt-y": "0deg" } as CSSProperties}
    >
      {children}
    </div>
  );
}
