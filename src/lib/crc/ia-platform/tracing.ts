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
 * O resultado da reserva do turno.
 *
 * `dono: false` significa que outra execução já reivindicou este turno — não é
 * erro, é a dedupe funcionando. Quem chama encerra sem fazer nada.
 */
export type ReservaDoTurno = { dono: true; runId: string } | { dono: false };

export type Trace = {
  /**
   * Reivindica o turno ANTES de qualquer efeito — Fase B.
   *
   * A run nascia no ENCERRAMENTO, e a dedupe funcionava tarde demais: quando a
   * linha era escrita, o modelo já tinha sido chamado e pago. Duas execuções do
   * mesmo evento pagavam duas vezes para depois uma delas descobrir que era
   * duplicata.
   *
   * Agora a linha nasce com `resultado = 'RODANDO'`, e o índice único
   * `(organization_id, chave_dedupe)` decide quem executa. Quem perder a corrida
   * recebe `dono: false` e para antes de gastar qualquer coisa.
   */
  reservar: (dados: {
    chaveDedupe: string;
    conversationId: string;
    jobId: string | null;
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

    async reservar({ chaveDedupe, conversationId: conversa, jobId }) {
      try {
        const { inserirIgnorandoDuplicata } = await import("../servidor/banco");

        const criada = await inserirIgnorandoDuplicata("crc_ai_runs", {
          organization_id: organizationId,
          conversation_id: conversa,
          chave_dedupe: chaveDedupe,
          // O estado de trabalho. Quem lê a tabela sabe que este turno está em
          // curso, e há quanto tempo.
          resultado: "RODANDO",
          iniciado_em: new Date(inicio).toISOString(),
          job_id: jobId,
          prompt_versao: "agent_shadow_turn_v1",
        });

        const id = criada === null ? null : criada["id"];
        if (typeof id !== "string") return { dono: false };

        idDaRun = id;
        return { dono: true, runId: id };
      } catch (erro) {
        /*
         * NÃO CONSEGUIU RESERVAR: O TURNO SEGUE.
         *
         * A reserva protege contra execução dupla, que custa dinheiro. A
         * indisponibilidade do banco nessa hora é outra coisa, e recusar o turno
         * por causa dela significaria deixar de responder um paciente por um
         * problema que talvez nem afete o resto do fluxo.
         *
         * Sem reserva, o `gravar` no fim cai no caminho antigo — insere a run
         * então. A proteção contra duplicata volta a ser tardia nesse caso, e é
         * o preço assumido.
         */
        const { registrar: log } = await import("../servidor/registro");
        log("aviso", "Não foi possível reservar a run do turno.", {
          organizationId,
          detalhe: descrever(erro),
        });
        return { dono: true, runId: "" };
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
