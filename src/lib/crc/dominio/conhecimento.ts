/**
 * Conhecimento — como um texto se parte, e como os pedaços se reordenam.
 *
 * PURO DE PROPÓSITO, e é o arquivo mais testável da Fatia 7. Tudo que depende de
 * modelo (o embedding) e de banco (a busca vetorial) está fora. O que sobra aqui
 * são as duas decisões que mais afetam a qualidade da resposta e que não
 * precisam de nenhum dos dois para serem verificadas:
 *
 *   ONDE CORTAR. Um pedaço que termina no meio de uma frase produz um vetor de
 *   meia ideia, e a busca passa a trazer meia resposta. Cortar em parágrafo e,
 *   quando não dá, em fim de frase, é o que mantém cada pedaço com sentido
 *   próprio.
 *
 *   O QUE SUBIR. A busca vetorial devolve o que TEM VETOR PARECIDO, e vetor
 *   parecido não é resposta certa. A reordenação corrige o caso clássico: a
 *   pergunta usa uma palavra exata — "parcelado", "sábado", "estacionamento" —
 *   e o trecho que contém aquela palavra está em terceiro lugar atrás de dois
 *   trechos genericamente parecidos.
 */

/* -------------------------------------------------------------------------- */
/* Os números                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Teto de um pedaço.
 *
 * 700 caracteres é mais ou menos um parágrafo longo. Maior que isso, o vetor
 * passa a representar a média de três assuntos e deixa de ser parecido com
 * qualquer pergunta específica — o efeito é a busca "não achar" conteúdo que
 * está escrito lá dentro.
 */
export const MAX_CARACTERES_CHUNK = 700;

/**
 * Piso. Abaixo disso o pedaço é grudado no anterior.
 *
 * Um título solto ("## Formas de pagamento") virando pedaço próprio produz um
 * vetor forte para a pergunta certa e um conteúdo que não responde nada.
 */
export const MIN_CARACTERES_CHUNK = 80;

/**
 * Quanto do fim de um pedaço é repetido no começo do seguinte.
 *
 * Existe para a frase que atravessa o corte não ficar órfã: sem sobreposição,
 * "…aceitamos cartão. / Em até 12 vezes sem juros." parte a resposta em dois
 * pedaços, e nenhum dos dois responde "posso parcelar?".
 */
export const SOBREPOSICAO_CARACTERES = 120;

/** Quantos trechos chegam ao modelo depois da reordenação. */
export const MAX_TRECHOS_NO_CONTEXTO = 4;

/**
 * Teto por fonte.
 *
 * Sem ele, um documento longo e bem escrito ocupa as quatro vagas e a resposta
 * nunca combina duas fontes — mesmo quando a pergunta tem duas partes
 * ("vocês abrem sábado e aceitam meu convênio?").
 */
export const MAX_TRECHOS_POR_FONTE = 2;

/* -------------------------------------------------------------------------- */
/* Partir                                                                     */
/* -------------------------------------------------------------------------- */

export type ChunkPreparado = {
  ordem: number;
  conteudo: string;
  chaveDedupe: string;
};

const normalizarEspacos = (t: string): string =>
  t
    .replace(/\r\n/gu, "\n")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

/**
 * Parte o texto em pedaços com sentido próprio.
 *
 * A ESTRATÉGIA, em ordem de preferência: parágrafo inteiro quando cabe;
 * parágrafo partido em fim de frase quando não cabe; corte cego no limite
 * quando o texto não tem nem frase (um parágrafo de 3 mil caracteres sem
 * ponto acontece — é a FAQ colada de um PDF).
 */
