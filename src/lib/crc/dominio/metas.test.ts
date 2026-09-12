/**
 * Metas.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o que verifica que o plano AVISA quando
 *  não alcança o alvo.
 *
 *  Um plano que não fecha a conta e não diz isso é pior que nenhum plano: o
 *  dono aprova, espera, e descobre no fim do prazo. Dizer antes preserva a
 *  única coisa que o módulo tem — a confiança de quem lê.
 *
 *  INJEÇÃO DE DEFEITO:
 *    tirar o aviso de plano insuficiente     → "avisa que não fecha" quebra;
 *    medir progresso contra zero             → "mede contra o baseline" quebra;
 *    ignorar `menorEhMelhor`                 → "reduzir faltas" quebra;
 *    replanejar sem esperar o prazo correr   → "não replaneja cedo" quebra.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  calcularProgresso,
  CATALOGO_DE_METAS,
  decidirReplano,
  descreverMeta,
  montarPlano,
  VERSAO_DO_PLANO,
  type Recursos,
} from "./metas";

function recursos(parcial: Partial<Recursos> = {}): Recursos {
  return {
    buracosAbertos: 0,
    pacientesEmRecall: 0,
    orcamentosAbertos: 0,
    orcamentosQuantidade: 0,
    consultasEmRisco: 0,
    inativos: 0,
    ...parcial,
  };
}

/* -------------------------------------------------------------------------- */

describe("o catálogo", () => {
  it("toda meta sabe dizer COMO se mede", () => {
    /*
     * Uma meta que o sistema não sabe medir é uma anotação. Deixar alguém
     * digitar "aumentar a satisfação" produziria uma linha que nunca sai de 0%,
     * porque ninguém definiu o que ela conta — e uma meta parada em 0% por um
     * mês ensina o dono que o módulo não funciona.
     */
    for (const m of CATALOGO_DE_METAS) {
      expect(m.comoMede.length, m.tipo).toBeGreaterThan(30);
      expect(m.rotulo.length, m.tipo).toBeGreaterThan(3);
    }
  });

  it("só 'reduzir faltas' tem menor-é-melhor", () => {
    const invertidas = CATALOGO_DE_METAS.filter((m) => m.menorEhMelhor);
    expect(invertidas.map((m) => m.tipo)).toEqual(["REDUZIR_FALTAS"]);
  });

  it("receita recuperada mede só a atribuição CONFIRMADA", () => {
    // É a mesma regra do Radar: "R$ X recuperados" não pode usar o provável.
    expect(descreverMeta("RECEITA_RECUPERADA").comoMede).toContain("CONFIRMADA");
  });
});

/* -------------------------------------------------------------------------- */

