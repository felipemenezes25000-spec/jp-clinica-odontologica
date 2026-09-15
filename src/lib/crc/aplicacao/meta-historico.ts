/**
 * O histórico de conversas da Meta — §13 (backfill), §48, §37.
 *
 * ============================================================================
 *  A REGRA MAIS FÁCIL DE ERRAR DE TODO O PROMPT ESTÁ NO §48:
 *
 *      "Backfill não pode mandar 'Oi, vi sua mensagem' para conversa de seis
 *       meses atrás."
 *
 *  E o caminho para errar é curto. `receberMensagemDoCanal` faz três coisas
 *  além de gravar: incrementa `nao_lidas`, reabre conversa resolvida, e emite
 *  `message.received` — que é o gatilho da IA e do motor de automação.
 *
 *  Importar seis meses de histórico por esse caminho produziria centenas de
 *  eventos `message.received`, cada um com data antiga, e o motor responderia a
 *  TODOS: para ele, um evento é um evento. Trezentas pessoas receberiam "vi sua
 *  mensagem" sobre uma conversa que elas esqueceram.
 *
 *  `historico: true` é o que impede. Ver `MensagemDeCanal.historico` — a
 *  mensagem entra no histórico e na linha do tempo, e não dispara nada.
 * ============================================================================
 *
 * ============================================================================
 *  ELE É IDEMPOTENTE POR `provider_message_id` — §13.
 *
 *  "Nunca duplicar mensagens que já chegaram por webhook." A garantia não é
 *  cuidado deste arquivo: é o índice único de `crc_messages`, e é por isso que
 *  rodar o backfill duas vezes é seguro, e rodar DEPOIS de o webhook já estar
 *  ativo também.
 *
 *  Na prática isso significa que a ordem de ativação não importa: conectar a
 *  conta, ligar o webhook e depois importar o histórico produz o mesmo
 *  resultado que o inverso.
 * ============================================================================
 *
 * FONTE CONFERIDA EM 15/09/2026:
 *   `GET /{page_id}/conversations?platform=instagram` lista as threads;
 *   `GET /{thread_id}?fields=messages{...}` traz as mensagens.
 *     https://developers.facebook.com/docs/messenger-platform/conversations/
 */
import { montarDestino } from "../dominio/canais";
import { campo, ehObjeto, lista, textoOpcional } from "../dominio/validar";
import { ClienteDaGraph } from "../integracoes/meta/cliente";
import { instanteDaMeta } from "../integracoes/meta/normalizar";
import { gravar, selecionarUm } from "../servidor/banco";
import { descreverErro, registrar } from "../servidor/registro";

import { receberMensagemDoCanal } from "./mensagens";
import type { EscopoDoWebhook } from "./webhooks";

export type ResultadoDoHistorico = {
  conversas: number;
  mensagens: number;
  duplicadas: number;
  falhas: number;
  cursor: string | null;
  fechou: boolean;
  motivo: string;
};

const VAZIO: ResultadoDoHistorico = {
  conversas: 0,
  mensagens: 0,
  duplicadas: 0,
  falhas: 0,
  cursor: null,
  fechou: true,
  motivo: "",
};

/** O recurso em `crc_sync_state`, por canal. */
export function recursoDoHistorico(canal: "instagram" | "messenger"): string {
  return `meta_historico_${canal}`;
}

/**
 * Importa as conversas recentes de um canal.
 *
 * ============================================================================
 *  OS TETOS SÃO A PARTE FUNCIONAL, e não uma proteção genérica.
 *
 *  A Graph pagina conversas por cursor, e uma conta antiga tem milhares. Um
 *  laço `while (proxima !== null)` estouraria a cota de 200 chamadas/hora — e
 *  quando ela estoura, cai TAMBÉM o webhook e o envio de resposta. O backfill é
 *  trabalho de trás; ele não pode derrubar o trabalho da frente.
 *
 *  Com o cursor guardado em `crc_sync_state`, a importação acontece ao longo de
 *  várias voltas. É a mesma disciplina de `procurarDuplicados` em
 *  `omnichannel.ts`: "a varredura completa acontece ao longo de várias voltas, e
 *  isso é aceitável para um trabalho que nunca é urgente".
 * ============================================================================
 *
 * NUNCA LANÇA. Uma thread problemática não pode impedir as outras — nem a
 * operação do dia.
 */
