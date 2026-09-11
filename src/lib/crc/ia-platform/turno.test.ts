/**
 * Testes do turno do agente.
 *
 * O QUE ESTES TESTES PRECISAM PROVAR, e é a razão de a Fatia 1 existir:
 * **nada sai**. Um runtime agentic que "quase" não envia é pior do que nenhum,
 * porque dá confiança para ligá-lo.
 *
 * Por isso a porta de mensageria usada aqui CONTA os envios e o teste afirma
 * zero. Se alguém adicionar um caminho de envio no futuro sem passar pelas duas
 * flags, este arquivo quebra — que é exatamente o serviço que ele presta.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// O banco em memória no lugar do PostgREST. `contexto.ts` e `tracing.ts`
// importam `servidor/banco` — um estaticamente, o outro por `await import()` —
// e o mock cobre os dois caminhos.
vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined };
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { rodarTurno } from "./turno";
import type { PortaIa, RespostaIa } from "../integracoes/ia/porta";
import type { PortaMensageria, ResultadoEnvio } from "../integracoes/whatsapp/porta";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const PACIENTE = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

/** Uma porta de IA que devolve o que o teste mandar. */
function portaFake(resposta: RespostaIa): PortaIa {
  return {
    nome: "fake",
    modelo: "fake-1",
    gerarEstruturado: () => Promise.resolve(resposta),
  };
}

const usoZerado = {
  modelo: "fake-1",
  inputTokens: 100,
  outputTokens: 40,
  custoEstimado: 0.004,
  duracaoMs: 12,
};

function respostaOk(dados: Record<string, unknown>): RespostaIa {
  return { ok: true, dados, uso: usoZerado };
}

/** Porta de mensageria que registra tudo que tentarem enviar por ela. */
function mensageriaEspia(): { porta: PortaMensageria; enviadas: string[] } {
  const enviadas: string[] = [];
  const ok: ResultadoEnvio = { ok: true, providerMessageId: "prov-1" };
  return {
    enviadas,
    porta: {
      nome: "sandbox",
      exigeTemplateForaDaJanela: false,
      enviarTexto: (e) => {
        enviadas.push(e.texto);
        return Promise.resolve(ok);
      },
      enviarTemplate: (e) => {
        enviadas.push(e.textoRenderizado);
        return Promise.resolve(ok);
      },
      verificarAssinatura: () => true,
      interpretarWebhook: () => ({ mensagens: [], entregas: [] }),
    },
  };
}

function montarCenario(opcoes: { optOut?: boolean } = {}): void {
  semear("crc_conversations", [
    {
      id: CONVERSA,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      telefone: "5511999998888",
      resumo_ia: "Quer remarcar.",
      intencao: "REMARCAR",
      temperatura: "morna",
    },
  ]);
  semear("crc_patients", [
    {
      id: PACIENTE,
      organization_id: ORG,
      nome: "Maria Souza",
      situacao: "em tratamento",
      opt_out_em: opcoes.optOut === true ? AGORA.toISOString() : null,
    },
  ]);
  semear("crc_messages", [
    {
      id: "55555555-5555-4555-8555-555555555555",
      organization_id: ORG,
      conversation_id: CONVERSA,
      direcao: "IN",
      conteudo: "Oi, posso remarcar minha consulta?",
      nota_interna: false,
      criado_em: new Date(AGORA.getTime() - 60_000).toISOString(),
    },
  ]);
}

/** Tudo desligado: o estado em que o CRC nasce. */
const POLITICA_FECHADA = {
  escritaLiberada: false,
  writebackLiberado: false,
  agendamentoAutonomo: false,
  escritasDentalOfficePausadas: false,
  ferramentasUsadas: 0,
};

const pedidoBase = (porta: PortaIa) => ({
  organizationId: ORG,
  conversationId: CONVERSA,
  eventoId: "evt-1",
  agora: AGORA,
  porta,
  podeEnviar: false,
  politica: POLITICA_FECHADA,
});

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  montarCenario();
});

