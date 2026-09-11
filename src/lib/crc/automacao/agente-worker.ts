/**
 * O worker do agente — Fase B.
 *
 * Ele reserva jobs, roda o turno de cada um e marca o desfecho. É o único lugar
 * do sistema que executa um turno de produção.
 *
 * A DIFERENÇA EM RELAÇÃO AO QUE EXISTIA: o turno rodava dentro do handler de
 * `message.received`. Numa função serverless isso significa que o trabalho vive
 * e morre com a requisição — um deploy no meio, um timeout, um 5xx do provedor,
 * e o turno some sem registro de que faltou responder alguém.
 *
 * POR QUE NÃO É UM PROCESSO QUE FICA RODANDO. A Vercel mata o processo; um laço
 * infinito aqui seria descartado no primeiro minuto. O desenho é o mesmo do
 * motor de eventos que já existe: cada chamada do cron reserva um LOTE, trabalha
 * e devolve. A durabilidade está no banco, não em memória.
 *
 * O QUE ESTE ARQUIVO GARANTE E O QUE NÃO GARANTE está em `ENTREGA_AO_MENOS_UMA_VEZ`.
 */
import type { AgentJob } from "../aplicacao/agent-jobs";

/**
 * ENTREGA AO MENOS UMA VEZ — a promessa honesta desta fila.
 *
 * Exactly-once não existe aqui, e prometer o contrário seria pior do que não
 * prometer nada. O que acontece em cada ponto de crash:
 *
 *   ANTES da reserva da run       nada foi feito. O retry roda o turno inteiro.
 *
 *   DEPOIS da reserva, ANTES do
 *   modelo                        o retry encontra a run RODANDO. Ela é dele:
 *                                 o job é o mesmo, a chave é a mesma, e o turno
 *                                 continua de onde nunca saiu.
 *
 *   DEPOIS do modelo, ANTES do
 *   desfecho                      o retry paga o modelo DE NOVO. É o único custo
 *                                 duplicado que esta fila aceita, e ele é em
 *                                 dinheiro, não em efeito no mundo.
 *
 *   DEPOIS de enviar a mensagem   a mensagem NÃO sai duas vezes:
 *                                 `crc_messages` tem índice único em
 *                                 `(organization_id, chave_dedupe)`, e a chave é
 *                                 derivada do evento.
 *
 *   DEPOIS de marcar consulta     a consulta NÃO é marcada duas vezes: o caso de
 *                                 uso de agendamento revalida o horário antes de
 *                                 gravar, e a oferta aceita não é aceitável duas
 *                                 vezes.
 *
 *   DEPOIS de abrir caso humano   o caso NÃO duplica: índice parcial de um caso
 *                                 aberto por conversa.
 *
 * Ou seja: o que pode repetir é a CHAMADA DE MODELO. Tudo que toca paciente,
 * agenda ou fila da recepção é protegido por constraint de banco — e não pela
 * esperança de o worker não cair.
 */
export const ENTREGA_AO_MENOS_UMA_VEZ = true;

export type ResultadoDoWorker = {
  reservados: number;
  concluidos: number;
  descartados: number;
  falhados: number;
  presosLiberados: number;
};

/**
 * Roda um lote da fila do agente.
 *
 * NUNCA LANÇA por causa de um job. Um turno que explode marca o próprio job como
 * falho e o lote segue — senão o primeiro job ruim do dia impediria todos os
 * outros pacientes de serem respondidos.
 */
export async function processarTurnosDoAgente(
  opcoes: {
    limite?: number;
    quem?: string;
  } = {},
): Promise<ResultadoDoWorker> {
  const { liberarPresos, reservarJobs, concluirJob, descartarJob, falharJob } =
    await import("../aplicacao/agent-jobs");

  // Primeiro os abandonados: um job que ficou RODANDO com o lease vencido e o
  // teto estourado não aparece na fila nem na lista de falhas. Some.
  let presosLiberados = 0;
  try {
    presosLiberados = await liberarPresos();
  } catch {
    // A limpeza é higiene, não pode impedir o trabalho do lote.
  }

  const jobs = await reservarJobs({
    limite: opcoes.limite ?? 5,
    ...(opcoes.quem === undefined ? {} : { quem: opcoes.quem }),
  });

  let concluidos = 0;
  let descartados = 0;
  let falhados = 0;

  for (const job of jobs) {
    const comecou = Date.now();
    try {
      const r = await executarJob(job);

      if (r.tipo === "descartado") {
        await descartarJob(job, r.motivo);
        descartados += 1;
      } else {
        await concluirJob(job, Date.now() - comecou);
        concluidos += 1;
      }
    } catch (erro) {
      await falharJob(job, erro instanceof Error ? erro.message : String(erro));
      falhados += 1;
    }
  }

  return { reservados: jobs.length, concluidos, descartados, falhados, presosLiberados };
}

