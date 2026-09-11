/**
 * Patient Brain e Opportunity Brain — Fase H.
 *
 * O QUE ESTES TESTES PROTEGEM, além do cálculo: as decisões de LEITURA que
 * distinguem uma ficha útil de uma ficha perigosa.
 *
 *   O opt-out aparece ANTES de tudo, inclusive na frente de um orçamento de
 *   R$ 50.000 — que é exatamente o caso em que alguém racionalizaria a ligação.
 *
 *   Memória PENDENTE não entra. Ela existe para não influenciar decisão antes
 *   de alguém conferir; mostrá-la numa ficha que a recepção lê antes de ligar
 *   faria a conferência acontecer depois do uso.
 *
 *   A objeção vai com AS PALAVRAS DA PESSOA. "Objeção: PREÇO" não prepara
 *   ninguém para a ligação.
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

import { _limparCacheDeConfiguracao } from "../servidor/configuracao";
import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { cerebroDaOportunidade, cerebroDoPaciente } from "./cerebros";
import { esquecerFusos } from "./orcamento";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const PACIENTE = "33333333-3333-4333-8333-333333333333";
const OPORTUNIDADE = "55555555-5555-4555-8555-555555555555";
const ETAPA = "66666666-6666-4666-8666-666666666666";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const diasAtras = (n: number): string => new Date(AGORA.getTime() - n * 86_400_000).toISOString();

function semearPaciente(extra: Record<string, unknown> = {}): void {
  semear("crc_patients", [
    {
      id: PACIENTE,
      organization_id: ORG,
      clinic_id: CLINICA,
      external_id: "pac-1",
      nome: "Ana Paula Souza",
      ultima_consulta_em: diasAtras(400),
      proxima_consulta_em: null,
      ...extra,
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  _limparCacheDeConfiguracao();
  esquecerFusos();
  semear("crc_organizations", [
    { id: ORG, slug: "jp" },
    { id: OUTRA, slug: "outra" },
  ]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, nome: "JP", slug: "matriz" }]);
});

/* ========================================================================== */
/* Patient Brain                                                              */
/* ========================================================================== */

