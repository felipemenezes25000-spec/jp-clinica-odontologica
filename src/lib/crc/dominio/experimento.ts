/**
 * A/B — Fase H.
 *
 * O PROBLEMA REAL DE UM TESTE A/B NUMA CLÍNICA não é sortear grupos: é que a
 * amostra é pequena. Uma clínica manda algumas centenas de mensagens por mês, e
 * com esse volume a diferença entre 18% e 23% de resposta é quase sempre acaso.
 *
 * Um painel que mostra "Variante B: 23% (+5pp)" em verde convence — e está
 * errado na maior parte das vezes. A clínica troca o texto, o número volta ao
 * normal no mês seguinte, e ninguém liga as duas coisas.
 *
 * ========================================================================
 *  POR ISSO ESTE MÓDULO SE RECUSA A DECLARAR VENCEDOR sem evidência, e diz
 *  QUANTOS CASOS AINDA FALTAM. "Precisa de mais 140 envios" é uma resposta
 *  útil; "B está ganhando" com 40 amostras é uma armadilha.
 * ========================================================================
 *
 * O SORTEIO É DETERMINÍSTICO POR PACIENTE, e não aleatório por envio. A mesma
 * pessoa cai sempre na mesma variante — senão ela receberia o texto A numa
 * semana e o B na outra, o que não testa texto nenhum e ainda parece
 * desorganização para quem recebe.
 */

export type Variante = "A" | "B";

export type ResultadoDaVariante = {
  variante: Variante;
  /** Quantos entraram. */
  amostras: number;
  /** Quantos fizeram o que se queria — responder, marcar, comparecer. */
  sucessos: number;
  taxa: number;
};

export type VeredictoDoExperimento =
  | {
      decidido: true;
      vencedora: Variante;
      /** Diferença em pontos percentuais. */
      diferencaPp: number;
      explicacao: string;
    }
  | {
      decidido: false;
      /** Quantas amostras A MAIS são necessárias, por variante. */
      faltamPorVariante: number;
      explicacao: string;
    };

/**
 * O mínimo por variante para uma conclusão ter chão.
 *
 * CEM, e o número vem de uma conta simples em vez de intuição: com taxas na casa
 * de 20%, o erro padrão de cada braço é cerca de 4pp com n=100. Duas medidas com
 * 4pp de erro só se separam com confiança quando a diferença é de uns 10pp.
 *
 * Abaixo de cem, o painel estaria medindo sorte com três casas decimais.
 */
export const MINIMO_POR_VARIANTE = 100;

/**
 * A diferença mínima para chamar de diferença.
 *
 * DEZ PONTOS PERCENTUAIS. É bem mais do que um teste com milhões de amostras
 * exigiria — e é exatamente o ponto: numa clínica o teste NÃO tem milhões de
 * amostras, e uma régua emprestada de quem tem produz conclusão falsa.
 *
 * Um ganho real de 10pp — de 20% para 30% — vale a troca. Um de 3pp não é
 * mensurável aqui, e fingir que é custa mais do que o ganho valeria.
 */
export const DIFERENCA_MINIMA_PP = 10;

export function avaliarExperimento(
  a: ResultadoDaVariante,
  b: ResultadoDaVariante,
): VeredictoDoExperimento {
  const menor = Math.min(a.amostras, b.amostras);

  if (menor < MINIMO_POR_VARIANTE) {
    return {
      decidido: false,
      faltamPorVariante: MINIMO_POR_VARIANTE - menor,
      explicacao: `Ainda não dá para saber. Faltam ${String(MINIMO_POR_VARIANTE - menor)} casos na variante menor. Com a amostra atual, a diferença que aparece é quase toda acaso.`,
    };
  }

  const diferencaPp = (a.taxa - b.taxa) * 100;
  const absoluta = Math.abs(diferencaPp);

  if (absoluta < DIFERENCA_MINIMA_PP) {
    return {
      decidido: false,
      faltamPorVariante: 0,
      /*
       * "EMPATE" É UM RESULTADO, e um dos mais valiosos.
       *
       * Ele diz: pare de mexer nisto, o texto não é o gargalo. Sem esta saída, a
       * clínica trocaria de texto para sempre atrás de um ganho que não está
       * ali — e o tempo gasto nisso é tempo que não foi para o que move.
       */
      explicacao: `As duas variantes empatam (${String(Math.round(absoluta * 10) / 10)}pp de diferença, e o mínimo mensurável aqui é ${String(DIFERENCA_MINIMA_PP)}pp). O texto não está fazendo diferença: o gargalo é outro.`,
    };
  }

  const vencedora: Variante = diferencaPp > 0 ? "A" : "B";
  const ganhadora = vencedora === "A" ? a : b;
  const perdedora = vencedora === "A" ? b : a;

  return {
    decidido: true,
    vencedora,
    diferencaPp: absoluta,
    explicacao: `A variante ${vencedora} converteu ${String(Math.round(ganhadora.taxa * 100))}% contra ${String(Math.round(perdedora.taxa * 100))}%, com ${String(ganhadora.amostras)} e ${String(perdedora.amostras)} casos. A diferença é grande o bastante para não ser acaso nesta amostra.`,
  };
}

