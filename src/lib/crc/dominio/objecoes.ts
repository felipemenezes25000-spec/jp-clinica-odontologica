/**
 * As objeções — Fase H.
 *
 * O QUE UMA OBJEÇÃO É, aqui: o motivo que a pessoa deu para não fechar, nas
 * palavras dela. "Tá caro", "vou falar com meu marido", "vou pensar", "tenho
 * medo de dentista", "não tenho tempo agora".
 *
 * POR QUE CLASSIFICAR. Não para responder automaticamente — isso seria o agente
 * argumentando com um paciente sobre preço, e não é papel dele. É para a clínica
 * ENXERGAR: se "tá caro" aparece em 60% das objeções do mês, o problema não é
 * treinamento de equipe, é a tabela de preço ou a forma de apresentá-la.
 *
 * ========================================================================
 *  A REGRA QUE GOVERNA ESTE ARQUIVO: guarda-se o TEXTO ORIGINAL, sempre.
 *
 *  A categoria é um índice para contar, e não um substituto. Uma objeção
 *  guardada só como "PRECO" perdeu a informação que importava — "tá caro pra
 *  mim agora, mês que vem eu consigo" e "tá caro, achei mais barato na outra
 *  clínica" viram a mesma linha, e são conversas opostas.
 * ========================================================================
 *
 * A CLASSIFICAÇÃO É POR PALAVRA, e não por modelo. Três razões: é explicável
 * (dá para ver por que caiu em PRECO), é de graça, e é auditável — alguém pode
 * ler a lista de padrões e discordar. Um classificador de modelo custaria uma
 * chamada por objeção para produzir um rótulo que ninguém consegue contestar.
 */

export type CategoriaObjecao =
  "PRECO" | "TEMPO" | "MEDO" | "TERCEIRO" | "CONVENIO" | "CONFIANCA" | "OUTRO";

export type ObjecaoClassificada = {
  categoria: CategoriaObjecao;
  /** O texto original, SEMPRE. Ver o cabeçalho. */
  texto: string;
  /** 0 a 1. Baixa confiança vira OUTRO na contagem, e continua legível. */
  confianca: number;
  /** Qual padrão casou. Serve para alguém discordar do critério. */
  padrao: string | null;
};

/**
 * Os padrões, do mais específico para o mais genérico.
 *
 * A ORDEM IMPORTA e é a parte fácil de errar. "Não tenho dinheiro agora" tem
 * "agora", que é de TEMPO, e "dinheiro", que é de PREÇO. A pessoa está falando
 * de dinheiro. Por isso PREÇO vem antes, e por isso a busca para no primeiro
 * casamento em vez de somar pontos de todos.
 */
const PADROES: readonly { categoria: CategoriaObjecao; regex: RegExp; nome: string }[] = [
  {
    categoria: "PRECO",
    /*
     * `car[oa]` COM FRONTEIRA SÓ NO COMEÇO.
     *
     * Um `\b` dos dois lados não casaria "carinho" — o que é bom — mas também
     * exigiria a palavra exata e perderia "caríssimo". O erro oposto, sem
     * fronteira nenhuma, casaria "carro" e "carne". A fronteira à esquerda com
     * a raiz aberta à direita é o meio-termo que funciona em português.
     *
     * (É o mesmo defeito que já apareceu nos padrões de recusa de memória: uma
     * raiz fechada por `\b` dos dois lados nunca casa a palavra flexionada.)
     */
    regex:
      /\b(car[oa]|caríssim|salgad|valor alt|muito dinheiro|sem dinheiro|não tenho dinheiro|apertad|orçamento alt|fora do meu)/iu,
    nome: "preço",
  },
  {
    categoria: "CONVENIO",
    regex:
      /\b(convêni|plano de saúde|plano odonto|amil|bradesco saúde|unimed|sulaméric|particular mesmo)/iu,
    nome: "convênio",
  },
  {
    categoria: "MEDO",
    regex: /\b(medo|pavor|receio|traum|dói muito|doer|ansiedade|pânic|não aguento)/iu,
    nome: "medo",
  },
  {
    categoria: "TERCEIRO",
    /*
     * "VOU FALAR COM ALGUÉM" É CATEGORIA PRÓPRIA, e não evasiva.
     *
     * Numa clínica, tratamento caro é decisão de casa: cônjuge, filho que ajuda
     * a pagar, mãe. Misturar isso com "vou pensar" perderia a única objeção
     * desta lista com uma resposta óbvia — mandar o orçamento por escrito, para
     * a pessoa poder mostrar.
     */
    regex:
      /\b(falar com (meu|minha|o|a)|marido|esposa|mulher|companheir|minha mãe|meu pai|meu filho|consultar em casa|ver com a famíli)/iu,
    nome: "decisão de terceiro",
  },
  {
    categoria: "TEMPO",
    regex:
      /\b(sem tempo|não tenho tempo|corrid|trabalh(o|ando) muito|viaj|mês que vem|depois d|mais para frente|agora não d)/iu,
    nome: "tempo",
  },
  {
    categoria: "CONFIANCA",
    regex:
      /\b(pesquisar|ver outr|outra clínic|segunda opini|indicaç|avaliaç|nunca fui a[íi]|não conheç)/iu,
    nome: "confiança",
  },
  {
    categoria: "OUTRO",
    // "Vou pensar" é a objeção mais comum e a que menos informa. Categoria
    // própria seria fingir que se sabe alguma coisa: o que ela diz é "não vou
    // dizer o motivo".
    regex: /\b(vou pensar|pensar melhor|depois eu vej|te aviso|qualquer coisa eu)/iu,
    nome: "adiamento sem motivo",
  },
];

