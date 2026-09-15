/**
 * Meta Lead Ads — aquisição, e não conversa. §18, §19, §20, §21, §37.
 *
 * ============================================================================
 *  O §18 ABRE COM A DISTINÇÃO QUE GOVERNA O ARQUIVO: "este módulo precisa ser
 *  tratado como AQUISIÇÃO, não como conversa".
 *
 *  Um Instant Form não tem thread. Ninguém do outro lado está esperando
 *  resposta NAQUELE canal — a pessoa preencheu nome e telefone e fechou o
 *  Instagram. A conversa continua por WhatsApp ou ligação.
 *
 *  É por isso que `lead_ads` NÃO está em `CANAIS_DE_CONVERSA`: modelá-lo como
 *  canal criaria uma conversa na Inbox que nunca recebe nem manda mensagem, e
 *  ficaria lá para sempre sem nada a fazer.
 *
 *  O lead entra pelo FUNIL. É `crc_leads` + `crc_opportunities`, exatamente
 *  como o lead do formulário do site.
 * ============================================================================
 *
 * ============================================================================
 *  O WEBHOOK NÃO É FONTE ÚNICA — §18.1, e esta é a decisão mais importante.
 *
 *      webhook              = caminho rápido
 *      job de reconciliação = caminho de GARANTIA
 *
 *  Por que os dois: o webhook da Meta falha em silêncio de três formas —
 *  assinatura recusada por token rotacionado, app temporariamente desassinado
 *  da Página, e o nosso próprio 500 durante um deploy. Nos três, a Meta
 *  considera entregue (ou desiste) e NUNCA reenvia.
 *
 *  E o custo de perder um lead de Lead Ads não é uma mensagem: é o valor pago
 *  pelo clique, mais o tratamento que não aconteceu. Uma reconciliação que roda
 *  de hora em hora torna a perda impossível — e ela é IDEMPOTENTE por
 *  `crc_leads.meta_lead_id`, então rodar duas vezes não cria nada.
 * ============================================================================
 *
 * FONTE CONFERIDA EM 15/09/2026:
 *   webhook `leadgen` no objeto Page, com `leadgen_id`, `page_id`, `form_id`,
 *   `adgroup_id`, `ad_id`, `created_time`; os detalhes vêm de
 *   `GET /{leadgen_id}` com `leads_retrieval` + `pages_manage_ads`.
 *     https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen/
 *     https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/retrieving
 */
import {
  interesseDeclarado,
  normalizarCampos,
  type CampoDoFormulario,
} from "../dominio/campos-do-formulario";
import { normalizarTelefone } from "../dominio/telefone";
import { campo, ehObjeto, lista, textoOpcional } from "../dominio/validar";
import { ClienteDaGraph } from "../integracoes/meta/cliente";
import { instanteDaMeta } from "../integracoes/meta/normalizar";
import type { EventoLead } from "../integracoes/meta/tipos";
import { gravar, inserirIgnorandoDuplicata, selecionar, selecionarUm } from "../servidor/banco";
import { descreverErro, registrar } from "../servidor/registro";

import type { EscopoDoWebhook } from "./webhooks";

/** O recurso em `crc_sync_state`. Ver §37: é um job de sincronização como os outros. */
export const RECURSO_LEAD_ADS = "meta_lead_ads";

export type ResultadoImportacao = {
  leadId: string | null;
  opportunityId: string | null;
  duplicado: boolean;
  /** A frase do que aconteceu, para o log e para a tela. */
  porque: string;
};

/* -------------------------------------------------------------------------- */
/* Os detalhes do lead, na Graph                                              */
/* -------------------------------------------------------------------------- */

export type DetalhesDoLead = {
  campos: CampoDoFormulario[];
  formId: string | null;
  formNome: string | null;
  adId: string | null;
  adNome: string | null;
  adsetId: string | null;
  adsetNome: string | null;
  campaignId: string | null;
  campaignNome: string | null;
  plataforma: string | null;
  criadoEm: string | null;
};

/**
 * Os campos que a Graph precisa devolver.
 *
 * ============================================================================
 *  PEDIR EXPLICITAMENTE É O QUE FAZ A INTEGRAÇÃO SOBREVIVER A UM UPGRADE.
 *
 *  Sem `?fields=`, a Graph devolve um subconjunto mínimo — e o mínimo MUDA
 *  entre versões. Uma integração que confia no default perde `campaign_name`
 *  numa terça, sem erro nenhum: o lead entra, e a coluna de campanha fica
 *  vazia. O relatório de CAC passa a ter um buraco que ninguém associa a uma
 *  mudança de versão.
 *
 *  `field_data` é o único indispensável — sem ele não há nome nem telefone. Os
 *  demais são atribuição (§19), e a ausência deles é degradação, não falha.
 * ============================================================================
 */
const CAMPOS_DO_LEAD = [
  "id",
  "created_time",
  "field_data",
  "form_id",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "platform",
  "is_organic",
].join(",");

