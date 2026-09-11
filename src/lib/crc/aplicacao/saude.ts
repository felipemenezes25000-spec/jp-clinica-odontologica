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
 *   DISJUNTORES     memória do processo. Diz se o provedor está cortado AGORA.
 *   FILA            `crc_agent_jobs`. Diz se há trabalho parado e há quanto tempo.
 *   RUNS ABERTAS    `crc_ai_runs` com `RODANDO`. Diz se algum worker morreu.
 *   ORÇAMENTO       `crc_ai_gastos`. Diz se o teto está segurando.
 *   INTERRUPTORES   `crc_feature_flags`. Diz se alguém desligou de propósito.
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

/** Uma run aberta além disto significa worker morto, não turno demorado. */
const RUN_ABERTA_DEMAIS_MIN = 30;

export async function panoramaDeSaude(
  organizationId: string,
  agora = new Date(),
): Promise<PanoramaDeSaude> {
  const sinais: SinalDeSaude[] = [];

  for (const olhar of [
    olharDisjuntores,
    olharFila,
    olharRunsAbertas,
    olharOrcamento,
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
      // A PRIMEIRA COISA É OLHAR O CRON, e não o código: na Vercel Hobby o cron
      // é diário, e a fila só anda quando alguém ou algo a empurra.
      acao: "Confira se o cron do motor está rodando. Se não estiver, chame /api/crc/motor à mão.",
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
