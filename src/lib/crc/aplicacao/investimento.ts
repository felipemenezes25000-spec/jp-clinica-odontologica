/**
 * Quanto custou cada paciente que sentou na cadeira.
 *
 * O SISTEMA JÁ SABIA METADE DISSO. `crc_leads` guarda utm_campaign, gclid e
 * fbclid desde o primeiro clique, e o funil já contava quem respondeu, quem
 * agendou e quem compareceu. Faltava o outro lado da divisão: o gasto.
 *
 * A CONTA QUE INTERESSA NÃO É "custo por lead". É **custo por paciente que
 * apareceu**. Um anúncio que traz cem contatos baratos e nenhum comparecimento
 * é mais caro que um que traz dez caros e cinco na cadeira — e só a segunda
 * conta enxerga isso. Por isso a cadeia inteira vai junto na tela, e o número
 * em negrito é o do fim.
 *
 * DUAS HONESTIDADES QUE ESTE ARQUIVO PRECISA MANTER:
 *
 *   ATRIBUIÇÃO É APROXIMAÇÃO, e a tela diz. O lead de hoje pode comparecer em
 *   três semanas, e nesse dia o gasto do mês passado é que o trouxe. Aqui o
 *   corte é por mês de CHEGADA do lead — o mais simples de explicar e o único
 *   que não muda de resposta dependendo de quando se olha.
 *
 *   SEM GASTO LANÇADO, NÃO INVENTA CUSTO. Devolve `null` e a tela mostra "—".
 *   Um custo por paciente calculado sobre investimento zero seria R$ 0,00, que
 *   é a leitura mais perigosa possível.
 */
import { contar, gravar, selecionar, type Filtro } from "../servidor/banco";
import { auditar } from "../servidor/registro";

import type { Periodo } from "./analytics";

/** Os canais que a clínica usa. Lista fechada: canal digitado à mão vira grupo órfão no relatório. */
export const CANAIS = ["GOOGLE", "META", "OUTRO"] as const;
export type CanalInvestimento = (typeof CANAIS)[number];

export function ehCanal(bruto: string): bruto is CanalInvestimento {
  return (CANAIS as readonly string[]).includes(bruto);
}

export type Lancamento = {
  id: string;
  mes: string;
  campanha: string;
  canal: CanalInvestimento;
  valor: string;
  observacao: string | null;
};

/** O dia 1 do mês a que uma data pertence, em `AAAA-MM-DD`. */
export function primeiroDiaDoMes(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})/u.exec(iso.trim());
  if (m === null) return null;
  const [, ano, mes] = m;
  if (ano === undefined || mes === undefined) return null;
  const n = Number.parseInt(mes, 10);
  if (!Number.isFinite(n) || n < 1 || n > 12) return null;
  return `${ano}-${mes}-01`;
}

/**
 * Normaliza o nome da campanha para casar com `utm_campaign`.
 *
 * Minúsculas e sem espaço nas pontas, porque o parâmetro de URL chega de
 * qualquer jeito: `Implantes`, `implantes ` e `IMPLANTES` são a mesma campanha,
 * e três linhas separadas no relatório seriam três respostas para uma pergunta.
 */
export function normalizarCampanha(bruto: string): string {
  const limpo = bruto.trim().toLowerCase().replace(/\s+/gu, " ").slice(0, 120);
  return limpo.length === 0 ? "geral" : limpo;
}

/* -------------------------------------------------------------------------- */
/* Lançamentos                                                                */
/* -------------------------------------------------------------------------- */

