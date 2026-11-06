/**
 * As mídias de cada página de tratamento: a animação ilustrativa (quando há) e
 * as fotos reais da clínica que sustentam cada seção.
 *
 * Fica fora dos componentes por dois motivos: o Fast Refresh só aceita
 * componente num arquivo de componente, e a escolha de foto é uma decisão de
 * conteúdo que se revisa sem tocar em layout.
 */
import consultorioRealImg from "@/assets/consultorio-1-sem-teto.webp";
import consultorioReal2Img from "@/assets/consultorio-2.webp";
import esterilizacaoImg from "@/assets/esterilizacao.webp";
import consultorioImplantes1Img from "@/assets/consultorio-implantes-1-sem-teto.webp";
import consultorioImplantes2Img from "@/assets/consultorio-implantes-2-sem-teto.webp";
import consultorioWideImg from "@/assets/consultorio-wide-1100-sem-teto.webp";
import consultorioJanelaImg from "@/assets/consultorio-janela.webp";
import consultorioBancadaImg from "@/assets/consultorio-bancada.webp";
import cadeiraLilasImg from "@/assets/consultorio-cadeira-lilas.webp";
import recepcaoImg from "@/assets/recepcao.webp";
import fachadaImg from "@/assets/fachada-2026.webp";
import retratoImg from "@/assets/juliana-pelisser.webp";

import videoClareamento from "@/assets/video-clareamento.mp4?url";
import posterClareamento from "@/assets/video-clareamento-poster.webp";
import videoRestauracao from "@/assets/video-restauracao.mp4?url";
import posterRestauracao from "@/assets/video-restauracao-poster.webp";
import videoLimpeza from "@/assets/video-limpeza.mp4?url";
import posterLimpeza from "@/assets/video-limpeza-poster.webp";
import videoOdontopediatria from "@/assets/video-odontopediatria.mp4?url";
import posterOdontopediatria from "@/assets/video-odontopediatria-poster.webp";
import videoImplante from "@/assets/video-implante.mp4?url";
import posterImplante from "@/assets/video-implante-poster.webp";
import videoOrtodontia from "@/assets/video-ortodontia.mp4?url";
import posterOrtodontia from "@/assets/video-ortodontia-poster.webp";
import videoProtese from "@/assets/video-protese.mp4?url";
import posterProtese from "@/assets/video-protese-poster.webp";

/**
 * Animações explicativas, por slug.
 *
 * Só entram os tratamentos cujo mecanismo é difícil de imaginar lendo: como as
 * três peças do implante se encaixam, como o fio move o dente, como a prótese
 * se apoia nos implantes. Onde o texto já explica bem, vídeo seria peso sem ganho.
 *
 * A HARMONIZAÇÃO NÃO TEM ANIMAÇÃO AQUI, de propósito: o clipe dela é o rosto de
 * uma pessoa, e o site só mostra pessoas reais da clínica. No lugar entra a foto
 * do consultório (ver `fotoDoTopo`). O arquivo continua em `src/assets`.
 */
export type Animacao = { src: string; poster: string; descricao: string };

export const ANIMACOES: Record<string, Animacao> = {
  "limpeza-profilaxia": {
    src: videoLimpeza,
    poster: posterLimpeza,
    descricao: "Água percorrendo os dentes e levando a placa acumulada na superfície.",
  },
  "clareamento-dental": {
    src: videoClareamento,
    poster: posterClareamento,
    descricao: "Seringa de gel clareador e a moldeira usada para aplicar o produto nos dentes.",
  },
  restauracoes: {
    src: videoRestauracao,
    poster: posterRestauracao,
    descricao: "Dente com cárie recebendo a restauração, que fecha o buraco e deixa o dente liso.",
  },
  odontopediatria: {
    src: videoOdontopediatria,
    poster: posterOdontopediatria,
    descricao: "Escova passando pelos dentes em movimento calmo, mostrando a escovação certa.",
  },
  "implantes-dentarios": {
    src: videoImplante,
    poster: posterImplante,
    descricao:
      "Implante fixado no osso recebendo o pilar e a coroa, até virar um dente igual aos vizinhos.",
  },
  ortodontia: {
    src: videoOrtodontia,
    poster: posterOrtodontia,
    descricao:
      "Bráquetes e fio sendo colocados nos dentes tortos, que se alinham até formar o arco.",
  },
  "proteses-dentarias": {
    src: videoProtese,
    poster: posterProtese,
    descricao: "Prótese fixa se encaixando sobre seis implantes na arcada inferior.",
  },
};

/** `posicao` é o `object-position` da foto dentro da coroa. Quatro fotos da
 *  clínica (consultório 1, amplo, implantes 1 e 2) vêm no arquivo `-sem-teto`:
 *  o original com o ar-condicionado colado no teto foi recortado abaixo dele,
 *  porque `object-position` não esconde nada numa foto que já cobre a altura. */
export type Foto = { src: string; largura: number; altura: number; alt: string; posicao?: string };

