/**
 * De quem é o webhook que falhou, e o que sobra dele depois.
 *
 * ============================================================================
 *  DOIS DEFEITOS DA MESMA LINHA DE CÓDIGO.
 *
 *  1. A DEAD LETTER NÃO SABIA O TENANT.
 *
 *     `mandarParaDeadLetter` resolvia o escopo assim:
 *
 *         resolverEscopo(provedor, null)
 *                                  ^^^^
 *
 *     `null` no lugar do destinatário. E `resolverEscopo` sem destinatário cai
 *     no caminho da clínica única — que, com duas clínicas, devolve `null` DE
 *     PROPÓSITO. Resultado: `organization_id = null`.
 *
 *     Com um cliente, certo por acidente. Com dezenas, a fila de falhas vira um
 *     monte sem dono: não dá para dizer qual cliente perdeu mensagem.
 *
 *  2. O PAYLOAD COM PII SOBREVIVIA AO FIM DA FILA.
 *
 *     `marcar()` zerava o payload só em `PROCESSADO`. O envelope que ESGOTA as
 *     tentativas ficava `FALHOU` com telefone e texto do paciente dentro, para
 *     sempre — e o caso de falha é justamente o que ninguém revisita.
 *
 *  INJEÇÃO DE DEFEITO:
 *    voltar `terminal` para `status === "PROCESSADO"` quebra o teste da PII;
 *    voltar `tenantDaLinha` para `resolverEscopo(provedor, null)` quebra o da
 *    dead letter — e quebra do jeito certo, com `null` no lugar da organização.
 * ============================================================================
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
import type { PortaMensageria } from "../integracoes/whatsapp/porta";

import { processarWebhookWhatsapp, repescarWebhooks, MAX_TENTATIVAS_WEBHOOK } from "./webhooks";

const ORG_A = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_B = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

/** Uma porta que entrega uma mensagem endereçada a um número específico. */
function portaPara(destinatario: string, texto: string): PortaMensageria {
  return {
    nome: "meta_cloud",
    exigeTemplateForaDaJanela: true,
    enviarTexto: () => Promise.resolve({ ok: true as const, providerMessageId: "p-1" }),
    enviarTemplate: () => Promise.resolve({ ok: true as const, providerMessageId: "p-2" }),
    verificarAssinatura: () => true,
    interpretarWebhook: () => ({
      destinatario,
      mensagens: [
        {
          providerMessageId: `wamid.${destinatario}`,
          telefone: "5511988887777",
          texto,
          recebidaEm: AGORA.toISOString(),
          nomePerfil: "Maria",
        },
      ],
      entregas: [],
    }),
  };
}

