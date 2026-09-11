/**
 * A fila do agente — Fase B.
 *
 * O PROBLEMA QUE ELA RESOLVE, em uma frase: um turno que morre no meio não
 * voltava.
 *
 * O agente rodava dentro do handler de `message.received`. Numa função
 * serverless, qualquer interrupção — deploy, timeout, 5xx do provedor, reinício
 * — deixava o turno pela metade, sem registro de que faltou responder, e o
 * paciente sem resposta. Não havia retry porque não havia o que retomar.
 *
 * AS QUATRO GARANTIAS, e o que cada uma custa:
 *
 *   RESERVA ATÔMICA. `FOR UPDATE SKIP LOCKED` na RPC. Dois workers no mesmo
 *   minuto — que é o que acontece quando o cron se sobrepõe a uma chamada manual
 *   — nunca pegam o mesmo job.
 *
 *   LEASE COM PRAZO. O worker que morre não segura o job para sempre: passado o
 *   prazo, outro retoma. É o que torna crash recuperável.
 *
 *   BACKOFF E TETO. Cinco tentativas com espera crescente. Um job que quebra
 *   sempre para de queimar modelo e vira falha visível.
 *
 *   DEDUPE NA ENTRADA. Um evento enfileira um job, por constraint de banco.
 *
 * O QUE ESTA FILA NÃO GARANTE, e está escrito porque prometer o contrário seria
 * pior: exactly-once. Ver `ENTREGA_AO_MENOS_UMA_VEZ` mais abaixo.
 */
import {
  agoraIso,
  apagar,
  atualizar,
  inserirIgnorandoDuplicata,
  rpc,
  selecionar,
} from "../servidor/banco";

/* -------------------------------------------------------------------------- */
/* O contrato                                                                 */
/* -------------------------------------------------------------------------- */

export type StatusJob = "PENDENTE" | "RODANDO" | "REPETIR" | "CONCLUIDO" | "FALHOU" | "DESCARTADO";

export type AgentJob = {
  id: string;
  organizationId: string;
  conversationId: string;
  eventId: string | null;
  status: StatusJob;
  tentativas: number;
  ultimoErro: string | null;
  criadoEm: string;
};

/** Cinco tentativas. Ver o cabeçalho. */
export const MAX_TENTATIVAS = 5;

/**
 * Quanto tempo um worker segura o que reservou.
 *
 * O MESMO VALOR VALE PARA O JOB E PARA A RUN, e a igualdade é o ponto — não
 * coincidência. Se a run tivesse lease mais curto, ela poderia ser assumida por
 * outro worker enquanto o dono do job ainda estivesse trabalhando: duas
 * execuções, duas chamadas de modelo, possivelmente duas mensagens ao paciente.
 * Se tivesse lease mais longo, o job voltaria à fila só para bater numa run que
 * ninguém pode assumir ainda, e giraria em falso até esgotar as tentativas.
 *
 * Três minutos é folga sobre o turno mais lento observado (algo entre 4 e 12
 * segundos) sem prender o trabalho por muito tempo quando o processo morre.
 */
export const LEASE_SEGUNDOS = 180;

/**
 * Quanto esperar antes da próxima tentativa, em segundos.
 *
 * CRESCENTE E COM TETO: 30s, 2min, 8min, 32min. O provedor que devolveu 429 não
 * melhora em dois segundos, e insistir rápido é exatamente o que transforma um
 * soluço em tempestade de retries.
 */
export function esperaDoRetry(tentativas: number): number {
  const base = 30 * Math.pow(4, Math.max(tentativas - 1, 0));
  return Math.min(base, 30 * 60);
}

/* -------------------------------------------------------------------------- */
/* Enfileirar                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * O que aconteceu ao tentar enfileirar.
 *
 * TRÊS CASOS, E NÃO UM BOOLEANO. A versão anterior devolvia `boolean`, e o
 * `false` significava as duas coisas ao mesmo tempo:
 *
 *   "o job já existia"  → normal, reprocessamento, ignorar
 *   "o banco falhou"    → o paciente escreveu e ninguém vai responder
 *
 * Quem chamava tratava os dois como normal — e era obrigado a tratar, porque não
 * tinha como distinguir. O segundo caso então sumia sem deixar vestígio: nenhum
 * job, nenhum erro propagado, nenhuma linha na fila de falhas. Só o silêncio.
 */
export type ResultadoDoEnfileiramento =
  | { tipo: "criado"; jobId: string | null }
  | { tipo: "duplicado" }
  | { tipo: "erro"; detalhe: string };

/**
 * Põe um turno na fila. NUNCA LANÇA — quem chama decide o que fazer com o erro.
 *
 * POR QUE CONTINUA SEM LANÇAR. O handler de evento também classifica a mensagem
 * e dispara jornadas, e nada disso depende do agente. Lançar daqui derrubaria
 * essas outras coisas junto. O que mudou é que agora o erro CHEGA a quem chama
 * nomeado, e é lá — onde se sabe o que mais está em jogo — que se decide entre
 * seguir e falhar o evento.
 */
