/**
 * Gestão — o que mudou, o que está apertado, e o que dizer de manhã.
 *
 * ============================================================================
 *  A REGRA DO §39, e ela vale para este arquivo inteiro:
 *
 *      NÚMERO SIMPLES DEVE SER CÁLCULO. O MODELO SÓ EXPLICA.
 *
 *  "As faltas subiram 40%" é uma divisão. Pedir isso a um modelo é pagar por
 *  uma conta que o Postgres faz de graça — e aceitar que ela às vezes venha
 *  errada, de um jeito que ninguém consegue auditar.
 *
 *  O modelo pode escrever a FRASE em volta do número. Não pode produzir o
 *  número.
 * ============================================================================
 *
 * TUDO PURO.
 */

/* -------------------------------------------------------------------------- */
/* Anomalia                                                                   */
/* -------------------------------------------------------------------------- */

export type Serie = {
  chave: string;
  rotulo: string;
  /** O período recente: normalmente os últimos 7 dias. */
  recente: number;
  /** A base de comparação: normalmente os 28 dias anteriores. */
  base: number;
  /** Quantos dias tem cada janela. Serve para normalizar. */
  diasRecente: number;
  diasBase: number;
  /** `true` quando SUBIR é ruim (faltas, cancelamentos, opt-out). */
  subirEhRuim: boolean;
};

export type Anomalia = {
  chave: string;
  rotulo: string;
  /** Variação em pontos percentuais contra a média diária da base. */
  variacaoPct: number;
  direcao: "SUBIU" | "CAIU";
  gravidade: "INFO" | "ATENCAO" | "ALTA";
  /** A frase, com o número dentro. */
  fato: string;
};

/**
 * Variação mínima para virar anomalia.
 *
 * ============================================================================
 *  TRINTA POR CENTO, E O NÚMERO É ALTO DE PROPÓSITO.
 *
 *  Numa clínica, a semana varia sozinha: feriado, férias do dentista, chuva.
 *  Um detector com limiar de 10% dispara toda semana, e um alerta que dispara
 *  toda semana deixa de ser lido em duas.
 *
 *  O custo de perder uma anomalia de 25% é baixo — ela vira 40% na semana
 *  seguinte se for real. O custo de gritar toda semana é o alerta inteiro.
 * ============================================================================
 */
export const VARIACAO_MINIMA_PCT = 30;

/**
 * Volume mínimo na base para a variação significar alguma coisa.
 *
 * De 2 para 3 é "50% de aumento" e é uma pessoa. Sem piso, o detector passaria
 * a vida anunciando aumentos de 100% em coisas que aconteceram duas vezes.
 */
export const VOLUME_MINIMO = 10;

/**
 * Acha o que mudou.
 *
 * A COMPARAÇÃO É POR MÉDIA DIÁRIA, e não por total. Sete dias contra vinte e
 * oito são volumes diferentes por construção — comparar os totais diria que
 * "as faltas caíram 75%" toda semana.
 */
export function acharAnomalias(series: readonly Serie[]): Anomalia[] {
  const achados: Anomalia[] = [];

  for (const s of series) {
    if (s.diasRecente <= 0 || s.diasBase <= 0) continue;
    if (s.base < VOLUME_MINIMO) continue;

    const mediaRecente = s.recente / s.diasRecente;
    const mediaBase = s.base / s.diasBase;
    if (mediaBase === 0) continue;

    const variacao = ((mediaRecente - mediaBase) / mediaBase) * 100;
    if (Math.abs(variacao) < VARIACAO_MINIMA_PCT) continue;

    const subiu = variacao > 0;
    const ruim = subiu === s.subirEhRuim;

    achados.push({
      chave: s.chave,
      rotulo: s.rotulo,
      variacaoPct: Number(variacao.toFixed(1)),
      direcao: subiu ? "SUBIU" : "CAIU",
      /*
       * MUDANÇA BOA TAMBÉM É ANOMALIA, e entra como INFO.
       *
       * Um detector que só mostra o que piorou faz a clínica achar que nada dá
       * certo. E a mudança boa carrega informação acionável: se a conversão
       * subiu 40%, vale entender o que mudou para repetir.
       */
      gravidade: !ruim ? "INFO" : Math.abs(variacao) >= 60 ? "ALTA" : "ATENCAO",
      fato: `${s.rotulo}: ${subiu ? "subiu" : "caiu"} ${Math.abs(variacao).toFixed(0)}% contra as semanas anteriores.`,
    });
  }

  /*
   * O QUE PIOROU VEM PRIMEIRO, e depois o de maior variação. Ordenar só por
   * magnitude poria uma boa notícia de 80% acima de uma falta que subiu 45%.
   */
  const peso = (g: Anomalia["gravidade"]): number => (g === "ALTA" ? 0 : g === "ATENCAO" ? 1 : 2);

  return achados.sort(
    (a, b) =>
      peso(a.gravidade) - peso(b.gravidade) || Math.abs(b.variacaoPct) - Math.abs(a.variacaoPct),
  );
}

