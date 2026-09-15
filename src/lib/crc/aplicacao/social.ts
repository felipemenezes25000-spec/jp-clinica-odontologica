/**
 * Comentário → regra → lead → private reply. §16, §17, §30, §43.
 *
 * ============================================================================
 *  A SEQUÊNCIA É ESTA, E CADA PASSO PODE PARAR:
 *
 *      comentário chega
 *        ↓  grava o evento social  ← dedupe no banco, SEMPRE, §34
 *        ↓  casa uma regra?        ← §16/§43, puro, em `dominio/regras-sociais`
 *        ↓  cria lead?             ← só se a regra pedir
 *        ↓  cria oportunidade?     ← só se a regra pedir
 *        ↓  reserva o private reply ← §17: o BANCO decide quem manda
 *        ↓  a política permite?    ← §15: 7 dias, uma mensagem
 *        ↓  a autonomia permite?   ← §27: min(teto, domínio, canal)
 *        ↓  manda
 *
 *  A ORDEM DOS DOIS ÚLTIMOS GRUPOS É O QUE IMPORTA: a reserva vem ANTES da
 *  política e da autonomia. Parece invertido — por que reservar algo que pode
 *  ser recusado? — e é de propósito:
 *
 *  A reserva é o que elimina a CORRIDA. Dois webhooks do mesmo comentário
 *  chegam juntos, os dois avaliam política e autonomia, os dois passam, e os
 *  dois mandam. Reservando primeiro, o segundo nem avalia.
 *
 *  O custo é uma reserva ocupada por um envio que não aconteceu. Ela fica com
 *  status `BLOQUEADO` e o motivo escrito — e isso é informação útil na tela, em
 *  vez de silêncio.
 * ============================================================================
 *
 * ============================================================================
 *  O §30 GOVERNA O ARQUIVO INTEIRO: "COMENTÁRIO NÃO É AUTORIZAÇÃO INFINITA".
 *
 *  Alguém comentar "implante" não autoriza campanha eterna. O que este arquivo
 *  cria é UM contato, com origem registrada, dentro de UMA janela. O opt-out
 *  vale, o cooldown vale, e a pessoa entra no funil como lead — não numa lista
 *  de disparo.
 * ============================================================================
 */
import {
  casarRegra,
  chaveDeCooldown,
  COPY_PADRAO_PRIVATE_REPLY,
  normalizarTextoSocial,
  type ComentarioParaAvaliar,
  type RegraSocial,
} from "../dominio/regras-sociais";
import { avaliarPoliticaDoCanal } from "../dominio/politica-de-canal";
import type { EventoComentario } from "../integracoes/meta/tipos";
import {
  atualizar,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
  type Linha,
} from "../servidor/banco";
import { auditar, descreverErro, registrar } from "../servidor/registro";

import type { EscopoDoWebhook } from "./webhooks";

/* -------------------------------------------------------------------------- */
/* As regras, do banco                                                        */
/* -------------------------------------------------------------------------- */

function textos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((v): v is string => typeof v === "string")
    .map((v) => normalizarTextoSocial(v))
    .filter((v) => v.length > 0);
}

function linhaParaRegra(l: Linha): RegraSocial {
  return {
    id: String(l["id"] ?? ""),
    nome: typeof l["nome"] === "string" ? l["nome"] : "Regra sem nome",
    canal: typeof l["canal"] === "string" ? l["canal"] : "instagram",
    evento: typeof l["evento"] === "string" ? l["evento"] : "comment.created",
    // NORMALIZADAS NA LEITURA, e não na comparação. Ver o cabeçalho de
    // `normalizarTextoSocial`: os dois lados precisam passar pela mesma função.
    contem: textos(l["contem"]),
    naoContem: textos(l["nao_contem"]),
    exigirCaptacao: l["exigir_captacao"] !== false,
    midias: Array.isArray(l["midias"])
      ? l["midias"].filter((v): v is string => typeof v === "string")
      : [],
    criarLead: l["criar_lead"] === true,
    criarOportunidade: l["criar_oportunidade"] === true,
    enviarPrivateReply: l["enviar_private_reply"] === true,
    tipoOportunidade: typeof l["tipo_oportunidade"] === "string" ? l["tipo_oportunidade"] : null,
    intencao: typeof l["intencao"] === "string" ? l["intencao"] : null,
    templateId: typeof l["template_id"] === "string" ? l["template_id"] : null,
    copy: typeof l["copy"] === "string" ? l["copy"] : null,
    cooldownHoras: typeof l["cooldown_horas"] === "number" ? l["cooldown_horas"] : 168,
    ativa: l["ativa"] === true,
    clinicId: typeof l["clinic_id"] === "string" ? l["clinic_id"] : null,
  };
}

