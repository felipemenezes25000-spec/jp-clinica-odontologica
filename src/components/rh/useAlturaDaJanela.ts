/**
 * A altura que sobra da janela para o conteúdo principal de uma aba.
 *
 * POR QUE MEDIR, E NÃO ESCREVER UM NÚMERO
 * O cabeçalho do painel e a barra de filtros são grudentos: ocupam espaço no
 * fluxo E ficam presos no topo. A faixa útil embaixo deles é sempre
 * `altura da janela - distância do elemento até o topo do documento`, esteja a
 * página rolada ou não. Só que essa distância MUDA — o cabeçalho quebra em duas
 * linhas no celular, o painel de filtros abre e fecha, o aviso de sessão
 * expirada aparece. Qualquer constante escrita no CSS estaria errada em metade
 * das telas: era o que fazia o quadro do kanban travar em 44rem e deixar 60px
 * de página vazia num monitor de 1080 enquanto a coluna "Novo", com 54 pessoas,
 * mostrava três.
 *
 * O QUE ELE DEVOLVE
 * Uma string de `height` pronta, ou `""` enquanto a medição não aconteceu — e
 * aí quem chama simplesmente não aplica `style`, deixando valer o valor de
 * partida do CSS. Isso mantém servidor e primeiro quadro do navegador
 * idênticos, então a hidratação não vê diferença nenhuma.
 *
 * O prefixo `use` é obrigação da regra `react-hooks/rules-of-hooks`, que
 * identifica hook pelo nome — é o único anglicismo do arquivo, e sem ele o
 * lint não reconhece isto aqui como hook.
 *
 * `--rh-rodape-altura` é publicada pela barra de ações em lote, que é grudada
 * embaixo e cobriria a última fileira de cartões. Vale 0 quando não há ninguém
 * selecionado.
 */
import { useEffect, useState, type RefObject } from "react";

export function useAlturaAteOFimDaJanela(
  alvo: RefObject<HTMLElement | null>,
  /** Respiro entre o fim do conteúdo e a borda da janela. */
  folga = "1rem",
  /** Piso, para uma janela muito baixa não virar uma fresta. */
  minimo = "22rem",
): string {
  const [altura, setAltura] = useState("");

  useEffect(() => {
    const el = alvo.current;
    if (!el) return;

    const medir = () => {
      const topo = el.getBoundingClientRect().top + window.scrollY;
      setAltura(
        `max(${minimo}, calc(100dvh - ${String(Math.round(topo))}px - ${folga} - var(--rh-rodape-altura, 0px)))`,
      );
    };
    medir();

    const observador = new ResizeObserver(medir);
    observador.observe(document.body);
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [alvo, folga, minimo]);

  return altura;
}
