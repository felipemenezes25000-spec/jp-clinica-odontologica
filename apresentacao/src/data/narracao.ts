import { cenaPorId, FPS_FILME, type IdCena } from "./linhaDoTempo";
import NARRACAO_JSON from "./narracao.json";
import DURACOES_JSON from "./narracao.duracoes.json";

/**
 * A narração falada e as legendas.
 *
 * O MESMO TEXTO NOS DOIS. A legenda não é uma transcrição escrita à parte: é a
 * própria frase que a voz diz. Duas listas divergiriam na primeira revisão.
 *
 * A SINCRONIA NÃO É ESTIMADA, É MEDIDA. `inicio` (em segundos dentro da cena)
 * vem de `narracao.json`; a DURAÇÃO vem de `narracao.duracoes.json`, gerado por
 * `scripts/gerar-narracao.mjs` a partir do áudio real, com o silêncio das pontas
 * já cortado. Por isso a legenda entra quando a voz começa e sai quando ela
 * termina — não porque alguém acertou o número na tentativa e erro.
 *
 * Depois de mexer em qualquer texto: `npm run narracao`.
 */

const DURACOES: Readonly<Record<string, number>> = DURACOES_JSON.duracoes;

/** Se a duração medida não existir (áudio ainda não gerado), estima pela leitura. */
function duracaoEstimada(texto: string): number {
  const palavras = texto.trim().split(/\s+/).length;
  return Math.max(2, (palavras / 2.4) * 1); // ~145 palavras por minuto
}

export type Fala = {
  cena: IdCena;
  texto: string;
  /** Frame local da cena em que a legenda (e a voz) entra. */
  inicio: number;
  duracao: number;
  inicioGlobal: number;
  fimGlobal: number;
};

export const FALAS_GLOBAIS: readonly Fala[] = NARRACAO_JSON.linhas
  .map((linha, i) => {
    const cena = linha.cena as IdCena;
    const chave = `${cena}-${i}`;
    const segundos = DURACOES[chave] ?? duracaoEstimada(linha.texto);
    const inicio = Math.round(linha.inicio * FPS_FILME);
    const duracao = Math.round(segundos * FPS_FILME);
    const inicioGlobal = cenaPorId(cena).inicioFrame + inicio;
    return {
      cena,
      texto: linha.texto,
      inicio,
      duracao,
      inicioGlobal,
      fimGlobal: inicioGlobal + duracao,
    };
  })
  .sort((a, b) => a.inicioGlobal - b.inicioGlobal);

/** A fala que está tocando neste frame, ou `null` no silêncio entre elas. */
export function falaNoFrame(frame: number): Fala | null {
  return FALAS_GLOBAIS.find((f) => frame >= f.inicioGlobal && frame < f.fimGlobal) ?? null;
}

/** Todas as falas de uma cena — usado pelo modo explorar para resumi-la. */
export function falasDaCena(id: IdCena): readonly Fala[] {
  return FALAS_GLOBAIS.filter((f) => f.cena === id);
}