/**
 * As regras que valem nesta clínica, na ordem de precedência.
 *
 * A DA UNIDADE VEM ANTES DA REDE, e `casarRegra` usa a primeira que casa — é a
 * mesma herança de `crc_autonomia`, e pela mesma razão: uma rede configura o
 * padrão, e a unidade que tem campanha própria não deve perdê-la para ele.
 */
export async function regrasSociais(
  organizationId: string,
  clinicId: string,
  canal: string,
  evento: string,
): Promise<RegraSocial[]> {
  const linhas = await selecionar("crc_regras_sociais", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "canal", op: "eq", valor: canal },
      { coluna: "evento", op: "eq", valor: evento },
      { coluna: "ativa", op: "eq", valor: true },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 100,
  });

  const regras = linhas.map(linhaParaRegra);

  const daUnidade = regras.filter((r) => r.clinicId === clinicId);
  const daRede = regras.filter((r) => r.clinicId === null);

  return [...daUnidade, ...daRede];
}

/* -------------------------------------------------------------------------- */
/* O evento social                                                            */
/* -------------------------------------------------------------------------- */

export type DesfechoSocial = "processado" | "ignorado" | "duplicado" | "falhou";

/**
 * Registra o comentário e age sobre ele.
 *
 * ============================================================================
 *  O REGISTRO VEM ANTES DA REGRA, SEMPRE — e isso vale mesmo quando nenhuma
 *  regra casa.
 *
 *  Um comentário que não vira lead ainda é informação: ele diz que aquele reel
 *  gera conversa, e é o denominador da pergunta "quantos comentários viraram
 *  lead?". Sem o denominador, a taxa de conversão de conteúdo não existe.
 *
 *  E é o registro que carrega a DEDUPE. `unique (organization_id, provider,
 *  external_event_id)` é o que impede a reentrega da Meta produzir dois leads e
 *  dois directs. Casar a regra antes de gravar deixaria a janela aberta.
 * ============================================================================
 */
export async function registrarEventoSocial(
  escopo: EscopoDoWebhook,
  evento: EventoComentario,
): Promise<DesfechoSocial> {
  const linha = await inserirIgnorandoDuplicata("crc_social_events", {
    organization_id: escopo.organizationId,
    clinic_id: escopo.clinicId,
    provider: "meta",
    canal: evento.plataforma,
    event_type: evento.tipo.replace(/^instagram\./u, ""),
    external_event_id: evento.idExterno,
    external_actor_id: evento.atorId,
    external_media_id: evento.midiaId,
    external_comment_id: evento.comentarioId.length > 0 ? evento.comentarioId : null,
    texto: evento.texto.length > 0 ? evento.texto : null,
    // §49: os dois relógios. A janela de 7 dias do private reply mede
    // `ocorrido_em` — medir por `recebido_em` faria um webhook atrasado parecer
    // fresco, e a Meta recusaria o envio com um erro que ninguém explicaria.
    ocorrido_em: evento.ocorridoEm,
    recebido_em: new Date().toISOString(),
    processing_status: "PENDENTE",
  });

  if (linha === null) return "duplicado";

  const eventoId = String(linha["id"] ?? "");

  /*
   * COMENTÁRIO APAGADO NÃO DISPARA NADA — §16.
   *
   * A pessoa decidiu não ter dito aquilo. Mandar direct sobre um comentário
   * apagado é responder a algo que ela retirou — e é a pior impressão possível
   * da clínica, porque prova que estamos lendo e guardando.
   *
   * O evento fica registrado: ele é útil para a auditoria e para a atribuição
   * de conteúdo.
   */
  if (evento.tipo === "instagram.comment.deleted") {
    await concluir(
      escopo.organizationId,
      eventoId,
      "IGNORADO",
      "O comentário foi apagado pela pessoa.",
    );
    return "ignorado";
  }

  try {
    return await agirSobreComentario(escopo, evento, eventoId);
  } catch (erro) {
    const detalhe = descreverErro(erro);
    await concluir(escopo.organizationId, eventoId, "FALHOU", detalhe.slice(0, 500));
    /*
     * RELANÇA, e não engole.
     *
     * Quem chama é `aplicarEventosDaMeta`, que coleta os erros e marca o
     * envelope como `FALHOU` — e é isso que faz a repescagem tentar de novo.
     * Engolir aqui deixaria o envelope `PROCESSADO` com o comentário perdido, e
     * a linha em `crc_social_events` diria `FALHOU` para ninguém.
     */
    throw erro;
  }
}

