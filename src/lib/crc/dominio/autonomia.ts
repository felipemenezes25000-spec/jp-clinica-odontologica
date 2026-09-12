/**
 * O Centro de Autonomia — quanto o sistema pode fazer sozinho, por domínio.
 *
 * ============================================================================
 *  POR QUE AS FLAGS NÃO BASTAVAM.
 *
 *  `ai_agente_envio` é uma chave só, e ela liga o envio para tudo: responder
 *  quem perguntou o horário, abordar 100 pessoas de uma campanha, cobrar
 *  orçamento parado, ligar para quem faltou.
 *
 *  Só que o risco dessas quatro coisas não é parecido. Responder a quem
 *  perguntou é conversa; abordar quem não pediu nada é marketing ativo, e se
 *  sair errado o número da clínica é denunciado. A mesma chave governava as
 *  duas, então ou a clínica não respondia ninguém, ou liberava as duas juntas.
 *
 *  AQUI O NÍVEL É POR DOMÍNIO. E — a parte que importa — a flag continua sendo
 *  o TETO. Nível 5 em `recall` com `ai_agente_envio` desligada continua não
 *  enviando nada. A conta é `min(teto, nível)`, e está em `podeAgir()`.
 *
 *  Sem essa regra, o Centro de Autonomia seria um segundo caminho para ligar
 *  envio automático — e o kill switch de madrugada deixaria de ser confiável,
 *  porque alguém precisaria lembrar de desligar os dois.
 * ============================================================================
 *
 * ARQUIVO PURO. Quem lê o banco é `aplicacao/autonomia.ts`.
 */

/* -------------------------------------------------------------------------- */
/* Os níveis                                                                  */
/* -------------------------------------------------------------------------- */

export const NIVEIS = [0, 1, 2, 3, 4, 5] as const;
export type NivelAutonomia = (typeof NIVEIS)[number];

export type DescricaoDeNivel = {
  nivel: NivelAutonomia;
  chave: string;
  rotulo: string;
  /** O que este nível permite, para a pessoa que vai escolher na tela. */
  explicacao: string;
};

/**
 * Os seis degraus.
 *
 * A ESCADA É MONOTÔNICA DE PROPÓSITO: cada degrau contém o anterior. Um nível
 * que permitisse algo que o de cima não permite tornaria impossível responder
 * "subir de 3 para 4 é mais arriscado?" — e essa é a única pergunta que a
 * pessoa na tela está realmente fazendo.
 */
export const ESCADA: readonly DescricaoDeNivel[] = [
  {
    nivel: 0,
    chave: "OFF",
    rotulo: "Desligado",
    explicacao: "O sistema não faz nada neste domínio. Nem observa.",
  },
  {
    nivel: 1,
    chave: "OBSERVE",
    rotulo: "Só observa",
    explicacao:
      "Detecta e registra o que veria, sem sugerir nada. É o turno de sombra: serve para conferir se o sistema está enxergando a clínica certa.",
  },
  {
    nivel: 2,
    chave: "RECOMMEND",
    rotulo: "Recomenda",
    explicacao:
      "Sugere a ação e deixa na fila para uma pessoa aprovar. Nada sai sem alguém clicar.",
  },
  {
    nivel: 3,
    chave: "EXECUTE_LOW_RISK",
    rotulo: "Executa o de baixo risco",
    explicacao:
      "Faz sozinho o que é reversível e barato de errar — lembrete, confirmação, resposta a quem perguntou. O resto continua esperando aprovação.",
  },
  {
    nivel: 4,
    chave: "EXECUTE_AND_ESCALATE",
    rotulo: "Executa e escala",
    explicacao:
      "Faz sozinho, e chama uma pessoa quando encontra algo fora do padrão. É o nível de operação normal de uma clínica com equipe.",
  },
  {
    nivel: 5,
    chave: "AUTOPILOT",
    rotulo: "Autopilot",
    explicacao:
      "Opera o domínio inteiro sem pedir nada, dentro dos limites de contato, horário e opt-out. Só para quando um guardrail dispara.",
  },
] as const;

export function descreverNivel(nivel: NivelAutonomia): DescricaoDeNivel {
  // `ESCADA` é indexada pelo próprio nível, e o índice existe para 0..5. O
  // fallback existe porque `noUncheckedIndexedAccess` não sabe disso — e
  // devolver o degrau mais seguro é o único fallback defensável.
  return ESCADA[nivel] ?? ESCADA[0]!;
}

/* -------------------------------------------------------------------------- */
/* Os domínios                                                                */
/* -------------------------------------------------------------------------- */