describe("o progresso", () => {
  it("mede contra o BASELINE, e não contra zero", () => {
    /*
     * ============================================================================
     *  Uma meta de "chegar a 90%" partindo de 61% já andou 0% quando está em
     *  61%, e não 68%. Medir contra zero faria toda meta nascer quase cumprida,
     *  e o módulo inteiro viraria enfeite.
     * ============================================================================
     */
    const p = calcularProgresso({
      baseline: 61,
      alvo: 90,
      atual: 61,
      menorEhMelhor: false,
      diasTotais: 10,
      diasRestantes: 10,
    });

    expect(p.fracao).toBe(0);
  });

  it("metade do caminho é metade", () => {
    const p = calcularProgresso({
      baseline: 60,
      alvo: 80,
      atual: 70,
      menorEhMelhor: false,
      diasTotais: 10,
      diasRestantes: 5,
    });

    expect(p.fracao).toBeCloseTo(0.5, 2);
    expect(p.situacao).toBe("NO_RITMO");
  });

  it("'reduzir faltas' anda quando o número CAI", () => {
    /*
     * Sem `menorEhMelhor`, o progresso seria negativo justamente quando a
     * clínica está melhorando — e o painel diria "atrasada" para um resultado
     * bom.
     */
    const p = calcularProgresso({
      baseline: 20,
      alvo: 10,
      atual: 15,
      menorEhMelhor: true,
      diasTotais: 10,
      diasRestantes: 5,
    });

    expect(p.fracao).toBeCloseTo(0.5, 2);
  });

  it("distingue '30% da meta' de '30% da meta com 80% do prazo gasto'", () => {
    /*
     * O primeiro número sozinho não diz nada sobre estar atrasado. A situação
     * compara as duas frações — caminho andado contra tempo gasto.
     */
    // 9 dias restantes, e nao 8: com 8, o tempo gasto e 0,2 e a fracao 0,3 cai
    // EXATAMENTE na borda da tolerancia de 10%. Um teste na borda nao afirma
    // nada sobre o comportamento — afirma sobre o arredondamento.
    const cedo = calcularProgresso({
      baseline: 0,
      alvo: 100,
      atual: 30,
      menorEhMelhor: false,
      diasTotais: 10,
      diasRestantes: 9,
    });
    const tarde = calcularProgresso({
      baseline: 0,
      alvo: 100,
      atual: 30,
      menorEhMelhor: false,
      diasTotais: 10,
      diasRestantes: 2,
    });

    expect(cedo.situacao).toBe("ADIANTADA");
    expect(tarde.situacao).toBe("ATRASADA");
    expect(cedo.fracao).toBe(tarde.fracao);
  });

  it("tem tolerância — senão o alarme oscila todo dia", () => {
    /*
     * O progresso real não é linear: campanha dispara em lotes, orçamento fecha
     * em degraus. Sem tolerância, toda meta passaria o tempo oscilando entre
     * "atrasada" e "adiantada".
     */
    const p = calcularProgresso({
      baseline: 0,
      alvo: 100,
      atual: 47,
      menorEhMelhor: false,
      diasTotais: 10,
      diasRestantes: 5,
    });

    expect(p.situacao).toBe("NO_RITMO");
  });

  it("superar o alvo é ATINGIDA, e não 'adiantada'", () => {
    const p = calcularProgresso({
      baseline: 0,
      alvo: 100,
      atual: 120,
      menorEhMelhor: false,
      diasTotais: 10,
      diasRestantes: 5,
    });

    expect(p.situacao).toBe("ATINGIDA");
    expect(p.falta).toBe(0);
  });

  it("alvo igual ao baseline não divide por zero", () => {
    const p = calcularProgresso({
      baseline: 61,
      alvo: 61,
      atual: 61,
      menorEhMelhor: false,
      diasTotais: 10,
      diasRestantes: 10,
    });

    expect(Number.isFinite(p.fracao)).toBe(true);
    expect(p.situacao).toBe("ATINGIDA");
  });

  it("prazo vencido não gera ritmo infinito", () => {
    const p = calcularProgresso({
      baseline: 0,
      alvo: 100,
      atual: 40,
      menorEhMelhor: false,
      diasTotais: 10,
      diasRestantes: 0,
    });

    expect(Number.isFinite(p.ritmoNecessario)).toBe(true);
    expect(p.resumo).toContain("prazo acabou");
  });
});

/* -------------------------------------------------------------------------- */

