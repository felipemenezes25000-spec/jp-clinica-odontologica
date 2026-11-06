import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, Phone, Star } from "lucide-react";

import fotoCadeira from "@/assets/consultorio-implantes-1.webp";
import fotoCadeiraLuz from "@/assets/consultorio-implantes-2.webp";
import fotoConsultorio from "@/assets/consultorio-1.webp";
import fotoConsultorio1100 from "@/assets/consultorio-1-1100.webp";
import fotoConsultorio2 from "@/assets/consultorio-2.webp";

import { AVALIACOES, CLINICA, HISTORIA, notaBR } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { FormaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import { caminhoCoroaPx } from "@/components/site/sistema/geometria";
import { comGsap, querMenosMovimento } from "@/components/site/sistema/gsap";
import { useSituacao } from "@/components/site/sistema/horario";
import "./abertura.css";

/**
 * O TOPO DA HOME — "a janela em forma de coroa".
 *
 * Primeira tela: à esquerda, o que a pessoa veio saber (dentista, onde, como
 * marcar); à direita, o consultório de verdade visto por uma janela com o topo
 * da coroa da marca, sobre a mesma coroa gigante em verde-maçã, cortada pela
 * borda da tela. As fotos se revezam devagar, como luz mudando na sala.
 *
 * Rolando no desktop, a janela cresce até a tela inteira e os lobos se desfazem
 * no caminho — a pessoa "entra" no consultório —, e o endereço aparece sobre a
 * foto. É a cena-assinatura do site. No celular e com "reduzir movimento" a
 * cena não existe: o topo é a composição final, parada, com tudo legível.
 */

const FOTOS = [
  { src: fotoCadeira, largura: 1200, altura: 1500 },
  { src: fotoCadeiraLuz, largura: 1200, altura: 1500 },
  {
    src: fotoConsultorio,
    srcSet: `${fotoConsultorio1100} 1100w, ${fotoConsultorio} 1400w`,
    largura: 1400,
    altura: 1045,
  },
  { src: fotoConsultorio2, largura: 1200, altura: 896 },
];

const ANOS_EM_PIRITUBA = HISTORIA.mudanca - HISTORIA.fundacao - 1;
/** "R. Rio Verde, 1029" é como o cadastro escreve; na frase, a rua por extenso. */
const RUA = CLINICA.local.logradouro.replace(/^R\.\s/, "Rua ");

export function Abertura() {
  const wa = useContatoWhatsApp("agendar");
  const situacao = useSituacao();
  const secaoRef = useRef<HTMLElement>(null);
  const palcoRef = useRef<HTMLDivElement>(null);
  const lugarRef = useRef<HTMLDivElement>(null);
  const janelaRef = useRef<HTMLDivElement>(null);
  const [ativa, setAtiva] = useState(0);
  const [todas, setTodas] = useState(false);

  // As outras três fotos só entram depois do primeiro desenho: a primeira é o
  // LCP, e as outras não podem disputar banda com ela.
  useEffect(() => {
    const t = window.setTimeout(() => setTodas(true), 1800);
    return () => window.clearTimeout(t);
  }, []);

  // Revezamento lento: 5,5s parada, 1,6s de transição. Para com a aba oculta e
  // não existe com "reduzir movimento".
  useEffect(() => {
    if (!todas || querMenosMovimento()) return;
    let id = 0;
    const iniciar = () => {
      window.clearInterval(id);
      id = window.setInterval(() => setAtiva((i) => (i + 1) % FOTOS.length), 5500);
    };
    const aoMudarVisibilidade = () => {
      if (document.hidden) window.clearInterval(id);
      else iniciar();
    };
    iniciar();
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [todas]);

  // A cena: só desktop, só com movimento.
  useEffect(() => {
    if (querMenosMovimento()) return;
    const secao = secaoRef.current;
    const palco = palcoRef.current;
    const lugar = lugarRef.current;
    const janela = janelaRef.current;
    if (!secao || !palco || !lugar || !janela) return;

    let desfazer = () => {};
    let vivo = true;

    comGsap(
      ({ gsap }) => {
        if (!vivo) return;
        const mm = gsap.matchMedia();
        mm.add("(min-width: 1024px)", () => {
          secao.setAttribute("data-cena", "");

          const estado = { p: 0 };
          let inicio = { x: 0, y: 0, w: 0, h: 0 };
          const medir = () => {
            const a = palco.getBoundingClientRect();
            const b = lugar.getBoundingClientRect();
            inicio = {
              x: b.left - a.left,
              y: b.top - a.top,
              w: b.width,
              h: a.height - (b.top - a.top),
            };
          };
          const desenhar = () => {
            const W = palco.clientWidth;
            const H = palco.clientHeight;
            // A janela cresce até a tela e os lobos somem até 0 no fim do trecho.
            const t = gsap.parseEase("power2.inOut")(Math.min(estado.p / 0.5, 1));
            const x = inicio.x * (1 - t);
            const y = inicio.y * (1 - t);
            const w = inicio.w + (W - inicio.w) * t;
            const h = inicio.h + (H - inicio.h) * t;
            janela.style.clipPath = `path('${caminhoCoroaPx(x, y, w, h, 1 - t)}')`;
          };
          medir();
          desenhar();

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: secao,
              start: "top top",
              end: "bottom bottom",
              scrub: true,
              invalidateOnRefresh: true,
              onRefresh: () => {
                medir();
                desenhar();
              },
            },
          });
          tl.to(estado, { p: 1, duration: 1, onUpdate: desenhar }, 0)
            .to(".abertura-texto", { yPercent: -18, autoAlpha: 0, duration: 0.24 }, 0)
            .to(".abertura-forma", { xPercent: 22, yPercent: -8, rotate: 6, duration: 0.45 }, 0)
            .fromTo(
              ".abertura-janela img",
              { scale: 1.08 },
              { scale: 1, duration: 0.5, ease: "power1.out" },
              0,
            )
            .fromTo(
              ".abertura-cartela",
              { autoAlpha: 0, y: 40 },
              { autoAlpha: 1, y: 0, duration: 0.14, ease: "power2.out" },
              0.5,
            );

          return () => {
            secao.removeAttribute("data-cena");
            janela.style.clipPath = "";
          };
        });
        desfazer = () => mm.revert();
      },
      // Sem GSAP não há cena: a seção que o CSS montou alta, com a janela do
      // tamanho da tela, volta à composição parada de meia tela.
      () => secao.setAttribute("data-sem-cena", ""),
    );

    return () => {
      vivo = false;
      desfazer();
      secao.removeAttribute("data-sem-cena");
    };
  }, []);

  return (
    <section ref={secaoRef} id="inicio" className="abertura" aria-labelledby="abertura-titulo">
      <div ref={palcoRef} className="abertura-palco">
        <FormaCoroa proporcao={0.78} className="abertura-forma" />

        <div className="quadro abertura-grade">
          <div className="abertura-texto">
            <h1 id="abertura-titulo" className="linhas-topo text-display">
              <span className="linha">
                <span style={{ "--i": 0 } as CSSProperties}>Dentista na</span>
              </span>
              <span className="linha">
                <span style={{ "--i": 1 } as CSSProperties}>Freguesia do Ó</span>
              </span>
            </h1>

            <p className="abertura-frase" data-chega style={{ "--d": "380ms" } as CSSProperties}>
              Há {HISTORIA.anos} anos cuidando de crianças, adultos e idosos. Hoje na {RUA},{" "}
              {CLINICA.local.bairro}.
            </p>

            <div
              className="mt-9 flex flex-wrap items-center gap-3"
              data-chega
              style={{ "--d": "480ms" } as CSSProperties}
            >
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="button-primary"
                data-ima
              >
                Agendar avaliação
                <ArrowUpRight aria-hidden="true" />
              </a>
              <a href="#tratamentos" className="botao botao-chao">
                Ver tratamentos
              </a>
            </div>

            <ul className="abertura-fatos" data-chega style={{ "--d": "600ms" } as CSSProperties}>
              <li>
                <Star aria-hidden="true" className="text-acento" fill="currentColor" />
                <span>
                  <strong>{notaBR}</strong> no Google · {AVALIACOES.total} avaliações
                </span>
              </li>
              <li>
                <span
                  className="abertura-ponto"
                  data-aberto={situacao?.aberto ? "" : undefined}
                  aria-hidden="true"
                />
                <span>{situacao?.texto ?? "Segunda a sexta, das 8h às 18h"}</span>
              </li>
              <li>
                <Phone aria-hidden="true" />
                <a href={CLINICA.telefoneHref} className="link">
                  {CLINICA.telefone}
                </a>
              </li>
            </ul>
          </div>

          <div ref={lugarRef} className="abertura-lugar" aria-hidden="true" />
        </div>

        <div ref={janelaRef} className="abertura-janela">
          <MolduraCoroa medir proporcao={0.82} className="abertura-moldura">
            <div className="abertura-sobe">
              {FOTOS.map((foto, i) =>
                i === 0 || todas ? (
                  <img
                    key={foto.src}
                    src={foto.src}
                    srcSet={foto.srcSet}
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    width={foto.largura}
                    height={foto.altura}
                    alt={
                      i === 0 ? "Consultório da JP Clínica Odontológica, com a cadeira pronta" : ""
                    }
                    aria-hidden={i === 0 ? undefined : true}
                    fetchPriority={i === 0 ? "high" : "low"}
                    decoding={i === 0 ? "sync" : "async"}
                    data-ativa={ativa === i ? "" : undefined}
                  />
                ) : null,
              )}
            </div>
          </MolduraCoroa>

          <div className="abertura-cartela" aria-hidden="true">
            <p className="text-frase">
              {RUA}.<br />
              Na {CLINICA.local.bairro} desde {HISTORIA.mudancaMes} de {HISTORIA.mudanca}; antes,{" "}
              {ANOS_EM_PIRITUBA} anos em {HISTORIA.regiaoAnterior}.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
