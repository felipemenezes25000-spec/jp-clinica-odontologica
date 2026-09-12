/**
 * O Radar de Receita — o serviço.
 *
 * ============================================================================
 *  O QUE ESTE ARQUIVO ENTREGA, em uma frase por função:
 *
 *    `resumoDoRadar()`       quanto dinheiro existe, por tipo — em UMA ida ao
 *                            banco, com potencial e esperado separados.
 *
 *    `qualificarPagina()`    a passagem que pontua as oportunidades ainda não
 *                            avaliadas: probabilidade, urgência, impacto.
 *
 *    `listarDoRadar()`       a fila ordenada, com o estado e a próxima ação.
 *
 *    `registrarElo()`        a cadeia de atribuição: ação → resposta → consulta
 *                            → comparecimento → produção.
 * ============================================================================
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: não envia nada, não cria tarefa, não chama
 * modelo. Ele mede e ordena. Quem age é a automação, e ela passa pelo Centro de
 * Autonomia antes — ver `aplicacao/autonomia.ts`.
 */
import {
  aindaRecuperavel,
  calcularUrgencia,
  estadoDoRadar,
  estimarChance,
  resumirRadar,
  valorDoRadar,
  VERSAO_DO_SCORE,
  type EstadoRadar,
  type ResumoDoRadar,
} from "../dominio/radar";
import { diasEntre } from "../dominio/regras";
import type { TipoOportunidade } from "../dominio/tipos";
import { TIPOS_OPORTUNIDADE } from "../dominio/tipos";
import {
  agoraIso,
  atualizar,
  contar,
  gravar,
  inserirIgnorandoDuplicata,
  rpc,
  selecionar,
  selecionarUm,
  type Filtro,
  type Linha,
} from "../servidor/banco";
import { descreverErro, registrar } from "../servidor/registro";

/* -------------------------------------------------------------------------- */
/* O resumo                                                                   */
/* -------------------------------------------------------------------------- */

type LinhaDoResumoRpc = {
  tipo: string;
  abertas: number | string;
  valor_potencial: number | string;
  valor_confirmado: number | string;
  valor_esperado: number | string;
  confianca_media: number | string;
  score_maximo: number | string;
  aguardando_humano: number | string;
};

export type ResumoCompleto = ResumoDoRadar & {
  /** Soma do que já tem evento financeiro confiável. Nunca somado ao esperado. */
  totalConfirmado: number;
  /** Quantas oportunidades estão paradas esperando alguém decidir. */
  aguardandoHumano: number;
  /**
   * Quantas ainda não foram pontuadas pelo Radar.
   *
   * É o número que explica a diferença entre `totalPotencial` e
   * `totalEsperado` quando ela parece grande demais: uma oportunidade sem
   * `probability` contribui com zero para o esperado.
   */
  naoAvaliadas: number;
};

/**
 * Quanto dinheiro existe, por tipo.
 *
 * UMA CHAMADA, SEMPRE. A alternativa — ler as oportunidades abertas e somar
 * aqui — cresce com a base e roda numa tela que abre sempre. É o mesmo defeito
 * que a `supabase/29` corrigiu no filtro de campanha.
 */
export async function resumoDoRadar(
  organizationId: string,
  clinicId: string | null,
): Promise<ResumoCompleto> {
  const linhas = await rpc<LinhaDoResumoRpc>("crc_radar_resumo", {
    p_organization_id: organizationId,
    p_clinic_id: clinicId,
  });

  let totalConfirmado = 0;
  let aguardandoHumano = 0;

  const paraResumir = linhas
    .filter((l) => TIPOS_CONHECIDOS.has(l.tipo))
    .map((l) => {
      totalConfirmado += num(l.valor_confirmado);
      aguardandoHumano += num(l.aguardando_humano);

      return {
        tipo: l.tipo as TipoOportunidade,
        abertas: num(l.abertas),
        valorPotencial: num(l.valor_potencial),
        valorEsperado: num(l.valor_esperado),
        confianca: num(l.confianca_media),
      };
    });

  const resumo = resumirRadar(paraResumir);

  return {
    ...resumo,
    totalConfirmado: Number(totalConfirmado.toFixed(2)),
    aguardandoHumano,
    naoAvaliadas: await contarNaoAvaliadas(organizationId, clinicId),
  };
}

