/**
 * O envelope da Meta, desmontado — §11, §12.
 *
 * ============================================================================
 *  A META USA DUAS FORMAS DIFERENTES NO MESMO POST, e é aí que a maioria das
 *  integrações erra.
 *
 *      MENSAGEM        entry[].messaging[]     ← estilo Messenger Platform
 *      COMENTÁRIO      entry[].changes[]       ← estilo Webhooks de campo
 *      LEAD            entry[].changes[]       ← idem, campo `leadgen`
 *
 *  Um normalizador escrito só contra `changes[]` — que é o formato do webhook
 *  de WhatsApp e o primeiro que se aprende — recebe todo direct do Instagram e
 *  não encontra nada dentro. Sem erro: `changes` simplesmente não existe, o
 *  laço não roda, o envelope sai vazio, e o CRC responde 200.
 *
 *  A mensagem do paciente some, e a Meta considera entregue.
 *
 *  Os DOIS laços existem por isso, e `ignorados` conta o que nenhum deles
 *  reconheceu — ver `EnvelopeMeta.ignorados`.
 * ============================================================================
 *
 * ============================================================================
 *  FORMATOS CONFERIDOS NA DOCUMENTAÇÃO OFICIAL EM 15/09/2026:
 *
 *    Instagram messaging  `{object:"instagram", entry:[{id:<IGID>, time,
 *                          messaging:[{sender:{id:<IGSID>},
 *                          recipient:{id:<IGID>}, timestamp, message:{…}}]}]}`
 *      https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook/
 *
 *    Instagram comments   `{object:"instagram", entry:[{id, time,
 *                          changes:[{field:"comments", value:{…}}]}]}`
 *      https://developers.facebook.com/docs/instagram-platform/webhooks
 *
 *    Messenger            `{object:"page", entry:[{id:<PAGE_ID>, …}]}`
 *      https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview
 *
 *    Lead Ads             `changes:[{field:"leadgen", value:{leadgen_id,
 *                          page_id, form_id, adgroup_id, ad_id, created_time}}]`
 *      https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/
 * ============================================================================
 *
 * ARQUIVO PURO. Nada de rede, nada de banco — é entrada de teste e entrada de
 * fila ao mesmo tempo.
 */
import { campo, ehObjeto, lista, textoOpcional } from "../../dominio/validar";

import type {
  AnexoDoEvento,
  ContextoDaMensagem,
  EnvelopeMeta,
  EventoComentario,
  EventoEntrega,
  EventoLead,
  EventoMensagemRecebida,
  EventoMeta,
} from "./tipos";
import { ENVELOPE_VAZIO } from "./tipos";

/* -------------------------------------------------------------------------- */
/* Tempo                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * O carimbo da Meta em ISO.
 *
 * ============================================================================
 *  A META MISTURA DUAS UNIDADES, e confundi-las erra por um fator de 1000.
 *
 *    `entry[].time`          SEGUNDOS
 *    `messaging[].timestamp` MILISSEGUNDOS
 *    `value.created_time`    SEGUNDOS (Lead Ads) ou ISO (Graph API)
 *
 *  Um milissegundo lido como segundo dá o ano 56.000; um segundo lido como
 *  milissegundo dá 1970. Os dois passam pelo `new Date()` sem reclamar, e o
 *  efeito aparece na Inbox como uma mensagem de 1970 no topo da lista para
 *  sempre — ou numa janela de 24 horas que nunca fecha.
 *
 *  A heurística é o tamanho: um carimbo em segundos do ano 2026 tem 10 dígitos;
 *  em milissegundos, 13. A fronteira em 1e11 separa os dois com folga de
 *  séculos em cada direção.
 * ============================================================================
 */
export function instanteDaMeta(valor: unknown, agora: Date = new Date()): string {
  if (typeof valor === "string") {
    const trimmed = valor.trim();
    // `created_time` da Graph API vem como ISO 8601 com offset.
    if (/[-T:]/u.test(trimmed)) {
      const t = Date.parse(trimmed);
      if (Number.isFinite(t)) return new Date(t).toISOString();
    }
  }

  const n =
    typeof valor === "number"
      ? valor
      : typeof valor === "string"
        ? Number.parseInt(valor.trim(), 10)
        : Number.NaN;

  if (!Number.isFinite(n) || n <= 0) return agora.toISOString();

  const ms = n < 1e11 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? agora.toISOString() : d.toISOString();
}

