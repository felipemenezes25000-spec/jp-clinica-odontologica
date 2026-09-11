import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarCheck, MessageCircle, Phone, X } from "lucide-react";
import { CLINICA, whatsappLink } from "@/lib/jp";
import { contatoWhatsApp } from "@/lib/contato";

const CHAVE_DISPENSA = "jp:cta-dispensado";

export function FloatingCTA() {
  const [showBar, setShowBar] = useState(false);
  const [dispensado, setDispensado] = useState(false);

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

  /**
   * A dispensa é lida aqui, e não no useState, de propósito: o servidor não
   * tem sessionStorage, então o valor inicial precisa ser igual nos dois lados
   * ou o React acusa erro de hidratação.
   *
   * sessionStorage e não localStorage: quem fecha está dizendo "agora não",
   * não "nunca mais". Na próxima visita a barra volta.
   */
  useEffect(() => {
    try {
      if (sessionStorage.getItem(CHAVE_DISPENSA) === "1") setDispensado(true);
    } catch {
      /* modo privado pode bloquear o acesso; nesse caso a barra só não lembra */
    }
  }, []);

  const dispensar = () => {
    setDispensado(true);
    try {
      sessionStorage.setItem(CHAVE_DISPENSA, "1");
    } catch {
      /* idem */
    }
  };

  const visivel = showBar && !dispensado;

  const wa = contatoWhatsApp("agendar");

  return (
    <>
      {/* CTA persistente aprovado: surge depois da capa e acompanha a rolagem. */}
      <div
        className={`sticky-booking-shell fixed inset-x-0 bottom-5 z-[58] hidden px-5 transition-all duration-500 md:block ${
          visivel
            ? "translate-y-0 opacity-100"
            : "pointer-events-none invisible translate-y-8 opacity-0"
        }`}
        aria-hidden={!visivel}
      >
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-5 rounded-[1.25rem] border border-lime/25 bg-[linear-gradient(110deg,#011600_0%,#022400_62%,#032F01_100%)] px-5 py-3.5 text-white shadow-[0_24px_70px_-30px_rgba(3,47,1,.75)] backdrop-blur-xl lg:px-7">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-lime text-brand-deep shadow-[0_10px_26px_-16px_rgba(86,168,5,.9)]">
              <CalendarCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-extrabold tracking-[-.025em] lg:text-lg">
                Pronto para transformar seu sorriso?
              </p>
              <p className="mt-0.5 hidden truncate text-xs font-medium text-white lg:block">
                {/* Era "descubra o melhor cuidado": superlativo sobre o proprio
                    serviço, que o CFO 118/2012 nao admite em publicidade
                    odontologica e que, mesmo se admitisse, e a frase que toda
                    clinica escreve. O que a JP de fato oferece e planejamento
                    caso a caso — isso e verificavel, e diz mais. */}
                Agende sua avaliação e veja o que faz sentido para você e sua família.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border-[1.5px] border-lime bg-forest px-5 py-2.5 text-xs font-extrabold text-white shadow-[0_12px_30px_-18px_rgba(9,89,2,.9)] transition hover:-translate-y-0.5"
            >
              <MessageCircle className="h-4 w-4" />
              Agendar avaliação
              <ArrowUpRight className="h-4 w-4" />
            </a>

            <button
              type="button"
              onClick={dispensar}
              aria-label="Fechar convite para agendar"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/25 text-white transition hover:border-white/60 hover:bg-white/10"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* WhatsApp permanece disponível durante todo o site.
          Formato de balão: a "rabicho" é um quadrado girado 45° na base, com
          borda só nos dois lados que ficam de fora. Ele precisa da mesma cor de
          fundo do balão, senão aparece a emenda. */}
      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar com a JP Clínica no WhatsApp"
        className={`group fixed right-4 z-[60] hidden items-center gap-3 rounded-[26px] rounded-br-[8px] border-[1.5px] border-lime bg-forest py-2.5 pl-2.5 pr-5 text-white shadow-[0_20px_60px_-25px_rgba(0,0,0,.65)] transition-all duration-500 hover:-translate-y-1 sm:flex ${
          visivel ? "bottom-[136px] md:bottom-[128px]" : "bottom-7"
        }`}
      >
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime text-brand-deep">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-lime [animation:pulse-ring_1.7s_ease-out_infinite]"
          />
          <MessageCircle className="h-5 w-5" />
        </span>

        <span className="text-[15px] font-extrabold tracking-[-.01em]">Fale no WhatsApp</span>

        <span
          aria-hidden="true"
          className="absolute -bottom-[9px] right-5 h-4 w-4 rotate-45 rounded-br-[3px] border-b-[1.5px] border-r-[1.5px] border-lime bg-forest"
        />
      </a>

      {/* `invisible` + aria-hidden quando recolhida: só `translate-y-full` a tira
          da vista, mas deixa os dois links na ordem de tabulação e anunciados
          pelo leitor de tela — a pessoa navegava para botões fora da tela. */}
      <div
        className={`mobile-sticky-cta fixed inset-x-0 bottom-0 z-[60] border-t border-forest/10 bg-cream/96 p-2.5 backdrop-blur-xl transition-[translate,visibility] duration-500 sm:hidden ${
          visivel ? "translate-y-0" : "invisible translate-y-full"
        }`}
        aria-hidden={!visivel}
      >
        <div className="grid grid-cols-[.34fr_1fr_auto] gap-2">
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
          <button
            type="button"
            onClick={dispensar}
            aria-label="Fechar convite para agendar"
            className="grid min-h-12 w-12 place-items-center rounded-full border border-forest/12 bg-white text-forest-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
