/**
 * Orçamentos — Milestone 8, itens 54 a 58 e 189 a 190.
 *
 * O PROBLEMA QUE ESTE MÓDULO RESOLVE
 * A API pública do Dental Office não expõe orçamento. Sem valor, o CRC sabe
 * QUEM precisa de contato mas não sabe QUANTO está em jogo — e "R$ 4.800
 * parados há 23 dias" é o que faz alguém ligar hoje em vez de amanhã.
 *
 * A SAÍDA É PROVIDER ABSTRACTION (item 6 do Mega Prompt): o domínio fala com
 * `ProvedorOrcamento`. Hoje o único é CSV. No dia em que a API privada existir,
 * ela vira mais um provider e nada mais muda.
 *
 * DUAS REGRAS QUE NÃO PODEM SER QUEBRADAS:
 *
 *   NUNCA IMPORTAR SEM PREVIEW (item 189). O importador tem duas fases: uma que
 *   lê e NÃO grava nada, e outra que grava o que a pessoa aprovou. Um CSV com a
 *   coluna errada não pode entrar no banco para depois ser descoberto.
 *
 *   DEDUPLICAR POR FINGERPRINT (item 55). Sem ID externo, a chave é derivada do
 *   conteúdo. Importar a mesma planilha duas vezes — o que acontece, porque
 *   ninguém lembra se já importou — não pode dobrar o valor do funil.
 */
import { lerCsv, lerData, lerDinheiro, valorDaColuna, type LinhaCsv } from "../dominio/csv";
import { orcamentoElegivelParaRecuperacao } from "../dominio/regras";
import { CONFIGURACAO_PADRAO, type ConfiguracaoCrc } from "../dominio/configuracao";
import { normalizarTelefone, variacoesDeTelefone } from "../dominio/telefone";
import { somarDinheiro } from "../dominio/formatar";
import {
  atualizar,
  gravar,
  inserir,
  selecionar,
  selecionarUm,
  type Linha,
} from "../servidor/banco";
import { auditar, descreverErro, registrar } from "../servidor/registro";

import { criarOportunidade } from "./oportunidades";

/* -------------------------------------------------------------------------- */
/* A porta                                                                    */
/* -------------------------------------------------------------------------- */

export type StatusOrcamento =
  "OPEN" | "PARTIALLY_APPROVED" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED" | "UNKNOWN";

export type OrcamentoExterno = {
  /** ID no sistema de origem, quando existe. */
  externalId: string | null;
  /** Como o arquivo identifica o paciente. Resolvido depois. */
  pacienteExternoId: string | null;
  pacienteNome: string | null;
  pacienteTelefone: string | null;
  totalValue: string;
  approvedValue: string | null;
  status: StatusOrcamento;
  emitidoEm: string | null;
  expiraEm: string | null;
  descricao: string | null;
};

/**
 * O contrato do item 6 do Mega Prompt.
 *
 * `listar` devolve tudo que a fonte tem; quem chama decide o que fazer. O CSV
 * já vem inteiro na memória, mas a assinatura é assíncrona de propósito: uma
 * API paginada vai precisar disso, e mudar a assinatura depois obrigaria a
 * mexer no importador.
 */
export type ProvedorOrcamento = {
  readonly nome: "csv" | "dental_office" | "manual";
  listar(): Promise<{ itens: OrcamentoExterno[]; falhas: FalhaLinha[] }>;
};

export type FalhaLinha = { linha: number; erro: string; conteudo: string };

/* -------------------------------------------------------------------------- */
/* Normalização de status                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O status como a clínica escreve → o nosso.
 *
 * Item 57. A lista é generosa porque o arquivo vem do sistema deles, e cada
 * um escreve de um jeito. O desconhecido vira `UNKNOWN`, e `UNKNOWN` NÃO entra
 * em recuperação — não é o mesmo que `OPEN`, e tratar como aberto mandaria
 * mensagem sobre um orçamento que já foi aprovado.
 */
const STATUS_POR_TEXTO: Readonly<Record<string, StatusOrcamento>> = {
  aberto: "OPEN",
  aberta: "OPEN",
  pendente: "OPEN",
  emaberto: "OPEN",
  aguardando: "OPEN",
  open: "OPEN",
  parcial: "PARTIALLY_APPROVED",
  parcialmenteaprovado: "PARTIALLY_APPROVED",
  aprovadoparcialmente: "PARTIALLY_APPROVED",
  aprovado: "APPROVED",
  aprovada: "APPROVED",
  fechado: "APPROVED",
  aceito: "APPROVED",
  approved: "APPROVED",
  recusado: "REJECTED",
  recusada: "REJECTED",
  negado: "REJECTED",
  reprovado: "REJECTED",
  rejected: "REJECTED",
  expirado: "EXPIRED",
  expirada: "EXPIRED",
  vencido: "EXPIRED",
  cancelado: "CANCELLED",
  cancelada: "CANCELLED",
};

