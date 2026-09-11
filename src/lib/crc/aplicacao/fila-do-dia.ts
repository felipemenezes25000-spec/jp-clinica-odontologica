/**
 * A fila do dia — a ponte entre a Fase H e a tela.
 *
 * `dominio/proxima-acao.ts` sabe ORDENAR candidatos, e `dominio/churn.ts` sabe
 * PONTUAR um paciente. Nenhum dos dois sabe de onde vêm os dados — são puros, de
 * propósito. Este arquivo é quem os busca.
 *
 * ========================================================================
 *  O PROBLEMA DE DESEMPENHO QUE ELE RESOLVE, e que é a razão de ele existir
 *  em vez de um laço chamando `cerebroDoPaciente` por pessoa.
 *
 *  Uma clínica tem milhares de pacientes. Calcular risco de cada um exige
 *  orçamento aberto, faltas, comparecimentos e última resposta — quatro
 *  consultas por pessoa. Em duzentos candidatos, são OITOCENTAS idas ao
 *  banco para montar uma tela.
 *
 *  Aqui são CINCO consultas no total, sempre, independente do tamanho da
 *  lista: os candidatos e quatro agregações em lote.
 * ========================================================================
 *
 * O RECORTE DE QUEM ENTRA é o que mantém isso viável. Não se avalia a base
 * inteira: só quem está sem consulta futura marcada e já passou do ponto de
 * voltar. Quem tem consulta marcada teria escore zero de qualquer forma — o
 * curto-circuito de `calcularRiscoDeChurn` garante —, e trazê-los seria pagar
 * leitura para descartar.
 */
import {
  calcularRiscoDeChurn,
  INTERVALO_PADRAO_DIAS,
  type SinaisDoPaciente,
} from "../dominio/churn";
import { FUSO_PADRAO } from "../dominio/dia-local";
import { painelDoDia, type Candidato, type PainelDoDia } from "../dominio/proxima-acao";
import { selecionar, type Filtro } from "../servidor/banco";

/** Quantos pacientes entram na avaliação. Ver o cabeçalho. */
const CANDIDATOS_MAX = 200;

export async function filaDoDia(
  organizationId: string,
  agora = new Date(),
  limite = 20,
): Promise<PainelDoDia> {
  const fuso = await lerFuso(organizationId);

  /*
   * OS CANDIDATOS, EM UMA CONSULTA.
   *
   * Ordenados por `ultima_consulta_em` ASCENDENTE: quem está sem vir há mais
   * tempo entra primeiro na avaliação. Não é a ordem final — quem ordena é o
   * domínio, por risco × valor —, é só o recorte de quem vale a pena avaliar.
   *
   * `nulls first` não existe no PostgREST, então quem nunca veio pode ficar de
   * fora quando a base é grande. É aceitável: "nunca veio" é prospecção, não
   * retenção, e tem lista própria.
   */
  const pacientes = await selecionar("crc_patients", {
    colunas: "id,nome,ultima_consulta_em,proxima_consulta_em,opt_out_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      // Quem tem consulta marcada teria escore zero. Descartar aqui é mais
      // barato do que trazer para descartar depois.
      { coluna: "proxima_consulta_em", op: "is", valor: null },
    ],
    ordenar: [{ coluna: "ultima_consulta_em", ascendente: true }],
    limite: CANDIDATOS_MAX,
  }).catch(() => []);

  const ids = pacientes.map((p) => String(p["id"] ?? "")).filter((id) => id.length > 0);
  if (ids.length === 0) return { acoes: [], emEspera: 0, valorEmRisco: 0 };

  const [orcamentos, consultas, ultimoContato, ultimaResposta] = await Promise.all([
    emLote("crc_budgets", organizationId, ids, "patient_id,total_value,status", [
      { coluna: "status", op: "eq", valor: "APROVADO" },
    ]),
    emLote("crc_appointments", organizationId, ids, "patient_id,status,inicio_em", [
      { coluna: "inicio_em", op: "gte", valor: umAnoAtras(agora) },
    ]),
    // O que NÓS mandamos: alimenta o cooldown.
    emLote("crc_messages", organizationId, ids, "patient_id,criado_em,direcao", [
      { coluna: "direcao", op: "eq", valor: "SAIDA" },
    ]),
    // O que a PESSOA respondeu: alimenta o fator de silêncio.
    emLote("crc_messages", organizationId, ids, "patient_id,criado_em,direcao", [
      { coluna: "direcao", op: "eq", valor: "ENTRADA" },
    ]),
  ]);

  const valorPorPaciente = somarPor(orcamentos, "total_value");
  const faltasPor = contarPor(consultas, "FALTOU");
  const comparecimentosPor = contarPor(consultas, "REALIZADO");
  const ultimoEnvioPor = maisRecentePor(ultimoContato);
  const ultimaRespostaPor = maisRecentePor(ultimaResposta);

  const candidatos: Candidato[] = pacientes.map((p) => {
    const id = String(p["id"] ?? "");
    const valorEmAberto = valorPorPaciente.get(id) ?? 0;

    const sinais: SinaisDoPaciente = {
      ultimaConsultaEm: texto(p["ultima_consulta_em"]),
      proximaConsultaEm: null,
      faltasRecentes: faltasPor.get(id) ?? 0,
      comparecimentosRecentes: comparecimentosPor.get(id) ?? 0,
      // Aprovado e sem consulta marcada — e todos aqui estão sem consulta
      // marcada, pelo filtro da consulta.
      tratamentoInterrompido: valorEmAberto > 0,
      ultimaRespostaEm: ultimaRespostaPor.get(id) ?? null,
      intervaloEsperadoDias: INTERVALO_PADRAO_DIAS,
    };

    const envio = ultimoEnvioPor.get(id) ?? null;

    return {
      patientId: id,
      nome: String(p["nome"] ?? ""),
      risco: calcularRiscoDeChurn(sinais, agora, fuso),
      valorEmAberto,
      temConsultaMarcada: false,
      diasDesdeUltimoContato: envio === null ? null : diasDesde(envio, agora),
      optOut: p["opt_out_em"] != null,
    };
  });

  return painelDoDia(candidatos, limite);
}

