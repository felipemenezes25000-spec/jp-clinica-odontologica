import { createFileRoute } from "@tanstack/react-router";

import ogImage from "@/assets/fachada-2026-previa.jpg";
import { PaginaClareamentoAds } from "@/components/site/PaginaClareamentoAds";
import { SITE_URL, TRATAMENTOS } from "@/lib/jp";
import { FECHO_LOCAL, descricaoLocal, tituloLocal } from "@/lib/seo";
import { dadosEstruturadosDoTratamento } from "@/lib/dadosEstruturados";

/**
 * LANDING PAGE DE ANÚNCIO — "Clareamento dental".
 *
 * Esta rota usa a experiência dedicada de conversão do clareamento: message
 * match com a busca, prova social cedo, objeções comerciais, CTA recorrente e
 * WhatsApp como saída principal. O canonical continua apontando para a URL
 * orgânica para não criar competição na indexação.
 */
const SLUG = "clareamento-dental";
const CANONICO = `${SITE_URL}/tratamentos/clareamento-dental`;

export const Route = createFileRoute("/clareamento-dental")({
  component: PaginaClareamentoAds,
  loader: () => {
    const t = TRATAMENTOS.find((x) => x.slug === SLUG);
    return { titulo: t?.titulo ?? "" };
  },
  head: () => {
    const t = TRATAMENTOS.find((x) => x.slug === SLUG);
    if (!t) return {};
    const title = tituloLocal("Clareamento dental");
    const description = descricaoLocal(t.desc, FECHO_LOCAL);
    const url = `${SITE_URL}/clareamento-dental`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:image", content: `${SITE_URL}${ogImage}` },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: CANONICO }],
      scripts: [{ type: "application/ld+json", children: dadosEstruturadosDoTratamento(t) }],
    };
  },
});
