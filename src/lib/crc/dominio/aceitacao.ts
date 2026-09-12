/**
 * Aceitação de tratamento — o orçamento que ainda pode virar tratamento.
 *
 * ============================================================================
 *  O DINHEIRO MAIS BARATO QUE A CLÍNICA TEM.
 *
 *  A conversão de orçamento num consultório típico fica entre 35% e 55%. Quase
 *  metade do que já foi examinado, diagnosticado e orçado nunca vira nada — e
 *  esse paciente já veio, já foi atendido, já ouviu a proposta. Não precisa de
 *  anúncio nem de captação: precisa de alguém retomando a conversa na hora
 *  certa, com o argumento certo.
 *
 *  Este arquivo decide as duas coisas: QUANDO retomar, e o que NÃO tentar.
 * ============================================================================
 *
 * ============================================================================
 *  A LINHA QUE ESTE MÓDULO NÃO CRUZA, e ela é do §77:
 *
 *      O SISTEMA FAZ FOLLOW-UP COMERCIAL E ADMINISTRATIVO.
 *      O SISTEMA NÃO ALTERA PLANO CLÍNICO.
 *
 *  "Vamos retomar aquele orçamento?" é comercial. "Você pode fazer só a
 *  restauração e deixar o implante para depois" é clínico — é mudar o plano do
 *  dentista para fechar uma venda, e não é papel de nenhuma automação.
 *
 *  Por isso `proximaAcao` nunca devolve nada que envolva mexer no escopo do
 *  tratamento: quando o caminho passa por aí, a saída é `FALAR_COM_DENTISTA`.
 * ============================================================================
 *
 * TUDO PURO.
 */
import type { CategoriaObjecao } from "./objecoes";

export const VERSAO_DA_ACEITACAO = "aceitacao-1";

/* -------------------------------------------------------------------------- */
/* O funil                                                                    */
/* -------------------------------------------------------------------------- */

export type EtapaDoFunil =
  | "PROPOSED"
  | "THINKING"
  | "PRICE_OBJECTION"
  | "FEAR_OBJECTION"
  | "TIME_OBJECTION"
  | "FAMILY_DECISION"
  | "PAYMENT_OBJECTION"
  | "NO_RESPONSE"
  | "ACCEPTED"
  | "SCHEDULED"
  | "STARTED"
  | "LOST";

/**
 * A etapa que corresponde a cada objeção.
 *
 * O MAPA EXISTE PARA A TELA NÃO PRECISAR DE DOIS CAMPOS. Guardar "objeção:
 * PRECO" e "etapa: PRICE_OBJECTION" separados é guardar a mesma coisa duas
 * vezes, e garantir que um dia elas divirjam.
 */
const ETAPA_POR_OBJECAO: Readonly<Record<CategoriaObjecao, EtapaDoFunil>> = {
  PRECO: "PRICE_OBJECTION",
  MEDO: "FEAR_OBJECTION",
  TEMPO: "TIME_OBJECTION",
  TERCEIRO: "FAMILY_DECISION",
  CONVENIO: "PAYMENT_OBJECTION",
  CONFIANCA: "THINKING",
  OUTRO: "THINKING",
};

export function etapaDaObjecao(categoria: CategoriaObjecao): EtapaDoFunil {
  return ETAPA_POR_OBJECAO[categoria];
}

/** As etapas em que o orçamento ainda pode fechar. */
const ABERTAS: ReadonlySet<EtapaDoFunil> = new Set<EtapaDoFunil>([
  "PROPOSED",
  "THINKING",
  "PRICE_OBJECTION",
  "FEAR_OBJECTION",
  "TIME_OBJECTION",
  "FAMILY_DECISION",
  "PAYMENT_OBJECTION",
  "NO_RESPONSE",
  "ACCEPTED",
  "SCHEDULED",
]);

export function aindaPodeFechar(etapa: EtapaDoFunil): boolean {
  return ABERTAS.has(etapa);
}

