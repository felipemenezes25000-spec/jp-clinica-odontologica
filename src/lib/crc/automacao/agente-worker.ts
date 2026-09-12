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
 *   modelo                        o retry encontra a run RODANDO com o LEASE
 *                                 VENCIDO, e a reivindica — `reclaim`. O turno
 *                                 roda de novo, na mesma linha, com `tentativa`
 *                                 somando.
 *
 *                                 ISTO NÃO FUNCIONAVA ATÉ A CORREÇÃO DO
 *                                 RECLAIM. A reserva era `insert ... on conflict
 *                                 do nothing`, então a run existente era lida
 *                                 como "outro é o dono" — mesmo sendo o eu de
 *                                 antes, que morreu. O turno devolvia
 *                                 `sem_acao`, o worker CONCLUÍA o job, e o
 *                                 paciente ficava sem resposta para sempre. O
 *                                 job se recuperava e a run não, o que era pior
 *                                 do que não recuperar nada: a fila saía
 *                                 marcada como resolvida.
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
  /** Runs que ficaram abertas porque o job delas morreu de vez. */
  runsFechadas: number;
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
  const {
    liberarPresos,
    fecharRunsAbandonadas,
    reservarJobs,
    concluirJob,
    descartarJob,
    falharJob,
  } = await import("../aplicacao/agent-jobs");

  // Primeiro os abandonados: um job que ficou RODANDO com o lease vencido e o
  // teto estourado não aparece na fila nem na lista de falhas. Some.
  let presosLiberados = 0;
  let runsFechadas = 0;
  try {
    presosLiberados = await liberarPresos();
    /*
     * E DEPOIS AS RUNS ÓRFÃS DELES, nesta ordem: a linha acima acabou de marcar
     * jobs como FALHOU, e é justamente isso que torna as runs deles
     * irrecuperáveis. Fechar as runs antes deixaria as recém-órfãs para a volta
     * seguinte do cron — que na Vercel Hobby é o dia seguinte.
     */
    runsFechadas = await fecharRunsAbandonadas();
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

  const { comCorrelacao, novaCorrelacao } = await import("../servidor/correlacao");

  for (const job of jobs) {
    const comecou = Date.now();
    try {
      /*
       * UMA CORRELAÇÃO POR JOB — Fase I.
       *
       * Por JOB, e não por lote: o lote processa até cinco pacientes de clínicas
       * possivelmente diferentes, e um id por lote intercalaria cinco histórias
       * numa só — exatamente o problema que a correlação existe para resolver.
       *
       * `comCorrelacao` restaura a anterior no fim, então o job seguinte começa
       * limpo sem ninguém precisar lembrar de limpar.
       */
      const r = await comCorrelacao(
        {
          id: novaCorrelacao(),
          organizationId: job.organizationId,
          origem: "turno",
          conversationId: job.conversationId,
          jobId: job.id,
        },
        () => executarJob(job, opcoes.quem ?? null),
      );

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

  return {
    reservados: jobs.length,
    concluidos,
    descartados,
    falhados,
    presosLiberados,
    runsFechadas,
  };
}

type DesfechoDoJob = { tipo: "feito" } | { tipo: "descartado"; motivo: string };

/**
 * As ferramentas que a clínica desligou. NUNCA LANÇA.
 *
 * Falha de leitura devolve lista vazia — ou seja, NADA desligado. A direção do
 * padrão importa: se uma oscilação do banco desligasse as ferramentas, o agente
 * perderia a agenda e passaria a inventar horário em vez de consultar. O padrão
 * seguro aqui é o comportamento do código, que já passa por política e portões.
 */
async function ferramentasDesligadas(organizationId: string): Promise<readonly string[]> {
  try {
    const { listarFerramentasDaClinica } = await import("../aplicacao/estudios");
    const lista = await listarFerramentasDaClinica(organizationId);
    return lista.filter((f) => !f.ligada).map((f) => f.chave);
  } catch {
    return [];
  }
}

/**
 * Executa UM job: relê as travas, monta as portas e roda o turno.
 *
 * AS TRAVAS SÃO RELIDAS AQUI, e não no momento de enfileirar. A diferença
 * importa: entre a mensagem chegar e o worker rodar pode passar um minuto, e
 * nesse minuto alguém pode ter desligado o agente ou assumido a conversa. Usar o
 * estado do enfileiramento faria o sistema agir com uma decisão que já foi
 * revogada.
 */
async function executarJob(job: AgentJob, quem: string | null): Promise<DesfechoDoJob> {
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
    /*
     * O NÚMERO DE SAÍDA É O DA CLÍNICA DA CONVERSA. Sem `clinicId`, uma
     * organização com duas unidades responderia pelo número de qualquer uma
     * delas — e o roteamento de entrada, que já está certo, não conserta o de
     * saída.
     */
    const { clinicaDaConversa } = await import("../aplicacao/conversas");
    const daConversa = await clinicaDaConversa(job.organizationId, job.conversationId);
    const m = await criarProvedorMensageria(job.organizationId, daConversa?.clinicId ?? null);
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
    quem,
    /*
     * O BATIMENTO, e ele fecha a janela aberta pelo reclaim.
     *
     * O laço chama isto antes de cada passo. Enquanto o turno progride, o lease
     * é renovado e ninguém o reivindica; se a posse tiver sido perdida mesmo
     * assim, o `false` faz o turno parar em vez de responder um paciente que
     * outro worker já está respondendo.
     */
    bater: async () => {
      const { renovarLease } = await import("../aplicacao/agent-jobs");
      return await renovarLease(job.id, job.leaseToken);
    },
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
      /*
       * O TOOL STUDIO CHEGA AO TURNO POR AQUI — Fase G.
       *
       * Sem esta linha, desligar uma ferramenta na tela gravaria a
       * configuração e não mudaria nada: o modelo continuaria vendo a
       * ferramenta no catálogo e continuaria podendo usá-la. É a pior forma de
       * configuração — a pessoa acha que desligou.
       */
      desligadas: await ferramentasDesligadas(job.organizationId),
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