export async function enfileirarTurno(pedido: {
  organizationId: string;
  conversationId: string;
  eventId: string;
}): Promise<ResultadoDoEnfileiramento> {
  try {
    const criado = await inserirIgnorandoDuplicata("crc_agent_jobs", {
      organization_id: pedido.organizationId,
      conversation_id: pedido.conversationId,
      event_id: pedido.eventId,
      status: "PENDENTE",
      // A MESMA chave do turno e do caso humano. É o que amarra job, run e caso
      // ao mesmo evento — e o que faz reprocessar não duplicar nenhum dos três.
      chave_dedupe: `turno:${pedido.eventId}`,
    });

    if (criado === null) return { tipo: "duplicado" };

    const id = criado["id"];
    return { tipo: "criado", jobId: typeof id === "string" ? id : null };
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    const { registrar } = await import("../servidor/registro");
    /*
     * "ERRO", E NÃO MAIS "AVISO". A severidade também estava mentindo: um turno
     * perdido é um paciente sem resposta, e isso não é um aviso.
     */
    registrar("erro", "Não foi possível enfileirar o turno do agente.", {
      organizationId: pedido.organizationId,
      detalhe,
    });
    return { tipo: "erro", detalhe };
  }
}

/* -------------------------------------------------------------------------- */
/* Reservar                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reserva até `limite` jobs para este worker.
 *
 * O `quem` vai para a coluna e serve a uma pergunta operacional real: quando um
 * job trava sempre, é o job ou é o worker?
 */
export async function reservarJobs(opcoes: {
  limite?: number;
  leaseSegundos?: number;
  quem?: string;
}): Promise<AgentJob[]> {
  const linhas = await rpc("crc_reservar_agent_jobs", {
    limite: opcoes.limite ?? 5,
    lock_segundos: opcoes.leaseSegundos ?? LEASE_SEGUNDOS,
    quem: opcoes.quem ?? null,
  });
  return linhas.map(deLinha);
}

function deLinha(l: Record<string, unknown>): AgentJob {
  const tentativas = Number(l["tentativas"] ?? 0);
  return {
    id: String(l["id"] ?? ""),
    organizationId: String(l["organization_id"] ?? ""),
    conversationId: String(l["conversation_id"] ?? ""),
    eventId: typeof l["event_id"] === "string" ? l["event_id"] : null,
    status: String(l["status"] ?? "PENDENTE") as StatusJob,
    tentativas: Number.isFinite(tentativas) ? tentativas : 0,
    ultimoErro: typeof l["ultimo_erro"] === "string" ? l["ultimo_erro"] : null,
    criadoEm: String(l["criado_em"] ?? ""),
  };
}

/* -------------------------------------------------------------------------- */
/* Encerrar                                                                   */
/* -------------------------------------------------------------------------- */

export async function concluirJob(job: AgentJob, duracaoMs: number): Promise<void> {
  await atualizar("crc_agent_jobs", [{ coluna: "id", op: "eq", valor: job.id }], {
    status: "CONCLUIDO",
    terminou_em: agoraIso(),
    travado_ate: null,
    duracao_ms: duracaoMs,
    atualizado_em: agoraIso(),
  });
}

/**
 * O turno não tinha mais o que fazer.
 *
 * SEPARADO DE FALHA de propósito. A conversa foi assumida por gente, a flag foi
 * desligada, o paciente pediu opt-out — nada disso é defeito, e misturar com
 * erro faria a fila de falhas encher de coisa saudável até ninguém mais olhar.
 */
export async function descartarJob(job: AgentJob, motivo: string): Promise<void> {
  await atualizar("crc_agent_jobs", [{ coluna: "id", op: "eq", valor: job.id }], {
    status: "DESCARTADO",
    ultimo_erro: motivo.slice(0, 500),
    terminou_em: agoraIso(),
    travado_ate: null,
    atualizado_em: agoraIso(),
  });
}

/**
 * Falhou. Agenda a próxima tentativa, ou desiste e vira dead letter.
 *
 * A DEAD LETTER É ESCRITA AQUI, e não deixada para alguém notar depois: um job
 * que esgotou as tentativas some da fila de trabalho, e sem registro ele some do
 * mundo. Do outro lado tem um paciente que escreveu.
 */
