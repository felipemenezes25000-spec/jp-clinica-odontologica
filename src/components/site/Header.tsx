import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { ArrowUpRight, MessageCircle, Phone } from "lucide-react";

import { Logo } from "@/components/site/Logo";
import { CLINICA, NAV } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { tituloDaRota } from "@/lib/analytics/rotas";
import { Movimento } from "@/components/site/sistema/movimento";
import { MarcaCoroa } from "@/components/site/sistema/Coroa";
import { pausarRolagem } from "@/components/site/sistema/ambiente";
import { useSituacao } from "@/components/site/sistema/horario";
import "./cabecalho.css";

/**
 * O cabeçalho do site — redesenho de 11/2026.
 *
 * Uma barra lisa no tom do chão: marca, os links, telefone e UMA ação. Sem
 * faixa de informação em cima, sem vidro, sem sombra. Some quando a pessoa
 * rola para baixo e volta quando ela rola para cima: a página inteira fica
 * para o conteúdo, e o caminho de volta nunca está a mais de um gesto.
 *
 * `enxuto` é o cabeçalho das landings de aquisição. Nas experiências dedicadas
 * de Clareamento e Implantes ele fica ainda mais direto: não oferece saída para
 * a home no logotipo e troca o menu móvel por um CTA de WhatsApp. O E2E do
 * funil confere as duas coisas — e confere que o telefone continua no topo.
 *
 * O <Movimento /> mora aqui porque todas as páginas públicas usam este
 * cabeçalho: é o motor de entradas, linhas e rolagem (ver sistema/movimento).
 */
