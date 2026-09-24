import { createFileRoute, notFound } from "@tanstack/react-router";

import ogImage from "@/assets/fachada-2026-previa.jpg";
import { PaginaClareamentoAds } from "@/components/site/PaginaClareamentoAds";
import { PaginaImplanteAds } from "@/components/site/PaginaImplanteAds";
import { PaginaDeTratamento } from "@/components/site/PaginaDeTratamento";
import { SITE_URL, TRATAMENTOS } from "@/lib/jp";
import { FECHO_LOCAL, descricaoLocal, tituloLocal } from "@/lib/seo";
import { dadosEstruturadosDoTratamento } from "@/lib/dadosEstruturados";

const DESCRIPTION_CLAREAMENTO =
  "Clareamento dental na Freguesia do Ó, Vila Bruna. Fale com a JP no WhatsApp para saber valores, horários e como funciona a avaliação individual.";
const DESCRIPTION_IMPLANTE =
  "Implantes dentários na Freguesia do Ó, Vila Bruna. Entenda avaliação, exames, etapas e possibilidades de reabilitação com planejamento individual.";

export const Route = createFileRoute("/tratamentos/$slug")({
  component: TreatmentPage,

  loader: ({ params }) => {
    if (!TRATAMENTOS.some((t) => t.slug === params.slug)) throw notFound();
    return null;
  },

  head: ({ params }) => {
    const t = TRATAMENTOS.find((x) => x.slug === params.slug);
    if (!t) return {};
    const title = tituloLocal(t.titulo);
    const description =
      t.slug === "clareamento-dental"
        ? DESCRIPTION_CLAREAMENTO
        : t.slug === "implantes-dentarios"
          ? DESCRIPTION_IMPLANTE
          : descricaoLocal(t.desc, FECHO_LOCAL);
    const url = `${SITE_URL}/tratamentos/${t.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { property: "og:locale", content: "pt_BR" },
        { property: "og:image", content: `${SITE_URL}${ogImage}` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: `${SITE_URL}${ogImage}` },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [{ type: "application/ld+json", children: dadosEstruturadosDoTratamento(t) }],
    };
  },
});

function TreatmentPage() {
  const { slug } = Route.useParams();

  if (slug === "clareamento-dental") return <PaginaClareamentoAds />;
  if (slug === "implantes-dentarios") return <PaginaImplanteAds />;

  return <PaginaDeTratamento slug={slug} />;
}
