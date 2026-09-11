/**
 * Testes da inbox de webhook.
 *
 * ========================================================================
 *  O DEFEITO QUE ESTES TESTES TRAVAM é a ausência de um consumidor.
 *
 *  A tabela existia, era escrita, e ninguém a lia. Quando o processamento
 *  falhava, a linha virava FALHOU e ficava lá — enquanto o CRC respondia `200`
 *  para a Meta, que então considerava entregue e nunca reenviava.
 *
 *  A mensagem do paciente sumia. Sem erro, sem alerta: do lado da Meta deu
 *  certo, e do nosso a linha está num estado que ninguém observa.
 * ========================================================================
 *
 * E um segundo, mais sutil: o payload guardado não servia para replay. Ele
 * passava por `mascarar()`, que corta profundidade acima de seis níveis — e o
 * envelope da Meta é `entry > changes > value > messages > …`. A linha existia e
 * era inútil.
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

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import {
  esperaDoWebhook,
  processarWebhookWhatsapp,
  repescarWebhooks,
  MAX_TENTATIVAS_WEBHOOK,
} from "./webhooks";
import type { PortaMensageria } from "../integracoes/whatsapp/porta";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

/**
 * O envelope ANINHADO da Meta, de verdade.
 *
 * Cinco níveis até `messages`, que é o que torna este teste diferente de um
 * com `{a: 1}`: é a profundidade real que o mascarador destruía.
 */
const ENVELOPE_META = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "conta-1",
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "5511999" },
            messages: [
              { id: "wamid.ABC", from: "5511988887777", type: "text", text: { body: "Oi" } },
            ],
          },
        },
      ],
    },
  ],
};

function portaFake(): PortaMensageria {
  return {
    nome: "meta_cloud",
    exigeTemplateForaDaJanela: true,
    enviarTexto: () => Promise.resolve({ ok: true as const, providerMessageId: "p-1" }),
    enviarTemplate: () => Promise.resolve({ ok: true as const, providerMessageId: "p-2" }),
    verificarAssinatura: () => true,
    interpretarWebhook: () => ({
      mensagens: [
        {
          providerMessageId: "wamid.ABC",
          telefone: "5511988887777",
          texto: "Oi",
          recebidaEm: AGORA.toISOString(),
          nomePerfil: "Maria",
        },
      ],
      entregas: [],
    }),
  };
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, slug: "jp", nome: "JP" }]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, slug: "matriz", nome: "Matriz", ativa: true },
  ]);
});

/* -------------------------------------------------------------------------- */

