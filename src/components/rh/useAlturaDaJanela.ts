import { useEffect, useState, type RefObject } from "react";

import "./candidaturas-layout.css";

/**
 * A altura que sobra da JANELA para o conteúdo principal de uma aba.
 *
 * POR QUE MEDIR, E NÃO ESCREVER UM NÚMERO
 * O cabeçalho do painel e a barra de filtros são grudentos: ocupam espaço no
 * fluxo E ficam presos no topo. A faixa útil embaixo deles muda quando o painel
 * de filtros abre/fecha, quando o cabeçalho quebra linha e quando a página é
 * rolada. Qualquer constante escrita no CSS fica errada em alguma dessas cenas.
 *
 * O bug mais traiçoeiro daqui era somar `window.scrollY` ao `getBoundingClientRect`.
 * Isso transformava a posição do elemento na JANELA em posição no DOCUMENTO,
 * mas a conta final usa `100dvh`: depois de abrir filtros, rolar um pouco e
 * fechar, o scroll continuava entrando na subtração e o quadro ficava centenas
 * de pixels menor, deixando exatamente o grande vazio branco visto na tela.
 *
 * A fonte de verdade agora é a distância VISÍVEL do alvo até o topo da viewport.
 * Se a página rolar, essa distância muda e a altura acompanha.
 *
 * O QUE ELE DEVOLVE
 * Uma string de `height` pronta, ou `""` enquanto a medição não aconteceu — e
 * aí quem chama simplesmente não aplica `style`, deixando valer o valor de
 * partida do CSS. Isso mantém servidor e primeiro quadro do navegador idênticos.
 *
 * `--rh-rodape-altura` é publicada pela barra de ações em lote, que é grudada
 * embaixo e cobriria a última fileira de cartões. Vale 0 quando não há ninguém
 * selecionado.
 */
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

    let quadro = 0;

    const medir = () => {
      quadro = 0;

      /* É a posição na viewport, sem `scrollY`. Quando o elemento já passou do
         topo por causa da rolagem, zero é o limite útil: não faz sentido ganhar
         mais que a altura inteira da janela. */
      const topo = Math.max(0, Math.round(el.getBoundingClientRect().top));
      const proxima =
        `max(${minimo}, calc(100dvh - ${String(topo)}px - ${folga} - var(--rh-rodape-altura, 0px)))`;

      setAltura((atual) => (atual === proxima ? atual : proxima));
    };

    /* Vários eventos podem acontecer no mesmo frame ao fechar os filtros
       (classe muda, layout recalcula, scroll é corrigido). Medir só no próximo
       frame evita capturar a geometria intermediária. */
    const agendarMedicao = () => {
      if (quadro !== 0) cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(medir);
    };

    medir();

    const observadorTamanho = new ResizeObserver(agendarMedicao);
    observadorTamanho.observe(document.documentElement);
    observadorTamanho.observe(document.body);
    if (el.parentElement) observadorTamanho.observe(el.parentElement);

    /* Abrir/fechar o painel troca `hidden`/`flex` num irmão do quadro. Isso pode
       mudar a POSIÇÃO do alvo sem mudar a altura do body (especialmente porque o
       app já ocupa min-height:100dvh). ResizeObserver sozinho não enxerga essa
       mudança; observar classes/estilos do layout enxerga. */
    const observadorLayout = new MutationObserver(agendarMedicao);
    observadorLayout.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-expanded"],
    });

    window.addEventListener("resize", agendarMedicao, { passive: true });
    window.addEventListener("scroll", agendarMedicao, { passive: true });

    return () => {
      if (quadro !== 0) cancelAnimationFrame(quadro);
      observadorTamanho.disconnect();
      observadorLayout.disconnect();
      window.removeEventListener("resize", agendarMedicao);
      window.removeEventListener("scroll", agendarMedicao);
    };
  }, [alvo, folga, minimo]);

  return altura;
}
