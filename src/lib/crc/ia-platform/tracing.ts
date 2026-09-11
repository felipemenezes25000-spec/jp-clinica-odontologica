/**
 * O trace de um turno — quanto cada etapa demorou e quanto custou.
 *
 * POR QUE ISTO EXISTE NA PRIMEIRA FATIA, e não numa fase de observabilidade lá
 * na frente: sem trace, a única forma de investigar um turno é reler o código e
 * adivinhar. Um turno agentic tem cinco a dez etapas e uma chamada paga no
 * meio; descobrir "por que demorou 4 segundos e custou R$ 0,05" depois do fato,
 * sem registro, é impossível.
 *
 * O QUE NÃO ENTRA NO SPAN: conteúdo de mensagem, nome de paciente, telefone,
 * chave de provedor. `resumo` é para número e código de erro. A conversa já
 * está em `crc_messages`, com as regras de acesso dela — duplicá-la no trace
 * seria criar um segundo lugar com PII e regra de retenção diferente.
 */
import type { UsoIa } from "../integracoes/ia/porta";

import type { ContextoTurno, ResultadoTurno } from "./tipos";

type TipoSpan = "contexto" | "modelo" | "ferramenta" | "portao" | "persistencia";

type Span = {
  nome: string;
  tipo: TipoSpan;
  ordem: number;
  duracaoMs: number;
  status: "ok" | "erro" | "bloqueado";
  resumo: string | null;
};

/**
 * O resultado da reserva do turno. TRÊS desfechos, e não dois.
 *
 * A versão anterior tinha `dono: true | false`, e o `false` juntava duas
 * situações que exigem reações opostas:
 *
 *   "outra execução está cuidando disto"  → encerrar o job. Certo.
 *   "não consegui provar que sou o dono"  → encerrar o job. ERRADO: ninguém
 *                                            está cuidando, e o job saiu da
 *                                            fila achando que sim.
 *
 * `indefinido` é o terceiro caso, e existe para quem chama poder FALHAR em vez
 * de concluir. Falhar devolve o job para a fila; concluir o apaga do mundo.
 */
export type ReservaDoTurno =
  | { dono: true; runId: string; tentativa: number }
  /** Outro worker está nela, ou ela já terminou. Encerrar sem agir é correto. */
  | { dono: false; motivo: "ocupada" | "terminal" }
  /** Não deu para saber. NÃO execute, e NÃO conclua o job: devolva-o à fila. */
  | { dono: false; motivo: "indefinido"; detalhe: string };

export type Trace = {
  /**
   * Reivindica o turno ANTES de qualquer efeito — Fase B, corrigida.
   *
   * A run nascia no ENCERRAMENTO, e a dedupe funcionava tarde demais: quando a
   * linha era escrita, o modelo já tinha sido chamado e pago. Duas execuções do
   * mesmo evento pagavam duas vezes para depois uma delas descobrir que era
   * duplicata. A Fase B moveu a linha para o começo, com `resultado = 'RODANDO'`
   * e o índice único `(organization_id, chave_dedupe)` decidindo quem executa.
   *
   * O QUE FALTAVA, e era o furo: a reserva era um `insert ... on conflict do
   * nothing`, então "a linha já existe" virava "outro é o dono" — inclusive
   * quando o outro era o EU DE ANTES, que morreu no meio. O job se recuperava
   * pelo lease dele, tentava reservar a run, batia no conflito, e o turno
   * devolvia `sem_acao`. O worker concluía o job, e o paciente ficava sem
   * resposta para sempre.
   *
   * Agora quem decide é `crc_reivindicar_ai_run`, e existir não basta: a run
   * também tem LEASE. Lease vivo é dono de verdade; lease vencido é um turno
   * órfão, e este aqui o assume.
   */
  reservar: (dados: {
    chaveDedupe: string;
    conversationId: string;
    jobId: string | null;
    /** Quem está executando. Vai para a coluna, e serve para investigar. */
    quem?: string | null;
  }) => Promise<ReservaDoTurno>;
  /** Mede uma etapa assíncrona. Repassa a exceção depois de registrá-la. */
  medir: <T>(nome: string, tipo: TipoSpan, fn: () => Promise<T>) => Promise<T>;
  /**
   * Mede uma etapa síncrona — os portões, tipicamente.
   *
   * `resumir` é opcional e existe para o chamador dizer o que vale registrar.
   * A alternativa — o trace inspecionar o retorno — exigia um cast e acoplava
   * este arquivo ao formato do veredicto dos portões.
   */
  medirSync: <T>(
    nome: string,
    tipo: TipoSpan,
    fn: () => T,
    resumir?: (r: T) => { bloqueado: boolean; codigo: string | null },
  ) => T;
  /**
   * Registra o consumo de UMA chamada de modelo.
   *
   * Chamado a cada volta do laço, e os valores SOMAM: um turno com três
   * ferramentas faz quatro chamadas, e reportar só a última faria o custo do
   * turno parecer um quarto do que foi.
   */
  uso: (u: UsoIa | null) => void;
  /** Registra as ferramentas que o laço usou, uma span por passo. */
  ferramentas: (
    passos: readonly { ferramenta: string; ok: boolean; bloqueadoPor: string | null }[],
  ) => void;
  /** Fecha o trace e persiste. Nunca lança. */
  gravar: (
    chaveDedupe: string,
    ctx: ContextoTurno | null,
    resultado: ResultadoTurno,
    extras?: {
      candidata?: { texto: string; raciocinio: string; precisaHumano: boolean };
      portao?: string;
    },
  ) => Promise<void>;
  /**
   * O id da run gravada, ou `null`.
   *
   * `null` tem DOIS significados, e os dois levam à mesma decisão de quem
   * chama: ou a gravação falhou, ou a chave de dedupe já existia — isto é, este
   * turno já foi processado antes. Em nenhum dos casos existe uma run nova a que
   * anexar supervisão, e é por isso que o supervisor não roda sem este id.
   */
  runId: () => string | null;
};

