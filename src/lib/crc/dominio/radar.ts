/**
 * O Radar de Receita — quanto dinheiro está parado, e qual a chance de ele voltar.
 *
 * ============================================================================
 *  A DIFERENÇA ENTRE ISTO E `prioridade.ts`, porque as duas dão um número de
 *  0 a 100 e é fácil achar que são a mesma coisa.
 *
 *    `prioridade.ts`  responde COM QUEM EU FALO PRIMEIRO.
 *                     É uma ordenação da fila de hoje. Quem já tem consulta
 *                     marcada cai 20 pontos, porque não precisa de ligação.
 *
 *    este arquivo     responde QUANTO DINHEIRO EXISTE AQUI, E QUAL A CHANCE.
 *                     É uma estimativa de valor. Quem tem consulta marcada
 *                     pode ser justamente a maior oportunidade do mês, porque
 *                     vai aparecer e ouvir a proposta.
 *
 *  Misturar as duas foi a primeira versão deste arquivo, e o resultado era um
 *  painel que dizia "R$ 184 mil recuperáveis" com o número da fila do dia
 *  dentro — dois conceitos somados, nenhum verificável.
 * ============================================================================
 *
 * A REGRA QUE MAIS IMPORTA AQUI é a do §9 do Prompt Mestre, e ela é sobre
 * honestidade, não sobre matemática:
 *
 *     NUNCA dizer "R$ X recuperados" sem base de atribuição.
 *
 * Por isso este módulo devolve VALOR ESPERADO, sempre acompanhado da
 * probabilidade que o produziu e da confiança que temos nessa probabilidade.
 * Um número de dinheiro sem esses dois ao lado é uma promessa, e promessa em
 * painel de gestão é o que faz o dono parar de olhar o painel.
 *
 * TUDO AQUI É PURO. Sem banco, sem relógio do processo — o instante entra por
 * parâmetro, que é o que permite testar a expiração sem congelar o relógio.
 */
import type { TipoOportunidade } from "./tipos";

/**
 * A versão da fórmula.
 *
 * Guardada em `crc_opportunities.score_version`. Sem ela, mudar um peso
 * reescreve o passado: "o score médio caiu 8 pontos" viraria ruído da própria
 * mudança, e ninguém conseguiria dizer se a clínica piorou ou se a régua mudou.
 */
export const VERSAO_DO_SCORE = "radar-1";

/* -------------------------------------------------------------------------- */
/* O estado da oportunidade, na linguagem do Radar                            */
/* -------------------------------------------------------------------------- */

/**
 * Os nove estados do §8.
 *
 * ELES SÃO DERIVADOS, e não uma coluna. A tentação era gravar `status` na
 * linha; o problema é que a oportunidade já tem `stage_id` — a etapa do funil,
 * que uma pessoa move à mão. Duas máquinas de estado na mesma linha divergem no
 * primeiro dia em que alguém arrasta um card enquanto a automação escreve.
 *
 * Aqui o estado é calculado a partir de fatos datados — converteu, perdeu,
 * descartou, venceu — e não pode divergir de nada, porque não é guardado.
 */
export type EstadoRadar =
  | "DETECTED"
  | "QUALIFIED"
  | "IN_ACTION"
  | "WAITING_PATIENT"
  | "WAITING_HUMAN"
  | "CONVERTED"
  | "LOST"
  | "EXPIRED"
  | "DISMISSED";

/** Os fatos datados que decidem o estado. Tudo ISO, ou nulo. */
export type FatosDaOportunidade = {
  convertedAt: string | null;
  lostAt: string | null;
  dismissedEm: string | null;
  expiresAt: string | null;
  acionadaEm: string | null;
  aguardando: "PACIENTE" | "HUMANO" | null;
  /** Preenchida = o Radar já pontuou. É o que separa DETECTED de QUALIFIED. */
  probability: number | null;
};

/**
 * O estado, em uma passada.
 *
 * A ORDEM DAS PERGUNTAS É A REGRA DE NEGÓCIO, e ela é deliberada:
 *
 *   Os desfechos vêm primeiro porque são absorventes — uma oportunidade
 *   convertida não volta a ser "esperando o paciente" por ter uma data de
 *   expiração no passado.
 *
 *   DISMISSED vem antes de CONVERTED por um motivo prático: quem descarta é uma
 *   pessoa dizendo "o Radar errou aqui". Se um sync marcar conversão depois, o
 *   descarte precisa continuar visível — é ele que mede se o Radar merece
 *   confiança.
 *
 *   EXPIRED vem antes das esperas porque um buraco de agenda de ontem às 14h
 *   não está "aguardando o paciente": ele acabou.
 */