describe("cérebro do paciente", () => {
  it("junta risco, horário e valor numa linha só", async () => {
    semearPaciente();
    semear("crc_budgets", [
      {
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        total_value: 8000,
        status: "APROVADO",
        provider: "dental_office",
        external_id: "orc-1",
      },
    ]);

    const c = await cerebroDoPaciente(ORG, PACIENTE, AGORA);

    expect(c).not.toBeNull();
    expect(c?.valorEmAberto).toBe(8000);
    // Orçamento aprovado sem consulta marcada é o sinal mais forte da lista.
    expect(c?.risco.fatores.some((f) => f.codigo === "tratamento_interrompido")).toBe(true);
    expect(c?.resumo).toContain("Ana");
  });

  it("o OPT-OUT vem antes de tudo, inclusive de R$ 50.000 em aberto", async () => {
    semearPaciente({ opt_out_em: diasAtras(10) });
    semear("crc_budgets", [
      {
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        total_value: 50_000,
        status: "APROVADO",
        provider: "dental_office",
        external_id: "orc-2",
      },
    ]);

    const c = await cerebroDoPaciente(ORG, PACIENTE, AGORA);

    /*
     * O VALOR ALTO É ISCA DE PROPÓSITO. É exatamente o caso em que alguém
     * racionalizaria a ligação — "mas são cinquenta mil". O resumo não pode dar
     * margem: ele diz para não contatar, e não menciona o valor.
     */
    expect(c?.resumo).toContain("não receber contato");
    expect(c?.resumo).not.toContain("50.000");
  });

  it("quem tem consulta marcada aparece como resolvido", async () => {
    semearPaciente({ proxima_consulta_em: diasAtras(-5) });

    const c = await cerebroDoPaciente(ORG, PACIENTE, AGORA);

    expect(c?.risco.escore).toBe(0);
    expect(c?.resumo).toContain("Nada a fazer");
  });

  it("orçamento aprovado COM consulta marcada não é interrupção", async () => {
    semearPaciente({ proxima_consulta_em: diasAtras(-3) });
    semear("crc_budgets", [
      {
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        total_value: 6000,
        status: "APROVADO",
        provider: "dental_office",
        external_id: "orc-3",
      },
    ]);

    const c = await cerebroDoPaciente(ORG, PACIENTE, AGORA);

    // Tratamento EM ANDAMENTO é o oposto de interrompido. Olhar só o orçamento
    // poria metade dos pacientes ativos na lista de retenção.
    expect(c?.risco.fatores.some((f) => f.codigo === "tratamento_interrompido")).toBe(false);
  });

  it("memória PENDENTE não entra na ficha", async () => {
    semearPaciente();
    semear("crc_ai_memories", [
      {
        organization_id: ORG,
        escopo: "paciente",
        subject_id: PACIENTE,
        conteudo: "Prefere atendimento pela manhã.",
        origem: "conversa",
        status: "CONFIRMADA",
      },
      {
        organization_id: ORG,
        escopo: "paciente",
        subject_id: PACIENTE,
        conteudo: "Talvez esteja grávida.",
        origem: "conversa",
        status: "PENDENTE",
      },
    ]);

    const c = await cerebroDoPaciente(ORG, PACIENTE, AGORA);

    /*
     * A PENDENTE ESCOLHIDA PARA O TESTE É DELIBERADA. "Talvez esteja grávida" é
     * exatamente o tipo de conclusão que o modelo tira de um comentário solto e
     * que, exibida numa ficha, muda como a recepção fala com a pessoa — antes de
     * qualquer um ter conferido.
     *
     * O estado PENDENTE existe para isso. Mostrá-lo faria a conferência
     * acontecer depois de a informação já ter sido usada.
     */
    expect(c?.memorias).toEqual(["Prefere atendimento pela manhã."]);
  });

  it("não devolve paciente de outra clínica", async () => {
    semear("crc_patients", [
      {
        id: PACIENTE,
        organization_id: OUTRA,
        clinic_id: CLINICA,
        external_id: "x",
        nome: "Alguém",
      },
    ]);

    // O tenant entra no filtro mesmo sabendo o id. Id é chute possível.
    expect(await cerebroDoPaciente(ORG, PACIENTE, AGORA)).toBeNull();
  });

  it("descobre o melhor horário a partir das RESPOSTAS do paciente", async () => {
    semearPaciente();
    semear(
      "crc_messages",
      Array.from({ length: 6 }, (_, i) => ({
        organization_id: ORG,
        conversation_id: null,
        patient_id: PACIENTE,
        direcao: "ENTRADA",
        remetente: "paciente",
        conteudo: "oi",
        chave_dedupe: `e${String(i)}`,
        // 22h UTC = 19h em São Paulo.
        criado_em: new Date(AGORA.getTime() - i * 86_400_000 + 8 * 3_600_000).toISOString(),
      })),
    );

    const c = await cerebroDoPaciente(ORG, PACIENTE, AGORA);

    expect(c?.melhorHorario.sabemos).toBe(true);
  });

  it("mensagem ENVIADA não conta como resposta", async () => {
    semearPaciente();
    semear(
      "crc_messages",
      Array.from({ length: 8 }, (_, i) => ({
        organization_id: ORG,
        conversation_id: null,
        patient_id: PACIENTE,
        // SAIDA: é a clínica falando, e não a pessoa respondendo.
        direcao: "SAIDA",
        remetente: "ia",
        conteudo: "oi",
        chave_dedupe: `s${String(i)}`,
        criado_em: new Date(AGORA.getTime() - i * 86_400_000).toISOString(),
      })),
    );

    const c = await cerebroDoPaciente(ORG, PACIENTE, AGORA);

    // Contar envio mediria o hábito de quem configurou a jornada, e não o da
    // pessoa. É o mesmo filtro que já quebrou uma vez neste projeto.
    expect(c?.melhorHorario.sabemos).toBe(false);
  });
});