export function partirEmChunks(
  texto: string,
  sourceId: string,
  maximo = MAX_CARACTERES_CHUNK,
): ChunkPreparado[] {
  const limpo = normalizarEspacos(texto);
  if (limpo.length === 0) return [];

  const pedacos: string[] = [];
  for (const paragrafo of limpo.split(/\n{2,}/u)) {
    const p = paragrafo.trim();
    if (p.length === 0) continue;

    if (p.length <= maximo) {
      pedacos.push(p);
      continue;
    }
    for (const parte of partirParagrafo(p, maximo)) pedacos.push(parte);
  }

  const juntados = grudarCurtos(pedacos, maximo);
  const comSobreposicao = aplicarSobreposicao(juntados, maximo);

  return comSobreposicao.map((conteudo, i) => ({
    ordem: i,
    conteudo,
    // A ordem entra na chave de propósito: um documento que repete o mesmo
    // parágrafo em dois lugares deve manter os dois. E reingerir o documento
    // idêntico produz exatamente as mesmas chaves, o que é o que torna a
    // ingestão idempotente.
    chaveDedupe: `${sourceId}:${String(i)}:${impressao(conteudo)}`,
  }));
}

function partirParagrafo(paragrafo: string, maximo: number): string[] {
  // Quebra depois de `.`, `!`, `?` ou `:` seguidos de espaço. O `:` entra porque
  // FAQ brasileira é cheia de "Pergunta: resposta" numa linha só.
  const frases = paragrafo.split(/(?<=[.!?:])\s+/u);
  const partes: string[] = [];
  let atual = "";

  for (const frase of frases) {
    // Frase sozinha maior que o teto: corte cego, porque não há alternativa.
    if (frase.length > maximo) {
      if (atual.length > 0) {
        partes.push(atual.trim());
        atual = "";
      }
      for (let i = 0; i < frase.length; i += maximo) {
        partes.push(frase.slice(i, i + maximo).trim());
      }
      continue;
    }

    if (atual.length + frase.length + 1 > maximo) {
      partes.push(atual.trim());
      atual = frase;
    } else {
      atual = atual.length === 0 ? frase : `${atual} ${frase}`;
    }
  }

  if (atual.trim().length > 0) partes.push(atual.trim());
  return partes;
}

/**
 * Gruda pedaço curto no vizinho, respeitando o teto.
 *
 * PARA FRENTE PRIMEIRO, e isto não é detalhe: em texto de clínica o pedaço
 * curto é quase sempre um TÍTULO, e título vem antes do conteúdo que ele
 * anuncia. Grudando só para trás — que é o reflexo natural de quem escreve o
 * laço — "## Formas de pagamento" viraria pedaço próprio sempre que fosse o
 * primeiro do documento, produzindo um vetor forte para a pergunta certa e um
 * conteúdo que não responde nada.
 *
 * Para trás continua existindo, para o caso oposto: a linha curta do FIM, que
 * não tem seguinte para puxar.
 */
function grudarCurtos(pedacos: readonly string[], maximo: number): string[] {
  const fora: string[] = [];

  let i = 0;
  while (i < pedacos.length) {
    let atual = pedacos[i] ?? "";

    // Puxa os seguintes enquanto ainda estiver curto e couber.
    while (i + 1 < pedacos.length) {
      const proximo = pedacos[i + 1] ?? "";
      if (atual.length >= MIN_CARACTERES_CHUNK) break;
      if (atual.length + proximo.length + 1 > maximo) break;
      atual = `${atual}\n${proximo}`;
      i += 1;
    }

    const anterior = fora[fora.length - 1];
    if (
      atual.length < MIN_CARACTERES_CHUNK &&
      anterior !== undefined &&
      anterior.length + atual.length + 1 <= maximo
    ) {
      fora[fora.length - 1] = `${anterior}\n${atual}`;
    } else {
      fora.push(atual);
    }
    i += 1;
  }

  return fora;
}

/**
 * Repete o fim do pedaço anterior no começo do seguinte.
 *
 * A sobreposição começa em fronteira de palavra: cortar "…aceitamos car" e
 * colar isso no pedaço seguinte cria um token que não existe em português e
 * atrapalha o vetor em vez de ajudar.
 */
