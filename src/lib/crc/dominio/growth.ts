/**
 * Growth — reputação, indicação, experimento e aprendizado.
 *
 * ============================================================================
 *  AS TRÊS REGRAS QUE ESTE ARQUIVO SUSTENTA, e cada uma protege de um jeito
 *  diferente de o sistema estragar a relação com o paciente:
 *
 *  §32  NUNCA MANIPULAR AVALIAÇÃO. Perguntar a todos, e ROTEAR a resposta.
 *  §36  GUARDRAIL QUE PARA SOZINHO. Variante que gera opt-out morre na hora.
 *  §37  APRENDIZADO NÃO SE APLICA SOZINHO. Uma pessoa move para APLICADO.
 * ============================================================================
 *
 * TUDO PURO.
 */

/* -------------------------------------------------------------------------- */
/* Reputação                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A nota a partir da qual a pessoa é convidada a avaliar publicamente.
 *
 * ============================================================================
 *  NOVE, E O CORTE É ONDE ELE É PORQUE A ESCALA É NPS.
 *
 *  Em NPS, 9 e 10 são promotores; 7 e 8 são neutros; 0 a 6 são detratores. Um
 *  neutro convidado a avaliar publicamente escreve "atendimento ok" — que não
 *  ajuda a clínica e ocupa o lugar de uma avaliação boa.
 * ============================================================================
 */
export const NOTA_PARA_CONVITE = 9;

/**
 * Abaixo disto, vira caso interno para alguém resolver.
 *
 * SEIS: o limite do detrator. Entre 7 e 8 a pessoa não é convidada a avaliar
 * nem vira caso — ela simplesmente foi atendida, e tudo bem.
 */
export const NOTA_DE_RECUPERACAO = 6;

export type DestinoDoFeedback =
  | { destino: "CONVIDAR"; porque: string }
  | { destino: "RECUPERAR"; porque: string; urgencia: "ALTA" | "NORMAL" }
  | { destino: "AGRADECER"; porque: string };

/**
 * O que fazer com esta resposta.
 *
 * ============================================================================
 *  ISTO NÃO É MANIPULAR AVALIAÇÃO, e a distinção é fina e importante.
 *
 *  MANIPULAR seria escolher A QUEM PERGUNTAR com base na nota esperada —
 *  perguntar só a quem provavelmente gostou. Isso produz média alta e uma
 *  clínica que não sabe o que está errado.
 *
 *  O QUE ACONTECE AQUI é perguntar a TODO MUNDO e rotear a resposta. Quem
 *  gostou recebe o convite; quem não gostou é ouvido pela clínica em vez de
 *  escrever direto no Google. A insatisfação CHEGA — que é melhor para os dois
 *  lados.
 * ============================================================================
 */
export function destinoDoFeedback(nota: number, comentario: string | null): DestinoDoFeedback {
  if (nota >= NOTA_PARA_CONVITE) {
    return {
      destino: "CONVIDAR",
      porque: `Nota ${String(nota)}: é promotor, e o convite para avaliar faz sentido.`,
    };
  }

  if (nota <= NOTA_DE_RECUPERACAO) {
    /*
     * COMENTÁRIO ESCRITO ELEVA A URGÊNCIA. Quem se deu ao trabalho de
     * escrever quer ser ouvido — e é quem mais provavelmente vai escrever em
     * outro lugar se ninguém responder.
     */
    const escreveu = comentario !== null && comentario.trim().length > 10;
    return {
      destino: "RECUPERAR",
      porque: escreveu
        ? `Nota ${String(nota)} com comentário: a pessoa quer ser ouvida.`
        : `Nota ${String(nota)}: alguma coisa não foi bem.`,
      urgencia: nota <= 3 || escreveu ? "ALTA" : "NORMAL",
    };
  }

  return {
    destino: "AGRADECER",
    porque: `Nota ${String(nota)}: neutro. Convidar a avaliar renderia "atendimento ok".`,
  };
}

/**
 * O NPS de um conjunto de notas.
 *
 * PROMOTORES MENOS DETRATORES, em pontos percentuais. Os neutros entram no
 * denominador e não no numerador — é a definição, e implementá-la errado é o
 * jeito mais comum de um painel de NPS mostrar um número que não é NPS.
 */