export function estadoDoRadar(fatos: FatosDaOportunidade, agora: Date): EstadoRadar {
  if (fatos.dismissedEm !== null) return "DISMISSED";
  if (fatos.convertedAt !== null) return "CONVERTED";
  if (fatos.lostAt !== null) return "LOST";

  if (fatos.expiresAt !== null && Date.parse(fatos.expiresAt) <= agora.getTime()) {
    return "EXPIRED";
  }

  if (fatos.aguardando === "HUMANO") return "WAITING_HUMAN";
  if (fatos.aguardando === "PACIENTE") return "WAITING_PATIENT";

  if (fatos.acionadaEm !== null) return "IN_ACTION";
  if (fatos.probability !== null) return "QUALIFIED";
  return "DETECTED";
}

/** Os estados em que a oportunidade ainda pode virar dinheiro. */
const ABERTOS: ReadonlySet<EstadoRadar> = new Set<EstadoRadar>([
  "DETECTED",
  "QUALIFIED",
  "IN_ACTION",
  "WAITING_PATIENT",
  "WAITING_HUMAN",
]);

export function aindaRecuperavel(estado: EstadoRadar): boolean {
  return ABERTOS.has(estado);
}

/* -------------------------------------------------------------------------- */
/* A probabilidade                                                            */
/* -------------------------------------------------------------------------- */

/**
 * As taxas base, por tipo de oportunidade.
 *
 * ============================================================================
 *  ESTES NÚMEROS SÃO PALPITES, E PRECISAM SER TRATADOS COMO PALPITES.
 *
 *  Não vieram de medição nenhuma desta clínica — não existe medição ainda,
 *  porque o Radar está nascendo agora. São ordens de grandeza plausíveis para
 *  recuperação em consultório odontológico, escolhidas para que a ordenação
 *  entre tipos faça sentido no primeiro dia.
 *
 *  É POR ISSO QUE A CONFIANÇA NASCE BAIXA (ver `CONFIANCA_SEM_HISTORICO`) e
 *  sobe só quando `amostra` traz desfechos reais. A tela precisa mostrar a
 *  diferença entre "12% medido em 400 casos" e "12% porque alguém chutou" —
 *  senão o primeiro relatório de ROI é construído sobre estes literais.
 * ============================================================================
 */
const PROBABILIDADE_BASE: Readonly<Record<TipoOportunidade, number>> = {
  // Quem acabou de perguntar é quem mais fecha. Nada chega perto.
  NEW_LEAD: 0.35,
  // Faltou ontem: ainda está no assunto, e a janela é curta.
  MISSED_APPOINTMENT: 0.3,
  // Cancelou: quase sempre quer remarcar, só não remarcou.
  CANCELLED_APPOINTMENT: 0.34,
  // Orçamento aprovado e parado. O obstáculo costuma ser dinheiro, não vontade.
  BUDGET_RECOVERY: 0.18,
  ABANDONED_TREATMENT: 0.16,
  RECALL: 0.12,
  // Sumiu há oito meses. A maioria não volta, e fingir o contrário enche a
  // Home de dinheiro que não existe.
  INACTIVE_PATIENT: 0.06,
  // Aniversário não é oportunidade de receita. É cortesia.
  BIRTHDAY: 0.02,
  MANUAL: 0.25,
};

/** Confiança de uma taxa que ninguém mediu. Ver o bloco acima. */
export const CONFIANCA_SEM_HISTORICO = 0.2;

/**
 * Quantos desfechos são necessários para a taxa medida valer sozinha.
 *
 * É uma média ponderada entre o palpite e a medição, com o peso da medição
 * crescendo com a amostra. Com 5 casos a taxa observada quase não move a
 * estimativa; com 200 ela manda. O alternativo — trocar o palpite pela medição
 * assim que existir um caso — produz "100% de conversão" depois do primeiro
 * acerto, que é pior que o palpite.
 */
