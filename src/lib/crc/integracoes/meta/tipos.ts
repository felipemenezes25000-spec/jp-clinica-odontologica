/**
 * Os eventos da Meta, normalizados — §12.
 *
 * ============================================================================
 *  UMA UNIÃO CENTRAL, E NÃO STRINGS SOLTAS.
 *
 *  O §12 pede exatamente isto, e a razão é o que acontece sem: `"comment"` num
 *  arquivo, `"comment.created"` no outro, `"instagram.comment"` no terceiro. O
 *  `switch` que decide o que fazer com o evento passa a ter um ramo morto e um
 *  caso não tratado, e nenhum dos dois dá erro de compilação.
 *
 *  Com a união fechada, um tipo novo quebra a compilação em todo `switch`
 *  exaustivo — que é precisamente onde alguém precisa pensar.
 * ============================================================================
 *
 * ============================================================================
 *  A FRONTEIRA DESTE ARQUIVO, e ela é o desenho inteiro:
 *
 *      payload da Meta  →  [normalizar.ts]  →  EventoMeta  →  aplicação
 *                                              ^^^^^^^^^^
 *                                     o ÚNICO formato que a aplicação vê
 *
 *  Nada de `entry[].changes[].value` chega à camada de aplicação. Isso importa
 *  por dois motivos concretos:
 *
 *    O ENVELOPE GRAVADO NO INBOX é este, e não o payload cru — mesma decisão
 *    de `processarWebhookWhatsapp`, pelo mesmo motivo: o formato normalizado é
 *    raso, estável entre produtos, e é literalmente a entrada da etapa
 *    seguinte. Repetir a etapa é repetir com o MESMO dado, e não com uma
 *    aproximação dele.
 *
 *    O SANDBOX PRODUZ ISTO TAMBÉM. Um teste que monta `EventoMeta` exercita a
 *    aplicação inteira sem precisar reproduzir cinco níveis de aninhamento da
 *    Meta.
 * ============================================================================
 */
import type { CanalConversa } from "../../dominio/canais";

/* -------------------------------------------------------------------------- */
/* O catálogo de tipos                                                        */
/* -------------------------------------------------------------------------- */

export const TIPOS_DE_EVENTO = [
  "instagram.message.received",
  "instagram.message.delivery",
  "instagram.message.read",
  "instagram.comment.created",
  "instagram.comment.deleted",
  "instagram.mention.created",
  "instagram.private_reply.sent",
  "messenger.message.received",
  "messenger.message.delivery",
  "messenger.message.read",
  "meta.lead.created",
] as const;

export type TipoDeEventoMeta = (typeof TIPOS_DE_EVENTO)[number];

export function ehTipoDeEventoMeta(valor: unknown): valor is TipoDeEventoMeta {
  return typeof valor === "string" && (TIPOS_DE_EVENTO as readonly string[]).includes(valor);
}

/* -------------------------------------------------------------------------- */
/* Os eventos                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * O que todo evento carrega.
 *
 * `idExterno` É OBRIGATÓRIO, e é a chave de idempotência do §34. Um evento sem
 * id do provedor não pode ser deduplicado, e o normalizador o DESCARTA em vez
 * de inventar uma chave — uma chave inventada (hash do conteúdo, carimbo)
 * deduplicaria coisas diferentes ou deixaria passar as iguais.
 */
export type BaseDoEvento = {
  tipo: TipoDeEventoMeta;
  /** O id do provedor: `mid` da mensagem, id do comentário, `leadgen_id`. */
  idExterno: string;
  /**
   * A QUEM este evento pertence, na linguagem da Meta.
   *
   * É a chave de roteamento de tenant (§33): `page_id` num webhook de Página,
   * id da conta do Instagram num webhook de Instagram. `resolverTenantDaMeta`
   * o traduz para organização + clínica.
   *
   * SEM ELE, O EVENTO NÃO É PROCESSADO. Ver `resolverTenantDaMeta`: não há
   * "primeira clínica ativa" aqui, e não pode haver.
   */
  contaExterna: string;
  /** Quando ACONTECEU, do lado da Meta. ISO. Ver §49. */
  ocorridoEm: string;
};

