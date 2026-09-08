/**
 * Analytics do gestor — Milestone 9, itens 32 a 35 e 59 a 63.
 *
 * A PERGUNTA QUE ESTE MÓDULO RESPONDE: quanto essa operação está recuperando?
 *
 * TRÊS REGRAS QUE ATRAVESSAM O ARQUIVO INTEIRO:
 *
 *   1. O DASHBOARD NÃO PODE MENTIR (item 63). Receita POTENCIAL e receita
 *      CONFIRMADA nunca são somadas no mesmo número, e cada uma sai daqui com o
 *      nome certo. Enquanto não houver registro financeiro, o número grande da
 *      tela é "valor potencial" — porque é o que ele é.
 *
 *   2. RECUPERADO É O QUE TEM CAUSALIDADE (item 62). Só conta como recuperação
 *      o que passou por uma oportunidade de recuperação aberta. Um paciente que
 *      marcou consulta sozinho não entra — inflaria o número e destruiria a
 *      credibilidade do relatório na primeira conferência.
 *
 *   3. NADA É CALCULADO A PARTIR DE SUPOSIÇÃO. Todo número vem de evento
 *      gravado no servidor no instante em que o fato aconteceu
 *      (`crc_funnel_events`, `crc_revenue_events`). O item 59 é explícito sobre
 *      não depender de tracking do navegador — e o evento que mais importa
 *      (o paciente agendou) acontece num worker, sem navegador nenhum.
 *
 * SOBRE O CUSTO DAS CONSULTAS: cada função aqui é uma leitura com filtro de
 * período e um agrupamento em memória. Isso funciona bem até a casa das
 * dezenas de milhares de eventos. Passando disso, o caminho é uma view
 * materializada no Postgres — e o formato de saída aqui não muda por causa
 * disso, que é o motivo de a agregação estar isolada nestas funções.
 */
import { somarDinheiro } from "../dominio/formatar";
import { contar, selecionar, type Filtro, type Linha } from "../servidor/banco";

/* -------------------------------------------------------------------------- */
/* Período                                                                    */
/* -------------------------------------------------------------------------- */

export type Periodo = { de: string; ate: string; rotulo: string };

/**
 * Os últimos N meses, incluindo o corrente.
 *
 * O primeiro dia do mês é calculado em UTC. A clínica opera em -03, então o
 * "mês" do relatório começa às 21h do último dia do mês anterior no horário
 * local. Para um relatório mensal isso é irrelevante — e resolver com fuso
 * completo exigiria trazer a agregação para dentro do Postgres, que é o
 * caminho quando o volume justificar.
 */
export function ultimosMeses(quantidade: number, agora = new Date()): Periodo[] {
  const meses: Periodo[] = [];

  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - i, 1));
    const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1));

    meses.push({
      de: inicio.toISOString(),
      ate: fim.toISOString(),
      rotulo: inicio.toLocaleDateString("pt-BR", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
    });
  }

  return meses;
}

const noPeriodo = (organizationId: string, p: Periodo, coluna = "ocorrido_em"): Filtro[] => [
  { coluna: "organization_id", op: "eq", valor: organizationId },
  { coluna, op: "gte", valor: p.de },
  { coluna, op: "lt", valor: p.ate },
];

function valorDe(linha: Linha, coluna = "valor"): string | null {
  const v = linha[coluna];
  return typeof v === "string" ? v : typeof v === "number" ? v.toFixed(2) : null;
}

/* -------------------------------------------------------------------------- */
/* Receita                                                                    */
/* -------------------------------------------------------------------------- */

export type ReceitaDoMes = {
  rotulo: string;
  /** Já aconteceu: alguém registrou o pagamento. */
  confirmada: string;
  /** Ainda não: orçamento aberto, consulta recuperada sem financeiro. */
  potencial: string;
  eventos: number;
};

/**
 * A série mensal de receita.
 *
 * As duas naturezas vêm SEPARADAS até a tela, e a tela as mostra separadas.
 * Somá-las aqui seria o jeito mais fácil de produzir um número grande e falso.
 */
export async function receitaPorMes(
  organizationId: string,
  meses = 6,
  agora = new Date(),
): Promise<ReceitaDoMes[]> {
  const periodos = ultimosMeses(meses, agora);
  const saida: ReceitaDoMes[] = [];

  for (const p of periodos) {
    const linhas = await selecionar("crc_revenue_events", {
      colunas: "valor,natureza",
      filtros: noPeriodo(organizationId, p),
      limite: 5000,
    });

    saida.push({
      rotulo: p.rotulo,
      confirmada: somarDinheiro(
        linhas.filter((l) => l["natureza"] === "CONFIRMADA").map((l) => valorDe(l)),
      ),
      potencial: somarDinheiro(
        linhas.filter((l) => l["natureza"] !== "CONFIRMADA").map((l) => valorDe(l)),
      ),
      eventos: linhas.length,
    });
  }

  return saida;
}

