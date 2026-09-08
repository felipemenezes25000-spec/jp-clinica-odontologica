/**
 * Cobrança de pacientes inadimplentes.
 *
 * A REGRA MORA NO DOMÍNIO (`dominio/cobranca.ts`), testada sem banco. Aqui só
 * se carrega o que ela precisa saber e se executa o que ela autorizou.
 *
 * O QUE ESTE ARQUIVO ACRESCENTA À REGRA:
 *
 *   IMPORTAÇÃO. O financeiro do Dental Office não é exposto pela API pública,
 *   então a origem é CSV — mesma escolha dos orçamentos, mesmo provider
 *   abstraction, mesma exigência de preview antes de gravar (item 189).
 *
 *   VARREDURA. Uma vez por dia, transforma parcela vencida em oportunidade.
 *
 *   RESPOSTA DO PACIENTE. É aqui que "já paguei" e "consigo parcelar?" param a
 *   automação NA HORA, sem esperar a próxima importação do financeiro.
 *
 * O QUE ELE DELIBERADAMENTE NÃO FAZ: mandar mensagem. Isso é do motor de
 * automação, que já aplica horário comercial, opt-out e limites globais. Ter um
 * caminho de envio próprio para cobrança seria criar uma porta que escapa de
 * todas essas travas.
 */
import {
  MAX_CONTATOS_COBRANCA,
  afirmaQueJaPagou,
  faseDaCobranca,
  pedeNegociacao,
  podeCobrar,
  saldoDevedor,
  type ContextoCobranca,
  type StatusCobranca,
} from "../dominio/cobranca";
import { lerCsv, lerData, lerDinheiro, valorDaColuna, type LinhaCsv } from "../dominio/csv";
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
import { criarTarefa } from "./tarefas";

/* -------------------------------------------------------------------------- */
/* Leitura do CSV                                                             */
/* -------------------------------------------------------------------------- */

export type CobrancaExterna = {
  externalId: string | null;
  pacienteExternoId: string | null;
  pacienteNome: string | null;
  pacienteTelefone: string | null;
  valor: string;
  valorPago: string;
  vencimentoEm: string;
  parcela: number | null;
  totalParcelas: number | null;
  status: StatusCobranca;
  descricao: string | null;
};

export type FalhaLinha = { linha: number; erro: string; conteudo: string };

const STATUS_POR_TEXTO: Readonly<Record<string, StatusCobranca>> = {
  aberta: "ABERTA",
  aberto: "ABERTA",
  pendente: "ABERTA",
  emaberto: "ABERTA",
  vencida: "ABERTA",
  vencido: "ABERTA",
  atrasada: "ABERTA",
  paga: "PAGA",
  pago: "PAGA",
  quitada: "PAGA",
  quitado: "PAGA",
  liquidada: "PAGA",
  parcial: "PARCIAL",
  parcialmentepaga: "PARCIAL",
  renegociada: "RENEGOCIADA",
  acordo: "RENEGOCIADA",
  cancelada: "CANCELADA",
  cancelado: "CANCELADA",
  estornada: "CANCELADA",
  incobravel: "INCOBRAVEL",
  perdida: "INCOBRAVEL",
};

export function statusDeTexto(bruto: string | null): StatusCobranca {
  if (bruto === null) return "ABERTA";
  const chave = bruto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/gu, "");
  // O PADRÃO É "ABERTA", e não "desconhecida": quem exporta uma planilha de
  // contas a receber está exportando o que está em aberto. Um status estranho
  // não pode fazer a parcela sumir da cobrança — ela some da conferência
  // humana, que é onde alguém notaria.
  return STATUS_POR_TEXTO[chave] ?? "ABERTA";
}

/**
 * A identidade da parcela quando não há ID externo.
 *
 * Paciente + vencimento + valor. Estável entre exportações — NÃO inclui status
 * nem valor pago, que são justamente os campos que mudam quando alguém paga.
 * Incluí-los faria a mesma planilha reimportada criar parcelas novas toda vez
 * que uma fosse quitada.
 */