/** Uma mensagem recebida por direct ou Messenger. */
export type EventoMensagemRecebida = BaseDoEvento & {
  tipo: "instagram.message.received" | "messenger.message.received";
  canal: Extract<CanalConversa, "instagram" | "messenger">;
  /** IGSID ou PSID de QUEM ESCREVEU. Ver `dominio/canais.ts`. */
  contatoExterno: string;
  /**
   * O texto, ou um marcador honesto do que veio.
   *
   * NUNCA VAZIO — §13. O adapter garante: mídia sem suporte vira
   * "[imagem recebida no Instagram]" e não "". Uma mensagem vazia na Inbox
   * parece defeito de renderização, e a recepção responde no escuro.
   */
  texto: string;
  /** Nome ou username do perfil, quando a Meta manda. É RÓTULO, nunca chave. */
  apelido: string | null;
  /** O que veio junto, quando veio. */
  anexos: readonly AnexoDoEvento[];
  /**
   * O que esta mensagem é uma resposta a, quando a Meta informa.
   *
   * Story mention e reply de story chegam por aqui — a Meta manda o contexto
   * junto com a mensagem, e sem guardá-lo a conversa perde o assunto: a
   * recepção lê "amei!" sem saber amei o quê.
   */
  contexto: ContextoDaMensagem | null;
  /**
   * `true` quando é ECO de uma mensagem que NÓS mandamos.
   *
   * ========================================================================
   *  O ECO EXISTE E PRECISA SER IGNORADO NA ENTRADA.
   *
   *  A Meta reentrega no webhook as mensagens que a própria Página enviou
   *  (`is_echo`), inclusive as enviadas pelo app do celular por uma pessoa da
   *  clínica. Tratá-las como recebidas produziria:
   *
   *    · `nao_lidas + 1` a cada resposta NOSSA;
   *    · a IA respondendo à própria resposta;
   *    · o cálculo de speed-to-lead medindo nós mesmos.
   *
   *  Elas não são descartadas: entram como `SAIDA` quando a mensagem não é
   *  conhecida, e é assim que a Inbox mostra o que a recepção respondeu pelo
   *  celular. O que não fazem é reabrir a janela nem disparar automação.
   * ========================================================================
   */
  eco: boolean;
};

export type AnexoDoEvento = {
  /** `image` | `video` | `audio` | `file` | `share` | `story_mention` | … */
  tipo: string;
  /**
   * A URL temporária que a Meta manda, quando manda.
   *
   * TEMPORÁRIA É LITERAL: o CDN da Meta assina a URL e ela expira. Guardá-la
   * como se fosse permanente produz um anexo que abre hoje e dá 403 na semana
   * que vem — pior que não ter, porque a pessoa acha que perdeu o arquivo.
   * A política de mídia do §47 está em `aplicacao/meta.ts`.
   */
  url: string | null;
  mime: string | null;
};

export type ContextoDaMensagem = {
  /** `reply` | `story_mention` | `story_reply` | `ad` | `post` */
  tipo: string;
  /** O id do que foi referenciado: story, post, anúncio. */
  referencia: string | null;
  /** A URL do conteúdo, quando a Meta manda. Também temporária. */
  url: string | null;
};

/** Um status de entrega ou leitura. */
export type EventoEntrega = BaseDoEvento & {
  tipo:
    | "instagram.message.delivery"
    | "instagram.message.read"
    | "messenger.message.delivery"
    | "messenger.message.read";
  canal: Extract<CanalConversa, "instagram" | "messenger">;
  /** O `mid` da mensagem NOSSA que mudou de status. */
  providerMessageId: string;
  status: "DELIVERED" | "READ";
};

/** Um comentário público. */
export type EventoComentario = BaseDoEvento & {
  tipo: "instagram.comment.created" | "instagram.comment.deleted" | "instagram.mention.created";
  /** `instagram` hoje; `facebook` quando comentários de Página entrarem. */
  plataforma: "instagram" | "facebook";
  /** O id do comentário. Igual a `idExterno` em `comment.created`. */
  comentarioId: string;
  /** Quem comentou. IGSID quando a Meta manda; `null` quando ela não manda. */
  atorId: string | null;
  /** O @username de quem comentou, quando vem. RÓTULO. */
  atorApelido: string | null;
  /** O post/reel comentado. É a chave da atribuição de conteúdo (§19). */
  midiaId: string | null;
  texto: string;
  /**
   * O comentário-pai, quando é resposta a outro comentário.
   *
   * IMPORTA PARA O PRIVATE REPLY: responder em privado a quem respondeu a um
   * comentário nosso é diferente de responder a quem comentou o post. A regra
   * do §43 pode querer só o segundo.
   */
  paiId: string | null;
};

