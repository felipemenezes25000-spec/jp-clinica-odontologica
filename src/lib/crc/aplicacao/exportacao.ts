/**
 * Exportação em CSV — item 129.
 *
 * A SEGUNDA METADE DO ITEM É A QUE IMPORTA: "nunca expor mais dados que o
 * usuário pode visualizar". Um CSV que ignora RBAC é a forma mais fácil de
 * vazar exatamente o que a interface protege — e ninguém percebe, porque o
 * arquivo sai igual para todo mundo.
 *
 * Aqui isso aparece em dois lugares:
 *   - o filtro de clínica é o MESMO das telas, aplicado como filtro de consulta;
 *   - a coluna de valor só existe quando quem exporta tem `ver_financeiro`.
 *
 * O ARQUIVO É FEITO PARA O EXCEL EM PORTUGUÊS, e não para um parser:
 *   separador ";" — vírgula transformaria "1.500,00" em duas colunas;
 *   decimal com vírgula — é o que a planilha vai somar corretamente;
 *   BOM no começo — sem ele o Excel lê UTF-8 como Latin-1 e "João" vira "JoÃ£o".
 *
 * Esses três detalhes são a diferença entre um arquivo que a clínica usa e um
 * que ela abre, vê embaralhado e descarta.
 */
import {
  ROTULO_SITUACAO,
  ROTULO_STATUS_TAREFA,
  ROTULO_TIPO_OPORTUNIDADE,
  ROTULO_TIPO_TAREFA,
} from "../dominio/rotulos";
import { telefoneParaTela } from "../dominio/telefone";
import { selecionar, type Filtro, type Linha } from "../servidor/banco";
import { linhaParaOportunidade, linhaParaPaciente, linhaParaTarefa } from "./repositorios";

/** U+FEFF. Sem ele o Excel lê o arquivo como Latin-1 e quebra todo acento. */
const BOM = String.fromCharCode(0xfeff);

const LIMITE = 5000;

export type EscopoExportacao = "pacientes" | "oportunidades" | "tarefas";

export type ResultadoExportacao = { nomeArquivo: string; conteudo: string; linhas: number };

/**
 * Escapa um campo para CSV.
 *
 * Aspas duplas viram duas; qualquer campo com separador, aspas ou quebra de
 * linha é envolvido. Sem isso, um nome como `Silva; Maria` ou uma nota com
 * quebra de linha desalinha todas as colunas seguintes — e o erro passa
 * despercebido porque a planilha continua abrindo.
 */
