/**
 * O encaixe — e o que estes testes impedem é a clínica queimar a própria lista.
 *
 * ============================================================================
 *  O DEFEITO QUE TODA IMPLEMENTAÇÃO DE ENCAIXE TENDE A TER: oferecer o horário
 *  para todo mundo e deixar o primeiro que responder ficar com ele.
 *
 *  Funciona uma vez. Na segunda, as trinta e nove pessoas que ouviram "já foi
 *  preenchido" não respondem mais — e a lista de espera, que era o ativo, virou
 *  uma lista de gente irritada.
 *
 *  INJEÇÃO DE DEFEITO:
 *    subir TAMANHO_DO_LOTE para 40         → "lote pequeno" quebra;
 *    tirar o teto de levas                 → "desiste" quebra;
 *    tratar bloqueio como -pontos          → "não aceita encaixe" quebra;
 *    ordenar por chegada em vez de escore  → "compatibilidade manda" quebra.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  decidirLeva,
  esperaAntesDaProximaLeva,
  LEVAS_MAXIMAS,
  pontuarCandidatos,
  TAMANHO_DO_LOTE,
  valorDoBuraco,
  type Candidato,
  type EstadoDoBuraco,
} from "./encaixe";

const AGORA = new Date("2026-09-12T14:00:00.000Z");

function candidato(parcial: Partial<Candidato> = {}): Candidato {
  return {
    patientId: "p1",
    nome: "Ana",
    temWaitlist: false,
    aceitaEncaixe: true,
    diaBate: true,
    horaBate: true,
    dentistaBate: true,
    diasDesdeUltimaConsulta: 200,
    consultasConcluidas: 3,
    horasDesdeUltimoContato: null,
    ...parcial,
  };
}

function estado(parcial: Partial<EstadoDoBuraco> = {}): EstadoDoBuraco {
  return { oferecidos: 0, ofertadoEm: null, horasAteOHorario: 20, ...parcial };
}

const PADRAO = { horasAteOHorario: 20, cooldownHoras: 24 };

/* -------------------------------------------------------------------------- */

describe("o tamanho do lote", () => {
  it("a primeira leva chama TRÊS, e não a lista inteira", () => {
    const d = decidirLeva(estado(), 40, AGORA);

    expect(d.chamar).toBe(true);
    if (!d.chamar) return;
    expect(d.quantos).toBe(TAMANHO_DO_LOTE);
    expect(d.quantos).toBeLessThan(5);
  });

  it("com menos candidatos que o lote, chama o que tem", () => {
    const d = decidirLeva(estado(), 2, AGORA);
    expect(d.chamar).toBe(true);
    if (!d.chamar) return;
    expect(d.quantos).toBe(2);
  });

  it("sem candidato, não chama — e diz que é isso", () => {
    const d = decidirLeva(estado(), 0, AGORA);
    expect(d.chamar).toBe(false);
    if (d.chamar) return;
    expect(d.motivo).toContain("Nenhum candidato");
  });
});

describe("o escalonamento", () => {
  it("espera antes da próxima leva", () => {
    const meiaHoraAtras = new Date(AGORA.getTime() - 30 * 60_000).toISOString();
    const d = decidirLeva(estado({ oferecidos: 3, ofertadoEm: meiaHoraAtras }), 10, AGORA);

    expect(d.chamar).toBe(false);
    if (d.chamar) return;
    expect(d.motivo).toContain("esperando");
  });

  it("passada a espera, a segunda leva sai", () => {
    const duasHorasAtras = new Date(AGORA.getTime() - 120 * 60_000).toISOString();
    const d = decidirLeva(estado({ oferecidos: 3, ofertadoEm: duasHorasAtras }), 10, AGORA);

    expect(d.chamar).toBe(true);
    if (!d.chamar) return;
    expect(d.motivo).toContain("Leva 2");
  });

  it("perto da hora a espera encolhe — senão só dá tempo de uma leva", () => {
    /*
     * Com 3 horas para o horário, esperar 90 minutos entre levas dá tempo para
     * DUAS. Sem o encolhimento, um cancelamento das 16h avisado às 14h receberia
     * uma leva só, e a cadeira ficaria vazia se as três pessoas estivessem
     * ocupadas.
     */
    expect(esperaAntesDaProximaLeva(2)).toBeLessThan(esperaAntesDaProximaLeva(20));
    expect(esperaAntesDaProximaLeva(2)).toBeLessThanOrEqual(20);
  });

  it("DESISTE depois do teto de levas", () => {
    /*
     * Sem o teto, um horário impopular percorreria a base inteira três pessoas
     * por vez — o broadcast que o lote pequeno veio evitar, só que lento.
     */
    const d = decidirLeva(
      estado({ oferecidos: TAMANHO_DO_LOTE * LEVAS_MAXIMAS, ofertadoEm: null }),
      50,
      AGORA,
    );

    expect(d.chamar).toBe(false);
    if (d.chamar) return;
    expect(d.motivo).toContain("não emplacou");
  });
});

describe("as janelas impossíveis", () => {
  it("horário que já passou não recebe convite", () => {
    const d = decidirLeva(estado({ horasAteOHorario: -1 }), 10, AGORA);
    expect(d.chamar).toBe(false);
  });

  it("menos de uma hora não dá tempo de chegar", () => {
    /*
     * Ninguém atravessa a cidade em quarenta minutos por uma limpeza. Chamar
     * aqui só produz frustração dos dois lados.
     */
    const d = decidirLeva(estado({ horasAteOHorario: 0.5 }), 10, AGORA);
    expect(d.chamar).toBe(false);
    if (d.chamar) return;
    expect(d.motivo).toContain("não dá tempo");
  });
});

