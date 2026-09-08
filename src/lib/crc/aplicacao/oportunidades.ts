/**
 * OpportunityService — itens 22, 23, 121, 159, 185.
 *
 * A oportunidade é a unidade de trabalho do CRC. Um paciente não vira tarefa
 * direto: ele vira uma oportunidade, que tem tipo, motivo, valor, prioridade e
 * próxima ação. É isso que permite a Home responder "por que esta pessoa está
 * na minha lista?" com uma frase, e o gestor perguntar "quanto está parado no
 * funil?" com um número.
 *
 * DUAS INVARIANTES QUE ESTE ARQUIVO SUSTENTA:
 *
 *   Item 121 — um paciente que faltou não gera duas oportunidades de falta.
 *   A `chave_dedupe` com índice único parcial (só enquanto aberta) resolve isso
 *   no banco. Fechada e reaberta no mês seguinte é outro fato, e aí PODE haver
 *   uma nova — que é o comportamento certo.
 *
 *   Item 23 — mudança de etapa SEMPRE gera histórico. Nunca `update stage_id`
 *   sozinho. Sem o histórico não existe "onde os pacientes estão sendo
 *   perdidos" (item 277), porque a etapa anterior desapareceu.
 */
import { calcularPrioridade, type ContextoPrioridade } from "../dominio/prioridade";
import { diasEntre, temConsultaFutura } from "../dominio/regras";
import type { Oportunidade, TipoOportunidade } from "../dominio/tipos";
import {
  atualizar,
  contar,
  inserir,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
  type Filtro,
  type Linha,
} from "../servidor/banco";
import { auditar, registrar } from "../servidor/registro";

import { emitir } from "./eventos";
import { linhaParaOportunidade, listarEtapas } from "./repositorios";

export type CriarOportunidade = {
  organizationId: string;
  clinicId: string;
  patientId: string | null;
  leadId?: string | null;
  tipo: TipoOportunidade;
  motivo: string;
  /** Item 121. Ex.: `MISSED_APPOINTMENT:ag-2001`. */
  chaveDedupe: string;
  potentialValue?: string | null;
  origem?: string | null;
  assignedTo?: string | null;
  /** Quem está criando, para a auditoria. */
  ator: "humano" | "automacao" | "sync" | "ia";
  userId?: string | null;
  requestId?: string;
};

export type ResultadoCriacao =
  | { criada: true; oportunidade: Oportunidade }
  | { criada: false; motivo: "ja_existe"; oportunidade: Oportunidade | null };

/**
 * Cria a oportunidade, ou devolve a que já existe.
 *
 * "Já existe" NÃO é erro — é o caminho normal quando o sync roda de novo ou um
 * evento é reprocessado. Quem chama quase sempre deve seguir em frente.
 */
export async function criarOportunidade(dados: CriarOportunidade): Promise<ResultadoCriacao> {
  const etapas = await listarEtapas(dados.organizationId);
  const etapaInicial = etapas.find((e) => e.chave === "contato_pendente") ?? etapas[0];

  const prioridade = await calcularPrioridadeDe(dados.organizationId, {
    tipo: dados.tipo,
    patientId: dados.patientId,
    potentialValue: dados.potentialValue ?? null,
    criadoEm: new Date().toISOString(),
  });

  const linha = await inserirIgnorandoDuplicata("crc_opportunities", {
    organization_id: dados.organizationId,
    clinic_id: dados.clinicId,
    patient_id: dados.patientId,
    lead_id: dados.leadId ?? null,
    tipo: dados.tipo,
    stage_id: etapaInicial?.id ?? null,
    assigned_to: dados.assignedTo ?? null,
    priority_score: prioridade.score,
    priority_fatores: prioridade.fatores,
    potential_value: dados.potentialValue ?? null,
    origem: dados.origem ?? null,
    motivo: dados.motivo,
    chave_dedupe: dados.chaveDedupe,
  });

  if (linha === null) {
    const existente = await buscarPorChaveDedupe(dados.organizationId, dados.chaveDedupe);
    return { criada: false, motivo: "ja_existe", oportunidade: existente };
  }

  const oportunidade = linhaParaOportunidade(linha);

  await inserir("crc_opportunity_history", {
    opportunity_id: oportunidade.id,
    de_stage_id: null,
    para_stage_id: etapaInicial?.id ?? null,
    changed_by: dados.userId ?? null,
    origem: dados.ator === "humano" ? "humano" : "automacao",
    motivo: dados.motivo,
  });

  await emitir({
    organizationId: dados.organizationId,
    clinicId: dados.clinicId,
    tipo: "opportunity.created",
    entityType: "opportunity",
    entityId: oportunidade.id,
    payload: { tipo: dados.tipo, patientId: dados.patientId, motivo: dados.motivo },
    fingerprint: `opportunity.created:${oportunidade.id}`,
  });

  await registrarFunil(dados.organizationId, {
    clinicId: dados.clinicId,
    patientId: dados.patientId,
    opportunityId: oportunidade.id,
    etapa: "oportunidade_criada",
    origem: dados.origem ?? null,
    chaveDedupe: `oportunidade_criada:${oportunidade.id}`,
  });

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.userId ?? null,
    ator: dados.ator,
    acao: "oportunidade.criada",
    entityType: "opportunity",
    entityId: oportunidade.id,
    depois: { tipo: dados.tipo, motivo: dados.motivo, score: prioridade.score },
    ...(dados.requestId !== undefined ? { requestId: dados.requestId } : {}),
  });

  return { criada: true, oportunidade };
}