/* -------------------------------------------------------------------------- */
/* Funil                                                                      */
/* -------------------------------------------------------------------------- */

export type EtapaDoFunil = {
  chave: string;
  rotulo: string;
  quantidade: number;
  /** Conversão em relação à etapa anterior. `null` na primeira. */
  conversao: number | null;
};

/**
 * A ordem do funil, e os rótulos que a tela usa.
 *
 * A sequência importa: a conversão de cada etapa é medida contra a ANTERIOR, e
 * não contra o topo. "Quantos dos que responderam agendaram" é uma pergunta
 * acionável; "quantos dos contatados agendaram" mistura três problemas
 * diferentes num número só.
 */
const ETAPAS_FUNIL: readonly { chave: string; rotulo: string }[] = [
  { chave: "oportunidade_criada", rotulo: "Oportunidades abertas" },
  { chave: "primeiro_contato", rotulo: "Contatadas" },
  { chave: "paciente_respondeu", rotulo: "Responderam" },
  { chave: "consulta_agendada", rotulo: "Agendaram" },
  { chave: "consulta_recuperada", rotulo: "Compareceram" },
  { chave: "oportunidade_ganha", rotulo: "Fecharam" },
];

export async function funilDoPeriodo(
  organizationId: string,
  periodo: Periodo,
): Promise<EtapaDoFunil[]> {
  const saida: EtapaDoFunil[] = [];
  let anterior: number | null = null;

  for (const etapa of ETAPAS_FUNIL) {
    const quantidade = await contar("crc_funnel_events", [
      ...noPeriodo(organizationId, periodo),
      { coluna: "etapa", op: "eq", valor: etapa.chave },
    ]);

    saida.push({
      chave: etapa.chave,
      rotulo: etapa.rotulo,
      quantidade,
      // Divisão por zero vira `null`, e não `0%`: "nenhum dado" e "conversão
      // zero" são coisas diferentes, e a tela precisa poder dizer qual é.
      conversao: anterior !== null && anterior > 0 ? quantidade / anterior : null,
    });

    anterior = quantidade;
  }

  return saida;
}

/* -------------------------------------------------------------------------- */
/* Motivos de perda (item 159)                                                */
/* -------------------------------------------------------------------------- */

export type MotivoDePerda = { motivo: string; quantidade: number; valorPerdido: string };

/**
 * Onde os pacientes estão sendo perdidos.
 *
 * É a pergunta do item 277 que mais muda decisão comercial: se metade das
 * perdas é "preço", o problema é a tabela; se é "não respondeu", o problema é
 * a operação. Sem o motivo obrigatório na hora de fechar, esta consulta
 * devolveria uma coluna de nulos.
 */
