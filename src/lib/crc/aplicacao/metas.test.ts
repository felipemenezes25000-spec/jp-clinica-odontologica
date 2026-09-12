/**
 * Metas, com banco.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o do BASELINE CONGELADO.
 *
 *  Se ele fosse recalculado a cada medição, a meta se moveria junto com o
 *  resultado e o progresso seria eternamente zero — o módulo inteiro viraria
 *  enfeite, sem nenhum erro na tela.
 *
 *  INJEÇÃO DE DEFEITO:
 *    recalcular o baseline ao medir     → "o baseline não se move" quebra;
 *    contar POTENCIAL como receita      → "potencial não é receita" quebra;
 *    medir agendamento por inicio_em    → "marcar hoje conta hoje" quebra;
 *    permitir reabrir meta ATINGIDA     → "estado terminal" quebra;
 *    contar quem nunca sumiu            → "reativado é quem estava sumido" quebra.
 * ============================================================================
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

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { criarMeta, listarMetas, medirMeta, medirValor, mudarStatus } from "./metas";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AUTOR = "aaaa9999-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

let seq = 0;

function consulta(p: {
  criadoEm?: string;
  inicioEm?: string;
  status?: string;
  paciente?: string | null;
}): void {
  seq += 1;
  const quando = p.inicioEm ?? AGORA.toISOString();
  semear("crc_appointments", [
    {
      id: `ag-${String(seq)}`,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: p.paciente ?? null,
      external_source: "dental_office",
      external_id: `ag-${String(seq)}`,
      dentista_externo_id: "d-1",
      dentista_nome: "Dra. Juliana",
      inicio_em: quando,
      fim_em: new Date(Date.parse(quando) + 3_600_000).toISOString(),
      status: p.status ?? "COMPLETED",
      risco_fatores: [],
      criado_em: p.criadoEm ?? quando,
      atualizado_em: quando,
    },
  ]);
}

function receita(p: {
  valor: number;
  natureza: string;
  recuperada: boolean;
  quando?: string;
}): void {
  seq += 1;
  semear("crc_revenue_events", [
    {
      id: `rv-${String(seq)}`,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: null,
      opportunity_id: null,
      enrollment_id: null,
      natureza: p.natureza,
      valor: p.valor,
      motivo: "teste",
      recuperada: p.recuperada,
      ocorrido_em: p.quando ?? AGORA.toISOString(),
      criado_em: AGORA.toISOString(),
      chave_dedupe: `rv-${String(seq)}`,
    },
  ]);
}

const DE = "2026-09-01T00:00:00.000Z";
const ATE = "2026-09-30T00:00:00.000Z";

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  seq = 0;
});

/* -------------------------------------------------------------------------- */

