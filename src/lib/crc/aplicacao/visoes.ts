/**
 * Visões salvas — item 147.
 *
 * "Orçamentos quentes", "Faltantes da semana", "Recall implantes". São três
 * exemplos do contrato e todos têm a mesma forma: um conjunto de filtros que
 * alguém remonta toda manhã. Salvar é transformar um ritual em um clique.
 *
 * DUAS DECISÕES QUE DEFINEM O QUE ISTO É:
 *
 * O FILTRO É VALIDADO NA ENTRADA, e não confiado. `filtros` é `jsonb`, e um
 * jsonb que ninguém confere é uma porta aberta: uma visão salva com
 * `{"limite": 999999}` viraria uma consulta que derruba a tela, e uma com uma
 * chave inventada viraria um filtro que o servidor ignora em silêncio — a
 * pessoa veria a lista errada achando que é a certa. `lerFiltroFunil` só
 * deixa passar o que existe.
 *
 * COMPARTILHAR É EXPLÍCITO. A visão nasce pessoal. A recepção monta a fila do
 * jeito dela e isso não vira regra para a clínica inteira sem alguém decidir
 * que vira. Quem compartilha continua sendo o dono: só o autor edita e apaga a
 * própria visão, mesmo depois de compartilhada.
 */
import type { TipoOportunidade } from "../dominio/tipos";
import { ROTULO_TIPO_OPORTUNIDADE } from "../dominio/rotulos";
import { apagar, gravar, selecionar, type Linha } from "../servidor/banco";

/** Por enquanto só o funil tem visões. O escopo existe para o resto caber. */
export type EscopoVisao = "funil";

const ESCOPOS: readonly EscopoVisao[] = ["funil"];

export function ehEscopo(valor: string): valor is EscopoVisao {
  return (ESCOPOS as readonly string[]).includes(valor);
}

/**
 * O que uma visão do funil pode guardar.
 *
 * Pequeno de propósito. Cada campo aqui é um filtro que `listarOportunidades`
 * sabe aplicar — e um campo a mais aqui sem o par de lá seria uma promessa que
 * a tela não cumpre.
 */
export type FiltroFunil = {
  tipos: TipoOportunidade[];
  etapaChave: string | null;
  apenasMinhas: boolean;
};

export const FILTRO_FUNIL_VAZIO: FiltroFunil = {
  tipos: [],
  etapaChave: null,
  apenasMinhas: false,
};

/** Quantas visões uma pessoa pode ter por escopo. Trava de sanidade, não regra. */
const MAX_POR_PESSOA = 30;

const MAX_NOME = 40;

export type VisaoSalva = {
  id: string;
  escopo: EscopoVisao;
  nome: string;
  filtros: FiltroFunil;
  compartilhada: boolean;
  /** Verdadeiro quando quem está lendo é o autor — só ele pode apagar. */
  minha: boolean;
  criadoEm: string;
};

/* -------------------------------------------------------------------------- */
/* Validação                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Lê um `jsonb` de origem desconhecida e devolve um filtro que existe.
 *
 * Nunca lança. Um campo estragado vira o valor neutro daquele campo, e a visão
 * continua abrindo: perder o filtro de tipo é irritante, perder a visão inteira
 * porque um campo veio torto é pior.
 */
export function lerFiltroFunil(bruto: unknown): FiltroFunil {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return { ...FILTRO_FUNIL_VAZIO };
  }
  const o = bruto as Record<string, unknown>;

  const tiposBrutos = Array.isArray(o["tipos"]) ? o["tipos"] : [];
  // O mapa de rótulos é a única lista fechada de tipos que existe. Usá-lo como
  // validador significa que um tipo novo passa a ser aceito no mesmo commit em
  // que ganha nome na tela — e nunca antes.
  const tipos = tiposBrutos.filter(
    (t): t is TipoOportunidade => typeof t === "string" && t in ROTULO_TIPO_OPORTUNIDADE,
  );

  const etapa = o["etapaChave"];
  const etapaChave = typeof etapa === "string" && etapa.trim().length > 0 ? etapa.trim() : null;

  return {
    // `Set` porque a mesma visão salva duas vezes com o mesmo tipo produziria
    // um `in` com duplicata — inofensivo no banco, confuso na tela.
    tipos: [...new Set(tipos)],
    etapaChave,
    apenasMinhas: o["apenasMinhas"] === true,
  };
}

