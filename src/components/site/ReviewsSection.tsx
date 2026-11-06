import { ArrowUpRight } from "lucide-react";

import consultorio from "@/assets/consultorio-wide.webp";
import { CLINICA, DEPOIMENTOS } from "@/lib/jp";
import { GoogleRating } from "@/components/site/GoogleRating";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { FormaCoroa, MarcaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import "./home/avaliacoes.css";

/**
 * Prova social com as avaliações do Google transcritas da ficha da clínica.
 * Todas são reais — a clínica confirmou em 11/09/2026, e a marcação `ficticio`
 * que duas carregavam foi removida de jp.ts junto com o aviso que a acompanhava.
 *
 * COMPOSIÇÃO — "retrato e citação deslocada", espelhada em relação ao
 * atendimento (que sangra pela esquerda). Quem avaliou não tem retrato (e
 * nenhum foi inventado): a coroa, cortada pela borda direita da tela, mostra o
 * lugar para onde essas pessoas foram — o consultório. A nota vem antes da
 * citação, na maior medida do site, porque é o número que a pessoa procura
 * primeiro; a citação principal desce e recua em relação ao título para a
 * leitura não ser uma pilha de blocos alinhados. As outras avaliações ficam
 * sem caixa: espaço e uma coroa-marcador separam uma da outra. A seção termina
 * no convite para agendar, o ponto de maior intenção do funil.
 *
 * A citação em destaque é a mais curta e sem procedimento nem profissional
 * citado (art. 43 e 44 do Código de Ética: autopromoção que identifica
 * paciente ou profissional sem registro). A avaliação longa, que cita a Dra.
 * Ana Beatriz e uma extração, continua na lista, em corpo normal. Os
 * sobrenomes aparecem só com a inicial, como a maioria das avaliações já vem.
 *
 * Não exibimos estrelas individuais porque o dado salvo de cada depoimento tem
 * apenas autor + texto. Atribuir 5/5 sem a nota individual registrada seria
 * transformar ausência de dado em afirmação. As estrelas daqui são as da NOTA
 * da ficha, que é dado de verdade.
 */

/** "Mari Nozzolillo" vira "Mari N."; quem já vem abreviado fica como está. */
function abreviar(autor: string) {
  const partes = autor.trim().split(/\s+/);
  const ultima = partes[partes.length - 1] ?? "";
  if (partes.length < 2 || ultima.endsWith(".")) return autor;
  return `${partes.slice(0, -1).join(" ")} ${ultima.charAt(0)}.`;
}

function Autoria({ autor }: { autor: string }) {
  return (
    <figcaption className="mt-5 flex items-baseline gap-3 text-pequeno text-tinta-suave">
      <MarcaCoroa className="text-acento" />
      <span>
        <span className="font-semibold text-tinta">{abreviar(autor)}</span>
        {" · "}Avaliação no Google
      </span>
    </figcaption>
  );
}

export function ReviewsSection() {
  const wa = useContatoWhatsApp("agendar");
  // A avaliação curta vai ao destaque; se ela sair de jp.ts, a primeira assume.
  const destaque = DEPOIMENTOS.find((d) => d.autor.startsWith("Valéria")) ?? DEPOIMENTOS[0];
  const demais = DEPOIMENTOS.filter((d) => d !== destaque);

  return (
    <section
      id="depoimentos"
      aria-labelledby="depoimentos-titulo"
      className="avaliacoes secao relative bg-chao text-tinta"
    >
      <div className="quadro grid gap-x-[var(--margem)] gap-y-12 lg:grid-cols-12 lg:gap-y-16">
        <div className="order-1 lg:col-span-7 lg:col-start-1 lg:row-start-1">
          <h2 id="depoimentos-titulo" data-linhas className="text-titulo">
            O que dizem da JP no Google
          </h2>

          <div className="mt-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <GoogleRating variante="destaque" />
            <a
              href={CLINICA.mapsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="link inline-flex min-h-11 items-center gap-1.5 text-corpo font-medium"
            >
              Ver as avaliações no Google
              <ArrowUpRight className="h-[1.1em] w-[1.1em]" aria-hidden="true" />
            </a>
          </div>
        </div>

        {destaque && (
          <figure
            data-entra
            className="order-2 lg:col-span-6 lg:col-start-2 lg:row-start-2 lg:mt-[clamp(1rem,3vw,3rem)]"
          >
            <div data-item>
              <FormaCoroa proporcao={0.86} className="mb-6 h-9 w-9 text-acento" />
              <blockquote>
                <p className="text-frase">{destaque.texto}</p>
              </blockquote>
              <Autoria autor={destaque.autor} />
            </div>
          </figure>
        )}

        {/* O retrato gruda enquanto as citações passam: sem isso, a coluna da
            esquerda (bem mais alta) deixaria meia tela vazia ao lado do texto.
            O obturador anima o `clip-path` do próprio elemento marcado; por
            isso a sangria vive neste invólucro, e a moldura só o preenche. */}
        <div className="order-3 lg:sticky lg:top-[calc(var(--altura-cabecalho)+2rem)] lg:col-span-4 lg:col-start-9 lg:row-span-3 lg:row-start-1 lg:self-start">
          <div data-obturador className="avaliacoes-foto">
            <MolduraCoroa medir className="h-full w-full">
              <img
                src={consultorio}
                alt="Consultório da clínica, claro e organizado, com a cadeira odontológica ao lado da janela"
                width={1500}
                height={800}
                loading="lazy"
                decoding="async"
                className="object-[66%_50%]"
                data-deriva
              />
            </MolduraCoroa>
          </div>
        </div>

        <div className="order-4 lg:col-span-7 lg:col-start-1 lg:row-start-3">
          <ul data-entra className="grid gap-x-[var(--margem)] gap-y-12 sm:grid-cols-2">
            {demais.map((item) => (
              <li key={item.autor} data-item className="avaliacao-item">
                <figure>
                  <blockquote>
                    <p className="text-corpo">{item.texto}</p>
                  </blockquote>
                  <Autoria autor={item.autor} />
                </figure>
              </li>
            ))}
          </ul>

          <div className="mt-14">
            <a
              data-ima
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao-acento"
            >
              Agendar minha avaliação
              <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
