import { createFileRoute, notFound } from "@tanstack/react-router";

import ogImage from "@/assets/fachada.webp";
import { PaginaDeTratamento } from "@/components/site/PaginaDeTratamento";
import { SITE_URL, TRATAMENTOS } from "@/lib/jp";
import { FECHO_LOCAL, descricaoLocal, tituloLocal } from "@/lib/seo";
import { dadosEstruturadosDoTratamento } from "@/lib/dadosEstruturados";

export const Route = createFileRoute("/tratamentos/$slug")({
  component: TreatmentPage,

  // Slug inexistente devolvia HTTP 200 com a tela de erro (soft 404): buscador
  // indexava e o visitante não recebia o sinal certo. Agora é 404 de verdade.
  loader: ({ params }) => {
    if (!TRATAMENTOS.some((t) => t.slug === params.slug)) throw notFound();
    return null;
  },

  /**
   * As metatags precisam sair no HTML servido, não depois da hidratação: o robô
   * de preview do WhatsApp — que é o canal de conversão do site — não roda JS.
   * Antes, as 8 páginas compartilhavam o mesmo title e a mesma description.
   */
  head: ({ params }) => {
    const t = TRATAMENTOS.find((x) => x.slug === params.slug);
    if (!t) return {};
    // O título levava 65 a 75 caracteres e o Google corta perto de 60 -- o
    // corte caía dentro do nome da clínica. `tituloLocal` põe o procedimento e
    // o bairro na frente, que é o que a pessoa digita, e encolhe a marca até
    // caber. `descricaoLocal` junta só as frases que cabem inteiras.
    const title = tituloLocal(t.titulo);
    const description = descricaoLocal(t.desc, FECHO_LOCAL);
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
      // Estas oito páginas não tinham dado estruturado nenhum -- e são elas, não
      // a home, que respondem a "implante dentário na Freguesia do Ó". Sem isso
      // o Google via oito URLs com texto parecido e nenhuma pista de que cada
      // uma trata de um procedimento diferente.
      //
      // `provider` aponta por @id para o mesmo consultório declarado na home, em
      // vez de repetir endereço e telefone aqui: o Google junta os dois sozinho,
      // e não existe a cópia que envelhece.
      scripts: [{ type: "application/ld+json", children: dadosEstruturadosDoTratamento(t) }],
    };
  },
});

function TreatmentPage() {
  const { slug } = Route.useParams();
  return <PaginaDeTratamento slug={slug} />;
}
