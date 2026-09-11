/**
 * A janela ambígua do envio de WhatsApp.
 *
 * ========================================================================
 *  O DEFEITO: o código HTTP sabia, e a camada de cima desfazia.
 *
 *  `pedir()` usa `repetirEscrita: false` com um comentário explícito — "um POST
 *  que deu timeout pode ter entregue a mensagem, e repetir manda duas". Está
 *  certo.
 *
 *  Só que o adapter capturava QUALQUER erro de rede como `permanente: false`, e
 *  uma camada acima `permanente: false` LIBERAVA a chave de dedupe. A porta que
 *  o HTTP fechou era reaberta duas camadas depois:
 *
 *      CRC → Meta
 *        ↓  a Meta ACEITA
 *        ↓  a rede cai antes da resposta voltar
 *        ↓  o CRC vê timeout e marca falha transitória
 *        ↓  libera o dedupe
 *        ↓  retry
 *        ↓  A META RECEBE DE NOVO
 *
 *      Paciente:  "Olá, Maria..."
 *                 "Olá, Maria..."
 * ========================================================================
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
import { enviarMensagem } from "./mensagens";
import { entregaFicouIncerta } from "../servidor/http";
import type { ClasseDeFalha, PortaMensageria } from "../integracoes/whatsapp/porta";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const PACIENTE = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

/** Uma porta que falha do jeito que o teste pedir. */
function portaQueFalha(classe: ClasseDeFalha): PortaMensageria {
  const falha = { ok: false as const, classe, codigo: "REDE", detalhe: "timeout" };
  return {
    nome: "meta_cloud",
    exigeTemplateForaDaJanela: false,
    enviarTexto: () => Promise.resolve(falha),
    enviarTemplate: () => Promise.resolve(falha),
    verificarAssinatura: () => true,
    interpretarWebhook: () => ({ mensagens: [], entregas: [], destinatario: null }),
  };
}

const pedido = (porta: PortaMensageria) => ({
  organizationId: ORG,
  clinicId: CLINICA,
  patientId: PACIENTE,
  conversationId: CONVERSA,
  telefone: "5511988887777",
  texto: "Olá, Maria! Vi que você faltou ontem.",
  chaveDedupe: "agente:evt-1",
  remetente: "ia" as const,
  proativo: false,
  porta,
  agora: AGORA,
});

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, slug: "jp", nome: "JP" }]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, slug: "matriz", nome: "Matriz", ativa: true },
  ]);
  semear("crc_patients", [
    { id: PACIENTE, organization_id: ORG, nome: "Maria", situacao: "em tratamento" },
  ]);
  semear("crc_conversations", [
    {
      id: CONVERSA,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      canal: "whatsapp",
      contato_externo: "5511988887777",
      dono: "ia",
    },
  ]);
  semear("crc_messages", [
    {
      organization_id: ORG,
      conversation_id: CONVERSA,
      direcao: "ENTRADA",
      conteudo: "oi",
      criado_em: new Date(AGORA.getTime() - 60_000).toISOString(),
    },
  ]);
});

/* -------------------------------------------------------------------------- */

