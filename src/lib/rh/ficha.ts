/**
 * A ficha individual de entrevista — o papel que a Dra. Ana Beatriz e o
 * Jefferson levam para a mesa.
 *
 * O formato aqui não foi inventado por nós: é a estrutura da seção 3 do guia
 * que a clínica entregou (cabeçalho, leitura rápida do currículo, triagem
 * objetiva, perguntas de investigação, resumo dos entrevistadores). O sistema
 * conduz a entrevista pelo método da JP em vez de um método nosso.
 *
 * Mesma regra de `tipos.ts` e `ia/tipos.ts`: sem I/O, sem `node:`, sem React —
 * o servidor grava e a tela lê.
 *
 * A divisão que atravessa o arquivo inteiro, e que precisa continuar clara para
 * quem mexer aqui depois:
 *
 *   O QUE A IA ESCREVE          pontoForte, oQueValidar, triagem,
 *                               perguntasEspecificas, notasSugeridas
 *   O QUE O ENTREVISTADOR ANOTA respostasTriagem, respostasPerguntas, notas,
 *                               leiturasDuvidas, respostasDuvidas, impressao,
 *                               decisao e os quatro resumos
 *
 * Regenerar a parte da IA nunca pode apagar a parte do humano — é isso que
 * `servidor/analise.gerarFicha` preserva e que `salvarFichaAdmin` protege com
 * lista branca. Este arquivo é onde a fronteira está escrita.
 *
 * Não há `import` de `guia.ts` aqui de propósito: `tipos.ts` importa esta ficha
 * (a candidatura carrega uma), e o guia importa `tipos.ts` para tipar a área.
 * Manter a ficha na ponta da corrente evita o ciclo.
 */

/**
 * `duvidas.ts` importa `tipos.ts`, que importa esta ficha — este é o único
 * import daquele lado e por isso é `import type`: tipo some na compilação, então
 * a corrente continua sem ciclo em tempo de execução.
 */
import type { LeituraResposta } from "./duvidas";

/** Resposta de item da triagem objetiva. "" é "ainda não perguntei". */
export type RespostaTriagem = "" | "sim" | "nao" | "parcial";

/** As quatro caixas de "Impressão" do guia. "" é "ainda não marquei". */
export type ImpressaoFicha = "" | "excelente" | "boa" | "regular" | "fraca";

/** Decisão do cabeçalho da ficha: Avança · Reserva · Não avança. */
export type DecisaoFicha = "" | "avanca" | "reserva" | "nao-avanca";

/* -------------------------------------------------------------------------- */
/* O que a IA escreve                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Item da triagem objetiva: pergunta FECHADA, respondível com sim/não/parcial,
 * eliminatória ou quase. `porque` é o que aquele item elimina — a clínica lê
 * antes de decidir se vale seguir para as perguntas abertas.
 */
export type ItemTriagem = { pergunta: string; porque: string };

/** Pergunta aberta de investigação, tirada do currículo daquela pessoa. */
export type PerguntaFicha = { pergunta: string; porque: string };

/**
 * Nota que a IA sugere para um critério do guia, de 0 a 5, com a evidência que
 * a sustenta. Só existe para critério que o currículo consegue provar — postura,
 * entrosamento e disponibilidade real ficam de fora, porque o modelo não viu a
 * pessoa. Ver `soNaEntrevista` em `guia.ts`.
 */
export type NotaSugerida = { chave: string; nota: number; evidencia: string };

/* -------------------------------------------------------------------------- */
/* O que o entrevistador anota                                                */
/* -------------------------------------------------------------------------- */

/**
 * A resposta carrega uma cópia da pergunta que respondeu.
 *
 * Parece redundante e é a coisa mais importante deste arquivo: quando a IA
 * regenera a ficha, as quatro perguntas podem mudar. Se a resposta fosse só uma
 * posição no array, a anotação "ela confirmou que sai às 18h" acabaria embaixo
 * de outra pergunta — o registro passaria a dizer algo que ninguém disse. Com a
 * pergunta junto, a tela casa resposta com pergunta pelo texto, e o que sobrou
 * de uma versão anterior continua legível como o que é: resposta a uma pergunta
 * que não está mais na ficha.
 */
