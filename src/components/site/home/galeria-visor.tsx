import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

import type { EspacoFoto } from "./galeria-dados";

/**
 * Visor de foto ampliada.
 *
 * A trilha mostra a foto recortada, que é a que combina com o site. Aqui abre o
 * arquivo original inteiro — no caso dos posts do Instagram, com a moldura e o
 * logo da clínica, exatamente como a foto foi enviada. É a única foto do site
 * fora da coroa, de propósito: quem amplia quer conferir a imagem como ela é,
 * e a coroa comeria o topo dela.
 *
 * Flutua de verdade (cobre a página), então é o único lugar da galeria onde
 * cabe véu escuro; mas chapado, sem desfoque.
 */
export function VisorFoto({
  fotos,
  indice,
  aoFechar,
  aoNavegar,
}: {
  fotos: EspacoFoto[];
  indice: number;
  aoFechar: () => void;
  aoNavegar: (passo: number) => void;
}) {
  const foto = fotos[indice]!;
  const raiz = useRef<HTMLDivElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
      if (e.key === "ArrowRight") aoNavegar(1);
      if (e.key === "ArrowLeft") aoNavegar(-1);
      // O foco não sai do visor: sem isso o Tab chegava aos links da página
      // escondida atrás do véu.
      if (e.key === "Tab" && raiz.current) {
        const botoes = Array.from(raiz.current.querySelectorAll<HTMLElement>("button"));
        const primeiro = botoes[0];
        const ultimo = botoes[botoes.length - 1];
        if (!primeiro || !ultimo) return;
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    };
    document.addEventListener("keydown", tecla);
    // Trava a rolagem do fundo: sem isso o dedo no celular arrasta a página
    // atrás do visor em vez de mover a foto.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    botaoFechar.current?.focus();
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = overflowAnterior;
      // Devolve o foco ao item que abriu o visor.
      anterior?.focus?.({ preventScroll: true });
    };
  }, [aoFechar, aoNavegar]);

  const botao =
    "grid h-12 w-12 place-items-center rounded-full bg-chao text-tinta transition-colors duration-200 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-acento";

  return (
    <div
      ref={raiz}
      role="dialog"
      aria-modal="true"
      aria-label={`${foto.title} - foto ampliada`}
      /* `data-lenis-prevent`: a rolagem suave do site escuta a roda do mouse na
         página toda; sem a marca ela continuaria andando atrás do visor. */
      data-lenis-prevent
      className="fixed inset-0 z-[100] flex items-center justify-center bg-campo/95 p-4 sm:p-8"
      onClick={aoFechar}
    >
      {/* O clique no fundo fecha; dentro da foto, não. */}
      <figure
        className="relative flex max-h-full flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={foto.full ?? foto.src}
          alt={`${foto.title} da JP Clínica Integrada Odontológica`}
          className="max-h-[76vh] w-auto max-w-full object-contain"
        />
        <figcaption className="text-corpo text-center font-semibold text-sobre-campo">
          {foto.title}
          <span className="text-pequeno ml-3 font-normal text-sobre-campo-suave">
            {indice + 1} de {fotos.length}
          </span>
        </figcaption>
      </figure>

      <button
        ref={botaoFechar}
        type="button"
        onClick={aoFechar}
        aria-label="Fechar foto ampliada"
        className={`${botao} absolute right-4 top-4 sm:right-8 sm:top-8`}
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          aoNavegar(-1);
        }}
        aria-label="Foto anterior"
        className={`${botao} absolute left-2 top-1/2 -translate-y-1/2 sm:left-6`}
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          aoNavegar(1);
        }}
        aria-label="Próxima foto"
        className={`${botao} absolute right-2 top-1/2 -translate-y-1/2 sm:right-6`}
      >
        <ArrowRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