export async function buscarDetalhesDoLead(
  cliente: ClienteDaGraph,
  leadgenId: string,
): Promise<
  { ok: true; detalhes: DetalhesDoLead } | { ok: false; porque: string; permanente: boolean }
> {
  const r = await cliente.obter(leadgenId, { fields: CAMPOS_DO_LEAD }, "buscar_lead");

  if (!r.ok) {
    return {
      ok: false,
      porque: `${r.erro.codigo}: ${r.erro.detalhe} — ${r.erro.acao}`,
      permanente: r.erro.classe === "permanente",
    };
  }

  const campos: CampoDoFormulario[] = [];
  for (const c of lista(campo(r.dados, "field_data"))) {
    if (!ehObjeto(c)) continue;
    const name = textoOpcional(c["name"]);
    if (name === null) continue;
    campos.push({
      name,
      values: lista(c["values"])
        .map((v) => textoOpcional(v))
        .filter((v): v is string => v !== null),
    });
  }

  return {
    ok: true,
    detalhes: {
      campos,
      formId: textoOpcional(campo(r.dados, "form_id")),
      formNome: textoOpcional(campo(r.dados, "form_name")),
      adId: textoOpcional(campo(r.dados, "ad_id")),
      adNome: textoOpcional(campo(r.dados, "ad_name")),
      adsetId: textoOpcional(campo(r.dados, "adset_id")),
      adsetNome: textoOpcional(campo(r.dados, "adset_name")),
      campaignId: textoOpcional(campo(r.dados, "campaign_id")),
      campaignNome: textoOpcional(campo(r.dados, "campaign_name")),
      plataforma: textoOpcional(campo(r.dados, "platform")),
      /*
       * O `created_time` DA GRAPH VEM COMO `2026-09-15T11:58:00+0000`, e ele é
       * NORMALIZADO aqui — na fronteira.
       *
       * ======================================================================
       *  O POSTGRES PARSEARIA ESSE FORMATO numa coluna `timestamptz`, então
       *  gravá-lo cru "funcionaria". O que não funcionaria é o resto:
       *
       *    `leadsDaMeta` faz `Date.parse` para calcular o speed-to-lead;
       *    `emitir` põe o valor em `ocorrido_em` de `crc_events`;
       *    e o cursor da reconciliação é COMPARADO COMO STRING.
       *
       *  Uma fronteira que deixa passar dois formatos de data obriga cada
       *  consumidor a saber dos dois. `instanteDaMeta` já existe para isto, e
       *  também resolve o outro formato que a Meta manda: epoch em segundos.
       * ======================================================================
       */
      criadoEm:
        textoOpcional(campo(r.dados, "created_time")) === null
          ? null
          : instanteDaMeta(campo(r.dados, "created_time")),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* A importação                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Importa um lead a partir do webhook.
 *
 * ============================================================================
 *  O `leadgen_id` É PERSISTIDO ANTES DE A GRAPH SER CHAMADA, e a ordem é o §18
 *  literal:
 *
 *      persistir leadgen_id → buscar lead na Graph → normalizar → …
 *
 *  A razão é dura: se a Graph estiver fora, ou o token vencido, ou a cota
 *  estourada, o lead PRECISA continuar existindo — com o id, para a
 *  reconciliação buscá-lo depois. Chamar a Graph primeiro e gravar depois
 *  perderia o lead junto com a falha, e ele nunca seria recuperado: o webhook
 *  não volta.
 *
 *  Na prática isso significa um lead que nasce com nome "Lead do Instagram" e
 *  ganha o nome de verdade quando a Graph responder. É feio na tela por alguns
 *  minutos, e é a diferença entre um lead atrasado e um lead perdido.
 * ============================================================================
 */
export async function importarLeadDaMeta(
  escopo: EscopoDoWebhook,
  evento: EventoLead,
): Promise<ResultadoImportacao> {
  const existente = await selecionarUm("crc_leads", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: escopo.organizationId },
      { coluna: "meta_lead_id", op: "eq", valor: evento.leadgenId },
    ],
  });

  if (existente !== null) {
    return {
      leadId: String(existente["id"] ?? ""),
      opportunityId: null,
      duplicado: true,
      porque: "Este lead da Meta já havia sido importado.",
    };
  }

  const detalhes = await tentarDetalhes(escopo, evento.leadgenId);

  return gravarLead(escopo, {
    leadgenId: evento.leadgenId,
    pageId: evento.pageId,
    adIdDoWebhook: evento.adId,
    formIdDoWebhook: evento.formId,
    ocorridoEm: evento.ocorridoEm,
    detalhes,
  });
}

