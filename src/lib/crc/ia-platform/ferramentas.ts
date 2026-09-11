/**
 * O registro de ferramentas — as mãos do agente, e as algemas delas.
 *
 * DUAS REGRAS GOVERNAM ESTE ARQUIVO, e nenhuma delas vive no prompt:
 *
 *   O MODELO ESCOLHE, O EXECUTOR AUTORIZA. A política é consultada DEPOIS que
 *   o modelo escolheu a ferramenta e ANTES de o efeito acontecer. Confiar no
 *   modelo para "só usar o que pode" é o mesmo que não ter autorização —
 *   funciona até alguém escrever a mensagem certa.
 *
 *   FERRAMENTA CHAMA CASO DE USO, NUNCA BANCO NEM API. `appointment.offer_slots`
 *   chama `aplicacao/agendamento.ts`, que já revalida, já respeita as três
 *   travas e já registra a oferta. Uma ferramenta que falasse com o Dental
 *   Office direto seria um segundo caminho para a agenda — e dois caminhos
 *   significam duas verdades sobre o que está marcado.
 *
 * Este arquivo é PURO: declara contrato e política. Quem executa é
 * `executor.ts`, que tem I/O.
 */

/* -------------------------------------------------------------------------- */
/* Contrato                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * O que uma ferramenta pode causar no mundo.
 *
 * `LEITURA` não muda nada. `ESCRITA` muda estado do CRC. `SENSIVEL` muda
 * estado no Dental Office — a agenda real da clínica, que a recepção também
 * enxerga.
 */
export type PermissaoFerramenta = "LEITURA" | "ESCRITA" | "SENSIVEL";

/**
 * Quem precisa dizer sim antes do efeito.
 *
 * `CONFIRMACAO_PACIENTE` é o caso do agendamento: o paciente escolheu um
 * horário na conversa, e essa escolha É a confirmação. Não é uma tela de
 * "tem certeza?" — é a frase dele.
 */
export type AprovacaoFerramenta = "NENHUMA" | "CONFIRMACAO_PACIENTE" | "HUMANO";

export type DefinicaoFerramenta = {
  chave: string;
  /** O que o modelo lê para decidir se é esta. Escrito para o modelo, não para nós. */
  descricao: string;
  /** Os argumentos aceitos, em JSON Schema. */
  entrada: Record<string, unknown>;
  permissao: PermissaoFerramenta;
  aprovacao: AprovacaoFerramenta;
  timeoutMs: number;
};

/* -------------------------------------------------------------------------- */
/* O catálogo                                                                 */
/* -------------------------------------------------------------------------- */

const SEM_ARGUMENTOS: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

/**
 * As ferramentas de LEITURA — Fatia 3.
 *
 * Nenhuma delas muda nada. É deliberado que a primeira leva seja só de
 * leitura: elas provam o laço de ferramentas (modelo escolhe → executor roda →
 * modelo decide de novo) sem que um erro no laço vire consulta marcada errada.
 */
export const FERRAMENTAS_LEITURA: readonly DefinicaoFerramenta[] = [
  {
    chave: "paciente.resumo",
    descricao:
      "Traz o resumo do paciente desta conversa: situação, data da última consulta e se existe consulta futura marcada. Use quando precisar saber se a pessoa já é paciente ou quando ela perguntar sobre a própria consulta.",
    entrada: SEM_ARGUMENTOS,
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    timeoutMs: 4000,
  },
  {
    chave: "agenda.horarios_livres",
    descricao:
      "Consulta a agenda real da clínica e devolve até três horários livres. SEMPRE use esta ferramenta antes de falar de qualquer horário: você não sabe o que está livre sem ela, e horário inventado produz paciente na recepção sem consulta.",
    entrada: SEM_ARGUMENTOS,
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    timeoutMs: 12000,
  },
  {
    chave: "clinica.informacoes",
    descricao:
      "Horário de funcionamento, endereço e telefone da clínica. Use para qualquer pergunta sobre quando abre, onde fica ou como chegar.",
    entrada: SEM_ARGUMENTOS,
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    timeoutMs: 3000,
  },
  /*
   * A busca no material da clínica — Fatia 7.
   *
   * EXIGE A PERGUNTA COMO ARGUMENTO, e não reaproveita a última mensagem do
   * paciente. Duas razões: a pergunta real costuma estar espalhada em três
   * mensagens ("oi" / "queria saber uma coisa" / "aceita meu convênio?"), e o
   * modelo reformulando em uma frase é justamente o que faz a busca por
   * significado achar o trecho certo.
   */
  {
    chave: "conhecimento.buscar",
    descricao:
      "Procura no material escrito da clínica (formas de pagamento, convênios, políticas, procedimentos) e devolve os trechos mais próximos da pergunta. Use SEMPRE que a pessoa perguntar algo que não seja horário, endereço ou agenda — e responda usando apenas o que voltar daqui. Passe a pergunta em uma frase, do jeito mais claro que você conseguir.",
    entrada: {
      type: "object",
      additionalProperties: false,
      required: ["pergunta"],
      properties: {
        pergunta: {
          type: "string",
          description: "A dúvida da pessoa em uma frase clara, reescrita por você se necessário.",
        },
      },
    },
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    // Mais folgado que as outras leituras: são duas idas à rede, o embedding da
    // pergunta e a busca no banco.
    timeoutMs: 9000,
  },
];

