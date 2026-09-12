/**
 * Next Best Action — a decisão, por oportunidade.
 *
 * ============================================================================
 *  ISTO NÃO É `proxima-acao.ts`, e a diferença não é de nome.
 *
 *    `proxima-acao.ts`  ordena PACIENTES por risco de sumir × dinheiro em
 *                       aberto. É a lista da recepção: com quem falar hoje.
 *
 *    este arquivo       decide, para UMA oportunidade concreta, QUAL É O
 *                       PRÓXIMO MOVIMENTO — e se ele pode sair sozinho.
 *
 *  A primeira responde "quem"; esta responde "o quê, e quem aperta o botão".
 *  Uma clínica precisa das duas: saber com quem falar não diz se o certo é
 *  mandar mensagem, oferecer horário ou parar de insistir.
 * ============================================================================
 *
 * ============================================================================
 *  A REGRA QUE NÃO PODE SER RELAXADA (§11 do Prompt Mestre):
 *
 *      O MODELO NUNCA DECIDE POLÍTICA DE SEGURANÇA.
 *
 *  Opt-out, cooldown, janela de horário, teto de contatos e consentimento são
 *  decididos AQUI, em código determinístico e testado. O modelo escreve o
 *  texto da mensagem DEPOIS que esta função já disse que pode haver mensagem.
 *
 *  A inversão — perguntar ao modelo "devo contatar?" — é a forma mais comum de
 *  furar opt-out em produção, porque basta uma conversa persuasiva para o
 *  modelo concluir que desta vez faz sentido.
 * ============================================================================
 */
import type { RiscoDaAcao, DominioAutonomia } from "./autonomia";
import type { TipoOportunidade } from "./tipos";

/** As treze ações do §11. A lista é fechada: ação nova é mudança de código. */
export type Acao =
  | "WAIT"
  | "WHATSAPP"
  | "CALL"
  | "OFFER_SLOTS"
  | "CREATE_TASK"
  | "START_JOURNEY"
  | "ADD_TO_CAMPAIGN"
  | "ASK_HUMAN"
  | "ASK_FOR_DATA"
  | "FOLLOW_UP"
  | "TRY_EARLIER_APPOINTMENT"
  | "CLOSE"
  | "ESCALATE";

export type Decisao = {
  acao: Acao;
  /** Texto pronto para a tela, na voz de quem vai executar. */
  rotulo: string;
  /** Por quê. Se estiver vazio, é bug: toda decisão tem motivo. */
  porque: string;
  /** Onde esta ação é contabilizada para o Centro de Autonomia. */
  dominio: DominioAutonomia;
  /** O risco da ação, que decide o nível mínimo de autonomia. */
  risco: RiscoDaAcao;
  /**
   * Código de motivo, estável e gravável.
   *
   * Existe porque "por que a automação contatou este paciente?" precisa ter
   * resposta seis meses depois, quando o texto em português já mudou três
   * vezes. É o §121 do Prompt Mestre.
   */
  reasonCode: string;
  /** `true` quando a ação NÃO pode sair sem alguém olhar, independente do nível. */
  exigeHumano: boolean;
};

