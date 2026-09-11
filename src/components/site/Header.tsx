import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Clock3, MapPin, Menu, Phone, X } from "lucide-react";

import { Logo } from "@/components/site/Logo";
import { CLINICA, NAV } from "@/lib/jp";
import { contatoWhatsApp } from "@/lib/contato";

export function Header() {
  const [aberto, setAberto] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const aoRolar = () => setScrolled(window.scrollY > 30);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  // Enquanto o menu móvel está aberto, ele se comporta como uma superfície
  // modal: trava o scroll da página, fecha ao tocar fora e mantém o foco dentro
  // dos controles visíveis. Isso evita a sensação de menu "solto" sobre a home.
  useEffect(() => {
    if (!aberto) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focarPrimeiroItem = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    });

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botaoRef.current?.focus();
        return;
      }

      if (e.key !== "Tab") return;

      const focaveis = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((item) => !item.hasAttribute("disabled") && item.offsetParent !== null);

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (!primeiro || !ultimo) return;

      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    const aoTocarFora = (e: PointerEvent) => {
      if (headerRef.current?.contains(e.target as Node)) return;
      setAberto(false);
    };

    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoTocarFora);

    return () => {
      window.cancelAnimationFrame(focarPrimeiroItem);
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoTocarFora);
    };
  }, [aberto]);

  const wa = contatoWhatsApp("agendar");

  const fechar = () => setAberto(false);

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-[100] w-full transition-shadow duration-300 ${
        scrolled ? "shadow-[0_10px_40px_rgba(3,47,1,0.08)]" : ""
      }`}
    >
      {/* BARRA SUPERIOR */}
      <div className="bg-brand-deep text-white">
        <div className="jp-container flex h-[34px] items-center justify-between">
          <span className="flex items-center gap-2">
            <MapPin size={14} strokeWidth={1.8} className="text-lime" aria-hidden="true" />
            <span className="text-micro font-semibold uppercase tracking-[0.13em] text-white/90 sm:text-micro">
              {/* Os {" "} não são enfeite: o JSX apaga a quebra de linha entre
                  texto e elemento, e o bullet é aria-hidden. Sem eles o leitor
                  de tela anuncia "Vila BrunaFreguesia do Ó" grudado. */}
              Vila Bruna{" "}
              <span aria-hidden="true" className="mx-2 text-lime">
                •
              </span>{" "}
              Freguesia do Ó{" "}
              <span className="hidden sm:inline">
                <span aria-hidden="true" className="mx-2 text-lime">
                  •
                </span>{" "}
                São Paulo/SP
              </span>
            </span>
          </span>

          <div className="hidden items-center gap-5 md:flex">
            <span className="flex items-center gap-2">
              <Clock3 size={14} className="text-lime" aria-hidden="true" />
              <span className="text-micro font-semibold uppercase tracking-[0.12em] text-white/90 lg:text-micro">
                Segunda a sexta{" "}
                <span aria-hidden="true" className="mx-2 text-lime">
                  •
                </span>
                08h às 18h
              </span>
            </span>

            <span aria-hidden="true" className="h-4 w-px bg-lime/40" />

            <a
              href={CLINICA.telefoneHref}
              className="alvo-toque flex items-center gap-2 text-micro font-semibold tracking-[0.04em] text-white transition hover:text-lime"
            >
              <Phone size={13} className="text-lime" aria-hidden="true" />
              {CLINICA.telefone}
            </a>
          </div>
        </div>
      </div>

      {/* NAVEGAÇÃO PRINCIPAL
          No mobile/tablet o fundo é praticamente sólido de propósito: backdrop-filter
          num elemento sticky custa composição a cada frame durante o scroll. O blur
          premium fica só no desktop, onde há GPU/viewport para ele e a barra é maior. */}
      <div className="border-b border-border-soft bg-[#FDFEFA]/98 xl:bg-[#FDFEFA]/95 xl:backdrop-blur-xl">
        {/* O gap é fluido porque é ele que separa o menu do logo e do botão,
            e 24px fixos ficavam apertados justamente onde a barra é mais
            estreita. Cresce com a largura, então em tela grande os três blocos
            respiram sem precisar de outro ajuste. */}
        <div
          className={`jp-container flex items-center justify-between gap-[clamp(24px,2.2vw,44px)] transition-[height] duration-300 ${
            scrolled ? "h-[78px]" : "h-[92px]"
          }`}
        >
          {/* A marca oficial já traz o nome desenhado, então aqui não entra
              texto ao lado: o que existia era o nome redigitado em Manrope
              disputando com a mesma palavra dentro do logo. O nome acessível
              vem do aria-label, e o "Integrada" segue no <title> e no rodapé. */}
          <a
            href="/#inicio"
            className="flex shrink-0 items-center"
            aria-label={`${CLINICA.nome} — início`}
          >
            {/* A altura acompanha a barra (92px → 78px ao rolar). Em 66px o
                "Clínica Odontológica" desenhado bate os 14px dos itens de menu:
                menor que isso, a marca lê como legenda do menu, não como marca. */}
            <Logo
              variante="lockup"
              fundo="claro"
              altura={66}
              className={`w-auto transition-[height] duration-300 ${
                scrolled ? "h-[44px] lg:h-[56px]" : "h-[50px] lg:h-[66px]"
              }`}
            />
          </a>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center xl:flex"
            aria-label="Navegação principal"
          >
            <ul className="flex w-full max-w-[900px] items-center justify-center gap-[clamp(14px,1.25vw,28px)]">
              {NAV.map((item) => (
                <li key={item.href} className="shrink-0">
                  <a
                    href={item.href}
                    className="relative inline-flex min-h-11 items-center whitespace-nowrap py-3 text-[clamp(13px,0.95vw,14px)] font-semibold tracking-[-0.01em] text-brand-text transition-colors duration-200 after:absolute after:bottom-[4px] after:left-1/2 after:h-[2px] after:w-0 after:-translate-x-1/2 after:rounded-full after:bg-lime after:transition-all after:duration-300 hover:text-forest-2 hover:after:w-full focus-visible:text-forest-2 focus-visible:after:w-full"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Sem pílula de telefone aqui: ele já aparece na barra superior,
              40px acima. A duplicata consumia espaço sem acrescentar informação. */}
          <div className="hidden shrink-0 items-center gap-3 xl:flex">
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-[48px] min-w-[172px] items-center justify-between gap-4 rounded-full border-[1.5px] border-lime bg-forest px-6 text-[13px] font-bold text-white shadow-[0_8px_24px_rgba(9,89,2,.22)] transition-all duration-300 hover:-translate-y-[2px] hover:bg-[#0C7503] hover:shadow-[0_13px_30px_rgba(9,89,2,.32)]"
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
              className="hidden rounded-full border-[1.5px] border-lime bg-forest px-5 py-3 text-[12px] font-bold text-white sm:flex"
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
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border-soft bg-white text-forest-2"
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
        ref={menuRef}
        id="menu-mobile"
        className={`absolute left-0 right-0 top-full border-b border-border-soft bg-[#FDFEFA] shadow-xl transition-all duration-300 xl:hidden ${
          aberto
            ? "max-h-[80vh] overflow-y-auto opacity-100"
            : "invisible max-h-0 overflow-hidden opacity-0"
        }`}
      >
        <nav className="jp-container py-6" aria-label="Navegação móvel">
          <div className="grid gap-1 sm:grid-cols-2">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={fechar}
                className="flex min-h-[52px] items-center justify-between rounded-xl px-4 text-[15px] font-semibold text-forest transition hover:bg-[#EBF5E1] hover:text-forest-2"
              >
                {item.label}
                <ArrowUpRight size={15} className="text-brand-text" aria-hidden="true" />
              </a>
            ))}
          </div>

          <div className="mt-5 grid gap-3 border-t border-border-soft pt-5 sm:grid-cols-2">
            <a
              href={CLINICA.telefoneHref}
              onClick={fechar}
              className="flex items-center justify-center gap-2 rounded-full border border-border-soft px-5 py-4 text-sm font-semibold text-forest-2"
            >
              <Phone size={16} aria-hidden="true" />
              {CLINICA.telefone}
            </a>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={fechar}
              className="flex items-center justify-center gap-2 rounded-full border-[1.5px] border-lime bg-forest px-5 py-4 text-sm font-bold text-white"
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
