/**
 * O webhook da Meta dentro do inbox pattern que já existe — §11, §36.
 *
 * ============================================================================
 *  A MESMA FILA, E NÃO UMA SEGUNDA.
 *
 *  O §36 é explícito: "estender o mecanismo existente, não construir outra
 *  fila". E a razão não é economia de tabela — é que uma segunda fila precisa de
 *  um segundo repescador, um segundo teto de tentativas, uma segunda dead
 *  letter e um segundo lugar na tela de saúde. Quatro coisas que envelhecem em
 *  paralelo, e a que envelhece primeiro é a que ninguém olha.
 *
 *  `crc_webhook_inbox` já tem `provedor`, `external_id` único, `tentativas`,
 *  `disponivel_em`, `travado_ate`, tenant e dead letter. Ela serve como está: o
 *  `provedor` passa a aceitar `meta`, e `repescarWebhooks` — que já roda no
 *  pulso — passa a saber aplicar os dois formatos de envelope.
 * ============================================================================
 *
 * ============================================================================
 *  A SEQUÊNCIA É A DO §11, E A ORDEM É O DESENHO:
 *
 *      VERIFICAR      (na rota, com o appSecret daquele canal)
 *        ↓
 *      RESOLVER TENANT
 *        ↓
 *      GRAVAR/DEDUPE  ← antes de QUALQUER efeito
 *        ↓
 *      NORMALIZAR     (já feito: o envelope chega normalizado)
 *        ↓
 *      APLICAR
 *        ↓
 *      PROCESSADO
 *
 *  O §11 proíbe nominalmente `webhook → chama IA → responde → só depois salva`.
 *  O motivo é que a Meta reentrega quando não recebe 200 rápido: sem a gravação
 *  antes, a mesma mensagem viraria três na Inbox, três classificações de IA
 *  cobradas e três respostas para a mesma pessoa.
 * ============================================================================
 */
import { montarDestino, NAMESPACE_DO_CANAL } from "../dominio/canais";
import type { EnvelopeMeta, EventoMeta } from "../integracoes/meta/tipos";
import { ehComentario, ehEntrega, ehLead, ehMensagemRecebida } from "../integracoes/meta/tipos";
import { atualizar, inserirIgnorandoDuplicata, type Linha } from "../servidor/banco";
import { descreverErro, registrar } from "../servidor/registro";

import { atualizarEntrega, receberMensagemDoCanal } from "./mensagens";
import type { EscopoDoWebhook } from "./webhooks";

export type ResultadoMeta = {
  mensagens: number;
  entregas: number;
  comentarios: number;
  leads: number;
  duplicados: number;
  ignorados: number;
};

export const RESULTADO_VAZIO: ResultadoMeta = {
  mensagens: 0,
  entregas: 0,
  comentarios: 0,
  leads: 0,
  duplicados: 0,
  ignorados: 0,
};

/** O nome do provedor em `crc_webhook_inbox.provedor`. */
export const PROVEDOR_META = "meta";

/* -------------------------------------------------------------------------- */
/* A chave do envelope                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A chave de deduplicação do envelope inteiro.
 *
 * ============================================================================
 *  ELA NÃO É A GARANTIA — ela é a economia.
 *
 *  A garantia de idempotência está POR EVENTO, e em três lugares diferentes:
 *
 *      mensagem    `crc_messages.provider_message_id`, índice único
 *      comentário  `crc_social_events.external_event_id`, índice único
 *      lead        `crc_leads.meta_lead_id`, índice único parcial
 *
 *  Essa é a que importa, porque a Meta pode reagrupar os eventos de forma
 *  diferente entre duas entregas do mesmo conteúdo — e aí a chave do envelope
 *  difere enquanto os eventos são os mesmos.
 *
 *  A chave do envelope evita o trabalho repetido no caso comum (reentrega
 *  idêntica) e mantém o log limpo. É o mesmo raciocínio de `chaveDoEnvelope`
 *  em `webhooks.ts`, dito ali como "barato mas gera ruído no log".
 * ============================================================================
 *
 * O TIPO ENTRA NA CHAVE porque um `mid` produz eventos diferentes: a mensagem,
 * a entrega e a leitura. Sem o tipo, o webhook de leitura seria descartado como
 * duplicata do de entrega — e a mensagem ficaria "entregue" para sempre.
 */
