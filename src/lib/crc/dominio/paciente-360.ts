/**
 * Patient 360 preditivo — §20.
 *
 * ============================================================================
 *  O QUE ESTE ARQUIVO ACRESCENTA, E O QUE ELE SÓ REÚNE.
 *
 *  O §20 pede dezesseis coisas na ficha do paciente. TREZE já existiam,
 *  espalhadas pelas fases: risco de falta veio da B, objeções e tratamentos da
 *  C, a linha do tempo unificada da D, atividade da IA e atribuição da A,
 *  canais e horários preferidos da B.
 *
 *  Faltavam três, e são as únicas que este arquivo inventa: LTV, risco de
 *  ABANDONO e household. O resto é montagem — e montar é o trabalho, porque
 *  treze números certos espalhados por seis telas não respondem a pergunta que
 *  a recepção faz com o paciente na linha.
 * ============================================================================
 *
 * TUDO PURO. Recebe o que já foi lido e devolve decisão.
 */

/* -------------------------------------------------------------------------- */
/* LTV                                                                        */
/* -------------------------------------------------------------------------- */

export type FaixaDeValor = "ALTO" | "MEDIO" | "BAIXO" | "SEM_HISTORICO";

/**
 * A faixa de valor do paciente, comparada à PRÓPRIA clínica.
 *
 * ============================================================================
 *  O CORTE É RELATIVO, E NÃO ABSOLUTO.
 *
 *  R$ 8.000 de histórico é um paciente excelente numa clínica de bairro e um
 *  paciente comum numa de implantes. Um limiar fixo em reais classificaria a
 *  base inteira de uma delas como "alto" e a da outra como "baixo" — e a
 *  etiqueta deixaria de significar qualquer coisa nas duas.
 *
 *  Por isso a régua é a MEDIANA da clínica, e não a média: uma única
 *  reabilitação de R$ 60.000 puxa a média para cima e faria metade da base
 *  virar "baixo" da noite para o dia.
 * ============================================================================
 */
export function faixaDeValor(ltv: number, medianaDaClinica: number): FaixaDeValor {
  if (ltv <= 0) return "SEM_HISTORICO";
  if (medianaDaClinica <= 0) return "SEM_HISTORICO";

  if (ltv >= medianaDaClinica * 2) return "ALTO";
  if (ltv >= medianaDaClinica * 0.5) return "MEDIO";
  return "BAIXO";
}

/* -------------------------------------------------------------------------- */
/* Risco de abandono                                                          */
/* -------------------------------------------------------------------------- */

export type FatorDeAbandono = { rotulo: string; pontos: number };

export type RiscoDeAbandono = {
  /** 0..100. */
  score: number;
  faixa: "ALTO" | "MEDIO" | "BAIXO";
  fatores: FatorDeAbandono[];
  /** O que fazer. Uma frase, e nunca "entrar em contato". */
  sugestao: string;
};

/**
 * Abandono NÃO é falta.
 *
 * ============================================================================
 *  FALTAR É NÃO VIR NUMA CONSULTA MARCADA. ABANDONAR É PARAR DE MARCAR.
 *
 *  São dois modelos diferentes e a confusão entre eles é cara: quem falta
 *  muito mas sempre remarca é um problema de agenda; quem nunca faltou e
 *  simplesmente sumiu há oito meses é um problema de relacionamento. O
 *  primeiro precisa de confirmação; o segundo, de um motivo para voltar.
 *
 *  O sinal mais forte daqui é o SILÊNCIO DEPOIS DE TENTATIVA: alguém que
 *  recebeu três mensagens e não respondeu nenhuma já decidiu — e insistir
 *  numa quarta é o caminho mais rápido para o opt-out.
 * ============================================================================
 */