export async function importarHistoricoDaMeta(
  escopo: EscopoDoWebhook,
  canal: "instagram" | "messenger",
  opcoes: { maxThreads?: number; maxPaginas?: number; maxMensagensPorThread?: number } = {},
): Promise<ResultadoDoHistorico> {
  const resultado: ResultadoDoHistorico = { ...VAZIO };

  const { canalMetaDaClinica } = await import("../integracoes/meta/canais");
  const r = await canalMetaDaClinica(escopo.organizationId, escopo.clinicId, canal);

  if (!r.ok) {
    resultado.motivo = r.motivo;
    return resultado;
  }
  if (r.canal.token === null || r.canal.pageId === null) {
    resultado.motivo =
      "A Conversations API é da PÁGINA: sem Página vinculada e sem token não há histórico para importar.";
    return resultado;
  }

  const cliente = new ClienteDaGraph({
    token: r.canal.token,
    organizationId: escopo.organizationId,
    integracao: canal === "instagram" ? "meta_instagram" : "meta_messenger",
  });

  const recurso = recursoDoHistorico(canal);
  const cursor = await lerCursor(escopo, recurso);

  const threads = await cliente.paginar<Record<string, unknown>>(
    `${r.canal.pageId}/conversations`,
    {
      // `platform` É OBRIGATÓRIO e separa as duas caixas. Sem ele a Graph
      // devolve só Messenger, e o direct do Instagram nunca apareceria — um
      // backfill "completo" que importa metade.
      platform: canal === "instagram" ? "instagram" : "messenger",
      fields: "id,updated_time,participants",
      limit: "25",
    },
    {
      maxPaginas: opcoes.maxPaginas ?? 2,
      cursor,
      operacao: "listar_conversas",
    },
  );

  if (!threads.ok) {
    resultado.falhas += 1;
    resultado.motivo = `${threads.erro.codigo}: ${threads.erro.detalhe} — ${threads.erro.acao}`;
    await gravarCursor(escopo, recurso, threads.proximoCursor, false);
    return resultado;
  }

  const maxThreads = Math.max(1, Math.min(opcoes.maxThreads ?? 25, 100));

  for (const thread of threads.itens.slice(0, maxThreads)) {
    const threadId = textoOpcional(thread["id"]);
    if (threadId === null) continue;

    resultado.conversas += 1;

    try {
      const doThread = await importarThread(cliente, escopo, canal, threadId, {
        contaId: canal === "instagram" ? r.canal.instagramAccountId : r.canal.pageId,
        maxMensagens: opcoes.maxMensagensPorThread ?? 50,
      });
      resultado.mensagens += doThread.mensagens;
      resultado.duplicadas += doThread.duplicadas;
      if (doThread.falhou) resultado.falhas += 1;
    } catch (erro) {
      resultado.falhas += 1;
      registrar("erro", "Falha ao importar uma conversa do histórico da Meta.", {
        organizationId: escopo.organizationId,
        canal,
        threadId,
        detalhe: descreverErro(erro),
      });
    }
  }

  resultado.cursor = threads.proximoCursor;
  resultado.fechou = threads.fechou;

  await gravarCursor(escopo, recurso, threads.proximoCursor, resultado.falhas === 0);

  resultado.motivo =
    resultado.mensagens === 0
      ? "Nenhuma mensagem nova no histórico."
      : `${String(resultado.mensagens)} mensagem(ns) importada(s) de ${String(resultado.conversas)} conversa(s).` +
        (threads.fechou ? "" : " Ainda há conversas para importar na próxima volta.");

  return resultado;
}

/* -------------------------------------------------------------------------- */

