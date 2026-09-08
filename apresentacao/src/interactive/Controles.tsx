import { useCallback, useRef } from "react";
import {
  Captions,
  CaptionsOff,
  Compass,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { CAPITULOS, DURACAO_TOTAL, capituloNoFrame } from "@/data/linhaDoTempo";
import { FPS } from "@/design-system/tokens";
import { formatarTempo } from "@/motion/timing";

/**
 * A barra do player.
 *
 * Discreta de propósito: fora do palco, na cor do papel, sem caixa preta de
 * vídeo. A peça é um tour, não um arquivo de mídia — e o chrome não deveria
 * parecer mais tecnológico que o conteúdo.
 *
 * A trilha responde a clique E a arrasto, com `pointer capture`: sem isso, sair
 * do retângulo com o botão pressionado abandonaria o arrasto no meio.
 */
export function Controles({
  frame,
  tocando,
  aoAlternar,
  aoIrPara,
  aoAvancar,
  aoReiniciar,
  som,
  aoAlternarSom,
  legendas,
  aoAlternarLegendas,
  telaCheia,
  aoAlternarTelaCheia,
  aoExplorar,
}: {
  frame: number;
  tocando: boolean;
  aoAlternar: () => void;
  aoIrPara: (frame: number) => void;
  aoAvancar: (frames: number) => void;
  aoReiniciar: () => void;
  som: boolean;
  aoAlternarSom: () => void;
  legendas: boolean;
  aoAlternarLegendas: () => void;
  telaCheia: boolean;
  aoAlternarTelaCheia: () => void;
  aoExplorar: () => void;
}) {
  const trilha = useRef<HTMLDivElement | null>(null);
  const capituloAtual = capituloNoFrame(frame);
  const razao = frame / (DURACAO_TOTAL - 1);

  const posicionar = useCallback(
    (clientX: number) => {
      const caixa = trilha.current?.getBoundingClientRect();
      if (caixa === undefined || caixa.width === 0) return;
      const t = Math.max(0, Math.min(1, (clientX - caixa.left) / caixa.width));
      aoIrPara(t * (DURACAO_TOTAL - 1));
    },
    [aoIrPara],
  );

  return (
    <>
      <div className="jp-controles">
        <button
          className="jp-botao-icone"
          onClick={() => aoAvancar(-90)}
          aria-label="Voltar 3 segundos"
          title="Voltar (←)"
        >
          <SkipBack size={19} strokeWidth={2.2} />
        </button>

        <button
          className="jp-botao-icone jp-play"
          onClick={aoAlternar}
          aria-label={tocando ? "Pausar" : "Reproduzir"}
          title={tocando ? "Pausar (espaço)" : "Reproduzir (espaço)"}
        >
          {tocando ? <Pause size={21} fill="currentColor" strokeWidth={0} /> : <Play size={21} fill="currentColor" strokeWidth={0} />}
        </button>

        <button
          className="jp-botao-icone"
          onClick={() => aoAvancar(90)}
          aria-label="Avançar 3 segundos"
          title="Avançar (→)"
        >
          <SkipForward size={19} strokeWidth={2.2} />
        </button>

        <span className="jp-tempo" aria-hidden="true">
          {formatarTempo(frame / FPS)} / {formatarTempo(DURACAO_TOTAL / FPS)}
        </span>

        <div
          ref={trilha}
          className="jp-trilha"
          role="slider"
          tabIndex={0}
          aria-label="Progresso do tour"
          aria-valuemin={0}
          aria-valuemax={Math.round(DURACAO_TOTAL / FPS)}
          aria-valuenow={Math.round(frame / FPS)}
          aria-valuetext={`${formatarTempo(frame / FPS)}, capítulo ${capituloAtual.nome}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            posicionar(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) posicionar(e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              aoAvancar(e.key === "ArrowRight" ? 90 : -90);
            }
          }}
        >
          <div className="jp-trilha-fundo">
            <div className="jp-trilha-preenchida" style={{ width: `${razao * 100}%` }} />
            {CAPITULOS.slice(1).map((capitulo) => (
              <span
                key={capitulo.chave}
                className="jp-trilha-marca"
                style={{ left: `${(capitulo.inicioFrame / (DURACAO_TOTAL - 1)) * 100}%` }}
              />
            ))}
          </div>
          <span className="jp-trilha-cabeca" style={{ left: `${razao * 100}%` }} />
        </div>

        <button
          className="jp-botao-icone"
          onClick={aoAlternarLegendas}
          aria-label={legendas ? "Ocultar legendas" : "Mostrar legendas"}
          aria-pressed={legendas}
          title="Legendas"
        >
          {legendas ? <Captions size={19} strokeWidth={2.2} /> : <CaptionsOff size={19} strokeWidth={2.2} />}
        </button>

        <button
          className="jp-botao-icone"
          onClick={aoAlternarSom}
          aria-label={som ? "Desligar som" : "Ligar som"}
          aria-pressed={som}
          title="Som (M)"
        >
          {som ? <Volume2 size={19} strokeWidth={2.2} /> : <VolumeX size={19} strokeWidth={2.2} />}
        </button>

        <button className="jp-botao-icone" onClick={aoReiniciar} aria-label="Reiniciar" title="Reiniciar (R)">
          <RotateCcw size={18} strokeWidth={2.2} />
        </button>

        <button className="jp-botao-icone" onClick={aoExplorar} aria-label="Modo explorar" title="Explorar (E)">
          <Compass size={19} strokeWidth={2.2} />
        </button>

        <button
          className="jp-botao-icone"
          onClick={aoAlternarTelaCheia}
          aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          title="Tela cheia (F)"
        >
          {telaCheia ? <Minimize2 size={19} strokeWidth={2.2} /> : <Maximize2 size={19} strokeWidth={2.2} />}
        </button>
      </div>

      {/* Capítulos: sete, não vinte e oito (item 19). */}
      <div className="jp-capitulos" role="tablist" aria-label="Capítulos">
        {CAPITULOS.map((capitulo) => (
          <button
            key={capitulo.chave}
            className="jp-capitulo"
            role="tab"
            aria-current={capitulo.chave === capituloAtual.chave}
            aria-selected={capitulo.chave === capituloAtual.chave}
            onClick={() => aoIrPara(capitulo.inicioFrame)}
          >
            {capitulo.nome}
          </button>
        ))}
      </div>
    </>
  );
}
