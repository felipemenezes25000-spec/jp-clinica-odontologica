/**
 * Qualidade do atendimento — o que a ligação deixou de fazer.
 *
 * ============================================================================
 *  ESTE MÓDULO MEDE O ATENDIMENTO, E NÃO A PESSOA. A distinção decide se ele
 *  ajuda ou destrói a equipe.
 *
 *  "A Raphaela tem nota 62" é um ranking, e ranking de atendente numa clínica
 *  pequena produz uma coisa só: a pessoa para de registrar o que correu mal.
 *  A partir daí o painel fica bonito e cego.
 *
 *  "37 ligações terminaram sem oferta de horário" é um FATO SOBRE O PROCESSO, e
 *  a pergunta que ele levanta é outra: por que não ofereceram? A agenda estava
 *  cheia? Ninguém sabia consultar? O sistema é lento na hora da ligação?
 *
 *  Por isso o §24 pede "sempre com evidências" e "evitar linguagem punitiva", e
 *  por isso os agregados aqui são por CLÍNICA e por PERÍODO — nunca com nome de
 *  pessoa no rótulo.
 * ============================================================================
 *
 * TUDO PURO.
 */

export const VERSAO_DO_ATENDIMENTO = "atendimento-1";

/* -------------------------------------------------------------------------- */
/* A ligação                                                                  */
/* -------------------------------------------------------------------------- */

export type IntencaoDaChamada =
  | "AGENDAR"
  | "REMARCAR"
  | "CANCELAR"
  | "DUVIDA"
  | "ORCAMENTO"
  | "RECLAMACAO"
  | "ADMINISTRATIVO"
  | "OUTRO";

export type ContextoDaChamada = {
  intencao: IntencaoDaChamada;
  /** A ligação foi atendida. */
  atendida: boolean;
  duracaoS: number | null;
  /** Alguém ofereceu horário durante a ligação. */
  ofereceuHorario: boolean;
  /** A ligação terminou com consulta marcada. */
  marcouConsulta: boolean;
  /** Ficou uma tarefa ou follow-up registrado. */
  deixouProximoPasso: boolean;
  /** O caso foi passado para outra pessoa. */
  transferida: boolean;
};

export type FatorDoAtendimento = { chave: string; rotulo: string; pontos: number };

export type AvaliacaoDaChamada = {
  score: number;
  fatores: FatorDoAtendimento[];
  /** `true` quando a ligação pedia agendamento e não virou nada. */
  oportunidadePerdida: boolean;
  motivoPerda: string | null;
  versao: string;
};

/**
 * As intenções em que NÃO oferecer horário é uma falha.
 *
 * A lista é curta de propósito. Alguém ligando para perguntar o endereço não
 * precisa ouvir oferta de horário — e contar isso como falha encheria o painel
 * de falso positivo até ninguém olhar mais.
 */
const PEDEM_HORARIO: ReadonlySet<IntencaoDaChamada> = new Set<IntencaoDaChamada>([
  "AGENDAR",
  "REMARCAR",
  "ORCAMENTO",
]);

/**
 * Avalia a ligação.
 *
 * A SAÍDA QUE IMPORTA É `oportunidadePerdida`, e não o score. O score ordena
 * uma lista; a oportunidade perdida é o que alguém pode ir atrás hoje.
 */