export function statusDeTexto(bruto: string | null): StatusOrcamento {
  if (bruto === null) return "UNKNOWN";
  const chave = bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/gu, "");
  return STATUS_POR_TEXTO[chave] ?? "UNKNOWN";
}

/* -------------------------------------------------------------------------- */
/* Fingerprint (item 55)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A identidade do orçamento quando não há ID externo.
 *
 * ESCOLHA DOS CAMPOS: paciente + valor total + data de emissão. É o mínimo que
 * distingue dois orçamentos reais do mesmo paciente, e é ESTÁVEL — não inclui
 * status nem valor aprovado, que MUDAM entre uma exportação e outra. Incluí-los
 * faria a mesma planilha reimportada criar orçamentos novos toda vez que
 * alguém aprovasse um item.
 *
 * Determinístico de propósito: a mesma linha sempre produz a mesma chave, em
 * qualquer máquina e em qualquer ordem de importação.
 */
export function fingerprintDeOrcamento(o: OrcamentoExterno): string {
  if (o.externalId !== null && o.externalId.length > 0) return `id:${o.externalId}`;

  const paciente = o.pacienteExternoId ?? o.pacienteTelefone ?? o.pacienteNome ?? "sem-paciente";
  const data = o.emitidoEm ?? "sem-data";
  return `fp:${paciente.toLowerCase().trim()}|${o.totalValue}|${data}`;
}

/* -------------------------------------------------------------------------- */
/* Provider CSV                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Lê orçamentos de um CSV exportado do sistema da clínica.
 *
 * Os nomes de coluna aceitos são generosos (ver `valorDaColuna`) porque o
 * arquivo vem do sistema deles: exigir renomear coluna antes de importar é o
 * tipo de exigência que faz alguém desistir e voltar para a planilha.
 */
export function provedorCsv(conteudo: string): ProvedorOrcamento {
  return {
    nome: "csv",
    listar: () => Promise.resolve(lerOrcamentosDeCsv(conteudo)),
  };
}

export function lerOrcamentosDeCsv(conteudo: string): {
  itens: OrcamentoExterno[];
  falhas: FalhaLinha[];
} {
  const csv = lerCsv(conteudo);
  const itens: OrcamentoExterno[] = [];
  const falhas: FalhaLinha[] = [];

  csv.linhas.forEach((linha, indice) => {
    // +2: a linha 1 é o cabeçalho, e a contagem que a pessoa vê no Excel
    // começa em 1. Sem isso, "erro na linha 7" aponta para a linha errada e
    // quem for corrigir procura no lugar errado.
    const numero = indice + 2;
    const resultado = mapearLinha(linha);

    if (resultado.ok) itens.push(resultado.valor);
    else falhas.push({ linha: numero, erro: resultado.erro, conteudo: resumirLinha(linha) });
  });

  return { itens, falhas };
}

function resumirLinha(linha: LinhaCsv): string {
  return Object.values(linha)
    .filter((v) => v.length > 0)
    .join(" · ")
    .slice(0, 120);
}

