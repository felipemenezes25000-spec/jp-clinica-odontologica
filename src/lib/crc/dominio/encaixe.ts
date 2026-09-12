/**
 * O encaixe — quem chamar para a cadeira que vagou, e quantos por vez.
 *
 * ============================================================================
 *  A REGRA QUE GOVERNA ESTE ARQUIVO INTEIRO, e ela é do §15:
 *
 *      NUNCA BROADCAST GRANDE.
 *
 *  Oferecer o horário das 14h para quarenta pessoas produz UMA agendada e
 *  trinta e nove que responderam "pode ser!" e ouviram "desculpe, já foi
 *  preenchido". Isso não é eficiência: é queimar a lista inteira para preencher
 *  uma hora — e as trinta e nove aprendem a não responder na próxima.
 *
 *  A saída é lote pequeno e escalonado: chama três, espera, chama mais três.
 *  Preenche mais devagar e não destrói a lista.
 * ============================================================================
 *
 * A SEGUNDA REGRA, que decorre da primeira: quem foi chamado e não respondeu
 * NÃO é chamado de novo para o mesmo buraco. A memória disso vive em
 * `crc_gap_offers`, e este módulo só decide a ordem e o tamanho do lote.
 *
 * TUDO PURO.
 */

/* -------------------------------------------------------------------------- */
/* O tamanho do lote                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Quantas pessoas chamar de uma vez.
 *
 * ============================================================================
 *  TRÊS, E O NÚMERO SAI DE UMA CONTA.
 *
 *  A taxa de aceite de um encaixe de véspera fica em torno de 20–30% entre
 *  quem está na lista de espera. Com três convites, a chance de PELO MENOS UM
 *  aceitar é ~60%; a chance de DOIS OU MAIS aceitarem — que é o caso ruim,
 *  alguém ouvindo "já foi" — fica em ~16%.
 *
 *  Com seis, a chance de alguém aceitar sobe para ~85%, e a de decepcionar
 *  alguém sobe para ~50%. O segundo número é o que importa: metade das levas
 *  deixaria alguém frustrado.
 * ============================================================================
 */
export const TAMANHO_DO_LOTE = 3;

/**
 * Quanto esperar antes da próxima leva.
 *
 * NOVENTA MINUTOS, e o número é sobre COMO AS PESSOAS RESPONDEM, não sobre a
 * urgência da clínica. Quem vai aceitar um encaixe responde rápido — está com o
 * celular na mão ou não está. Esperar 90 minutos pega quem estava em reunião
 * sem travar a vaga por meio dia.
 *
 * Perto da hora, a espera encolhe: ver `esperaAntesDaProximaLeva`.
 */
export const ESPERA_ENTRE_LEVAS_MIN = 90;

/**
 * Quantas levas, no máximo, por buraco.
 *
 * O teto existe para o buraco DESISTIR. Sem ele, um horário impopular
 * percorreria a base inteira três pessoas por vez — exatamente o broadcast
 * que o lote pequeno veio evitar, só que lento.
 */
export const LEVAS_MAXIMAS = 4;

/**
 * A espera até a próxima leva, dado quanto falta para o horário.
 *
 * ============================================================================
 *  A ESPERA ENCOLHE PERTO DA HORA, e a razão é aritmética: com 3 horas para o
 *  horário, esperar 90 minutos entre levas dá tempo para DUAS levas. Com 12
 *  horas, dá para oito — mais do que o teto permite.
 *
 *  Sem esse encolhimento, um cancelamento das 16h avisado às 14h receberia uma
 *  única leva de três pessoas, e a cadeira ficaria vazia se as três estivessem
 *  ocupadas.
 * ============================================================================
 */
export function esperaAntesDaProximaLeva(horasAteOHorario: number): number {
  if (horasAteOHorario <= 3) return 20;
  if (horasAteOHorario <= 8) return 45;
  return ESPERA_ENTRE_LEVAS_MIN;
}

/* -------------------------------------------------------------------------- */
/* O escore do candidato                                                      */
/* -------------------------------------------------------------------------- */

export type Candidato = {
  patientId: string;
  nome: string;
  /** Tem preferência cadastrada na lista de espera. */
  temWaitlist: boolean;
  aceitaEncaixe: boolean;
  /** O dia da semana do buraco bate com a preferência. */
  diaBate: boolean;
  horaBate: boolean;
  dentistaBate: boolean;
  /** Dias desde a última consulta. `null` = nunca veio. */
  diasDesdeUltimaConsulta: number | null;
  consultasConcluidas: number;
  /** Horas desde o último contato NOSSO. Serve para não insistir. */
  horasDesdeUltimoContato: number | null;
};

export type FatorDoEncaixe = { chave: string; rotulo: string; pontos: number };

export type CandidatoPontuado = {
  patientId: string;
  nome: string;
  escore: number;
  fatores: FatorDoEncaixe[];
  /** `true` quando esta pessoa NÃO deve ser chamada agora, e por quê. */
  bloqueio: string | null;
};

