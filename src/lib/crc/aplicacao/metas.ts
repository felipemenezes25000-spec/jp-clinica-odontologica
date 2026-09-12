/**
 * Metas — o serviço.
 *
 * ============================================================================
 *  A PARTE QUE DECIDE SE ESTE MÓDULO É HONESTO É `medirValor()`.
 *
 *  Todo o resto — criar, aprovar, planejar — é cadastro. O que separa uma meta
 *  de uma anotação é o sistema saber contar sozinho quanto já foi andado, sem
 *  ninguém digitar o progresso.
 *
 *  Por isso o catálogo é fechado e cada tipo tem uma medição escrita aqui. Não
 *  existe "meta personalizada": ela nasceria parada em 0% para sempre, e uma
 *  meta parada em 0% por um mês ensina o dono que o módulo não funciona.
 * ============================================================================
 *
 * O BASELINE É CONGELADO NA CRIAÇÃO. Recalculá-lo a cada medição faria a meta
 * se mover junto com o resultado, e o progresso seria eternamente zero. É a
 * diferença entre "saímos de 61% e chegamos a 72%" e "estamos em 72%".
 */
import {
  calcularProgresso,
  descreverMeta,
  montarPlano,
  VERSAO_DO_PLANO,
  type Plano,
  type Progresso,
  type Recursos,
  type Situacao,
  type TipoDeMeta,
} from "../dominio/metas";
import {
  agoraIso,
  atualizar,
  contar,
  inserir,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
  type Filtro,
  type Linha,
} from "../servidor/banco";
import { auditar } from "../servidor/registro";

export type StatusDaMeta = "RASCUNHO" | "ATIVA" | "PAUSADA" | "ATINGIDA" | "VENCIDA" | "CANCELADA";

export type Resultado = { ok: true } | { ok: false; motivo: string };

/* -------------------------------------------------------------------------- */
/* A medição                                                                  */
/* -------------------------------------------------------------------------- */

function escopo(organizationId: string, clinicIds: readonly string[] | null): Filtro[] {
  const f: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];
  if (clinicIds !== null) f.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });
  return f;
}

/** Divide sem produzir `NaN` nem `Infinity` — os dois envenenam o gráfico. */
function razao(parte: number, todo: number): number {
  return todo <= 0 ? 0 : parte / todo;
}

/**
 * Quanto a clínica está hoje, na régua da meta.
 *
 * ============================================================================
 *  CADA TIPO MEDE EXATAMENTE O QUE `comoMede` DIZ NA TELA.
 *
 *  Essa correspondência não é decorativa: `comoMede` aparece antes de alguém
 *  criar a meta, e é o contrato. Se a medição divergir da frase, a tela mente
 *  sobre a própria régua — e o dono descobre no fim do mês, quando a meta
 *  fecha em 40% sem ele entender por quê.
 *
 *  Por isso as duas coisas vivem lado a lado neste arquivo e no catálogo, e
 *  qualquer mudança numa exige a outra.
 * ============================================================================
 */