export function chaveDoEnvelopeMeta(envelope: EnvelopeMeta): string | null {
  const primeiro = envelope.eventos[0];
  if (primeiro === undefined) return null;

  const total = envelope.eventos.length;
  return `${primeiro.tipo}:${primeiro.idExterno}:${String(total)}`;
}

/* -------------------------------------------------------------------------- */
/* O tenant — §33                                                             */
/* -------------------------------------------------------------------------- */

/**
 * De qual organização e clínica é este envelope.
 *
 * ============================================================================
 *  TODAS AS CONTAS DO ENVELOPE PRECISAM SER DO MESMO TENANT.
 *
 *  A Meta agrupa: um POST pode trazer `entry` de duas Páginas. Num app que
 *  atende vários clientes, essas duas Páginas podem ser de CLÍNICAS
 *  DIFERENTES — e o envelope tem um `organization_id` só na tabela do inbox.
 *
 *  Processar o envelope inteiro com o tenant da PRIMEIRA conta é exatamente o
 *  defeito que o `supabase/23` matou no WhatsApp: dado de paciente atravessando
 *  a fronteira de uma organização.
 *
 *  A RECUSA É O COMPORTAMENTO CERTO (§4.5, §33). O envelope vai para `FALHOU`,
 *  aparece na saúde, e o operador aponta o webhook de cada app para a rota do
 *  canal dele — que é o desenho previsto e o que a rota `$canal` existe para
 *  fazer.
 * ============================================================================
 */
export async function resolverEscopoDaMeta(
  contas: readonly string[],
): Promise<EscopoDoWebhook | null> {
  if (contas.length === 0) return null;

  const { resolverTenantDaMeta } = await import("../integracoes/meta/canais");

  const encontrados: { organizationId: string; clinicId: string }[] = [];
  for (const conta of contas) {
    const t = await resolverTenantDaMeta(conta);
    if (t === null) return null;
    encontrados.push({ organizationId: t.organizationId, clinicId: t.clinicId });
  }

  const primeiro = encontrados[0];
  if (primeiro === undefined) return null;

  const misturado = encontrados.some(
    (e) => e.organizationId !== primeiro.organizationId || e.clinicId !== primeiro.clinicId,
  );

  if (misturado) {
    registrar("erro", "Webhook da Meta com contas de tenants diferentes no mesmo envelope.", {
      contas: contas.length,
      detalhe:
        "O envelope tem entry de mais de uma clínica. Recusado para não atribuir mensagem à organização errada — aponte o webhook de cada app para a rota do canal dele.",
    });
    return null;
  }

  return primeiro;
}

/* -------------------------------------------------------------------------- */
/* O processamento                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Grava o envelope e aplica os eventos.
 *
 * `escopoConhecido` é o caminho da rota `/api/crc/meta/$canal`, que JÁ provou o
 * tenant pela assinatura — exatamente como `processarWebhookWhatsapp` recebe o
 * dela. Resolver de novo pelo corpo seria pior do que redundante: o corpo é
 * dado do provedor, e o canal veio da URL e foi confirmado pela assinatura.
 */