/* -------------------------------------------------------------------------- */
/* A entrada                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Interpreta um POST de webhook da Meta.
 *
 * NUNCA LANÇA. Um payload torto tem que virar envelope vazio com `ignorados`
 * contado — e não uma exceção no meio da rota, que faria a Meta receber 500 e
 * reenviar o mesmo payload torto para sempre.
 */
export function interpretarWebhookMeta(corpo: unknown, agora: Date = new Date()): EnvelopeMeta {
  if (!ehObjeto(corpo)) return { ...ENVELOPE_VAZIO, ignorados: 1 };

  const objeto = textoOpcional(corpo["object"]) ?? "";
  const eventos: EventoMeta[] = [];
  const contas = new Set<string>();
  let ignorados = 0;

  const entries = lista(corpo["entry"]);
  if (entries.length === 0) {
    /*
     * ENVELOPE SEM `entry` NÃO É ERRO NECESSARIAMENTE.
     *
     * A Meta manda notificações de mudança de configuração do app, e elas não
     * têm `entry`. Contar como ignorado é o certo — é exatamente o que a saúde
     * quer saber quando o número sobe — mas registrar como falha faria a fila
     * repescar um envelope que nunca vai ter conteúdo.
     */
    return { objeto, eventos: [], contas: [], ignorados: 1 };
  }

  for (const entry of entries) {
    /*
     * `entry.id` É A CONTA, e é a chave de roteamento de tenant (§33).
     *
     * ======================================================================
     *  NUM WEBHOOK `page`, ELE É O PAGE ID. Num `instagram`, é o id da CONTA
     *  DO INSTAGRAM — e não o da Página, mesmo estando ligados.
     *
     *  É por isso que `crc_canais_meta` tem as duas colunas e dois índices:
     *  a mesma linha é encontrada por qualquer um dos dois, dependendo de
     *  qual produto mandou o evento. Guardar um só exigiria uma tradução
     *  extra, e traduções divergem.
     * ======================================================================
     */
    const conta = textoOpcional(campo(entry, "id")) ?? "";
    if (conta.length > 0) contas.add(conta);

    const doEntry = instanteDaMeta(campo(entry, "time"), agora);

    // 1. O laço de MENSAGEM — `messaging[]`.
    for (const m of lista(campo(entry, "messaging"))) {
      const lidos = daMensagem(m, { objeto, conta, doEntry, agora });
      if (lidos.length === 0) ignorados += 1;
      else eventos.push(...lidos);
    }

    /*
     * `standby[]` — a mensagem que chega quando OUTRO app é o receptor
     * primário no Handover Protocol.
     *
     * Ela é contada como ignorada de propósito, e não processada: se outro app
     * está atendendo aquela conversa, responder por cima é o mesmo defeito de
     * dois atendentes respondendo juntos, com um app no lugar de uma pessoa.
     * A contagem faz o problema aparecer na saúde em vez de virar silêncio.
     */
    ignorados += lista(campo(entry, "standby")).length;

    // 2. O laço de MUDANÇA — `changes[]`.
    for (const c of lista(campo(entry, "changes"))) {
      const lidos = daMudanca(c, { objeto, conta, doEntry, agora });
      if (lidos.length === 0) ignorados += 1;
      else eventos.push(...lidos);
    }
  }

  return { objeto, eventos, contas: [...contas], ignorados };
}

type Contexto = { objeto: string; conta: string; doEntry: string; agora: Date };

/* -------------------------------------------------------------------------- */
/* Mensagens                                                                  */
/* -------------------------------------------------------------------------- */

function canalDoObjeto(objeto: string): "instagram" | "messenger" {
  return objeto === "instagram" ? "instagram" : "messenger";
}