describe("o turno de sombra não envia nada", () => {
  it("grava a resposta candidata e NÃO entrega ao paciente", async () => {
    const espia = mensageriaEspia();
    const r = await rodarTurno({
      ...pedidoBase(
        portaFake(
          respostaOk({
            acao: "responder",
            texto: "Claro, Maria! Vou ver o que temos.",
            precisaHumano: false,
          }),
        ),
      ),
      portaMensageria: espia.porta,
    });

    expect(r.tipo).toBe("candidato");
    // A afirmação que dá sentido à fatia inteira.
    expect(espia.enviadas).toHaveLength(0);

    const runs = conteudo("crc_ai_runs");
    expect(runs).toHaveLength(1);
    expect(runs[0]?.["resultado"]).toBe("candidato");
    expect(runs[0]?.["resposta_candidata"]).toContain("Maria");
    expect(runs[0]?.["custo_estimado"]).toBe(0.004);
  });

  it("registra o trace por etapa", async () => {
    await rodarTurno(
      pedidoBase(
        portaFake(
          respostaOk({
            acao: "responder",
            texto: "Bom dia! Vi sua mensagem.",
            precisaHumano: false,
          }),
        ),
      ),
    );
    const spans = conteudo("crc_ai_spans");
    expect(spans.length).toBeGreaterThanOrEqual(2);
    expect(spans.map((s) => s["nome"])).toContain("contexto");
    expect(spans.map((s) => s["nome"])).toContain("laco");
  });

  it("não roda duas vezes para o mesmo evento", async () => {
    const porta = portaFake(
      respostaOk({
        texto: "Oi, Maria!",
        raciocinio: "x",
        precisaHumano: false,
        motivoHumano: null,
      }),
    );
    await rodarTurno(pedidoBase(porta));
    await rodarTurno(pedidoBase(porta));
    // A chave de dedupe é o id do evento: reprocessar não duplica a run.
    expect(conteudo("crc_ai_runs")).toHaveLength(1);
  });
});

describe("o turno protege o paciente antes de gastar modelo", () => {
  it("nem chama o modelo quando o paciente pediu opt-out", async () => {
    limparBanco();
    definirRelogio(AGORA);
    montarCenario({ optOut: true });

    let chamou = false;
    const porta: PortaIa = {
      nome: "fake",
      modelo: "fake-1",
      gerarEstruturado: () => {
        chamou = true;
        return Promise.resolve(respostaOk({ acao: "responder", texto: "oi" }));
      },
    };

    const r = await rodarTurno(pedidoBase(porta));
    expect(chamou).toBe(false);
    expect(r.tipo).toBe("sem_acao");
  });

  it("falha do modelo vira desfecho nomeado, não exceção", async () => {
    const r = await rodarTurno(
      pedidoBase(portaFake({ ok: false, motivo: "indisponivel", detalhe: "timeout", uso: null })),
    );
    expect(r.tipo).toBe("falha_segura");
    expect(conteudo("crc_ai_runs")[0]?.["resultado"]).toBe("falha_segura");
  });

  it("resposta inválida do modelo não vira mensagem", async () => {
    const espia = mensageriaEspia();
    const r = await rodarTurno({
      ...pedidoBase(portaFake(respostaOk({ acao: "responder", texto: "", precisaHumano: false }))),
      portaMensageria: espia.porta,
      podeEnviar: true,
    });
    expect(r.tipo).toBe("falha_segura");
    expect(espia.enviadas).toHaveLength(0);
  });
});