export function fingerprintDeCobranca(c: CobrancaExterna): string {
  if (c.externalId !== null && c.externalId.length > 0) return `id:${c.externalId}`;
  const paciente = c.pacienteExternoId ?? c.pacienteTelefone ?? c.pacienteNome ?? "sem-paciente";
  return `fp:${paciente.toLowerCase().trim()}|${c.vencimentoEm}|${c.valor}`;
}

export function lerCobrancasDeCsv(conteudo: string): {
  itens: CobrancaExterna[];
  falhas: FalhaLinha[];
} {
  const csv = lerCsv(conteudo);
  const itens: CobrancaExterna[] = [];
  const falhas: FalhaLinha[] = [];

  csv.linhas.forEach((linha, indice) => {
    // +2: a linha 1 é o cabeçalho, e a contagem que a pessoa vê no Excel começa
    // em 1. Sem isso, "erro na linha 7" aponta para a linha errada.
    const numero = indice + 2;
    const r = mapearLinha(linha);
    if (r.ok) itens.push(r.valor);
    else falhas.push({ linha: numero, erro: r.erro, conteudo: resumir(linha) });
  });

  return { itens, falhas };
}

function resumir(linha: LinhaCsv): string {
  return Object.values(linha)
    .filter((v) => v.length > 0)
    .join(" · ")
    .slice(0, 120);
}

function mapearLinha(
  linha: LinhaCsv,
): { ok: true; valor: CobrancaExterna } | { ok: false; erro: string } {
  const valorBruto = valorDaColuna(linha, "valor", "valor parcela", "valor total", "vlr", "total");
  const valor = lerDinheiro(valorBruto);
  if (valor === null) {
    return {
      ok: false,
      erro:
        valorBruto === null
          ? "Não encontrei a coluna de valor (aceito: Valor, Valor Parcela, Total)."
          : `O valor "${valorBruto}" não é um número reconhecível.`,
    };
  }
  if (Number.parseFloat(valor) <= 0) {
    return { ok: false, erro: `Valor não positivo (${valor}).` };
  }

  const vencimento = lerData(
    valorDaColuna(linha, "vencimento", "data vencimento", "vence em", "data", "vencto"),
  );
  if (vencimento === null) {
    // SEM VENCIMENTO NÃO HÁ COBRANÇA. É este campo que decide a fase, e a fase
    // decide o tom da mensagem — chutar aqui manda o texto errado para alguém.
    return { ok: false, erro: "Não encontrei uma data de vencimento reconhecível." };
  }

  const nome = valorDaColuna(linha, "paciente", "nome", "cliente", "nome do paciente");
  const telefone = valorDaColuna(linha, "telefone", "celular", "whatsapp", "fone");
  const externoPaciente = valorDaColuna(
    linha,
    "codigo paciente",
    "id paciente",
    "codigo",
    "matricula",
  );

  if (nome === null && telefone === null && externoPaciente === null) {
    return { ok: false, erro: "A linha não identifica o paciente." };
  }

  const parcelaBruta = valorDaColuna(linha, "parcela", "n parcela", "numero parcela");
  const totalBruto = valorDaColuna(linha, "total parcelas", "parcelas", "qtd parcelas");

  return {
    ok: true,
    valor: {
      externalId: valorDaColuna(linha, "id", "id parcela", "codigo lancamento", "documento"),
      pacienteExternoId: externoPaciente,
      pacienteNome: nome,
      pacienteTelefone: normalizarTelefone(telefone),
      valor,
      valorPago: lerDinheiro(valorDaColuna(linha, "valor pago", "pago", "recebido")) ?? "0.00",
      vencimentoEm: vencimento,
      parcela: inteiroOuNulo(parcelaBruta),
      totalParcelas: inteiroOuNulo(totalBruto),
      status: statusDeTexto(valorDaColuna(linha, "status", "situacao", "situação")),
      descricao: valorDaColuna(linha, "descricao", "descrição", "historico", "procedimento"),
    },
  };
}