const CONSULTORIO: Foto = {
  src: consultorioRealImg,
  largura: 1400,
  altura: 816,
  alt: "Sala de atendimento da JP Clínica Odontológica, com a cadeira e a janela",
  posicao: "50% 60%",
};
const CONSULTORIO_2: Foto = {
  src: consultorioReal2Img,
  largura: 1200,
  altura: 896,
  alt: "Consultório da JP Clínica Odontológica visto de outro ângulo",
  posicao: "70% 80%",
};
const CONSULTORIO_AMPLO: Foto = {
  src: consultorioWideImg,
  largura: 1100,
  altura: 423,
  alt: "Sala de atendimento ampla da JP Clínica Odontológica, com luz natural",
  posicao: "72% 60%",
};
const CADEIRA: Foto = {
  src: consultorioImplantes1Img,
  largura: 1200,
  altura: 1200,
  alt: "Consultório da JP Clínica Odontológica, com a cadeira de atendimento",
  posicao: "50% 70%",
};
const CADEIRA_LUZ: Foto = {
  src: consultorioImplantes2Img,
  largura: 1200,
  altura: 1230,
  alt: "Cadeira de atendimento da JP Clínica Odontológica com a luz do consultório",
  posicao: "50% 70%",
};
const JANELA: Foto = {
  src: consultorioJanelaImg,
  largura: 665,
  altura: 480,
  alt: "Cadeira de atendimento junto à janela, no consultório da JP Clínica Odontológica",
  posicao: "60% 60%",
};
const BANCADA: Foto = {
  src: consultorioBancadaImg,
  largura: 665,
  altura: 480,
  alt: "Bancada e equipamentos do consultório da JP Clínica Odontológica",
  posicao: "60% 70%",
};
const CADEIRA_LILAS: Foto = {
  src: cadeiraLilasImg,
  largura: 665,
  altura: 480,
  alt: "Cadeira lilás de atendimento no consultório da JP Clínica Odontológica",
  posicao: "15% 85%",
};
const RECEPCAO: Foto = {
  src: recepcaoImg,
  largura: 665,
  altura: 480,
  alt: "Corredor da recepção da JP Clínica Odontológica, com cadeiras verdes",
  posicao: "65% 50%",
};
const ESTERILIZACAO: Foto = {
  src: esterilizacaoImg,
  largura: 1200,
  altura: 967,
  alt: "Bancada de esterilização dos instrumentos da JP Clínica Odontológica",
  posicao: "40% 60%",
};
/** Fachada em dia de sol: fecha a página com o endereço que a pessoa vai procurar. */
export const FACHADA: Foto = {
  src: fachadaImg,
  largura: 1086,
  altura: 814,
  alt: "Fachada verde da JP Clínica Odontológica, na Rua Rio Verde",
  posicao: "55% 70%",
};
/** Retrato da responsável técnica: nome e registro vão escritos ao lado, na página. */
export const RETRATO: Foto = {
  src: retratoImg,
  largura: 560,
  altura: 683,
  alt: "Retrato da Dra. Juliana Pelisser Barbosa, responsável técnica da clínica",
  posicao: "50% 30%",
};

/** A foto da janela do topo quando o tratamento não tem animação. */
export function fotoDoTopo(): Foto {
  return CADEIRA;
}

/**
 * As duas fotos de apoio de cada página, escolhidas pelo tratamento e não pela
 * posição na lista: a de `entenda` abre a leitura, a de `paraQuem` mora na
 * seção seguinte, e as duas nunca repetem na mesma página. Só ambientes da
 * clínica — nenhuma mostra procedimento sendo feito (Res. CFO 196/2019).
 */
const FOTOS: Record<string, { entenda: Foto; paraQuem: Foto }> = {
  "limpeza-profilaxia": { entenda: RECEPCAO, paraQuem: CONSULTORIO },
  "clareamento-dental": { entenda: JANELA, paraQuem: CONSULTORIO_2 },
  restauracoes: { entenda: BANCADA, paraQuem: CONSULTORIO_AMPLO },
  "implantes-dentarios": { entenda: CADEIRA_LUZ, paraQuem: CADEIRA },
  "proteses-dentarias": { entenda: ESTERILIZACAO, paraQuem: CONSULTORIO },
  ortodontia: { entenda: JANELA, paraQuem: CADEIRA_LILAS },
  odontopediatria: { entenda: CADEIRA_LILAS, paraQuem: RECEPCAO },
  "harmonizacao-orofacial": { entenda: CONSULTORIO_AMPLO, paraQuem: CONSULTORIO_2 },
};

export function fotosDaPagina(slug: string): { entenda: Foto; paraQuem: Foto } {
  return FOTOS[slug] ?? { entenda: CONSULTORIO, paraQuem: CONSULTORIO_2 };
}

/**
 * "Outros caminhos de cuidado": o que costuma ser a próxima pergunta de quem
 * leu esta página, e não os três primeiros da lista. A decisão é de conteúdo
 * (e se revisa aqui); um slug que deixe de existir em `TRATAMENTOS` é ignorado
 * por quem consome.
 */
export const RELACIONADOS: Record<string, readonly string[]> = {
  "limpeza-profilaxia": ["clareamento-dental", "restauracoes", "odontopediatria"],
  "clareamento-dental": ["limpeza-profilaxia", "restauracoes", "harmonizacao-orofacial"],
  restauracoes: ["limpeza-profilaxia", "clareamento-dental", "proteses-dentarias"],
  "implantes-dentarios": ["proteses-dentarias", "ortodontia", "restauracoes"],
  "proteses-dentarias": ["implantes-dentarios", "restauracoes", "limpeza-profilaxia"],
  ortodontia: ["clareamento-dental", "harmonizacao-orofacial", "odontopediatria"],
  odontopediatria: ["ortodontia", "limpeza-profilaxia", "restauracoes"],
  "harmonizacao-orofacial": ["clareamento-dental", "ortodontia", "limpeza-profilaxia"],
};