/* -------------------------------------------------------------------------- */
/* Capacidade                                                                 */
/* -------------------------------------------------------------------------- */

export type CapacidadeDoDentista = {
  dentistId: string;
  nome: string;
  /** Minutos com consulta marcada no período. */
  minutosOcupados: number;
  /** Minutos entre a primeira e a última consulta de cada dia trabalhado. */
  minutosDeJanela: number;
  /** Dias em que ele atendeu. */
  diasTrabalhados: number;
};

export type LeituraDeCapacidade = {
  dentistId: string;
  nome: string;
  /** 0..1. Ocupação dentro da janela em que a pessoa esteve na clínica. */
  ocupacao: number;
  /** Horas paradas dentro da janela. */
  horasOciosas: number;
  situacao: "APERTADO" | "SAUDAVEL" | "OCIOSO";
};

/**
 * Quanto da janela de cada dentista está realmente ocupado.
 *
 * ============================================================================
 *  A JANELA É "DA PRIMEIRA À ÚLTIMA CONSULTA", e não a grade contratada.
 *
 *  O CRC não conhece a grade horária de cada profissional — ela mora no sistema
 *  da clínica, quando mora em algum lugar. Medir contra ela exigiria uma
 *  integração que não existe.
 *
 *  Medir a janela real é mais conservador e mais honesto: diz quanto da
 *  presença da pessoa na clínica virou atendimento. Um dentista com consultas
 *  às 9h e às 17h e nada no meio aparece como ocioso — que é a verdade sobre
 *  aquele dia, independente do que o contrato diz.
 * ============================================================================
 */
export function lerCapacidade(c: CapacidadeDoDentista): LeituraDeCapacidade {
  if (c.minutosDeJanela <= 0) {
    return {
      dentistId: c.dentistId,
      nome: c.nome,
      ocupacao: 0,
      horasOciosas: 0,
      situacao: "OCIOSO",
    };
  }

  const ocupacao = Math.min(1, c.minutosOcupados / c.minutosDeJanela);
  const ociosos = Math.max(0, c.minutosDeJanela - c.minutosOcupados);

  return {
    dentistId: c.dentistId,
    nome: c.nome,
    ocupacao: Number(ocupacao.toFixed(3)),
    horasOciosas: Number((ociosos / 60).toFixed(1)),
    /*
     * APERTADO ACIMA DE 90%, e isso NÃO é elogio.
     *
     * Uma agenda 95% cheia não tem folga para encaixe, para consulta que
     * estende, nem para urgência — e a primeira coisa que quebra é o horário,
     * que vira atraso para todo mundo depois.
     */
    situacao: ocupacao >= 0.9 ? "APERTADO" : ocupacao >= 0.55 ? "SAUDAVEL" : "OCIOSO",
  };
}

/* -------------------------------------------------------------------------- */
/* O briefing                                                                 */
/* -------------------------------------------------------------------------- */

export type NumerosDoDia = {
  /** Horas vagas detectadas nos próximos dias. */
  horasVagas: number;
  /** Valor esperado do Radar. Já com a probabilidade dentro. */
  receitaEsperada: number;
  /** Consultas de risco alto nos próximos dias. */
  emRisco: number;
  /** Conversas esperando resposta. */
  conversasEsperando: number;
  /** Orçamentos aceitos e sem data. */
  aceitosSemData: number;
  /** Pendências de pré-consulta que exigem gente. */
  pendenciasHumanas: number;
  /** Tarefas abertas. */
  tarefasAbertas: number;
};

export type LinhaDoBriefing = {
  chave: string;
  texto: string;
  /** `true` quando alguém precisa fazer alguma coisa hoje. */
  acionavel: boolean;
};

export type Briefing = {
  linhas: LinhaDoBriefing[];
  /** A frase de abertura. */
  abertura: string;
  anomalias: Anomalia[];
};

/**
 * O resumo da manhã.
 *
 * ============================================================================
 *  UM BRIEFING QUE LISTA TUDO NÃO É UM BRIEFING — É UM RELATÓRIO, e ninguém lê
 *  relatório às oito da manhã.
 *
 *  Por isso só entram linhas com número MAIOR QUE ZERO. "0 conversas
 *  esperando" é uma boa notícia, e boa notícia não precisa de linha: ela é a
 *  ausência de linha.
 *
 *  E quando NADA entra, a abertura diz isso em vez de deixar a tela vazia — o
 *  vazio parece defeito.
 * ============================================================================
 */