/**
 * As ferramentas de ESCRITA — Fatia 4.
 *
 * `agenda.oferecer` grava a oferta no CRC (escrita nossa). `agenda.aceitar`
 * grava a consulta no Dental Office (escrita na agenda real da clínica) — e é
 * a única `SENSIVEL` do catálogo.
 */
export const FERRAMENTAS_ESCRITA: readonly DefinicaoFerramenta[] = [
  {
    chave: "agenda.oferecer",
    descricao:
      "Registra formalmente os horários oferecidos a este paciente, para que a escolha dele possa ser aceita depois. Use logo após consultar os horários livres e antes de citá-los na mensagem.",
    entrada: SEM_ARGUMENTOS,
    permissao: "ESCRITA",
    aprovacao: "NENHUMA",
    timeoutMs: 12000,
  },
  {
    chave: "agenda.aceitar",
    descricao:
      "Marca a consulta na agenda da clínica no horário que o paciente escolheu. Só use quando ele tiver escolhido claramente um dos horários que VOCÊ ofereceu nesta conversa. Passe o texto exato da escolha dele.",
    entrada: {
      type: "object",
      additionalProperties: false,
      required: ["escolha"],
      properties: {
        escolha: {
          type: "string",
          description: "A frase do paciente escolhendo o horário, como ele escreveu.",
        },
      },
    },
    permissao: "SENSIVEL",
    // A escolha do paciente na conversa É a confirmação. Ver o cabeçalho.
    aprovacao: "CONFIRMACAO_PACIENTE",
    timeoutMs: 15000,
  },
];

/* -------------------------------------------------------------------------- */
/* O catálogo completo — Fase G, item 27                                      */
/* -------------------------------------------------------------------------- */

/**
 * AS DEZESSEIS FERRAMENTAS QUE FALTAVAM, e o critério que decidiu quais.
 *
 * O §20 pede cerca de vinte ferramentas; havia seis. A tentação é completar a
 * lista com verbos genéricos — `paciente.atualizar`, `agenda.consultar` — e
 * isso seria pior do que a lista curta: uma ferramenta genérica devolve ao
 * modelo o controle da decisão, e o que este sistema inteiro faz é justamente
 * tirar essa decisão dele.
 *
 * O CRITÉRIO USADO: cada ferramenta responde a uma pergunta ou executa uma ação
 * que um paciente REALMENTE faz numa conversa de clínica odontológica. Se não
 * desse para escrever a frase do paciente que a motiva, ela não entrou.
 *
 * E CADA UMA CHAMA UM CASO DE USO QUE JÁ EXISTE. Nenhuma fala com banco direto:
 * é a regra do `executor.ts`, e ela existe porque os casos de uso carregam
 * revalidação, tenant, idempotência e política. Uma ferramenta que pulasse isso
 * teria que reimplementar as quatro coisas — e a primeira que esquecesse
 * produziria paciente na recepção sem consulta.
 */
