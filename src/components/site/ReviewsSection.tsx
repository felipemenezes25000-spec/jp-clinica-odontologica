import { ArrowUpRight } from "lucide-react";

import { AVALIACOES, CLINICA, DEPOIMENTOS, notaBR } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { CarrosselAvaliacoes } from "@/components/site/ui/CarrosselAvaliacoes";
import { Contador } from "@/components/site/ui/Contador";
import { Estrelas } from "@/components/site/ui/Estrelas";
import "./home/avaliacoes.css";

/**
 * Prova social: a nota do Google e as avaliações transcritas da ficha da
 * clínica (todas reais, confirmadas pela clínica em 11/09/2026).
 *
 * A nota e o volume vêm de AVALIACOES, a mesma fonte do topo e das landings.
 * As estrelas são só as da NOTA GERAL: cada depoimento tem apenas autor e
 * texto, e atribuir 5/5 sem a nota individual registrada seria transformar
 * ausência de dado em afirmação.
 *
 * O link "Ver as avaliações no Google" aponta para CLINICA.mapsHref e o
 * rastreio o conta como `review_click` pelo texto do link ("avalia…"), então
 * a frase não deve perder essa raiz.
 */
export function ReviewsSection() {
  const wa = useContatoWhatsApp("agendar");

  return (
    <section
      id="depoimentos"
      aria-labelledby="depoimentos-titulo"
      className="avaliacoes secao bg-chao text-tinta"
    >
      <div className="quadro">
        <div className="avaliacoes-cabeca" data-entra>
          <div className="avaliacoes-texto" data-item>
            <p className="sobretitulo">Avaliações no Google</p>
            <h2 id="depoimentos-titulo" className="text-titulo mt-4">
              O que dizem da JP no Google
            </h2>
            <p className="text-corpo mt-5 max-w-[34ch] text-tinta-suave">
              Palavras de quem já foi atendido, como foram publicadas na ficha da clínica.
            </p>
          </div>

          <div className="avaliacoes-nota cartao" data-item>
            <p className="sr-only">
              Nota {notaBR} de 5 no Google, em {AVALIACOES.total} avaliações.
            </p>
            <div className="avaliacoes-nota-linha" aria-hidden="true">
              <span className="avaliacoes-nota-numero">
                <Contador valor={AVALIACOES.nota} casas={1} />
              </span>
              <span className="avaliacoes-nota-lado">
                <Estrelas tamanho="1.45rem" />
                <span className="avaliacoes-nota-total">
                  <Contador valor={AVALIACOES.total} /> avaliações no Google
                </span>
              </span>
            </div>
            <a
              href={CLINICA.mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="link avaliacoes-ver"
            >
              Ver as avaliações no Google
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>

        <CarrosselAvaliacoes itens={DEPOIMENTOS} className="avaliacoes-carrossel" />

        <div className="avaliacoes-fecho">
          <a
            data-ima
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="button-primary botao-grande"
          >
            Agendar avaliação
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
