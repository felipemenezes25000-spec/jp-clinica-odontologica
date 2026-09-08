/**
 * Uma seção que abre e fecha — a peça que tira a ficha do candidato do estado
 * de "tudo aberto ao mesmo tempo".
 *
 * O PROBLEMA QUE ELA RESOLVE
 * A leitura da IA entrega, de uma vez, seis barras de critério, a lista de
 * sinalizações, a linha do tempo dos empregos, os pontos fortes, os pontos de
 * atenção, a impressão e seis perguntas de entrevista. Tudo verdadeiro, tudo
 * útil — e tudo junto vira parede de texto. Quem abre a ficha quer responder
 * uma pergunta por vez, então a interface também precisa mostrar uma por vez.
 *
 * POR QUE `<button>` E NÃO `<details>`
 * `<details>` seria menos código, mas o estado dele vive no DOM: trocar de
 * candidato pela gaveta recriaria as seções fechadas. Aqui o estado vive no
 * pai e acompanha quem percorre a fila.
 *
 * O CORPO NÃO FICA ESCONDIDO NO DOM: quando fechado, ele não é renderizado.
 * Isso evita montar árvores caras só para escondê-las com CSS.
 *
 * O ESTADO NUNCA É SÓ A SETA: `aria-expanded` informa a mesma coisa ao leitor
 * de tela, e o resumo ao lado do título ("4 itens", "6 perguntas") adianta o
 * conteúdo sem exigir abertura.
 */
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import "./workspace-candidato.css";
import "./workspace-candidato-position.css";

export function Sanfona(props: {
  /** Base dos ids do par cabeçalho/corpo. Precisa ser único na página. */
  id: string;
  titulo: string;
  icone: LucideIcon;
  /** O que existe atrás da porta: "4 itens", "6 perguntas", "3 experiências". */
  resumo?: string;
  aberta: boolean;
  aoAlternar: () => void;
  children: ReactNode;
}) {
  const { id, titulo, icone: Icone, resumo, aberta, aoAlternar, children } = props;

  return (
    <section
      className="rh-vidro overflow-hidden"
      data-rh-sanfona="true"
      data-sanfona-id={id}
      data-aberta={aberta ? "true" : "false"}
    >
      <h3>
        <button
          type="button"
          onClick={aoAlternar}
          aria-expanded={aberta}
          aria-controls={aberta ? `${id}-corpo` : undefined}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-lime/[0.07] sm:px-4"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-lime/10">
            <Icone className="h-4 w-4 text-lime" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 font-display text-sm font-bold tracking-[-0.01em] text-white">
            {titulo}
          </span>
          {resumo === undefined || resumo === "" ? null : (
            <span
              data-sanfona-resumo="true"
              className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[0.7rem] font-semibold text-white/85 ring-1 ring-white/10"
            >
              {resumo}
            </span>
          )}
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-white/85 transition-transform duration-200 ${
              aberta ? "rotate-180" : ""
            }`}
          />
        </button>
      </h3>

      {aberta ? (
        <div id={`${id}-corpo`} className="border-t border-white/10 px-4 pb-4 pt-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Estado das sanfonas com uma regra deliberada: UMA seção aberta por vez.
 *
 * Antes o hook guardava um array e permitia reabrir a ficha até ela voltar a
 * parecer um relatório comprido. Para a rotina do RH isso é ruído: ao abrir
 * "Pontos de atenção", a pergunta anterior já foi respondida e pode fechar.
 *
 * `iniciais` continua como array para não quebrar os chamadores antigos; só a
 * primeira chave é usada. Hoje os dois usos do hook passam vazio, então a ficha
 * continua abrindo limpa.
 */
export function useSanfonas(iniciais: string[] = []): {
  aberta: (chave: string) => boolean;
  alternar: (chave: string) => void;
} {
  const [abertaAtual, setAbertaAtual] = useState<string | null>(iniciais[0] ?? null);

  const aberta = useCallback((chave: string) => abertaAtual === chave, [abertaAtual]);

  const alternar = useCallback((chave: string) => {
    setAbertaAtual((atual) => (atual === chave ? null : chave));
  }, []);

  return { aberta, alternar };
}
