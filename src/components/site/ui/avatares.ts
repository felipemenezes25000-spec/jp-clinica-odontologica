import anaBeatriz from "@/assets/avatares/ana-beatriz-112.webp";
import danielaMorelloBraga from "@/assets/avatares/daniela-morello-braga-112.webp";
import guilherme from "@/assets/avatares/guilherme-fazzato-112.webp";
import hugo from "@/assets/avatares/hugo-leonardo-112.webp";
import juliana from "@/assets/avatares/juliana-pelisser-112.webp";
import leonardoAversa from "@/assets/avatares/leonardo-aversa-112.webp";
import nataliaLopes from "@/assets/avatares/natalia-lopes-112.webp";

import { EQUIPE, RESPONSAVEL_TECNICA, ehDentista } from "@/lib/jp";

/**
 * Miniaturas de 112px dos retratos reais (recortadas dos originais da
 * clínica, sem retoque), indexadas pelo nome como está em `jp.ts`. Pesam
 * ~2 KB cada: dá para pôr rostos na primeira dobra sem disputar o LCP.
 * Quem entrar na equipe sem miniatura aqui simplesmente não aparece na pilha.
 */
export const AVATAR_POR_NOME: Record<string, string> = {
  [RESPONSAVEL_TECNICA.nome]: juliana,
  "Dra. Ana Beatriz": anaBeatriz,
  "Dr. Hugo Leonardo": hugo,
  "Dr. Leonardo Aversa": leonardoAversa,
  "Daniela Morello Braga": danielaMorelloBraga,
  "Dra. Natália Lopes": nataliaLopes,
  "Guilherme Fazzato": guilherme,
};

/**
 * Dentistas com registro no CRO: a responsável técnica e quem é do CRO na equipe.
 * Registro em outro conselho (a fisioterapeuta, com CREFITO) não conta.
 */
export const DENTISTAS = [RESPONSAVEL_TECNICA, ...EQUIPE.filter(ehDentista)];
