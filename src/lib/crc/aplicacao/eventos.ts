/**
 * O barramento de eventos do CRC — Milestone 3.
 *
 * NÃO É FILA DE VERDADE, E ISSO É PROPOSITAL. O item 266 manda usar monólito
 * modular quando o projeto é monolítico, e o 267 proíbe pôr tudo em fila sem
 * necessidade. Aqui o "barramento" é uma tabela com estado e um worker que a
 * varre — o que dá durabilidade, replay (item 127) e idempotência sem
 * infraestrutura nova. Numa aplicação serverless na Vercel, banco é a única
 * coisa que sobrevive entre invocações de qualquer jeito.
 *
 * O QUE TORNA ISTO SEGURO: o `fingerprint`. Um `unique(organization_id,
 * fingerprint)` no banco faz a mesma falta detectada em cinco sincronizações
 * gerar UM evento (item 26). A deduplicação não depende de o código lembrar de
 * verificar; ela é uma constraint.
 *
 * OUTBOX (item 125): `emitir` grava o evento na mesma passagem em que o
 * chamador acabou de gravar o fato. Não é uma transação de verdade — PostgREST
 * não expõe transação multi-statement — então a ordem escolhida é a que falha
 * melhor: primeiro o FATO, depois o EVENTO. Perder o evento significa uma
 * automação que não disparou, e o varredor diário reencontra o caso. A ordem
 * inversa produziria automação sobre fato inexistente, que é pior.
 */
import type { EventoCrc, TipoEvento } from "../dominio/tipos";
import { inserirIgnorandoDuplicata, atualizar, rpc, type Linha } from "../servidor/banco";
import { descreverErro, mandarParaDeadLetter, registrar } from "../servidor/registro";

/* -------------------------------------------------------------------------- */
/* Emissão                                                                    */
/* -------------------------------------------------------------------------- */

export type NovoEvento = {
  organizationId: string;
  clinicId?: string | null;
  tipo: TipoEvento;
  entityType?: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  /**
   * O que torna este evento único no mundo.
   *
   * Regra prática: inclua tudo que muda quando o evento é REALMENTE outro, e
   * nada que muda a cada varredura. `appointment.missed:ag-2001` está certo.
   * `appointment.missed:ag-2001:2026-09-08T15:00:00Z` está errado — geraria um
   * evento por execução do cron.
   */
  fingerprint: string;
  ocorridoEm?: string;
};

/**
 * Grava o evento. Devolve `null` quando ele já existia.
 *
 * `null` não é falha: é a idempotência funcionando, e o chamador quase sempre
 * deve seguir em frente sem alarde.
 */
export async function emitir(evento: NovoEvento): Promise<EventoCrc | null> {
  const linha = await inserirIgnorandoDuplicata("crc_events", {
    organization_id: evento.organizationId,
    clinic_id: evento.clinicId ?? null,
    tipo: evento.tipo,
    entity_type: evento.entityType ?? null,
    entity_id: evento.entityId ?? null,
    payload: evento.payload ?? {},
    fingerprint: evento.fingerprint,
    ocorrido_em: evento.ocorridoEm ?? new Date().toISOString(),
    status: "PENDENTE",
  });

  if (linha === null) return null;
  return linhaParaEvento(linha);
}

function linhaParaEvento(l: Linha): EventoCrc {
  const payload = l["payload"];
  const statusBruto = typeof l["status"] === "string" ? l["status"] : "PENDENTE";
  const statusValidos = ["PENDENTE", "PROCESSANDO", "PROCESSADO", "FALHOU", "DESCARTADO"] as const;

  return {
    id: String(l["id"] ?? ""),
    organizationId: String(l["organization_id"] ?? ""),
    clinicId: typeof l["clinic_id"] === "string" ? l["clinic_id"] : null,
    tipo: String(l["tipo"] ?? "") as TipoEvento,
    entityType: typeof l["entity_type"] === "string" ? l["entity_type"] : null,
    entityId: typeof l["entity_id"] === "string" ? l["entity_id"] : null,
    payload:
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
    fingerprint: String(l["fingerprint"] ?? ""),
    status: (statusValidos as readonly string[]).includes(statusBruto)
      ? (statusBruto as EventoCrc["status"])
      : "PENDENTE",
    tentativas: typeof l["tentativas"] === "number" ? l["tentativas"] : 0,
    ocorridoEm: String(l["ocorrido_em"] ?? ""),
  };
}

/* -------------------------------------------------------------------------- */
/* Registro de handlers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Um handler cuida de UM tipo de evento.
 *
 * Item 27: "nada de switch gigantesco com 800 linhas". Cada handler é uma
 * função registrada por tipo; adicionar um comportamento novo é adicionar um
 * arquivo, não editar um arquivo de mil linhas que todo mundo mexe ao mesmo
 * tempo.
 *
 * O `agora` é o instante do LOTE, e não o do handler. Um lote de cinquenta
 * eventos leva segundos para processar; se cada handler lesse o próprio
 * relógio, dois eventos do mesmo paciente decidiriam "tem consulta futura?"
 * contra instantes diferentes, e a jornada nasceria com um `resume_at` que o
 * worker já considera passado — ou, pior, ainda futuro. Handler que não liga
 * para a hora simplesmente omite o parâmetro.
 */
