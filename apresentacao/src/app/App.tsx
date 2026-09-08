import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { tocarEfeito } from "@/audio/efeitos";
import {
  EFEITOS_PADRAO_LIGADOS,
  NARRACAO,
  TRILHA,
  VOLUME_NARRACAO,
  VOLUME_TRILHA,
} from "@/data/audio";
import { capituloNoFrame, cenaPorId, FPS_FILME, type IdCena } from "@/data/linhaDoTempo";
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
 * Junta relógio, filme, chrome e modo explorar — e resolve a única coisa
 * genuinamente difícil daqui: manter a VOZ colada no vídeo.
 *
 * Como a voz é uma trilha única alinhada ao frame 0, e o filme é função de
 * `frame`, sincronizar é comparar `audio.currentTime` com `frame / fps` e
 * corrigir quando a diferença passar de 0,25 s. Isso cobre pausa, arrasto da
 * barra, salto de capítulo e a aba que ficou em segundo plano — todos os casos
 * em que um `setTimeout` teria se perdido.
 */
export function App() {
  const relogio = useRelogio();
  const movimentoReduzido = useMovimentoReduzido();

  const raiz = useRef<HTMLDivElement | null>(null);
  const narracao = useRef<HTMLAudioElement | null>(null);
  const trilha = useRef<HTMLAudioElement | null>(null);
  const { cheia, alternar: alternarTelaCheia } = useTelaCheia(raiz);

  const [comecou, setComecou] = useState(false);
  const [som, setSom] = useState(true);
  const [legendas, setLegendas] = useState(true);
  const [explorando, setExplorando] = useState(false);

  /* -------------------------------------------------------------------- */
  /* Áudio                                                                */
  /* -------------------------------------------------------------------- */

  // Toca e pausa junto com o filme. Sem isto a voz continuaria falando com o
  // vídeo parado, que é o defeito mais comum deste tipo de peça.
  useEffect(() => {
    for (const ref of [narracao, trilha]) {
      const elemento = ref.current;
      if (elemento === null) continue;
      elemento.volume = ref === narracao ? VOLUME_NARRACAO : VOLUME_TRILHA;
      elemento.muted = !som;
      if (som && relogio.tocando && comecou) {
        void elemento.play().catch(() => {
          // Sem gesto do usuário o navegador recusa. O botão "Assistir" é o
          // gesto; se ainda assim falhar, o tour segue mudo e legendado.
        });
      } else {
        elemento.pause();
      }
    }
  }, [som, relogio.tocando, comecou]);

  // Reancora o áudio quando o vídeo é movido. A tolerância de 0,25 s evita
  // reposicionar a cada frame — o que engasgaria o som sem melhorar nada.
  useEffect(() => {
    const alvo = relogio.frame / FPS_FILME;
    for (const ref of [narracao, trilha]) {
      const elemento = ref.current;
      if (elemento === null) continue;
      if (Math.abs(elemento.currentTime - alvo) > 0.25) elemento.currentTime = alvo;
    }
  }, [relogio.frame]);

  // Um "whoosh" por virada de capítulo. Sete no filme inteiro — discreto, e
  // silencioso enquanto a voz está falando não é necessário: o efeito é curto e
  // fica muito abaixo do volume da narração.
  const capituloAnterior = useRef<string | null>(null);
  useEffect(() => {
    const atual = capituloNoFrame(relogio.frame).chave;
    if (capituloAnterior.current !== null && capituloAnterior.current !== atual && relogio.tocando) {
      tocarEfeito("whoosh", som && EFEITOS_PADRAO_LIGADOS);
    }
    capituloAnterior.current = atual;
  }, [relogio.frame, relogio.tocando, som]);

  /* -------------------------------------------------------------------- */
  /* Ações                                                                */
  /* -------------------------------------------------------------------- */

  const assistir = useCallback(
    (comSom: boolean) => {
      setSom(comSom);
      setComecou(true);
      relogio.irPara(0);
      relogio.tocar();
    },
    [relogio],
  );

  const abrirExplorar = useCallback(() => {
    setComecou(true);
    relogio.pausar();
    setExplorando(true);
  }, [relogio]);

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
        assistir(true);
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

      <div className="jp-visor">
        <div className="jp-visor-area">
          <Visor
            sobreposicao={<Legendas frame={relogio.frame} visivel={legendas && comecou} />}
          >
            <Filme frame={relogio.frame} movimentoReduzido={movimentoReduzido} />
          </Visor>
        </div>

        <AnimatePresence>
          {!comecou && (
            <TelaInicial
              aoAssistir={() => assistir(true)}
              aoAssistirSemSom={() => assistir(false)}
              aoExplorar={abrirExplorar}
            />
          )}
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

      {NARRACAO !== null && (
        <audio ref={narracao} src={asset(NARRACAO)} preload="auto" aria-hidden="true" />
      )}
      {TRILHA !== null && (
        <audio ref={trilha} src={asset(TRILHA)} loop preload="auto" aria-hidden="true" />
      )}
    </div>
  );
}
