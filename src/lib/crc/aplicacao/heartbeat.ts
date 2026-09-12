/**
 * O batimento dos workers — a prova de que alguém está rodando.
 *
 * ============================================================================
 *  A PERGUNTA QUE O SISTEMA NÃO SABIA RESPONDER: **o pulso está vivo?**
 *
 *  O caminho rápido do CRC é webhook → `tocarPulso()` → `/api/crc/pulso`, com o
 *  GitHub Actions como rede de recuperação. Os dois podem parar em silêncio:
 *
 *    o `CRON_SECRET` some do repositório      → o workflow falha a cada 5 min
 *    o `CRC_URL_PUBLICA` não foi configurado  → `tocarPulso()` retorna sem fazer
 *                                               nada, de propósito e sem log
 *
 *  E o sintoma dos dois é o mesmo: NADA. A fila enche devagar, o paciente não é
 *  respondido, e o painel de Saúde dizia "há pacientes esperando há 40 minutos.
 *  Confira se o cron do motor está rodando" — mandando olhar o worker errado.
 * ============================================================================
 *
 * O QUE ESTE ARQUIVO NÃO É: um sistema de métricas. Ele grava UMA LINHA por
 * worker, sobrescrita a cada volta. Não há série temporal, não há retenção, não
 * há agregação. A pergunta é "quando foi a última vez que funcionou?", e para
 * isso uma linha basta — e uma linha não vira uma tabela que cresce sozinha.
 *
 * NUNCA LANÇA. Um heartbeat que derruba a volta que ele deveria observar seria
 * o instrumento quebrando o que mede. Falha de gravação vira registro e segue.
 */
import { registrar } from "../servidor/registro";

export type FaseDoBatimento = "inicio" | "sucesso" | "erro";

export type Heartbeat = {
  worker: string;
  ultimoInicioEm: string | null;
  ultimoSucessoEm: string | null;
  ultimoErroEm: string | null;
  ultimoErro: string | null;
  duracaoMs: number | null;
  metricas: Record<string, unknown>;
};

/** Os workers que batem ponto. */
export const WORKER_PULSO = "pulso";
export const WORKER_MOTOR = "motor";

export async function baterHeartbeat(
  worker: string,
  fase: FaseDoBatimento,
  extras: {
    erro?: string | null;
    duracaoMs?: number | null;
    metricas?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    const { rpc } = await import("../servidor/banco");
    await rpc("crc_bater_heartbeat", {
      p_worker: worker,
      p_fase: fase,
      p_erro: extras.erro ?? null,
      p_duracao_ms: extras.duracaoMs ?? null,
      // `null` e não `{}`: a RPC preserva as métricas anteriores quando não
      // recebe novas, e o `inicio` não tem o que informar ainda.
      p_metricas: extras.metricas ?? null,
    });
  } catch (erro) {
    /*
     * ENGOLE E REGISTRA, e é o único lugar deste código onde isso é certo: o
     * heartbeat existe para observar o worker, e um instrumento que derruba o
     * que mede é pior do que instrumento nenhum. Banco sem `supabase/27` cai
     * aqui — e o painel vai dizer "nunca bateu", que é a verdade.
     */
    registrar("aviso", "Não foi possível gravar o batimento do worker.", {
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
  }
}

/**
 * Roda algo já batendo ponto em volta.
 *
 * O `try/finally` NÃO está aqui: um erro precisa virar `erro`, e não `sucesso`.
 * É o tipo de detalhe que um `finally` genérico apaga — e o campo que o painel
 * lê é justamente `ultimo_sucesso_em`.
 */
export async function comBatimento<T>(
  worker: string,
  trabalho: () => Promise<T>,
  resumir: (r: T) => Record<string, unknown> = () => ({}),
): Promise<T> {
  const comecou = Date.now();
  await baterHeartbeat(worker, "inicio");

  try {
    const r = await trabalho();
    await baterHeartbeat(worker, "sucesso", {
      duracaoMs: Date.now() - comecou,
      metricas: resumir(r),
    });
    return r;
  } catch (erro) {
    await baterHeartbeat(worker, "erro", {
      erro: erro instanceof Error ? erro.message : String(erro),
      duracaoMs: Date.now() - comecou,
    });
    throw erro;
  }
}

/** Lê os batimentos. Lista vazia quando a tabela ainda não existe. */
export async function lerHeartbeats(): Promise<Heartbeat[]> {
  const { selecionar } = await import("../servidor/banco");

  const linhas = await selecionar("crc_runtime_heartbeats", { limite: 20 });

  return linhas.map((l) => ({
    worker: String(l["worker"] ?? ""),
    ultimoInicioEm: texto(l["ultimo_inicio_em"]),
    ultimoSucessoEm: texto(l["ultimo_sucesso_em"]),
    ultimoErroEm: texto(l["ultimo_erro_em"]),
    ultimoErro: texto(l["ultimo_erro"]),
    duracaoMs: typeof l["duracao_ms"] === "number" ? l["duracao_ms"] : null,
    metricas:
      typeof l["metricas"] === "object" && l["metricas"] !== null
        ? (l["metricas"] as Record<string, unknown>)
        : {},
  }));
}

const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Há quantos minutos o worker teve sucesso pela última vez.
 *
 * `null` significa NUNCA, e o painel trata isso diferente de "faz muito tempo":
 * um sistema que nunca bateu está desconfigurado; um que bateu e parou está
 * quebrado. As duas conversas são diferentes.
 */
export function minutosDesdeOSucesso(h: Heartbeat | undefined, agora: Date): number | null {
  if (h === undefined || h.ultimoSucessoEm === null) return null;
  const quando = Date.parse(h.ultimoSucessoEm);
  if (!Number.isFinite(quando)) return null;
  return Math.round((agora.getTime() - quando) / 60_000);
}