function daMensagem(bruto: unknown, ctx: Contexto): EventoMeta[] {
  if (!ehObjeto(bruto)) return [];

  const canal = canalDoObjeto(ctx.objeto);
  const remetente = textoOpcional(campo(bruto, "sender.id"));
  const destinatario = textoOpcional(campo(bruto, "recipient.id"));
  const quando = instanteDaMeta(bruto["timestamp"], ctx.agora);

  /*
   * A CONTA VEM DE `entry.id`, com `recipient.id` como resgate.
   *
   * Nos ECOS eles se invertem: a Página é o `sender` e a pessoa é o
   * `recipient`. Usar `recipient.id` como conta sem essa ressalva rotearia o
   * eco para "a conta cujo id é o IGSID da pessoa" — que não existe, e o evento
   * viraria dead letter.
   */
  const eco = campo(bruto, "message.is_echo") === true;
  const conta = ctx.conta.length > 0 ? ctx.conta : eco ? (remetente ?? "") : (destinatario ?? "");

  // ENTREGA E LEITURA primeiro: elas não têm `message` e cairiam no descarte.
  const entregas = statusDaMensagem(bruto, { canal, conta, quando });
  if (entregas.length > 0) return entregas;

  const mensagem = bruto["message"];
  if (!ehObjeto(mensagem)) return [];

  const mid = textoOpcional(mensagem["mid"]);
  if (mid === null) {
    /*
     * SEM `mid` NÃO HÁ IDEMPOTÊNCIA — §34.
     *
     * Descartar é a decisão certa e não é perda: toda mensagem real tem `mid`.
     * Aceitar sem ele exigiria inventar uma chave, e uma chave inventada
     * (hash do texto + carimbo) deduplicaria duas mensagens idênticas
     * legítimas — "sim" e "sim" no mesmo segundo — e deixaria passar
     * reentregas com carimbo diferente. Os dois erros ao mesmo tempo.
     */
    return [];
  }

  /*
   * QUEM É O CONTATO depende de a mensagem ser eco ou não.
   *
   * A conversa é única por `(organização, canal, contato_externo)`, e o contato
   * é SEMPRE a PESSOA — nunca a clínica. Num eco, a pessoa é o `recipient`.
   * Sem esta inversão, cada resposta enviada pelo celular criaria uma conversa
   * cujo "contato" é a própria conta da clínica.
   */
  const contatoExterno = eco ? destinatario : remetente;
  if (contatoExterno === null || contatoExterno.length === 0) return [];
  if (conta.length === 0) return [];

  const anexos = anexosDe(mensagem);
  const contexto = contextoDe(mensagem);
  const texto = textoDaMensagem(mensagem, canal, anexos, contexto);

  const evento: EventoMensagemRecebida = {
    tipo: canal === "instagram" ? "instagram.message.received" : "messenger.message.received",
    idExterno: mid,
    contaExterna: conta,
    ocorridoEm: quando,
    canal,
    contatoExterno,
    texto,
    apelido: null,
    anexos,
    contexto,
    eco,
  };

  return [evento];
}

function statusDaMensagem(
  bruto: Record<string, unknown>,
  p: { canal: "instagram" | "messenger"; conta: string; quando: string },
): EventoEntrega[] {
  const saida: EventoEntrega[] = [];

  /*
   * ENTREGA TRAZ UMA LISTA DE `mids`, e não um.
   *
   * A Meta agrupa: um `delivery` pode confirmar cinco mensagens de uma vez. Ler
   * só o primeiro deixaria as outras quatro paradas em `SENT` para sempre — e a
   * Inbox mostraria "enviando" numa mensagem que o paciente já leu.
   */
  for (const bloco of ["delivery", "read"] as const) {
    const dados = bruto[bloco];
    if (!ehObjeto(dados)) continue;

    const status = bloco === "delivery" ? ("DELIVERED" as const) : ("READ" as const);
    const mids = lista(dados["mids"])
      .map((m) => textoOpcional(m))
      .filter((m): m is string => m !== null);

    if (mids.length > 0) {
      for (const mid of mids) {
        saida.push({
          tipo:
            p.canal === "instagram"
              ? status === "DELIVERED"
                ? "instagram.message.delivery"
                : "instagram.message.read"
              : status === "DELIVERED"
                ? "messenger.message.delivery"
                : "messenger.message.read",
          // A CHAVE INCLUI O STATUS: `DELIVERED` e `READ` da mesma mensagem são
          // dois eventos e os dois precisam ser aplicados. Sem o status na
          // chave, o segundo seria descartado como duplicata do primeiro — e a
          // mensagem ficaria "entregue" para sempre, mesmo lida.
          idExterno: `${mid}:${status}`,
          contaExterna: p.conta,
          ocorridoEm: p.quando,
          canal: p.canal,
          providerMessageId: mid,
          status,
        });
      }
      continue;
    }

    /*
     * `watermark` SEM `mids` — o formato do Messenger.
     *
     * Ele diz "tudo até este instante foi entregue/lido", sem listar as
     * mensagens. Aplicá-lo exigiria varrer as mensagens da conversa por data —
     * um UPDATE em massa disparado por webhook, que é exatamente o tipo de
     * trabalho que não pode acontecer no caminho de resposta rápida.
     *
     * É CONTADO COMO IGNORADO (o chamador soma quando nada volta), e isso é
     * honesto: o status de entrega fica menos preciso no Messenger, e a saúde
     * mostra o número em vez de a ausência passar por completude.
     */
  }

  return saida;
}