async function concluir(
  organizationId: string,
  eventoId: string,
  status: string,
  resultado: string,
): Promise<void> {
  /*
   * O TENANT VAI NO FILTRO, e nao e redundancia: `escopo-de-tenant.test.ts`
   * varre o repositorio inteiro exigindo isso de toda escrita, e a razao esta
   * na mensagem dele — "pode estar protegida por uma leitura escopada logo
   * acima, e e esse o problema: a protecao nao sobrevive a alguem editar aquele
   * trecho".
   *
   * Aqui o `eventoId` acabou de ser criado com o tenant certo. O filtro protege
   * o proximo chamador, que talvez receba o id de outro lugar.
   */
  await atualizar(
    "crc_social_events",
    [
      { coluna: "id", op: "eq", valor: eventoId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { processing_status: status, resultado: resultado.slice(0, 500) },
  );
}

/* -------------------------------------------------------------------------- */

async function agirSobreComentario(
  escopo: EscopoDoWebhook,
  evento: EventoComentario,
  eventoId: string,
): Promise<DesfechoSocial> {
  const evento_ =
    evento.tipo === "instagram.mention.created" ? "mention.created" : "comment.created";

  const regras = await regrasSociais(
    escopo.organizationId,
    escopo.clinicId,
    evento.plataforma,
    evento_,
  );

  const paraAvaliar: ComentarioParaAvaliar = {
    canal: evento.plataforma,
    evento: evento_,
    texto: evento.texto,
    midiaId: evento.midiaId,
    ehCaptacao: await ehConteudoDeCaptacao(escopo.organizationId, evento.midiaId),
  };

  const casamento = casarRegra(paraAvaliar, regras);

  if (!casamento.casou) {
    await concluir(escopo.organizationId, eventoId, "IGNORADO", casamento.porque);
    return "ignorado";
  }

  const regra = casamento.regra;

  await atualizar(
    "crc_social_events",
    [
      { coluna: "id", op: "eq", valor: eventoId },
      { coluna: "organization_id", op: "eq", valor: escopo.organizationId },
    ],
    { regra_id: regra.id },
  );

  /* ---------------------------------------------------------------------- */
  /* O lead — §43                                                          */
  /* ---------------------------------------------------------------------- */

  let leadId: string | null = null;
  let opportunityId: string | null = null;

  if (regra.criarLead) {
    const r = await criarLeadDeComentario(escopo, evento, regra);
    leadId = r.leadId;
    opportunityId = r.opportunityId;

    await atualizar(
      "crc_social_events",
      [
        { coluna: "id", op: "eq", valor: eventoId },
        { coluna: "organization_id", op: "eq", valor: escopo.organizationId },
      ],
      { lead_id: leadId, opportunity_id: opportunityId },
    );
  }

  /* ---------------------------------------------------------------------- */
  /* O private reply — §17                                                 */
  /* ---------------------------------------------------------------------- */

  if (!regra.enviarPrivateReply) {
    await concluir(
      escopo.organizationId,
      eventoId,
      "PROCESSADO",
      `${casamento.porque} A regra não envia resposta privada.`,
    );
    return "processado";
  }

  const resultado = await tentarPrivateReply(escopo, evento, regra);

  await concluir(
    escopo.organizationId,
    eventoId,
    resultado.ok ? "PROCESSADO" : "IGNORADO",
    `${casamento.porque} ${resultado.porque}`,
  );

  return "processado";
}

/**
 * Este post foi marcado como captação? — §43.
 *
 * ============================================================================
 *  MARCAR É DECISÃO DE QUEM PUBLICOU, e a marca mora nas regras.
 *
 *  Uma regra que lista mídias em `midias` está, por definição, dizendo que
 *  aquelas mídias são de captação. Uma regra sem lista depende desta função —
 *  e hoje ela responde pela existência de ALGUMA regra que liste esta mídia.
 *
 *  POR QUE NÃO INFERIR DA META: porque `media_product_type`, `is_comment_enabled`
 *  e a presença de CTA não dizem "isto é captação". Um reel institucional e um
 *  reel de campanha têm exatamente os mesmos metadados. Adivinhar erraria nos
 *  dois sentidos, e o falso positivo é abordagem não solicitada — a pessoa
 *  comentou num post institucional e recebe direct de venda.
 *
 *  ESTADO HONESTO: enquanto a tela de marcar mídia não existir, o caminho
 *  prático é a regra listar a mídia da campanha. `exigirCaptacao: true` com
 *  `midias` vazio não casa nada — e isso é o correto, não um defeito: uma regra
 *  que exige captação sem dizer qual conteúdo é captação não tem como agir.
 * ============================================================================
 */
async function ehConteudoDeCaptacao(
  organizationId: string,
  midiaId: string | null,
): Promise<boolean> {
  if (midiaId === null || midiaId.length === 0) return false;

  const linha = await selecionarUm("crc_regras_sociais", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "ativa", op: "eq", valor: true },
      // `cs` é `contains` do PostgREST em array: a mídia está na lista da regra.
      { coluna: "midias", op: "cs", valor: `{${midiaId}}` },
    ],
  });

  return linha !== null;
}