export async function medirValor(
  tipo: TipoDeMeta,
  organizationId: string,
  clinicIds: readonly string[] | null,
  de: string,
  ate: string,
): Promise<number> {
  if (clinicIds !== null && clinicIds.length === 0) return 0;

  const base = escopo(organizationId, clinicIds);
  const janela = (coluna: string): Filtro[] => [
    ...base,
    { coluna, op: "gte", valor: de },
    { coluna, op: "lte", valor: ate },
  ];

  if (tipo === "OCUPACAO_AGENDA") {
    /*
     * A OCUPAÇÃO VEM DO MÓDULO DE GESTÃO, e não de uma conta nova.
     *
     * Ele já mede contra a janela REAL de atendimento de cada dia. Recalcular
     * aqui produziria uma segunda definição de "ocupação" — e no dia em que as
     * duas divergissem, ninguém saberia qual está certa.
     */
    const { lerCapacidades } = await import("./gestao");
    const capacidades = await lerCapacidades(organizationId, clinicIds, new Date(ate));
    if (capacidades.length === 0) return 0;

    const media = capacidades.reduce((s, c) => s + c.ocupacao, 0) / capacidades.length;
    return Math.round(media * 1000) / 10; // percentual com uma casa
  }

  if (tipo === "RECEITA_RECUPERADA") {
    /*
     * SÓ `natureza = PRODUCAO` E `recuperada = true`.
     *
     * `POTENCIAL` é o que o Radar ESTIMA que pode voltar; contá-lo aqui faria a
     * meta ser batida por expectativa. É a mesma separação do item 63: potencial
     * e confirmado nunca no mesmo número.
     */
    const linhas = await selecionar<{ valor: string | number }>("crc_revenue_events", {
      colunas: "valor",
      filtros: [
        ...janela("ocorrido_em"),
        { coluna: "natureza", op: "eq", valor: "PRODUCAO" },
        { coluna: "recuperada", op: "eq", valor: true },
      ],
      limite: 5000,
    });
    return linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);
  }

  if (tipo === "AGENDAMENTOS") {
    /*
     * A JANELA É `criado_em`, e não `inicio_em`.
     *
     * A meta é sobre o trabalho de MARCAR consulta, e não sobre quando ela
     * acontece. Marcar hoje uma consulta para março conta hoje — senão o
     * esforço de dezembro apareceria como resultado de março.
     */
    return contar("crc_appointments", [
      ...janela("criado_em"),
      { coluna: "status", op: "neq", valor: "CANCELLED" },
    ]);
  }

  if (tipo === "CONVERSAO_ORCAMENTO") {
    // Só os que TIVERAM DESFECHO entram no denominador: um orçamento ainda em
    // negociação não é uma derrota, e contá-lo afundaria a taxa sem motivo.
    const [aceitos, perdidos] = await Promise.all([
      contar("crc_budgets", janela("aceito_em")),
      contar("crc_budgets", janela("perdido_em")),
    ]);
    return Math.round(razao(aceitos, aceitos + perdidos) * 1000) / 10;
  }

  if (tipo === "REDUZIR_FALTAS") {
    const [faltas, decididas] = await Promise.all([
      contar("crc_appointments", [
        ...janela("inicio_em"),
        { coluna: "status", op: "eq", valor: "MISSED" },
      ]),
      contar("crc_appointments", [
        ...janela("inicio_em"),
        { coluna: "status", op: "in", valor: ["MISSED", "COMPLETED"] },
      ]),
    ]);
    return Math.round(razao(faltas, decididas) * 1000) / 10;
  }

  /*
   * REATIVAR_PACIENTES — o único que precisa de duas passadas.
   *
   * "Voltou" só significa alguma coisa contra "estava sumido": conta-se quem
   * marcou no período E cuja consulta anterior a esse período é mais velha que
   * seis meses. Contar só "marcou no período" devolveria a agenda inteira.
   */
  const marcaram = await selecionar<{ patient_id: string | null }>("crc_appointments", {
    colunas: "patient_id",
    filtros: [...janela("criado_em"), { coluna: "status", op: "neq", valor: "CANCELLED" }],
    limite: 5000,
  });

  const candidatos = [
    ...new Set(marcaram.map((m) => m.patient_id).filter((p): p is string => p !== null)),
  ];
  if (candidatos.length === 0) return 0;

  const seisMesesAntes = new Date(Date.parse(de) - 182 * 86_400_000).toISOString();

  // Quem teve consulta nos seis meses ANTERIORES à janela não estava sumido.
  const ativosAntes = await selecionar<{ patient_id: string | null }>("crc_appointments", {
    colunas: "patient_id",
    filtros: [
      ...base,
      { coluna: "patient_id", op: "in", valor: candidatos },
      { coluna: "inicio_em", op: "gte", valor: seisMesesAntes },
      { coluna: "inicio_em", op: "lt", valor: de },
      { coluna: "status", op: "neq", valor: "CANCELLED" },
    ],
    limite: 5000,
  });

  const recentes = new Set(ativosAntes.map((a) => a.patient_id));
  return candidatos.filter((c) => !recentes.has(c)).length;
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

export type MetaNaLista = {
  id: string;
  titulo: string;
  tipo: TipoDeMeta;
  rotuloDoTipo: string;
  comoMede: string;
  unidade: string;
  /** O que o periodo anterior equivalente produziu. */
  baseline: number;
  /** `true` quando o periodo comeca do zero e o baseline e so referencia. */
  ehAcumulado: boolean;
  alvo: number;
  atual: number | null;
  prazoEm: string;
  status: StatusDaMeta;
  maxContatosDia: number;
  maxAutonomia: number;
  medidoEm: string | null;
  progresso: Progresso | null;
  acoes: AcaoNaLista[];
};