/** Um lead de Instant Form. */
export type EventoLead = BaseDoEvento & {
  tipo: "meta.lead.created";
  /** O `leadgen_id`. É com ele que se BUSCA o lead na Graph (§18). */
  leadgenId: string;
  formId: string | null;
  pageId: string | null;
  adId: string | null;
  /**
   * O `adgroup_id` do webhook.
   *
   * A META CHAMA DE `adgroup_id` E ELE É O ANÚNCIO, não o conjunto. O nome vem
   * de uma nomenclatura antiga da plataforma, e confundi-lo com `adset` faz o
   * relatório creditar a campanha errada. Aqui ele é normalizado para `adId`
   * quando `ad_id` não vem, e o campo fica registrado como veio.
   */
  adgroupId: string | null;
};

export type EventoMeta = EventoMensagemRecebida | EventoEntrega | EventoComentario | EventoLead;

/* -------------------------------------------------------------------------- */
/* O envelope                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Um webhook interpretado.
 *
 * ============================================================================
 *  UM WEBHOOK TRAZ VÁRIOS EVENTOS, E DE PRODUTOS DIFERENTES.
 *
 *  A Meta agrupa por `entry`, e um `entry` pode ter mensagens e mudanças
 *  (`changes`) juntas. Tratar o webhook como "um evento" foi o que fez a versão
 *  antiga de `chaveDoEnvelope` usar "o id da PRIMEIRA mensagem" — e funciona,
 *  mas só porque a dedupe real está por evento.
 *
 *  Aqui o envelope é honesto: uma lista.
 * ============================================================================
 *
 * `contaExterna` no nível do envelope é o que a ROTA confere contra o canal da
 * URL — o mesmo cuidado da rota `/api/crc/whatsapp/$canal`: a assinatura prova
 * que o corpo é autêntico, não que ele é DESTE canal.
 */
export type EnvelopeMeta = {
  /** `instagram` | `page` — o `object` do payload. */
  objeto: string;
  eventos: readonly EventoMeta[];
  /**
   * As contas mencionadas no envelope. Normalmente uma.
   *
   * PLURAL PORQUE A META PODE AGRUPAR. Um app que atende várias Páginas recebe
   * um POST com vários `entry`, e cada `entry.id` é uma Página diferente. Um
   * campo singular forçaria a escolha de um — que é a origem do defeito de
   * tenant que o `supabase/23` matou.
   */
  contas: readonly string[];
  /**
   * Quantos pedaços do payload não foram reconhecidos.
   *
   * ========================================================================
   *  NÃO É ESTATÍSTICA: É ALARME.
   *
   *  A Meta acrescenta campos de webhook sem aviso. Um normalizador que
   *  descarta em silêncio o que não conhece faz a integração degradar sem
   *  ninguém perceber — chega um tipo novo de mensagem, ele é ignorado, e o
   *  paciente fica sem resposta.
   *
   *  Com a contagem, a saúde do §39 pode dizer "42 eventos ignorados nas
   *  últimas 24h" e alguém vai olhar.
   * ========================================================================
   */
  ignorados: number;
};

export const ENVELOPE_VAZIO: EnvelopeMeta = {
  objeto: "",
  eventos: [],
  contas: [],
  ignorados: 0,
};

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

export function ehMensagemRecebida(e: EventoMeta): e is EventoMensagemRecebida {
  return e.tipo === "instagram.message.received" || e.tipo === "messenger.message.received";
}

export function ehEntrega(e: EventoMeta): e is EventoEntrega {
  return (
    e.tipo === "instagram.message.delivery" ||
    e.tipo === "instagram.message.read" ||
    e.tipo === "messenger.message.delivery" ||
    e.tipo === "messenger.message.read"
  );
}

export function ehComentario(e: EventoMeta): e is EventoComentario {
  return (
    e.tipo === "instagram.comment.created" ||
    e.tipo === "instagram.comment.deleted" ||
    e.tipo === "instagram.mention.created"
  );
}

export function ehLead(e: EventoMeta): e is EventoLead {
  return e.tipo === "meta.lead.created";
}
