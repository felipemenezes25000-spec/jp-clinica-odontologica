import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, MessageCircle, Phone, X } from "lucide-react";
import logo from "@/assets/logo-jp-official.webp";
import { CLINICA, NAV, whatsappLink } from "@/lib/jp";

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const painel = painelRef.current;
    if (!painel) return;

    const focaveis = () =>
      [...painel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter(
        (el) => el.offsetParent !== null,
      );

    focaveis()[0]?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        botaoRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const lista = focaveis();
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (!primeiro || !ultimo) return;
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [open]);

  const fecharMenu = () => {
    setOpen(false);
    botaoRef.current?.focus();
  };

  const wa = whatsappLink(
    "Olá! Vim pelo site da JP Clínica Integrada Odontológica e gostaria de agendar uma avaliação.",
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[80] hidden h-7 items-center bg-forest-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/70 lg:flex">
        <div className="container-jp flex items-center justify-between">
          <span>Vila Bruna • Freguesia do Ó • São Paulo/SP</span>
          <span className="flex items-center gap-5">
            <span>Segunda a sexta • 08h às 18h</span>
            <a href={CLINICA.telefoneHref} className="transition-colors hover:text-lime">
              {CLINICA.telefone}
            </a>
          </span>
        </div>
      </div>

      <header
        className={`fixed inset-x-0 top-0 z-[70] border-b border-forest/8 bg-white/95 backdrop-blur-xl transition-all duration-300 lg:top-7 ${
          scrolled ? "shadow-[0_14px_45px_-35px_rgba(7,55,28,.5)]" : ""
        }`}
      >
        <div
          className={`container-jp flex items-center justify-between gap-4 transition-all ${scrolled ? "h-[74px]" : "h-[86px]"}`}
        >
          <a
            href="/#inicio"
            className="group flex items-center gap-3"
            aria-label="JP Clínica Integrada Odontológica — início"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-forest/8 bg-white shadow-[0_10px_28px_-18px_rgba(7,55,28,.45)]">
              <img src={logo} alt="" width={42} height={42} className="h-10 w-10 object-contain" />
            </span>
            <span className="hidden sm:block">
              <span className="block font-display text-[20px] font-extrabold leading-none tracking-[-.03em] text-forest-2">
                JP Clínica
              </span>
              <span className="mt-1.5 block whitespace-nowrap text-[9px] font-extrabold uppercase tracking-[0.16em] text-primary-ink">
                Integrada Odontológica
              </span>
            </span>
          </a>

          <nav className="hidden items-center xl:flex" aria-label="Navegação principal">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-full px-2.5 py-2 text-[12px] font-bold text-forest/68 transition hover:bg-secondary hover:text-forest-2"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={CLINICA.telefoneHref}
              className="hidden h-11 items-center gap-2 rounded-full border border-forest/10 bg-white px-4 text-xs font-extrabold text-forest-2 transition hover:border-primary/35 lg:inline-flex xl:hidden 2xl:inline-flex"
            >
              <Phone className="h-4 w-4" />
              {CLINICA.telefone}
            </a>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-11 items-center gap-2 rounded-full bg-lime px-5 text-xs font-extrabold text-forest-2 shadow-[0_14px_32px_-20px_rgba(77,150,46,.8)] transition hover:-translate-y-0.5 sm:inline-flex"
            >
              Agendar avaliação
              <ArrowUpRight className="h-4 w-4" />
            </a>
            <button
              ref={botaoRef}
              type="button"
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="grid h-11 w-11 place-items-center rounded-full border border-forest/12 bg-white text-forest-2 transition-colors xl:hidden"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div
          ref={painelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          className="fixed inset-0 z-[65] h-dvh overflow-y-auto overscroll-contain bg-forest-2 pt-[96px] text-white lg:pt-[114px] xl:hidden"
        >
          <div className="container-jp flex min-h-full flex-col pb-10">
            <nav aria-label="Navegação móvel" className="mt-8">
              <ul className="grid">
                {NAV.map((item, index) => (
                  <li key={item.href} className="border-b border-white/10">
                    <a
                      href={item.href}
                      onClick={fecharMenu}
                      className="group flex items-center justify-between py-5 font-display text-2xl font-extrabold tracking-[-.04em] text-white sm:text-3xl"
                    >
                      <span>{item.label}</span>
                      <span className="text-xs font-bold tracking-normal text-lime">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-auto grid gap-3 pt-8 sm:grid-cols-2">
              <a href={CLINICA.telefoneHref} className="button-ghost-light">
                <Phone className="h-5 w-5" />
                {CLINICA.telefone}
              </a>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="button-primary"
                onClick={fecharMenu}
              >
                <MessageCircle className="h-5 w-5" />
                Agendar no WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
