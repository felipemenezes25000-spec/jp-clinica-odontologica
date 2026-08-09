import { useEffect, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { CLINICA, whatsappLink } from "@/lib/jp";

export function FloatingCTA() {
  const [showBar, setShowBar] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowBar(window.scrollY > 620);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const wa = whatsappLink("Olá! Gostaria de agendar uma avaliação na JP Clínica Odontológica.");

  return (
    <>
      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar com a JP Clínica no WhatsApp"
        className="group fixed bottom-5 right-4 z-50 hidden items-center gap-3 rounded-full bg-lime p-2 pr-4 text-forest-2 shadow-[0_20px_60px_-25px_rgba(0,0,0,.65)] transition-transform hover:-translate-y-1 sm:flex"
      >
        <span className="relative grid h-11 w-11 place-items-center rounded-full bg-forest-2 text-white">
          <span className="absolute inset-0 rounded-full border border-lime [animation:pulse-ring_1.7s_ease-out_infinite]" />
          <MessageCircle className="h-5 w-5" />
        </span>
        <span className="text-xs font-black uppercase tracking-[.06em]">WhatsApp</span>
      </a>

      <div
        className={`mobile-sticky-cta fixed inset-x-0 bottom-0 z-50 border-t border-forest/10 bg-cream/95 p-2.5 backdrop-blur-xl transition-transform duration-500 sm:hidden ${showBar ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="grid grid-cols-[.36fr_1fr] gap-2">
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
