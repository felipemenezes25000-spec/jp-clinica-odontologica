/**
 * Next Best Action — e o que estes testes protegem é a POLÍTICA, não a escolha.
 *
 * ============================================================================
 *  A ORDEM DAS PERGUNTAS EM `decidir()` É A POLÍTICA DE CONTATO DA CLÍNICA.
 *
 *  Trocar dois blocos de lugar não é refatoração: é mudar quem pode ser
 *  contatado. Os testes de PRECEDÊNCIA abaixo existem para que essa troca
 *  quebre alto, em vez de virar uma mensagem para alguém que pediu silêncio.
 *
 *  E o teste que mais importa é o primeiro: opt-out encerra. Não adia, não
 *  rebaixa, não tenta outro canal.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  decidir,
  podeSairSozinho,
  temEfeitoExterno,
  VALOR_QUE_JUSTIFICA_LIGACAO,
  type ContextoDaDecisao,
} from "./melhor-acao";

function ctx(parcial: Partial<ContextoDaDecisao> = {}): ContextoDaDecisao {
  return {
    tipo: "BUDGET_RECOVERY",
    optOut: false,
    horasDesdeUltimoContato: null,
    cooldownHoras: 24,
    dentroDoHorario: true,
    contatosHoje: 0,
    contatosPorDia: 1,
    temCanal: true,
    janelaAberta: false,
    tentativasSemResposta: 0,
    tentativasMaximas: 3,
    respondeu: false,
    intencaoAgendar: false,
    temConsultaFutura: false,
    objecao: null,
    exigeJulgamentoClinico: false,
    temHorarioDisponivel: true,
    dadoFaltante: null,
    valorEsperado: 100,
    expirada: false,
    ...parcial,
  };
}

/* ------------------------------------------------------- as proibições --- */

describe("opt-out", () => {
  it("encerra — não adia", () => {
    const d = decidir(ctx({ optOut: true }));

    expect(d.acao).toBe("CLOSE");
    expect(d.reasonCode).toBe("OPT_OUT");
  });

  it("encerra mesmo quando TUDO empurra para contatar", () => {
    /*
     * O CENÁRIO ADVERSÁRIO: o lead mais quente possível, que respondeu, pediu
     * para marcar, vale R$ 40 mil, dentro do horário, sem cooldown — e pediu
     * para não ser contatado.
     *
     * É aqui que uma reordenação de blocos aparece: basta o opt-out deixar de
     * ser a PRIMEIRA pergunta para esta pessoa receber `OFFER_SLOTS`.
     */
    const d = decidir(
      ctx({
        optOut: true,
        tipo: "NEW_LEAD",
        respondeu: true,
        intencaoAgendar: true,
        janelaAberta: true,
        valorEsperado: 40_000,
      }),
    );

    expect(d.acao).toBe("CLOSE");
  });

  it("nunca produz ação com efeito externo", () => {
    const d = decidir(ctx({ optOut: true, respondeu: true, janelaAberta: true }));
    expect(temEfeitoExterno(d.acao)).toBe(false);
  });
});

describe("pergunta clínica", () => {
  it("vai para pessoa, e ganha do cooldown", () => {
    /*
     * Alguém perguntando se pode tomar o remédio não pode ficar em fila de
     * espera por ter recebido um lembrete ontem.
     */
    const d = decidir(ctx({ exigeJulgamentoClinico: true, horasDesdeUltimoContato: 1 }));

    expect(d.acao).toBe("ESCALATE");
    expect(d.reasonCode).toBe("CLINICAL_QUESTION");
    expect(d.exigeHumano).toBe(true);
  });

  it("mas o opt-out ainda ganha dela", () => {
    const d = decidir(ctx({ exigeJulgamentoClinico: true, optOut: true }));
    expect(d.acao).toBe("CLOSE");
  });
});

/* ------------------------------------------------------------ as esperas --- */