/** Corta e limpa o nome. Vazio é recusado por quem chama. */
export function normalizarNome(bruto: string): string {
  return bruto.replace(/\s+/gu, " ").trim().slice(0, MAX_NOME);
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

function linhaParaVisao(linha: Linha, userId: string): VisaoSalva | null {
  const escopo = String(linha["escopo"] ?? "");
  if (!ehEscopo(escopo)) return null;

  return {
    id: String(linha["id"] ?? ""),
    escopo,
    nome: String(linha["nome"] ?? ""),
    filtros: lerFiltroFunil(linha["filtros"]),
    compartilhada: linha["compartilhada"] === true,
    minha: String(linha["user_id"] ?? "") === userId,
    criadoEm: String(linha["criado_em"] ?? ""),
  };
}

/**
 * As minhas mais as compartilhadas.
 *
 * Duas consultas, e não um `or` numa só: o PostgREST monta `or=(...)` numa
 * querystring que fica ilegível no log e difícil de indexar. Duas leituras
 * pequenas sobre o mesmo índice custam menos que uma consulta que ninguém
 * consegue depurar depois.
 */
export async function listarVisoes(
  organizationId: string,
  userId: string,
  escopo: EscopoVisao,
): Promise<VisaoSalva[]> {
  const base = [
    { coluna: "organization_id", op: "eq" as const, valor: organizationId },
    { coluna: "escopo", op: "eq" as const, valor: escopo },
  ];

  const [minhas, compartilhadas] = await Promise.all([
    selecionar("crc_saved_views", {
      filtros: [...base, { coluna: "user_id", op: "eq", valor: userId }],
      ordenar: [{ coluna: "nome", ascendente: true }],
      limite: MAX_POR_PESSOA,
    }),
    selecionar("crc_saved_views", {
      filtros: [...base, { coluna: "compartilhada", op: "eq", valor: true }],
      ordenar: [{ coluna: "nome", ascendente: true }],
      limite: 100,
    }),
  ]);

  const vistas = new Set<string>();
  const saida: VisaoSalva[] = [];

  for (const linha of [...minhas, ...compartilhadas]) {
    const id = String(linha["id"] ?? "");
    // A minha visão compartilhada aparece nas duas consultas. A primeira volta
    // vence, e é a que traz `minha: true` — que é o que libera o botão de
    // apagar.
    if (vistas.has(id)) continue;
    vistas.add(id);

    const visao = linhaParaVisao(linha, userId);
    if (visao !== null) saida.push(visao);
  }

  return saida.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/* -------------------------------------------------------------------------- */
/* Escrita                                                                    */
/* -------------------------------------------------------------------------- */

export type ResultadoSalvar = { ok: true; visao: VisaoSalva } | { ok: false; motivo: string };

/**
 * Salva, ou ATUALIZA quando o nome se repete.
 *
 * O upsert é por `(organization_id, user_id, escopo, nome)` — o índice do 04.
 * Sem ele, ajustar um filtro e salvar com o mesmo nome criaria uma segunda
 * linha idêntica no nome e diferente no conteúdo, e a pessoa passaria a
 * escolher entre duas "Faltantes da semana" sem saber qual é a nova.
 */
export async function salvarVisao(dados: {
  organizationId: string;
  userId: string;
  escopo: EscopoVisao;
  nome: string;
  filtros: FiltroFunil;
  compartilhada: boolean;
}): Promise<ResultadoSalvar> {
  const nome = normalizarNome(dados.nome);
  if (nome.length === 0) return { ok: false, motivo: "Dê um nome para a visão." };

  const existentes = await selecionar("crc_saved_views", {
    colunas: "id,nome",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
      { coluna: "user_id", op: "eq", valor: dados.userId },
      { coluna: "escopo", op: "eq", valor: dados.escopo },
    ],
    limite: MAX_POR_PESSOA + 1,
  });

  const jaExiste = existentes.some((l) => String(l["nome"] ?? "") === nome);
  if (!jaExiste && existentes.length >= MAX_POR_PESSOA) {
    return {
      ok: false,
      motivo: `Você já tem ${String(MAX_POR_PESSOA)} visões salvas. Apague uma antes de criar outra.`,
    };
  }

  const linhas = await gravar(
    "crc_saved_views",
    {
      organization_id: dados.organizationId,
      user_id: dados.userId,
      escopo: dados.escopo,
      nome,
      filtros: dados.filtros,
      compartilhada: dados.compartilhada,
    },
    "organization_id,user_id,escopo,nome",
  );

  const linha = linhas[0];
  if (linha === undefined) return { ok: false, motivo: "Não conseguimos salvar a visão." };

  const visao = linhaParaVisao(linha, dados.userId);
  if (visao === null) return { ok: false, motivo: "Não conseguimos salvar a visão." };

  return { ok: true, visao };
}

/**
 * Apaga — só a própria.
 *
 * O `user_id` entra como FILTRO da exclusão, e não como conferência antes
 * dela. Conferir e depois apagar por id deixa uma janela entre as duas
 * operações; filtrar faz o banco recusar a exclusão alheia mesmo que o id
 * chegue adulterado.
 */
export async function apagarVisao(
  organizationId: string,
  userId: string,
  id: string,
): Promise<void> {
  await apagar("crc_saved_views", [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "user_id", op: "eq", valor: userId },
    { coluna: "id", op: "eq", valor: id },
  ]);
}
