/**
 * "O que a IA está fazendo agora" — a narrativa da operação.
 *
 * ============================================================================
 *  ISTO NÃO É AUDITORIA, E A DIFERENÇA É DE PROPÓSITO.
 *
 *    `crc_audit_logs`  é PROVA. Quem mudou o quê, com ator e carimbo. Não pode
 *                      ser podada, não pode ser reescrita, e é ilegível de
 *                      propósito — ela existe para uma investigação.
 *
 *    esta tabela       é NARRATIVA. "08:42 detectou cancelamento · 08:43 achou
 *                      candidatos · 08:44 enviou o primeiro contato." Existe
 *                      para alguém ler na tela e entender o que o sistema está
 *                      fazendo pela clínica, e pode ser podada sem perder prova
 *                      nenhuma.
 *
 *  Tentar servir as duas com uma tabela só produz um log que nem investiga nem
 *  se lê — foi o que a tela de Saúde já tentou fazer com `crc_automation_logs`.
 * ============================================================================
 *
 * REGRA DE ESCRITA: registrar atividade NUNCA derruba quem estava agindo.
 * Uma timeline é um confortável; o envio da mensagem é o trabalho. Se a
 * gravação falhar, o erro é registrado e a ação segue — o contrário
 * transformaria um detalhe de observabilidade numa falha de operação.
 */
import {
  agoraIso,
  inserirIgnorandoDuplicata,
  selecionar,
  type Filtro,
  type Linha,
} from "../servidor/banco";
import { descreverErro, registrar } from "../servidor/registro";

/** Os passos que o sistema sabe contar. Lista fechada: passo novo é código novo. */
export type TipoAtividade =
  | "DETECTOU"
  | "AVALIOU"
  | "ESCOLHEU"
  | "ENVIOU"
  | "AGENDOU"
  | "ESCALOU"
  | "BLOQUEOU"
  | "APRENDEU"
  | "ENCERROU";

export type StatusAtividade =
  "PLANEJADA" | "EM_ANDAMENTO" | "CONCLUIDA" | "BLOQUEADA" | "AGUARDANDO_APROVACAO" | "FALHOU";

export type NovaAtividade = {
  organizationId: string;
  clinicId?: string | null;
  patientId?: string | null;
  opportunityId?: string | null;
  conversationId?: string | null;
  tipo: TipoAtividade;
  /** Uma linha, em português, para quem está lendo a tela. */
  titulo: string;
  resumo?: string | null;
  status?: StatusAtividade;
  /** Por quê. Vazio aqui é sinal de código preguiçoso, não de caso sem motivo. */
  motivo?: string | null;
  confianca?: number | null;
  origem?: "automacao" | "ia" | "humano" | "sync";
  runId?: string | null;
  /**
   * O que torna este passo único.
   *
   * A mesma disciplina de `eventos.ts`: inclua o que muda quando o passo é
   * REALMENTE outro, e nada que muda a cada varredura. `escolheu:op-123:v2`
   * está certo; acrescentar o instante geraria uma linha por execução do pulso,
   * e a timeline viraria um log de cron.
   */
  chaveDedupe?: string | null;
};

export type Atividade = {
  id: string;
  tipo: TipoAtividade;
  titulo: string;
  resumo: string | null;
  status: StatusAtividade;
  motivo: string | null;
  confianca: number | null;
  origem: string;
  patientId: string | null;
  opportunityId: string | null;
  conversationId: string | null;
  criadoEm: string;
  concluidoEm: string | null;
};

/**
 * Registra um passo. Nunca estoura.
 *
 * Devolve `false` quando não gravou — por já existir (dedupe) ou por falha. Os
 * dois casos são indiferentes para quem chama, e é por isso que o retorno é um
 * booleano e não um objeto: nenhum caminho de chamada deve tomar decisão
 * diferente por causa disto.
 */
export async function registrarAtividade(a: NovaAtividade): Promise<boolean> {
  try {
    const linha = await inserirIgnorandoDuplicata("crc_ai_activity", {
      organization_id: a.organizationId,
      clinic_id: a.clinicId ?? null,
      patient_id: a.patientId ?? null,
      opportunity_id: a.opportunityId ?? null,
      conversation_id: a.conversationId ?? null,
      activity_type: a.tipo,
      title: a.titulo,
      summary: a.resumo ?? null,
      status: a.status ?? "CONCLUIDA",
      reason: a.motivo ?? null,
      confidence: a.confianca ?? null,
      source: a.origem ?? "automacao",
      run_id: a.runId ?? null,
      // Passo terminal já nasce concluído. `PLANEJADA` e `EM_ANDAMENTO` ficam
      // sem data até alguém fechá-los — e uma linha antiga sem `completed_at` é
      // exatamente o sinal de que algo travou no meio.
      // `agoraIso()` do adaptador, e nao `new Date()`: e o relogio que os testes
      // controlam. Um carimbo do relogio real aqui tornaria impossivel afirmar
      // qualquer coisa sobre "passo terminal ja nasce concluido".
      completed_at: terminal(a.status ?? "CONCLUIDA") ? agoraIso() : null,
      chave_dedupe: a.chaveDedupe ?? null,
    });

    return linha !== null;
  } catch (erro) {
    /*
     * ENGOLIR AQUI É DELIBERADO, E É A ÚNICA VEZ.
     *
     * A alternativa seria deixar a exceção subir e derrubar o envio da
     * mensagem por causa de uma linha de timeline. O erro não some: vai para o
     * log com o motivo. O que não acontece é a clínica parar de operar porque
     * a narrativa falhou.
     */
    registrar("erro", "Falha ao registrar atividade da IA.", {
      organizationId: a.organizationId,
      tipo: a.tipo,
      detalhe: descreverErro(erro),
    });
    return false;
  }
}