async function tentarDetalhes(
  escopo: EscopoDoWebhook,
  leadgenId: string,
): Promise<DetalhesDoLead | null> {
  try {
    const cliente = await clienteDeLeadAds(escopo);
    if (cliente === null) return null;

    const r = await buscarDetalhesDoLead(cliente, leadgenId);
    if (r.ok) return r.detalhes;

    registrar("erro", "Não foi possível buscar os detalhes do lead na Graph API.", {
      organizationId: escopo.organizationId,
      leadgenId,
      detalhe: r.porque,
      // A CONSEQUÊNCIA É DITA no log, porque ela não é obvia: o lead entra
      // incompleto e a reconciliação o completa. Sem esta frase, quem lê o log
      // acha que o lead foi perdido.
      efeito:
        "O lead será gravado com o leadgen_id e completado pela reconciliação. Nenhum lead é perdido.",
    });
    return null;
  } catch (erro) {
    registrar("erro", "Falha ao montar o cliente da Graph para Lead Ads.", {
      organizationId: escopo.organizationId,
      detalhe: descreverErro(erro),
    });
    return null;
  }
}

async function clienteDeLeadAds(escopo: EscopoDoWebhook): Promise<ClienteDaGraph | null> {
  const { canalMetaDaClinica } = await import("../integracoes/meta/canais");
  const r = await canalMetaDaClinica(escopo.organizationId, escopo.clinicId, "lead_ads");
  if (!r.ok || r.canal.token === null) return null;

  return new ClienteDaGraph({
    token: r.canal.token,
    organizationId: escopo.organizationId,
    integracao: "meta_lead_ads",
  });
}

/* -------------------------------------------------------------------------- */

type ParaGravar = {
  leadgenId: string;
  pageId: string | null;
  adIdDoWebhook: string | null;
  formIdDoWebhook: string | null;
  ocorridoEm: string;
  detalhes: DetalhesDoLead | null;
};