export async function buscarPorChaveDedupe(
  organizationId: string,
  chave: string,
): Promise<Oportunidade | null> {
  const linha = await selecionarUm("crc_opportunities", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "chave_dedupe", op: "eq", valor: chave },
      { coluna: "fechada_em", op: "is", valor: null },
    ],
  });
  return linha === null ? null : linhaParaOportunidade(linha);
}

/* -------------------------------------------------------------------------- */
/* Etapas e histórico                                                         */
/* -------------------------------------------------------------------------- */

export type MoverEtapa = {
  organizationId: string;
  opportunityId: string;
  paraEtapaChave: string;
  motivo?: string;
  lostReason?: string;
  reactivateAt?: string | null;
  ator: "humano" | "automacao" | "ia";
  userId?: string | null;
  requestId?: string;
};

export type ResultadoMovimento =
  | { ok: true; oportunidade: Oportunidade }
  | { ok: false; motivo: "nao_encontrada" | "etapa_invalida" | "motivo_obrigatorio" };

/**
 * Move a oportunidade de etapa, com histórico.
 *
 * O ITEM 159 É APLICADO AQUI COMO REGRA, NÃO COMO SUGESTÃO: fechar como
 * perdida sem informar o motivo é RECUSADO. A justificativa está no próprio
 * contrato — "dados servirão para estratégia comercial". Um funil cheio de
 * "perdido" sem motivo não responde a pergunta que o gestor faz, e a hora de
 * capturar o motivo é a única em que alguém sabe qual foi.
 */
