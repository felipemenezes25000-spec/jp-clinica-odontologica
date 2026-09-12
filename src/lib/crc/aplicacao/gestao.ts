/**
 * Gestão — o serviço.
 *
 * ============================================================================
 *  TUDO AQUI É LEITURA E CONTA. Nenhuma função deste arquivo escreve no banco
 *  nem fala com ninguém.
 *
 *  É a diferença entre este módulo e os outros da FASE F e G: reputação e
 *  experimento AGEM; gestão apenas OLHA. Um módulo de gestão que age é um
 *  módulo que vai agir sobre a própria métrica.
 * ============================================================================
 */
import {
  acharAnomalias,
  lerCapacidade,
  montarBriefing,
  type Anomalia,
  type Briefing,
  type Cenario,
  type LeituraDeCapacidade,
  type NumerosDoDia,
  type Serie,
} from "../dominio/gestao";
import { contar, selecionar, type Filtro } from "../servidor/banco";

/* -------------------------------------------------------------------------- */
/* As janelas                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Sete dias recentes contra vinte e oito anteriores.
 *
 * ============================================================================
 *  A BASE É DE QUATRO SEMANAS, e não de uma.
 *
 *  Comparar esta semana com a passada faz toda comparação depender de um par de
 *  eventos: um feriado na semana passada vira "as faltas dobraram" nesta. Com
 *  quatro semanas, um feriado dilui.
 *
 *  E as duas janelas terminam no MESMO instante, sem sobreposição: a base vai
 *  de -35 a -7 dias, e o recente de -7 a agora.
 * ============================================================================
 */
export const DIAS_RECENTE = 7;
export const DIAS_BASE = 28;

function janelas(agora: Date): { inicioRecente: string; inicioBase: string; fimBase: string } {
  const inicioRecente = new Date(agora.getTime() - DIAS_RECENTE * 86_400_000);
  const fimBase = inicioRecente;
  const inicioBase = new Date(fimBase.getTime() - DIAS_BASE * 86_400_000);

  return {
    inicioRecente: inicioRecente.toISOString(),
    inicioBase: inicioBase.toISOString(),
    fimBase: fimBase.toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Anomalias                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * O que mudou nas últimas semanas.
 *
 * AS CONTAGENS SÃO `HEAD` COM `count=exact`, e não leituras. Cada série custa
 * duas contagens; ler as linhas para contá-las traria milhares de registros
 * para produzir um inteiro.
 */
export async function detectarAnomalias(
  organizationId: string,
  clinicIds: readonly string[] | null,
  agora: Date = new Date(),
): Promise<Anomalia[]> {
  if (clinicIds !== null && clinicIds.length === 0) return [];

  const j = janelas(agora);

  const escopo = (coluna: string): Filtro[] => {
    const f: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];
    if (clinicIds !== null) f.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });
    void coluna;
    return f;
  };

  const contarJanela = async (
    tabela: "crc_appointments" | "crc_leads" | "crc_conversations",
    coluna: string,
    extras: Filtro[],
    de: string,
    ate: string | null,
  ): Promise<number> => {
    const f: Filtro[] = [...escopo(coluna), ...extras, { coluna, op: "gte", valor: de }];
    if (ate !== null) f.push({ coluna, op: "lt", valor: ate });
    return contar(tabela, f);
  };

  const series: Serie[] = [];

  const adicionar = async (
    chave: string,
    rotulo: string,
    tabela: "crc_appointments" | "crc_leads" | "crc_conversations",
    coluna: string,
    extras: Filtro[],
    subirEhRuim: boolean,
  ): Promise<void> => {
    const [recente, base] = await Promise.all([
      contarJanela(tabela, coluna, extras, j.inicioRecente, null),
      contarJanela(tabela, coluna, extras, j.inicioBase, j.fimBase),
    ]);

    series.push({
      chave,
      rotulo,
      recente,
      base,
      diasRecente: DIAS_RECENTE,
      diasBase: DIAS_BASE,
      subirEhRuim,
    });
  };

  await adicionar(
    "faltas",
    "Faltas",
    "crc_appointments",
    "inicio_em",
    [{ coluna: "status", op: "eq", valor: "MISSED" }],
    true,
  );
  await adicionar(
    "cancelamentos",
    "Cancelamentos",
    "crc_appointments",
    "inicio_em",
    [{ coluna: "status", op: "eq", valor: "CANCELLED" }],
    true,
  );
  await adicionar(
    "concluidas",
    "Consultas realizadas",
    "crc_appointments",
    "inicio_em",
    [{ coluna: "status", op: "eq", valor: "COMPLETED" }],
    false,
  );
  await adicionar("leads", "Leads novos", "crc_leads", "criado_em", [], false);

  return acharAnomalias(series);
}