const AMOSTRA_DE_REFERENCIA = 60;

export type ContextoProbabilidade = {
  tipo: TipoOportunidade;
  /** Desfechos reais deste tipo, nesta clínica. `null` = nunca mediu. */
  amostra: { casos: number; convertidos: number } | null;
  /** A pessoa respondeu alguma das nossas mensagens nesta oportunidade. */
  respondeu: boolean;
  /** Já disse que quer marcar. É o sinal mais forte que existe. */
  intencaoAgendar: boolean;
  /** Quantas vezes já tentamos contato sem resposta. */
  tentativasSemResposta: number;
  /** Dias desde a detecção. */
  diasEsperando: number;
};

export type FatorDeChance = { chave: string; rotulo: string; efeito: number };

export type Chance = {
  /** 0..1. */
  probabilidade: number;
  /** 0..1 — quanto acreditamos na probabilidade acima. */
  confianca: number;
  fatores: FatorDeChance[];
  versao: string;
};

/**
 * A chance desta oportunidade virar dinheiro.
 *
 * OS AJUSTES SÃO MULTIPLICATIVOS, e não somas de pontos, porque a base já é uma
 * probabilidade: somar 0,2 a uma base de 0,9 daria 1,1, e "110% de chance" num
 * painel destrói a credibilidade do resto da tela de uma vez.
 */
export function estimarChance(ctx: ContextoProbabilidade): Chance {
  const fatores: FatorDeChance[] = [];
  const base = PROBABILIDADE_BASE[ctx.tipo];

  let p = base;
  let confianca = CONFIANCA_SEM_HISTORICO;

  // 1. A medição, quando existe, puxa o palpite para o lado dela.
  if (ctx.amostra !== null && ctx.amostra.casos > 0) {
    const observada = ctx.amostra.convertidos / ctx.amostra.casos;
    const peso = ctx.amostra.casos / (ctx.amostra.casos + AMOSTRA_DE_REFERENCIA);
    p = base * (1 - peso) + observada * peso;

    // A confiança é o próprio peso, com piso no palpite: uma amostra de 3 casos
    // não pode deixar a estimativa MENOS confiável do que não ter amostra.
    confianca = Math.max(CONFIANCA_SEM_HISTORICO, peso);

    fatores.push({
      chave: "historico",
      rotulo: `${ctx.amostra.convertidos} de ${ctx.amostra.casos} casos deste tipo converteram`,
      efeito: p - base,
    });
  } else {
    fatores.push({
      chave: "base",
      rotulo: "Taxa estimada — esta clínica ainda não tem histórico deste tipo",
      efeito: 0,
    });
  }

  // 2. Respondeu. Metade das oportunidades morre no silêncio; sair do silêncio
  // é o maior salto único que existe.
  if (ctx.respondeu) {
    const antes = p;
    p = Math.min(0.95, p * 2.1);
    fatores.push({ chave: "resposta", rotulo: "Respondeu ao contato", efeito: p - antes });
  }

  // 3. Pediu para marcar. Não é inferência, é a pessoa dizendo.
  if (ctx.intencaoAgendar) {
    const antes = p;
    p = Math.min(0.95, p * 1.8);
    fatores.push({ chave: "intencao", rotulo: "Pediu para agendar", efeito: p - antes });
  }

  // 4. Silêncio repetido. Cada tentativa sem resposta é evidência de que esta
  // não vai fechar — e é o que impede a fila de insistir para sempre.
  if (ctx.tentativasSemResposta > 0) {
    const antes = p;
    p = p * Math.pow(0.62, Math.min(ctx.tentativasSemResposta, 4));
    fatores.push({
      chave: "silencio",
      rotulo:
        ctx.tentativasSemResposta === 1
          ? "Um contato sem resposta"
          : `${ctx.tentativasSemResposta} contatos sem resposta`,
      efeito: p - antes,
    });
  }

  // 5. O tempo. Uma oportunidade de três meses atrás é quase sempre uma
  // oportunidade perdida que ninguém fechou na tela.
  if (ctx.diasEsperando >= 90) {
    const antes = p;
    p = p * 0.45;
    fatores.push({ chave: "idade", rotulo: "Parada há mais de 3 meses", efeito: p - antes });
  } else if (ctx.diasEsperando >= 30) {
    const antes = p;
    p = p * 0.72;
    fatores.push({ chave: "idade", rotulo: "Parada há mais de um mês", efeito: p - antes });
  }

  // Piso em 1%: zero significaria "impossível", e impossível justificaria
  // remover a linha — que é uma decisão de pessoa, não de fórmula.
  const probabilidade = Math.max(0.01, Math.min(0.95, p));

  fatores.sort((a, b) => Math.abs(b.efeito) - Math.abs(a.efeito));

  return {
    probabilidade: arredondar(probabilidade, 3),
    confianca: arredondar(confianca, 3),
    fatores,
    versao: VERSAO_DO_SCORE,
  };
}