/**
 * O resumo das clínicas que ESTE usuário alcança.
 *
 * ============================================================================
 *  POR QUE ESTA FUNÇÃO EXISTE, e por que `resumoDoRadar(org, null)` não serve
 *  para a tela.
 *
 *  `null` significa "a organização inteira". Numa rede de três unidades com um
 *  usuário que só alcança a do centro, isso mostraria o dinheiro das três — e
 *  a pessoa veria oportunidades de pacientes que ela não pode nem abrir.
 *
 *  A escolha aqui é somar POR CLÍNICA ALCANÇADA, e não confiar num `null` que
 *  significa "tudo". São N chamadas em vez de uma, e N é o número de unidades
 *  do tenant — que numa clínica é 1 e numa rede grande é uma dúzia. O custo é
 *  conhecido e pequeno; o vazamento não teria como ser percebido.
 * ============================================================================
 */
export async function resumoDasClinicas(
  organizationId: string,
  clinicIds: readonly string[],
): Promise<ResumoCompleto> {
  if (clinicIds.length === 0) {
    // Usuário sem clínica nenhuma vê zero — e não "tudo". É a diferença entre
    // fail-closed e o pior tipo de fail-open que existe neste sistema.
    return {
      linhas: [],
      totalAbertas: 0,
      totalPotencial: 0,
      totalEsperado: 0,
      confiancaMedia: 0,
      totalConfirmado: 0,
      aguardandoHumano: 0,
      naoAvaliadas: 0,
    };
  }

  if (clinicIds.length === 1) return resumoDoRadar(organizationId, clinicIds[0] ?? null);

  const partes = await Promise.all(clinicIds.map((c) => resumoDoRadar(organizationId, c)));

  const porTipo = new Map<
    TipoOportunidade,
    { abertas: number; potencial: number; esperado: number; confianca: number }
  >();
  let totalConfirmado = 0;
  let aguardandoHumano = 0;
  let naoAvaliadas = 0;

  for (const p of partes) {
    totalConfirmado += p.totalConfirmado;
    aguardandoHumano += p.aguardandoHumano;
    naoAvaliadas += p.naoAvaliadas;

    for (const l of p.linhas) {
      const a = porTipo.get(l.tipo) ?? { abertas: 0, potencial: 0, esperado: 0, confianca: 0 };
      a.abertas += l.abertas;
      a.potencial += l.valorPotencial;
      a.esperado += l.valorEsperado;
      // A confiança de cada parte já vem ponderada pela quantidade DELA; para
      // juntar, o peso tem que voltar a ser a quantidade.
      a.confianca += p.confiancaMedia * l.abertas;
      porTipo.set(l.tipo, a);
    }
  }

  const resumo = resumirRadar(
    [...porTipo.entries()].map(([tipo, a]) => ({
      tipo,
      abertas: a.abertas,
      valorPotencial: a.potencial,
      valorEsperado: a.esperado,
      confianca: a.abertas === 0 ? 0 : a.confianca / a.abertas,
    })),
  );

  return {
    ...resumo,
    totalConfirmado: Number(totalConfirmado.toFixed(2)),
    aguardandoHumano,
    naoAvaliadas,
  };
}

/**
 * O conjunto de tipos que o código conhece.
 *
 * FILTRAR É DELIBERADO. Um `tipo` gravado à mão no banco com um valor fora do
 * catálogo apareceria na Home como uma linha sem rótulo e com valor somado ao
 * total. Descartá-la mantém o painel honesto; o valor some, e some de forma
 * visível, porque `totalAbertas` não bate com a contagem bruta.
 */
const TIPOS_CONHECIDOS: ReadonlySet<string> = new Set<string>(TIPOS_OPORTUNIDADE);

