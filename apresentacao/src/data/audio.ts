/**
 * A trilha.
 *
 * `null` por padrão, e isso é uma decisão, não um esquecimento: embutir música
 * protegida numa peça que vai ser exportada em MP4 e mostrada para terceiros é
 * problema de licença, não detalhe técnico. Ver `public/audio/LEIA-ME.md`.
 *
 * Com `null`, tour e render funcionam em silêncio — nada quebra.
 */
export const TRILHA: string | null = null;

/** Volume da trilha sob a narração. Baixo: a peça é explicativa, não clipe. */
export const VOLUME_TRILHA = 0.18;

/** Efeitos sintetizados ligam desligados; o botão de som do player liga. */
export const EFEITOS_PADRAO_LIGADOS = false;
