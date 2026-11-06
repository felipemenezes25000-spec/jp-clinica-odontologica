import consultorioVerticalImg from "@/assets/consultorio-implantes-2.webp";
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
 * `src` é a versão que aparece na grade: as fotos vindas do Instagram entram
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
  /**
   * O lugar da foto na grade (bento): `grande` ocupa 2x2 e `alto` 1x2. Sem o
   * campo, é um ladrilho. Quem manda nas posições é o CSS (estrutura.css).
   */
  forma?: "grande" | "alto";
  /** Versão própria para o ladrilho `alto` (vertical), quando `src` é paisagem. */
  capa?: { src: string; largura: number; altura: number };
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
  {
    src: consultorioWideImg,
    largura: 1500,
    altura: 800,
    title: "Consultório principal",
    forma: "grande",
  },
  {
    // Vertical, inteira no ladrilho alto. A fachada saiu daqui em 06/11/2026:
    // ela já aparece na história e no atendimento, e esta seção é a clínica
    // por dentro.
    src: consultorioVerticalImg,
    largura: 1200,
    altura: 1500,
    title: "Sala de atendimento",
    forma: "alto",
    capa: { src: consultorioVerticalImg, largura: 1200, altura: 1500 },
  },
  { src: esterilizacaoImg, largura: 1200, altura: 967, title: "Esterilização" },
  { src: equipamentoImg, largura: 1200, altura: 967, title: "Equipamentos" },
  { src: recepcaoImg, full: recepcaoFullImg, largura: 665, altura: 480, title: "Recepção" },
  { src: escritorioImg, full: escritorioFullImg, largura: 665, altura: 480, title: "Escritório" },
  {
    // Foto atual do cantinho (06/11/2026). Na grade vai o recorte do letreiro e
    // da mesa; o clique abre a foto inteira, com Missão, Visão e Valores.
    src: cantinhoCafeImg,
    full: cantinhoCafeFullImg,
    largura: 1200,
    altura: 900,
    title: "Cantinho do café",
    forma: "grande",
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