function inteiroOuNulo(bruto: string | null): number | null {
  if (bruto === null) return null;
  // "2/6" é como o financeiro costuma escrever a parcela.
  const n = Number.parseInt(bruto.split("/")[0] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* -------------------------------------------------------------------------- */
/* Preview e importação                                                       */
/* -------------------------------------------------------------------------- */

export type LinhaPreviewCobranca = {
  fingerprint: string;
  paciente: string;
  patientId: string | null;
  avisoPaciente: string | null;
  valor: string;
  saldo: string;
  vencimentoEm: string;
  fase: string;
  status: StatusCobranca;
  jaExiste: boolean;
};

export type PreviewCobranca = {
  validos: LinhaPreviewCobranca[];
  falhas: FalhaLinha[];
  resumo: {
    total: number;
    novos: number;
    atualizados: number;
    semPaciente: number;
    comErro: number;
    saldoTotal: string;
    /** Quantas já estão vencidas há mais de 60 dias — não viram automação. */
    antigas: number;
  };
};

export async function gerarPreviewCobrancas(
  organizationId: string,
  conteudo: string,
  agora = new Date(),
): Promise<PreviewCobranca> {
  const { itens, falhas } = lerCobrancasDeCsv(conteudo);

  const validos: LinhaPreviewCobranca[] = [];
  let novos = 0;
  let atualizados = 0;
  let semPaciente = 0;
  let antigas = 0;

  for (const item of itens) {
    const fingerprint = fingerprintDeCobranca(item);
    const resolucao = await resolverPaciente(organizationId, item);

    const existente = await selecionarUm("crc_charges", {
      colunas: "id",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "fingerprint", op: "eq", valor: fingerprint },
      ],
    });

    if (existente === null) novos += 1;
    else atualizados += 1;
    if (resolucao.patientId === null) semPaciente += 1;

    const fase = faseDaCobranca(item.vencimentoEm, agora);
    if (fase === "ANTIGA") antigas += 1;

    validos.push({
      fingerprint,
      paciente: item.pacienteNome ?? item.pacienteTelefone ?? item.pacienteExternoId ?? "—",
      patientId: resolucao.patientId,
      avisoPaciente: resolucao.aviso,
      valor: item.valor,
      saldo: saldoDevedor(item.valor, item.valorPago),
      vencimentoEm: item.vencimentoEm,
      fase,
      status: item.status,
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
      saldoTotal: somarDinheiro(validos.map((v) => v.saldo)),
      antigas,
    },
  };
}

/**
 * Acha o paciente por código, telefone ou nome.
 *
 * MAIS ESTRITO QUE EM ORÇAMENTO, de propósito: telefone ou nome ambíguo
 * BLOQUEIA em vez de escolher. Ligar uma dívida ao paciente errado é pior do
 * que não ligar — e cobrar a pessoa errada é o dano que não se desfaz com um
 * pedido de desculpas.
 */
async function resolverPaciente(
  organizationId: string,
  item: CobrancaExterna,
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
    const encontrados = await selecionar("crc_patients", {
      colunas: "id",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "telefone", op: "in", valor: variacoesDeTelefone(item.pacienteTelefone) },
      ],
      limite: 3,
    });
    if (encontrados.length === 1) {
      return { patientId: String(encontrados[0]?.["id"] ?? ""), aviso: null };
    }
    if (encontrados.length > 1) {
      return {
        patientId: null,
        aviso: "Telefone em mais de um paciente — confira antes de cobrar.",
      };
    }
  }

  if (item.pacienteNome !== null) {
    const porNome = await selecionar("crc_patients", {
      colunas: "id",
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

export type ResultadoImportacaoCobranca = {
  criados: number;
  atualizados: number;
  falhados: number;
  semPaciente: number;
  falhas: FalhaLinha[];
};

export async function importarCobrancas(
  organizationId: string,
  clinicId: string,
  conteudo: string,
  userId: string | null,
): Promise<ResultadoImportacaoCobranca> {
  const { itens, falhas } = lerCobrancasDeCsv(conteudo);

  let criados = 0;
  let atualizados = 0;
  let falhados = 0;
  let semPaciente = 0;

  for (const item of itens) {
    try {
      const fingerprint = fingerprintDeCobranca(item);
      const { patientId } = await resolverPaciente(organizationId, item);
      if (patientId === null) semPaciente += 1;

      const existente = await selecionarUm("crc_charges", {
        colunas: "id,tentativas_contato,negociacao_humana",
        filtros: [
          { coluna: "organization_id", op: "eq", valor: organizationId },
          { coluna: "fingerprint", op: "eq", valor: fingerprint },
        ],
      });

      // O upsert lista os campos que sobrescreve, um a um. Mandar o objeto
      // inteiro zeraria `tentativas_contato` e `negociacao_humana` a cada
      // importação — e a contagem de tentativas é justamente o teto do art. 42.
      await gravar(
        "crc_charges",
        {
          organization_id: organizationId,
          clinic_id: clinicId,
          patient_id: patientId,
          provider: "CSV_IMPORT",
          external_id: item.externalId,
          fingerprint,
          valor: item.valor,
          valor_pago: item.valorPago,
          parcela: item.parcela,
          total_parcelas: item.totalParcelas,
          vencimento_em: item.vencimentoEm,
          status: item.status,
          descricao: item.descricao,
          atualizado_em: new Date().toISOString(),
          ...(item.status === "PAGA" ? { pago_em: new Date().toISOString() } : {}),
        },
        "organization_id,fingerprint",
      );

      if (existente === null) criados += 1;
      else atualizados += 1;
    } catch (erro) {
      falhados += 1;
      falhas.push({ linha: 0, erro: descreverErro(erro), conteudo: item.pacienteNome ?? "" });
    }
  }

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "cobrancas.importadas",
    entityType: "charge",
    entityId: null,
    depois: { criados, atualizados, falhados, semPaciente },
  });

  registrar("info", "Importação de cobranças concluída.", { organizationId, criados, atualizados });

  return { criados, atualizados, falhados, semPaciente, falhas };
}

/* -------------------------------------------------------------------------- */
/* Varredura diária                                                           */
/* -------------------------------------------------------------------------- */

export type ResultadoVarreduraCobranca = {
  avaliadas: number;
  elegiveis: number;
  oportunidadesCriadas: number;
  tarefasCriadas: number;
};

/**
 * Transforma parcela vencida em trabalho.
 *
 * A REGRA DECIDE, e ela devolve três respostas diferentes que produzem três
 * caminhos:
 *
 *   pode                → oportunidade + jornada de cobrança
 *   não pode, exige humano → TAREFA, porque a dívida não pode ser esquecida
 *                            só porque a automação não pode falar
 *   não pode, sem humano   → nada; volta no próximo ciclo
 *
 * O segundo caminho é o que impede o teto de tentativas do art. 42 virar um
 * buraco onde dívidas antigas desaparecem.
 */
export async function varrerCobrancas(
  organizationId: string,
  limite = 200,
  agora = new Date(),
): Promise<ResultadoVarreduraCobranca> {
  // Só o que já venceu ou vence em três dias. O lembrete pré-vencimento é
  // curto de propósito: avisar com duas semanas de antecedência não ajuda
  // ninguém a se organizar e vira ruído.
  const ate = new Date(agora.getTime() + 3 * 86400_000).toISOString().slice(0, 10);

  const linhas = await selecionar("crc_charges", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "in", valor: ["ABERTA", "PARCIAL"] },
      { coluna: "negociacao_humana", op: "eq", valor: false },
      { coluna: "vencimento_em", op: "lte", valor: ate },
      { coluna: "patient_id", op: "not.is", valor: null },
    ],
    ordenar: [{ coluna: "vencimento_em", ascendente: true }],
    limite,
  });

  let elegiveis = 0;
  let oportunidades = 0;
  let tarefas = 0;

  for (const linha of linhas) {
    const patientId = String(linha["patient_id"] ?? "");
    const chargeId = String(linha["id"] ?? "");
    if (patientId.length === 0) continue;

    const paciente = await selecionarUm("crc_patients", {
      colunas: "opt_out_em,telefone,clinic_id,nome",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "id", op: "eq", valor: patientId },
      ],
    });
    if (paciente === null) continue;

    const ctx: ContextoCobranca = {
      status: String(linha["status"] ?? "ABERTA") as StatusCobranca,
      vencimentoEm: String(linha["vencimento_em"] ?? ""),
      valor: String(linha["valor"] ?? "0"),
      valorPago: String(linha["valor_pago"] ?? "0"),
      tentativasContato:
        typeof linha["tentativas_contato"] === "number" ? linha["tentativas_contato"] : 0,
      ultimoContatoEm:
        typeof linha["ultimo_contato_em"] === "string" ? linha["ultimo_contato_em"] : null,
      negociacaoHumana: linha["negociacao_humana"] === true,
      optOut: typeof paciente["opt_out_em"] === "string",
      temTelefone: typeof paciente["telefone"] === "string" && paciente["telefone"].length > 0,
    };

    const veredicto = podeCobrar(ctx, agora);
    const clinicId = String(linha["clinic_id"] ?? paciente["clinic_id"] ?? "");

    if (!veredicto.pode) {
      if (veredicto.exigeHumano) {
        // A dívida NÃO pode desaparecer só porque a automação não pode falar.
        const tarefa = await criarTarefa({
          organizationId,
          clinicId,
          patientId,
          titulo: "Tratar cobrança em aberto por telefone",
          tipo: "LIGAR",
          prazoHoras: 48,
          prioridade: 5,
          motivo: veredicto.motivo,
          chaveDedupe: `cobranca_humana:${chargeId}`,
          ator: "automacao",
        });
        if (tarefa !== null) tarefas += 1;
      }
      continue;
    }

    elegiveis += 1;

    const resultado = await criarOportunidade({
      organizationId,
      clinicId,
      patientId,
      tipo: "MANUAL",
      motivo:
        veredicto.fase === "A_VENCER"
          ? "Parcela a vencer nos próximos dias."
          : `Parcela em aberto há ${String(veredicto.diasAtraso)} dias.`,
      // Por PARCELA, e não por paciente: quem tem duas parcelas vencidas tem
      // duas conversas diferentes, e resolver uma não resolve a outra.
      chaveDedupe: `COBRANCA:${chargeId}`,
      potentialValue: veredicto.saldo,
      ator: "automacao",
    });

    if (resultado.criada) oportunidades += 1;
  }

  return {
    avaliadas: linhas.length,
    elegiveis,
    oportunidadesCriadas: oportunidades,
    tarefasCriadas: tarefas,
  };
}