/* -------------------------------------------------------------------------- */

describe("a ordem dos candidatos", () => {
  it("quem está na lista de espera vem primeiro", () => {
    const lista = pontuarCandidatos(
      [
        candidato({ patientId: "sem", temWaitlist: false }),
        candidato({ patientId: "com", temWaitlist: true }),
      ],
      PADRAO,
    );

    expect(lista[0]?.patientId).toBe("com");
  });

  it("quem NÃO declarou preferência continua na lista — só depois", () => {
    /*
     * "Não informou" é o caso mais comum. Excluí-lo esvaziaria a lista de
     * espera de todo mundo que nunca preencheu um formulário.
     */
    const lista = pontuarCandidatos([candidato({ temWaitlist: false })], PADRAO);

    expect(lista).toHaveLength(1);
    expect(lista[0]?.bloqueio).toBeNull();
    expect(lista[0]?.escore).toBeGreaterThan(0);
  });

  it("o tempo sem vir é um SINO, e não uma escada", () => {
    /*
     * Quem sumiu há dois anos não vem por causa de um encaixe de amanhã, e
     * chamá-lo gasta uma das três vagas com quem quase certamente não responde.
     * Uma função crescente no tempo colocaria justamente ele em primeiro.
     */
    const noPonto = pontuarCandidatos([candidato({ diasDesdeUltimaConsulta: 200 })], PADRAO);
    const sumido = pontuarCandidatos([candidato({ diasDesdeUltimaConsulta: 900 })], PADRAO);
    const recente = pontuarCandidatos([candidato({ diasDesdeUltimaConsulta: 20 })], PADRAO);

    expect(noPonto[0]?.escore).toBeGreaterThan(sumido[0]?.escore ?? 0);
    expect(noPonto[0]?.escore).toBeGreaterThan(recente[0]?.escore ?? 0);
  });

  it("todo candidato traz os fatores que o pontuaram", () => {
    const lista = pontuarCandidatos([candidato({ temWaitlist: true })], PADRAO);

    expect(lista[0]?.fatores.length).toBeGreaterThan(0);
    expect(lista[0]?.fatores.every((f) => f.rotulo.length > 0)).toBe(true);
  });
});

describe("os bloqueios", () => {
  it("quem pediu para não receber encaixe de última hora NÃO é chamado", () => {
    /*
     * ============================================================================
     *  O TESTE QUE IMPEDE A ARITMÉTICA DE ATROPELAR A PREFERÊNCIA.
     *
     *  Tratar "não aceita encaixe" como -30 pontos faria com que, numa lista
     *  curta, a pessoa fosse chamada assim mesmo — e a preferência que ela
     *  cadastrou seria ignorada por falta de concorrência.
     * ============================================================================
     */
    const lista = pontuarCandidatos([candidato({ temWaitlist: true, aceitaEncaixe: false })], {
      horasAteOHorario: 5,
      cooldownHoras: 24,
    });

    expect(lista[0]?.bloqueio).toContain("última hora");
    expect(lista[0]?.escore).toBe(0);
  });

  it("mas com antecedência, essa mesma pessoa entra", () => {
    const lista = pontuarCandidatos([candidato({ temWaitlist: true, aceitaEncaixe: false })], {
      horasAteOHorario: 72,
      cooldownHoras: 24,
    });

    expect(lista[0]?.bloqueio).toBeNull();
  });

  it("dia e hora fora da preferência bloqueiam", () => {
    const dia = pontuarCandidatos([candidato({ temWaitlist: true, diaBate: false })], PADRAO);
    const hora = pontuarCandidatos([candidato({ temWaitlist: true, horaBate: false })], PADRAO);

    expect(dia[0]?.bloqueio).toContain("dia da semana");
    expect(hora[0]?.bloqueio).toContain("janela");
  });

  it("mas quem NÃO tem waitlist não é bloqueado por preferência que não existe", () => {
    /*
     * `diaBate: false` sem waitlist significa "não há preferência para
     * comparar". Bloquear aqui excluiria todo mundo que nunca preencheu nada.
     */
    const lista = pontuarCandidatos(
      [candidato({ temWaitlist: false, diaBate: false, horaBate: false })],
      PADRAO,
    );

    expect(lista[0]?.bloqueio).toBeNull();
  });

  it("cooldown bloqueia, e o motivo traz o número de horas", () => {
    const lista = pontuarCandidatos([candidato({ horasDesdeUltimoContato: 3 })], {
      horasAteOHorario: 20,
      cooldownHoras: 24,
    });

    expect(lista[0]?.bloqueio).toContain("3h");
  });

  it("bloqueados vão para o fim, mas continuam visíveis", () => {
    /*
     * A tela precisa poder responder "por que a Ana, que é a óbvia, não foi
     * chamada". Sumir com ela da lista transforma a resposta em silêncio.
     */
    const lista = pontuarCandidatos(
      [
        candidato({ patientId: "bloqueado", horasDesdeUltimoContato: 1 }),
        candidato({ patientId: "livre" }),
      ],
      { horasAteOHorario: 20, cooldownHoras: 24 },
    );

    expect(lista).toHaveLength(2);
    expect(lista[0]?.patientId).toBe("livre");
    expect(lista[1]?.bloqueio).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("o valor do buraco", () => {
  it("é proporcional à duração", () => {
    expect(valorDoBuraco(60, 250)).toBe(250);
    expect(valorDoBuraco(30, 250)).toBe(125);
    expect(valorDoBuraco(120, 250)).toBe(500);
  });

  it("não devolve negativo com entrada esquisita", () => {
    expect(valorDoBuraco(-60, 250)).toBe(0);
    expect(valorDoBuraco(60, -250)).toBe(0);
  });
});