export async function processarWebhookMeta(
  envelope: EnvelopeMeta,
  escopoConhecido: EscopoDoWebhook | null = null,
): Promise<ResultadoMeta> {
  const resultado: ResultadoMeta = { ...RESULTADO_VAZIO, ignorados: envelope.ignorados };

  const chave = chaveDoEnvelopeMeta(envelope);
  if (chave === null) {
    /*
     * ENVELOPE SEM EVENTO NÃO É ERRO.
     *
     * A Meta manda notificação de mudança de configuração do app, e manda
     * `standby` quando outro app é o receptor primário. Nenhum dos dois tem
     * conteúdo aplicável, e gravar uma linha de fila para cada um encheria a
     * tabela de trabalho que nunca vai existir.
     *
     * `ignorados` já veio contado do normalizador, e é o que a saúde mede.
     */
    return resultado;
  }

  const escopo = escopoConhecido ?? (await resolverEscopoDaMeta(envelope.contas));

  const inbox = await inserirIgnorandoDuplicata("crc_webhook_inbox", {
    provedor: PROVEDOR_META,
    external_id: chave,
    organization_id: escopo?.organizationId ?? null,
    clinic_id: escopo?.clinicId ?? null,
    /*
     * O ENVELOPE NORMALIZADO, e não o payload cru.
     *
     * A mesma decisão de `processarWebhookWhatsapp`, e ali ela está explicada
     * inteira: `mascarar()` corta profundidade acima de seis níveis, e o
     * envelope da Meta é `entry > messaging > message > attachments > payload`.
     * O mascarador destruiria exatamente a parte que o replay precisa ler.
     *
     * O formato normalizado é raso, estável entre produtos, e é literalmente a
     * entrada da etapa seguinte — repetir a etapa é repetir com o MESMO dado.
     */
    payload: envelope as unknown as Linha,
    status: "PENDENTE",
  });

  if (inbox === null) {
    resultado.duplicados += 1;
    return resultado;
  }

  const inboxId = String(inbox["id"] ?? "");
  const { marcarEnvelope, MAX_TENTATIVAS_WEBHOOK } = await import("./webhooks");

  if (escopo === null) {
    await marcarEnvelope(
      inboxId,
      "FALHOU",
      "Nenhuma conta da Meta cadastrada para este evento.",
      // TENTATIVAS NO TETO de propósito: o envelope vai direto para terminal e
      // o payload é zerado. Repescá-lo cinco vezes não vai fazer a conta
      // aparecer no cadastro — quem resolve é uma pessoa, e o que ela precisa é
      // ver isto na tela de saúde, não na fila.
      MAX_TENTATIVAS_WEBHOOK,
    );
    return resultado;
  }

  const aplicado = await aplicarEventosDaMeta(envelope.eventos, escopo);
  Object.assign(resultado, somar(resultado, aplicado.contagem));

  await marcarEnvelope(
    inboxId,
    aplicado.erros.length === 0 ? "PROCESSADO" : "FALHOU",
    aplicado.erros.length === 0 ? null : aplicado.erros.join(" | ").slice(0, 1000),
    1,
  );

  await registrarSinalDeVida(escopo, envelope.eventos);

  return resultado;
}

function somar(a: ResultadoMeta, b: ResultadoMeta): ResultadoMeta {
  return {
    mensagens: a.mensagens + b.mensagens,
    entregas: a.entregas + b.entregas,
    comentarios: a.comentarios + b.comentarios,
    leads: a.leads + b.leads,
    duplicados: a.duplicados + b.duplicados,
    ignorados: a.ignorados + b.ignorados,
  };
}

/* -------------------------------------------------------------------------- */
/* A aplicação dos eventos                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Aplica os eventos de um envelope.
 *
 * ============================================================================
 *  UM EVENTO QUE FALHA NÃO IMPEDE OS OUTROS, e isso é a diferença entre
 *  perder uma mensagem e perder cinco.
 *
 *  Um envelope pode trazer uma mensagem e um comentário. Se o comentário
 *  estourar — regra malformada, mídia que não existe mais —, deixar a exceção
 *  subir faria a mensagem do paciente ser marcada como falha junto, e ela só
 *  voltaria na repescagem.
 *
 *  Os erros são COLETADOS e o envelope termina em `FALHOU` com todos eles no
 *  motivo. A repescagem reprocessa tudo, e a dedupe por evento garante que o
 *  que já entrou não entra de novo.
 * ============================================================================
 *
 * Exportada porque `repescarWebhooks` a chama no replay — o mesmo caminho, com
 * o mesmo dado, três dias depois.
 */
export async function aplicarEventosDaMeta(
  eventos: readonly EventoMeta[],
  escopo: EscopoDoWebhook,
): Promise<{ contagem: ResultadoMeta; erros: string[] }> {
  const contagem: ResultadoMeta = { ...RESULTADO_VAZIO };
  const erros: string[] = [];

  for (const evento of eventos) {
    try {
      const r = await aplicarUmEvento(evento, escopo);
      if (r === "mensagem") contagem.mensagens += 1;
      else if (r === "entrega") contagem.entregas += 1;
      else if (r === "comentario") contagem.comentarios += 1;
      else if (r === "lead") contagem.leads += 1;
      else if (r === "duplicado") contagem.duplicados += 1;
      else contagem.ignorados += 1;
    } catch (erro) {
      erros.push(`${evento.tipo}/${evento.idExterno}: ${descreverErro(erro)}`);
    }
  }

  return { contagem, erros };
}

