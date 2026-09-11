/**
 * Log estruturado, correlação e auditoria.
 *
 * TRÊS COISAS DIFERENTES QUE COSTUMAM SER CONFUNDIDAS:
 *
 *   log       — para quem está depurando. Vai para o stdout da Vercel, some.
 *   auditoria — para quem precisa saber quem mudou o quê (item 74). Vai para o
 *               banco, fica.
 *   log de integração — para quem investiga por que a sincronização quebrou
 *               (item 237). Vai para o banco, fica, e nunca contém secret.
 *
 * O item 75 é a regra que atravessa os três: CPF, telefone, e-mail e conteúdo
 * clínico não entram em log sem necessidade. `mascarar()` abaixo é aplicada
 * antes de qualquer coisa ir para o banco — não é opcional nem "boa prática",
 * é o que impede a tabela de logs virar uma segunda base de dados pessoais sem
 * as proteções da primeira.
 */
import { telefoneMascarado } from "../dominio/telefone";

import { camposDeCorrelacao } from "./correlacao";

import { agoraIso, inserir } from "./banco";

/* -------------------------------------------------------------------------- */
/* Correlação                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Identificador de requisição (item 75 da observabilidade).
 *
 * `crypto.randomUUID` existe no runtime da Vercel e no Node moderno. O fallback
 * cobre ambiente exótico sem derrubar nada — um id menos aleatório continua
 * servindo para correlacionar linhas do mesmo pedido.
 */
export function novoRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
  }
}

export type Nivel = "debug" | "info" | "aviso" | "erro";

export type ContextoLog = {
  requestId?: string;
  organizationId?: string;
  syncJobId?: string;
  automationExecutionId?: string;
  [chave: string]: unknown;
};

/* -------------------------------------------------------------------------- */
/* Mascaramento (item 75)                                                     */
/* -------------------------------------------------------------------------- */

const CHAVES_SECRETAS =
  /^(secret|password|senha|token|authorization|apikey|api_key|client_secret|service_role)$/iu;

const CHAVES_PESSOAIS = /^(telefone|phone|celular|whatsapp|contato_externo|wa_id)$/iu;
const CHAVES_EMAIL = /^(email|e_mail|mail)$/iu;
const CHAVES_DOCUMENTO = /^(cpf|rg|documento|document)$/iu;

/**
 * Percorre o objeto e substitui o que não pode ser gravado.
 *
 * Recursivo com teto de profundidade: um payload de webhook aninhado demais
 * (ou com ciclo) travaria a função, e travar o logger derruba o handler que ele
 * deveria estar ajudando a depurar.
 */
export function mascarar(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return "[profundo demais]";
  if (valor === null || valor === undefined) return valor;

  if (Array.isArray(valor)) {
    // Lista longa vira amostra: 5.000 pacientes num log não ajudam ninguém e
    // custam armazenamento.
    const amostra = valor.slice(0, 20).map((v) => mascarar(v, profundidade + 1));
    return valor.length > 20 ? [...amostra, `… mais ${String(valor.length - 20)}`] : amostra;
  }

  if (typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CHAVES_SECRETAS.test(chave)) {
        saida[chave] = "[oculto]";
      } else if (CHAVES_PESSOAIS.test(chave) && typeof v === "string") {
        saida[chave] = telefoneMascarado(v);
      } else if (CHAVES_EMAIL.test(chave) && typeof v === "string") {
        saida[chave] = mascararEmail(v);
      } else if (CHAVES_DOCUMENTO.test(chave)) {
        saida[chave] = "[documento oculto]";
      } else {
        saida[chave] = mascarar(v, profundidade + 1);
      }
    }
    return saida;
  }

  if (typeof valor === "string" && valor.length > 500) {
    return `${valor.slice(0, 500)}… (${String(valor.length)} caracteres)`;
  }

  return valor;
}

/** `maria@exemplo.com` → `m***a@exemplo.com`. Domínio fica: ele ajuda a depurar. */
export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split("@");
  if (usuario === undefined || dominio === undefined) return "[email oculto]";
  if (usuario.length <= 2) return `**@${dominio}`;
  return `${usuario.charAt(0)}***${usuario.charAt(usuario.length - 1)}@${dominio}`;
}

/* -------------------------------------------------------------------------- */
/* Log de aplicação                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Uma linha por evento, em JSON, no stdout.
 *
 * JSON e não texto porque o painel da Vercel indexa campo de JSON: procurar
 * `requestId` numa string concatenada exige regex, e num objeto é um filtro.
 */
export function registrar(nivel: Nivel, mensagem: string, contexto: ContextoLog = {}): void {
  const linha = JSON.stringify({
    t: agoraIso(),
    nivel,
    escopo: "crc",
    msg: mensagem,
    /*
     * A CORRELAÇÃO ENTRA EM TODA LINHA — Fase I.
     *
     * Sem ela, investigar uma reclamação é achar a mensagem na Inbox, procurar a
     * run daquela conversa naquele horário, e então garimpar no log da Vercel as
     * linhas daquele minuto torcendo para nenhuma outra clínica ter tido
     * atividade. Com duas clínicas ativas, o log vira intercalação de duas
     * histórias e não dá para separar.
     *
     * Vem ANTES do contexto explícito de propósito: se quem chamou passou um
     * `conversationId` diferente, é o dele que vale — ele sabe mais sobre a
     * linha específica do que o pedido inteiro sabe.
     */
    ...camposDeCorrelacao(),
    ...(mascarar(contexto) as Record<string, unknown>),
  });

  if (nivel === "erro") console.error(linha);
  else if (nivel === "aviso") console.warn(linha);
  else console.log(linha);
}

