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
  /** Os webhooks que falharam e voltaram à fila. Ver `repescarWebhooks`. */
  webhooks: { reservados: number; recuperados: number; falhados: number; descartados: number };
  eventos: { reservados: number; processados: number; falhados: number; semHandler: number };
  turnos: { reservados: number; concluidos: number; descartados: number; falhados: number };
  /** Uma entrada por organização que teve jornada avançada. */
  jornadas: { organizationId: string; avancadas: number; concluidas: number; falhadas: number }[];
  /** Uma entrada por organização que tinha campanha rodando. Ver `baterPulso`. */
  campanhas: { organizationId: string; enviadas: number; puladas: number }[];
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
 *   3. JORNADAS E CAMPANHAS por último. Trabalho proativo — importante, e pode
 *      ceder a vez para quem está com uma conversa aberta.
 *
 * ============================================================================
 *  POR QUE CAMPANHA ENTROU NO PULSO, se ela é trabalho de base.
 *
 *  Porque ela estava na volta pesada, que roda UMA VEZ POR DIA — e o lote era
 *  de 25. "100 contatos por dia" virava 25 por dia, e a campanha de 964 pessoas
 *  levava 38 dias em vez de 10. Sem erro, sem alerta: a tela mostrava a
 *  campanha RODANDO com progresso.
 *
 *  O CONSERTO NÃO É UM LOTE DE 100. Cem mensagens às 8h05 derruba a reputação
 *  do número, e a partir daí nada chega. O que a campanha precisava era de
 *  MUITAS VOLTAS PEQUENAS — que é exatamente o que o pulso é.
 *
 *  Quem decide quantas saem agora é `cotaAcumulada`, em `dominio/cadencia.ts`:
 *  a cota cresce com a janela comercial e o dia fecha na meta.
 *
 *  E ISTO NÃO RECOLOCA O TRABALHO CARO NO CAMINHO QUENTE: campanha é leitura de
 *  uma tabela pequena e, quando não há campanha RODANDO, a volta custa uma
 *  consulta que não devolve nada. Sincronização do Dental Office continua na
 *  volta pesada, onde o argumento de custo vale de verdade.
 * ============================================================================
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
    /** Teto de mensagens de campanha por volta. O freio, não a cadência. */
    limiteCampanha?: number;
    quem?: string;
  } = {},
): Promise<ResultadoDoPulso> {
  const comecou = Date.now();

  /*
   * O BATIMENTO ABRE E FECHA A VOLTA — `aplicacao/heartbeat.ts`.
   *
   * Sem ele, "o pulso parou" e indistinguivel de "nao ha trabalho": os dois
   * produzem silencio. Com ele, o painel de Saude compara `ultimo_sucesso_em`
   * com o relogio e diz qual dos dois e.
   *
   * O `inicio` sozinho nao serve de prova: um worker que comeca e morre no meio
   * a cada cinco minutos tem `ultimo_inicio_em` sempre fresco.
   */
  const { baterHeartbeat, WORKER_PULSO } = await import("../aplicacao/heartbeat");
  await baterHeartbeat(WORKER_PULSO, "inicio");

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
  /*
   * OS WEBHOOKS REPESCADOS VÊM ANTES DOS EVENTOS, e a ordem importa: repescar
   * um envelope GERA `message.received`. Na ordem inversa, a mensagem
   * recuperada esperaria a volta seguinte do pulso para virar turno — o
   * paciente ganharia mais cinco minutos de silêncio por um problema que já
   * tinha sido resolvido.
   */
  const { repescarWebhooks } = await import("../aplicacao/webhooks");
  const repescagem = await repescarWebhooks({ quem: opcoes.quem ?? "pulso" });

  const { processarEventos } = await import("../aplicacao/eventos");
  const eventos = await processarEventos(opcoes.limiteEventos ?? 40);

  const { processarTurnosDoAgente } = await import("./agente-worker");
  const turnos = await processarTurnosDoAgente({
    limite: opcoes.limiteTurnos ?? 5,
    quem: opcoes.quem ?? `pulso:${new Date().toISOString()}`,
  });

  const jornadas: ResultadoDoPulso["jornadas"] = [];
  const campanhas: ResultadoDoPulso["campanhas"] = [];
  const organizacoes = await organizacoesAtivas();

  for (const organizationId of organizacoes) {
    try {
      const r = await avancarJornadasDe(organizationId, opcoes.limiteJornadas ?? 30);
      if (r !== null) jornadas.push({ organizationId, ...r });

      const c = await avancarCampanhasDe(organizationId, opcoes.limiteCampanha ?? 10);
      if (c !== null) campanhas.push({ organizationId, ...c });
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

  const resultado: ResultadoDoPulso = {
    webhooks: {
      reservados: repescagem.reservados,
      recuperados: repescagem.recuperados,
      falhados: repescagem.falhados,
      descartados: repescagem.descartados,
    },
    eventos,
    turnos: {
      reservados: turnos.reservados,
      concluidos: turnos.concluidos,
      descartados: turnos.descartados,
      falhados: turnos.falhados,
    },
    jornadas,
    campanhas,
    organizacoes: organizacoes.length,
    duracaoMs: Date.now() - comecou,
  };

  /*
   * O RESUMO VAI JUNTO, e e ele que responde a pergunta SEGUINTE: "o pulso esta
   * vivo, entao por que a fila nao anda?". Um pulso vivo com `turnos: 0` e fila
   * cheia e um problema diferente de um pulso morto — e sem isto os dois tem a
   * mesma cara no painel.
   */
  await baterHeartbeat(WORKER_PULSO, "sucesso", {
    duracaoMs: resultado.duracaoMs,
    metricas: {
      eventos: resultado.eventos.processados,
      turnos: resultado.turnos.concluidos,
      webhooks: resultado.webhooks.recuperados,
      jornadas: resultado.jornadas.reduce((n, j) => n + j.avancadas, 0),
      campanhas: resultado.campanhas.reduce((n, c) => n + c.enviadas, 0),
      organizacoes: resultado.organizacoes,
    },
  });

  return resultado;
}

/**
 * Avança as campanhas de uma organização — o lote pequeno e frequente.
 *
 * `null` quando nada saiu, pelo mesmo motivo das jornadas: um relatório com
 * cinquenta organizações zeradas esconde as duas que fizeram algo.
 */
async function avancarCampanhasDe(
  organizationId: string,
  limitePorVolta: number,
): Promise<{ enviadas: number; puladas: number } | null> {
  const { lerConfiguracao, lerKillSwitches } = await import("../servidor/configuracao");
  const { criarProvedorMensageria } = await import("../integracoes/whatsapp/provedores");
  const { rodarCampanhas } = await import("../aplicacao/campanhas");

  const [configuracao, switches] = await Promise.all([
    lerConfiguracao(organizationId),
    lerKillSwitches(organizationId),
  ]);

  const provedor = await criarProvedorMensageria(organizationId);

  const r = await rodarCampanhas({
    organizationId,
    porta: provedor.configurado ? provedor.porta : null,
    configuracao,
    enviosPausados: switches["kill_envios"] === true || switches["kill_automacoes"] === true,
    limitePorVolta,
  });

  if (r.enviadas === 0 && r.puladas === 0) return null;
  return { enviadas: r.enviadas, puladas: r.puladas };
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
 * SÓ AS QUE TÊM TRABALHO, e não todas as cadastradas. A diferença aparece
 * quando a instalação cresce: visitar cinquenta organizações para descobrir que
 * quarenta e oito não têm nada pendente são quarenta e oito idas ao banco por
 * volta, a cada poucos minutos, para nada.
 *
 * SÃO DUAS PERGUNTAS, E AS DUAS PRECISAM ESTAR AQUI: jornada pronta para
 * avançar, e campanha RODANDO. Deixar a campanha de fora faria o laço pular
 * exatamente a organização que só tem campanha — que é o caso de quem acabou de
 * agendar uma e está olhando a tela esperando ela andar.
 */
async function organizacoesAtivas(agora = new Date()): Promise<string[]> {
  const { selecionar } = await import("../servidor/banco");

  const [jornadas, campanhas] = await Promise.all([
    selecionar("crc_automation_enrollments", {
      colunas: "organization_id",
      filtros: [
        { coluna: "status", op: "in", valor: ["ACTIVE", "WAITING"] },
        { coluna: "resume_at", op: "lte", valor: agora.toISOString() },
      ],
      limite: 1000,
    }),
    selecionar("crc_campaigns", {
      colunas: "organization_id",
      filtros: [{ coluna: "status", op: "eq", valor: "RODANDO" }],
      limite: 1000,
    }),
  ]);

  const vistos = new Set<string>();
  for (const l of [...jornadas, ...campanhas]) {
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

  const provedor = await criarProvedorMensageria(organizationId);

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
