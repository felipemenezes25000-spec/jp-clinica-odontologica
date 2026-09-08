import CENAS_JSON from "./cenas.json";

/**
 * O motor da linha do tempo.
 *
 * A ordem e a duração das cenas vêm de `cenas.json`, e `inicioFrame` é DERIVADO —
 * nunca escrito à mão. É o que permite alongar a cena 7 sem tocar nas outras 27.
 *
 * POR QUE JSON E NÃO CONSTANTE AQUI
 * Porque o gerador de narração (`scripts/gerar-narracao.mjs`) roda em Node puro,
 * sem TypeScript, e precisa dos MESMOS números para posicionar a voz na trilha.
 * Se cada lado tivesse a sua cópia, mudar uma cena de lugar desalinharia o áudio
 * — e ninguém perceberia até assistir.
 *
 * Item 45 do briefing, e a razão dele: com `setTimeout` por cena, pausar,
 * arrastar a barra ou renderizar um frame avulso viram três problemas
 * diferentes. Com um número — o frame — viram o mesmo problema.
 */

export type ChaveCapitulo =
  | "introducao"
  | "dados"
  | "oportunidades"
  | "automacao"
  | "conversa"
  | "operacao"
  | "resultados";

export type IdCena =
  | "abertura"
  | "problema"
  | "dentalOffice"
  | "integracao"
  | "nucleo"
  | "eventos"
  | "elegibilidade"
  | "prioridade"
  | "divisao"
  | "automacoes"
  | "baseAntiga"
  | "reativacao"
  | "campanhas"
  | "whatsapp"
  | "ia"
  | "intencoes"
  | "agendamento"
  | "lembretes"
  | "cobranca"
  | "humano"
  | "home"
  | "inbox"
  | "paciente360"
  | "resultados"
  | "funil"
  | "antesDepois"
  | "impacto"
  | "gestor"
  | "ecossistema"
  | "frase"
  | "final";

export type DefinicaoCena = {
  id: IdCena;
  /** Nome curto — aparece na navegação por cenas do modo explorar. */
  nome: string;
  duracao: number;
  capitulo: ChaveCapitulo;
};

export const FPS_FILME: number = CENAS_JSON.fps;

export const CENAS: readonly DefinicaoCena[] = CENAS_JSON.cenas.map((c) => ({
  id: c.id as IdCena,
  nome: c.nome,
  duracao: Math.round(c.segundos * CENAS_JSON.fps),
  capitulo: c.capitulo as ChaveCapitulo,
}));

/**
 * A sobreposição entre cenas.
 *
 * Item 20: as cenas precisam parecer uma narrativa só, não 28 telas separadas
 * por fade-to-black. Meio segundo de convivência é o bastante para a saída de
 * uma emendar na entrada da outra — e é por isso que o palco às vezes desenha
 * duas cenas ao mesmo tempo.
 */
export const SOBREPOSICAO: number = Math.round(
  CENAS_JSON.sobreposicaoSegundos * CENAS_JSON.fps,
);

export type CenaPosicionada = DefinicaoCena & {
  indice: number;
  inicioFrame: number;
  fimFrame: number;
};

export const CENAS_POSICIONADAS: readonly CenaPosicionada[] = (() => {
  let cursor = 0;
  return CENAS.map((cena, indice) => {
    const inicioFrame = cursor;
    cursor += cena.duracao;
    return { ...cena, indice, inicioFrame, fimFrame: inicioFrame + cena.duracao };
  });
})();

export const DURACAO_TOTAL: number = CENAS_POSICIONADAS.reduce((t, c) => t + c.duracao, 0);

export const DURACAO_SEGUNDOS: number = DURACAO_TOTAL / FPS_FILME;

/* -------------------------------------------------------------------------- */
/* Capítulos                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Sete capítulos, não 28.
 *
 * Item 19: uma barra com 28 marcas não é navegação, é ruído. O agrupamento é o
 * mesmo da história — de onde vêm os dados, o que o sistema faz com eles, quem
 * fala com o paciente, o que sobra para a equipe, o que aparece no fim.
 */
