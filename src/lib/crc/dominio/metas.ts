/**
 * Metas — o objetivo do dono virando plano.
 *
 * ============================================================================
 *  O QUE ESTE MÓDULO FAZ, E O QUE ELE RECUSA A FAZER.
 *
 *  FAZ: pegar "quero 90% de ocupação até sexta", medir onde estamos, decompor a
 *  distância em ações que o CRC JÁ SABE EXECUTAR, e dizer quanto se espera de
 *  cada uma.
 *
 *  RECUSA: prometer. Toda previsão sai com confiança ao lado, e a confiança
 *  nasce baixa porque não existe histórico desta clínica. Um plano que diz
 *  "vamos chegar a 90%" sem qualificar é a forma mais rápida de o dono parar de
 *  usar o módulo — porque na primeira vez que não chegar, ele vai lembrar.
 * ============================================================================
 *
 * ============================================================================
 *  E A DECOMPOSIÇÃO NÃO INVENTA CAPACIDADE.
 *
 *  Cada ação aponta para um módulo existente: encaixe, recall, campanha, funil
 *  de orçamento, confirmação. Se a meta exigir algo que o CRC não faz, o plano
 *  DIZ ISSO em vez de gerar uma ação vazia — é a diferença entre um plano e uma
 *  lista de boas intenções.
 * ============================================================================
 *
 * TUDO PURO.
 */

export const VERSAO_DO_PLANO = "meta-1";

/* -------------------------------------------------------------------------- */
/* O tipo de meta                                                             */
/* -------------------------------------------------------------------------- */

export type TipoDeMeta =
  | "OCUPACAO_AGENDA"
  | "RECEITA_RECUPERADA"
  | "AGENDAMENTOS"
  | "CONVERSAO_ORCAMENTO"
  | "REDUZIR_FALTAS"
  | "REATIVAR_PACIENTES";

export type Unidade = "PERCENTUAL" | "REAIS" | "QUANTIDADE";

export type DescricaoDeMeta = {
  tipo: TipoDeMeta;
  rotulo: string;
  unidade: Unidade;
  /** O que o sistema conta para medir. A tela mostra, e é o que torna a meta honesta. */
  comoMede: string;
  /** `true` quando um valor MENOR é melhor. Muda o cálculo de progresso inteiro. */
  menorEhMelhor: boolean;
};

/**
 * O catálogo, fechado.
 *
 * ============================================================================
 *  UMA META QUE O SISTEMA NÃO SABE MEDIR É UMA ANOTAÇÃO, NÃO UMA META.
 *
 *  Deixar alguém digitar "aumentar a satisfação dos pacientes" produziria uma
 *  linha que nunca sai de 0% de progresso, porque ninguém definiu o que ela
 *  conta. E uma meta parada em 0% por um mês ensina o dono que o módulo não
 *  funciona.
 *
 *  `comoMede` existe para a tela mostrar a régua ANTES de alguém criar a meta.
 * ============================================================================
 */
export const CATALOGO_DE_METAS: readonly DescricaoDeMeta[] = [
  {
    tipo: "OCUPACAO_AGENDA",
    rotulo: "Ocupação da agenda",
    unidade: "PERCENTUAL",
    comoMede:
      "Horas com consulta marcada dividido pelas horas de atendimento disponíveis, no período da meta.",
    menorEhMelhor: false,
  },
  {
    tipo: "RECEITA_RECUPERADA",
    rotulo: "Receita recuperada",
    unidade: "REAIS",
    comoMede:
      "Soma dos eventos de produção com atribuição CONFIRMADA a uma ação do CRC. Não inclui receita provável.",
    menorEhMelhor: false,
  },
  {
    tipo: "AGENDAMENTOS",
    rotulo: "Consultas marcadas",
    unidade: "QUANTIDADE",
    comoMede: "Consultas criadas no período, com status diferente de cancelada.",
    menorEhMelhor: false,
  },
  {
    tipo: "CONVERSAO_ORCAMENTO",
    rotulo: "Conversão de orçamento",
    unidade: "PERCENTUAL",
    comoMede: "Orçamentos aceitos dividido pelos orçamentos com desfecho no período.",
    menorEhMelhor: false,
  },
  {
    tipo: "REDUZIR_FALTAS",
    rotulo: "Reduzir faltas",
    unidade: "PERCENTUAL",
    comoMede: "Consultas com status MISSED dividido pelas consultas do período.",
    // O único em que menos é melhor. Ignorar isso faria o progresso ser
    // negativo justamente quando a clínica está melhorando.
    menorEhMelhor: true,
  },
  {
    tipo: "REATIVAR_PACIENTES",
    rotulo: "Pacientes reativados",
    unidade: "QUANTIDADE",
    comoMede:
      "Pacientes sem consulta há mais de seis meses que voltaram a marcar no período da meta.",
    menorEhMelhor: false,
  },
] as const;