function mapearLinha(
  linha: LinhaCsv,
): { ok: true; valor: OrcamentoExterno } | { ok: false; erro: string } {
  const totalBruto = valorDaColuna(
    linha,
    "valor total",
    "valor",
    "total",
    "vlr total",
    "valor_total",
    "vlrtotal",
  );
  const total = lerDinheiro(totalBruto);

  if (total === null) {
    return {
      ok: false,
      erro:
        totalBruto === null
          ? "Não encontrei a coluna de valor (aceito: Valor, Valor Total, Total)."
          : `O valor "${totalBruto}" não é um número reconhecível.`,
    };
  }
  if (Number.parseFloat(total) <= 0) {
    // Valor zero ou negativo não é orçamento: costuma ser linha de rodapé ou
    // estorno, e entraria no funil inflando a contagem sem valor nenhum.
    return { ok: false, erro: `Valor não positivo (${total}).` };
  }

  const nome = valorDaColuna(
    linha,
    "paciente",
    "nome",
    "cliente",
    "nome do paciente",
    "nome paciente",
  );
  const telefoneBruto = valorDaColuna(linha, "telefone", "celular", "whatsapp", "fone", "contato");
  const externoPaciente = valorDaColuna(
    linha,
    "codigo paciente",
    "id paciente",
    "codigo",
    "matricula",
    "cod paciente",
  );

  if (nome === null && telefoneBruto === null && externoPaciente === null) {
    return {
      ok: false,
      erro: "A linha não identifica o paciente (aceito: Paciente, Telefone ou Código).",
    };
  }

  return {
    ok: true,
    valor: {
      externalId: valorDaColuna(linha, "id orcamento", "codigo orcamento", "orcamento", "id"),
      pacienteExternoId: externoPaciente,
      pacienteNome: nome,
      pacienteTelefone: normalizarTelefone(telefoneBruto),
      totalValue: total,
      approvedValue: lerDinheiro(
        valorDaColuna(linha, "valor aprovado", "aprovado", "valor fechado"),
      ),
      status: statusDeTexto(valorDaColuna(linha, "status", "situacao", "situação", "estado")),
      emitidoEm: lerData(
        valorDaColuna(linha, "data", "emissao", "emissão", "data emissao", "criado em"),
      ),
      expiraEm: lerData(valorDaColuna(linha, "validade", "expira", "vencimento", "valido ate")),
      descricao: valorDaColuna(linha, "descricao", "descrição", "procedimento", "tratamento"),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Preview (item 189)                                                         */
/* -------------------------------------------------------------------------- */

export type LinhaPreview = {
  fingerprint: string;
  paciente: string;
  patientId: string | null;
  /** Por que o paciente não foi encontrado, quando não foi. */
  avisoPaciente: string | null;
  totalValue: string;
  status: StatusOrcamento;
  emitidoEm: string | null;
  /** Já existe no banco com este fingerprint. */
  jaExiste: boolean;
};

export type Preview = {
  validos: LinhaPreview[];
  falhas: FalhaLinha[];
  resumo: {
    total: number;
    novos: number;
    atualizados: number;
    semPaciente: number;
    comErro: number;
    valorTotal: string;
  };
};

/**
 * Lê o arquivo e diz o que ACONTECERIA. Não grava nada.
 *
 * O item 189 pede exatamente isto: "1.523 registros válidos, 41 avisos, 7
 * erros". A separação entre "aviso" e "erro" importa: linha sem paciente
 * encontrado ainda entra (o orçamento existe, só não sabemos de quem), linha
 * sem valor não entra de jeito nenhum.
 */
export async function gerarPreview(
  organizationId: string,
  provedor: ProvedorOrcamento,
): Promise<Preview> {
  const { itens, falhas } = await provedor.listar();

  const validos: LinhaPreview[] = [];
  let novos = 0;
  let atualizados = 0;
  let semPaciente = 0;

  for (const item of itens) {
    const fingerprint = fingerprintDeOrcamento(item);
    const resolucao = await resolverPaciente(organizationId, item);

    const existente = await selecionarUm("crc_budgets", {
      colunas: "id",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "fingerprint", op: "eq", valor: fingerprint },
      ],
    });

    if (existente === null) novos += 1;
    else atualizados += 1;
    if (resolucao.patientId === null) semPaciente += 1;

    validos.push({
      fingerprint,
      paciente: item.pacienteNome ?? item.pacienteTelefone ?? item.pacienteExternoId ?? "—",
      patientId: resolucao.patientId,
      avisoPaciente: resolucao.aviso,
      totalValue: item.totalValue,
      status: item.status,
      emitidoEm: item.emitidoEm,
      jaExiste: existente !== null,
    });
  }

  return {
    validos,
    falhas,
    resumo: {
      total: itens.length + falhas.length,
      novos,
      atualizados,
      semPaciente,
      comErro: falhas.length,
      valorTotal: somarDinheiro(validos.map((v) => v.totalValue)),
    },
  };
}

/**
 * Acha o paciente por código externo, telefone ou nome — nessa ordem.
 *
 * O NOME É O ÚLTIMO E O MAIS FRACO, e por isso ele só resolve quando há
 * exatamente UMA correspondência exata. Duas "Maria Silva" na base é comum, e
 * escolher uma pelo primeiro resultado ligaria o orçamento de uma ao prontuário
 * comercial da outra. Item 167, aplicado a orçamento.
 */
async function resolverPaciente(
  organizationId: string,
  item: OrcamentoExterno,
): Promise<{ patientId: string | null; aviso: string | null }> {
  if (item.pacienteExternoId !== null) {
    const porCodigo = await selecionarUm("crc_patients", {
      colunas: "id",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "external_id", op: "eq", valor: item.pacienteExternoId },
      ],
    });
    if (porCodigo !== null) return { patientId: String(porCodigo["id"] ?? ""), aviso: null };
  }

  if (item.pacienteTelefone !== null) {
    const variacoes = variacoesDeTelefone(item.pacienteTelefone);
    const porTelefone = await selecionar("crc_patients", {
      colunas: "id",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "telefone", op: "in", valor: variacoes },
      ],
      limite: 3,
    });
    if (porTelefone.length === 1) {
      return { patientId: String(porTelefone[0]?.["id"] ?? ""), aviso: null };
    }
    if (porTelefone.length > 1) {
      return { patientId: null, aviso: "Este telefone está em mais de um paciente." };
    }
  }

  if (item.pacienteNome !== null) {
    const porNome = await selecionar("crc_patients", {
      colunas: "id,nome",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "nome", op: "ilike", valor: item.pacienteNome },
      ],
      limite: 3,
    });
    if (porNome.length === 1) return { patientId: String(porNome[0]?.["id"] ?? ""), aviso: null };
    if (porNome.length > 1) {
      return { patientId: null, aviso: "Mais de um paciente com este nome." };
    }
  }

  return { patientId: null, aviso: "Paciente não encontrado na base." };
}