export const FERRAMENTAS_PACIENTE: readonly DefinicaoFerramenta[] = [
  {
    chave: "paciente.historico",
    // "quando foi minha última limpeza?"
    descricao:
      "Lista as últimas consultas do paciente, com data e procedimento. Use quando a pessoa perguntar quando veio pela última vez, o que foi feito, ou quanto tempo faz desde algum tratamento.",
    entrada: SEM_ARGUMENTOS,
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    timeoutMs: 5000,
  },
  {
    chave: "paciente.orcamentos",
    // "aquele orçamento do implante ainda vale?"
    descricao:
      "Traz os orçamentos abertos do paciente, com valor e data. Use quando a pessoa perguntar sobre um orçamento que recebeu, quiser saber o valor de um tratamento já avaliado, ou mencionar que estava pensando naquilo.",
    entrada: SEM_ARGUMENTOS,
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    timeoutMs: 5000,
  },
  {
    chave: "paciente.pendencias",
    // "tô devendo alguma coisa aí?"
    descricao:
      "Consulta se o paciente tem parcelas em aberto ou atrasadas. Use SOMENTE se a pessoa perguntar sobre o próprio pagamento. NUNCA traga isto por conta própria numa conversa sobre agendamento: cobrar quem não perguntou é constrangedor e não é o seu papel.",
    entrada: SEM_ARGUMENTOS,
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    timeoutMs: 5000,
  },
  {
    chave: "paciente.marcar_opt_out",
    /*
     * ESCRITA SEM APROVAÇÃO NENHUMA, e é de propósito.
     *
     * Quando alguém pede para parar de receber mensagem, a resposta certa é
     * parar AGORA. Uma confirmação aqui — "tem certeza?" — é exatamente o
     * comportamento que faz as pessoas odiarem automação.
     *
     * O risco de marcar a mais é pequeno e a recepção desfaz; o de marcar a
     * menos é continuar incomodando quem já pediu para parar.
     */
    descricao:
      "Registra que o paciente NÃO quer mais receber mensagens automáticas. Use assim que a pessoa pedir para parar, sair da lista, ou disser que não quer mais ser contatada — mesmo que ela diga de um jeito educado ou indireto.",
    entrada: SEM_ARGUMENTOS,
    permissao: "ESCRITA",
    aprovacao: "NENHUMA",
    timeoutMs: 5000,
  },
];

export const FERRAMENTAS_AGENDA_EXTRA: readonly DefinicaoFerramenta[] = [
  {
    chave: "agenda.proxima_consulta",
    // "que dia é minha consulta mesmo?"
    descricao:
      "Diz a data, a hora e o profissional da próxima consulta marcada deste paciente. Use quando a pessoa perguntar quando é a consulta dela ou com quem vai ser.",
    entrada: SEM_ARGUMENTOS,
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    timeoutMs: 5000,
  },
  {
    chave: "agenda.confirmar_presenca",
    // "confirmo sim!"
    descricao:
      "Registra que o paciente CONFIRMOU que vai comparecer à consulta marcada. Use quando ele responder confirmando presença.",
    entrada: SEM_ARGUMENTOS,
    permissao: "ESCRITA",
    aprovacao: "NENHUMA",
    timeoutMs: 6000,
  },
  {
    chave: "agenda.cancelar",
    /*
     * SENSÍVEL E COM APROVAÇÃO HUMANA, ao contrário de `agenda.aceitar`.
     *
     * A assimetria é deliberada. Marcar uma consulta errada custa um horário e
     * um telefonema. CANCELAR uma consulta errada custa a consulta — e o
     * paciente aparece na clínica num dia em que ninguém o espera, ou pior, NÃO
     * aparece num dia em que esperavam.
     *
     * Além disso, cancelamento costuma vir junto de frustração, e é exatamente
     * o momento em que uma pessoa deveria estar na conversa.
     */
    descricao:
      "Cancela a consulta marcada do paciente. Só use quando ele pedir o cancelamento de forma inequívoca. Esta ação passa por uma pessoa da equipe antes de acontecer.",
    entrada: {
      type: "object",
      additionalProperties: false,
      required: ["motivo"],
      properties: {
        motivo: {
          type: "string",
          description: "O que o paciente disse ao pedir o cancelamento, nas palavras dele.",
        },
      },
    },
    permissao: "SENSIVEL",
    aprovacao: "HUMANO",
    timeoutMs: 15000,
  },
];

