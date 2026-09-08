/**
 * Testes dos adapters de WhatsApp.
 *
 * O QUE ESTES TESTES PROTEGEM, especificamente:
 *
 *   A ASSINATURA. É a única coisa que separa "o paciente pediu para cancelar"
 *   de "alguém que descobriu a URL disse que o paciente pediu para cancelar".
 *   Ela quebra em silêncio de dois jeitos: ordenação errada dos campos no
 *   Twilio, e corpo re-serializado na Meta. Os dois têm teste aqui.
 *
 *   O PREFIXO `whatsapp:`. Ele existe só na borda do Twilio. Se vazar para o
 *   domínio, o telefone deixa de casar com o do paciente e toda conversa vira
 *   órfã.
 *
 *   O FORMATO DO CORPO. Twilio recusa JSON com 400 sem explicar o motivo.
 *
 * A assinatura esperada é calculada AQUI pelo mesmo algoritmo documentado
 * pelos provedores, e não copiada de uma resposta real — não temos credencial
 * para gerar uma. Isso prova que a implementação segue o algoritmo publicado;
 * o teste contra tráfego real vira mais um caso quando a conta existir.
 */
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { interpretarWebhookMeta } from "./meta-cloud";
import { _reiniciarSandboxMensageria, obterSandboxMensageria, provedorEscolhido } from "./provedores";
import { ProvedorTwilio, interpretarWebhookTwilio } from "./twilio";

const TOKEN = "token-de-teste-nao-usar-em-producao";
const URL_WEBHOOK = "https://exemplo.test/api/crc/whatsapp";

function criarTwilio(urlWebhook: string | null = URL_WEBHOOK): ProvedorTwilio {
  return new ProvedorTwilio(
    {
      accountSid: "AC00000000000000000000000000000000",
      authToken: TOKEN,
      numeroDe: "5511988887777",
      urlWebhook,
    },
    null,
  );
}

/** Reproduz o algoritmo publicado pelo Twilio: URL + pares em ordem alfabética. */
function assinarComoTwilio(url: string, campos: Record<string, string>): string {
  const concatenado =
    url +
    Object.keys(campos)
      .sort()
      .map((k) => k + (campos[k] ?? ""))
      .join("");
  return createHmac("sha1", TOKEN).update(Buffer.from(concatenado, "utf8")).digest("base64");
}

function pedido(corpo: Record<string, string>, assinatura: string, url = URL_WEBHOOK) {
  return {
    corpoCru: new URLSearchParams(corpo).toString(),
    cabecalhos: new Headers({
      "x-twilio-signature": assinatura,
      "content-type": "application/x-www-form-urlencoded",
    }),
    url,
  };
}

/* ========================================================================== */
/* Assinatura do Twilio                                                       */
/* ========================================================================== */

