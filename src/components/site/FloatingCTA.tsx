import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, MessageCircle, Phone, X } from "lucide-react";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import type { Intencao } from "@/lib/contato";
import { CLINICA } from "@/lib/jp";
import "@/components/site/global/cta.css";

const CHAVE_DISPENSA = "jp:cta-dispensado";

type FloatingCTAProps = {
  assunto?: string;
  intencao?: Intencao;
  titulo?: string;
  subtitulo?: string;
  rotulo?: string;
  mostrarNoMobileDesdeInicio?: boolean;
};

/**
 * O CTA que acompanha a rolagem.
 *
 * `assunto` mantém a conversa ligada ao tratamento lido. As opções de texto e
 * intenção permitem que uma landing paga reduza a fricção sem mudar o CTA do
 * restante do site. `mostrarNoMobileDesdeInicio` existe para páginas de
 * aquisição; contatos com intenção `informacoes` também ganham essa exposição
 * por padrão, pois já são CTAs de baixa fricção pensados para mídia paga.
 *
 * Duas peças, uma por contexto de uso:
 *  - até 767px (celular e tablet em pé): barra lisa embaixo (`#cta-mobile`),
 *    com telefone, WhatsApp e fechar. Respeita a área segura do aparelho.
 *  - a partir de 768px: uma pílula pequena no canto, que só existe quando o cabeçalho
 *    está escondido (o Header marca `data-escondido` ao rolar para baixo).
 *    Com o cabeçalho visível ele já oferece o contato; duas chamadas ao mesmo
 *    tempo competiriam. É a única peça do site que flutua de verdade, por isso
 *    é a que tem sombra.
 *
 * As duas sobem pela altura da faixa de cookies (`--altura-aviso`), para nunca
 * ficarem sob ela. A divisão é em 768px nas duas peças: se uma cobrir menos do
 * que a outra, sobra uma faixa de largura sem nenhum CTA.
 *
 * `titulo` e `subtitulo` não ficam escritos na tela — a pílula é pequena de
 * propósito —, mas nomeiam o convite para leitor de tela e dicas de mouse, e
 * as landing pages continuam passando o texto da sua oferta.
 */