export const DOMINIOS = {
  mensagens: "mensagens",
  campanhas: "campanhas",
  recall: "recall",
  agenda: "agenda",
  tratamento: "tratamento",
  cobranca: "cobranca",
  reputacao: "reputacao",
  voz: "voz",
  writeback: "writeback",
  marketing: "marketing",
} as const;

export type DominioAutonomia = (typeof DOMINIOS)[keyof typeof DOMINIOS];

export type DescricaoDeDominio = {
  dominio: DominioAutonomia;
  rotulo: string;
  /** O que é feito aqui, em uma frase. */
  explicacao: string;
  /**
   * A flag que serve de teto. Nenhum nível passa por cima dela.
   *
   * `null` significa que o domínio não tem efeito externo próprio — ele só
   * decide, e quem executa é outro domínio com o próprio teto.
   */
  tetoDaFlag: string | null;
};

/**
 * O catálogo, e ele é fechado.
 *
 * Domínio criado por string solta vira domínio sem teto: `podeAgir()` não
 * acharia a flag correspondente, e o caminho mais provável de um bug assim é
 * liberar em vez de bloquear.
 */
export const CATALOGO: readonly DescricaoDeDominio[] = [
  {
    dominio: "mensagens",
    rotulo: "Conversas",
    explicacao: "Responder quem escreveu para a clínica.",
    tetoDaFlag: "ai_agente_envio",
  },
  {
    dominio: "campanhas",
    rotulo: "Campanhas",
    explicacao: "Disparos para um público escolhido, em lote.",
    tetoDaFlag: "automatic_whatsapp",
  },
  {
    dominio: "recall",
    rotulo: "Retornos",
    explicacao: "Chamar de volta quem passou do intervalo de revisão.",
    tetoDaFlag: "automatic_whatsapp",
  },
  {
    dominio: "agenda",
    rotulo: "Agenda",
    explicacao: "Oferecer horário, confirmar, remarcar e preencher buraco.",
    tetoDaFlag: "auto_scheduling",
  },
  {
    dominio: "tratamento",
    rotulo: "Tratamentos",
    explicacao: "Follow-up comercial de orçamento e tratamento parado.",
    tetoDaFlag: "ai_agente_envio",
  },
  {
    dominio: "cobranca",
    rotulo: "Cobrança",
    explicacao: "Lembrete de parcela e acordo de pagamento.",
    tetoDaFlag: "automatic_whatsapp",
  },
  {
    dominio: "reputacao",
    rotulo: "Reputação",
    explicacao: "Pedir avaliação depois da consulta, e recolher insatisfação.",
    tetoDaFlag: "automatic_whatsapp",
  },
  {
    dominio: "voz",
    rotulo: "Voz e chamadas",
    explicacao: "Atender e fazer ligação.",
    // Não existe provedor de voz ligado. O teto é uma flag que não existe, e
    // `podeAgir()` trata flag desconhecida como desligada — que é o certo.
    tetoDaFlag: "voice_ai",
  },
  {
    dominio: "writeback",
    rotulo: "Escrita no Dental Office",
    explicacao: "Gravar consulta e alteração no sistema da clínica.",
    tetoDaFlag: "dental_office_writeback",
  },
  {
    dominio: "marketing",
    rotulo: "Growth",
    explicacao: "Escolher público, testar mensagem e ajustar a estratégia.",
    // Só decide. Quem envia é `campanhas`, e o teto está lá.
    tetoDaFlag: null,
  },
] as const;

export function descreverDominio(dominio: DominioAutonomia): DescricaoDeDominio {
  const achado = CATALOGO.find((d) => d.dominio === dominio);
  return achado ?? CATALOGO[0]!;
}

/* -------------------------------------------------------------------------- */
/* A decisão                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * O risco da ação concreta que se quer fazer.
 *
 *   BAIXO   reversível, esperado pelo paciente, barato de errar.
 *           Ex.: confirmar consulta, responder horário de funcionamento.
 *
 *   MEDIO   contato não solicitado, ou escrita reversível.
 *           Ex.: recall, oferta de horário, follow-up de orçamento.
 *
 *   ALTO    efeito difícil de desfazer, ou que envolve dinheiro e terceiros.
 *           Ex.: marcar consulta no Dental Office, cobrar, ligar.
 */
export type RiscoDaAcao = "BAIXO" | "MEDIO" | "ALTO";