export function calcularNps(notas: readonly number[]): number | null {
  if (notas.length === 0) return null;

  const promotores = notas.filter((n) => n >= 9).length;
  const detratores = notas.filter((n) => n <= 6).length;

  return Math.round(((promotores - detratores) / notas.length) * 100);
}

/* -------------------------------------------------------------------------- */
/* Indicação                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Gera um código de indicação legível ao telefone.
 *
 * ============================================================================
 *  O ALFABETO EXCLUI O QUE SE CONFUNDE FALANDO: 0/O, 1/I/L, 5/S, 2/Z.
 *
 *  O código existe para funcionar SEM app e SEM link: a pessoa fala "fui
 *  indicada pela Ana, código ABC123" na recepção. Um alfabeto completo produz
 *  códigos que ninguém consegue ditar sem soletrar duas vezes — e um sistema de
 *  indicação que depende de link perde a maioria das indicações reais, que
 *  acontecem numa conversa.
 * ============================================================================
 */
const ALFABETO = "ABCDEFGHJKMNPQRTUVWXY34679";

export function gerarCodigo(semente: string): string {
  /*
   * DERIVADO DO ID, e não aleatório.
   *
   * O mesmo paciente gera sempre o mesmo código — o que torna a operação
   * idempotente e permite regerar sem invalidar o que já foi divulgado. Um
   * código aleatório exigiria guardar antes de poder usar, e um retry criaria
   * o segundo código da mesma pessoa.
   */
  let h = 2166136261;
  for (let i = 0; i < semente.length; i += 1) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }

  let codigo = "";
  for (let i = 0; i < 6; i += 1) {
    codigo += ALFABETO[h % ALFABETO.length] ?? "A";
    h = Math.floor(h / ALFABETO.length) + i * 7919;
  }
  return codigo;
}

export type EtapaDaIndicacao =
  "REGISTRADA" | "VIROU_LEAD" | "AGENDOU" | "COMPARECEU" | "CONVERTEU" | "PERDIDA";

/** A ordem da cadeia. Serve para o funil não deixar ninguém andar para trás. */
const ORDEM: readonly EtapaDaIndicacao[] = [
  "REGISTRADA",
  "VIROU_LEAD",
  "AGENDOU",
  "COMPARECEU",
  "CONVERTEU",
];

/**
 * Esta indicação pode avançar para esta etapa?
 *
 * ANDAR PARA TRÁS É RECUSADO, e o motivo é prático: a sincronização reprocessa,
 * e um evento antigo chegando fora de ordem rebaixaria uma indicação que já
 * converteu. `PERDIDA` é a exceção — dá para perder de qualquer ponto.
 */
export function podeAvancar(de: EtapaDaIndicacao, para: EtapaDaIndicacao): boolean {
  if (para === "PERDIDA") return de !== "CONVERTEU";
  if (de === "PERDIDA") return false;

  const i = ORDEM.indexOf(de);
  const j = ORDEM.indexOf(para);
  if (i < 0 || j < 0) return false;
  return j > i;
}

/* -------------------------------------------------------------------------- */
/* Experimento                                                                */
/* -------------------------------------------------------------------------- */

export type NumerosDaVariante = {
  nome: string;
  controle: boolean;
  enviados: number;
  responderam: number;
  converteram: number;
  optOuts: number;
};

export type VereditoDoGuardrail =
  { parar: false; motivo: string } | { parar: true; variante: string; motivo: string };

/**
 * Alguma variante precisa parar AGORA?
 *
 * ============================================================================
 *  ESTA É A FUNÇÃO MAIS IMPORTANTE DO MÓDULO DE EXPERIMENTOS.
 *
 *  Sem ela, um teste A/B numa base de pacientes é um jeito estruturado de
 *  queimar metade da lista: a variante ruim continua rodando até alguém abrir o
 *  relatório na semana seguinte.
 *
 *  E A AMOSTRA MÍNIMA É PARTE DO GUARDRAIL, não um detalhe: sem ela, o primeiro
 *  opt-out numa amostra de três pararia o experimento com "6% de opt-out" — que
 *  é um número sem significado nenhum.
 * ============================================================================
 */
