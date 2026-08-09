import { ArrowUpRight, Facebook, Instagram, MapPin, MessageCircle, Phone } from "lucide-react";
import logo from "@/assets/logo-jp-official.webp";
import { CLINICA, EQUIPE, HISTORIA, NAV, whatsappLink } from "@/lib/jp";

export function Footer() {
  return (
    <footer className="bg-forest-2 text-white">
      <div className="container-jp py-14 sm:py-18 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_.8fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white">
                <img
                  src={logo}
                  alt="Logo JP Clínica Odontológica"
                  width={48}
                  height={48}
                  className="h-12 w-12 object-contain"
                />
              </span>
              <div>
                <p className="font-display text-xl font-black tracking-[-.04em]">
                  JP Clínica Odontológica
                </p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[.2em] text-white/60">
                  Vila Bruna • São Paulo
                </p>
              </div>
            </div>
            <p className="mt-7 max-w-xl font-display text-[clamp(2.1rem,5vw,4.7rem)] font-extrabold leading-[.88] tracking-[-.065em] text-white">
              Ver seu sorriso <span className="text-lime">é nossa missão.</span>
            </p>
            <a
              href={whatsappLink(
                "Olá! Gostaria de agendar uma avaliação na JP Clínica Odontológica.",
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="button-primary mt-8"
            >
              <MessageCircle className="h-5 w-5" />
              Agendar avaliação
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>

          <nav aria-label="Navegação do rodapé">
            <p className="eyebrow text-white/60">Navegue</p>
            <ul className="mt-5 grid gap-2.5">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-sm font-semibold text-white/65 transition-colors hover:text-lime"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="eyebrow text-white/60">Fale com a JP</p>
            <ul className="mt-5 grid gap-4 text-sm font-semibold text-white/70">
              <li>
                <a
                  href={CLINICA.telefoneHref}
                  className="flex items-center gap-3 transition-colors hover:text-lime"
                >
                  <Phone className="h-4 w-4 text-lime" />
                  {CLINICA.telefone}
                </a>
              </li>
              <li>
                <a
                  href={CLINICA.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 transition-colors hover:text-lime"
                >
                  <MessageCircle className="h-4 w-4 text-lime" />
                  {CLINICA.whatsapp}
                </a>
              </li>
              <li>
                <a
                  href={CLINICA.mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 leading-relaxed transition-colors hover:text-lime"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-lime" />
                  {CLINICA.endereco}
                </a>
              </li>
            </ul>

            <div className="mt-6 flex gap-2">
              <a
                href={CLINICA.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram da JP Clínica"
                className="grid h-11 w-11 place-items-center rounded-full border border-white/12 text-white/70 transition-all hover:border-lime hover:bg-lime hover:text-forest-2"
              >
                <Instagram className="h-5 w-5" />
              </a>
              <a
                href={CLINICA.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook da JP Clínica"
                className="grid h-11 w-11 place-items-center rounded-full border border-white/12 text-white/70 transition-all hover:border-lime hover:bg-lime hover:text-forest-2"
              >
                <Facebook className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-5 border-t border-white/10 pt-6 text-[11px] leading-relaxed text-white/60 sm:grid-cols-2 lg:mt-16">
          <div>
            {/* Identificação do responsável técnico: exigência do CFO em
                publicidade odontológica, e o rodapé é a única peça em todas as rotas. */}
            {EQUIPE[0] && (
              <p className="font-semibold text-white/75">
                Responsável técnica: {EQUIPE[0].nome} — {EQUIPE[0].registro}
              </p>
            )}
            <p className="mt-1">
              {CLINICA.razaoSocial} • CNPJ {CLINICA.cnpj}
            </p>
            <p className="mt-1">{CLINICA.horario}</p>
          </div>
          <div className="sm:text-right">
            <p>
              Conteúdo informativo. Indicações e resultados dependem de avaliação profissional
              individual.
            </p>
            <p className="mt-1">
              © {HISTORIA.anoCopyright} JP Clínica Odontológica. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
