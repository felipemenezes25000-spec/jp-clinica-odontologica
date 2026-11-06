import { useEffect, useRef, useState } from "react";

import { querMenosMovimento } from "@/components/site/sistema/ambiente";

/**
 * Um número que sobe até o valor quando entra na tela.
 *
 * O HTML do servidor já traz o valor real: robô, leitor de tela e quem está
 * sem JavaScript leem "211", nunca "0". Só depois de montar, e só se o número
 * ainda estiver FORA da tela, ele volta a zero para subir quando aparecer. Já
 * visível na chegada (primeira dobra), fica parado: animar o que a pessoa já
 * está lendo é ruído. Com "reduzir movimento", nunca anima.
 *
 * Feito à mão (requestAnimationFrame + Intl), sem biblioteca: o NumberFlow
 * custava ~46 KB nas landings pagas para fazer a mesma coisa.
 *
 * NÃO use na primeira dobra das landings: o E2E confere a nota ali.
 */
const DURACAO_MS = 1100;
/** easeOutExpo: chega rápido e assenta devagar no valor. */
const suavizar = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

export function Contador({
  valor,
  casas = 0,
  prefixo,
  sufixo,
  className = "",
}: {
  valor: number;
  casas?: number;
  prefixo?: string;
  sufixo?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [atual, setAtual] = useState(valor);

  useEffect(() => {
    const el = ref.current;
    if (!el || querMenosMovimento() || !("IntersectionObserver" in window)) return;
    const caixa = el.getBoundingClientRect();
    if (caixa.top < window.innerHeight && caixa.bottom > 0) return;

    setAtual(0);
    let quadro = 0;
    const io = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada?.isIntersecting) return;
        io.disconnect();
        const inicio = performance.now();
        const passo = (agora: number) => {
          const t = suavizar((agora - inicio) / DURACAO_MS);
          setAtual(valor * t);
          if (t < 1) quadro = requestAnimationFrame(passo);
        };
        quadro = requestAnimationFrame(passo);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(quadro);
    };
  }, [valor]);

  const texto = atual.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {prefixo}
      {texto}
      {sufixo}
    </span>
  );
}