/* -------------------------------------------------------------------------- */
/* Capacidade                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Quanto da janela de cada dentista virou atendimento.
 *
 * ============================================================================
 *  A JANELA É CALCULADA POR DIA, e somada depois.
 *
 *  Somar "da primeira à última consulta do PERÍODO" daria a distância entre
 *  segunda de manhã e sexta à noite — que inclui as noites e o fim de semana.
 *  Por dia, a janela é o expediente real daquele dia.
 * ============================================================================
 */
export async function lerCapacidades(
  organizationId: string,
  clinicIds: readonly string[] | null,
  agora: Date = new Date(),
): Promise<LeituraDeCapacidade[]> {
  if (clinicIds !== null && clinicIds.length === 0) return [];

  const desde = new Date(agora.getTime() - 28 * 86_400_000).toISOString();

  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "inicio_em", op: "gte", valor: desde },
    { coluna: "inicio_em", op: "lte", valor: agora.toISOString() },
    { coluna: "status", op: "in", valor: ["COMPLETED", "CONFIRMED", "IN_PROGRESS"] },
  ];
  if (clinicIds !== null) filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  const consultas = await selecionar<{
    dentista_externo_id: string | null;
    dentista_nome: string | null;
    inicio_em: string;
    fim_em: string | null;
  }>("crc_appointments", {
    colunas: "dentista_externo_id,dentista_nome,inicio_em,fim_em",
    filtros,
    limite: 5000,
  });

  type Acc = {
    nome: string;
    ocupados: number;
    porDia: Map<string, { primeiro: number; ultimo: number }>;
  };
  const porDentista = new Map<string, Acc>();

  for (const c of consultas) {
    const id = c.dentista_externo_id;
    if (id === null) continue;

    const inicio = Date.parse(c.inicio_em);
    const fim = c.fim_em === null ? inicio + 60 * 60_000 : Date.parse(c.fim_em);
    if (!Number.isFinite(inicio) || !Number.isFinite(fim)) continue;

    const a = porDentista.get(id) ?? {
      nome: c.dentista_nome ?? "Sem nome",
      ocupados: 0,
      porDia: new Map<string, { primeiro: number; ultimo: number }>(),
    };

    a.ocupados += Math.max(0, (fim - inicio) / 60_000);

    const dia = c.inicio_em.slice(0, 10);
    const janela = a.porDia.get(dia) ?? { primeiro: inicio, ultimo: fim };
    janela.primeiro = Math.min(janela.primeiro, inicio);
    janela.ultimo = Math.max(janela.ultimo, fim);
    a.porDia.set(dia, janela);

    porDentista.set(id, a);
  }

  const leituras: LeituraDeCapacidade[] = [];

  for (const [id, a] of porDentista) {
    let minutosDeJanela = 0;
    for (const j of a.porDia.values()) {
      minutosDeJanela += Math.max(0, (j.ultimo - j.primeiro) / 60_000);
    }

    leituras.push(
      lerCapacidade({
        dentistId: id,
        nome: a.nome,
        minutosOcupados: Math.round(a.ocupados),
        minutosDeJanela: Math.round(minutosDeJanela),
        diasTrabalhados: a.porDia.size,
      }),
    );
  }

  // O mais ocioso primeiro: é onde há o que fazer.
  return leituras.sort((x, y) => x.ocupacao - y.ocupacao);
}

/* -------------------------------------------------------------------------- */
/* O cenário do simulador                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O ponto de partida da simulação, medido — não digitado.
 *
 * ============================================================================
 *  A OCUPAÇÃO E A TAXA DE FALTA SAEM DOS DADOS, e nunca de um campo do
 *  formulário.
 *
 *  Se a tela deixasse a pessoa digitar a ocupação atual, o simulador viraria um
 *  gerador de números bonitos: bastaria escrever 95% para o resultado ficar
 *  ótimo. O que ela escolhe é o CENÁRIO — quantas horas a mais, a quanto vale a
 *  hora de cadeira dela. O ponto de partida é medição.
 *
 *  `valorPorHora` é a única entrada de fora, porque ele não está no banco:
 *  depende do mix de procedimentos, que o CRC não conhece. Ele entra como
 *  premissa declarada, e a simulação devolve isso escrito.
 * ============================================================================
 */