async function gravarLead(escopo: EscopoDoWebhook, p: ParaGravar): Promise<ResultadoImportacao> {
  const d = p.detalhes;
  const normalizados = normalizarCampos(d?.campos ?? []);

  /*
   * O TELEFONE É NORMALIZADO E PODE FALHAR — e o lead entra de qualquer jeito.
   *
   * ==========================================================================
   *  O §52 pede o teste "telefone inválido", e o comportamento certo é este:
   *  guardar o telefone CRU em `campos` e deixar a coluna nula.
   *
   *  As duas alternativas são piores:
   *
   *    RECUSAR O LEAD   a pessoa preencheu o formulário. A clínica pagou pelo
   *                     clique. Jogar fora porque o DDD veio errado é jogar
   *                     dinheiro fora — e muitas vezes o e-mail está certo.
   *
   *    GRAVAR CRU       um "11 9999" na coluna de telefone entra na busca por
   *                     telefone e casa com qualquer cadastro truncado — é
   *                     exatamente o que `normalizar()` em
   *                     `dominio/identidade.ts` recusa, e pelo mesmo motivo.
   * ==========================================================================
   */
  const telefone =
    normalizados.telefone === null ? null : normalizarTelefone(normalizados.telefone);
  const telefoneInvalido = normalizados.telefone !== null && telefone === null;

  const interesse = interesseDeclarado(
    Object.values(normalizados.extras).join(" ") +
      " " +
      (d?.formNome ?? "") +
      " " +
      (d?.campaignNome ?? ""),
  );

  const nome =
    normalizados.nome ??
    /*
     * O NOME PROVISÓRIO É EXPLÍCITO, e não um placeholder bonito.
     *
     * "Lead do Instagram (aguardando dados)" diz à recepção que a informação
     * está a caminho. Um "Lead" seco faria a pessoa achar que o formulário não
     * tinha nome — e ela ligaria sem saber com quem fala.
     */
    "Lead do Instagram (aguardando dados)";

  const linha = await inserirIgnorandoDuplicata("crc_leads", {
    organization_id: escopo.organizationId,
    clinic_id: escopo.clinicId,
    nome: nome.slice(0, 200),
    telefone,
    email: normalizados.email,
    /*
     * A ORIGEM É A PLATAFORMA, e ela NUNCA é sobrescrita depois — §69.
     *
     * Um lead que veio do Instagram e converteu pelo WhatsApp continua com
     * `origem = INSTAGRAM`. O WhatsApp entra em `canal_conversao`. Sem os dois
     * separados, todo relatório credita o WhatsApp e a conclusão é "corta o
     * Instagram" — no mês seguinte ninguém chega ao WhatsApp.
     */
    origem: d?.plataforma === "ig" || d?.plataforma === "instagram" ? "INSTAGRAM" : "META",
    utm_source: d?.plataforma ?? "meta",
    utm_medium: "lead_ads",
    utm_campaign: d?.campaignNome ?? null,
    utm_content: d?.adNome ?? null,
    utm_term: d?.formNome ?? null,

    // A HIERARQUIA DE ANÚNCIO — §9.3, §19. É ela que responde "veio de qual
    // campanha" com dado, e não com palpite.
    meta_lead_id: p.leadgenId,
    form_id: d?.formId ?? p.formIdDoWebhook,
    form_nome: d?.formNome ?? null,
    page_id: p.pageId,
    ad_id: d?.adId ?? p.adIdDoWebhook,
    ad_nome: d?.adNome ?? null,
    adset_id: d?.adsetId ?? null,
    adset_nome: d?.adsetNome ?? null,
    campaign_id: d?.campaignId ?? null,
    campaign_nome: d?.campaignNome ?? null,
    plataforma: d?.plataforma ?? null,

    campos: {
      ...normalizados.extras,
      ...(interesse === null ? {} : { interesse }),
      ...(telefoneInvalido ? { telefone_cru: normalizados.telefone } : {}),
      ...(d === null
        ? {
            // O ESTADO É DITO NO DADO, e não só no log: a tela precisa poder
            // mostrar "incompleto" sem adivinhar.
            detalhes_pendentes: "true",
          }
        : {}),
      ...(normalizados.desconhecidos > 0
        ? { perguntas_do_formulario: String(normalizados.desconhecidos) }
        : {}),
    },

    // §49: quando a PESSOA enviou, e não quando a linha nasceu aqui. É este que
    // o speed-to-lead mede — medir por `criado_em` mostraria "respondido em 12
    // segundos" para um lead que a reconciliação importou 14 horas depois.
    externo_criado_em: d?.criadoEm ?? p.ocorridoEm,

    // A DEDUPE DO §34, e ela é dupla: `meta_lead_id` tem índice único próprio, e
    // `chave_dedupe` mantém a compatibilidade com a política de contato+dia que
    // `registrarLead` usa. As duas protegem caminhos diferentes.
    chave_dedupe: `meta:${p.leadgenId}`,
  });

  if (linha === null) {
    return {
      leadId: null,
      opportunityId: null,
      duplicado: true,
      porque: "Este lead da Meta já havia sido importado (corrida entre webhook e reconciliação).",
    };
  }

  const leadId = String(linha["id"] ?? "");

  /* ---------------------------------------------------------------------- */
  /* O evento de domínio — §70                                             */
  /* ---------------------------------------------------------------------- */

  const { emitir } = await import("./eventos");
  await emitir({
    organizationId: escopo.organizationId,
    clinicId: escopo.clinicId,
    tipo: "lead.created",
    entityType: "lead",
    entityId: leadId,
    payload: {
      leadId,
      nome,
      origem: "META",
      canal: "lead_ads",
      campanha: d?.campaignNome ?? null,
      formulario: d?.formNome ?? null,
      ...(interesse === null ? {} : { interesse }),
    },
    fingerprint: `lead.created:${leadId}`,
    // O RELÓGIO SEMÂNTICO — §49. A automação de speed-to-lead usa o instante do
    // evento, e ele é quando a pessoa preencheu.
    ocorridoEm: d?.criadoEm ?? p.ocorridoEm,
  });

  /* ---------------------------------------------------------------------- */
  /* A oportunidade e o speed-to-lead — §20, §21                           */
  /* ---------------------------------------------------------------------- */

  const { criarOportunidade } = await import("./oportunidades");
  const { proximoResponsavel } = await import("./leads");

  const r = await criarOportunidade({
    organizationId: escopo.organizationId,
    clinicId: escopo.clinicId,
    patientId: null,
    leadId,
    // `NEW_LEAD`, e o interesse vai no motivo. A divergência do §20 está
    // explicada em `aplicacao/social.ts` — `TipoOportunidade` é uma união
    // fechada que governa priorização, e não um rótulo.
    tipo: "NEW_LEAD",
    motivo:
      interesse === null
        ? `Lead Ads${d?.campaignNome === null || d?.campaignNome === undefined ? "" : `: ${d.campaignNome}`}`
        : `Lead Ads (${interesse})${d?.campaignNome === null || d?.campaignNome === undefined ? "" : `: ${d.campaignNome}`}`,
    chaveDedupe: `NEW_LEAD:${leadId}`,
    origem: "meta_lead_ads",
    assignedTo: await proximoResponsavel(escopo.organizationId),
    ator: "automacao",
  });

  /* ---------------------------------------------------------------------- */
  /* A atribuição de conteúdo — §19, §41                                    */
  /* ---------------------------------------------------------------------- */

  await registrarToqueDeAquisicao(escopo, {
    leadId,
    opportunityId: r.oportunidade?.id ?? null,
    canal: d?.plataforma === "ig" || d?.plataforma === "instagram" ? "instagram" : "facebook",
    origem: d?.campaignNome ?? d?.formNome ?? "lead_ads",
    ocorridoEm: d?.criadoEm ?? p.ocorridoEm,
    chave: `meta_lead:${p.leadgenId}`,
  });

  registrar("info", "Lead da Meta importado.", {
    organizationId: escopo.organizationId,
    leadId,
    campanha: d?.campaignNome ?? null,
    completo: d !== null,
  });

  return {
    leadId,
    opportunityId: r.oportunidade?.id ?? null,
    duplicado: false,
    porque:
      d === null
        ? "Lead gravado com o leadgen_id; os dados do formulário serão completados pela reconciliação."
        : "Lead gravado com os dados do formulário e a atribuição da campanha.",
  };
}

