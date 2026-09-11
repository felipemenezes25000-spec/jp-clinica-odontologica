/**
 * O dono da conversa, conferido no chokepoint de saída — Fase C.
 *
 * PRIMEIRO, O QUE ESTE ARQUIVO **NÃO** É. Ele não é o único lugar que confere
 * dono, e apresentá-lo assim seria vender proteção que já existia: o turno relê
 * o dono ao avaliar os portões, depois da chamada de modelo. Um teste honesto
 * precisa dizer o que ele acrescenta.
 *
 * O QUE ELE ACRESCENTA SÃO DUAS COISAS.
 *
 *   A JANELA QUE SOBRA entre a leitura dos portões e a gravação da mensagem —
 *   busca de destino, política de contato, idas e voltas ao PostgREST. Estreita,
 *   e numa Inbox movimentada uma janela estreita continua sendo uma janela.
 *
 *   O CHOKEPOINT. Todo envio passa por `enviarMensagem`. Uma regra escrita no
 *   chamador protege aquele chamador; escrita aqui, protege o próximo também —
 *   a campanha, o reprocessamento, a tela que ainda vai ser construída por
 *   alguém que não vai lembrar de conferir dono.
 *
 * O CENÁRIO É SEMPRE O MESMO: a decisão de enviar já foi tomada, e o dono muda
 * DEPOIS. Chamar `enviarMensagem` com um dono já errado não provaria nada sobre
 * corrida — provaria só que a função lê uma coluna.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Liga/desliga a leitura de `crc_conversations`, para simular banco fora. */
const estado = vi.hoisted(() => ({ leituraQuebrada: false }));

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return {
    ...fake,
    selecionarUm: (tabela: string, opcoes: never) =>
      estado.leituraQuebrada && tabela === "crc_conversations"
        ? Promise.reject(new Error("PostgREST fora do ar"))
        : fake.selecionarUm(tabela, opcoes),
  };
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
      interpretarWebhook: () => ({ mensagens: [], entregas: [], destinatario: null }),
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
  estado.leituraQuebrada = false;

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

describe("quando nem dá para saber de quem é a conversa", () => {
  it("recusa o envio em vez de arriscar", async () => {
    const { porta, enviados } = portaEspiã();
    estado.leituraQuebrada = true;

    const r = await enviarMensagem(pedido(porta));

    /*
     * ESCOLHA DELIBERADA, e a direção dela importa.
     *
     * O caminho fácil aqui é `catch { /* segue o baile *\/ }`: a leitura falhou,
     * a mensagem sai, e no dia a dia ninguém percebe. Até o dia em que o
     * PostgREST oscila exatamente enquanto uma atendente está digitando — e a
     * IA responde por cima dela.
     *
     * Entre calar indevidamente e falar por cima de uma pessoa, calar é o erro
     * barato: o paciente espera alguns minutos, e o registro diz o porquê. Uma
     * trava que se abre sozinha quando o banco oscila não é uma trava.
     */
    expect(r).toMatchObject({ ok: false, codigo: "DONO_INDISPONIVEL", permanente: true });
    expect(enviados).toEqual([]);
  });

  it("a falha de leitura não barra atendente nem automação", async () => {
    const { porta, enviados } = portaEspiã();
    estado.leituraQuebrada = true;

    // A conferência é só da IA. Derrubar o banco não pode virar um jeito de
    // impedir a recepção de responder pela tela.
    const r = await enviarMensagem(
      pedido(porta, { remetente: "atendente", autorId: ATENDENTE, chaveDedupe: "mao:2" }),
    );

    expect(r.ok).toBe(true);
    expect(enviados).toHaveLength(1);
  });
});
