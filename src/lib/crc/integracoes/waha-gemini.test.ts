/**
 * WAHA e Gemini — Fase F, itens 23 e 25.
 *
 * O QUE MERECE TESTE NESTES DOIS ADAPTERS não é "monta o JSON certo": é o que
 * eles fazem DIFERENTE dos que já existiam, porque é aí que a surpresa mora.
 *
 *   WAHA: o webhook devolve as mensagens que NÓS mandamos, com `fromMe: true`.
 *   Tratar uma delas como recebida faria o agente responder à própria
 *   mensagem, num laço que só para quando alguém percebe.
 *
 *   GEMINI: o schema precisa ser TRADUZIDO. Mandar JSON Schema puro faz a
 *   chamada falhar com 400 sem dizer qual campo — e o sintoma vira "o Gemini
 *   não funciona", quando o que não funciona é o formato.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { paraSchemaDoGemini, precoDoModeloGemini } from "./ia/gemini";
import { interpretarWebhookWaha, ProvedorWaha } from "./whatsapp/waha";
import { criarProvedorMensageria, provedorEscolhido } from "./whatsapp/provedores";

const AMBIENTE = { ...process.env };

beforeEach(() => {
  process.env = { ...AMBIENTE };
  delete process.env["WHATSAPP_PROVEDOR"];
  delete process.env["WAHA_EU_ACEITO_O_RISCO"];
  delete process.env["WAHA_URL"];
  delete process.env["WAHA_API_KEY"];
  delete process.env["NODE_ENV"];
});

/* ========================================================================== */
/* WAHA — o canal não oficial                                                 */
/* ========================================================================== */

describe("a trava dupla do WAHA", () => {
  it("escolher waha sem aceitar o risco NÃO configura o provedor", async () => {
    process.env["WHATSAPP_PROVEDOR"] = "waha";
    process.env["WAHA_URL"] = "https://waha.clinica.com.br";
    process.env["WAHA_API_KEY"] = "segredo";

    const estado = await criarProvedorMensageria(null);

    expect(provedorEscolhido()).toBe("waha");
    expect(estado.configurado).toBe(false);
    if (estado.configurado) return;

    /*
     * DUAS VARIÁVEIS PARA A MESMA ESCOLHA É ATRITO DE PROPÓSITO.
     *
     * O WAHA automatiza o WhatsApp Web com o número da clínica, o que viola os
     * termos de uso. O número pode ser banido — e quando é, some junto todo o
     * histórico daquele WhatsApp Business: meses de conversa com cada paciente,
     * sem recurso.
     *
     * Uma variável só seria fácil demais de copiar de um tutorial.
     */
    expect(estado.motivo).toContain("banido");
    expect(estado.faltando).toContain("WAHA_EU_ACEITO_O_RISCO");
  });

  it("com o risco aceito e tudo configurado, sobe", async () => {
    process.env["WHATSAPP_PROVEDOR"] = "waha";
    process.env["WAHA_EU_ACEITO_O_RISCO"] = "1";
    process.env["WAHA_URL"] = "https://waha.clinica.com.br";
    process.env["WAHA_API_KEY"] = "segredo";

    const estado = await criarProvedorMensageria(null);

    expect(estado.configurado).toBe(true);
    if (!estado.configurado) return;
    expect(estado.porta.nome).toBe("waha");
    // A janela de 24h é regra da Meta, e este canal não passa por ela. NÃO é
    // vantagem: some a proteção que impedia mandar mensagem para quem não
    // escreve há uma semana, e a política de contato fica sozinha.
    expect(estado.porta.exigeTemplateForaDaJanela).toBe(false);
  });

  it("a chave de API é OBRIGATÓRIA, ao contrário do WAHA original", async () => {
    process.env["WHATSAPP_PROVEDOR"] = "waha";
    process.env["WAHA_EU_ACEITO_O_RISCO"] = "1";
    process.env["WAHA_URL"] = "https://waha.clinica.com.br";

    const estado = await criarProvedorMensageria(null);

    // Sem chave, `verificarAssinatura` recusaria todo webhook. Um canal que
    // recebe mensagem e não consegue provar a origem é pior do que desligado:
    // a automação obedeceria a qualquer um que descobrisse a URL.
    expect(estado.configurado).toBe(false);
    if (estado.configurado) return;
    expect(estado.faltando).toContain("WAHA_API_KEY");
  });
});