export type AcaoNaLista = {
  id: string;
  modulo: string;
  titulo: string;
  descricao: string | null;
  contribuicaoEstimada: number;
  confianca: number;
  alcanceEstimado: number;
  status: string;
  versao: number;
};

function diasEntreIso(deIso: string, ateIso: string): number {
  const ms = Date.parse(ateIso) - Date.parse(deIso);
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * De onde o progresso parte.
 *
 * ============================================================================
 *  ESTOQUE PARTE DE ONDE ESTÁ; FLUXO PARTE DE ZERO.
 *
 *  "Chegar a 90% de ocupação" parte dos 61% de hoje, porque ocupação é um
 *  estado. "Marcar 30 consultas até dia 12" parte de zero — ninguém começa o
 *  mês com 20 já marcadas.
 *
 *  A coluna `baseline` guarda, nos dois casos, o que o período anterior
 *  equivalente produziu. Para estoque ela é o ponto de partida; para fluxo é
 *  REFERÊNCIA — "mês passado foram 20" —, e a tela mostra as duas coisas com
 *  esse nome.
 *
 *  Usar o baseline de fluxo como origem faria toda meta de contagem nascer
 *  catastroficamente atrasada: no dia 1 de 30, o acumulado é quase zero contra
 *  um mês inteiro. Sem erro nenhum na tela — só um módulo que parece quebrado.
 * ============================================================================
 */
function origemDoProgresso(baselineGravado: number, ehAcumulado: boolean): number {
  return ehAcumulado ? 0 : baselineGravado;
}

function paraMeta(l: Linha, acoes: AcaoNaLista[], agora: Date): MetaNaLista {
  const tipo = String(l["tipo"] ?? "AGENDAMENTOS") as TipoDeMeta;
  const d = descreverMeta(tipo);

  const baseline = Number(l["baseline"] ?? 0);
  const alvo = Number(l["alvo"] ?? 0);
  const bruto = l["progresso_atual"];
  const atual = bruto === null || bruto === undefined ? null : Number(bruto);

  const criadoEm = String(l["criado_em"] ?? agora.toISOString());
  const prazoEm = String(l["prazo_em"] ?? agora.toISOString());

  return {
    id: String(l["id"] ?? ""),
    titulo: String(l["titulo"] ?? ""),
    tipo,
    rotuloDoTipo: d.rotulo,
    comoMede: d.comoMede,
    unidade: String(l["unidade"] ?? d.unidade),
    baseline,
    ehAcumulado: d.ehAcumulado,
    alvo,
    atual,
    prazoEm,
    status: String(l["status"] ?? "RASCUNHO") as StatusDaMeta,
    maxContatosDia: Number(l["max_contatos_dia"] ?? 100),
    maxAutonomia: Number(l["max_autonomia"] ?? 2),
    medidoEm: l["medido_em"] === null ? null : String(l["medido_em"] ?? ""),
    /*
     * SEM MEDIÇÃO, O PROGRESSO É `null` — e não zero.
     *
     * Zero diz "não andamos nada"; `null` diz "ainda não olhamos". A tela
     * precisa distinguir as duas, porque a primeira é notícia ruim e a segunda
     * é só uma meta recém-criada.
     */
    progresso:
      atual === null
        ? null
        : calcularProgresso({
            baseline: origemDoProgresso(baseline, d.ehAcumulado),
            alvo,
            atual,
            menorEhMelhor: d.menorEhMelhor,
            diasTotais: diasEntreIso(criadoEm, prazoEm),
            diasRestantes: diasEntreIso(agora.toISOString(), prazoEm),
          }),
    acoes,
  };
}

export async function listarMetas(
  organizationId: string,
  clinicIds: readonly string[] | null,
  agora: Date = new Date(),
): Promise<MetaNaLista[]> {
  if (clinicIds !== null && clinicIds.length === 0) return [];

  const filtros: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];

  const linhas = await selecionar("crc_goals", {
    filtros,
    // Ativas primeiro, depois as mais recentes: uma meta encerrada não disputa
    // atenção com uma em andamento.
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: 100,
  });

  if (linhas.length === 0) return [];

  const ids = linhas.map((l) => String(l["id"] ?? "")).filter((i) => i.length > 0);
  const acoes = await selecionar("crc_goal_actions", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "goal_id", op: "in", valor: ids },
    ],
    ordenar: [{ coluna: "ordem", ascendente: true }],
    limite: 1000,
  });

  const porMeta = new Map<string, AcaoNaLista[]>();
  for (const a of acoes) {
    const chave = String(a["goal_id"] ?? "");
    const lista = porMeta.get(chave) ?? [];
    lista.push({
      id: String(a["id"] ?? ""),
      modulo: String(a["modulo"] ?? ""),
      titulo: String(a["titulo"] ?? ""),
      descricao: a["descricao"] === null ? null : String(a["descricao"] ?? ""),
      contribuicaoEstimada: Number(a["contribuicao_estimada"] ?? 0),
      confianca: Number(a["confianca"] ?? 0),
      alcanceEstimado: Number(a["alcance_estimado"] ?? 0),
      status: String(a["status"] ?? "PLANEJADA"),
      versao: Number(a["versao"] ?? 1),
    });
    porMeta.set(chave, lista);
  }

  const metas = linhas.map((l) => paraMeta(l, porMeta.get(String(l["id"] ?? "")) ?? [], agora));

  // A ordem de leitura da tela: o que está correndo, depois rascunho, depois o
  // que já terminou.
  const peso: Record<string, number> = {
    ATIVA: 0,
    RASCUNHO: 1,
    PAUSADA: 2,
    ATINGIDA: 3,
    VENCIDA: 4,
    CANCELADA: 5,
  };
  return metas.sort((a, b) => (peso[a.status] ?? 9) - (peso[b.status] ?? 9));
}