describe("os portões barram antes do envio", () => {
  const comEnvio = (porta: PortaIa, espia: ReturnType<typeof mensageriaEspia>) => ({
    ...pedidoBase(porta),
    portaMensageria: espia.porta,
    podeEnviar: true,
  });

  it("conteúdo clínico vira caso humano, e nada sai", async () => {
    const espia = mensageriaEspia();
    const r = await rodarTurno(
      comEnvio(
        portaFake(
          respostaOk({
            acao: "responder",
            texto: "Tome dipirona 500mg de 8 em 8 horas até a consulta.",
            precisaHumano: false,
          }),
        ),
        espia,
      ),
    );
    expect(r.tipo).toBe("humano");
    expect(espia.enviadas).toHaveLength(0);
    expect(conteudo("crc_ai_runs")[0]?.["portao_bloqueou"]).toBe("conteudo_clinico");
  });

  it("promessa sem ação não chega ao paciente", async () => {
    const espia = mensageriaEspia();
    const r = await rodarTurno(
      comEnvio(
        portaFake(
          respostaOk({
            acao: "responder",
            texto: "Vou verificar com a recepção e te retorno.",
            precisaHumano: false,
          }),
        ),
        espia,
      ),
    );
    expect(r.tipo).toBe("humano");
    expect(espia.enviadas).toHaveLength(0);
  });

  it("com as duas travas ligadas e a resposta limpa, aí sim envia", async () => {
    const espia = mensageriaEspia();
    const r = await rodarTurno(
      comEnvio(
        portaFake(
          respostaOk({
            acao: "responder",
            texto: "Oi, Maria! Vi sua mensagem, já passo para a equipe da recepção.",
            precisaHumano: false,
          }),
        ),
        espia,
      ),
    );
    expect(r.tipo).toBe("enviado");
    expect(espia.enviadas).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("o texto do agente vem do Estúdio", () => {
  /** Uma porta que guarda as instruções que recebeu. */
  function portaEspiando(): { porta: PortaIa; instrucoes: string[] } {
    const instrucoes: string[] = [];
    return {
      instrucoes,
      porta: {
        nome: "fake",
        modelo: "fake-1",
        gerarEstruturado: (p) => {
          instrucoes.push(p.instrucoes);
          return Promise.resolve(
            respostaOk({ acao: "responder", texto: "Certo, obrigada.", precisaHumano: false }),
          );
        },
      },
    };
  }

  it("sem versão publicada, usa o texto que vem no código", async () => {
    const espia = portaEspiando();
    await rodarTurno(pedidoBase(espia.porta));

    expect(espia.instrucoes[0]).toContain("JP Clínica Integrada Odontológica");
  });

  it("com versão publicada, é ELA que vai ao modelo", async () => {
    /*
     * SEM ESTE TESTE, a Fatia 10 seria uma tela que grava texto num banco que
     * ninguém lê. A injeção de defeito que trocasse `instrucoesEmUso` por uma
     * constante passaria despercebida.
     */
    semear("crc_agent_versions", [
      {
        id: "99999999-9999-4999-8999-999999999999",
        organization_id: ORG,
        versao: 1,
        status: "PUBLICADA",
        instrucoes: "Atenda em versos de cordel, e jamais fale de horário.",
      },
    ]);

    const espia = portaEspiando();
    await rodarTurno(pedidoBase(espia.porta));

    expect(espia.instrucoes[0]).toContain("versos de cordel");
    // E o texto de fábrica não vai junto: é substituição, não acréscimo.
    expect(espia.instrucoes[0]).not.toContain("JP Clínica Integrada Odontológica");
  });

  it("RASCUNHO publicado não entra: só a versão publicada", async () => {
    semear("crc_agent_versions", [
      {
        id: "88888888-8888-4888-8888-888888888888",
        organization_id: ORG,
        versao: 2,
        status: "RASCUNHO",
        instrucoes: "Atenda em versos de cordel, e jamais fale de horário.",
      },
    ]);

    const espia = portaEspiando();
    await rodarTurno(pedidoBase(espia.porta));

    expect(espia.instrucoes[0]).not.toContain("versos de cordel");
  });
});
