import { Clock3, MapPin, MessageCircle, Phone } from "lucide-react";

import { Logo } from "@/components/site/Logo";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { CLINICA } from "@/lib/jp";

const ASSUNTO = "Clareamento dental";

/**
 * Cabeçalho exclusivo da landing de clareamento.
 *
 * Não existe menu, hambúrguer, navegação para a home nem links de descoberta:
 * quem chegou de anúncio já declarou a intenção. O cabeçalho só responde às
 * quatro perguntas que ajudam a pessoa a continuar: quem é a clínica, onde
 * fica, quando atende e como falar no WhatsApp.
 */
export function HeaderClareamentoAds() {
  const wa = useContatoWhatsApp("informacoes", ASSUNTO);

  return (
    <header className="sticky top-0 z-[100] border-b border-border-soft bg-[#FDFEFA]/98 shadow-[0_10px_35px_rgba(3,47,1,.07)] backdrop-blur-xl">
      <div className="bg-brand-deep text-white">
        <div className="jp-container flex min-h-[34px] items-center justify-between gap-3 py-1.5">
          <span className="flex min-w-0 items-center gap-2 text-micro font-semibold uppercase tracking-[.1em] text-white/90">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-lime" aria-hidden="true" />
            <span className="truncate">Vila Bruna • Freguesia do Ó • São Paulo</span>
          </span>

          <div className="hidden shrink-0 items-center gap-4 md:flex">
            <span className="flex items-center gap-2 text-micro font-semibold uppercase tracking-[.09em] text-white/90">
              <Clock3 className="h-3.5 w-3.5 text-lime" aria-hidden="true" />
              Seg. a sex. • 08h às 18h
            </span>
            <a
              href={CLINICA.telefoneHref}
              className="flex items-center gap-2 text-micro font-bold text-white transition hover:text-lime"
            >
              <Phone className="h-3.5 w-3.5 text-lime" aria-hidden="true" />
              {CLINICA.telefone}
            </a>
          </div>
        </div>
      </div>

      <div className="jp-container flex h-[72px] items-center justify-between gap-3 sm:h-[82px]">
        <a href="/" aria-label={`${CLINICA.nome} — início`} className="shrink-0">
          <Logo
            variante="lockup"
            fundo="claro"
            altura={56}
            className="h-[46px] w-auto sm:h-[58px]"
          />
        </a>

        <div className="flex items-center gap-2">
          <a
            href={CLINICA.telefoneHref}
            aria-label="Ligar para a JP Clínica"
            className="grid h-11 w-11 place-items-center rounded-full border border-forest/12 bg-white text-forest-2 md:hidden"
          >
            <Phone className="h-4.5 w-4.5" aria-hidden="true" />
          </a>

          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-[1.5px] border-lime bg-forest px-4 text-xs font-extrabold text-white shadow-[0_8px_22px_rgba(9,89,2,.2)] transition hover:-translate-y-0.5 hover:bg-[#0C7503] sm:px-5 sm:text-sm"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            <span className="sm:hidden">WhatsApp</span>
            <span className="hidden sm:inline">Ver valores e horários</span>
          </a>
        </div>
      </div>
    </header>
  );
}