export function descreverMeta(tipo: TipoDeMeta): DescricaoDeMeta {
  return CATALOGO_DE_METAS.find((m) => m.tipo === tipo) ?? CATALOGO_DE_METAS[0]!;
}

/* -------------------------------------------------------------------------- */
/* O progresso                                                                */
/* -------------------------------------------------------------------------- */

export type Situacao = "NO_RITMO" | "ATRASADA" | "ADIANTADA" | "ATINGIDA";

export type Progresso = {
  /** 0..1. Quanto do caminho já foi andado. Pode passar de 1 quando supera. */
  fracao: number;
  situacao: Situacao;
  /** Quanto falta, na unidade da meta. */
  falta: number;
  /** Quanto precisa render POR DIA daqui até o prazo. */
  ritmoNecessario: number;
  /** Uma frase, para a tela. */
  resumo: string;
};

/**
 * Onde estamos.
 *
 * ============================================================================
 *  O PROGRESSO É MEDIDO CONTRA O BASELINE, E NÃO CONTRA ZERO.
 *
 *  Uma meta de "chegar a 90% de ocupação" partindo de 61% já andou 0% quando
 *  está em 61%, e não 68%. Medir contra zero faria toda meta nascer quase
 *  cumprida, e o módulo inteiro viraria enfeite.
 *
 *  E O BASELINE É CONGELADO na criação (`crc_goals.baseline`). Recalculá-lo a
 *  cada medição faria a meta se mover junto com o resultado — o progresso seria
 *  eternamente zero.
 * ============================================================================
 */
export function calcularProgresso(p: {
  baseline: number;
  alvo: number;
  atual: number;
  menorEhMelhor: boolean;
  diasTotais: number;
  diasRestantes: number;
}): Progresso {
  const distancia = p.menorEhMelhor ? p.baseline - p.alvo : p.alvo - p.baseline;
  const andado = p.menorEhMelhor ? p.baseline - p.atual : p.atual - p.baseline;

  /*
   * ALVO IGUAL AO BASELINE é uma meta sem distância — alguém criou "chegar a
   * 61%" já estando em 61%. Devolver `Infinity` ou `NaN` quebraria a tela; o
   * certo é chamar de atingida, porque literalmente é.
   */
  if (distancia <= 0) {
    return {
      fracao: 1,
      situacao: "ATINGIDA",
      falta: 0,
      ritmoNecessario: 0,
      resumo: "O alvo já era o ponto de partida.",
    };
  }

  const fracao = andado / distancia;
  const falta = Math.max(0, distancia - andado);

  if (fracao >= 1) {
    return {
      fracao: Number(fracao.toFixed(3)),
      situacao: "ATINGIDA",
      falta: 0,
      ritmoNecessario: 0,
      resumo: "Meta atingida.",
    };
  }

  const ritmoNecessario = p.diasRestantes <= 0 ? falta : falta / p.diasRestantes;

  /*
   * A SITUAÇÃO COMPARA DUAS FRAÇÕES: quanto do CAMINHO foi andado contra
   * quanto do TEMPO passou.
   *
   * É o que distingue "30% da meta" de "30% da meta com 80% do prazo gasto". O
   * primeiro número sozinho não diz nada sobre estar atrasado.
   */
  const tempoGasto = p.diasTotais <= 0 ? 1 : (p.diasTotais - p.diasRestantes) / p.diasTotais;

  /*
   * A TOLERÂNCIA DE 10% existe porque o progresso real não é linear: campanha
   * dispara em lotes, orçamento fecha em degraus. Sem ela, toda meta passaria a
   * maior parte do tempo oscilando entre "atrasada" e "adiantada", e o alarme
   * perderia o sentido.
   */
  const TOLERANCIA = 0.1;
  let situacao: Situacao = "NO_RITMO";
  if (fracao < tempoGasto - TOLERANCIA) situacao = "ATRASADA";
  else if (fracao > tempoGasto + TOLERANCIA) situacao = "ADIANTADA";

  return {
    fracao: Number(fracao.toFixed(3)),
    situacao,
    falta: Number(falta.toFixed(2)),
    ritmoNecessario: Number(ritmoNecessario.toFixed(4)),
    resumo: resumir(situacao, fracao, p.diasRestantes),
  };
}