/* -------------------------------------------------------------------------- */
/* Importação                                                                 */
/* -------------------------------------------------------------------------- */

export type ResultadoImportacao = {
  criados: number;
  atualizados: number;
  falhados: number;
  semPaciente: number;
  falhas: FalhaLinha[];
};

/**
 * Grava o que o preview mostrou.
 *
 * O upsert por `fingerprint` é o item 55 em execução: reimportar a mesma
 * planilha ATUALIZA, nunca duplica. E o que atualiza é status e valor
 * aprovado — os campos que mudam de verdade entre exportações.
 */
export async function importar(
  organizationId: string,
  clinicId: string,
  provedor: ProvedorOrcamento,
  userId: string | null,
): Promise<ResultadoImportacao> {
  const { itens, falhas } = await provedor.listar();

  let criados = 0;
  let atualizados = 0;
  let falhados = 0;
  let semPaciente = 0;

  for (const item of itens) {
    try {
      const fingerprint = fingerprintDeOrcamento(item);
      const { patientId } = await resolverPaciente(organizationId, item);
      if (patientId === null) semPaciente += 1;

      const existente = await selecionarUm("crc_budgets", {
        colunas: "id",
        filtros: [
          { coluna: "organization_id", op: "eq", valor: organizationId },
          { coluna: "fingerprint", op: "eq", valor: fingerprint },
        ],
      });

      const linhas = await gravar(
        "crc_budgets",
        {
          organization_id: organizationId,
          clinic_id: clinicId,
          patient_id: patientId,
          provider: provedor.nome === "csv" ? "CSV_IMPORT" : "DENTAL_OFFICE_API",
          external_id: item.externalId,
          fingerprint,
          total_value: item.totalValue,
          approved_value: item.approvedValue,
          status: item.status,
          emitido_em: item.emitidoEm,
          expira_em: item.expiraEm,
          atualizado_em: new Date().toISOString(),
        },
        "organization_id,fingerprint",
      );

      if (existente === null) criados += 1;
      else atualizados += 1;

      const budgetId = String(linhas[0]?.["id"] ?? existente?.["id"] ?? "");
      if (budgetId.length > 0 && item.descricao !== null && existente === null) {
        await inserir("crc_budget_items", {
          budget_id: budgetId,
          descricao: item.descricao,
          quantidade: 1,
          valor_unitario: item.totalValue,
          valor_total: item.totalValue,
        });
      }
    } catch (erro) {
      // Uma linha que estoura não derruba a importação inteira — item 16
      // aplicado ao importador.
      falhados += 1;
      falhas.push({ linha: 0, erro: descreverErro(erro), conteudo: item.pacienteNome ?? "" });
    }
  }

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "orcamentos.importados",
    entityType: "budget",
    entityId: null,
    depois: { criados, atualizados, falhados, semPaciente, provedor: provedor.nome },
  });

  registrar("info", "Importação de orçamentos concluída.", {
    organizationId,
    criados,
    atualizados,
    falhados,
  });

  return { criados, atualizados, falhados, semPaciente, falhas };
}

/* -------------------------------------------------------------------------- */
/* Recuperação (item 58)                                                      */
/* -------------------------------------------------------------------------- */

export type ResultadoVarreduraOrcamento = {
  avaliados: number;
  elegiveis: number;
  oportunidadesCriadas: number;
};