export function montarBriefing(
  n: NumerosDoDia,
  anomalias: readonly Anomalia[],
  saudacao: string,
): Briefing {
  const linhas: LinhaDoBriefing[] = [];

  const por = (
    chave: string,
    valor: number,
    um: string,
    varios: string,
    acionavel = true,
  ): void => {
    if (valor <= 0) return;
    linhas.push({
      chave,
      texto: valor === 1 ? um : varios.replace("{n}", String(valor)),
      acionavel,
    });
  };

  /*
   * A ORDEM É A DA URGÊNCIA DE HOJE, e não a do valor.
   *
   * Conversa esperando é alguém do outro lado, agora. Receita esperada é um
   * número para a semana. Ordenar por dinheiro poria o relatório na frente da
   * pessoa esperando resposta.
   */
  por(
    "conversas",
    n.conversasEsperando,
    "1 conversa esperando resposta.",
    "{n} conversas esperando resposta.",
  );
  por(
    "aceitos",
    n.aceitosSemData,
    "1 orçamento aceito sem data marcada.",
    "{n} orçamentos aceitos sem data marcada.",
  );
  por("horas", n.horasVagas, "1 hora vaga na agenda.", "{n} horas vagas na agenda.");
  por(
    "risco",
    n.emRisco,
    "1 consulta com risco alto de falta.",
    "{n} consultas com risco alto de falta.",
  );
  por(
    "pendencias",
    n.pendenciasHumanas,
    "1 pendência de pré-consulta esperando você.",
    "{n} pendências de pré-consulta esperando você.",
  );
  por("tarefas", n.tarefasAbertas, "1 tarefa aberta.", "{n} tarefas abertas.");

  if (n.receitaEsperada > 0) {
    linhas.push({
      chave: "receita",
      texto: `R$ ${n.receitaEsperada.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} de receita esperada no Radar.`,
      // Não é ação de hoje: é contexto. Marcar como acionável faria a pessoa
      // procurar o que fazer com um número.
      acionavel: false,
    });
  }

  const acionaveis = linhas.filter((l) => l.acionavel).length;

  return {
    linhas,
    abertura:
      acionaveis === 0
        ? `${saudacao} Nada pedindo atenção agora.`
        : acionaveis === 1
          ? `${saudacao} Uma coisa pede atenção hoje.`
          : `${saudacao} ${String(acionaveis)} coisas pedem atenção hoje.`,
    anomalias: [...anomalias],
  };
}

/* -------------------------------------------------------------------------- */
/* Simulação                                                                  */
/* -------------------------------------------------------------------------- */

export type Cenario = {
  /** Ocupação média atual, 0..1. */
  ocupacaoAtual: number;
  /** Horas de atendimento por semana, hoje. */
  horasPorSemana: number;
  /** Valor médio produzido por hora de cadeira. */
  valorPorHora: number;
  /** Taxa de falta atual, 0..1. */
  taxaDeFalta: number;
};

export type Simulacao = {
  /** Horas a mais ocupadas por semana. */
  horasGanhas: number;
  /** Receita a mais por mês. */
  receitaMes: number;
  /** O que o número assume. A tela PRECISA mostrar isto. */
  premissas: string[];
};

/**
 * E se...?
 *
 * ============================================================================
 *  ESTA FUNÇÃO DEVOLVE AS PREMISSAS JUNTO, e não é firula.
 *
 *  Um simulador que diz "abrir sábado rende R$ 14.000/mês" sem dizer o que
 *  assumiu é um gerador de decisões ruins: o número parece medido, e é uma
 *  conta com quatro chutes dentro.
 *
 *  Com as premissas na tela, o dono pode discordar de uma delas — "minha
 *  ocupação de sábado não vai ser igual à de terça" — e a conversa passa a ser
 *  sobre a premissa, que é onde ela deveria estar.
 * ============================================================================
 */
export function simularMaisHoras(c: Cenario, horasAMais: number): Simulacao {
  const premissas: string[] = [];

  /*
   * A OCUPAÇÃO DAS HORAS NOVAS É MENOR QUE A ATUAL, e este é o ajuste que
   * separa uma simulação honesta de um folheto de vendas.
   *
   * Horário novo demora a encher: sábado de manhã, ou depois das 19h, não
   * enchem na mesma proporção que a terça à tarde. Assumir a ocupação atual
   * infla o resultado em quase o dobro.
   */
  const ocupacaoNova = Math.min(c.ocupacaoAtual * 0.7, 0.85);
  premissas.push(
    `Horário novo enche menos: ${String(Math.round(ocupacaoNova * 100))}% de ocupação contra os ${String(Math.round(c.ocupacaoAtual * 100))}% de hoje.`,
  );

  const horasGanhas = horasAMais * ocupacaoNova;

  const comparecimento = 1 - c.taxaDeFalta;
  premissas.push(`Comparecimento de ${String(Math.round(comparecimento * 100))}%, igual ao atual.`);

  const receitaSemana = horasGanhas * comparecimento * c.valorPorHora;
  // 4,33 semanas no mês, e não 4: o erro de 8% aparece no fim do ano.
  const receitaMes = receitaSemana * 4.33;

  premissas.push(`Valor de R$ ${String(c.valorPorHora)} por hora de cadeira, igual ao atual.`);
  premissas.push("Nenhum custo novo: sem hora extra, sem material a mais, sem energia.");

  return {
    horasGanhas: Number(horasGanhas.toFixed(1)),
    receitaMes: Number(receitaMes.toFixed(2)),
    premissas,
  };
}
