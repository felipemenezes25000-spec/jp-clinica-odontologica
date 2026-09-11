/**
 * O dono da conversa, conferido no último instante — Fase C.
 *
 * A JANELA QUE ESTE ARQUIVO FECHA. O worker lê o dono ao começar o job e só
 * então chama o modelo. Entre uma coisa e outra passam segundos — às vezes
 * dezenas, quando o provedor está lento. É tempo de sobra para um atendente
 * abrir a Inbox, ver a conversa, clicar em "assumir" e começar a responder.
 *
 * Com a conferência só no começo, o que sai é a resposta da IA POR CIMA da
 * resposta da pessoa. Duas vozes no mesmo minuto, dizendo coisas diferentes, e
 * a clínica descobre pelo print que o paciente manda depois perguntando afinal
 * quem está falando com ele.
 *
 * O teste que provaria isso NÃO PODE ser "chamei enviarMensagem com um dono
 * errado": tem que ser "o dono mudou DEPOIS da decisão de enviar", que é a
 * única forma como o defeito aparece de verdade.
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
import type { PortaMensageria, ResultadoEnvio } from "../integracoes/whatsapp/porta";
import { assumirConversa, pausarIaNaConversa } from "./casos";
import { enviarMensagem, type PedidoEnvio } from "./mensagens";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const PACIENTE = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const ATENDENTE = "66666666-6666-4666-8666-666666666666";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

/** Uma porta que anota tudo que sai. O que ela NÃO recebe é o ponto do teste. */
function portaEspiã(): { porta: PortaMensageria; enviados: string[] } {
  const enviados: string[] = [];
  const ok: ResultadoEnvio = { ok: true, providerMessageId: "prov-1" };

  return {
    enviados,
    porta: {
      nome: "sandbox",
      exigeTemplateForaDaJanela: false,
      enviarTexto: (e) => {
        enviados.push(e.texto);
        return Promise.resolve(ok);
      },
      enviarTemplate: (e) => {
        enviados.push(e.textoRenderizado);
        return Promise.resolve(ok);
      },
      verificarAssinatura: () => true,
      interpretarWebhook: () => ({ mensagens: [], entregas: [] }),
    },
  };
}

const pedido = (porta: PortaMensageria, extra: Partial<PedidoEnvio> = {}): PedidoEnvio => ({
  organizationId: ORG,
  clinicId: CLINICA,
  patientId: PACIENTE,
  conversationId: CONVERSA,
  telefone: "5511999998888",
  texto: "Consigo sim, pode ser quinta às 10h40?",
  chaveDedupe: "turno:evento-1",
  remetente: "ia",
  // Resposta a quem acabou de escrever: não é envio proativo.
  proativo: false,
  porta,
  agora: AGORA,
  ...extra,
});

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);

  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, nome: "JP Centro" }]);
  semear("crc_patients", [
    {
      id: PACIENTE,
      organization_id: ORG,
      clinic_id: CLINICA,
      nome: "Ana",
      telefone: "5511999998888",
    },
  ]);
  semear("crc_conversations", [
    {
      id: CONVERSA,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      canal: "whatsapp",
      contato_externo: "5511999998888",
      status: "ABERTA",
      dono: "ia",
    },
  ]);
});

describe("a IA e o dono da conversa", () => {
  it("envia normalmente enquanto a conversa é dela", async () => {
    const { porta, enviados } = portaEspiã();

    const r = await enviarMensagem(pedido(porta));

    expect(r.ok).toBe(true);
    expect(enviados).toHaveLength(1);
  });

  it("não fala por cima do atendente que assumiu enquanto ela pensava", async () => {
    const { porta, enviados } = portaEspiã();

    // O turno começou com a conversa da IA. AQUI é o meio do turno: o modelo
    // está respondendo, e neste instante alguém assume na Inbox.
    await assumirConversa(ORG, CONVERSA, ATENDENTE);

    const r = await enviarMensagem(pedido(porta));

    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ codigo: "CONVERSA_ASSUMIDA", permanente: true });

    // NADA SAIU. É a única asserção que importa para o paciente.
    expect(enviados).toEqual([]);
    // E nada foi gravado: a Inbox não mostra uma mensagem que não existiu.
    expect(conteudo("crc_messages")).toHaveLength(0);
  });

  it("respeita a pausa da IA feita no meio do turno", async () => {
    const { porta, enviados } = portaEspiã();

    await pausarIaNaConversa(ORG, CONVERSA);

    const r = await enviarMensagem(pedido(porta));

    expect(r).toMatchObject({ ok: false, codigo: "IA_PAUSADA", permanente: true });
    expect(enviados).toEqual([]);
  });

  it("recusa PERMANENTE, para o envio não voltar para a fila", async () => {
    const { porta } = portaEspiã();
    await assumirConversa(ORG, CONVERSA, ATENDENTE);

    const r = await enviarMensagem(pedido(porta));

    // Se fosse temporária, a jornada reagendaria e a IA tentaria de novo daqui a
    // pouco — exatamente o atropelo que este arquivo existe para impedir.
    expect(r).toMatchObject({ permanente: true });
    expect(r).not.toHaveProperty("reagendarPara");
  });
});

describe("quem NÃO é afetado pela conferência", () => {
  it("o atendente envia na conversa que ele mesmo assumiu", async () => {
    const { porta, enviados } = portaEspiã();
    await assumirConversa(ORG, CONVERSA, ATENDENTE);

    const r = await enviarMensagem(
      pedido(porta, { remetente: "atendente", autorId: ATENDENTE, chaveDedupe: "mao:1" }),
    );

    expect(r.ok).toBe(true);
    expect(enviados).toHaveLength(1);
  });

  it("a automação não é barrada por dono", async () => {
    const { porta, enviados } = portaEspiã();
    await assumirConversa(ORG, CONVERSA, ATENDENTE);

    // Jornada agendada roda por outra decisão e tem outros portões — opt-out,
    // horário, cooldown. Barrá-la por dono aqui misturaria duas regras.
    const r = await enviarMensagem(
      pedido(porta, { remetente: "automacao", chaveDedupe: "jornada:1" }),
    );

    expect(r.ok).toBe(true);
    expect(enviados).toHaveLength(1);
  });
});