async function contarNaoAvaliadas(
  organizationId: string,
  clinicId: string | null,
): Promise<number> {
  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "fechada_em", op: "is", valor: null },
    { coluna: "dismissed_em", op: "is", valor: null },
    { coluna: "probability", op: "is", valor: null },
  ];
  if (clinicId !== null) filtros.push({ coluna: "clinic_id", op: "eq", valor: clinicId });

  return contar("crc_opportunities", filtros);
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/* -------------------------------------------------------------------------- */
/* A qualificação                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Quantas oportunidades por página.
 *
 * O MESMO DESENHO DAS VARREDURAS da `supabase/26`: página pequena, cursor por
 * `id`, e o cursor só anda depois que a página foi processada. O pulso roda a
 * cada cinco minutos e não pode ficar preso numa base de 8.000.
 */
export const PAGINA_DE_QUALIFICACAO = 200;

export type ResultadoDaQualificacao = {
  lidas: number;
  pontuadas: number;
  /** O último id processado. Vira cursor da próxima volta. */
  ultimoId: string | null;
  /** `true` quando a página veio incompleta — não há mais nada à frente. */
  fechou: boolean;
};

type LinhaParaQualificar = {
  id: string;
  tipo: string;
  potential_value: string | null;
  criado_em: string;
  expires_at: string | null;
  probability: string | null;
  score_version: string | null;
};

/**
 * Pontua uma página de oportunidades.
 *
 * ============================================================================
 *  O QUE ESTA PASSAGEM PRECISA SABER, E DE ONDE VEM.
 *
 *  A probabilidade depende de sinais que moram em outras tabelas: se a pessoa
 *  respondeu, quantas vezes tentamos, se pediu para marcar. Ler isso por
 *  oportunidade seria um N+1 de quatro consultas por linha — 800 idas ao banco
 *  numa página de 200.
 *
 *  A SAÍDA É LER OS SINAIS EM LOTE, uma consulta por sinal, e cruzar em
 *  memória. Cinco consultas por página, em vez de 800.
 * ============================================================================
 */
export async function qualificarPagina(
  organizationId: string,
  cursor: string | null,
  agora: Date = new Date(),
): Promise<ResultadoDaQualificacao> {
  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "fechada_em", op: "is", valor: null },
    { coluna: "dismissed_em", op: "is", valor: null },
  ];
  if (cursor !== null) filtros.push({ coluna: "id", op: "gt", valor: cursor });

  const linhas = await selecionar<LinhaParaQualificar>("crc_opportunities", {
    colunas: "id,tipo,potential_value,criado_em,expires_at,probability,score_version",
    filtros,
    ordenar: [{ coluna: "id", ascendente: true }],
    limite: PAGINA_DE_QUALIFICACAO,
  });

  if (linhas.length === 0) {
    return { lidas: 0, pontuadas: 0, ultimoId: null, fechou: true };
  }

  const sinais = await lerSinais(
    organizationId,
    linhas.map((l) => l.id),
  );

  let pontuadas = 0;

  for (const l of linhas) {
    /*
     * JÁ PONTUADA PELA MESMA FÓRMULA? PULA.
     *
     * Não é economia: é o que impede a passagem de reescrever 8.000 linhas a
     * cada cinco minutos, gerando 8.000 `atualizado_em` novos e apagando a
     * informação de quando a oportunidade realmente mudou.
     *
     * Quando a VERSÃO muda, todas voltam a ser pontuadas — que é exatamente o
     * comportamento certo depois de mexer nos pesos.
     */
    if (l.probability !== null && l.score_version === VERSAO_DO_SCORE) continue;

    const tipo = TIPOS_CONHECIDOS.has(l.tipo) ? (l.tipo as TipoOportunidade) : "MANUAL";
    const s = sinais.get(l.id) ?? SEM_SINAL;
    // `diasEntre` devolve `null` quando a data não parseia. Zero é o fallback
    // certo: uma oportunidade com `criado_em` ilegível é tratada como recém
    // criada, e não como parada há um ano — que inflaria o desconto de idade.
    const diasEsperando = Math.max(0, diasEntre(l.criado_em, agora) ?? 0);

    const chance = estimarChance({
      tipo,
      // A amostra por tipo entra numa volta futura: medir conversão exige a
      // cadeia de atribuição povoada, e ela começa a existir agora. Até lá a
      // confiança fica no piso, que é a verdade.
      amostra: null,
      respondeu: s.respondeu,
      intencaoAgendar: s.intencaoAgendar,
      tentativasSemResposta: s.tentativasSemResposta,
      diasEsperando,
    });

    const urgencia = calcularUrgencia({ expiraEm: l.expires_at, diasEsperando, tipo }, agora);

    const valor = valorDoRadar(num(l.potential_value), chance, urgencia);

    try {
      await atualizar("crc_opportunities", [{ coluna: "id", op: "eq", valor: l.id }], {
        probability: chance.probabilidade,
        confidence: chance.confianca,
        urgency: urgencia,
        impact: valor.impacto,
        score_version: VERSAO_DO_SCORE,
        evidence: chance.fatores,
        atualizado_em: agora.toISOString(),
      });
      pontuadas += 1;
    } catch (erro) {
      /*
       * UMA LINHA QUE FALHA NÃO DERRUBA A PÁGINA.
       *
       * E o cursor ainda avança, o que é deliberado: a linha problemática volta
       * a ser tentada na próxima VOLTA completa, e não prende a varredura no
       * mesmo ponto para sempre. O erro fica no log com o id.
       */
      registrar("erro", "Falha ao pontuar oportunidade no Radar.", {
        organizationId,
        opportunityId: l.id,
        detalhe: descreverErro(erro),
      });
    }
  }

  return {
    lidas: linhas.length,
    pontuadas,
    ultimoId: linhas[linhas.length - 1]?.id ?? null,
    fechou: linhas.length < PAGINA_DE_QUALIFICACAO,
  };
}

