/**
 * O orçamento de IA, persistido — Fatia 8.
 *
 * A ORDEM DAS DUAS FUNÇÕES PRINCIPAIS É A GARANTIA DO ADR-12:
 * `verificarOrcamento` roda ANTES da chamada de modelo, `registrarGasto` depois.
 * Nenhuma das duas serve para o papel da outra.
 *
 * A LEITURA É BARATA DE PROPÓSITO. Ela acontece antes de cada chamada, então não
 * pode custar uma agregação sobre a tabela de chamadas: são no máximo 31 baldes
 * diários, somados em memória. As chamadas individuais continuam em
 * `crc_ai_runs`, que é onde se investiga "por que gastou tanto" — aqui é o
 * contador, e contador precisa ser rápido.
 */
import { diaLocal, FUSO_PADRAO, primeiroDiaDoMesLocal } from "../dominio/dia-local";
import {
  avaliarOrcamento,
  emMicro,
  type GastoAtual,
  type Tetos,
  type VeredictoOrcamento,
} from "../dominio/orcamento";
import { agoraIso, atualizar, gravar, rpc, selecionar, selecionarUm } from "../servidor/banco";

/* -------------------------------------------------------------------------- */
/* Tetos                                                                      */
/* -------------------------------------------------------------------------- */

export type OrcamentoDaOrganizacao = Tetos & {
  /** Quando estoura, abre caso humano em vez de parar quieto (ADR-12). */
  abrirCaso: boolean;
};

/** Sem linha configurada = sem teto. A IA não nasce bloqueada por omissão. */
export const SEM_TETO: OrcamentoDaOrganizacao = {
  diaMicro: null,
  mesMicro: null,
  abrirCaso: true,
};

export async function lerOrcamento(organizationId: string): Promise<OrcamentoDaOrganizacao> {
  const l = await selecionarUm("crc_ai_orcamentos", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
  });
  if (l === null) return SEM_TETO;

  return {
    diaMicro: inteiroOuNulo(l["teto_dia_micro"]),
    mesMicro: inteiroOuNulo(l["teto_mes_micro"]),
    abrirCaso: l["abrir_caso"] !== false,
  };
}

/**
 * Zero é teto válido e significa "bloqueado", não "sem teto".
 *
 * A diferença importa: uma clínica que quer parar a IA agora tem um jeito de
 * fazer isso pelo orçamento, e o `null` continua reservado para "não configurei".
 * Tratar zero como ausência tiraria esse jeito.
 */
function inteiroOuNulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export async function salvarOrcamento(pedido: {
  organizationId: string;
  tetoDiaReais: number | null;
  tetoMesReais: number | null;
  abrirCaso: boolean;
}): Promise<void> {
  await gravar(
    "crc_ai_orcamentos",
    {
      organization_id: pedido.organizationId,
      teto_dia_micro: pedido.tetoDiaReais === null ? null : emMicro(pedido.tetoDiaReais),
      teto_mes_micro: pedido.tetoMesReais === null ? null : emMicro(pedido.tetoMesReais),
      abrir_caso: pedido.abrirCaso,
      atualizado_em: agoraIso(),
    },
    "organization_id",
  );
}

/* -------------------------------------------------------------------------- */
/* Gasto                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * `YYYY-MM-DD` no fuso DA CLÍNICA — Fase D.
 *
 * Era `agora.toISOString().slice(0, 10)`, ou seja, o dia UTC. A Vercel roda em
 * UTC e a clínica opera em -03: **o dia virava às 21h**, e o teto diário zerava
 * junto. Todo dia a clínica ganhava três horas de orçamento de graça, e o
 * relatório "gasto de hoje" mentia das 21h à meia-noite — que é exatamente
 * quando alguém fecha o caixa e olha.
 *
 * O fuso vem da configuração; `lerFusoDaOrganizacao` tem o cuidado de nunca
 * derrubar o chamador. Ver `dominio/dia-local.ts`.
 */
const diaDe = (agora: Date, fuso: string = FUSO_PADRAO): string => diaLocal(agora, fuso);