export async function falharJob(job: AgentJob, erro: string, agora = new Date()): Promise<void> {
  const desistiu = job.tentativas >= MAX_TENTATIVAS;
  const detalhe = erro.slice(0, 500);

  await atualizar("crc_agent_jobs", [{ coluna: "id", op: "eq", valor: job.id }], {
    status: desistiu ? "FALHOU" : "REPETIR",
    ultimo_erro: detalhe,
    travado_ate: null,
    disponivel_em: desistiu
      ? agoraIso()
      : new Date(agora.getTime() + esperaDoRetry(job.tentativas) * 1000).toISOString(),
    ...(desistiu ? { terminou_em: agoraIso() } : {}),
    atualizado_em: agoraIso(),
  });

  if (!desistiu) return;

  try {
    const { inserir } = await import("../servidor/banco");
    await inserir("crc_dead_letters", {
      organization_id: job.organizationId,
      origem: "agent_job",
      referencia: job.id,
      erro: detalhe,
      payload: {
        conversationId: job.conversationId,
        eventId: job.eventId,
        tentativas: job.tentativas,
      },
      status: "PENDENTE",
    });
  } catch (falha) {
    const { registrar } = await import("../servidor/registro");
    registrar("erro", "Job do agente esgotou as tentativas e a dead letter falhou.", {
      organizationId: job.organizationId,
      detalhe: falha instanceof Error ? falha.message : String(falha),
    });
  }
}

/** Fecha os jobs que ficaram RODANDO sem ninguém para terminá-los. */
export async function liberarPresos(): Promise<number> {
  return await contarDaRpc("crc_liberar_agent_jobs_presos");
}

/**
 * Fecha as RUNS que ficaram abertas e cujo job já saiu da fila.
 *
 * A IRMÃ DA FUNÇÃO ACIMA, e ela precisa existir pelo mesmo motivo. Desde a Fase
 * B a run nasce antes da chamada de modelo, então uma run aberta é um turno em
 * curso — ou um turno cujo processo morreu. Enquanto o job puder voltar, a run é
 * retomada pelo lease e não há o que fazer. Quando o job esgota as tentativas e
 * vira FALHOU, ninguém mais vai retomá-la: ela fica RODANDO para sempre.
 *
 * O CUSTO DE NÃO FAZER ISSO é a métrica que apodrece. O painel de saúde conta
 * "turnos abertos há mais de 30 minutos" para denunciar worker morto; com runs
 * penduradas de incidentes antigos, o número sobe e nunca desce, e o alerta que
 * era um sinal vira ruído que se aprende a ignorar.
 */
export async function fecharRunsAbandonadas(minutos = 30): Promise<number> {
  return await contarDaRpc("crc_fechar_ai_runs_abandonadas", { p_minutos: minutos });
}

/**
 * As duas RPCs acima devolvem um escalar, e o PostgREST embrulha escalar num
 * objeto de uma chave cujo nome é o da função. Ler por `Object.values` evita
 * repetir esse nome — e evita o erro silencioso de repeti-lo errado, que
 * devolveria zero sem nunca falhar.
 */
async function contarDaRpc(nome: string, argumentos: Record<string, unknown> = {}): Promise<number> {
  const linhas = await rpc(nome, argumentos);
  const n = linhas[0];
  const valor = n === undefined ? 0 : Number(Object.values(n)[0] ?? 0);
  return Number.isFinite(valor) ? valor : 0;
}

/* -------------------------------------------------------------------------- */
/* Operação                                                                   */
/* -------------------------------------------------------------------------- */

export type PanoramaDaFila = {
  pendentes: number;
  rodando: number;
  repetindo: number;
  falhos: number;
  /** O job pendente mais antigo, para a tela responder "a fila está parada?". */
  esperaMaisAntigaMin: number | null;
};

export async function panoramaDaFila(
  organizationId: string,
  agora = new Date(),
): Promise<PanoramaDaFila> {
  const linhas = await selecionar("crc_agent_jobs", {
    colunas: "status,criado_em",
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 500,
  });

  let pendentes = 0;
  let rodando = 0;
  let repetindo = 0;
  let falhos = 0;
  let maisAntigo: number | null = null;

  for (const l of linhas) {
    const status = String(l["status"] ?? "");
    if (status === "PENDENTE") pendentes += 1;
    else if (status === "RODANDO") rodando += 1;
    else if (status === "REPETIR") repetindo += 1;
    else if (status === "FALHOU") falhos += 1;

    if ((status === "PENDENTE" || status === "REPETIR") && maisAntigo === null) {
      const quando = Date.parse(String(l["criado_em"] ?? ""));
      if (Number.isFinite(quando)) maisAntigo = Math.round((agora.getTime() - quando) / 60_000);
    }
  }

  return { pendentes, rodando, repetindo, falhos, esperaMaisAntigaMin: maisAntigo };
}

/** Limpa jobs concluídos antigos. A fila é fila, não histórico. */
export async function limparConcluidos(antesDe: Date): Promise<void> {
  await apagar("crc_agent_jobs", [
    { coluna: "status", op: "in", valor: ["CONCLUIDO", "DESCARTADO"] },
    { coluna: "terminou_em", op: "lt", valor: antesDe.toISOString() },
  ]);
}
