/**
 * A saúde dos provedores — Fase F.
 *
 * A PERGUNTA QUE ISTO RESPONDE é operacional, e hoje não tem resposta: **"o
 * agente parou de responder. É a gente ou é eles?"**
 *
 * Sem isso, quem está na recepção às 19h de uma sexta vê a fila parar e não tem
 * como distinguir entre provedor fora do ar, chave vencida, teto de gasto
 * estourado, kill switch acionado por engano ou worker que morreu. As cinco
 * coisas têm a mesma aparência: nada acontece.
 *
 * O QUE ELE LÊ, e de onde:
 *
 *   BATIMENTO       `crc_runtime_heartbeats`. Diz se o PULSO está vivo.
 *   DISJUNTORES     memória do processo. Diz se o provedor está cortado AGORA.
 *   FILA            `crc_agent_jobs`. Diz se há trabalho parado e há quanto tempo.
 *   WEBHOOKS        `crc_webhook_inbox`. Diz se mensagem do paciente está presa.
 *   DEAD LETTERS    `crc_dead_letters`. Diz o que já foi perdido e espera gente.
 *   RUNS ABERTAS    `crc_ai_runs` com `RODANDO`. Diz se algum worker morreu.
 *   ORÇAMENTO       `crc_ai_gastos`. Diz se o teto está segurando.
 *   CREDENCIAIS     as integrações. Diz se falta configuração para funcionar.
 *   SCHEMA          `crc_schema_migrations`. Diz se o banco tem o que o código espera.
 *   INTERRUPTORES   `crc_feature_flags`. Diz se alguém desligou de propósito.
 *
 * ========================================================================
 *  O SINAL QUE FALTAVA ERA O PRIMEIRO, e a falta dele apontava para o lado
 *  errado. O caminho rápido do CRC é webhook → `tocarPulso()` → `/api/crc/pulso`,
 *  com o GitHub Actions como rede. Os dois podem parar em silêncio — segredo
 *  removido do repositório, `CRC_URL_PUBLICA` não configurada — e o sintoma é
 *  NADA acontecendo.
 *
 *  O painel dizia: "há pacientes esperando há 40 minutos. Confira se o cron do
 *  motor está rodando." O motor é o worker diário, e não tem relação nenhuma
 *  com o atraso. Mandar olhar o lugar errado é pior do que não dizer nada.
 * ========================================================================
 *
 * POR QUE O DISJUNTOR É O ÚNICO QUE NÃO PERSISTE, e por que isso é aceitável:
 * ele vive na instância que está executando. Numa função serverless, cada
 * instância aprende sozinha. É pouco — e é exatamente onde a cascata acontece,
 * porque o lote inteiro do cron roda numa instância só.
 *
 * NADA AQUI LANÇA. Um painel de saúde que quebra quando o sistema está doente é
 * um painel que só funciona quando não é necessário.
 */

export type Severidade = "ok" | "atencao" | "critico";

export type SinalDeSaude = {
  /** Estável, para métrica. */
  codigo: string;
  /** Em português, para quem está na recepção. */
  titulo: string;
  /** O que fazer. Um sinal sem próxima ação é ruído. */
  acao: string;
  severidade: Severidade;
  detalhe: string;
};

export type PanoramaDeSaude = {
  severidade: Severidade;
  sinais: SinalDeSaude[];
  /** Quando este retrato foi tirado. */
  em: string;
};

/** Quanto tempo um job pode esperar antes de virar sinal. */
const ESPERA_ACEITAVEL_MIN = 15;

/**
 * Os limiares do batimento do pulso.
 *
 * O AGENDADOR PEDE A CADA 5 MINUTOS, E ISSO NÃO É UM SLA. O `schedule` do
 * GitHub Actions é best-effort: sob carga a fila de Actions atrasa, e cinco
 * minutos viram quinze. Alertar aos seis minutos produziria um alarme por dia
 * que não significa nada — e um alarme que não significa nada é o que faz o
 * próximo, verdadeiro, ser ignorado.
 *
 * DOZE MINUTOS para atenção: mais de duas janelas perdidas, o que já não é
 * atraso normal. TRINTA para crítico: a essa altura o webhook também não está
 * tocando o pulso, e são duas redes caídas ao mesmo tempo.
 */
const PULSO_ATENCAO_MIN = 12;
const PULSO_CRITICO_MIN = 30;

/**
 * A migração mais nova que ESTE código precisa.
 *
 * Ela sobe junto com o deploy, e o SQL é aplicado à mão — então existe uma
 * janela em que o código é mais novo que o banco. O sinal a torna visível em
 * vez de deixá-la aparecer como erro aleatório no meio de um turno.
 */