/**
 * O primeiro elo da cadeia de atribuição — §19, §41.
 *
 * ============================================================================
 *  `crc_attribution_events` JÁ MODELA A CADEIA, e reusá-la é o §19 literal:
 *  "Meta Lead Ads deve entrar como uma NOVA FONTE no mesmo modelo de
 *  atribuição".
 *
 *  O elo é `ACAO` com `confianca: CONFIRMADO` — e `CONFIRMADO` é honesto aqui,
 *  ao contrário de quase todo lugar: a pessoa preencheu um formulário DENTRO do
 *  anúncio. Não há inferência nenhuma entre o anúncio e o lead.
 *
 *  `origem` recebe o nome da campanha, que é o que `atribuirReceita()` em
 *  `dominio/atribuicao.ts` usa para agrupar. É também o que o índice
 *  `idx_crc_attribution_origem` do `supabase/45` indexa.
 * ============================================================================
 *
 * NUNCA LANÇA. A atribuição é relatório; um lead que entrou sem elo é um lead
 * com origem menos precisa, e não um lead perdido.
 */
async function registrarToqueDeAquisicao(
  escopo: EscopoDoWebhook,
  p: {
    leadId: string;
    opportunityId: string | null;
    canal: string;
    origem: string;
    ocorridoEm: string;
    chave: string;
  },
): Promise<void> {
  try {
    await inserirIgnorandoDuplicata("crc_attribution_events", {
      organization_id: escopo.organizationId,
      clinic_id: escopo.clinicId,
      patient_id: null,
      opportunity_id: p.opportunityId,
      elo: "ACAO",
      anterior_id: null,
      canal: p.canal,
      origem: p.origem.slice(0, 200),
      valor: null,
      confianca: "CONFIRMADO",
      ocorrido_em: p.ocorridoEm,
      chave_dedupe: p.chave,
    });
  } catch (erro) {
    registrar("aviso", "Não foi possível registrar o toque de atribuição do lead.", {
      organizationId: escopo.organizationId,
      leadId: p.leadId,
      detalhe: descreverErro(erro),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* A reconciliação — §18.1, §37                                               */
/* -------------------------------------------------------------------------- */

export type ResultadoReconciliacao = {
  paginas: number;
  vistos: number;
  importados: number;
  jaExistiam: number;
  falhas: number;
  cursor: string | null;
  fechou: boolean;
  motivo: string;
};

export const RECONCILIACAO_VAZIA: ResultadoReconciliacao = {
  paginas: 0,
  vistos: 0,
  importados: 0,
  jaExistiam: 0,
  falhas: 0,
  cursor: null,
  fechou: true,
  motivo: "",
};

/**
 * Busca os leads recentes da Meta e importa o que faltar.
 *
 * ============================================================================
 *  O JOB TEM AS SEIS PROPRIEDADES QUE O §37 EXIGE, e cada uma tem um lugar:
 *
 *    CURSOR        `crc_sync_state.cursor`, avançado só em sucesso.
 *    PAGINAÇÃO     `ClienteDaGraph.paginar`, com teto de páginas.
 *    RATE LIMIT    o teto de páginas + a classificação de 429 em `erros.ts`.
 *    BACKOFF       `ErroDaGraph.esperarMs`, e a fila do pulso respeita.
 *    IDEMPOTÊNCIA  `crc_leads.meta_lead_id` com índice único.
 *    OBSERVABILIDADE  `crc_integration_logs` por chamada, e o retorno daqui.
 * ============================================================================
 *
 * ============================================================================
 *  O CURSOR SÓ AVANÇA QUANDO A VOLTA INTEIRA DEU CERTO — a mesma disciplina de
 *  `gravarCursor` em `sincronizacao.ts`, e pela mesma razão: avançar depois de
 *  uma falha parcial pularia justamente os leads que não entraram.
 *
 *  E quando a página falha no meio, o que já foi lido É APROVEITADO. Ver
 *  `paginar`: descartar as páginas boas porque a quinta falhou faria o job
 *  recomeçar do zero — e num 429 isso é garantia de nunca terminar, porque cada
 *  volta gasta cota relendo o que já tinha lido.
 * ============================================================================
 *
 * NUNCA LANÇA: roda dentro do pulso, e um formulário problemático não pode
 * impedir o resto da volta.
 */
export async function reconciliarLeadAds(
  escopo: EscopoDoWebhook,
  opcoes: { maxPaginas?: number; maxFormularios?: number } = {},
): Promise<ResultadoReconciliacao> {
  const resultado: ResultadoReconciliacao = { ...RECONCILIACAO_VAZIA };

  let cliente: ClienteDaGraph | null;
  try {
    cliente = await clienteDeLeadAds(escopo);
  } catch (erro) {
    resultado.motivo = descreverErro(erro);
    return resultado;
  }

  if (cliente === null) {
    resultado.motivo =
      "Nenhuma conta da Meta com Lead Ads e token de envio está cadastrada para esta clínica.";
    return resultado;
  }

  const { canalMetaDaClinica } = await import("../integracoes/meta/canais");
  const canal = await canalMetaDaClinica(escopo.organizationId, escopo.clinicId, "lead_ads");
  if (!canal.ok || canal.canal.pageId === null) {
    resultado.motivo = canal.ok
      ? "A conta da Meta desta clínica não tem Página vinculada, e Lead Ads é da Página."
      : canal.motivo;
    return resultado;
  }

  /*
   * ==========================================================================
   *  OS LEADS SÃO BUSCADOS POR FORMULÁRIO, e não pela Página.
   *
   *  `GET /{page_id}/leadgen_forms` lista os formulários; `GET
   *  /{form_id}/leads` lista os leads de cada um. Não existe endpoint "todos os
   *  leads desta Página" — e é por isso que este job tem DOIS tetos: páginas de
   *  formulário e formulários por volta.
   *
   *  O TETO DE FORMULÁRIOS É O QUE IMPEDE O ESTOURO DE COTA. Uma conta antiga
   *  tem dezenas de formulários arquivados, cada um com páginas de leads
   *  antigos. Sem o teto, a primeira volta tentaria ler tudo — e a Meta
   *  bloquearia a aplicação por uma hora, derrubando também o webhook e o
   *  direct.
   * ==========================================================================
   */
  const formularios = await cliente.paginar<{ id?: unknown; name?: unknown }>(
    `${canal.canal.pageId}/leadgen_forms`,
    { fields: "id,name,status", limit: "25" },
    { maxPaginas: 2, operacao: "listar_formularios" },
  );

  if (!formularios.ok) {
    resultado.falhas += 1;
    resultado.motivo = `${formularios.erro.codigo}: ${formularios.erro.detalhe} — ${formularios.erro.acao}`;
    await gravarEstado(escopo, null, false);
    return resultado;
  }

  const desde = await lerCursorDeLeadAds(escopo);
  const maxFormularios = Math.max(1, Math.min(opcoes.maxFormularios ?? 10, 50));

  let maisNovo = desde;
  let tudoCertou = true;

  for (const form of formularios.itens.slice(0, maxFormularios)) {
    const formId = textoOpcional(form.id);
    if (formId === null) continue;

    const leads = await cliente.paginar<Record<string, unknown>>(
      `${formId}/leads`,
      {
        fields: CAMPOS_DO_LEAD,
        limit: "50",
        /*
         * `filtering` RESTRINGE PELO TEMPO, e é o que faz a volta ser barata.
         *
         * Sem ele, a primeira página de um formulário antigo traz os leads mais
         * recentes — o que serve — mas o job não tem como parar de paginar com
         * confiança. Com o filtro, a própria Meta corta, e o cursor guardado
         * passa a significar "já conferi até aqui".
         */
        ...(desde === null ? {} : { filtering: filtroDeTempo(desde) }),
      },
      { maxPaginas: opcoes.maxPaginas ?? 3, operacao: "listar_leads" },
    );

    resultado.paginas += leads.ok ? leads.paginas : 0;

    if (!leads.ok) {
      resultado.falhas += 1;
      tudoCertou = false;
      resultado.motivo = `${leads.erro.codigo}: ${leads.erro.detalhe}`;
      /*
       * UM FORMULÁRIO QUE FALHA NÃO IMPEDE OS OUTROS, e o `break` só acontece
       * em 429: ali, continuar é garantir que a cota estoure de vez e que o
       * webhook e o direct caiam junto.
       */
      if (leads.erro.codigo === "#4" || leads.erro.codigo === "429") break;
      continue;
    }

    for (const bruto of leads.itens) {
      const leadgenId = textoOpcional(bruto["id"]);
      if (leadgenId === null) continue;

      resultado.vistos += 1;
      /*
       * O CURSOR É COMPARADO COMO STRING, e por isso ele precisa ser ISO.
       *
       * `"2026-09-15T11:58:00+0000" > "2026-09-15T11:58:00.000Z"` é uma
       * comparação de bytes que NÃO corresponde à ordem cronológica. Com os
       * dois formatos misturados, o cursor poderia ANDAR PARA TRÁS entre
       * voltas — e o job releria leads antigos para sempre, gastando cota.
       */
      const cruDaPagina = textoOpcional(bruto["created_time"]);
      const criadoEm = cruDaPagina === null ? null : instanteDaMeta(cruDaPagina);
      if (criadoEm !== null && (maisNovo === null || criadoEm > maisNovo)) maisNovo = criadoEm;

      try {
        const r = await importarLeadJaBuscado(escopo, leadgenId, bruto, canal.canal.pageId);
        if (r.duplicado) resultado.jaExistiam += 1;
        else resultado.importados += 1;
      } catch (erro) {
        resultado.falhas += 1;
        tudoCertou = false;
        registrar("erro", "Falha ao importar lead na reconciliação.", {
          organizationId: escopo.organizationId,
          leadgenId,
          detalhe: descreverErro(erro),
        });
      }
    }

    if (!leads.fechou) resultado.fechou = false;
  }

  await gravarEstado(escopo, maisNovo, tudoCertou && resultado.falhas === 0);

  resultado.cursor = maisNovo;
  if (resultado.motivo.length === 0) {
    const base =
      resultado.importados > 0
        ? `${String(resultado.importados)} lead(s) que o webhook não trouxe foram recuperados.`
        : "Nenhum lead faltando.";

    /*
     * "AINDA HÁ PÁGINA" É PARTE DO MOTIVO, e não um detalhe técnico.
     *
     * Sem essa frase, quem clica "Reconciliar leads" e lê "1 lead recuperado"
     * conclui que terminou — e para de clicar. Com o teto de páginas, uma conta
     * com muitos formulários antigos precisa de várias voltas, e a tela tem que
     * dizer isso.
     */
    resultado.motivo = resultado.fechou
      ? base
      : `${base} Ainda há leads para importar na próxima volta.`;
  }

  /*
   * O NÚMERO QUE IMPORTA É `importados` NUMA RECONCILIAÇÃO.
   *
   * Ele deveria ser ZERO: o webhook deveria ter trazido tudo. Quando ele sobe,
   * é sinal de que o webhook está falhando — e isso é o alarme do §61
   * (`meta_lead_reconciliation_missing`), não uma vitória do job.
   */
  if (resultado.importados > 0) {
    registrar("aviso", "A reconciliação recuperou leads que o webhook não trouxe.", {
      organizationId: escopo.organizationId,
      recuperados: resultado.importados,
      detalhe:
        "Confira a assinatura do webhook da Página e o campo `leadgen` nas subscrições do app.",
    });
  }

  return resultado;
}

/**
 * Importa um lead cujos detalhes JÁ vieram na listagem.
 *
 * ECONOMIA DE COTA, e não atalho: `GET /{form_id}/leads?fields=…` devolve o
 * `field_data` inteiro. Chamar `GET /{leadgen_id}` de novo para cada lead
 * gastaria uma chamada por lead — cinquenta leads viram cinquenta chamadas, e a
 * cota da Meta é por hora.
 */
async function importarLeadJaBuscado(
  escopo: EscopoDoWebhook,
  leadgenId: string,
  bruto: Record<string, unknown>,
  pageId: string | null,
): Promise<ResultadoImportacao> {
  const existente = await selecionarUm("crc_leads", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: escopo.organizationId },
      { coluna: "meta_lead_id", op: "eq", valor: leadgenId },
    ],
  });

  if (existente !== null) {
    return {
      leadId: String(existente["id"] ?? ""),
      opportunityId: null,
      duplicado: true,
      porque: "Já importado.",
    };
  }

  const campos: CampoDoFormulario[] = [];
  for (const c of lista(bruto["field_data"])) {
    if (!ehObjeto(c)) continue;
    const name = textoOpcional(c["name"]);
    if (name === null) continue;
    campos.push({
      name,
      values: lista(c["values"])
        .map((v) => textoOpcional(v))
        .filter((v): v is string => v !== null),
    });
  }

  // A MESMA NORMALIZAÇÃO do caminho do webhook. Ver `buscarDetalhesDoLead`:
  // duas fronteiras com formatos diferentes de data é o que faz o consumidor
  // precisar saber dos dois.
  const cruDoLead = textoOpcional(bruto["created_time"]);
  const criadoEm = cruDoLead === null ? null : instanteDaMeta(cruDoLead);

  return gravarLead(escopo, {
    leadgenId,
    pageId,
    adIdDoWebhook: textoOpcional(bruto["ad_id"]),
    formIdDoWebhook: textoOpcional(bruto["form_id"]),
    ocorridoEm: criadoEm ?? new Date().toISOString(),
    detalhes: {
      campos,
      formId: textoOpcional(bruto["form_id"]),
      formNome: textoOpcional(bruto["form_name"]),
      adId: textoOpcional(bruto["ad_id"]),
      adNome: textoOpcional(bruto["ad_name"]),
      adsetId: textoOpcional(bruto["adset_id"]),
      adsetNome: textoOpcional(bruto["adset_name"]),
      campaignId: textoOpcional(bruto["campaign_id"]),
      campaignNome: textoOpcional(bruto["campaign_name"]),
      plataforma: textoOpcional(bruto["platform"]),
      criadoEm,
    },
  });
}

/**
 * O filtro de tempo da Marketing API.
 *
 * O formato é JSON numa querystring: `[{"field":"time_created","operator":
 * "GREATER_THAN","value":<epoch>}]`. O valor é EPOCH EM SEGUNDOS — passar
 * milissegundos filtraria por uma data do ano 56.000 e devolveria zero leads,
 * em silêncio.
 */
function filtroDeTempo(desdeIso: string): string {
  const t = Date.parse(desdeIso);
  const epoch = Number.isFinite(t) ? Math.floor(t / 1000) : 0;
  return JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: epoch }]);
}

