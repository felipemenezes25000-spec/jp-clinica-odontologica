/**
 * Financeiro e pré-consulta — o serviço.
 *
 * ============================================================================
 *  O QUE FUNCIONA HOJE, e o que fica `BLOCKED_EXTERNAL`.
 *
 *  FUNCIONA: a política de pagamento (o que a clínica já decidiu sobre desconto
 *  e parcela) e a checagem de pré-consulta (o que falta para amanhã acontecer).
 *  As duas mudam o dia de quem atende, e nenhuma depende de integração.
 *
 *  BLOCKED_EXTERNAL: gerar cobrança e link de pagamento. Não há provedor. A
 *  tabela `crc_payment_intents` existe com máquina de estados e idempotência —
 *  que é a parte que não se improvisa com dinheiro real passando — e nasce
 *  vazia.
 * ============================================================================
 */
import {
  avaliarDesconto,
  bloqueiaAtendimento,
  opcoesDeParcelamento,
  pendenciasDaPreConsulta,
  POLITICA_PADRAO,
  type ContextoDaPreConsulta,
  type ItemDePreConsulta,
  type OpcaoDeParcela,
  type Politica,
  type VereditoDeDesconto,
} from "../dominio/pagamento";
import {
  agoraIso,
  atualizar,
  gravar,
  inserirIgnorandoDuplicata,
  selecionar,
  type Filtro,
} from "../servidor/banco";
import { auditar, registrar } from "../servidor/registro";

/* -------------------------------------------------------------------------- */
/* A política                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A política em vigor para esta clínica.
 *
 * CLÍNICA → ORGANIZAÇÃO → PADRÃO, a mesma escada das credenciais e da
 * autonomia. E o padrão é TODO FECHADO: sem política cadastrada, a automação
 * não fala de pagamento.
 */
export async function politicaEmVigor(
  organizationId: string,
  clinicId: string | null,
): Promise<Politica> {
  const linhas = await selecionar("crc_payment_policies", {
    colunas:
      "clinic_id,nome,desconto_max_pct,aprovador_papel,parcelas_max,parcelas_sem_juros,parcela_minima,texto_para_paciente",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "ativa", op: "eq", valor: true },
    ],
    limite: 50,
  });

  const daClinica = clinicId === null ? undefined : linhas.find((l) => l["clinic_id"] === clinicId);
  const daOrg = linhas.find((l) => l["clinic_id"] === null || l["clinic_id"] === undefined);

  const escolhida = daClinica ?? daOrg;
  if (escolhida === undefined) return POLITICA_PADRAO;

  return {
    nome: String(escolhida["nome"] ?? "Padrão"),
    descontoMaxPct: Number(escolhida["desconto_max_pct"] ?? 0) || 0,
    aprovadorPapel:
      typeof escolhida["aprovador_papel"] === "string" ? escolhida["aprovador_papel"] : null,
    parcelasMax: Number(escolhida["parcelas_max"] ?? 1) || 1,
    parcelasSemJuros: Number(escolhida["parcelas_sem_juros"] ?? 1) || 1,
    parcelaMinima: Number(escolhida["parcela_minima"] ?? 0) || 0,
    textoParaPaciente:
      typeof escolhida["texto_para_paciente"] === "string"
        ? escolhida["texto_para_paciente"]
        : null,
  };
}

export async function salvarPolitica(
  organizationId: string,
  clinicId: string | null,
  p: Politica,
  userId: string | null,
): Promise<void> {
  /*
   * TODAS AS COLUNAS, SEMPRE — a armadilha do upsert de linha inteira, de novo.
   * Omitir `desconto_max_pct` ao editar só o texto o devolveria ao DEFAULT
   * (zero), o que aqui é conservador; mas omitir `parcelas_max` faria o
   * contrário do esperado em qualquer edição parcial.
   */
  await gravar(
    "crc_payment_policies",
    {
      organization_id: organizationId,
      clinic_id: clinicId,
      nome: p.nome,
      desconto_max_pct: p.descontoMaxPct,
      aprovador_papel: p.aprovadorPapel,
      parcelas_max: p.parcelasMax,
      parcelas_sem_juros: p.parcelasSemJuros,
      parcela_minima: p.parcelaMinima,
      texto_para_paciente: p.textoParaPaciente,
      ativa: true,
      atualizado_em: agoraIso(),
    },
    clinicId === null ? "organization_id,nome" : "organization_id,clinic_id,nome",
  );

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "politica_pagamento.alterada",
    entityType: "payment_policy",
    entityId: null,
    depois: { clinicId, ...p },
  });

  // Aviso, e não info: mexer em alçada de desconto é decisão notável, e precisa
  // aparecer no mesmo filtro dos kill switches.
  registrar("aviso", "Política de pagamento alterada.", { organizationId, clinicId, nome: p.nome });
}