type Sinal = {
  respondeu: boolean;
  intencaoAgendar: boolean;
  tentativasSemResposta: number;
};

const SEM_SINAL: Sinal = { respondeu: false, intencaoAgendar: false, tentativasSemResposta: 0 };

/**
 * Os sinais de todas as oportunidades da página, em lote.
 *
 * ============================================================================
 *  O SINAL VEM DA CADEIA DE ATRIBUIÇÃO, e não das mensagens.
 *
 *  A tentação era contar mensagens em `crc_messages` por conversa. Não serve:
 *  uma conversa pode atender várias oportunidades ao longo do ano, e "o
 *  paciente respondeu" precisa significar "respondeu A ESTA abordagem" — senão
 *  uma pessoa que conversou em março faz o recall de setembro nascer com
 *  probabilidade dobrada.
 *
 *  `crc_attribution_events` guarda exatamente isso, por oportunidade.
 * ============================================================================
 */
async function lerSinais(
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, Sinal>> {
  const mapa = new Map<string, Sinal>();
  if (ids.length === 0) return mapa;

  const elos = await selecionar<{ opportunity_id: string; elo: string }>("crc_attribution_events", {
    colunas: "opportunity_id,elo",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "opportunity_id", op: "in", valor: [...ids] },
      { coluna: "elo", op: "in", valor: ["ACAO", "RESPOSTA"] },
    ],
    // O teto protege contra uma oportunidade patológica com milhares de elos
    // arrastar a página inteira. 20 por oportunidade é folgado.
    limite: ids.length * 20,
  });

  for (const e of elos) {
    const atual = mapa.get(e.opportunity_id) ?? { ...SEM_SINAL };

    if (e.elo === "RESPOSTA") atual.respondeu = true;
    else if (e.elo === "ACAO") atual.tentativasSemResposta += 1;

    mapa.set(e.opportunity_id, atual);
  }

  /*
   * "TENTATIVAS SEM RESPOSTA" É AÇÕES MENOS RESPOSTAS, E NÃO AÇÕES.
   *
   * Sem esta correção, uma oportunidade com cinco trocas de mensagem — cinco
   * ações, cinco respostas, uma conversa saudável — seria lida como "cinco
   * contatos sem resposta" e teria a probabilidade cortada a 15% do valor.
   * A conversa mais produtiva da clínica viraria a de menor chance.
   */
  for (const [id, s] of mapa) {
    if (s.respondeu) mapa.set(id, { ...s, tentativasSemResposta: 0 });
  }

  return mapa;
}