export type ContextoDaDecisao = {
  tipo: TipoOportunidade;

  /* --- As travas. Nenhuma delas é negociável por score. ------------------- */
  /** A pessoa pediu para não receber contato. */
  optOut: boolean;
  /** Horas desde o nosso último contato. `null` = nunca contatamos. */
  horasDesdeUltimoContato: number | null;
  /** Horas de cooldown configuradas para esta clínica. */
  cooldownHoras: number;
  /** Já é hora comercial? Calculado fora, porque depende do fuso da clínica. */
  dentroDoHorario: boolean;
  /** Contatos proativos já feitos hoje a esta pessoa. */
  contatosHoje: number;
  /** Teto configurado de contatos por dia. */
  contatosPorDia: number;
  /** Temos um canal utilizável (telefone válido, conversa aberta)? */
  temCanal: boolean;
  /** A janela de 24h do WhatsApp está aberta (a pessoa escreveu recentemente). */
  janelaAberta: boolean;

  /* --- O estado da oportunidade ------------------------------------------ */
  /** Tentativas de contato sem nenhuma resposta. */
  tentativasSemResposta: number;
  /** Máximo de tentativas antes de desistir, da configuração da clínica. */
  tentativasMaximas: number;
  /** A pessoa respondeu em algum momento. */
  respondeu: boolean;
  /** Pediu explicitamente para marcar. */
  intencaoAgendar: boolean;
  /** Já tem consulta futura marcada. */
  temConsultaFutura: boolean;
  /** A última objeção registrada, quando existe. */
  objecao: "PRECO" | "TEMPO" | "MEDO" | "TERCEIRO" | "CONVENIO" | "CONFIANCA" | "OUTRO" | null;
  /** Perguntou algo clínico, ou o caso exige julgamento profissional. */
  exigeJulgamentoClinico: boolean;
  /** Há horário disponível compatível na agenda. */
  temHorarioDisponivel: boolean;
  /** Falta um dado sem o qual não dá para seguir (telefone, convênio). */
  dadoFaltante: string | null;
  /** Valor esperado, de `radar.ts`. Decide ligação versus mensagem. */
  valorEsperado: number;
  /** A oportunidade venceu. */
  expirada: boolean;
};

/**
 * Acima deste valor esperado, a recomendação vira LIGAÇÃO.
 *
 * O NÚMERO É SOBRE CUSTO DE OPORTUNIDADE, e não sobre o paciente. Uma ligação
 * custa de cinco a dez minutos de uma pessoa da recepção; uma mensagem custa
 * segundos. Abaixo de um certo valor esperado, ligar para todo mundo consome a
 * recepção inteira e a clínica para de atender quem está na sala.
 *
 * R$ 800 de valor ESPERADO (já com a probabilidade dentro) corresponde a um
 * orçamento de alguns milhares com chance razoável — é onde uma ligação se
 * paga com folga.
 */
export const VALOR_QUE_JUSTIFICA_LIGACAO = 800;

/**
 * A decisão.
 *
 * ============================================================================
 *  A ORDEM DAS PERGUNTAS É A POLÍTICA, e ela é lida de cima para baixo:
 *  as proibições primeiro, as esperas depois, e só no fim a escolha do que
 *  fazer. Qualquer troca de ordem aqui é uma mudança de política, não uma
 *  refatoração — e é por isso que cada bloco tem o motivo escrito ao lado.
 * ============================================================================
 */
