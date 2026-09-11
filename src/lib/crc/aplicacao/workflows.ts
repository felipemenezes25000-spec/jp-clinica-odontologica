/**
 * O Workflow Studio — a parte que fala com o banco.
 *
 * O QUE ELA GUARDA que o domínio não pode: a definição é versionada, e a versão
 * é o contrato entre o editor e as jornadas que já estão rodando.
 *
 * ========================================================================
 *  A REGRA QUE FAZ EDITAR SER SEGURO: **jornada em voo não muda de definição.**
 *
 *  `crc_automation_enrollments.versao` grava em qual versão o paciente entrou,
 *  e o motor lê a definição DAQUELA versão. Alguém que edita agora não muda o
 *  que está acontecendo com as pessoas que já estão no meio do caminho.
 *
 *  Sem isso, acrescentar um passo no meio faria quem já passou do ponto pular
 *  o passo novo, e quem não passou receber uma mensagem que a jornada dele
 *  nunca prometeu. Pior: remover um passo moveria o ponteiro de todo mundo
 *  para o passo errado — o de índice 3 vira outro passo, e a jornada continua
 *  achando que está no 3.
 * ========================================================================
 */
import { inserir, selecionar, selecionarUm } from "../servidor/banco";
import {
  podePublicar,
  validarDefinicao,
  type Achado,
  type ContextoDeValidacao,
} from "../dominio/workflow";
import type { DefinicaoAutomacao } from "../dominio/tipos";

/* -------------------------------------------------------------------------- */
/* Ler                                                                        */
/* -------------------------------------------------------------------------- */

export type JornadaParaEditar = {
  automationId: string;
  nome: string;
  chave: string;
  status: string;
  modo: string;
  versao: number;
  definicao: DefinicaoAutomacao;
  /** O que o editor pode oferecer nos campos de escolha. */
  templatesDisponiveis: string[];
  etapasDisponiveis: string[];
  /**
   * Quantos pacientes estão no meio desta jornada AGORA.
   *
   * Vai para a tela porque muda o peso da decisão de publicar: editar com zero
   * pessoas dentro é experimentar; com quarenta, é mexer em algo em andamento —
   * e a pessoa merece saber disso ANTES, e não num aviso genérico depois.
   */
  emJornada: number;
};

export async function lerJornadaParaEditar(
  organizationId: string,
  automationId: string,
): Promise<JornadaParaEditar | null> {
  const automacao = await selecionarUm("crc_automations", {
    colunas: "id,chave,nome,status,modo,versao_ativa",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "eq", valor: automationId },
    ],
  });

  if (automacao === null) return null;

  const versao = typeof automacao["versao_ativa"] === "number" ? automacao["versao_ativa"] : 1;

  const [linhaVersao, templates, etapas, emJornada] = await Promise.all([
    selecionarUm("crc_automation_versions", {
      colunas: "definicao,versao",
      filtros: [
        { coluna: "automation_id", op: "eq", valor: automationId },
        { coluna: "versao", op: "eq", valor: versao },
      ],
    }),
    selecionar("crc_templates", {
      colunas: "chave",
      filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
      limite: 200,
    }),
    selecionar("crc_opportunity_stages", {
      colunas: "chave",
      filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
      limite: 100,
    }),
    selecionar("crc_automation_enrollments", {
      colunas: "id",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "automation_id", op: "eq", valor: automationId },
        { coluna: "status", op: "in", valor: ["ACTIVE", "WAITING"] },
      ],
      limite: 500,
    }),
  ]);

  const definicao = normalizar(linhaVersao?.["definicao"]);
  if (definicao === null) return null;

  return {
    automationId,
    chave: String(automacao["chave"] ?? ""),
    nome: String(automacao["nome"] ?? ""),
    status: String(automacao["status"] ?? "RASCUNHO"),
    modo: String(automacao["modo"] ?? "SHADOW"),
    versao,
    definicao,
    // `Set` porque a mesma chave aparece uma vez por VERSÃO do modelo, e uma
    // lista com "recall_seis_meses" três vezes é um seletor quebrado.
    templatesDisponiveis: [...new Set(templates.map((t) => String(t["chave"] ?? "")))].filter(
      (c) => c.length > 0,
    ),
    etapasDisponiveis: etapas.map((e) => String(e["chave"] ?? "")).filter((c) => c.length > 0),
    emJornada: emJornada.length,
  };
}

/**
 * Lê `jsonb` de forma defensiva.
 *
 * A COLUNA É `jsonb` SEM SCHEMA, e o comentário do `02-crc-schema.sql` diz por
 * quê: a forma muda conforme o builder evolui. O preço disso é que o que sai de
 * lá é `unknown` de verdade — pode ser uma definição de uma versão antiga do
 * formato, ou lixo de uma migração. Confiar e quebrar na tela seria trocar um
 * problema de dado por um erro de runtime na cara de quem estava editando.
 */
function normalizar(bruto: unknown): DefinicaoAutomacao | null {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return null;
  const d = bruto as Partial<DefinicaoAutomacao>;
  if (typeof d.gatilho !== "object" || d.gatilho === null) return null;

  return {
    gatilho: d.gatilho,
    condicoes: Array.isArray(d.condicoes) ? d.condicoes : [],
    passos: Array.isArray(d.passos) ? d.passos : [],
    saidas: Array.isArray(d.saidas) ? d.saidas : [],
  };
}

/* -------------------------------------------------------------------------- */
/* Publicar                                                                   */
/* -------------------------------------------------------------------------- */

