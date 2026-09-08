/**
 * As duas faixas de áudio da peça.
 *
 * NARRAÇÃO — gerada por `npm run narracao` a partir de `narracao.json`, com voz
 * neural em português. Ela existe para que o vídeo se explique sozinho para quem
 * não é da área: a legenda diz a mesma coisa, no mesmo instante, porque as duas
 * saem do mesmo arquivo. Para trocar por locução humana, grave seguindo
 * `out/roteiro-narracao.txt` e substitua o MP3 — os tempos não mudam.
 *
 * TRILHA — gerada por `npm run trilha`. Um colchão em Ré maior, 72 BPM,
 * **sintetizado por código**: a peça é exportada em MP4 e mostrada a terceiros, e
 * música protegida nesse contexto é problema de licença, não detalhe técnico.
 * Ela já sai do gerador abaixando durante cada fala da narração, então a mistura
 * vale igual no site e no vídeo. Ver `public/audio/LEIA-ME.md`.
 */

export const NARRACAO: string | null = "audio/narracao.mp3";

export const TRILHA: string | null = "audio/trilha.mp3";

/** Volume da narração. Cheio: é ela que carrega a explicação. */
export const VOLUME_NARRACAO = 1;

/**
 * Volume da trilha.
 *
 * O arquivo já sai normalizado em −3 dBFS e com o recuo sob a voz embutido, então
 * este é o único número da mistura. 0,3 põe a música cerca de 25 dB abaixo da
 * narração — presente no silêncio entre as frases, ausente por cima delas.
 */
export const VOLUME_TRILHA = 0.3;

/** Efeitos sintetizados: desligados por padrão, para não competir com a voz. */
export const EFEITOS_PADRAO_LIGADOS = false;
