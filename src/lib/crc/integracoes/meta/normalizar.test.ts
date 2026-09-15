/**
 * O normalizador do envelope da Meta — §11, §12, §52.
 *
 * ============================================================================
 *  O DEFEITO CENTRAL QUE ESTES TESTES TRAVAM É SILENCIOSO.
 *
 *  A Meta usa DUAS formas no mesmo POST:
 *
 *      MENSAGEM     entry[].messaging[]    ← estilo Messenger Platform
 *      COMENTÁRIO   entry[].changes[]      ← estilo Webhooks de campo
 *      LEAD         entry[].changes[]      ← idem, campo `leadgen`
 *
 *  Um normalizador escrito só contra `changes[]` — que é o formato do WhatsApp,
 *  e o primeiro que se aprende — recebe todo direct do Instagram e não encontra
 *  nada dentro. Sem erro: `changes` não existe, o laço não roda, o envelope sai
 *  vazio, e o CRC responde 200.
 *
 *  A mensagem do paciente some. A Meta considera entregue.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import { instanteDaMeta, interpretarWebhookMeta } from "./normalizar";
import { ehComentario, ehEntrega, ehLead, ehMensagemRecebida } from "./tipos";

const IGID = "17841400000000099";
const IGSID = "17841400000000001";
const PAGE = "104000000000001";
const AGORA = new Date("2026-09-15T12:00:00.000Z");

/* -------------------------------------------------------------------------- */
/* O relógio                                                                  */
/* -------------------------------------------------------------------------- */

describe("o carimbo da Meta mistura segundos e milissegundos", () => {
  it("segundos (10 dígitos) viram a data certa", () => {
    expect(instanteDaMeta(1_789_000_000, AGORA)).toBe("2026-09-10T00:26:40.000Z");
  });

  it("milissegundos (13 dígitos) viram a MESMA data", () => {
    /*
     * UM FATOR DE 1000 É O DEFEITO. Milissegundo lido como segundo dá o ano
     * 56.000; segundo lido como milissegundo dá 1970 — e os dois passam pelo
     * `new Date()` sem reclamar.
     *
     * O efeito na Inbox: uma mensagem de 1970 no topo da lista para sempre, ou
     * uma janela de 24 horas que nunca fecha.
     */
    expect(instanteDaMeta(1_789_000_000_000, AGORA)).toBe("2026-09-10T00:26:40.000Z");
  });

  it("string numérica também", () => {
    expect(instanteDaMeta("1789000000", AGORA)).toBe("2026-09-10T00:26:40.000Z");
  });

  it("ISO da Graph API passa direto", () => {
    expect(instanteDaMeta("2026-09-10T08:30:00+0000", AGORA)).toBe("2026-09-10T08:30:00.000Z");
  });

  it("lixo cai no agora, e não em 1970", () => {
    expect(instanteDaMeta(null, AGORA)).toBe(AGORA.toISOString());
    expect(instanteDaMeta("abc", AGORA)).toBe(AGORA.toISOString());
    expect(instanteDaMeta(0, AGORA)).toBe(AGORA.toISOString());
    expect(instanteDaMeta(-5, AGORA)).toBe(AGORA.toISOString());
  });
});

/* -------------------------------------------------------------------------- */
/* Instagram Direct — o formato `messaging[]`                                 */
/* -------------------------------------------------------------------------- */

const DIRECT = {
  object: "instagram",
  entry: [
    {
      id: IGID,
      time: 1_789_000_000,
      messaging: [
        {
          sender: { id: IGSID },
          recipient: { id: IGID },
          timestamp: 1_789_000_000_000,
          message: { mid: "mid.abc123", text: "quanto custa um implante?" },
        },
      ],
    },
  ],
};

