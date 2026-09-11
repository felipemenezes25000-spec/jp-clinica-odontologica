import { createFileRoute } from "@tanstack/react-router";

import ogImage from "@/assets/fachada.webp";
import { PaginaDeTratamento } from "@/components/site/PaginaDeTratamento";
import { SITE_URL, TRATAMENTOS } from "@/lib/jp";
import { FECHO_LOCAL, descricaoLocal, tituloLocal } from "@/lib/seo";
import { dadosEstruturadosDoTratamento } from "@/lib/dadosEstruturados";

/**
 * LANDING PAGE DE ANÚNCIO — "Restauração dentária".
 *
 * Mesma página de `/tratamentos/restauracoes`, sob a URL que casa com o
 * termo pesquisado. A rota é fina de propósito: o conteúdo mora em
 * `PaginaDeTratamento`, então uma correção vale para as oito URLs de uma vez.
 *
 * POR QUE EXISTE, já que a página orgânica é a mesma: quem clica num anúncio
 * de "restauração dentária" precisa ver, na barra de endereço e no título, a
 * mesma coisa que pesquisou. Message match é o que separa um clique pago que
 * converte de um que volta para a busca — e o Índice de Qualidade do Google
 * cobra por isso no custo por clique.
 *
 * O `canonical` aponta para a página orgânica: as duas URLs servem o mesmo
 * conteúdo, e sem isso elas competiriam entre si na busca. O anúncio manda
 * tráfego para cá; o Google indexa lá.
 */
const SLUG = "restauracoes";
const CANONICO = `${SITE_URL}/tratamentos/restauracoes`;

export const Route = createFileRoute("/restauracao-dentaria")({
  component: () => <PaginaDeTratamento slug={SLUG} />,
  loader: () => {
    const t = TRATAMENTOS.find((x) => x.slug === SLUG);
    return { titulo: t?.titulo ?? "" };
  },
  head: () => {
    const t = TRATAMENTOS.find((x) => x.slug === SLUG);
    if (!t) return {};
    const title = tituloLocal("Restauração dentária");
    const description = descricaoLocal(t.desc, FECHO_LOCAL);
    const url = `${SITE_URL}/restauracao-dentaria`;
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
