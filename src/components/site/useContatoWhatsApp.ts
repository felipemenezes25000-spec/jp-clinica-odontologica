import { useEffect, useMemo, useState } from "react";

import { atribuicaoDaSessao, referenciaCurta } from "@/lib/analytics/atribuicao";
import { contatoWhatsApp, type Intencao } from "@/lib/contato";

/**
 * O link de WhatsApp de um CTA, com a referência da campanha quando houver.
 *
 * ============================================================================
 *  POR QUE UM HOOK, E NÃO UMA CHAMADA DIRETA.
 *
 *  A referência (`Ref.: IMP-G-A01`) sai da atribuição guardada em
 *  `sessionStorage` — que o SERVIDOR não tem. Montar o `href` com ela durante o
 *  render faria o HTML servido trazer um link e a hidratação trazer outro:
 *  **erro de hidratação do React**, e ele não falha só no link — derruba a
 *  árvore a partir dali, que no caso é um CTA.
 *
 *  Então o primeiro render é sempre o link SEM referência, igual nos dois
 *  lados, e a referência entra depois que o componente monta. Do ponto de vista
 *  de quem usa o site, nada muda: ninguém clica antes de a página montar, e se
 *  clicasse, o link já é válido — ele só não teria a referência.
 *
 *  É a mesma solução que `FloatingCTA` já usava para lembrar a dispensa, e pelo
 *  mesmo motivo. Vale repetir o padrão em vez de inventar um segundo.
 * ============================================================================
 */
export function useContatoWhatsApp(intencao: Intencao, assunto?: string): string {
  const referencia = useReferenciaDeCampanha();

  return useMemo(
    () => contatoWhatsApp(intencao, assunto, referencia),
    [intencao, assunto, referencia],
  );
}

/**
 * A referência sozinha, para quem monta a própria mensagem.
 *
 * O formulário de contato é o caso: ele compõe cinco linhas com o que a pessoa
 * preencheu, e não passa por `contatoWhatsApp`. Sem isto, um lead vindo do
 * formulário numa visita paga chegaria à recepção sem a campanha — e ele é,
 * junto com o CTA, uma das duas formas de contato que o site produz.
 *
 * `null` até montar, e `null` para sempre quando não houve campanha.
 */
export function useReferenciaDeCampanha(): string | null {
  const [referencia, setReferencia] = useState<string | null>(null);

  useEffect(() => {
    setReferencia(referenciaCurta(atribuicaoDaSessao()));
  }, []);

  return referencia;
}