export function avaliarChamada(ctx: ContextoDaChamada): AvaliacaoDaChamada {
  const fatores: FatorDoAtendimento[] = [];
  const somar = (chave: string, rotulo: string, pontos: number): void => {
    if (pontos !== 0) fatores.push({ chave, rotulo, pontos });
  };

  /*
   * NÃO ATENDIDA NÃO É NOTA BAIXA — é ausência de nota.
   *
   * Pontuar uma ligação perdida como "atendimento ruim" mistura duas coisas: a
   * qualidade de quem atendeu e a capacidade de atender. A segunda é um
   * problema de escala, e aparece na contagem de perdidas, não na média.
   */
  if (!ctx.atendida) {
    return {
      score: 0,
      fatores: [{ chave: "perdida", rotulo: "Ligação não atendida", pontos: 0 }],
      // Uma ligação perdida É oportunidade perdida: alguém quis falar e não
      // conseguiu. É o dado mais acionável que existe numa recepção.
      oportunidadePerdida: true,
      motivoPerda: "Ninguém atendeu.",
      versao: VERSAO_DO_ATENDIMENTO,
    };
  }

  somar("atendida", "Atendida", 40);

  const pediaHorario = PEDEM_HORARIO.has(ctx.intencao);

  if (ctx.marcouConsulta) {
    somar("marcou", "Terminou com consulta marcada", 45);
  } else if (ctx.ofereceuHorario) {
    somar("ofereceu", "Ofereceu horário", 25);
  } else if (pediaHorario) {
    /*
     * O ÚNICO PONTO NEGATIVO DO MODELO, e ele é sobre o PROCESSO.
     *
     * A pessoa ligou para marcar e desligou sem ouvir uma opção de horário.
     * Isso não quer dizer que quem atendeu fez algo errado — a agenda podia
     * estar cheia, o sistema podia estar lento. Quer dizer que a clínica
     * perdeu a chance, e que vale entender por quê.
     */
    somar("sem_oferta", "Pedia horário e nenhum foi oferecido", -20);
  }

  if (ctx.deixouProximoPasso) somar("proximo", "Deixou próximo passo registrado", 15);

  if (ctx.transferida) {
    // Transferir é NEUTRO. Passar para quem sabe responder é bom atendimento;
    // penalizar faria alguém segurar uma conversa que não domina.
    somar("transferida", "Passou para outra pessoa", 0);
  }

  /*
   * DURAÇÃO MUITO CURTA numa ligação de agendamento é sinal de despacho: a
   * pessoa foi atendida e dispensada. Vinte segundos não dão para consultar
   * agenda, oferecer e confirmar.
   *
   * E NÃO HÁ PENALIDADE PARA LIGAÇÃO LONGA. Punir duração ensinaria a equipe a
   * encurtar conversa, que é o oposto do que uma clínica quer.
   */
  if (pediaHorario && ctx.duracaoS !== null && ctx.duracaoS < 30 && !ctx.marcouConsulta) {
    somar("curta", "Menos de 30 segundos para um pedido de horário", -10);
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      fatores.reduce((s, f) => s + f.pontos, 0),
    ),
  );
  fatores.sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos));

  const perdida = pediaHorario && !ctx.marcouConsulta && !ctx.deixouProximoPasso;

  return {
    score,
    fatores,
    oportunidadePerdida: perdida,
    motivoPerda: perdida
      ? ctx.ofereceuHorario
        ? "Ofereceu horário e não fechou, sem próximo passo registrado."
        : "Pedia horário, nenhum foi oferecido e nada ficou registrado."
      : null,
    versao: VERSAO_DO_ATENDIMENTO,
  };
}

/* -------------------------------------------------------------------------- */
/* O painel da recepção                                                       */
/* -------------------------------------------------------------------------- */

export type NumerosDoAtendimento = {
  /** Ligações no período. */
  chamadas: number;
  naoAtendidas: number;
  /** Das que pediam horário, quantas não receberam nenhum. */
  semOferta: number;
  /** Quantas terminaram com consulta marcada. */
  marcadas: number;
  /** Mediana do tempo até a primeira resposta em conversa, em minutos. */
  medianaDeResposta: number | null;
  /** Conversas abertas sem nenhuma resposta nossa. */
  semResposta: number;
  /** Leads criados e nunca contatados. */
  leadsParados: number;
};

export type Observacao = {
  chave: string;
  /** O fato, com o número. Nunca com nome de pessoa. */
  fato: string;
  /** A pergunta que o fato levanta — e não a acusação. */
  pergunta: string;
  gravidade: "INFO" | "ATENCAO" | "ALTA";
};

/**
 * Quanto tempo até a primeira resposta ainda parece atendimento.
 *
 * QUINZE MINUTOS. O número vem do comportamento de quem escreve para uma
 * clínica: quem manda mensagem no horário comercial espera resposta na mesma
 * sessão de atenção. Passou disso, a pessoa já está em outra coisa — e a
 * resposta chega como interrupção, não como atendimento.
 */
export const RESPOSTA_ACEITAVEL_MIN = 15;

/**
 * Lê os números e devolve observações.
 *
 * ============================================================================
 *  CADA OBSERVAÇÃO TEM UM FATO E UMA PERGUNTA, e nunca um veredito.
 *
 *  "37 ligações sem oferta de horário" é o fato. "A agenda estava cheia nesses
 *  dias, ou faltou consultar?" é a pergunta. Quem responde é a equipe, que sabe
 *  coisas que o banco não sabe.
 *
 *  Um painel que conclui no lugar da equipe é um painel que a equipe aprende a
 *  contornar.
 * ============================================================================
 */
