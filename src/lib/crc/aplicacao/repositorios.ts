/**
 * A tradução entre linha do Postgres e modelo do domínio.
 *
 * Item 138: `External DTO → Domain Model → API DTO → UI ViewModel`. Este
 * arquivo cuida do segundo passo. Nenhum `snake_case` do banco atravessa para
 * cima; nenhum `camelCase` do domínio desce para o SQL.
 *
 * POR QUE ISSO É UM ARQUIVO E NÃO UM `as Paciente`
 * Porque `as` mente. A linha do PostgREST tem `ultima_consulta_em` e o domínio
 * tem `ultimaConsultaEm`; o cast compila e produz `undefined` em tempo de
 * execução. O erro aparece na Home, sem pista de onde veio.
 *
 * TODA leitura aqui respeita o escopo do tenant (item 71): as funções exigem
 * `organizationId`, e não há caminho que leia sem ele.
 */
import type {
  Conversa,
  Intencao,
  Jornada,
  Mensagem,
  Oportunidade,
  Paciente,
  SituacaoPaciente,
  StatusAgendamento,
  StatusJornada,
  StatusTarefa,
  Tarefa,
  Temperatura,
  TipoOportunidade,
  TipoTarefa,
  Usuario,
  Papel,
  FatorPrioridade,
  Agendamento,
  EtapaFunil,
  CategoriaEtapa,
  StatusConversa,
  Direcao,
  Remetente,
  StatusEntrega,
} from "../dominio/tipos";
import type { Filtro, Linha } from "../servidor/banco";
import { selecionar, selecionarUm } from "../servidor/banco";

/* -------------------------------------------------------------------------- */
/* Leitura defensiva de coluna                                                */
/* -------------------------------------------------------------------------- */

function texto(linha: Linha, coluna: string): string {
  const v = linha[coluna];
  return typeof v === "string" ? v : "";
}