describe("a classificação da falha de rede", () => {
  it("timeout de RESPOSTA é incerto: o pedido já saiu", () => {
    const erro = new Error("tempo esgotado");
    erro.name = "TimeoutError";
    expect(entregaFicouIncerta(erro)).toBe(true);
  });

  it("conexão recusada NÃO é incerta: o pedido nunca saiu", () => {
    // Repetir aqui é seguro — e não repetir perderia a mensagem à toa.
    for (const code of ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]) {
      const erro = Object.assign(new TypeError("fetch failed"), { cause: { code } });
      expect(entregaFicouIncerta(erro), code).toBe(false);
    }
  });

  it("conexão cortada no MEIO é incerta", () => {
    // A conexão se estabeleceu: o outro lado pode ter lido o corpo inteiro.
    for (const code of ["ECONNRESET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]) {
      const erro = Object.assign(new TypeError("fetch failed"), { cause: { code } });
      expect(entregaFicouIncerta(erro), code).toBe(true);
    }
  });

  it("código DESCONHECIDO é tratado como incerto", () => {
    /*
     * O PADRÃO É CONSERVADOR DE PROPÓSITO. Errar para "pode ter chegado" custa
     * uma mensagem não reenviada, que alguém vê na Inbox e resolve. Errar para
     * o outro lado custa um paciente recebendo a mesma mensagem duas vezes — e
     * isso não tem desfazer.
     */
    const erro = Object.assign(new TypeError("fetch failed"), { cause: { code: "E_SEI_LA" } });
    expect(entregaFicouIncerta(erro)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("o que acontece com a chave de dedupe", () => {
  it("falha TRANSITÓRIA libera a chave — a mensagem pode ser reenviada", async () => {
    /*
     * O provedor está fora do ar e o pedido não saiu. Sem liberar, a linha
     * ficaria em falha ocupando a chave única para sempre, e a retentativa
     * seria recusada como "já enviada".
     */
    const r = await enviarMensagem(pedido(portaQueFalha("transitoria")));

    expect(r.ok).toBe(false);
    expect(!r.ok && r.permanente).toBe(false);

    const saida = conteudo("crc_messages").find((m) => m["direcao"] === "SAIDA");
    expect(saida?.["chave_dedupe"]).toBeNull();
    expect(saida?.["status_entrega"]).toBe("FAILED");
  });

  it("falha INCERTA NÃO libera a chave — é o conserto", async () => {
    /*
     * O pedido saiu e a resposta não voltou. A Meta pode ter aceitado. Liberar
     * a chave aqui é autorizar a segunda mensagem.
     */
    const r = await enviarMensagem(pedido(portaQueFalha("incerta")));

    const saida = conteudo("crc_messages").find((m) => m["direcao"] === "SAIDA");
    expect(saida?.["chave_dedupe"]).toBe("agente:evt-1");

    // E o estado não mente: `FAILED` diria "não foi", e pode ter ido.
    expect(saida?.["status_entrega"]).toBe("DESCONHECIDO");

    // Para quem chama, incerta conta como "não tente de novo sozinho".
    expect(!r.ok && r.permanente).toBe(true);
    expect(!r.ok && r.classe).toBe("incerta");
  });

  it("falha PERMANENTE mantém a chave", async () => {
    // Não adianta insistir num número inválido.
    await enviarMensagem(pedido(portaQueFalha("permanente")));

    const saida = conteudo("crc_messages").find((m) => m["direcao"] === "SAIDA");
    expect(saida?.["chave_dedupe"]).toBe("agente:evt-1");
    expect(saida?.["status_entrega"]).toBe("FAILED");
  });

  it("depois de uma falha incerta, o RETRY não manda a segunda mensagem", async () => {
    /*
     * O TESTE QUE FECHA O CENÁRIO INTEIRO.
     *
     * Primeira tentativa: timeout depois de a Meta aceitar. Segunda tentativa:
     * o turno roda de novo, com a MESMA chave de dedupe — que é o que um retry
     * de job produz. O índice único precisa recusar.
     */
    await enviarMensagem(pedido(portaQueFalha("incerta")));

    const enviadas: string[] = [];
    const portaQueFunciona: PortaMensageria = {
      ...portaQueFalha("transitoria"),
      enviarTexto: (e) => {
        enviadas.push(e.texto);
        return Promise.resolve({ ok: true as const, providerMessageId: "p-2" });
      },
    };

    await enviarMensagem(pedido(portaQueFunciona));

    // O paciente NÃO recebe a segunda.
    expect(enviadas).toHaveLength(0);
    expect(conteudo("crc_messages").filter((m) => m["direcao"] === "SAIDA")).toHaveLength(1);
  });

  it("depois de uma falha transitória, o retry CONSEGUE enviar", async () => {
    // O controle. Sem ele, "nunca libera a chave" passaria nos testes acima e
    // transformaria toda oscilação de rede em mensagem perdida para sempre.
    await enviarMensagem(pedido(portaQueFalha("transitoria")));

    const enviadas: string[] = [];
    const portaQueFunciona: PortaMensageria = {
      ...portaQueFalha("transitoria"),
      enviarTexto: (e) => {
        enviadas.push(e.texto);
        return Promise.resolve({ ok: true as const, providerMessageId: "p-2" });
      },
    };

    await enviarMensagem(pedido(portaQueFunciona));
    expect(enviadas).toHaveLength(1);
  });
});