export const FERRAMENTAS_CONVERSA: readonly DefinicaoFerramenta[] = [
  {
    chave: "conversa.registrar_intencao",
    descricao:
      "Anota o que o paciente quer nesta conversa (remarcar, tirar dúvida, reclamar, orçar) e a temperatura do interesse. Use quando ficar claro qual é o assunto, para que a equipe veja isso na Inbox sem precisar ler tudo.",
    entrada: {
      type: "object",
      additionalProperties: false,
      required: ["intencao"],
      properties: {
        intencao: {
          type: "string",
          enum: ["AGENDAR", "REMARCAR", "CANCELAR", "DUVIDA", "ORCAMENTO", "RECLAMACAO", "OUTRO"],
          description: "O que a pessoa quer.",
        },
        temperatura: {
          type: "string",
          enum: ["quente", "morna", "fria"],
          description: "Quão perto de fechar ou comparecer ela parece estar.",
        },
      },
    },
    permissao: "ESCRITA",
    aprovacao: "NENHUMA",
    timeoutMs: 5000,
  },
  {
    chave: "conversa.criar_tarefa",
    // O caminho de saída para tudo que a IA não resolve e não é urgente.
    descricao:
      "Cria uma tarefa para a equipe da clínica resolver depois. Use quando o paciente pedir algo que você não consegue fazer e que não é urgente — segunda via, falar com o dentista, verificar um detalhe do tratamento.",
    entrada: {
      type: "object",
      additionalProperties: false,
      required: ["titulo"],
      properties: {
        titulo: { type: "string", description: "O que precisa ser feito, em uma frase." },
        detalhe: { type: "string", description: "O contexto que a pessoa da equipe precisa." },
      },
    },
    permissao: "ESCRITA",
    aprovacao: "NENHUMA",
    timeoutMs: 6000,
  },
  {
    chave: "conversa.passar_para_humano",
    /*
     * A FERRAMENTA MAIS IMPORTANTE DO CATÁLOGO, e a que menos parece.
     *
     * O agente já podia terminar o turno pedindo humano — isso existe desde a
     * Fatia 1. Ter uma FERRAMENTA explícita muda uma coisa: ele pode escalar no
     * MEIO do raciocínio, antes de formular resposta nenhuma, e o motivo fica
     * no trace como decisão dele, e não como portão que o barrou.
     *
     * Na prática, é a diferença entre "a IA tentou responder e foi bloqueada" e
     * "a IA percebeu que não era com ela".
     */
    descricao:
      "Passa esta conversa para uma pessoa da equipe, agora. Use quando perceber que o assunto exige julgamento clínico, quando a pessoa estiver chateada, quando ela pedir para falar com alguém, ou sempre que você tiver dúvida se deveria responder.",
    entrada: {
      type: "object",
      additionalProperties: false,
      required: ["motivo"],
      properties: {
        motivo: { type: "string", description: "Por que isto precisa de uma pessoa." },
      },
    },
    permissao: "ESCRITA",
    aprovacao: "NENHUMA",
    timeoutMs: 6000,
  },
  {
    chave: "conversa.lembrar",
    descricao:
      "Guarda um fato duradouro sobre este paciente (prefere manhã, tem medo de agulha, é mãe da Ana). Use com parcimônia: só o que vai ser útil em conversas futuras, e NUNCA informação de saúde.",
    entrada: {
      type: "object",
      additionalProperties: false,
      required: ["fato"],
      properties: {
        fato: { type: "string", description: "O fato, em uma frase curta." },
      },
    },
    permissao: "ESCRITA",
    aprovacao: "NENHUMA",
    timeoutMs: 5000,
  },
];

