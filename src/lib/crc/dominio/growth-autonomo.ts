/**
 * Growth autônomo — §35 e §36.
 *
 * ============================================================================
 *  O §35 É EXPLÍCITO SOBRE O QUE **NÃO** É: "não apenas gerar texto".
 *
 *  O fluxo que ele pede é
 *
 *    Goal → Audience → Message → Schedule → Experiment → Execution
 *         → Outcome → Optimization
 *
 *  e a maior parte dele já existia no CRC: campanha tem público, mensagem,
 *  agendamento e execução; experimento tem variantes e guardrail; meta tem
 *  alvo e medição.
 *
 *  O que FALTAVA eram as duas pontas — a primeira seta e a última:
 *
 *    Goal → Audience    quem atacar depende do que se quer. Uma meta de
 *                       ocupação fala com quem tem horário vago; uma de
 *                       reativação, com quem sumiu. Sem isso, "campanha para
 *                       a meta" é uma campanha para a base inteira.
 *
 *    Outcome → Optimization  sem o laço de volta, o experimento vira um
 *                       relatório que ninguém lê. O ciclo fecha quando o
 *                       resultado MUDA o que sai da próxima vez.
 * ============================================================================
 *
 * TUDO PURO.
 */
import type { TipoDeMeta } from "./metas";

/* -------------------------------------------------------------------------- */
/* Goal → Audience                                                            */
/* -------------------------------------------------------------------------- */

export type PublicoSugerido = {
  /** O critério, em linguagem do filtro de público que já existe. */
  criterio:
    "INATIVOS" | "ORCAMENTO_ABERTO" | "SEM_RETORNO_MARCADO" | "FALTARAM_RECENTEMENTE" | "TODOS";
  rotulo: string;
  /** Por que este público, e não outro. A tela mostra antes de aprovar. */
  porque: string;
  /**
   * O teto de pessoas que faz sentido para esta meta.
   *
   * Não é o teto da meta (que é autorização) — é o tamanho em que a campanha
   * ainda é uma campanha e não um disparo para a base.
   */
  tetoSugerido: number;
};

/**
 * De quem falar, dado o que se quer.
 *
 * ============================================================================
 *  A META DECIDE O PÚBLICO, e não o contrário.
 *
 *  É o erro mais comum de marketing em clínica: escolhe-se a lista ("vamos
 *  mandar para todo mundo") e depois se inventa o objetivo. O resultado é uma
 *  mensagem que não serve para ninguém em particular, e uma taxa de saída que
 *  ninguém relaciona à causa.
 *
 *  Aqui o caminho é o inverso, e cada critério tem uma razão que cabe numa
 *  frase — porque se não couber, o público está errado.
 * ============================================================================
 */
export function publicoParaMeta(tipo: TipoDeMeta): PublicoSugerido {
  if (tipo === "REATIVAR_PACIENTES") {
    return {
      criterio: "INATIVOS",
      rotulo: "Quem sumiu",
      porque:
        "A meta é trazer de volta quem parou de vir. Falar com quem está vindo não move este número.",
      tetoSugerido: 300,
    };
  }

  if (tipo === "CONVERSAO_ORCAMENTO") {
    return {
      criterio: "ORCAMENTO_ABERTO",
      rotulo: "Com orçamento sem desfecho",
      porque:
        "A meta é fechar orçamento. Só quem tem um aberto pode fechá-lo — o resto da base não tem como mover este número.",
      tetoSugerido: 200,
    };
  }

  if (tipo === "OCUPACAO_AGENDA" || tipo === "AGENDAMENTOS") {
    return {
      criterio: "SEM_RETORNO_MARCADO",
      rotulo: "Sem retorno marcado",
      porque:
        "A meta é encher a agenda. Quem já tem hora marcada não pode marcar de novo, e falar com ele só gasta o canal.",
      tetoSugerido: 400,
    };
  }

  if (tipo === "REDUZIR_FALTAS") {
    return {
      criterio: "FALTARAM_RECENTEMENTE",
      rotulo: "Quem faltou recentemente",
      porque:
        "A meta é reduzir falta. O público é quem já faltou — e a mensagem é confirmação, não oferta.",
      tetoSugerido: 150,
    };
  }

  /*
   * RECEITA_RECUPERADA CAI EM "TODOS", E ISSO É UM SINAL DE ALERTA, e não um
   * padrão confortável.
   *
   * "Recuperar receita" não diz de quem: o dinheiro pode estar no orçamento
   * parado, no paciente sumido ou na agenda vazia. Uma campanha para todos é
   * quase sempre a resposta errada, e a frase diz isso em voz alta para quem
   * for aprovar.
   */
  return {
    criterio: "TODOS",
    rotulo: "Base inteira — reveja",
    porque:
      "Esta meta não diz de quem é a receita a recuperar. Antes de disparar para a base, vale criar uma meta mais específica: orçamento parado, paciente sumido ou agenda vazia pedem públicos diferentes.",
    tetoSugerido: 100,
  };
}

