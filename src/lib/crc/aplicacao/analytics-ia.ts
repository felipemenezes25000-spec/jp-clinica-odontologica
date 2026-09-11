/**
 * Analytics de IA — Fase I.
 *
 * A PERGUNTA QUE ESTE MÓDULO RESPONDE não é "quantos turnos rodaram". É a que
 * decide se a flag de envio pode ser ligada: **o agente está sendo bom o
 * bastante, e a que custo?**
 *
 * AS QUATRO MÉTRICAS, e por que cada uma existe:
 *
 *   TAXA DE ENTREGA      de cada 100 turnos, quantos viraram resposta ao
 *                        paciente. Baixa demais significa um agente que roda,
 *                        gasta e não serve.
 *
 *   TAXA DE HANDOFF      quantos foram para uma pessoa. Aqui não existe "bom"
 *                        absoluto: 0% é suspeito (o agente está respondendo o
 *                        que não devia) e 80% também (não está respondendo
 *                        nada). Ver `lerTaxaDeHandoff`.
 *
 *   CUSTO POR TURNO      o número que decide se isto se paga.
 *
 *   PORTÕES QUE BARRARAM quais travas estão disparando. É a única métrica desta
 *                        lista que aponta para uma CAUSA, e não para um sintoma.
 *
 * ========================================================================
 *  O QUE ESTE ARQUIVO NÃO FAZ: média de qualidade autoavaliada pelo modelo.
 *
 *  O supervisor dá nota ao próprio turno, e essa nota é útil para achar
 *  conversas para revisar à mão. Ela NÃO é métrica de qualidade: é o sistema
 *  se avaliando. Promovê-la a indicador de painel seria escolher o número
 *  mais bonito e menos confiável que existe aqui.
 * ========================================================================
 */
import { contar, selecionar } from "../servidor/banco";

export type JanelaDeAnalise = {
  organizationId: string;
  de: Date;
  ate: Date;
};

export type MetricasDeIa = {
  turnos: number;
  /** Quantos terminaram com mensagem ao paciente. */
  entregues: number;
  /** Quantos viraram caso humano. */
  humanos: number;
  /** Quantos terminaram sem ação — dono humano, opt-out, duplicata. */
  semAcao: number;
  /** Quantos falharam de forma recuperável. */
  falhas: number;
  taxaDeEntrega: number;
  taxaDeHandoff: number;
  taxaDeFalha: number;
  /** Custo total no período, em reais. */
  custoTotal: number;
  custoPorTurno: number;
  /** Quais portões barraram, do mais frequente ao menos. */
  portoes: { codigo: string; vezes: number }[];
};

export async function metricasDeIa(janela: JanelaDeAnalise): Promise<MetricasDeIa> {
  const linhas = await selecionar("crc_ai_runs", {
    colunas: "resultado,portao_bloqueou,custo_estimado",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: janela.organizationId },
      { coluna: "criado_em", op: "gte", valor: janela.de.toISOString() },
      { coluna: "criado_em", op: "lt", valor: janela.ate.toISOString() },
    ],
    // Mil é o teto de leitura de um painel. Acima disso a pergunta deixa de ser
    // "como foi o mês" e passa a ser um relatório, que tem outro caminho.
    limite: 1000,
  }).catch(() => []);

  let entregues = 0;
  let humanos = 0;
  let semAcao = 0;
  let falhas = 0;
  let custoTotal = 0;
  const portoes = new Map<string, number>();

  for (const l of linhas) {
    const r = String(l["resultado"] ?? "");
    if (r === "enviado") entregues += 1;
    else if (r === "humano") humanos += 1;
    else if (r === "sem_acao") semAcao += 1;
    else if (r === "falha_segura") falhas += 1;

    const custo = Number(l["custo_estimado"] ?? 0);
    if (Number.isFinite(custo)) custoTotal += custo;

    const portao = l["portao_bloqueou"];
    if (typeof portao === "string" && portao.length > 0) {
      portoes.set(portao, (portoes.get(portao) ?? 0) + 1);
    }
  }

  /*
   * AS RUNS `RODANDO` FICAM DE FORA DO DENOMINADOR.
   *
   * Desde a Fase B a run nasce ANTES da chamada de modelo. Uma run aberta é um
   * turno que ainda não terminou — ou cujo worker morreu. Contá-la como turno
   * concluído baixaria a taxa de entrega por um motivo que não é qualidade, e a
   * queda apareceria justo durante um incidente, somando confusão a incidente.
   *
   * Quem cuida delas é o painel de saúde da Fase F.
   */
  const turnos = entregues + humanos + semAcao + falhas;

  return {
    turnos,
    entregues,
    humanos,
    semAcao,
    falhas,
    taxaDeEntrega: turnos === 0 ? 0 : entregues / turnos,
    taxaDeHandoff: turnos === 0 ? 0 : humanos / turnos,
    taxaDeFalha: turnos === 0 ? 0 : falhas / turnos,
    custoTotal,
    custoPorTurno: turnos === 0 ? 0 : custoTotal / turnos,
    portoes: [...portoes.entries()]
      .map(([codigo, vezes]) => ({ codigo, vezes }))
      .sort((a, b) => b.vezes - a.vezes),
  };
}

