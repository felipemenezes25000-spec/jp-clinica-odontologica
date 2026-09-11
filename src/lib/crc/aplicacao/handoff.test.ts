/**
 * A cascata do handoff — Fase C.
 *
 * O QUE ESTES TESTES PRECISAM PROVAR não é que o caso humano é criado: isso
 * `casos.test.ts` já cobre. É o que acontece QUANDO A GRAVAÇÃO FALHA.
 *
 * O código anterior tinha um `catch {}` neste ponto. O agente decidia "isto
 * exige uma pessoa" — conteúdo clínico, reclamação, pedido explícito de falar
 * com gente —, o INSERT quebrava, e o turno seguia. Ninguém na clínica ficava
 * sabendo, e do outro lado havia alguém esperando.
 *
 * Um teste que só exercita o caminho feliz de um caminho de segurança não testa
 * segurança nenhuma: ele testa a parte que nunca foi o problema.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As tabelas que este teste pode derrubar.
 *
 * DERRUBAR NA CAMADA DE BANCO, e não trocar `abrirCaso` por um dublê: é assim
 * que a falha acontece de verdade — a função real roda, chega no INSERT e leva
 * um erro do Postgres. Um dublê provaria que a cascata reage ao dublê.
 */
const estado = vi.hoisted(() => ({
  quebrado: new Set<string>(),
  avisos: [] as { nivel: string; mensagem: string }[],
}));

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  const barrar = (tabela: string): Promise<never> | null =>
    estado.quebrado.has(tabela) ? Promise.reject(new Error(`${tabela} indisponível`)) : null;

  return {
    ...fake,
    inserirIgnorandoDuplicata: (tabela: string, linhas: never) =>
      barrar(tabela) ?? fake.inserirIgnorandoDuplicata(tabela, linhas),
    inserir: (tabela: string, linhas: never) => barrar(tabela) ?? fake.inserir(tabela, linhas),
  };
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return {
    ...real,
    registrar: (nivel: string, mensagem: string) => {
      estado.avisos.push({ nivel, mensagem });
    },
    auditar: () => Promise.resolve(),
  };
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { garantirHandoff, type PedidoHandoff } from "./handoff";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const PACIENTE = "33333333-3333-4333-8333-333333333333";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const CASOS = "crc_human_cases";
const TAREFAS = "crc_tasks";
const MORTAS = "crc_dead_letters";

const pedido = (extra: Partial<PedidoHandoff> = {}): PedidoHandoff => ({
  organizationId: ORG,
  clinicId: CLINICA,
  conversationId: CONVERSA,
  patientId: PACIENTE,
  codigo: "conteudo_clinico",
  motivo: "A pessoa perguntou sobre remédio.",
  resumo: "Paciente com dor depois do canal.",
  respostaBarrada: "Pode tomar dipirona.",
  chaveDedupe: "turno:evento-1",
  runId: null,
  ...extra,
});

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  estado.quebrado.clear();
  estado.avisos.length = 0;

  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, nome: "JP Centro" }]);
  semear("crc_conversations", [
    {
      id: CONVERSA,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      canal: "whatsapp",
      contato_externo: "5511999998888",
      status: "ABERTA",
    },
  ]);
});

describe("garantirHandoff — degrau 1", () => {
  it("abre o caso humano quando o banco está inteiro", async () => {
    const r = await garantirHandoff(pedido());

    expect(r.destino).toBe("caso");
    expect(r.falhas).toEqual([]);
    expect(conteudo(CASOS)).toHaveLength(1);
    // Nada foi para os degraus seguintes: a cascata para no primeiro que funciona.
    expect(conteudo(TAREFAS)).toHaveLength(0);
    expect(conteudo(MORTAS)).toHaveLength(0);
  });

  it("não duplica quando o mesmo turno é reprocessado", async () => {
    await garantirHandoff(pedido());
    await garantirHandoff(pedido());

    expect(conteudo(CASOS)).toHaveLength(1);
  });
});