/**
 * `ACCEPTED` ainda está aberto, e isso não é engano.
 *
 * ============================================================================
 *  ACEITAR NÃO É COMEÇAR, e a distância entre os dois é onde mais se perde
 *  dinheiro sem ninguém notar.
 *
 *  A pessoa diz "pode marcar" e vai embora. Ninguém marca. Duas semanas depois
 *  ela esfriou, e o orçamento consta como APROVADO no sistema da clínica —
 *  então ninguém o procura na lista de pendências.
 *
 *  Um orçamento aceito e não agendado é a oportunidade mais quente que existe,
 *  e a mais fácil de perder de vista.
 * ============================================================================
 */
export function aceitoSemAgendar(etapa: EtapaDoFunil): boolean {
  return etapa === "ACCEPTED";
}

/* -------------------------------------------------------------------------- */
/* A chance de fechar                                                         */
/* -------------------------------------------------------------------------- */

export type ContextoDeAceitacao = {
  etapa: EtapaDoFunil;
  /** Valor total do orçamento, em reais. */
  valor: number;
  /** Dias desde a emissão. */
  diasDesdeProposta: number;
  /** Quantas vezes já retomamos. */
  tentativas: number;
  /** A pessoa respondeu a alguma retomada. */
  respondeu: boolean;
  /** Consultas concluídas — mede o vínculo com a clínica. */
  consultasConcluidas: number;
  /** A pessoa tem consulta futura marcada. */
  temConsultaFutura: boolean;
  /** Parte do orçamento já foi aprovada formalmente. */
  parcialmenteAprovado: boolean;
};

export type FatorDeAceitacao = { chave: string; rotulo: string; efeito: number };

export type ChanceDeAceitar = {
  probabilidade: number;
  confianca: number;
  fatores: FatorDeAceitacao[];
  versao: string;
};

/**
 * A taxa base por etapa.
 *
 * ============================================================================
 *  SÃO PALPITES, DECLARADOS COMO PALPITES — a mesma regra de `radar.ts`.
 *
 *  Não existe medição desta clínica: a tabela de objeções nasce agora. O que
 *  existe é ordem de grandeza plausível, escolhida para a ORDENAÇÃO entre
 *  etapas fazer sentido no primeiro dia.
 *
 *  A confiança nasce baixa por isso, e a tela avisa.
 * ============================================================================
 */
const BASE_POR_ETAPA: Readonly<Record<EtapaDoFunil, number>> = {
  // Acabou de ouvir a proposta: metade fecha.
  PROPOSED: 0.45,
  THINKING: 0.3,
  // Preço é a objeção mais comum e a que menos converte sozinha — ela precisa
  // de uma ação (parcelamento, revisão de escopo pelo dentista), não de insistência.
  PRICE_OBJECTION: 0.14,
  // Medo converte bem QUANDO alguém conversa. O número baixo aqui reflete o que
  // acontece quando ninguém conversa.
  FEAR_OBJECTION: 0.18,
  // "Esse mês não dá" é quase sempre verdade, e quase sempre passa.
  TIME_OBJECTION: 0.34,
  FAMILY_DECISION: 0.28,
  PAYMENT_OBJECTION: 0.2,
  // Silêncio é o pior estado: nem objeção houve.
  NO_RESPONSE: 0.08,
  // Já disse sim. O que falta é marcar — e marcar é trabalho da clínica.
  ACCEPTED: 0.8,
  SCHEDULED: 0.92,
  STARTED: 1,
  LOST: 0,
};

export const CONFIANCA_SEM_HISTORICO_DE_ACEITACAO = 0.2;

/**
 * A chance de este orçamento virar tratamento.
 *
 * MULTIPLICATIVO, pela mesma razão do Radar: a base já é probabilidade, e somar
 * pontos produziria valores acima de 1.
 */