/* -------------------------------------------------------------------------- */
/* A varredura                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Quantas oportunidades pontuar por volta da madrugada.
 *
 * ============================================================================
 *  O TETO EXISTE PELO MESMO MOTIVO DO TETO DO RECALL (`supabase/26`): a volta
 *  pesada roda numa função serverless com limite de tempo, e uma base de 8.000
 *  oportunidades não cabe numa execução.
 *
 *  A DIFERENÇA É QUE AQUI O TETO QUASE NUNCA MORDE. A qualificação PULA o que
 *  já está na versão corrente da fórmula — então a primeira volta depois de um
 *  deploy pontua tudo, e as seguintes pontuam só o que nasceu no dia. O teto é
 *  para a primeira volta, e para o dia em que a fórmula mudar.
 * ============================================================================
 */
const TETO_DE_QUALIFICACAO_POR_VOLTA = 3_000;

/** O mesmo orçamento da varredura de recall, e pela mesma razão. */
const ORCAMENTO_DA_QUALIFICACAO_MS = 20_000;

export type ResultadoDaVarreduraDoRadar = {
  paginas: number;
  lidas: number;
  pontuadas: number;
  /** `true` quando a volta chegou ao fim da base. */
  fechouCiclo: boolean;
  /** Por que parou: serve para o painel de Saúde saber se o teto está apertado. */
  parouPor: "fim" | "teto" | "tempo";
};

/**
 * Pontua a base inteira, em páginas, respeitando o relógio.
 *
 * ============================================================================
 *  A ORDEM AQUI É A MESMA LIÇÃO DO RECALL, e ela é a única coisa que importa
 *  neste laço:
 *
 *      PROCESSA A PÁGINA  →  DEPOIS grava o cursor.
 *
 *  Invertida, uma falha no meio da página avança o cursor mesmo assim, e
 *  aquelas 200 oportunidades ficam sem pontuação até a volta seguinte — que
 *  também vai pular, porque o cursor já passou. O buraco é permanente e
 *  silencioso: a Home simplesmente mostra menos dinheiro do que existe.
 * ============================================================================
 */
export async function varrerRadar(
  organizationId: string,
  agora: Date = new Date(),
  limites: { teto?: number; orcamentoMs?: number } = {},
): Promise<ResultadoDaVarreduraDoRadar> {
  const teto = limites.teto ?? TETO_DE_QUALIFICACAO_POR_VOLTA;
  const orcamentoMs = limites.orcamentoMs ?? ORCAMENTO_DA_QUALIFICACAO_MS;
  const comecou = Date.now();

  let paginas = 0;
  let lidas = 0;
  let pontuadas = 0;
  let fechouCiclo = false;
  let parouPor: "fim" | "teto" | "tempo" = "fim";

  for (;;) {
    const cursor = await lerCursorDoRadar(organizationId);
    const r = await qualificarPagina(organizationId, cursor, agora);

    paginas += 1;
    lidas += r.lidas;
    pontuadas += r.pontuadas;

    /*
     * O CURSOR VOLTA AO COMEÇO QUANDO A VOLTA FECHA, e não fica parado no fim.
     * Sem isso, a segunda volta leria zero linhas para sempre: o cursor estaria
     * além do último id, e nada de novo nasce com id menor.
     */
    await gravarCursorDoRadar(organizationId, r.fechou ? null : r.ultimoId, r.fechou, agora);

    if (r.fechou) {
      fechouCiclo = true;
      parouPor = "fim";
      break;
    }
    if (lidas >= teto) {
      parouPor = "teto";
      break;
    }
    if (Date.now() - comecou >= orcamentoMs) {
      parouPor = "tempo";
      break;
    }
  }

  return { paginas, lidas, pontuadas, fechouCiclo, parouPor };
}

const VARREDURA = "radar";