export function conferirGuardrail(
  variantes: readonly NumerosDaVariante[],
  limites: { optOutMaxPct: number; amostraMinima: number },
): VereditoDoGuardrail {
  for (const v of variantes) {
    if (v.enviados < limites.amostraMinima) continue;

    const pct = (v.optOuts / v.enviados) * 100;
    if (pct > limites.optOutMaxPct) {
      return {
        parar: true,
        variante: v.nome,
        motivo: `A variante "${v.nome}" gerou ${pct.toFixed(1)}% de saídas em ${String(v.enviados)} envios, acima do limite de ${String(limites.optOutMaxPct)}%.`,
      };
    }
  }

  return { parar: false, motivo: "Nenhuma variante passou do limite de saídas." };
}

export type LeituraDoExperimento = {
  variantes: (NumerosDaVariante & {
    taxaDeResposta: number | null;
    taxaDeConversao: number | null;
    /** Diferença em pontos percentuais contra o controle. `null` no controle. */
    contraControle: number | null;
  })[];
  /** `null` até haver amostra suficiente para dizer qualquer coisa. */
  vencedora: string | null;
  porque: string;
};

/**
 * Quantos precisam ter recebido antes de o experimento dizer alguma coisa.
 *
 * ============================================================================
 *  CEM POR VARIANTE, e o número é conservador de propósito.
 *
 *  Com 30 envios e 3 conversões contra 30 e 5, a diferença parece 66% melhor e
 *  é ruído: bastaria uma pessoa mudar de ideia para inverter. Anunciar uma
 *  vencedora ali faz a clínica mudar a operação inteira por causa de duas
 *  pessoas.
 *
 *  Isto não é um teste estatístico — é um piso que impede a conclusão mais
 *  errada. Quem quiser rigor usa uma amostra maior; o piso só evita o absurdo.
 * ============================================================================
 */
export const AMOSTRA_PARA_CONCLUIR = 100;