/* -------------------------------------------------------------------------- */
/* Urgência                                                                   */
/* -------------------------------------------------------------------------- */

export type ContextoUrgencia = {
  /** Quando deixa de fazer sentido agir. `null` = não vence. */
  expiraEm: string | null;
  /** Dias desde a detecção. */
  diasEsperando: number;
  tipo: TipoOportunidade;
};

/**
 * Urgência 0..100 — QUANDO, e não quanto.
 *
 * A DISTINÇÃO ENTRE URGENTE E IMPORTANTE é a razão de este número existir
 * separado do valor. Um buraco de agenda de amanhã vale R$ 300 e precisa de
 * ação hoje; um implante de R$ 12 mil parado há duas semanas pode esperar até
 * quinta. Um score único ordenaria o implante na frente, e o horário de amanhã
 * passaria vazio.
 */
export function calcularUrgencia(ctx: ContextoUrgencia, agora: Date): number {
  let urgencia = 20;

  if (ctx.expiraEm !== null) {
    const horas = (Date.parse(ctx.expiraEm) - agora.getTime()) / 3_600_000;
    if (horas <= 0)
      urgencia = 0; // Venceu. Urgência zero — não dá mais.
    else if (horas <= 6) urgencia = 100;
    else if (horas <= 24) urgencia = 90;
    else if (horas <= 72) urgencia = 70;
    else if (horas <= 168) urgencia = 45;
    else urgencia = 25;
  } else {
    // Sem prazo, a urgência vem da janela típica do tipo. Quem faltou ontem
    // ainda lembra; quem sumiu há oito meses não fica mais urgente por esperar.
    const JANELA_CURTA: readonly TipoOportunidade[] = [
      "NEW_LEAD",
      "MISSED_APPOINTMENT",
      "CANCELLED_APPOINTMENT",
    ];
    if (JANELA_CURTA.includes(ctx.tipo)) {
      if (ctx.diasEsperando <= 1) urgencia = 85;
      else if (ctx.diasEsperando <= 3) urgencia = 65;
      else if (ctx.diasEsperando <= 7) urgencia = 40;
      else urgencia = 20;
    } else if (ctx.tipo === "BUDGET_RECOVERY" || ctx.tipo === "ABANDONED_TREATMENT") {
      urgencia = ctx.diasEsperando >= 14 ? 45 : 30;
    } else {
      urgencia = 15;
    }
  }

  return Math.max(0, Math.min(100, Math.round(urgencia)));
}

/* -------------------------------------------------------------------------- */
/* Valor esperado                                                             */
/* -------------------------------------------------------------------------- */

export type ValorDoRadar = {
  /** O que a clínica ganharia se esta fechasse. */
  potencial: number;
  /** `potencial × probabilidade`. É o número honesto. */
  esperado: number;
  probabilidade: number;
  confianca: number;
  /** 0..100. Composto de valor esperado e urgência. */
  impacto: number;
};

/**
 * O teto do valor esperado para a normalização do impacto.
 *
 * Não é um limite de valor: é a escala. Uma oportunidade com R$ 5.000 de valor
 * esperado já é a maior da fila em qualquer consultório; acima disso o impacto
 * satura em 100, e o desempate volta a ser a urgência — que é o comportamento
 * certo quando duas oportunidades são grandes demais para comparar.
 */
const VALOR_ESPERADO_DE_REFERENCIA = 5_000;