export async function listarLancamentos(
  organizationId: string,
  limite = 60,
): Promise<Lancamento[]> {
  const linhas = await selecionar("crc_ad_spend", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [
      { coluna: "mes", ascendente: false },
      { coluna: "campanha", ascendente: true },
    ],
    limite,
  });

  return linhas.map((l) => {
    const canal = String(l["canal"] ?? "OUTRO");
    return {
      id: String(l["id"] ?? ""),
      mes: String(l["mes"] ?? "").slice(0, 10),
      campanha: String(l["campanha"] ?? "geral"),
      canal: ehCanal(canal) ? canal : "OUTRO",
      valor: String(l["valor"] ?? "0"),
      observacao: typeof l["observacao"] === "string" ? l["observacao"] : null,
    };
  });
}

export type ResultadoLancamento = { ok: true } | { ok: false; motivo: string };

/**
 * Lança, ou ATUALIZA quando o mês e a campanha se repetem.
 *
 * O upsert é o índice do 05. Sem ele, corrigir um lançamento somaria uma
 * segunda linha e o custo por paciente cairia pela metade sem ninguém entender
 * por quê — o pior tipo de erro num relatório: silencioso e plausível.
 */
export async function lancarInvestimento(dados: {
  organizationId: string;
  mes: string;
  campanha: string;
  canal: string;
  valor: number;
  observacao: string;
  autorId: string;
}): Promise<ResultadoLancamento> {
  const mes = primeiroDiaDoMes(dados.mes);
  if (mes === null) return { ok: false, motivo: "Mês inválido." };

  if (!Number.isFinite(dados.valor) || dados.valor < 0) {
    return { ok: false, motivo: "O valor precisa ser um número igual ou maior que zero." };
  }

  const canal = ehCanal(dados.canal) ? dados.canal : "OUTRO";
  const campanha = normalizarCampanha(dados.campanha);
  const observacao = dados.observacao.trim().slice(0, 200);

  await gravar(
    "crc_ad_spend",
    {
      organization_id: dados.organizationId,
      mes,
      campanha,
      canal,
      valor: dados.valor.toFixed(2),
      observacao: observacao.length > 0 ? observacao : null,
      atualizado_por: dados.autorId,
      atualizado_em: new Date().toISOString(),
    },
    "organization_id,mes,campanha",
  );

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.autorId,
    ator: "humano",
    acao: "investimento.lancado",
    entityType: "ad_spend",
    entityId: `${mes}:${campanha}`,
    depois: { mes, campanha, canal, valor: dados.valor.toFixed(2) },
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* A conta                                                                    */
/* -------------------------------------------------------------------------- */

export type CustoPorEtapa = {
  chave: string;
  rotulo: string;
  quantidade: number;
  /** `null` quando não há investimento lançado, ou quando ninguém chegou aqui. */
  custoUnitario: string | null;
};

export type CustoPorCampanha = {
  campanha: string;
  investido: string;
  leads: number;
  compareceram: number;
  custoPorPaciente: string | null;
};

export type PanoramaDeInvestimento = {
  investido: string;
  temInvestimento: boolean;
  etapas: CustoPorEtapa[];
  campanhas: CustoPorCampanha[];
};

function moeda(valor: number): string {
  return valor.toFixed(2);
}

function dividir(investido: number, quantidade: number): string | null {
  if (investido <= 0 || quantidade <= 0) return null;
  return moeda(investido / quantidade);
}

const noPeriodo = (organizationId: string, periodo: Periodo): Filtro[] => [
  { coluna: "organization_id", op: "eq", valor: organizationId },
  { coluna: "criado_em", op: "gte", valor: periodo.de },
  { coluna: "criado_em", op: "lt", valor: periodo.ate },
];

/**
 * A cadeia inteira, do gasto ao paciente na cadeira.
 *
 * As etapas vêm de `crc_leads` e de `crc_funnel_events`, e não de estimativa:
 * cada número é uma contagem. O que é aproximação — e está dito no cabeçalho —
 * é a ATRIBUIÇÃO: o corte é por mês de chegada do lead.
 */
export async function panoramaDeInvestimento(
  organizationId: string,
  periodo: Periodo,
): Promise<PanoramaDeInvestimento> {
  const mes = primeiroDiaDoMes(periodo.de) ?? periodo.de.slice(0, 10);

  const lancamentos = await selecionar("crc_ad_spend", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "mes", op: "eq", valor: mes },
    ],
    limite: 200,
  });

  const investidoPorCampanha = new Map<string, number>();
  let investido = 0;
  for (const l of lancamentos) {
    const v = Number.parseFloat(String(l["valor"] ?? "0"));
    if (!Number.isFinite(v)) continue;
    investido += v;
    const campanha = String(l["campanha"] ?? "geral");
    investidoPorCampanha.set(campanha, (investidoPorCampanha.get(campanha) ?? 0) + v);
  }

  const leads = await selecionar("crc_leads", {
    colunas: "id,utm_campaign,primeira_resposta_em",
    filtros: noPeriodo(organizationId, periodo),
    limite: 5000,
  });

  const responderam = leads.filter((l) => typeof l["primeira_resposta_em"] === "string").length;

  // Agendaram e compareceram vêm do funil, que é contado no momento em que o
  // fato acontece — e não recalculado depois a partir do estado atual.
  const [agendaram, compareceram] = await Promise.all([
    contar("crc_funnel_events", [
      ...noPeriodo(organizationId, periodo),
      { coluna: "etapa", op: "eq", valor: "consulta_agendada" },
    ]),
    contar("crc_funnel_events", [
      ...noPeriodo(organizationId, periodo),
      { coluna: "etapa", op: "eq", valor: "consulta_recuperada" },
    ]),
  ]);

  const etapas: CustoPorEtapa[] = [
    {
      chave: "contatos",
      rotulo: "Viraram contato",
      quantidade: leads.length,
      custoUnitario: dividir(investido, leads.length),
    },
    {
      chave: "responderam",
      rotulo: "Responderam",
      quantidade: responderam,
      custoUnitario: dividir(investido, responderam),
    },
    {
      chave: "agendaram",
      rotulo: "Marcaram avaliação",
      quantidade: agendaram,
      custoUnitario: dividir(investido, agendaram),
    },
    {
      chave: "compareceram",
      rotulo: "Compareceram na clínica",
      quantidade: compareceram,
      custoUnitario: dividir(investido, compareceram),
    },
  ];

  // Por campanha, o comparecimento é atribuído pelo lead que o originou. Um
  // lead sem `utm_campaign` cai em "geral", junto com o gasto sem campanha.
  const leadsPorCampanha = new Map<string, number>();
  for (const l of leads) {
    const c = normalizarCampanha(String(l["utm_campaign"] ?? ""));
    leadsPorCampanha.set(c, (leadsPorCampanha.get(c) ?? 0) + 1);
  }

  const nomes = new Set([...investidoPorCampanha.keys(), ...leadsPorCampanha.keys()]);
  const campanhas: CustoPorCampanha[] = [...nomes]
    .map((campanha) => {
      const gasto = investidoPorCampanha.get(campanha) ?? 0;
      const qtdLeads = leadsPorCampanha.get(campanha) ?? 0;
      // O comparecimento por campanha é rateado pela participação em leads:
      // ligar cada `consulta_recuperada` ao lead exigiria carregar a cadeia
      // oportunidade→lead de cada evento, e o ganho de precisão não paga o
      // custo. A tela chama isso de estimativa — e o total, não.
      const proporcao = leads.length > 0 ? qtdLeads / leads.length : 0;
      const compareceramNaCampanha = Math.round(compareceram * proporcao);
      return {
        campanha,
        investido: moeda(gasto),
        leads: qtdLeads,
        compareceram: compareceramNaCampanha,
        custoPorPaciente: dividir(gasto, compareceramNaCampanha),
      };
    })
    .sort((a, b) => Number.parseFloat(b.investido) - Number.parseFloat(a.investido));

  return {
    investido: moeda(investido),
    temInvestimento: investido > 0,
    etapas,
    campanhas,
  };
}