function textoOuNulo(linha: Linha, coluna: string): string | null {
  const v = linha[coluna];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function numero(linha: Linha, coluna: string, padrao = 0): number {
  const v = linha[coluna];
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return padrao;
}

function booleano(linha: Linha, coluna: string, padrao = false): boolean {
  const v = linha[coluna];
  return typeof v === "boolean" ? v : padrao;
}

/**
 * Valor numérico como TEXTO.
 *
 * O PostgREST entrega `numeric` como string justamente para não perder
 * precisão. Converter para `number` aqui desfaria a proteção do item 221 —
 * então ele continua string até a formatação final.
 */
function decimalOuNulo(linha: Linha, coluna: string): string | null {
  const v = linha[coluna];
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number" && Number.isFinite(v)) return v.toFixed(2);
  return null;
}

/**
 * Aceita o valor só se estiver na lista; senão devolve o padrão.
 *
 * O banco guarda status como `text` (ver o comentário no schema). Isso deixa a
 * porta aberta para um valor escrito à mão num SQL de manutenção. Cair no
 * padrão é melhor do que propagar um status que nenhum `switch` conhece.
 */
function umDe<T extends string>(
  linha: Linha,
  coluna: string,
  permitidos: readonly T[],
  padrao: T,
): T {
  const v = linha[coluna];
  if (typeof v !== "string") return padrao;
  return (permitidos as readonly string[]).includes(v) ? (v as T) : padrao;
}

const SITUACOES: readonly SituacaoPaciente[] = [
  "PRIMEIRA_CONSULTA",
  "EM_TRATAMENTO",
  "CONCLUIDO",
  "ALTA",
  "ABANDONO",
  "DESCONHECIDO",
];

const STATUS_AGENDA: readonly StatusAgendamento[] = [
  "TO_CONFIRM",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "MISSED",
  "CANCELLED",
];

const TIPOS_OP: readonly TipoOportunidade[] = [
  "NEW_LEAD",
  "MISSED_APPOINTMENT",
  "CANCELLED_APPOINTMENT",
  "RECALL",
  "INACTIVE_PATIENT",
  "ABANDONED_TREATMENT",
  "BUDGET_RECOVERY",
  "BIRTHDAY",
  "MANUAL",
];

const TIPOS_TAR: readonly TipoTarefa[] = [
  "LIGAR",
  "WHATSAPP",
  "REVISAR",
  "NEGOCIAR",
  "CONFIRMAR",
  "RETORNAR",
];

const STATUS_TAR: readonly StatusTarefa[] = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const PAPEIS_VALIDOS: readonly Papel[] = [
  "admin",
  "gestor",
  "crc",
  "recepcao",
  "dentista",
  "marketing",
];
const STATUS_CONV: readonly StatusConversa[] = ["ABERTA", "AGUARDANDO", "RESOLVIDA"];
const STATUS_JOR: readonly StatusJornada[] = [
  "ACTIVE",
  "WAITING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXITED",
];
const DIRECOES: readonly Direcao[] = ["ENTRADA", "SAIDA"];
const REMETENTES: readonly Remetente[] = ["paciente", "atendente", "automacao", "ia", "sistema"];
const ENTREGAS: readonly StatusEntrega[] = ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"];
const CATEGORIAS: readonly CategoriaEtapa[] = ["ABERTA", "GANHA", "PERDIDA"];

/* -------------------------------------------------------------------------- */
/* Conversores                                                                */
/* -------------------------------------------------------------------------- */

export function linhaParaPaciente(l: Linha): Paciente {
  return {
    id: texto(l, "id"),
    organizationId: texto(l, "organization_id"),
    clinicId: texto(l, "clinic_id"),
    externalSource: texto(l, "external_source"),
    externalId: texto(l, "external_id"),
    nome: texto(l, "nome"),
    nascimento: textoOuNulo(l, "nascimento"),
    genero: textoOuNulo(l, "genero"),
    situacao: umDe(l, "situacao", SITUACOES, "DESCONHECIDO"),
    especialidade: textoOuNulo(l, "especialidade"),
    ativo: booleano(l, "ativo", true),
    telefone: textoOuNulo(l, "telefone"),
    telefoneBruto: textoOuNulo(l, "telefone_bruto"),
    email: textoOuNulo(l, "email"),
    ultimaConsultaEm: textoOuNulo(l, "ultima_consulta_em"),
    proximaConsultaEm: textoOuNulo(l, "proxima_consulta_em"),
    optOutEm: textoOuNulo(l, "opt_out_em"),
    optOutMotivo: textoOuNulo(l, "opt_out_motivo"),
    arquivado: booleano(l, "arquivado", false),
    sincronizadoEm: textoOuNulo(l, "sincronizado_em"),
    criadoEm: texto(l, "criado_em"),
    atualizadoEm: texto(l, "atualizado_em"),
  };
}

export function linhaParaAgendamento(l: Linha): Agendamento {
  return {
    id: texto(l, "id"),
    organizationId: texto(l, "organization_id"),
    clinicId: texto(l, "clinic_id"),
    patientId: textoOuNulo(l, "patient_id"),
    externalSource: texto(l, "external_source"),
    externalId: texto(l, "external_id"),
    dentistaExternoId: textoOuNulo(l, "dentista_externo_id"),
    dentistaNome: textoOuNulo(l, "dentista_nome"),
    cadeiraExternaId: textoOuNulo(l, "cadeira_externa_id"),
    inicioEm: texto(l, "inicio_em"),
    fimEm: textoOuNulo(l, "fim_em"),
    descricao: textoOuNulo(l, "descricao"),
    status: umDe(l, "status", STATUS_AGENDA, "TO_CONFIRM"),
    statusExterno: textoOuNulo(l, "status_externo"),
    sincronizadoEm: textoOuNulo(l, "sincronizado_em"),
  };
}

export function linhaParaOportunidade(l: Linha): Oportunidade {
  return {
    id: texto(l, "id"),
    organizationId: texto(l, "organization_id"),
    clinicId: texto(l, "clinic_id"),
    patientId: textoOuNulo(l, "patient_id"),
    leadId: textoOuNulo(l, "lead_id"),
    tipo: umDe(l, "tipo", TIPOS_OP, "MANUAL"),
    stageId: textoOuNulo(l, "stage_id"),
    assignedTo: textoOuNulo(l, "assigned_to"),
    priorityScore: numero(l, "priority_score"),
    priorityFatores: lerFatores(l["priority_fatores"]),
    potentialValue: decimalOuNulo(l, "potential_value"),
    origem: textoOuNulo(l, "origem"),
    nextAction: textoOuNulo(l, "next_action"),
    nextActionAt: textoOuNulo(l, "next_action_at"),
    motivo: textoOuNulo(l, "motivo"),
    lostReason: textoOuNulo(l, "lost_reason"),
    reactivateAt: textoOuNulo(l, "reactivate_at"),
    fechadaEm: textoOuNulo(l, "fechada_em"),
    chaveDedupe: textoOuNulo(l, "chave_dedupe"),
    criadoEm: texto(l, "criado_em"),
    atualizadoEm: texto(l, "atualizado_em"),
  };
}

/**
 * Os fatores de prioridade voltam do jsonb.
 *
 * Validado item a item porque é o que a tela exibe como explicação: um objeto
 * malformado viraria "undefined: NaN pontos" na cara do usuário.
 */
function lerFatores(valor: unknown): FatorPrioridade[] {
  if (!Array.isArray(valor)) return [];
  const fatores: FatorPrioridade[] = [];
  for (const item of valor) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o["rotulo"] !== "string" || typeof o["pontos"] !== "number") continue;
    fatores.push({
      chave: typeof o["chave"] === "string" ? o["chave"] : "",
      rotulo: o["rotulo"],
      pontos: o["pontos"],
    });
  }
  return fatores;
}