export const NOMES_CAPITULO: Readonly<Record<ChaveCapitulo, string>> = {
  introducao: "Começo",
  dados: "De onde vêm os dados",
  oportunidades: "Quem precisa de contato",
  automacao: "O que roda sozinho",
  conversa: "A conversa",
  operacao: "O dia da equipe",
  resultados: "Resultados",
};

export type Capitulo = {
  chave: ChaveCapitulo;
  nome: string;
  inicioFrame: number;
  fimFrame: number;
};

export const CAPITULOS: readonly Capitulo[] = (() => {
  const ordem: ChaveCapitulo[] = [];
  for (const c of CENAS_POSICIONADAS) if (!ordem.includes(c.capitulo)) ordem.push(c.capitulo);

  return ordem.map((chave) => {
    const doCapitulo = CENAS_POSICIONADAS.filter((c) => c.capitulo === chave);
    const primeira = doCapitulo[0]!;
    const ultima = doCapitulo[doCapitulo.length - 1]!;
    return {
      chave,
      nome: NOMES_CAPITULO[chave],
      inicioFrame: primeira.inicioFrame,
      fimFrame: ultima.fimFrame,
    };
  });
})();

/* -------------------------------------------------------------------------- */
/* Consultas                                                                  */
/* -------------------------------------------------------------------------- */

export function cenaNoFrame(frame: number): CenaPosicionada {
  const encontrada = CENAS_POSICIONADAS.find((c) => frame >= c.inicioFrame && frame < c.fimFrame);
  return encontrada ?? CENAS_POSICIONADAS[CENAS_POSICIONADAS.length - 1]!;
}

export function capituloNoFrame(frame: number): Capitulo {
  const encontrado = CAPITULOS.find((c) => frame >= c.inicioFrame && frame < c.fimFrame);
  return encontrado ?? CAPITULOS[CAPITULOS.length - 1]!;
}

export function cenaPorId(id: IdCena): CenaPosicionada {
  const c = CENAS_POSICIONADAS.find((x) => x.id === id);
  if (c === undefined) throw new Error(`Cena desconhecida: ${id}`);
  return c;
}

/**
 * Quais cenas desenhar num frame, e com que opacidade.
 *
 * Devolve no máximo duas: a que está tocando e, durante a sobreposição, a
 * vizinha que entra ou sai. Mais que duas ao mesmo tempo nunca acontece porque
 * a sobreposição é bem menor que a menor cena.
 */
export type CenaVisivel = { cena: CenaPosicionada; frameLocal: number; opacidade: number };

export function cenasVisiveis(frame: number): CenaVisivel[] {
  const visiveis: CenaVisivel[] = [];

  for (const cena of CENAS_POSICIONADAS) {
    const inicioDesenho = cena.inicioFrame - SOBREPOSICAO;
    if (frame < inicioDesenho || frame >= cena.fimFrame) continue;

    const frameLocal = frame - cena.inicioFrame;

    // Entrada: sobe de 0 a 1 durante a sobreposição, antes do início oficial.
    const entrando = frameLocal < 0 ? (frame - inicioDesenho) / SOBREPOSICAO : 1;

    // Saída: desce nos últimos frames, enquanto a próxima já está subindo. A
    // última cena não tem sucessora para cobrir o vão, então ela não desce —
    // sem isso, o filme terminaria desaparecendo no fundo antes do fim.
    const ehUltima = cena.indice === CENAS_POSICIONADAS.length - 1;
    const restante = cena.fimFrame - frame;
    const saindo = !ehUltima && restante < SOBREPOSICAO ? restante / SOBREPOSICAO : 1;

    visiveis.push({
      cena,
      frameLocal,
      opacidade: Math.max(0, Math.min(1, Math.min(entrando, saindo))),
    });
  }

  // A primeira cena não tem quem a preceda: garante que sempre haja algo.
  if (visiveis.length === 0) {
    const cena = cenaNoFrame(frame);
    visiveis.push({ cena, frameLocal: frame - cena.inicioFrame, opacidade: 1 });
  }

  return visiveis;
}