describe("garantirHandoff — a cascata", () => {
  it("cai para tarefa quando a tabela de casos está fora", async () => {
    estado.quebrado.add(CASOS);

    const r = await garantirHandoff(pedido());

    expect(r.destino).toBe("tarefa");
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]).toContain("caso");

    const tarefas = conteudo(TAREFAS);
    expect(tarefas).toHaveLength(1);

    // A CONVERSA TEM QUE ESTAR NA TAREFA. `crc_tasks` não tem FK para conversa;
    // sem o id no texto, a recepção recebe "a IA pediu ajuda" e não tem como
    // descobrir com quem falar. Seria registro sem destino.
    expect(String(tarefas[0]?.["notas"])).toContain(CONVERSA);
    // E o rascunho que a IA ia mandar, que é o que a pessoa vai corrigir.
    expect(String(tarefas[0]?.["notas"])).toContain("dipirona");
    expect(tarefas[0]?.["patient_id"]).toBe(PACIENTE);
  });

  it("cai para dead letter quando caso e tarefa estão fora", async () => {
    estado.quebrado.add(CASOS);
    estado.quebrado.add(TAREFAS);

    const r = await garantirHandoff(pedido());

    expect(r.destino).toBe("dead_letter");
    expect(r.falhas).toHaveLength(2);

    const mortas = conteudo(MORTAS);
    expect(mortas).toHaveLength(1);
    expect(mortas[0]?.["origem"]).toBe("handoff");
    expect(String(mortas[0]?.["erro"])).toContain("pediu humano");
  });

  it("grita no log quando os três caminhos de gravação falham", async () => {
    estado.quebrado.add(CASOS);
    estado.quebrado.add(TAREFAS);
    estado.quebrado.add(MORTAS);

    const r = await garantirHandoff(pedido());

    expect(r.destino).toBe("nenhum");
    expect(r.falhas).toHaveLength(3);

    // SEVERIDADE ALTA, e não aviso. Três caminhos de gravação fora significa
    // banco fora — é incidente, e o alerta tem que acordar alguém.
    const grito = estado.avisos.find((a) => a.mensagem.includes("HANDOFF PERDIDO"));
    expect(grito).toBeDefined();
    expect(grito?.nivel).toBe("erro");
  });

  it("nunca lança, aconteça o que acontecer", async () => {
    estado.quebrado.add(CASOS);
    estado.quebrado.add(TAREFAS);
    estado.quebrado.add(MORTAS);

    // O desfecho do turno já foi decidido quando isto roda. Uma exceção aqui
    // trocaria "precisa de gente" por "o turno inteiro explodiu" — e o job
    // voltaria para a fila para pagar o modelo de novo e falhar de novo.
    await expect(garantirHandoff(pedido())).resolves.toMatchObject({ destino: "nenhum" });
  });
});

describe("garantirHandoff — prioridade", () => {
  it("põe conteúdo clínico como alta e o resto como normal", async () => {
    await garantirHandoff(pedido({ codigo: "conteudo_clinico" }));
    const clinico = conteudo(CASOS)[0]?.["prioridade"];

    // Um caso aberto por conversa: para ver o segundo código é preciso limpar.
    limparBanco();
    semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
    semear("crc_conversations", [
      { id: CONVERSA, organization_id: ORG, canal: "whatsapp", contato_externo: "5511999998888" },
    ]);
    await garantirHandoff(pedido({ codigo: "promessa_sem_acao" }));

    expect(clinico).toBe("ALTA");
    expect(conteudo(CASOS)[0]?.["prioridade"]).toBe("NORMAL");
  });

  it("traduz a prioridade para o número que a fila de tarefas ordena", async () => {
    estado.quebrado.add(CASOS);

    await garantirHandoff(pedido({ codigo: "conteudo_clinico" }));
    const alta = Number(conteudo(TAREFAS)[0]?.["prioridade"]);

    limparBanco();
    semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
    await garantirHandoff(pedido({ codigo: "promessa_sem_acao" }));
    const normal = Number(conteudo(TAREFAS)[0]?.["prioridade"]);

    expect(alta).toBeGreaterThan(normal);
  });
});