/**
 * O fuso da clínica. NUNCA LANÇA: sem configuração, São Paulo.
 *
 * Uma leitura a mais por verificação de orçamento é barata perto de somar gasto
 * no balde errado — e o resultado é cacheado por organização enquanto o processo
 * vive, porque fuso de clínica não muda no meio do expediente.
 */
const FUSOS = new Map<string, string>();

export async function lerFusoDaOrganizacao(organizationId: string): Promise<string> {
  const guardado = FUSOS.get(organizationId);
  if (guardado !== undefined) return guardado;

  try {
    const { lerConfiguracao } = await import("../servidor/configuracao");
    const cfg = await lerConfiguracao(organizationId);
    const bruto = cfg.horarioComercial.fuso;
    const fuso = bruto.trim().length > 0 ? bruto : FUSO_PADRAO;
    FUSOS.set(organizationId, fuso);
    return fuso;
  } catch {
    return FUSO_PADRAO;
  }
}

/** Só para teste: o cache de fuso não pode vazar de um caso para o outro. */
export function esquecerFusos(): void {
  FUSOS.clear();
}

export async function lerGasto(organizationId: string, agora: Date): Promise<GastoAtual> {
  const fuso = await lerFusoDaOrganizacao(organizationId);
  const hoje = diaDe(agora, fuso);
  const primeiroDoMes = primeiroDiaDoMesLocal(agora, fuso);

  const baldes = await selecionar("crc_ai_gastos", {
    colunas: "dia,micro_reais",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "dia", op: "gte", valor: primeiroDoMes },
    ],
    limite: 40,
  });

  let mes = 0;
  let dia = 0;
  for (const b of baldes) {
    const micro = Number(b["micro_reais"] ?? 0);
    if (!Number.isFinite(micro)) continue;
    mes += micro;
    if (String(b["dia"] ?? "").slice(0, 10) === hoje) dia += micro;
  }

  return { diaMicro: dia, mesMicro: mes };
}

/**
 * Soma o gasto de UMA chamada.
 *
 * NUNCA LANÇA. Perder o registro de um gasto é ruim; derrubar um turno que já
 * respondeu ao paciente porque o contador falhou é pior. O erro vai para o log e
 * a próxima chamada soma normalmente.
 */