const MIGRACAO_ESPERADA = "28-crc-configuracao-por-clinica.sql";

/** Uma run aberta além disto significa worker morto, não turno demorado. */
const RUN_ABERTA_DEMAIS_MIN = 30;

export async function panoramaDeSaude(
  organizationId: string,
  agora = new Date(),
): Promise<PanoramaDeSaude> {
  const sinais: SinalDeSaude[] = [];

  for (const olhar of [
    olharPulso,
    olharDisjuntores,
    olharFila,
    olharWebhooks,
    olharDeadLetters,
    olharRunsAbertas,
    olharOrcamento,
    olharCredenciais,
    olharSchema,
    olharInterruptores,
  ]) {
    try {
      sinais.push(...(await olhar(organizationId, agora)));
    } catch (erro) {
      /*
       * UMA LEITURA QUE FALHA VIRA SINAL, e não silêncio.
       *
       * Se `crc_agent_jobs` não responde, isso É a notícia — provavelmente a
       * mesma coisa que está travando o atendimento. Engolir o erro faria o
       * painel dizer "tudo bem" no meio de um incidente de banco.
       */
      sinais.push({
        codigo: "leitura_falhou",
        titulo: "Não foi possível ler parte do estado do sistema.",
        acao: "Verifique o banco. Se ele está fora, é provavelmente a causa de tudo.",
        severidade: "critico",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      });
    }
  }

  return {
    severidade: piorDe(sinais),
    sinais,
    em: agora.toISOString(),
  };
}

const ORDEM: Record<Severidade, number> = { ok: 0, atencao: 1, critico: 2 };

const piorDe = (sinais: readonly SinalDeSaude[]): Severidade =>
  sinais.reduce<Severidade>(
    (pior, s) => (ORDEM[s.severidade] > ORDEM[pior] ? s.severidade : pior),
    "ok",
  );

/* -------------------------------------------------------------------------- */

/**
 * O pulso bateu?
 *
 * ESTE SINAL VEM PRIMEIRO na lista de propósito. Quando o pulso está morto,
 * todos os outros são consequência: a fila parece parada, os webhooks parecem
 * presos, as runs parecem penduradas. Mostrá-lo no topo é a diferença entre um
 * diagnóstico e uma lista de sintomas.
 */
async function olharPulso(_organizationId: string, agora: Date): Promise<SinalDeSaude[]> {
  const { lerHeartbeats, minutosDesdeOSucesso, WORKER_PULSO } = await import("./heartbeat");

  const batimentos = await lerHeartbeats();
  const pulso = batimentos.find((b) => b.worker === WORKER_PULSO);
  const minutos = minutosDesdeOSucesso(pulso, agora);

  /*
   * NUNCA BATEU É DIFERENTE DE PAROU, e as duas conversas são diferentes: a
   * primeira é configuração que nunca foi feita, a segunda é algo que quebrou.
   * Juntar as duas num "pulso parado" mandaria quem instalou hoje procurar um
   * defeito que não existe.
   */
  if (minutos === null) {
    return [
      {
        codigo: "pulso_nunca_bateu",
        titulo: "O pulso nunca rodou neste ambiente.",
        acao: "Configure CRON_SECRET no repositório e CRC_URL_PUBLICA no servidor. Sem os dois, nada consome a fila.",
        severidade: "critico",
        detalhe: "Nenhum registro em crc_runtime_heartbeats para o worker 'pulso'.",
      },
    ];
  }

  if (minutos < PULSO_ATENCAO_MIN) return [];

  return [
    {
      codigo: "pulso_parado",
      titulo: `O pulso não completa uma volta há ${String(minutos)} minutos.`,
      /*
       * A AÇÃO APONTA PARA O PULSO, e não para o motor. A versão anterior deste
       * painel mandava conferir `/api/crc/motor` — o worker diário, sem relação
       * com o atraso. Mandar olhar o lugar errado custa mais tempo do que não
       * dizer nada.
       */
      acao: "Veja o workflow 'CRC Pulso' no GitHub Actions. Para destravar agora: POST /api/crc/pulso com o CRON_SECRET.",
      severidade: minutos >= PULSO_CRITICO_MIN ? "critico" : "atencao",
      detalhe:
        pulso?.ultimoErro === null || pulso?.ultimoErro === undefined
          ? `Última volta bem-sucedida às ${String(pulso?.ultimoSucessoEm ?? "—")}.`
          : `Último erro: ${pulso.ultimoErro}`,
    },
  ];
}

