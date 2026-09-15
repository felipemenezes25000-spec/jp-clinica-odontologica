/**
 * A política de mensageria POR CANAL — §15.
 *
 * ============================================================================
 *  A REGRA DO WHATSAPP NÃO VALE PARA O INSTAGRAM, e reusá-la cegamente erra
 *  nos DOIS sentidos.
 *
 *  `dominio/janela-whatsapp.ts` decide entre TEXTO e TEMPLATE APROVADO. Essa
 *  dicotomia é do WhatsApp Business: fora das 24 horas, a Meta exige um modelo
 *  pré-aprovado, e sem ele a mensagem é recusada com 131047.
 *
 *  INSTAGRAM E MESSENGER NÃO TÊM TEMPLATE APROVADO. Fora das 24 horas o que
 *  existe é a `HUMAN_AGENT` — uma etiqueta que só vale se UMA PESSOA estiver
 *  respondendo, por até 7 dias, e que exige a feature Human Agent aprovada no
 *  app. Traduzir isso para "manda template" recusaria toda resposta legítima
 *  de recepcionista no dia seguinte; traduzir para "manda texto livre" faria a
 *  Meta recusar, e — o que é pior — faria a IA tentar de novo achando que o
 *  erro foi transitório.
 *
 *  O erro no sentido inverso é igualmente concreto: a etiqueta `HUMAN_AGENT`
 *  NÃO pode ser usada pela IA. Ela afirma à Meta que um humano está
 *  respondendo. Uma automação que a usa está mentindo para a plataforma, e a
 *  penalidade é a conta, não a mensagem.
 * ============================================================================
 *
 * FONTES OFICIAIS CONFERIDAS EM 15/09/2026 (§4.3):
 *
 *   janela de 24h e etiqueta `HUMAN_AGENT` por 7 dias
 *     https://developers.facebook.com/docs/features-reference/human-agent
 *     https://developers.facebook.com/docs/messenger-platform/policy/policy-overview/
 *
 *   private reply em até 7 dias do comentário, UMA mensagem só
 *     https://developers.facebook.com/docs/instagram-platform/private-replies/
 *
 * ARQUIVO PURO. A decisão é testada sem rede, e vale igual para os adapters.
 */
import type { CanalConversa } from "./canais";

/* -------------------------------------------------------------------------- */
/* As constantes de cada canal                                                */
/* -------------------------------------------------------------------------- */

/** 24 horas. A mesma para os três canais — a coincidência é real. */
export const JANELA_PADRAO_MS = 24 * 60 * 60 * 1000;

/**
 * A margem antes do fim da janela, herdada de `janela-whatsapp.ts`.
 *
 * Mesma corrida, mesmo remédio: o código julga a janela aberta faltando dois
 * segundos, a mensagem entra na fila, e quando o provedor a processa a janela
 * fechou.
 */
export const MARGEM_MS = 5 * 60 * 1000;

/** Sete dias — o teto da etiqueta `HUMAN_AGENT` e o do private reply. */
export const JANELA_HUMANA_MS = 7 * 24 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Quem está falando                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Quem redigiu a mensagem que está saindo.
 *
 * NÃO É DETALHE DE AUDITORIA: é entrada da política. A etiqueta `HUMAN_AGENT`
 * afirma à Meta que uma pessoa está atendendo, e só `atendente` pode fazer
 * essa afirmação. `ia` e `automacao` ficam presos à janela de 24 horas — não
 * por conservadorismo, mas porque a alternativa é declarar falso à plataforma.
 */
export type QuemEnvia = "atendente" | "ia" | "automacao";

export type TipoDeEnvio =
  /** Resposta dentro de uma conversa que a pessoa iniciou. */
  | "resposta"
  /** Contato que a clínica inicia. Campanha, recall, cobrança. */
  | "proativo"
  /** Resposta privada a um comentário público. Regras próprias. */
  | "private_reply";

export type EntradaDaPolitica = {
  canal: CanalConversa;
  /** ISO ou Date da última mensagem RECEBIDA da pessoa. `null` = nunca escreveu. */
  ultimaMensagemDoUsuario: string | Date | null;
  agora: Date;
  tipo: TipoDeEnvio;
  quem: QuemEnvia;
  /**
   * O nome do modelo aprovado na Meta, quando existe. Só o WhatsApp usa.
   *
   * Passar um nome de template num envio de Instagram não é erro de digitação
   * que vale ignorar: é sinal de que quem chamou acha que os canais são iguais.
   * A política o ignora e o veredicto diz por quê.
   */
  providerNome?: string | null;
  /**
   * A feature Human Agent está aprovada para este app/canal?
   *
   * FALSO É O PADRÃO, e o padrão é o correto: a feature exige App Review. Um
   * sistema que assume aprovação envia com a etiqueta, a Meta recusa, e o
   * erro chega como `(#10) permission` — que não parece com "falta App
   * Review".
   */
  humanAgentAprovado?: boolean;
  /** Instante do comentário, só em `private_reply`. */
  comentarioEm?: string | Date | null;
};