export const FERRAMENTAS_COMERCIAL: readonly DefinicaoFerramenta[] = [
  {
    chave: "oportunidade.resumo",
    descricao:
      "Traz a oportunidade comercial aberta deste paciente: em que etapa está, valor e qual era a próxima ação combinada. Use para retomar uma negociação de onde ela parou, em vez de recomeçar do zero.",
    entrada: SEM_ARGUMENTOS,
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    timeoutMs: 5000,
  },
  {
    chave: "oportunidade.registrar_objecao",
    /*
     * O QUE A PESSOA DISSE, E NÃO O QUE A IA ACHOU.
     *
     * Uma objeção registrada com as palavras do paciente é dado de verdade: dá
     * para contar quantas vezes "está caro" aparece num mês. Registrada com a
     * interpretação do modelo — "preço" — vira a opinião dele sobre a conversa,
     * que é outra coisa e não serve para decidir preço.
     */
    descricao:
      "Registra o motivo pelo qual o paciente não fechou ou está hesitando, NAS PALAVRAS DELE. Use quando ele der um motivo — preço, medo, tempo, vai pensar, vai falar com alguém.",
    entrada: {
      type: "object",
      additionalProperties: false,
      required: ["objecao"],
      properties: {
        objecao: { type: "string", description: "O que a pessoa disse, como ela disse." },
      },
    },
    permissao: "ESCRITA",
    aprovacao: "NENHUMA",
    timeoutMs: 5000,
  },
];

export const FERRAMENTAS_CLINICA: readonly DefinicaoFerramenta[] = [
  {
    chave: "clinica.convenios",
    // "vocês atendem Amil?" — a pergunta mais frequente de toda clínica.
    descricao:
      "Lista os convênios que a clínica aceita. Use quando a pessoa perguntar sobre plano, convênio, ou se o atendimento é particular.",
    entrada: SEM_ARGUMENTOS,
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    timeoutMs: 4000,
  },
  {
    chave: "clinica.profissionais",
    descricao:
      "Lista os dentistas da clínica e a especialidade de cada um. Use quando a pessoa perguntar quem atende, pedir um profissional específico, ou perguntar se a clínica faz algum tipo de tratamento.",
    entrada: SEM_ARGUMENTOS,
    permissao: "LEITURA",
    aprovacao: "NENHUMA",
    timeoutMs: 4000,
  },
];

export const TODAS_AS_FERRAMENTAS: readonly DefinicaoFerramenta[] = [
  ...FERRAMENTAS_LEITURA,
  ...FERRAMENTAS_PACIENTE,
  ...FERRAMENTAS_AGENDA_EXTRA,
  ...FERRAMENTAS_CONVERSA,
  ...FERRAMENTAS_COMERCIAL,
  ...FERRAMENTAS_CLINICA,
  ...FERRAMENTAS_ESCRITA,
];

export function acharFerramenta(chave: string): DefinicaoFerramenta | null {
  return TODAS_AS_FERRAMENTAS.find((f) => f.chave === chave) ?? null;
}

/* -------------------------------------------------------------------------- */
/* A política                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * O estado que decide se uma ferramenta pode rodar AGORA.
 *
 * Repare no que não está aqui: nada vindo do modelo. A política é avaliada
 * sobre o estado do sistema, não sobre o que o modelo disse sobre si mesmo.
 */
export type EstadoPolitica = {
  /** `ai_agente_escrita` — a trava que libera ferramenta que muda estado. */
  escritaLiberada: boolean;
  /** `dental_office_writeback` — a trava que já existia para a agenda real. */
  writebackLiberado: boolean;
  /** `auto_scheduling` — a trava de agendar sem humano. */
  agendamentoAutonomo: boolean;
  /** `kill_escritas_do` — o interruptor de emergência da agenda. */
  escritasDentalOfficePausadas: boolean;
  /** Quantas ferramentas já rodaram neste turno. */
  ferramentasUsadas: number;
  /**
   * As ferramentas que a clínica DESLIGOU no Tool Studio — Fase G.
   *
   * `undefined` significa "não configurou", e não "nenhuma ligada": a diferença
   * é a que impede uma falha de leitura de configuração de tirar a agenda do
   * agente e fazê-lo inventar horário em vez de consultar.
   *
   * DESLIGAR AQUI TEM EFEITO DE VERDADE. A alternativa — a tela gravar e o
   * modelo continuar vendo a ferramenta — é a pior forma de configuração: a
   * pessoa acha que desligou, e o agente continua usando.
   */
  desligadas?: readonly string[];
  /**
   * Aprovação apertada pela clínica, por ferramenta.
   *
   * Só aperta. `mesclarAprovacao`, em `aplicacao/estudios.ts`, garante a direção
   * única — a configuração nunca desce abaixo do que o código exige.
   */
  aprovacaoDaClinica?: Readonly<Record<string, AprovacaoFerramenta>>;
};

