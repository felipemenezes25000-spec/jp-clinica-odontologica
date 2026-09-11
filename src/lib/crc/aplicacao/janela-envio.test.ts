/**
 * A janela de 24 horas, exercitada contra o banco — e não só no domínio.
 *
 * POR QUE ESTE ARQUIVO PRECISOU EXISTIR. A regra da janela já tinha teste puro
 * em `dominio/janela-whatsapp.ts`, e ele sempre passou. O que ninguém testava
 * era a CONSULTA que descobre a última mensagem do paciente — e ela filtrava
 * `direcao = "IN"`, valor que o banco nunca guardou.
 *
 * O efeito: `ultimaEntradaDaConversa` devolvia `null` sempre, a janela era
 * julgada fechada sempre, e num provedor que exige template fora dela o agente
 * NUNCA teria conseguido responder um paciente. Zero teste acusava, porque a
 * regra pura estava certa e a consulta ninguém olhava.
 *
 * A lição estrutural: regra pura testada + consulta não testada = sistema que
 * não funciona com os dois verdes.
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

import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import type { PortaMensageria, ResultadoEnvio } from "../integracoes/whatsapp/porta";
import { enviarMensagem } from "./mensagens";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const PACIENTE = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

/**
 * Uma porta que EXIGE template fora da janela — como Meta Cloud e Twilio.
 *
 * O sandbox tem `exigeTemplateForaDaJanela: false` e passaria por qualquer
 * janela. Testar com ele seria testar nada.
 */
function portaOficial(): { porta: PortaMensageria; textos: string[]; templates: string[] } {
  const textos: string[] = [];
  const templates: string[] = [];
  const ok: ResultadoEnvio = { ok: true, providerMessageId: "prov-1" };

  return {
    textos,
    templates,
    porta: {
      nome: "meta_cloud",
      exigeTemplateForaDaJanela: true,
      enviarTexto: (e) => {
        textos.push(e.texto);
        return Promise.resolve(ok);
      },
      enviarTemplate: (e) => {
        templates.push(e.textoRenderizado);
        return Promise.resolve(ok);
      },
      verificarAssinatura: () => true,
      interpretarWebhook: () => ({ mensagens: [], entregas: [], destinatario: null }),
    },
  };
}

/** Semeia a conversa e, opcionalmente, a última mensagem do paciente. */
function cenario(opcoes: { entradaHaHoras?: number } = {}): void {
  semear("crc_conversations", [
    {
      id: CONVERSA,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      canal: "whatsapp",
      contato_externo: "5511999998888",
    },
  ]);
  semear("crc_patients", [
    { id: PACIENTE, organization_id: ORG, clinic_id: CLINICA, nome: "Maria", opt_out_em: null },
  ]);

  if (opcoes.entradaHaHoras !== undefined) {
    semear("crc_messages", [
      {
        id: "55555555-5555-4555-8555-555555555555",
        organization_id: ORG,
        conversation_id: CONVERSA,
        // O valor REAL do schema. Era aqui que o teste antigo mentia.
        direcao: "ENTRADA",
        remetente: "paciente",
        conteudo: "Oi, posso remarcar?",
        nota_interna: false,
        criado_em: new Date(AGORA.getTime() - opcoes.entradaHaHoras * 3_600_000).toISOString(),
      },
    ]);
  }
}

const envio = (porta: PortaMensageria, mudancas: Record<string, unknown> = {}) => ({
  organizationId: ORG,
  clinicId: CLINICA,
  patientId: PACIENTE,
  conversationId: CONVERSA,
  telefone: "5511999998888",
  texto: "Certo, consigo te ajudar com isso.",
  chaveDedupe: `teste:${String(Math.random())}`,
  remetente: "ia" as const,
  // Resposta, não contato proativo: não passa pela política de horário.
  proativo: false,
  porta,
  agora: AGORA,
  ...mudancas,
});

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

describe("dentro da janela de 24 horas", () => {
  it("o paciente escreveu há 1 hora: o texto livre SAI", async () => {
    cenario({ entradaHaHoras: 1 });
    const espia = portaOficial();

    const r = await enviarMensagem(envio(espia.porta));

    expect(r.ok, r.ok ? "" : `${r.codigo}: ${r.motivo}`).toBe(true);
    expect(espia.textos).toHaveLength(1);
    expect(espia.templates).toHaveLength(0);
  });

  it("23 horas ainda está dentro", async () => {
    cenario({ entradaHaHoras: 23 });
    const espia = portaOficial();

    expect((await enviarMensagem(envio(espia.porta))).ok).toBe(true);
    expect(espia.textos).toHaveLength(1);
  });
});

describe("fora da janela", () => {
  it("o paciente escreveu há 30 horas: texto livre é RECUSADO", async () => {
    cenario({ entradaHaHoras: 30 });
    const espia = portaOficial();

    const r = await enviarMensagem(envio(espia.porta));

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.codigo).toBe("fora_da_janela_sem_template");
    // Nada saiu por nenhum dos dois caminhos: recusar é recusar.
    expect(espia.textos).toHaveLength(0);
    expect(espia.templates).toHaveLength(0);
  });

  it("com modelo aprovado na Meta, sai como template", async () => {
    cenario({ entradaHaHoras: 30 });
    const espia = portaOficial();

    const r = await enviarMensagem(envio(espia.porta, { providerNome: "lembrete_consulta_v1" }));

    expect(r.ok, r.ok ? "" : `${r.codigo}: ${r.motivo}`).toBe(true);
    expect(espia.templates).toHaveLength(1);
    expect(espia.textos).toHaveLength(0);
  });

  it("conversa sem nenhuma mensagem do paciente é tratada como fora da janela", async () => {
    // É o caso do primeiro contato proativo: ninguém escreveu ainda.
    cenario();
    const espia = portaOficial();

    const r = await enviarMensagem(envio(espia.porta));
    expect(r.ok).toBe(false);
    expect(espia.textos).toHaveLength(0);
  });

  it("mensagem da CLÍNICA não abre a janela", async () => {
    /*
     * O bug anterior fazia toda mensagem parecer da clínica. Este caso é o
     * espelho: uma conversa em que só a clínica falou não pode abrir a janela,
     * senão o sistema manda texto livre para quem nunca respondeu.
     */
    cenario();
    semear("crc_messages", [
      {
        id: "66666666-6666-4666-8666-666666666666",
        organization_id: ORG,
        conversation_id: CONVERSA,
        direcao: "SAIDA",
        remetente: "ia",
        conteudo: "Oi! Tudo bem?",
        nota_interna: false,
        criado_em: new Date(AGORA.getTime() - 3_600_000).toISOString(),
      },
    ]);

    const espia = portaOficial();
    const r = await enviarMensagem(envio(espia.porta));

    expect(r.ok).toBe(false);
    expect(espia.textos).toHaveLength(0);
  });
});

describe("o provedor que não exige template", () => {
  it("sandbox manda texto livre mesmo fora da janela", async () => {
    // A janela é capacidade DO CANAL, e não regra global do CRC. Um provedor que
    // não a tem não deve ser barrado por ela.
    cenario({ entradaHaHoras: 30 });
    const espia = portaOficial();
    const sandbox: PortaMensageria = { ...espia.porta, exigeTemplateForaDaJanela: false };

    const r = await enviarMensagem(envio(sandbox));
    expect(r.ok).toBe(true);
    expect(espia.textos).toHaveLength(1);
  });
});