/**
 * O nível mínimo que libera cada risco.
 *
 * ALTO EXIGE 5, e não 4. O nível 4 é "executa e escala" — ele age sozinho e
 * chama gente quando vê algo estranho. Mas "estranho" é uma avaliação nossa, e
 * para o que é caro de desfazer o critério não pode ser o nosso julgamento: ou
 * a clínica assinou embaixo do autopilot, ou uma pessoa aprova caso a caso.
 */
const MINIMO_POR_RISCO: Readonly<Record<RiscoDaAcao, NivelAutonomia>> = {
  BAIXO: 3,
  MEDIO: 4,
  ALTO: 5,
};

export type PedidoDeAcao = {
  dominio: DominioAutonomia;
  risco: RiscoDaAcao;
  /** O nível configurado para este domínio nesta clínica. */
  nivel: NivelAutonomia;
  /** As flags ligadas. A chave é a de `FLAGS`, o valor é o estado. */
  flags: Readonly<Record<string, boolean>>;
  /** Kill switch de emergência ativo neste escopo. */
  killSwitch: boolean;
};

export type Veredito =
  | { pode: true; motivo: string }
  | { pode: false; motivo: string; sugestao: "APROVACAO_HUMANA" | "NADA" };

/**
 * Pode agir sozinho?
 *
 * ============================================================================
 *  A ORDEM DAS RECUSAS É A PARTE QUE IMPORTA, e ela vai do mais forte para o
 *  mais fraco — porque o motivo que a tela mostra precisa ser o motivo REAL.
 *
 *    1. kill switch   decisão de incidente. Ganha de tudo.
 *    2. flag          decisão de produto. Ganha do nível.
 *    3. nível         decisão de operação.
 *
 *  Invertida, uma clínica com kill switch ligado e nível 2 leria "aumente o
 *  nível de autonomia" — e alguém aumentaria, às três da manhã, no meio do
 *  incidente que motivou o kill switch.
 * ============================================================================
 */
export function podeAgir(pedido: PedidoDeAcao): Veredito {
  if (pedido.killSwitch) {
    return {
      pode: false,
      motivo: "Kill switch ativo. Nenhuma ação automática sai enquanto ele estiver ligado.",
      sugestao: "NADA",
    };
  }

  const teto = descreverDominio(pedido.dominio).tetoDaFlag;
  if (teto !== null) {
    /*
     * FLAG AUSENTE É FLAG DESLIGADA.
     *
     * `flags["voice_ai"]` é `undefined` porque essa flag não existe no
     * catálogo — o provedor de voz não está integrado. Tratar `undefined` como
     * ligada seria abrir o domínio que menos está pronto.
     */
    if (pedido.flags[teto] !== true) {
      return {
        pode: false,
        motivo: `A chave "${teto}" está desligada. Ela é o teto deste domínio, e o nível de autonomia não passa por cima dela.`,
        sugestao: "APROVACAO_HUMANA",
      };
    }
  }

  const minimo = MINIMO_POR_RISCO[pedido.risco];
  if (pedido.nivel < minimo) {
    const nome = descreverNivel(minimo).rotulo;
    return {
      pode: false,
      motivo: `Ação de risco ${pedido.risco.toLowerCase()} exige autonomia "${nome}" (nível ${minimo}); este domínio está no nível ${pedido.nivel}.`,
      // Nível 0 é "nem observa" — nem para aprovação humana esta ação deve
      // aparecer na fila, senão o desligado vira uma fila crescendo em silêncio.
      sugestao: pedido.nivel === 0 ? "NADA" : "APROVACAO_HUMANA",
    };
  }

  return {
    pode: true,
    motivo: `Autonomia ${pedido.nivel} em ${descreverDominio(pedido.dominio).rotulo}, risco ${pedido.risco.toLowerCase()}.`,
  };
}

/**
 * O nível registra ou não a decisão que teria tomado?
 *
 * É o que separa 0 de 1. Em 0 o sistema não escreve nem `crc_ai_activity` —
 * o domínio está desligado, e uma timeline enchendo de "eu teria feito X" para
 * um domínio que a clínica desligou é ruído que ninguém pediu.
 */
export function deveObservar(nivel: NivelAutonomia): boolean {
  return nivel >= 1;
}

/** O nível coloca a sugestão na fila de aprovação? */
export function deveSugerir(nivel: NivelAutonomia): boolean {
  return nivel >= 2;
}

/** Converte um inteiro do banco em nível, sem confiar nele. */
export function nivelValido(valor: unknown): NivelAutonomia {
  const n = typeof valor === "number" ? Math.trunc(valor) : Number.parseInt(String(valor), 10);
  if (!Number.isFinite(n) || n < 0 || n > 5) return 0;
  return n as NivelAutonomia;
}
