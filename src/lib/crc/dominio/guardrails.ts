/**
 * Os portões que uma mensagem da IA atravessa antes de existir no mundo.
 *
 * O CONTRATO É PORTADO DO DESKCOMM (MIT — ver `THIRD_PARTY_NOTICES.md`), do
 * `lib/agent-engine/guardrails/before-send.ts`: um `Portao` é uma função pura
 * que olha o contexto e devolve um veredicto, e a cadeia para no primeiro veto.
 * A implementação de cada portão é nossa e odontológica; o que veio de lá é a
 * forma — e a forma é o que faz isto ser testável sem banco, sem rede e sem
 * modelo.
 *
 * POR QUE NÃO É PROMPT. Um prompt pedindo "não dê diagnóstico" é uma sugestão
 * ao modelo. Um portão é uma condição de código que o modelo não negocia. A
 * diferença aparece no dia em que alguém escreve uma mensagem que convence o
 * modelo — e é exatamente esse dia que este arquivo existe para cobrir.
 *
 * ORDEM DOS PORTÕES É REGRA, NÃO GOSTO. Os determinísticos e baratos vêm
 * primeiro: opt-out antes de qualquer análise de texto, porque quem pediu para
 * sair não deveria nem ter o conteúdo examinado.
 */

/* -------------------------------------------------------------------------- */
/* Contrato                                                                   */
/* -------------------------------------------------------------------------- */

export type ContextoPortao = {
  /** O que o agente quer enviar. */
  texto: string;
  /** O paciente pediu para não receber mais mensagens. */
  temOptOut: boolean;
  /** A última mensagem recebida do paciente, para os portões que a consultam. */
  ultimaEntrada: string | null;
  /** Quem é dono da conversa agora (ADR-10). */
  dono: "ia" | "humano" | "ninguem";
  /** A janela de atendimento permite texto livre? */
  janelaAberta: boolean;
  /** Textos enviados recentemente nesta conversa, para pegar repetição. */
  enviadosRecentes: readonly string[];
  /** O agente declarou que precisa de humano. */
  pediuHumano: boolean;
};

export type Veredicto =
  | { passa: true }
  | {
      passa: false;
      /** Estável, para métrica e teste. Nunca mude sem migrar o que lê. */
      codigo: string;
      /** Em português, para a tarefa humana que vai nascer disto. */
      motivo: string;
      /** `humano` vira caso humano; `descartar` só não envia. */
      destino: "humano" | "descartar";
    };

export type Portao = {
  nome: string;
  avaliar: (ctx: ContextoPortao) => Veredicto;
};

const PASSA: Veredicto = { passa: true };

/* -------------------------------------------------------------------------- */
/* Os portões determinísticos                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Quem pediu para sair não recebe. Primeiro portão, sempre.
 *
 * `descartar` e não `humano`: transformar um opt-out em tarefa faria alguém da
 * recepção abrir o caso e, na melhor das hipóteses, fechá-lo. Na pior, mandar
 * a mensagem à mão.
 */
export const portaoOptOut: Portao = {
  nome: "opt_out",
  avaliar: (ctx) =>
    ctx.temOptOut
      ? {
          passa: false,
          codigo: "opt_out",
          motivo: "O paciente pediu para não receber mensagens.",
          destino: "descartar",
        }
      : PASSA,
};

/**
 * Conversa com dono humano não recebe mensagem da IA.
 *
 * É a regra que impede o pior desfecho da Inbox: duas respostas ao mesmo
 * paciente, uma da pessoa e outra da máquina, com segundos de diferença.
 */
export const portaoDono: Portao = {
  nome: "dono_da_conversa",
  avaliar: (ctx) =>
    ctx.dono === "humano"
      ? {
          passa: false,
          codigo: "conversa_com_humano",
          motivo: "Um atendente assumiu esta conversa.",
          destino: "descartar",
        }
      : PASSA,
};

/**
 * Fora da janela de 24h, texto livre não sai.
 *
 * Aqui o portão apenas recusa; quem sabe trocar por template é
 * `dominio/janela-whatsapp.ts`, chamado pelo caso de uso de mensagens. A
 * separação existe porque o agente não escolhe template: ele escreve texto, e
 * texto fora da janela é uma mensagem que a Meta recusaria.
 */