/**
 * O texto da mensagem, ou um marcador honesto — §13.
 *
 * ============================================================================
 *  NUNCA DEVOLVE VAZIO, e o §13 é explícito sobre isso.
 *
 *  Uma mensagem vazia na Inbox parece defeito de renderização. A recepção abre
 *  a conversa, não vê nada, e responde no escuro — ou pior, ignora, achando que
 *  foi um toque acidental. Quando era um áudio com uma pergunta.
 *
 *  O marcador diz O QUE veio e ONDE abrir. É menos do que transcrever o áudio,
 *  e é infinitamente mais do que uma bolha em branco.
 * ============================================================================
 */
function textoDaMensagem(
  mensagem: Record<string, unknown>,
  canal: "instagram" | "messenger",
  anexos: readonly AnexoDoEvento[],
  contexto: ContextoDaMensagem | null,
): string {
  const direto =
    textoOpcional(mensagem["text"]) ??
    textoOpcional(campo(mensagem, "quick_reply.payload")) ??
    textoOpcional(campo(mensagem, "postback.title"));

  const onde = canal === "instagram" ? "no Instagram" : "no Messenger";

  if (direto !== null) {
    // STORY MENTION COM LEGENDA: o texto é a legenda, e sem a marca do contexto
    // a recepção lê "amei!" sem saber amei o quê.
    if (contexto?.tipo === "story_mention") return `[menção em story ${onde}] ${direto}`;
    if (contexto?.tipo === "story_reply") return `[resposta a story ${onde}] ${direto}`;
    return direto;
  }

  if (contexto?.tipo === "story_mention") return `[menção em story ${onde}]`;

  const primeiro = anexos[0];
  if (primeiro !== undefined) {
    const nome = nomeDoAnexo(primeiro.tipo);
    const resto = anexos.length > 1 ? ` e mais ${String(anexos.length - 1)}` : "";
    return `[${nome} recebid${nome.endsWith("a") ? "a" : "o"} ${onde}${resto}]`;
  }

  /*
   * REAÇÃO (`reaction`) E DESFAZER (`is_deleted`) chegam como mensagem sem
   * texto e sem anexo. Eles têm significado, e o marcador o preserva.
   */
  if (ehObjeto(mensagem["reaction"])) {
    const emoji = textoOpcional(campo(mensagem, "reaction.emoji")) ?? "";
    return `[reação ${emoji} ${onde}]`.replace("  ", " ");
  }
  if (mensagem["is_deleted"] === true) return `[mensagem apagada pela pessoa ${onde}]`;

  return `[mensagem sem texto recebida ${onde} — abra no aplicativo]`;
}

function nomeDoAnexo(tipo: string): string {
  const MAPA: Readonly<Record<string, string>> = {
    image: "imagem",
    video: "vídeo",
    audio: "áudio",
    file: "arquivo",
    share: "publicação compartilhada",
    story_mention: "menção em story",
    ig_reel: "reel compartilhado",
    reel: "reel compartilhado",
    location: "localização",
    template: "mensagem estruturada",
    fallback: "conteúdo não suportado",
  };
  return MAPA[tipo] ?? `conteúdo de tipo ${tipo}`;
}

