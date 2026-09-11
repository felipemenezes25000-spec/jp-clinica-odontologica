/**
 * O pulso — o trabalho que não pode esperar o dia seguinte.
 *
 * ========================================================================
 *  O DEFEITO QUE ISTO CONSERTA, e ele anulava boa parte do sistema.
 *
 *  O CRC construiu uma fila durável muito boa: reserva atômica, lease, retry,
 *  backoff, dead letter. E chamava o consumidor dela **uma vez por dia**, pelo
 *  cron das 9h. O resultado, na prática:
 *
 *      14:03  paciente escreve "quero remarcar"
 *             ↓
 *             webhook grava a mensagem, emite `message.received`
 *             ↓
 *             o evento entra na fila
 *             ↓
 *             ninguém consome
 *             ↓
 *      09:00  DO DIA SEGUINTE — o agente finalmente responde
 *
 *  Uma fila excelente consumida em cadência de batch diário. O paciente do
 *  outro lado não vê arquitetura: vê uma clínica que respondeu 19 horas depois.
 * ========================================================================
 *
 * A SEPARAÇÃO QUE ESTE ARQUIVO INTRODUZ:
 *
 *   PULSO (aqui, a cada poucos minutos)   eventos, turnos do agente, jornadas
 *                                          vencidas. Tudo que tem alguém
 *                                          esperando do outro lado.
 *
 *   MOTOR (`/api/crc/motor`, diário)      sincronização do Dental Office,
 *                                          campanhas, varreduras, recálculo de
 *                                          prioridade. Trabalho de base.
 *
 * Rodar a sincronização a cada cinco minutos bateria no Dental Office 288 vezes
 * por dia para trazer quase nada — e é justamente o passo mais caro e mais
 * sujeito a limite de taxa. Separar não é organização: é o que torna o pulso
 * frequente possível.
 *
 * POR QUE ISTO NÃO É UM WORKER RESIDENTE. O projeto roda em serverless, e no
 * plano atual o cron da plataforma é diário. Quem bate o pulso é um agendador
 * externo (GitHub Actions) mais um disparo do próprio webhook — ver
 * `.github/workflows/crc-pulso.yml`. A durabilidade continua no banco; o
 * agendador só decide QUANDO acordar.
 */
import { registrar } from "../servidor/registro";

export type ResultadoDoPulso = {
  eventos: { reservados: number; processados: number; falhados: number; semHandler: number };
  turnos: { reservados: number; concluidos: number; descartados: number; falhados: number };
  /** Uma entrada por organização que teve jornada avançada. */
  jornadas: { organizationId: string; avancadas: number; concluidas: number; falhadas: number }[];
  organizacoes: number;
  duracaoMs: number;
};

/**
 * Uma volta do pulso.
 *
 * A ORDEM É A DA URGÊNCIA, e cada passo depende do anterior:
 *
 *   1. EVENTOS primeiro. É o processamento de evento que enfileira o turno do
 *      agente; rodar o agente antes faria a fila pegar só o que sobrou da volta
 *      anterior, e toda resposta chegaria uma volta atrasada.
 *
 *   2. TURNOS depois. O paciente que acabou de escrever espera agora.
 *
 *   3. JORNADAS por último. Trabalho de recuperação — importante, e pode ceder
 *      a vez para quem está com uma conversa aberta.
 *
 * NUNCA LANÇA. Um erro numa organização não pode impedir as outras de serem
 * atendidas: num SaaS, isso seria uma clínica derrubando o atendimento das
 * vizinhas.
 */
