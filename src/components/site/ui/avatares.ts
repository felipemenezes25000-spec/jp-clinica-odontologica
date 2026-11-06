import anaBeatriz from "@/assets/avatares/ana-beatriz-112.webp";
import felipeMendes from "@/assets/avatares/felipe-mendes-112.webp";
import guilherme from "@/assets/avatares/guilherme-fazzato-112.webp";
import hugo from "@/assets/avatares/hugo-leonardo-112.webp";
import juliana from "@/assets/avatares/juliana-pelisser-112.webp";
import matheus from "@/assets/avatares/matheus-fraga-112.webp";
import vitorMendes from "@/assets/avatares/vitor-mendes-112.webp";

import { EQUIPE, RESPONSAVEL_TECNICA } from "@/lib/jp";

/**
 * Miniaturas de 112px dos retratos reais (recortadas dos originais da
 * clínica, sem retoque), indexadas pelo nome como está em `jp.ts`. Pesam
 * ~2 KB cada: dá para pôr rostos na primeira dobra sem disputar o LCP.
 * Quem entrar na equipe sem miniatura aqui simplesmente não aparece na pilha.
 */
export const AVATAR_POR_NOME: Record<string, string> = {
  [RESPONSAVEL_TECNICA.nome]: juliana,
  "Dra. Ana Beatriz": anaBeatriz,
  "Dr. Matheus Fraga": matheus,
  "Dr. Hugo Leonardo": hugo,
  "Vitor Mendes": vitorMendes,
  "Felipe Mendes": felipeMendes,
  "Guilherme Fazzato": guilherme,
};

/** Dentistas com registro no conselho: a responsável técnica e quem tem CRO na equipe. */
export const DENTISTAS = [RESPONSAVEL_TECNICA, ...EQUIPE.filter((m) => m.registro)];