export function linhaParaTarefa(l: Linha): Tarefa {
  return {
    id: texto(l, "id"),
    organizationId: texto(l, "organization_id"),
    clinicId: texto(l, "clinic_id"),
    patientId: textoOuNulo(l, "patient_id"),
    opportunityId: textoOuNulo(l, "opportunity_id"),
    titulo: texto(l, "titulo"),
    tipo: umDe(l, "tipo", TIPOS_TAR, "LIGAR"),
    status: umDe(l, "status", STATUS_TAR, "OPEN"),
    prioridade: numero(l, "prioridade"),
    assignedTo: textoOuNulo(l, "assigned_to"),
    dueAt: textoOuNulo(l, "due_at"),
    notas: textoOuNulo(l, "notas"),
    motivo: textoOuNulo(l, "motivo"),
    concluidaEm: textoOuNulo(l, "concluida_em"),
    criadoEm: texto(l, "criado_em"),
  };
}

export function linhaParaConversa(l: Linha): Conversa {
  const temperatura = textoOuNulo(l, "temperatura");
  const intencao = textoOuNulo(l, "intencao");
  return {
    id: texto(l, "id"),
    organizationId: texto(l, "organization_id"),
    clinicId: texto(l, "clinic_id"),
    patientId: textoOuNulo(l, "patient_id"),
    canal: texto(l, "canal"),
    contatoExterno: texto(l, "contato_externo"),
    status: umDe(l, "status", STATUS_CONV, "ABERTA"),
    assignedTo: textoOuNulo(l, "assigned_to"),
    bloqueadaPor: textoOuNulo(l, "bloqueada_por"),
    bloqueadaAte: textoOuNulo(l, "bloqueada_ate"),
    naoLidas: numero(l, "nao_lidas"),
    ultimaMensagemEm: textoOuNulo(l, "ultima_mensagem_em"),
    ultimaMensagemTrecho: textoOuNulo(l, "ultima_mensagem_trecho"),
    temperatura: temperatura === null ? null : (temperatura as Temperatura),
    intencao: intencao === null ? null : (intencao as Intencao),
    resumoIa: textoOuNulo(l, "resumo_ia"),
    resumoIaEm: textoOuNulo(l, "resumo_ia_em"),
    // Conversa criada antes da Fatia 5 não tem a coluna. O padrão é `ia`
    // porque era a automação que já vinha respondendo — tratar como "ninguem"
    // calaria o sistema inteiro no dia do deploy.
    dono: umDe(l, "dono", ["ia", "humano", "ninguem"] as const, "ia"),
    donoUserId: textoOuNulo(l, "dono_user_id"),
    revisaoPendente: booleano(l, "revisao_pendente", false),
  };
}