function campo(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  if (/[;"\n\r]/u.test(texto)) return `"${texto.replace(/"/gu, '""')}"`;
  return texto;
}

/** `1234.56` → `1234,56`, que é o que a planilha em pt-BR soma. */
function decimal(valor: string | null): string {
  if (valor === null || valor.length === 0) return "";
  return valor.replace(".", ",");
}

/** ISO → `08/09/2026`, no fuso da clínica. */
function data(iso: string | null): string {
  if (iso === null || iso.length === 0) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function montar(cabecalhos: readonly string[], linhas: readonly (readonly string[])[]): string {
  const corpo = [cabecalhos, ...linhas].map((l) => l.map(campo).join(";")).join("\r\n");
  // `\r\n` porque é o que o Excel espera; BOM porque é o que faz o acento
  // sobreviver.
  return BOM + corpo + "\r\n";
}

function carimbo(): string {
  return new Date().toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */

export async function montarCsvDeExportacao(
  organizationId: string,
  clinicIds: readonly string[],
  escopo: EscopoExportacao,
  podeVerFinanceiro: boolean,
): Promise<ResultadoExportacao> {
  // O escopo de clínica entra como FILTRO de consulta, nunca como conferência
  // depois de ler — item 71. Ler tudo e filtrar em memória vazaria contagem e
  // deixaria a porta aberta para um `slice` esquecido.
  const daOrganizacao: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    ...(clinicIds.length > 0
      ? [{ coluna: "clinic_id", op: "in" as const, valor: [...clinicIds] }]
      : []),
  ];

  switch (escopo) {
    case "pacientes":
      return exportarPacientes(daOrganizacao);
    case "oportunidades":
      return exportarOportunidades(organizationId, daOrganizacao, podeVerFinanceiro);
    case "tarefas":
      return exportarTarefas(daOrganizacao);
    default: {
      const exaustivo: never = escopo;
      void exaustivo;
      throw new Error("Escopo desconhecido.");
    }
  }
}

async function exportarPacientes(filtros: Filtro[]): Promise<ResultadoExportacao> {
  const linhas = await selecionar("crc_patients", {
    filtros: [...filtros, { coluna: "arquivado", op: "eq", valor: false }],
    ordenar: [{ coluna: "nome", ascendente: true }],
    limite: LIMITE,
  });

  const dados = linhas.map(linhaParaPaciente).map((p) => [
    p.nome,
    telefoneParaTela(p.telefone),
    p.email ?? "",
    ROTULO_SITUACAO[p.situacao],
    p.especialidade ?? "",
    data(p.ultimaConsultaEm),
    data(p.proximaConsultaEm),
    // O opt-out vai como coluna explícita: quem exporta para fazer campanha
    // precisa enxergar quem NÃO pode ser contatado antes de subir a lista em
    // qualquer lugar.
    p.optOutEm === null ? "Não" : "Sim",
  ]);

  return {
    nomeArquivo: `pacientes-${carimbo()}.csv`,
    conteudo: montar(
      [
        "Paciente",
        "Telefone",
        "E-mail",
        "Situação",
        "Especialidade",
        "Última consulta",
        "Próxima consulta",
        "Pediu para não receber mensagens",
      ],
      dados,
    ),
    linhas: dados.length,
  };
}

async function exportarOportunidades(
  organizationId: string,
  filtros: Filtro[],
  podeVerFinanceiro: boolean,
): Promise<ResultadoExportacao> {
  const linhas = await selecionar("crc_opportunities", {
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: LIMITE,
  });

  const oportunidades = linhas.map(linhaParaOportunidade);

  const nomes = await carregarNomes(
    organizationId,
    oportunidades.map((o) => o.patientId).filter((p): p is string => p !== null),
  );

  const cabecalhos = [
    "Paciente",
    "Tipo",
    "Motivo",
    "Prioridade",
    "Origem",
    "Próxima ação",
    "Criada em",
    "Fechada em",
    "Motivo da perda",
  ];

  const dados = oportunidades.map((o) => {
    const base = [
      (o.patientId === null ? null : nomes.get(o.patientId)) ?? "—",
      ROTULO_TIPO_OPORTUNIDADE[o.tipo],
      o.motivo ?? "",
      String(o.priorityScore),
      o.origem ?? "",
      o.nextAction ?? "",
      data(o.criadoEm),
      data(o.fechadaEm),
      o.lostReason ?? "",
    ];
    // Item 229: valor de orçamento é permissão separada. A coluna não é
    // esvaziada — ela NÃO EXISTE para quem não pode vê-la, porque uma coluna
    // vazia ainda conta quantas oportunidades têm valor.
    return podeVerFinanceiro ? [...base, decimal(o.potentialValue)] : base;
  });

  return {
    nomeArquivo: `oportunidades-${carimbo()}.csv`,
    conteudo: montar(podeVerFinanceiro ? [...cabecalhos, "Valor potencial"] : cabecalhos, dados),
    linhas: dados.length,
  };
}

async function exportarTarefas(filtros: Filtro[]): Promise<ResultadoExportacao> {
  const linhas = await selecionar("crc_tasks", {
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: LIMITE,
  });

  const dados = linhas
    .map(linhaParaTarefa)
    .map((t) => [
      t.titulo,
      ROTULO_TIPO_TAREFA[t.tipo],
      ROTULO_STATUS_TAREFA[t.status],
      data(t.dueAt),
      data(t.criadoEm),
      data(t.concluidaEm),
      t.motivo ?? "",
    ]);

  return {
    nomeArquivo: `tarefas-${carimbo()}.csv`,
    conteudo: montar(
      ["Tarefa", "Tipo", "Situação", "Prazo", "Criada em", "Concluída em", "Motivo"],
      dados,
    ),
    linhas: dados.length,
  };
}

async function carregarNomes(
  organizationId: string,
  patientIds: readonly string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicos = [...new Set(patientIds)];
  if (unicos.length === 0) return mapa;

  // Em lotes: um `in` com 5.000 ids produz uma URL que o PostgREST recusa por
  // tamanho, e o sintoma seria a exportação falhar só quando a base cresce.
  const TAMANHO_LOTE = 200;
  for (let i = 0; i < unicos.length; i += TAMANHO_LOTE) {
    const lote = unicos.slice(i, i + TAMANHO_LOTE);
    const linhas: Linha[] = await selecionar("crc_patients", {
      colunas: "id,nome",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "id", op: "in", valor: lote },
      ],
      limite: lote.length,
    });
    for (const l of linhas) mapa.set(String(l["id"] ?? ""), String(l["nome"] ?? ""));
  }

  return mapa;
}