/* -------------------------------------------------------------------------- */
/* Os recursos que o plano tem à disposição                                   */
/* -------------------------------------------------------------------------- */

async function lerRecursos(
  organizationId: string,
  clinicIds: readonly string[] | null,
  agora: Date,
): Promise<Recursos> {
  if (clinicIds !== null && clinicIds.length === 0) {
    return {
      buracosAbertos: 0,
      pacientesEmRecall: 0,
      orcamentosAbertos: 0,
      orcamentosQuantidade: 0,
      consultasEmRisco: 0,
      inativos: 0,
    };
  }

  const base = escopo(organizationId, clinicIds);
  const seisMeses = new Date(agora.getTime() - 182 * 86_400_000).toISOString();

  const [buracos, emRisco, orcamentos] = await Promise.all([
    contar("crc_schedule_gaps", [
      ...base,
      { coluna: "status", op: "in", valor: ["ABERTO", "OFERECENDO"] },
    ]),
    contar("crc_appointments", [
      ...base,
      { coluna: "risco_falta", op: "eq", valor: "ALTO" },
      { coluna: "inicio_em", op: "gt", valor: agora.toISOString() },
    ]),
    selecionar<{ total_value: string | number }>("crc_budgets", {
      colunas: "total_value",
      filtros: [
        ...base,
        { coluna: "aceito_em", op: "is", valor: null },
        { coluna: "perdido_em", op: "is", valor: null },
      ],
      limite: 2000,
    }),
  ]);

  /*
   * "INATIVO" É MEDIDO PELA ÚLTIMA CONSULTA, e não por um campo de status.
   *
   * Um campo `ativo` na tabela de paciente envelhece em silêncio: ninguém o
   * desmarca quando a pessoa some. A última consulta é um fato datado.
   */
  const inativos = await contar("crc_patients", [
    ...base,
    { coluna: "ultima_consulta_em", op: "lt", valor: seisMeses },
    { coluna: "opt_out_em", op: "is", valor: null },
  ]);

  return {
    buracosAbertos: buracos,
    pacientesEmRecall: inativos,
    orcamentosAbertos: orcamentos.reduce((s, o) => s + (Number(o.total_value) || 0), 0),
    orcamentosQuantidade: orcamentos.length,
    consultasEmRisco: emRisco,
    inativos,
  };
}

/* -------------------------------------------------------------------------- */
/* Criar                                                                      */
/* -------------------------------------------------------------------------- */

export type PedidoDeMeta = {
  organizationId: string;
  clinicIds: readonly string[] | null;
  clinicId: string | null;
  titulo: string;
  tipo: TipoDeMeta;
  alvo: number;
  prazoEm: string;
  maxContatosDia: number;
  maxAutonomia: number;
  autorId: string;
};