/**
 * Pontua e ordena os candidatos.
 *
 * ============================================================================
 *  O CRITÉRIO É COMPATIBILIDADE, E NÃO ORDEM DE CHEGADA.
 *
 *  Uma lista de espera tratada como fila chama quem entrou primeiro — inclusive
 *  para um horário que a pessoa já disse que não serve. Ser chamado para um
 *  horário impossível ensina a pessoa a ignorar as próximas mensagens, e a
 *  lista morre de uso.
 *
 *  Então a preferência declarada domina o escore, e quem não declarou nada
 *  entra depois — não excluído, porque "não informou" é o caso mais comum e
 *  excluí-lo esvaziaria a lista.
 * ============================================================================
 */
export function pontuarCandidatos(
  candidatos: readonly Candidato[],
  opcoes: { horasAteOHorario: number; cooldownHoras: number },
): CandidatoPontuado[] {
  return candidatos
    .map((c) => pontuar(c, opcoes))
    .sort((a, b) => {
      // Bloqueados vão para o fim, mas continuam na lista: a tela precisa
      // mostrar POR QUE a pessoa óbvia não foi chamada.
      if ((a.bloqueio === null) !== (b.bloqueio === null)) return a.bloqueio === null ? -1 : 1;
      return b.escore - a.escore;
    });
}

function pontuar(
  c: Candidato,
  opcoes: { horasAteOHorario: number; cooldownHoras: number },
): CandidatoPontuado {
  const fatores: FatorDoEncaixe[] = [];
  const somar = (chave: string, rotulo: string, pontos: number): void => {
    if (pontos !== 0) fatores.push({ chave, rotulo, pontos });
  };

  /*
   * OS BLOQUEIOS VÊM PRIMEIRO, e não reduzem escore: impedem.
   *
   * "Não aceita encaixe" é uma escolha da pessoa, não um fator de peso. Tratá-la
   * como -30 pontos faria com que, numa lista curta, ela fosse chamada assim
   * mesmo — e a preferência que ela cadastrou seria ignorada pela aritmética.
   */
  if (c.temWaitlist && !c.aceitaEncaixe && opcoes.horasAteOHorario < 24) {
    return {
      patientId: c.patientId,
      nome: c.nome,
      escore: 0,
      fatores,
      bloqueio: "Pediu para não receber encaixe de última hora.",
    };
  }

  if (c.temWaitlist && !c.diaBate) {
    return {
      patientId: c.patientId,
      nome: c.nome,
      escore: 0,
      fatores,
      bloqueio: "Este dia da semana não serve para esta pessoa.",
    };
  }

  if (c.temWaitlist && !c.horaBate) {
    return {
      patientId: c.patientId,
      nome: c.nome,
      escore: 0,
      fatores,
      bloqueio: "Este horário está fora da janela que a pessoa pediu.",
    };
  }

  if (c.horasDesdeUltimoContato !== null && c.horasDesdeUltimoContato < opcoes.cooldownHoras) {
    return {
      patientId: c.patientId,
      nome: c.nome,
      escore: 0,
      fatores,
      bloqueio: `Falamos com esta pessoa há ${String(Math.round(c.horasDesdeUltimoContato))}h.`,
    };
  }

  // 1. Estar na lista é PEDIR para ser chamado. É o sinal mais forte.
  if (c.temWaitlist) somar("waitlist", "Está na lista de espera", 40);

  // 2. Cada dimensão que bate, quando foi declarada.
  if (c.temWaitlist && c.dentistaBate) somar("dentista", "É o dentista que ela quer", 15);

  /*
   * 3. TEMPO SEM VIR — em forma de sino, e não crescente.
   *
   * Quem passou do retorno é o alvo. Quem sumiu há dois anos não vem por causa
   * de um encaixe de amanhã, e chamá-lo gasta uma das três vagas do lote com
   * quem quase certamente não responde.
   */
  if (c.diasDesdeUltimaConsulta !== null) {
    const d = c.diasDesdeUltimaConsulta;
    if (d >= 150 && d <= 400) somar("retorno", "Passou do retorno previsto", 22);
    else if (d >= 90 && d < 150) somar("retorno", "Perto do retorno", 14);
    else if (d > 400 && d <= 730) somar("retorno", "Sumido há mais de um ano", 6);
    else if (d < 90) somar("retorno", "Veio há pouco tempo", -12);
  } else {
    somar("retorno", "Nunca veio à clínica", -5);
  }

  // 4. Vínculo: quem já veio várias vezes responde mais.
  if (c.consultasConcluidas >= 5) somar("vinculo", "Paciente recorrente", 12);
  else if (c.consultasConcluidas >= 2) somar("vinculo", "Já se tratou aqui", 6);

  const escore = Math.max(
    0,
    Math.min(
      100,
      fatores.reduce((s, f) => s + f.pontos, 0),
    ),
  );
  fatores.sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos));

  return { patientId: c.patientId, nome: c.nome, escore, fatores, bloqueio: null };
}