export function linhaParaMensagem(l: Linha): Mensagem {
  return {
    id: texto(l, "id"),
    conversationId: texto(l, "conversation_id"),
    patientId: textoOuNulo(l, "patient_id"),
    direcao: umDe(l, "direcao", DIRECOES, "ENTRADA"),
    remetente: umDe(l, "remetente", REMETENTES, "sistema"),
    autorId: textoOuNulo(l, "autor_id"),
    conteudo: texto(l, "conteudo"),
    notaInterna: booleano(l, "nota_interna", false),
    statusEntrega: umDe(l, "status_entrega", ENTREGAS, "QUEUED"),
    erro: textoOuNulo(l, "erro"),
    providerMessageId: textoOuNulo(l, "provider_message_id"),
    enviadoEm: textoOuNulo(l, "enviado_em"),
    criadoEm: texto(l, "criado_em"),
  };
}

export function linhaParaJornada(l: Linha): Jornada {
  const contexto = l["contexto"];
  return {
    id: texto(l, "id"),
    organizationId: texto(l, "organization_id"),
    automationId: texto(l, "automation_id"),
    versao: numero(l, "versao", 1),
    patientId: textoOuNulo(l, "patient_id"),
    opportunityId: textoOuNulo(l, "opportunity_id"),
    status: umDe(l, "status", STATUS_JOR, "ACTIVE"),
    passoAtual: numero(l, "passo_atual"),
    resumeAt: textoOuNulo(l, "resume_at"),
    contexto:
      typeof contexto === "object" && contexto !== null && !Array.isArray(contexto)
        ? (contexto as Record<string, unknown>)
        : {},
    saiuPor: textoOuNulo(l, "saiu_por"),
    criadoEm: texto(l, "criado_em"),
  };
}

export function linhaParaUsuario(l: Linha, clinicas: string[] = []): Usuario {
  return {
    id: texto(l, "id"),
    organizationId: texto(l, "organization_id"),
    nome: texto(l, "nome"),
    email: texto(l, "email"),
    papel: umDe(l, "papel", PAPEIS_VALIDOS, "crc"),
    ativo: booleano(l, "ativo", true),
    clinicas,
    fotoUrl: fotoValida(l["foto_url"]) ? String(l["foto_url"]) : null,
  };
}

/**
 * A foto só sai do banco se ainda for uma imagem embutida e pequena.
 *
 * A checagem existe na LEITURA, e não só na escrita, porque a coluna é `text`
 * e nada impede alguém de escrever nela por fora — pelo painel do Supabase,
 * por um script antigo. Um `<img src>` com conteúdo arbitrário vindo do banco
 * é o caminho curto para a foto de perfil virar um problema de segurança.
 */
export function fotoValida(valor: unknown): boolean {
  if (typeof valor !== "string") return false;
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(valor)) return false;
  return valor.length <= LIMITE_FOTO;
}

/** ~60 KB de base64. Uma imagem de 128px comprimida cabe com folga. */
export const LIMITE_FOTO = 60_000;

export function linhaParaEtapa(l: Linha): EtapaFunil {
  return {
    id: texto(l, "id"),
    chave: texto(l, "chave"),
    nome: texto(l, "nome"),
    ordem: numero(l, "ordem"),
    categoria: umDe(l, "categoria", CATEGORIAS, "ABERTA"),
  };
}

/* -------------------------------------------------------------------------- */
/* Consultas usadas em mais de um lugar                                       */
/* -------------------------------------------------------------------------- */

const daOrganizacao = (organizationId: string): Filtro => ({
  coluna: "organization_id",
  op: "eq",
  valor: organizationId,
});

export async function buscarPacientePorExternalId(
  organizationId: string,
  externalSource: string,
  externalId: string,
): Promise<Paciente | null> {
  const linha = await selecionarUm("crc_patients", {
    filtros: [
      daOrganizacao(organizationId),
      { coluna: "external_source", op: "eq", valor: externalSource },
      { coluna: "external_id", op: "eq", valor: externalId },
    ],
  });
  return linha === null ? null : linhaParaPaciente(linha);
}

export async function buscarPacientePorId(
  organizationId: string,
  id: string,
): Promise<Paciente | null> {
  const linha = await selecionarUm("crc_patients", {
    filtros: [daOrganizacao(organizationId), { coluna: "id", op: "eq", valor: id }],
  });
  return linha === null ? null : linhaParaPaciente(linha);
}