export function FloatingCTA({
  assunto,
  intencao = "agendar",
  titulo = "Fale com a recepção",
  subtitulo = CLINICA.horario,
  rotulo = "Agendar avaliação",
  mostrarNoMobileDesdeInicio = false,
}: FloatingCTAProps) {
  const [showBar, setShowBar] = useState(false);
  const [dispensado, setDispensado] = useState(false);
  const [rodapeVisivel, setRodapeVisivel] = useState(false);
  const [cabecalhoEscondido, setCabecalhoEscondido] = useState(false);
  const [cedendo, setCedendo] = useState(false);
  const [cedendoNoCelular, setCedendoNoCelular] = useState(false);

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
   * O CTA deixa de acompanhar a página ANTES de o rodapé ocupar a viewport.
   *
   * O rodapé já oferece contato e dados legais; manter uma barra fixa por cima
   * dele cria competição visual e pode encobrir conteúdo. O `rootMargin`
   * positivo antecipa a zona de recolhimento em 160px, então a barra some antes
   * de parecer colada ao rodapé, tanto em desktop quanto em mobile.
   */
  useEffect(() => {
    const rodape = document.querySelector("footer");
    if (!rodape || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      ([entrada]) => setRodapeVisivel(Boolean(entrada?.isIntersecting)),
      { rootMargin: "0px 0px 160px 0px", threshold: 0.01 },
    );

    observer.observe(rodape);
    return () => observer.disconnect();
  }, []);

  /**
   * A chamada fixa cede quando a página já mostra a sua própria.
   *
   * Duas chamadas iguais na mesma tela competem, e a fixa ainda cobre o que
   * está embaixo dela (o botão de Convênios, os campos do formulário de #fale).
   * Dois níveis:
   *  - a pílula do desktop sai sempre que um botão de ação de dentro do
   *    <main> (ou algo marcado com `data-cede-cta`) estiver na tela;
   *  - a barra do celular só sai diante do que estiver marcado com
   *    `data-cede-cta` (o formulário de #fale). Com um botão a cada seção,
   *    sair por qualquer botão a faria entrar e sair a rolagem inteira.
   */
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const alvos = document.querySelectorAll(
      'main a.botao-acento, main a.button-primary, main a.botao[href*="wa.me"], main button.botao-acento, [data-cede-cta]',
    );
    if (!alvos.length) return;
    const vistos = new Set<Element>();
    const observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) vistos.add(e.target);
        else vistos.delete(e.target);
      }
      setCedendo(vistos.size > 0);
      setCedendoNoCelular([...vistos].some((v) => v.hasAttribute("data-cede-cta")));
    });
    alvos.forEach((alvo) => observador.observe(alvo));
    return () => observador.disconnect();
  }, []);

  /**
   * A pílula do desktop segue o cabeçalho: aparece quando ele sobe para fora
   * da tela. Em vez de repetir a lógica de rolagem do Header (e correr o risco
   * de as duas discordarem), observamos o atributo que ele já publica.
   *
   * O cabeçalho é irmão deste componente e pode montar um quadro depois; por
   * isso a busca tenta por alguns quadros antes de desistir. Sem cabeçalho
   * (não existe página pública assim) a pílula simplesmente não aparece.
   */
  useEffect(() => {
    let observador: MutationObserver | undefined;
    let quadro = 0;
    let adiar: ReturnType<typeof setTimeout> | undefined;
    let tentativas = 0;

    const ligar = () => {
      const cabecalho = document.querySelector("header.cabecalho, header");
      if (!cabecalho) {
        if (tentativas++ < 40) quadro = requestAnimationFrame(ligar);
        return;
      }
      /* O cabeçalho volta a qualquer rolagem curta para cima. Sumir junto com
         ele faria a chamada piscar entre o topo e o canto; então a pílula entra
         na hora e só sai 600ms depois que o cabeçalho reaparece. */
      const ler = () => {
        clearTimeout(adiar);
        if (cabecalho.hasAttribute("data-escondido")) setCabecalhoEscondido(true);
        else adiar = setTimeout(() => setCabecalhoEscondido(false), 600);
      };
      ler();
      observador = new MutationObserver(ler);
      observador.observe(cabecalho, { attributes: true, attributeFilter: ["data-escondido"] });
    };
    ligar();

    return () => {
      cancelAnimationFrame(quadro);
      clearTimeout(adiar);
      observador?.disconnect();
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

  const visivelDesktop = showBar && cabecalhoEscondido && !dispensado && !rodapeVisivel && !cedendo;
  const focoWhatsApp = intencao === "informacoes";
  // Nas landings pagas a barra do celular fica sempre à mão (é a invariante
  // dos testes de tráfego pago); no resto do site ela cede ao formulário.
  const barraFixa = mostrarNoMobileDesdeInicio || focoWhatsApp;
  const visivelMobile =
    (barraFixa || (showBar && !cedendoNoCelular)) && !dispensado && !rodapeVisivel;
  const wa = useContatoWhatsApp(intencao, assunto);
  const barraRef = useRef<HTMLElement>(null);

  /**
   * A barra do celular publica a própria altura em `--altura-barra-cta` na
   * raiz enquanto está à vista, como a faixa de cookies faz com
   * `--altura-aviso`. O `scroll-padding-bottom` do <html> soma as duas: quem
   * navega por teclado nunca fica com o foco escondido atrás delas.
   */
  useEffect(() => {
    const barra = barraRef.current;
    const raiz = document.documentElement;
    if (!barra || !visivelMobile) {
      raiz.style.removeProperty("--altura-barra-cta");
      return;
    }
    const celular = window.matchMedia("(max-width: 767.98px)");
    const publicar = () => {
      if (celular.matches) {
        raiz.style.setProperty("--altura-barra-cta", `${String(barra.offsetHeight)}px`);
      } else {
        raiz.style.removeProperty("--altura-barra-cta");
      }
    };
    publicar();
    const observador = new ResizeObserver(publicar);
    observador.observe(barra);
    celular.addEventListener("change", publicar);
    return () => {
      observador.disconnect();
      celular.removeEventListener("change", publicar);
      raiz.style.removeProperty("--altura-barra-cta");
    };
  }, [visivelMobile]);

  return (
    <>
      {/* Pílula do desktop. `invisible` além da opacidade tira a peça da ordem
          de Tab enquanto ela está escondida. */}
      <aside
        id="cta-flutuante"
        aria-label={titulo}
        aria-hidden={!visivelDesktop}
        inert={!visivelDesktop}
        className={`cta-pilula fixed right-6 z-[58] hidden items-center gap-1 rounded-full p-1.5 md:flex ${
          visivelDesktop ? "" : "invisible"
        }`}
        data-visivel={visivelDesktop ? "" : undefined}
      >
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          title={subtitulo}
          className="botao botao-acento"
        >
          <MessageCircle aria-hidden="true" />
          {rotulo}
          <ArrowUpRight aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={dispensar}
          aria-label="Fechar convite para falar com a clínica"
          className="cta-fechar"
        >
          <X aria-hidden="true" />
        </button>
      </aside>

      {/* Barra do celular: branca, com filete e sombra para cima, e a área segura embaixo. */}
      <aside
        ref={barraRef}
        id="cta-mobile"
        aria-label={titulo}
        className={`cta-barra fixed inset-x-0 z-[60] transition-[translate,visibility] duration-500 md:hidden ${
          visivelMobile ? "translate-y-0" : "invisible translate-y-full"
        }`}
        aria-hidden={!visivelMobile}
        inert={!visivelMobile}
      >
        <div className="flex items-center gap-2">
          {!focoWhatsApp && (
            <a
              href={CLINICA.telefoneHref}
              aria-label="Ligar para a JP Clínica"
              className="botao botao-chao !min-h-12 !w-12 !p-0"
            >
              <Phone aria-hidden="true" />
            </a>
          )}
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="botao botao-acento !min-h-12 min-w-0 flex-1"
          >
            <MessageCircle aria-hidden="true" />
            {rotulo}
          </a>
          <button
            type="button"
            onClick={dispensar}
            aria-label="Fechar convite para falar com a clínica"
            className="cta-fechar"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      </aside>
    </>
  );
}