describe("as travas de cadência", () => {
  it("cooldown adia, e o motivo traz os dois números", () => {
    const d = decidir(ctx({ horasDesdeUltimoContato: 3, cooldownHoras: 24 }));

    expect(d.acao).toBe("WAIT");
    expect(d.reasonCode).toBe("COOLDOWN");
    expect(d.porque).toContain("3h");
    expect(d.porque).toContain("24h");
  });

  it("o teto diário adia mesmo sem cooldown", () => {
    const d = decidir(ctx({ horasDesdeUltimoContato: 100, contatosHoje: 1, contatosPorDia: 1 }));

    expect(d.acao).toBe("WAIT");
    expect(d.reasonCode).toBe("TETO_DIARIO");
  });

  it("fora do horário ADIA, e não encerra", () => {
    /*
     * A distinção é a diferença entre "volto às 8h" e "perdi esta
     * oportunidade". `CLOSE` aqui apagaria a linha até a próxima varredura.
     */
    const d = decidir(ctx({ dentroDoHorario: false }));

    expect(d.acao).toBe("WAIT");
    expect(d.reasonCode).toBe("FORA_DO_HORARIO");
  });

  it("mas responder a quem escreveu agora vale às 22h", () => {
    /*
     * Quem está do outro lado esperando resposta não se importa com o horário
     * comercial da clínica. Janela aberta = a pessoa falou primeiro.
     */
    const d = decidir(ctx({ dentroDoHorario: false, janelaAberta: true }));

    expect(d.acao).toBe("WHATSAPP");
  });

  it("consulta marcada é espera, e não encerramento", () => {
    const d = decidir(ctx({ temConsultaFutura: true }));

    expect(d.acao).toBe("WAIT");
    expect(d.reasonCode).toBe("CONSULTA_MARCADA");
  });
});

describe("o limite de insistência", () => {
  it("depois do teto de tentativas, a automação para e devolve para gente", () => {
    const d = decidir(ctx({ tentativasSemResposta: 3, tentativasMaximas: 3 }));

    expect(d.acao).toBe("CREATE_TASK");
    expect(d.exigeHumano).toBe(true);
    expect(temEfeitoExterno(d.acao)).toBe(false);
  });

  it("quem já respondeu não cai no limite de silêncio", () => {
    const d = decidir(ctx({ tentativasSemResposta: 5, tentativasMaximas: 3, respondeu: true }));

    expect(d.acao).not.toBe("CREATE_TASK");
  });
});

/* -------------------------------------------------------------- as ações --- */

describe("intenção declarada", () => {
  it("pediu horário → oferece horário", () => {
    const d = decidir(ctx({ intencaoAgendar: true }));

    expect(d.acao).toBe("OFFER_SLOTS");
    expect(d.dominio).toBe("agenda");
  });

  it("pediu horário e a agenda está cheia → decisão de encaixe é de gente", () => {
    const d = decidir(ctx({ intencaoAgendar: true, temHorarioDisponivel: false }));

    expect(d.acao).toBe("ASK_HUMAN");
    expect(d.exigeHumano).toBe(true);
  });

  it("ganha do valor alto: quem pediu hora não precisa de ligação de venda", () => {
    const d = decidir(ctx({ intencaoAgendar: true, valorEsperado: 50_000 }));
    expect(d.acao).toBe("OFFER_SLOTS");
  });
});

describe("as objeções", () => {
  it("preço vai para gente — a automação não negocia", () => {
    /*
     * Desconto e parcelamento têm alçada (§29). Uma automação que argumenta
     * sobre preço está negociando sem autorização.
     */
    const d = decidir(ctx({ objecao: "PRECO" }));

    expect(d.acao).toBe("ASK_HUMAN");
    expect(d.exigeHumano).toBe(true);
    expect(temEfeitoExterno(d.acao)).toBe(false);
  });

  it("medo vai para gente — mais uma mensagem não resolve", () => {
    const d = decidir(ctx({ objecao: "MEDO" }));

    expect(d.acao).toBe("ESCALATE");
    expect(d.exigeHumano).toBe(true);
  });

  it("tempo e terceiro viram retomada, não réplica", () => {
    expect(decidir(ctx({ objecao: "TEMPO" })).acao).toBe("FOLLOW_UP");
    expect(decidir(ctx({ objecao: "TERCEIRO" })).acao).toBe("FOLLOW_UP");
  });

  it("convênio vai para gente — errar cobertura é prometer o que não existe", () => {
    const d = decidir(ctx({ objecao: "CONVENIO" }));
    expect(d.acao).toBe("ASK_HUMAN");
  });

  it("preço ganha do valor alto: nem R$ 50 mil autoriza a máquina a negociar", () => {
    const d = decidir(ctx({ objecao: "PRECO", valorEsperado: 50_000 }));
    expect(d.acao).toBe("ASK_HUMAN");
  });
});