/* -------------------------------------------------------------------------- */
/* O veredicto                                                                */
/* -------------------------------------------------------------------------- */

export type DecisaoDeCanal =
  /** Texto livre, dentro da janela. */
  | { forma: "PERMITIDO_TEXTO"; porque: string }
  /** WhatsApp fora da janela: sai o modelo aprovado. */
  | { forma: "PERMITIDO_TEMPLATE"; providerNome: string; porque: string }
  /** Instagram/Messenger fora da janela, com pessoa atendendo. */
  | { forma: "PERMITIDO_ETIQUETA_HUMANA"; etiqueta: "HUMAN_AGENT"; porque: string }
  /** Uma mensagem só, referenciando o comentário. */
  | { forma: "PERMITIDO_PRIVATE_REPLY"; porque: string }
  /**
   * A janela fechou e só uma PESSOA pode reabrir. Não é erro: é trabalho para
   * a recepção, e a tela precisa dizer isso em vez de "falhou".
   */
  | { forma: "EXIGE_HANDOFF"; codigo: string; porque: string }
  /** Fora de qualquer janela deste canal. */
  | { forma: "FORA_DA_JANELA"; codigo: string; porque: string }
  /** A política do canal proíbe o que se pediu. */
  | { forma: "BLOQUEADO_POR_POLITICA"; codigo: string; porque: string };

function instante(valor: string | Date | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const t = valor instanceof Date ? valor.getTime() : Date.parse(valor);
  return Number.isFinite(t) ? t : null;
}

/**
 * Pode mandar isto agora, e como?
 *
 * ============================================================================
 *  A ORDEM DAS PERGUNTAS É A REGRA, e vai do mais específico para o mais geral:
 *
 *    1. private reply     tem janela e limite próprios, e não depende de
 *                         conversa aberta nenhuma.
 *    2. janela de 24h      o caminho de longe mais comum. Texto livre sai.
 *    3. fora da janela     aqui os canais divergem, e é onde o reuso cego
 *                         errava.
 *
 *  Invertida, o private reply cairia na regra de janela — e como não existe
 *  mensagem recebida da pessoa, ele seria sempre recusado como "fora da
 *  janela". A capacidade inteira do §17 morreria em silêncio.
 * ============================================================================
 */
export function avaliarPoliticaDoCanal(entrada: EntradaDaPolitica): DecisaoDeCanal {
  if (entrada.tipo === "private_reply") return avaliarPrivateReply(entrada);

  const ultima = instante(entrada.ultimaMensagemDoUsuario);
  const agora = entrada.agora.getTime();

  const dentroDa24h = ultima !== null && agora < ultima + JANELA_PADRAO_MS - MARGEM_MS;

  if (dentroDa24h) {
    return {
      forma: "PERMITIDO_TEXTO",
      porque: "A pessoa escreveu nas últimas 24 horas; texto livre pode sair.",
    };
  }

  if (entrada.canal === "whatsapp") return foraDaJanelaNoWhatsapp(entrada, ultima);
  return foraDaJanelaNaMeta(entrada, ultima);
}

/* -------------------------------------------------------------------------- */

function foraDaJanelaNoWhatsapp(entrada: EntradaDaPolitica, ultima: number | null): DecisaoDeCanal {
  const nome = (entrada.providerNome ?? "").trim();

  if (nome.length > 0) {
    return {
      forma: "PERMITIDO_TEMPLATE",
      providerNome: nome,
      porque:
        "Fora da janela de 24 horas do WhatsApp, e existe um modelo aprovado na Meta para este envio.",
    };
  }

  return {
    forma: "FORA_DA_JANELA",
    codigo: "WHATSAPP_SEM_TEMPLATE",
    porque:
      ultima === null
        ? "A pessoa nunca escreveu pelo WhatsApp, então só um modelo aprovado pode iniciar a conversa."
        : "Passaram-se mais de 24 horas desde a última mensagem; pelo WhatsApp só sai modelo aprovado.",
  };
}

/**
 * Instagram e Messenger, fora das 24 horas.
 *
 * ============================================================================
 *  AQUI ESTÁ A DIFERENÇA QUE JUSTIFICA O ARQUIVO INTEIRO.
 *
 *  Não há template. O que existe é `HUMAN_AGENT`, e ela tem três condições que
 *  precisam valer JUNTAS:
 *
 *    · quem envia é uma PESSOA (não a IA, não a automação);
 *    · a última mensagem da pessoa foi há menos de 7 dias;
 *    · a feature Human Agent está aprovada no app.
 *
 *  Faltando qualquer uma, o desfecho é `EXIGE_HANDOFF` ou `FORA_DA_JANELA` — e
 *  NUNCA "manda e vê no que dá". O §15 é explícito: nunca inventar exceção
 *  para fazer funcionar.
 * ============================================================================
 */
