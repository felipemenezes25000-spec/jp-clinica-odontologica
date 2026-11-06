import { CONVENIOS_SITE, CONVENIOS_SITE_POR_EXTENSO } from "@/lib/jp";

/**
 * Os convênios publicados no site moram em `jp.ts` (`CONVENIOS_SITE`), junto da
 * FAQ do site que os cita. Aqui ficam os nomes que as seções já importavam e a
 * varredura das logos locais.
 */
export { CONVENIOS_SITE };
export const CONVENIOS_POR_EXTENSO_SITE = CONVENIOS_SITE_POR_EXTENSO;

/**
 * Logos locais, quando existirem: `src/assets/convenios/<slug>.svg|png|webp`.
 * Sem arquivo, quem usa desenha o nome em texto no lugar.
 */
const LOGOS = import.meta.glob<string>("../../assets/convenios/*.{svg,png,webp}", {
  eager: true,
  import: "default",
  query: "?url",
});

export function logoDoConvenio(slug: string): string | undefined {
  const chave = Object.keys(LOGOS).find((k) => k.replace(/^.*\/|\.[a-z]+$/g, "") === slug);
  return chave === undefined ? undefined : LOGOS[chave];
}
