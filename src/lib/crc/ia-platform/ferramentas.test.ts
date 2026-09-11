/**
 * Testes da política de ferramentas e do laço.
 *
 * O QUE ESTES TESTES PROTEGEM é a frase que sustenta as Fatias 3 e 4:
 * **o modelo escolhe, o executor autoriza.** Cada caso aqui passa uma escolha
 * do modelo e afirma o que a política faz com ela — sem banco, sem provedor,
 * sem rede.
 *
 * O caso que mais importa é o das três travas do Dental Office: elas já existem
 * em `aplicacao/agendamento.ts`, e a política as repete de propósito. O teste
 * garante que a repetição não se perdeu num refactor — porque o dia em que ela
 * se perder, o agente marca consulta com o writeback desligado.
 */
import { describe, expect, it } from "vitest";

import {
  avaliarPolitica,
  catalogoParaOModelo,
  MAX_FERRAMENTAS_POR_TURNO,
  type EstadoPolitica,
} from "./ferramentas";
import { interpretarDecisao, rodarLaco, MAX_PASSOS } from "./laco";

const FECHADA: EstadoPolitica = {
  escritaLiberada: false,
  writebackLiberado: false,
  agendamentoAutonomo: false,
  escritasDentalOfficePausadas: false,
  ferramentasUsadas: 0,
};

const ABERTA: EstadoPolitica = {
  escritaLiberada: true,
  writebackLiberado: true,
  agendamentoAutonomo: true,
  escritasDentalOfficePausadas: false,
  ferramentasUsadas: 0,
};

describe("a política decide, e não o prompt", () => {
  it("leitura passa mesmo com tudo desligado", () => {
    // É o ponto da Fatia 3: ler é seguro, e não depende de nenhuma trava.
    for (const f of ["paciente.resumo", "agenda.horarios_livres", "clinica.informacoes"]) {
      expect(avaliarPolitica(f, FECHADA).permite, f).toBe(true);
    }
  });

  it("escrita é barrada com a trava do agente desligada", () => {
    const r = avaliarPolitica("agenda.oferecer", FECHADA);
    expect(r.permite).toBe(false);
    if (!r.permite) expect(r.codigo).toBe("escrita_desligada");
  });

  it("ferramenta inventada pelo modelo é recusada pelo nome", () => {
    const r = avaliarPolitica("paciente.apagar_tudo", ABERTA);
    expect(r.permite).toBe(false);
    if (!r.permite) expect(r.codigo).toBe("ferramenta_desconhecida");
  });

  it("o teto de ferramentas por turno barra a quinta", () => {
    const r = avaliarPolitica("paciente.resumo", {
      ...ABERTA,
      ferramentasUsadas: MAX_FERRAMENTAS_POR_TURNO,
    });
    expect(r.permite).toBe(false);
    if (!r.permite) expect(r.codigo).toBe("teto_de_ferramentas");
  });
});

describe("as três travas do Dental Office valem para o agente", () => {
  it("o kill switch de escritas barra antes de tudo", () => {
    const r = avaliarPolitica("agenda.aceitar", {
      ...ABERTA,
      escritasDentalOfficePausadas: true,
    });
    expect(r.permite).toBe(false);
    if (!r.permite) expect(r.codigo).toBe("kill_escritas_do");
  });

  it("sem writeback, o agente não marca consulta", () => {
    const r = avaliarPolitica("agenda.aceitar", { ...ABERTA, writebackLiberado: false });
    expect(r.permite).toBe(false);
    if (!r.permite) expect(r.codigo).toBe("writeback_desligado");
  });

  it("sem agendamento autônomo, quem marca é a recepção", () => {
    const r = avaliarPolitica("agenda.aceitar", { ...ABERTA, agendamentoAutonomo: false });
    expect(r.permite).toBe(false);
    if (!r.permite) expect(r.codigo).toBe("agendamento_autonomo_desligado");
  });

  it("com as três ligadas, aí sim passa", () => {
    expect(avaliarPolitica("agenda.aceitar", ABERTA).permite).toBe(true);
  });
});

describe("o catálogo mostrado ao modelo", () => {
  it("esconde o que a política negaria", () => {
    // Mostrar ferramenta que a trava vai negar produz tentativa desperdiçada e,
    // pior, resposta que promete o que não vai acontecer.
    const texto = catalogoParaOModelo(FECHADA);
    expect(texto).toContain("agenda.horarios_livres");
    expect(texto).not.toContain("agenda.aceitar");
  });

  it("mostra a de escrita quando ela está liberada", () => {
    expect(catalogoParaOModelo(ABERTA)).toContain("agenda.aceitar");
  });
});