/**
 * Mensagem de paciente presa na porta de entrada.
 *
 * O WEBHOOK É O ÚNICO PONTO EM QUE A PERDA É DEFINITIVA. A Meta já recebeu
 * `200` — para ela, entregue. Se o envelope não for aplicado aqui, não existe
 * quem reenvie: a mensagem simplesmente deixou de existir para a clínica.
 */
async function olharWebhooks(organizationId: string, agora: Date): Promise<SinalDeSaude[]> {
  const { selecionar } = await import("../servidor/banco");

  const presos = await selecionar("crc_webhook_inbox", {
    colunas: "id,status,criado_em,tentativas",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "in", valor: ["PENDENTE", "FALHOU", "PROCESSANDO"] },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 200,
  });

  if (presos.length === 0) return [];

  const maisAntigo = Date.parse(String(presos[0]?.["criado_em"] ?? ""));
  const minutos = Number.isFinite(maisAntigo)
    ? Math.round((agora.getTime() - maisAntigo) / 60_000)
    : 0;

  // Abaixo de dez minutos é a fila funcionando: o envelope acabou de chegar e o
  // backoff do webhook começa em 15 segundos.
  if (minutos < 10) return [];

  return [
    {
      codigo: "webhook_preso",
      titulo: `${String(presos.length)} mensagens recebidas ainda não foram aplicadas.`,
      acao: "É o pulso que repesca webhook. Confira o sinal do pulso acima antes de investigar aqui.",
      severidade: minutos > 60 ? "critico" : "atencao",
      detalhe: `A mais antiga chegou há ${String(minutos)} minutos.`,
    },
  ];
}

/** O que já foi perdido e espera alguém. */
async function olharDeadLetters(organizationId: string): Promise<SinalDeSaude[]> {
  const { selecionar } = await import("../servidor/banco");

  const mortas = await selecionar("crc_dead_letters", {
    colunas: "id,origem",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "eq", valor: "PENDENTE" },
    ],
    limite: 200,
  });

  if (mortas.length === 0) return [];

  const porOrigem = new Map<string, number>();
  for (const m of mortas) {
    const o = String(m["origem"] ?? "?");
    porOrigem.set(o, (porOrigem.get(o) ?? 0) + 1);
  }

  return [
    {
      codigo: "dead_letters_pendentes",
      titulo: `${String(mortas.length)} itens na fila de falhas esperando alguém.`,
      // Cada um destes é uma pessoa que escreveu e não foi respondida. Eles não
      // saem de lá sozinhos, e é por isso que o sinal é crítico.
      acao: "Abra a fila de falhas, responda à mão e marque como resolvido.",
      severidade: "critico",
      detalhe: [...porOrigem].map(([o, n]) => `${o}: ${String(n)}`).join(", "),
    },
  ];
}

/**
 * Falta credencial para o sistema fazer o que promete?
 *
 * SEPARADO DO DISJUNTOR de propósito: provedor cortado é uma coisa que se
 * recupera sozinha; credencial ausente não melhora com o tempo, e o painel
 * precisa dizer qual dos dois é.
 */
async function olharCredenciais(organizationId: string): Promise<SinalDeSaude[]> {
  const { criarProvedorMensageria } = await import("../integracoes/whatsapp/provedores");

  const zap = await criarProvedorMensageria(organizationId);
  if (zap.configurado) return [];

  return [
    {
      codigo: "credencial_ausente",
      titulo: "O WhatsApp não está configurado para esta organização.",
      acao: `${zap.motivo}${zap.faltando.length > 0 ? ` Falta: ${zap.faltando.join(", ")}.` : ""}`,
      /*
       * CRÍTICO, e não atenção: sem canal de saída, tudo que este sistema faz
       * termina em nada. A automação continua rodando, as jornadas continuam
       * avançando, e nenhuma mensagem chega a ninguém.
       */
      severidade: "critico",
      detalhe: "Cadastre o canal da clínica ou configure as variáveis do provedor.",
    },
  ];
}

/**
 * O banco tem o schema que este código espera?
 *
 * ========================================================================
 *  ISTO EXISTE POR CAUSA DO `supabase/23`. O código foi para produção
 *  esperando uma chave primária que o banco ainda não tinha, e a única razão de
 *  nada ter quebrado é que a integração que usaria aquele caminho estava
 *  desligada. Um alarme ali teria custado dois minutos.
 *
 *  E ESTE SINAL LÊ BOOKKEEPING, NÃO EVIDÊNCIA. `crc_schema_migrations` diz o
 *  que alguém registrou, e não o que está no banco. É barato e serve para o
 *  caso comum — "esqueci de rodar" —, e por isso a ação aponta para
 *  `npm run schema:status`, que SONDA os objetos de verdade.
 * ========================================================================
 */
