/**
 * Testes do supervisor.
 *
 * O QUE ESTE ARQUIVO PROVA, na ordem em que importa:
 *
 *   O SUPERVISOR NÃO VIRA UM SEGUNDO AGENTE. Ele recebe uma porta de IA e mais
 *   nada — nenhuma porta de mensageria, nenhum executor de ferramenta. O teste
 *   de envio zero é feito pelo caminho do turno; aqui a garantia é estrutural, e
 *   o que se verifica é que ele escreve em DUAS tabelas e em nenhuma outra.
 *
 *   ELE NÃO PAGA DUAS VEZES PELO MESMO EVENTO. Um evento reprocessado não tem
 *   run nova, e sem run nova o supervisor não roda. O teste conta chamadas de
 *   modelo, que é o que aparece na fatura.
 *
 *   O QUE ELE PROPÕE PASSA PELO DOMÍNIO. Ele pode propor "não tem dinheiro" — e
 *   o que o banco guarda é a recusa, não a frase.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined };
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import type { PedidoIa, PortaIa, RespostaIa } from "../integracoes/ia/porta";
import { interpretarLeitura, supervisionarTurno, PROMPT_SUPERVISOR } from "./supervisor";
import { rodarTurno } from "./turno";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const PACIENTE = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const RUN = "88888888-8888-4888-8888-888888888888";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const uso = {
  modelo: "fake-1",
  inputTokens: 100,
  outputTokens: 40,
  custoEstimado: 0.004,
  duracaoMs: 12,
};

/** A leitura completa, com os campos que o esquema exige. */
const leituraCrua = (mudancas: Record<string, unknown> = {}): Record<string, unknown> => ({
  resolvido: true,
  intencao: "remarcar",
  desfecho: "Ofereceu horário novo.",
  objecao: null,
  sentimento: "neutro",
  precisaHumano: false,
  precisaFollowup: false,
  notaQualidade: 8,
  violacoes: [],
  memorias: [],
  ...mudancas,
});

function portaDoSupervisor(dados: Record<string, unknown>): PortaIa {
  return {
    nome: "fake",
    modelo: "fake-1",
    gerarEstruturado: () => Promise.resolve({ ok: true, dados, uso } as RespostaIa),
  };
}

const pedido = (porta: PortaIa) => ({
  organizationId: ORG,
  conversationId: CONVERSA,
  patientId: PACIENTE,
  runId: RUN,
  agora: AGORA,
  porta,
  resultado: { tipo: "candidato" as const, texto: "Claro, posso ver aqui.", motivo: "sombra" },
  respostaDoAgente: "Claro, posso ver aqui.",
  mensagens: [
    { direcao: "recebida" as const, texto: "Só consigo depois das 17h", em: AGORA.toISOString() },
  ],
});

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_ai_runs", [{ id: RUN, organization_id: ORG, conversation_id: CONVERSA }]);
});

/* -------------------------------------------------------------------------- */