export async function criarMeta(
  p: PedidoDeMeta,
  agora: Date = new Date(),
): Promise<Resultado & { id?: string }> {
  const titulo = p.titulo.trim();
  if (titulo.length < 3) return { ok: false, motivo: "Dê um nome à meta." };

  const prazo = Date.parse(p.prazoEm);
  if (!Number.isFinite(prazo)) return { ok: false, motivo: "Prazo inválido." };
  if (prazo <= agora.getTime()) {
    return { ok: false, motivo: "O prazo precisa ser no futuro." };
  }

  if (!Number.isFinite(p.alvo)) return { ok: false, motivo: "Alvo inválido." };

  const d = descreverMeta(p.tipo);

  /*
   * O BASELINE É MEDIDO AQUI, UMA VEZ, E CONGELADO.
   *
   * A janela é o MESMO tamanho do prazo, para trás. Medir o baseline numa
   * janela de uma semana e o resultado numa de três meses compararia coisas
   * diferentes — e a meta nasceria batida ou impossível por acidente de janela.
   */
  const duracaoMs = prazo - agora.getTime();
  const inicioDaBase = new Date(agora.getTime() - duracaoMs).toISOString();

  const baseline = await medirValor(
    p.tipo,
    p.organizationId,
    p.clinicIds,
    inicioDaBase,
    agora.toISOString(),
  );

  const criadas = await inserir("crc_goals", {
    organization_id: p.organizationId,
    clinic_id: p.clinicId,
    titulo,
    tipo: p.tipo,
    baseline,
    baseline_em: agora.toISOString(),
    alvo: p.alvo,
    unidade: d.unidade,
    prazo_em: new Date(prazo).toISOString(),
    status: "RASCUNHO",
    max_contatos_dia: Math.max(1, Math.min(Math.trunc(p.maxContatosDia) || 100, 5000)),
    max_autonomia: Math.max(0, Math.min(Math.trunc(p.maxAutonomia) || 0, 5)),
    criado_por: p.autorId,
  });

  const id = criadas[0]?.["id"];
  if (typeof id !== "string") return { ok: false, motivo: "Não foi possível criar a meta." };

  // O plano nasce junto, em RASCUNHO. Uma meta sem plano é um desejo.
  await replanejar(
    { organizationId: p.organizationId, clinicIds: p.clinicIds, goalId: id, autorId: p.autorId },
    agora,
  );

  await auditar({
    organizationId: p.organizationId,
    userId: p.autorId,
    ator: "humano",
    acao: "meta_criada",
    entityType: "crc_goals",
    entityId: id,
    depois: { titulo, tipo: p.tipo, baseline, alvo: p.alvo, prazo: p.prazoEm },
  });

  return { ok: true, id };
}

/* -------------------------------------------------------------------------- */
/* Planejar                                                                   */
/* -------------------------------------------------------------------------- */

export async function replanejar(
  p: {
    organizationId: string;
    clinicIds: readonly string[] | null;
    goalId: string;
    autorId: string;
  },
  agora: Date = new Date(),
): Promise<Resultado & { plano?: Plano }> {
  const meta = await selecionarUm("crc_goals", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "id", op: "eq", valor: p.goalId },
    ],
  });
  if (meta === null) return { ok: false, motivo: "Meta não encontrada." };

  const tipo = String(meta["tipo"] ?? "AGENDAMENTOS") as TipoDeMeta;
  const d = descreverMeta(tipo);
  const origem = origemDoProgresso(Number(meta["baseline"] ?? 0), d.ehAcumulado);
  const alvo = Number(meta["alvo"] ?? 0);
  const atual =
    meta["progresso_atual"] === null ? origem : Number(meta["progresso_atual"] ?? origem);

  const distancia = d.menorEhMelhor ? Math.max(0, atual - alvo) : Math.max(0, alvo - atual);
  const diasRestantes = diasEntreIso(agora.toISOString(), String(meta["prazo_em"] ?? ""));

  const recursos = await lerRecursos(p.organizationId, p.clinicIds, agora);

  const plano = montarPlano({
    tipo,
    distancia,
    diasRestantes,
    maxContatosDia: Number(meta["max_contatos_dia"] ?? 100),
    recursos,
  });

  /*
   * A VERSÃO NOVA NÃO APAGA A ANTERIOR.
   *
   * As ações antigas ficam para comparação — é como se descobre, no ciclo
   * seguinte, que a estimativa de contribuição estava otimista. Apagá-las
   * jogaria fora a única fonte de calibração que este módulo tem.
   */
  const anteriores = await selecionar<{ versao: number }>("crc_goal_actions", {
    colunas: "versao",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "goal_id", op: "eq", valor: p.goalId },
    ],
    ordenar: [{ coluna: "versao", ascendente: false }],
    limite: 1,
  });
  const versao = (Number(anteriores[0]?.versao ?? 0) || 0) + 1;

  if (plano.acoes.length > 0) {
    await inserir(
      "crc_goal_actions",
      plano.acoes.map((a) => ({
        organization_id: p.organizationId,
        goal_id: p.goalId,
        versao,
        modulo: a.modulo,
        titulo: a.titulo,
        descricao: a.descricao,
        contribuicao_estimada: a.contribuicaoEstimada,
        confianca: a.confianca,
        alcance_estimado: a.alcanceEstimado,
        status: "PLANEJADA",
        ordem: a.ordem,
      })),
    );
  }

  await atualizar(
    "crc_goals",
    [
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "id", op: "eq", valor: p.goalId },
    ],
    { atualizado_em: agoraIso() },
  );

  return { ok: true, plano };
}