export function calcularRiscoDeAbandono(p: {
  /** Dias desde a última consulta realizada. `null` = nunca veio. */
  diasDesdeUltimaConsulta: number | null;
  /** O intervalo de recall da clínica, em dias. A régua do "atrasado". */
  recallDias: number;
  /** Contatos feitos sem nenhuma resposta desde então. */
  contatosSemResposta: number;
  /** Faltou sem remarcar na última vez. */
  faltouSemRemarcar: boolean;
  /** Tem orçamento aberto que nunca virou tratamento. */
  temOrcamentoParado: boolean;
  /** Tem consulta futura marcada. Se tem, não está abandonando. */
  temConsultaFutura: boolean;
  /** Pediu para não ser contatado. */
  optOut: boolean;
}): RiscoDeAbandono {
  const fatores: FatorDeAbandono[] = [];

  /*
   * CONSULTA FUTURA MARCADA ZERA O RISCO, e é uma saída antecipada e não um
   * desconto de pontos.
   *
   * Quem tem hora marcada não está abandonando, por definição — qualquer que
   * seja o histórico. Tratar isso como -30 pontos deixaria um paciente com
   * consulta na terça aparecendo como "risco médio de abandono", e a lista
   * perderia o sentido.
   */
  if (p.temConsultaFutura) {
    return {
      score: 0,
      faixa: "BAIXO",
      fatores: [{ rotulo: "Tem consulta marcada", pontos: 0 }],
      sugestao: "Nada a fazer: já tem hora marcada.",
    };
  }

  /*
   * OPT-OUT NÃO É ABANDONO — é uma decisão respeitada.
   *
   * Pontuá-lo como risco produziria uma lista de "recuperar" cheia de gente
   * que pediu explicitamente para não ser incomodada, e alguém acabaria
   * contatando. O risco é zero porque não há ação possível.
   */
  if (p.optOut) {
    return {
      score: 0,
      faixa: "BAIXO",
      fatores: [{ rotulo: "Pediu para não ser contatado", pontos: 0 }],
      sugestao: "Não contatar. A pessoa pediu.",
    };
  }

  let score = 0;

  if (p.diasDesdeUltimaConsulta === null) {
    fatores.push({ rotulo: "Nunca veio a uma consulta", pontos: 25 });
    score += 25;
  } else {
    /*
     * O ATRASO É MEDIDO EM MÚLTIPLOS DO RECALL DA CLÍNICA, e não em dias.
     *
     * Seis meses sem vir é normal numa clínica de limpeza semestral e é muito
     * tempo numa de ortodontia com retorno mensal. A mesma ausência significa
     * coisas opostas, e só o recall configurado sabe qual é.
     */
    const atraso = p.diasDesdeUltimaConsulta / Math.max(1, p.recallDias);

    if (atraso >= 3) {
      fatores.push({ rotulo: "Sumido há mais de 3 ciclos de retorno", pontos: 35 });
      score += 35;
    } else if (atraso >= 2) {
      fatores.push({ rotulo: "Sumido há mais de 2 ciclos de retorno", pontos: 25 });
      score += 25;
    } else if (atraso >= 1) {
      fatores.push({ rotulo: "Passou do retorno", pontos: 14 });
      score += 14;
    }
  }

  /*
   * O SILÊNCIO DEPOIS DE TENTATIVA É O SINAL MAIS FORTE, e cresce rápido.
   *
   * Uma mensagem sem resposta é ruído: a pessoa estava ocupada. Três sem
   * resposta é uma decisão. É por isso que o segundo e o terceiro contato
   * valem mais que o primeiro — e não o contrário.
   *
   * E É O MAIOR PESO DA FUNÇÃO (40), acima até da ausência longa (35).
   *
   * A primeira versão dizia isto no comentário e dava 30 — abaixo dos 40 da
   * ausência. O código contradizia a própria justificativa, e o efeito era
   * concreto: alguém sumido há dois ciclos E ignorando três mensagens somava
   * 58 e não chegava a ALTO. Foi um teste que encontrou a contradição.
   */
  if (p.contatosSemResposta >= 3) {
    fatores.push({ rotulo: `${String(p.contatosSemResposta)} contatos sem resposta`, pontos: 40 });
    score += 40;
  } else if (p.contatosSemResposta === 2) {
    fatores.push({ rotulo: "2 contatos sem resposta", pontos: 20 });
    score += 20;
  } else if (p.contatosSemResposta === 1) {
    fatores.push({ rotulo: "1 contato sem resposta", pontos: 6 });
    score += 6;
  }

  if (p.faltouSemRemarcar) {
    fatores.push({ rotulo: "Faltou e não remarcou", pontos: 20 });
    score += 20;
  }

  /*
   * ORÇAMENTO PARADO PESA POUCO AQUI, de propósito.
   *
   * Ele é um forte sinal de OPORTUNIDADE — e o módulo de aceitação já cuida
   * disso. Como sinal de abandono é fraco: muita gente pede orçamento, pensa
   * por meses e volta. Pontuá-lo alto faria a lista de abandono virar uma
   * segunda lista de orçamentos, duplicando trabalho que já tem dono.
   */
  if (p.temOrcamentoParado) {
    fatores.push({ rotulo: "Orçamento aberto que não virou tratamento", pontos: 8 });
    score += 8;
  }

  const limitado = Math.max(0, Math.min(100, score));
  const faixa = limitado >= 60 ? "ALTO" : limitado >= 30 ? "MEDIO" : "BAIXO";

  return {
    score: limitado,
    faixa,
    fatores,
    sugestao: sugerir(faixa, p),
  };
}

