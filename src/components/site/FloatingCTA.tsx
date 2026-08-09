import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarCheck, MessageCircle, Phone } from "lucide-react";
import { CLINICA, whatsappLink } from "@/lib/jp";

export function FloatingCTA() {
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBar(window.scrollY > Math.max(520, window.innerHeight * 0.72));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const wa = whatsappLink(
    "Olá! Vim pelo site da JP Clínica Integrada Odontológica e gostaria de agendar uma avaliação.",
  );

  return (
    <>
      {/* CTA persistente aprovado: surge depois da capa e acompanha a rolagem. */}
      <div
        className={`sticky-booking-shell fixed inset-x-0 bottom-5 z-[58] hidden px-5 transition-all duration-500 md:block ${
          showBar
            ? "translate-y-0 opacity-100"
            : "pointer-events-none invisible translate-y-8 opacity-0"
        }`}
        aria-hidden={!showBar}
      >
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-5 rounded-[1.25rem] border border-lime/25 bg-[linear-gradient(110deg,#052D0B_0%,#0A3A15_62%,#12451B_100%)] px-5 py-3.5 text-white shadow-[0_24px_70px_-30px_rgba(5,45,11,.75)] backdrop-blur-xl lg:px-7">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime text-forest-2 shadow-[0_10px_26px_-16px_rgba(123,213,28,.9)]">
              <CalendarCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-extrabold tracking-[-.025em] lg:text-lg">
                Pronto para transformar seu sorriso?
              </p>
              <p className="mt-0.5 hidden truncate text-xs font-medium text-white lg:block">
                Agende sua avaliação e descubra o melhor cuidado para você e sua família.
              </p>
            </div>
          </div>

          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border-[1.5px] border-lime bg-forest px-5 py-2.5 text-xs font-extrabold text-white shadow-[0_12px_30px_-18px_rgba(47,107,53,.9)] transition hover:-translate-y-0.5"
          >
            <MessageCircle className="h-4 w-4" />
            Agendar avaliação agora
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* WhatsApp permanece disponível durante todo o site. */}
      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar com a JP Clínica no WhatsApp"
        className={`group fixed right-4 z-[60] hidden items-center gap-2 rounded-full border-[1.5px] border-lime bg-forest p-2 pr-4 text-white shadow-[0_20px_60px_-25px_rgba(0,0,0,.65)] transition-all duration-500 hover:-translate-y-1 sm:flex ${
          showBar ? "bottom-[112px] md:bottom-[104px]" : "bottom-5"
        }`}
      >
        <span className="relative grid h-10 w-10 place-items-center rounded-full bg-lime text-forest-2">
          <span className="absolute inset-0 rounded-full border border-lime [animation:pulse-ring_1.7s_ease-out_infinite]" />
          <MessageCircle className="h-4.5 w-4.5" />
        </span>
        <span className="text-[10px] font-extrabold uppercase tracking-[.08em]">WhatsApp</span>
      </a>

      {/* `invisible` + aria-hidden quando recolhida: só `translate-y-full` a tira
          da vista, mas deixa os dois links na ordem de tabulação e anunciados
          pelo leitor de tela — a pessoa navegava para botões fora da tela. */}
      <div
        className={`mobile-sticky-cta fixed inset-x-0 bottom-0 z-[60] border-t border-forest/10 bg-cream/96 p-2.5 backdrop-blur-xl transition-[translate,visibility] duration-500 sm:hidden ${
          showBar ? "translate-y-0" : "invisible translate-y-full"
        }`}
        aria-hidden={!showBar}
      >
        <div className="grid grid-cols-[.34fr_1fr] gap-2">
          <a
            href={CLINICA.telefoneHref}
            className="grid min-h-12 place-items-center rounded-full border border-forest/12 bg-white text-forest-2"
            aria-label="Ligar para a JP Clínica"
          >
            <Phone className="h-5 w-5" />
          </a>
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="button-dark min-h-12 py-2.5 text-sm"
          >
            <MessageCircle className="h-4 w-4" />
            Agendar avaliação
          </a>
        </div>
      </div>
    </>
  );
}
