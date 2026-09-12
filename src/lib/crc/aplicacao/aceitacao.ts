/**
 * Aceitação de tratamento — o serviço.
 *
 * ============================================================================
 *  A CADEIA QUE ESTE ARQUIVO FECHA:
 *
 *    o paciente diz algo   →  `registrarObjecao`  →  classifica, guarda o TEXTO
 *                                                    e move o funil
 *    a varredura roda      →  `qualificarOrcamentos` → chance e próxima ação
 *    o orçamento fecha     →  `marcarDesfecho`     →  a objeção ganha resultado
 *    o mês acaba           →  `analiticaDeObjecoes` → "preço converte 11%"
 *
 *  O último elo é o que faz os três primeiros valerem a pena. Sem desfecho, a
 *  analítica de objeção é uma contagem de reclamações; com ele, é a resposta
 *  para "o que eu faço diferente no mês que vem".
 * ============================================================================
 */
import {
  aindaPodeFechar,
  estimarAceitacao,
  etapaDaObjecao,
  proximaAcaoDeAceitacao,
  VERSAO_DA_ACEITACAO,
  type ContextoDeAceitacao,
  type EtapaDoFunil,
} from "../dominio/aceitacao";
import { classificarObjecao, type CategoriaObjecao } from "../dominio/objecoes";
import {
  agoraIso,
  atualizar,
  inserirIgnorandoDuplicata,
  rpc,
  selecionar,
  selecionarUm,
  type Filtro,
} from "../servidor/banco";
import { auditar, descreverErro, registrar } from "../servidor/registro";

/* -------------------------------------------------------------------------- */
/* Objeções                                                                   */
/* -------------------------------------------------------------------------- */

export type NovaObjecao = {
  organizationId: string;
  clinicId: string;
  patientId?: string | null;
  budgetId?: string | null;
  conversationId?: string | null;
  /** O que a pessoa disse, nas palavras dela. */
  texto: string;
  ocorridoEm?: string;
  chaveDedupe?: string | null;
};

export type ObjecaoRegistrada = {
  id: string;
  categoria: CategoriaObjecao;
  confianca: number;
  /** A etapa do funil para a qual o orçamento foi movido, quando havia um. */
  etapa: EtapaDoFunil | null;
};

/**
 * Registra uma objeção e move o funil.
 *
 * ============================================================================
 *  A CLASSIFICAÇÃO É POR PALAVRA, E NÃO POR MODELO — e o motivo não é custo.
 *
 *  É que a categoria vira DECISÃO: "preço" manda o caso para o dentista,
 *  "medo" manda para a equipe. Uma classificação que ninguém consegue
 *  contestar produz encaminhamentos que ninguém consegue contestar.
 *
 *  Com regex, alguém pode ler a lista de padrões e discordar. E a coluna
 *  `revisada_por` existe justamente para essa discordância virar dado.
 * ============================================================================
 *
 * O TEXTO ORIGINAL VAI JUNTO, SEMPRE. "Tá caro pra mim agora, mês que vem eu
 * consigo" e "tá caro, achei mais barato na outra clínica" viram a mesma linha
 * em PRECO, e são conversas opostas.
 */
export async function registrarObjecao(o: NovaObjecao): Promise<ObjecaoRegistrada | null> {
  const classificada = classificarObjecao(o.texto);

  const linha = await inserirIgnorandoDuplicata("crc_objections", {
    organization_id: o.organizationId,
    clinic_id: o.clinicId,
    patient_id: o.patientId ?? null,
    budget_id: o.budgetId ?? null,
    conversation_id: o.conversationId ?? null,
    categoria: classificada.categoria,
    texto: classificada.texto,
    confianca: classificada.confianca,
    padrao: classificada.padrao,
    ocorrido_em: o.ocorridoEm ?? agoraIso(),
    chave_dedupe: o.chaveDedupe ?? null,
  });

  if (linha === null) return null;

  let etapa: EtapaDoFunil | null = null;

  if (typeof o.budgetId === "string" && o.budgetId.length > 0) {
    etapa = etapaDaObjecao(classificada.categoria);

    /*
     * A COLUNA `objecao_atual` É DESNORMALIZADA, e esta é a ÚNICA escrita dela.
     *
     * Ter um só escritor é a condição para desnormalizar sem criar divergência.
     * O histórico completo continua em `crc_objections`; a coluna existe porque
     * a listagem do funil precisa da etiqueta, e um `order by ... limit 1` por
     * linha numa tela de cinquenta orçamentos é cinquenta subconsultas.
     */
    await atualizar(
      "crc_budgets",
      [
        { coluna: "id", op: "eq", valor: o.budgetId },
        { coluna: "organization_id", op: "eq", valor: o.organizationId },
      ],
      {
        funil: etapa,
        objecao_atual: classificada.categoria,
        ultimo_contato_em: o.ocorridoEm ?? agoraIso(),
        atualizado_em: agoraIso(),
      },
    );
  }

  return {
    id: String(linha["id"] ?? ""),
    categoria: classificada.categoria,
    confianca: classificada.confianca,
    etapa,
  };
}

