/**
 * As telas do CRC, e o endereço de cada uma.
 *
 * ============================================================================
 *  POR QUE ISTO SAIU DE `routes/crc.tsx`.
 *
 *  Até aqui o CRC tinha UMA rota — `/crc` — e trinta telas que trocavam por
 *  `useState`. Quem recarregasse a página voltava para a Home, quem apertasse
 *  "voltar" saía do aplicativo, e nenhuma tela tinha endereço para mandar a
 *  alguém. O botão do menu era um `<button>`: Ctrl+clique não abria aba nova
 *  porque não havia link nenhum para abrir.
 *
 *  Agora cada tela é um caminho de verdade. Este arquivo é a ponte entre as
 *  duas linguagens — o nome curto que o código usa (`"radar"`) e a URL que o
 *  navegador mostra (`/crc/radar`) — e existe separado porque as duas pontas
 *  precisam dele: o shell, para montar o menu, e a rota, para validar o que
 *  veio na barra de endereço.
 * ============================================================================
 */

import type { Permissao } from "@/lib/crc/dominio/rbac";

/** O nome curto de cada tela. É ele que aparece na URL. */
export type Aba =
  | "home"
  | "radar"
  | "encaixes"
  | "tratamentos"
  | "recepcao"
  | "trabalho"
  | "inbox"
  | "agenda"
  | "funil"
  | "pacientes"
  | "gestao"
  | "metas"
  | "autonomia"
  | "importar"
  | "automacoes"
  | "campanhas"
  | "inteligencia"
  | "conhecimento"
  | "modelos"
  | "avaliacao"
  | "estudio"
  | "playground"
  | "ferramentas"
  | "proximas"
  | "saude"
  | "integracoes"
  | "configuracoes"
  | "equipe";

/**
 * A mesma lista, em tempo de execução.
 *
 * O tipo acima some na compilação, e quem valida `/crc/qualquer-coisa` precisa
 * conferir contra algo que exista quando o navegador roda. Manter as duas
 * formas é chato, e a alternativa — derivar o tipo do array — deixaria o
 * `Aba` como `string` largo em qualquer lugar que o array fosse mutável.
 *
 * O teste `rotas.test.ts` prende as duas juntas: se alguém adicionar um nome
 * ao tipo e esquecer do array, ele reprova.
 */
export const ABAS = [
  "home",
  "radar",
  "encaixes",
  "tratamentos",
  "recepcao",
  "trabalho",
  "inbox",
  "agenda",
  "funil",
  "pacientes",
  "gestao",
  "metas",
  "autonomia",
  "importar",
  "automacoes",
  "campanhas",
  "inteligencia",
  "conhecimento",
  "modelos",
  "avaliacao",
  "estudio",
  "playground",
  "ferramentas",
  "proximas",
  "saude",
  "integracoes",
  "configuracoes",
  "equipe",
] as const satisfies readonly Aba[];

export function ehAba(valor: unknown): valor is Aba {
  return typeof valor === "string" && (ABAS as readonly string[]).includes(valor);
}

/**
 * O endereço de uma tela.
 *
 * A HOME É `/crc`, E NÃO `/crc/home`. Ela é a raiz do aplicativo: dar a ela um
 * caminho próprio criaria dois endereços para a mesma coisa — e um deles seria
 * o que as pessoas salvam nos favoritos, enquanto o outro é o que o sistema
 * gera. Duas URLs para uma tela é como um app começa a ter páginas órfãs.
 */
export function caminhoDaAba(aba: Aba): string {
  return aba === "home" ? "/crc" : `/crc/${aba}`;
}

/**
 * A tela a partir do endereço.
 *
 * Endereço desconhecido cai na Home em vez de quebrar: `/crc/rdar` digitado
 * errado é engano de quem digitou, não defeito do sistema, e uma tela em
 * branco não ajuda ninguém a perceber o engano.
 */
export function abaDoCaminho(pathname: string): Aba {
  const limpo = pathname.replace(/\/+$/u, "");
  if (limpo === "/crc" || limpo === "") return "home";
  const resto = limpo.startsWith("/crc/") ? limpo.slice("/crc/".length) : "";
  const primeiro = resto.split("/")[0] ?? "";
  return ehAba(primeiro) ? primeiro : "home";
}

/**
 * Qual permissão cada tela exige.
 *
 * A MESMA que filtra o menu, e ela precisa estar aqui também: esconder o item
 * do menu não impede ninguém de digitar `/crc/equipe` na barra de endereço. O
 * servidor já recusa os dados — este mapa evita a tela em branco que viria
 * antes da recusa, e diz o que aconteceu em vez de não dizer nada.
 */
export const PERMISSAO_DA_TELA: Record<Exclude<Aba, "home">, Permissao> = {
  radar: "ver_oportunidade",
  encaixes: "ver_paciente",
  tratamentos: "ver_financeiro",
  recepcao: "ver_analytics_gerencial",
  trabalho: "ver_tarefa",
  inbox: "ver_conversa",
  agenda: "ver_paciente",
  funil: "ver_oportunidade",
  pacientes: "ver_paciente",
  gestao: "ver_analytics_gerencial",
  metas: "ver_analytics_gerencial",
  autonomia: "gerenciar_autopilot",
  importar: "importar_dados",
  automacoes: "ver_automacao",
  campanhas: "gerenciar_automacao",
  inteligencia: "gerenciar_automacao",
  conhecimento: "gerenciar_automacao",
  modelos: "gerenciar_integracoes",
  avaliacao: "gerenciar_automacao",
  estudio: "gerenciar_automacao",
  playground: "gerenciar_automacao",
  ferramentas: "gerenciar_automacao",
  proximas: "ver_financeiro",
  saude: "gerenciar_automacao",
  integracoes: "ver_integracoes",
  configuracoes: "ver_integracoes",
  equipe: "gerenciar_usuarios",
};