describe("o plano", () => {
  it("decompõe em módulos que já existem", () => {
    const p = montarPlano({
      tipo: "OCUPACAO_AGENDA",
      distancia: 20,
      diasRestantes: 7,
      maxContatosDia: 100,
      recursos: recursos({ buracosAbertos: 8, pacientesEmRecall: 300, consultasEmRisco: 5 }),
    });

    const modulos = p.acoes.map((a) => a.modulo);
    expect(modulos).toContain("ENCAIXE");
    expect(modulos).toContain("RECALL");
    expect(modulos).toContain("FALTAS");
    expect(p.versao).toBe(VERSAO_DO_PLANO);
  });

  it("a ordem é do MENOS incômodo para o mais", () => {
    /*
     * "Custo" aqui é incômodo causado a pessoas, e não dinheiro. Preencher um
     * buraco não incomoda quem não quer ser incomodado — a lista de espera
     * PEDIU para ser chamada. Campanha de reativação fala com quem não pediu.
     */
    const p = montarPlano({
      tipo: "OCUPACAO_AGENDA",
      distancia: 20,
      diasRestantes: 7,
      maxContatosDia: 100,
      recursos: recursos({ buracosAbertos: 5, pacientesEmRecall: 200, consultasEmRisco: 3 }),
    });

    expect(p.acoes[0]?.modulo).toBe("ENCAIXE");
  });

  it("AVISA quando a previsão não cobre a meta", () => {
    /*
     * ============================================================================
     *  O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
     *
     *  Um plano que não fecha a conta e não diz isso é pior que nenhum plano: o
     *  dono aprova, espera, e descobre no fim do prazo.
     * ============================================================================
     */
    const p = montarPlano({
      tipo: "OCUPACAO_AGENDA",
      distancia: 500,
      diasRestantes: 7,
      maxContatosDia: 100,
      recursos: recursos({ buracosAbertos: 2 }),
    });

    expect(p.insuficiente).toBe(true);
    expect(p.aviso).not.toBeNull();
    expect(p.aviso).toContain("abaixo");
  });

  it("não avisa quando a previsão cobre", () => {
    const p = montarPlano({
      tipo: "OCUPACAO_AGENDA",
      distancia: 2,
      diasRestantes: 7,
      maxContatosDia: 100,
      recursos: recursos({ buracosAbertos: 20 }),
    });

    expect(p.insuficiente).toBe(false);
    expect(p.aviso).toBeNull();
  });

  it("sem recurso nenhum, diz que não há o que fazer — e por quê", () => {
    /*
     * "Nenhuma ação" sem explicação parece defeito. A frase precisa dizer que a
     * causa provável é a base não sincronizada — que é o estado real de uma
     * instalação nova.
     */
    const p = montarPlano({
      tipo: "OCUPACAO_AGENDA",
      distancia: 20,
      diasRestantes: 7,
      maxContatosDia: 100,
      recursos: recursos(),
    });

    expect(p.acoes).toHaveLength(0);
    expect(p.aviso).toContain("sincronizada");
  });

  it("respeita o teto de contatos no alcance planejado", () => {
    const p = montarPlano({
      tipo: "REATIVAR_PACIENTES",
      distancia: 50,
      diasRestantes: 3,
      maxContatosDia: 10,
      recursos: recursos({ inativos: 5000 }),
    });

    const campanha = p.acoes.find((a) => a.modulo === "CAMPANHA");
    // 10 por dia × 3 dias = 30, e não os 5.000 disponíveis.
    expect(campanha?.alcanceEstimado).toBe(30);
  });

  it("toda ação sai com confiança BAIXA — não há histórico para calibrar", () => {
    const p = montarPlano({
      tipo: "RECEITA_RECUPERADA",
      distancia: 50000,
      diasRestantes: 30,
      maxContatosDia: 100,
      recursos: recursos({ orcamentosAbertos: 200000, orcamentosQuantidade: 40 }),
    });

    expect(p.acoes.every((a) => a.confianca <= 0.3)).toBe(true);
  });

  it("inativo entra com previsão BAIXA — e isso é o ponto", () => {
    /*
     * Uma previsão otimista para reativação produziria um plano que promete o
     * que não entrega. 6% é a realidade de quem sumiu há mais de seis meses.
     */
    const p = montarPlano({
      tipo: "REATIVAR_PACIENTES",
      distancia: 100,
      diasRestantes: 30,
      maxContatosDia: 100,
      recursos: recursos({ inativos: 1000 }),
    });

    const campanha = p.acoes.find((a) => a.modulo === "CAMPANHA");
    expect(campanha?.contribuicaoEstimada).toBeLessThan(100);
  });
});

/* -------------------------------------------------------------------------- */

describe("o replanejamento", () => {
  it("NÃO replaneja no começo do prazo", () => {
    /*
     * ============================================================================
     *  Nos primeiros dias toda meta parece atrasada: campanha não disparou,
     *  orçamento não foi retomado, recall sai em lotes. Refazer o plano ali
     *  trocaria uma estratégia que ainda não teve chance por outra que também
     *  não vai ter — e a meta mudaria de plano todo dia sem executar nenhum.
     * ============================================================================
     */
    const d = decidirReplano({ situacao: "ATRASADA", fracaoDoTempo: 0.1, jaReplanejou: 0 });

    expect(d.replanejar).toBe(false);
    if (d.replanejar) return;
    expect(d.motivo).toContain("começo");
  });

  it("replaneja quando o prazo correu e continua atrasada", () => {
    const d = decidirReplano({ situacao: "ATRASADA", fracaoDoTempo: 0.4, jaReplanejou: 0 });

    expect(d.replanejar).toBe(true);
    if (!d.replanejar) return;
    expect(d.urgencia).toBe("AVISO");
  });

  it("fica crítico depois de 60% do prazo", () => {
    const d = decidirReplano({ situacao: "ATRASADA", fracaoDoTempo: 0.7, jaReplanejou: 1 });

    expect(d.replanejar).toBe(true);
    if (!d.replanejar) return;
    expect(d.urgencia).toBe("CRITICA");
  });

  it("depois de dois replanejamentos, o problema é a META e não o plano", () => {
    /*
     * Uma meta que exige o dobro do que a clínica consegue não fica correta com
     * um quarto plano. O teto força a conversa certa.
     */
    const d = decidirReplano({ situacao: "ATRASADA", fracaoDoTempo: 0.8, jaReplanejou: 2 });

    expect(d.replanejar).toBe(false);
    if (d.replanejar) return;
    expect(d.motivo).toContain("alvo");
  });

  it("no ritmo não replaneja", () => {
    expect(
      decidirReplano({ situacao: "NO_RITMO", fracaoDoTempo: 0.5, jaReplanejou: 0 }).replanejar,
    ).toBe(false);
    expect(
      decidirReplano({ situacao: "ATINGIDA", fracaoDoTempo: 0.5, jaReplanejou: 0 }).replanejar,
    ).toBe(false);
  });
});