/* -------------------------------------------------------------------------- */
/* Medir                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Mede uma meta e guarda o ponto na série.
 *
 * ============================================================================
 *  O `ritmo_necessario` É GUARDADO JUNTO, e não recalculado na tela.
 *
 *  Ele MUDA: com dez dias restantes e metade do caminho, o ritmo exigido é
 *  diferente do que era no começo. Recalculá-lo depois daria o ritmo de hoje
 *  aplicado a uma medição de ontem — e o gráfico de "estávamos atrasados?"
 *  mentiria sobre o passado.
 * ============================================================================
 */
export async function medirMeta(
  organizationId: string,
  clinicIds: readonly string[] | null,
  goalId: string,
  agora: Date = new Date(),
): Promise<Resultado & { valor?: number; situacao?: Situacao }> {
  const meta = await selecionarUm("crc_goals", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "eq", valor: goalId },
    ],
  });
  if (meta === null) return { ok: false, motivo: "Meta não encontrada." };

  const tipo = String(meta["tipo"] ?? "AGENDAMENTOS") as TipoDeMeta;
  const d = descreverMeta(tipo);

  const criadoEm = String(meta["criado_em"] ?? agora.toISOString());
  const prazoEm = String(meta["prazo_em"] ?? agora.toISOString());

  // A janela de medição é do começo da meta até AGORA — o que ela acumulou.
  const valor = await medirValor(tipo, organizationId, clinicIds, criadoEm, agora.toISOString());

  const progresso = calcularProgresso({
    baseline: origemDoProgresso(Number(meta["baseline"] ?? 0), d.ehAcumulado),
    alvo: Number(meta["alvo"] ?? 0),
    atual: valor,
    menorEhMelhor: d.menorEhMelhor,
    diasTotais: diasEntreIso(criadoEm, prazoEm),
    diasRestantes: diasEntreIso(agora.toISOString(), prazoEm),
  });

  // UMA MEDIÇÃO POR META POR DIA. A varredura roda mais de uma vez; sem a
  // chave, a série teria uma linha por execução e o gráfico viraria ruído.
  await inserirIgnorandoDuplicata("crc_goal_metrics", {
    organization_id: organizationId,
    goal_id: goalId,
    valor,
    ritmo_necessario: progresso.ritmoNecessario,
    situacao: progresso.situacao,
    medido_em: agora.toISOString(),
    chave_dedupe: `${goalId}:${agora.toISOString().slice(0, 10)}`,
  });

  const mudancas: Linha = {
    progresso_atual: valor,
    medido_em: agora.toISOString(),
    atualizado_em: agora.toISOString(),
  };

  /*
   * O STATUS SÓ AVANÇA SOZINHO PARA ATINGIDA OU VENCIDA, e nunca volta.
   *
   * Uma meta que oscila entre ATIVA e ATINGIDA conforme o número do dia
   * transformaria a notificação de "meta batida" numa que chega toda semana.
   * Bateu uma vez, bateu.
   */
  const status = String(meta["status"] ?? "RASCUNHO");
  if (status === "ATIVA") {
    if (progresso.situacao === "ATINGIDA") mudancas["status"] = "ATINGIDA";
    else if (Date.parse(prazoEm) < agora.getTime()) mudancas["status"] = "VENCIDA";
  }

  await atualizar(
    "crc_goals",
    [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "eq", valor: goalId },
    ],
    mudancas,
  );

  return { ok: true, valor, situacao: progresso.situacao };
}