export async function registrarGasto(
  organizationId: string,
  custoEstimadoReais: number | null,
  agora: Date,
): Promise<void> {
  if (custoEstimadoReais === null || custoEstimadoReais <= 0) return;

  try {
    await rpc("crc_somar_gasto", {
      p_organization_id: organizationId,
      p_dia: diaDe(agora, await lerFusoDaOrganizacao(organizationId)),
      p_micro: emMicro(custoEstimadoReais),
    });
  } catch (erro) {
    const { registrar } = await import("../servidor/registro");
    registrar("aviso", "Não foi possível somar o gasto de IA.", {
      organizationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* A verificação                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Pode fazer a próxima chamada?
 *
 * NUNCA LANÇA, E EM CASO DE DÚVIDA LIBERA. Se o banco não responde, a escolha é
 * entre "deixa passar e talvez estoure o teto" e "para de atender paciente".
 * Parar de atender por indisponibilidade do contador é o pior dos dois: o teto
 * existe para controlar custo, não para ser um segundo interruptor de emergência
 * — esse já existe, e é o kill switch.
 */
export async function verificarOrcamento(
  organizationId: string,
  agora: Date,
  estimativaReais = 0,
): Promise<VeredictoOrcamento> {
  try {
    const [tetos, gasto] = await Promise.all([
      lerOrcamento(organizationId),
      lerGasto(organizationId, agora),
    ]);
    return avaliarOrcamento(tetos, gasto, emMicro(estimativaReais));
  } catch {
    // Ver o cabeçalho desta função.
    return { pode: true, alerta: false };
  }
}

/** Para a tela: tetos, gasto e o veredicto de agora, numa leitura. */
export async function panoramaDoOrcamento(
  organizationId: string,
  agora: Date,
): Promise<{ tetos: OrcamentoDaOrganizacao; gasto: GastoAtual; veredicto: VeredictoOrcamento }> {
  const [tetos, gasto] = await Promise.all([
    lerOrcamento(organizationId),
    lerGasto(organizationId, agora),
  ]);
  return { tetos, gasto, veredicto: avaliarOrcamento(tetos, gasto, 0) };
}

/** Usado pela tela de configuração para zerar o dia em teste. */
export async function zerarGastoDoDia(organizationId: string, agora: Date): Promise<void> {
  await atualizar(
    "crc_ai_gastos",
    [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "dia", op: "eq", valor: diaDe(agora, await lerFusoDaOrganizacao(organizationId)) },
    ],
    { micro_reais: 0, chamadas: 0, atualizado_em: agoraIso() },
  );
}

/* -------------------------------------------------------------------------- */
/* A reserva atômica — Fase D                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A CORRIDA QUE ISTO FECHA, sem eufemismo.
 *
 * O desenho anterior era: ler o gasto → comparar com o teto → chamar o modelo →
 * somar o gasto. Quatro passos, e a soma só no fim.
 *
 * Dois turnos simultâneos leem o mesmo número, os dois concluem que cabe, os
 * dois chamam. Com cinco workers por minuto — que é literalmente o desenho da
 * Fase B —, um teto de R$ 50 vira "R$ 50 mais o que couber entre a leitura e a
 * escrita". Não é estouro teórico: é o comportamento normal de um contador que é
 * lido antes de ser escrito.
 *
 * A INVERSÃO: reservar ANTES de chamar, na mesma transação que lê. Quem perde a
 * corrida recebe `false` e não chama.
 *
 * O QUE ISTO CUSTA, dito na frente: a reserva usa a ESTIMATIVA, e estimativa
 * erra. Por isso `ajustarGasto` existe — depois da chamada, o custo real
 * substitui a estimativa, para mais ou para menos. E se o processo morrer entre
 * reservar e ajustar, a reserva fica: o teto errou para MENOS gasto permitido,
 * que é o lado certo para errar.
 */
export type Reserva =
  | {
      reservou: true;
      /**
       * QUANTO FOI EFETIVAMENTE RESERVADO, em micro-reais.
       *
       * Zero significa "passou sem reservar" — clínica sem teto, ou estimativa
       * zero, ou o contador indisponível. A diferença importa na hora de fechar
       * a conta: quem reservou AJUSTA a diferença, quem não reservou SOMA o
       * total. Sem este número, uma das duas somaria duas vezes e a outra
       * nenhuma.
       */
      reservadoMicro: number;
      diaMicro: number;
      mesMicro: number;
    }
  | { reservou: false; codigo: "teto_dia" | "teto_mes" | "indisponivel"; motivo: string };

export async function reservarOrcamento(
  organizationId: string,
  agora: Date,
  estimativaReais: number,
): Promise<Reserva> {
  const micro = emMicro(Math.max(estimativaReais, 0));

  // Estimativa zero não reserva nada, e não deve tomar um lock por isso.
  if (micro === 0) return { reservou: true, reservadoMicro: 0, diaMicro: 0, mesMicro: 0 };

  const tetos = await lerOrcamento(organizationId).catch(() => SEM_TETO);

  // SEM TETO NÃO PRECISA DE RESERVA. Quem não configurou orçamento não deve
  // pagar o custo de um lock por chamada de modelo.
  if (tetos.diaMicro === null && tetos.mesMicro === null) {
    return { reservou: true, reservadoMicro: 0, diaMicro: 0, mesMicro: 0 };
  }

  try {
    const fuso = await lerFusoDaOrganizacao(organizationId);
    const linhas = await rpc("crc_reservar_orcamento", {
      p_organization_id: organizationId,
      p_dia: diaDe(agora, fuso),
      p_micro: micro,
      // O SQL trata `<= 0` como "sem teto". Null vira zero aqui para não
      // precisar de duas assinaturas de função.
      p_teto_dia_micro: tetos.diaMicro ?? 0,
      p_teto_mes_micro: tetos.mesMicro ?? 0,
    });

    const l = linhas[0];
    if (l === undefined) {
      return { reservou: false, codigo: "indisponivel", motivo: "A reserva não respondeu." };
    }

    const diaMicro = Number(l["dia_micro"] ?? 0);
    const mesMicro = Number(l["mes_micro"] ?? 0);

    if (l["reservou"] === true) {
      return { reservou: true, reservadoMicro: micro, diaMicro, mesMicro };
    }

    // QUAL teto estourou muda a mensagem que a recepção lê: "volta amanhã" e
    // "acabou o mês" pedem providências diferentes.
    const estourouDia = tetos.diaMicro !== null && diaMicro + micro > tetos.diaMicro;
    return estourouDia
      ? { reservou: false, codigo: "teto_dia", motivo: "O teto de gasto do dia foi atingido." }
      : { reservou: false, codigo: "teto_mes", motivo: "O teto de gasto do mês foi atingido." };
  } catch (erro) {
    /*
     * EM CASO DE DÚVIDA, LIBERA — e isto é uma escolha, não um descuido.
     *
     * A alternativa seria parar de atender paciente porque o contador de custo
     * está indisponível. O teto existe para controlar gasto, não para ser um
     * segundo interruptor de emergência: esse já existe, é o kill switch, e ele
     * é acionado por gente.
     *
     * O que NÃO pode acontecer é a falha ser silenciosa — por isso o log.
     */
    const { registrar } = await import("../servidor/registro");
    registrar("aviso", "A reserva de orçamento falhou; o turno seguiu sem teto.", {
      organizationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return { reservou: true, reservadoMicro: 0, diaMicro: 0, mesMicro: 0 };
  }
}

/**
 * Fecha a conta da chamada: o custo real entra no lugar do que foi reservado.
 *
 * NUNCA LANÇA. Perder o registro de um gasto é ruim; derrubar um turno que já
 * respondeu ao paciente porque o contador falhou é pior.
 *
 * OS DOIS CAMINHOS, e por que não dá para ter só um:
 *
 *   RESERVOU  →  ajusta a DIFERENÇA. A estimativa já está somada, e somar de
 *                novo contaria a mesma chamada duas vezes. O delta costuma ser
 *                negativo: a estimativa usa `maxTokens` e a resposta quase
 *                sempre é menor. Um contador que só sobe acumula erro para cima
 *                até o teto virar ficção.
 *
 *   NÃO RESERVOU  →  soma o TOTAL. É o caso da clínica sem teto configurado, e
 *                    ela também quer ver "gasto de hoje" na tela. O contador
 *                    serve ao relatório, não só ao limite — foi por esquecer
 *                    isso que a primeira versão desta fase parou de registrar
 *                    gasto de quem não tinha teto.
 */
export async function liquidarGasto(
  organizationId: string,
  reserva: Reserva,
  realReais: number | null,
  agora: Date,
): Promise<void> {
  if (!reserva.reservou) return;

  const realMicro = realReais === null ? null : emMicro(Math.max(realReais, 0));

  if (reserva.reservadoMicro === 0) {
    // Sem custo informado não há o que somar: inventar zero é tão errado quanto
    // inventar qualquer outro número, e o log da chamada guarda o que houve.
    if (realMicro === null || realMicro === 0) return;
    await registrarGasto(organizationId, realReais, agora);
    return;
  }

  // Custo desconhecido: a estimativa reservada fica de pé. Apagá-la
  // transformaria "não sei quanto custou" em "custou zero".
  if (realMicro === null) return;

  const delta = realMicro - reserva.reservadoMicro;
  if (delta === 0) return;

  try {
    await rpc("crc_ajustar_gasto", {
      p_organization_id: organizationId,
      p_dia: diaDe(agora, await lerFusoDaOrganizacao(organizationId)),
      p_delta_micro: delta,
    });
  } catch (erro) {
    const { registrar } = await import("../servidor/registro");
    registrar("aviso", "Não foi possível ajustar o gasto estimado para o real.", {
      organizationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
  }
}