export function classificarObjecao(texto: string): ObjecaoClassificada {
  const limpo = texto.trim();

  if (limpo.length === 0) {
    return { categoria: "OUTRO", texto: limpo, confianca: 0, padrao: null };
  }

  for (const p of PADROES) {
    if (p.regex.test(limpo)) {
      return {
        categoria: p.categoria,
        // O TEXTO ORIGINAL, SEMPRE. Ver o cabeçalho.
        texto: limpo,
        /*
         * CONFIANÇA MENOR PARA TEXTO CURTO.
         *
         * "Caro" sozinho pode ser resposta a "o que achou do orçamento?" ou
         * pedaço de "não é caro". Sem contexto, o padrão acerta menos — e a
         * contagem precisa saber disso para não somar chute com certeza.
         */
        confianca: limpo.length < 15 ? 0.6 : 0.85,
        padrao: p.nome,
      };
    }
  }

  return { categoria: "OUTRO", texto: limpo, confianca: 0.3, padrao: null };
}

export type ContagemDeObjecoes = {
  categoria: CategoriaObjecao;
  quantidade: number;
  /** 0 a 1. */
  fracao: number;
  /** Três exemplos REAIS, nas palavras dos pacientes. */
  exemplos: string[];
};

/**
 * Conta as objeções por categoria, com exemplos.
 *
 * OS EXEMPLOS SÃO METADE DO VALOR. "PRECO: 34" não diz o que fazer. "PRECO: 34,
 * e um deles é 'tá caro, achei metade disso na clínica do bairro'" diz — e o que
 * diz não é o que o número sugeria.
 */
export function contarObjecoes(objecoes: readonly ObjecaoClassificada[]): ContagemDeObjecoes[] {
  const total = objecoes.length;
  if (total === 0) return [];

  const mapa = new Map<CategoriaObjecao, ObjecaoClassificada[]>();
  for (const o of objecoes) {
    const lista = mapa.get(o.categoria) ?? [];
    lista.push(o);
    mapa.set(o.categoria, lista);
  }

  return [...mapa.entries()]
    .map(([categoria, lista]) => ({
      categoria,
      quantidade: lista.length,
      fracao: lista.length / total,
      exemplos: lista
        // OS MAIS LONGOS PRIMEIRO: "tá caro" não ensina nada, e "tá caro, achei
        // metade disso na clínica do bairro" ensina tudo.
        .slice()
        .sort((a, b) => b.texto.length - a.texto.length)
        .slice(0, 3)
        .map((o) => o.texto),
    }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

/**
 * O que a clínica deveria fazer sobre a objeção mais comum.
 *
 * É SUGESTÃO PARA A GESTÃO, e não roteiro para o agente responder. A diferença
 * é o assunto: o agente não deve argumentar com paciente sobre preço, e nada
 * aqui vira texto de mensagem automática.
 */
export function leituraDaSituacao(contagens: readonly ContagemDeObjecoes[]): string {
  const topo = contagens[0];
  if (topo === undefined) return "Nenhuma objeção registrada no período.";

  // Menos de um terço não é padrão: é a maior fatia de um bolo repartido.
  // Anunciar "o problema é preço" com 20% seria transformar ruído em diretriz.
  if (topo.fracao < 0.33) {
    return "As objeções estão espalhadas entre motivos diferentes. Não há um problema único a atacar.";
  }

  const pct = String(Math.round(topo.fracao * 100));

  switch (topo.categoria) {
    case "PRECO":
      return `${pct}% das objeções são de preço. Isso raramente se resolve com desconto: veja se o orçamento está sendo APRESENTADO junto do parcelamento, e não depois do valor cheio.`;
    case "TERCEIRO":
      return `${pct}% das pessoas precisam falar com alguém de casa. Mande o orçamento por escrito, num formato que dê para mostrar — hoje ele provavelmente só existe no papel que ficou na clínica.`;
    case "MEDO":
      return `${pct}% das objeções são medo. É a mais tratável da lista, e a que menos depende de preço: vale ter uma conversa curta sobre sedação e sobre o que acontece na primeira consulta.`;
    case "TEMPO":
      return `${pct}% dizem não ter tempo. Confira se os horários oferecidos incluem começo da manhã e fim da tarde — "sem tempo" quase sempre quer dizer "sem tempo no horário que vocês ofereceram".`;
    case "CONVENIO":
      return `${pct}% perguntam por convênio. Se a clínica aceita algum, ele não está claro no material; se não aceita nenhum, vale dizer isso antes do orçamento, e não depois.`;
    case "CONFIANCA":
      return `${pct}% querem pesquisar ou ouvir outra opinião. É sinal de que a clínica é o primeiro contato e não a referência — avaliações e indicações movem mais isso do que desconto.`;
    default:
      return `${pct}% das objeções não têm motivo declarado. Vale a equipe perguntar "o que te impediria de marcar hoje?" antes de encerrar a conversa.`;
  }
}