export function observar(n: NumerosDoAtendimento): Observacao[] {
  const obs: Observacao[] = [];

  if (n.chamadas > 0) {
    const taxaPerdida = n.naoAtendidas / n.chamadas;
    if (taxaPerdida >= 0.2) {
      obs.push({
        chave: "nao_atendidas",
        fato: `${String(n.naoAtendidas)} de ${String(n.chamadas)} ligações não foram atendidas (${pct(taxaPerdida)}).`,
        pergunta:
          "Elas se concentram em algum horário? Se sim, é questão de escala, e não de atendimento.",
        gravidade: taxaPerdida >= 0.35 ? "ALTA" : "ATENCAO",
      });
    }
  }

  if (n.semOferta > 0) {
    obs.push({
      chave: "sem_oferta",
      fato: `${String(n.semOferta)} ligação(ões) sobre horário terminaram sem nenhuma opção oferecida.`,
      pergunta:
        "A agenda estava cheia nesses dias, ou consultar horário na hora da ligação está difícil?",
      gravidade: n.semOferta >= 10 ? "ALTA" : "ATENCAO",
    });
  }

  if (n.medianaDeResposta !== null && n.medianaDeResposta > RESPOSTA_ACEITAVEL_MIN) {
    obs.push({
      chave: "resposta_lenta",
      fato: `Metade das conversas espera mais de ${String(Math.round(n.medianaDeResposta))} minutos pela primeira resposta.`,
      pergunta:
        "Quem escreve no horário comercial espera resposta na mesma sessão. Há alguém de plantão no Inbox?",
      gravidade: n.medianaDeResposta > 60 ? "ALTA" : "ATENCAO",
    });
  }

  if (n.semResposta > 0) {
    obs.push({
      chave: "sem_resposta",
      fato: `${String(n.semResposta)} conversa(s) aberta(s) sem nenhuma resposta da clínica.`,
      pergunta: "São perguntas que ninguém viu, ou casos que alguém resolveu por telefone?",
      gravidade: n.semResposta >= 5 ? "ALTA" : "ATENCAO",
    });
  }

  if (n.leadsParados > 0) {
    obs.push({
      chave: "leads_parados",
      fato: `${String(n.leadsParados)} pessoa(s) demonstraram interesse e nunca foram contatadas.`,
      /*
       * A PERGUNTA, E NAO A CONSTATACAO — o contrato deste modulo e que toda
       * observacao termine devolvendo a decisao para quem sabe decidir.
       *
       * A primeira versao dizia "e a parte mais cara de perder", que e
       * verdadeira e inutil: nao pede nada de ninguem. Um teste pegou.
       */
      pergunta:
        "Já houve custo para essa pessoa chegar até aqui. Alguém consegue ligar para elas hoje?",
      gravidade: n.leadsParados >= 5 ? "ALTA" : "ATENCAO",
    });
  }

  /*
   * NENHUMA OBSERVAÇÃO É UMA OBSERVAÇÃO, e precisa ser dita.
   *
   * Um painel vazio parece quebrado. Dizer "está tudo dentro do esperado" é o
   * que transforma silêncio em informação — e é a única linha positiva que este
   * módulo produz, de propósito: ele existe para achar o que falta, não para
   * elogiar.
   */
  if (obs.length === 0) {
    obs.push({
      chave: "ok",
      fato: "Nada fora do padrão no período.",
      pergunta: "Ligações atendidas, conversas respondidas, leads contatados.",
      gravidade: "INFO",
    });
  }

  return obs;
}

/**
 * A mediana, e não a média.
 *
 * ============================================================================
 *  UMA CONVERSA RESPONDIDA TRÊS DIAS DEPOIS DESTRÓI A MÉDIA DE UM MÊS INTEIRO.
 *
 *  Com 200 conversas respondidas em 4 minutos e uma em 4.320 minutos, a média
 *  dá 25 — e o painel acusa uma recepção que está respondendo em quatro
 *  minutos. A mediana dá 4, que é a verdade sobre o atendimento típico.
 *
 *  O caso extremo não some: ele aparece em `semResposta` e na lista de
 *  conversas sem resposta, onde alguém pode ir atrás dele.
 * ============================================================================
 */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;

  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);

  if (ordenados.length % 2 === 1) return ordenados[meio] ?? null;

  const a = ordenados[meio - 1];
  const b = ordenados[meio];
  if (a === undefined || b === undefined) return null;
  return (a + b) / 2;
}

const pct = (v: number): string => `${String(Math.round(v * 100))}%`;