export type RespostaItemTriagem = {
  pergunta: string;
  resposta: RespostaTriagem;
  observacao: string;
};

export type RespostaPergunta = { pergunta: string; resposta: string };

/**
 * Nota do entrevistador em um critério do guia, de 0 a 5.
 *
 * `nota` é `null` enquanto ninguém pontuou — e não 0, que no guia significa
 * "não atende". Sem essa diferença, a soma /50 mostraria zero para uma ficha
 * em branco como se a candidata tivesse ido mal em tudo.
 */
export type NotaFicha = { chave: string; nota: number | null; evidencia: string };

/* -------------------------------------------------------------------------- */
/* A ficha                                                                    */
/* -------------------------------------------------------------------------- */

export type FichaEntrevista = {
  /** `VERSAO_FICHA` de quando a parte da IA foi gerada. */
  versao: number;
  /** Guia usado para gerar. Guardado por id E por título: o guia pode ser renomeado ou excluído, e a ficha impressa precisa continuar dizendo por qual método ela foi feita. */
  guiaId: string;
  guiaTitulo: string;

  /* --- IA --- */
  pontoForte: string;
  oQueValidar: string;
  triagem: ItemTriagem[];
  perguntasEspecificas: PerguntaFicha[];
  notasSugeridas: NotaSugerida[];
  /** ISO. "" enquanto a IA nunca escreveu esta ficha. */
  geradaEm: string;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  /** "" quando deu certo. Mesma ideia de `AnaliseIa.erro`: a falha fica gravada para a tela poder dizer "tente de novo" em vez de mostrar um card vazio. */
  erro: string;

  /* --- entrevistador --- */
  /** "AAAA-MM-DD" e "HH:MM" do cabeçalho da ficha. */
  entrevistaEm: string;
  horario: string;
  /** Quem conduziu ("Ana Beatriz e Jefferson"). */
  entrevistadores: string;

  respostasTriagem: RespostaItemTriagem[];
  respostasPerguntas: RespostaPergunta[];
  notas: NotaFicha[];

  /**
   * As caixas de "sinais para observar durante a conversa" que o entrevistador
   * marcou, guardadas pelo TEXTO do sinal e nunca pela posição na lista.
   *
   * Mesma razão de `RespostaItemTriagem.pergunta`: o guia é editável no painel,
   * e uma lista por índice passaria a dizer "postura e cordialidade" onde a
   * pessoa marcou "facilidade com sistemas" no dia em que alguém reordenar os
   * dez sinais. O que ficou registrado precisa continuar sendo o que foi visto.
   */
  sinaisObservados: string[];

  /**
   * O roteiro de dúvidas de `duvidas.ts` respondido: como o entrevistador LEU
   * cada resposta, e o que a candidata respondeu com as palavras dela.
   *
   * São `Record` e não array por causa do id da dúvida, que é estável: ele vem
   * da origem (`sinal-ultimo-curto`, `triagem-2`), nunca de posição em lista. Um
   * array posicional perderia isso na primeira regeração — o currículo é
   * reanalisado, os sinais mudam de ordem ou somem, e a leitura "não convenceu"
   * que era da rotatividade apareceria embaixo da pergunta sobre registro no
   * conselho. Com o id como chave, regerar a ficha não embaralha nada do que o
   * entrevistador já anotou: o que sobrou de uma versão anterior fica órfão e é
   * removido por `limparLeiturasOrfas`, em vez de mentir sobre outra pergunta.
   *
   * Chave ausente é "ainda não li esta dúvida" — mesmo estado que `""`, que é o
   * que `duvidasEmAberto` e `resumoDasLeituras` assumem para id não encontrado.
   */
  leiturasDuvidas: Record<string, LeituraResposta>;
  respostasDuvidas: Record<string, string>;

  impressao: ImpressaoFicha;
  decisao: DecisaoFicha;

  /** Os quatro campos do "Resumo dos entrevistadores", na ordem do guia. */
  evidenciaPositiva: string;
  duvidaAberta: string;
  motivoParaAvancar: string;
  checarAntesDeContratar: string;

  /** ISO da última vez que um humano salvou. "" enquanto ninguém anotou nada. */
  atualizadaEm: string;
};

