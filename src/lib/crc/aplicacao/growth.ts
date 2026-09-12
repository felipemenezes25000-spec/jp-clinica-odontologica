/**
 * Growth — o serviço.
 *
 * ============================================================================
 *  O QUE RODA SOZINHO AQUI, e o que exige gente:
 *
 *    RODA SOZINHO   perguntar como foi depois da consulta; rotear a resposta;
 *                   contar o funil de indicação; parar variante que gera saída.
 *
 *    EXIGE GENTE    responder a quem reclamou; decidir recompensa de indicação;
 *                   APLICAR um aprendizado.
 *
 *  A divisão não é por dificuldade técnica — é por consequência. Tudo que muda
 *  a política da clínica ou fala com alguém insatisfeito passa por uma pessoa.
 * ============================================================================
 */
import {
  avaliarAprendizado,
  calcularNps,
  conferirGuardrail,
  destinoDoFeedback,
  expirou,
  gerarCodigo,
  lerExperimento,
  podeAvancar,
  type EtapaDaIndicacao,
  type LeituraDoExperimento,
  type NumerosDaVariante,
} from "../dominio/growth";
import {
  agoraIso,
  atualizar,
  inserir,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
  type Filtro,
} from "../servidor/banco";
import { auditar, registrar } from "../servidor/registro";

/* -------------------------------------------------------------------------- */
/* Reputação                                                                  */
/* -------------------------------------------------------------------------- */

export type ResultadoDaPesquisa = { consultas: number; perguntas: number };

/**
 * Horas depois da consulta para perguntar.
 *
 * ============================================================================
 *  VINTE E QUATRO. O número é sobre a memória de quem responde.
 *
 *  Perguntar na saída pega a pessoa ainda na clínica, com a recepcionista na
 *  frente — e a nota sai alta por educação. Perguntar uma semana depois pega
 *  alguém que já esqueceu.
 *
 *  Um dia depois a pessoa está em casa, lembra do atendimento, e responde o que
 *  achou de verdade.
 * ============================================================================
 */
export const HORAS_PARA_PERGUNTAR = 24;

/**
 * Pergunta como foi, para quem foi atendido ontem.
 *
 * PERGUNTA A TODO MUNDO. Filtrar quem recebe a pesquisa com base na nota
 * esperada é manipular avaliação (§32) — e produz média alta com uma clínica
 * que não sabe o que está errado.
 */
export async function perguntarComoFoi(
  organizationId: string,
  agora: Date = new Date(),
): Promise<ResultadoDaPesquisa> {
  const ate = new Date(agora.getTime() - HORAS_PARA_PERGUNTAR * 3_600_000);
  const desde = new Date(ate.getTime() - 48 * 3_600_000);

  const consultas = await selecionar<{
    id: string;
    clinic_id: string;
    patient_id: string | null;
  }>("crc_appointments", {
    colunas: "id,clinic_id,patient_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "eq", valor: "COMPLETED" },
      { coluna: "inicio_em", op: "gte", valor: desde.toISOString() },
      { coluna: "inicio_em", op: "lte", valor: ate.toISOString() },
    ],
    limite: 300,
  });

  let perguntas = 0;

  for (const c of consultas) {
    if (c.patient_id === null) continue;

    const linha = await inserirIgnorandoDuplicata("crc_feedback", {
      organization_id: organizationId,
      clinic_id: c.clinic_id,
      patient_id: c.patient_id,
      appointment_id: c.id,
      status: "PERGUNTADO",
      perguntado_em: agora.toISOString(),
      // Uma pergunta por consulta. Sem isto a varredura diária perguntaria de
      // novo a cada volta — e nada irrita mais que a mesma pesquisa quatro vezes.
      chave_dedupe: `feedback:${c.id}`,
    });

    if (linha !== null) perguntas += 1;
  }

  return { consultas: consultas.length, perguntas };
}

export type RespostaRegistrada = {
  destino: "CONVIDAR" | "RECUPERAR" | "AGRADECER";
  porque: string;
  /** Preenchido quando a resposta virou tarefa para alguem. */
  tarefaId: string | null;
};

