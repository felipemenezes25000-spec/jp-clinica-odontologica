/**
 * Casos humanos e dono da conversa — Fatia 5.
 *
 * UM CASO NÃO É UMA TAREFA. `crc_tasks` é trabalho a fazer: ligar, conferir,
 * cobrar. Um caso é uma CONVERSA PARADA esperando gente, com o contexto do que
 * já aconteteceu nela — inclusive o que o agente teria respondido e por que foi
 * barrado.
 *
 * A diferença importa na tela: tarefa some quando alguém a conclui; caso só
 * fecha quando a conversa anda.
 */
import {
  agoraIso,
  atualizar,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
} from "../servidor/banco";

/* -------------------------------------------------------------------------- */
/* Dono da conversa                                                           */
/* -------------------------------------------------------------------------- */

export type DonoDaConversa = "ia" | "humano" | "ninguem";

/**
 * Quem manda nesta conversa agora.
 *
 * O padrão é `ia` — e não `ninguem` — porque uma conversa sem dono declarado é
 * uma conversa em que a automação já vinha respondendo antes desta fatia
 * existir. Migrar para `ninguem` calaria o sistema inteiro no dia do deploy.
 */
export async function donoDaConversa(
  organizationId: string,
  conversationId: string,
): Promise<{ dono: DonoDaConversa; userId: string | null }> {
  const l = await selecionarUm("crc_conversations", {
    colunas: "dono,dono_user_id",
    filtros: [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });

  const cru = typeof l?.["dono"] === "string" ? l["dono"] : "ia";
  const dono: DonoDaConversa = cru === "humano" || cru === "ninguem" ? cru : "ia";
  return { dono, userId: typeof l?.["dono_user_id"] === "string" ? l["dono_user_id"] : null };
}

/**
 * Um atendente assume a conversa. A IA cala.
 *
 * NÃO É "pausar a IA": é dizer QUEM está falando. A diferença aparece quando a
 * pessoa sai de férias — a conversa continua com dono, e o próximo turno do
 * agente continua barrado, o que é o correto.
 */
export async function assumirConversa(
  organizationId: string,
  conversationId: string,
  userId: string,
): Promise<void> {
  await atualizar(
    "crc_conversations",
    [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { dono: "humano", dono_user_id: userId, dono_desde: agoraIso() },
  );
}

/** Devolve a conversa para a IA. Ato explícito, nunca automático. */
export async function devolverParaIa(
  organizationId: string,
  conversationId: string,
): Promise<void> {
  await atualizar(
    "crc_conversations",
    [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { dono: "ia", dono_user_id: null, dono_desde: agoraIso() },
  );
}

/**
 * Cala a IA sem passar a conversa para ninguém.
 *
 * É o caso do "deixa essa quieta": o paciente não precisa de resposta agora, e
 * também não há quem assuma. `ninguem` existe justamente para isso não virar
 * um humano fictício.
 */
export async function pausarIaNaConversa(
  organizationId: string,
  conversationId: string,
): Promise<void> {
  await atualizar(
    "crc_conversations",
    [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { dono: "ninguem", dono_user_id: null, dono_desde: agoraIso() },
  );
}

/* -------------------------------------------------------------------------- */
/* Casos                                                                      */
/* -------------------------------------------------------------------------- */

export type PedidoCaso = {
  organizationId: string;
  clinicId: string | null;
  conversationId: string;
  patientId: string | null;
  runId?: string | null;
  motivoCodigo: string;
  motivo: string;
  resumo: string | null;
  /** O que o agente teria dito. Rascunho para a pessoa, e evidência do bloqueio. */
  respostaBarrada: string | null;
  proximaAcao: string | null;
  chaveDedupe: string;
  prioridade?: "ALTA" | "NORMAL";
};

/**
 * Abre um caso — ou não, se já existe um aberto para esta conversa.
 *
 * O ÍNDICE PARCIAL DO BANCO É QUEM GARANTE, e não este código: `unique (org,
 * conversa) where status in ('ABERTO','ASSUMIDO')`. Sem ele, duas mensagens do
 * paciente em sequência abririam dois casos, e a recepção veria a mesma pessoa
 * duas vezes na fila.
 *
 * Quando já existe, o motivo novo é ANEXADO ao caso existente: a segunda razão
 * costuma ser a que explica a primeira.
 */
export async function abrirCaso(
  pedido: PedidoCaso,
): Promise<{ criado: boolean; id: string | null }> {
  const existente = await selecionarUm("crc_human_cases", {
    colunas: "id,motivo",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
      { coluna: "conversation_id", op: "eq", valor: pedido.conversationId },
      { coluna: "status", op: "in", valor: ["ABERTO", "ASSUMIDO"] },
    ],
  });

  if (existente !== null) {
    const id = typeof existente["id"] === "string" ? existente["id"] : null;
    const antes = typeof existente["motivo"] === "string" ? existente["motivo"] : "";
    if (id !== null && !antes.includes(pedido.motivo)) {
      await atualizar("crc_human_cases", [{ coluna: "id", op: "eq", valor: id }], {
        motivo: `${antes}\n${pedido.motivo}`.slice(0, 800),
      });
    }
    return { criado: false, id };
  }

  const linha = await inserirIgnorandoDuplicata("crc_human_cases", {
    organization_id: pedido.organizationId,
    clinic_id: pedido.clinicId,
    conversation_id: pedido.conversationId,
    patient_id: pedido.patientId,
    run_id: pedido.runId ?? null,
    status: "ABERTO",
    motivo_codigo: pedido.motivoCodigo,
    motivo: pedido.motivo,
    prioridade: pedido.prioridade ?? "NORMAL",
    resumo: pedido.resumo,
    resposta_barrada: pedido.respostaBarrada,
    proxima_acao: pedido.proximaAcao,
    chave_dedupe: pedido.chaveDedupe,
  });

  // ABRIR CASO CALA A IA. É o ponto: o agente disse que não é ele quem resolve,
  // e continuar respondendo depois disso seria ignorar a própria decisão.
  await pausarIaNaConversa(pedido.organizationId, pedido.conversationId);

  return { criado: linha !== null, id: linha === null ? null : String(linha["id"] ?? "") };
}

export async function assumirCaso(
  organizationId: string,
  casoId: string,
  userId: string,
): Promise<void> {
  const caso = await selecionarUm("crc_human_cases", {
    colunas: "conversation_id",
    filtros: [
      { coluna: "id", op: "eq", valor: casoId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });

  await atualizar(
    "crc_human_cases",
    [
      { coluna: "id", op: "eq", valor: casoId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "ASSUMIDO", assumido_por: userId, assumido_em: agoraIso() },
  );

  // Assumir o caso e assumir a conversa é o mesmo gesto. Separá-los produziria
  // o estado em que alguém é dono do caso e a IA continua respondendo.
  const conversationId =
    typeof caso?.["conversation_id"] === "string" ? caso["conversation_id"] : null;
  if (conversationId !== null) {
    await assumirConversa(organizationId, conversationId, userId);
  }
}

/**
 * Fecha o caso. NÃO devolve a conversa para a IA automaticamente.
 *
 * Devolver junto seria conveniente e errado: quem resolveu um caso clínico não
 * quer que a máquina volte a responder na mesma conversa sem alguém decidir
 * isso. Devolver é um segundo botão, de propósito.
 */
export async function resolverCaso(
  organizationId: string,
  casoId: string,
  resolucao: string,
): Promise<void> {
  await atualizar(
    "crc_human_cases",
    [
      { coluna: "id", op: "eq", valor: casoId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "RESOLVIDO", resolvido_em: agoraIso(), resolucao: resolucao.slice(0, 500) },
  );
}

export type CasoNaFila = {
  id: string;
  conversationId: string;
  patientId: string | null;
  status: string;
  motivo: string;
  motivoCodigo: string;
  prioridade: string;
  resumo: string | null;
  respostaBarrada: string | null;
  proximaAcao: string | null;
  criadoEm: string;
  assumidoPor: string | null;
};

export async function listarCasosAbertos(
  organizationId: string,
  limite = 50,
): Promise<CasoNaFila[]> {
  const linhas = await selecionar("crc_human_cases", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "in", valor: ["ABERTO", "ASSUMIDO"] },
    ],
    // Mais antigo no topo: numa fila de atendimento, quem espera há mais tempo
    // vem primeiro. Ordenar por prioridade deixaria um caso normal esperando
    // para sempre atrás de um fluxo de casos altos.
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite,
  });

  const t = (l: Record<string, unknown>, c: string): string | null =>
    typeof l[c] === "string" && l[c].trim().length > 0 ? (l[c] as string) : null;

  return linhas.map((l) => ({
    id: String(l["id"] ?? ""),
    conversationId: String(l["conversation_id"] ?? ""),
    patientId: t(l, "patient_id"),
    status: String(l["status"] ?? "ABERTO"),
    motivo: String(l["motivo"] ?? ""),
    motivoCodigo: String(l["motivo_codigo"] ?? ""),
    prioridade: String(l["prioridade"] ?? "NORMAL"),
    resumo: t(l, "resumo"),
    respostaBarrada: t(l, "resposta_barrada"),
    proximaAcao: t(l, "proxima_acao"),
    criadoEm: String(l["criado_em"] ?? ""),
    assumidoPor: t(l, "assumido_por"),
  }));
}