/**
 * Alguém corrigiu a classificação.
 *
 * A CATEGORIA ORIGINAL FICA GUARDADA, e é o que mede o classificador: o par
 * (automática, corrigida) é a única forma de saber se os padrões acertam. Sem
 * ele, a correção apagaria justamente a informação que ela produz.
 */
export async function revisarObjecao(
  organizationId: string,
  objecaoId: string,
  categoriaCorreta: CategoriaObjecao,
  userId: string | null,
): Promise<void> {
  const atual = await selecionarUm("crc_objections", {
    colunas: "categoria,categoria_original",
    filtros: [
      { coluna: "id", op: "eq", valor: objecaoId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  if (atual === null) return;

  // Só grava a original na PRIMEIRA revisão: a segunda correção não deve
  // sobrescrever o que o classificador realmente devolveu.
  const original =
    typeof atual["categoria_original"] === "string"
      ? atual["categoria_original"]
      : String(atual["categoria"] ?? "");

  await atualizar("crc_objections", [{ coluna: "id", op: "eq", valor: objecaoId }], {
    categoria: categoriaCorreta,
    categoria_original: original,
    revisada_por: userId,
    revisada_em: agoraIso(),
  });

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "objecao.revisada",
    entityType: "objecao",
    entityId: objecaoId,
    depois: { de: original, para: categoriaCorreta },
  });
}

/**
 * O orçamento fechou (ou morreu): as objeções dele ganham desfecho.
 *
 * ============================================================================
 *  É ESTE PASSO QUE TRANSFORMA A TABELA DE OBJEÇÕES EM CONHECIMENTO.
 *
 *  Sem ele, a analítica responde "preço aparece em 58% das objeções" — que todo
 *  mundo já sabe e ninguém age. Com ele, responde "preço aparece em 58% E
 *  converte em 11%, enquanto tempo aparece em 14% e converte em 47%".
 *
 *  A segunda frase muda o que a clínica faz: preço não é problema de
 *  treinamento de equipe, é tabela ou forma de pagamento.
 * ============================================================================
 */
export async function marcarDesfecho(
  organizationId: string,
  budgetId: string,
  desfecho: "CONVERTEU" | "PERDEU",
  motivo: string | null = null,
): Promise<void> {
  const iso = agoraIso();

  await atualizar(
    "crc_objections",
    [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "budget_id", op: "eq", valor: budgetId },
      // Só as que ainda não têm desfecho: reprocessar não pode reescrever o
      // passado de uma objeção já resolvida.
      { coluna: "desfecho", op: "is", valor: null },
    ],
    { desfecho, desfecho_em: iso },
  );

  await atualizar(
    "crc_budgets",
    [
      { coluna: "id", op: "eq", valor: budgetId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    desfecho === "CONVERTEU"
      ? { funil: "ACCEPTED", aceito_em: iso, atualizado_em: iso }
      : { funil: "LOST", perdido_em: iso, perdido_motivo: motivo, atualizado_em: iso },
  );
}

/* -------------------------------------------------------------------------- */
/* A qualificação do funil                                                    */
/* -------------------------------------------------------------------------- */

export const PAGINA_DE_ORCAMENTOS = 200;

export type ResultadoDaQualificacaoDeFunil = {
  lidos: number;
  pontuados: number;
  ultimoId: string | null;
  fechou: boolean;
};

type LinhaDeOrcamento = {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  total_value: string | null;
  approved_value: string | null;
  status: string;
  emitido_em: string | null;
  criado_em: string;
  funil: string | null;
  tentativas: number;
  conversao_versao: string | null;
  objecao_atual: string | null;
};

/**
 * Pontua uma página de orçamentos abertos.
 *
 * O MESMO DESENHO DO RADAR: página pequena, cursor por `id`, e pula o que já
 * está na versão corrente da fórmula — senão a passagem reescreveria a base a
 * cada volta, gerando `atualizado_em` novo em tudo e apagando a informação de
 * quando o orçamento realmente mudou.
 */
export async function qualificarOrcamentos(
  organizationId: string,
  cursor: string | null,
  agora: Date = new Date(),
): Promise<ResultadoDaQualificacaoDeFunil> {
  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "aceito_em", op: "is", valor: null },
    { coluna: "perdido_em", op: "is", valor: null },
  ];
  if (cursor !== null) filtros.push({ coluna: "id", op: "gt", valor: cursor });

  const linhas = await selecionar<LinhaDeOrcamento>("crc_budgets", {
    colunas:
      "id,clinic_id,patient_id,total_value,approved_value,status,emitido_em,criado_em,funil,tentativas,conversao_versao,objecao_atual",
    filtros,
    ordenar: [{ coluna: "id", ascendente: true }],
    limite: PAGINA_DE_ORCAMENTOS,
  });

  if (linhas.length === 0) return { lidos: 0, pontuados: 0, ultimoId: null, fechou: true };

  const pacientes = [
    ...new Set(linhas.map((l) => l.patient_id).filter((p): p is string => p !== null)),
  ];
  const sinais = await lerSinaisDoPaciente(organizationId, pacientes, agora);

  let pontuados = 0;

  for (const l of linhas) {
    if (l.conversao_versao === VERSAO_DA_ACEITACAO) continue;

    const s = sinais.get(l.patient_id ?? "") ?? { consultas: 0, temFutura: false };
    const proposto = l.emitido_em ?? l.criado_em;
    const dias = Math.max(0, Math.floor((agora.getTime() - Date.parse(proposto)) / 86_400_000));

    /*
     * A ETAPA NASCE DE `funil` QUANDO EXISTE, e de `status` quando não.
     *
     * `funil` nulo significa "o CRC ainda não olhou para este orçamento" — é a
     * base histórica importada. Ela entra como PROPOSED, e não fica de fora:
     * um orçamento de dois anos atrás continua sendo dinheiro que não fechou.
     * O que o impede de poluir a fila é o desconto de idade da fórmula.
     */
    const etapa = etapaValida(l.funil) ?? etapaDoStatus(l.status);

    const ctx: ContextoDeAceitacao = {
      etapa,
      valor: Number(l.total_value ?? 0) || 0,
      diasDesdeProposta: dias,
      tentativas: l.tentativas,
      // Responder é registrado como objeção ou como avanço de etapa. Um
      // orçamento que saiu de PROPOSED teve interação.
      respondeu: l.funil !== null && l.funil !== "PROPOSED" && l.funil !== "NO_RESPONSE",
      consultasConcluidas: s.consultas,
      temConsultaFutura: s.temFutura,
      parcialmenteAprovado:
        l.approved_value !== null && Number(l.approved_value) > 0 && l.status !== "APPROVED",
    };

    const chance = estimarAceitacao(ctx);
    const plano = proximaAcaoDeAceitacao({
      ...ctx,
      // O parcelamento é política da clínica, e ainda não há tabela para ele.
      // `false` é o padrão conservador: sem condição cadastrada, a objeção de
      // preço vai para o dentista em vez de virar uma oferta inventada.
      temParcelamento: false,
    });

    try {
      await atualizar("crc_budgets", [{ coluna: "id", op: "eq", valor: l.id }], {
        funil: etapa,
        conversao_prob: chance.probabilidade,
        conversao_conf: chance.confianca,
        conversao_versao: VERSAO_DA_ACEITACAO,
        proxima_acao: plano.acao,
        proxima_acao_em:
          plano.emDias === null
            ? agora.toISOString()
            : new Date(agora.getTime() + plano.emDias * 86_400_000).toISOString(),
        atualizado_em: agora.toISOString(),
      });
      pontuados += 1;
    } catch (erro) {
      registrar("erro", "Falha ao pontuar orçamento no funil de aceitação.", {
        organizationId,
        budgetId: l.id,
        detalhe: descreverErro(erro),
      });
    }
  }

  return {
    lidos: linhas.length,
    pontuados,
    ultimoId: linhas[linhas.length - 1]?.id ?? null,
    fechou: linhas.length < PAGINA_DE_ORCAMENTOS,
  };
}

const ETAPAS: readonly EtapaDoFunil[] = [
  "PROPOSED",
  "THINKING",
  "PRICE_OBJECTION",
  "FEAR_OBJECTION",
  "TIME_OBJECTION",
  "FAMILY_DECISION",
  "PAYMENT_OBJECTION",
  "NO_RESPONSE",
  "ACCEPTED",
  "SCHEDULED",
  "STARTED",
  "LOST",
];

function etapaValida(v: string | null): EtapaDoFunil | null {
  if (v === null) return null;
  return (ETAPAS as readonly string[]).includes(v) ? (v as EtapaDoFunil) : null;
}

/**
 * A etapa inicial, a partir do status formal do orçamento.
 *
 * `APPROVED` vira `ACCEPTED`, e não `STARTED`: o Dental Office diz que o
 * orçamento foi aprovado, e não que o tratamento começou. Tratar os dois como
 * a mesma coisa esconderia exatamente o caso que mais se perde — aceito e nunca
 * marcado.
 */
function etapaDoStatus(status: string): EtapaDoFunil {
  if (status === "APPROVED") return "ACCEPTED";
  if (status === "PARTIALLY_APPROVED") return "ACCEPTED";
  if (status === "REJECTED" || status === "CANCELLED") return "LOST";
  if (status === "EXPIRED") return "NO_RESPONSE";
  return "PROPOSED";
}

type SinalDoPaciente = { consultas: number; temFutura: boolean };

async function lerSinaisDoPaciente(
  organizationId: string,
  patientIds: readonly string[],
  agora: Date,
): Promise<Map<string, SinalDoPaciente>> {
  const mapa = new Map<string, SinalDoPaciente>();
  if (patientIds.length === 0) return mapa;

  const linhas = await selecionar<{ patient_id: string; status: string; inicio_em: string }>(
    "crc_appointments",
    {
      colunas: "patient_id,status,inicio_em",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "patient_id", op: "in", valor: [...patientIds] },
      ],
      limite: patientIds.length * 40,
    },
  );

  for (const l of linhas) {
    const s = mapa.get(l.patient_id) ?? { consultas: 0, temFutura: false };
    if (l.status === "COMPLETED") s.consultas += 1;
    if (
      (l.status === "TO_CONFIRM" || l.status === "CONFIRMED") &&
      Date.parse(l.inicio_em) > agora.getTime()
    ) {
      s.temFutura = true;
    }
    mapa.set(l.patient_id, s);
  }

  return mapa;
}