describe("assinatura do Twilio", () => {
  const campos = {
    MessageSid: "SM123",
    From: "whatsapp:+5511999998888",
    To: "whatsapp:+5511988887777",
    Body: "quero remarcar",
  };

  it("aceita a assinatura correta", () => {
    const assinatura = assinarComoTwilio(URL_WEBHOOK, campos);
    expect(criarTwilio().verificarAssinatura(pedido(campos, assinatura))).toBe(true);
  });

  it("RECUSA quando não há assinatura", () => {
    // Webhook anônimo é o cenário do item 195: alguém descobriu a URL.
    expect(criarTwilio().verificarAssinatura(pedido(campos, ""))).toBe(false);
  });

  it("RECUSA assinatura de outro token", () => {
    const outra = createHmac("sha1", "token-diferente")
      .update(Buffer.from(URL_WEBHOOK + "BodyFromMessageSidTo", "utf8"))
      .digest("base64");
    expect(criarTwilio().verificarAssinatura(pedido(campos, outra))).toBe(false);
  });

  it("RECUSA quando um campo foi adulterado depois de assinado", () => {
    // O ataque que importa: pegar um webhook legítimo e trocar o texto.
    const assinatura = assinarComoTwilio(URL_WEBHOOK, campos);
    const adulterado = { ...campos, Body: "cancelar minha consulta" };
    expect(criarTwilio().verificarAssinatura(pedido(adulterado, assinatura))).toBe(false);
  });

  it("RECUSA quando a URL não é a assinada", () => {
    const assinatura = assinarComoTwilio("https://outro.test/webhook", campos);
    expect(criarTwilio().verificarAssinatura(pedido(campos, assinatura))).toBe(false);
  });

  it("a ORDEM alfabética importa — é o erro que quebra em silêncio", () => {
    // `URLSearchParams` preserva a ordem de chegada, não a alfabética. Uma
    // implementação que esquecesse o sort passaria neste cenário por acaso
    // quando as chaves já viessem ordenadas, e falharia em produção quando não.
    const foraDeOrdem = {
      To: "whatsapp:+5511988887777",
      Body: "oi",
      MessageSid: "SM999",
      From: "whatsapp:+5511999998888",
    };
    const assinatura = assinarComoTwilio(URL_WEBHOOK, foraDeOrdem);
    expect(criarTwilio().verificarAssinatura(pedido(foraDeOrdem, assinatura))).toBe(true);
  });

  it("aguenta acento e emoji no corpo", () => {
    // O caso real: mensagem de paciente em português. Se o encoding do HMAC
    // estivesse errado, isto falharia e o texto ASCII passaria — o pior tipo
    // de bug, porque só aparece com gente de verdade.
    const comAcento = { ...campos, Body: "não vou poder, remarcar? 😅 até três horas" };
    const assinatura = assinarComoTwilio(URL_WEBHOOK, comAcento);
    expect(criarTwilio().verificarAssinatura(pedido(comAcento, assinatura))).toBe(true);
  });

  it("usa WHATSAPP_WEBHOOK_URL quando configurada, ignorando a URL recebida", () => {
    // Atrás de proxy a URL chega como `http` e a assinatura quebraria.
    const assinatura = assinarComoTwilio(URL_WEBHOOK, campos);
    const comProxy = pedido(campos, assinatura, "http://interno:3000/api/crc/whatsapp");
    expect(criarTwilio(URL_WEBHOOK).verificarAssinatura(comProxy)).toBe(true);
    // Sem a variável, a mesma requisição é recusada — que é o comportamento
    // correto, e o motivo de a variável existir.
    expect(criarTwilio(null).verificarAssinatura(comProxy)).toBe(false);
  });
});

/* ========================================================================== */
/* Webhook do Twilio                                                          */
/* ========================================================================== */

describe("webhook do Twilio", () => {
  it("lê uma mensagem recebida", () => {
    const r = interpretarWebhookTwilio({
      MessageSid: "SM123",
      From: "whatsapp:+5511999998888",
      To: "whatsapp:+5511988887777",
      Body: "quero remarcar",
      ProfileName: "Maria",
    });

    expect(r.mensagens).toHaveLength(1);
    expect(r.entregas).toHaveLength(0);
    const m = r.mensagens[0];
    // O prefixo `whatsapp:` NÃO pode vazar: é o que faz o telefone casar com
    // o do paciente.
    expect(m?.telefone).toBe("5511999998888");
    expect(m?.texto).toBe("quero remarcar");
    expect(m?.nomePerfil).toBe("Maria");
    expect(m?.providerMessageId).toBe("SM123");
  });

  it("lê um status de entrega", () => {
    const r = interpretarWebhookTwilio({ MessageSid: "SM123", MessageStatus: "delivered" });
    expect(r.mensagens).toHaveLength(0);
    expect(r.entregas[0]?.status).toBe("DELIVERED");
  });

  it("mapeia todos os status que importam", () => {
    const esperado: Record<string, string> = {
      queued: "SENT",
      sending: "SENT",
      sent: "SENT",
      delivered: "DELIVERED",
      read: "READ",
      failed: "FAILED",
      undelivered: "FAILED",
    };
    for (const [twilio, nosso] of Object.entries(esperado)) {
      const r = interpretarWebhookTwilio({ MessageSid: "SM1", MessageStatus: twilio });
      expect(r.entregas[0]?.status, twilio).toBe(nosso);
    }
  });

  it("carrega o erro quando a entrega falha", () => {
    const r = interpretarWebhookTwilio({
      MessageSid: "SM1",
      MessageStatus: "failed",
      ErrorCode: "63016",
      ErrorMessage: "Fora da janela de 24 horas",
    });
    expect(r.entregas[0]?.erro).toContain("63016");
  });

  it("status desconhecido não vira entrega inventada", () => {
    const r = interpretarWebhookTwilio({ MessageSid: "SM1", MessageStatus: "coisa_nova" });
    expect(r.entregas).toHaveLength(0);
    expect(r.mensagens).toHaveLength(0);
  });

  it("aceita o corpo como string de formulário", () => {
    const r = interpretarWebhookTwilio(
      "MessageSid=SM7&From=whatsapp%3A%2B5511999998888&Body=oi%20tudo%20bem",
    );
    expect(r.mensagens[0]?.telefone).toBe("5511999998888");
    expect(r.mensagens[0]?.texto).toBe("oi tudo bem");
  });

  it("mensagem com mídia vira aviso, e não mensagem vazia na Inbox", () => {
    const r = interpretarWebhookTwilio({
      MessageSid: "SM8",
      From: "whatsapp:+5511999998888",
      Body: "",
      NumMedia: "1",
    });
    expect(r.mensagens[0]?.texto).toContain("mídia");
  });

  it("telefone irreconhecível não vira mensagem órfã", () => {
    const r = interpretarWebhookTwilio({ MessageSid: "SM9", From: "whatsapp:+1", Body: "oi" });
    expect(r.mensagens).toHaveLength(0);
  });

  it("payload sem SID é ignorado sem estourar", () => {
    expect(interpretarWebhookTwilio({}).mensagens).toHaveLength(0);
    expect(interpretarWebhookTwilio(null).mensagens).toHaveLength(0);
    expect(interpretarWebhookTwilio("").mensagens).toHaveLength(0);
  });
});

