/**
 * A ÚNICA porta por onde os códigos numéricos do Dental Office entram.
 *
 * O item 18 do contrato proíbe espalhar `1`, `2`, `5` pelo código. O motivo não
 * é estético: `status === 5` aparece igual num arquivo de agenda e num de
 * pacientes, e nos dois significa coisa diferente ("Faltou" contra
 * "Ortodontia"). Concentrar aqui torna o erro impossível de cometer em silêncio.
 *
 * O QUE ACONTECE COM CÓDIGO DESCONHECIDO
 * A API pode ganhar um status novo sem avisar. Chutar seria pior do que não
 * saber: `MISSED` inventado dispara mensagem para um paciente que compareceu.
 * Por isso o desconhecido vira `null`, e quem chama decide — o sync registra a
 * falha individual e segue (item 16), sem inventar estado.
 */
import type { SituacaoPaciente, StatusAgendamento } from "./tipos";

/* -------------------------------------------------------------------------- */
/* Agenda                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Códigos de status de agendamento, conforme a documentação do Dental Office:
 *   1 Confirmar · 2 Confirmado · 3 Em Atendimento · 4 Atendido
 *   5 Faltou    · 6 Cancelado
 */
const AGENDA_POR_CODIGO: Readonly<Record<number, StatusAgendamento>> = {
  1: "TO_CONFIRM",
  2: "CONFIRMED",
  3: "IN_PROGRESS",
  4: "COMPLETED",
  5: "MISSED",
  6: "CANCELLED",
};

const AGENDA_PARA_CODIGO: Readonly<Record<StatusAgendamento, number>> = {
  TO_CONFIRM: 1,
  CONFIRMED: 2,
  IN_PROGRESS: 3,
  COMPLETED: 4,
  MISSED: 5,
  CANCELLED: 6,
};

/** Devolve `null` para código que não conhecemos. Nunca chuta. */
export function statusAgendamentoDeCodigo(codigo: unknown): StatusAgendamento | null {
  const n = paraInteiro(codigo);
  if (n === null) return null;
  return AGENDA_POR_CODIGO[n] ?? null;
}

/**
 * Os rótulos que o Dental Office usa para as situações de agenda.
 *
 * ESTE É O CAMINHO CERTO DE LEITURA, e o numérico é o de emergência.
 *
 * A API deles expõe `POST /schedule_situations`: cada clínica pode CRIAR as
 * próprias situações. Logo o `schedule_situation_id` não é estável entre
 * clínicas — o "4" de uma pode ser "Faltou" e o "4" de outra, "Atendido". O
 * `label` é a categoria semântica do sistema deles e vem em toda resposta,
 * dentro de `schedule_situation`.
 *
 * Ler pelo número é o tipo de erro que não aparece em teste e aparece em
 * produção mandando mensagem de falta para quem compareceu.
 *
 * `client_arrived` e `in_service` viram AMBOS `IN_PROGRESS`: para as regras
 * deste sistema — "tem consulta futura?", "faltou?" — chegar na recepção e
 * estar na cadeira são o mesmo fato, e distingui-los criaria um estado que
 * nenhuma regra consulta.
 */
const AGENDA_POR_ROTULO: Readonly<Record<string, StatusAgendamento>> = {
  to_confirm: "TO_CONFIRM",
  confirmed: "CONFIRMED",
  client_arrived: "IN_PROGRESS",
  in_service: "IN_PROGRESS",
  fulfilled: "COMPLETED",
  absence: "MISSED",
  cancelled: "CANCELLED",
};

export function statusAgendamentoDeRotulo(rotulo: unknown): StatusAgendamento | null {
  if (typeof rotulo !== "string") return null;
  return AGENDA_POR_ROTULO[rotulo.trim().toLowerCase()] ?? null;
}

/** Caminho de volta: usado ao escrever confirmação de volta no Dental Office. */
export function codigoDeStatusAgendamento(status: StatusAgendamento): number {
  return AGENDA_PARA_CODIGO[status];
}

/** Já aconteceu e não vai mais mudar por si só. */
export function agendamentoEncerrado(status: StatusAgendamento): boolean {
  return status === "COMPLETED" || status === "MISSED" || status === "CANCELLED";
}

/** Ainda pode acontecer: conta como "consulta futura" nas regras. */
export function agendamentoContaComoFuturo(status: StatusAgendamento): boolean {
  return status === "TO_CONFIRM" || status === "CONFIRMED" || status === "IN_PROGRESS";
}

/* -------------------------------------------------------------------------- */
/* Situação do paciente                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 1 = 1ª Consulta · 2 = Em Tratamento · 3 = Tratamento Concluído
 * 4 = Alta         · 7 = Abandono
 *
 * 5 e 6 não estão documentados e por isso não estão aqui: mapear um código que
 * ninguém confirmou é adivinhação com cara de integração.
 */
const SITUACAO_POR_CODIGO: Readonly<Record<number, SituacaoPaciente>> = {
  1: "PRIMEIRA_CONSULTA",
  2: "EM_TRATAMENTO",
  3: "CONCLUIDO",
  4: "ALTA",
  7: "ABANDONO",
};

export function situacaoDeCodigo(codigo: unknown): SituacaoPaciente | null {
  const n = paraInteiro(codigo);
  if (n === null) return null;
  return SITUACAO_POR_CODIGO[n] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Especialidade                                                              */
/* -------------------------------------------------------------------------- */

/**
 * 2 Cirurgia · 4 Endodontia · 5 Ortodontia · 6 Periodontia
 * 7 Prótese  · 8 Implantodontia
 *
 * Diferente dos status, aqui o desconhecido é aceitável: especialidade é
 * rótulo, não regra. Um código novo vira "Especialidade 9" e a operação segue.
 */
const ESPECIALIDADE_POR_CODIGO: Readonly<Record<number, string>> = {
  2: "Cirurgia",
  4: "Endodontia",
  5: "Ortodontia",
  6: "Periodontia",
  7: "Prótese",
  8: "Implantodontia",
};

export function especialidadeDeCodigo(codigo: unknown): string | null {
  const n = paraInteiro(codigo);
  if (n === null) return null;
  return ESPECIALIDADE_POR_CODIGO[n] ?? `Especialidade ${String(n)}`;
}

/* -------------------------------------------------------------------------- */

/**
 * Aceita número e string numérica, porque a API entrega os dois conforme o
 * endpoint. Recusa `true`, `[]`, `"5 "` com lixo e qualquer coisa que o
 * `Number()` converteria por gentileza.
 */
function paraInteiro(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isInteger(valor) ? valor : null;
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!/^-?\d+$/.test(limpo)) return null;
  return Number.parseInt(limpo, 10);
}