type Desfecho = "mensagem" | "entrega" | "comentario" | "lead" | "duplicado" | "ignorado";

async function aplicarUmEvento(evento: EventoMeta, escopo: EscopoDoWebhook): Promise<Desfecho> {
  if (ehMensagemRecebida(evento)) {
    const destino = montarDestino(evento.canal, evento.contatoExterno);
    if (destino === null) return "ignorado";

    const r = await receberMensagemDoCanal(escopo.organizationId, escopo.clinicId, {
      providerMessageId: evento.idExterno,
      destino,
      texto: evento.texto,
      ocorridoEm: evento.ocorridoEm,
      apelido: evento.apelido,
      saida: evento.eco,
      anexos: evento.anexos,
    });

    if (!r.ok) return "ignorado";
    if (r.duplicada) return "duplicado";

    /*
     * O PERFIL É BUSCADO DEPOIS DE A MENSAGEM ENTRAR, e nunca antes — §24.
     *
     * ========================================================================
     *  A ORDEM É O QUE PROTEGE A MENSAGEM.
     *
     *  Buscar o `@usuario` na Graph antes de gravar colocaria uma chamada de
     *  rede no caminho crítico do webhook — e é a chamada mais provável de
     *  bater em 429, porque acontece uma vez por conversa nova.
     *
     *  Se ela falhar depois, nada se perde: a conversa existe, a mensagem está
     *  na Inbox, e a tela mostra "Direct do Instagram" em vez do apelido. O
     *  contrário — perder a mensagem porque o enfeite não carregou — seria
     *  trocar o essencial pelo cosmético.
     * ========================================================================
     */
    if (evento.apelido === null && !evento.eco) {
      await tentarApelido(escopo, evento.canal, evento.contatoExterno, r.conversationId);
    }

    return "mensagem";
  }

  if (ehEntrega(evento)) {
    await atualizarEntrega(escopo.organizationId, evento.providerMessageId, evento.status, null);
    return "entrega";
  }

  if (ehComentario(evento)) {
    const { registrarEventoSocial } = await import("./social");
    const r = await registrarEventoSocial(escopo, evento);
    return r === "duplicado" ? "duplicado" : "comentario";
  }

  if (ehLead(evento)) {
    const { importarLeadDaMeta } = await import("./lead-ads");
    const r = await importarLeadDaMeta(escopo, evento);
    return r.duplicado ? "duplicado" : "lead";
  }

  return "ignorado";
}

/**
 * Busca e grava o apelido do perfil.
 *
 * NUNCA LANÇA, e o `catch` vazio é deliberado — a função inteira é cosmética.
 * Ver o comentário no chamador.
 */
async function tentarApelido(
  escopo: EscopoDoWebhook,
  canal: "instagram" | "messenger",
  contato: string,
  conversationId: string,
): Promise<void> {
  try {
    const { criarPortaDaMeta } = await import("../integracoes/meta/provedores");
    const estado = await criarPortaDaMeta(canal, escopo.organizationId, escopo.clinicId);
    if (!estado.configurado || estado.porta.perfil === undefined) return;

    const perfil = await estado.porta.perfil(contato);
    if (perfil === null) return;

    const apelido = (perfil.username ?? perfil.nome ?? "").trim();
    if (apelido.length === 0) return;

    await atualizar(
      "crc_conversations",
      [
        { coluna: "id", op: "eq", valor: conversationId },
        { coluna: "organization_id", op: "eq", valor: escopo.organizationId },
      ],
      { apelido_externo: apelido.slice(0, 120) },
    );

    /*
     * ========================================================================
     *  O PERFIL NÃO CRIA IDENTIDADE, e a ausência é a regra mais importante
     *  desta função.
     *
     *  Seria tentador gravar `EXTERNAL_ID / instagram / <IGSID>` para o
     *  paciente aqui. Mas neste ponto não SABEMOS de quem é o perfil: a
     *  conversa pode estar sem paciente, ou vinculada por coincidência.
     *
     *  O §10 é absoluto: nunca merge por nome, nunca por username, nunca por
     *  similaridade textual. Vincular um IGSID a um paciente é uma AFIRMAÇÃO —
     *  ela acontece em `vincularPerfilAoPaciente`, por uma pessoa ou por um
     *  identificador forte, e fica auditada.
     * ========================================================================
     */
  } catch {
    // Enfeite não derruba recebimento. Ver o cabeçalho.
  }
}

