import { useEffect, useRef, useState } from "react";
import { Pause, Play, Quote, Star, Volume2, VolumeX } from "lucide-react";

import { GESTOR, GESTOR_DENTAL_OFFICE } from "@/lib/jp";
import videoGestor from "@/assets/video-jeferson-dental-office.mp4?url";
import posterGestor from "@/assets/video-jeferson-dental-office-poster.webp";
import logoDentalOffice from "@/assets/dental-office.svg";

/**
 * O Jeferson falando, no estande da Dental Office — dentro da seção de
 * história, logo abaixo do card dele.
 *
 * POR QUE AQUI. A seção acabou de apresentar quem faz a clínica; o vídeo é a
 * mesma pessoa, com voz e rosto, dizendo como a gestão trabalha. Solto em
 * outro ponto da home, ele teria de se apresentar de novo. E o cartão final do
 * vídeo é o verde profundo desta seção: o último quadro emenda no fundo.
 *
 * O QUE O PACIENTE LEVA. "Quem fecha o diagnóstico são os dentistas; a
 * tecnologia entra na gestão" — é o que ele diz, e é o que interessa a quem
 * vai se tratar. O selo (cliente há 15 anos, embaixador) é a prova de que não
 * é sistema adotado ontem.
 *
 * Como toca:
 *
 * 1. Mudo, em loop, quando entra na tela — a legenda está gravada na imagem,
 *    então o vídeo se entende sem som. `preload="none"` + poster: nada é
 *    baixado antes de a pessoa rolar até aqui.
 * 2. "Ouvir" liga o som E volta ao começo: quem pede som quer a fala inteira,
 *    não o meio de uma frase.
 * 3. `prefers-reduced-motion` desliga o autoplay (fica o poster e o play), e
 *    há sempre um botão de pausar — WCAG 2.2.2, como em TreatmentVideo.
 * 4. A fala está escrita ao lado, por extenso: é a alternativa em texto do
 *    vídeo e é o que o buscador lê.
 */