export async function baterPulso(
  opcoes: {
    limiteEventos?: number;
    limiteTurnos?: number;
    limiteJornadas?: number;
    quem?: string;
  } = {},
): Promise<ResultadoDoPulso> {
  const comecou = Date.now();

  const { instalarHandlers } = await import("./handlers");
  // Numa instância fria o módulo carrega do zero; a função é idempotente.
  instalarHandlers();

  /*
   * EVENTOS E TURNOS JÁ SÃO GLOBAIS, e isso não é acidente feliz: as duas RPCs
   * de reserva (`crc_reservar_eventos`, `crc_reservar_agent_jobs`) não filtram
   * por organização, e cada linha carrega o `organization_id` dela. O handler e
   * o worker leem o tenant DA LINHA.
   *
   * Ou seja: o caminho quente — paciente escreve, evento, turno, resposta — já
   * atende todas as organizações numa chamada só. O que estava preso numa
   * clínica era o lado batch, e é ele que o laço abaixo conserta.
   */
  const { processarEventos } = await import("../aplicacao/eventos");
  const eventos = await processarEventos(opcoes.limiteEventos ?? 40);

  const { processarTurnosDoAgente } = await import("./agente-worker");
  const turnos = await processarTurnosDoAgente({
    limite: opcoes.limiteTurnos ?? 5,
    quem: opcoes.quem ?? `pulso:${new Date().toISOString()}`,
  });

  const jornadas: ResultadoDoPulso["jornadas"] = [];
  const organizacoes = await organizacoesAtivas();

  for (const organizationId of organizacoes) {
    try {
      const r = await avancarJornadasDe(organizationId, opcoes.limiteJornadas ?? 30);
      if (r !== null) jornadas.push({ organizationId, ...r });
    } catch (erro) {
      /*
       * ENGOLE E SEGUE, com registro. A alternativa — deixar subir — faria a
       * primeira organização com problema impedir todas as seguintes de terem
       * jornada avançada naquela volta. Numa instalação de uma clínica dá na
       * mesma; com dez, é uma derrubando nove.
       */
      registrar("erro", "O pulso falhou nas jornadas de uma organização.", {
        organizationId,
        detalhe: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  return {
    eventos,
    turnos: {
      reservados: turnos.reservados,
      concluidos: turnos.concluidos,
      descartados: turnos.descartados,
      falhados: turnos.falhados,
    },
    jornadas,
    organizacoes: organizacoes.length,
    duracaoMs: Date.now() - comecou,
  };
}

/**
 * Dá um toque no pulso, sem esperar por ele.
 *
 * O CAMINHO QUE TORNA A RESPOSTA RÁPIDA DE VERDADE. O agendador externo roda a
 * cada cinco minutos; este toque roda no instante em que a mensagem do paciente
 * chega. Com ele, o caminho é: webhook → toque → turno, em segundos.
 *
 * POR QUE NÃO PROCESSAR ALI MESMO, DENTRO DO WEBHOOK. Porque o handler de
 * `message.received` chama modelo — a classificação da conversa. Processar
 * inline faria a Meta esperar uma chamada de IA para receber o `200`, e webhook
 * lento é webhook que a Meta repete e depois desliga.
 *
 * POR QUE O `await` COM PRAZO CURTO, e não um "dispara e esquece" puro. Em
 * serverless não existe "depois": assim que o handler retorna, a função pode ser
 * congelada — e uma promessa solta morre antes de a requisição sair. O `await`
 * com `AbortSignal.timeout` garante que o pedido SAIU; abortar a leitura da
 * resposta não cancela a invocação do outro lado, que já começou e segue sozinha.
 *
 * NUNCA LANÇA, E É O PONTO. Este toque é aceleração, não garantia: se ele
 * falhar, o agendador externo pega o mesmo trabalho na volta seguinte. Deixar um
 * erro daqui derrubar o webhook trocaria "a resposta demora cinco minutos" por
 * "a Meta reenvia o webhook", que é bem pior.
 */
export async function tocarPulso(): Promise<void> {
  const segredo = (process.env["CRON_SECRET"] ?? "").trim();
  const base = (process.env["CRC_URL_PUBLICA"] ?? "").trim();

  // Sem segredo ou sem endereço, não há toque — e não há erro: o agendador
  // externo continua sendo a rede. Registrar aqui encheria o log a cada
  // webhook num ambiente de desenvolvimento.
  if (segredo.length === 0 || base.length === 0) return;

  try {
    await fetch(`${base.replace(/\/+$/u, "")}/api/crc/pulso`, {
      method: "POST",
      headers: { authorization: `Bearer ${segredo}` },
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Inclui o próprio timeout, que é o caso ESPERADO: o pulso demora mais que
    // dois segundos, e é exatamente por isso que não esperamos por ele.
  }
}

/**
 * As organizações que o pulso precisa visitar.
 *
 * SÓ AS QUE TÊM JORNADA ESPERANDO, e não todas as cadastradas. A diferença
 * aparece quando a instalação cresce: visitar cinquenta organizações para
 * descobrir que quarenta e oito não têm nada pendente são quarenta e oito idas
 * ao banco por volta, a cada poucos minutos, para nada.
 *
 * A consulta olha as inscrições prontas para avançar e devolve os tenants
 * distintos. Uma leitura para saber onde há trabalho, em vez de N para
 * descobrir que não há.
 */
async function organizacoesAtivas(agora = new Date()): Promise<string[]> {
  const { selecionar } = await import("../servidor/banco");

  const linhas = await selecionar("crc_automation_enrollments", {
    colunas: "organization_id",
    filtros: [
      { coluna: "status", op: "in", valor: ["ACTIVE", "WAITING"] },
      { coluna: "resume_at", op: "lte", valor: agora.toISOString() },
    ],
    limite: 1000,
  });

  const vistos = new Set<string>();
  for (const l of linhas) {
    const id = String(l["organization_id"] ?? "");
    if (id.length > 0) vistos.add(id);
  }
  return [...vistos];
}

/** Avança as jornadas de uma organização, montando o contexto dela. */
async function avancarJornadasDe(
  organizationId: string,
  limite: number,
): Promise<{ avancadas: number; concluidas: number; falhadas: number } | null> {
  const { lerConfiguracao, lerKillSwitches } = await import("../servidor/configuracao");
  const { criarProvedorMensageria } = await import("../integracoes/whatsapp/provedores");
  const { rodarCiclo } = await import("./motor");

  const [configuracao, switches] = await Promise.all([
    lerConfiguracao(organizationId),
    lerKillSwitches(organizationId),
  ]);

  const provedor = criarProvedorMensageria(organizationId);

  const r = await rodarCiclo(
    {
      organizationId,
      porta: provedor.configurado ? provedor.porta : null,
      configuracao,
      enviosPausados: switches["kill_envios"] === true,
      automacoesPausadas: switches["kill_automacoes"] === true,
    },
    limite,
  );

  // Nada avançado não vira linha no relatório: um relatório com cinquenta
  // organizações zeradas esconde as duas que fizeram algo.
  if (r.reservadas === 0) return null;
  return { avancadas: r.avancadas, concluidas: r.concluidas, falhadas: r.falhadas };
}