/**
 * Este desconto pode?
 *
 * O VEREDITO É AUDITADO QUANDO PASSA DO TETO, e não quando cabe nele. Registrar
 * toda consulta encheria a auditoria de ruído; registrar as exceções é o que
 * permite responder depois "quem aprovou aquele desconto de 30%".
 */
export async function conferirDesconto(
  organizationId: string,
  clinicId: string | null,
  valorOriginal: number,
  valorProposto: number,
  papel: string,
  userId: string | null,
): Promise<VereditoDeDesconto> {
  const politica = await politicaEmVigor(organizationId, clinicId);
  const v = avaliarDesconto({ valorOriginal, valorProposto, politica, papel });

  if (v.pct > politica.descontoMaxPct) {
    await auditar({
      organizationId,
      userId,
      ator: "humano",
      acao: v.permitido ? "desconto.aprovado_por_alcada" : "desconto.recusado",
      entityType: "desconto",
      entityId: null,
      depois: { valorOriginal, valorProposto, pct: v.pct, teto: politica.descontoMaxPct, papel },
    });
  }

  return v;
}

export async function parcelamentoDisponivel(
  organizationId: string,
  clinicId: string | null,
  valor: number,
): Promise<OpcaoDeParcela[]> {
  const politica = await politicaEmVigor(organizationId, clinicId);
  return opcoesDeParcelamento(valor, politica);
}

/* -------------------------------------------------------------------------- */
/* A pré-consulta                                                             */
/* -------------------------------------------------------------------------- */

export type ResultadoDaPreConsulta = {
  consultas: number;
  pendenciasCriadas: number;
  bloqueadas: number;
};

/**
 * Varre as consultas dos próximos dias e registra o que falta.
 *
 * ============================================================================
 *  IDEMPOTENTE POR `(appointment_id, item)`.
 *
 *  A varredura roda todo dia. Sem a chave, a consulta de quinta acumularia uma
 *  pendência de confirmação por dia até chegar — e a tela mostraria três
 *  "sem confirmação" para o mesmo paciente.
 * ============================================================================
 */
export async function varrerPreConsulta(
  organizationId: string,
  agora: Date = new Date(),
): Promise<ResultadoDaPreConsulta> {
  const ate = new Date(agora.getTime() + 72 * 3_600_000);

  const consultas = await selecionar<{
    id: string;
    clinic_id: string;
    patient_id: string | null;
    inicio_em: string;
    status: string;
    risco_falta: string | null;
  }>("crc_appointments", {
    colunas: "id,clinic_id,patient_id,inicio_em,status,risco_falta",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "inicio_em", op: "gt", valor: agora.toISOString() },
      { coluna: "inicio_em", op: "lte", valor: ate.toISOString() },
      { coluna: "status", op: "in", valor: ["TO_CONFIRM", "CONFIRMED"] },
    ],
    limite: 500,
  });

  if (consultas.length === 0) return { consultas: 0, pendenciasCriadas: 0, bloqueadas: 0 };

  const pacientes = [
    ...new Set(consultas.map((c) => c.patient_id).filter((p): p is string => p !== null)),
  ];

  const [primeiraVez, comDebito, convenios] = await Promise.all([
    quemNuncaVeio(organizationId, pacientes),
    quemTemDebito(organizationId, pacientes),
    quemUsaConvenio(organizationId, pacientes),
  ]);

  let criadas = 0;
  let bloqueadas = 0;

  for (const c of consultas) {
    const pid = c.patient_id;

    const ctx: ContextoDaPreConsulta = {
      horasAteAConsulta: (Date.parse(c.inicio_em) - agora.getTime()) / 3_600_000,
      confirmada: c.status === "CONFIRMED",
      primeiraVez: pid !== null && primeiraVez.has(pid),
      usaConvenio: pid !== null && convenios.has(pid),
      /*
       * `convenioAutorizado` É SEMPRE FALSO HOJE, e isso não é um bug: não há
       * integração com plano nenhum. A pendência nasce e fica para uma pessoa
       * resolver — que é exatamente o que o §31 manda quando não há API.
       */
      convenioAutorizado: false,
      riscoDeFalta:
        c.risco_falta === "ALTO" || c.risco_falta === "MEDIO" || c.risco_falta === "BAIXO"
          ? c.risco_falta
          : null,
      temDebito: pid !== null && comDebito.has(pid),
    };

    const pendencias = pendenciasDaPreConsulta(ctx);
    if (bloqueiaAtendimento(pendencias)) bloqueadas += 1;

    for (const p of pendencias) {
      const linha = await inserirIgnorandoDuplicata("crc_previsit_checks", {
        organization_id: organizationId,
        clinic_id: c.clinic_id,
        appointment_id: c.id,
        patient_id: pid,
        item: p.item,
        status: "PENDENTE",
        resolve_quem: p.resolveQuem,
        detalhe: p.detalhe,
      });
      if (linha !== null) criadas += 1;
    }
  }

  return { consultas: consultas.length, pendenciasCriadas: criadas, bloqueadas };
}

