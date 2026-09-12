/**
 * Aceitação de tratamento.
 *
 * ============================================================================
 *  DOIS TESTES CARREGAM ESTE ARQUIVO, e os dois são sobre a linha do §77:
 *
 *    a automação faz follow-up COMERCIAL;
 *    a automação NÃO mexe em plano CLÍNICO.
 *
 *  "Está caro" tem duas respostas possíveis: parcelar (comercial) ou reduzir o
 *  escopo do tratamento (clínico). A segunda é a mais comum na vida real, e é
 *  exatamente a que uma automação não pode tomar — ela mudaria o plano do
 *  dentista para fechar uma venda.
 *
 *  INJEÇÃO DE DEFEITO:
 *    fazer PRECO cair em RETOMAR sem parcelamento → "escopo é do dentista" quebra;
 *    fazer MEDO virar mensagem                    → "medo vai para gente" quebra;
 *    tirar o caso ACCEPTED do topo                → "aceitou e não marcou" quebra.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  aceitoSemAgendar,
  aindaPodeFechar,
  estimarAceitacao,
  etapaDaObjecao,
  proximaAcaoDeAceitacao,
  RETOMADAS_MAXIMAS,
  VERSAO_DA_ACEITACAO,
  type ContextoDeAceitacao,
} from "./aceitacao";

function ctx(parcial: Partial<ContextoDeAceitacao> = {}): ContextoDeAceitacao {
  return {
    etapa: "PROPOSED",
    valor: 3000,
    diasDesdeProposta: 10,
    tentativas: 0,
    respondeu: false,
    consultasConcluidas: 2,
    temConsultaFutura: false,
    parcialmenteAprovado: false,
    ...parcial,
  };
}

function plano(parcial: Partial<ContextoDeAceitacao> & { temParcelamento?: boolean } = {}) {
  const { temParcelamento = false, ...resto } = parcial;
  return proximaAcaoDeAceitacao({ ...ctx(resto), temParcelamento });
}

/* -------------------------------------------------------------------------- */

describe("o mapa de objeção para etapa", () => {
  it("cada objeção tem uma etapa, e a tela não precisa de dois campos", () => {
    expect(etapaDaObjecao("PRECO")).toBe("PRICE_OBJECTION");
    expect(etapaDaObjecao("MEDO")).toBe("FEAR_OBJECTION");
    expect(etapaDaObjecao("TEMPO")).toBe("TIME_OBJECTION");
    expect(etapaDaObjecao("TERCEIRO")).toBe("FAMILY_DECISION");
    expect(etapaDaObjecao("CONVENIO")).toBe("PAYMENT_OBJECTION");
  });
});