/* -------------------------------------------------------------------------- */
/* Resposta do paciente                                                       */
/* -------------------------------------------------------------------------- */

export type ReacaoCobranca =
  | { tipo: "nenhuma" }
  | { tipo: "ja_pagou"; cobrancas: number }
  | { tipo: "quer_negociar"; cobrancas: number };

/**
 * Lê a resposta do paciente e para a automação quando precisa.
 *
 * OS DOIS CASOS SÃO URGENTES E TÊM TRATAMENTO IMEDIATO:
 *
 *   "JÁ PAGUEI" — o arquivo do financeiro chega ao CRC com um ou dois dias de
 *   atraso, então isto é frequentemente VERDADE. Continuar cobrando quem já
 *   pagou é o erro que mais destrói confiança, e esperar a próxima importação
 *   para descobrir é tarde demais.
 *
 *   "CONSIGO PARCELAR?" — o art. 42 fica claro aqui: insistir com quem já
 *   pediu para conversar é constrangimento. A automação para e um humano
 *   assume.
 *
 * Nos dois casos a cobrança é marcada como `negociacao_humana`, o que a tira
 * da varredura, e uma tarefa é criada — porque parar a automação sem criar
 * trabalho para alguém é como a dívida seria esquecida.
 */
export async function reagirARespostaDeCobranca(
  organizationId: string,
  patientId: string,
  texto: string,
): Promise<ReacaoCobranca> {
  const jaPagou = afirmaQueJaPagou(texto);
  const querNegociar = pedeNegociacao(texto);
  if (!jaPagou && !querNegociar) return { tipo: "nenhuma" };

  const abertas = await selecionar("crc_charges", {
    colunas: "id,clinic_id,valor,valor_pago,vencimento_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
      { coluna: "status", op: "in", valor: ["ABERTA", "PARCIAL"] },
    ],
    limite: 20,
  });

  if (abertas.length === 0) return { tipo: "nenhuma" };

  const agora = new Date().toISOString();
  for (const linha of abertas) {
    await atualizar("crc_charges", [{ coluna: "id", op: "eq", valor: String(linha["id"] ?? "") }], {
      negociacao_humana: true,
      atualizado_em: agora,
    });
  }

  const primeira = abertas[0];
  const clinicId = String(primeira?.["clinic_id"] ?? "");

  await criarTarefa({
    organizationId,
    clinicId,
    patientId,
    titulo: jaPagou
      ? "Paciente diz que já pagou — conferir com o financeiro"
      : "Paciente pediu para negociar a parcela",
    tipo: jaPagou ? "REVISAR" : "NEGOCIAR",
    // Quatro horas no caso de "já paguei": se for verdade, cada hora a mais é
    // uma chance de ele receber outra cobrança indevida.
    prazoHoras: jaPagou ? 4 : 24,
    prioridade: jaPagou ? 10 : 6,
    motivo: texto.slice(0, 300),
    chaveDedupe: `${jaPagou ? "conferir_pagamento" : "negociar"}:${patientId}:${agora.slice(0, 10)}`,
    ator: "automacao",
  });

  registrar("info", "Automação de cobrança interrompida pela resposta do paciente.", {
    organizationId,
    patientId,
    motivo: jaPagou ? "afirma_que_pagou" : "pediu_negociacao",
    cobrancas: abertas.length,
  });

  return jaPagou
    ? { tipo: "ja_pagou", cobrancas: abertas.length }
    : { tipo: "quer_negociar", cobrancas: abertas.length };
}

