/**
 * A PÁGINA DE UM TRATAMENTO — o corpo, sem rota.
 *
 * Estava dentro de `routes/tratamentos/$slug.tsx` e lia o slug de
 * `Route.useParams()`, o que a prendia àquela URL. Hoje nove rotas a usam: a
 * orgânica (`/tratamentos/<slug>`) e as OITO de anúncio (`/implante-dentario` e
 * companhia), que precisam da MESMA página sob uma URL que combine com o termo
 * pesquisado.
 *
 * A extração é o que evita o pior desfecho possível aqui: oito cópias de 500
 * linhas que começam iguais e envelhecem diferente. Uma correção de conteúdo
 * tem de valer para as **16 URLs** — 8 orgânicas e 8 pagas — de uma vez.
 *
 * Desde o redesenho de 11/2026 este arquivo só monta a página: cada seção mora
 * em `tratamento/` (Topo.tsx e Secoes.tsx) e as mídias em `tratamento/midia.ts`.
 */
import { ArrowLeft } from "lucide-react";

import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { FloatingCTA } from "@/components/site/FloatingCTA";
import { SkipLink } from "@/components/site/SkipLink";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { TRATAMENTOS } from "@/lib/jp";
import {
  ChamadaFinal,
  Entenda,
  Etapas,
  OutrosCaminhos,
  ParaQuem,
  Perguntas,
  PorQueJP,
} from "./tratamento/Secoes";
import { ANIMACOES, RELACIONADOS, fotosDaPagina } from "./tratamento/midia";
import { Topo } from "./tratamento/Topo";
import "./tratamento/tratamento.css";

/**
 * ORGÂNICO OU ANÚNCIO — a mesma página, duas intenções de leitura.
 *
 * `organico` é quem chegou pela busca e pode estar comparando tratamentos: para
 * essa pessoa, "Outros caminhos de cuidado" no fim é serviço.
 *
 * `anuncio` é quem clicou num anúncio de implante que a clínica pagou. Oferecer
 * ortodontia a ela é pagar por um clique de implante e mandar a pessoa embora
 * para outro assunto — o vazamento mais caro que uma LP pode ter.
 *
 * O QUE O MODO **NÃO** MUDA, e a lista é a parte importante: marca, cabeçalho,
 * rodapé, CRO da responsável técnica, endereço, prova social, política de
 * privacidade, acessibilidade e todo o conteúdo do tratamento. Nada que sirva à
 * confiança ou à conformidade com o CFO sai por causa de conversão.
 */
export type ModoDaPagina = "organico" | "anuncio";

export function PaginaDeTratamento({
  slug,
  modo = "organico",
  termo,
}: {
  slug: string;
  modo?: ModoDaPagina;
  /** Como a rota de anúncio chama o procedimento ("Aparelho e ortodontia"); vira o H1. */
  termo?: string;
}) {
  const index = TRATAMENTOS.findIndex((item) => item.slug === slug);
  const tratamento = TRATAMENTOS[index];

  /*
   * O HOOK VEM ANTES DO `return` DE PÁGINA INEXISTENTE, e não por estilo: a
   * regra dos hooks proíbe chamada condicional, e um `useContatoWhatsApp` depois
   * do early return quebraria a ordem entre um render e o seguinte.
   */
  const wa = useContatoWhatsApp("agendar", tratamento?.titulo);
  const anuncio = modo === "anuncio";

  if (!tratamento) {
    return (
      <div className="site min-h-dvh">
        <SkipLink />
        <Header enxuto={anuncio} />
        <main id="conteudo" className="quadro tt-vazia">
          <h1 className="text-titulo">Esse caminho não existe.</h1>
          <a href="/#tratamentos" className="botao botao-acento">
            <ArrowLeft aria-hidden="true" /> Voltar aos tratamentos
          </a>
        </main>
      </div>
    );
  }

  // No modo anúncio a lista sai vazia, e a seção inteira deixa de ser montada.
  const outros = anuncio
    ? []
    : (RELACIONADOS[tratamento.slug] ?? [])
        .map((relacionado) => TRATAMENTOS.find((item) => item.slug === relacionado))
        .filter((item): item is (typeof TRATAMENTOS)[number] => Boolean(item))
        .slice(0, 3);
  const fotos = fotosDaPagina(tratamento.slug);

  return (
    <div className="site min-h-dvh">
      <SkipLink />
      {/* No modo anúncio o cabeçalho perde os links de navegação — são seis
          caminhos de fuga no topo de uma página que a clínica pagou para a
          pessoa abrir. Marca, telefone e CTA continuam. Ver `Header`. */}
      <Header enxuto={anuncio} />

      <main id="conteudo">
        <Topo
          tratamento={tratamento}
          modo={modo}
          animacao={ANIMACOES[tratamento.slug]}
          wa={wa}
          termo={termo}
        />
        <Entenda tratamento={tratamento} foto={fotos.entenda} />
        <ParaQuem tratamento={tratamento} foto={fotos.paraQuem} />
        <Etapas tratamento={tratamento} />
        {/* As perguntas ficam entre as etapas e "por que a JP": assim os dois
            campos escuros (etapas e a clínica) não se encostam. */}
        <Perguntas tratamento={tratamento} />
        <PorQueJP />
        <ChamadaFinal wa={wa} />
        {outros.length > 0 && <OutrosCaminhos outros={outros} />}
      </main>

      <Footer />
      {/* O CTA que acompanha a rolagem fala do MESMO tratamento que a página.
          Sem isto, a barra flutuante da página de implante abria o WhatsApp com
          a mensagem genérica do site — e é ela que a pessoa usa depois de ler. */}
      <FloatingCTA assunto={tratamento.titulo} />
    </div>
  );
}
