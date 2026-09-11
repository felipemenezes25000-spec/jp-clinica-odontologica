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

import {
  conteudo,
  definirRelogio,
  falharProximaEscrita,
  limparBanco,
  semear,
} from "../testes/banco-memoria";
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
      contato_externo: "5511999998888",
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
      direcao: "ENTRADA",
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

  it("sem idempotência garantida, o turno PARA — e o modelo não é chamado", async () => {
    /*
     * FALHA FECHADA, e o contrário disto era um P0.
     *
     * A reserva da run é o que impede o mesmo turno de rodar duas vezes. Quando
     * ela falha, a versão anterior SEGUIA em frente — o comentário justificava
     * que "não responder um paciente é pior que pagar o modelo duas vezes".
     *
     * O raciocínio ignora o efeito no mundo: sem idempotência, duas execuções
     * podem mandar DUAS MENSAGENS à pessoa, ou marcar duas consultas. E o turno
     * não se perdia — `falha_segura` faz o worker devolver o job à fila, e ele
     * roda de novo em segundos.
     *
     * `sem_acao` aqui seria o desastre silencioso: o worker CONCLUIRIA o job.
     */
    const espia = mensageriaEspia();
    let chamou = false;
    const porta: PortaIa = {
      nome: "fake",
      modelo: "fake-1",
      gerarEstruturado: () => {
        chamou = true;
        return Promise.resolve(respostaOk({ acao: "responder", texto: "oi" }));
      },
    };

    falharProximaEscrita("crc_reivindicar_ai_run");

    const r = await rodarTurno({
      ...pedidoBase(porta),
      portaMensageria: espia.porta,
      podeEnviar: true,
    });

    expect(r.tipo).toBe("falha_segura");
    expect(chamou).toBe(false);
    expect(espia.enviadas).toHaveLength(0);
  });

  it("perder a posse no MEIO do turno para o laço, e não vira falha", async () => {
    /*
     * O DEFEITO QUE ISTO TRAVA é consequência do reclaim: o lease é de 180s, e
     * um turno de cinco passos com chamada de modelo em cada um passa disso
     * ESTANDO VIVO. Outro worker então o reivindica, e os dois respondem o
     * mesmo paciente.
     *
     * O heartbeat avisa. E o desfecho é `sem_acao`, não `falha_segura`: falha
     * faria o job voltar para a fila e o turno rodar uma TERCEIRA vez, piorando
     * exatamente o problema que se quer resolver.
     */
    const espia = mensageriaEspia();
    let chamadasAoModelo = 0;
    const porta: PortaIa = {
      nome: "fake",
      modelo: "fake-1",
      gerarEstruturado: () => {
        chamadasAoModelo += 1;
        return Promise.resolve(respostaOk({ acao: "responder", texto: "oi" }));
      },
    };

    const r = await rodarTurno({
      ...pedidoBase(porta),
      portaMensageria: espia.porta,
      podeEnviar: true,
      bater: () => Promise.resolve(false),
    });

    expect(r.tipo).toBe("sem_acao");
    // E o modelo NUNCA foi chamado: parar cedo é o ponto.
    expect(chamadasAoModelo).toBe(0);
    expect(espia.enviadas).toHaveLength(0);
  });

  it("com a posse mantida, o turno roda normalmente", async () => {
    // O controle. Sem ele, um `bater` que devolvesse sempre `false` passaria no
    // teste acima e desligaria o agente inteiro sem nada acusar.
    const r = await rodarTurno({
      ...pedidoBase(portaFake(respostaOk({ acao: "responder", texto: "Claro, Maria!" }))),
      bater: () => Promise.resolve(true),
    });

    expect(r.tipo).toBe("candidato");
  });

  it("o turno que outro worker JÁ está executando encerra sem agir", async () => {
    // O outro lado da moeda: aqui `sem_acao` é o certo. Alguém está cuidando
    // disto agora, e insistir seria a execução dupla que a reserva evita.
    const { abrirTrace } = await import("./tracing");
    await abrirTrace(ORG, CONVERSA).reservar({
      chaveDedupe: "turno:evt-1",
      conversationId: CONVERSA,
      jobId: null,
      quem: "worker-1",
    });

    const r = await rodarTurno(
      pedidoBase(portaFake(respostaOk({ acao: "responder", texto: "oi" }))),
    );
    expect(r.tipo).toBe("sem_acao");
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

/* -------------------------------------------------------------------------- */

describe("a conversa chega ao modelo com os papéis certos", () => {
  it("ENTRADA vira “Paciente:” e SAIDA vira “Clínica:”", async () => {
    /*
     * O BUG QUE ESTE TESTE EXISTE PARA IMPEDIR era invisível e grave: o
     * contexto lia `direcao === "IN"`, valor que o banco nunca guardou, e TODA
     * mensagem do paciente era rotulada como se a clínica tivesse dito aquilo.
     * O agente respondia a própria fala.
     */
    semear("crc_messages", [
      {
        id: "77777777-7777-4777-8777-777777777777",
        organization_id: ORG,
        conversation_id: CONVERSA,
        direcao: "SAIDA",
        remetente: "ia",
        conteudo: "Oi! Como posso ajudar?",
        nota_interna: false,
        criado_em: new Date(AGORA.getTime() - 120_000).toISOString(),
      },
    ]);

    const entradas: string[] = [];
    const porta: PortaIa = {
      nome: "fake",
      modelo: "fake-1",
      gerarEstruturado: (p) => {
        entradas.push(p.entrada);
        return Promise.resolve(
          respostaOk({ acao: "responder", texto: "Certo, obrigada.", precisaHumano: false }),
        );
      },
    };

    await rodarTurno(pedidoBase(porta));

    const contexto = entradas[0] ?? "";
    expect(contexto).toContain("Paciente: Oi, posso remarcar minha consulta?");
    expect(contexto).toContain("Clínica: Oi! Como posso ajudar?");
    // E o inverso NÃO pode aparecer: era exatamente isso que o bug produzia.
    expect(contexto).not.toContain("Clínica: Oi, posso remarcar");
  });
});

/* ========================================================================== */
/* A IA pausada — o furo que a Fase C fechou                                  */
/* ========================================================================== */

/**
 * O DEFEITO, em uma frase: "abrir caso cala a IA" não estava sendo cumprido.
 *
 * `abrirCaso` chama `pausarIaNaConversa`, que grava `dono = "ninguem"`. E o
 * portão de dono recusava apenas `dono = "humano"` — `"ninguem"` PASSAVA. Ou
 * seja: toda conversa que o agente mandou para uma pessoa voltava a receber
 * resposta automática no turno seguinte, desfazendo na prática a própria
 * decisão de escalar. Ninguém tinha assumido ainda; a IA falava por cima da
 * fila da recepção.
 *
 * Duas travas fecham isso, e as duas são testadas aqui:
 *
 *   O PORTÃO passou a ser lista de permissão — só `ia` passa. Um estado novo de
 *   dono nasce barrado em vez de nascer liberado.
 *
 *   O CHOKEPOINT recusa o mesmo caso em `enviarMensagem`, para quem chegar lá
 *   por outro caminho.
 */
describe("conversa com a IA pausada", () => {
  const comEnvio = (porta: PortaIa, espia: ReturnType<typeof mensageriaEspia>) => ({
    ...pedidoBase(porta),
    portaMensageria: espia.porta,
    podeEnviar: true,
  });

  const respostaLimpa = () =>
    respostaOk({
      acao: "responder",
      texto: "Oi, Maria! Vi sua mensagem, já passo para a equipe da recepção.",
      precisaHumano: false,
    });

  it("não responde depois que um caso humano foi aberto", async () => {
    const espia = mensageriaEspia();

    // É EXATAMENTE O QUE `abrirCaso` faz. Não é um estado inventado para o
    // teste: é o estado em que toda conversa escalada fica.
    const { pausarIaNaConversa } = await import("../aplicacao/casos");
    await pausarIaNaConversa(ORG, CONVERSA);

    const r = await rodarTurno(comEnvio(portaFake(respostaLimpa()), espia));

    expect(espia.enviadas).toHaveLength(0);
    expect(r.tipo).toBe("sem_acao");
    // Quem barrou fica no trace: sem isso, "a IA não respondeu" seria
    // indistinguível de "a IA não teve o que dizer".
    expect(conteudo("crc_ai_runs")[0]?.["portao_bloqueou"]).toBe("dono_da_conversa");
    expect("motivo" in r ? r.motivo : "").toContain("pausada");
  });

  it("volta a responder quando a conversa é devolvida para a IA", async () => {
    const espia = mensageriaEspia();
    const { devolverParaIa, pausarIaNaConversa } = await import("../aplicacao/casos");
    await pausarIaNaConversa(ORG, CONVERSA);
    await devolverParaIa(ORG, CONVERSA);

    const r = await rodarTurno(comEnvio(portaFake(respostaLimpa()), espia));

    // A trava é reversível por ato explícito — senão ela viraria um jeito de
    // desligar o agente sem querer e para sempre.
    expect(r.tipo).toBe("enviado");
    expect(espia.enviadas).toHaveLength(1);
  });

  it("o chokepoint recusa sozinho, sem depender do portão", async () => {
    // Sem passar pelo turno: é o caminho de quem chamar `enviarMensagem`
    // diretamente — a campanha, o reprocessamento, a tela nova.
    const espia = mensageriaEspia();
    const { pausarIaNaConversa } = await import("../aplicacao/casos");
    await pausarIaNaConversa(ORG, CONVERSA);

    const { enviarMensagem } = await import("../aplicacao/mensagens");
    const r = await enviarMensagem({
      organizationId: ORG,
      clinicId: CLINICA,
      patientId: PACIENTE,
      conversationId: CONVERSA,
      telefone: "5511999998888",
      texto: "Oi!",
      chaveDedupe: "fora-do-turno:1",
      remetente: "ia",
      proativo: false,
      porta: espia.porta,
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, codigo: "IA_PAUSADA", permanente: true });
    expect(espia.enviadas).toHaveLength(0);
  });
});