/**
 * Em qual variante esta pessoa cai.
 *
 * DETERMINÍSTICO POR (experimento, paciente). A mesma pessoa cai sempre no mesmo
 * lado — e pessoas diferentes se dividem ao meio.
 *
 * POR QUE O ID DO EXPERIMENTO ENTRA NO HASH: sem ele, a paciente que caiu em A
 * no teste de lembrete cairia em A em TODOS os testes, para sempre. Um grupo
 * fixo recebendo sempre a variante A acumularia diferenças que nada têm a ver
 * com o texto — e o segundo experimento herdaria o viés do primeiro sem que
 * ninguém tivesse como perceber.
 */
export function varianteDe(experimentoId: string, patientId: string): Variante {
  // FNV-1a: barato, bem distribuído e — o que importa aqui — igual em qualquer
  // runtime. `Math.random` daria grupos diferentes a cada execução, e o mesmo
  // paciente veria textos diferentes a cada mensagem.
  let h = 0x811c9dc5;
  const semente = `${experimentoId}:${patientId}`;

  for (let i = 0; i < semente.length; i += 1) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }

  /*
   * A AVALANCHE FINAL, e ela precisou de duas tentativas para ficar certa.
   *
   * PRIMEIRA VERSÃO: `h % 2`. O bit menos significativo do FNV-1a é quase a
   * paridade dos bytes de entrada — multiplicar por um número ímpar a preserva
   * a cada volta. Resultado medido em teste: `exp-1` e `exp-2` produziam grupos
   * PERFEITAMENTE INVERTIDOS. Toda pessoa que caía em A no primeiro caía em B
   * no segundo.
   *
   * SEGUNDA VERSÃO: o byte alto, `(h >>> 24) % 2`. Também falhou, e o motivo é
   * mais fundo: uma diferença de UM byte na entrada vira, no FNV-1a, um delta
   * ADITIVO fixo no estado final. Nenhum bit isolado escapa disso — trocar de
   * bit é trocar de sintoma.
   *
   * O QUE RESOLVE é quebrar a linearidade, e é para isso que existe um
   * finalizador. Este é o `fmix32` do MurmurHash3: dois deslocamentos com XOR e
   * duas multiplicações, que espalham cada bit de entrada por todos os bits de
   * saída. Depois dele, entradas vizinhas não têm relação nenhuma.
   *
   * POR QUE ISSO IMPORTA NA PRÁTICA: dois experimentos rodando ao mesmo tempo
   * mediriam populações complementares, e a primeira leitura seria "a variante A
   * funciona num teste e falha no outro" — uma conclusão sobre o texto que é, na
   * verdade, sobre o sorteio.
   */
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;

  return h % 2 === 0 ? "A" : "B";
}

/**
 * Quanto tempo, no ritmo atual, para o experimento terminar.
 *
 * A PERGUNTA POR TRÁS É "VALE A PENA COMEÇAR?". Um teste que precisa de oito
 * meses para concluir não é um teste: é uma decisão adiada por oito meses. Saber
 * disso ANTES é o que impede a clínica de esperar meio ano por um número.
 */
export function previsaoDeTermino(
  a: ResultadoDaVariante,
  b: ResultadoDaVariante,
  amostrasPorSemana: number,
): { semanas: number; viavel: boolean; explicacao: string } {
  const menor = Math.min(a.amostras, b.amostras);
  const faltam = Math.max(MINIMO_POR_VARIANTE - menor, 0);

  if (faltam === 0) {
    return { semanas: 0, viavel: true, explicacao: "A amostra já é suficiente." };
  }

  if (amostrasPorSemana <= 0) {
    return {
      semanas: Infinity,
      viavel: false,
      explicacao: "Nenhum caso novo está entrando: o experimento não vai terminar.",
    };
  }

  // Cada semana se divide entre as duas variantes, então a variante menor
  // cresce à metade do ritmo total. Esquecer isso dobraria a previsão otimista.
  const semanas = Math.ceil(faltam / (amostrasPorSemana / 2));

  return {
    semanas,
    // Doze semanas é o limite do que uma clínica consegue esperar sem que o
    // resto mude — preço, equipe, sazonalidade — e contamine o resultado.
    viavel: semanas <= 12,
    explicacao:
      semanas <= 12
        ? `No ritmo atual, o experimento conclui em cerca de ${String(semanas)} semanas.`
        : `No ritmo atual seriam ${String(semanas)} semanas — tempo demais. Até lá, preço, equipe e sazonalidade terão mudado, e o resultado não vai dizer respeito ao texto. Teste algo com mais volume.`,
  };
}
