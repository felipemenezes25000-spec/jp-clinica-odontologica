import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { tocarEfeito } from "@/audio/efeitos";
import { EFEITOS_PADRAO_LIGADOS, TRILHA, VOLUME_TRILHA } from "@/data/audio";
import { capituloNoFrame, cenaPorId, type IdCena } from "@/data/linhaDoTempo";
import { FPS } from "@/design-system/tokens";
import { Filme } from "@/film/Filme";
import { useRelogio } from "@/hooks/useRelogio";
import { useMovimentoReduzido, useTeclado, useTelaCheia } from "@/hooks/useTela";
import { Controles } from "@/interactive/Controles";
import { Legendas } from "@/interactive/Legendas";
import { ModoExplorar } from "@/interactive/ModoExplorar";
import { TelaInicial } from "@/interactive/TelaInicial";
import { Visor } from "@/interactive/Visor";
import { asset } from "@/utils/asset";

/**
 * O tour interativo.
 *
 * Junta as quatro peças que já existem separadas — relógio, filme, chrome e modo
 * explorar — e não faz mais nada. Toda a lógica de animação mora nas cenas; toda
 * a de tempo, no `useRelogio`. Aqui só se decide o que está visível.
 *
 * O que este componente resolve de verdade: som nunca começa sozinho, movimento
 * reduzido chega ao filme, e abrir o modo explorar pausa (deixar o vídeo rodando
 * atrás de um painel gasta bateria e confunde).
 */
export function App() {
  const relogio = useRelogio();
  const movimentoReduzido = useMovimentoReduzido();

  const raiz = useRef<HTMLDivElement | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const { cheia, alternar: alternarTelaCheia } = useTelaCheia(raiz);

  const [comecou, setComecou] = useState(false);
  const [som, setSom] = useState(EFEITOS_PADRAO_LIGADOS);
  const [legendas, setLegendas] = useState(true);
  const [explorando, setExplorando] = useState(false);

  /* -------------------------------------------------------------------- */
  /* Som                                                                  */
  /* -------------------------------------------------------------------- */

  // A trilha segue o estado do filme. Sem isso ela continuaria tocando com o
  // vídeo pausado, que é o erro mais comum deste tipo de peça.
  useEffect(() => {
    const elemento = audio.current;
    if (elemento === null) return;
    elemento.volume = VOLUME_TRILHA;
    if (som && relogio.tocando) {
      void elemento.play().catch(() => {
        // Sem gesto do usuário o navegador recusa. O botão de som é o gesto;
        // se ainda assim falhar, o tour segue mudo — nada quebra.
      });
    } else {
      elemento.pause();
    }
  }, [som, relogio.tocando]);

  // Sincroniza a trilha ao arrastar a barra. Meio segundo de tolerância evita
  // reposicionar o áudio a cada frame e engasgar o som.
  useEffect(() => {
    const elemento = audio.current;
    if (elemento === null || !som) return;
    const alvo = relogio.frame / FPS;
    if (Math.abs(elemento.currentTime - alvo) > 0.5) elemento.currentTime = alvo;
  }, [relogio.frame, som]);

  // Um "whoosh" por virada de capítulo. Sete no filme inteiro — discreto,
  // como o briefing pede.
  const capituloAnterior = useRef<string | null>(null);
  useEffect(() => {
    const atual = capituloNoFrame(relogio.frame).chave;
    if (capituloAnterior.current !== null && capituloAnterior.current !== atual && relogio.tocando) {
      tocarEfeito("whoosh", som);
    }
    capituloAnterior.current = atual;
  }, [relogio.frame, relogio.tocando, som]);

  /* -------------------------------------------------------------------- */
  /* Ações                                                                */
  /* -------------------------------------------------------------------- */

  const assistir = useCallback(() => {
    setComecou(true);
    relogio.tocar();
  }, [relogio]);

  const abrirExplorar = useCallback(() => {
    setComecou(true);
    relogio.pausar();
    setExplorando(true);
    tocarEfeito("clique", som);
  }, [relogio, som]);

  const irParaCena = useCallback(
    (id: IdCena) => {
      relogio.irPara(cenaPorId(id).inicioFrame);
      setExplorando(false);
      setComecou(true);
      relogio.tocar();
    },
    [relogio],
  );

  useTeclado({
    alternar: () => {
      if (!comecou) {
        assistir();
        return;
      }
      relogio.alternar();
    },
    avancar: relogio.avancar,
    telaCheia: alternarTelaCheia,
    mudo: () => setSom((s) => !s),
    reiniciar: relogio.reiniciar,
    explorar: () => setExplorando((e) => !e),
    fechar: () => setExplorando(false),
  });

  return (
    <div className="jp-app" ref={raiz}>
      <a className="jp-so-leitor" href="#controles">
        Pular para os controles
      </a>

      <div className="jp-visor" style={{ position: "relative" }}>
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <Visor>
            <Filme frame={relogio.frame} movimentoReduzido={movimentoReduzido} />
          </Visor>

          <Legendas frame={relogio.frame} visivel={legendas && comecou} />
        </div>

        <AnimatePresence>
          {!comecou && <TelaInicial aoAssistir={assistir} aoExplorar={abrirExplorar} />}
        </AnimatePresence>
      </div>

      <div id="controles">
        <Controles
          frame={relogio.frame}
          tocando={relogio.tocando}
          aoAlternar={relogio.alternar}
          aoIrPara={relogio.irPara}
          aoAvancar={relogio.avancar}
          aoReiniciar={relogio.reiniciar}
          som={som}
          aoAlternarSom={() => setSom((s) => !s)}
          legendas={legendas}
          aoAlternarLegendas={() => setLegendas((l) => !l)}
          telaCheia={cheia}
          aoAlternarTelaCheia={alternarTelaCheia}
          aoExplorar={abrirExplorar}
        />
      </div>

      <ModoExplorar
        aberto={explorando}
        aoFechar={() => setExplorando(false)}
        aoIrParaCena={irParaCena}
      />

      {TRILHA !== null && (
        <audio ref={audio} src={asset(TRILHA)} loop preload="auto" aria-hidden="true" />
      )}
    </div>
  );
}
