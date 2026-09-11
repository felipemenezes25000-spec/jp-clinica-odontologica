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
 */

/** O que a pessoa quer, que é o que muda a frase. */
export type Intencao = "agendar" | "duvida" | "orientacao";

/**
 * De onde o contato partiu.
 *
 * Serve para duas coisas: alimentar o evento de analytics e, nas páginas de
 * tratamento, entrar na própria mensagem — "Vi a página sobre implantes" diz à
 * recepção o que a pessoa estava lendo, sem depender de ferramenta nenhuma
 * estar instalada.
 */
export type Origem =
  | "topo"
  | "hero"
  | "flutuante"
  | "rodape"
  | "faq"
  | "especialidades"
  | "contato"
  | "avaliacoes"
  | `tratamento:${string}`;

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
  }
}

/**
 * O link de WhatsApp já com a mensagem certa.
 *
 * A origem NÃO entra no texto quando não for natural dizê-la. Colar
 * "origem=rodape" numa mensagem que um paciente vai ler é poluir a conversa
 * dele para resolver um problema nosso — a origem viaja pelo evento de
 * analytics, que é onde ela serve.
 */
export function contatoWhatsApp(intencao: Intencao, assunto?: string): string {
  return whatsappLink(frase(intencao, assunto));
}

/* ────────────────────────────────────────────────────────────────────────── */

type Evento =
  | "whatsapp_click"
  | "schedule_click"
  | "phone_click"
  | "treatment_view"
  | "treatment_cta_click"
  | "map_click"
  | "review_click"
  | "form_start"
  | "form_submit";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * Registra um evento de conversão.
 *
 * Hoje o site NÃO tem GA4, GTM nem nada equivalente instalado — conferido. Esta
 * função existe para que a instrumentação já esteja no lugar certo quando
 * alguém instalar: basta o GTM aparecer e os eventos começam a chegar, sem
 * caçar cada botão de novo.
 *
 * Até lá ela empurra para `window.dataLayer`, que é o formato que o GTM lê. Sem
 * GTM o array simplesmente não existe e a função não faz nada — nunca lança, e
 * nunca impede o clique de acontecer, que é o que de fato importa numa clínica.
 */
export function rastrear(evento: Evento, dados: Record<string, string> = {}): void {
  try {
    if (typeof window === "undefined") return;
    window.dataLayer ??= [];
    window.dataLayer.push({ event: evento, ...dados });
  } catch {
    // Analytics nunca pode derrubar um CTA. Se falhar, falha calado.
  }
}