export type Handler = (evento: EventoCrc, agora: Date) => Promise<void>;

const handlers = new Map<TipoEvento, Handler[]>();

export function registrarHandler(tipo: TipoEvento, handler: Handler): void {
  const atuais = handlers.get(tipo) ?? [];
  atuais.push(handler);
  handlers.set(tipo, atuais);
}

/** Só para teste: devolve o registro a um estado limpo. */
export function _limparHandlers(): void {
  handlers.clear();
}

export function handlersDe(tipo: TipoEvento): readonly Handler[] {
  return handlers.get(tipo) ?? [];
}

/* -------------------------------------------------------------------------- */
/* Processamento                                                              */
/* -------------------------------------------------------------------------- */

export type ResultadoProcessamento = {
  reservados: number;
  processados: number;
  falhados: number;
  semHandler: number;
};

const MAX_TENTATIVAS = 5;

/**
 * Consome a fila de eventos.
 *
 * A reserva é atômica via `crc_reservar_eventos` (FOR UPDATE SKIP LOCKED). Dois
 * workers rodando no mesmo minuto — o que acontece quando o cron da Vercel se
 * sobrepõe a uma chamada manual de "Sincronizar agora" — nunca pegam a mesma
 * linha.
 *
 * UM HANDLER QUE FALHA NÃO DERRUBA O LOTE. O evento volta para `FALHOU` e é
 * repescado; depois de `MAX_TENTATIVAS` vai para a dead letter, onde um humano
 * decide. Isso é o item 16 aplicado a eventos, e o 78.
 */
export async function processarEventos(
  limite = 25,
  agora = new Date(),
): Promise<ResultadoProcessamento> {
  const linhas = await rpc("crc_reservar_eventos", { limite, lock_segundos: 120 });
  const eventos = linhas.map(linhaParaEvento);

  const resultado: ResultadoProcessamento = {
    reservados: eventos.length,
    processados: 0,
    falhados: 0,
    semHandler: 0,
  };

  for (const evento of eventos) {
    const meus = handlersDe(evento.tipo);

    if (meus.length === 0) {
      // Evento sem handler não é erro: nem todo tipo tem automação hoje.
      // DESCARTADO em vez de PROCESSADO deixa isso legível na auditoria.
      resultado.semHandler += 1;
      await marcar(evento.id, "DESCARTADO", null);
      continue;
    }

    try {
      // Sequencial de propósito. Dois handlers do mesmo evento podem mexer no
      // mesmo paciente (criar oportunidade e iniciar jornada), e em paralelo a
      // segunda leria o estado antes de a primeira gravar.
      for (const handler of meus) await handler(evento, agora);

      await marcar(evento.id, "PROCESSADO", null);
      resultado.processados += 1;
    } catch (erro) {
      resultado.falhados += 1;
      const detalhe = descreverErro(erro);

      registrar("erro", "Handler de evento falhou.", {
        eventoId: evento.id,
        tipo: evento.tipo,
        tentativa: evento.tentativas,
        detalhe,
      });

      if (evento.tentativas >= MAX_TENTATIVAS) {
        await marcar(evento.id, "FALHOU", detalhe, true);
        await mandarParaDeadLetter({
          organizationId: evento.organizationId,
          origem: `evento:${evento.tipo}`,
          referencia: evento.id,
          erro: detalhe,
          payload: evento.payload,
        });
      } else {
        // Volta para a fila. `travado_ate` no passado libera na próxima volta.
        await marcar(evento.id, "FALHOU", detalhe);
      }
    }
  }

  return resultado;
}

async function marcar(
  id: string,
  status: EventoCrc["status"],
  erro: string | null,
  esgotado = false,
): Promise<void> {
  const mudancas: Linha = {
    status,
    ultimo_erro: erro,
    travado_ate: null,
  };
  if (status === "PROCESSADO" || status === "DESCARTADO") {
    mudancas["processado_em"] = new Date().toISOString();
  }
  if (esgotado) {
    // Trava a linha para sempre: já foi para a dead letter, e repescá-la
    // criaria trabalho duplicado toda vez que o worker rodar.
    mudancas["tentativas"] = MAX_TENTATIVAS + 1;
  }

  await atualizar("crc_events", [{ coluna: "id", op: "eq", valor: id }], mudancas);
}

/**
 * Reprocessa um evento específico — item 127 (event replay).
 *
 * Devolve o evento ao estado pendente. A idempotência dos handlers é o que
 * torna isso seguro: reprocessar `appointment.missed` não cria uma segunda
 * oportunidade, porque a `chave_dedupe` da oportunidade já existe.
 */
export async function reprocessar(organizationId: string, eventoId: string): Promise<void> {
  await atualizar(
    "crc_events",
    [
      { coluna: "id", op: "eq", valor: eventoId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      status: "PENDENTE",
      tentativas: 0,
      ultimo_erro: null,
      travado_ate: null,
      processado_em: null,
    },
  );
}
