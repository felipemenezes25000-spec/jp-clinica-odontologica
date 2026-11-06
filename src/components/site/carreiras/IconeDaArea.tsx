import { Briefcase, GraduationCap, Headset, HeartPulse, Sparkles, Stethoscope } from "lucide-react";

/** O ícone de cada área de vaga; o nome de cada um vem do catálogo em `lib/rh/opcoes`. */
const ICONES = {
  dentista: Stethoscope,
  "asb-tsb": HeartPulse,
  recepcao: Headset,
  administrativo: Briefcase,
  estagio: GraduationCap,
  outro: Sparkles,
} as const;

/** Decorativo: o nome da área está sempre escrito ao lado. */
export function IconeDaArea({ area }: { area: string }) {
  const Icone = ICONES[area as keyof typeof ICONES] ?? Sparkles;
  return <Icone aria-hidden="true" />;
}