describe("a leitura não confia em nenhum campo do modelo", () => {
  it("descarta violação que não está na lista fechada", () => {
    const l = interpretarLeitura(
      leituraCrua({ violacoes: ["prometeu_sem_acao", "inventei_essa"] }),
    );
    expect(l.violacoes).toEqual(["prometeu_sem_acao"]);
  });

  it("nota fora de 0 a 10 vira null em vez de entrar torta", () => {
    expect(interpretarLeitura(leituraCrua({ notaQualidade: 42 })).notaQualidade).toBeNull();
    expect(interpretarLeitura(leituraCrua({ notaQualidade: "oito" })).notaQualidade).toBeNull();
  });

  it("campo ausente não derruba a leitura inteira", () => {
    // Recusar a análise por causa de um campo perderia a análise boa junto.
    const l = interpretarLeitura({ resolvido: true });
    expect(l.resolvido).toBe(true);
    expect(l.intencao).toBeNull();
    expect(l.memorias).toEqual([]);
  });

  it("memória sem conteúdo é descartada antes de chegar ao domínio", () => {
    const l = interpretarLeitura(
      leituraCrua({ memorias: [{ escopo: "paciente", conteudo: "", confianca: 1 }] }),
    );
    expect(l.memorias).toEqual([]);
  });

  it("confiança fora de faixa é aparada, não recusada", () => {
    const l = interpretarLeitura(
      leituraCrua({
        memorias: [{ escopo: "paciente", conteudo: "Prefere de tarde", confianca: 7 }],
      }),
    );
    expect(l.memorias[0]?.confianca).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("o que o supervisor grava", () => {
  it("grava a supervisão do turno com a leitura estruturada", async () => {
    const r = await supervisionarTurno(pedido(portaDoSupervisor(leituraCrua())));
    expect(r.ok).toBe(true);

    const linha = conteudo("crc_ai_supervisoes")[0];
    expect(linha?.["run_id"]).toBe(RUN);
    expect(linha?.["intencao"]).toBe("remarcar");
    expect(Number(linha?.["nota_qualidade"])).toBe(8);
  });

  it("grava a memória que a pessoa disse", async () => {
    await supervisionarTurno(
      pedido(
        portaDoSupervisor(
          leituraCrua({
            memorias: [
              { escopo: "paciente", conteudo: "Prefere horários depois das 17h", confianca: 0.95 },
            ],
          }),
        ),
      ),
    );

    const m = conteudo("crc_ai_memories")[0];
    expect(m?.["conteudo"]).toBe("Prefere horários depois das 17h");
    expect(m?.["status"]).toBe("ATIVA");
    expect(m?.["subject_id"]).toBe(PACIENTE);
    // A run, e não a conversa: é o que permite abrir o trace exato em que a
    // frase foi extraída.
    expect(m?.["origem_ref"]).toBe(`run:${RUN}`);
  });

  it("o rótulo que ele propõe NÃO entra, e a recusa fica contada", async () => {
    const r = await supervisionarTurno(
      pedido(
        portaDoSupervisor(
          leituraCrua({
            memorias: [
              { escopo: "paciente", conteudo: "Prefere de tarde", confianca: 0.9 },
              { escopo: "paciente", conteudo: "Não tem dinheiro", confianca: 0.9 },
            ],
          }),
        ),
      ),
    );

    expect(conteudo("crc_ai_memories")).toHaveLength(1);
    expect(r.ok && r.memoriasRecusadas).toBe(1);
    // O par de números é o alarme de degradação do prompt de extração.
    expect(Number(conteudo("crc_ai_supervisoes")[0]?.["memorias_recusadas"])).toBe(1);
  });

  it("memória de clínica não cola no paciente", async () => {
    await supervisionarTurno(
      pedido(
        portaDoSupervisor(
          leituraCrua({
            memorias: [
              { escopo: "organizacao", conteudo: "Fechamos ao meio-dia na sexta", confianca: 0.9 },
            ],
          }),
        ),
      ),
    );
    expect(conteudo("crc_ai_memories")[0]?.["subject_id"]).toBeNull();
  });

  it("um supervisor por turno: rodar de novo não grava segunda linha", async () => {
    const porta = portaDoSupervisor(leituraCrua());
    await supervisionarTurno(pedido(porta));
    await supervisionarTurno(pedido(porta));
    expect(conteudo("crc_ai_supervisoes")).toHaveLength(1);
  });

  it("modelo indisponível devolve motivo e não grava nada", async () => {
    const porta: PortaIa = {
      nome: "fake",
      modelo: "fake-1",
      gerarEstruturado: () =>
        Promise.resolve({
          ok: false,
          motivo: "indisponivel",
          detalhe: "504",
          uso: null,
        } as RespostaIa),
    };

    const r = await supervisionarTurno(pedido(porta));
    expect(r.ok).toBe(false);
    expect(conteudo("crc_ai_supervisoes")).toHaveLength(0);
    expect(conteudo("crc_ai_memories")).toHaveLength(0);
  });

  it("porta que explode não propaga a exceção", async () => {
    // O turno já terminou bem. Uma leitura posterior que estoura não pode
    // alterar isso — e neste arquivo ela nem pode virar exceção.
    const porta: PortaIa = {
      nome: "fake",
      modelo: "fake-1",
      gerarEstruturado: () => {
        throw new Error("boom");
      },
    };
    const r = await supervisionarTurno(pedido(porta));
    expect(r.ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("o supervisor dentro do turno", () => {
  /** Uma porta que responde conforme o prompt e CONTA as chamadas. */
  function portaDupla(): { porta: PortaIa; chamadas: string[] } {
    const chamadas: string[] = [];
    return {
      chamadas,
      porta: {
        nome: "fake",
        modelo: "fake-1",
        gerarEstruturado: (p: PedidoIa) => {
          chamadas.push(p.promptVersao);
          const dados =
            p.promptVersao === PROMPT_SUPERVISOR
              ? leituraCrua({
                  memorias: [
                    { escopo: "paciente", conteudo: "Só pode depois das 17h", confianca: 0.95 },
                  ],
                })
              : // Inofensiva de propósito: "vou verificar e te falo" seria
                // barrada pelo portão de promessa, e o desfecho viraria
                // `humano` — o que testaria o portão, não o supervisor.
                { acao: "responder", texto: "Certo, obrigada por avisar.", precisaHumano: false };
          return Promise.resolve({ ok: true, dados, uso } as RespostaIa);
        },
      },
    };
  }

  const politicaFechada = {
    escritaLiberada: false,
    writebackLiberado: false,
    agendamentoAutonomo: false,
    escritasDentalOfficePausadas: false,
    ferramentasUsadas: 0,
  };

  beforeEach(() => {
    semear("crc_conversations", [
      {
        id: CONVERSA,
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        contato_externo: "5511999998888",
      },
    ]);
    semear("crc_patients", [
      { id: PACIENTE, organization_id: ORG, nome: "Maria Souza", opt_out_em: null },
    ]);
    semear("crc_messages", [
      {
        id: "55555555-5555-4555-8555-555555555555",
        organization_id: ORG,
        conversation_id: CONVERSA,
        direcao: "ENTRADA",
        conteudo: "Só consigo depois das 17h",
        nota_interna: false,
        criado_em: new Date(AGORA.getTime() - 60_000).toISOString(),
      },
    ]);
  });

  const turno = (porta: PortaIa, supervisionar: boolean, eventoId = "evt-1") => ({
    organizationId: ORG,
    conversationId: CONVERSA,
    eventoId,
    agora: AGORA,
    porta,
    podeEnviar: false,
    politica: politicaFechada,
    supervisionar,
  });

  it("sem a flag, o supervisor não roda e não custa nada", async () => {
    const { porta, chamadas } = portaDupla();
    await rodarTurno(turno(porta, false));

    expect(chamadas).toHaveLength(1);
    expect(conteudo("crc_ai_supervisoes")).toHaveLength(0);
  });

  it("com a flag, roda depois do desfecho e grava memória", async () => {
    const { porta, chamadas } = portaDupla();
    const r = await rodarTurno(turno(porta, true));

    // O desfecho do turno é o mesmo: o supervisor observa, não interfere.
    expect(r.tipo).toBe("candidato");
    expect(chamadas).toEqual(["agent_shadow_turn_v1", PROMPT_SUPERVISOR]);
    expect(conteudo("crc_ai_supervisoes")).toHaveLength(1);
    expect(conteudo("crc_ai_memories")[0]?.["conteudo"]).toBe("Só pode depois das 17h");
  });

  it("evento reprocessado não paga o supervisor de novo", async () => {
    const { porta, chamadas } = portaDupla();
    await rodarTurno(turno(porta, true));
    await rodarTurno(turno(porta, true));

    // A segunda passagem ainda chama o modelo do TURNO — a dedupe da run só é
    // conhecida na gravação, no fim. Mas o supervisor, que depende da run nova,
    // não roda: três chamadas, não quatro.
    expect(chamadas.filter((c) => c === PROMPT_SUPERVISOR)).toHaveLength(1);
    expect(conteudo("crc_ai_supervisoes")).toHaveLength(1);
  });

  it("a memória gravada volta no contexto do turno seguinte", async () => {
    const { porta } = portaDupla();
    await rodarTurno(turno(porta, true));

    const { montarContextoDoTurno, textoDoContexto } = await import("./contexto");
    const ctx = await montarContextoDoTurno(ORG, CONVERSA, AGORA);
    expect(ctx).not.toBeNull();
    if (ctx === null) return;

    expect(ctx.memorias.map((m) => m.conteudo)).toContain("Só pode depois das 17h");
    // E chega rotulada como "dito antes", com a proibição de ser recitada.
    const texto = textoDoContexto(ctx);
    expect(texto).toContain("já disse em outras conversas");
    expect(texto).toContain("NÃO cite que você tem isso anotado");
  });
});