async function quemNuncaVeio(organizationId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const linhas = await selecionar<{ patient_id: string }>("crc_appointments", {
    colunas: "patient_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "in", valor: [...ids] },
      { coluna: "status", op: "eq", valor: "COMPLETED" },
    ],
    limite: ids.length * 10,
  });

  const jaVieram = new Set(linhas.map((l) => l.patient_id));
  return new Set(ids.filter((i) => !jaVieram.has(i)));
}

async function quemTemDebito(organizationId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const linhas = await selecionar<{ patient_id: string }>("crc_charges", {
    colunas: "patient_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "in", valor: [...ids] },
      { coluna: "status", op: "in", valor: ["ABERTA", "PARCIAL"] },
      { coluna: "vencimento_em", op: "lt", valor: new Date().toISOString().slice(0, 10) },
    ],
    limite: ids.length * 10,
  });

  return new Set(linhas.map((l) => l.patient_id));
}

async function quemUsaConvenio(
  organizationId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();

  const linhas = await selecionar<{ id: string; convenio: string | null }>("crc_patients", {
    colunas: "id,convenio",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "in", valor: [...ids] },
      { coluna: "convenio", op: "not.is", valor: null },
    ],
    limite: ids.length,
  });

  return new Set(
    linhas
      .filter((l) => typeof l.convenio === "string" && l.convenio.trim().length > 0)
      .map((l) => l.id),
  );
}

/* -------------------------------------------------------------------------- */
/* A tela                                                                     */
/* -------------------------------------------------------------------------- */

export type PendenciaNaTela = {
  id: string;
  appointmentId: string;
  patientId: string | null;
  item: ItemDePreConsulta;
  detalhe: string | null;
  resolveQuem: string;
  inicioEm: string | null;
};

export async function listarPendencias(
  organizationId: string,
  clinicIds: readonly string[] | null,
  limite = 60,
): Promise<PendenciaNaTela[]> {
  if (clinicIds !== null && clinicIds.length === 0) return [];

  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "status", op: "eq", valor: "PENDENTE" },
  ];
  if (clinicIds !== null) filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  const linhas = await selecionar("crc_previsit_checks", {
    colunas: "id,appointment_id,patient_id,item,detalhe,resolve_quem",
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: Math.min(limite, 200),
  });

  const consultas = await horariosDe(
    organizationId,
    linhas.map((l) => String(l["appointment_id"] ?? "")),
  );

  return linhas.map((l) => ({
    id: String(l["id"] ?? ""),
    appointmentId: String(l["appointment_id"] ?? ""),
    patientId: typeof l["patient_id"] === "string" ? l["patient_id"] : null,
    item: String(l["item"] ?? "CONFIRMACAO") as ItemDePreConsulta,
    detalhe: typeof l["detalhe"] === "string" ? l["detalhe"] : null,
    resolveQuem: String(l["resolve_quem"] ?? "humano"),
    inicioEm: consultas.get(String(l["appointment_id"] ?? "")) ?? null,
  }));
}

async function horariosDe(
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const linhas = await selecionar<{ id: string; inicio_em: string }>("crc_appointments", {
    colunas: "id,inicio_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "in", valor: [...new Set(ids)] },
    ],
    limite: 200,
  });

  return new Map(linhas.map((l) => [l.id, l.inicio_em]));
}

/** Marca uma pendência como resolvida, ou dispensada por quem sabe. */
export async function fecharPendencia(
  organizationId: string,
  id: string,
  status: "RESOLVIDO" | "DISPENSADO",
  userId: string | null,
): Promise<void> {
  await atualizar(
    "crc_previsit_checks",
    [
      { coluna: "id", op: "eq", valor: id },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      status,
      resolvido_em: agoraIso(),
      resolvido_por: userId,
      atualizado_em: agoraIso(),
    },
  );
}