type DesfechoDoJob = { tipo: "feito" } | { tipo: "descartado"; motivo: string };

/**
 * Executa UM job: relê as travas, monta as portas e roda o turno.
 *
 * AS TRAVAS SÃO RELIDAS AQUI, e não no momento de enfileirar. A diferença
 * importa: entre a mensagem chegar e o worker rodar pode passar um minuto, e
 * nesse minuto alguém pode ter desligado o agente ou assumido a conversa. Usar o
 * estado do enfileiramento faria o sistema agir com uma decisão que já foi
 * revogada.
 */
async function executarJob(job: AgentJob): Promise<DesfechoDoJob> {
  const { lerFlags, lerKillSwitches, lerConfiguracao } = await import("../servidor/configuracao");
  const [flags, interruptores] = await Promise.all([
    lerFlags(job.organizationId),
    lerKillSwitches(job.organizationId),
  ]);

  if (flags["ai_agente_sombra"] !== true) {
    return { tipo: "descartado", motivo: "O agente foi desligado antes de este turno rodar." };
  }
  if (interruptores["kill_ia_auto"] === true || interruptores["kill_automacoes"] === true) {
    return { tipo: "descartado", motivo: "Interruptor de emergência acionado." };
  }

  // O dono da conversa também pode ter mudado desde o enfileiramento.
  const { donoDaConversa } = await import("../aplicacao/casos");
  const { dono } = await donoDaConversa(job.organizationId, job.conversationId);
  if (dono !== "ia") {
    return {
      tipo: "descartado",
      motivo:
        dono === "humano"
          ? "Um atendente assumiu a conversa antes de este turno rodar."
          : "A IA foi pausada nesta conversa.",
    };
  }

  const { portaParaFinalidade, portaDeEmbeddingsDaOrganizacao } =
    await import("../integracoes/ia/gateway");
  const [provedor, supervisorIa, busca] = await Promise.all([
    portaParaFinalidade(job.organizationId, "conversa"),
    portaParaFinalidade(job.organizationId, "supervisor"),
    portaDeEmbeddingsDaOrganizacao(job.organizationId),
  ]);

  const podeEnviar = flags["ai_agente_envio"] === true && interruptores["kill_envios"] !== true;

  let portaMensageria = null;
  if (podeEnviar) {
    const { criarProvedorMensageria } = await import("../integracoes/whatsapp/provedores");
    const m = criarProvedorMensageria(job.organizationId);
    portaMensageria = m.configurado ? m.porta : null;
  }

  const cfg = await lerConfiguracao(job.organizationId);
  const { contextoDeAgendamentoParaJob } = await import("./handlers");

  const { rodarTurno } = await import("../ia-platform/turno");
  const r = await rodarTurno({
    organizationId: job.organizationId,
    conversationId: job.conversationId,
    // A chave de dedupe continua sendo a do EVENTO: é ela que amarra job, run e
    // caso humano ao mesmo acontecimento.
    eventoId: job.eventId ?? job.id,
    jobId: job.id,
    agora: new Date(),
    porta: provedor.configurado ? provedor.porta : null,
    portaSupervisor: supervisorIa.configurado ? supervisorIa.porta : null,
    portaEmbeddings: busca.configurado ? busca.porta : null,
    portaMensageria,
    podeEnviar,
    politica: {
      escritaLiberada: flags["ai_agente_escrita"] === true,
      writebackLiberado: flags["dental_office_writeback"] === true,
      agendamentoAutonomo: flags["auto_scheduling"] === true,
      escritasDentalOfficePausadas: interruptores["kill_escritas_do"] === true,
      ferramentasUsadas: 0,
    },
    contextoAgendamento: () =>
      contextoDeAgendamentoParaJob(
        job.organizationId,
        job.conversationId,
        cfg,
        flags,
        interruptores,
      ),
    supervisionar: flags["ai_supervisor"] === true,
  });

  /*
   * `falha_segura` VIRA FALHA DO JOB, e por isso ganha retry.
   *
   * O desfecho do turno já está gravado na run: a observabilidade não se perde.
   * O que muda é que o job volta para a fila com backoff — porque a maior parte
   * das falhas seguras é provedor fora do ar, e daqui a dois minutos ele volta.
   *
   * O que NÃO ganha retry: `humano`, `candidato`, `enviado`, `sem_acao`. Todos
   * são desfechos legítimos de um turno que funcionou.
   */
  if (r.tipo === "falha_segura") throw new Error(r.motivo);

  return { tipo: "feito" };
}