/**
 * Encontra pacientes por telefone, considerando as variações do nono dígito.
 *
 * Item 167: quando volta mais de um candidato, quem chama NÃO escolhe. A lista
 * inteira sobe para o resolvedor de conversa, que marca revisão humana.
 */
export async function buscarPacientesPorTelefone(
  organizationId: string,
  variacoes: readonly string[],
): Promise<Paciente[]> {
  if (variacoes.length === 0) return [];
  const linhas = await selecionar("crc_patients", {
    filtros: [
      daOrganizacao(organizationId),
      { coluna: "telefone", op: "in", valor: [...variacoes] },
      { coluna: "arquivado", op: "eq", valor: false },
    ],
    limite: 10,
  });
  return linhas.map(linhaParaPaciente);
}

/**
 * Busca de paciente por nome ou telefone — item 88.
 *
 * Só dígitos vai por telefone; o resto vai por nome com `ilike`, que usa o
 * índice trigram criado no schema. Sem o trigram, `%maria%` sobre 20 mil linhas
 * é varredura completa a cada tecla digitada.
 */
export async function procurarPacientes(
  organizationId: string,
  termo: string,
  limite = 20,
): Promise<Paciente[]> {
  const limpo = termo.trim();
  if (limpo.length < 2) return [];

  const soDigitos = limpo.replace(/\D+/gu, "");
  if (soDigitos.length >= 4 && soDigitos.length === limpo.replace(/[\s()+-]/gu, "").length) {
    const linhas = await selecionar("crc_patients", {
      filtros: [
        daOrganizacao(organizationId),
        { coluna: "telefone", op: "like", valor: `*${soDigitos}*` },
      ],
      limite,
    });
    return linhas.map(linhaParaPaciente);
  }

  const linhas = await selecionar("crc_patients", {
    filtros: [daOrganizacao(organizationId), { coluna: "nome", op: "ilike", valor: `*${limpo}*` }],
    ordenar: [{ coluna: "nome", ascendente: true }],
    limite,
  });
  return linhas.map(linhaParaPaciente);
}

export async function listarEtapas(organizationId: string): Promise<EtapaFunil[]> {
  const linhas = await selecionar("crc_opportunity_stages", {
    filtros: [daOrganizacao(organizationId)],
    ordenar: [{ coluna: "ordem", ascendente: true }],
  });
  return linhas.map(linhaParaEtapa);
}

/**
 * As consultas do paciente que importam para as regras.
 *
 * Devolve as duas datas que o espelho de `crc_patients` guarda — recalculadas
 * aqui a partir da verdade (`crc_appointments`), e não lidas do espelho. É o
 * que o sync usa para manter o espelho honesto.
 */
export async function calcularJanelaDeConsultas(
  organizationId: string,
  patientId: string,
  agora: Date,
): Promise<{ ultimaEm: string | null; proximaEm: string | null; concluidas: number }> {
  const linhas = await selecionar("crc_appointments", {
    colunas: "inicio_em,status",
    filtros: [daOrganizacao(organizationId), { coluna: "patient_id", op: "eq", valor: patientId }],
    ordenar: [{ coluna: "inicio_em", ascendente: false }],
    limite: 400,
  });

  let ultimaEm: string | null = null;
  let proximaEm: string | null = null;
  let concluidas = 0;
  const agoraMs = agora.getTime();

  for (const l of linhas) {
    const inicio = texto(l, "inicio_em");
    const status = umDe(l, "status", STATUS_AGENDA, "TO_CONFIRM");
    const t = Date.parse(inicio);
    if (!Number.isFinite(t)) continue;

    if (status === "COMPLETED") {
      concluidas += 1;
      // A lista vem em ordem decrescente: a primeira concluída é a mais recente.
      if (ultimaEm === null) ultimaEm = inicio;
    }

    // Futuro que ainda pode acontecer. Como a ordem é decrescente, a última
    // que satisfaz é a MAIS PRÓXIMA de agora — que é a que interessa.
    if (
      t >= agoraMs &&
      (status === "TO_CONFIRM" || status === "CONFIRMED" || status === "IN_PROGRESS")
    ) {
      proximaEm = inicio;
    }
  }

  return { ultimaEm, proximaEm, concluidas };
}