export function estimarAceitacao(ctx: ContextoDeAceitacao): ChanceDeAceitar {
  const fatores: FatorDeAceitacao[] = [];
  const base = BASE_POR_ETAPA[ctx.etapa];
  let p = base;

  fatores.push({
    chave: "etapa",
    rotulo: rotuloDaEtapa(ctx.etapa),
    efeito: 0,
  });

  if (ctx.etapa === "LOST") {
    return {
      probabilidade: 0,
      confianca: 1,
      fatores,
      versao: VERSAO_DA_ACEITACAO,
    };
  }

  /*
   * 1. O TEMPO É O MAIOR INIMIGO AQUI, e mais forte que no Radar.
   *
   * Um orçamento esfria rápido: a decisão de fazer um tratamento caro é tomada
   * nas primeiras semanas ou não é tomada. Depois de seis meses, o que existe
   * não é um orçamento pendente — é um orçamento vencido que ninguém fechou na
   * tela.
   */
  if (ctx.diasDesdeProposta >= 180) {
    const antes = p;
    p *= 0.25;
    fatores.push({ chave: "idade", rotulo: "Proposto há mais de 6 meses", efeito: p - antes });
  } else if (ctx.diasDesdeProposta >= 90) {
    const antes = p;
    p *= 0.5;
    fatores.push({ chave: "idade", rotulo: "Proposto há mais de 3 meses", efeito: p - antes });
  } else if (ctx.diasDesdeProposta >= 30) {
    const antes = p;
    p *= 0.75;
    fatores.push({ chave: "idade", rotulo: "Proposto há mais de um mês", efeito: p - antes });
  } else if (ctx.diasDesdeProposta <= 7) {
    const antes = p;
    p = Math.min(0.95, p * 1.25);
    fatores.push({ chave: "idade", rotulo: "Proposto esta semana", efeito: p - antes });
  }

  // 2. Responder é sair do silêncio. É o maior salto positivo.
  if (ctx.respondeu) {
    const antes = p;
    p = Math.min(0.95, p * 1.7);
    fatores.push({ chave: "resposta", rotulo: "Respondeu à retomada", efeito: p - antes });
  }

  // 3. Silêncio repetido.
  if (ctx.tentativas > 0 && !ctx.respondeu) {
    const antes = p;
    p *= Math.pow(0.65, Math.min(ctx.tentativas, 4));
    fatores.push({
      chave: "silencio",
      rotulo: `${String(ctx.tentativas)} retomada(s) sem resposta`,
      efeito: p - antes,
    });
  }

  /*
   * 4. JÁ TEM CONSULTA MARCADA sobe MUITO, e é o oposto do Radar.
   *
   * Lá, consulta marcada derruba a prioridade: não precisa de ligação. Aqui
   * sobe: a pessoa vai estar na cadeira, vai ouvir o dentista, e a conversa
   * sobre o tratamento acontece no melhor lugar possível.
   */
  if (ctx.temConsultaFutura) {
    const antes = p;
    p = Math.min(0.95, p * 1.45);
    fatores.push({
      chave: "agenda",
      rotulo: "Tem consulta marcada — a conversa acontece na cadeira",
      efeito: p - antes,
    });
  }

  // 5. Aprovação parcial é a prova de que a pessoa quis: já pagou parte.
  if (ctx.parcialmenteAprovado) {
    const antes = p;
    p = Math.min(0.95, p * 1.4);
    fatores.push({ chave: "parcial", rotulo: "Parte já aprovada", efeito: p - antes });
  }

  /*
   * 6. VALOR ALTO REDUZ A CHANCE. Não é pessimismo: é a realidade de uma
   * decisão de R$ 18.000 contra uma de R$ 600. Ignorar isso faria a fila
   * prometer conversão alta justamente nos casos que mais demoram.
   */
  if (ctx.valor >= 15000) {
    const antes = p;
    p *= 0.6;
    fatores.push({ chave: "valor", rotulo: "Valor alto — decisão mais lenta", efeito: p - antes });
  } else if (ctx.valor >= 6000) {
    const antes = p;
    p *= 0.8;
    fatores.push({ chave: "valor", rotulo: "Valor relevante", efeito: p - antes });
  }

  // 7. Vínculo.
  if (ctx.consultasConcluidas >= 5) {
    const antes = p;
    p = Math.min(0.95, p * 1.2);
    fatores.push({ chave: "vinculo", rotulo: "Paciente de longa data", efeito: p - antes });
  }

  const probabilidade = Math.max(0.01, Math.min(0.95, p));
  fatores.sort((a, b) => Math.abs(b.efeito) - Math.abs(a.efeito));

  return {
    probabilidade: Number(probabilidade.toFixed(3)),
    confianca: CONFIANCA_SEM_HISTORICO_DE_ACEITACAO,
    fatores,
    versao: VERSAO_DA_ACEITACAO,
  };
}