export const portaoJanela: Portao = {
  nome: "janela_de_atendimento",
  avaliar: (ctx) =>
    ctx.janelaAberta
      ? PASSA
      : {
          passa: false,
          codigo: "fora_da_janela",
          motivo:
            "Passaram-se mais de 24 horas desde a última mensagem do paciente; a resposta livre seria recusada pelo WhatsApp.",
          destino: "humano",
        },
};

/** O agente declarou que precisa de gente. Respeitar é o ponto. */
export const portaoPediuHumano: Portao = {
  nome: "pediu_humano",
  avaliar: (ctx) =>
    ctx.pediuHumano
      ? {
          passa: false,
          codigo: "agente_pediu_humano",
          motivo: "O agente identificou que esta conversa precisa de uma pessoa.",
          destino: "humano",
        }
      : PASSA,
};

/* -------------------------------------------------------------------------- */
/* Os portões de conteúdo                                                     */
/* -------------------------------------------------------------------------- */

const normalizar = (t: string): string =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

/**
 * Nada clínico sai da máquina. Nunca.
 *
 * Diagnóstico, prescrição e posologia são ato profissional. O CRC já trata
 * isso como escalonamento obrigatório na entrada (`aplicacao/ia.ts`); este
 * portão fecha o outro lado — o caso em que o paciente não perguntou nada
 * clínico, mas o modelo resolveu opinar.
 *
 * Os termos são de SAÍDA, e por isso mais estreitos que os de entrada:
 * "dor" numa pergunta do paciente é sinal de urgência, mas "dor" numa resposta
 * ("qualquer dor, me avise") é frase normal de recepção. O que não pode é a
 * máquina NOMEAR remédio, dose ou diagnóstico.
 */
const TERMOS_CLINICOS: readonly RegExp[] = [
  /\b(amoxicilina|azitromicina|ibuprofeno|dipirona|nimesulida|paracetamol|corticoide|antibiotico|analgesico|anti-?inflamatorio)\b/u,
  /\b(\d+\s?(mg|ml|comprimidos?|capsulas?))\b/u,
  /\b(de\s+\d+\s+em\s+\d+\s+horas|a\s+cada\s+\d+\s+horas)\b/u,
  /\b(voce\s+(esta|tem)\s+com\s+(uma\s+)?(infeccao|abscesso|carie|pulpite|periodontite|gengivite))\b/u,
  /\b(receit(o|ar|a\s+para\s+voce)|prescrev)/u,
  /\b(pode\s+tomar|tome\s+(um|uma|dois|duas))\b/u,
];

export const portaoClinico: Portao = {
  nome: "conteudo_clinico",
  avaliar: (ctx) => {
    const t = normalizar(ctx.texto);
    for (const termo of TERMOS_CLINICOS) {
      if (termo.test(t)) {
        return {
          passa: false,
          codigo: "conteudo_clinico",
          motivo: "A resposta contém orientação clínica, que só um profissional pode dar.",
          destino: "humano",
        };
      }
    }
    return PASSA;
  },
};

/**
 * A máquina não promete o que não executou.
 *
 * O padrão perigoso é o futuro sem ação: "vou verificar e te retorno", "já
 * estou agendando", "vou pedir para a doutora te ligar". Se a Tool não rodou,
 * ninguém vai verificar, agendar nem ligar — e o paciente fica esperando algo
 * que não existe. O Deskcomm chama isto de `promiseGate`; o risco é o mesmo
 * numa clínica.
 */
const PROMESSAS: readonly RegExp[] = [
  /\b(vou|irei|ja\s+estou|estou)\s+(verificar|conferir|checar|agendar|marcar|remarcar|cancelar|pedir|solicitar|encaminhar|falar\s+com)/u,
  /\b(te\s+)?(retorno|aviso|confirmo|respondo)\s+(em\s+breve|logo|mais\s+tarde|ainda\s+hoje|assim\s+que)/u,
  /\b(alguem|a\s+recepcao|a\s+doutora|o\s+doutor)\s+(vai|ira)\s+(te\s+)?(ligar|entrar\s+em\s+contato|chamar)/u,
];