/* -------------------------------------------------------------------------- */
/* O lead a partir do comentário                                              */
/* -------------------------------------------------------------------------- */

/**
 * Cria o lead e a oportunidade de um comentário.
 *
 * ============================================================================
 *  O LEAD NASCE SEM TELEFONE E SEM E-MAIL, e isso é a verdade do canal.
 *
 *  Quem comenta no Instagram não deu contato nenhum: deu um perfil. O único
 *  identificador é o IGSID, e ele só serve dentro do Instagram.
 *
 *  `registrarLead` em `leads.ts` RECUSA lead sem telefone e sem e-mail — "sem
 *  forma de responder, não é lead". Ela está certa para o formulário do site, e
 *  errada aqui: há forma de responder, e é o direct.
 *
 *  Por isso este caminho grava direto, com `chave_dedupe` pelo perfil + dia. É
 *  a MESMA política de dedupe de `registrarLead` (contato + dia), com o
 *  identificador que este canal tem.
 * ============================================================================
 */
async function criarLeadDeComentario(
  escopo: EscopoDoWebhook,
  evento: EventoComentario,
  regra: RegraSocial,
): Promise<{ leadId: string | null; opportunityId: string | null }> {
  const ator = evento.atorId;
  if (ator === null || ator.length === 0) {
    /*
     * SEM ATOR NÃO HÁ LEAD.
     *
     * A Meta manda `from.id` em comentário de Instagram, mas NÃO manda em
     * menção (ver `daMencao`). Um lead sem identificador de pessoa seria uma
     * linha que nunca pode ser respondida nem deduplicada — e a segunda menção
     * criaria a segunda linha.
     */
    return { leadId: null, opportunityId: null };
  }

  const dia = evento.ocorridoEm.slice(0, 10);
  const nome =
    evento.atorApelido !== null && evento.atorApelido.length > 0
      ? `@${evento.atorApelido.replace(/^@/u, "")}`
      : "Comentário do Instagram";

  const linha = await inserirIgnorandoDuplicata("crc_leads", {
    organization_id: escopo.organizationId,
    clinic_id: escopo.clinicId,
    nome: nome.slice(0, 200),
    telefone: null,
    email: null,
    // ORIGEM É O CANAL DE AQUISIÇÃO, e ela NUNCA é sobrescrita depois — §69.
    origem: evento.plataforma === "instagram" ? "INSTAGRAM" : "META",
    /*
     * A ATRIBUIÇÃO DE CONTEÚDO — §19.
     *
     * `utm_content` guarda a mídia, `utm_campaign` o nome da regra. Não é
     * abuso do campo: é o mesmo modelo de atribuição que o site já usa, com a
     * fonte que este canal tem. Um segundo modelo só para social faria o
     * relatório precisar somar duas tabelas com semânticas diferentes — e o §19
     * é explícito: "Meta deve entrar como uma nova fonte no MESMO modelo".
     */
    utm_source: evento.plataforma,
    utm_medium: "comentario",
    utm_campaign: regra.nome.slice(0, 200),
    utm_content: evento.midiaId,
    landing_page: null,
    campos: {
      // O QUE A PESSOA ESCREVEU, para quem for atender não começar no escuro.
      comentario: evento.texto.slice(0, 500),
      comentarioId: evento.comentarioId,
      midiaId: evento.midiaId,
      perfil: evento.atorApelido,
      regra: regra.nome,
      ...(regra.intencao === null ? {} : { intencao: regra.intencao }),
    },
    externo_criado_em: evento.ocorridoEm,
    // A MESMA POLÍTICA DE DEDUPE DE `registrarLead`: contato + dia. Quem
    // comenta três vezes hoje é um lead; quem volta em duas semanas é um lead
    // novo, porque o interesse ressurgiu.
    chave_dedupe: `ig:${ator}:${dia}`,
  });

  if (linha === null) {
    // Já existe o lead deste perfil hoje. Não é erro: é o caminho normal de
    // quem comentou mais de uma vez.
    return { leadId: null, opportunityId: null };
  }

  const leadId = String(linha["id"] ?? "");

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
      origem: evento.plataforma === "instagram" ? "INSTAGRAM" : "META",
      canal: evento.plataforma,
      comentario: evento.texto.slice(0, 200),
      midiaId: evento.midiaId,
    },
    fingerprint: `lead.created:${leadId}`,
    ocorridoEm: evento.ocorridoEm,
  });

  let opportunityId: string | null = null;

  if (regra.criarOportunidade) {
    const { criarOportunidade } = await import("./oportunidades");
    const { proximoResponsavel } = await import("./leads");

    /*
     * ======================================================================
     *  O TIPO É `NEW_LEAD`, E A DIVERGÊNCIA DO §20 É DELIBERADA.
     *
     *  O §20 sugere `opportunity.type = implante`. Mas `TipoOportunidade` em
     *  `dominio/tipos.ts` é uma união FECHADA de nove valores, e ela governa
     *  muito mais que um rótulo: `calcularPrioridadeDe` pesa por tipo, a tela
     *  do funil agrupa por tipo, e `ROTULO_*` traduz cada um.
     *
     *  Acrescentar um tipo por tratamento — implante, ortodontia, clareamento,
     *  harmonização… — faria a união crescer com o catálogo comercial da
     *  clínica, e cada tratamento novo exigiria mexer na priorização.
     *
     *  O INTERESSE VIVE EM `motivo` E EM `crc_leads.campos.intencao`, que é
     *  onde ele pertence: é informação sobre o LEAD, não uma categoria de
     *  oportunidade. O funil continua respondendo "o que fazer" (contatar um
     *  lead novo) e o card mostra o interesse.
     * ======================================================================
     */
    const r = await criarOportunidade({
      organizationId: escopo.organizationId,
      clinicId: escopo.clinicId,
      patientId: null,
      leadId,
      tipo: "NEW_LEAD",
      motivo:
        regra.intencao === null
          ? `Comentou no Instagram: "${evento.texto.slice(0, 100)}"`
          : `Comentou no Instagram (${regra.intencao}): "${evento.texto.slice(0, 100)}"`,
      chaveDedupe: `NEW_LEAD:${leadId}`,
      origem: `${evento.plataforma}:comentario`,
      assignedTo: await proximoResponsavel(escopo.organizationId),
      ator: "automacao",
    });
    opportunityId = r.oportunidade?.id ?? null;
  }

  return { leadId, opportunityId };
}

