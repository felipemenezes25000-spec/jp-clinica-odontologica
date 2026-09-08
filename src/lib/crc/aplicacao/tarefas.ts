/**
 * TaskService — itens 25, 30 do Mega Prompt, 183 do contrato.
 *
 * A tarefa é o que sobra para o humano quando a automação não resolve. Ela
 * existe para que "o sistema desistiu" nunca signifique "o paciente foi
 * esquecido" — que é o critério de sucesso número três do item 53 do Mega
 * Prompt ("não perde follow-up").
 *
 * A `chave_dedupe` com índice único parcial (só enquanto OPEN ou IN_PROGRESS) é
 * o que impede a automação criar a mesma tarefa a cada execução. Depois de
 * concluída, a mesma chave pode gerar uma tarefa nova — e deve: o paciente
 * faltou de novo no mês seguinte.
 */
import type { StatusTarefa, Tarefa, TipoTarefa } from "../dominio/tipos";
import {
  atualizar,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
  type Filtro,
} from "../servidor/banco";
import { auditar } from "../servidor/registro";

import { emitir } from "./eventos";
import { linhaParaTarefa } from "./repositorios";

export type CriarTarefa = {
  organizationId: string;
  clinicId: string;
  patientId?: string | null;
  opportunityId?: string | null;
  titulo: string;
  tipo: TipoTarefa;
  prazoHoras?: number;
  prioridade?: number;
  assignedTo?: string | null;
  notas?: string | null;
  motivo?: string | null;
  chaveDedupe: string;
  ator: "humano" | "automacao" | "ia" | "sistema";
  userId?: string | null;
  requestId?: string;
};

export async function criarTarefa(dados: CriarTarefa): Promise<Tarefa | null> {
  const dueAt =
    dados.prazoHoras === undefined
      ? null
      : new Date(Date.now() + dados.prazoHoras * 3_600_000).toISOString();

  const linha = await inserirIgnorandoDuplicata("crc_tasks", {
    organization_id: dados.organizationId,
    clinic_id: dados.clinicId,
    patient_id: dados.patientId ?? null,
    opportunity_id: dados.opportunityId ?? null,
    titulo: dados.titulo,
    tipo: dados.tipo,
    status: "OPEN",
    prioridade: dados.prioridade ?? 0,
    assigned_to: dados.assignedTo ?? null,
    due_at: dueAt,
    notas: dados.notas ?? null,
    motivo: dados.motivo ?? null,
    chave_dedupe: dados.chaveDedupe,
  });

  // `null` significa "já existe uma aberta igual". É o caminho normal quando a
  // jornada é reprocessada, e não merece log de erro.
  if (linha === null) return null;

  const tarefa = linhaParaTarefa(linha);

  await emitir({
    organizationId: dados.organizationId,
    clinicId: dados.clinicId,
    tipo: "task.created",
    entityType: "task",
    entityId: tarefa.id,
    payload: { tipo: dados.tipo, titulo: dados.titulo, patientId: dados.patientId ?? null },
    fingerprint: `task.created:${tarefa.id}`,
  });

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.userId ?? null,
    ator: dados.ator === "sistema" ? "automacao" : dados.ator,
    acao: "tarefa.criada",
    entityType: "task",
    entityId: tarefa.id,
    depois: { titulo: dados.titulo, tipo: dados.tipo, dueAt },
    ...(dados.requestId !== undefined ? { requestId: dados.requestId } : {}),
  });

  return tarefa;
}

export type MudarStatusTarefa = {
  organizationId: string;
  taskId: string;
  status: StatusTarefa;
  notas?: string | null;
  userId: string | null;
  ator: "humano" | "automacao";
  requestId?: string;
};

export async function mudarStatusTarefa(dados: MudarStatusTarefa): Promise<Tarefa | null> {
  const atual = await selecionarUm("crc_tasks", {
    filtros: [
      { coluna: "id", op: "eq", valor: dados.taskId },
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
    ],
  });
  if (atual === null) return null;

  const antes = linhaParaTarefa(atual);
  const agora = new Date().toISOString();

  const linhas = await atualizar(
    "crc_tasks",
    [
      { coluna: "id", op: "eq", valor: dados.taskId },
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
    ],
    {
      status: dados.status,
      notas: dados.notas ?? antes.notas,
      concluida_em: dados.status === "COMPLETED" ? agora : null,
      atualizado_em: agora,
    },
  );

  const depois = linhas[0] === undefined ? antes : linhaParaTarefa(linhas[0]);

  if (dados.status === "COMPLETED") {
    await emitir({
      organizationId: dados.organizationId,
      clinicId: depois.clinicId,
      tipo: "task.completed",
      entityType: "task",
      entityId: depois.id,
      payload: { tipo: depois.tipo, patientId: depois.patientId },
      fingerprint: `task.completed:${depois.id}`,
    });
  }

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.userId,
    ator: dados.ator,
    acao: "tarefa.status_alterado",
    entityType: "task",
    entityId: dados.taskId,
    antes: { status: antes.status },
    depois: { status: dados.status },
    ...(dados.requestId !== undefined ? { requestId: dados.requestId } : {}),
  });

  return depois;
}