describe("a escolha do canal", () => {
  it("dinheiro grande pede ligação, e ligação é tarefa de gente", () => {
    /*
     * Existe abstração de voz no §22, mas NÃO existe provedor ligado.
     * Recomendar "o sistema liga" sem provedor seria o placeholder que o §131
     * proíbe.
     */
    const d = decidir(ctx({ valorEsperado: VALOR_QUE_JUSTIFICA_LIGACAO }));

    expect(d.acao).toBe("CALL");
    expect(d.exigeHumano).toBe(true);
  });

  it("logo abaixo do limiar, não liga", () => {
    const d = decidir(ctx({ valorEsperado: VALOR_QUE_JUSTIFICA_LIGACAO - 1 }));
    expect(d.acao).not.toBe("CALL");
  });

  it("conversa aberta continua na conversa", () => {
    const d = decidir(ctx({ respondeu: true }));
    expect(d.acao).toBe("WHATSAPP");
    expect(d.risco).toBe("BAIXO");
  });

  it("recall de quem nunca respondeu sai EM LOTE, e não como conversa individual", () => {
    /*
     * É o que mantém o volume previsível: a campanha tem teto diário e janela;
     * uma mensagem individual por oportunidade não tem nem um nem outro.
     */
    const d = decidir(ctx({ tipo: "RECALL" }));

    expect(d.acao).toBe("ADD_TO_CAMPAIGN");
    expect(d.dominio).toBe("recall");
  });

  it("primeiro contato de outros tipos começa a jornada", () => {
    const d = decidir(ctx({ tipo: "MISSED_APPOINTMENT" }));
    expect(d.acao).toBe("START_JOURNEY");
  });
});

/* ---------------------------------------------------------- invariantes --- */

describe("invariantes de toda decisão", () => {
  const CENARIOS: readonly Partial<ContextoDaDecisao>[] = [
    {},
    { optOut: true },
    { expirada: true },
    { exigeJulgamentoClinico: true },
    { temCanal: false },
    { dadoFaltante: "telefone" },
    { temConsultaFutura: true },
    { horasDesdeUltimoContato: 1 },
    { contatosHoje: 5 },
    { dentroDoHorario: false },
    { intencaoAgendar: true },
    { intencaoAgendar: true, temHorarioDisponivel: false },
    { objecao: "PRECO" },
    { objecao: "MEDO" },
    { objecao: "TEMPO" },
    { objecao: "CONVENIO" },
    { valorEsperado: 5_000 },
    { respondeu: true },
    { tipo: "RECALL" },
    { tipo: "NEW_LEAD" },
    { tentativasSemResposta: 9 },
  ];

  it("toda decisão tem motivo escrito", () => {
    for (const parcial of CENARIOS) {
      const d = decidir(ctx(parcial));
      expect(d.porque.length, JSON.stringify(parcial)).toBeGreaterThan(10);
      expect(d.reasonCode.length, JSON.stringify(parcial)).toBeGreaterThan(0);
      expect(d.rotulo.length, JSON.stringify(parcial)).toBeGreaterThan(0);
    }
  });

  it("nada que exige humano sai sozinho", () => {
    /*
     * A INVARIANTE QUE IMPEDE O PIOR DESFECHO POSSÍVEL: uma ação marcada como
     * "precisa de gente" que mesmo assim dispara.
     *
     * A primeira versão deste teste comparava com `temEfeitoExterno` e falhou
     * em `CALL` — corretamente, porque uma ligação CHEGA no paciente e mesmo
     * assim exige uma pessoa para discar. As duas perguntas são diferentes, e
     * a que o despacho faz é esta.
     */
    for (const parcial of CENARIOS) {
      const d = decidir(ctx(parcial));
      if (d.exigeHumano) {
        expect(podeSairSozinho(d), `${d.acao} em ${JSON.stringify(parcial)}`).toBe(false);
      }
    }
  });

  it("CALL toca o paciente E exige gente — é o caso que separa os dois conceitos", () => {
    const d = decidir(ctx({ valorEsperado: 5_000 }));

    expect(d.acao).toBe("CALL");
    expect(temEfeitoExterno(d.acao)).toBe(true);
    expect(d.exigeHumano).toBe(true);
    expect(podeSairSozinho(d)).toBe(false);
  });

  it("sem canal utilizável, nunca sai mensagem", () => {
    for (const parcial of CENARIOS) {
      const d = decidir(ctx({ ...parcial, temCanal: false, optOut: false, expirada: false }));
      if (d.acao === "WHATSAPP" || d.acao === "OFFER_SLOTS") {
        throw new Error(`decidiu ${d.acao} sem canal, em ${JSON.stringify(parcial)}`);
      }
    }
  });
});