describe("o que ainda pode fechar", () => {
  it("ACEITOU continua aberto — aceitar não é começar", () => {
    /*
     * ============================================================================
     *  A DISTÂNCIA ENTRE "ACEITOU" E "COMEÇOU" é onde mais se perde dinheiro sem
     *  ninguém notar.
     *
     *  A pessoa diz "pode marcar" e vai embora. Ninguém marca. O sistema da
     *  clínica mostra o orçamento como APROVADO, então ninguém o procura na
     *  lista de pendências — e duas semanas depois ela esfriou.
     * ============================================================================
     */
    expect(aindaPodeFechar("ACCEPTED")).toBe(true);
    expect(aceitoSemAgendar("ACCEPTED")).toBe(true);
    expect(aindaPodeFechar("STARTED")).toBe(false);
    expect(aindaPodeFechar("LOST")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("a chance de fechar", () => {
  it("cai com o tempo, e cai rápido", () => {
    /*
     * A decisão de fazer um tratamento caro é tomada nas primeiras semanas ou
     * não é tomada. Depois de seis meses, o que existe não é um orçamento
     * pendente: é um orçamento vencido que ninguém fechou na tela.
     */
    const novo = estimarAceitacao(ctx({ diasDesdeProposta: 3 }));
    const mes = estimarAceitacao(ctx({ diasDesdeProposta: 45 }));
    const semestre = estimarAceitacao(ctx({ diasDesdeProposta: 200 }));

    expect(novo.probabilidade).toBeGreaterThan(mes.probabilidade);
    expect(mes.probabilidade).toBeGreaterThan(semestre.probabilidade * 2);
  });

  it("consulta marcada SOBE a chance — o oposto do Radar, e de propósito", () => {
    /*
     * No Radar, consulta marcada derruba a prioridade: não precisa de ligação.
     * Aqui sobe: a pessoa vai estar na cadeira, vai ouvir o dentista, e a
     * conversa sobre o tratamento acontece no melhor lugar possível.
     */
    const sem = estimarAceitacao(ctx());
    const com = estimarAceitacao(ctx({ temConsultaFutura: true }));

    expect(com.probabilidade).toBeGreaterThan(sem.probabilidade);
  });

  it("valor alto reduz — decisão de R$ 18 mil é mais lenta que a de R$ 600", () => {
    const pequeno = estimarAceitacao(ctx({ valor: 600 }));
    const grande = estimarAceitacao(ctx({ valor: 18000 }));

    expect(grande.probabilidade).toBeLessThan(pequeno.probabilidade);
  });

  it("preço converte menos que tempo — e é por isso que se tratam diferente", () => {
    const preco = estimarAceitacao(ctx({ etapa: "PRICE_OBJECTION" }));
    const tempo = estimarAceitacao(ctx({ etapa: "TIME_OBJECTION" }));

    expect(tempo.probabilidade).toBeGreaterThan(preco.probabilidade * 1.8);
  });

  it("silêncio é o pior estado — nem objeção houve", () => {
    const silencio = estimarAceitacao(ctx({ etapa: "NO_RESPONSE" }));
    const pensando = estimarAceitacao(ctx({ etapa: "THINKING" }));

    expect(silencio.probabilidade).toBeLessThan(pensando.probabilidade);
  });

  it("perdido é zero, e com confiança total", () => {
    const p = estimarAceitacao(ctx({ etapa: "LOST" }));
    expect(p.probabilidade).toBe(0);
    expect(p.confianca).toBe(1);
  });

  it("nunca passa de 0,95 nem cai a zero sem estar perdido", () => {
    const otimo = estimarAceitacao(
      ctx({
        etapa: "SCHEDULED",
        diasDesdeProposta: 2,
        respondeu: true,
        temConsultaFutura: true,
        parcialmenteAprovado: true,
        consultasConcluidas: 20,
        valor: 300,
      }),
    );
    const pessimo = estimarAceitacao(
      ctx({ etapa: "NO_RESPONSE", diasDesdeProposta: 500, tentativas: 8, valor: 40000 }),
    );

    expect(otimo.probabilidade).toBeLessThanOrEqual(0.95);
    expect(pessimo.probabilidade).toBeGreaterThanOrEqual(0.01);
  });

  it("carrega a versão e os fatores", () => {
    const c = estimarAceitacao(ctx());
    expect(c.versao).toBe(VERSAO_DA_ACEITACAO);
    expect(c.fatores.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("a próxima ação", () => {
  it("ACEITOU E NÃO MARCOU é a prioridade máxima, e vem antes de tudo", () => {
    const p = plano({ etapa: "ACCEPTED", diasDesdeProposta: 300, tentativas: 9 });

    expect(p.acao).toBe("AGENDAR");
    expect(p.exigeHumano).toBe(false);
  });

  it("preço COM parcelamento configurado: informa a condição", () => {
    const p = plano({ etapa: "PRICE_OBJECTION", temParcelamento: true });

    expect(p.acao).toBe("OFERECER_PARCELAMENTO");
    // Mostrar condição JÁ CONFIGURADA é informar, não negociar.
    expect(p.exigeHumano).toBe(false);
  });

  it("preço SEM parcelamento vai para o DENTISTA, e não vira mensagem", () => {
    /*
     * ============================================================================
     *  O TESTE QUE PROTEGE A LINHA DO §77.
     *
     *  A alternativa real a "está caro", quando não há parcelamento, é reduzir o
     *  escopo do tratamento. Isso é decisão CLÍNICA — mudar o plano do dentista
     *  para fechar uma venda não é papel de nenhuma automação.
     *
     *  Se este teste passar a aceitar `RETOMAR`, alguém transformou a objeção de
     *  preço em insistência comercial.
     * ============================================================================
     */
    const p = plano({ etapa: "PRICE_OBJECTION", temParcelamento: false });

    expect(p.acao).toBe("FALAR_COM_DENTISTA");
    expect(p.exigeHumano).toBe(true);
    expect(p.porque.toLowerCase()).toContain("clínica");
  });

  it("medo vai para gente — mais uma mensagem perde o paciente de vez", () => {
    const p = plano({ etapa: "FEAR_OBJECTION", temParcelamento: true });

    expect(p.acao).toBe("PASSAR_PARA_EQUIPE");
    expect(p.exigeHumano).toBe(true);
  });

  it("“esse mês não dá” espera TRÊS SEMANAS, e não cinco dias", () => {
    /*
     * Voltar em cinco dias é ignorar o que a pessoa disse. Voltar em três
     * semanas é ter escutado — e a diferença entre as duas é a diferença entre
     * follow-up e assédio.
     */
    const p = plano({ etapa: "TIME_OBJECTION" });

    expect(p.acao).toBe("RETOMAR");
    expect(p.emDias).toBe(21);
  });

  it("decisão de terceiro espera uma semana", () => {
    const p = plano({ etapa: "FAMILY_DECISION" });
    expect(p.emDias).toBe(7);
  });

  it("depois do teto de retomadas, para e chama gente", () => {
    const p = plano({ tentativas: RETOMADAS_MAXIMAS, respondeu: false });

    expect(p.acao).toBe("PASSAR_PARA_EQUIPE");
    expect(p.exigeHumano).toBe(true);
  });

  it("quem respondeu não cai no teto de retomadas", () => {
    const p = plano({ tentativas: 5, respondeu: true });
    expect(p.acao).not.toBe("PASSAR_PARA_EQUIPE");
  });

  it("orçamento de seis meses é encerrado — manter aberto infla o funil", () => {
    const p = plano({ diasDesdeProposta: 200 });

    expect(p.acao).toBe("ENCERRAR");
    expect(p.porque).toContain("infla o funil");
  });

  it("consulta marcada é espera, e não retomada", () => {
    const p = plano({ temConsultaFutura: true });
    expect(p.acao).toBe("AGUARDAR");
  });

  it("toda ação tem motivo escrito", () => {
    const CENARIOS: (Partial<ContextoDeAceitacao> & { temParcelamento?: boolean })[] = [
      {},
      { etapa: "ACCEPTED" },
      { etapa: "SCHEDULED" },
      { etapa: "STARTED" },
      { etapa: "LOST" },
      { etapa: "PRICE_OBJECTION", temParcelamento: true },
      { etapa: "PRICE_OBJECTION", temParcelamento: false },
      { etapa: "FEAR_OBJECTION" },
      { etapa: "TIME_OBJECTION" },
      { etapa: "FAMILY_DECISION" },
      { etapa: "NO_RESPONSE" },
      { tentativas: 9 },
      { diasDesdeProposta: 400 },
      { temConsultaFutura: true },
    ];

    for (const c of CENARIOS) {
      const p = plano(c);
      expect(p.porque.length, JSON.stringify(c)).toBeGreaterThan(15);
      expect(p.rotulo.length, JSON.stringify(c)).toBeGreaterThan(3);
    }
  });
});