/**
 * Transforma orçamento parado em oportunidade.
 *
 * A REGRA VEM DO DOMÍNIO (`orcamentoElegivelParaRecuperacao`), testada sem
 * banco. Aqui só se carrega o que ela precisa saber.
 *
 * O VALOR VAI JUNTO na oportunidade, e é isso que muda a operação: a fila do
 * dia passa a ordenar por dinheiro real, não por suposição. É também o que
 * tira o "R$ 0,00" do KPI de valor potencial da Home.
 */
export async function varrerOrcamentosParados(
  organizationId: string,
  cfg: ConfiguracaoCrc = CONFIGURACAO_PADRAO,
  limite = 200,
  agora = new Date(),
): Promise<ResultadoVarreduraOrcamento> {
  const linhas = await selecionar("crc_budgets", {
    colunas: "id,clinic_id,patient_id,total_value,status,emitido_em,expira_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "in", valor: ["OPEN", "PARTIALLY_APPROVED"] },
      { coluna: "patient_id", op: "not.is", valor: null },
    ],
    ordenar: [{ coluna: "total_value", ascendente: false }],
    limite,
  });

  let elegiveis = 0;
  let criadas = 0;

  for (const linha of linhas) {
    const patientId = String(linha["patient_id"] ?? "");
    if (patientId.length === 0) continue;

    const paciente = await selecionarUm("crc_patients", {
      colunas: "opt_out_em,proxima_consulta_em,clinic_id",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "id", op: "eq", valor: patientId },
      ],
    });
    if (paciente === null) continue;

    const proxima = paciente["proxima_consulta_em"];
    const elegivel = orcamentoElegivelParaRecuperacao(
      {
        status: String(linha["status"] ?? "UNKNOWN"),
        emitidoEm: typeof linha["emitido_em"] === "string" ? linha["emitido_em"] : null,
        expiraEm: typeof linha["expira_em"] === "string" ? linha["expira_em"] : null,
        temConsultaFutura:
          typeof proxima === "string" && Date.parse(proxima) >= agora.getTime() - 2 * 3_600_000,
        optOut: typeof paciente["opt_out_em"] === "string",
      },
      agora,
      cfg,
    );

    if (!elegivel) continue;
    elegiveis += 1;

    const budgetId = String(linha["id"] ?? "");
    const resultado = await criarOportunidade({
      organizationId,
      clinicId: String(linha["clinic_id"] ?? paciente["clinic_id"] ?? ""),
      patientId,
      tipo: "BUDGET_RECOVERY",
      motivo: "Orçamento aberto e sem retorno.",
      // Por ORÇAMENTO, e não por paciente: quem tem dois orçamentos parados
      // tem duas conversas diferentes para ter.
      chaveDedupe: `BUDGET_RECOVERY:${budgetId}`,
      potentialValue: typeof linha["total_value"] === "string" ? linha["total_value"] : null,
      ator: "automacao",
    });

    if (resultado.criada) criadas += 1;
  }

  return { avaliados: linhas.length, elegiveis, oportunidadesCriadas: criadas };
}

/* -------------------------------------------------------------------------- */
/* Leitura para as telas                                                      */
/* -------------------------------------------------------------------------- */

export async function listarOrcamentosDoPaciente(
  organizationId: string,
  patientId: string,
): Promise<Linha[]> {
  return selecionar("crc_budgets", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
    ],
    ordenar: [{ coluna: "emitido_em", ascendente: false, nullsPrimeiro: false }],
    limite: 20,
  });
}

/** Marca o orçamento como aprovado — a ponta que gera receita confirmada. */
export async function registrarAprovacao(
  organizationId: string,
  budgetId: string,
  valorAprovado: string,
  userId: string | null,
): Promise<void> {
  const agora = new Date().toISOString();

  const linhas = await atualizar(
    "crc_budgets",
    [
      { coluna: "id", op: "eq", valor: budgetId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "APPROVED", approved_value: valorAprovado, atualizado_em: agora },
  );

  const orcamento = linhas[0];
  if (orcamento === undefined) return;

  // ITEM 61 E 62: receita CONFIRMADA, e não potencial. Ela só nasce aqui —
  // quando um humano registra que o orçamento foi aprovado — e nunca a partir
  // de suposição do sistema.
  await inserir("crc_revenue_events", {
    organization_id: organizationId,
    clinic_id: String(orcamento["clinic_id"] ?? ""),
    patient_id: orcamento["patient_id"],
    natureza: "CONFIRMADA",
    valor: valorAprovado,
    motivo: "Orçamento aprovado.",
    recuperada: true,
    ocorrido_em: agora,
    chave_dedupe: `orcamento_aprovado:${budgetId}`,
  });

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "orcamento.aprovado",
    entityType: "budget",
    entityId: budgetId,
    depois: { valorAprovado },
  });
}