/**
 * O valor, e o impacto de 0 a 100.
 *
 * ============================================================================
 *  O VALOR ESPERADO É O ÚNICO NÚMERO QUE PODE IR PARA A HOME COMO DINHEIRO.
 *
 *  `potencial` somado sobre a base inteira dá a fantasia: a soma de tudo que
 *  aconteceria se todo mundo fechasse. Num consultório com 8.000 pacientes
 *  isso passa de R$ 2 milhões, e é literalmente a soma dos sonhos.
 *
 *  `esperado` é o mesmo cálculo com a chance dentro, e é o que sobrevive a uma
 *  conferência no fim do mês.
 * ============================================================================
 */
export function valorDoRadar(potencial: number, chance: Chance, urgencia: number): ValorDoRadar {
  const esperado = potencial * chance.probabilidade;

  const fracaoDeValor = Math.min(1, esperado / VALOR_ESPERADO_DE_REFERENCIA);

  /*
   * 70% VALOR, 30% URGÊNCIA.
   *
   * A urgência entra com peso menor de propósito: ela é uma janela, e uma
   * janela apertada sobre R$ 200 não deve passar na frente de R$ 4.000 que
   * ainda tem uma semana. Mas ela não pode ser zero — sem ela, o horário vago
   * de amanhã nunca sobe na lista, e o dia passa com a cadeira parada.
   */
  const impacto = Math.round((fracaoDeValor * 0.7 + (urgencia / 100) * 0.3) * 100);

  return {
    potencial: arredondar(potencial, 2),
    esperado: arredondar(esperado, 2),
    probabilidade: chance.probabilidade,
    confianca: chance.confianca,
    impacto: Math.max(0, Math.min(100, impacto)),
  };
}

/* -------------------------------------------------------------------------- */
/* A soma que a Home mostra                                                   */
/* -------------------------------------------------------------------------- */

export type LinhaDoResumo = {
  tipo: TipoOportunidade;
  abertas: number;
  valorPotencial: number;
  valorEsperado: number;
};

export type ResumoDoRadar = {
  linhas: LinhaDoResumo[];
  totalAbertas: number;
  /** A soma dos potenciais. É a fantasia, e a tela precisa rotulá-la assim. */
  totalPotencial: number;
  /** A soma dos esperados. É o número que pode virar promessa. */
  totalEsperado: number;
  /** Média ponderada pela quantidade. Baixa = o painel ainda está chutando. */
  confiancaMedia: number;
};

/**
 * Junta as linhas por tipo num resumo.
 *
 * A CONFIANÇA MÉDIA É PONDERADA PELA QUANTIDADE, e não pelo valor. Ponderar por
 * valor deixaria uma única oportunidade grande e mal medida dominar o indicador
 * de quão confiável o painel é — que é exatamente a situação em que ele mais
 * precisa avisar que está chutando.
 */
export function resumirRadar(
  linhas: readonly (LinhaDoResumo & { confianca: number })[],
): ResumoDoRadar {
  let totalAbertas = 0;
  let totalPotencial = 0;
  let totalEsperado = 0;
  let somaDeConfianca = 0;

  for (const l of linhas) {
    totalAbertas += l.abertas;
    totalPotencial += l.valorPotencial;
    totalEsperado += l.valorEsperado;
    somaDeConfianca += l.confianca * l.abertas;
  }

  const ordenadas = [...linhas]
    .map(({ confianca: _confianca, ...resto }) => resto)
    .sort((a, b) => b.valorEsperado - a.valorEsperado);

  return {
    linhas: ordenadas,
    totalAbertas,
    totalPotencial: arredondar(totalPotencial, 2),
    totalEsperado: arredondar(totalEsperado, 2),
    confiancaMedia: totalAbertas === 0 ? 0 : arredondar(somaDeConfianca / totalAbertas, 3),
  };
}

/* -------------------------------------------------------------------------- */

/**
 * Arredonda sem o erro clássico do `toFixed` em binário.
 *
 * `(0.1 + 0.2).toFixed(2)` dá "0.30", mas `Math.round(1.005 * 100) / 100` dá
 * 1 — porque 1.005 em ponto flutuante é 1.00499…. O `Number(x.toFixed(n))`
 * resolve os dois casos, e o valor aqui nunca vai para o banco como dinheiro
 * (isso é `numeric` e vai como string), então a conversão é segura.
 */
function arredondar(n: number, casas: number): number {
  return Number(n.toFixed(casas));
}