/* -------------------------------------------------------------------------- */
/* A leitura                                                                  */
/* -------------------------------------------------------------------------- */

export type LeituraDeIa = {
  severidade: "ok" | "atencao" | "critico";
  titulo: string;
  detalhe: string;
};

/**
 * O que os números significam, em português.
 *
 * SEM ISTO, O PAINEL É UMA TABELA — e uma tabela exige que quem olha já saiba
 * qual número é bom. Ninguém na clínica sabe qual é a taxa de handoff saudável
 * de um agente de IA, e não deveria precisar saber.
 */
export function lerMetricas(m: MetricasDeIa): LeituraDeIa[] {
  const leituras: LeituraDeIa[] = [];

  if (m.turnos < 20) {
    return [
      {
        severidade: "ok",
        titulo: `Só ${String(m.turnos)} turnos no período.`,
        // Abaixo disso, toda porcentagem oscila demais para significar algo. É a
        // mesma honestidade do módulo de A/B.
        detalhe: "Poucos casos para tirar conclusão. Deixe rodar mais.",
      },
    ];
  }

  leituras.push(lerTaxaDeHandoff(m));

  if (m.taxaDeFalha > 0.1) {
    leituras.push({
      severidade: "critico",
      titulo: `${pct(m.taxaDeFalha)} dos turnos falharam.`,
      detalhe:
        "Falha segura costuma ser provedor fora do ar ou teto de gasto. Veja o painel de saúde: se o disjuntor está aberto, é o provedor.",
    });
  }

  if (m.custoPorTurno > 0.5) {
    leituras.push({
      severidade: "atencao",
      titulo: `Cada turno está custando ${reais(m.custoPorTurno)}.`,
      /*
       * MEIO REAL POR TURNO é caro para uma clínica: com 500 conversas por mês,
       * são R$ 250 — mais do que a mensalidade de muito software que a clínica
       * usa. E a causa quase nunca é o modelo: é o agente usando ferramenta
       * demais, e cada ferramenta é uma chamada a mais.
       */
      detalhe:
        "Quase sempre é ferramenta demais por turno, e não o preço do modelo. Cada ferramenta é uma chamada a mais. Aperte o teto no Agent Studio antes de trocar de modelo.",
    });
  }

  const topo = m.portoes[0];
  if (topo !== undefined && topo.vezes > m.turnos * 0.2) {
    leituras.push({
      severidade: "atencao",
      titulo: `O portão “${topo.codigo}” barrou ${String(topo.vezes)} turnos.`,
      // A ÚNICA MÉTRICA QUE APONTA CAUSA. Um portão disparando muito diz o que
      // corrigir; taxa de entrega baixa só diz que algo está errado.
      detalhe: explicarPortao(topo.codigo),
    });
  }

  return leituras;
}

/**
 * A taxa de handoff é a métrica mais mal interpretada do painel.
 *
 * NÃO EXISTE "QUANTO MENOR, MELHOR". Zero por cento significa que o agente está
 * respondendo tudo — inclusive o que não devia, e é aí que mora conteúdo
 * clínico respondido por uma máquina. Oitenta por cento significa que ele não
 * está respondendo nada e a recepção ganhou mais trabalho, não menos.
 *
 * A faixa saudável fica no meio, e é a única métrica aqui que precisa de dois
 * limites em vez de um.
 */
function lerTaxaDeHandoff(m: MetricasDeIa): LeituraDeIa {
  if (m.taxaDeHandoff < 0.02) {
    return {
      severidade: "atencao",
      titulo: `Só ${pct(m.taxaDeHandoff)} dos turnos foram para uma pessoa.`,
      detalhe:
        "Baixo demais. Um agente que nunca passa nada adiante provavelmente está respondendo coisa que não devia — confira as conversas sobre sintoma, remédio e reclamação.",
    };
  }

  if (m.taxaDeHandoff > 0.5) {
    return {
      severidade: "atencao",
      titulo: `${pct(m.taxaDeHandoff)} dos turnos foram para uma pessoa.`,
      detalhe:
        "Alto demais: a recepção está recebendo mais trabalho, e não menos. Veja qual portão está barrando — costuma ser falta de material escrito, e não defeito do agente.",
    };
  }

  return {
    severidade: "ok",
    titulo: `${pct(m.taxaDeEntrega)} de entrega, ${pct(m.taxaDeHandoff)} para pessoas.`,
    detalhe: "A divisão entre o que a IA resolve e o que passa adiante está saudável.",
  };
}