/* -------------------------------------------------------------------------- */
/* O private reply — §17, §35                                                 */
/* -------------------------------------------------------------------------- */

type ResultadoPrivateReply = { ok: boolean; porque: string };

async function tentarPrivateReply(
  escopo: EscopoDoWebhook,
  evento: EventoComentario,
  regra: RegraSocial,
): Promise<ResultadoPrivateReply> {
  if (evento.plataforma !== "instagram") {
    return { ok: false, porque: "Private reply só existe no Instagram por enquanto." };
  }
  if (evento.comentarioId.length === 0) {
    return { ok: false, porque: "O evento não trouxe id de comentário." };
  }

  const ator = evento.atorId;
  if (ator === null || ator.length === 0) {
    return { ok: false, porque: "O evento não trouxe quem comentou — sem isso não há cooldown." };
  }

  const agora = new Date();

  /* ---------------------------------------------------------------------- */
  /* 1. A RESERVA — o anti-spam, decidido pelo BANCO                        */
  /* ---------------------------------------------------------------------- */

  const chave = chaveDeCooldown({
    regraId: regra.id,
    atorId: ator,
    midiaId: evento.midiaId,
    cooldownHoras: regra.cooldownHoras,
    agora,
  });

  const reserva = await inserirIgnorandoDuplicata("crc_private_replies", {
    organization_id: escopo.organizationId,
    clinic_id: escopo.clinicId,
    regra_id: regra.id,
    external_comment_id: evento.comentarioId,
    external_actor_id: ator,
    external_media_id: evento.midiaId,
    chave_reserva: chave,
    status: "RESERVADO",
  });

  if (reserva === null) {
    /*
     * ======================================================================
     *  A RESERVA JÁ EXISTIA, E ISSO É SUCESSO DO MECANISMO.
     *
     *  Dois caminhos chegam aqui, e os dois são o comportamento desejado:
     *
     *    A REENTREGA da Meta — o mesmo comentário chegando duas vezes porque
     *    não recebemos 200 rápido o bastante.
     *
     *    O COOLDOWN — a pessoa comentou dez vezes no mesmo post, e a segunda em
     *    diante cai na mesma janela.
     *
     *  Nos dois, o certo é NÃO mandar. É o §17 funcionando.
     * ======================================================================
     */
    return {
      ok: false,
      porque: "Esta pessoa já foi respondida por esta regra dentro da janela de cooldown.",
    };
  }

  const reservaId = String(reserva["id"] ?? "");

  /* ---------------------------------------------------------------------- */
  /* 2. A POLÍTICA DO CANAL — §15                                           */
  /* ---------------------------------------------------------------------- */

  const decisao = avaliarPoliticaDoCanal({
    canal: "instagram",
    ultimaMensagemDoUsuario: null,
    agora,
    tipo: "private_reply",
    // A COPY É NOSSA E É AUTOMÁTICA. `automacao` — e não `atendente` — porque
    // afirmar que uma pessoa está atendendo seria falso. Ver
    // `dominio/politica-de-canal.ts`.
    quem: "automacao",
    comentarioEm: evento.ocorridoEm,
  });

  if (decisao.forma !== "PERMITIDO_PRIVATE_REPLY") {
    await fecharReserva(escopo.organizationId, reservaId, "BLOQUEADO", decisao.porque);
    return { ok: false, porque: decisao.porque };
  }

  /* ---------------------------------------------------------------------- */
  /* 3. A AUTONOMIA — §27                                                   */
  /* ---------------------------------------------------------------------- */

  const { autorizar } = await import("./autonomia");
  const veredito = await autorizar({
    organizationId: escopo.organizationId,
    clinicId: escopo.clinicId,
    // `mensagens` É O DOMÍNIO CERTO: o teto dele é `ai_agente_envio`, a mesma
    // chave que governa responder quem escreveu. Private reply é contato com
    // pessoa, e tem que responder ao mesmo interruptor.
    dominio: "mensagens",
    /*
     * RISCO MÉDIO, e a classificação é do §27: "contato não solicitado".
     *
     * A pessoa comentou em público — o que é um convite, e é por isso que a
     * Meta permite. Mas ela não pediu direct. `MEDIO` exige nível 4, que é
     * "executa e escala": a clínica precisa ter dito explicitamente que quer
     * isso automático.
     */
    risco: "MEDIO",
    canal: "instagram",
  });

  if (!veredito.pode) {
    await fecharReserva(escopo.organizationId, reservaId, "BLOQUEADO", veredito.motivo);
    return { ok: false, porque: veredito.motivo };
  }

  /* ---------------------------------------------------------------------- */
  /* 4. O ENVIO                                                             */
  /* ---------------------------------------------------------------------- */

  const texto = await copyDaRegra(escopo.organizationId, regra);

  const { criarPortaDaMeta } = await import("../integracoes/meta/provedores");
  const estado = await criarPortaDaMeta("instagram", escopo.organizationId, escopo.clinicId);

  if (!estado.configurado) {
    await fecharReserva(escopo.organizationId, reservaId, "BLOQUEADO", estado.motivo);
    return { ok: false, porque: estado.motivo };
  }

  const envio = await estado.porta.enviar({
    // O DESTINO É FORMAL AQUI: quem manda de verdade é o `comment_id` da forma.
    // Ver `montarCorpo` em `integracoes/meta/porta.ts`.
    destino: { canal: "instagram", contato: { tipo: "instagram_scoped_id", valor: ator } },
    texto,
    forma: { forma: "private_reply", comentarioId: evento.comentarioId },
    chaveDedupe: chave,
  });

  if (!envio.ok) {
    /*
     * ======================================================================
     *  A FALHA INCERTA NÃO LIBERA A RESERVA — §35.
     *
     *  O POST saiu e a resposta não voltou: a Meta PODE ter entregue. Liberar
     *  a reserva faria a próxima volta mandar a SEGUNDA mensagem — e a Meta
     *  permite uma só por comentário, então a segunda seria recusada com
     *  (#10900)… ou entregue, se a primeira não tiver saído.
     *
     *  Entre "a pessoa talvez não receba" e "a pessoa recebe duas vezes", o
     *  segundo é pior: é visível, parece descuido, e não há como desfazer. É a
     *  mesma decisão de `enviarMensagem` com `classe === "incerta"`.
     *
     *  A RESERVA FICA `INCERTO` com o erro, para uma pessoa decidir.
     * ======================================================================
     */
    const status = envio.classe === "incerta" ? "INCERTO" : "FALHOU";
    await fecharReserva(
      escopo.organizationId,
      reservaId,
      status,
      `${envio.codigo}: ${envio.detalhe}`,
    );

    registrar(envio.classe === "incerta" ? "erro" : "aviso", "Private reply não saiu.", {
      organizationId: escopo.organizationId,
      regra: regra.nome,
      codigo: envio.codigo,
      classe: envio.classe,
    });

    return { ok: false, porque: `O envio falhou: ${envio.detalhe}` };
  }

  await atualizar(
    "crc_private_replies",
    [
      { coluna: "id", op: "eq", valor: reservaId },
      { coluna: "organization_id", op: "eq", valor: escopo.organizationId },
    ],
    {
      status: "ENVIADO",
      provider_message_id: envio.providerMessageId,
      enviado_em: new Date().toISOString(),
    },
  );

  /*
   * O ENVIO É AUDITADO — §63 lista "enviar private reply" explicitamente.
   *
   * E ele merece: é a única mensagem que o CRC manda para alguém que NÃO
   * escreveu para a clínica. A trilha precisa dizer qual regra decidiu, para
   * quem, e sobre qual comentário.
   */
  await auditar({
    organizationId: escopo.organizationId,
    userId: null,
    ator: "automacao",
    acao: "social.private_reply_enviado",
    entityType: "social_event",
    entityId: evento.comentarioId,
    depois: {
      regra: regra.nome,
      regraId: regra.id,
      atorId: ator,
      midiaId: evento.midiaId,
      providerMessageId: envio.providerMessageId,
    },
  });

  return { ok: true, porque: "Resposta privada enviada." };
}