/** Extrai mensagem de erro sem vazar stack para o cliente. */
export function descreverErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === "string") return erro;
  return "Erro desconhecido.";
}

/* -------------------------------------------------------------------------- */
/* Auditoria (item 74)                                                        */
/* -------------------------------------------------------------------------- */

export type EntradaAuditoria = {
  organizationId: string;
  /** `null` quando quem agiu foi a automação, o sync ou um webhook. */
  userId: string | null;
  ator: "humano" | "automacao" | "sync" | "webhook" | "ia";
  acao: string;
  entityType: string;
  entityId: string | null;
  antes?: unknown;
  depois?: unknown;
  requestId?: string;
};

/**
 * Grava a auditoria. NUNCA derruba a operação auditada.
 *
 * Este `catch` é uma das poucas exceções conscientes ao item 113 (zero silent
 * failure): a falha é registrada no log, não engolida. A alternativa — deixar
 * o erro subir — faria uma indisponibilidade da tabela de auditoria impedir o
 * atendente de concluir uma tarefa, e isso é pior do que perder uma linha de
 * log.
 */
export async function auditar(entrada: EntradaAuditoria): Promise<void> {
  try {
    await inserir("crc_audit_logs", {
      organization_id: entrada.organizationId,
      user_id: entrada.userId,
      ator: entrada.ator,
      acao: entrada.acao,
      entity_type: entrada.entityType,
      entity_id: entrada.entityId,
      antes: entrada.antes === undefined ? null : mascarar(entrada.antes),
      depois: entrada.depois === undefined ? null : mascarar(entrada.depois),
      request_id: entrada.requestId ?? null,
    });
  } catch (erro) {
    registrar("erro", "Falha ao gravar auditoria.", {
      acao: entrada.acao,
      entityType: entrada.entityType,
      detalhe: descreverErro(erro),
      ...(entrada.requestId !== undefined ? { requestId: entrada.requestId } : {}),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Log de integração (item 237)                                               */
/* -------------------------------------------------------------------------- */

export type EntradaIntegracao = {
  organizationId: string | null;
  integracao: "dental_office" | "whatsapp" | "ia";
  operacao: string;
  direcao?: "ENTRADA" | "SAIDA";
  metodo?: string;
  caminho?: string;
  statusHttp?: number | null;
  sucesso: boolean;
  erro?: string | null;
  duracaoMs?: number;
  requestId?: string;
  resumo?: unknown;
};

export async function registrarIntegracao(entrada: EntradaIntegracao): Promise<void> {
  try {
    await inserir("crc_integration_logs", {
      organization_id: entrada.organizationId,
      integracao: entrada.integracao,
      operacao: entrada.operacao,
      direcao: entrada.direcao ?? "SAIDA",
      metodo: entrada.metodo ?? null,
      caminho: entrada.caminho ?? null,
      status_http: entrada.statusHttp ?? null,
      sucesso: entrada.sucesso,
      erro: entrada.erro ?? null,
      duracao_ms: entrada.duracaoMs ?? null,
      request_id: entrada.requestId ?? null,
      resumo: entrada.resumo === undefined ? null : mascarar(entrada.resumo),
    });
  } catch (erro) {
    registrar("erro", "Falha ao gravar log de integração.", {
      integracao: entrada.integracao,
      operacao: entrada.operacao,
      detalhe: descreverErro(erro),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Dead letter (item 78)                                                      */
/* -------------------------------------------------------------------------- */

/**
 * O que falhou de vez e precisa de olho humano.
 *
 * Não é log: é uma fila de trabalho. O admin vê, inspeciona, reprocessa ou
 * descarta. Sem ela, uma falha permanente vira uma linha perdida no stdout e
 * um paciente que nunca foi contatado sem ninguém saber.
 */
export async function mandarParaDeadLetter(entrada: {
  organizationId: string | null;
  origem: string;
  referencia: string | null;
  erro: string;
  payload?: unknown;
}): Promise<void> {
  try {
    await inserir("crc_dead_letters", {
      organization_id: entrada.organizationId,
      origem: entrada.origem,
      referencia: entrada.referencia,
      erro: entrada.erro.slice(0, 2000),
      payload: entrada.payload === undefined ? null : mascarar(entrada.payload),
    });
    registrar("aviso", "Item enviado para revisão manual.", {
      origem: entrada.origem,
      referencia: entrada.referencia,
    });
  } catch (erro) {
    // Se nem a dead letter grava, o stdout é o último recurso. Registrar em
    // nível de erro garante que apareça no alerta da plataforma.
    registrar("erro", "Falha ao gravar dead letter — item perdido.", {
      origem: entrada.origem,
      erroOriginal: entrada.erro,
      detalhe: descreverErro(erro),
    });
  }
}
