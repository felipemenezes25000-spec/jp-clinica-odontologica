import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Instagram } from "lucide-react";

import { CLINICA } from "@/lib/jp";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { comGsap, querMenosMovimento } from "@/components/site/sistema/gsap";
import { GALLERY, PROPORCAO_FOTO } from "./galeria-dados";
import { VisorFoto } from "./galeria-visor";
import "./estrutura.css";

/**
 * A ESTRUTURA — cena 3 do site: "a rolagem atravessa as salas da clínica".
 *
 * No desktop com movimento, a seção é mais alta que a tela, o palco gruda no
 * topo e a rolagem vertical anda uma trilha horizontal com as fotos, cada
 * uma numa coroa paisagem. No celular e com "reduzir movimento" não há cena: a
 * trilha é uma fileira nativa com scroll-snap, que o dedo (ou o mouse, por
 * arraste) percorre sozinho — a composição final, parada, sem setas.
 *
 * Quem decide o modo é o atributo `data-cena`, posto aqui só depois de o GSAP
 * chegar e só em `(min-width: 1024px)`. Sem JavaScript a página já é a fileira
 * nativa, inteira e utilizável.
 *
 * Cada foto é um <button> que abre o visor com a versão inteira. Foco por
 * teclado traz o item para a vista: na cena isso é rolar a página até o ponto
 * da trilha em que ele aparece.
 */

/** Quanto a página rola para cada pixel que a trilha anda: <1 deixa a trilha mais rápida que o dedo. */
const RITMO = 0.78;

/**
 * A cena só existe com altura de sobra: abaixo de 700px de altura (notebook
 * baixo, janela encolhida) cabeçalho + foto + legenda + barra não cabem juntos,
 * e a fileira nativa é a composição certa.
 */
const CENA =
  "(min-width: 1024px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)";