/* -------------------------------------------------------------------------- */
/* A decisão da leva                                                          */
/* -------------------------------------------------------------------------- */

export type EstadoDoBuraco = {
  /** Quantas pessoas já foram chamadas ao todo. */
  oferecidos: number;
  /** Quando a última leva saiu. `null` = nenhuma ainda. */
  ofertadoEm: string | null;
  horasAteOHorario: number;
};

export type DecisaoDaLeva =
  { chamar: true; quantos: number; motivo: string } | { chamar: false; motivo: string };

/**
 * Sai leva agora?
 *
 * ============================================================================
 *  QUATRO RAZÕES PARA NÃO CHAMAR, e cada uma responde uma pergunta diferente:
 *
 *    a hora já passou          → o buraco acabou
 *    o teto de levas estourou  → este horário não emplacou; desistir é certo
 *    a última leva foi agora   → dar tempo de responder
 *    não há candidato          → não há o que fazer
 *
 *  Juntar as quatro num booleano faria a tela dizer "aguardando" para as
 *  quatro — e a terceira é normal, enquanto a segunda merece um humano olhando.
 * ============================================================================
 */
export function decidirLeva(
  estado: EstadoDoBuraco,
  candidatosDisponiveis: number,
  /*
   * O INSTANTE ENTRA POR PARAMETRO, e nao sai de `Date.now()` aqui dentro.
   *
   * Este modulo e puro, e um `Date.now()` no meio de uma decisao o tornaria
   * dependente do relogio do processo — o que obrigaria o teste a congelar o
   * relogio para afirmar qualquer coisa sobre a espera entre levas.
   */
  agora: Date,
): DecisaoDaLeva {
  if (estado.horasAteOHorario <= 0) {
    return { chamar: false, motivo: "O horário já passou." };
  }

  /*
   * PERTO DEMAIS NÃO VALE A PENA. Menos de uma hora é tempo de a pessoa ler,
   * responder, e chegar — e ninguém atravessa a cidade em quarenta minutos por
   * uma limpeza. Chamar aqui só produz frustração dos dois lados.
   */
  if (estado.horasAteOHorario < 1) {
    return { chamar: false, motivo: "Falta menos de uma hora: não dá tempo de chegar." };
  }

  const levasFeitas = Math.ceil(estado.oferecidos / TAMANHO_DO_LOTE);
  if (levasFeitas >= LEVAS_MAXIMAS) {
    return {
      chamar: false,
      motivo: `Já foram ${String(estado.oferecidos)} convites em ${String(levasFeitas)} levas. Este horário não emplacou.`,
    };
  }

  if (estado.ofertadoEm !== null) {
    const minutosDesde = (agora.getTime() - Date.parse(estado.ofertadoEm)) / 60_000;
    const espera = esperaAntesDaProximaLeva(estado.horasAteOHorario);
    if (minutosDesde < espera) {
      return {
        chamar: false,
        motivo: `A última leva saiu há ${String(Math.round(minutosDesde))} min; esperando ${String(espera)} min para dar tempo de responder.`,
      };
    }
  }

  if (candidatosDisponiveis === 0) {
    return { chamar: false, motivo: "Nenhum candidato compatível disponível." };
  }

  const quantos = Math.min(TAMANHO_DO_LOTE, candidatosDisponiveis);
  return {
    chamar: true,
    quantos,
    motivo:
      estado.oferecidos === 0
        ? `Primeira leva: ${String(quantos)} convites.`
        : `Leva ${String(levasFeitas + 1)}: mais ${String(quantos)} convites.`,
  };
}

/* -------------------------------------------------------------------------- */
/* O valor do buraco                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Quanto vale a hora parada.
 *
 * ============================================================================
 *  ESTE NÚMERO É UMA ESTIMATIVA, E A FUNÇÃO SÓ EXISTE PARA ORDENAR.
 *
 *  Com três buracos no mesmo dia e capacidade de trabalhar dois, a pergunta é
 *  qual deixar de lado. Sem valor, a resposta seria "o mais tarde" — que é
 *  quase sempre errada, porque o mais tarde pode ser a única janela de implante
 *  da semana.
 *
 *  NÃO É RECEITA. A tela que mostrar isto tem que dizer "potencial", pela
 *  mesma regra do Radar: dinheiro que não aconteceu não se soma com dinheiro
 *  que aconteceu.
 * ============================================================================
 */
export function valorDoBuraco(duracaoMin: number, valorHoraDaCadeira: number): number {
  const horas = Math.max(0, duracaoMin) / 60;
  return Number((horas * Math.max(0, valorHoraDaCadeira)).toFixed(2));
}

/**
 * Quanto uma hora de cadeira produz, por padrão.
 *
 * É um piso conservador para consultório no Brasil, e existe para a tela não
 * mostrar R$ 0 antes de alguém configurar. Quando a clínica informar o próprio
 * número, ele entra por configuração — e este literal deixa de ser lido.
 */
export const VALOR_HORA_PADRAO = 250;