describe("a medição", () => {
  it("potencial NÃO é receita recuperada", async () => {
    /*
     * ============================================================================
     *  É o item 63 aplicado à meta: potencial e confirmado nunca no mesmo número.
     *
     *  Contar POTENCIAL aqui faria a meta ser batida por expectativa — o Radar
     *  estima R$ 50.000 que "podem" voltar, a meta fecha, e ninguém recebeu
     *  nada.
     * ============================================================================
     */
    receita({ valor: 50_000, natureza: "POTENCIAL", recuperada: true });
    receita({ valor: 1_000, natureza: "PRODUCAO", recuperada: true });
    // Produção que NÃO veio do CRC também não conta: a meta é sobre o que o
    // sistema recuperou, não sobre o faturamento da clínica.
    receita({ valor: 9_000, natureza: "PRODUCAO", recuperada: false });

    expect(await medirValor("RECEITA_RECUPERADA", ORG, [CLINICA], DE, ATE)).toBe(1_000);
  });

  it("marcar hoje uma consulta para março conta HOJE", async () => {
    /*
     * A meta é sobre o trabalho de MARCAR, e não sobre quando a consulta
     * acontece. Se a janela fosse `inicio_em`, o esforço de setembro apareceria
     * como resultado de março — e o mês de trabalho fecharia em zero.
     */
    consulta({ criadoEm: "2026-09-10T10:00:00.000Z", inicioEm: "2027-03-01T10:00:00.000Z" });

    expect(await medirValor("AGENDAMENTOS", ORG, [CLINICA], DE, ATE)).toBe(1);
  });

  it("cancelada não conta como agendamento", async () => {
    consulta({ criadoEm: "2026-09-10T10:00:00.000Z", status: "CANCELLED" });
    consulta({ criadoEm: "2026-09-10T10:00:00.000Z", status: "SCHEDULED" });

    expect(await medirValor("AGENDAMENTOS", ORG, [CLINICA], DE, ATE)).toBe(1);
  });

  it("a taxa de falta ignora o cancelamento dos dois lados", async () => {
    // Cancelamento com aviso não é falta: a cadeira dá tempo de ser reocupada.
    for (let i = 0; i < 2; i += 1)
      consulta({ inicioEm: "2026-09-05T10:00:00.000Z", status: "MISSED" });
    for (let i = 0; i < 8; i += 1)
      consulta({ inicioEm: "2026-09-05T10:00:00.000Z", status: "COMPLETED" });
    for (let i = 0; i < 90; i += 1)
      consulta({ inicioEm: "2026-09-05T10:00:00.000Z", status: "CANCELLED" });

    expect(await medirValor("REDUZIR_FALTAS", ORG, [CLINICA], DE, ATE)).toBe(20);
  });

  it("reativado é quem estava SUMIDO — e não quem nunca parou", async () => {
    /*
     * ============================================================================
     *  Contar "marcou no período" devolveria a agenda inteira e a meta de
     *  reativação nasceria batida no primeiro dia.
     *
     *  Aqui: o paciente A sumiu (última consulta há mais de seis meses) e voltou.
     *  O B nunca parou de vir. Só o A conta.
     * ============================================================================
     */
    // A: consulta antiga, fora dos seis meses anteriores à janela.
    consulta({ paciente: "pac-a", inicioEm: "2025-01-10T10:00:00.000Z" });
    // A voltou agora.
    consulta({ paciente: "pac-a", criadoEm: "2026-09-10T10:00:00.000Z" });
    // B veio mês passado, e voltou agora.
    consulta({ paciente: "pac-b", inicioEm: "2026-08-10T10:00:00.000Z" });
    consulta({ paciente: "pac-b", criadoEm: "2026-09-10T10:00:00.000Z" });

    expect(await medirValor("REATIVAR_PACIENTES", ORG, [CLINICA], DE, ATE)).toBe(1);
  });

  it("sem clínica alcançada, não mede nada", async () => {
    receita({ valor: 9_999, natureza: "PRODUCAO", recuperada: true });

    expect(await medirValor("RECEITA_RECUPERADA", ORG, [], DE, ATE)).toBe(0);
  });

  it("denominador vazio não vira NaN nem Infinity", async () => {
    // Sem nenhuma consulta, a conversão é 0 — e não `NaN`, que envenenaria o
    // gráfico inteiro e apareceria como "NaN%" na tela.
    const v = await medirValor("CONVERSAO_ORCAMENTO", ORG, [CLINICA], DE, ATE);

    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("criar e medir", () => {
  it("o baseline NÃO se move quando a meta é medida", async () => {
    /*
     * ============================================================================
     *  ESTE É O TESTE QUE JUSTIFICA O MÓDULO EXISTIR.
     *
     *  A meta nasce com 1 consulta de baseline — o que o mês ANTERIOR produziu.
     *  Depois a clínica marca mais 4, já dentro do período da meta.
     *
     *  Se o baseline fosse recalculado ao medir, ele viraria 5 e o progresso
     *  seria zero para sempre — com a clínica trabalhando.
     * ============================================================================
     */
    // Antes da meta: uma consulta, dentro da janela de baseline (30 dias atrás).
    consulta({ criadoEm: "2026-08-20T10:00:00.000Z" });

    const r = await criarMeta(
      {
        organizationId: ORG,
        clinicIds: [CLINICA],
        clinicId: CLINICA,
        titulo: "Marcar mais consultas",
        tipo: "AGENDAMENTOS",
        alvo: 10,
        prazoEm: "2026-10-12T14:00:00.000Z",
        maxContatosDia: 50,
        maxAutonomia: 2,
        autorId: AUTOR,
      },
      AGORA,
    );

    expect(r.ok).toBe(true);
    const id = r.id ?? "";

    const antes = conteudo("crc_goals")[0];
    const baselineOriginal = Number(antes?.["baseline"] ?? -1);
    expect(baselineOriginal).toBe(1);

    // A clínica trabalha DEPOIS de a meta existir: mais quatro consultas.
    for (let i = 0; i < 4; i += 1) consulta({ criadoEm: "2026-09-15T10:00:00.000Z" });

    await mudarStatus({ organizationId: ORG, goalId: id, para: "ATIVA", autorId: AUTOR }, AGORA);

    const depoisDeUmaSemana = new Date("2026-09-19T14:00:00.000Z");
    const medicao = await medirMeta(ORG, [CLINICA], id, depoisDeUmaSemana);

    // As 4 do período. A do mês anterior NÃO entra: ela é baseline, e a janela
    // de medição começa quando a meta começou.
    expect(medicao.ok).toBe(true);
    expect(medicao.valor).toBe(4);

    const depois = conteudo("crc_goals")[0];
    expect(Number(depois?.["baseline"])).toBe(baselineOriginal);
    expect(Number(depois?.["progresso_atual"])).toBe(4);
  });

  it("meta de CONTAGEM parte do zero, e não do total do mês anterior", async () => {
    /*
     * ============================================================================
     *  O DEFEITO QUE ESTE TESTE EXISTE PARA IMPEDIR, e que o teste de cima
     *  encontrou na primeira versão deste módulo:
     *
     *  usar o baseline de uma meta de CONTAGEM como ponto de partida do
     *  progresso. "Marcar 10 consultas" com 8 no mês passado viraria
     *  `(atual - 8) / (10 - 8)` — e as 4 consultas do período apareceriam como
     *  progresso NEGATIVO, com a clínica trabalhando.
     *
     *  Ninguém começa o mês com 8 consultas já marcadas. As 8 são referência.
     * ============================================================================
     */
    for (let i = 0; i < 8; i += 1) consulta({ criadoEm: "2026-08-20T10:00:00.000Z" });

    const r = await criarMeta(
      {
        organizationId: ORG,
        clinicIds: [CLINICA],
        clinicId: CLINICA,
        titulo: "Marcar 10",
        tipo: "AGENDAMENTOS",
        alvo: 10,
        prazoEm: "2026-10-12T14:00:00.000Z",
        maxContatosDia: 50,
        maxAutonomia: 2,
        autorId: AUTOR,
      },
      AGORA,
    );
    const id = r.id ?? "";

    expect(Number(conteudo("crc_goals")[0]?.["baseline"])).toBe(8);

    for (let i = 0; i < 4; i += 1) consulta({ criadoEm: "2026-09-15T10:00:00.000Z" });
    await mudarStatus({ organizationId: ORG, goalId: id, para: "ATIVA", autorId: AUTOR }, AGORA);
    await medirMeta(ORG, [CLINICA], id, new Date("2026-09-19T14:00:00.000Z"));

    const lista = await listarMetas(ORG, [CLINICA], new Date("2026-09-19T14:00:00.000Z"));
    const p = lista[0]?.progresso;

    // 4 de 10, partindo do zero. Com o baseline como origem, seria -2/2 = -100%.
    expect(p?.fracao).toBeCloseTo(0.4, 2);
    expect(lista[0]?.ehAcumulado).toBe(true);
    expect(lista[0]?.baseline).toBe(8);
  });

  it("uma medição por dia, mesmo chamando várias vezes", async () => {
    // A varredura roda mais de uma vez por dia. Sem a chave de dedupe, a série
    // teria uma linha por execução e o gráfico viraria ruído.
    consulta({ criadoEm: "2026-09-01T10:00:00.000Z" });

    const r = await criarMeta(
      {
        organizationId: ORG,
        clinicIds: [CLINICA],
        clinicId: CLINICA,
        titulo: "Meta",
        tipo: "AGENDAMENTOS",
        alvo: 10,
        prazoEm: "2026-10-12T14:00:00.000Z",
        maxContatosDia: 50,
        maxAutonomia: 2,
        autorId: AUTOR,
      },
      AGORA,
    );
    const id = r.id ?? "";

    await medirMeta(ORG, [CLINICA], id, AGORA);
    await medirMeta(ORG, [CLINICA], id, AGORA);
    await medirMeta(ORG, [CLINICA], id, AGORA);

    expect(conteudo("crc_goal_metrics")).toHaveLength(1);
  });

  it("o prazo precisa ser no futuro", async () => {
    const r = await criarMeta(
      {
        organizationId: ORG,
        clinicIds: [CLINICA],
        clinicId: CLINICA,
        titulo: "Meta do passado",
        tipo: "AGENDAMENTOS",
        alvo: 10,
        prazoEm: "2026-01-01T00:00:00.000Z",
        maxContatosDia: 50,
        maxAutonomia: 2,
        autorId: AUTOR,
      },
      AGORA,
    );

    expect(r.ok).toBe(false);
    expect(conteudo("crc_goals")).toHaveLength(0);
  });

  it("a meta nasce com plano — uma meta sem plano é um desejo", async () => {
    semear("crc_schedule_gaps", [
      {
        id: "b1",
        organization_id: ORG,
        clinic_id: CLINICA,
        inicio_em: "2026-09-20T13:00:00.000Z",
        fim_em: "2026-09-20T14:00:00.000Z",
        duracao_min: 60,
        status: "ABERTO",
        oferecidos: 0,
        chave_dedupe: "b1",
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);

    const r = await criarMeta(
      {
        organizationId: ORG,
        clinicIds: [CLINICA],
        clinicId: CLINICA,
        titulo: "Encher a agenda",
        tipo: "AGENDAMENTOS",
        alvo: 20,
        prazoEm: "2026-10-12T14:00:00.000Z",
        maxContatosDia: 50,
        maxAutonomia: 2,
        autorId: AUTOR,
      },
      AGORA,
    );

    expect(r.ok).toBe(true);
    expect(conteudo("crc_goal_actions").length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("os estados", () => {
  async function metaNova(): Promise<string> {
    const r = await criarMeta(
      {
        organizationId: ORG,
        clinicIds: [CLINICA],
        clinicId: CLINICA,
        titulo: "Meta",
        tipo: "AGENDAMENTOS",
        alvo: 10,
        prazoEm: "2026-10-12T14:00:00.000Z",
        maxContatosDia: 50,
        maxAutonomia: 2,
        autorId: AUTOR,
      },
      AGORA,
    );
    return r.id ?? "";
  }

  it("aprovar a meta aprova o plano junto", async () => {
    /*
     * Deixar as ações em PLANEJADA depois de a meta virar ATIVA criaria um
     * estado em que a meta está correndo e nenhuma ação foi autorizada — e o
     * dono acharia que aprovou algo que não vai acontecer.
     */
    semear("crc_schedule_gaps", [
      {
        id: "b1",
        organization_id: ORG,
        clinic_id: CLINICA,
        inicio_em: "2026-09-20T13:00:00.000Z",
        fim_em: "2026-09-20T14:00:00.000Z",
        duracao_min: 60,
        status: "ABERTO",
        oferecidos: 0,
        chave_dedupe: "b1",
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);

    const id = await metaNova();
    await mudarStatus({ organizationId: ORG, goalId: id, para: "ATIVA", autorId: AUTOR }, AGORA);

    const acoes = conteudo("crc_goal_actions");
    expect(acoes.length).toBeGreaterThan(0);
    expect(acoes.every((a) => a["status"] === "APROVADA")).toBe(true);
  });

  it("uma meta ATINGIDA é terminal — não reabre", async () => {
    const id = await metaNova();
    await mudarStatus({ organizationId: ORG, goalId: id, para: "ATIVA", autorId: AUTOR }, AGORA);

    // Força o estado terminal como a medição faria.
    const { atualizar } = await import("../testes/banco-memoria");
    await atualizar("crc_goals", [{ coluna: "id", op: "eq", valor: id }], { status: "ATINGIDA" });

    const r = await mudarStatus(
      { organizationId: ORG, goalId: id, para: "ATIVA", autorId: AUTOR },
      AGORA,
    );

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("não muda mais");
  });

  it("rascunho não vai direto para pausada", async () => {
    const id = await metaNova();

    const r = await mudarStatus(
      { organizationId: ORG, goalId: id, para: "PAUSADA", autorId: AUTOR },
      AGORA,
    );

    expect(r.ok).toBe(false);
  });

  it("meta de outra organização não é encontrada", async () => {
    const id = await metaNova();

    const r = await mudarStatus(
      {
        organizationId: "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        goalId: id,
        para: "ATIVA",
        autorId: AUTOR,
      },
      AGORA,
    );

    expect(r.ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("a lista", () => {
  it("sem medição, o progresso é null — e não zero", async () => {
    /*
     * Zero diz "não andamos nada"; `null` diz "ainda não olhamos". A tela
     * precisa distinguir: a primeira é notícia ruim, a segunda é só uma meta
     * recém-criada.
     */
    await criarMeta(
      {
        organizationId: ORG,
        clinicIds: [CLINICA],
        clinicId: CLINICA,
        titulo: "Meta",
        tipo: "AGENDAMENTOS",
        alvo: 10,
        prazoEm: "2026-10-12T14:00:00.000Z",
        maxContatosDia: 50,
        maxAutonomia: 2,
        autorId: AUTOR,
      },
      AGORA,
    );

    const lista = await listarMetas(ORG, [CLINICA], AGORA);

    expect(lista).toHaveLength(1);
    expect(lista[0]?.progresso).toBeNull();
    expect(lista[0]?.comoMede.length).toBeGreaterThan(20);
  });

  it("sem clínica alcançada, a lista é vazia", async () => {
    expect(await listarMetas(ORG, [], AGORA)).toHaveLength(0);
  });
});