/* ========================================================================== */
/* Opportunity Brain                                                          */
/* ========================================================================== */

function semearOportunidade(extra: Record<string, unknown> = {}): void {
  semear("crc_opportunity_stages", [
    { id: ETAPA, organization_id: ORG, nome: "Orçamento enviado", ordem: 3 },
  ]);
  semear("crc_opportunities", [
    {
      id: OPORTUNIDADE,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      tipo: "TRATAMENTO",
      stage_id: ETAPA,
      potential_value: 12_000,
      fechada_em: null,
      atualizado_em: diasAtras(30),
      ...extra,
    },
  ]);
}

describe("cérebro da oportunidade", () => {
  it("mostra etapa, valor e há quanto tempo está parada", async () => {
    semearPaciente();
    semearOportunidade();

    const c = await cerebroDaOportunidade(ORG, OPORTUNIDADE, AGORA);

    expect(c?.etapa).toBe("Orçamento enviado");
    expect(c?.valorPotencial).toBe(12_000);
    expect(c?.diasParada).toBe(30);
    expect(c?.resumo).toContain("Parada há 30 dias");
  });

  it("a objeção vai com AS PALAVRAS da pessoa", async () => {
    semearPaciente();
    semearOportunidade();
    semear("crc_opportunity_history", [
      {
        opportunity_id: OPORTUNIDADE,
        motivo: "tá caro, achei metade disso na clínica do bairro",
        origem: "agente",
        criado_em: diasAtras(5),
      },
    ]);

    const c = await cerebroDaOportunidade(ORG, OPORTUNIDADE, AGORA);

    expect(c?.objecoes[0]?.categoria).toBe("PRECO");
    // "Objeção: PREÇO" não prepara ninguém para a ligação. A frase prepara — e
    // esta frase muda completamente o que dizer.
    expect(c?.resumo).toContain("clínica do bairro");
  });

  it("a ação depende da objeção, e não do valor", async () => {
    semearPaciente();
    semearOportunidade();
    semear("crc_opportunity_history", [
      {
        opportunity_id: OPORTUNIDADE,
        motivo: "vou falar com meu marido",
        origem: "agente",
        criado_em: diasAtras(3),
      },
    ]);

    const c = await cerebroDaOportunidade(ORG, OPORTUNIDADE, AGORA);

    // A pessoa precisa APRESENTAR o orçamento, e não relembrar dele.
    expect(c?.acaoSugerida).toContain("por escrito");
  });

  it("parada sem objeção manda PERGUNTAR, e não insistir", async () => {
    semearPaciente();
    semearOportunidade({ atualizado_em: diasAtras(45) });

    const c = await cerebroDaOportunidade(ORG, OPORTUNIDADE, AGORA);

    /*
     * O CASO MAIS COMUM E O MAIS MAL TRATADO. Ninguém disse não; simplesmente
     * parou. A reação usual é insistir com a mesma proposta, e a pergunta que
     * falta é anterior: o que impediu?
     */
    expect(c?.acaoSugerida).toContain("o que impediu");
  });

  it("negociação recente não é tratada como parada", async () => {
    semearPaciente();
    semearOportunidade({ atualizado_em: diasAtras(2) });

    const c = await cerebroDaOportunidade(ORG, OPORTUNIDADE, AGORA);
    expect(c?.acaoSugerida).toContain("andando");
  });

  it("oportunidade FECHADA não tem cérebro", async () => {
    semearPaciente();
    semearOportunidade({ fechada_em: diasAtras(1) });

    // Um painel que analisa negociação fechada gera ligação para quem já
    // comprou — ou para quem já disse não, que é pior.
    expect(await cerebroDaOportunidade(ORG, OPORTUNIDADE, AGORA)).toBeNull();
  });

  it("não devolve oportunidade de outra clínica", async () => {
    semearOportunidade({ organization_id: OUTRA });
    expect(await cerebroDaOportunidade(ORG, OPORTUNIDADE, AGORA)).toBeNull();
  });
});
