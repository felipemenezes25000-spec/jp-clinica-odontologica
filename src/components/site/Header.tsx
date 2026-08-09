import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Clock3, MapPin, Menu, Phone, X } from "lucide-react";

import logo from "@/assets/logo-jp-official.webp";
import { CLINICA, NAV, whatsappLink } from "@/lib/jp";

export function Header() {
  const [aberto, setAberto] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const aoRolar = () => setScrolled(window.scrollY > 30);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  // Escape fecha e devolve o foco ao botão — senão a pessoa perde o lugar.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAberto(false);
      botaoRef.current?.focus();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  const wa = whatsappLink(
    "Olá! Vim pelo site da JP Clínica Odontológica e gostaria de agendar uma avaliação.",
  );

  const fechar = () => setAberto(false);

  return (
    <header
      className={`sticky top-0 z-[100] w-full transition-all duration-300 ${
        scrolled ? "shadow-[0_10px_40px_rgba(5,45,11,0.08)]" : ""
      }`}
    >
      {/* BARRA SUPERIOR */}
      <div className="bg-[#052D0B] text-white">
        <div className="jp-container-wide flex h-[34px] items-center justify-between">
          <span className="flex items-center gap-2">
            <MapPin size={14} strokeWidth={1.8} className="text-[#7BD51C]" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-white/90 sm:text-[11px]">
              Vila Bruna
              <span aria-hidden="true" className="mx-2 text-[#7BD51C]">
                •
              </span>
              Freguesia do Ó
              <span className="hidden sm:inline">
                <span aria-hidden="true" className="mx-2 text-[#7BD51C]">
                  •
                </span>
                São Paulo/SP
              </span>
            </span>
          </span>

          <div className="hidden items-center gap-5 md:flex">
            <span className="flex items-center gap-2">
              <Clock3 size={14} className="text-[#7BD51C]" aria-hidden="true" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90 lg:text-[11px]">
                Segunda a sexta
                <span aria-hidden="true" className="mx-2 text-[#7BD51C]">
                  •
                </span>
                08h às 18h
              </span>
            </span>

            <span aria-hidden="true" className="h-4 w-px bg-[#7BD51C]/40" />

            <a
              href={CLINICA.telefoneHref}
              className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.04em] text-white transition hover:text-[#7BD51C]"
            >
              <Phone size={13} className="text-[#7BD51C]" aria-hidden="true" />
              {CLINICA.telefone}
            </a>
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO PRINCIPAL */}
      <div className="border-b border-[#E4EADF] bg-[#FDFEFA]/95 backdrop-blur-xl">
        <div
          className={`jp-container-wide flex items-center justify-between gap-6 transition-all duration-300 ${
            scrolled ? "h-[78px]" : "h-[92px]"
          }`}
        >
          <a
            href="/#inicio"
            className="flex shrink-0 items-center gap-3"
            aria-label={`${CLINICA.nome} — início`}
          >
            <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full border border-[#B7D39A] bg-white shadow-[0_5px_18px_rgba(5,45,11,.08)] lg:h-[64px] lg:w-[64px]">
              <img
                src={logo}
                alt=""
                width={54}
                height={54}
                className="h-[49px] w-[49px] object-contain lg:h-[54px] lg:w-[54px]"
              />
            </span>

            {/* Visível desde 375px: cabe (219px dos 335 disponíveis) e o nome da
                clínica é justamente o que precisa ter destaque no cabeçalho. */}
            <span className="block">
              <span className="block whitespace-nowrap font-display text-[19px] font-extrabold leading-none tracking-[-0.035em] text-[#052D0B] sm:text-[21px] lg:text-[24px]">
                JP Clínica
              </span>
              <span className="mt-2 block whitespace-nowrap text-[7.5px] font-semibold uppercase tracking-[0.15em] text-[#3F7A18] sm:text-[8px] sm:tracking-[0.18em] lg:text-[9px]">
                Integrada Odontológica
              </span>
            </span>
          </a>

          {/* O gap fluido é o que faz os itens caberem sem estourar: o navegador
              aperta o espaçamento conforme a largura, em vez de quebrar a linha. */}
          <nav
            className="hidden min-w-0 flex-1 items-center justify-center xl:flex"
            aria-label="Navegação principal"
          >
            <ul className="flex w-full max-w-[820px] items-center justify-center gap-[clamp(12px,1.4vw,28px)]">
              {NAV.map((item) => (
                <li key={item.href} className="shrink-0">
                  <a
                    href={item.href}
                    className="relative whitespace-nowrap py-3 text-[13.5px] font-semibold tracking-[-0.01em] text-[#3F7A18] transition-colors duration-200 after:absolute after:bottom-[4px] after:left-1/2 after:h-[2px] after:w-0 after:-translate-x-1/2 after:rounded-full after:bg-[#7BD51C] after:transition-all after:duration-300 hover:text-[#052D0B] hover:after:w-full"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="hidden shrink-0 items-center gap-3 xl:flex">
            <a
              href={CLINICA.telefoneHref}
              className="flex h-[48px] items-center gap-3 rounded-full border border-[#D4DFCC] bg-white px-5 text-[13px] font-bold text-[#052D0B] transition duration-300 hover:border-[#7BD51C] hover:bg-[#F7FAF2]"
            >
              <Phone size={16} strokeWidth={1.8} aria-hidden="true" />
              <span className="hidden 2xl:inline">{CLINICA.telefone}</span>
              <span className="2xl:hidden">Telefone</span>
            </a>

            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-[48px] min-w-[172px] items-center justify-between gap-4 rounded-full border-[1.5px] border-[#7BD51C] bg-[#2F6B35] px-6 text-[13px] font-bold text-white shadow-[0_8px_24px_rgba(47,107,53,.22)] transition-all duration-300 hover:-translate-y-[2px] hover:bg-[#3A7F41] hover:shadow-[0_13px_30px_rgba(47,107,53,.32)]"
            >
              Agendar avaliação
              <ArrowUpRight
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                className="transition-transform group-hover:translate-x-[2px] group-hover:-translate-y-[2px]"
              />
            </a>
          </div>

          <div className="flex items-center gap-2 xl:hidden">
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-full border-[1.5px] border-[#7BD51C] bg-[#2F6B35] px-5 py-3 text-[12px] font-bold text-white sm:flex"
            >
              Agendar avaliação
            </a>

            <button
              ref={botaoRef}
              type="button"
              onClick={() => setAberto((v) => !v)}
              aria-label={aberto ? "Fechar menu" : "Abrir menu"}
              aria-expanded={aberto}
              aria-controls="menu-mobile"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#D4DFCC] bg-white text-[#052D0B]"
            >
              {aberto ? <X size={20} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>

      {/* MENU MOBILE
          `invisible` quando fechado é essencial: só com max-h-0 os links seguem
          alcançáveis por Tab, e a pessoa navega por itens que não consegue ver. */}
      <div
        id="menu-mobile"
        className={`absolute left-0 right-0 top-full border-b border-[#E1E8DC] bg-[#FDFEFA] shadow-xl transition-all duration-300 xl:hidden ${
          aberto
            ? "max-h-[80vh] overflow-y-auto opacity-100"
            : "invisible max-h-0 overflow-hidden opacity-0"
        }`}
      >
        <nav className="jp-container-wide py-6" aria-label="Navegação móvel">
          <div className="grid gap-1 sm:grid-cols-2">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={fechar}
                className="flex min-h-[52px] items-center justify-between rounded-xl px-4 text-[15px] font-semibold text-[#2F6B35] transition hover:bg-[#EDF6E4] hover:text-[#052D0B]"
              >
                {item.label}
                <ArrowUpRight size={15} className="text-[#4E8C25]" aria-hidden="true" />
              </a>
            ))}
          </div>

          <div className="mt-5 grid gap-3 border-t border-[#E0E7DB] pt-5 sm:grid-cols-2">
            <a
              href={CLINICA.telefoneHref}
              className="flex items-center justify-center gap-2 rounded-full border border-[#C7D6BE] px-5 py-4 text-sm font-semibold text-[#052D0B]"
            >
              <Phone size={16} aria-hidden="true" />
              {CLINICA.telefone}
            </a>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={fechar}
              className="flex items-center justify-center gap-2 rounded-full border-[1.5px] border-[#7BD51C] bg-[#2F6B35] px-5 py-4 text-sm font-bold text-white"
            >
              Agendar avaliação
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
