import { createFileRoute } from "@tanstack/react-router";

import ogImage from "@/assets/fachada-2026-previa.jpg";
import { PaginaImplanteAds } from "@/components/site/PaginaImplanteAds";
import { SITE_URL, TRATAMENTOS } from "@/lib/jp";
import { tituloLocal } from "@/lib/seo";
import { dadosEstruturadosDoTratamento } from "@/lib/dadosEstruturados";

/** LANDING PAGE DE ANÚNCIO — implante dentário. */
const SLUG = "implantes-dentarios";
const CANONICO = `${SITE_URL}/tratamentos/implantes-dentarios`;
const DESCRIPTION =
  "Implantes dentários na Freguesia do Ó, Vila Bruna. Fale com a JP no WhatsApp para entender avaliação, exames, etapas, valores e horários.";

export const Route = createFileRoute("/implante-dentario")({
  component: PaginaImplanteAds,
  loader: () => {
    const t = TRATAMENTOS.find((x) => x.slug === SLUG);
    return { titulo: t?.titulo ?? "" };
  },
  head: () => {
    const t = TRATAMENTOS.find((x) => x.slug === SLUG);
    if (!t) return {};
    const title = tituloLocal("Implante dentário");
    const url = `${SITE_URL}/implante-dentario`;
    return {
      meta: [
        { title },
        { name: "description", content: DESCRIPTION },
        { name: "robots", content: "noindex,follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: DESCRIPTION },
        { property: "og:url", content: url },
        { property: "og:image", content: `${SITE_URL}${ogImage}` },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: DESCRIPTION },
      ],
      links: [{ rel: "canonical", href: CANONICO }],
      scripts: [{ type: "application/ld+json", children: dadosEstruturadosDoTratamento(t) }],
    };
  },
});