/* -------------------------------------------------------------------------- */
/* A tela                                                                     */
/* -------------------------------------------------------------------------- */

export type ItemDoFunil = {
  id: string;
  patientId: string | null;
  valor: number;
  etapa: EtapaDoFunil;
  objecao: string | null;
  probabilidade: number | null;
  valorEsperado: number;
  proximaAcao: string | null;
  proximaAcaoEm: string | null;
  diasParado: number;
};

export async function listarFunil(
  organizationId: string,
  clinicIds: readonly string[] | null,
  agora: Date = new Date(),
  limite = 60,
): Promise<ItemDoFunil[]> {
  if (clinicIds !== null && clinicIds.length === 0) return [];

  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "aceito_em", op: "is", valor: null },
    { coluna: "perdido_em", op: "is", valor: null },
    { coluna: "funil", op: "not.is", valor: null },
  ];
  if (clinicIds !== null) filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  const linhas = await selecionar("crc_budgets", {
    colunas:
      "id,patient_id,total_value,funil,objecao_atual,conversao_prob,proxima_acao,proxima_acao_em,emitido_em,criado_em",
    filtros,
    /*
     * ORDENADO POR VALOR, e não por probabilidade.
     *
     * A fila do funil é trabalho de VENDA, e o que decide onde gastar a próxima
     * hora é quanto está em jogo. Ordenar por probabilidade poria no topo os
     * casos fáceis e baratos — que fecham sozinhos.
     */
    ordenar: [{ coluna: "total_value", ascendente: false }],
    limite: Math.min(limite, 200),
  });

  return linhas
    .map((l) => {
      const valor = Number(l["total_value"] ?? 0) || 0;
      const prob =
        l["conversao_prob"] === null || l["conversao_prob"] === undefined
          ? null
          : Number(l["conversao_prob"]);
      const proposto = String(l["emitido_em"] ?? l["criado_em"] ?? "");

      return {
        id: String(l["id"] ?? ""),
        patientId: typeof l["patient_id"] === "string" ? l["patient_id"] : null,
        valor,
        etapa: etapaValida(String(l["funil"] ?? "")) ?? "PROPOSED",
        objecao: typeof l["objecao_atual"] === "string" ? l["objecao_atual"] : null,
        probabilidade: prob,
        valorEsperado: Number((valor * (prob ?? 0)).toFixed(2)),
        proximaAcao: typeof l["proxima_acao"] === "string" ? l["proxima_acao"] : null,
        proximaAcaoEm: typeof l["proxima_acao_em"] === "string" ? l["proxima_acao_em"] : null,
        diasParado:
          proposto.length === 0
            ? 0
            : Math.max(0, Math.floor((agora.getTime() - Date.parse(proposto)) / 86_400_000)),
      };
    })
    .filter((i) => aindaPodeFechar(i.etapa));
}