async function fecharReserva(
  organizationId: string,
  id: string,
  status: string,
  erro: string,
): Promise<void> {
  await atualizar(
    "crc_private_replies",
    [
      { coluna: "id", op: "eq", valor: id },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status, erro: erro.slice(0, 500) },
  );
}

/**
 * A copy do private reply — §67.
 *
 * A ORDEM É: template versionado, copy da regra, padrão seguro. O template vem
 * primeiro porque ele é auditado e versionado pelo mecanismo que já existe —
 * `crc_templates` —, e a copy solta na regra é o caminho curto para a regra que
 * nasce numa tarde.
 */
async function copyDaRegra(organizationId: string, regra: RegraSocial): Promise<string> {
  if (regra.templateId !== null) {
    const linha = await selecionarUm("crc_templates", {
      // `conteudo`, e não `corpo`: é o nome da coluna em `supabase/02`. O
      // `schema.test.ts` existe exatamente para pegar este tipo de erro antes
      // de ele virar um PostgREST 400 em produção.
      colunas: "conteudo",
      filtros: [
        { coluna: "id", op: "eq", valor: regra.templateId },
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "ativo", op: "eq", valor: true },
      ],
    });
    const conteudo = linha === null ? "" : String(linha["conteudo"] ?? "").trim();
    if (conteudo.length > 0) return conteudo;
  }

  const daRegra = (regra.copy ?? "").trim();
  if (daRegra.length > 0) return daRegra;

  // O PADRÃO NÃO DIAGNOSTICA E NÃO PROMETE PREÇO. Ver
  // `COPY_PADRAO_PRIVATE_REPLY` em `dominio/regras-sociais.ts`.
  return COPY_PADRAO_PRIVATE_REPLY;
}
