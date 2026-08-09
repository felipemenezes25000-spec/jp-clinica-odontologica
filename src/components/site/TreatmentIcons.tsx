/**
 * Line-art icons drawn for each treatment. Lucide has no dental set, and the
 * generic stand-ins (sparkles, waves, activity) said nothing about the procedure.
 *
 * All icons share a 24x24 box, 1.5 stroke, round caps and the same tooth
 * silhouette, so they read as one family rather than eight separate drawings.
 */

// `| undefined` is required because the project sets exactOptionalPropertyTypes.
type IconProps = { className?: string | undefined };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Shared silhouette: crown with two roots. */
const TOOTH =
  "M12 4.1c-1.4 0-2.1.6-3.4.6-1.4 0-2.9-.4-2.9 2 0 2.3.7 3.9 1.1 5.7.4 1.8.4 4.8 1.7 4.8 1 0 .9-3 2-3h.9c1.1 0 1 3 2 3 1.3 0 1.3-3 1.7-4.8.4-1.8 1.1-3.4 1.1-5.7 0-2.4-1.5-2-2.9-2-1.3 0-2-.6-3.3-.6Z";

/** Limpeza e profilaxia — tooth being polished. */
export function IconLimpeza({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d={TOOTH} />
      <path d="M19.4 3.6v2.2M20.5 4.7h-2.2M17.6 8.1v1.4M18.3 8.8h-1.4" />
    </svg>
  );
}

/** Clareamento dental — tooth with shine radiating from it. */
export function IconClareamento({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d={TOOTH} />
      <path d="M9.6 8.4c.5-.9 1.4-1.4 2.4-1.4" />
      <path d="M20 9h1.6M18.9 5.6l1.2-1.1M18.9 12.4l1.2 1.1" />
    </svg>
  );
}

/** Restaurações — tooth with a restored area marked on the crown. */
export function IconRestauracoes({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d={TOOTH} />
      <path d="M10 7.6h3.4v2.6H10z" />
      <path d="M10 8.9h3.4M11.7 7.6v2.6" />
    </svg>
  );
}

/** Implantes dentários — crown over a threaded post. */
export function IconImplantes({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7.4 6.6c0-1.8 2-2.8 4.6-2.8s4.6 1 4.6 2.8c0 1.3-.8 2.1-1.6 2.6H9c-.8-.5-1.6-1.3-1.6-2.6Z" />
      <path d="M9.6 11.2h4.8M9.9 13.6h4.2M10.3 16h3.4M11 18.4h2" />
      <path d="M12 9.2v11" />
    </svg>
  );
}

/** Próteses dentárias — a bridge of three crowns. */
export function IconProteses({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.6 9.4c0-2 1.6-3 3.2-3s2.2.7 2.2 2v3.2c0 1.4-.7 2.6-1.9 2.6-1.6 0-1.6-2.2-1.9-3.6-.3-1.4-1.6-1.2-1.6 0" />
      <path d="M20.4 9.4c0-2-1.6-3-3.2-3s-2.2.7-2.2 2v3.2c0 1.4.7 2.6 1.9 2.6 1.6 0 1.6-2.2 1.9-3.6.3-1.4 1.6-1.2 1.6 0" />
      <path d="M9.4 8.6h5.2v4.2c0 1.6-.9 2.8-2.6 2.8s-2.6-1.2-2.6-2.8V8.6Z" />
    </svg>
  );
}

/** Aparelhos e ortodontia — brackets and archwire across the teeth. */
export function IconOrtodontia({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3.4 8.2h17.2v7.6H3.4z" />
      <path d="M3.4 12h17.2" />
      <path d="M8.1 8.2v7.6M15.9 8.2v7.6" />
      <path d="M5.6 10.6v2.8M12 10.6v2.8M18.4 10.6v2.8" />
    </svg>
  );
}

/** Odontopediatria — a small tooth with a smile. */
export function IconOdontopediatria({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d={TOOTH} />
      <path d="M10 10.6c.5.7 1.2 1 2 1s1.5-.3 2-1" />
      <path d="M9.7 8.1h.01M14.3 8.1h.01" />
      <path d="M19 15.4c1.4 0 2.5 1.1 2.5 2.5S20.4 20.4 19 20.4s-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5Z" />
    </svg>
  );
}

/** Harmonização orofacial — face profile with a highlight. */
export function IconHarmonizacao({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M15.6 21c-.4-2.2.4-3.4 1.4-4.6 1-1.2 1.6-2.6 1.6-4.4 0-4.3-3.3-7.4-7.2-7.4-3.6 0-6.6 2.5-7.2 5.9" />
      <path d="M11.4 9.6c1 .7 1.6 1.7 1.6 2.9 0 .8-.6 1.4-1.4 1.4h-1" />
      <path d="M4.2 4.4v2M5.2 5.4h-2M6.8 15.6v1.8M7.7 16.5H5.9" />
    </svg>
  );
}

/** In TRATAMENTOS order. */
const BY_INDEX = [
  IconLimpeza,
  IconClareamento,
  IconRestauracoes,
  IconImplantes,
  IconProteses,
  IconOrtodontia,
  IconOdontopediatria,
  IconHarmonizacao,
];

/**
 * Looks the icon up by treatment index. Doing it here keeps this file exporting
 * components only (a mixed export breaks React Fast Refresh) and absorbs the
 * out-of-range case, so callers never handle an undefined component.
 */
export function TreatmentIcon({ index, className }: { index: number } & IconProps) {
  const Icon = BY_INDEX[index] ?? IconLimpeza;
  return <Icon className={className} />;
}