/* -------------------------------------------------------------------------- */
/* Outcome → Optimization                                                     */
/* -------------------------------------------------------------------------- */

export type NumerosDaVariante = {
  nome: string;
  controle: boolean;
  enviados: number;
  responderam: number;
  converteram: number;
  optOuts: number;
};

export type Otimizacao =
  | { decisao: "PARAR_TUDO"; motivo: string; variante: string | null }
  | { decisao: "ESPERAR"; motivo: string; variante: null }
  | { decisao: "PROMOVER"; motivo: string; variante: string }
  | { decisao: "MANTER_CONTROLE"; motivo: string; variante: null };

/** Abaixo disto, qualquer diferença entre variantes é sorte. */
export const AMOSTRA_PARA_DECIDIR = 100;

/** Diferença mínima, em pontos percentuais, para promover uma variante. */
export const GANHO_MINIMO_PP = 3;

/**
 * O que fazer com o que o experimento mostrou.
 *
 * ============================================================================
 *  A ORDEM DAS DECISÕES É A ORDEM DO DANO, e não a da probabilidade.
 *
 *  Primeiro o guardrail: uma variante que está fazendo gente sair da lista
 *  precisa parar AGORA, e não quando tiver amostra estatística. O custo de
 *  parar cedo demais é não aprender; o de parar tarde é perder o canal com
 *  pessoas que não voltam.
 *
 *  Depois a amostra: sem ela, promover a "melhor" é promover ruído.
 *
 *  E só então o ganho — com piso. Meio ponto percentual de diferença entre
 *  duas mensagens é indistinguível de acaso, e promover por isso ensina o
 *  sistema a perseguir sombras.
 * ============================================================================
 */
export function otimizar(
  variantes: readonly NumerosDaVariante[],
  limites: { optOutMaxPct: number },
): Otimizacao {
  /* 1. O dano primeiro. */
  for (const v of variantes) {
    // O guardrail usa uma amostra menor de propósito: esperar 100 envios para
    // parar uma variante que está queimando o canal já é tarde demais.
    if (v.enviados < 20) continue;

    const pct = (v.optOuts / v.enviados) * 100;
    if (pct > limites.optOutMaxPct) {
      return {
        decisao: "PARAR_TUDO",
        variante: v.nome,
        motivo: `"${v.nome}" fez ${pct.toFixed(1)}% das pessoas saírem em ${String(v.enviados)} envios, acima do limite de ${String(limites.optOutMaxPct)}%. Perder o canal é pior do que perder a campanha.`,
      };
    }
  }

  /* 2. A amostra. */
  const total = variantes.reduce((s, v) => s + v.enviados, 0);
  if (total < AMOSTRA_PARA_DECIDIR) {
    return {
      decisao: "ESPERAR",
      variante: null,
      motivo: `${String(total)} envios até agora. Abaixo de ${String(AMOSTRA_PARA_DECIDIR)}, qualquer diferença entre as variantes é sorte.`,
    };
  }

  /* 3. O ganho, com piso. */
  const controle = variantes.find((v) => v.controle);
  if (controle === undefined || controle.enviados === 0) {
    return {
      decisao: "ESPERAR",
      variante: null,
      motivo: "Sem grupo de controle com envios, não há contra o que comparar.",
    };
  }

  const taxa = (v: NumerosDaVariante): number =>
    v.enviados === 0 ? 0 : (v.converteram / v.enviados) * 100;

  const taxaControle = taxa(controle);

  const desafiantes = variantes
    .filter((v) => !v.controle && v.enviados > 0)
    .map((v) => ({ v, ganho: taxa(v) - taxaControle }))
    .sort((a, b) => b.ganho - a.ganho);

  const melhor = desafiantes[0];

  if (melhor === undefined || melhor.ganho < GANHO_MINIMO_PP) {
    return {
      decisao: "MANTER_CONTROLE",
      variante: null,
      motivo:
        melhor === undefined
          ? "Nenhuma variante além do controle teve envios."
          : `A melhor variante ganhou ${melhor.ganho.toFixed(1)} ponto(s) percentual(is) do controle, abaixo do mínimo de ${String(GANHO_MINIMO_PP)}. Diferença desse tamanho é indistinguível de acaso.`,
    };
  }

  return {
    decisao: "PROMOVER",
    variante: melhor.v.nome,
    motivo: `"${melhor.v.nome}" converteu ${taxa(melhor.v).toFixed(1)}% contra ${taxaControle.toFixed(1)}% do controle, em ${String(total)} envios.`,
  };
}
