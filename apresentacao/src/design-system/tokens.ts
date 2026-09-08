/**
 * Os tokens da apresentação.
 *
 * POR QUE OBJETO TS E NÃO SÓ CSS
 * O filme roda em dois bundlers (Vite para a web, esbuild para o Remotion) e a
 * maior parte da animação escreve `style` em linha, porque o valor depende do
 * frame. Um objeto TypeScript é o único lugar que os dois enxergam sem plugin.
 * O `styles.css` espelha estes mesmos valores em custom properties, para o que é
 * estático (chrome do player, tipografia base).
 *
 * A PALETA É A DA MARCA, NÃO UMA INVENTADA PARA O VÍDEO
 * O Mega Prompt sugeria `#087F5B`. A JP tem verde próprio, entregue em EPS pela
 * clínica e já auditado por contraste em `docs/marca/LEIA-ME.md`: `#095902` e
 * `#56A805`. Usar o sugerido faria a peça divergir do site, do favicon e do
 * material impresso — o vídeo pareceria de outra empresa. Então vale a marca.
 */

export const cor = {
  /* Superfícies claras (dominantes) ------------------------------------- */
  fundo: "#F7F8F2",
  papel: "#FCFDF9",
  branco: "#FFFFFF",
  menta: "#EBF5E1",

  /* Superfícies escuras -------------------------------------------------- */
  /** Verde da marca a 28% de luminância. Único fundo escuro permitido: sobre ele
   *  o verde claro mede 4,96:1 e se lê. Sobre `#095902` cairia para 2,87:1. */
  profundo: "#032F01",
  profundoMais: "#011600",

  /* Marca ---------------------------------------------------------------- */
  /** Verde escuro oficial (RGB 9 89 2). Texto sobre claro: 8,05:1. */
  verdeEscuro: "#095902",
  /** Verde claro oficial (RGB 86 168 5). Preenchimento e destaque; como texto,
   *  só sobre superfície escura. */
  verde: "#56A805",
  verdeSuave: "#DBEFC4",

  /* Tinta ---------------------------------------------------------------- */
  tinta: "#172018",
  tintaSuave: "#5A6B5C",
  tintaFraca: "#8B978C",

  /* Estrutura ------------------------------------------------------------ */
  borda: "#DCE4D6",
  bordaForte: "#C4D2BB",
  linha: "#E7EDE2",

  /* Integrações — detalhe, nunca protagonista --------------------------- */
  dentalOffice: "#2F6FEB",
  dentalOfficeFraco: "#E8F0FE",
  whatsapp: "#25D366",
  whatsappEscuro: "#128C7E",
  whatsappFraco: "#E4F8EC",
  n8n: "#EA4B71",
  n8nFraco: "#FDECF0",
  ia: "#7C5CE6",
  iaFraco: "#EFEBFD",

  /* Semântica ------------------------------------------------------------ */
  alerta: "#B45309",
  alertaFraco: "#FEF3E2",
  perigo: "#B42318",
  perigoFraco: "#FDECEA",
} as const;

export const fonte = {
  display: '"Manrope", ui-sans-serif, system-ui, sans-serif',
  texto: '"Inter", ui-sans-serif, system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, monospace',
} as const;

/**
 * Escala tipográfica em px absolutos, calibrada para a tela de 1920×1080 do
 * filme. A versão web reescala o palco inteiro por `transform: scale()`, então
 * um px aqui é sempre a mesma fração da altura — o que faz o texto do vídeo e o
 * do tour terem exatamente a mesma proporção.
 */
export const tamanho = {
  mega: 108,
  titulo: 72,
  subtitulo: 52,
  cabecalho: 38,
  destaque: 30,
  corpo: 24,
  apoio: 20,
  legenda: 17,
  micro: 14,
} as const;

export const raio = {
  pequeno: 10,
  medio: 16,
  grande: 24,
  enorme: 34,
  pilula: 999,
} as const;

export const sombra = {
  suave: "0 18px 46px -30px rgba(3, 47, 1, 0.28)",
  media: "0 26px 70px -38px rgba(3, 47, 1, 0.36)",
  alta: "0 40px 100px -46px rgba(3, 47, 1, 0.5)",
  interna: "inset 0 1px 0 rgba(255,255,255,0.65)",
} as const;

/** Dimensão nativa do palco. Tudo é desenhado nestas coordenadas. */
export const PALCO = { largura: 1920, altura: 1080 } as const;
export const PALCO_VERTICAL = { largura: 1080, altura: 1920 } as const;

export const FPS = 30;

export type ChaveIntegracao = "dentalOffice" | "jp" | "n8n" | "whatsapp" | "ia" | "paciente";

/** Cor de acento por integração. Uma fonte só, usada por nó, badge e linha. */
export const acento: Readonly<Record<ChaveIntegracao, { forte: string; fraco: string }>> = {
  dentalOffice: { forte: cor.dentalOffice, fraco: cor.dentalOfficeFraco },
  jp: { forte: cor.verdeEscuro, fraco: cor.menta },
  n8n: { forte: cor.n8n, fraco: cor.n8nFraco },
  whatsapp: { forte: cor.whatsapp, fraco: cor.whatsappFraco },
  ia: { forte: cor.ia, fraco: cor.iaFraco },
  paciente: { forte: cor.tintaSuave, fraco: "#F1F4EF" },
};