/** Mede todas as metas que estão correndo. É o que a volta pesada chama. */
export async function medirMetasAtivas(
  organizationId: string,
  clinicIds: readonly string[] | null,
  agora: Date = new Date(),
): Promise<number> {
  const ativas = await selecionar<{ id: string }>("crc_goals", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "eq", valor: "ATIVA" },
    ],
    limite: 200,
  });

  let medidas = 0;
  for (const a of ativas) {
    const r = await medirMeta(organizationId, clinicIds, a.id, agora);
    if (r.ok) medidas += 1;
  }
  return medidas;
}

/* -------------------------------------------------------------------------- */
/* Mudar de estado                                                            */
/* -------------------------------------------------------------------------- */

const TRANSICOES: Record<string, StatusDaMeta[]> = {
  RASCUNHO: ["ATIVA", "CANCELADA"],
  ATIVA: ["PAUSADA", "CANCELADA"],
  PAUSADA: ["ATIVA", "CANCELADA"],
  ATINGIDA: [],
  VENCIDA: [],
  CANCELADA: [],
};

/**
 * Aprovar, pausar, retomar, cancelar.
 *
 * ============================================================================
 *  AS TRANSIÇÕES SÃO UMA TABELA, e não uma sequência de `if`.
 *
 *  Sem ela, "reativar uma meta cancelada" é um caminho que ninguém escreveu e
 *  ninguém proibiu — ele só não existe até alguém chamar a rota. Com a tabela,
 *  o conjunto do que é possível está escrito num lugar só e cabe na tela.
 *
 *  ATINGIDA e VENCIDA são terminais de propósito: reabrir uma meta batida
 *  apagaria o fato de ela ter sido batida.
 * ============================================================================
 */
export async function mudarStatus(
  p: {
    organizationId: string;
    goalId: string;
    para: StatusDaMeta;
    autorId: string;
  },
  agora: Date = new Date(),
): Promise<Resultado> {
  const meta = await selecionarUm("crc_goals", {
    colunas: "id,status,titulo",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "id", op: "eq", valor: p.goalId },
    ],
  });
  if (meta === null) return { ok: false, motivo: "Meta não encontrada." };

  const de = String(meta["status"] ?? "RASCUNHO");
  const permitidas = TRANSICOES[de] ?? [];

  if (!permitidas.includes(p.para)) {
    return {
      ok: false,
      motivo:
        permitidas.length === 0
          ? `Uma meta ${de.toLowerCase()} não muda mais de estado.`
          : `Uma meta ${de.toLowerCase()} só pode ir para ${permitidas.join(" ou ").toLowerCase()}.`,
    };
  }

  const mudancas: Linha = { status: p.para, atualizado_em: agora.toISOString() };

  if (p.para === "ATIVA" && de === "RASCUNHO") {
    mudancas["aprovado_por"] = p.autorId;
    mudancas["aprovado_em"] = agora.toISOString();
  }

  await atualizar(
    "crc_goals",
    [
      { coluna: "organization_id", op: "eq", valor: p.organizationId },
      { coluna: "id", op: "eq", valor: p.goalId },
    ],
    mudancas,
  );

  /*
   * APROVAR A META APROVA O PLANO JUNTO.
   *
   * Deixar as ações em PLANEJADA depois de a meta virar ATIVA criaria um estado
   * em que a meta está correndo e nenhuma ação foi autorizada — e o dono acharia
   * que aprovou algo que não vai acontecer.
   */
  if (p.para === "ATIVA" && de === "RASCUNHO") {
    await atualizar(
      "crc_goal_actions",
      [
        { coluna: "organization_id", op: "eq", valor: p.organizationId },
        { coluna: "goal_id", op: "eq", valor: p.goalId },
        { coluna: "status", op: "eq", valor: "PLANEJADA" },
      ],
      { status: "APROVADA", atualizado_em: agora.toISOString() },
    );
  }

  await auditar({
    organizationId: p.organizationId,
    userId: p.autorId,
    ator: "humano",
    acao: `meta_${p.para.toLowerCase()}`,
    entityType: "crc_goals",
    entityId: p.goalId,
    antes: { status: de },
    depois: { status: p.para },
  });

  return { ok: true };
}