export const portaoPromessa: Portao = {
  nome: "promessa_sem_acao",
  avaliar: (ctx) => {
    const t = normalizar(ctx.texto);
    for (const p of PROMESSAS) {
      if (p.test(t)) {
        return {
          passa: false,
          codigo: "promessa_sem_acao",
          motivo:
            "A resposta promete uma ação que o agente não executou. Ou a ação acontece, ou a frase sai.",
          destino: "humano",
        };
      }
    }
    return PASSA;
  },
};

/**
 * O paciente não pode ver a cozinha.
 *
 * Vazamento de instrução, nome de ferramenta, identificador interno ou o fato
 * de haver um "sistema" decidindo. Uma mensagem que começa com "como assistente
 * de IA" já perdeu a conversa.
 */
const VAZAMENTOS: readonly RegExp[] = [
  /\b(system\s+prompt|instrucoes\s+do\s+sistema|minhas\s+instrucoes)\b/u,
  /\b(como\s+(um\s+)?(assistente|modelo|ia)\s+(de\s+)?(linguagem|virtual)?)\b/u,
  /\b(tool|function_call|json|schema|payload|endpoint|api)\b/u,
  /\b(organization_id|patient_id|conversation_id|crc_[a-z_]+)\b/u,
  /\b(nao\s+(posso|consigo)\s+(acessar|executar)\s+(a\s+)?(ferramenta|funcao))\b/u,
];

export const portaoVazamento: Portao = {
  nome: "vazamento_interno",
  avaliar: (ctx) => {
    const t = normalizar(ctx.texto);
    for (const v of VAZAMENTOS) {
      if (v.test(t)) {
        return {
          passa: false,
          codigo: "vazamento_interno",
          motivo: "A resposta expõe funcionamento interno do sistema.",
          destino: "descartar",
        };
      }
    }
    return PASSA;
  },
};

/**
 * A mesma mensagem não sai duas vezes.
 *
 * Compara normalizado porque o modelo raramente repete caractere por
 * caractere: ele troca uma vírgula, um emoji, e o dedupe por hash exato não
 * pega. Para o paciente, as duas são a mesma mensagem chegando de novo.
 */
export const portaoRepeticao: Portao = {
  nome: "repeticao",
  avaliar: (ctx) => {
    const alvo = normalizar(ctx.texto).replace(/[^a-z0-9 ]/gu, "").trim();
    if (alvo.length === 0) return PASSA;
    for (const anterior of ctx.enviadosRecentes) {
      if (normalizar(anterior).replace(/[^a-z0-9 ]/gu, "").trim() === alvo) {
        return {
          passa: false,
          codigo: "repeticao",
          motivo: "Esta mesma mensagem já foi enviada nesta conversa.",
          destino: "descartar",
        };
      }
    }
    return PASSA;
  },
};

/* -------------------------------------------------------------------------- */
/* A cadeia                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A ordem canônica. Barato e determinístico primeiro, texto depois.
 *
 * `portaoOptOut` na frente não é detalhe: quem pediu para sair não deveria ter
 * a mensagem nem analisada.
 */
export const PORTOES_ANTES_DE_ENVIAR: readonly Portao[] = [
  portaoOptOut,
  portaoDono,
  portaoPediuHumano,
  portaoJanela,
  portaoClinico,
  portaoPromessa,
  portaoVazamento,
  portaoRepeticao,
];

export type ResultadoPortoes =
  | { passa: true }
  | { passa: false; portao: string; codigo: string; motivo: string; destino: "humano" | "descartar" };

/**
 * Roda a cadeia e para no primeiro veto.
 *
 * PARAR NO PRIMEIRO É DELIBERADO. Rodar todos e juntar os motivos daria um
 * relatório mais completo e uma tarefa humana pior: "a resposta tem conteúdo
 * clínico" é acionável; "a resposta tem seis problemas" faz a pessoa ler tudo
 * para descobrir qual resolver.
 */
export function avaliarAntesDeEnviar(
  ctx: ContextoPortao,
  portoes: readonly Portao[] = PORTOES_ANTES_DE_ENVIAR,
): ResultadoPortoes {
  for (const portao of portoes) {
    const v = portao.avaliar(ctx);
    if (!v.passa) {
      return {
        passa: false,
        portao: portao.nome,
        codigo: v.codigo,
        motivo: v.motivo,
        destino: v.destino,
      };
    }
  }
  return { passa: true };
}