/**
 * O que fazer — e nunca "entrar em contato", que não é sugestão nenhuma.
 *
 * A sugestão muda conforme o MOTIVO do risco, porque a ação certa para quem
 * não responde é o oposto da ação certa para quem só está atrasado.
 */
function sugerir(
  faixa: "ALTO" | "MEDIO" | "BAIXO",
  p: { contatosSemResposta: number; temOrcamentoParado: boolean },
): string {
  if (faixa === "BAIXO") return "Dentro do padrão. Nada a fazer agora.";

  /*
   * QUEM NÃO RESPONDE TRÊS VEZES NÃO PRECISA DE UMA QUARTA MENSAGEM.
   *
   * É o caminho mais rápido para o opt-out — e perder o canal é pior do que
   * perder a consulta, porque fecha a porta para sempre.
   */
  if (p.contatosSemResposta >= 3) {
    return "Parar de mandar mensagem. Se valer a pena, uma ligação de alguém — e depois deixar quieto.";
  }

  if (p.temOrcamentoParado) {
    return "Retomar pelo tratamento que ficou em aberto, e não por recall genérico.";
  }

  return "Convidar para o retorno, com um horário concreto em vez de “nos procure”.";
}

/* -------------------------------------------------------------------------- */
/* Household                                                                  */
/* -------------------------------------------------------------------------- */

export type Familiar = {
  patientId: string;
  nome: string;
  /** Por que achamos que são da mesma casa. */
  porque: string;
  /** Alguém confirmou, ou é só suspeita do sistema. */
  confirmado: boolean;
};

/**
 * Quem mora na mesma casa — inferido, e sempre rotulado como inferência.
 *
 * ============================================================================
 *  NÃO HÁ TABELA DE FAMÍLIA, E NÃO CRIEI UMA.
 *
 *  `crc_patient_identities` já marca identificador COMPARTILHADO desde a FASE
 *  D — e um telefone compartilhado entre dois pacientes é, na clínica real,
 *  quase sempre mãe e filho. Criar uma tabela de household exigiria alguém
 *  preenchê-la, e ninguém preenche.
 *
 *  O PREÇO DISSO É QUE A INFERÊNCIA ERRA: dois irmãos que dividem telefone
 *  aparecem juntos, e também aparece o casal que se separou e ninguém
 *  atualizou o cadastro. Por isso `confirmado` existe e a tela mostra a
 *  diferença — uma suspeita apresentada como fato é como um sistema começa a
 *  dizer à recepção coisas que ela sabe que são falsas.
 * ============================================================================
 */
export function inferirHousehold(
  identidades: readonly {
    patientId: string;
    nome: string;
    tipo: string;
    valor: string;
    compartilhada: boolean;
    confirmadaEm: string | null;
  }[],
  doPaciente: string,
): Familiar[] {
  const minhas = identidades.filter((i) => i.patientId === doPaciente && i.compartilhada);
  if (minhas.length === 0) return [];

  const meusValores = new Set(minhas.map((i) => `${i.tipo}:${i.valor}`));
  const encontrados = new Map<string, Familiar>();

  for (const i of identidades) {
    if (i.patientId === doPaciente) continue;
    if (!meusValores.has(`${i.tipo}:${i.valor}`)) continue;

    // O mais forte vence: uma confirmação humana não é rebaixada por um
    // segundo identificador só suspeito.
    const anterior = encontrados.get(i.patientId);
    const confirmado = i.confirmadaEm !== null;
    if (anterior !== undefined && anterior.confirmado && !confirmado) continue;

    encontrados.set(i.patientId, {
      patientId: i.patientId,
      nome: i.nome,
      porque: i.tipo === "TELEFONE" ? "Mesmo telefone" : `Mesmo ${i.tipo.toLowerCase()}`,
      confirmado,
    });
  }

  // Confirmados primeiro: são os que a tela pode afirmar.
  return [...encontrados.values()].sort(
    (a, b) => Number(b.confirmado) - Number(a.confirmado) || a.nome.localeCompare(b.nome),
  );
}
