import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import "./tratamento/animacao.css";

/**
 * Animação explicativa de um tratamento, dentro da coroa.
 *
 * Três decisões que sustentam o componente:
 *
 * 1. `preload="none"` + poster — o vídeo só é baixado quando o visitante pede.
 *    Sem isso, um clipe de algumas centenas de KB entraria no carregamento
 *    inicial de toda página de tratamento sem ninguém ter pedido.
 *
 * 2. Os clipes são mudos por natureza (animação 3D sem trilha), então não há
 *    o que legendar. O que existe é `descricao`, exibida na legenda e usada
 *    como rótulo acessível — quem não vê o vídeo lê o que ele mostra. A
 *    legenda sempre começa por "Animação ilustrativa": é ilustração, não
 *    imagem de procedimento, e a pessoa precisa saber disso antes de pensar o
 *    contrário.
 *
 * 3. `prefers-reduced-motion` desliga o autoplay. Quem pediu menos movimento
 *    recebe o poster com o botão de play, e decide.
 *
 * `medir` e `proporcao` repassam à coroa: com `medir` ela segue a altura que o
 * pai der (o topo da página usa); sem, fica na proporção. `legenda={false}`
 * deixa o pai escrever a legenda onde o desenho dele pedir.
 */
export function TreatmentVideo({
  src,
  poster,
  descricao,
  autoPlay = true,
  proporcao = 0.9,
  medir = false,
  legenda = true,
  className = "",
}: {
  src: string;
  poster: string;
  descricao: string;
  autoPlay?: boolean;
  proporcao?: number;
  medir?: boolean;
  legenda?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [tocando, setTocando] = useState(false);
  const [podeAnimar, setPodeAnimar] = useState(false);
  // A escolha de quem apertou "Pausar" vale até apertar "Reproduzir": sair da
  // tela e voltar não pode religar o vídeo (WCAG 2.2.2 — pausar é um direito).
  const pausadoPeloUsuario = useRef(false);

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
          if (pausadoPeloUsuario.current) return;
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

  /* O botão de reproduzir e o de pausar são DOIS elementos (`key` diferente),
     e não um que muda de lugar: o mesmo botão saindo do centro para o canto
     quando a animação começa sozinha contava como mudança de layout (CLS
     ~0,16 em /ortodontia). Quando a troca vem de um clique, o foco passa para
     o botão novo, para quem usa teclado não ficar sem foco. */
  const botaoRef = useRef<HTMLButtonElement>(null);
  const trocaPeloUsuario = useRef(false);
  useEffect(() => {
    if (!trocaPeloUsuario.current) return;
    trocaPeloUsuario.current = false;
    botaoRef.current?.focus();
  }, [tocando]);

  const tocarManual = () => {
    pausadoPeloUsuario.current = false;
    trocaPeloUsuario.current = true;
    void ref.current?.play().catch(() => {});
  };

  const pausarManual = () => {
    pausadoPeloUsuario.current = true;
    trocaPeloUsuario.current = true;
    ref.current?.pause();
  };

  return (
    <figure className={`animacao ${className}`}>
      <MolduraCoroa medir={medir} proporcao={proporcao} className="animacao-moldura">
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
        />

        {/* WCAG 2.2.2: conteúdo em movimento automático por mais de 5s precisa
            de um jeito de pausar. Em repouso o botão é a chamada para
            reproduzir; tocando, encolhe para o canto e vira Pausar. */}
        <button
          key={tocando ? "pausar" : "reproduzir"}
          ref={botaoRef}
          type="button"
          className="animacao-botao"
          data-estado={tocando ? "tocando" : "parado"}
          onClick={tocando ? pausarManual : tocarManual}
          aria-label={
            tocando ? `Pausar animação: ${descricao}` : `Reproduzir animação: ${descricao}`
          }
        >
          {tocando ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
      </MolduraCoroa>

      {legenda && (
        <figcaption className="animacao-legenda text-pequeno">
          <strong>Animação ilustrativa.</strong> {descricao}
        </figcaption>
      )}
    </figure>
  );
}