export async function motivosDePerda(
  organizationId: string,
  periodo: Periodo,
): Promise<MotivoDePerda[]> {
  const linhas = await selecionar("crc_opportunities", {
    colunas: "lost_reason,potential_value",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "fechada_em", op: "gte", valor: periodo.de },
      { coluna: "fechada_em", op: "lt", valor: periodo.ate },
      { coluna: "lost_reason", op: "not.is", valor: null },
    ],
    limite: 3000,
  });

  const porMotivo = new Map<string, { quantidade: number; valores: (string | null)[] }>();

  for (const l of linhas) {
    const motivo = typeof l["lost_reason"] === "string" ? l["lost_reason"] : "OUTRO";
    const atual = porMotivo.get(motivo) ?? { quantidade: 0, valores: [] };
    atual.quantidade += 1;
    atual.valores.push(valorDe(l, "potential_value"));
    porMotivo.set(motivo, atual);
  }

  return [...porMotivo.entries()]
    .map(([motivo, dados]) => ({
      motivo,
      quantidade: dados.quantidade,
      valorPerdido: somarDinheiro(dados.valores),
    }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

/* -------------------------------------------------------------------------- */
/* Desempenho por automação                                                   */
/* -------------------------------------------------------------------------- */

export type DesempenhoAutomacao = {
  automationId: string;
  nome: string;
  emJornada: number;
  concluidas: number;
  saiuPorConversao: number;
  /** Conversão da automação: saiu porque agendou / total que terminou. */
  taxa: number | null;
};

/**
 * Qual automação funciona.
 *
 * A MÉTRICA É "SAIU PORQUE AGENDOU", e não "mensagens enviadas" — item 261. A
 * diferença não é acadêmica: otimizar volume de envio significa mandar mais
 * mensagem para as mesmas pessoas, que é exatamente o que o item 286 proíbe.
 */
export async function desempenhoPorAutomacao(
  organizationId: string,
  periodo: Periodo,
): Promise<DesempenhoAutomacao[]> {
  const automacoes = await selecionar("crc_automations", {
    colunas: "id,nome",
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
  });

  const saida: DesempenhoAutomacao[] = [];

  for (const a of automacoes) {
    const automationId = String(a["id"] ?? "");
    const base: Filtro[] = [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "automation_id", op: "eq", valor: automationId },
    ];

    const [emJornada, concluidas, converteu] = await Promise.all([
      contar("crc_automation_enrollments", [
        ...base,
        { coluna: "status", op: "in", valor: ["ACTIVE", "WAITING"] },
      ]),
      contar("crc_automation_enrollments", [
        ...base,
        { coluna: "concluido_em", op: "gte", valor: periodo.de },
        { coluna: "concluido_em", op: "lt", valor: periodo.ate },
      ]),
      contar("crc_automation_enrollments", [
        ...base,
        { coluna: "saiu_por", op: "eq", valor: "paciente_agendou" },
        { coluna: "concluido_em", op: "gte", valor: periodo.de },
        { coluna: "concluido_em", op: "lt", valor: periodo.ate },
      ]),
    ]);

    saida.push({
      automationId,
      nome: String(a["nome"] ?? ""),
      emJornada,
      concluidas,
      saiuPorConversao: converteu,
      taxa: concluidas > 0 ? converteu / concluidas : null,
    });
  }

  return saida.sort((a, b) => b.saiuPorConversao - a.saiuPorConversao);
}

/* -------------------------------------------------------------------------- */
/* Desempenho por atendente                                                   */
/* -------------------------------------------------------------------------- */

export type DesempenhoAtendente = {
  userId: string;
  nome: string;
  tarefasConcluidas: number;
  oportunidadesGanhas: number;
  mensagensEnviadas: number;
};

/**
 * O que cada pessoa fez.
 *
 * DELIBERADAMENTE SEM RANKING E SEM META. Este quadro existe para o gestor
 * enxergar carga e distribuição — quem está afogado, quem tem espaço. Virar
 * placar faria a equipe otimizar contagem de tarefa concluída, que é fácil de
 * inflar e não tem relação com paciente recuperado.
 */
export async function desempenhoPorAtendente(
  organizationId: string,
  periodo: Periodo,
): Promise<DesempenhoAtendente[]> {
  const usuarios = await selecionar("crc_users", {
    colunas: "id,nome",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "ativo", op: "eq", valor: true },
    ],
  });

  const saida: DesempenhoAtendente[] = [];

  for (const u of usuarios) {
    const userId = String(u["id"] ?? "");

    const [tarefas, mensagens] = await Promise.all([
      contar("crc_tasks", [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "assigned_to", op: "eq", valor: userId },
        { coluna: "status", op: "eq", valor: "COMPLETED" },
        { coluna: "concluida_em", op: "gte", valor: periodo.de },
        { coluna: "concluida_em", op: "lt", valor: periodo.ate },
      ]),
      contar("crc_messages", [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "autor_id", op: "eq", valor: userId },
        { coluna: "direcao", op: "eq", valor: "SAIDA" },
        { coluna: "criado_em", op: "gte", valor: periodo.de },
        { coluna: "criado_em", op: "lt", valor: periodo.ate },
      ]),
    ]);

    const ganhas = await contar("crc_opportunities", [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "assigned_to", op: "eq", valor: userId },
      { coluna: "fechada_em", op: "gte", valor: periodo.de },
      { coluna: "fechada_em", op: "lt", valor: periodo.ate },
      { coluna: "lost_reason", op: "is", valor: null },
    ]);

    // Quem não fez nada no período não entra: uma linha de zeros para o
    // dentista que nem usa o CRC só polui o quadro.
    if (tarefas + mensagens + ganhas === 0) continue;

    saida.push({
      userId,
      nome: String(u["nome"] ?? ""),
      tarefasConcluidas: tarefas,
      oportunidadesGanhas: ganhas,
      mensagensEnviadas: mensagens,
    });
  }

  return saida.sort((a, b) => b.tarefasConcluidas - a.tarefasConcluidas);
}

/* -------------------------------------------------------------------------- */
/* Speed to lead (itens 157, 158)                                             */
/* -------------------------------------------------------------------------- */

export type SpeedToLead = {
  leads: number;
  respondidos: number;
  /** Mediana em minutos. `null` quando ninguém foi respondido no período. */
  medianaMinutos: number | null;
  /** Quantos foram respondidos em até 5 minutos. */
  ateCincoMinutos: number;
};