function terminal(status: StatusAtividade): boolean {
  return status === "CONCLUIDA" || status === "BLOQUEADA" || status === "FALHOU";
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

export type FiltroDaTimeline = {
  organizationId: string;
  clinicId?: string | null;
  patientId?: string | null;
  /** Teto de linhas. A tela nunca pede mais que algumas dezenas. */
  limite?: number;
};

/**
 * Os últimos passos, do mais recente para o mais antigo.
 *
 * O TETO É RÍGIDO, e não um padrão que quem chama pode subir sem limite: uma
 * timeline é uma tela de leitura, e quem quer análise usa Gestão. Sem o teto,
 * um `limite: 100000` vindo de um parâmetro de URL viraria uma leitura da
 * tabela inteira numa tela que atualiza sozinha.
 */
const TETO_DA_TIMELINE = 200;

export async function lerAtividade(f: FiltroDaTimeline): Promise<Atividade[]> {
  const filtros: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: f.organizationId }];

  if (typeof f.clinicId === "string" && f.clinicId.length > 0) {
    filtros.push({ coluna: "clinic_id", op: "eq", valor: f.clinicId });
  }
  if (typeof f.patientId === "string" && f.patientId.length > 0) {
    filtros.push({ coluna: "patient_id", op: "eq", valor: f.patientId });
  }

  const linhas = await selecionar("crc_ai_activity", {
    colunas:
      "id,activity_type,title,summary,status,reason,confidence,source,patient_id,opportunity_id,conversation_id,criado_em,completed_at",
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: Math.min(Math.max(f.limite ?? 40, 1), TETO_DA_TIMELINE),
  });

  return linhas.map(linhaParaAtividade);
}

function linhaParaAtividade(l: Linha): Atividade {
  const confianca = l["confidence"];

  return {
    id: String(l["id"] ?? ""),
    tipo: String(l["activity_type"] ?? "DETECTOU") as TipoAtividade,
    titulo: String(l["title"] ?? ""),
    resumo: typeof l["summary"] === "string" ? l["summary"] : null,
    status: String(l["status"] ?? "CONCLUIDA") as StatusAtividade,
    motivo: typeof l["reason"] === "string" ? l["reason"] : null,
    // `numeric` volta do PostgREST como string. `Number(null)` é 0, e um 0 aqui
    // seria lido na tela como "confiança zero" em vez de "não medida".
    confianca: confianca === null || confianca === undefined ? null : Number(confianca),
    origem: String(l["source"] ?? "automacao"),
    patientId: typeof l["patient_id"] === "string" ? l["patient_id"] : null,
    opportunityId: typeof l["opportunity_id"] === "string" ? l["opportunity_id"] : null,
    conversationId: typeof l["conversation_id"] === "string" ? l["conversation_id"] : null,
    criadoEm: String(l["criado_em"] ?? ""),
    concluidoEm: typeof l["completed_at"] === "string" ? l["completed_at"] : null,
  };
}

/* -------------------------------------------------------------------------- */
/* O que precisa de gente                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Os passos parados esperando aprovação ou bloqueados.
 *
 * É a seção "o que precisa de você" da Home, e ela é SÓ EXCEÇÃO de propósito:
 * uma Home que lista tudo que aconteceu é uma Home que ninguém lê, e o item que
 * precisava de decisão fica enterrado entre quarenta linhas de rotina.
 */
export async function lerPendencias(
  organizationId: string,
  clinicId: string | null,
  limite = 20,
): Promise<Atividade[]> {
  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "status", op: "in", valor: ["AGUARDANDO_APROVACAO", "BLOQUEADA"] },
  ];

  if (typeof clinicId === "string" && clinicId.length > 0) {
    filtros.push({ coluna: "clinic_id", op: "eq", valor: clinicId });
  }

  const linhas = await selecionar("crc_ai_activity", {
    colunas:
      "id,activity_type,title,summary,status,reason,confidence,source,patient_id,opportunity_id,conversation_id,criado_em,completed_at",
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: Math.min(Math.max(limite, 1), TETO_DA_TIMELINE),
  });

  return linhas.map(linhaParaAtividade);
}