function resumir(situacao: Situacao, fracao: number, diasRestantes: number): string {
  const pct = `${String(Math.round(fracao * 100))}%`;
  const dias =
    diasRestantes <= 0
      ? "o prazo acabou"
      : diasRestantes === 1
        ? "falta 1 dia"
        : `faltam ${String(diasRestantes)} dias`;

  if (situacao === "ATRASADA") return `${pct} do caminho, e ${dias}. Está atrás do ritmo.`;
  if (situacao === "ADIANTADA") return `${pct} do caminho, e ${dias}. Está à frente do ritmo.`;
  return `${pct} do caminho, e ${dias}.`;
}

/* -------------------------------------------------------------------------- */
/* O plano                                                                    */
/* -------------------------------------------------------------------------- */

export type ModuloDoPlano = "ENCAIXE" | "RECALL" | "CAMPANHA" | "FUNIL" | "FALTAS" | "HUMANO";

export type AcaoPlanejada = {
  modulo: ModuloDoPlano;
  titulo: string;
  descricao: string;
  contribuicaoEstimada: number;
  confianca: number;
  alcanceEstimado: number;
  ordem: number;
};

export type Plano = {
  acoes: AcaoPlanejada[];
  /** Soma das contribuições. É a previsão, e ela pode não alcançar o alvo. */
  previsao: number;
  /** `true` quando a previsão NÃO cobre a distância. */
  insuficiente: boolean;
  /** O que dizer ao dono antes de ele aprovar. */
  aviso: string | null;
  versao: string;
};

/** O que o CRC tem à disposição para montar o plano. */
export type Recursos = {
  /** Buracos de agenda abertos no período. */
  buracosAbertos: number;
  /** Pacientes elegíveis a recall. */
  pacientesEmRecall: number;
  /** Valor total dos orçamentos abertos. */
  orcamentosAbertos: number;
  /** Quantidade de orçamentos abertos. */
  orcamentosQuantidade: number;
  /** Consultas futuras com risco alto de falta. */
  consultasEmRisco: number;
  /** Pacientes inativos há mais de seis meses. */
  inativos: number;
};

/**
 * Monta o plano.
 *
 * ============================================================================
 *  AS TAXAS USADAS AQUI SÃO AS MESMAS DO RESTO DO SISTEMA, e isso não é
 *  coincidência: um plano que previsse conversão diferente da que o Radar
 *  estima produziria dois números contraditórios na mesma tela.
 *
 *  Quando a medição real existir, ela entra em UM lugar e os dois passam a
 *  concordar. Por enquanto são palpites declarados, e a confiança diz isso.
 * ============================================================================
 */