export function Header({ enxuto = false }: { enxuto?: boolean }) {
  const location = useLocation();
  const [aberto, setAberto] = useState(false);
  const [escondido, setEscondido] = useState(false);
  const [rolou, setRolou] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const situacao = useSituacao();

  useEffect(() => {
    let ultimo = window.scrollY;
    let quadro = 0;
    const medir = () => {
      quadro = 0;
      const y = window.scrollY;
      setRolou(y > 24);
      // Some descendo depois do primeiro terço de tela, volta subindo.
      if (Math.abs(y - ultimo) > 6) {
        setEscondido(y > ultimo && y > window.innerHeight * 0.35);
        ultimo = y;
      }
    };
    const aoRolar = () => {
      if (!quadro) quadro = requestAnimationFrame(medir);
    };
    medir();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      window.removeEventListener("scroll", aoRolar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const fecharNoDesktop = () => {
      if (desktop.matches) setAberto(false);
    };
    fecharNoDesktop();
    desktop.addEventListener("change", fecharNoDesktop);
    return () => desktop.removeEventListener("change", fecharNoDesktop);
  }, []);

  useEffect(() => {
    if (!aberto) return;

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // A rolagem suave (Lenis) rola a página pela roda do mouse mesmo com o
    // body travado: ela também precisa parar enquanto o menu cobre a tela.
    const retomarRolagem = pausarRolagem();

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
      // O botão de fechar fica fora do painel, mas faz parte do ciclo.
      if (botaoRef.current) focaveis.unshift(botaoRef.current);

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

    document.addEventListener("keydown", aoTeclar);
    return () => {
      window.cancelAnimationFrame(focarPrimeiroItem);
      document.body.style.overflow = overflowAnterior;
      retomarRolagem();
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  const assunto = tituloDaRota(location.pathname) ?? undefined;
  const conversaoDireta =
    enxuto && (assunto === "Clareamento dental" || assunto === "Implantes dentários");
  const wa = useContatoWhatsApp(conversaoDireta ? "informacoes" : "agendar", assunto);
  const rotuloContato = conversaoDireta ? "Ver valores e horários" : "Agendar avaliação";

  const fechar = () => setAberto(false);

  const itemAtivo = (href: string) => {
    if (href === "/carreiras") {
      return (
        location.pathname.startsWith("/carreiras") || location.pathname === "/trabalhe-conosco"
      );
    }
    if (href === "/#tratamentos" && location.pathname.startsWith("/tratamentos/")) return true;
    if (location.pathname !== "/" || !href.startsWith("/#")) return false;
    return location.hash === href.slice(1);
  };

  return (
    <header
      ref={headerRef}
      data-escondido={escondido && !aberto ? "" : undefined}
      data-rolou={rolou ? "" : undefined}
      className="cabecalho sticky top-0 z-[100] w-full"
    >
      <Movimento />
      <div className="quadro flex h-[var(--altura-cabecalho)] items-center justify-between gap-4 xl:gap-8">
        <a
          href={conversaoDireta ? "#conteudo" : "/#inicio"}
          className="cabecalho-marca flex shrink-0 items-center"
          aria-label={
            conversaoDireta
              ? `${CLINICA.nome} — ${assunto?.toLowerCase() ?? "tratamento"}`
              : `${CLINICA.nome} — início`
          }
        >
          <Logo
            variante="lockup"
            fundo="claro"
            altura={52}
            className="h-[40px] w-auto sm:h-[44px] lg:h-[50px]"
          />
        </a>

        {!enxuto && (
          <nav
            className="hidden min-w-0 flex-1 justify-center xl:flex"
            aria-label="Navegação principal"
          >
            <ul className="flex items-center gap-1">
              {NAV.map((item) => {
                const ativo = itemAtivo(item.href);
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      aria-current={
                        ativo ? (item.href.includes("#") ? "location" : "page") : undefined
                      }
                      className="cabecalho-link"
                    >
                      {ativo && <MarcaCoroa className="text-acento" />}
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* O horário só existe depois de montar (o servidor não sabe a hora de
              quem visita), mas a caixa existe desde o HTML, com largura fixa:
              assim o menu centralizado não desliza quando o texto chega. */}
          {!conversaoDireta && (
            <span className="cabecalho-situacao hidden min-[105rem]:inline-flex" aria-live="polite">
              {situacao !== null && (
                <>
                  <span data-aberto={situacao.aberto ? "" : undefined} aria-hidden="true" />
                  {situacao.texto}
                </>
              )}
            </span>
          )}

          <a
            href={CLINICA.telefoneHref}
            className="cabecalho-telefone"
            aria-label={`Ligar para a clínica: ${CLINICA.telefone}`}
          >
            <Phone className="h-[1.05em] w-[1.05em]" aria-hidden="true" />
            <span className="hidden 2xl:inline">{CLINICA.telefone}</span>
          </a>

          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            data-ima
            className={`botao botao-acento cabecalho-acao ${conversaoDireta ? "" : "hidden md:inline-flex"}`}
            data-icone-celular={conversaoDireta ? "" : undefined}
          >
            {/* Na landing paga do celular a barra fixa e o botão do topo já
                dizem "WhatsApp" por extenso; aqui fica só o ícone, par do
                telefone, para a primeira tela não ter três botões iguais. */}
            {conversaoDireta && (
              <>
                <MessageCircle className="sm:hidden" aria-hidden="true" />
                <span className="sr-only sm:hidden">WhatsApp</span>
              </>
            )}
            <span className={conversaoDireta ? "hidden sm:inline" : ""}>{rotuloContato}</span>
            <ArrowUpRight className={conversaoDireta ? "hidden sm:block" : ""} aria-hidden="true" />
          </a>

          {!conversaoDireta && (
            <button
              ref={botaoRef}
              type="button"
              onClick={() => setAberto((v) => !v)}
              aria-label={aberto ? "Fechar menu" : "Abrir menu"}
              aria-expanded={aberto}
              aria-controls="menu-mobile"
              className="cabecalho-menu xl:hidden"
            >
              <span className="cabecalho-menu-traco" data-aberto={aberto ? "" : undefined} />
              <span className="hidden sm:inline">{aberto ? "Fechar" : "Menu"}</span>
            </button>
          )}
        </div>
      </div>

      {!conversaoDireta && (
        <div
          ref={menuRef}
          id="menu-mobile"
          data-aberto={aberto ? "" : undefined}
          data-lenis-prevent
          className="cabecalho-painel xl:hidden"
        >
          <nav className="quadro flex h-full flex-col" aria-label="Navegação móvel">
            {!enxuto && (
              <ul className="cabecalho-painel-lista">
                {NAV.map((item, i) => {
                  const ativo = itemAtivo(item.href);
                  return (
                    <li key={item.href} style={{ "--i": i } as React.CSSProperties}>
                      <a
                        href={item.href}
                        onClick={fechar}
                        tabIndex={aberto ? undefined : -1}
                        aria-current={
                          ativo ? (item.href.includes("#") ? "location" : "page") : undefined
                        }
                      >
                        {item.label}
                        {ativo && <MarcaCoroa className="text-acento" />}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-auto grid gap-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:grid-cols-2">
              <a
                href={CLINICA.telefoneHref}
                onClick={fechar}
                tabIndex={aberto ? undefined : -1}
                className="botao botao-chao w-full"
              >
                <Phone aria-hidden="true" />
                {CLINICA.telefone}
              </a>
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                onClick={fechar}
                tabIndex={aberto ? undefined : -1}
                className="botao botao-acento w-full"
              >
                {rotuloContato}
                <ArrowUpRight aria-hidden="true" />
              </a>
              <p className="text-pequeno text-tinta-suave sm:col-span-2">
                {CLINICA.endereco} · {CLINICA.horario}
              </p>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
