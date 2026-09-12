/**
 * Qualidade do atendimento.
 *
 * ============================================================================
 *  O QUE ESTES TESTES PROTEGEM não é a aritmética do score — é o que ele NÃO
 *  faz.
 *
 *  Um painel de atendimento vira ranking de pessoa com muita facilidade, e
 *  ranking de atendente numa clínica pequena produz uma coisa só: a pessoa para
 *  de registrar o que correu mal. A partir daí o painel fica bonito e cego.
 *
 *  Por isso: ligação não atendida não é nota baixa, transferir é neutro,
 *  ligação longa não é punida, e toda observação vem com uma PERGUNTA em vez de
 *  um veredito.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  avaliarChamada,
  mediana,
  observar,
  RESPOSTA_ACEITAVEL_MIN,
  VERSAO_DO_ATENDIMENTO,
  type ContextoDaChamada,
  type NumerosDoAtendimento,
} from "./atendimento";

function chamada(parcial: Partial<ContextoDaChamada> = {}): ContextoDaChamada {
  return {
    intencao: "AGENDAR",
    atendida: true,
    duracaoS: 180,
    ofereceuHorario: true,
    marcouConsulta: true,
    deixouProximoPasso: false,
    transferida: false,
    ...parcial,
  };
}

function numeros(parcial: Partial<NumerosDoAtendimento> = {}): NumerosDoAtendimento {
  return {
    chamadas: 100,
    naoAtendidas: 0,
    semOferta: 0,
    marcadas: 60,
    medianaDeResposta: 5,
    semResposta: 0,
    leadsParados: 0,
    ...parcial,
  };
}

/* -------------------------------------------------------------------------- */