/**
 * Registra que falamos sobre esta cobrança.
 *
 * Chamado pelo motor depois de um envio bem-sucedido. É o contador que sustenta
 * o teto do art. 42 — sem ele, `MAX_CONTATOS_COBRANCA` seria decorativo.
 */
export async function registrarContatoDeCobranca(
  organizationId: string,
  chargeId: string,
): Promise<void> {
  const atual = await selecionarUm("crc_charges", {
    colunas: "tentativas_contato",
    filtros: [
      { coluna: "id", op: "eq", valor: chargeId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });

  const tentativas =
    (typeof atual?.["tentativas_contato"] === "number" ? atual["tentativas_contato"] : 0) + 1;

  await atualizar(
    "crc_charges",
    [
      { coluna: "id", op: "eq", valor: chargeId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      tentativas_contato: tentativas,
      ultimo_contato_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    },
  );

  if (tentativas >= MAX_CONTATOS_COBRANCA) {
    registrar("info", "Cobrança atingiu o teto de contatos automáticos.", {
      organizationId,
      chargeId,
      tentativas,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Acordo e quitação                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Registra um acordo de renegociação.
 *
 * O acordo SUBSTITUI as parcelas originais em vez de editá-las: o histórico do
 * que foi combinado antes precisa continuar respondendo "o que aconteceu com
 * essa dívida", e é justamente o que alguém vai consultar quando o acordo
 * também não for cumprido.
 */
export async function registrarAcordo(
  organizationId: string,
  dados: {
    patientId: string;
    chargeIds: readonly string[];
    valorAcordado: string;
    parcelas: number;
    primeiraEm: string;
    observacao: string | null;
  },
  userId: string | null,
): Promise<{ ok: true; acordoId: string } | { ok: false; motivo: string }> {
  if (dados.chargeIds.length === 0) {
    return { ok: false, motivo: "Selecione as parcelas que entram no acordo." };
  }

  const originais = await selecionar("crc_charges", {
    colunas: "id,valor,valor_pago",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "in", valor: [...dados.chargeIds] },
    ],
  });

  const valorOriginal = somarDinheiro(
    originais.map((o) => saldoDevedor(String(o["valor"] ?? "0"), String(o["valor_pago"] ?? "0"))),
  );

  const criados = await inserir("crc_payment_agreements", {
    organization_id: organizationId,
    patient_id: dados.patientId,
    valor_original: valorOriginal,
    valor_acordado: dados.valorAcordado,
    parcelas: dados.parcelas,
    primeira_em: dados.primeiraEm,
    status: "ATIVO",
    observacao: dados.observacao,
    criado_por: userId,
  });

  const acordoId = String(criados[0]?.["id"] ?? "");
  if (acordoId.length === 0) return { ok: false, motivo: "Não foi possível registrar o acordo." };

  for (const id of dados.chargeIds) {
    await atualizar(
      "crc_charges",
      [
        { coluna: "id", op: "eq", valor: id },
        { coluna: "organization_id", op: "eq", valor: organizationId },
      ],
      { status: "RENEGOCIADA", negociacao_humana: true, atualizado_em: new Date().toISOString() },
    );
  }

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "cobranca.acordo_registrado",
    entityType: "payment_agreement",
    entityId: acordoId,
    depois: {
      valorOriginal,
      valorAcordado: dados.valorAcordado,
      parcelas: dados.parcelas,
      parcelasSubstituidas: dados.chargeIds.length,
    },
  });

  return { ok: true, acordoId };
}

/**
 * Marca a parcela como paga e registra a receita CONFIRMADA.
 *
 * Item 61: receita só entra quando existe evento financeiro confiável. Um
 * humano registrando o pagamento é esse evento — o sistema nunca infere.
 */
export async function registrarPagamento(
  organizationId: string,
  chargeId: string,
  valorPago: string,
  userId: string | null,
): Promise<void> {
  const agora = new Date().toISOString();

  const linhas = await atualizar(
    "crc_charges",
    [
      { coluna: "id", op: "eq", valor: chargeId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "PAGA", valor_pago: valorPago, pago_em: agora, atualizado_em: agora },
  );

  const cobranca = linhas[0];
  if (cobranca === undefined) return;

  await inserir("crc_revenue_events", {
    organization_id: organizationId,
    clinic_id: String(cobranca["clinic_id"] ?? ""),
    patient_id: cobranca["patient_id"],
    natureza: "CONFIRMADA",
    valor: valorPago,
    motivo: "Parcela recebida.",
    recuperada: true,
    ocorrido_em: agora,
    chave_dedupe: `cobranca_paga:${chargeId}`,
  });

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "cobranca.pagamento_registrado",
    entityType: "charge",
    entityId: chargeId,
    depois: { valorPago },
  });
}

/** O que a ficha do paciente mostra. */
export async function listarCobrancasDoPaciente(
  organizationId: string,
  patientId: string,
): Promise<Linha[]> {
  return selecionar("crc_charges", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
    ],
    ordenar: [{ coluna: "vencimento_em", ascendente: false }],
    limite: 50,
  });
}