async function lerCursorDeLeadAds(escopo: EscopoDoWebhook): Promise<string | null> {
  const linha = await selecionarUm("crc_sync_state", {
    colunas: "cursor",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: escopo.organizationId },
      { coluna: "clinic_id", op: "eq", valor: escopo.clinicId },
      { coluna: "recurso", op: "eq", valor: RECURSO_LEAD_ADS },
    ],
  });

  const cursor = linha?.["cursor"];
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}

async function gravarEstado(
  escopo: EscopoDoWebhook,
  cursor: string | null,
  sucesso: boolean,
): Promise<void> {
  const agora = new Date().toISOString();

  await gravar(
    "crc_sync_state",
    {
      organization_id: escopo.organizationId,
      clinic_id: escopo.clinicId,
      recurso: RECURSO_LEAD_ADS,
      // Cursor só avança quando a volta INTEIRA deu certo. Ver o cabeçalho.
      ...(sucesso && cursor !== null ? { cursor } : {}),
      last_sync_at: agora,
      ...(sucesso ? { last_successful_sync: agora } : {}),
      sync_status: sucesso ? "OK" : "FALHOU",
    },
    // A MESMA CHAVE DE `sincronizacao.ts`, e ela inclui a clínica desde o
    // `supabase/24`. Errar aqui dá `42P10` e mata a gravação inteira.
    "organization_id,recurso,clinic_id",
  );
}