function rotuloDaEtapa(e: EtapaDoFunil): string {
  const MAPA: Readonly<Record<EtapaDoFunil, string>> = {
    PROPOSED: "Orçamento apresentado",
    THINKING: "Pensando",
    PRICE_OBJECTION: "Achou caro",
    FEAR_OBJECTION: "Tem medo do procedimento",
    TIME_OBJECTION: "Agora não dá",
    FAMILY_DECISION: "Depende de outra pessoa",
    PAYMENT_OBJECTION: "Forma de pagamento ou convênio",
    NO_RESPONSE: "Sem resposta",
    ACCEPTED: "Aceitou e não marcou",
    SCHEDULED: "Marcado",
    STARTED: "Tratamento iniciado",
    LOST: "Perdido",
  };
  return MAPA[e];
}

/* -------------------------------------------------------------------------- */
/* A próxima ação                                                             */
/* -------------------------------------------------------------------------- */

export type AcaoDeAceitacao =
  | "AGENDAR"
  | "RETOMAR"
  | "AGUARDAR"
  | "OFERECER_PARCELAMENTO"
  | "FALAR_COM_DENTISTA"
  | "PASSAR_PARA_EQUIPE"
  | "ENCERRAR";

export type PlanoDeAceitacao = {
  acao: AcaoDeAceitacao;
  rotulo: string;
  porque: string;
  /** Dias até a próxima tentativa. `null` quando a ação é agora. */
  emDias: number | null;
  /** `true` quando a automação NÃO pode executar sozinha. */
  exigeHumano: boolean;
};

/**
 * Quantas retomadas antes de parar.
 *
 * TRÊS. Depois disso, continuar é insistência — e a diferença entre follow-up e
 * insistência é o que decide se a clínica é lembrada com boa ou má vontade.
 */
export const RETOMADAS_MAXIMAS = 3;

/**
 * O que fazer com este orçamento.
 *
 * ============================================================================
 *  DUAS DECISÕES QUE ESTA FUNÇÃO TOMA E QUE PARECEM ERRADAS ATÉ SE PENSAR:
 *
 *  PREÇO NÃO VIRA "OFERECER DESCONTO". Vira `OFERECER_PARCELAMENTO` quando a
 *  clínica tem opção configurada, e `FALAR_COM_DENTISTA` quando não tem —
 *  porque a alternativa real a "está caro" costuma ser reduzir o escopo, e
 *  reduzir escopo é decisão clínica (§77). Desconto tem alçada (§29) e não é
 *  da automação.
 *
 *  MEDO NÃO VIRA MENSAGEM NENHUMA. Vira `PASSAR_PARA_EQUIPE`. Medo de dentista
 *  não se resolve com texto bem escrito; resolve-se com uma pessoa explicando o
 *  procedimento e oferecendo sedação. Mandar mais uma mensagem para quem tem
 *  medo é a forma mais rápida de perder o paciente de vez.
 * ============================================================================
 */