export function abrirTrace(organizationId: string, conversationId: string): Trace {
  const spans: Span[] = [];
  const inicio = Date.now();
  let consumo: UsoIa | null = null;
  let ordem = 0;
  let idDaRun: string | null = null;

  const registrar = (
    nome: string,
    tipo: TipoSpan,
    de: number,
    status: Span["status"],
    resumo: string | null,
  ): void => {
    ordem += 1;
    spans.push({ nome, tipo, ordem, duracaoMs: Date.now() - de, status, resumo });
  };

  return {
    async medir(nome, tipo, fn) {
      const de = Date.now();
      try {
        const r = await fn();
        registrar(nome, tipo, de, "ok", null);
        return r;
      } catch (erro) {
        registrar(nome, tipo, de, "erro", descrever(erro));
        throw erro;
      }
    },

    medirSync(nome, tipo, fn, resumir) {
      const de = Date.now();
      const r = fn();
      const resumo = resumir?.(r) ?? { bloqueado: false, codigo: null };
      registrar(nome, tipo, de, resumo.bloqueado ? "bloqueado" : "ok", resumo.codigo);
      return r;
    },

    uso(u) {
      if (u === null) return;
      consumo =
        consumo === null
          ? u
          : {
              modelo: u.modelo,
              inputTokens: soma(consumo.inputTokens, u.inputTokens),
              outputTokens: soma(consumo.outputTokens, u.outputTokens),
              custoEstimado: soma(consumo.custoEstimado, u.custoEstimado),
              duracaoMs: consumo.duracaoMs + u.duracaoMs,
            };
    },

    async reservar({ chaveDedupe, conversationId: conversa, jobId, quem }) {
      try {
        const { rpc } = await import("../servidor/banco");
        const { LEASE_SEGUNDOS } = await import("../aplicacao/agent-jobs");

        const linhas = await rpc("crc_reivindicar_ai_run", {
          p_organization_id: organizationId,
          p_conversation_id: conversa,
          p_chave_dedupe: chaveDedupe,
          p_job_id: jobId,
          // O MESMO PRAZO DO JOB, de propósito. Um lease de run mais curto que o
          // do job deixaria a run ser roubada enquanto o dono ainda trabalha;
          // mais longo deixaria o job voltar à fila só para bater numa run que
          // ninguém pode assumir, e girar em falso até esgotar as tentativas.
          p_lease_segundos: LEASE_SEGUNDOS,
          p_quem: quem ?? null,
        });

        const linha = linhas[0];
        const situacao = linha === undefined ? "" : String(linha["situacao"] ?? "");
        const id = linha === undefined ? null : linha["run_id"];

        if ((situacao === "nova" || situacao === "reclaim") && typeof id === "string") {
          idDaRun = id;
          const n = Number(linha?.["numero_tentativa"] ?? 1);
          return { dono: true, runId: id, tentativa: Number.isFinite(n) ? n : 1 };
        }

        if (situacao === "ocupada") return { dono: false, motivo: "ocupada" };
        if (situacao === "terminal") return { dono: false, motivo: "terminal" };

        /*
         * `indisponivel` da RPC, ou uma resposta que não se reconhece. Não dá
         * para afirmar quem é o dono, e afirmar errado aqui custa um paciente
         * sem resposta — então cai no mesmo tratamento do erro abaixo.
         */
        return {
          dono: false,
          motivo: "indefinido",
          detalhe: `Resposta inesperada da reivindicação: "${situacao}".`,
        };
      } catch (erro) {
        /*
         * NÃO CONSEGUIU RESERVAR: O TURNO PARA. FALHA FECHADA.
         *
         * A versão anterior seguia em frente devolvendo `dono: true` com um
         * runId vazio. O raciocínio era: "a reserva protege contra execução
         * dupla, que custa dinheiro; não responder um paciente é pior". Está
         * errado, e por dois motivos que só aparecem quando se pensa no que vem
         * depois:
         *
         *   O PIOR CASO NÃO É O CUSTO. Sem idempotência, duas execuções do mesmo
         *   turno podem MANDAR DUAS MENSAGENS ao paciente, ou marcar duas
         *   consultas. O gasto dobrado é o menor dos danos.
         *
         *   E O TURNO NÃO SE PERDIA — só parecia. Devolver `indefinido` faz o
         *   worker FALHAR o job em vez de concluí-lo, e um job falho volta para
         *   a fila com backoff. O paciente continua sendo respondido, alguns
         *   segundos depois, quando o banco voltar. Trocar a garantia por
         *   pressa era pagar caro por nada.
         */
        const detalhe = descrever(erro);
        const { registrar: log } = await import("../servidor/registro");
        log("erro", "Não foi possível reservar a run do turno.", {
          organizationId,
          detalhe,
        });
        return { dono: false, motivo: "indefinido", detalhe };
      }
    },

    runId() {
      return idDaRun;
    },

    ferramentas(passos) {
      for (const p of passos) {
        ordem += 1;
        spans.push({
          nome: p.ferramenta,
          tipo: "ferramenta",
          ordem,
          duracaoMs: 0,
          status: p.bloqueadoPor !== null ? "bloqueado" : p.ok ? "ok" : "erro",
          resumo: p.bloqueadoPor,
        });
      }
    },

    async gravar(chaveDedupe, ctx, resultado, extras) {
      try {
        const { atualizar, inserirIgnorandoDuplicata, inserir } = await import("../servidor/banco");

        const candidata = extras?.candidata ?? null;
        const desfecho = {
          clinic_id: ctx?.clinicId ?? null,
          patient_id: ctx?.paciente?.id ?? null,
          resultado: resultado.tipo,
          motivo: "motivo" in resultado ? resultado.motivo : null,
          resposta_candidata: candidata?.texto ?? null,
          raciocinio: candidata?.raciocinio ?? null,
          precisa_humano: candidata?.precisaHumano ?? false,
          modelo: consumo?.modelo ?? null,
          input_tokens: consumo?.inputTokens ?? null,
          output_tokens: consumo?.outputTokens ?? null,
          custo_estimado: consumo?.custoEstimado ?? null,
          duracao_ms: Date.now() - inicio,
          portao_bloqueou: extras?.portao ?? null,
        };

        /*
         * DOIS CAMINHOS, e o segundo e o de compatibilidade.
         *
         * Com a run RESERVADA no comeco (Fase B), aqui so falta escrever o
         * desfecho por cima da linha que ja existe. Sem reserva — porque o banco
         * piscou naquele instante, ou porque quem chamou nao reservou — a linha
         * ainda nao existe, e o insert-ignorando-duplicata de antes continua
         * valendo.
         *
         * Manter os dois e o que permite a Fase B nao quebrar nenhum chamador
         * que ainda nao foi migrado.
         */
        let runId = idDaRun;

        if (runId !== null && runId.length > 0) {
          await atualizar("crc_ai_runs", [{ coluna: "id", op: "eq", valor: runId }], desfecho);
        } else {
          const criada = await inserirIgnorandoDuplicata("crc_ai_runs", {
            organization_id: organizationId,
            conversation_id: conversationId,
            chave_dedupe: chaveDedupe,
            prompt_versao: "agent_shadow_turn_v1",
            iniciado_em: new Date(inicio).toISOString(),
            ...desfecho,
          });

          // `null` quando a chave ja existia: o turno ja foi processado, e os
          // spans dele tambem. Sem esta guarda, um reprocessamento duplicaria o
          // trace sem duplicar a run.
          const id = criada === null ? null : criada["id"];
          if (typeof id !== "string") return;
          runId = id;
          idDaRun = id;
        }

        if (spans.length > 0) {
          await inserir(
            "crc_ai_spans",
            spans.map((s) => ({
              run_id: runId,
              organization_id: organizationId,
              nome: s.nome,
              tipo: s.tipo,
              ordem: s.ordem,
              duracao_ms: s.duracaoMs,
              status: s.status,
              resumo: s.resumo,
            })),
          );
        }
      } catch (erro) {
        // TRACE QUE FALHA NÃO DERRUBA TURNO. Perder a observabilidade de um
        // turno é ruim; perder o turno porque a observabilidade falhou é pior.
        const { registrar: log } = await import("../servidor/registro");
        log("aviso", "Não foi possível gravar o trace do turno.", {
          organizationId,
          detalhe: descrever(erro),
        });
      }
    },
  };
}

/** Soma que trata ausência como zero, mas não inventa zero onde não há dado. */
const soma = (a: number | null, b: number | null): number | null =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

const descrever = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).slice(0, 200);