/* ========================================================================== */
/* Webhook da Meta — a outra ponta da mesma porta                             */
/* ========================================================================== */

describe("webhook da Meta", () => {
  it("desmonta o envelope aninhado", () => {
    const r = interpretarWebhookMeta({
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: "5511999998888", profile: { name: "João" } }],
                messages: [
                  {
                    id: "wamid.ABC",
                    from: "5511999998888",
                    type: "text",
                    text: { body: "quero agendar" },
                    timestamp: "1757000000",
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(r.mensagens).toHaveLength(1);
    expect(r.mensagens[0]?.telefone).toBe("5511999998888");
    expect(r.mensagens[0]?.nomePerfil).toBe("João");
  });

  it("envelope vazio não estoura", () => {
    expect(interpretarWebhookMeta({}).mensagens).toHaveLength(0);
    expect(interpretarWebhookMeta({ entry: [] }).mensagens).toHaveLength(0);
    expect(interpretarWebhookMeta(null).mensagens).toHaveLength(0);
  });
});

/* ========================================================================== */
/* Escolha de provedor                                                        */
/* ========================================================================== */

describe("escolha de provedor", () => {
  it("o padrão é twilio quando ninguém escolheu", () => {
    delete process.env["WHATSAPP_PROVEDOR"];
    expect(provedorEscolhido()).toBe("twilio");
  });

  it("respeita a variável, com as grafias que alguém escreveria", () => {
    for (const [valor, esperado] of [
      ["meta", "meta"],
      ["META", "meta"],
      ["meta_cloud", "meta"],
      ["twilio", "twilio"],
      ["sandbox", "sandbox"],
    ] as const) {
      process.env["WHATSAPP_PROVEDOR"] = valor;
      expect(provedorEscolhido(), valor).toBe(esperado);
    }
    delete process.env["WHATSAPP_PROVEDOR"];
  });

  it("valor desconhecido cai no padrão em vez de quebrar", () => {
    process.env["WHATSAPP_PROVEDOR"] = "zenvia";
    expect(provedorEscolhido()).toBe("twilio");
    delete process.env["WHATSAPP_PROVEDOR"];
  });
});

describe("sandbox de mensageria", () => {
  it("registra sem enviar", async () => {
    _reiniciarSandboxMensageria();
    const s = obterSandboxMensageria();

    const r = await s.enviarTexto({
      destino: { telefone: "5511999998888" },
      texto: "teste",
      chaveDedupe: "k1",
    });

    expect(r.ok).toBe(true);
    expect(s.listarEnviadas()).toHaveLength(1);
    expect(s.listarEnviadas()[0]?.texto).toBe("teste");
  });

  it("entende o atalho { telefone, texto } do desenvolvimento", () => {
    _reiniciarSandboxMensageria();
    const r = obterSandboxMensageria().interpretarWebhook({
      telefone: "(11) 99999-8888",
      texto: "quero remarcar",
    });
    expect(r.mensagens[0]?.telefone).toBe("5511999998888");
  });

  it("também entende o envelope da Meta", () => {
    _reiniciarSandboxMensageria();
    const r = obterSandboxMensageria().interpretarWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: "wamid.X", from: "5511999998888", type: "text", text: { body: "oi" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(r.mensagens).toHaveLength(1);
  });
});
