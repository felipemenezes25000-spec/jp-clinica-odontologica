import { cor } from "@/design-system/tokens";

/**
 * O registro de marcas. É o ÚNICO lugar que sabe se existe arquivo de logo.
 *
 * Item 7 e 39 do briefing: a peça usa só logo que existe de verdade, e nunca
 * trava por falta de um. Quando `arquivo` é `null`, o `<Marca>` desenha um
 * wordmark tipográfico do design system; quando aponta para um SVG, ele troca
 * pela imagem — sem nenhuma cena precisar saber da diferença.
 *
 * Para colocar um logo real, preencha `arquivo` e `proporcao` aqui. As
 * instruções por integração estão em `public/brands/<pasta>/PLACEHOLDER.md`.
 */

export type ChaveMarca = "jp" | "jpSimbolo" | "dentalOffice" | "whatsapp" | "n8n" | "ia";

export type DefinicaoMarca = {
  nome: string;
  /** Caminho dentro de `public/`, sem barra inicial. `null` = wordmark. */
  arquivo: string | null;
  /** Variante para superfície escura, quando o arquivo tiver uma. */
  arquivoEscuro?: string;
  /** largura ÷ altura do viewBox. Sem isto o logo estica. */
  proporcao: number;
  acento: string;
  /** Uma frase — vira a dica de hover no modo explorar. */
  papel: string;
};

export const MARCAS: Readonly<Record<ChaveMarca, DefinicaoMarca>> = {
  // Reais: vetorizados dos EPS entregues pela clínica.
  jp: {
    nome: "JP Clínica Odontológica",
    arquivo: "brands/jp/logo-jp.svg",
    arquivoEscuro: "brands/jp/logo-jp-claro.svg",
    proporcao: 215.3945 / 73.9942,
    acento: cor.verdeEscuro,
    papel: "A clínica. O JP CRC é o sistema de relacionamento e recuperação dela.",
  },
  jpSimbolo: {
    nome: "JP",
    arquivo: "brands/jp/marca-jp.svg",
    arquivoEscuro: "brands/jp/marca-jp-claro.svg",
    proporcao: 50.222 / 53.2834,
    acento: cor.verdeEscuro,
    papel: "O símbolo da marca, para espaços pequenos.",
  },

  // Ausentes: wordmark do design system até o arquivo oficial chegar.
  dentalOffice: {
    nome: "Dental Office",
    arquivo: null,
    proporcao: 250 / 64,
    acento: cor.dentalOffice,
    papel: "Fonte dos dados operacionais: pacientes, agenda, status e disponibilidade.",
  },
  whatsapp: {
    nome: "WhatsApp",
    arquivo: null,
    proporcao: 210 / 64,
    acento: cor.whatsapp,
    papel: "O canal onde o relacionamento acontece — e onde o paciente responde.",
  },
  n8n: {
    nome: "n8n",
    arquivo: null,
    proporcao: 150 / 64,
    acento: cor.n8n,
    papel: "Orquestra workflows e integrações auxiliares entre os sistemas.",
  },
  ia: {
    nome: "IA",
    arquivo: null,
    proporcao: 120 / 64,
    acento: cor.ia,
    papel: "Classifica intenção, mede temperatura e recomenda a próxima ação permitida.",
  },
};