export function decidir(ctx: ContextoDaDecisao): Decisao {
  /* ---------------------------------------------------------------- 1. Proibições */

  /*
   * OPT-OUT ENCERRA. Não adia, não rebaixa, não "tenta outro canal".
   *
   * E encerra com CLOSE, e não com WAIT: uma oportunidade de alguém que pediu
   * para não ser contatado não é uma oportunidade esperando o momento certo —
   * ela não existe mais, e deixá-la aberta faz a fila crescer com linhas que
   * ninguém pode tocar.
   */
  if (ctx.optOut) {
    return {
      acao: "CLOSE",
      rotulo: "Encerrar sem contato",
      porque: "Esta pessoa pediu para não receber contato.",
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "OPT_OUT",
      exigeHumano: false,
    };
  }

  if (ctx.expirada) {
    return {
      acao: "CLOSE",
      rotulo: "Encerrar — a janela passou",
      porque: "A oportunidade venceu: agir agora não muda mais o resultado.",
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "EXPIRADA",
      exigeHumano: false,
    };
  }

  /*
   * JULGAMENTO CLÍNICO VAI PARA PESSOA, SEMPRE — §77.
   *
   * Vem antes das esperas de propósito: alguém perguntando se pode tomar o
   * remédio não deve ficar em cooldown por ter recebido um lembrete ontem.
   */
  if (ctx.exigeJulgamentoClinico) {
    return {
      acao: "ESCALATE",
      rotulo: "Passar para a equipe clínica",
      porque: "A pergunta é clínica. O sistema não responde, não orienta e não tranquiliza.",
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "CLINICAL_QUESTION",
      exigeHumano: true,
    };
  }

  /* -------------------------------------------------------------- 2. Desistência */

  /*
   * O LIMITE DE TENTATIVAS É UM COMPROMISSO COM O PACIENTE, não uma otimização.
   *
   * Depois de N contatos sem uma palavra de volta, continuar é assédio com
   * outro nome. Encerra e devolve para uma pessoa decidir se vale uma ligação.
   */
  if (ctx.tentativasSemResposta >= ctx.tentativasMaximas && !ctx.respondeu) {
    return {
      acao: "CREATE_TASK",
      rotulo: "Criar tarefa para uma pessoa decidir",
      porque: `${String(ctx.tentativasSemResposta)} contatos sem resposta. A automação para aqui.`,
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "SEM_RESPOSTA_LIMITE",
      exigeHumano: true,
    };
  }

  /* ------------------------------------------------------------------ 3. Esperas */

  if (!ctx.temCanal) {
    return {
      acao: "ASK_FOR_DATA",
      rotulo: "Falta forma de contato",
      porque: "Não há telefone utilizável nem conversa aberta com esta pessoa.",
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "SEM_CANAL",
      exigeHumano: true,
    };
  }

  if (ctx.dadoFaltante !== null) {
    return {
      acao: "ASK_FOR_DATA",
      rotulo: `Falta ${ctx.dadoFaltante}`,
      porque: `Sem ${ctx.dadoFaltante} não dá para seguir com esta oportunidade.`,
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "DADO_FALTANTE",
      exigeHumano: true,
    };
  }

  /*
   * CONSULTA MARCADA NÃO É FIM, É ESPERA.
   *
   * A oportunidade continua viva — o orçamento não foi aprovado, o tratamento
   * não começou. Mas cutucar quem já tem hora marcada é a forma mais rápida de
   * transformar automação em irritação.
   */
  if (ctx.temConsultaFutura) {
    return {
      acao: "WAIT",
      rotulo: "Aguardar a consulta",
      porque: "Já tem consulta marcada. O assunto se resolve melhor na cadeira.",
      dominio: "agenda",
      risco: "BAIXO",
      reasonCode: "CONSULTA_MARCADA",
      exigeHumano: false,
    };
  }

  const emCooldown =
    ctx.horasDesdeUltimoContato !== null && ctx.horasDesdeUltimoContato < ctx.cooldownHoras;

  if (emCooldown) {
    return {
      acao: "WAIT",
      rotulo: "Aguardar o intervalo entre contatos",
      porque: `Falamos há ${String(Math.round(ctx.horasDesdeUltimoContato ?? 0))}h; o intervalo configurado é de ${String(ctx.cooldownHoras)}h.`,
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "COOLDOWN",
      exigeHumano: false,
    };
  }

  if (ctx.contatosHoje >= ctx.contatosPorDia) {
    return {
      acao: "WAIT",
      rotulo: "Aguardar — teto de contatos do dia",
      porque: `Esta pessoa já recebeu ${String(ctx.contatosHoje)} contato(s) hoje, e o teto é ${String(ctx.contatosPorDia)}.`,
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "TETO_DIARIO",
      exigeHumano: false,
    };
  }

  /*
   * FORA DO HORÁRIO É ESPERA, E NÃO BLOQUEIO.
   *
   * A distinção importa para a fila: às 22h a ação certa continua sendo a
   * mesma, só não agora. Devolver CLOSE aqui perderia a oportunidade até a
   * próxima varredura enxergá-la de novo.
   *
   * A EXCEÇÃO É A JANELA ABERTA: se a pessoa escreveu agora, responder às 22h é
   * atendimento, não disparo. Quem está do outro lado esperando resposta não se
   * importa com o horário comercial da clínica.
   */
  if (!ctx.dentroDoHorario && !ctx.janelaAberta) {
    return {
      acao: "WAIT",
      rotulo: "Aguardar o horário comercial",
      porque: "Fora da janela de envio configurada para esta clínica.",
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "FORA_DO_HORARIO",
      exigeHumano: false,
    };
  }

  /* ------------------------------------------------------------------ 4. A ação */

  /*
   * PEDIU PARA MARCAR: oferecer horário é a única resposta certa.
   *
   * Vem antes de tudo que é objeção e valor porque é a intenção declarada, e
   * responder outra coisa a quem pediu horário é a forma mais barata de perder
   * uma conversão já ganha.
   */
  if (ctx.intencaoAgendar) {
    if (!ctx.temHorarioDisponivel) {
      return {
        acao: "ASK_HUMAN",
        rotulo: "Pediu horário e a agenda está cheia",
        porque: "A pessoa quer marcar e não há horário compatível. Isso é decisão de encaixe.",
        dominio: "agenda",
        risco: "BAIXO",
        reasonCode: "SEM_HORARIO_COMPATIVEL",
        exigeHumano: true,
      };
    }
    return {
      acao: "OFFER_SLOTS",
      rotulo: "Oferecer horários",
      porque: "A pessoa pediu para marcar.",
      dominio: "agenda",
      risco: "MEDIO",
      reasonCode: "INTENCAO_AGENDAR",
      exigeHumano: false,
    };
  }

  /*
   * AS OBJEÇÕES QUE UMA MÁQUINA NÃO DEVE TENTAR CONTORNAR.
   *
   * Preço e medo não se resolvem com mais uma mensagem. Preço é negociação —
   * envolve desconto e parcelamento, que são política da clínica e têm alçada
   * (§29). Medo é uma conversa que precisa de outra pessoa.
   *
   * Insistir por mensagem nesses dois casos não converte: queima.
   */
  if (ctx.objecao === "PRECO") {
    return {
      acao: "ASK_HUMAN",
      rotulo: "Objeção de preço — falar com a equipe",
      porque:
        "A pessoa disse que está caro. Desconto e parcelamento têm alçada, e a automação não negocia.",
      dominio: "tratamento",
      risco: "BAIXO",
      reasonCode: "OBJECAO_PRECO",
      exigeHumano: true,
    };
  }

  if (ctx.objecao === "MEDO") {
    return {
      acao: "ESCALATE",
      rotulo: "Medo do procedimento — passar para a equipe",
      porque: "Medo se resolve com uma pessoa explicando, não com mais uma mensagem automática.",
      dominio: "tratamento",
      risco: "BAIXO",
      reasonCode: "OBJECAO_MEDO",
      exigeHumano: true,
    };
  }

  /*
   * TEMPO E TERCEIRO SÃO ESPERAS LEGÍTIMAS. "Vou ver com meu marido" e "esse
   * mês não dá" são respostas que pedem um retorno depois, não uma réplica.
   */
  if (ctx.objecao === "TEMPO" || ctx.objecao === "TERCEIRO") {
    return {
      acao: "FOLLOW_UP",
      rotulo: "Retomar depois",
      porque:
        ctx.objecao === "TEMPO"
          ? "A pessoa disse que agora não dá. Retomar mais tarde é melhor do que insistir."
          : "A decisão depende de outra pessoa. Dar tempo é parte do processo.",
      dominio: "tratamento",
      risco: "MEDIO",
      reasonCode: ctx.objecao === "TEMPO" ? "OBJECAO_TEMPO" : "OBJECAO_TERCEIRO",
      exigeHumano: false,
    };
  }

  if (ctx.objecao === "CONVENIO") {
    return {
      acao: "ASK_HUMAN",
      rotulo: "Dúvida de convênio",
      porque:
        "Cobertura de convênio depende de consulta ao plano, e errar isso gera promessa falsa.",
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "OBJECAO_CONVENIO",
      exigeHumano: true,
    };
  }

  /*
   * DINHEIRO GRANDE PEDE VOZ.
   *
   * Acima do limiar, a recomendação é ligar — mesmo que mandar mensagem fosse
   * mais barato. Uma pessoa com R$ 12 mil de tratamento parado responde a uma
   * ligação e ignora a sexta mensagem.
   *
   * LIGAÇÃO É SEMPRE TAREFA HUMANA aqui. Existe abstração de voz no §22, mas
   * não existe provedor ligado — e recomendar "o sistema liga" sem provedor
   * seria exatamente o placeholder que o §131 proíbe.
   */
  if (ctx.valorEsperado >= VALOR_QUE_JUSTIFICA_LIGACAO) {
    return {
      acao: "CALL",
      rotulo: "Ligar",
      porque: `Valor esperado de R$ ${ctx.valorEsperado.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} justifica uma ligação.`,
      dominio: "mensagens",
      risco: "MEDIO",
      reasonCode: "VALOR_ALTO_LIGACAO",
      exigeHumano: true,
    };
  }

  /*
   * JÁ RESPONDEU ALGUMA VEZ → a conversa existe, e o certo é continuá-la.
   * NUNCA RESPONDEU → é abordagem, e abordagem em lote é campanha, não
   * conversa individual. Isso mantém o volume previsível e a cadência sob o
   * controle da campanha, que já tem teto diário e janela.
   */
  if (ctx.respondeu || ctx.janelaAberta) {
    return {
      acao: "WHATSAPP",
      rotulo: "Responder pelo WhatsApp",
      porque: "A conversa está aberta com esta pessoa.",
      dominio: "mensagens",
      risco: "BAIXO",
      reasonCode: "CONVERSA_ABERTA",
      exigeHumano: false,
    };
  }

  if (ctx.tipo === "RECALL" || ctx.tipo === "INACTIVE_PATIENT") {
    return {
      acao: "ADD_TO_CAMPAIGN",
      rotulo: "Incluir na campanha de retorno",
      porque: "Contato de retorno sai em lote, com teto diário e horário controlados.",
      dominio: "recall",
      risco: "MEDIO",
      reasonCode: "RECALL_EM_LOTE",
      exigeHumano: false,
    };
  }

  return {
    acao: "START_JOURNEY",
    rotulo: "Iniciar a jornada do tipo",
    porque: "Primeiro contato desta oportunidade, pela sequência configurada.",
    dominio: "mensagens",
    risco: "MEDIO",
    reasonCode: "PRIMEIRO_CONTATO",
    exigeHumano: false,
  };
}