describe("Instagram Direct — `messaging[]`, e não `changes[]`", () => {
  it("encontra a mensagem", () => {
    const e = interpretarWebhookMeta(DIRECT, AGORA);
    expect(e.eventos).toHaveLength(1);
    expect(e.ignorados).toBe(0);

    const m = e.eventos[0]!;
    expect(ehMensagemRecebida(m)).toBe(true);
    if (!ehMensagemRecebida(m)) return;

    expect(m.tipo).toBe("instagram.message.received");
    expect(m.canal).toBe("instagram");
    expect(m.idExterno).toBe("mid.abc123");
    expect(m.texto).toBe("quanto custa um implante?");
    expect(m.eco).toBe(false);
  });

  it("o CONTATO é quem escreveu, e a CONTA é a clínica", () => {
    /*
     * A conversa é única por `(organização, canal, contato_externo)`, e o
     * contato é SEMPRE a pessoa. Trocar os dois faria cada conversa nascer com
     * a própria conta da clínica como "contato".
     */
    const m = interpretarWebhookMeta(DIRECT, AGORA).eventos[0]!;
    if (!ehMensagemRecebida(m)) throw new Error("esperava mensagem");
    expect(m.contatoExterno).toBe(IGSID);
    expect(m.contaExterna).toBe(IGID);
  });

  it("a conta vai para `contas`, que é o que a rota confere", () => {
    expect(interpretarWebhookMeta(DIRECT, AGORA).contas).toEqual([IGID]);
  });

  it("mensagem SEM `mid` é descartada", () => {
    /*
     * SEM `mid` NÃO HÁ IDEMPOTÊNCIA — §34. Inventar uma chave (hash do texto +
     * carimbo) deduplicaria duas mensagens idênticas legítimas — "sim" e "sim"
     * no mesmo segundo — e deixaria passar reentregas com carimbo diferente.
     */
    const sem = {
      ...DIRECT,
      entry: [
        {
          ...DIRECT.entry[0],
          messaging: [{ sender: { id: IGSID }, recipient: { id: IGID }, message: { text: "oi" } }],
        },
      ],
    };
    const e = interpretarWebhookMeta(sem, AGORA);
    expect(e.eventos).toHaveLength(0);
    // E É CONTADO. Descarte silencioso é como a integração degrada sem ninguém
    // perceber.
    expect(e.ignorados).toBe(1);
  });
});

describe("o ECO — a mensagem que NÓS mandamos, devolvida", () => {
  const eco = {
    object: "instagram",
    entry: [
      {
        id: IGID,
        time: 1_789_000_000,
        messaging: [
          {
            sender: { id: IGID },
            recipient: { id: IGSID },
            timestamp: 1_789_000_000_000,
            message: { mid: "mid.eco", text: "Bom dia! Como podemos ajudar?", is_echo: true },
          },
        ],
      },
    ],
  };

  it("é marcada como eco", () => {
    const m = interpretarWebhookMeta(eco, AGORA).eventos[0]!;
    if (!ehMensagemRecebida(m)) throw new Error("esperava mensagem");
    expect(m.eco).toBe(true);
  });

  it("o CONTATO é invertido: a pessoa é o `recipient`", () => {
    /*
     * ==========================================================================
     *  SEM ESTA INVERSÃO, cada resposta enviada pelo celular criaria uma
     *  conversa cujo "contato" é a própria conta da clínica.
     * ==========================================================================
     */
    const m = interpretarWebhookMeta(eco, AGORA).eventos[0]!;
    if (!ehMensagemRecebida(m)) throw new Error("esperava mensagem");
    expect(m.contatoExterno).toBe(IGSID);
    expect(m.contaExterna).toBe(IGID);
  });
});

/* -------------------------------------------------------------------------- */
/* Entrega e leitura                                                          */
/* -------------------------------------------------------------------------- */