export function proximaAcaoDeAceitacao(
  ctx: ContextoDeAceitacao & { temParcelamento: boolean },
): PlanoDeAceitacao {
  if (ctx.etapa === "LOST" || ctx.etapa === "STARTED") {
    return {
      acao: "ENCERRAR",
      rotulo: "Encerrar",
      porque: ctx.etapa === "STARTED" ? "O tratamento já começou." : "Já foi dado como perdido.",
      emDias: null,
      exigeHumano: false,
    };
  }

  /*
   * ACEITOU E NÃO MARCOU é a prioridade máxima do funil, e vem antes de tudo.
   *
   * É a oportunidade mais quente que existe — a pessoa já disse sim — e a mais
   * fácil de perder de vista, porque o sistema da clínica mostra o orçamento
   * como aprovado e ninguém o procura na lista de pendências.
   */
  if (ctx.etapa === "ACCEPTED" && !ctx.temConsultaFutura) {
    return {
      acao: "AGENDAR",
      rotulo: "Marcar o tratamento",
      porque: "A pessoa já aceitou e ainda não tem data. É o caso mais quente do funil.",
      emDias: null,
      exigeHumano: false,
    };
  }

  if (ctx.etapa === "SCHEDULED" || ctx.temConsultaFutura) {
    return {
      acao: "AGUARDAR",
      rotulo: "Aguardar a consulta",
      porque: "Tem data marcada. A conversa sobre o tratamento acontece melhor na cadeira.",
      emDias: null,
      exigeHumano: false,
    };
  }

  if (ctx.tentativas >= RETOMADAS_MAXIMAS && !ctx.respondeu) {
    return {
      acao: "PASSAR_PARA_EQUIPE",
      rotulo: "Passar para a equipe decidir",
      porque: `${String(ctx.tentativas)} retomadas sem resposta. A automação para aqui.`,
      emDias: null,
      exigeHumano: true,
    };
  }

  if (ctx.etapa === "FEAR_OBJECTION") {
    return {
      acao: "PASSAR_PARA_EQUIPE",
      rotulo: "Medo — conversa com a equipe",
      porque:
        "Medo do procedimento não se resolve por mensagem. Precisa de alguém explicando, e possivelmente de sedação.",
      emDias: null,
      exigeHumano: true,
    };
  }

  if (ctx.etapa === "PRICE_OBJECTION" || ctx.etapa === "PAYMENT_OBJECTION") {
    if (ctx.temParcelamento) {
      return {
        acao: "OFERECER_PARCELAMENTO",
        rotulo: "Mostrar as condições de pagamento",
        porque: "A objeção é de valor, e a clínica tem condição cadastrada para oferecer.",
        emDias: null,
        // Mostrar condição JÁ CONFIGURADA não é negociar: é informar. Inventar
        // desconto seria negociar, e isso tem alçada (§29).
        exigeHumano: false,
      };
    }
    return {
      acao: "FALAR_COM_DENTISTA",
      rotulo: "Rever o caso com o dentista",
      porque:
        "A alternativa a “está caro” costuma ser ajustar o escopo do tratamento — e isso é decisão clínica, não comercial.",
      emDias: null,
      exigeHumano: true,
    };
  }

  /*
   * TEMPO E FAMÍLIA PEDEM ESPERA, e a espera é longa de propósito.
   *
   * "Esse mês não dá" quer dizer literalmente isso. Voltar em cinco dias é
   * ignorar o que a pessoa disse; voltar em três semanas é ter escutado.
   */
  if (ctx.etapa === "TIME_OBJECTION") {
    return {
      acao: "RETOMAR",
      rotulo: "Retomar em três semanas",
      porque: "A pessoa disse que agora não dá. Voltar antes é ignorar o que ela falou.",
      emDias: 21,
      exigeHumano: false,
    };
  }

  if (ctx.etapa === "FAMILY_DECISION") {
    return {
      acao: "RETOMAR",
      rotulo: "Retomar em uma semana",
      porque: "A decisão depende de outra pessoa. Uma semana é o tempo de essa conversa acontecer.",
      emDias: 7,
      exigeHumano: false,
    };
  }

  if (ctx.diasDesdeProposta >= 180) {
    return {
      acao: "ENCERRAR",
      rotulo: "Encerrar por idade",
      porque:
        "Proposto há mais de seis meses sem avanço. Manter aberto infla o funil e esconde o que ainda é real.",
      emDias: null,
      exigeHumano: false,
    };
  }

  // O caso comum: proposto, pensando, ou sem resposta — e ainda dentro do prazo.
  return {
    acao: "RETOMAR",
    rotulo: ctx.tentativas === 0 ? "Primeira retomada" : "Retomar",
    porque:
      ctx.tentativas === 0
        ? "O orçamento foi apresentado e ninguém voltou a falar dele."
        : "Ainda dentro da janela de decisão.",
    emDias: ctx.tentativas === 0 ? 3 : 10,
    exigeHumano: false,
  };
}
