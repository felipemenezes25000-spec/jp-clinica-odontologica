import { CLINICA, whatsappLink } from "@/lib/jp";

/**
 * Todo contato por WhatsApp do site sai daqui.
 *
 * Antes havia seis mensagens escritas à mão, em seis arquivos, e elas não
 * batiam entre si: o topo dizia "JP Clínica Odontológica", o rodapé dizia "JP
 * Clínica Integrada Odontológica" e a seção de especialidades dizia só "JP".
 * Três nomes para a mesma clínica, na primeira frase que o paciente manda —
 * que é exatamente onde a marca precisa chegar inteira.
 *
 * Aqui a mensagem é montada, não digitada. O nome vem de `CLINICA.nome`, a
 * mesma fonte do resto do site.
 *
 * O RASTREIO NÃO MORA MAIS AQUI. Ele foi para `@/lib/analytics`, porque passou
 * a ter três responsabilidades que não são "escrever a frase do paciente":
 * decidir qual evento único um clique produz, guardar a atribuição da campanha
 * e respeitar o consentimento. Este arquivo voltou a fazer uma coisa só.
 */

/** O que a pessoa quer, que é o que muda a frase. */
export type Intencao = "agendar" | "duvida" | "orientacao" | "informacoes";

/*
 * O TIPO `Origem` SAIU DAQUI, e a ausência dele é a documentação.
 *
 * Ele enumerava as seções de onde um contato podia partir ("topo", "hero",
 * "rodape"…) e **nunca foi importado por ninguém** — conferido. A origem real
 * sempre foi descoberta em tempo de execução, subindo o DOM até achar o `id` da
 * seção (`origemDoLink`, em `RastreioDeContato`), porque é isso que funciona
 * para um link que ainda não existe.
 *
 * Uma união fechada de nomes de seção só teria duas consequências: envelhecer a
 * cada seção nova, e dar a impressão de que a lista é exaustiva quando o ouvinte
 * aceita qualquer `id`.
 */

const ABERTURA = `Olá! Vim pelo site da ${CLINICA.nome}`;

function frase(intencao: Intencao, assunto?: string): string {
  // Quando a pessoa veio de uma página de tratamento, a mensagem diz qual —
  // é a informação mais útil que a recepção pode receber de graça, e lê de
  // forma natural, como alguém realmente escreveria.
  const abertura = assunto
    ? `Olá! Vi a página sobre ${assunto} no site da ${CLINICA.nome}`
    : ABERTURA;

  switch (intencao) {
    case "agendar":
      return `${abertura} e gostaria de agendar uma avaliação.`;
    case "duvida":
      return `${abertura} e fiquei com uma dúvida.`;
    case "orientacao":
      return `${abertura} e gostaria de entender qual tratamento faz sentido para o meu caso.`;
    case "informacoes":
      return `${abertura} e gostaria de saber valores, horários e como funciona a avaliação.`;
  }
}

/**
 * A referência de campanha, quando existe, numa linha à parte.
 *
 * ============================================================================
 *  POR QUE NÃO MANDAR A UTM INTEIRA.
 *
 *  Sem CRC operacional nesta primeira fase, a única ponte entre "o anúncio que
 *  a clínica pagou" e "a conversa que a recepção atendeu" é o que viaja dentro
 *  da mensagem. A tentação é colar tudo:
 *
 *      ?gclid=EAIaIQobChMIx...&utm_campaign=implante_search&utm_content=a01
 *
 *  Noventa caracteres de ruído que o PACIENTE lê antes da recepção, numa
 *  conversa sobre saúde. Fica péssimo, parece rastreamento invasivo, e não diz
 *  nada a quem atende.
 *
 *  `Ref.: IMP-G-A01` diz o mesmo para quem precisa saber: implante, Google,
 *  criativo A01. Cabe num bloco de anotação, dá para ditar no telefone, e não
 *  carrega identificador de pessoa nenhum.
 * ============================================================================
 *
 * SEM CAMPANHA, SEM LINHA. Quem chega pela busca orgânica ou digitando o
 * endereço manda exatamente a mesma mensagem de antes — é a maioria das
 * conversas, e ela não devia mudar por causa de uma minoria paga.
 */
function linhaDeReferencia(referencia: string | null | undefined): string {
  return referencia === null || referencia === undefined || referencia.length === 0
    ? ""
    : `\n\nRef.: ${referencia}`;
}

/**
 * O link de WhatsApp já com a mensagem certa.
 *
 * A origem NÃO entra no texto quando não for natural dizê-la. Colar
 * "origem=rodape" numa mensagem que um paciente vai ler é poluir a conversa
 * dele para resolver um problema nosso — a origem viaja pelo evento de
 * analytics, que é onde ela serve.
 *
 * ESTA FUNÇÃO É PURA, E TEM DE CONTINUAR SENDO. Ela é chamada durante o render,
 * e o render acontece duas vezes: no servidor e na hidratação. Se ela lesse
 * `sessionStorage` para descobrir a campanha, o servidor produziria um `href`
 * e o navegador outro — que é erro de hidratação do React, e derruba a árvore
 * inteira num CTA. Quem busca a referência é `useContatoWhatsApp`, depois de
 * montar. Ver `components/site/useContatoWhatsApp.ts`.
 */
export function contatoWhatsApp(
  intencao: Intencao,
  assunto?: string,
  referencia?: string | null,
): string {
  return whatsappLink(`${frase(intencao, assunto)}${linhaDeReferencia(referencia)}`);
}