describe("o webhook do WAHA", () => {
  const porta = new ProvedorWaha(
    { url: "https://waha.teste", apiKey: "chave-secreta", sessao: "default" },
    null,
  );

  it("IGNORA a mensagem que nós mesmos mandamos", () => {
    /*
     * O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
     *
     * WAHA espelha o WhatsApp Web, e lá aparece TUDO — inclusive o que a
     * clínica enviou. Tratar uma dessas como recebida faria o agente ler a
     * própria resposta como se fosse do paciente e responder de novo. E de
     * novo. O laço só para quando alguém olha a conversa.
     *
     * Nenhum webhook oficial tem esse comportamento, então a armadilha é
     * específica deste canal.
     */
    const r = interpretarWebhookWaha({
      event: "message",
      payload: {
        fromMe: true,
        from: "5511999998888@c.us",
        body: "Oi! Como posso ajudar?",
        id: "msg-nossa",
      },
    });

    expect(r.mensagens).toEqual([]);
  });

  it("aceita a mensagem do paciente", () => {
    const r = interpretarWebhookWaha({
      event: "message",
      payload: {
        fromMe: false,
        from: "5511999998888@c.us",
        body: "Oi, consigo remarcar?",
        id: "msg-1",
        timestamp: 1_789_000_000,
        _data: { notifyName: "Maria" },
      },
    });

    expect(r.mensagens).toHaveLength(1);
    expect(r.mensagens[0]).toMatchObject({
      telefone: "5511999998888",
      texto: "Oi, consigo remarcar?",
      nomePerfil: "Maria",
    });
  });

  it("descarta mensagem de GRUPO", () => {
    // `@g.us` é grupo. O CRC fala com paciente; responder num grupo exporia a
    // conversa de uma pessoa para todo mundo que estiver nele.
    const r = interpretarWebhookWaha({
      event: "message",
      payload: { fromMe: false, from: "1234567890@g.us", body: "oi", id: "m" },
    });

    expect(r.mensagens).toEqual([]);
  });

  it("traduz o ack numérico para o status da Inbox", () => {
    const status = (ack: number): string =>
      interpretarWebhookWaha({ event: "message.ack", payload: { id: "m", ack } }).entregas[0]
        ?.status ?? "";

    expect(status(1)).toBe("SENT");
    expect(status(2)).toBe("DELIVERED");
    expect(status(3)).toBe("READ");
    expect(status(-1)).toBe("FAILED");
  });

  it("evento desconhecido não é erro", () => {
    // WAHA emite dezenas de tipos e a lista cresce entre versões. Ignorar o que
    // não se entende é mais seguro do que adivinhar.
    const r = interpretarWebhookWaha({
      event: "session.status",
      session: "clinica-a",
      payload: { status: "WORKING" },
    });
    // Nada a aplicar — mas a SESSÃO sai mesmo assim: ela é o que identifica de
    // qual clínica é o canal, e vale para qualquer evento.
    expect(r).toEqual({ mensagens: [], entregas: [], destinatario: "clinica-a" });
  });

  it("webhook sem a chave certa é RECUSADO", () => {
    const pedido = {
      corpoCru: "{}",
      cabecalhos: new Headers({ "x-api-key": "chave-errada" }),
      url: "https://crc.teste/webhook",
    };
    expect(porta.verificarAssinatura(pedido)).toBe(false);
  });

  it("webhook com a chave certa é aceito", () => {
    const pedido = {
      corpoCru: "{}",
      cabecalhos: new Headers({ "x-api-key": "chave-secreta" }),
      url: "https://crc.teste/webhook",
    };
    expect(porta.verificarAssinatura(pedido)).toBe(true);
  });

  it("webhook SEM cabeçalho nenhum é recusado", () => {
    // O padrão é recusar, e não "aceitar porque não deu para verificar".
    const pedido = {
      corpoCru: "{}",
      cabecalhos: new Headers(),
      url: "https://crc.teste/webhook",
    };
    expect(porta.verificarAssinatura(pedido)).toBe(false);
  });
});

