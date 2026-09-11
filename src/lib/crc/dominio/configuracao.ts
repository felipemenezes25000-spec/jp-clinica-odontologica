/**
 * As regras de negócio que a clínica muda sem chamar programador.
 *
 * O item 171 do contrato é direto: "Recall = 180 dias" tem que virar 150 por
 * configuração. E o item 102 lista o que precisa ser configurável — thresholds,
 * horários, cadência, confiança da IA, limites.
 *
 * Este arquivo define a FORMA e os PADRÕES. Os valores efetivos vêm de
 * `crc_settings` no banco, com estes aqui como piso: uma clínica recém-criada
 * opera com padrões sensatos, e nenhuma tela precisa tratar "ainda não
 * configurado" como caso especial.
 *
 * TUDO É PURO AQUI. A leitura do banco mora em `servidor/configuracao.ts`.
 */

/** Janela em que mensagem automática pode sair. Item 97 — nada de hardcode. */
export type JanelaDia = { inicio: string; fim: string } | null;

export type HorarioComercial = {
  /** Índice 0 = domingo, 6 = sábado. `null` = não envia nesse dia. */
  dias: [JanelaDia, JanelaDia, JanelaDia, JanelaDia, JanelaDia, JanelaDia, JanelaDia];
  /** Datas ISO `YYYY-MM-DD` em que não se envia nada. Item 98. */
  feriados: string[];
  fuso: string;
};

export type ConfiguracaoCrc = {
  /** Dias sem consulta para o recall de rotina disparar. */
  recallDias: number;
  /** Segundo recall, para quem não respondeu ao primeiro. */
  recallLongoDias: number;
  /** Dias sem consulta para o paciente ser considerado inativo. */
  inatividadeDias: number;
  /** Dias com orçamento aberto antes de virar oportunidade de recuperação. */
  orcamentoParadoDias: number;
  /** Quantas horas depois da falta a primeira mensagem sai. */
  faltaEsperaHoras: number;
  /** Horas de antecedência da mensagem de confirmação. */
  confirmacaoAntecedenciaHoras: number;

  horarioComercial: HorarioComercial;

  /** Item 99: teto de contatos proativos por paciente. */
  contatosPorDia: number;
  /** Horas mínimas entre dois contatos proativos ao mesmo paciente. */
  cooldownHoras: number;
  /** Item 99: tentativas por jornada antes de desistir e chamar humano. */
  tentativasPorJornada: number;

  /** Item 44 — os três patamares de confiança da IA. Configuráveis. */
  iaConfiancaAutomatica: number;
  iaConfiancaSugestao: number;

  /** Teto de mensagens automáticas por hora, para não estourar o provedor. */
  envioPorHora: number;
};

export const CONFIGURACAO_PADRAO: ConfiguracaoCrc = {
  recallDias: 180,
  recallLongoDias: 365,
  inatividadeDias: 240,
  orcamentoParadoDias: 15,
  faltaEsperaHoras: 2,
  confirmacaoAntecedenciaHoras: 24,

  horarioComercial: {
    dias: [
      null, // domingo
      { inicio: "08:00", fim: "19:00" },
      { inicio: "08:00", fim: "19:00" },
      { inicio: "08:00", fim: "19:00" },
      { inicio: "08:00", fim: "19:00" },
      { inicio: "08:00", fim: "19:00" },
      { inicio: "08:00", fim: "13:00" }, // sábado
    ],
    feriados: [],
    fuso: "America/Sao_Paulo",
  },

  contatosPorDia: 1,
  cooldownHoras: 24,
  tentativasPorJornada: 3,

  iaConfiancaAutomatica: 0.85,
  iaConfiancaSugestao: 0.6,

  envioPorHora: 120,
};

/* -------------------------------------------------------------------------- */
/* Feature flags (item 42)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Toda flag nasce DESLIGADA (item 95). A lista é fechada de propósito: flag
 * criada por string solta vira flag esquecida ligada em produção.
 */
export const FLAGS = {
  /** Permite a IA agir sozinha dentro dos guardrails. */
  aiAutopilot: "ai_autopilot",
  /**
   * O turno de sombra: o agente lê, pensa e registra uma resposta candidata —
   * sem enviar nada. Nasce desligado, e ligá-lo não fala com paciente nenhum.
   */
  aiAgenteSombra: "ai_agente_sombra",
  /**
   * A trava que separa "o agente escreveu" de "o paciente recebeu". Sozinha ela
   * não basta: o envio ainda passa pelos portões e pela janela de 24h.
   */
  aiAgenteEnvio: "ai_agente_envio",
  /**
   * Libera as ferramentas que MUDAM estado — registrar oferta, marcar consulta.
   * Separada do envio de propósito: um agente que só lê e responde é um risco
   * completamente diferente de um que grava na agenda da clínica.
   */
  aiAgenteEscrita: "ai_agente_escrita",
  /**
   * A segunda leitura de cada turno, depois do fato: deu certo? qual foi a
   * objeção? o agente violou regra? E é ela quem PROPÕE memória.
   *
   * Flag própria porque custa uma chamada de modelo por turno. O supervisor não
   * fala com paciente e não executa nada — ligá-lo só produz leitura e memória.
   */
  aiSupervisor: "ai_supervisor",
  /** Permite a IA marcar consulta sem humano no meio. */
  autoScheduling: "auto_scheduling",
  /** Liga a leitura de orçamentos. */
  budgetIntegration: "budget_integration",
  /** Interruptor-mestre do envio de WhatsApp. */
  automaticWhatsapp: "automatic_whatsapp",
  /** Item 236: escrita de volta no Dental Office. Fica off no primeiro rollout. */
  dentalOfficeWriteback: "dental_office_writeback",
} as const;

