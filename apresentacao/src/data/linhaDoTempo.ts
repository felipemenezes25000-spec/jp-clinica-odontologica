import { FPS } from "@/design-system/tokens";

/**
 * O motor da linha do tempo.
 *
 * Uma lista de cenas com duração em frames, e `inicioFrame` DERIVADO — nunca
 * escrito à mão. É o que permite alongar a cena 7 sem tocar nas outras 21: o
 * início de cada uma é a soma das anteriores, calculada uma vez na carga do
 * módulo.
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
  | "whatsapp"
  | "ia"
  | "intencoes"
  | "agendamento"
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

const s = (segundos: number): number => Math.round(segundos * FPS);

/**
 * As 28 cenas do storyboard, na ordem.
 *
 * As durações saíram de leitura em voz alta da narração de cada uma, com folga
 * para o olho pousar: uma cena que só apresenta um número precisa de menos tempo
 * que a que mostra uma decisão sendo tomada.
 */
export const CENAS: readonly DefinicaoCena[] = [
  { id: "abertura", nome: "Abertura", duracao: s(11), capitulo: "introducao" },
  { id: "problema", nome: "O problema", duracao: s(10), capitulo: "introducao" },

  { id: "dentalOffice", nome: "Dental Office", duracao: s(8), capitulo: "dados" },
  { id: "integracao", nome: "n8n + backend", duracao: s(7), capitulo: "dados" },
  { id: "nucleo", nome: "JP CRC", duracao: s(9), capitulo: "dados" },

  { id: "eventos", nome: "Motor de eventos", duracao: s(8), capitulo: "oportunidades" },
  { id: "elegibilidade", nome: "Motor de regras", duracao: s(8), capitulo: "oportunidades" },
  { id: "prioridade", nome: "Prioridade", duracao: s(8), capitulo: "oportunidades" },
  { id: "divisao", nome: "Humano × automação", duracao: s(7), capitulo: "oportunidades" },

  { id: "automacoes", nome: "Automações", duracao: s(8), capitulo: "automacao" },
  { id: "baseAntiga", nome: "Base antiga", duracao: s(9), capitulo: "automacao" },
  { id: "reativacao", nome: "Reativação em escala", duracao: s(8), capitulo: "automacao" },

  { id: "whatsapp", nome: "WhatsApp", duracao: s(9), capitulo: "conversa" },
  { id: "ia", nome: "IA", duracao: s(8), capitulo: "conversa" },
  { id: "intencoes", nome: "Outras intenções", duracao: s(7), capitulo: "conversa" },
  { id: "agendamento", nome: "Agendamento", duracao: s(10), capitulo: "conversa" },
  { id: "humano", nome: "Caso humano", duracao: s(7), capitulo: "conversa" },

  { id: "home", nome: "Home operacional", duracao: s(9), capitulo: "operacao" },
  { id: "inbox", nome: "Inbox", duracao: s(8), capitulo: "operacao" },
  { id: "paciente360", nome: "Paciente 360", duracao: s(8), capitulo: "operacao" },

  { id: "resultados", nome: "Resultados", duracao: s(8), capitulo: "resultados" },
  { id: "funil", nome: "Funil", duracao: s(8), capitulo: "resultados" },
  { id: "antesDepois", nome: "Antes e depois", duracao: s(7), capitulo: "resultados" },
  { id: "impacto", nome: "Impacto financeiro", duracao: s(8), capitulo: "resultados" },
  { id: "gestor", nome: "Painel do gestor", duracao: s(8), capitulo: "resultados" },
  { id: "ecossistema", nome: "Ecossistema", duracao: s(9), capitulo: "resultados" },
  { id: "frase", nome: "A frase", duracao: s(8), capitulo: "resultados" },
  { id: "final", nome: "Final", duracao: s(9), capitulo: "resultados" },
];

/**
 * A sobreposição entre cenas.
 *
 * Item 20: as cenas precisam parecer uma narrativa só, não 28 telas separadas
 * por fade-to-black. Meio segundo de convivência é o bastante para a saída de
 * uma emendar na entrada da outra — e é por isso que o palco às vezes desenha
 * duas cenas ao mesmo tempo.
 */
export const SOBREPOSICAO = s(0.5);

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

export const DURACAO_SEGUNDOS: number = DURACAO_TOTAL / FPS;

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
  introducao: "Introdução",
  dados: "Dados",
  oportunidades: "Oportunidades",
  automacao: "Automação",
  conversa: "WhatsApp + IA",
  operacao: "Operação",
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
