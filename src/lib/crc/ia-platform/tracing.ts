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

export type Trace = {
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
};

export function abrirTrace(organizationId: string, conversationId: string): Trace {
  const spans: Span[] = [];
  const inicio = Date.now();
  let consumo: UsoIa | null = null;
  let ordem = 0;

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
        const { inserirIgnorandoDuplicata, inserir } = await import("../servidor/banco");

        const candidata = extras?.candidata ?? null;
        const criada = await inserirIgnorandoDuplicata("crc_ai_runs", {
          organization_id: organizationId,
          clinic_id: ctx?.clinicId ?? null,
          conversation_id: conversationId,
          patient_id: ctx?.paciente?.id ?? null,
          chave_dedupe: chaveDedupe,
          resultado: resultado.tipo,
          motivo: "motivo" in resultado ? resultado.motivo : null,
          resposta_candidata: candidata?.texto ?? null,
          raciocinio: candidata?.raciocinio ?? null,
          precisa_humano: candidata?.precisaHumano ?? false,
          modelo: consumo?.modelo ?? null,
          prompt_versao: "agent_shadow_turn_v1",
          input_tokens: consumo?.inputTokens ?? null,
          output_tokens: consumo?.outputTokens ?? null,
          custo_estimado: consumo?.custoEstimado ?? null,
          duracao_ms: Date.now() - inicio,
          portao_bloqueou: extras?.portao ?? null,
        });

        // `inserirIgnorandoDuplicata` devolve null quando a chave já existia:
        // o turno já foi processado, e os spans dele também. Sem esta guarda, um
        // reprocessamento duplicaria o trace sem duplicar a run.
        const runId = criada === null ? null : criada["id"];
        if (typeof runId !== "string") return;

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