/* -------------------------------------------------------------------------- */
/* O sinal de vida — §39                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Marca no canal quando chegou o último webhook, mensagem e lead.
 *
 * ============================================================================
 *  SÃO FATOS DATADOS, E É DELES QUE A TELA DE SAÚDE VIVE.
 *
 *  O §39 proíbe "tudo certo porque as env vars existem", e o §74 proíbe
 *  "Conectado quando só existe env var". A única forma de cumprir os dois é
 *  MEDIR — e medir exige carimbo.
 *
 *  Os três carimbos são separados porque respondem perguntas diferentes:
 *
 *    `ultimo_webhook_em`   a Meta está falando com a gente?
 *    `ultima_mensagem_em`  o Instagram/Messenger está chegando?
 *    `ultimo_lead_em`      o Lead Ads está chegando?
 *
 *  Com um carimbo só, "o Lead Ads parou há três dias" ficaria invisível
 *  enquanto o direct continuasse chegando.
 * ============================================================================
 *
 * NUNCA LANÇA: é observabilidade, e observabilidade que derruba o processamento
 * é pior do que ausência dela.
 */
async function registrarSinalDeVida(
  escopo: EscopoDoWebhook,
  eventos: readonly EventoMeta[],
): Promise<void> {
  try {
    const agora = new Date().toISOString();
    const mudancas: Linha = { ultimo_webhook_em: agora };

    if (eventos.some((e) => ehMensagemRecebida(e))) mudancas["ultima_mensagem_em"] = agora;
    if (eventos.some((e) => ehLead(e))) mudancas["ultimo_lead_em"] = agora;

    const conta = eventos[0]?.contaExterna ?? "";
    if (conta.length === 0) return;

    /*
     * A ATUALIZAÇÃO É POR TENANT + CONTA, e não só por conta.
     *
     * O tenant no filtro é a mesma disciplina do resto do CRC: um id de conta
     * que vaze não pode carimbar a linha de outra organização. Aqui o efeito
     * seria pequeno — uma data errada numa tela —, e a disciplina vale
     * justamente porque o caminho barato de errar é o mesmo do caminho caro.
     */
    for (const coluna of ["page_id", "instagram_account_id"] as const) {
      await atualizar(
        "crc_canais_meta",
        [
          { coluna: "organization_id", op: "eq", valor: escopo.organizationId },
          { coluna, op: "eq", valor: conta },
        ],
        mudancas,
      );
    }
  } catch {
    // Ver o cabeçalho.
  }
}

/* -------------------------------------------------------------------------- */
/* O vínculo de identidade — §25                                              */
/* -------------------------------------------------------------------------- */

/**
 * Liga um perfil da Meta a um paciente — a AFIRMAÇÃO do §25.
 *
 * ============================================================================
 *  ISTO É UMA AFIRMAÇÃO, E NÃO UMA DEDUÇÃO.
 *
 *  Ela acontece em dois casos, e nos dois há algo forte sustentando:
 *
 *    A PESSOA INFORMOU TELEFONE/E-MAIL na conversa, e ele resolveu para
 *    EXATAMENTE UM paciente. Aí o vínculo é inferido de um identificador forte
 *    — e `quemE` já recusou quando havia ambiguidade.
 *
 *    ALGUÉM DA CLÍNICA CONFIRMOU na ficha. Aí é humano, e vale mais que
 *    qualquer inferência.
 *
 *  O QUE NUNCA SUSTENTA: nome parecido, username parecido, "só tem uma Maria".
 *  O §10 é absoluto sobre isso, e `dominio/identidade.ts` explica por quê — o
 *  estrago de uma fusão errada é irreversível.
 * ============================================================================
 *
 * O VÍNCULO PROPAGA PARA AS MENSAGENS JÁ RECEBIDAS. Sem isso, o histórico do
 * paciente começaria vazio justamente na conversa que motivou o vínculo — é a
 * mesma razão de `vincularConversaAoPaciente` atualizar `crc_messages`.
 */