function anexosDe(mensagem: Record<string, unknown>): AnexoDoEvento[] {
  const saida: AnexoDoEvento[] = [];

  for (const a of lista(mensagem["attachments"])) {
    if (!ehObjeto(a)) continue;
    saida.push({
      tipo: textoOpcional(a["type"]) ?? "desconhecido",
      url: textoOpcional(campo(a, "payload.url")),
      // A Meta não manda mime no webhook de messaging. Declarar `null` é
      // honesto; inferir do sufixo da URL seria adivinhar a partir de uma URL
      // assinada e temporária.
      mime: null,
    });
  }

  return saida;
}

function contextoDe(mensagem: Record<string, unknown>): ContextoDaMensagem | null {
  const respostaA = campo(mensagem, "reply_to");
  if (ehObjeto(respostaA)) {
    const story = campo(respostaA, "story");
    if (ehObjeto(story)) {
      return {
        tipo: "story_reply",
        referencia: textoOpcional(story["id"]),
        url: textoOpcional(story["url"]),
      };
    }
    const mid = textoOpcional(respostaA["mid"]);
    if (mid !== null) return { tipo: "reply", referencia: mid, url: null };
  }

  // Story mention chega como anexo de tipo `story_mention`, sem `reply_to`.
  for (const a of lista(mensagem["attachments"])) {
    if (ehObjeto(a) && textoOpcional(a["type"]) === "story_mention") {
      return {
        tipo: "story_mention",
        referencia: null,
        url: textoOpcional(campo(a, "payload.url")),
      };
    }
  }

  // `referral` é o clique num anúncio de Click-to-Message. É a atribuição do
  // §19 chegando junto com a conversa, e perdê-la é perder a campanha.
  const referencia = campo(mensagem, "referral");
  if (ehObjeto(referencia)) {
    return {
      tipo: "ad",
      referencia: textoOpcional(referencia["ad_id"]) ?? textoOpcional(referencia["ref"]),
      url: null,
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Mudanças — comentários, menções e leads                                    */
/* -------------------------------------------------------------------------- */

function daMudanca(bruto: unknown, ctx: Contexto): EventoMeta[] {
  if (!ehObjeto(bruto)) return [];

  const campoDaMudanca = textoOpcional(bruto["field"]) ?? "";
  const valor = bruto["value"];
  if (!ehObjeto(valor)) return [];

  if (campoDaMudanca === "comments") return [...doComentario(valor, ctx)];
  if (campoDaMudanca === "mentions") return [...daMencao(valor, ctx)];
  if (campoDaMudanca === "leadgen") return [...doLead(valor, ctx)];

  /*
   * `messages` DENTRO DE `changes` — o formato do WhatsApp Business.
   *
   * Ele NÃO é tratado aqui de propósito. WhatsApp tem porta própria
   * (`integracoes/whatsapp/`), com janela própria, template próprio e
   * roteamento por `phone_number_id`. Aceitá-lo aqui criaria um SEGUNDO
   * caminho de entrada para o WhatsApp — e dois caminhos para o mesmo canal
   * divergem: um aplica a janela de 24h e o outro não.
   *
   * Cai em `ignorados`, e a saúde mostra. Se aparecer, é sinal de que alguém
   * apontou o webhook de WhatsApp para a URL da Meta.
   */
  return [];
}

function doComentario(valor: Record<string, unknown>, ctx: Contexto): EventoComentario[] {
  const id = textoOpcional(valor["id"]);
  if (id === null) return [];

  /*
   * `verb` DIZ SE FOI CRIAÇÃO OU REMOÇÃO.
   *
   * Ele nem sempre vem — no webhook de Instagram normalmente não vem, e a
   * ausência significa criação. Tratar a ausência como remoção faria o CRC
   * ignorar todo comentário; tratar `remove` como criação faria a clínica
   * mandar private reply sobre um comentário que a pessoa APAGOU, o que é
   * pior — é responder a algo que ela decidiu não ter dito.
   */
  const verbo = (textoOpcional(valor["verb"]) ?? "add").toLowerCase();
  const removido = verbo === "remove" || verbo === "delete" || valor["is_deleted"] === true;

  const midia =
    textoOpcional(campo(valor, "media.id")) ??
    textoOpcional(valor["media_id"]) ??
    textoOpcional(campo(valor, "post.id")) ??
    textoOpcional(valor["post_id"]);

  const evento: EventoComentario = {
    tipo: removido ? "instagram.comment.deleted" : "instagram.comment.created",
    // O ID DO COMENTÁRIO COM O VERBO: criar e apagar o mesmo comentário são dois
    // eventos, e sem o verbo na chave o segundo seria descartado como duplicata.
    idExterno: removido ? `${id}:removido` : id,
    contaExterna: ctx.conta,
    ocorridoEm: instanteDaMeta(
      valor["created_time"] ?? valor["timestamp"] ?? ctx.doEntry,
      ctx.agora,
    ),
    plataforma: ctx.objeto === "instagram" ? "instagram" : "facebook",
    comentarioId: id,
    atorId: textoOpcional(campo(valor, "from.id")),
    atorApelido:
      textoOpcional(campo(valor, "from.username")) ?? textoOpcional(campo(valor, "from.name")),
    midiaId: midia,
    // TRUNCADO NA ENTRADA — §64, minimização. Um comentário é público, mas
    // guardar cinco mil caracteres dele numa tabela operacional não serve a
    // nada que o CRC faça.
    texto: (textoOpcional(valor["text"]) ?? "").slice(0, 2000),
    paiId: textoOpcional(campo(valor, "parent_id")) ?? textoOpcional(campo(valor, "parent.id")),
  };

  return [evento];
}

function daMencao(valor: Record<string, unknown>, ctx: Contexto): EventoComentario[] {
  /*
   * MENÇÃO CHEGA SEM TEXTO, e isso é característica do produto, não defeito.
   *
   * A Meta manda só os ids (`media_id`, `comment_id`) e espera que o app BUSQUE
   * o conteúdo na Graph. Registrar o evento sem o texto é o certo: ele existe,
   * tem atribuição de conteúdo, e o texto pode ser buscado depois por quem
   * precisar — sem bloquear a resposta ao webhook numa chamada de rede.
   */
  const comentario = textoOpcional(valor["comment_id"]);
  const midia = textoOpcional(valor["media_id"]);
  const id = comentario ?? midia;
  if (id === null) return [];

  const evento: EventoComentario = {
    tipo: "instagram.mention.created",
    idExterno: `mencao:${id}`,
    contaExterna: ctx.conta,
    ocorridoEm: ctx.doEntry,
    plataforma: "instagram",
    comentarioId: comentario ?? "",
    atorId: null,
    atorApelido: null,
    midiaId: midia,
    texto: "",
    paiId: null,
  };

  return [evento];
}

function doLead(valor: Record<string, unknown>, ctx: Contexto): EventoLead[] {
  const leadgenId = textoOpcional(valor["leadgen_id"]);
  if (leadgenId === null) return [];

  const adgroup = textoOpcional(valor["adgroup_id"]);

  const evento: EventoLead = {
    tipo: "meta.lead.created",
    idExterno: leadgenId,
    // A CONTA DO LEAD É A PÁGINA, e ela vem no `value` — não só no `entry`. As
    // duas concordam sempre; preferir a do `value` é preferir a mais
    // específica, e ela é a que a documentação do produto cita.
    contaExterna: textoOpcional(valor["page_id"]) ?? ctx.conta,
    ocorridoEm: instanteDaMeta(valor["created_time"] ?? ctx.doEntry, ctx.agora),
    leadgenId,
    formId: textoOpcional(valor["form_id"]),
    pageId: textoOpcional(valor["page_id"]),
    // `ad_id` QUANDO VEM; senão o `adgroup_id`, que a Meta usa como sinônimo
    // por nomenclatura antiga. Ver o comentário em `EventoLead.adgroupId`.
    adId: textoOpcional(valor["ad_id"]) ?? adgroup,
    adgroupId: adgroup,
  };

  return [evento];
}
