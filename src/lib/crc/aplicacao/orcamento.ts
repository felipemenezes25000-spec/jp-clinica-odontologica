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

/** `YYYY-MM-DD` no fuso do servidor, que é o mesmo que o resto do CRC usa. */
const diaDe = (agora: Date): string => agora.toISOString().slice(0, 10);

export async function lerGasto(organizationId: string, agora: Date): Promise<GastoAtual> {
  const hoje = diaDe(agora);
  const primeiroDoMes = `${hoje.slice(0, 7)}-01`;

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
      p_dia: diaDe(agora),
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
      { coluna: "dia", op: "eq", valor: diaDe(agora) },
    ],
    { micro_reais: 0, chamadas: 0, atualizado_em: agoraIso() },
  );
}