describe("o que fica guardado serve para replay", () => {
  it("guarda o envelope NORMALIZADO, e não o cru aninhado", async () => {
    /*
     * A versão anterior gravava `mascarar(payload)`. O mascarador corta
     * profundidade acima de seis níveis e limita arrays — e o caminho até a
     * mensagem na Meta é `entry > changes > value > messages > text > body`.
     * A linha existia e não dava para reprocessar a partir dela.
     */
    /*
     * O ENVELOPE PRECISA FALHAR para este teste ter sentido: o payload só fica
     * guardado enquanto a linha NÃO concluiu — depois ele é apagado, que é o
     * assunto do teste seguinte. E é exatamente no caso de falha que ele
     * importa, porque é dele que o replay vai sair.
     */
    const { falharProximaEscrita } = await import("../testes/banco-memoria");
    falharProximaEscrita("crc_messages", "o banco piscou");

    await processarWebhookWhatsapp(portaFake(), ENVELOPE_META);

    const [linha] = conteudo("crc_webhook_inbox");
    expect(linha?.["status"]).toBe("FALHOU");

    const payload = linha?.["payload"] as { mensagens?: unknown[] } | undefined;

    // Raso e direto: a entrada exata da etapa seguinte.
    expect(Array.isArray(payload?.mensagens)).toBe(true);
    expect(JSON.stringify(payload)).not.toContain("profundo demais");
    expect(JSON.stringify(payload)).toContain("wamid.ABC");
    // E o texto que o replay precisa continua legível.
    expect(JSON.stringify(payload)).toContain("5511988887777");
  });

  it("o payload é APAGADO quando o envelope conclui", async () => {
    /*
     * Enquanto pendente, ele guarda telefone e texto — é o que o replay precisa.
     * Depois de processado, isso já está em `crc_messages` com as regras de
     * acesso de lá. Manter a cópia aqui seria um segundo lugar com PII e outra
     * política de retenção, que é o que o `mascarar()` original tentava evitar.
     */
    await processarWebhookWhatsapp(portaFake(), ENVELOPE_META);

    const [linha] = conteudo("crc_webhook_inbox");
    expect(linha?.["status"]).toBe("PROCESSADO");
    expect(linha?.["payload"]).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */

describe("a repescagem", () => {
  /** Um envelope falho esperando na fila. */
  function falhoNaFila(externalId: string, tentativas = 1, disponivelEm = AGORA): void {
    semear("crc_webhook_inbox", [
      {
        provedor: "meta_cloud",
        external_id: externalId,
        status: "FALHOU",
        tentativas,
        disponivel_em: new Date(disponivelEm.getTime() - 1000).toISOString(),
        ultimo_erro: "o banco piscou",
        payload: {
          mensagens: [
            {
              providerMessageId: externalId,
              telefone: "5511988887777",
              texto: "Oi, quero remarcar",
              recebidaEm: AGORA.toISOString(),
              nomePerfil: "Maria",
            },
          ],
          entregas: [],
        },
      },
    ]);
  }

  it("recupera o envelope que falhou — a mensagem não se perde", async () => {
    falhoNaFila("wamid.PERDIDA");

    const r = await repescarWebhooks();

    expect(r.reservados).toBe(1);
    expect(r.recuperados).toBe(1);
    expect(conteudo("crc_webhook_inbox")[0]?.["status"]).toBe("PROCESSADO");

    // E a mensagem do paciente entrou de verdade.
    const entradas = conteudo("crc_messages").filter((m) => m["direcao"] === "ENTRADA");
    expect(entradas).toHaveLength(1);
    expect(entradas[0]?.["conteudo"]).toContain("remarcar");
  });

  it("respeita o backoff: não repesca antes da hora", async () => {
    // Insistir no mesmo segundo em que falhou é falhar de novo no mesmo segundo.
    falhoNaFila("wamid.ESPERANDO");
    const linha = conteudo("crc_webhook_inbox")[0];
    if (linha !== undefined) {
      linha["disponivel_em"] = new Date(AGORA.getTime() + 10 * 60_000).toISOString();
    }

    expect((await repescarWebhooks()).reservados).toBe(0);
  });

  it("PROCESSADO não é repescado", async () => {
    semear("crc_webhook_inbox", [
      {
        provedor: "meta_cloud",
        external_id: "wamid.PRONTA",
        status: "PROCESSADO",
        tentativas: 1,
        payload: {},
        disponivel_em: AGORA.toISOString(),
      },
    ]);

    expect((await repescarWebhooks()).reservados).toBe(0);
  });

  it("envelope sem conteúdo é DESCARTADO, e não fica girando", async () => {
    /*
     * Um payload vazio não vira mensagem nunca. Marcá-lo FALHOU o faria voltar
     * cinco vezes para falhar cinco vezes, e encheria a dead letter de coisa que
     * ninguém pode consertar — até ninguém mais olhar a dead letter.
     */
    semear("crc_webhook_inbox", [
      {
        provedor: "meta_cloud",
        external_id: "wamid.VAZIA",
        status: "FALHOU",
        tentativas: 1,
        payload: {},
        disponivel_em: new Date(AGORA.getTime() - 1000).toISOString(),
      },
    ]);

    const r = await repescarWebhooks();
    expect(r.descartados).toBe(1);
    expect(conteudo("crc_webhook_inbox")[0]?.["status"]).toBe("DESCARTADO");
  });

  it("esgotadas as tentativas, vira DEAD LETTER e não some", async () => {
    /*
     * Um webhook que esgota as tentativas sai da fila de trabalho. Sem registro,
     * ele sai do mundo — e a Meta não vai reenviar, porque para ela deu certo.
     */
    falhoNaFila("wamid.DESISTIU", MAX_TENTATIVAS_WEBHOOK - 1);
    // Sem organização, `aplicarEnvelope` lança: é falha de configuração, e o
    // envelope deve voltar à fila em vez de ser descartado.
    limparBanco();
    definirRelogio(AGORA);
    falhoNaFila("wamid.DESISTIU", MAX_TENTATIVAS_WEBHOOK - 1);

    const r = await repescarWebhooks();

    expect(r.falhados).toBe(1);
    const mortas = conteudo("crc_dead_letters");
    expect(mortas).toHaveLength(1);
    expect(mortas[0]?.["origem"]).toBe("webhook");
  });

  it("passou do teto, sai da fila de trabalho", async () => {
    falhoNaFila("wamid.NOTETO", MAX_TENTATIVAS_WEBHOOK);
    expect((await repescarWebhooks()).reservados).toBe(0);
  });

  it("o preso com lease vencido e teto estourado vira FALHOU", async () => {
    // O pior estado possível: invisível na fila (passou do teto) e invisível na
    // lista de falhas (o status é PROCESSANDO).
    semear("crc_webhook_inbox", [
      {
        provedor: "meta_cloud",
        external_id: "wamid.PRESA",
        status: "PROCESSANDO",
        tentativas: MAX_TENTATIVAS_WEBHOOK,
        travado_ate: new Date(AGORA.getTime() - 60_000).toISOString(),
        payload: { mensagens: [], entregas: [] },
        disponivel_em: AGORA.toISOString(),
      },
    ]);

    const r = await repescarWebhooks();
    expect(r.presosLiberados).toBe(1);
    expect(conteudo("crc_webhook_inbox")[0]?.["status"]).toBe("FALHOU");
  });
});

/* -------------------------------------------------------------------------- */

describe("o backoff", () => {
  it("cresce e tem teto", () => {
    expect(esperaDoWebhook(1)).toBe(15_000);
    expect(esperaDoWebhook(2)).toBe(60_000);
    expect(esperaDoWebhook(3)).toBe(240_000);
    expect(esperaDoWebhook(9)).toBe(16 * 60_000);
  });

  it("é MAIS CURTO que o do agente", async () => {
    /*
     * No agente, o que espera é um job de recuperação. Aqui é a mensagem que o
     * paciente acabou de mandar, e cada minuto é um minuto de silêncio depois
     * de um "oi". A primeira tentativa sai em 15s, contra 30s lá.
     */
    const { esperaDoRetry } = await import("./agent-jobs");
    expect(esperaDoWebhook(1)).toBeLessThan(esperaDoRetry(1) * 1000);
  });
});