export async function moverEtapa(dados: MoverEtapa): Promise<ResultadoMovimento> {
  const etapas = await listarEtapas(dados.organizationId);
  const destino = etapas.find((e) => e.chave === dados.paraEtapaChave);
  if (destino === undefined) return { ok: false, motivo: "etapa_invalida" };

  if (destino.categoria === "PERDIDA" && (dados.lostReason ?? "").trim().length === 0) {
    return { ok: false, motivo: "motivo_obrigatorio" };
  }

  const atual = await selecionarUm("crc_opportunities", {
    filtros: [
      { coluna: "id", op: "eq", valor: dados.opportunityId },
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
    ],
  });
  if (atual === null) return { ok: false, motivo: "nao_encontrada" };

  const antes = linhaParaOportunidade(atual);
  const agora = new Date().toISOString();

  const mudancas: Linha = {
    stage_id: destino.id,
    atualizado_em: agora,
  };

  if (destino.categoria !== "ABERTA") {
    mudancas["fechada_em"] = agora;
    // Fechada não compete mais por atenção na fila do dia.
    mudancas["next_action"] = null;
    mudancas["next_action_at"] = null;
  } else {
    // Reabrir limpa o fechamento: uma oportunidade que volta ao funil não pode
    // continuar contando como perdida nas métricas.
    mudancas["fechada_em"] = null;
  }

  if (dados.lostReason !== undefined) mudancas["lost_reason"] = dados.lostReason;
  if (dados.reactivateAt !== undefined) mudancas["reactivate_at"] = dados.reactivateAt;

  const atualizadas = await atualizar(
    "crc_opportunities",
    [
      { coluna: "id", op: "eq", valor: dados.opportunityId },
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
    ],
    mudancas,
  );

  const depois = atualizadas[0] === undefined ? antes : linhaParaOportunidade(atualizadas[0]);

  await inserir("crc_opportunity_history", {
    opportunity_id: dados.opportunityId,
    de_stage_id: antes.stageId,
    para_stage_id: destino.id,
    changed_by: dados.userId ?? null,
    origem: dados.ator === "humano" ? "humano" : "automacao",
    motivo: dados.motivo ?? dados.lostReason ?? null,
  });

  await emitir({
    organizationId: dados.organizationId,
    clinicId: depois.clinicId,
    tipo: "opportunity.stage_changed",
    entityType: "opportunity",
    entityId: dados.opportunityId,
    payload: { de: antes.stageId, para: destino.id, categoria: destino.categoria },
    // O instante entra no fingerprint porque mover de volta e de novo para a
    // mesma etapa são fatos diferentes, ambos dignos de evento.
    fingerprint: `opportunity.stage_changed:${dados.opportunityId}:${agora}`,
  });

  if (destino.categoria === "GANHA") {
    await registrarFunil(dados.organizationId, {
      clinicId: depois.clinicId,
      patientId: depois.patientId,
      opportunityId: depois.id,
      etapa: "oportunidade_ganha",
      origem: depois.origem,
      valor: depois.potentialValue,
      chaveDedupe: `oportunidade_ganha:${depois.id}`,
    });
  }

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.userId ?? null,
    ator: dados.ator,
    acao: "oportunidade.etapa_alterada",
    entityType: "opportunity",
    entityId: dados.opportunityId,
    antes: { stageId: antes.stageId },
    depois: { stageId: destino.id, lostReason: dados.lostReason ?? null },
    ...(dados.requestId !== undefined ? { requestId: dados.requestId } : {}),
  });

  return { ok: true, oportunidade: depois };
}

/** Item 185: toda oportunidade tenta ter próxima ação e quando ela vence. */
export async function definirProximaAcao(
  organizationId: string,
  opportunityId: string,
  acao: string,
  quando: Date,
): Promise<void> {
  await atualizar(
    "crc_opportunities",
    [
      { coluna: "id", op: "eq", valor: opportunityId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      next_action: acao,
      next_action_at: quando.toISOString(),
      atualizado_em: new Date().toISOString(),
    },
  );
}

/**
 * Fecha as oportunidades abertas de um paciente que já não fazem sentido.
 *
 * É a saída natural do fluxo: o paciente que faltou acabou de marcar uma nova
 * consulta, então a oportunidade "recuperar falta" está cumprida. Sem isso ela
 * ficaria aberta para sempre, competindo por atenção na fila e distorcendo o
 * funil.
 */
export async function encerrarPorConversao(
  organizationId: string,
  patientId: string,
  motivo: string,
  tipos: readonly TipoOportunidade[] = [
    "MISSED_APPOINTMENT",
    "CANCELLED_APPOINTMENT",
    "RECALL",
    "INACTIVE_PATIENT",
    "ABANDONED_TREATMENT",
  ],
): Promise<number> {
  const abertas = await selecionar("crc_opportunities", {
    colunas: "id,tipo,potential_value,origem,clinic_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
      { coluna: "fechada_em", op: "is", valor: null },
      { coluna: "tipo", op: "in", valor: [...tipos] },
    ],
  });

  let fechadas = 0;
  for (const linha of abertas) {
    const r = await moverEtapa({
      organizationId,
      opportunityId: String(linha["id"] ?? ""),
      paraEtapaChave: "fechado",
      motivo,
      ator: "automacao",
    });
    if (r.ok) fechadas += 1;
  }
  return fechadas;
}

/* -------------------------------------------------------------------------- */
/* Prioridade                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Monta o contexto de priorização a partir do banco e calcula o score.
 *
 * As consultas são deliberadamente enxutas: contagens, não listas. Recalcular
 * a prioridade da fila inteira é uma operação diária sobre centenas de
 * oportunidades, e trazer o histórico de conversas de cada uma para calcular
 * "horas desde a última resposta" transformaria isso em minutos de trabalho.
 */