/* -------------------------------------------------------------------------- */
/* A analítica                                                                */
/* -------------------------------------------------------------------------- */

export type LinhaDaAnalitica = {
  categoria: string;
  total: number;
  convertidas: number;
  perdidas: number;
  semDesfecho: number;
  valorEmJogo: number;
  revisadas: number;
  /** `null` quando ainda não há desfecho suficiente para calcular. */
  taxaDeConversao: number | null;
};

/**
 * A analítica de objeções.
 *
 * ============================================================================
 *  A TAXA É `null` ABAIXO DE UMA AMOSTRA MÍNIMA, e não zero.
 *
 *  Com três objeções resolvidas, "33% de conversão" é ruído apresentado como
 *  medida — e é o tipo de número que alguém leva para uma reunião. `null` faz a
 *  tela escrever "ainda sem dados suficientes", que é a verdade.
 * ============================================================================
 */
export const AMOSTRA_MINIMA_DA_ANALITICA = 8;

export async function analiticaDeObjecoes(
  organizationId: string,
  clinicId: string | null,
  desde: string | null = null,
): Promise<LinhaDaAnalitica[]> {
  const linhas = await rpc<{
    categoria: string;
    total: number | string;
    convertidas: number | string;
    perdidas: number | string;
    sem_desfecho: number | string;
    valor_em_jogo: number | string;
    revisadas: number | string;
  }>("crc_analitica_de_objecoes", {
    p_organization_id: organizationId,
    p_clinic_id: clinicId,
    p_desde: desde,
  });

  return linhas.map((l) => {
    const convertidas = num(l.convertidas);
    const perdidas = num(l.perdidas);
    const resolvidas = convertidas + perdidas;

    return {
      categoria: l.categoria,
      total: num(l.total),
      convertidas,
      perdidas,
      semDesfecho: num(l.sem_desfecho),
      valorEmJogo: num(l.valor_em_jogo),
      revisadas: num(l.revisadas),
      taxaDeConversao:
        resolvidas < AMOSTRA_MINIMA_DA_ANALITICA
          ? null
          : Number((convertidas / resolvidas).toFixed(3)),
    };
  });
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