async function lerCursorDoRadar(organizationId: string): Promise<string | null> {
  try {
    const linha = await selecionarUm("crc_scan_state", {
      colunas: "cursor_id",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "varredura", op: "eq", valor: VARREDURA },
      ],
    });
    return typeof linha?.["cursor_id"] === "string" ? linha["cursor_id"] : null;
  } catch {
    /*
     * CURSOR ILEGÍVEL VIRA "COMEÇAR DO ZERO", e não uma exceção.
     *
     * Recomeçar do início custa uma volta a mais e não perde nada — a
     * qualificação é idempotente e pula o que já está na versão corrente.
     * Estourar aqui derrubaria a varredura inteira por causa de um cursor.
     */
    return null;
  }
}

async function gravarCursorDoRadar(
  organizationId: string,
  cursorId: string | null,
  fechouCiclo: boolean,
  agora: Date,
): Promise<void> {
  const anterior = await selecionarUm("crc_scan_state", {
    colunas: "ciclo,ciclo_iniciado_em,ultimo_ciclo_completo_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "varredura", op: "eq", valor: VARREDURA },
    ],
  });

  const ciclo = typeof anterior?.["ciclo"] === "number" ? anterior["ciclo"] : 0;
  const iniciadoEm =
    typeof anterior?.["ciclo_iniciado_em"] === "string" ? anterior["ciclo_iniciado_em"] : null;
  const completoEm =
    typeof anterior?.["ultimo_ciclo_completo_em"] === "string"
      ? anterior["ultimo_ciclo_completo_em"]
      : null;

  const iso = agora.toISOString();

  /*
   * ==========================================================================
   *  TODAS AS COLUNAS, SEMPRE — e este comentário custou um defeito real.
   *
   *  `gravar` usa `resolution=merge-duplicates`, que no PostgREST é um upsert
   *  de LINHA INTEIRA: coluna omitida do payload volta ao DEFAULT. Omitir
   *  `ciclo` aqui zeraria o contador a cada página, e o painel de Saúde leria
   *  "a varredura nunca fechou uma volta" numa varredura saudável.
   *
   *  Foi exatamente o que aconteceu na varredura de recall (achado B-7).
   * ==========================================================================
   */
  await gravar(
    "crc_scan_state",
    {
      organization_id: organizationId,
      varredura: VARREDURA,
      cursor_data: null,
      cursor_id: cursorId,
      ciclo: fechouCiclo ? ciclo + 1 : ciclo,
      // Ciclo que fecha reinicia a contagem do próximo AGORA. É o que permite
      // distinguir CICLO LENTO de PARADA — ver `supabase/29`.
      ciclo_iniciado_em: fechouCiclo ? iso : (iniciadoEm ?? iso),
      ultimo_ciclo_completo_em: fechouCiclo ? iso : completoEm,
      atualizado_em: iso,
    },
    "organization_id,varredura",
  );
}

/* -------------------------------------------------------------------------- */
/* A fila                                                                     */
/* -------------------------------------------------------------------------- */

export type ItemDoRadar = {
  id: string;
  patientId: string | null;
  tipo: TipoOportunidade;
  motivo: string | null;
  estado: EstadoRadar;
  valorPotencial: number;
  valorEsperado: number;
  probabilidade: number | null;
  confianca: number | null;
  urgencia: number | null;
  impacto: number | null;
  proximaAcao: string | null;
  proximaAcaoCodigo: string | null;
  expiraEm: string | null;
  criadoEm: string;
};

/**
 * A fila do Radar, ordenada por impacto.
 *
 * A ORDEM É POR `impact`, E NÃO POR `priority_score`. São duas filas para dois
 * trabalhos: `priority_score` ordena a fila de ligação da recepção (quem
 * respondeu agora sobe); `impact` ordena por dinheiro esperado e janela, que é
 * a pergunta do dono. As duas telas existem, e misturá-las daria uma que não
 * serve para nenhum dos dois.
 */
