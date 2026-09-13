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
 * SOBRE O CUSTO DAS CONSULTAS, e o estado é MISTO — vale saber qual é qual.
 *
 * `receitaPorMes` e `funilDoPeriodo` já somam no banco (`supabase/41`): uma ida
 * cada, agrupamento em SQL. A primeira era um laço de seis meses lendo 5.000
 * linhas por volta.
 *
 * O RESTO AINDA AGREGA EM MEMÓRIA, com teto de 3.000 linhas: `motivosDePerda`,
 * `speedToLead` e `panoramaDoGestor`. Funciona na casa dos milhares e tem o
 * mesmo defeito silencioso das outras: passando do teto, o número sai MENOR que
 * a realidade sem avisar. O caminho é o mesmo já trilhado — função agregada no
 * Postgres — e o formato de saída daqui não muda por causa disso.
 */
import { somarDinheiro } from "../dominio/formatar";
import { contar, rpc, selecionar, type Filtro, type Linha } from "../servidor/banco";

/* -------------------------------------------------------------------------- */
/* Período                                                                    */
/* -------------------------------------------------------------------------- */

export type Periodo = { de: string; ate: string; rotulo: string };

/**
 * Os últimos N meses, incluindo o corrente.
 *
 * ATENÇÃO AO FUSO, porque esta função e a série de receita já não concordam.
 *
 * Aqui o primeiro dia do mês é calculado em UTC — 21h do último dia do mês
 * anterior em São Paulo. `receitaPorMes` deixou de usar isto e passou a somar
 * pelo `supabase/41`, que agrupa no fuso da clínica.
 *
 * O que sobrou usando esta função são janelas de período que vão para um
 * `where` de intervalo, onde três horas de borda não mudam a leitura. Se algum
 * chamador novo precisar do MÊS como conceito, use `inicioDoMesLocal` de
 * `dominio/dia-local` — senão o número dele vai discordar do relatório.
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
 * O rótulo curto do mês — "set/26".
 *
 * A data vem do banco como `YYYY-MM-DD` já no fuso da clínica. Lê-la com
 * `new Date("2026-09-01")` daria meia-noite UTC e, formatada em pt-BR, poderia
 * voltar um dia — e "ago/26" apareceria onde o banco disse setembro. Por isso
 * o mês é montado a partir dos números da string, sem passar por instante.
 */
function rotuloDoMes(diaIso: string): string {
  const [ano, mes] = diaIso.split("-");
  const n = Number.parseInt(mes ?? "1", 10);
  const curto = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  return `${curto[n - 1] ?? "?"}/${(ano ?? "").slice(2)}`;
}

/**
 * Receita por mês.
 *
 * ============================================================================
 *  ISTO ERA UM LAÇO DE SEIS MESES LENDO 5.000 LINHAS POR VOLTA.
 *
 *  Até trinta mil linhas atravessando a rede, em seis idas ao banco, para
 *  produzir seis pares de soma. E o teto de 5.000 não era só lento: um mês com
 *  mais eventos teria a lista cortada e a receita sairia MENOR que a real, sem
 *  aviso nenhum.
 *
 *  Agora é uma ida, e a soma acontece onde os dados estão. O ganho de fuso vem
 *  junto: o `supabase/41` agrupa por `America/Sao_Paulo`, então o mês do
 *  relatório é o mês que a clínica viveu — e não o mês do servidor, que começa
 *  às 21h do dia anterior.
 * ============================================================================
 */
export async function receitaPorMes(
  organizationId: string,
  meses = 6,
  agora = new Date(),
): Promise<ReceitaDoMes[]> {
  const linhas = await rpc("crc_receita_por_mes", {
    p_organization_id: organizationId,
    p_meses: meses,
    p_agora: agora.toISOString(),
  });

  return linhas.map((l) => ({
    rotulo: rotuloDoMes(String(l["mes"] ?? "")),
    // O Postgres devolve `numeric` como número neste caminho e como string em
    // outros. `String(...)` normaliza os dois antes de o formatador de dinheiro
    // ver o valor — sem isso, um deles vira concatenação de texto.
    confirmada: somarDinheiro([String(l["confirmada"] ?? "0")]),
    potencial: somarDinheiro([String(l["potencial"] ?? "0")]),
    eventos: Number.parseInt(String(l["eventos"] ?? "0"), 10) || 0,
  }));
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
  /*
   * UMA IDA, E NÃO SEIS. Antes eram seis `count(*)` sequenciais — seis viagens
   * ao banco para seis números que uma consulta agrupada devolve de uma vez.
   *
   * A ORDEM CONTINUA AQUI, no código, e isso é deliberado: a conversão de cada
   * etapa é medida contra a ANTERIOR, e essa sequência é decisão de produto.
   * Duplicá-la no SQL criaria duas fontes de verdade que um dia discordam em
   * silêncio.
   */
  const agrupado = await rpc("crc_funil_do_periodo", {
    p_organization_id: organizationId,
    p_de: periodo.de,
    p_ate: periodo.ate,
  });

  const porEtapa = new Map<string, number>(
    agrupado.map((l) => [
      String(l["etapa"] ?? ""),
      Number.parseInt(String(l["quantidade"] ?? "0"), 10) || 0,
    ]),
  );

  const saida: EtapaDoFunil[] = [];
  let anterior: number | null = null;

  for (const etapa of ETAPAS_FUNIL) {
    // Etapa sem nenhum evento não volta do `group by` — e precisa aparecer como
    // zero, senão o funil pula um degrau e a conversão do seguinte é medida
    // contra a etapa errada.
    const quantidade = porEtapa.get(etapa.chave) ?? 0;

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
