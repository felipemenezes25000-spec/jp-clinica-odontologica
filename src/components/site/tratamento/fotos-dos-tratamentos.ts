/**
 * A foto de cada tratamento: o que o tratamento é, para a imagem conversar com
 * o título. Fonte única para o site inteiro:
 * - cartões de tratamento da home (`SpecialtiesSection`);
 * - bloco "Para quem" das páginas de tratamento (`midia.ts`), orgânicas e de
 *   anúncio;
 * - bloco "Como funciona" das páginas de implante e clareamento
 *   (`PaginaImplanteAds`, `PaginaClareamentoAds`). O topo delas é vertical, e
 *   uma faixa de 3:1 ali viraria um recorte irreconhecível.
 *
 * Origem: fotos enviadas pelo Felipe em 06/11/2026, com cerca de 550×180 px.
 * Os arquivos daqui são essas fotos ampliadas 2x (lanczos com leve realce de
 * nitidez), para ficarem menos moles em tela nítida. Se vierem versões maiores,
 * troque o arquivo mantendo o nome. Nas de odontopediatria e harmonização,
 * olhos e nariz estão desfocados no próprio arquivo, para ninguém ser
 * reconhecido.
 *
 * Cinco mostram o procedimento sendo feito. O alerta sobre a Res. CFO 196/2019,
 * art. 3, foi dado ao Felipe, e a decisão foi manter.
 *
 * `posicao` é o `object-position` que segura o assunto quando o quadro corta as
 * laterais (cartão estreito da home, faixa 2,4:1 do "Para quem", quadro 6:5
 * do "Como funciona").
 */
import limpeza from "@/assets/tratamentos/limpeza-profilaxia.webp";
import clareamento from "@/assets/tratamentos/clareamento-dental.webp";
import restauracoes from "@/assets/tratamentos/restauracoes.webp";
import implantes from "@/assets/tratamentos/implantes-dentarios.webp";
import proteses from "@/assets/tratamentos/proteses-dentarias.webp";
import ortodontia from "@/assets/tratamentos/ortodontia.webp";
import odontopediatria from "@/assets/tratamentos/odontopediatria.webp";
import harmonizacao from "@/assets/tratamentos/harmonizacao-orofacial.webp";

export type FotoDoTratamento = {
  src: string;
  largura: number;
  altura: number;
  alt: string;
  posicao: string;
};

/** Largura / altura do quadro que as páginas usam para estas fotos em faixa. */
export const PROPORCAO_DA_FAIXA = 2.4;

export const FOTO_DO_TRATAMENTO: Record<string, FotoDoTratamento> = {
  "limpeza-profilaxia": {
    src: limpeza,
    largura: 1100,
    altura: 384,
    alt: "Limpeza dental: instrumento removendo o tártaro da superfície dos dentes",
    posicao: "60% 50%",
  },
  "clareamento-dental": {
    src: clareamento,
    largura: 1108,
    altura: 384,
    alt: "Clareamento dental em consultório, com a luz de ativação sobre os dentes",
    posicao: "55% 50%",
  },
  restauracoes: {
    src: restauracoes,
    largura: 1100,
    altura: 366,
    alt: "Dentes posteriores vistos pelo espelho clínico",
    posicao: "55% 50%",
  },
  "implantes-dentarios": {
    src: implantes,
    largura: 1108,
    altura: 366,
    alt: "Modelo de arcada com um implante dentário e a coroa entre os dentes naturais",
    posicao: "62% 50%",
  },
  "proteses-dentarias": {
    src: proteses,
    largura: 1100,
    altura: 344,
    alt: "Prótese total e prótese parcial removível sobre a bancada",
    posicao: "25% 50%",
  },
  ortodontia: {
    src: ortodontia,
    largura: 1108,
    altura: 344,
    alt: "Sorriso com aparelho ortodôntico fixo nos dentes",
    posicao: "50% 50%",
  },
  odontopediatria: {
    src: odontopediatria,
    largura: 1100,
    altura: 368,
    alt: "Criança em atendimento odontológico, com o rosto desfocado",
    posicao: "52% 50%",
  },
  "harmonizacao-orofacial": {
    src: harmonizacao,
    largura: 1108,
    altura: 368,
    alt: "Aplicação de harmonização orofacial na bochecha, com o rosto desfocado",
    posicao: "60% 50%",
  },
};

/**
 * A foto de um tratamento que o código pede pelo nome. Slug sem foto é erro de
 * digitação: falha alto em vez de sumir com a imagem.
 */
export function fotoDoTratamento(slug: string): FotoDoTratamento {
  const foto = FOTO_DO_TRATAMENTO[slug];
  if (!foto) throw new Error(`Sem foto cadastrada para o tratamento "${slug}".`);
  return foto;
}

/** A foto do tratamento com o quadro em faixa do bloco "Para quem". */
export function fotoEmFaixa(slug: string): FotoDoTratamento & { proporcao: number } {
  return { ...fotoDoTratamento(slug), proporcao: PROPORCAO_DA_FAIXA };
}