async function importarThread(
  cliente: ClienteDaGraph,
  escopo: EscopoDoWebhook,
  canal: "instagram" | "messenger",
  threadId: string,
  p: { contaId: string | null; maxMensagens: number },
): Promise<{ mensagens: number; duplicadas: number; falhou: boolean }> {
  const r = await cliente.obter(
    threadId,
    {
      // A SUBSELEÇÃO TRAZ AS MENSAGENS NUMA CHAMADA. Pedir a thread e depois
      // `GET /{msg_id}` por mensagem gastaria uma chamada por mensagem — e a
      // cota da Meta é por hora.
      fields: `messages.limit(${String(p.maxMensagens)}){id,created_time,from,to,message}`,
    },
    "ler_conversa",
  );

  if (!r.ok) return { mensagens: 0, duplicadas: 0, falhou: true };

  let mensagens = 0;
  let duplicadas = 0;

  const brutas = lista(campo(r.dados, "messages.data"));

  /*
   * A ORDEM É INVERTIDA: a Graph devolve do mais NOVO para o mais antigo.
   *
   * ==========================================================================
   *  E ISSO IMPORTA POR CAUSA DA PRÉVIA DA CONVERSA.
   *
   *  `receberMensagemDoCanal` atualiza `ultima_mensagem_trecho` a cada eco.
   *  Inserindo do mais novo para o mais velho, a última gravação seria a
   *  mensagem MAIS ANTIGA — e a Inbox mostraria, como prévia, a primeira frase
   *  de uma conversa de seis meses.
   *
   *  Invertendo, a ordem cronológica é respeitada e a prévia fica correta.
   * ==========================================================================
   */
  for (const bruta of [...brutas].reverse()) {
    if (!ehObjeto(bruta)) continue;

    const mid = textoOpcional(bruta["id"]);
    if (mid === null) continue;

    const deId = textoOpcional(campo(bruta, "from.id"));
    if (deId === null) continue;

    /*
     * QUEM É A CLÍNICA E QUEM É A PESSOA.
     *
     * Numa thread importada, as duas pontas aparecem como `from`. A clínica é
     * quem tem o id da conta; todo o resto é a pessoa. Sem esta distinção, a
     * resposta da recepção entraria como se o paciente a tivesse escrito — e a
     * janela de 24 horas seria calculada a partir da nossa própria mensagem.
     */
    const ehDaClinica = p.contaId !== null && deId === p.contaId;

    const contato = ehDaClinica
      ? (lista(campo(bruta, "to.data"))
          .map((t) => textoOpcional(campo(t, "id")))
          .find((id): id is string => id !== null) ?? null)
      : deId;

    if (contato === null) continue;

    const destino = montarDestino(canal, contato);
    if (destino === null) continue;

    const texto = textoOpcional(bruta["message"]);

    const resultado = await receberMensagemDoCanal(escopo.organizationId, escopo.clinicId, {
      providerMessageId: mid,
      destino,
      // MENSAGEM SEM TEXTO NO HISTÓRICO É MÍDIA ou mensagem apagada. O marcador
      // é honesto — ver `textoDaMensagem` no normalizador, mesma decisão.
      texto: texto ?? "[mensagem sem texto no histórico]",
      ocorridoEm: instanteDaMeta(bruta["created_time"]),
      apelido:
        textoOpcional(campo(bruta, "from.username")) ?? textoOpcional(campo(bruta, "from.name")),
      saida: ehDaClinica,
      // §48. Ver o cabeçalho: é esta flag que impede o backfill de acordar a
      // automação.
      historico: true,
    });

    if (!resultado.ok) continue;
    if (resultado.duplicada) duplicadas += 1;
    else mensagens += 1;
  }

  return { mensagens, duplicadas, falhou: false };
}

/* -------------------------------------------------------------------------- */

async function lerCursor(escopo: EscopoDoWebhook, recurso: string): Promise<string | null> {
  const linha = await selecionarUm("crc_sync_state", {
    colunas: "cursor",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: escopo.organizationId },
      { coluna: "clinic_id", op: "eq", valor: escopo.clinicId },
      { coluna: "recurso", op: "eq", valor: recurso },
    ],
  });

  const cursor = linha?.["cursor"];
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}

async function gravarCursor(
  escopo: EscopoDoWebhook,
  recurso: string,
  cursor: string | null,
  sucesso: boolean,
): Promise<void> {
  const agora = new Date().toISOString();

  await gravar(
    "crc_sync_state",
    {
      organization_id: escopo.organizationId,
      clinic_id: escopo.clinicId,
      recurso,
      /*
       * O CURSOR AVANÇA MESMO EM FALHA PARCIAL AQUI, e é o oposto da
       * reconciliação de Lead Ads — de propósito.
       *
       * Lá, não avançar significa reler leads e não perder nenhum: o custo de
       * reler é cota, e o de pular é um lead perdido.
       *
       * Aqui o custo é invertido. As mensagens são IDEMPOTENTES por
       * `provider_message_id`, então reler não acrescenta nada — e uma thread
       * que falha sempre (mídia que a Graph não devolve mais) travaria o
       * backfill inteiro naquele ponto, para sempre, sem nunca chegar às
       * threads seguintes.
       *
       * O `sync_status` registra a falha para quem for olhar.
       */
      ...(cursor === null ? {} : { cursor }),
      last_sync_at: agora,
      ...(sucesso ? { last_successful_sync: agora } : {}),
      sync_status: sucesso ? "OK" : "FALHOU",
    },
    "organization_id,recurso,clinic_id",
  );
}