/** Duas organizações, cada uma com a sua clínica e o seu número. */
function duasOrganizacoes(): void {
  semear("crc_organizations", [
    { id: ORG_A, nome: "Clínica A", slug: "a" },
    { id: ORG_B, nome: "Clínica B", slug: "b" },
  ]);
  semear("crc_clinics", [
    { id: CLINICA_A, organization_id: ORG_A, nome: "A", slug: "matriz", ativa: true },
    { id: CLINICA_B, organization_id: ORG_B, nome: "B", slug: "matriz", ativa: true },
  ]);
  semear("crc_canais_whatsapp", [
    {
      organization_id: ORG_A,
      clinic_id: CLINICA_A,
      provedor: "meta_cloud",
      identificador: "numero-A",
      ativo: true,
    },
    {
      organization_id: ORG_B,
      clinic_id: CLINICA_B,
      provedor: "meta_cloud",
      identificador: "numero-B",
      ativo: true,
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  duasOrganizacoes();
});

/* -------------------------------------------------------------------------- */

describe("o inbox carrega o tenant desde o nascimento", () => {
  it("grava a organização e a clínica de quem recebeu", async () => {
    await processarWebhookWhatsapp(portaPara("numero-B", "Oi, é da B"), {});

    const linhas = conteudo("crc_webhook_inbox");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.["organization_id"]).toBe(ORG_B);
    expect(linhas[0]?.["clinic_id"]).toBe(CLINICA_B);
  });

  it("dois tenants, dois envelopes, nenhum cruzamento", async () => {
    await processarWebhookWhatsapp(portaPara("numero-A", "oi A"), {});
    await processarWebhookWhatsapp(portaPara("numero-B", "oi B"), {});

    const porOrg = conteudo("crc_webhook_inbox").map((l) => l["organization_id"]);
    expect(porOrg).toContain(ORG_A);
    expect(porOrg).toContain(ORG_B);

    // E as mensagens caíram cada uma na sua — a prova de que o tenant gravado é
    // o mesmo que foi usado para aplicar.
    const mensagensDeA = conteudo("crc_messages").filter((m) => m["organization_id"] === ORG_A);
    const mensagensDeB = conteudo("crc_messages").filter((m) => m["organization_id"] === ORG_B);
    expect(mensagensDeA).toHaveLength(1);
    expect(mensagensDeB).toHaveLength(1);
    expect(mensagensDeA[0]?.["conteudo"]).toBe("oi A");
    expect(mensagensDeB[0]?.["conteudo"]).toBe("oi B");
  });
});

describe("o envelope que esgota as tentativas", () => {
  /**
   * Um envelope já no teto, pronto para a repescagem falhar e terminalizar.
   *
   * O payload carrega telefone e texto — que é o ponto: são eles que não podem
   * sobreviver ao fim da fila.
   */
  function envelopeNoTeto(organizationId: string | null, clinicId: string | null): void {
    semear("crc_webhook_inbox", [
      {
        id: "eeee1111-eeee-4eee-8eee-eeeeeeeeeeee",
        provedor: "meta_cloud",
        external_id: "msg:wamid.NOTETO",
        organization_id: organizationId,
        clinic_id: clinicId,
        status: "FALHOU",
        tentativas: MAX_TENTATIVAS_WEBHOOK - 1,
        disponivel_em: new Date(AGORA.getTime() - 1000).toISOString(),
        payload: {
          destinatario: "numero-B",
          // O CONTEÚDO SENSÍVEL, explícito para a asserção poder procurá-lo.
          mensagens: [
            {
              providerMessageId: "wamid.NOTETO",
              telefone: "5511988887777",
              texto: "Estou com dor no dente 36",
              recebidaEm: AGORA.toISOString(),
            },
          ],
          entregas: [],
        },
      },
    ]);
  }

  it("abre dead letter COM o tenant, e não com null", async () => {
    envelopeNoTeto(ORG_B, CLINICA_B);
    // Sem canal cadastrado a repescagem lançaria; aqui o que falha é a
    // aplicação, para o caminho terminal ser exercitado.
    vi.spyOn(await import("./mensagens"), "receberMensagem").mockRejectedValue(
      new Error("PostgREST fora do ar"),
    );

    await repescarWebhooks({ limite: 5 });

    const mortas = conteudo("crc_dead_letters");
    expect(mortas).toHaveLength(1);
    expect(mortas[0]?.["organization_id"]).toBe(ORG_B);
    expect(mortas[0]?.["origem"]).toBe("webhook");

    // E o METADADO basta: nada de texto de paciente numa terceira tabela.
    const payload = mortas[0]?.["payload"] as Record<string, unknown>;
    expect(payload["externalId"]).toBe("msg:wamid.NOTETO");
    expect(JSON.stringify(payload)).not.toContain("dor no dente");

    vi.restoreAllMocks();
  });

  it("APAGA o payload: quem não volta para a fila não guarda PII", async () => {
    envelopeNoTeto(ORG_B, CLINICA_B);
    vi.spyOn(await import("./mensagens"), "receberMensagem").mockRejectedValue(
      new Error("PostgREST fora do ar"),
    );

    await repescarWebhooks({ limite: 5 });

    const linha = conteudo("crc_webhook_inbox")[0];
    expect(linha?.["status"]).toBe("FALHOU");
    expect(linha?.["tentativas"]).toBe(MAX_TENTATIVAS_WEBHOOK);
    // O envelope some; a LINHA fica, porque é o `external_id` dela que impede o
    // provedor de reentregar o mesmo webhook como novo.
    expect(linha?.["payload"]).toEqual({});
    expect(JSON.stringify(linha?.["payload"])).not.toContain("5511988887777");

    vi.restoreAllMocks();
  });

  it("mas o que AINDA pode voltar guarda o envelope inteiro", async () => {
    /*
     * O CONTRAPESO. Apagar cedo demais seria trocar um problema de privacidade
     * por um de perda de mensagem: sem envelope não há replay, e a Meta já
     * recebeu 200 — ela não vai reenviar.
     */
    semear("crc_webhook_inbox", [
      {
        id: "eeee2222-eeee-4eee-8eee-eeeeeeeeeeee",
        provedor: "meta_cloud",
        external_id: "msg:wamid.PRIMEIRA",
        organization_id: ORG_B,
        clinic_id: CLINICA_B,
        status: "FALHOU",
        tentativas: 0,
        disponivel_em: new Date(AGORA.getTime() - 1000).toISOString(),
        payload: {
          destinatario: "numero-B",
          mensagens: [
            {
              providerMessageId: "wamid.PRIMEIRA",
              telefone: "5511988887777",
              texto: "Estou com dor",
              recebidaEm: AGORA.toISOString(),
            },
          ],
          entregas: [],
        },
      },
    ]);
    vi.spyOn(await import("./mensagens"), "receberMensagem").mockRejectedValue(
      new Error("PostgREST fora do ar"),
    );

    await repescarWebhooks({ limite: 5 });

    const linha = conteudo("crc_webhook_inbox")[0];
    expect(linha?.["status"]).toBe("FALHOU");
    expect(JSON.stringify(linha?.["payload"])).toContain("Estou com dor");
    expect(conteudo("crc_dead_letters")).toHaveLength(0);

    vi.restoreAllMocks();
  });

  it("linha ANTIGA, sem a coluna de tenant, ainda acha o dono pelo envelope", async () => {
    /*
     * A coluna nasceu no `supabase/25`. As linhas gravadas antes dele não a
     * têm — e o `destinatario` continua dentro do envelope normalizado,
     * resolvendo exatamente como resolveu na primeira vez. Sem este resgate, a
     * migração deixaria um rastro de dead letters órfãs.
     */
    envelopeNoTeto(null, null);
    vi.spyOn(await import("./mensagens"), "receberMensagem").mockRejectedValue(
      new Error("PostgREST fora do ar"),
    );

    await repescarWebhooks({ limite: 5 });

    expect(conteudo("crc_dead_letters")[0]?.["organization_id"]).toBe(ORG_B);

    vi.restoreAllMocks();
  });
});
