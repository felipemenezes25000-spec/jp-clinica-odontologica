import { atribuicaoDaSessao, camposDeAtribuicao } from "./atribuicao";
import { tratamentoDaRota } from "./rotas";

/**
 * A CAMADA DE EVENTOS — uma ação do usuário, um evento.
 *
 * ============================================================================
 *  O DEFEITO QUE ESTE ARQUIVO FECHA: DUPLA E TRIPLA CONTAGEM.
 *
 *  Um clique em "Agendar avaliação" dentro de uma página de tratamento
 *  disparava TRÊS eventos — `whatsapp_click`, `schedule_click` e
 *  `treatment_cta_click` — e a tradução para a Meta mandava `Contact` no
 *  primeiro e `Lead` nos outros dois. Um único paciente virava um Contact e
 *  dois Leads.
 *
 *  Isso não é imprecisão de relatório. É o Google Ads e a Meta aprendendo que
 *  aquele clique valeu três conversões e subindo o lance para comprar mais
 *  cliques iguais — a clínica pagando mais caro por uma contagem que ela mesma
 *  inflou.
 * ============================================================================
 *
 * A REGRA, E ELA É CURTA: **`generate_lead` é a única conversão.** Tudo o mais
 * é analítico e não deve ser marcado como conversão em lugar nenhum.
 *
 *   generate_lead   contato com intenção real — agendar. É o que o Google Ads
 *                   otimiza e o que vira `Lead` na Meta.
 *   contact_click   contato genérico, sem pedido de agendamento. Vira `Contact`.
 *   os demais       leitura de funil. Nenhum vira conversão.
 *
 * `decidirEventoDeClique` devolve **no máximo um** evento. É função pura, e é
 * assim que "um clique não vira dois leads" vira um teste em vez de uma
 * intenção.
 */

export type Evento =
  | "generate_lead"
  | "contact_click"
  | "phone_click"
  | "treatment_view"
  | "form_start"
  | "form_submit"
  | "map_click"
  | "review_click"
  | "career_view"
  | "career_apply";

/** Por onde o contato aconteceu. Entra no evento, não na mensagem do paciente. */
export type Canal = "whatsapp" | "telefone" | "formulario";

export type DadosDeEvento = Record<string, string>;

/**
 * De evento nosso para evento padrão da Meta.
 *
 * A Meta só otimiza campanha em cima do vocabulário dela — `generate_lead` não
 * entra em otimização de conversão; `Lead`, sim.
 *
 * O QUE FICA DE FORA FICA DE PROPÓSITO. `map_click`, `review_click` e os de
 * carreira são navegação, não intenção comercial: mandá-los como conversão
 * ensinaria o algoritmo a buscar quem procura endereço e quem procura emprego.
 * `form_submit` também fica fora, e por um motivo diferente — ele acompanha um
 * `generate_lead` na mesma ação, e mandar os dois seria reabrir a dupla
 * contagem por outra porta.
 */