/**
 * Suba este número quando o prompt da ficha mudar de um jeito que invalide o
 * que já foi gerado. Mesma função de `VERSAO_ANALISE`: permite reprocessar só
 * quem ficou para trás, em vez de pagar token pelo acervo inteiro.
 */
export const VERSAO_FICHA = 1;

/**
 * Ficha zerada. Função, e não constante, pelo mesmo motivo de
 * `candidaturaVazia()`: os arrays seriam compartilhados por referência entre
 * todas as fichas que caíssem no estado vazio.
 */
export function fichaVazia(): FichaEntrevista {
  return {
    versao: VERSAO_FICHA,
    guiaId: "",
    guiaTitulo: "",

    pontoForte: "",
    oQueValidar: "",
    triagem: [],
    perguntasEspecificas: [],
    notasSugeridas: [],
    geradaEm: "",
    modelo: "",
    tokensEntrada: 0,
    tokensSaida: 0,
    erro: "",

    entrevistaEm: "",
    horario: "",
    entrevistadores: "",

    respostasTriagem: [],
    respostasPerguntas: [],
    notas: [],
    sinaisObservados: [],
    leiturasDuvidas: {},
    respostasDuvidas: {},

    impressao: "",
    decisao: "",

    evidenciaPositiva: "",
    duvidaAberta: "",
    motivoParaAvancar: "",
    checarAntesDeContratar: "",

    atualizadaEm: "",
  };
}

/* -------------------------------------------------------------------------- */
/* Catálogos de exibição                                                      */
/* -------------------------------------------------------------------------- */

export const RESPOSTAS_TRIAGEM: { valor: RespostaTriagem; rotulo: string }[] = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
  { valor: "parcial", rotulo: "Parcial" },
];

/** Na ordem do guia: Excelente · Boa · Regular · Fraca. */
export const IMPRESSOES: { valor: ImpressaoFicha; rotulo: string }[] = [
  { valor: "excelente", rotulo: "Excelente" },
  { valor: "boa", rotulo: "Boa" },
  { valor: "regular", rotulo: "Regular" },
  { valor: "fraca", rotulo: "Fraca" },
];

/** Na ordem do guia: Avança · Reserva · Não avança. */
export const DECISOES: { valor: DecisaoFicha; rotulo: string }[] = [
  { valor: "avanca", rotulo: "Avança" },
  { valor: "reserva", rotulo: "Reserva" },
  { valor: "nao-avanca", rotulo: "Não avança" },
];

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * O total /50 do comparativo final, e quantos critérios sustentam esse total.
 *
 * `avaliados` desce junto de propósito: uma ficha com dois critérios pontuados
 * soma 10 e uma ficha completa mal avaliada também pode somar 10. Mostrar o
 * total sem dizer quantos critérios entraram compararia coisas diferentes na
 * mesma coluna — que é exatamente o que a regra 5 de desempate manda evitar.
 */
export function totalDaFicha(notas: NotaFicha[]): { total: number; avaliados: number } {
  let total = 0;
  let avaliados = 0;
  for (const n of notas) {
    if (n.nota === null) continue;
    total += n.nota;
    avaliados += 1;
  }
  return { total, avaliados };
}