/** Teto de ferramentas por turno. Acima disso é laço, não raciocínio. */
export const MAX_FERRAMENTAS_POR_TURNO = 4;

export type VeredictoPolitica =
  { permite: true } | { permite: false; codigo: string; motivo: string };

/**
 * A ferramenta escolhida pelo modelo pode rodar?
 *
 * A ORDEM É DO MAIS BARATO PARA O MAIS ESPECÍFICO: existência, teto do turno,
 * permissão. Uma ferramenta inexistente não deve gastar consulta de flag.
 */
export function avaliarPolitica(chave: string, estado: EstadoPolitica): VeredictoPolitica {
  const def = acharFerramenta(chave);

  // O TOOL STUDIO ENTRA ANTES DE TUDO. Uma ferramenta desligada não existe para
  // este turno, e o motivo precisa dizer QUEM desligou — senão quem investiga
  // procura bug numa decisão que alguém tomou de propósito.
  if (def !== null && estado.desligadas?.includes(chave) === true) {
    return {
      permite: false,
      codigo: "ferramenta_desligada",
      motivo: `A clínica desligou "${chave}" nas configurações do agente.`,
    };
  }
  if (def === null) {
    return {
      permite: false,
      codigo: "ferramenta_desconhecida",
      motivo: `O agente pediu "${chave}", que não existe.`,
    };
  }

  if (estado.ferramentasUsadas >= MAX_FERRAMENTAS_POR_TURNO) {
    return {
      permite: false,
      codigo: "teto_de_ferramentas",
      motivo: `O agente já usou ${String(MAX_FERRAMENTAS_POR_TURNO)} ferramentas neste turno.`,
    };
  }

  if (def.permissao === "LEITURA") return { permite: true };

  if (!estado.escritaLiberada) {
    return {
      permite: false,
      codigo: "escrita_desligada",
      motivo: "As ferramentas que mudam estado estão desligadas para esta clínica.",
    };
  }

  if (def.permissao === "SENSIVEL") {
    // As MESMAS três travas que `aplicacao/agendamento.ts` já exige. Elas são
    // repetidas aqui de propósito: o agente é barrado ANTES de chamar o caso de
    // uso, e o caso de uso barra de novo se alguém o chamar por outro caminho.
    if (estado.escritasDentalOfficePausadas) {
      return {
        permite: false,
        codigo: "kill_escritas_do",
        motivo: "As escritas na agenda do Dental Office estão pausadas.",
      };
    }
    if (!estado.writebackLiberado) {
      return {
        permite: false,
        codigo: "writeback_desligado",
        motivo: "A gravação no Dental Office está desligada.",
      };
    }
    if (!estado.agendamentoAutonomo) {
      return {
        permite: false,
        codigo: "agendamento_autonomo_desligado",
        motivo: "O agendamento automático está desligado; a recepção marca esta consulta.",
      };
    }
  }

  return { permite: true };
}

/* -------------------------------------------------------------------------- */
/* A descrição para o modelo                                                  */
/* -------------------------------------------------------------------------- */

/**
 * O catálogo em texto, para entrar nas instruções.
 *
 * Só o que a política permitiria agora. Mostrar ao modelo uma ferramenta que
 * ele não pode usar produz duas coisas ruins: tentativas desperdiçadas e
 * respostas que prometem o que a trava vai negar.
 */
export function catalogoParaOModelo(estado: EstadoPolitica): string {
  const disponiveis = TODAS_AS_FERRAMENTAS.filter(
    (f) => avaliarPolitica(f.chave, { ...estado, ferramentasUsadas: 0 }).permite,
  );

  if (disponiveis.length === 0) return "Nenhuma ferramenta disponível nesta conversa.";

  return disponiveis
    .map((f) => {
      const args =
        f.chave === "agenda.aceitar" ? ` (argumento: escolha — a frase do paciente)` : "";
      return `- ${f.chave}${args}: ${f.descricao}`;
    })
    .join("\n");
}