export async function listarDoRadar(
  organizationId: string,
  /**
   * As clínicas que quem pergunta ALCANÇA.
   *
   * `null` significa "a organização inteira", e só deve ser usado por caminho
   * interno — varredura, relatório do dono. Toda chamada vinda de tela passa a
   * lista do contexto, e uma lista VAZIA devolve vazio: quem não alcança
   * clínica nenhuma não vê nada, em vez de ver tudo.
   */
  clinicIds: readonly string[] | null,
  opcoes: { limite?: number; tipo?: TipoOportunidade } = {},
  agora: Date = new Date(),
): Promise<ItemDoRadar[]> {
  if (clinicIds !== null && clinicIds.length === 0) return [];

  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "fechada_em", op: "is", valor: null },
    { coluna: "dismissed_em", op: "is", valor: null },
  ];
  if (clinicIds !== null) {
    filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });
  }
  if (opcoes.tipo !== undefined) filtros.push({ coluna: "tipo", op: "eq", valor: opcoes.tipo });

  const linhas = await selecionar("crc_opportunities", {
    colunas:
      "id,patient_id,tipo,motivo,potential_value,probability,confidence,urgency,impact,next_action,next_best_action,expires_at,criado_em,converted_at,lost_at,dismissed_em,acionada_em,aguardando",
    filtros,
    ordenar: [
      { coluna: "impact", ascendente: false, nullsPrimeiro: false },
      { coluna: "criado_em", ascendente: true },
    ],
    limite: Math.min(Math.max(opcoes.limite ?? 50, 1), 200),
  });

  return linhas.map((l) => paraItem(l, agora)).filter((i) => aindaRecuperavel(i.estado));
}