export async function medirCenario(
  organizationId: string,
  clinicIds: readonly string[] | null,
  valorPorHora: number,
  agora: Date = new Date(),
): Promise<Cenario> {
  // Mesma guarda dos outros: lista vazia é "nenhuma clínica alcançada", e não
  // "todas". Sem ela, o `in.()` do PostgREST decidiria isso por acidente.
  if (clinicIds !== null && clinicIds.length === 0) {
    return { ocupacaoAtual: 0, horasPorSemana: 40, valorPorHora, taxaDeFalta: 0 };
  }

  const capacidades = await lerCapacidades(organizationId, clinicIds, agora);

  /*
   * MÉDIA SIMPLES ENTRE DENTISTAS, e não ponderada por volume.
   *
   * Ponderar por volume faria o dentista mais cheio dominar a média — e é
   * justamente o mais vazio que a simulação quer olhar. Aqui cada agenda conta
   * uma vez.
   */
  const ocupacaoAtual =
    capacidades.length === 0
      ? 0
      : capacidades.reduce((s, c) => s + c.ocupacao, 0) / capacidades.length;

  const escopo: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];
  if (clinicIds !== null) escopo.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  // Noventa dias: janela larga o bastante para a taxa de falta não oscilar com
  // uma semana ruim, e curta o bastante para refletir a clínica de hoje.
  const desde = new Date(agora.getTime() - 90 * 86_400_000).toISOString();
  const janela: Filtro[] = [
    ...escopo,
    { coluna: "inicio_em", op: "gte", valor: desde },
    { coluna: "inicio_em", op: "lte", valor: agora.toISOString() },
  ];

  const [faltas, compareceram] = await Promise.all([
    contar("crc_appointments", [...janela, { coluna: "status", op: "eq", valor: "MISSED" }]),
    contar("crc_appointments", [...janela, { coluna: "status", op: "eq", valor: "COMPLETED" }]),
  ]);

  /*
   * O DENOMINADOR É FALTA + COMPARECIMENTO, e não toda consulta marcada.
   *
   * Cancelamento com aviso não é falta: a cadeira dá tempo de ser reocupada.
   * Contá-lo no denominador afundaria a taxa; contá-lo no numerador a inflaria.
   * Ele fica fora dos dois lados — o que a simulação quer saber é quantas das
   * horas efetivamente reservadas viraram atendimento.
   */
  const decididas = faltas + compareceram;

  return {
    ocupacaoAtual,
    horasPorSemana: 40,
    valorPorHora,
    taxaDeFalta: decididas === 0 ? 0 : faltas / decididas,
  };
}

/* -------------------------------------------------------------------------- */
/* O briefing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * O resumo da manhã, com os números de verdade.
 *
 * ============================================================================
 *  OS NÚMEROS VÊM DOS MÓDULOS QUE JÁ EXISTEM, e não de consultas novas.
 *
 *  `receitaEsperada` é o total do Radar; `horasVagas` vem da agenda
 *  inteligente; `aceitosSemData` do funil de aceitação. Recalcular aqui
 *  produziria uma segunda versão de cada número — e no dia em que as duas
 *  divergissem, ninguém saberia qual está certa.
 * ============================================================================
 */
export async function briefingDoDia(
  organizationId: string,
  clinicIds: readonly string[] | null,
  saudacao: string,
  agora: Date = new Date(),
): Promise<Briefing> {
  if (clinicIds !== null && clinicIds.length === 0) {
    return montarBriefing(
      {
        horasVagas: 0,
        receitaEsperada: 0,
        emRisco: 0,
        conversasEsperando: 0,
        aceitosSemData: 0,
        pendenciasHumanas: 0,
        tarefasAbertas: 0,
      },
      [],
      saudacao,
    );
  }

  const { resumoDasClinicas } = await import("./radar");
  const { listarBuracos } = await import("./agenda-inteligente");
  const { listarFunil } = await import("./aceitacao");
  const { listarPendencias } = await import("./financeiro");

  const escopo: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];
  if (clinicIds !== null) escopo.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  const [radar, buracos, funil, pendencias, conversas, tarefas, anomalias] = await Promise.all([
    resumoDasClinicas(organizationId, clinicIds ?? []),
    listarBuracos(organizationId, clinicIds, agora),
    listarFunil(organizationId, clinicIds, agora),
    listarPendencias(organizationId, clinicIds),
    contar("crc_conversations", [
      ...escopo,
      { coluna: "status", op: "eq", valor: "ABERTA" },
      { coluna: "nao_lidas", op: "gt", valor: 0 },
    ]),
    contar("crc_tasks", [...escopo, { coluna: "status", op: "eq", valor: "OPEN" }]),
    detectarAnomalias(organizationId, clinicIds, agora),
  ]);

  const emRisco = await contar("crc_appointments", [
    ...escopo,
    { coluna: "risco_falta", op: "eq", valor: "ALTO" },
    { coluna: "inicio_em", op: "gt", valor: agora.toISOString() },
    {
      coluna: "inicio_em",
      op: "lte",
      valor: new Date(agora.getTime() + 7 * 86_400_000).toISOString(),
    },
  ]);

  const numeros: NumerosDoDia = {
    horasVagas: buracos.length,
    receitaEsperada: radar.totalEsperado,
    emRisco,
    conversasEsperando: conversas,
    aceitosSemData: funil.filter((f) => f.etapa === "ACCEPTED").length,
    // SÓ AS QUE EXIGEM GENTE. As que a automação resolve não são trabalho de
    // ninguém — listá-las faria a manhã começar com uma lista que não é sua.
    pendenciasHumanas: pendencias.filter((p) => p.resolveQuem === "humano").length,
    tarefasAbertas: tarefas,
  };

  return montarBriefing(numeros, anomalias, saudacao);
}