export function montarPlano(p: {
  tipo: TipoDeMeta;
  distancia: number;
  diasRestantes: number;
  maxContatosDia: number;
  recursos: Recursos;
}): Plano {
  const acoes: AcaoPlanejada[] = [];
  const tetoDeContatos = Math.max(0, p.maxContatosDia * Math.max(1, p.diasRestantes));

  const adicionar = (a: Omit<AcaoPlanejada, "ordem">): void => {
    acoes.push({ ...a, ordem: acoes.length });
  };

  if (p.tipo === "OCUPACAO_AGENDA" || p.tipo === "AGENDAMENTOS") {
    /*
     * A ORDEM AQUI É A ORDEM DO CUSTO, do mais barato para o mais caro — e
     * "custo" é o incômodo causado a pessoas, não dinheiro.
     *
     * Preencher um buraco que já existe não incomoda ninguém que não queira ser
     * incomodado: a lista de espera PEDIU para ser chamada. Já uma campanha de
     * reativação fala com quem não pediu nada.
     */
    if (p.recursos.buracosAbertos > 0) {
      adicionar({
        modulo: "ENCAIXE",
        titulo: `Preencher ${String(p.recursos.buracosAbertos)} hora(s) vaga(s)`,
        descricao:
          "Convidar a lista de espera para as janelas que já estão abertas, em levas de três.",
        // ~45% dos buracos com candidato acabam preenchidos quando há lista.
        contribuicaoEstimada: Math.round(p.recursos.buracosAbertos * 0.45),
        confianca: 0.25,
        alcanceEstimado: p.recursos.buracosAbertos * 3,
      });
    }

    if (p.recursos.consultasEmRisco > 0) {
      adicionar({
        modulo: "FALTAS",
        titulo: `Confirmar ${String(p.recursos.consultasEmRisco)} consulta(s) de risco alto`,
        descricao:
          "Pedir confirmação e preparar encaixe. Não faz a pessoa vir — evita a cadeira vazia.",
        contribuicaoEstimada: Math.round(p.recursos.consultasEmRisco * 0.3),
        confianca: 0.2,
        alcanceEstimado: p.recursos.consultasEmRisco,
      });
    }

    if (p.recursos.pacientesEmRecall > 0) {
      const alcance = Math.min(p.recursos.pacientesEmRecall, tetoDeContatos);
      adicionar({
        modulo: "RECALL",
        titulo: `Chamar ${String(alcance)} paciente(s) em retorno`,
        descricao: "Quem passou do intervalo de revisão, em lote, respeitando o teto diário.",
        // Recall converte ~12%, e desses ~70% marcam no período.
        contribuicaoEstimada: Math.round(alcance * 0.12 * 0.7),
        confianca: 0.2,
        alcanceEstimado: alcance,
      });
    }
  }

  if (p.tipo === "RECEITA_RECUPERADA" || p.tipo === "CONVERSAO_ORCAMENTO") {
    if (p.recursos.orcamentosQuantidade > 0) {
      const emReais = p.tipo === "RECEITA_RECUPERADA";
      adicionar({
        modulo: "FUNIL",
        titulo: `Retomar ${String(p.recursos.orcamentosQuantidade)} orçamento(s) aberto(s)`,
        descricao:
          "Follow-up dos orçamentos parados, começando pelos de maior valor e pelos já aceitos sem data.",
        contribuicaoEstimada: emReais
          ? Math.round(p.recursos.orcamentosAbertos * 0.18)
          : Math.round(p.recursos.orcamentosQuantidade * 0.18),
        confianca: 0.2,
        alcanceEstimado: p.recursos.orcamentosQuantidade,
      });
    }
  }

  if (p.tipo === "REATIVAR_PACIENTES" && p.recursos.inativos > 0) {
    const alcance = Math.min(p.recursos.inativos, tetoDeContatos);
    adicionar({
      modulo: "CAMPANHA",
      titulo: `Campanha para ${String(alcance)} paciente(s) inativo(s)`,
      descricao: "Quem não vem há mais de seis meses, em campanha com teto diário e janela.",
      // Inativo converte pouco: 6%. O número baixo é o ponto — uma previsão
      // otimista aqui produziria um plano que promete o que não entrega.
      contribuicaoEstimada: Math.round(alcance * 0.06),
      confianca: 0.15,
      alcanceEstimado: alcance,
    });
  }

  if (p.tipo === "REDUZIR_FALTAS") {
    if (p.recursos.consultasEmRisco > 0) {
      adicionar({
        modulo: "FALTAS",
        titulo: "Confirmação ativa nas consultas de risco alto",
        descricao:
          "Pedir confirmação com 48h. Confirmar é o maior sinal positivo que existe no modelo de falta.",
        contribuicaoEstimada: Math.round(p.recursos.consultasEmRisco * 0.35),
        confianca: 0.25,
        alcanceEstimado: p.recursos.consultasEmRisco,
      });
    }
  }

  const previsao = acoes.reduce((s, a) => s + a.contribuicaoEstimada, 0);
  const insuficiente = previsao < p.distancia;

  /*
   * O AVISO É A PARTE MAIS IMPORTANTE DA FUNÇÃO.
   *
   * Um plano que não alcança o alvo e não diz isso é pior que nenhum plano: o
   * dono aprova, espera, e descobre no fim do prazo. Dizer antes preserva a
   * única coisa que o módulo tem — a confiança de quem lê.
   */
  let aviso: string | null = null;

  if (acoes.length === 0) {
    aviso =
      "O CRC não encontrou nada para fazer por esta meta agora: não há horas vagas, orçamentos abertos nem pacientes elegíveis. Isso costuma significar que a base ainda não foi sincronizada.";
  } else if (insuficiente) {
    aviso = `Com o que existe hoje, a previsão é de ${formatar(previsao)} — abaixo dos ${formatar(p.distancia)} que a meta pede. O plano ajuda, e não fecha a conta sozinho.`;
  }

  return { acoes, previsao, insuficiente, aviso, versao: VERSAO_DO_PLANO };
}