export type ChaveFlag = (typeof FLAGS)[keyof typeof FLAGS];

export const FLAGS_PADRAO: Readonly<Record<ChaveFlag, boolean>> = {
  ai_autopilot: false,
  ai_agente_sombra: false,
  ai_agente_envio: false,
  ai_agente_escrita: false,
  ai_supervisor: false,
  auto_scheduling: false,
  budget_integration: false,
  automatic_whatsapp: false,
  dental_office_writeback: false,
};

/* -------------------------------------------------------------------------- */
/* Kill switches (Milestone 16)                                               */
/* -------------------------------------------------------------------------- */

/**
 * Interruptores de emergência. Separados das flags de propósito: flag é
 * decisão de produto, kill switch é decisão de incidente, e misturar os dois
 * faz alguém desligar a feature errada às três da manhã.
 */
export const KILL_SWITCHES = {
  todasAutomacoes: "kill_automacoes",
  enviosWhatsapp: "kill_envios",
  escritasDentalOffice: "kill_escritas_do",
  acoesAutomaticasIa: "kill_ia_auto",
} as const;

export type ChaveKillSwitch = (typeof KILL_SWITCHES)[keyof typeof KILL_SWITCHES];

/* -------------------------------------------------------------------------- */
/* Horário comercial — a avaliação                                            */
/* -------------------------------------------------------------------------- */

/**
 * A data/hora local da clínica, decomposta.
 *
 * POR QUE NÃO `toLocaleString` COM PARSE DE VOLTA
 * Porque `new Date(String)` sobre texto localizado é indefinido entre runtimes,
 * e a Vercel roda em UTC enquanto a clínica opera em -03. `formatToParts` é o
 * único caminho que dá o número certo sem depender do fuso do processo.
 */
export function partesLocais(
  instante: Date,
  fuso: string,
): { ano: number; mes: number; dia: number; hora: number; minuto: number; diaSemana: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });

  // O Map é tipado com chave `string` de propósito: `formatToParts` devolve o
  // union fechado de `DateTimeFormatPartTypes`, e herdá-lo obrigaria o helper
  // `num` abaixo a repetir esse union em vez de aceitar o nome do campo.
  const partes = new Map<string, string>(
    fmt.formatToParts(instante).map((p) => [String(p.type), p.value]),
  );
  const num = (chave: string): number => Number.parseInt(partes.get(chave) ?? "0", 10);

  const semana: Readonly<Record<string, number>> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // `hour12: false` devolve 24 para meia-noite em alguns runtimes. Normaliza.
  const hora = num("hour") % 24;

  return {
    ano: num("year"),
    mes: num("month"),
    dia: num("day"),
    hora,
    minuto: num("minute"),
    diaSemana: semana[partes.get("weekday") ?? "Sun"] ?? 0,
  };
}

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number.parseInt(h ?? "0", 10) * 60 + Number.parseInt(m ?? "0", 10);
}

/** Está dentro da janela em que a clínica fala com paciente? */
export function dentroDoHorario(instante: Date, horario: HorarioComercial): boolean {
  const p = partesLocais(instante, horario.fuso);

  const iso = `${String(p.ano)}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
  if (horario.feriados.includes(iso)) return false;

  const janela = horario.dias[p.diaSemana];
  if (janela === null || janela === undefined) return false;

  const agora = p.hora * 60 + p.minuto;
  return agora >= minutosDe(janela.inicio) && agora < minutosDe(janela.fim);
}

/**
 * O próximo instante em que se pode enviar. Se já dá, devolve o próprio.
 *
 * É isto que impede a mensagem de falta às 2h da manhã: a jornada não é
 * cancelada nem enviada fora de hora — ela é REAGENDADA para a abertura
 * seguinte, e o paciente recebe às 8h como se nada tivesse acontecido.
 *
 * Anda dia a dia em vez de resolver por aritmética de fuso porque horário de
 * verão, feriado e sábado com janela curta fazem a aritmética errar. Catorze
 * iterações no pior caso é barato; errar a hora não é.
 */
export function proximoInstanteUtil(instante: Date, horario: HorarioComercial): Date {
  if (dentroDoHorario(instante, horario)) return instante;

  for (let salto = 0; salto <= 14; salto += 1) {
    const dia = new Date(instante.getTime() + salto * 24 * 60 * 60 * 1000);
    const p = partesLocais(dia, horario.fuso);
    const iso = `${String(p.ano)}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
    if (horario.feriados.includes(iso)) continue;

    const janela = horario.dias[p.diaSemana];
    if (janela === null || janela === undefined) continue;

    const abertura = minutosDe(janela.inicio);
    const fechamento = minutosDe(janela.fim);
    const agora = p.hora * 60 + p.minuto;

    // Hoje, ainda antes de abrir: espera a abertura.
    if (salto === 0 && agora < abertura) {
      return new Date(instante.getTime() + (abertura - agora) * 60 * 1000);
    }
    // Hoje e já passou do fechamento: este dia não serve.
    if (salto === 0 && agora >= fechamento) continue;

    // Dia futuro: cai na abertura dele.
    if (salto > 0) {
      const minutosAteMeiaNoite = 24 * 60 - agora;
      const deslocamento = minutosAteMeiaNoite + (salto - 1) * 24 * 60 + abertura;
      return new Date(instante.getTime() + deslocamento * 60 * 1000);
    }
  }

  // Catorze dias sem uma única janela aberta é configuração quebrada, não
  // feriado. Devolver o instante original faz a mensagem sair agora — errado.
  // Devolver duas semanas à frente deixa o problema visível no debugger da
  // jornada, que é onde alguém vai olhar.
  return new Date(instante.getTime() + 14 * 24 * 60 * 60 * 1000);
}