function aplicarSobreposicao(pedacos: readonly string[], maximo: number): string[] {
  if (pedacos.length <= 1) return [...pedacos];

  const fora: string[] = [];
  for (let i = 0; i < pedacos.length; i += 1) {
    const atual = pedacos[i] ?? "";
    const anterior = i === 0 ? "" : (pedacos[i - 1] ?? "");
    if (anterior.length === 0) {
      fora.push(atual);
      continue;
    }

    const cauda = anterior.slice(-SOBREPOSICAO_CARACTERES);
    const emPalavra = cauda.slice(Math.max(0, cauda.search(/\s/u) + 1)).trim();
    const junto = emPalavra.length === 0 ? atual : `${emPalavra} ${atual}`;
    fora.push(junto.length <= maximo + SOBREPOSICAO_CARACTERES ? junto : atual);
  }
  return fora;
}

/** FNV-1a em hexa. Estável entre processos, e não depende de `crypto`. */
export function impressao(texto: string): string {
  const nucleo = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();

  let h = 0x811c9dc5;
  for (let i = 0; i < nucleo.length; i += 1) {
    h ^= nucleo.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/* -------------------------------------------------------------------------- */
/* Reordenar                                                                  */
/* -------------------------------------------------------------------------- */

export type TrechoEncontrado = {
  id: string;
  sourceId: string;
  titulo: string;
  tipo: string;
  conteudo: string;
  /** 0 a 1, vinda do cosseno. Maior é mais parecido. */
  similaridade: number;
};

export type TrechoReordenado = TrechoEncontrado & {
  /** A nota final, já combinando vetor e palavra. */
  nota: number;
  /** Quantos termos da pergunta aparecem no trecho. Serve para explicar a nota. */
  termosEncontrados: number;
};

/**
 * Palavras que não distinguem nada em português.
 *
 * Sem esta lista, a cobertura lexical de qualquer trecho longo tende a 100%:
 * "de", "que", "para" aparecem em tudo, e o desempate viraria "quem escreveu
 * mais" em vez de "quem fala do assunto".
 */
const VAZIAS = new Set([
  "aos",
  "das",
  "dos",
  "para",
  "pra",
  "por",
  "que",
  "uma",
  "uns",
  "umas",
  "com",
  "sem",
  "voce",
  "meu",
  "minha",
  "seu",
  "sua",
  "ele",
  "ela",
  "isso",
  "esse",
  "essa",
  "este",
  "esta",
  "tem",
  "ter",
  "tenho",
  "sou",
  "mais",
  "muito",
  "pode",
  "posso",
  "vai",
  "vou",
  "qual",
  "quais",
  "como",
  "quando",
  "onde",
  "quem",
  "quanto",
  "quanta",
  "ola",
  "dia",
  "obrigado",
  "obrigada",
  "favor",
  "sim",
  "nao",
  // A abertura de mensagem de WhatsApp brasileira, inteira. Sem ela, "bom dia,
  // vocês aceitam PIX?" dá a um trecho que começa com "Bom dia" a mesma
  // cobertura que ao trecho que fala de PIX.
  "bom",
  "boa",
  "voces",
  "vcs",
  "gostaria",
  "queria",
  "saber",
  "sobre",
  "gente",
]);
// "tarde" e "noite" ficaram FORA desta lista de propósito, apesar de serem metade
// de "boa tarde". Numa clínica elas quase sempre são pergunta de horário —
// "atendem de tarde?" — e tratá-las como saudação apagaria o termo que mais
// importa na pergunta. "dia" continua na lista: "bom dia" é só saudação.

function termos(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/u)
    .filter((t) => t.length > 2 && !VAZIAS.has(t));
}

/** Quanto a similaridade do vetor pesa na nota final. O resto é palavra. */
export const PESO_VETOR = 0.7;

/**
 * Quantos caracteres um radical precisa ter para valer como o mesmo termo.
 *
 * O problema concreto: a pessoa escreve "vocês ACEITAM pix" e o material diz
 * "ACEITAMOS pix". Comparando token exato, a palavra mais importante da
 * pergunta não conta — e a cobertura lexical, que existe justamente para
 * resgatar o trecho da palavra exata, não resgata nada.
 *
 * CINCO É O LIMITE PORQUE QUATRO JÁ ERRA: "paga" casaria "pagamento" com
 * "pagar" (razoável) e também "pagode" (não). Com cinco, "conveni" casa
 * "convênio" e "conveniado"; "paga" não casa nada, e a pergunta sobre parcelar
 * depende do vetor — que é o papel dele.
 *
 * NÃO É UM STEMMER. Um stemmer de português de verdade (RSLP) são duzentas
 * regras e uma dependência. Isto é um casamento por prefixo, e o nome da função
 * diz isso.
 */
const MIN_RADICAL = 5;

function mesmoTermo(a: string, b: string): boolean {
  if (a === b) return true;
  const curto = a.length <= b.length ? a : b;
  const longo = a.length <= b.length ? b : a;
  return curto.length >= MIN_RADICAL && longo.startsWith(curto);
}

/**
 * Reordena os candidatos e devolve o que vai ao modelo.
 *
 * TRÊS COISAS ACONTECEM AQUI, e a ordem entre elas importa:
 *
 *   1. A nota combina o vetor com a cobertura de termos exatos da pergunta.
 *      É o que resgata o trecho que tem a palavra "parcelado" de trás de dois
 *      trechos vagamente parecidos.
 *
 *   2. O teto por fonte entra DEPOIS da ordenação, e não antes: primeiro se
 *      decide o que é bom, depois se garante variedade. Invertido, um trecho
 *      ruim de uma fonte pobre poderia passar na frente de um bom.
 *
 *   3. Trecho com nota irrisória é DESCARTADO e não completa a lista. Encher
 *      quatro vagas com o que sobrou ensina o modelo a responder com o que não
 *      tem a ver — e um agente que responde do nada é pior do que um que diz
 *      "não sei".
 */
export function reordenarTrechos(
  consulta: string,
  candidatos: readonly TrechoEncontrado[],
  opcoes: { maximo?: number; porFonte?: number; notaMinima?: number } = {},
): TrechoReordenado[] {
  const maximo = opcoes.maximo ?? MAX_TRECHOS_NO_CONTEXTO;
  const porFonte = opcoes.porFonte ?? MAX_TRECHOS_POR_FONTE;
  const notaMinima = opcoes.notaMinima ?? 0.2;

  const alvo = new Set(termos(consulta));

  const pontuados: TrechoReordenado[] = candidatos.map((c) => {
    const presentes = termos(c.conteudo);
    let encontrados = 0;
    for (const t of alvo) {
      if (presentes.some((p) => mesmoTermo(p, t))) encontrados += 1;
    }
    const cobertura = alvo.size === 0 ? 0 : encontrados / alvo.size;

    return {
      ...c,
      termosEncontrados: encontrados,
      nota: PESO_VETOR * c.similaridade + (1 - PESO_VETOR) * cobertura,
    };
  });

  pontuados.sort((a, b) => (b.nota === a.nota ? b.similaridade - a.similaridade : b.nota - a.nota));

  const fora: TrechoReordenado[] = [];
  const usadosPorFonte = new Map<string, number>();

  for (const t of pontuados) {
    if (fora.length >= maximo) break;
    if (t.nota < notaMinima) continue;
    const usados = usadosPorFonte.get(t.sourceId) ?? 0;
    if (usados >= porFonte) continue;
    usadosPorFonte.set(t.sourceId, usados + 1);
    fora.push(t);
  }

  return fora;
}

/**
 * Os trechos em texto, para entrar no contexto do turno.
 *
 * A FRASE FINAL É A PARTE IMPORTANTE. Sem ela, o modelo trata o material como
 * "assunto sobre o qual eu sei coisas" e completa as lacunas com o que aprendeu
 * no treino — que é onde nasce a resposta confiante e errada sobre o horário de
 * uma clínica específica.
 */
export function textoDosTrechos(trechos: readonly TrechoReordenado[]): string {
  if (trechos.length === 0) return "";
  const corpo = trechos.map((t) => `### ${t.titulo}\n${t.conteudo}`).join("\n\n");
  return `${corpo}\n\nResponda USANDO SÓ o que está acima. Se a resposta não estiver aqui, diga que vai confirmar com a equipe.`;
}