function paraItem(l: Linha, agora: Date): ItemDoRadar {
  const potencial = num(l["potential_value"] as string | null);
  const probabilidade = opcionalNumero(l["probability"]);

  return {
    id: String(l["id"] ?? ""),
    patientId: typeof l["patient_id"] === "string" ? l["patient_id"] : null,
    tipo: TIPOS_CONHECIDOS.has(String(l["tipo"]))
      ? (String(l["tipo"]) as TipoOportunidade)
      : "MANUAL",
    motivo: typeof l["motivo"] === "string" ? l["motivo"] : null,
    estado: estadoDoRadar(
      {
        convertedAt: texto(l["converted_at"]),
        lostAt: texto(l["lost_at"]),
        dismissedEm: texto(l["dismissed_em"]),
        expiresAt: texto(l["expires_at"]),
        acionadaEm: texto(l["acionada_em"]),
        aguardando:
          l["aguardando"] === "PACIENTE" || l["aguardando"] === "HUMANO" ? l["aguardando"] : null,
        probability: probabilidade,
      },
      agora,
    ),
    valorPotencial: potencial,
    // Recalculado aqui, e não lido de coluna: é a mesma conta do banco, e
    // manter uma coluna derivada sincronizada é uma fonte de divergência que
    // esta tela não precisa ter.
    valorEsperado: Number((potencial * (probabilidade ?? 0)).toFixed(2)),
    probabilidade,
    confianca: opcionalNumero(l["confidence"]),
    urgencia: opcionalNumero(l["urgency"]),
    impacto: opcionalNumero(l["impact"]),
    proximaAcao: typeof l["next_action"] === "string" ? l["next_action"] : null,
    proximaAcaoCodigo: typeof l["next_best_action"] === "string" ? l["next_best_action"] : null,
    expiraEm: texto(l["expires_at"]),
    criadoEm: String(l["criado_em"] ?? ""),
  };
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** `numeric` volta como string; `null` precisa continuar `null`, e não virar 0. */
function opcionalNumero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/* -------------------------------------------------------------------------- */
/* A cadeia de atribuição                                                     */
/* -------------------------------------------------------------------------- */

export type Elo = "ACAO" | "RESPOSTA" | "CONSULTA_CRIADA" | "COMPARECEU" | "PRODUCAO" | "PERDA";
export type ConfiancaDoElo = "CONFIRMADO" | "PROVAVEL" | "DESCONHECIDO";

export type NovoElo = {
  organizationId: string;
  clinicId: string;
  patientId?: string | null;
  opportunityId?: string | null;
  elo: Elo;
  anteriorId?: string | null;
  canal?: string | null;
  origem?: string | null;
  /** Só no elo PRODUCAO. Ver o comentário abaixo. */
  valor?: number | null;
  confianca?: ConfiancaDoElo;
  ocorridoEm?: string;
  chaveDedupe?: string | null;
};

/**
 * Grava um elo da cadeia.
 *
 * ============================================================================
 *  A REGRA QUE IMPEDE O PAINEL DE MENTIR: VALOR SÓ NO ELO `PRODUCAO`.
 *
 *  É tentador gravar o valor do orçamento já no elo `ACAO` — afinal sabe-se
 *  quanto vale. Mas aí a soma de `valor` sobre a tabela passa a incluir dinheiro
 *  que ninguém recebeu, e a resposta para "quanto o CRC recuperou este mês"
 *  vira a soma das tentativas.
 *
 *  Valor em qualquer outro elo é recusado — alto, e não em silêncio.
 * ============================================================================
 *
 * E a CONFIANÇA PADRÃO É `DESCONHECIDO`. Um elo que ninguém soube classificar
 * não pode entrar como crédito nosso por omissão.
 */
export async function registrarElo(e: NovoElo): Promise<string | null> {
  if (e.elo !== "PRODUCAO" && e.valor !== null && e.valor !== undefined) {
    throw new Error(
      `Elo "${e.elo}" não pode carregar valor. Só PRODUCAO representa dinheiro que existiu.`,
    );
  }

  const linha = await inserirIgnorandoDuplicata("crc_attribution_events", {
    organization_id: e.organizationId,
    clinic_id: e.clinicId,
    patient_id: e.patientId ?? null,
    opportunity_id: e.opportunityId ?? null,
    elo: e.elo,
    anterior_id: e.anteriorId ?? null,
    canal: e.canal ?? null,
    origem: e.origem ?? null,
    valor: e.valor ?? null,
    confianca: e.confianca ?? "DESCONHECIDO",
    ocorrido_em: e.ocorridoEm ?? agoraIso(),
    chave_dedupe: e.chaveDedupe ?? null,
  });

  return linha === null ? null : String(linha["id"] ?? "");
}

export type FunilDeAtribuicao = {
  acoes: number;
  respostas: number;
  consultas: number;
  comparecimentos: number;
  /** Soma de `valor` nos elos PRODUCAO — e só neles. */
  producao: number;
  /** A parte da produção cuja cadeia é CONFIRMADA. */
  producaoConfirmada: number;
};

/**
 * O funil, no período.
 *
 * OS DOIS NÚMEROS DE PRODUÇÃO EXISTEM PARA A MESMA FRASE NÃO SER DITA DE DUAS
 * FORMAS. "R$ 28.450 recuperados" só pode usar `producaoConfirmada`; o outro
 * número é útil, e é outra coisa — e a tela precisa dizer qual está mostrando.
 */
export async function funilDeAtribuicao(
  organizationId: string,
  clinicId: string | null,
  desde: string,
): Promise<FunilDeAtribuicao> {
  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "ocorrido_em", op: "gte", valor: desde },
  ];
  if (clinicId !== null) filtros.push({ coluna: "clinic_id", op: "eq", valor: clinicId });

  const linhas = await selecionar<{ elo: string; valor: string | null; confianca: string }>(
    "crc_attribution_events",
    {
      colunas: "elo,valor,confianca",
      filtros,
      // Teto de segurança. Acima disto a resposta certa é uma agregação no
      // banco, e não uma leitura maior — está anotado no relatório.
      limite: 5000,
    },
  );

  const f: FunilDeAtribuicao = {
    acoes: 0,
    respostas: 0,
    consultas: 0,
    comparecimentos: 0,
    producao: 0,
    producaoConfirmada: 0,
  };

  for (const l of linhas) {
    if (l.elo === "ACAO") f.acoes += 1;
    else if (l.elo === "RESPOSTA") f.respostas += 1;
    else if (l.elo === "CONSULTA_CRIADA") f.consultas += 1;
    else if (l.elo === "COMPARECEU") f.comparecimentos += 1;
    else if (l.elo === "PRODUCAO") {
      const v = num(l.valor);
      f.producao += v;
      if (l.confianca === "CONFIRMADO") f.producaoConfirmada += v;
    }
  }

  f.producao = Number(f.producao.toFixed(2));
  f.producaoConfirmada = Number(f.producaoConfirmada.toFixed(2));
  return f;
}