export function lerExperimento(variantes: readonly NumerosDaVariante[]): LeituraDoExperimento {
  const controle = variantes.find((v) => v.controle);

  const taxa = (num: number, den: number): number | null =>
    den === 0 ? null : Number(((num / den) * 100).toFixed(2));

  const taxaControle =
    controle === undefined ? null : taxa(controle.converteram, controle.enviados);

  const lidas = variantes.map((v) => {
    const conv = taxa(v.converteram, v.enviados);
    return {
      ...v,
      taxaDeResposta: taxa(v.responderam, v.enviados),
      taxaDeConversao: conv,
      contraControle:
        v.controle || conv === null || taxaControle === null
          ? null
          : Number((conv - taxaControle).toFixed(2)),
    };
  });

  const suficiente = variantes.every((v) => v.enviados >= AMOSTRA_PARA_CONCLUIR);
  if (!suficiente) {
    const menor = Math.min(...variantes.map((v) => v.enviados));
    return {
      variantes: lidas,
      vencedora: null,
      porque: `Ainda sem amostra para concluir: a variante menor tem ${String(menor)} envios, e o piso é ${String(AMOSTRA_PARA_CONCLUIR)}.`,
    };
  }

  const melhor = [...lidas].sort((a, b) => (b.taxaDeConversao ?? 0) - (a.taxaDeConversao ?? 0))[0];

  if (melhor === undefined || melhor.taxaDeConversao === null) {
    return { variantes: lidas, vencedora: null, porque: "Sem conversão em nenhuma variante." };
  }

  /*
   * DIFERENÇA PEQUENA NÃO TEM VENCEDORA. Dois pontos percentuais entre
   * variantes com 100 envios cada é uma pessoa de diferença — e trocar a
   * operação por causa de uma pessoa é pior que não testar.
   */
  const segunda = [...lidas]
    .filter((v) => v.nome !== melhor.nome)
    .sort((a, b) => (b.taxaDeConversao ?? 0) - (a.taxaDeConversao ?? 0))[0];

  const margem =
    segunda === undefined ? Infinity : melhor.taxaDeConversao - (segunda.taxaDeConversao ?? 0);

  if (margem < 3) {
    return {
      variantes: lidas,
      vencedora: null,
      porque: "As variantes ficaram empatadas dentro da margem de ruído.",
    };
  }

  return {
    variantes: lidas,
    vencedora: melhor.nome,
    porque: `"${melhor.nome}" converteu ${String(melhor.taxaDeConversao)}%, ${margem.toFixed(1)} pontos acima da segunda.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Aprendizado                                                                */
/* -------------------------------------------------------------------------- */

export type StatusDoAprendizado = "CANDIDATO" | "VALIDADO" | "REJEITADO" | "APLICADO" | "EXPIRADO";

export type Evidencia = {
  amostra: number;
  efeitoPct: number;
  periodoDias: number;
};

export type VereditoDoAprendizado = {
  status: StatusDoAprendizado;
  confianca: number;
  porque: string;
};

/**
 * Este aprendizado tem evidência suficiente?
 *
 * ============================================================================
 *  O QUE ESTA FUNÇÃO NUNCA DEVOLVE É `APLICADO`.
 *
 *  O §37 é explícito: "não alterar política crítica silenciosamente". Um
 *  sistema que muda a própria política a partir de correlação acaba fazendo
 *  besteira com confiança — e a besteira é invisível, porque o sistema também
 *  escolhe como se medir.
 *
 *  `VALIDADO` é o máximo que o cálculo alcança. Mover para `APLICADO` é uma
 *  decisão de pessoa, com nome registrado.
 * ============================================================================
 */
export function avaliarAprendizado(e: Evidencia): VereditoDoAprendizado {
  /*
   * EFEITO PEQUENO É REJEITADO, mesmo com amostra grande.
   *
   * Três pontos percentuais de diferença é real com amostra suficiente — e é
   * irrelevante para uma clínica que precisa escolher onde gastar atenção. Um
   * painel cheio de aprendizados de 2% ensina a ignorar o painel.
   */
  if (Math.abs(e.efeitoPct) < 5) {
    return {
      status: "REJEITADO",
      confianca: 0,
      porque: `Efeito de ${e.efeitoPct.toFixed(1)} pontos é pequeno demais para mudar o que a clínica faz.`,
    };
  }

  if (e.amostra < 30) {
    return {
      status: "CANDIDATO",
      confianca: 0.1,
      porque: `Só ${String(e.amostra)} casos: ainda pode ser coincidência.`,
    };
  }

  /*
   * O PERÍODO IMPORTA TANTO QUANTO A AMOSTRA, e é o que quase todo mundo
   * esquece: 200 casos em três dias medem aquela semana, não um padrão. Se a
   * semana tinha feriado, o "aprendizado" é sobre o feriado.
   */
  if (e.periodoDias < 14) {
    return {
      status: "CANDIDATO",
      confianca: 0.3,
      porque: `${String(e.amostra)} casos, mas em ${String(e.periodoDias)} dias: período curto demais para separar padrão de semana atípica.`,
    };
  }

  if (e.amostra < 100) {
    return {
      status: "CANDIDATO",
      confianca: 0.5,
      porque: `${String(e.amostra)} casos em ${String(e.periodoDias)} dias: promissor, e ainda não conclusivo.`,
    };
  }

  return {
    status: "VALIDADO",
    // Nunca 1: uma medição observacional de clínica não é experimento
    // controlado, e fingir certeza aqui é o começo de aplicar sozinho.
    confianca: Math.min(0.85, 0.5 + e.amostra / 1000),
    porque: `${String(e.amostra)} casos em ${String(e.periodoDias)} dias, efeito de ${e.efeitoPct.toFixed(1)} pontos. Falta uma pessoa decidir aplicar.`,
  };
}

/**
 * Dias até um aprendizado validado expirar.
 *
 * NOVENTA. Uma clínica muda: equipe nova, horário novo, público novo. Um
 * aprendizado de um ano atrás sobre o melhor horário de recall pode estar
 * descrevendo uma operação que não existe mais — e continuar guiando decisão.
 */
export const VALIDADE_DO_APRENDIZADO_DIAS = 90;

export function expirou(decididoEm: string | null, agora: Date): boolean {
  if (decididoEm === null) return false;
  const idade = (agora.getTime() - Date.parse(decididoEm)) / 86_400_000;
  return idade > VALIDADE_DO_APRENDIZADO_DIAS;
}