export async function vincularPerfilAoPaciente(p: {
  organizationId: string;
  canal: "instagram" | "messenger";
  contatoExterno: string;
  patientId: string;
  conversationId: string | null;
  userId: string | null;
  /** De onde veio a decisão. Vai para a auditoria do §63. */
  motivo: string;
}): Promise<boolean> {
  const { registrarIdentidade } = await import("./omnichannel");

  const gravou = await registrarIdentidade(
    p.organizationId,
    p.patientId,
    "EXTERNAL_ID",
    p.contatoExterno,
    // O NAMESPACE DO CANAL — §10. Sem ele, o IGSID entraria como id do Dental
    // Office e colidiria com um paciente escolhido por coincidência numérica.
    NAMESPACE_DO_CANAL[p.canal],
  );

  if (p.conversationId !== null) {
    const { vincularConversaAoPaciente } = await import("./mensagens");
    await vincularConversaAoPaciente(p.organizationId, p.conversationId, p.patientId, p.userId);
  }

  const { auditar } = await import("../servidor/registro");
  await auditar({
    organizationId: p.organizationId,
    userId: p.userId,
    ator: p.userId === null ? "automacao" : "humano",
    acao: "identidade.perfil_vinculado",
    entityType: "patient",
    entityId: p.patientId,
    depois: {
      canal: p.canal,
      // O IDENTIFICADOR ENTRA NA AUDITORIA, e ele não é segredo: é um id opaco
      // escopado à conta da clínica, e sem ele a trilha não diz O QUE foi
      // vinculado — só que algo foi.
      contatoExterno: p.contatoExterno,
      motivo: p.motivo,
      conversationId: p.conversationId,
    },
  });

  return gravou;
}

/**
 * Desfaz o vínculo — §25.
 *
 * EXISTE PORQUE O VÍNCULO PODE ESTAR ERRADO, e um sistema que só sabe vincular
 * obriga a equipe a conviver com o erro. A remoção é auditada com o mesmo peso
 * da criação: quem, quando, e o que havia antes.
 */
export async function desvincularPerfil(p: {
  organizationId: string;
  canal: "instagram" | "messenger";
  contatoExterno: string;
  patientId: string;
  conversationId: string | null;
  userId: string | null;
}): Promise<void> {
  const { apagar } = await import("../servidor/banco");

  await apagar("crc_patient_identities", [
    { coluna: "organization_id", op: "eq", valor: p.organizationId },
    { coluna: "patient_id", op: "eq", valor: p.patientId },
    { coluna: "tipo", op: "eq", valor: "EXTERNAL_ID" },
    { coluna: "namespace", op: "eq", valor: NAMESPACE_DO_CANAL[p.canal] },
    { coluna: "valor", op: "eq", valor: p.contatoExterno },
  ]);

  if (p.conversationId !== null) {
    /*
     * A CONVERSA PERDE O PACIENTE, E AS MENSAGENS TAMBÉM.
     *
     * Deixar `crc_messages.patient_id` preenchido depois de desfazer o vínculo
     * manteria a conversa no Patient 360 de quem não é — que é exatamente o
     * estrago que o desvínculo existe para reparar.
     */
    await atualizar(
      "crc_conversations",
      [
        { coluna: "id", op: "eq", valor: p.conversationId },
        { coluna: "organization_id", op: "eq", valor: p.organizationId },
      ],
      { patient_id: null, revisao_pendente: true },
    );

    await atualizar(
      "crc_messages",
      [
        { coluna: "conversation_id", op: "eq", valor: p.conversationId },
        { coluna: "organization_id", op: "eq", valor: p.organizationId },
      ],
      { patient_id: null },
    );
  }

  const { auditar } = await import("../servidor/registro");
  await auditar({
    organizationId: p.organizationId,
    userId: p.userId,
    ator: p.userId === null ? "automacao" : "humano",
    acao: "identidade.perfil_desvinculado",
    entityType: "patient",
    entityId: p.patientId,
    antes: { canal: p.canal, contatoExterno: p.contatoExterno },
    depois: null,
  });
}