async function olharSchema(): Promise<SinalDeSaude[]> {
  const { selecionarUm } = await import("../servidor/banco");

  try {
    const linha = await selecionarUm("crc_schema_migrations", {
      colunas: "nome",
      filtros: [{ coluna: "nome", op: "eq", valor: MIGRACAO_ESPERADA }],
    });
    if (linha !== null) return [];
  } catch {
    // A própria tabela não existe: o banco está atrás do `supabase/27`, que é
    // exatamente o que este sinal quer dizer. Cai no retorno abaixo.
  }

  return [
    {
      codigo: "schema_atrasado",
      titulo: "O banco não registra a migração que este código espera.",
      acao: `Rode supabase/${MIGRACAO_ESPERADA} e depois \`npm run schema:status\` para conferir objeto por objeto.`,
      severidade: "atencao",
      detalhe: `Esperado: ${MIGRACAO_ESPERADA}.`,
    },
  ];
}

async function olharDisjuntores(organizationId: string, agora: Date): Promise<SinalDeSaude[]> {
  const { disjuntoresAbertos } = await import("../dominio/disjuntor");

  return disjuntoresAbertos(agora)
    .filter(({ chave }) => chave.includes(organizationId))
    .map(({ chave, leitura }) => ({
      codigo: "provedor_cortado",
      titulo: `O provedor está fora do ar e as chamadas estão sendo cortadas.`,
      acao:
        leitura.estado === "meio_aberto"
          ? "Uma chamada de teste está passando agora. Se funcionar, o atendimento volta sozinho."
          : `Aguarde: a próxima tentativa é a partir de ${leitura.liberaEm?.toLocaleTimeString("pt-BR") ?? "instantes"}. Se persistir, troque a rota da finalidade para outro provedor.`,
      // MEIO-ABERTO É ATENÇÃO, E NÃO CRÍTICO: o sistema já está tentando voltar
      // sozinho, e mostrar vermelho aí faria a recepção agir quando não precisa.
      severidade: leitura.estado === "meio_aberto" ? "atencao" : "critico",
      detalhe: `${chave} — ${String(leitura.falhasSeguidas)} falhas seguidas.`,
    }));
}

async function olharFila(organizationId: string, agora: Date): Promise<SinalDeSaude[]> {
  const { panoramaDaFila } = await import("./agent-jobs");
  const fila = await panoramaDaFila(organizationId, agora);

  const sinais: SinalDeSaude[] = [];

  if (fila.esperaMaisAntigaMin !== null && fila.esperaMaisAntigaMin > ESPERA_ACEITAVEL_MIN) {
    sinais.push({
      codigo: "fila_parada",
      titulo: `Há pacientes esperando resposta há ${String(fila.esperaMaisAntigaMin)} minutos.`,
      /*
       * QUEM CONSOME A FILA DE TURNOS É O PULSO, e a versão anterior desta
       * linha mandava conferir `/api/crc/motor` — o worker DIÁRIO, que
       * sincroniza o Dental Office e roda varreduras. Ele não tem relação
       * nenhuma com o atraso, e mandar olhar o lugar errado custa mais tempo do
       * que não dizer nada.
       */
      acao: "Quem consome esta fila é o pulso — confira o sinal dele acima. Para destravar agora: POST /api/crc/pulso com o CRON_SECRET.",
      severidade: fila.esperaMaisAntigaMin > 60 ? "critico" : "atencao",
      detalhe: `${String(fila.pendentes)} pendentes, ${String(fila.repetindo)} repetindo.`,
    });
  }

  if (fila.falhos > 0) {
    sinais.push({
      codigo: "jobs_falhos",
      titulo: `${String(fila.falhos)} turnos esgotaram as tentativas.`,
      // Cada um destes é um paciente que escreveu e não foi respondido. A dead
      // letter existe justamente para essa lista não sumir.
      acao: "Cada um é um paciente sem resposta. Veja as dead letters e responda à mão.",
      severidade: "critico",
      detalhe: "Registrados em crc_dead_letters com origem agent_job.",
    });
  }

  return sinais;
}

