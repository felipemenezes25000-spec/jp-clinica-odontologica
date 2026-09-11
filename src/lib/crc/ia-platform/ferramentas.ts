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

export const TODAS_AS_FERRAMENTAS: readonly DefinicaoFerramenta[] = [
  ...FERRAMENTAS_LEITURA,
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
