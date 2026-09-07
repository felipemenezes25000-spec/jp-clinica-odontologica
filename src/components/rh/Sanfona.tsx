/**
 * Uma seção que abre e fecha — a peça que tira a ficha do candidato do estado
 * de "tudo aberto ao mesmo tempo".
 *
 * O PROBLEMA QUE ELA RESOLVE
 * A leitura da IA entrega, de uma vez, seis barras de critério, a lista de
 * sinalizações, a linha do tempo dos empregos, os pontos fortes, os pontos de
 * atenção, a impressão e seis perguntas de entrevista. Tudo verdadeiro, tudo
 * útil — e tudo junto vira parede de texto: nas palavras do cliente, "eu fico
 * com a visão poluída". Quem abre a ficha quer uma pergunta por vez ("os
 * pontos fortes compensam os fracos?"), e a tela tem de responder uma por vez.
 *
 * POR QUE `<button>` E NÃO `<details>`
 * `<details>` seria menos código, mas o estado dele vive no DOM: trocar de
 * candidato pela gaveta recriaria as seções fechadas, e o RH que abriu "Pontos
 * de atenção" teria de abrir de novo em cada ficha da fila. Aqui quem guarda o
 * que está aberto é o pai, então a escolha ACOMPANHA a pessoa enquanto ela
 * percorre a lista — que é o jeito como o painel é usado de verdade.
 *
 * O CORPO NÃO FICA ESCONDIDO NO DOM: quando fechado, ele não é renderizado. Com
 * seis seções por ficha e sessenta fichas, montar tudo para depois esconder com
 * CSS é trabalho jogado fora — e a linha do tempo dos empregos não é barata.
 *
 * O ESTADO NUNCA É SÓ A SETA: o `aria-expanded` diz a mesma coisa ao leitor de
 * tela, e o resumo ao lado do título ("4 itens", "6 perguntas") já adianta, com
 * a seção fechada, o que existe lá dentro. Fechar não pode custar informação.
 */
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";

export function Sanfona(props: {
  /** Base dos ids do par cabeçalho/corpo. Precisa ser único na página. */
  id: string;
  titulo: string;
  icone: LucideIcon;
  /**
   * O que a pessoa ganha ao abrir: "4 itens", "6 perguntas", "3 experiências".
   * Fica visível com a seção fechada — é o que faz valer a pena não abrir.
   */
  resumo?: string;
  aberta: boolean;
  aoAlternar: () => void;
  children: ReactNode;
}) {
  const { id, titulo, icone: Icone, resumo, aberta, aoAlternar, children } = props;

  return (
    <section className="rh-vidro overflow-hidden">
      {/* O <h3> preserva o sumário do documento para quem navega por títulos; o
          <button> dentro dele é o que recebe foco e clique. */}
      <h3>
        <button
          type="button"
          onClick={aoAlternar}
          aria-expanded={aberta}
          aria-controls={aberta ? `${id}-corpo` : undefined}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-lime/[0.07] sm:px-5"
        >
          <Icone className="h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
          <span className="min-w-0 flex-1 font-display text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-white">
            {titulo}
          </span>
          {resumo === undefined || resumo === "" ? null : (
            <span className="shrink-0 text-xs font-semibold text-white/85">{resumo}</span>
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
        <div id={`${id}-corpo`} className="border-t border-white/10 px-4 pb-4 pt-3.5 sm:px-5">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/**
 * O estado de "quais seções estão abertas", com uma regra: NADA abre sozinho.
 *
 * O pedido era abrir a ficha e ver a nota, não a enciclopédia. Quem quiser um
 * bloco aberto por padrão passa a chave em `iniciais` — e deve ter bom motivo,
 * porque cada padrão aberto devolve um pedaço da poluição.
 *
 * O prefixo `use` é exigência da regra `react-hooks/rules-of-hooks`, que
 * reconhece hook pelo nome. É o único anglicismo do arquivo.
 */
export function useSanfonas(iniciais: string[] = []): {
  aberta: (chave: string) => boolean;
  alternar: (chave: string) => void;
} {
  const [abertas, setAbertas] = useState<string[]>(iniciais);

  const aberta = useCallback((chave: string) => abertas.includes(chave), [abertas]);

  const alternar = useCallback((chave: string) => {
    setAbertas((atuais) =>
      atuais.includes(chave) ? atuais.filter((c) => c !== chave) : [...atuais, chave],
    );
  }, []);

  return { aberta, alternar };
}