export function Estrutura() {
  const secaoRef = useRef<HTMLElement>(null);
  const janelaRef = useRef<HTMLDivElement>(null);
  const filaRef = useRef<HTMLUListElement>(null);
  const barraRef = useRef<HTMLSpanElement>(null);
  const cenaRef = useRef<{ irPara: (i: number) => void } | null>(null);
  const [ampliada, setAmpliada] = useState<number | null>(null);
  const [atual, setAtual] = useState(0);

  const fechar = useCallback(() => setAmpliada(null), []);
  const navegar = useCallback(
    (passo: number) =>
      setAmpliada((i) => (i === null ? i : (i + passo + GALLERY.length) % GALLERY.length)),
    [],
  );

  // A cena: só desktop, só com movimento.
  useEffect(() => {
    if (querMenosMovimento()) return;
    const secao = secaoRef.current;
    const janela = janelaRef.current;
    const fila = filaRef.current;
    const barra = barraRef.current;
    if (!secao || !janela || !fila || !barra) return;

    let desfazer = () => {};
    let vivo = true;

    comGsap(({ gsap, ScrollTrigger }) => {
      if (!vivo) return;
      const mm = gsap.matchMedia();
      mm.add(CENA, () => {
        secao.setAttribute("data-cena", "");

        const distancia = () => Math.max(0, fila.offsetWidth - janela.clientWidth);
        const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        // A altura da foto sai do espaço que de fato sobra no palco (a janela
        // é o que resta da tela depois do cabeçalho): foto + legenda + o
        // degrau do escalonamento têm de caber, em qualquer altura de tela.
        // Só então a largura da trilha, e com ela a distância, são medidas.
        const medirFoto = () => {
          const css = getComputedStyle(janela);
          const util =
            janela.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
          const legenda = fila.querySelector<HTMLElement>(".estrutura-legenda");
          const altLegenda = legenda
            ? legenda.offsetHeight + parseFloat(getComputedStyle(legenda).marginTop)
            : 3.5 * rem();
          const par = fila.children[1] as HTMLElement | undefined;
          const degrau = par ? parseFloat(getComputedStyle(par).marginTop) || 0 : 0;
          const alt = Math.min(
            31 * rem(),
            Math.max(10 * rem(), util - altLegenda - degrau - 0.75 * rem()),
          );
          fila.style.setProperty("--foto-alt", `${Math.floor(alt)}px`);
        };
        // A altura da seção é a de uma tela mais o quanto a trilha precisa
        // andar. Recalculada antes de cada medição do ScrollTrigger, porque o
        // fim da cena depende dela.
        const ajustar = () => {
          medirFoto();
          secao.style.setProperty("--rolagem", `${Math.round(distancia() * RITMO)}px`);
        };
        ajustar();
        ScrollTrigger.addEventListener("refreshInit", ajustar);

        const fotos = Array.from(fila.querySelectorAll<HTMLImageElement>("img"));
        // As fotos esperam fora da tela, dentro de um recorte: o "lazy" do
        // navegador não as vê chegar. Libera todas um pouco antes da cena.
        const carga = ScrollTrigger.create({
          trigger: secao,
          start: "top bottom+=1600",
          once: true,
          onEnter: () => fotos.forEach((f) => (f.loading = "eager")),
        });

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: secao,
            start: "top top",
            end: "bottom bottom",
            scrub: 0.6,
            invalidateOnRefresh: true,
          },
        });
        tl.to(fila, { x: () => -distancia(), duration: 1 }, 0)
          // A foto anda ao contrário dentro da moldura: a coroa corta, e o
          // olho lê profundidade sem nada se mexer além de transform.
          .fromTo(
            fotos,
            { xPercent: -5, scale: 1.14 },
            { xPercent: 5, scale: 1.14, duration: 1 },
            0,
          )
          .fromTo(barra, { scaleX: 0.02 }, { scaleX: 1, duration: 1 }, 0);

        cenaRef.current = {
          irPara: (i) => {
            const st = tl.scrollTrigger;
            const item = fila.children[i] as HTMLElement | undefined;
            if (!st || !item) return;
            const r = item.getBoundingClientRect();
            const folga = 24;
            if (r.left >= folga && r.right <= window.innerWidth - folga) return;
            const recuo = parseFloat(getComputedStyle(fila).paddingLeft) || 0;
            const d = distancia();
            const x = Math.min(Math.max(item.offsetLeft - recuo, 0), d);
            const alvo = st.start + (d === 0 ? 0 : x / d) * (st.end - st.start);
            window.scrollTo({ top: alvo, behavior: "auto" });
          },
        };

        return () => {
          cenaRef.current = null;
          ScrollTrigger.removeEventListener("refreshInit", ajustar);
          carga.kill();
          secao.removeAttribute("data-cena");
          secao.style.removeProperty("--rolagem");
          fila.style.removeProperty("--foto-alt");
        };
      });
      desfazer = () => mm.revert();
    });

    return () => {
      vivo = false;
      desfazer();
    };
  }, []);

  // Fora da cena, o contador "2 de 11" acompanha a fileira: sem ele, quem
  // chega pelo celular não sabe quantas fotos há além da que está à vista.
  useEffect(() => {
    const janela = janelaRef.current;
    const fila = filaRef.current;
    if (!janela || !fila) return;
    const ler = () => {
      const itens = Array.from(fila.children) as HTMLElement[];
      const fim = janela.scrollLeft + janela.clientWidth >= janela.scrollWidth - 4;
      if (fim) return setAtual(itens.length - 1);
      const passo = (itens[1]?.offsetLeft ?? 0) - (itens[0]?.offsetLeft ?? 0) || 1;
      setAtual(Math.min(itens.length - 1, Math.max(0, Math.round(janela.scrollLeft / passo))));
    };
    janela.addEventListener("scroll", ler, { passive: true });
    return () => janela.removeEventListener("scroll", ler);
  }, []);

  // Botões Anterior/Próxima: só para quem tem mouse fora da cena (o toque já
  // arrasta a fileira, e na cena a rolagem da página faz o trabalho).
  const passo = (sentido: 1 | -1) => {
    const janela = janelaRef.current;
    const item = filaRef.current?.children[1] as HTMLElement | undefined;
    const primeiro = filaRef.current?.children[0] as HTMLElement | undefined;
    if (!janela || !item || !primeiro) return;
    janela.scrollBy({
      left: sentido * (item.offsetLeft - primeiro.offsetLeft),
      behavior: querMenosMovimento() ? "auto" : "smooth",
    });
  };

  // Fora da cena o mouse também arrasta a fileira (o toque já é nativo).
  useEffect(() => {
    const janela = janelaRef.current;
    const secao = secaoRef.current;
    if (!janela || !secao) return;
    let ativo = false;
    let moveu = false;
    let soltouEm = 0;
    let x0 = 0;
    let s0 = 0;

    const descer = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0 || secao.hasAttribute("data-cena")) return;
      ativo = true;
      moveu = false;
      x0 = e.clientX;
      s0 = janela.scrollLeft;
    };
    const mover = (e: PointerEvent) => {
      if (!ativo) return;
      const dx = e.clientX - x0;
      if (!moveu && Math.abs(dx) > 6) {
        moveu = true;
        janela.setAttribute("data-arrasta", "");
      }
      if (moveu) janela.scrollLeft = s0 - dx;
    };
    const soltar = () => {
      if (!ativo) return;
      ativo = false;
      soltouEm = performance.now();
      janela.removeAttribute("data-arrasta");
    };
    // O arraste termina em um clique no botão sob o cursor: engole esse.
    const engolir = (e: MouseEvent) => {
      // Só o clique que fecha o arraste (logo após soltar): um Enter no
      // teclado, ou um clique depois de soltar fora da janela, passa.
      if (!moveu || performance.now() - soltouEm > 80) {
        moveu = false;
        return;
      }
      moveu = false;
      e.preventDefault();
      e.stopPropagation();
    };

    janela.addEventListener("pointerdown", descer);
    janela.addEventListener("click", engolir, true);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    return () => {
      janela.removeEventListener("pointerdown", descer);
      janela.removeEventListener("click", engolir, true);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
  }, []);

  return (
    <section
      ref={secaoRef}
      id="estrutura"
      className="estrutura campo-escuro"
      aria-labelledby="estrutura-titulo"
    >
      <div className="estrutura-palco">
        <div className="quadro estrutura-cabeca" data-entra>
          <h2 id="estrutura-titulo" className="text-titulo" data-linhas>
            A clínica por dentro
          </h2>
          <div className="estrutura-lado" data-item>
            <p className="text-corpo">
              Fotos reais dos espaços onde você é atendido, para conhecer a clínica antes de chegar.
            </p>
            <a
              href={CLINICA.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao-claro"
            >
              <Instagram aria-hidden="true" />
              Ver o Instagram
            </a>
          </div>
        </div>

        <div ref={janelaRef} className="estrutura-janela">
          <ul ref={filaRef} className="estrutura-fila">
            {GALLERY.map((item, i) => (
              <li key={item.title} className="estrutura-item">
                <button
                  type="button"
                  className="estrutura-botao"
                  aria-label={`Ampliar foto: ${item.title}`}
                  onClick={() => setAmpliada(i)}
                  onFocus={(e) => {
                    // Só teclado: o foco do clique do mouse não deve rolar a página
                    // antes de o visor abrir, nem o foco devolvido pelo visor ao fechar.
                    if (e.currentTarget.matches(":focus-visible")) cenaRef.current?.irPara(i);
                  }}
                >
                  <MolduraCoroa as="span" proporcao={PROPORCAO_FOTO} className="estrutura-foto">
                    <img
                      src={item.src}
                      alt={item.title}
                      width={item.largura}
                      height={item.altura}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                    />
                  </MolduraCoroa>
                  <span className="estrutura-legenda text-corpo">{item.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="quadro estrutura-controles">
          <p className="text-pequeno" aria-live="off">
            Foto {atual + 1} de {GALLERY.length}
          </p>
          <div className="estrutura-setas">
            <button
              type="button"
              className="estrutura-seta"
              aria-label="Fotos anteriores"
              onClick={() => passo(-1)}
            >
              <ArrowLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="estrutura-seta"
              aria-label="Próximas fotos"
              onClick={() => passo(1)}
            >
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="estrutura-progresso" aria-hidden="true">
          <span ref={barraRef} />
        </div>
      </div>

      {ampliada !== null && (
        <VisorFoto fotos={GALLERY} indice={ampliada} aoFechar={fechar} aoNavegar={navegar} />
      )}
    </section>
  );
}