const META_POR_EVENTO: Partial<Record<Evento, string>> = {
  generate_lead: "Lead",
  contact_click: "Contact",
  phone_click: "Contact",
  treatment_view: "ViewContent",
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    /** O Pixel da Meta, quando configurado. Ver `VITE_META_PIXEL_ID`. */
    fbq?: (...args: unknown[]) => void;
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Identidade do evento — o gancho para a Conversion API                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Um identificador por conversão, para deduplicação browser/servidor.
 *
 * Hoje nada consome isto: não há Conversion API. Ele existe porque o dia em que
 * houver, o mesmo `generate_lead` vai chegar à Meta pelos dois caminhos, e sem
 * um `event_id` comum ela conta os dois. Adicionar depois exigiria mexer no
 * despacho de novo; adicionar agora custa oito linhas e nenhuma dependência.
 *
 * `crypto.randomUUID` existe em todo navegador que este site suporta; o resto é
 * rede de segurança — um id fraco é melhor do que uma exceção no meio de um CTA.
 */
function novoEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* segue para o alternativo */
  }
  return `jp-${String(Date.now())}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Despacho                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Registra um evento.
 *
 * SEM CONTAINER INSTALADO ELA NÃO FAZ NADA, e não lança. O `dataLayer` é um
 * array que o GTM lê quando chega; sem GTM ele só acumula em memória e morre
 * com a aba. Nenhum clique de WhatsApp depende disto para funcionar — é a
 * propriedade mais importante deste arquivo, e o E2E a verifica.
 */
export function rastrear(evento: Evento, dados: DadosDeEvento = {}): void {
  try {
    if (typeof window === "undefined") return;

    // Só a conversão leva a atribuição junto. Pendurá-la em `map_click` encheria
    // o relatório de colunas repetidas sem responder a pergunta nenhuma.
    const eventId = evento === "generate_lead" ? novoEventId() : null;
    const carga: DadosDeEvento =
      eventId !== null
        ? { ...camposDeAtribuicao(atribuicaoDaSessao()), event_id: eventId, ...dados }
        : { ...dados };

    window.dataLayer ??= [];
    window.dataLayer.push({ event: evento, ...carga });

    const meta = META_POR_EVENTO[evento];
    if (meta !== undefined && typeof window.fbq === "function") {
      // `eventID` (camelCase) é o nome que a Meta espera, e é o que faz o
      // evento do navegador casar com o do servidor quando houver CAPI.
      if (eventId !== null) window.fbq("track", meta, carga, { eventID: eventId });
      else window.fbq("track", meta, carga);
    }
  } catch {
    // Medição nunca pode derrubar um CTA. Se falhar, falha calada.
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* A decisão — pura, e por isso testável                                      */
/* ────────────────────────────────────────────────────────────────────────── */

export type Clique = {
  /** O `href` do link clicado. */
  href: string;
  /** O texto visível, já aparado. Entra no relatório, não na decisão de lead. */
  rotulo: string;
  /** De que seção partiu: o `id` do ancestral mais próximo, `topo` ou `rodape`. */
  origem: string;
  /** O caminho da página onde o clique aconteceu. */
  pathname: string;
};

export type EventoPlanejado = { evento: Evento; dados: DadosDeEvento };

/**
 * A intenção é lida da MENSAGEM, não do rótulo visível.
 *
 * O cartão que mostra o número tem "(11) 97616-5117" escrito nele e mesmo assim
 * abre o WhatsApp pedindo avaliação. Pelo rótulo, esse clique sumiria da conta
 * de agendamentos; pela mensagem, ele conta — e é o que de fato houve.
 */
function pedeAgendamento(href: string): boolean {
  try {
    const texto = decodeURIComponent(href.split("text=")[1] ?? "");
    return /agendar uma avalia/iu.test(texto);
  } catch {
    return false;
  }
}

/**
 * Qual evento — UM — este clique produz. `null` quando não produz nenhum.
 *
 * A ordem dos testes é a ordem de especificidade, e cada ramo termina em
 * `return`. Não existe caminho neste corpo que devolva dois eventos: é isso que
 * `eventos.test.ts` fixa, e é isso que impedia a conversão de ser contada três
 * vezes.
 */
export function decidirEventoDeClique(clique: Clique): EventoPlanejado | null {
  const { href, rotulo, origem, pathname } = clique;
  const tratamento = tratamentoDaRota(pathname);
  const comum: DadosDeEvento = { origem, rotulo, pagina: pathname };
  if (tratamento !== null) comum["treatment"] = tratamento;

  if (href.includes("wa.me")) {
    // Agendar é lead; "tirar uma dúvida" é contato. A diferença é o que permite
    // responder "quantas pessoas pediram avaliação?" em vez de "quantas
    // clicaram em algum botão verde?".
    return pedeAgendamento(href)
      ? { evento: "generate_lead", dados: { ...comum, channel: "whatsapp" } }
      : { evento: "contact_click", dados: { ...comum, channel: "whatsapp" } };
  }

  if (href.startsWith("tel:")) {
    return { evento: "phone_click", dados: { ...comum, channel: "telefone" } };
  }

  if (href.includes("google.com/maps")) {
    // O selo de avaliações também aponta para o Maps. Diferenciar pelo texto
    // evita contar clique no selo ("N avaliações") como pedido de rota.
    return /avalia|★|estrela/iu.test(rotulo)
      ? { evento: "review_click", dados: comum }
      : { evento: "map_click", dados: comum };
  }

  if (href.includes("google.com/search") || href.includes("g.page")) {
    return { evento: "review_click", dados: comum };
  }

  if (href.startsWith("/trabalhe-conosco") || href.includes("/trabalhe-conosco?")) {
    return { evento: "career_apply", dados: { ...comum, etapa: "cta" } };
  }

  return null;
}
