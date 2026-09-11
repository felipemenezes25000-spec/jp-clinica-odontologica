import { createFileRoute } from "@tanstack/react-router";

import ogImage from "@/assets/fachada.webp";
import { PaginaDeTratamento } from "@/components/site/PaginaDeTratamento";
import { SITE_URL, TRATAMENTOS } from "@/lib/jp";
import { FECHO_LOCAL, descricaoLocal, tituloLocal } from "@/lib/seo";
import { dadosEstruturadosDoTratamento } from "@/lib/dadosEstruturados";

/**
 * LANDING PAGE DE ANÚNCIO — "Harmonização orofacial".
 *
 * Mesma página de `/tratamentos/harmonizacao-orofacial`, sob a URL que casa com o
 * termo pesquisado.
 *
 * A URL é `/harmonizacao-facial`, sem o "oro": quem busca digita "harmonização
 * facial" muito mais do que o termo técnico completo. O título mantém
 * "orofacial", que é o nome correto do procedimento e o que a clínica pratica —
 * a URL fala a língua da busca, o título fala a língua da odontologia. A rota é fina de propósito: o conteúdo mora em
 * `PaginaDeTratamento`, então uma correção vale para as oito URLs de uma vez.
 *
 * POR QUE EXISTE, já que a página orgânica é a mesma: quem clica num anúncio
 * de "harmonização orofacial" precisa ver, na barra de endereço e no título, a
 * mesma coisa que pesquisou. Message match é o que separa um clique pago que
 * converte de um que volta para a busca — e o Índice de Qualidade do Google
 * cobra por isso no custo por clique.
 *
 * O `canonical` aponta para a página orgânica: as duas URLs servem o mesmo
 * conteúdo, e sem isso elas competiriam entre si na busca. O anúncio manda
 * tráfego para cá; o Google indexa lá.
 */
const SLUG = "harmonizacao-orofacial";
const CANONICO = `${SITE_URL}/tratamentos/harmonizacao-orofacial`;

export const Route = createFileRoute("/harmonizacao-facial")({
  component: () => <PaginaDeTratamento slug={SLUG} />,
  loader: () => {
    const t = TRATAMENTOS.find((x) => x.slug === SLUG);
    return { titulo: t?.titulo ?? "" };
  },
  head: () => {
    const t = TRATAMENTOS.find((x) => x.slug === SLUG);
    if (!t) return {};
    const title = tituloLocal("Harmonização orofacial");
    const description = descricaoLocal(t.desc, FECHO_LOCAL);
    const url = `${SITE_URL}/harmonizacao-facial`;
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