describe("a leitura da decisão do modelo", () => {
  it("recusa responder sem texto", () => {
    expect(interpretarDecisao({ acao: "responder", texto: "  " }).ok).toBe(false);
  });

  it("recusa pedir humano sem motivo", () => {
    expect(interpretarDecisao({ acao: "passar_para_humano", motivo: "" }).ok).toBe(false);
  });

  it("recusa ação que não existe", () => {
    expect(interpretarDecisao({ acao: "formatar_o_banco" }).ok).toBe(false);
  });

  it("passa a escolha do paciente como argumento de agenda.aceitar", () => {
    const r = interpretarDecisao({
      acao: "usar_ferramenta",
      ferramenta: "agenda.aceitar",
      escolha: "pode ser quinta às 14",
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.decisao.acao === "usar_ferramenta") {
      expect(r.decisao.argumentos["escolha"]).toBe("pode ser quinta às 14");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* O laço                                                                     */
/* -------------------------------------------------------------------------- */

/** Um modelo de mentira que devolve uma decisão por volta, na ordem dada. */
function modeloComRoteiro(roteiro: readonly Record<string, unknown>[]) {
  let i = 0;
  const vistos: string[][] = [];
  return {
    vistos,
    decidir: (observacoes: readonly string[]) => {
      vistos.push([...observacoes]);
      const d = roteiro[Math.min(i, roteiro.length - 1)];
      i += 1;
      return Promise.resolve({ ok: true as const, dados: d ?? {} });
    },
  };
}

const executorFake = {
  ctx: {
    organizationId: "org",
    clinicId: null,
    conversationId: "conv",
    agora: new Date("2026-09-11T12:00:00.000Z"),
    paciente: null,
    oportunidade: null,
    oferta: null,
    mensagens: [],
    memorias: [],
    resumo: null,
    intencao: null,
    temperatura: null,
  },
  contextoAgendamento: () => Promise.resolve(null),
};

describe("o laço não roda solto", () => {
  it("devolve a resposta quando o modelo decide responder", async () => {
    const m = modeloComRoteiro([{ acao: "responder", texto: "Oi!", precisaHumano: false }]);
    const r = await rodarLaco({ decidir: m.decidir, estado: FECHADA, executor: executorFake });
    expect(r.tipo).toBe("responder");
  });

  it("informa o modelo quando a política barra a ferramenta", async () => {
    const m = modeloComRoteiro([
      { acao: "usar_ferramenta", ferramenta: "agenda.aceitar", escolha: "quinta" },
      { acao: "responder", texto: "Vou passar para a recepção.", precisaHumano: false },
    ]);
    const r = await rodarLaco({ decidir: m.decidir, estado: FECHADA, executor: executorFake });

    expect(r.tipo).toBe("responder");
    // A segunda volta PRECISA saber que a primeira foi barrada — senão o modelo
    // responde como se a consulta tivesse sido marcada.
    expect(m.vistos[1]?.join("\n")).toContain("não pode ser usada");
    expect(r.passos[0]?.bloqueadoPor).toBe("escrita_desligada");
  });

  it("não deixa o modelo chamar a mesma coisa em laço", async () => {
    const m = modeloComRoteiro([
      { acao: "usar_ferramenta", ferramenta: "paciente.resumo" },
      { acao: "usar_ferramenta", ferramenta: "paciente.resumo" },
      { acao: "responder", texto: "Pronto.", precisaHumano: false },
    ]);
    const r = await rodarLaco({ decidir: m.decidir, estado: ABERTA, executor: executorFake });
    expect(r.tipo).toBe("responder");
    expect(r.passos.filter((p) => p.bloqueadoPor === "repeticao")).toHaveLength(1);
  });

  it("estourar o teto de passos vira caso humano, não silêncio", async () => {
    // O modelo teimando em usar ferramenta e nunca respondendo. Note que cada
    // volta muda o argumento, então a guarda de repetição não pega — quem pega
    // é o teto.
    let n = 0;
    const r = await rodarLaco({
      decidir: () => {
        n += 1;
        return Promise.resolve({
          ok: true as const,
          dados: {
            acao: "usar_ferramenta",
            ferramenta: "agenda.aceitar",
            escolha: `op ${String(n)}`,
          },
        });
      },
      estado: ABERTA,
      executor: executorFake,
    });
    expect(r.tipo).toBe("humano");
    if (r.tipo === "humano") expect(r.motivo).toContain(String(MAX_PASSOS));
  });

  it("modelo indisponível vira falha nomeada", async () => {
    const r = await rodarLaco({
      decidir: () => Promise.resolve({ ok: false as const, detalhe: "timeout" }),
      estado: ABERTA,
      executor: executorFake,
    });
    expect(r.tipo).toBe("falha");
  });
});