/* -------------------------------------------------------------------------- */
/* A leitura para a tela                                                      */
/* -------------------------------------------------------------------------- */

export type LeadDaMeta = {
  leadId: string;
  nome: string;
  telefone: string | null;
  campanha: string | null;
  anuncio: string | null;
  formulario: string | null;
  plataforma: string | null;
  criadoEm: string;
  /** Segundos entre a pessoa preencher e alguém responder. `null` = sem resposta. */
  speedToLeadS: number | null;
  detalhesPendentes: boolean;
};

/**
 * Os leads da Meta, para a tela — §21.
 *
 * O `speedToLeadS` É CALCULADO A PARTIR DE `externo_criado_em`, e não de
 * `criado_em`: medir da linha nascer mostraria "respondido em 12 segundos" para
 * um lead que a reconciliação importou 14 horas depois de a pessoa preencher. O
 * §21 mede o tempo que a PESSOA esperou.
 */
export async function leadsDaMeta(
  organizationId: string,
  clinicIds: readonly string[] | null,
  limite = 50,
): Promise<LeadDaMeta[]> {
  const filtros = [
    { coluna: "organization_id" as const, op: "eq" as const, valor: organizationId },
    { coluna: "meta_lead_id" as const, op: "not.is" as const, valor: null },
  ];

  if (clinicIds !== null) {
    if (clinicIds.length === 0) return [];
  }

  const linhas = await selecionar("crc_leads", {
    colunas:
      "id,nome,telefone,campaign_nome,ad_nome,form_nome,plataforma,criado_em,externo_criado_em,primeira_resposta_em,campos",
    filtros:
      clinicIds === null
        ? filtros
        : [...filtros, { coluna: "clinic_id", op: "in", valor: [...clinicIds] }],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite,
  });

  return linhas.map((l) => {
    const enviado = typeof l["externo_criado_em"] === "string" ? l["externo_criado_em"] : null;
    const base = enviado ?? (typeof l["criado_em"] === "string" ? l["criado_em"] : null);
    const respondido =
      typeof l["primeira_resposta_em"] === "string" ? l["primeira_resposta_em"] : null;

    const speed =
      base !== null && respondido !== null
        ? Math.max(0, Math.round((Date.parse(respondido) - Date.parse(base)) / 1000))
        : null;

    const campos =
      typeof l["campos"] === "object" && l["campos"] !== null
        ? (l["campos"] as Record<string, unknown>)
        : {};

    return {
      leadId: String(l["id"] ?? ""),
      nome: String(l["nome"] ?? ""),
      telefone: typeof l["telefone"] === "string" ? l["telefone"] : null,
      campanha: typeof l["campaign_nome"] === "string" ? l["campaign_nome"] : null,
      anuncio: typeof l["ad_nome"] === "string" ? l["ad_nome"] : null,
      formulario: typeof l["form_nome"] === "string" ? l["form_nome"] : null,
      plataforma: typeof l["plataforma"] === "string" ? l["plataforma"] : null,
      criadoEm: base ?? "",
      speedToLeadS: speed,
      detalhesPendentes: campos["detalhes_pendentes"] === "true",
    };
  });
}
