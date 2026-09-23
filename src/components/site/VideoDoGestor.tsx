import { useRef, useState } from "react";
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
 * outro ponto da home, ele teria de se apresentar de novo. O vídeo começa e
 * termina na mesma capa (JP × Dental Office): o pôster antes do play e o último
 * quadro depois dele são a mesma imagem.
 *
 * O QUE O PACIENTE LEVA. "Quem fecha o diagnóstico são os dentistas; a
 * tecnologia entra na gestão" — é o que ele diz, e é o que interessa a quem
 * vai se tratar. O selo (cliente há 15 anos, parceiro da marca) é a prova de
 * que não é sistema adotado ontem.
 *
 * Como toca — SÓ QUANDO A PESSOA PEDE:
 *
 * 1. Abre parado, na capa (JP × Dental Office), com o botão de play. Não há
 *    autoplay nem loop: a primeira versão tocava muda sozinha ao entrar na
 *    tela, e o cliente pediu em 22/09/2026 que o vídeo só comece no play. É
 *    também o que o vídeo pede — é um depoimento, e depoimento é com som.
 * 2. O play já sai COM SOM. Quem clicou quer ouvir; um vídeo que começa mudo
 *    depois do clique parece quebrado.
 * 3. `preload="none"`: nada é baixado antes do clique. São 10 MB que quem não
 *    assiste não paga.
 * 4. Ao terminar, volta para a capa (`load()`), pronto para dar play de novo.
 * 5. A fala está escrita ao lado, por extenso: é a alternativa em texto do
 *    vídeo e é o que o buscador lê.
 */
export function VideoDoGestor() {
  const ref = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(false);

  const alternarTocar = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      el.muted = false;
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const alternarSom = () => {
    const el = ref.current;
    if (!el) return;
    el.muted = !el.muted;
  };

  const voltarParaCapa = () => {
    setTocando(false);
    ref.current?.load();
  };

  const { anosDeCliente, relacao, fala, creditoDaGravacao } = GESTOR_DENTAL_OFFICE;
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
            playsInline
            preload="none"
            aria-label={descricao}
            onPlay={() => setTocando(true)}
            onPause={() => setTocando(false)}
            onEnded={voltarParaCapa}
            onVolumeChange={(e) => setMudo(e.currentTarget.muted)}
            className="block aspect-[4/5] w-full object-cover"
          />

          {!tocando && (
            <button
              type="button"
              onClick={alternarTocar}
              aria-label={`Reproduzir com som. ${descricao}`}
              className="absolute inset-0 grid place-items-center bg-brand-deep/10 transition-colors hover:bg-transparent"
            >
              <span className="grid h-[76px] w-[76px] place-items-center rounded-full bg-lime text-white shadow-[0_18px_40px_rgba(0,0,0,.4)] ring-4 ring-white/25 transition-transform duration-300 hover:scale-105">
                <Play className="ml-1 h-8 w-8 fill-current" aria-hidden="true" />
              </span>
            </button>
          )}

          {/* Só aparecem depois do play: parado, a capa fica limpa. */}
          {tocando && (
            <div className="absolute right-3 top-3 flex gap-2">
              <button
                type="button"
                onClick={alternarSom}
                aria-label={mudo ? "Ligar o som" : "Tirar o som"}
                className="grid h-11 w-11 place-items-center rounded-full bg-brand-deep/80 text-lime backdrop-blur transition-colors hover:bg-brand-deep"
              >
                {mudo ? (
                  <VolumeX className="h-[18px] w-[18px]" aria-hidden="true" />
                ) : (
                  <Volume2 className="h-[18px] w-[18px]" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={alternarTocar}
                aria-label="Pausar o vídeo"
                className="grid h-11 w-11 place-items-center rounded-full bg-brand-deep/80 text-lime backdrop-blur transition-colors hover:bg-brand-deep"
              >
                <Pause className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
              </button>
            </div>
          )}
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
            {anosDeCliente} anos e é {relacao.toLowerCase()}. No vídeo, gravado no estande deles,
            conta como a tecnologia apoia a gestão a partir do planejamento e do diagnóstico que os
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
                {relacao}
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