export async function calcularPrioridadeDe(
  organizationId: string,
  oportunidade: {
    tipo: TipoOportunidade;
    patientId: string | null;
    potentialValue: string | null;
    criadoEm: string;
    id?: string;
  },
  agora = new Date(),
): Promise<{ score: number; fatores: ReturnType<typeof calcularPrioridade>["fatores"] }> {
  const ctx: ContextoPrioridade = {
    tipo: oportunidade.tipo,
    horasDesdeRespostaPaciente: null,
    horasDesdeUltimoContato: null,
    diasEsperando: diasEntre(oportunidade.criadoEm, agora) ?? 0,
    valorPotencial:
      oportunidade.potentialValue === null ? null : Number.parseFloat(oportunidade.potentialValue),
    temConsultaFutura: false,
    consultasConcluidas: 0,
    temperatura: null,
    intencaoAgendar: false,
  };

  if (oportunidade.patientId !== null) {
    const paciente = await selecionarUm("crc_patients", {
      colunas: "proxima_consulta_em",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "id", op: "eq", valor: oportunidade.patientId },
      ],
    });

    const proxima = paciente?.["proxima_consulta_em"];
    ctx.temConsultaFutura = temConsultaFutura(typeof proxima === "string" ? proxima : null, agora);

    ctx.consultasConcluidas = await contar("crc_appointments", [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: oportunidade.patientId },
      { coluna: "status", op: "eq", valor: "COMPLETED" },
    ]);

    const conversa = await selecionarUm("crc_conversations", {
      colunas: "temperatura,intencao,ultima_mensagem_em,assigned_to",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "patient_id", op: "eq", valor: oportunidade.patientId },
      ],
      ordenar: [{ coluna: "ultima_mensagem_em", ascendente: false }],
    });

    if (conversa !== null) {
      const temperatura = conversa["temperatura"];
      if (temperatura === "HOT" || temperatura === "WARM" || temperatura === "COLD") {
        ctx.temperatura = temperatura;
      }
      ctx.intencaoAgendar =
        conversa["intencao"] === "AGENDAR" || conversa["intencao"] === "REMARCAR";

      // A última mensagem DO PACIENTE, e não a última da conversa: uma
      // mensagem nossa de dez minutos atrás não é sinal de interesse dele.
      const ultimaDoPaciente = await selecionarUm("crc_messages", {
        colunas: "criado_em",
        filtros: [
          { coluna: "organization_id", op: "eq", valor: organizationId },
          { coluna: "patient_id", op: "eq", valor: oportunidade.patientId },
          { coluna: "direcao", op: "eq", valor: "ENTRADA" },
        ],
        ordenar: [{ coluna: "criado_em", ascendente: false }],
      });
      const quando = ultimaDoPaciente?.["criado_em"];
      if (typeof quando === "string") {
        const t = Date.parse(quando);
        if (Number.isFinite(t)) {
          ctx.horasDesdeRespostaPaciente = (agora.getTime() - t) / 3_600_000;
        }
      }

      const ultimaNossa = await selecionarUm("crc_messages", {
        colunas: "criado_em",
        filtros: [
          { coluna: "organization_id", op: "eq", valor: organizationId },
          { coluna: "patient_id", op: "eq", valor: oportunidade.patientId },
          { coluna: "direcao", op: "eq", valor: "SAIDA" },
        ],
        ordenar: [{ coluna: "criado_em", ascendente: false }],
      });
      const quandoNossa = ultimaNossa?.["criado_em"];
      if (typeof quandoNossa === "string") {
        const t = Date.parse(quandoNossa);
        if (Number.isFinite(t)) {
          ctx.horasDesdeUltimoContato = (agora.getTime() - t) / 3_600_000;
        }
      }
    }
  }

  return calcularPrioridade(ctx);
}

/**
 * Recalcula a prioridade das oportunidades abertas.
 *
 * Roda no varredor diário. O teto existe porque isto faz várias consultas por
 * oportunidade: sem limite, uma base grande transformaria o cron numa função
 * que estoura o tempo da Vercel no meio e deixa metade da fila com score de
 * ontem — pior do que não rodar, porque fica inconsistente.
 */