/**
 * A pessoa respondeu. Roteia.
 *
 * ============================================================================
 *  A RECUPERAÇÃO VIRA TAREFA, e não "caso humano" — e a escolha foi corrigida
 *  depois de olhar o schema.
 *
 *  `crc_human_cases` parecia o lugar óbvio pelo nome. Não é: ela existe para o
 *  HANDOFF DO AGENTE, e o formato diz isso — `conversation_id` é NOT NULL,
 *  `run_id` aponta para o turno, `resposta_barrada` guarda o que o agente teria
 *  respondido. Uma resposta de pesquisa de satisfação não tem conversa nem
 *  turno; forçá-la ali exigiria tornar a coluna nulável e desfigurar a tabela.
 *
 *  `crc_tasks` é a fila geral de trabalho humano, já tem responsável, prazo,
 *  prioridade e dedupe — e é onde a equipe já olha. Criar uma terceira fila
 *  seria o "vinte projetos colados" que o §1 proíbe.
 * ============================================================================
 */
export async function registrarResposta(
  organizationId: string,
  feedbackId: string,
  nota: number,
  comentario: string | null,
  agora: Date = new Date(),
): Promise<RespostaRegistrada | null> {
  const atual = await selecionarUm("crc_feedback", {
    colunas: "id,clinic_id,patient_id,status",
    filtros: [
      { coluna: "id", op: "eq", valor: feedbackId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  if (atual === null) return null;

  const d = destinoDoFeedback(nota, comentario);
  let tarefaId: string | null = null;

  if (d.destino === "RECUPERAR") {
    const criado = await inserir<{ id: string }>("crc_tasks", {
      organization_id: organizationId,
      clinic_id: atual["clinic_id"],
      patient_id: atual["patient_id"],
      titulo: `Ouvir quem deu nota ${String(nota)}`,
      tipo: "LIGAR",
      status: "OPEN",
      prioridade: d.urgencia === "ALTA" ? 90 : 60,
      /*
       * O COMENTÁRIO VAI INTEIRO PARA A TAREFA, e não resumido.
       *
       * Quem vai ligar precisa das palavras da pessoa. Um resumo do tipo
       * "paciente insatisfeito com atendimento" faz a ligação começar com
       * "soube que você não gostou", que é a pior abertura possível.
       */
      notas: comentario ?? `Nota ${String(nota)} na pesquisa de satisfação, sem comentário.`,
      motivo: d.porque,
      // Uma tarefa por resposta. Reprocessar não cria a segunda.
      chave_dedupe: `recuperacao:${feedbackId}`,
      criado_em: agora.toISOString(),
      atualizado_em: agora.toISOString(),
    });
    tarefaId = criado[0]?.id ?? null;
  }

  await atualizar("crc_feedback", [{ coluna: "id", op: "eq", valor: feedbackId }], {
    nota,
    comentario,
    status:
      d.destino === "CONVIDAR"
        ? "CONVIDADO_A_AVALIAR"
        : d.destino === "RECUPERAR"
          ? "RECUPERACAO"
          : "RESPONDEU",
    tarefa_id: tarefaId,
    respondido_em: agora.toISOString(),
    atualizado_em: agora.toISOString(),
  });

  return { destino: d.destino, porque: d.porque, tarefaId };
}

export type ResumoDaReputacao = {
  respostas: number;
  nps: number | null;
  promotores: number;
  neutros: number;
  detratores: number;
  /** Casos de insatisfação ainda abertos. */
  emRecuperacao: number;
};

export async function resumoDaReputacao(
  organizationId: string,
  clinicIds: readonly string[] | null,
  desde: string,
): Promise<ResumoDaReputacao> {
  if (clinicIds !== null && clinicIds.length === 0) {
    return { respostas: 0, nps: null, promotores: 0, neutros: 0, detratores: 0, emRecuperacao: 0 };
  }

  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "nota", op: "not.is", valor: null },
    { coluna: "respondido_em", op: "gte", valor: desde },
  ];
  if (clinicIds !== null) filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  const linhas = await selecionar<{ nota: number; status: string }>("crc_feedback", {
    colunas: "nota,status",
    filtros,
    limite: 2000,
  });

  const notas = linhas.map((l) => Number(l.nota)).filter((n) => Number.isFinite(n));

  return {
    respostas: notas.length,
    nps: calcularNps(notas),
    promotores: notas.filter((n) => n >= 9).length,
    neutros: notas.filter((n) => n >= 7 && n <= 8).length,
    detratores: notas.filter((n) => n <= 6).length,
    emRecuperacao: linhas.filter((l) => l.status === "RECUPERACAO").length,
  };
}

/* -------------------------------------------------------------------------- */
/* Indicação                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * O código de indicação de um paciente, criando na primeira vez.
 *
 * IDEMPOTENTE porque o código é derivado do id: chamar duas vezes devolve o
 * mesmo, e um retry não cria o segundo código da mesma pessoa.
 */
export async function codigoDoPaciente(
  organizationId: string,
  patientId: string,
): Promise<string | null> {
  const p = await selecionarUm("crc_patients", {
    colunas: "codigo_indicacao",
    filtros: [
      { coluna: "id", op: "eq", valor: patientId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  if (p === null) return null;

  const existente = p["codigo_indicacao"];
  if (typeof existente === "string" && existente.length > 0) return existente;

  const codigo = gerarCodigo(patientId);
  await atualizar("crc_patients", [{ coluna: "id", op: "eq", valor: patientId }], {
    codigo_indicacao: codigo,
    atualizado_em: agoraIso(),
  });

  return codigo;
}

export async function registrarIndicacao(i: {
  organizationId: string;
  clinicId: string;
  indicadorId: string;
  indicadoNome?: string | null;
  indicadoTelefone?: string | null;
  indicadoId?: string | null;
  chaveDedupe?: string | null;
}): Promise<string | null> {
  const linha = await inserirIgnorandoDuplicata("crc_referrals", {
    organization_id: i.organizationId,
    clinic_id: i.clinicId,
    indicador_id: i.indicadorId,
    indicado_id: i.indicadoId ?? null,
    indicado_nome: i.indicadoNome ?? null,
    indicado_telefone: i.indicadoTelefone ?? null,
    status: "REGISTRADA",
    chave_dedupe: i.chaveDedupe ?? null,
  });

  return linha === null ? null : String(linha["id"] ?? "");
}

/**
 * Avança a indicação na cadeia.
 *
 * RECUSA ANDAR PARA TRÁS. A sincronização reprocessa, e um evento antigo
 * chegando fora de ordem rebaixaria uma indicação que já converteu.
 */
export async function avancarIndicacao(
  organizationId: string,
  referralId: string,
  para: EtapaDaIndicacao,
  valorGerado: number | null = null,
): Promise<boolean> {
  const atual = await selecionarUm("crc_referrals", {
    colunas: "status",
    filtros: [
      { coluna: "id", op: "eq", valor: referralId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  if (atual === null) return false;

  const de = String(atual["status"] ?? "REGISTRADA") as EtapaDaIndicacao;
  if (!podeAvancar(de, para)) return false;

  await atualizar("crc_referrals", [{ coluna: "id", op: "eq", valor: referralId }], {
    status: para,
    /*
     * O VALOR SÓ ENTRA EM `CONVERTEU`, e a regra é a mesma da cadeia de
     * atribuição: valor que não aconteceu não se soma com valor que
     * aconteceu.
     */
    ...(para === "CONVERTEU" && valorGerado !== null ? { valor_gerado: valorGerado } : {}),
    atualizado_em: agoraIso(),
  });

  return true;
}

export type FunilDeIndicacao = {
  registradas: number;
  viraramLead: number;
  agendaram: number;
  compareceram: number;
  converteram: number;
  /** Soma de `valor_gerado`. Só das convertidas — ver o comentário acima. */
  valorGerado: number;
  /** Quem mais indicou, com quantas. */
  topIndicadores: { patientId: string; quantas: number }[];
};

export async function funilDeIndicacao(
  organizationId: string,
  clinicIds: readonly string[] | null,
): Promise<FunilDeIndicacao> {
  const vazio: FunilDeIndicacao = {
    registradas: 0,
    viraramLead: 0,
    agendaram: 0,
    compareceram: 0,
    converteram: 0,
    valorGerado: 0,
    topIndicadores: [],
  };

  if (clinicIds !== null && clinicIds.length === 0) return vazio;

  const filtros: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];
  if (clinicIds !== null) filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  const linhas = await selecionar<{
    status: string;
    valor_gerado: string | null;
    indicador_id: string;
  }>("crc_referrals", {
    colunas: "status,valor_gerado,indicador_id",
    filtros,
    limite: 2000,
  });

  const porIndicador = new Map<string, number>();
  const f = { ...vazio, topIndicadores: [] as { patientId: string; quantas: number }[] };

  for (const l of linhas) {
    f.registradas += 1;
    if (l.status === "VIROU_LEAD") f.viraramLead += 1;
    if (l.status === "AGENDOU") f.agendaram += 1;
    if (l.status === "COMPARECEU") f.compareceram += 1;
    if (l.status === "CONVERTEU") {
      f.converteram += 1;
      f.valorGerado += Number(l.valor_gerado ?? 0) || 0;
    }
    porIndicador.set(l.indicador_id, (porIndicador.get(l.indicador_id) ?? 0) + 1);
  }

  f.valorGerado = Number(f.valorGerado.toFixed(2));
  f.topIndicadores = [...porIndicador.entries()]
    .map(([patientId, quantas]) => ({ patientId, quantas }))
    .sort((a, b) => b.quantas - a.quantas)
    .slice(0, 10);

  return f;
}

/* -------------------------------------------------------------------------- */
/* Experimento                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Confere os guardrails de todos os experimentos rodando, e para o que precisa.
 *
 * ============================================================================
 *  ESTA FUNÇÃO PRECISA RODAR NO PULSO, e não na volta pesada.
 *
 *  Um guardrail que só é conferido uma vez por dia deixa a variante ruim rodar
 *  o dia inteiro — e num disparo de campanha isso é a lista inteira. O custo de
 *  conferir é baixo: são leituras de contadores já desnormalizados.
 * ============================================================================
 */
export async function conferirExperimentos(
  organizationId: string,
  agora: Date = new Date(),
): Promise<{ conferidos: number; parados: number }> {
  const experimentos = await selecionar<{
    id: string;
    nome: string;
    opt_out_max_pct: string | number;
    amostra_minima: number;
  }>("crc_experiments", {
    colunas: "id,nome,opt_out_max_pct,amostra_minima",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "eq", valor: "RODANDO" },
    ],
    limite: 50,
  });

  let parados = 0;

  for (const e of experimentos) {
    const variantes = await lerVariantes(organizationId, e.id);

    const v = conferirGuardrail(variantes, {
      optOutMaxPct: Number(e.opt_out_max_pct) || 2,
      amostraMinima: e.amostra_minima,
    });

    if (!v.parar) continue;

    /*
     * PARA A VARIANTE E O EXPERIMENTO INTEIRO.
     *
     * Parar só a variante ruim parece mais fino, e é pior: o experimento
     * passaria a rodar com uma variante só, virando um disparo normal disfarçado
     * de teste — e o relatório depois compararia grupos de tamanhos
     * incomparáveis.
     */
    await atualizar(
      "crc_experiment_variants",
      [
        { coluna: "experiment_id", op: "eq", valor: e.id },
        { coluna: "nome", op: "eq", valor: v.variante },
      ],
      { status: "PARADA", atualizado_em: agora.toISOString() },
    );

    await atualizar("crc_experiments", [{ coluna: "id", op: "eq", valor: e.id }], {
      status: "PARADO_POR_GUARDRAIL",
      parado_motivo: v.motivo,
      encerrado_em: agora.toISOString(),
      atualizado_em: agora.toISOString(),
    });

    // Aviso: um experimento parado por guardrail é um evento notável, e precisa
    // aparecer no mesmo filtro dos kill switches.
    registrar("aviso", "Experimento parado por guardrail.", {
      organizationId,
      experimento: e.nome,
      motivo: v.motivo,
    });

    parados += 1;
  }

  return { conferidos: experimentos.length, parados };
}

async function lerVariantes(
  organizationId: string,
  experimentId: string,
): Promise<NumerosDaVariante[]> {
  const linhas = await selecionar("crc_experiment_variants", {
    colunas: "nome,controle,enviados,responderam,converteram,opt_outs",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "experiment_id", op: "eq", valor: experimentId },
    ],
    limite: 20,
  });

  return linhas.map((l) => ({
    nome: String(l["nome"] ?? ""),
    controle: l["controle"] === true,
    enviados: Number(l["enviados"] ?? 0) || 0,
    responderam: Number(l["responderam"] ?? 0) || 0,
    converteram: Number(l["converteram"] ?? 0) || 0,
    optOuts: Number(l["opt_outs"] ?? 0) || 0,
  }));
}

export async function lerResultado(
  organizationId: string,
  experimentId: string,
): Promise<LeituraDoExperimento> {
  return lerExperimento(await lerVariantes(organizationId, experimentId));
}

/* -------------------------------------------------------------------------- */
/* Aprendizado                                                                */
/* -------------------------------------------------------------------------- */

export async function registrarAprendizado(a: {
  organizationId: string;
  clinicId?: string | null;
  afirmacao: string;
  dimensao?: string;
  amostra: number;
  efeitoPct: number;
  periodoDias: number;
  experimentId?: string | null;
  chaveDedupe?: string | null;
}): Promise<string | null> {
  const v = avaliarAprendizado({
    amostra: a.amostra,
    efeitoPct: a.efeitoPct,
    periodoDias: a.periodoDias,
  });

  const linha = await inserirIgnorandoDuplicata("crc_learnings", {
    organization_id: a.organizationId,
    clinic_id: a.clinicId ?? null,
    afirmacao: a.afirmacao,
    dimensao: a.dimensao ?? "OUTRO",
    status: v.status,
    amostra: a.amostra,
    efeito_pct: a.efeitoPct,
    confianca: v.confianca,
    experiment_id: a.experimentId ?? null,
    chave_dedupe: a.chaveDedupe ?? null,
  });

  return linha === null ? null : String(linha["id"] ?? "");
}

/**
 * Uma PESSOA aplica o aprendizado.
 *
 * ============================================================================
 *  NÃO HÁ CAMINHO AUTOMÁTICO PARA CÁ, e é a razão de esta função existir
 *  separada de `registrarAprendizado`.
 *
 *  O §37 pede: "não alterar política crítica silenciosamente". `APLICADO` é um
 *  estado que só se alcança com `userId` — e o nome fica registrado.
 * ============================================================================
 */
export async function decidirAprendizado(
  organizationId: string,
  learningId: string,
  decisao: "APLICADO" | "REJEITADO",
  nota: string | null,
  userId: string,
): Promise<void> {
  await atualizar(
    "crc_learnings",
    [
      { coluna: "id", op: "eq", valor: learningId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      status: decisao,
      decidido_por: userId,
      decidido_em: agoraIso(),
      decisao_nota: nota,
      atualizado_em: agoraIso(),
    },
  );

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: decisao === "APLICADO" ? "aprendizado.aplicado" : "aprendizado.rejeitado",
    entityType: "learning",
    entityId: learningId,
    depois: { decisao, nota },
  });
}

/**
 * Expira os aprendizados velhos.
 *
 * Uma clínica muda: equipe nova, horário novo, público novo. Um aprendizado de
 * um ano atrás pode estar descrevendo uma operação que não existe mais — e
 * continuar guiando decisão.
 */
export async function expirarAprendizados(
  organizationId: string,
  agora: Date = new Date(),
): Promise<number> {
  const linhas = await selecionar<{ id: string; decidido_em: string | null }>("crc_learnings", {
    colunas: "id,decidido_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "eq", valor: "APLICADO" },
    ],
    limite: 500,
  });

  let expirados = 0;
  for (const l of linhas) {
    if (!expirou(l.decidido_em, agora)) continue;

    await atualizar("crc_learnings", [{ coluna: "id", op: "eq", valor: l.id }], {
      status: "EXPIRADO",
      atualizado_em: agora.toISOString(),
    });
    expirados += 1;
  }

  return expirados;
}
