import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/**
 * Animação explicativa de um tratamento.
 *
 * Três decisões que sustentam o componente:
 *
 * 1. `preload="none"` + poster — o vídeo só é baixado quando o visitante pede.
 *    Sem isso, um clipe de algumas centenas de KB entraria no carregamento
 *    inicial de toda página de tratamento sem ninguém ter pedido.
 *
 * 2. Os clipes são mudos por natureza (animação 3D sem trilha), então não há
 *    o que legendar. O que existe é `descricao`, exibida ao lado do vídeo e
 *    usada como rótulo acessível — quem não vê o vídeo lê o que ele mostra.
 *
 * 3. `prefers-reduced-motion` desliga o autoplay. Quem pediu menos movimento
 *    recebe o poster com o botão de play, e decide.
 */
export function TreatmentVideo({
  src,
  poster,
  descricao,
  autoPlay = true,
}: {
  src: string;
  poster: string;
  descricao: string;
  autoPlay?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);
  const [podeAnimar, setPodeAnimar] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aplicar = () => setPodeAnimar(!mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  // Só carrega e toca quando entra na tela — e apenas se o autoplay for permitido.
  useEffect(() => {
    const el = ref.current;
    if (!el || !autoPlay || !podeAnimar) return;

    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada) return;
        if (entrada.isIntersecting) {
          // O estado vem dos eventos play/pause, não desta promise: ela pode
          // resolver sem que a reprodução comece de fato (política de autoplay,
          // aba em segundo plano), e aí o botão ficaria preso escondido.
          void el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.45 },
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [autoPlay, podeAnimar]);

  const tocarManual = () => {
    void ref.current?.play().catch(() => {});
  };

  const pausarManual = () => ref.current?.pause();

  return (
    <figure className="relative overflow-hidden rounded-[2rem] border border-forest/12 bg-brand-deep shadow-lift">
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={descricao}
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        className="aspect-square w-full object-cover"
      />

      {/* WCAG 2.2.2: conteúdo em movimento automático por mais de 5s precisa de
          um jeito de pausar. Em repouso o botão cobre o vídeo (chamada para
          reproduzir); tocando, encolhe para um canto e vira Pausar. */}
      <button
        type="button"
        onClick={tocando ? pausarManual : tocarManual}
        aria-label={tocando ? `Pausar animação: ${descricao}` : `Reproduzir animação: ${descricao}`}
        className={
          tocando
            ? "absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-forest-2/80 text-lime backdrop-blur transition-colors hover:bg-brand-deep"
            : "absolute inset-0 grid place-items-center bg-forest-2/35 transition-colors hover:bg-forest-2/20"
        }
      >
        {tocando ? (
          <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-full bg-lime text-brand-deep shadow-lift transition-transform duration-300 hover:scale-105">
            <Play className="ml-0.5 h-7 w-7 fill-current" aria-hidden="true" />
          </span>
        )}
      </button>

      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-forest-2 to-transparent p-5 pt-12 text-sm font-semibold leading-snug text-white/85">
        {descricao}
      </figcaption>
    </figure>
  );
}
