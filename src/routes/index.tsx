import { createFileRoute } from "@tanstack/react-router";

import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { FloatingCTA } from "@/components/site/FloatingCTA";
import { SkipLink } from "@/components/site/SkipLink";
import { TopoHome } from "@/components/site/home/TopoHome";
import { Clinica } from "@/components/site/home/clinica";
import { Estrutura } from "@/components/site/home/estrutura";
import { Contato } from "@/components/site/home/contato";
import { SpecialtiesSection } from "@/components/site/SpecialtiesSection";
import { ConveniosSection } from "@/components/site/ConveniosSection";
import { TeamSection } from "@/components/site/TeamSection";
import { HistorySection } from "@/components/site/HistorySection";
import { ReviewsSection } from "@/components/site/ReviewsSection";
import { AtendimentoSection } from "@/components/site/AtendimentoSection";
import { FaqSection } from "@/components/site/FaqSection";
import { ComoFunciona } from "@/components/site/home/ComoFunciona";
import { SITE_URL } from "@/lib/jp";
import { FECHO_LOCAL, descricaoLocal, tituloLocal } from "@/lib/seo";
import { DADOS_ESTRUTURADOS } from "@/lib/dadosEstruturados";
// A foto do topo (home/TopoHome.tsx). Mudou lá, muda aqui.
import fotoDoTopo from "@/assets/consultorio-implantes-1.webp";

// 73 caracteres antes, e o Google corta perto de 60: o título terminava dentro
// de "São Paulo". Agora "Dentista na Freguesia do Ó" -- que é a busca -- vem
// na frente, e a marca fecha.
const TITLE = tituloLocal("Dentista");
const DESCRIPTION = descricaoLocal(
  "Odontologia para crianças, adultos e idosos, com planejamento individual e atendimento humano.",
  FECHO_LOCAL,
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    // Absoluto, e nao "/": canonical relativo o Google descarta -- o Lighthouse
    // reprovou com "Document does not have a valid rel=canonical". As outras
    // cinco rotas do site ja usavam SITE_URL; so a home tinha ficado para tras.
    links: [
      { rel: "canonical", href: `${SITE_URL}/` },
      // A foto do topo é o LCP. Sem o preload o navegador só a acha depois de
      // ler o HTML inteiro do topo; com ele, a descoberta sai junto com o CSS.
      { rel: "preload", as: "image", href: fotoDoTopo, fetchPriority: "high" },
    ],
    scripts: [
      // Os dados estruturados vivem em @/lib/dadosEstruturados, montados a
      // partir de CLINICA, AVALIACOES, HISTORIA, TRATAMENTOS e FAQ.
      //
      // O que estava aqui tinha endereço, horário e as perguntas, mas faltava o
      // que mais rende em busca local: `aggregateRating` -- é ele que permite o
      // Google desenhar as estrelas no resultado -- além de `geo`, da data de
      // fundação, da responsável técnica com o CRO e da lista de tratamentos.
      { type: "application/ld+json", children: DADOS_ESTRUTURADOS },
    ],
  }),
  component: Home,
});

/**
 * A home, na ordem da direção "Clínica luminosa" (06/11/2026), pensada para
 * converter: o topo responde confiança, lugar e contato; logo abaixo, os
 * convênios ("aceitam meu plano?") e os tratamentos ("fazem o que eu
 * preciso?"); depois a prova (diferenciais, avaliações, equipe), o caminho
 * até a consulta (como funciona), a casa (história, estrutura, atendimento
 * adaptado), as dúvidas e o contato.
 */
function Home() {
  return (
    <div className="site min-h-dvh">
      <SkipLink />
      <Header />

      <main id="conteudo">
        <TopoHome />
        <ConveniosSection />
        <SpecialtiesSection />
        <Clinica />
        <ReviewsSection />

        {/* A lista EQUIPE precisa ser só de gente real, cada dentista com o
            registro que a clínica informou. Se algum dia ela voltar a ter
            entrada `ficticio`, esta seção tem de sair da home de novo — o
            componente não faz essa checagem sozinho. */}
        <TeamSection />
        <ComoFunciona />
        <HistorySection />
        <Estrutura />
        <AtendimentoSection />
        <FaqSection />
        <Contato />
      </main>

      <Footer chamada={false} />
      <FloatingCTA />
    </div>
  );
}