/**
 * As ações que TOCAM O PACIENTE quando acontecem.
 *
 * `CALL` está aqui, e é o caso que ensina a diferença: uma ligação chega na
 * pessoa do mesmo jeito que uma mensagem. Quem a executa é outra pergunta.
 */
const COM_EFEITO_EXTERNO: ReadonlySet<Acao> = new Set<Acao>([
  "WHATSAPP",
  "CALL",
  "OFFER_SLOTS",
  "ADD_TO_CAMPAIGN",
  "START_JOURNEY",
  "FOLLOW_UP",
  "TRY_EARLIER_APPOINTMENT",
]);

export function temEfeitoExterno(acao: Acao): boolean {
  return COM_EFEITO_EXTERNO.has(acao);
}

/**
 * O sistema pode executar isto SOZINHO?
 *
 * ============================================================================
 *  ESTA É A PERGUNTA QUE O DESPACHO FAZ, e ela é diferente de
 *  `temEfeitoExterno`. A distinção nasceu de um teste que falhou por eu ter
 *  confundido as duas, e vale escrever:
 *
 *    temEfeitoExterno   a ação CHEGA no paciente?          `CALL` → sim
 *    podeSairSozinho    o CRC executa sem pessoa no meio?  `CALL` → NÃO
 *
 *  `CALL` toca o paciente e exige gente: não há provedor de voz ligado, então
 *  quem disca é a recepção. Tratar as duas como a mesma coisa levaria a um de
 *  dois erros — ou a ligação nunca ser recomendada, ou o motor tentar
 *  "executar" uma ligação que ninguém pode executar.
 *
 *  É ESTA função que o Centro de Autonomia consulta, e não a de cima.
 * ============================================================================
 */
export function podeSairSozinho(decisao: Decisao): boolean {
  return temEfeitoExterno(decisao.acao) && !decisao.exigeHumano;
}
