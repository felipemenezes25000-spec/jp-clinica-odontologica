import { useCallback, useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";

import type { Depoimento } from "@/lib/jp";
import { querMenosMovimento } from "@/components/site/sistema/ambiente";

import "./ui.css";

/**
 * Os depoimentos reais do Google num carrossel (Embla).
 *
 * Arrasta com o dedo no celular, anda sozinho a cada 6s no desktop (para no
 * hover e quando a pessoa interage), setas e pontos para quem usa mouse ou
 * teclado. Sem estrelas por depoimento: o site não sabe quantas cada pessoa
 * deu (ver Estrelas). Com "reduzir movimento", não anda sozinho.
 *
 * O HTML do servidor já traz todos os cartões em fileira: sem JavaScript, a
 * fileira rola na horizontal como uma lista comum.
 */
/** Acima disso o cartão mostra o começo e um botão para ler o resto. */
const LIMITE_DE_CARACTERES = 220;

/**
 * Um depoimento. O texto é publicado inteiro: o longo começa recolhido (para
 * os cartões vizinhos não ficarem com um vão enorme) e abre no botão. Nada de
 * reticências sem saída — é a palavra de um paciente real.
 */
function CartaoDepoimento({ depoimento: d }: { depoimento: Depoimento }) {
  const [aberto, setAberto] = useState(false);
  const longo = d.texto.length > LIMITE_DE_CARACTERES;

  return (
    <figure className="cartao flex h-full flex-col gap-5 p-6 sm:p-7">
      <Quote aria-hidden="true" className="h-7 w-7 text-[var(--acento)]" />
      <div>
        <blockquote
          className={`text-[1.0625rem] leading-relaxed text-[var(--tinta)] ${
            longo && !aberto ? "line-clamp-6" : ""
          }`}
        >
          {d.texto}
        </blockquote>
        {longo && (
          <button
            type="button"
            className="link mt-2 inline-flex min-h-11 items-center text-pequeno font-semibold text-[var(--acento-texto)]"
            aria-expanded={aberto}
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? "Mostrar menos" : "Ler avaliação completa"}
          </button>
        )}
      </div>
      <figcaption className="mt-auto flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--menta)] font-semibold text-[var(--acento-texto)]"
        >
          {d.autor.charAt(0)}
        </span>
        <span className="grid leading-tight">
          <span className="font-semibold">{d.autor}</span>
          <span className="text-pequeno text-[var(--tinta-suave)]">Avaliação no Google</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function CarrosselAvaliacoes({
  itens,
  className = "",
}: {
  itens: readonly Depoimento[];
  className?: string;
}) {
  const autoplay = useMemo(
    () =>
      Autoplay({
        delay: 6000,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
        stopOnFocusIn: true,
        playOnInit: false,
      }),
    [],
  );
  const [viewportRef, api] = useEmblaCarousel(
    { loop: true, align: "start", containScroll: false, duration: 32 },
    [autoplay],
  );
  const [selecionado, setSelecionado] = useState(0);
  const [pontos, setPontos] = useState<number[]>([]);

  useEffect(() => {
    if (!api) return;
    const aoSelecionar = () => setSelecionado(api.selectedScrollSnap());
    const aoReiniciar = () => {
      setPontos(api.scrollSnapList());
      aoSelecionar();
    };
    aoReiniciar();
    api.on("select", aoSelecionar);
    api.on("reInit", aoReiniciar);
    if (!querMenosMovimento()) autoplay.play();
    return () => {
      api.off("select", aoSelecionar);
      api.off("reInit", aoReiniciar);
    };
  }, [api, autoplay]);

  const anterior = useCallback(() => api?.scrollPrev(), [api]);
  const proximo = useCallback(() => api?.scrollNext(), [api]);

  return (
    <div
      className={`carrossel ${className}`}
      data-pronto={api ? "" : undefined}
      role="region"
      aria-roledescription="carrossel"
      aria-label="Avaliações de pacientes no Google"
    >
      <div ref={viewportRef} className="carrossel-janela">
        <div className="carrossel-trilho">
          {itens.map((d, i) => (
            <div
              key={d.autor}
              className="carrossel-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${String(i + 1)} de ${String(itens.length)}`}
            >
              <CartaoDepoimento depoimento={d} />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1.5" aria-hidden="true">
          {pontos.map((p, i) => (
            <span
              key={p}
              className="carrossel-ponto"
              data-ativo={i === selecionado ? "" : undefined}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={anterior}
            className="carrossel-seta"
            aria-label="Avaliação anterior"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={proximo}
            className="carrossel-seta"
            aria-label="Próxima avaliação"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