function foraDaJanelaNaMeta(entrada: EntradaDaPolitica, ultima: number | null): DecisaoDeCanal {
  const canal = entrada.canal === "instagram" ? "Instagram" : "Messenger";

  if (ultima === null) {
    return {
      forma: "BLOQUEADO_POR_POLITICA",
      codigo: "META_SEM_CONVERSA",
      porque: `A pessoa nunca escreveu pelo ${canal}. A política da Meta não permite a clínica iniciar conversa por este canal.`,
    };
  }

  const agora = entrada.agora.getTime();
  const dentroDos7Dias = agora < ultima + JANELA_HUMANA_MS - MARGEM_MS;

  if (!dentroDos7Dias) {
    return {
      forma: "FORA_DA_JANELA",
      codigo: "META_7_DIAS",
      porque: `A última mensagem no ${canal} tem mais de 7 dias. Nem a etiqueta de atendimento humano reabre a conversa — só a pessoa escrevendo de novo.`,
    };
  }

  if (entrada.quem !== "atendente") {
    return {
      forma: "EXIGE_HANDOFF",
      codigo: "META_EXIGE_HUMANO",
      porque: `Passou das 24 horas no ${canal}. Só uma pessoa da recepção pode responder daqui em diante — a etiqueta de atendimento humano afirma à Meta que há alguém atendendo, e a IA não pode afirmar isso.`,
    };
  }

  if (entrada.humanAgentAprovado !== true) {
    return {
      forma: "EXIGE_HANDOFF",
      codigo: "HUMAN_AGENT_NAO_APROVADO",
      porque: `Passou das 24 horas no ${canal} e a feature Human Agent ainda não foi aprovada para este app. Sem ela a Meta recusa o envio; o caminho é pedir a aprovação no App Review.`,
    };
  }

  return {
    forma: "PERMITIDO_ETIQUETA_HUMANA",
    etiqueta: "HUMAN_AGENT",
    porque: `Fora das 24 horas do ${canal}, com uma pessoa atendendo e a feature Human Agent aprovada: vale até 7 dias da última mensagem.`,
  };
}

/**
 * O private reply — §17.
 *
 * A JANELA É DO COMENTÁRIO, e não da conversa. É a única forma de a clínica
 * escrever para alguém que nunca mandou direct: a pessoa comentou em público, e
 * a Meta trata isso como convite — por 7 dias, e por UMA mensagem.
 */
function avaliarPrivateReply(entrada: EntradaDaPolitica): DecisaoDeCanal {
  if (entrada.canal === "whatsapp") {
    return {
      forma: "BLOQUEADO_POR_POLITICA",
      codigo: "PRIVATE_REPLY_SO_META",
      porque: "Private reply é um recurso do Instagram e do Messenger. Não existe no WhatsApp.",
    };
  }

  const comentario = instante(entrada.comentarioEm);
  if (comentario === null) {
    return {
      forma: "BLOQUEADO_POR_POLITICA",
      codigo: "PRIVATE_REPLY_SEM_COMENTARIO",
      porque:
        "Não há instante de comentário para medir a janela de 7 dias. Sem ele não dá para saber se o envio é permitido — e a resposta segura é não enviar.",
    };
  }

  const agora = entrada.agora.getTime();
  if (agora >= comentario + JANELA_HUMANA_MS - MARGEM_MS) {
    return {
      forma: "FORA_DA_JANELA",
      codigo: "PRIVATE_REPLY_EXPIRADO",
      porque:
        "O comentário tem mais de 7 dias. A Meta recusa private reply depois disso, e insistir só gasta cota.",
    };
  }

  return {
    forma: "PERMITIDO_PRIVATE_REPLY",
    porque: "Comentário de menos de 7 dias: cabe uma resposta privada, e só uma.",
  };
}

/* -------------------------------------------------------------------------- */
/* Leitura para a tela                                                        */
/* -------------------------------------------------------------------------- */

/** A decisão libera o envio? */
export function decisaoPermite(d: DecisaoDeCanal): boolean {
  return (
    d.forma === "PERMITIDO_TEXTO" ||
    d.forma === "PERMITIDO_TEMPLATE" ||
    d.forma === "PERMITIDO_ETIQUETA_HUMANA" ||
    d.forma === "PERMITIDO_PRIVATE_REPLY"
  );
}

/**
 * Insistir sozinho resolve?
 *
 * SÓ `EXIGE_HANDOFF` NÃO É PERMANENTE — e mesmo ele não é "tente de novo em um
 * minuto": é "alguém precisa assumir". O que a fila precisa saber é que
 * retentativa automática não muda nada em nenhum dos casos.
 */
export function decisaoEhPermanente(d: DecisaoDeCanal): boolean {
  return !decisaoPermite(d);
}