/** Compara perguntas sem depender de espaço, acento ou caixa. */
function chavePergunta(pergunta: string): string {
  return pergunta
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** A resposta dada àquela pergunta de triagem, ou `null` se ninguém respondeu. */
export function respostaDaTriagem(
  ficha: FichaEntrevista,
  pergunta: string,
): RespostaItemTriagem | null {
  const alvo = chavePergunta(pergunta);
  return ficha.respostasTriagem.find((r) => chavePergunta(r.pergunta) === alvo) ?? null;
}

/** Idem para as perguntas abertas de investigação. */
export function respostaDaPergunta(
  ficha: FichaEntrevista,
  pergunta: string,
): RespostaPergunta | null {
  const alvo = chavePergunta(pergunta);
  return ficha.respostasPerguntas.find((r) => chavePergunta(r.pergunta) === alvo) ?? null;
}

/**
 * Os registros de dúvidas de uma ficha, tolerantes a ficha antiga.
 *
 * O tipo garante os dois campos, o disco não: ficha gravada antes deles existir
 * volta do JSON sem eles, e o armazenamento não revalida o que lê. Um
 * `Object.entries(undefined)` aqui derrubaria a gaveta inteira por causa de uma
 * ficha da semana passada, então a ausência vira registro vazio — que é
 * exatamente o significado dela: ninguém leu nenhuma dúvida ainda.
 */
function registroDeDuvidas<T>(valor: Record<string, T> | undefined): Record<string, T> {
  return valor ?? {};
}

/**
 * Se um humano já encostou nesta ficha. É o que separa "a IA gerou e ninguém
 * abriu" de "a entrevista aconteceu" — usado pela calibragem de
 * `exemplosDeFicha` e pela tela, para não oferecer "regerar" como se não
 * houvesse trabalho salvo dentro.
 */
export function fichaPreenchidaPorHumano(ficha: FichaEntrevista): boolean {
  return (
    ficha.decisao.length > 0 ||
    ficha.impressao.length > 0 ||
    ficha.notas.some((n) => n.nota !== null) ||
    ficha.sinaisObservados.length > 0 ||
    // Ler o roteiro de dúvidas é trabalho de entrevista como qualquer outro: sem
    // estas duas linhas, uma ficha em que a pessoa marcou "não convenceu" em
    // três dúvidas e mais nada continuaria valendo como "gerada e intocada", e a
    // tela ofereceria regerar sem avisar que há anotação salva dentro.
    Object.keys(registroDeDuvidas(ficha.leiturasDuvidas)).length > 0 ||
    Object.keys(registroDeDuvidas(ficha.respostasDuvidas)).length > 0 ||
    ficha.respostasTriagem.some((r) => r.resposta.length > 0 || r.observacao.length > 0) ||
    ficha.respostasPerguntas.some((r) => r.resposta.length > 0) ||
    ficha.evidenciaPositiva.length > 0 ||
    ficha.duvidaAberta.length > 0 ||
    ficha.motivoParaAvancar.length > 0 ||
    ficha.checarAntesDeContratar.length > 0
  );
}

/**
 * Em que pé está a ficha de uma candidatura, num vocabulário só.
 *
 * Existe porque quatro telas precisam responder a mesma pergunta e nenhuma
 * delas tem o guia em mãos: a barra de filtros ("mostre só quem já tem ficha"),
 * o cartão do kanban, a linha da tabela e o selo da aba Entrevistas. Com a
 * regra escrita em cada uma, bastaria alguém decidir que "concluída" passa a
 * ser "tem impressão" para o filtro e o cartão discordarem sobre a mesma
 * candidata — e é numa dessas telas que o RH monta a fila de quem ainda falta
 * entrevistar.
 *
 * A ordem das perguntas é a ordem em que elas importam, e o trabalho humano vem
 * antes da falha de propósito: uma regeração que deu errado grava `erro` na
 * ficha SEM apagar o que o entrevistador escreveu (é o que `gerarFicha` faz),
 * e responder "falhou" ali diria que não há nada naquela ficha — quando há uma
 * entrevista inteira dentro. A falha só vira a resposta quando ela é a única
 * coisa que existe; nesse caso é ela mesma que pede ação. O texto do erro
 * continua visível na gaveta em qualquer um dos casos.
 */
export type SituacaoFicha = "sem" | "erro" | "gerada" | "preenchendo" | "concluida";

export function situacaoDaFicha(ficha: FichaEntrevista | null): SituacaoFicha {
  if (ficha === null) return "sem";
  if (ficha.decisao.length > 0) return "concluida";
  if (fichaPreenchidaPorHumano(ficha)) return "preenchendo";
  if (ficha.erro.length > 0) return "erro";
  // Ficha sem `geradaEm` e sem nada escrito é registro em branco (nasceu de uma
  // anotação salva antes de mandar gerar, e depois apagada): para a tela isso é
  // "sem ficha", não "ficha pronta".
  return ficha.geradaEm.length > 0 ? "gerada" : "sem";
}

/** A nota que o entrevistador deu naquele critério, ou `null` se ninguém pontuou. */
export function notaDaFicha(ficha: FichaEntrevista, chave: string): NotaFicha | null {
  return ficha.notas.find((n) => n.chave === chave) ?? null;
}

/** A nota que a IA sugeriu naquele critério, ou `null` — ela só opina em alguns. */
export function notaSugeridaPara(ficha: FichaEntrevista, chave: string): NotaSugerida | null {
  return ficha.notasSugeridas.find((n) => n.chave === chave) ?? null;
}

/* -------------------------------------------------------------------------- */
/* Escrita: a metade do entrevistador                                         */
/* -------------------------------------------------------------------------- */

/**
 * Exatamente o que a tela pode alterar numa ficha — a metade humana.
 *
 * É a mesma lista branca que `salvarFichaAdmin` aplica no servidor, escrita
 * aqui para as telas do modo entrevista comporem o que enviam a partir dela. O
 * que ficou de fora é a metade da IA (`pontoForte`, `triagem`, `notasSugeridas`,
 * `geradaEm`, `modelo`, `versao`, tokens): ela é o REGISTRO de que o modelo
 * escreveu aquilo, naquele momento — se a tela pudesse reenviá-la, um formulário
 * devolvendo estado local faria a ficha impressa dizer que a IA sugeriu nota
 * onde ela nunca opinou, e a clínica decide contratação com essa folha na mão.
 */
export type CamposDoEntrevistador = Pick<
  FichaEntrevista,
  | "entrevistaEm"
  | "horario"
  | "entrevistadores"
  | "respostasTriagem"
  | "respostasPerguntas"
  | "notas"
  | "sinaisObservados"
  | "leiturasDuvidas"
  | "respostasDuvidas"
  | "impressao"
  | "decisao"
  | "evidenciaPositiva"
  | "duvidaAberta"
  | "motivoParaAvancar"
  | "checarAntesDeContratar"
>;

/**
 * Recorta a metade humana de uma ficha.
 *
 * A tela edita um rascunho local e, na hora de salvar, monta o envio como
 * `{ ...fichaQueVeioDoServidor, ...partesDoEntrevistador(rascunho) }`. Assim uma
 * regeração que aconteceu no meio da entrevista continua valendo para o texto da
 * IA, e o que a pessoa digitou continua valendo para o que ela digitou.
 */
export function partesDoEntrevistador(ficha: FichaEntrevista): CamposDoEntrevistador {
  return {
    entrevistaEm: ficha.entrevistaEm,
    horario: ficha.horario,
    entrevistadores: ficha.entrevistadores,
    respostasTriagem: ficha.respostasTriagem,
    respostasPerguntas: ficha.respostasPerguntas,
    notas: ficha.notas,
    sinaisObservados: ficha.sinaisObservados,
    // Os dois registros de dúvidas viajam junto com o resto da metade humana:
    // são leitura do entrevistador, não texto da IA. Sem eles aqui, o que a
    // pessoa marcou no roteiro seria descartado no `partesDoEntrevistador` antes
    // mesmo de chegar ao servidor.
    leiturasDuvidas: registroDeDuvidas(ficha.leiturasDuvidas),
    respostasDuvidas: registroDeDuvidas(ficha.respostasDuvidas),
    impressao: ficha.impressao,
    decisao: ficha.decisao,
    evidenciaPositiva: ficha.evidenciaPositiva,
    duvidaAberta: ficha.duvidaAberta,
    motivoParaAvancar: ficha.motivoParaAvancar,
    checarAntesDeContratar: ficha.checarAntesDeContratar,
  };
}

/**
 * Ficha com a resposta daquele item de triagem trocada.
 *
 * Todas as funções `com*` são imutáveis e casam por texto, não por índice: a
 * ficha nova é sempre um objeto novo (o React precisa da troca de referência
 * para redesenhar) e a linha alterada é encontrada pela pergunta, que é o que
 * sobrevive a uma regeração.
 */
export function comRespostaDeTriagem(
  ficha: FichaEntrevista,
  pergunta: string,
  valores: { resposta?: RespostaTriagem; observacao?: string },
): FichaEntrevista {
  const alvo = chavePergunta(pergunta);
  const anterior = ficha.respostasTriagem.find((r) => chavePergunta(r.pergunta) === alvo);
  const nova: RespostaItemTriagem = {
    pergunta,
    resposta: anterior?.resposta ?? "",
    observacao: anterior?.observacao ?? "",
    ...valores,
  };
  const respostasTriagem =
    anterior === undefined
      ? [...ficha.respostasTriagem, nova]
      : ficha.respostasTriagem.map((r) => (chavePergunta(r.pergunta) === alvo ? nova : r));
  return { ...ficha, respostasTriagem };
}

/** Ficha com a anotação daquela pergunta aberta trocada. */
export function comRespostaDePergunta(
  ficha: FichaEntrevista,
  pergunta: string,
  resposta: string,
): FichaEntrevista {
  const alvo = chavePergunta(pergunta);
  const existe = ficha.respostasPerguntas.some((r) => chavePergunta(r.pergunta) === alvo);
  const nova: RespostaPergunta = { pergunta, resposta };
  const respostasPerguntas = existe
    ? ficha.respostasPerguntas.map((r) => (chavePergunta(r.pergunta) === alvo ? nova : r))
    : [...ficha.respostasPerguntas, nova];
  return { ...ficha, respostasPerguntas };
}

/** Ficha com a nota (ou a evidência) daquele critério trocada. */
export function comNota(
  ficha: FichaEntrevista,
  chave: string,
  valores: { nota?: number | null; evidencia?: string },
): FichaEntrevista {
  const anterior = ficha.notas.find((n) => n.chave === chave);
  const nova: NotaFicha = {
    chave,
    nota: anterior?.nota ?? null,
    evidencia: anterior?.evidencia ?? "",
    ...valores,
  };
  const notas =
    anterior === undefined
      ? [...ficha.notas, nova]
      : ficha.notas.map((n) => (n.chave === chave ? nova : n));
  return { ...ficha, notas };
}

/** Ficha com um sinal de observação marcado ou desmarcado. */
export function comSinal(ficha: FichaEntrevista, sinal: string, marcado: boolean): FichaEntrevista {
  const jaTem = ficha.sinaisObservados.includes(sinal);
  if (marcado === jaTem) return ficha;
  return {
    ...ficha,
    sinaisObservados: marcado
      ? [...ficha.sinaisObservados, sinal]
      : ficha.sinaisObservados.filter((s) => s !== sinal),
  };
}

/* -------------------------------------------------------------------------- */
/* O roteiro de dúvidas: leitura e escrita                                    */
/* -------------------------------------------------------------------------- */

/**
 * Os dois registros do roteiro, prontos para a tela.
 *
 * Existem porque três telas (gaveta, modo entrevista, cartão do funil) precisam
 * ler os mesmos dois campos de uma ficha que pode ter vindo do disco sem eles —
 * ver `registroDeDuvidas`. Sem um acessador único, cada tela repetiria o `?? {}`
 * e a primeira que esquecesse derrubaria o painel inteiro com
 * `Object.entries(undefined)`.
 *
 * Aceitam `null` de propósito: "candidatura ainda sem ficha" é o estado mais
 * comum do painel, e ali o roteiro é só leitura — nada foi marcado ainda.
 */
export function leiturasDeDuvidas(ficha: FichaEntrevista | null): Record<string, LeituraResposta> {
  return ficha === null ? {} : registroDeDuvidas(ficha.leiturasDuvidas);
}

export function respostasDeDuvidas(ficha: FichaEntrevista | null): Record<string, string> {
  return ficha === null ? {} : registroDeDuvidas(ficha.respostasDuvidas);
}

/**
 * Ficha com a leitura daquela dúvida trocada.
 *
 * Imutável como as outras `com*`, e casando pelo id da dúvida — que é estável
 * entre regenerações porque vem da origem (`sinal-ultimo-curto`), nunca de
 * posição em lista. Marcar `""` REMOVE a chave em vez de gravar vazio: chave
 * ausente e `""` já significam a mesma coisa para `duvidasEmAberto`, e a
 * validação do servidor descarta o vazio de qualquer jeito — guardar os dois
 * jeitos de dizer "ainda não perguntei" faria a ficha crescer sem dizer nada.
 */
export function comLeituraDeDuvida(
  ficha: FichaEntrevista,
  idDuvida: string,
  leitura: LeituraResposta,
): FichaEntrevista {
  const leiturasDuvidas = { ...registroDeDuvidas(ficha.leiturasDuvidas) };
  if (leitura === "") delete leiturasDuvidas[idDuvida];
  else leiturasDuvidas[idDuvida] = leitura;
  return { ...ficha, leiturasDuvidas };
}

/** Ficha com a anotação daquela dúvida trocada. Texto vazio some pelo mesmo motivo. */
export function comRespostaDeDuvida(
  ficha: FichaEntrevista,
  idDuvida: string,
  resposta: string,
): FichaEntrevista {
  const respostasDuvidas = { ...registroDeDuvidas(ficha.respostasDuvidas) };
  if (resposta === "") delete respostasDuvidas[idDuvida];
  else respostasDuvidas[idDuvida] = resposta;
  return { ...ficha, respostasDuvidas };
}

/**
 * Ficha sem as leituras e respostas de dúvidas que não existem mais.
 *
 * O currículo é reanalisado e o roteiro muda: um sinal que a IA levantou some
 * porque a data foi corrigida, uma pergunta específica é reescrita. O id daquela
 * dúvida deixa de sair de `montarDuvidas`, e a leitura que ficou para trás vira
 * lixo invisível — ninguém vê na tela, porque a tela só desenha as dúvidas
 * atuais, mas ele continua sendo gravado a cada salvamento e a ficha cresce a
 * cada reanálise carregando resposta de pergunta que já não se faz. Pior: se um
 * dia aquele mesmo sinal voltar (a data volta a ficar estranha), a dúvida
 * reapareceria já marcada como "convenceu" por uma conversa de dois meses atrás.
 *
 * Devolve ficha nova; não muta. `idsValidos` é o que `montarDuvidas` acabou de
 * devolver para esta candidata.
 */
export function limparLeiturasOrfas(ficha: FichaEntrevista, idsValidos: string[]): FichaEntrevista {
  const validos = new Set(idsValidos);

  const leiturasDuvidas: Record<string, LeituraResposta> = {};
  for (const [id, leitura] of Object.entries(registroDeDuvidas(ficha.leiturasDuvidas))) {
    if (validos.has(id)) leiturasDuvidas[id] = leitura;
  }

  const respostasDuvidas: Record<string, string> = {};
  for (const [id, resposta] of Object.entries(registroDeDuvidas(ficha.respostasDuvidas))) {
    if (validos.has(id)) respostasDuvidas[id] = resposta;
  }

  return { ...ficha, leiturasDuvidas, respostasDuvidas };
}