function explicarPortao(codigo: string): string {
  switch (codigo) {
    case "conteudo_clinico":
      return "O agente tentou falar de sintoma, remédio ou diagnóstico. O portão fez o certo — mas se acontece muito, o material da clínica provavelmente não cobre o que as pessoas perguntam.";
    case "dono_da_conversa":
      return "A conversa tinha dono humano, ou a IA estava pausada nela. É esperado depois de cada caso aberto; anormal se for a maioria.";
    case "promessa_sem_acao":
      return "O agente prometeu algo que não pode cumprir (“vou verificar e te retorno”). Vale ajustar as instruções para ele passar adiante em vez de prometer.";
    case "janela_whatsapp":
      return "Fora da janela de 24 horas, texto livre não sai. Se acontece muito, a clínica precisa de templates aprovados.";
    case "repeticao":
      return "O agente ia repetir algo que já disse. Costuma ser conversa em que ele não tem o que acrescentar — e deveria passar para uma pessoa.";
    default:
      return "Veja as runs bloqueadas por este portão para entender o padrão.";
  }
}

const pct = (v: number): string => `${String(Math.round(v * 100))}%`;
const reais = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* -------------------------------------------------------------------------- */
/* Comparação entre períodos                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Compara dois períodos.
 *
 * UM NÚMERO SOZINHO NÃO DIZ SE ESTÁ MELHORANDO — e "melhorando" é a única
 * pergunta que importa depois da primeira semana. 62% de entrega é bom ou ruim?
 * Depende de quanto era antes.
 */
export type Comparacao = {
  metrica: string;
  antes: number;
  agora: number;
  /** Em pontos percentuais, para taxas; absoluto para custo. */
  variacao: number;
  /** `true` quando a variação é grande o bastante para significar algo. */
  significativa: boolean;
};

export function compararPeriodos(anterior: MetricasDeIa, atual: MetricasDeIa): Comparacao[] {
  /*
   * O MESMO CUIDADO DO MÓDULO DE A/B, e pela mesma razão.
   *
   * Com poucos turnos, qualquer variação é ruído. Um painel que mostra "+8pp de
   * entrega" em verde, com trinta turnos de base, ensina a clínica a comemorar
   * sorte — e depois a não confiar no painel quando o número voltar.
   */
  const base = Math.min(anterior.turnos, atual.turnos);
  const suficiente = base >= 50;

  const taxa = (nome: string, a: number, b: number): Comparacao => ({
    metrica: nome,
    antes: a,
    agora: b,
    variacao: (b - a) * 100,
    significativa: suficiente && Math.abs(b - a) >= 0.05,
  });

  return [
    taxa("Entrega", anterior.taxaDeEntrega, atual.taxaDeEntrega),
    taxa("Handoff", anterior.taxaDeHandoff, atual.taxaDeHandoff),
    taxa("Falha", anterior.taxaDeFalha, atual.taxaDeFalha),
    {
      metrica: "Custo por turno",
      antes: anterior.custoPorTurno,
      agora: atual.custoPorTurno,
      variacao: atual.custoPorTurno - anterior.custoPorTurno,
      // Custo tem régua diferente: 20% de variação é sinal, e não ruído, porque
      // ele não depende de acaso amostral do mesmo jeito que uma taxa.
      significativa:
        suficiente &&
        anterior.custoPorTurno > 0 &&
        Math.abs(atual.custoPorTurno - anterior.custoPorTurno) / anterior.custoPorTurno >= 0.2,
    },
  ];
}

/** Quantas conversas o agente atendeu no período. Para o cabeçalho da tela. */
export async function conversasAtendidas(janela: JanelaDeAnalise): Promise<number> {
  return await contar("crc_ai_runs", [
    { coluna: "organization_id", op: "eq", valor: janela.organizationId },
    { coluna: "criado_em", op: "gte", valor: janela.de.toISOString() },
    { coluna: "criado_em", op: "lt", valor: janela.ate.toISOString() },
  ]).catch(() => 0);
}