describe("a avaliação da chamada", () => {
  it("atendeu, ofereceu e marcou é a nota cheia", () => {
    const a = avaliarChamada(chamada());

    expect(a.score).toBeGreaterThan(80);
    expect(a.oportunidadePerdida).toBe(false);
    expect(a.versao).toBe(VERSAO_DO_ATENDIMENTO);
  });

  it("ligação NÃO ATENDIDA não é nota baixa — é ausência de nota", () => {
    /*
     * ============================================================================
     *  Pontuar uma ligação perdida como "atendimento ruim" mistura duas coisas:
     *  a qualidade de quem atendeu e a CAPACIDADE de atender. A segunda é um
     *  problema de escala, e aparece na contagem de perdidas — não na média de
     *  quem estava lá.
     * ============================================================================
     */
    const a = avaliarChamada(chamada({ atendida: false }));

    expect(a.score).toBe(0);
    expect(a.fatores).toHaveLength(1);
    // Mas ela É oportunidade perdida: alguém quis falar e não conseguiu.
    expect(a.oportunidadePerdida).toBe(true);
  });

  it("pediu horário e ninguém ofereceu é o único ponto negativo do modelo", () => {
    const a = avaliarChamada(
      chamada({ ofereceuHorario: false, marcouConsulta: false, deixouProximoPasso: false }),
    );

    expect(a.oportunidadePerdida).toBe(true);
    expect(a.motivoPerda).toContain("nenhum foi oferecido");
    expect(a.fatores.some((f) => f.pontos < 0)).toBe(true);
  });

  it("quem NÃO pedia horário não é penalizado por não receber oferta", () => {
    /*
     * Alguém ligando para perguntar o endereço não precisa ouvir oferta de
     * horário. Contar isso como falha encheria o painel de falso positivo até
     * ninguém olhar mais.
     */
    const a = avaliarChamada(
      chamada({ intencao: "ADMINISTRATIVO", ofereceuHorario: false, marcouConsulta: false }),
    );

    expect(a.oportunidadePerdida).toBe(false);
    expect(a.fatores.every((f) => f.pontos >= 0)).toBe(true);
  });

  it("TRANSFERIR é neutro", () => {
    /*
     * Passar para quem sabe responder é bom atendimento. Penalizar faria alguém
     * segurar uma conversa que não domina — que é pior para o paciente.
     */
    const sem = avaliarChamada(chamada());
    const com = avaliarChamada(chamada({ transferida: true }));

    expect(com.score).toBe(sem.score);
  });

  it("ligação LONGA não é punida", () => {
    /*
     * Punir duração ensinaria a equipe a encurtar conversa — o oposto do que
     * uma clínica quer.
     */
    const normal = avaliarChamada(chamada({ duracaoS: 120 }));
    const longa = avaliarChamada(chamada({ duracaoS: 900 }));

    expect(longa.score).toBe(normal.score);
  });

  it("mas ligação de 20 segundos para um pedido de horário é despacho", () => {
    const a = avaliarChamada(
      chamada({ duracaoS: 20, marcouConsulta: false, ofereceuHorario: false }),
    );

    expect(a.fatores.some((f) => f.chave === "curta")).toBe(true);
  });

  it("deixar próximo passo salva a ligação que não fechou", () => {
    const semPasso = avaliarChamada(
      chamada({ marcouConsulta: false, ofereceuHorario: true, deixouProximoPasso: false }),
    );
    const comPasso = avaliarChamada(
      chamada({ marcouConsulta: false, ofereceuHorario: true, deixouProximoPasso: true }),
    );

    expect(semPasso.oportunidadePerdida).toBe(true);
    expect(comPasso.oportunidadePerdida).toBe(false);
  });

  it("o score fica entre 0 e 100", () => {
    const casos: Partial<ContextoDaChamada>[] = [
      {},
      { atendida: false },
      { marcouConsulta: false, ofereceuHorario: false, duracaoS: 5 },
      { marcouConsulta: true, deixouProximoPasso: true, transferida: true },
      { intencao: "RECLAMACAO", marcouConsulta: false, ofereceuHorario: false },
    ];

    for (const c of casos) {
      const a = avaliarChamada(chamada(c));
      expect(a.score, JSON.stringify(c)).toBeGreaterThanOrEqual(0);
      expect(a.score, JSON.stringify(c)).toBeLessThanOrEqual(100);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("as observações", () => {
  it("toda observação traz FATO e PERGUNTA — nunca veredito", () => {
    /*
     * ============================================================================
     *  Um painel que conclui no lugar da equipe é um painel que a equipe aprende
     *  a contornar. "37 ligações sem oferta de horário" é o fato; "a agenda
     *  estava cheia, ou faltou consultar?" é a pergunta. Quem responde é quem
     *  sabe coisas que o banco não sabe.
     * ============================================================================
     */
    const obs = observar(
      numeros({
        naoAtendidas: 40,
        semOferta: 12,
        medianaDeResposta: 90,
        semResposta: 8,
        leadsParados: 6,
      }),
    );

    expect(obs.length).toBeGreaterThan(3);
    for (const o of obs) {
      expect(o.fato.length, o.chave).toBeGreaterThan(15);
      expect(o.pergunta.length, o.chave).toBeGreaterThan(15);
      expect(o.pergunta, o.chave).toContain("?");
    }
  });

  it("nenhuma observação também é uma observação", () => {
    /*
     * Um painel vazio parece quebrado. Dizer "está dentro do esperado" é o que
     * transforma silêncio em informação.
     */
    const obs = observar(numeros());

    expect(obs).toHaveLength(1);
    expect(obs[0]?.chave).toBe("ok");
    expect(obs[0]?.gravidade).toBe("INFO");
  });

  it("nenhum rótulo carrega nome de pessoa", () => {
    /*
     * O módulo mede o PROCESSO. Um agregado com nome vira ranking, e ranking de
     * atendente numa clínica pequena faz a pessoa parar de registrar o que
     * correu mal.
     */
    const obs = observar(numeros({ naoAtendidas: 40, semOferta: 12 }));

    for (const o of obs) {
      expect(o.fato).not.toMatch(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/u);
    }
  });

  it("resposta lenta só vira observação acima do limiar", () => {
    expect(
      observar(numeros({ medianaDeResposta: RESPOSTA_ACEITAVEL_MIN - 1 })).some(
        (o) => o.chave === "resposta_lenta",
      ),
    ).toBe(false);

    expect(
      observar(numeros({ medianaDeResposta: RESPOSTA_ACEITAVEL_MIN + 1 })).some(
        (o) => o.chave === "resposta_lenta",
      ),
    ).toBe(true);
  });

  it("lead parado é sempre destacado — é o mais caro de perder", () => {
    const obs = observar(numeros({ leadsParados: 1 }));
    const lead = obs.find((o) => o.chave === "leads_parados");

    expect(lead).toBeDefined();
    expect(lead?.pergunta).toContain("custo");
    expect(lead?.pergunta).toContain("?");
  });
});

/* -------------------------------------------------------------------------- */

describe("a mediana", () => {
  it("uma conversa respondida em três dias NÃO destrói o mês", () => {
    /*
     * ============================================================================
     *  Com 200 conversas em 4 minutos e uma em 4.320, a MÉDIA dá 25 — e o painel
     *  acusa uma recepção que está respondendo em quatro minutos. A mediana dá
     *  4, que é a verdade sobre o atendimento típico.
     *
     *  O caso extremo não some: aparece em `semResposta`, onde alguém pode ir
     *  atrás dele.
     * ============================================================================
     */
    const valores = [...Array<number>(200).fill(4), 4320];
    const m = mediana(valores) ?? 0;

    const media = valores.reduce((s, v) => s + v, 0) / valores.length;

    expect(m).toBe(4);
    expect(media).toBeGreaterThan(20);
  });

  it("lista vazia devolve null, e não zero", () => {
    // Zero seria lido como "respondemos instantaneamente", que é o oposto de
    // "não houve conversa nenhuma".
    expect(mediana([])).toBeNull();
  });

  it("lista par tira a média dos dois do meio", () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });
});