export type ResultadoDaPublicacao =
  | { ok: true; versao: number }
  | {
      ok: false;
      codigo: "nao_encontrada" | "invalida" | "conflito";
      motivo: string;
      achados: Achado[];
    };

/**
 * Publica uma definição nova como a versão ativa.
 *
 * TRÊS COISAS ACONTECEM AQUI, e a ORDEM delas é o desenho:
 *
 *   1. VALIDA DE NOVO, no servidor. A tela já validou, e isso não conta: a tela
 *      é código que roda na máquina de quem usa, e a função de servidor aceita
 *      qualquer JSON. A validação da tela existe para dar retorno rápido; esta
 *      existe para ser verdade.
 *
 *   2. INSERE A VERSÃO. Ainda não é a ativa — é uma linha nova com número novo.
 *
 *   3. MOVE O PONTEIRO `versao_ativa`.
 *
 * A ORDEM 2→3 NÃO PODE INVERTER. Se o passo 3 falhar depois do 2, sobra uma
 * versão órfã: ninguém a usa, ninguém se machuca. Se o 3 acontecesse antes do
 * 2 e o 2 falhasse, `versao_ativa` apontaria para uma versão que não existe — e
 * o motor encerraria TODA jornada nova com `definicao_ausente`.
 *
 * Não há transação porque o PostgREST não expõe uma; o que existe é escolher a
 * ordem em que a falha é inofensiva.
 */
export async function publicarDefinicao(pedido: {
  organizationId: string;
  automationId: string;
  definicao: DefinicaoAutomacao;
  /** A versão que a pessoa estava editando. Ver o bloco de conflito abaixo. */
  versaoEsperada: number;
  userId?: string | null;
}): Promise<ResultadoDaPublicacao> {
  const atual = await lerJornadaParaEditar(pedido.organizationId, pedido.automationId);
  if (atual === null) {
    return {
      ok: false,
      codigo: "nao_encontrada",
      motivo: "Esta automação não existe nesta organização.",
      achados: [],
    };
  }

  /*
   * CONCORRÊNCIA OTIMISTA, e ela não é cerimônia: duas abas abertas na mesma
   * automação é o caso comum, não o raro — a pessoa abre uma para consultar e
   * esquece. Sem esta checagem, a segunda a salvar apaga em silêncio o trabalho
   * da primeira, e ninguém descobre porque a definição antiga não fica em
   * lugar nenhum visível.
   *
   * O `unique (automation_id, versao)` do banco pegaria a corrida simultânea;
   * ele NÃO pega esta, que é a de minutos de diferença — ali o número já teria
   * avançado e o insert passaria limpo.
   */
  if (atual.versao !== pedido.versaoEsperada) {
    return {
      ok: false,
      codigo: "conflito",
      motivo: `Alguém publicou a versão ${String(atual.versao)} enquanto você editava. Recarregue para ver o que mudou antes de salvar por cima.`,
      achados: [],
    };
  }

  const contexto: ContextoDeValidacao = {
    templatesDisponiveis: atual.templatesDisponiveis,
    etapasDisponiveis: atual.etapasDisponiveis,
  };

  const achados = validarDefinicao(pedido.definicao, contexto);
  if (!podePublicar(achados)) {
    return {
      ok: false,
      codigo: "invalida",
      motivo: "A jornada tem problemas que impedem publicar.",
      achados,
    };
  }

  const proxima = atual.versao + 1;

  try {
    await inserir("crc_automation_versions", {
      automation_id: pedido.automationId,
      versao: proxima,
      definicao: pedido.definicao,
      criado_por: pedido.userId ?? null,
    });
  } catch (erro) {
    // `unique (automation_id, versao)`: duas publicações no mesmo segundo. A
    // que perdeu não escreveu nada — mandar recarregar é honesto e suficiente.
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return {
      ok: false,
      codigo: "conflito",
      motivo: detalhe.toLowerCase().includes("unique")
        ? "Outra pessoa publicou neste instante. Recarregue e tente de novo."
        : `Não foi possível gravar a versão: ${detalhe.slice(0, 160)}`,
      achados: [],
    };
  }

  const { atualizar } = await import("../servidor/banco");
  await atualizar("crc_automations", [{ coluna: "id", op: "eq", valor: pedido.automationId }], {
    versao_ativa: proxima,
    atualizado_em: new Date().toISOString(),
  });

  return { ok: true, versao: proxima };
}

/**
 * Confere sem gravar.
 *
 * EXISTE PARA A TELA PODER PERGUNTAR AO SERVIDOR antes de publicar. A validação
 * do cliente é a mesma função pura, mas ela só conhece os modelos e etapas que
 * vieram no carregamento — e esses podem ter mudado desde então. Alguém apagou
 * um modelo em outra aba, e a jornada que referencia ele parece válida na tela
 * até o momento de salvar.
 */
export async function conferirDefinicao(
  organizationId: string,
  automationId: string,
  definicao: DefinicaoAutomacao,
): Promise<Achado[]> {
  const atual = await lerJornadaParaEditar(organizationId, automationId);
  if (atual === null) {
    return [
      {
        severidade: "erro",
        passo: null,
        mensagem: "Esta automação não existe nesta organização.",
        conserto: "Recarregue a lista de automações.",
      },
    ];
  }

  return validarDefinicao(definicao, {
    templatesDisponiveis: atual.templatesDisponiveis,
    etapasDisponiveis: atual.etapasDisponiveis,
  });
}