export function VideoDoGestor() {
  const ref = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(true);
  const [podeAnimar, setPodeAnimar] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setPodeAnimar(!mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || !podeAnimar) return;
    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada) return;
        // Com som ligado, sair da tela pausa mas voltar não retoma sozinho:
        // áudio que recomeça sem a pessoa pedir é o que faz fechar a aba.
        if (entrada.isIntersecting) {
          if (el.muted) void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [podeAnimar]);

  const alternarTocar = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };

  const alternarSom = () => {
    const el = ref.current;
    if (!el) return;
    if (el.muted) {
      el.muted = false;
      el.currentTime = 0;
      void el.play().catch(() => {});
    } else {
      el.muted = true;
    }
    setMudo(el.muted);
  };

  const { anosDeCliente, fala, creditoDaGravacao } = GESTOR_DENTAL_OFFICE;
  const descricao = `Vídeo: ${GESTOR.nome}, ${GESTOR.papel.toLowerCase()} da JP, fala sobre tecnologia na gestão da clínica. Legendado.`;

  return (
    /* A moldura de vidro só a partir do tablet. No celular ela era um card
       dentro do card da seção e comia 64 px da largura do vídeo (299 de 343). */
    <div
      id="gestao"
      className="relative mt-14 md:overflow-hidden md:rounded-3xl md:border md:border-white/15 md:bg-white/[0.035] md:p-6 md:shadow-[0_35px_90px_rgba(0,0,0,.2)] md:backdrop-blur-md lg:mt-20 lg:p-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-1/3 hidden h-[380px] w-[380px] rounded-full bg-lime/[0.07] blur-[90px] md:block"
      />

      <div className="relative grid gap-8 md:grid-cols-[minmax(0,400px)_1fr] md:items-center lg:grid-cols-[minmax(0,440px)_1fr] lg:gap-14">
        {/* 4:5 — o formato em que o vídeo foi editado. aspect-ratio reserva o
            espaço antes de o poster chegar: nada pula quando ele carrega. */}
        <figure className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-2xl border border-white/15 bg-brand-deep shadow-[0_30px_70px_rgba(0,0,0,.35)]">
          <video
            ref={ref}
            src={videoGestor}
            poster={posterGestor}
            muted
            loop
            playsInline
            preload="none"
            aria-label={descricao}
            onPlay={() => setTocando(true)}
            onPause={() => setTocando(false)}
            onVolumeChange={(e) => setMudo(e.currentTarget.muted)}
            className="block aspect-[4/5] w-full object-cover"
          />

          {!tocando && (
            <button
              type="button"
              onClick={alternarTocar}
              aria-label={`Reproduzir ${descricao}`}
              className="absolute inset-0 grid place-items-center bg-brand-deep/25 transition-colors hover:bg-brand-deep/10"
            >
              <span className="grid h-[72px] w-[72px] place-items-center rounded-full bg-lime text-brand-deep shadow-[0_18px_40px_rgba(0,0,0,.35)] transition-transform duration-300 hover:scale-105">
                <Play className="ml-1 h-8 w-8 fill-current" aria-hidden="true" />
              </span>
            </button>
          )}

          {/* No canto de cima à direita: embaixo fica a legenda gravada no
              vídeo, e no canto de cima à esquerda, o logo da JP. */}
          <div className="absolute right-3 top-3 flex gap-2">
            <button
              type="button"
              onClick={alternarSom}
              aria-label={mudo ? "Ouvir o vídeo com som, desde o começo" : "Tirar o som do vídeo"}
              className="flex h-11 items-center gap-2 rounded-full bg-brand-deep/80 px-4 text-[13px] font-bold text-white backdrop-blur transition-colors hover:bg-brand-deep"
            >
              {mudo ? (
                <VolumeX className="h-[18px] w-[18px] text-lime" aria-hidden="true" />
              ) : (
                <Volume2 className="h-[18px] w-[18px] text-lime" aria-hidden="true" />
              )}
              {mudo ? "Ouvir" : "Som ligado"}
            </button>
            {tocando && (
              <button
                type="button"
                onClick={alternarTocar}
                aria-label="Pausar o vídeo"
                className="grid h-11 w-11 place-items-center rounded-full bg-brand-deep/80 text-lime backdrop-blur transition-colors hover:bg-brand-deep"
              >
                <Pause className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
              </button>
            )}
          </div>
        </figure>

        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-lime">
            Gestão com tecnologia
          </p>

          {/* O título diz o que ele diz no vídeo: o diagnóstico é dos
              dentistas. Nada de "IA que diagnostica" — isso ele não disse, e
              não é o que uma clínica pode prometer. */}
          <h3 className="mt-4 max-w-[560px] text-balance font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.04em] text-white sm:text-[40px]">
            O diagnóstico é dos dentistas.{" "}
            <span className="text-lime">A tecnologia organiza a gestão.</span>
          </h3>

          <p className="mt-5 max-w-[560px] text-[15px] leading-[1.7] text-white/75 sm:text-[16px]">
            {GESTOR.nome}, {GESTOR.papel.toLowerCase()} da JP, usa o Dental Office há{" "}
            {anosDeCliente} anos e é embaixador da marca. No vídeo, gravado no estande deles, conta
            como a tecnologia apoia a gestão a partir do planejamento e do diagnóstico que os
            dentistas fazem — e facilita a conversa com você.
          </p>

          {/* O logo deles no roxo original, sobre branco: marca de terceiro
              não é recolorida. */}
          <div className="mt-7 inline-flex max-w-full flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl bg-white px-5 py-4 text-ink shadow-[0_18px_40px_rgba(0,0,0,.22)]">
            <img
              src={logoDentalOffice}
              alt="Dental Office"
              width={150}
              height={26}
              loading="lazy"
              className="h-[26px] w-auto"
            />
            <span aria-hidden="true" className="hidden h-9 w-px bg-border-soft sm:block" />
            <div>
              <p className="font-display text-[17px] font-extrabold leading-tight tracking-[-0.02em]">
                Cliente há <span className="text-brand-text">{anosDeCliente} anos</span>
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft">
                <Star size={13} className="fill-lime text-lime" aria-hidden="true" />
                Embaixador da marca
              </p>
            </div>
          </div>

          <figure className="mt-8 max-w-[560px] border-l-2 border-lime/70 pl-5">
            <Quote size={22} className="mb-2 text-lime" aria-hidden="true" />
            <blockquote className="text-[15px] italic leading-[1.7] text-white/85">
              {fala}
            </blockquote>
            <figcaption className="mt-3 text-micro font-bold uppercase tracking-[0.14em] text-white/55">
              {GESTOR.nome} · gravação original: {creditoDaGravacao}
            </figcaption>
          </figure>
        </div>
      </div>
    </div>
  );
}