/**
 * Quanto tempo a clínica leva para responder um lead novo.
 *
 * USA MEDIANA, E NÃO MÉDIA, de propósito: um único lead esquecido por três dias
 * levanta a média a ponto de esconder que o resto foi respondido em minutos. A
 * mediana diz como é o caso típico, que é a pergunta que o gestor está fazendo.
 *
 * O número de respondidos em até 5 minutos vai junto porque é o que mais
 * importa em tráfego pago — e uma mediana boa com poucos "abaixo de 5" ainda é
 * um problema.
 */
export async function speedToLead(organizationId: string, periodo: Periodo): Promise<SpeedToLead> {
  const linhas = await selecionar("crc_leads", {
    colunas: "criado_em,primeira_resposta_em",
    filtros: noPeriodo(organizationId, periodo, "criado_em"),
    limite: 3000,
  });

  const minutos: number[] = [];
  for (const l of linhas) {
    const criado = typeof l["criado_em"] === "string" ? Date.parse(l["criado_em"]) : NaN;
    const respondido =
      typeof l["primeira_resposta_em"] === "string" ? Date.parse(l["primeira_resposta_em"]) : NaN;
    if (!Number.isFinite(criado) || !Number.isFinite(respondido)) continue;
    minutos.push((respondido - criado) / 60_000);
  }

  minutos.sort((a, b) => a - b);
  const meio = Math.floor(minutos.length / 2);

  return {
    leads: linhas.length,
    respondidos: minutos.length,
    medianaMinutos:
      minutos.length === 0
        ? null
        : minutos.length % 2 === 1
          ? Math.round(minutos[meio] ?? 0)
          : Math.round(((minutos[meio - 1] ?? 0) + (minutos[meio] ?? 0)) / 2),
    ateCincoMinutos: minutos.filter((m) => m <= 5).length,
  };
}

/* -------------------------------------------------------------------------- */
/* Panorama                                                                   */
/* -------------------------------------------------------------------------- */

export type PanoramaGestor = {
  periodo: string;
  receitaConfirmada: string;
  valorPotencial: string;
  /** `true` quando ainda não há nenhum registro financeiro confirmado. */
  semFinanceiroConfirmado: boolean;
  consultasRecuperadas: number;
  pacientesReativados: number;
  oportunidadesAbertas: number;
  valorEmAberto: string;
  serieReceita: ReceitaDoMes[];
  funil: EtapaDoFunil[];
  perdas: MotivoDePerda[];
  automacoes: DesempenhoAutomacao[];
  atendentes: DesempenhoAtendente[];
  lead: SpeedToLead;
};

/**
 * Tudo que a tela do gestor precisa, numa chamada.
 *
 * Uma chamada só porque a tela mostra tudo junto: seis idas ao servidor
 * fariam os blocos aparecerem em ordem aleatória, e o relatório pareceria
 * instável mesmo estando certo.
 */
export async function panoramaDoGestor(
  organizationId: string,
  agora = new Date(),
): Promise<PanoramaGestor> {
  const meses = ultimosMeses(6, agora);
  const atual = meses[meses.length - 1];
  if (atual === undefined) throw new Error("Período inválido.");

  const [serieReceita, funil, perdas, automacoes, atendentes, lead] = await Promise.all([
    receitaPorMes(organizationId, 6, agora),
    funilDoPeriodo(organizationId, atual),
    motivosDePerda(organizationId, atual),
    desempenhoPorAutomacao(organizationId, atual),
    desempenhoPorAtendente(organizationId, atual),
    speedToLead(organizationId, atual),
  ]);

  const doMes = serieReceita[serieReceita.length - 1];

  const abertas = await selecionar("crc_opportunities", {
    colunas: "potential_value",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "fechada_em", op: "is", valor: null },
    ],
    limite: 3000,
  });

  const recuperadas = await selecionar("crc_funnel_events", {
    colunas: "patient_id",
    filtros: [
      ...noPeriodo(organizationId, atual),
      { coluna: "etapa", op: "eq", valor: "consulta_recuperada" },
    ],
    limite: 3000,
  });

  const confirmada = doMes?.confirmada ?? "0.00";

  return {
    periodo: atual.rotulo,
    receitaConfirmada: confirmada,
    valorPotencial: doMes?.potencial ?? "0.00",
    // A tela usa isto para escolher o RÓTULO do número grande. Item 63: sem
    // financeiro confirmado, ele não pode se chamar "receita".
    semFinanceiroConfirmado: Number.parseFloat(confirmada) <= 0,
    consultasRecuperadas: recuperadas.length,
    pacientesReativados: new Set(
      recuperadas.map((r) => String(r["patient_id"] ?? "")).filter((x) => x.length > 0),
    ).size,
    oportunidadesAbertas: abertas.length,
    valorEmAberto: somarDinheiro(abertas.map((o) => valorDe(o, "potential_value"))),
    serieReceita,
    funil,
    perdas,
    automacoes,
    atendentes,
    lead,
  };
}