export async function recalcularPrioridades(organizationId: string, limite = 300): Promise<number> {
  const abertas = await selecionar("crc_opportunities", {
    colunas: "id,tipo,patient_id,potential_value,criado_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "fechada_em", op: "is", valor: null },
    ],
    ordenar: [{ coluna: "atualizado_em", ascendente: true }],
    limite,
  });

  let atualizadas = 0;
  for (const linha of abertas) {
    const id = String(linha["id"] ?? "");
    try {
      const prioridade = await calcularPrioridadeDe(organizationId, {
        tipo: String(linha["tipo"] ?? "MANUAL") as TipoOportunidade,
        patientId: typeof linha["patient_id"] === "string" ? linha["patient_id"] : null,
        potentialValue:
          typeof linha["potential_value"] === "string" ? linha["potential_value"] : null,
        criadoEm: String(linha["criado_em"] ?? new Date().toISOString()),
      });

      await atualizar("crc_opportunities", [{ coluna: "id", op: "eq", valor: id }], {
        priority_score: prioridade.score,
        priority_fatores: prioridade.fatores,
        atualizado_em: new Date().toISOString(),
      });
      atualizadas += 1;
    } catch (erro) {
      // Uma oportunidade que falha não pode parar o recálculo das outras.
      registrar("aviso", "Falha ao recalcular prioridade.", {
        organizationId,
        opportunityId: id,
        detalhe: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }
  return atualizadas;
}

/* -------------------------------------------------------------------------- */
/* Funil analítico (item 59)                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Registra um passo do funil, no servidor.
 *
 * O item 59 é explícito sobre não depender de tracking do frontend: o navegador
 * pode ter bloqueador, a aba pode fechar antes do envio, e o evento que
 * interessa (o paciente agendou) acontece num worker sem navegador nenhum.
 */
export async function registrarFunil(
  organizationId: string,
  dados: {
    clinicId: string | null;
    patientId: string | null;
    opportunityId: string | null;
    etapa: string;
    origem?: string | null;
    valor?: string | null;
    chaveDedupe: string;
  },
): Promise<void> {
  await inserirIgnorandoDuplicata("crc_funnel_events", {
    organization_id: organizationId,
    clinic_id: dados.clinicId,
    patient_id: dados.patientId,
    opportunity_id: dados.opportunityId,
    etapa: dados.etapa,
    origem: dados.origem ?? null,
    valor: dados.valor ?? null,
    chave_dedupe: dados.chaveDedupe,
  });
}

/* -------------------------------------------------------------------------- */
/* Leitura para as telas                                                      */
/* -------------------------------------------------------------------------- */

export type FiltroOportunidades = {
  organizationId: string;
  clinicIds?: readonly string[];
  tipos?: readonly TipoOportunidade[];
  etapaId?: string;
  assignedTo?: string;
  apenasAbertas?: boolean;
  limite?: number;
  deslocamento?: number;
};

export async function listarOportunidades(f: FiltroOportunidades): Promise<Oportunidade[]> {
  const filtros: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: f.organizationId }];

  // Item 71: o escopo de clínica entra como filtro de verdade, e não como
  // conferência depois de ler. Ler tudo e filtrar em memória vazaria contagem
  // e paginação de outra unidade.
  if (f.clinicIds !== undefined)
    filtros.push({ coluna: "clinic_id", op: "in", valor: [...f.clinicIds] });
  if (f.tipos !== undefined && f.tipos.length > 0) {
    filtros.push({ coluna: "tipo", op: "in", valor: [...f.tipos] });
  }
  if (f.etapaId !== undefined) filtros.push({ coluna: "stage_id", op: "eq", valor: f.etapaId });
  if (f.assignedTo !== undefined)
    filtros.push({ coluna: "assigned_to", op: "eq", valor: f.assignedTo });
  if (f.apenasAbertas !== false) filtros.push({ coluna: "fechada_em", op: "is", valor: null });

  const linhas = await selecionar("crc_opportunities", {
    filtros,
    ordenar: [
      { coluna: "priority_score", ascendente: false },
      { coluna: "criado_em", ascendente: true },
    ],
    limite: f.limite ?? 50,
    ...(f.deslocamento !== undefined ? { deslocamento: f.deslocamento } : {}),
  });

  return linhas.map(linhaParaOportunidade);
}

export async function historicoDaOportunidade(opportunityId: string): Promise<Linha[]> {
  return selecionar("crc_opportunity_history", {
    filtros: [{ coluna: "opportunity_id", op: "eq", valor: opportunityId }],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: 100,
  });
}