function formatar(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/* -------------------------------------------------------------------------- */
/* O replanejamento                                                           */
/* -------------------------------------------------------------------------- */

export type DecisaoDeReplano =
  | { replanejar: false; motivo: string }
  | { replanejar: true; motivo: string; urgencia: "AVISO" | "CRITICA" };

/**
 * Vale a pena refazer o plano?
 *
 * ============================================================================
 *  REPLANEJAR CEDO DEMAIS É PIOR QUE NÃO REPLANEJAR.
 *
 *  Nos primeiros dias, toda meta parece atrasada: campanha ainda não disparou,
 *  orçamento ainda não foi retomado, o recall sai em lotes. Refazer o plano ali
 *  trocaria uma estratégia que ainda não teve chance por outra que também não
 *  vai ter — e o resultado é uma meta que muda de plano a cada dia sem nunca
 *  executar nenhum.
 *
 *  Por isso a primeira condição é TEMPO GASTO, e não progresso.
 * ============================================================================
 */
export function decidirReplano(p: {
  situacao: Situacao;
  fracaoDoTempo: number;
  jaReplanejou: number;
}): DecisaoDeReplano {
  if (p.situacao === "ATINGIDA") {
    return { replanejar: false, motivo: "A meta foi atingida." };
  }

  if (p.fracaoDoTempo < 0.25) {
    return {
      replanejar: false,
      motivo: "Ainda no começo do prazo: o plano não teve chance de render.",
    };
  }

  if (p.situacao !== "ATRASADA") {
    return { replanejar: false, motivo: "Dentro do ritmo esperado." };
  }

  /*
   * O TETO DE REPLANEJAMENTOS existe porque a terceira tentativa quase sempre
   * significa que a META está errada, e não o plano. Uma meta que exige o dobro
   * do que a clínica consegue não fica correta com um quarto plano.
   */
  if (p.jaReplanejou >= 2) {
    return {
      replanejar: false,
      motivo:
        "Já foram dois replanejamentos e a meta continua atrasada. O problema provavelmente é o alvo, e não a estratégia — vale rever com uma pessoa.",
    };
  }

  return {
    replanejar: true,
    motivo: "Atrasada com o prazo já corrido. Vale refazer o plano com os recursos de agora.",
    urgencia: p.fracaoDoTempo >= 0.6 ? "CRITICA" : "AVISO",
  };
}