describe("entrega e leitura da MESMA mensagem são dois eventos", () => {
  const statuses = {
    object: "page",
    entry: [
      {
        id: PAGE,
        time: 1_789_000_000,
        messaging: [
          {
            sender: { id: "psid-1" },
            recipient: { id: PAGE },
            timestamp: 1_789_000_000_000,
            delivery: { mids: ["m.1", "m.2"], watermark: 1_789_000_000_000 },
          },
          {
            sender: { id: "psid-1" },
            recipient: { id: PAGE },
            timestamp: 1_789_000_001_000,
            read: { mids: ["m.1"], watermark: 1_789_000_001_000 },
          },
        ],
      },
    ],
  };

  it("uma entrega com DOIS mids produz DOIS eventos", () => {
    /*
     * A Meta agrupa: um `delivery` pode confirmar cinco mensagens. Ler só o
     * primeiro deixaria as outras paradas em `SENT` para sempre — e a Inbox
     * mostraria "enviando" numa mensagem que o paciente já leu.
     */
    const e = interpretarWebhookMeta(statuses, AGORA);
    const entregas = e.eventos.filter(ehEntrega);
    expect(entregas.filter((x) => x.status === "DELIVERED")).toHaveLength(2);
  });

  it("o STATUS entra na chave de dedupe", () => {
    /*
     * Sem ele, o webhook de leitura seria descartado como duplicata do de
     * entrega — e a mensagem ficaria "entregue" para sempre, mesmo lida.
     */
    const e = interpretarWebhookMeta(statuses, AGORA);
    const doMesmoMid = e.eventos.filter(ehEntrega).filter((x) => x.providerMessageId === "m.1");
    const chaves = new Set(doMesmoMid.map((x) => x.idExterno));
    expect(doMesmoMid).toHaveLength(2);
    expect(chaves.size).toBe(2);
  });

  it("o canal do Messenger sai do `object: page`", () => {
    const e = interpretarWebhookMeta(statuses, AGORA);
    expect(e.eventos.filter(ehEntrega).every((x) => x.canal === "messenger")).toBe(true);
  });

  it("`watermark` sem `mids` é contado como ignorado, e não aplicado", () => {
    /*
     * ELE DIZ "tudo até este instante foi lido", sem listar as mensagens.
     * Aplicá-lo exigiria um UPDATE em massa disparado por webhook — trabalho
     * que não pode acontecer no caminho de resposta rápida.
     *
     * Ser CONTADO é o que torna a imprecisão visível na saúde, em vez de a
     * ausência passar por completude.
     */
    const so = {
      object: "page",
      entry: [
        {
          id: PAGE,
          messaging: [{ sender: { id: "p" }, recipient: { id: PAGE }, read: { watermark: 1 } }],
        },
      ],
    };
    const e = interpretarWebhookMeta(so, AGORA);
    expect(e.eventos).toHaveLength(0);
    expect(e.ignorados).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Comentários — o formato `changes[]`                                        */
/* -------------------------------------------------------------------------- */

describe("comentário — `changes[]`, no mesmo `object: instagram`", () => {
  const comentario = {
    object: "instagram",
    entry: [
      {
        id: IGID,
        time: 1_789_000_000,
        changes: [
          {
            field: "comments",
            value: {
              id: "comment-1",
              text: "IMPLANTE",
              from: { id: IGSID, username: "joao_ig" },
              media: { id: "media-1" },
              created_time: 1_789_000_000,
            },
          },
        ],
      },
    ],
  };

  it("é reconhecido com ator, mídia e texto", () => {
    const e = interpretarWebhookMeta(comentario, AGORA);
    const c = e.eventos[0]!;
    expect(ehComentario(c)).toBe(true);
    if (!ehComentario(c)) return;

    expect(c.tipo).toBe("instagram.comment.created");
    expect(c.comentarioId).toBe("comment-1");
    expect(c.atorId).toBe(IGSID);
    expect(c.atorApelido).toBe("joao_ig");
    expect(c.midiaId).toBe("media-1");
    expect(c.texto).toBe("IMPLANTE");
  });

  it("MENSAGEM E COMENTÁRIO no mesmo POST são os dois lidos", () => {
    /*
     * É O TESTE QUE PROVA OS DOIS LAÇOS. Um normalizador com só um deles
     * perderia metade do envelope — em silêncio.
     */
    const junto = {
      object: "instagram",
      entry: [
        {
          id: IGID,
          time: 1_789_000_000,
          messaging: DIRECT.entry[0]!.messaging,
          changes: comentario.entry[0]!.changes,
        },
      ],
    };
    const e = interpretarWebhookMeta(junto, AGORA);
    expect(e.eventos.filter(ehMensagemRecebida)).toHaveLength(1);
    expect(e.eventos.filter(ehComentario)).toHaveLength(1);
    expect(e.ignorados).toBe(0);
  });

  it("comentário APAGADO tem chave própria", () => {
    /*
     * Criar e apagar o mesmo comentário são dois eventos. Sem o verbo na
     * chave, o segundo seria descartado como duplicata do primeiro — e o CRC
     * continuaria achando que o comentário existe.
     */
    const apagado = {
      ...comentario,
      entry: [
        {
          ...comentario.entry[0],
          changes: [{ field: "comments", value: { id: "comment-1", verb: "remove", text: "" } }],
        },
      ],
    };
    const c = interpretarWebhookMeta(apagado, AGORA).eventos[0]!;
    if (!ehComentario(c)) throw new Error("esperava comentário");
    expect(c.tipo).toBe("instagram.comment.deleted");
    expect(c.idExterno).not.toBe("comment-1");
  });

  it("a AUSÊNCIA de `verb` significa criação", () => {
    /*
     * Tratar a ausência como remoção faria o CRC ignorar TODO comentário —
     * porque o webhook do Instagram normalmente não manda `verb`.
     */
    const c = interpretarWebhookMeta(comentario, AGORA).eventos[0]!;
    if (!ehComentario(c)) throw new Error("esperava comentário");
    expect(c.tipo).toBe("instagram.comment.created");
  });

  it("o texto é truncado na entrada — §64", () => {
    const longo = {
      ...comentario,
      entry: [
        {
          ...comentario.entry[0],
          changes: [
            { field: "comments", value: { id: "c", text: "x".repeat(5000), from: { id: "a" } } },
          ],
        },
      ],
    };
    const c = interpretarWebhookMeta(longo, AGORA).eventos[0]!;
    if (!ehComentario(c)) throw new Error("esperava comentário");
    expect(c.texto.length).toBe(2000);
  });
});

/* -------------------------------------------------------------------------- */
/* Lead Ads                                                                   */
/* -------------------------------------------------------------------------- */

describe("Lead Ads — `changes[]` com `field: leadgen`", () => {
  const lead = {
    object: "page",
    entry: [
      {
        id: PAGE,
        time: 1_789_000_000,
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: "lead-777",
              page_id: PAGE,
              form_id: "form-1",
              adgroup_id: "ad-9",
              created_time: 1_789_000_000,
            },
          },
        ],
      },
    ],
  };

  it("traz o `leadgen_id`, que é com o que se BUSCA o lead", () => {
    const l = interpretarWebhookMeta(lead, AGORA).eventos[0]!;
    expect(ehLead(l)).toBe(true);
    if (!ehLead(l)) return;

    expect(l.leadgenId).toBe("lead-777");
    expect(l.idExterno).toBe("lead-777");
    expect(l.formId).toBe("form-1");
  });

  it("`adgroup_id` é o ANÚNCIO, e é normalizado para `adId`", () => {
    /*
     * A META CHAMA DE `adgroup_id` E ELE É O ANÚNCIO, por nomenclatura antiga
     * da plataforma. Confundi-lo com `adset` faz o relatório creditar a
     * campanha errada.
     */
    const l = interpretarWebhookMeta(lead, AGORA).eventos[0]!;
    if (!ehLead(l)) throw new Error("esperava lead");
    expect(l.adId).toBe("ad-9");
    expect(l.adgroupId).toBe("ad-9");
  });

  it("`ad_id` explícito vence o `adgroup_id`", () => {
    const comAd = {
      ...lead,
      entry: [
        {
          ...lead.entry[0],
          changes: [
            {
              field: "leadgen",
              value: { leadgen_id: "l", adgroup_id: "grupo", ad_id: "anuncio" },
            },
          ],
        },
      ],
    };
    const l = interpretarWebhookMeta(comAd, AGORA).eventos[0]!;
    if (!ehLead(l)) throw new Error("esperava lead");
    expect(l.adId).toBe("anuncio");
  });

  it("a conta do lead é a PÁGINA", () => {
    const l = interpretarWebhookMeta(lead, AGORA).eventos[0]!;
    if (!ehLead(l)) throw new Error("esperava lead");
    expect(l.contaExterna).toBe(PAGE);
  });

  it("sem `leadgen_id` não há evento", () => {
    const sem = {
      object: "page",
      entry: [{ id: PAGE, changes: [{ field: "leadgen", value: { page_id: PAGE } }] }],
    };
    const e = interpretarWebhookMeta(sem, AGORA);
    expect(e.eventos).toHaveLength(0);
    expect(e.ignorados).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* O que é ignorado, e por quê                                                */
/* -------------------------------------------------------------------------- */

describe("o normalizador NUNCA lança, e conta o que ignorou", () => {
  it("payload que não é objeto", () => {
    const e = interpretarWebhookMeta("isto não é um webhook", AGORA);
    expect(e.eventos).toHaveLength(0);
    expect(e.ignorados).toBe(1);
  });

  it("envelope sem `entry` — a Meta manda isso em mudança de configuração", () => {
    const e = interpretarWebhookMeta({ object: "instagram" }, AGORA);
    expect(e.eventos).toHaveLength(0);
    expect(e.ignorados).toBe(1);
  });

  it("campo de `changes` desconhecido é contado", () => {
    const e = interpretarWebhookMeta(
      {
        object: "instagram",
        entry: [{ id: IGID, changes: [{ field: "story_insights", value: {} }] }],
      },
      AGORA,
    );
    expect(e.eventos).toHaveLength(0);
    expect(e.ignorados).toBe(1);
  });

  it("`messages` dentro de `changes` NÃO é processado — é WhatsApp", () => {
    /*
     * ==========================================================================
     *  ACEITÁ-LO AQUI CRIARIA UM SEGUNDO CAMINHO DE ENTRADA PARA O WHATSAPP.
     *
     *  E dois caminhos para o mesmo canal divergem: um aplica a janela de 24h e
     *  o outro não. WhatsApp tem porta própria, com template e roteamento por
     *  `phone_number_id`.
     *
     *  Cai em `ignorados`, e a saúde mostra — se aparecer, é sinal de que
     *  alguém apontou o webhook de WhatsApp para a URL da Meta.
     * ==========================================================================
     */
    const e = interpretarWebhookMeta(
      {
        object: "whatsapp_business_account",
        entry: [
          { id: "conta", changes: [{ field: "messages", value: { messages: [{ id: "x" }] } }] },
        ],
      },
      AGORA,
    );
    expect(e.eventos).toHaveLength(0);
    expect(e.ignorados).toBe(1);
  });

  it("`standby` é contado e NÃO processado", () => {
    /*
     * Ele chega quando OUTRO app é o receptor primário no Handover Protocol.
     * Responder por cima é o mesmo defeito de dois atendentes respondendo
     * juntos, com um app no lugar de uma pessoa.
     */
    const e = interpretarWebhookMeta(
      {
        object: "instagram",
        entry: [
          {
            id: IGID,
            standby: [
              { sender: { id: IGSID }, recipient: { id: IGID }, message: { mid: "m", text: "oi" } },
            ],
          },
        ],
      },
      AGORA,
    );
    expect(e.eventos).toHaveLength(0);
    expect(e.ignorados).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Mídia e contexto — §13                                                     */
/* -------------------------------------------------------------------------- */

describe("mensagem sem texto NUNCA vira bolha vazia — §13", () => {
  function comMensagem(message: unknown) {
    return interpretarWebhookMeta(
      {
        object: "instagram",
        entry: [
          {
            id: IGID,
            messaging: [{ sender: { id: IGSID }, recipient: { id: IGID }, message }],
          },
        ],
      },
      AGORA,
    ).eventos[0];
  }

  it("imagem vira marcador que diz o que veio e onde abrir", () => {
    const m = comMensagem({
      mid: "m1",
      attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }],
    });
    if (m === undefined || !ehMensagemRecebida(m)) throw new Error("esperava mensagem");
    expect(m.texto).toContain("imagem");
    expect(m.texto).toContain("Instagram");
    expect(m.texto.length).toBeGreaterThan(0);
    expect(m.anexos[0]?.url).toBe("https://cdn/x.jpg");
  });

  it("dois anexos dizem quantos", () => {
    const m = comMensagem({
      mid: "m2",
      attachments: [{ type: "image" }, { type: "video" }],
    });
    if (m === undefined || !ehMensagemRecebida(m)) throw new Error("esperava mensagem");
    expect(m.texto).toContain("mais 1");
  });

  it("story mention com legenda MARCA o contexto", () => {
    /*
     * Sem a marca, a recepção lê "amei!" sem saber amei o quê — a conversa
     * perde o assunto.
     */
    const m = comMensagem({
      mid: "m3",
      text: "amei!",
      attachments: [{ type: "story_mention", payload: { url: "https://cdn/story" } }],
    });
    if (m === undefined || !ehMensagemRecebida(m)) throw new Error("esperava mensagem");
    expect(m.texto).toContain("menção em story");
    expect(m.texto).toContain("amei!");
    expect(m.contexto?.tipo).toBe("story_mention");
  });

  it("reação diz qual emoji", () => {
    const m = comMensagem({ mid: "m4", reaction: { emoji: "❤️", action: "react" } });
    if (m === undefined || !ehMensagemRecebida(m)) throw new Error("esperava mensagem");
    expect(m.texto).toContain("reação");
  });

  it("mensagem apagada diz isso", () => {
    const m = comMensagem({ mid: "m5", is_deleted: true });
    if (m === undefined || !ehMensagemRecebida(m)) throw new Error("esperava mensagem");
    expect(m.texto).toContain("apagada");
  });

  it("nada reconhecível ainda produz texto — nunca vazio", () => {
    const m = comMensagem({ mid: "m6" });
    if (m === undefined || !ehMensagemRecebida(m)) throw new Error("esperava mensagem");
    expect(m.texto.trim().length).toBeGreaterThan(0);
  });

  it("o clique em anúncio (`referral`) preserva a atribuição — §19", () => {
    const m = comMensagem({ mid: "m7", text: "oi", referral: { ad_id: "ad-42", ref: "campanha" } });
    if (m === undefined || !ehMensagemRecebida(m)) throw new Error("esperava mensagem");
    expect(m.contexto?.tipo).toBe("ad");
    expect(m.contexto?.referencia).toBe("ad-42");
  });
});

/* -------------------------------------------------------------------------- */
/* Multi-tenant — §33                                                         */
/* -------------------------------------------------------------------------- */

describe("duas contas no mesmo POST aparecem as DUAS em `contas`", () => {
  it("nenhuma é escolhida pelo normalizador", () => {
    /*
     * ==========================================================================
     *  UM CAMPO SINGULAR FORÇARIA A ESCOLHA DE UMA — e é exatamente a origem do
     *  defeito de tenant que o `supabase/23` matou.
     *
     *  Quem decide o que fazer com duas contas é `resolverEscopoDaMeta`, e a
     *  decisão dele é RECUSAR quando elas são de tenants diferentes.
     * ==========================================================================
     */
    const e = interpretarWebhookMeta(
      {
        object: "page",
        entry: [
          { id: "pagina-a", messaging: [] },
          { id: "pagina-b", messaging: [] },
        ],
      },
      AGORA,
    );
    expect([...e.contas].sort()).toEqual(["pagina-a", "pagina-b"]);
  });
});