/* -------------------------------------------------------------------------- */

/**
 * Uma consulta para MUITOS pacientes.
 *
 * O `op: "in"` com a lista de ids é o que transforma duzentas consultas em uma.
 * O limite de 2000 é folga: duzentos pacientes com dez linhas cada. Estourá-lo
 * cortaria dados em silêncio, então o número é generoso de propósito.
 */
async function emLote(
  tabela: "crc_budgets" | "crc_appointments" | "crc_messages",
  organizationId: string,
  ids: readonly string[],
  colunas: string,
  extras: readonly Filtro[],
): Promise<Record<string, unknown>[]> {
  try {
    return await selecionar(tabela, {
      colunas,
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "patient_id", op: "in", valor: [...ids] },
        ...extras,
      ],
      limite: 2000,
    });
  } catch {
    /*
     * FALHA DE AGREGAÇÃO NÃO DERRUBA A FILA — ela empobrece o cálculo.
     *
     * Sem os orçamentos, o valor em aberto vira zero e a ordenação fica pior;
     * a lista continua útil. Uma tela em branco por causa de uma das quatro
     * leituras seria pior do que uma lista ordenada com menos informação.
     */
    return [];
  }
}

function somarPor(linhas: readonly Record<string, unknown>[], campo: string): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    const id = String(l["patient_id"] ?? "");
    if (id.length === 0) continue;
    const v = Number(l[campo] ?? 0);
    if (Number.isFinite(v)) mapa.set(id, (mapa.get(id) ?? 0) + v);
  }
  return mapa;
}

function contarPor(
  linhas: readonly Record<string, unknown>[],
  status: string,
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    if (String(l["status"] ?? "") !== status) continue;
    const id = String(l["patient_id"] ?? "");
    if (id.length === 0) continue;
    mapa.set(id, (mapa.get(id) ?? 0) + 1);
  }
  return mapa;
}

function maisRecentePor(linhas: readonly Record<string, unknown>[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const l of linhas) {
    const id = String(l["patient_id"] ?? "");
    const em = String(l["criado_em"] ?? "");
    if (id.length === 0 || em.length === 0) continue;
    const atual = mapa.get(id);
    if (atual === undefined || em > atual) mapa.set(id, em);
  }
  return mapa;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

const umAnoAtras = (agora: Date): string =>
  new Date(agora.getTime() - 365 * 86_400_000).toISOString();

const diasDesde = (iso: string, agora: Date): number | null => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.floor((agora.getTime() - t) / 86_400_000) : null;
};

async function lerFuso(organizationId: string): Promise<string> {
  try {
    const { lerFusoDaOrganizacao } = await import("./orcamento");
    return await lerFusoDaOrganizacao(organizationId);
  } catch {
    return FUSO_PADRAO;
  }
}
