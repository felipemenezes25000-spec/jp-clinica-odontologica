import fachada2026Img from "@/assets/fachada-2026.webp";
import fachada2026FullImg from "@/assets/fachada-2026-completa.webp";
import consultorioWideImg from "@/assets/consultorio-wide.webp";
import esterilizacaoImg from "@/assets/esterilizacao.webp";
import equipamentoImg from "@/assets/equipamento.webp";
import escritorioImg from "@/assets/escritorio.webp";
import escritorioFullImg from "@/assets/escritorio-completa.webp";
import recepcaoImg from "@/assets/recepcao.webp";
import recepcaoFullImg from "@/assets/recepcao-completa.webp";
import cantinhoCafeImg from "@/assets/cantinho-cafe.webp";
import cantinhoCafeFullImg from "@/assets/cantinho-cafe-completa.webp";
import consultorioJanelaImg from "@/assets/consultorio-janela.webp";
import consultorioJanelaFullImg from "@/assets/consultorio-janela-completa.webp";
import entradaClinicaImg from "@/assets/entrada-clinica.webp";
import entradaClinicaFullImg from "@/assets/entrada-clinica-completa.webp";
import consultorioBancadaImg from "@/assets/consultorio-bancada.webp";
import consultorioBancadaFullImg from "@/assets/consultorio-bancada-completa.webp";
import consultorioCadeiraLilasImg from "@/assets/consultorio-cadeira-lilas.webp";
import consultorioCadeiraLilasFullImg from "@/assets/consultorio-cadeira-lilas-completa.webp";

/**
 * `src` é a versão que aparece na trilha: as fotos vindas do Instagram entram
 * ali já recortadas para fora da moldura decorativa, senão o logo e o rótulo
 * impressos nelas brigam com os do site.
 *
 * `full` é o post original, inteiro, que abre ao clicar. Só as fotos que têm
 * uma versão diferente da exibida declaram o campo; nas demais o clique abre
 * a mesma imagem.
 */
export type EspacoFoto = {
  src: string;
  full?: string;
  title: string;
  /** Dimensões reais de `src`: o atributo width/height não pode mentir para o navegador. */
  largura: number;
  altura: number;
};

/*
 * FORA DA GALERIA, de propósito: a foto "sala de espera — ortodontia" é um
 * banner de divulgação (rostos de crianças e lista de aparelhos, com
 * Invisalign e Esmeralda). Numa galeria de estrutura ela lê como publicidade
 * de procedimento com imagem de menores, que a Res. CFO 196 e a autorização
 * das famílias tornam um risco desnecessário. O arquivo continua em
 * src/assets; voltar com ela exige confirmar isso com a clínica.
 */

export const GALLERY: EspacoFoto[] = [
  { src: consultorioWideImg, largura: 1500, altura: 800, title: "Consultório principal" },
  {
    // Foto de 21/09/2026, com o letreiro atual — o anterior ainda mostrava um
    // WhatsApp que não é mais o da clínica. É vertical (1086x1448) e a peça é
    // paisagem: o recorte começa em y=170 da original e deixa o letreiro inteiro
    // na metade de cima. O clique abre a foto inteira.
    src: fachada2026Img,
    full: fachada2026FullImg,
    largura: 1086,
    altura: 814,
    title: "Nossa fachada",
  },
  { src: esterilizacaoImg, largura: 1200, altura: 967, title: "Esterilização" },
  { src: equipamentoImg, largura: 1200, altura: 967, title: "Equipamentos" },
  { src: recepcaoImg, full: recepcaoFullImg, largura: 665, altura: 480, title: "Recepção" },
  { src: escritorioImg, full: escritorioFullImg, largura: 665, altura: 480, title: "Escritório" },
  {
    src: cantinhoCafeImg,
    full: cantinhoCafeFullImg,
    largura: 665,
    altura: 480,
    title: "Cantinho do café",
  },
  {
    src: consultorioJanelaImg,
    full: consultorioJanelaFullImg,
    largura: 665,
    altura: 480,
    title: "Consultório com luz natural",
  },
  {
    src: entradaClinicaImg,
    full: entradaClinicaFullImg,
    largura: 665,
    altura: 480,
    title: "Entrada da clínica",
  },
  {
    src: consultorioBancadaImg,
    full: consultorioBancadaFullImg,
    largura: 665,
    altura: 480,
    title: "Consultório — bancada de trabalho",
  },
  {
    src: consultorioCadeiraLilasImg,
    full: consultorioCadeiraLilasFullImg,
    largura: 665,
    altura: 480,
    title: "Consultório — outra sala",
  },
];

/** As fotos de exibição têm 665x480; a coroa da trilha segue a mesma proporção. */
export const PROPORCAO_FOTO = 665 / 480;