/* ========================================================================== */
/* Gemini — a tradução do schema                                              */
/* ========================================================================== */

describe("paraSchemaDoGemini", () => {
  const ORIGEM = {
    type: "object",
    additionalProperties: false,
    $schema: "https://json-schema.org/draft/2020-12/schema",
    properties: {
      acao: { type: "string", enum: ["responder", "ferramenta", "humano"] },
      texto: { type: "string", description: "O que dizer ao paciente." },
      passos: { type: "array", items: { type: "string" } },
      confianca: { type: "number" },
    },
    required: ["acao", "texto"],
  };

  it("põe os tipos em MAIÚSCULAS", () => {
    // Minúsculo é recusado com 400, e a mensagem não diz qual campo.
    const r = paraSchemaDoGemini(ORIGEM) as Record<string, unknown>;
    expect(r["type"]).toBe("OBJECT");

    const props = r["properties"] as Record<string, Record<string, unknown>>;
    expect(props["acao"]?.["type"]).toBe("STRING");
    expect(props["confianca"]?.["type"]).toBe("NUMBER");
    expect(props["passos"]?.["type"]).toBe("ARRAY");
  });

  it("REMOVE o que o Gemini não aceita", () => {
    const r = paraSchemaDoGemini(ORIGEM) as Record<string, unknown>;

    // `additionalProperties` é exigido pela OpenAI com `strict: true` e recusado
    // pelo Gemini. As duas coisas ao mesmo tempo só funcionam com tradução.
    expect(r).not.toHaveProperty("additionalProperties");
    expect(r).not.toHaveProperty("$schema");
  });

  it("preserva enum, required e description", () => {
    const r = paraSchemaDoGemini(ORIGEM) as Record<string, unknown>;
    const props = r["properties"] as Record<string, Record<string, unknown>>;

    expect(props["acao"]?.["enum"]).toEqual(["responder", "ferramenta", "humano"]);
    expect(r["required"]).toEqual(["acao", "texto"]);
    expect(props["texto"]?.["description"]).toBe("O que dizer ao paciente.");
  });

  it("declara a ORDEM das propriedades", () => {
    /*
     * E isto não é detalhe de formatação.
     *
     * O Gemini gera na ordem em que as chaves aparecem. Num objeto de decisão,
     * a ordem muda a RESPOSTA: pedir `acao` antes de `raciocinio` faz o modelo
     * escolher e só então justificar — que é raciocínio ao contrário, e produz
     * justificativa de fachada.
     */
    const r = paraSchemaDoGemini(ORIGEM) as Record<string, unknown>;
    expect(r["propertyOrdering"]).toEqual(["acao", "texto", "passos", "confianca"]);
  });

  it("desce em objetos aninhados", () => {
    const r = paraSchemaDoGemini({
      type: "object",
      properties: {
        bloqueios: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { categoria: { type: "string" } },
          },
        },
      },
    }) as Record<string, unknown>;

    const props = r["properties"] as Record<string, Record<string, unknown>>;
    const itens = props["bloqueios"]?.["items"] as Record<string, unknown>;

    expect(itens["type"]).toBe("OBJECT");
    // A tradução precisa ser recursiva: uma chave proibida escondida três
    // níveis abaixo derruba a chamada inteira.
    expect(itens).not.toHaveProperty("additionalProperties");
  });
});

describe("o preço do Gemini", () => {
  it("os modelos conhecidos têm preço", () => {
    // Sem preço, a estimativa vira zero — e o teto de gasto da Fase D
    // desarmaria justamente para o provedor recém-adicionado.
    expect(precoDoModeloGemini("gemini-2.5-flash")).not.toBeNull();
    expect(precoDoModeloGemini("gemini-2.5-pro")).not.toBeNull();
  });

  it("modelo desconhecido devolve null, e não zero", () => {
    // `null` significa "não sei"; zero significaria "é de graça", e o gateway
    // trataria as duas coisas de formas diferentes.
    expect(precoDoModeloGemini("gemini-inventado")).toBeNull();
  });
});