async function olharRunsAbertas(organizationId: string, agora: Date): Promise<SinalDeSaude[]> {
  const { selecionar } = await import("../servidor/banco");
  const corte = new Date(agora.getTime() - RUN_ABERTA_DEMAIS_MIN * 60_000).toISOString();

  const linhas = await selecionar("crc_ai_runs", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "resultado", op: "eq", valor: "RODANDO" },
      { coluna: "iniciado_em", op: "lt", valor: corte },
    ],
    limite: 100,
  });

  if (linhas.length === 0) return [];

  return [
    {
      codigo: "runs_penduradas",
      titulo: `${String(linhas.length)} turnos começaram e nunca terminaram.`,
      /*
       * ESTE SINAL SÓ EXISTE POR CAUSA DA FASE B. A run passou a nascer ANTES
       * da chamada de modelo, para a idempotência vir antes do gasto. O preço
       * é que uma run pode ficar aberta — e o preço virou benefício: é
       * exatamente ela que denuncia o worker que morreu no meio.
       */
      acao: "Provavelmente um worker morreu no meio. A fila se recupera sozinha pelo lease; se não, rode a limpeza de jobs presos.",
      severidade: linhas.length > 10 ? "critico" : "atencao",
      detalhe: `Abertas há mais de ${String(RUN_ABERTA_DEMAIS_MIN)} minutos.`,
    },
  ];
}

/**
 * O custo de uma chamada típica, em micro-reais. R$ 0,01.
 *
 * ELE EXISTE PORQUE A PERGUNTA CERTA NÃO É "posso gastar zero?". Com o gasto
 * exatamente no teto, "cabe mais zero" é verdade — e o painel diria "atenção"
 * enquanto a próxima chamada de verdade já estaria sendo recusada.
 *
 * A pergunta que interessa a quem olha o painel é: **a próxima resposta ao
 * paciente vai sair?** Para responder isso é preciso perguntar com um valor
 * plausível, e não com zero.
 */
const CHAMADA_TIPICA_MICRO = 10_000;

async function olharOrcamento(organizationId: string, agora: Date): Promise<SinalDeSaude[]> {
  const { avaliarOrcamento } = await import("../dominio/orcamento");
  const { lerGasto, lerOrcamento } = await import("./orcamento");

  const [tetos, gasto] = await Promise.all([
    lerOrcamento(organizationId),
    lerGasto(organizationId, agora),
  ]);
  const veredicto = avaliarOrcamento(tetos, gasto, CHAMADA_TIPICA_MICRO);

  if (veredicto.pode && !veredicto.alerta) return [];

  if (!veredicto.pode) {
    return [
      {
        codigo: "teto_estourado",
        titulo: "O teto de gasto de IA foi atingido.",
        acao: "A IA parou de responder. Aumente o teto nas configurações ou espere virar o dia.",
        // CRÍTICO, mesmo sendo comportamento correto do sistema: do ponto de
        // vista do paciente, ninguém está respondendo.
        severidade: "critico",
        detalhe: veredicto.motivo,
      },
    ];
  }

  return [
    {
      codigo: "teto_perto",
      titulo: `O gasto de IA está perto do teto ${veredicto.periodo === "dia" ? "do dia" : "do mês"}.`,
      acao: "Reveja o teto antes que ele pare o atendimento.",
      severidade: "atencao",
      detalhe: `${String(Math.round(veredicto.usado * 100))}% usado.`,
    },
  ];
}

async function olharInterruptores(organizationId: string): Promise<SinalDeSaude[]> {
  const { lerKillSwitches } = await import("../servidor/configuracao");
  const interruptores = await lerKillSwitches(organizationId);

  const NOMES: Readonly<Record<string, string>> = {
    kill_ia_auto: "a IA automática",
    kill_envios: "o envio de mensagens",
    kill_automacoes: "as automações",
    kill_escritas_do: "a escrita no Dental Office",
  };

  return Object.entries(NOMES)
    .filter(([chave]) => interruptores[chave] === true)
    .map(([chave, nome]) => ({
      codigo: `interruptor_${chave}`,
      titulo: `O interruptor de emergência de ${nome} está acionado.`,
      /*
       * ATENÇÃO, E NÃO CRÍTICO — é a única distinção sutil deste arquivo.
       *
       * Alguém ligou isso DE PROPÓSITO, e mostrar vermelho faria a recepção
       * tratar uma decisão como incidente. O que este sinal existe para evitar
       * é o oposto: o interruptor acionado às pressas numa terça e esquecido
       * ligado por duas semanas, com todo mundo achando que o agente quebrou.
       */
      acao: "Se foi de propósito, ignore. Se ninguém lembra de ter acionado, desligue nas configurações.",
      severidade: "atencao" as const,
      detalhe: chave,
    }));
}