export async function atribuirTarefa(
  organizationId: string,
  taskId: string,
  paraUsuarioId: string | null,
  porUsuarioId: string | null,
): Promise<void> {
  await atualizar(
    "crc_tasks",
    [
      { coluna: "id", op: "eq", valor: taskId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { assigned_to: paraUsuarioId, atualizado_em: new Date().toISOString() },
  );

  await auditar({
    organizationId,
    userId: porUsuarioId,
    ator: "humano",
    acao: "tarefa.atribuida",
    entityType: "task",
    entityId: taskId,
    depois: { assignedTo: paraUsuarioId },
  });
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

export type FiltroTarefas = {
  organizationId: string;
  clinicIds?: readonly string[];
  assignedTo?: string | null;
  status?: readonly StatusTarefa[];
  patientId?: string;
  /** Só as vencidas ou que vencem hoje — a fila de "Meu trabalho" (item 183). */
  ateAmanha?: boolean;
  limite?: number;
};

export async function listarTarefas(f: FiltroTarefas): Promise<Tarefa[]> {
  const filtros: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: f.organizationId }];

  if (f.clinicIds !== undefined)
    filtros.push({ coluna: "clinic_id", op: "in", valor: [...f.clinicIds] });
  if (f.patientId !== undefined)
    filtros.push({ coluna: "patient_id", op: "eq", valor: f.patientId });

  // `null` explícito significa "sem responsável", que é diferente de "qualquer
  // responsável" (campo ausente). A distinção importa: a fila de tarefas órfãs
  // do item 187 depende dela.
  if (f.assignedTo === null) filtros.push({ coluna: "assigned_to", op: "is", valor: null });
  else if (f.assignedTo !== undefined) {
    filtros.push({ coluna: "assigned_to", op: "eq", valor: f.assignedTo });
  }

  filtros.push({
    coluna: "status",
    op: "in",
    valor: [...(f.status ?? (["OPEN", "IN_PROGRESS"] as const))],
  });

  if (f.ateAmanha === true) {
    filtros.push({
      coluna: "due_at",
      op: "lte",
      valor: new Date(Date.now() + 24 * 3_600_000).toISOString(),
    });
  }

  const linhas = await selecionar("crc_tasks", {
    filtros,
    // `nullsPrimeiro: false` é deliberado: tarefa sem prazo não pode encabeçar
    // a fila do dia à frente da que vence em uma hora.
    ordenar: [
      { coluna: "due_at", ascendente: true, nullsPrimeiro: false },
      { coluna: "prioridade", ascendente: false },
    ],
    limite: f.limite ?? 50,
  });

  return linhas.map(linhaParaTarefa);
}

/**
 * Item 186: oportunidade aberta sem próxima ação vira tarefa de revisão.
 *
 * É o detector de "coisa parada". Sem ele, uma oportunidade cuja jornada
 * terminou sem sucesso fica no funil para sempre, contando como aberta e não
 * aparecendo na fila de ninguém — o pior dos dois mundos.
 */
export async function detectarOportunidadesParadas(
  organizationId: string,
  diasParado = 5,
  limite = 50,
): Promise<number> {
  const limiteData = new Date(Date.now() - diasParado * 86400_000).toISOString();

  const paradas = await selecionar("crc_opportunities", {
    colunas: "id,clinic_id,patient_id,tipo,motivo",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "fechada_em", op: "is", valor: null },
      { coluna: "next_action_at", op: "is", valor: null },
      { coluna: "atualizado_em", op: "lt", valor: limiteData },
    ],
    limite,
  });

  let criadas = 0;
  for (const linha of paradas) {
    const id = String(linha["id"] ?? "");
    const tarefa = await criarTarefa({
      organizationId,
      clinicId: String(linha["clinic_id"] ?? ""),
      patientId: typeof linha["patient_id"] === "string" ? linha["patient_id"] : null,
      opportunityId: id,
      titulo: "Definir o próximo passo desta oportunidade",
      tipo: "REVISAR",
      prazoHoras: 24,
      motivo: `Sem próxima ação há mais de ${String(diasParado)} dias.`,
      chaveDedupe: `parada:${id}`,
      ator: "automacao",
    });
    if (tarefa !== null) criadas += 1;
  }
  return criadas;
}
