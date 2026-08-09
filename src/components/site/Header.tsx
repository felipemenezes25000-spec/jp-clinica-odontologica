import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, MessageCircle, Phone, X } from "lucide-react";
import logo from "@/assets/logo-jp-official.webp";
import { CLINICA, NAV, whatsappLink } from "@/lib/jp";

export function Header() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /**
   * Enquanto o painel está aberto ele é a única coisa alcançável.
   *
   * Sem isso, o Tab depois do último link saía do painel e continuava navegando
   * pela página — que está 100% coberta por um fundo opaco. O visitante fica
   * dando Tab em elementos que não consegue ver.
   */
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

  // Fechar sempre devolve o foco ao botão que abriu — senão ele volta ao topo
  // do documento e a pessoa perde o lugar.
  const fecharMenu = () => {
    setOpen(false);
    botaoRef.current?.focus();
  };

  const wa = whatsappLink(
    "Olá! Vim pelo site da JP Clínica Odontológica e gostaria de agendar uma avaliação.",
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-[70] hidden h-7 items-center bg-forest-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 lg:flex">
        <div className="container-jp flex items-center justify-between">
          <span>JP Clínica Odontológica • Vila Bruna • Freguesia do Ó</span>
          <span className="flex items-center gap-4">
            <a href={CLINICA.telefoneHref} className="transition-colors hover:text-lime">
              {CLINICA.telefone}
            </a>
            <span>Seg–Sex • 08h–18h</span>
          </span>
        </div>
      </div>

      <header
        className={`fixed inset-x-0 top-0 z-[60] transition-all duration-500 lg:top-7 ${
          scrolled
            ? "glass border-b border-forest/10 shadow-[0_12px_40px_-28px_rgba(4,50,24,.4)]"
            : "bg-transparent"
        }`}
      >
        <div className="container-jp flex h-[108px] items-center justify-between gap-4">
          <a
            href="/#inicio"
            className="group flex items-center gap-3"
            aria-label="JP Clínica Integrada Odontológica — início"
          >
            <span className="grid h-[5.25rem] w-[5.25rem] shrink-0 place-items-center rounded-full bg-white shadow-[0_14px_38px_-14px_rgba(0,0,0,.45)] transition-transform duration-300 group-hover:-rotate-3 group-hover:scale-105">
              <img
                src={logo}
                alt=""
                width={58}
                height={58}
                className="h-[3.5rem] w-[3.5rem] object-contain"
              />
            </span>
            <span className="hidden sm:block">
              <span
                className={`block font-display text-[27px] font-black leading-none tracking-[-.025em] transition-colors ${scrolled ? "text-forest-2" : "text-white"}`}
              >
                JP Clínica
              </span>
              <span
                className={`mt-2 block whitespace-nowrap text-[11px] font-black uppercase tracking-[0.14em] transition-colors ${scrolled ? "text-forest/70" : "text-white/70"}`}
              >
                Integrada Odontológica
              </span>
            </span>
          </a>

          <nav className="hidden items-center xl:flex" aria-label="Navegação principal">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`rounded-full px-2.5 py-2 text-[13px] font-bold transition-all ${
                  scrolled
                    ? "text-forest/75 hover:bg-forest/6 hover:text-forest-2"
                    : "text-white/72 hover:bg-white/8 hover:text-white"
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href={CLINICA.telefoneHref}
              className={`hidden h-11 items-center gap-2 rounded-full border px-4 text-xs font-extrabold transition-all lg:inline-flex xl:hidden 2xl:inline-flex ${
                scrolled
                  ? "border-forest/12 bg-white text-forest-2 hover:border-forest/25"
                  : "border-white/18 bg-white/7 text-white hover:bg-white/12"
              }`}
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              {CLINICA.telefone}
            </a>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-11 items-center gap-2 rounded-full bg-lime px-5 text-xs font-black text-forest-2 shadow-[0_16px_38px_-20px_rgba(126,219,50,.95)] transition-transform hover:-translate-y-0.5 sm:inline-flex"
            >
              Agendar avaliação
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <button
              ref={botaoRef}
              type="button"
              aria-label={open ? "Fechar menu" : "Abrir menu"}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className={`grid h-11 w-11 place-items-center rounded-full border transition-colors xl:hidden ${
                scrolled
                  ? "border-forest/15 bg-white text-forest-2"
                  : "border-white/20 bg-white/8 text-white"
              }`}
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
          className="fixed inset-0 z-[55] h-dvh overflow-y-auto overscroll-contain bg-forest-2 pt-[124px] text-white lg:pt-[152px] xl:hidden"
        >
          <div className="container-jp flex min-h-full flex-col pb-10">
            <nav aria-label="Navegação móvel" className="mt-8">
              <ul className="grid">
                {NAV.map((item, index) => (
                  <li key={item.href} className="border-b border-white/10">
                    <a
                      href={item.href}
                      onClick={fecharMenu}
                      className="group flex items-center justify-between py-5 font-display text-3xl font-extrabold tracking-[-.04em] text-white"
                    >
                      <span>{item.label}</span>
                      <span className="text-xs font-bold tracking-normal text-lime">
                        0{index + 1}
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
