/**
 * Processamento de webhook — o inbox pattern do item 126 em código.
 *
 * A SEQUÊNCIA É: gravar → interpretar → aplicar → marcar processado. Cada passo
 * existe por um motivo concreto:
 *
 *   GRAVAR ANTES: `unique(provedor, external_id)` no banco. O provedor reenvia
 *   quando não recebe 200 rápido, e sem esta trava a mesma mensagem viraria
 *   três na Inbox, três classificações de IA cobradas e três respostas para o
 *   paciente.
 *
 *   INTERPRETAR DEPOIS: se a interpretação falhar, o payload cru continua no
 *   banco e pode ser reprocessado depois de o mapper ser corrigido. Interpretar
 *   antes de gravar perderia o payload junto com o erro.
 *
 *   MARCAR NO FIM: só o que realmente entrou vira PROCESSADO.
 */
import type { PortaMensageria } from "../integracoes/whatsapp/porta";
import {
  atualizar,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
  type Linha,
} from "../servidor/banco";
import { descreverErro, mascarar, registrar } from "../servidor/registro";

import { atualizarEntrega, receberMensagem } from "./mensagens";

export type ResultadoWebhook = { mensagens: number; entregas: number; duplicadas: number };

/**
 * A chave de deduplicação do envelope inteiro.
 *
 * Um webhook pode trazer várias mensagens. Deduplicar só por mensagem
 * individual (que também fazemos, em `crc_messages.provider_message_id`) deixa
 * o envelope ser reprocessado inteiro — o que é barato mas gera ruído no log.
 * A chave do envelope é o id da PRIMEIRA mensagem ou status que ele carrega:
 * determinística, e presente em todo webhook útil.
 */
function chaveDoEnvelope(interpretado: {
  mensagens: { providerMessageId: string }[];
  entregas: { providerMessageId: string; status: string }[];
}): string | null {
  const primeira = interpretado.mensagens[0];
  if (primeira !== undefined) return `msg:${primeira.providerMessageId}`;

  const entrega = interpretado.entregas[0];
  // O status entra na chave: `SENT` e `DELIVERED` da mesma mensagem são dois
  // webhooks diferentes e ambos precisam ser aplicados.
  if (entrega !== undefined) return `st:${entrega.providerMessageId}:${entrega.status}`;

  return null;
}

export async function processarWebhookWhatsapp(
  porta: PortaMensageria,
  payload: unknown,
): Promise<ResultadoWebhook> {
  const interpretado = porta.interpretarWebhook(payload);
  const resultado: ResultadoWebhook = { mensagens: 0, entregas: 0, duplicadas: 0 };

  const chave = chaveDoEnvelope(interpretado);
  if (chave === null) {
    // Webhook sem mensagem nem status: a Meta manda isso em mudança de
    // configuração da conta. Não é erro e não precisa de registro ruidoso.
    return resultado;
  }

  const inbox = await inserirIgnorandoDuplicata("crc_webhook_inbox", {
    provedor: porta.nome,
    external_id: chave,
    /*
     * O ENVELOPE JÁ INTERPRETADO, e não o payload cru mascarado.
     *
     * A versão anterior gravava `mascarar(payload)`, e isso tornava a linha
     * inútil para o que ela existe: o mascarador corta profundidade acima de
     * seis níveis e limita arrays. O envelope da Meta é
     * `entry > changes > value > messages > …` — ou seja, o mascarador
     * destruía exatamente a parte que um replay precisaria ler.
     *
     * `mascarar` é a ferramenta certa para LOG. Não é serializador de fila.
     *
     * O formato normalizado resolve os dois lados: é raso, é estável entre
     * provedores (Meta, Twilio e WAHA produzem a mesma forma), e é literalmente
     * a entrada da etapa seguinte — então repetir a etapa é repetir com o mesmo
     * dado, e não com uma aproximação dele.
     */
    payload: interpretado as unknown as Linha,
    status: "PENDENTE",
  });

  if (inbox === null) {
    resultado.duplicadas += 1;
    return resultado;
  }

  const inboxId = String(inbox["id"] ?? "");

  // Quem recebeu decide de quem é a mensagem. Ver `resolverEscopo`.
  const escopo = await resolverEscopo(porta.nome, interpretado.destinatario);
  if (escopo === null) {
    await marcar(inboxId, "FALHOU", "Nenhuma organização configurada.");
    registrar("erro", "Webhook recebido sem organização configurada.");
    return resultado;
  }

  const erros: string[] = [];

  for (const mensagem of interpretado.mensagens) {
    try {
      const r = await receberMensagem(escopo.organizationId, escopo.clinicId, mensagem);
      if (r.ok && !r.duplicada) resultado.mensagens += 1;
      else if (r.ok) resultado.duplicadas += 1;
    } catch (erro) {
      // Uma mensagem que falha não impede as outras do mesmo envelope.
      erros.push(descreverErro(erro));
    }
  }

  for (const entrega of interpretado.entregas) {
    try {
      await atualizarEntrega(
        escopo.organizationId,
        entrega.providerMessageId,
        entrega.status,
        entrega.erro,
      );
      resultado.entregas += 1;
    } catch (erro) {
      erros.push(descreverErro(erro));
    }
  }

  await marcar(
    inboxId,
    erros.length === 0 ? "PROCESSADO" : "FALHOU",
    erros.length === 0 ? null : erros.join(" | ").slice(0, 1000),
    1,
  );

  return resultado;
}

/**
 * Fecha o envelope — ou o devolve para a fila.
 *
 * DUAS COISAS ACONTECEM AQUI que não aconteciam antes, e as duas são o conserto
 * do item 126 ter ficado pela metade:
 *
 *   FALHA AGENDA A PRÓXIMA TENTATIVA. Antes, `FALHOU` era um estado final de
 *   fato: ninguém lia a tabela. O envelope ficava lá, o paciente sem resposta, e
 *   a Meta já tinha recebido `200` — ou seja, ela nunca reenviaria. Agora
 *   `disponivel_em` empurra a linha para a frente e o pulso a repesca.
 *
 *   SUCESSO APAGA O PAYLOAD. Enquanto pendente, ele guarda telefone e texto,
 *   porque é o que o replay precisa. Depois de processado, esse conteúdo já está
 *   em `crc_messages` com as regras de acesso de lá — manter a cópia aqui seria
 *   um segundo lugar com PII e outra política de retenção (item 75), que é
 *   exatamente o que o `mascarar()` original tentava evitar.
 */
async function marcar(
  id: string,
  status: string,
  erro: string | null,
  tentativas = 0,
): Promise<void> {
  const mudancas: Linha = { status, ultimo_erro: erro };

  if (status === "PROCESSADO") {
    mudancas["processado_em"] = new Date().toISOString();
    mudancas["payload"] = {};
    mudancas["travado_ate"] = null;
  } else if (status === "FALHOU") {
    mudancas["travado_ate"] = null;
    mudancas["disponivel_em"] = new Date(Date.now() + esperaDoWebhook(tentativas)).toISOString();
  }

  await atualizar("crc_webhook_inbox", [{ coluna: "id", op: "eq", valor: id }], mudancas);
}

/**
 * Quanto esperar antes de repescar, em milissegundos.
 *
 * 15s, 1min, 4min, 16min. MAIS CURTO QUE O DO AGENTE de propósito: ali o que
 * espera é um job de recuperação; aqui é a mensagem que o paciente acabou de
 * mandar, e cada minuto é um minuto de silêncio depois de um "oi".
 */
export function esperaDoWebhook(tentativas: number): number {
  const base = 15_000 * Math.pow(4, Math.max(tentativas - 1, 0));
  return Math.min(base, 16 * 60_000);
}

/**
 * De qual organização e clínica é esta mensagem.
 *
 * ========================================================================
 *  O DEFEITO QUE ISTO CONSERTA ERA O MAIS SENSÍVEL DA AUDITORIA.
 *
 *  A versão anterior era literalmente:
 *
 *      selecionarUm("crc_clinics", { ativa = true }, por criado_em)
 *
 *  TODA mensagem recebida ia para a primeira clínica cadastrada,
 *  independentemente do número para o qual foi enviada. Com uma organização,
 *  certo por acidente. Com duas, o paciente da Clínica B entrava na conversa,
 *  no histórico e na base da Clínica A.
 *
 *  Num sistema de saúde isso não é defeito funcional: é dado de paciente
 *  atravessando a fronteira de uma organização. O banco já fazia a parte dele
 *  — RLS e chaves compostas no `supabase/19` — e quem decidia errado era esta
 *  função.
 * ========================================================================
 *
 * A INFORMAÇÃO SEMPRE ESTEVE NO PAYLOAD: `phone_number_id` na Meta, o `To` no
 * Twilio, a `session` no WAHA. Ninguém a estava lendo.
 */
async function resolverEscopo(
  provedor: string,
  destinatario: string | null,
): Promise<{ organizationId: string; clinicId: string } | null> {
  if (destinatario !== null && destinatario.length > 0) {
    const canal = await selecionarUm("crc_canais_whatsapp", {
      colunas: "organization_id,clinic_id",
      filtros: [
        { coluna: "provedor", op: "eq", valor: provedor },
        { coluna: "identificador", op: "eq", valor: destinatario },
        { coluna: "ativo", op: "eq", valor: true },
      ],
    });

    if (canal !== null) {
      return {
        organizationId: String(canal["organization_id"] ?? ""),
        clinicId: String(canal["clinic_id"] ?? ""),
      };
    }
  }

  /*
   * NENHUM CANAL CADASTRADO: cai na clínica única, e RECLAMA.
   *
   * Este caminho existe por uma razão só — não quebrar a instalação que já
   * funciona. A JP tem uma clínica e nenhum canal cadastrado; exigir o cadastro
   * agora derrubaria o recebimento de mensagem até alguém abrir a tela.
   *
   * MAS ELE SÓ É SEGURO ENQUANTO HOUVER UMA CLÍNICA. Com duas, ele é
   * exatamente o defeito de origem — então a checagem abaixo o desliga sozinha
   * assim que a segunda aparece. É a diferença entre um padrão de transição e
   * uma bomba-relógio.
   */
  const clinicas = await selecionar("crc_clinics", {
    colunas: "id,organization_id",
    filtros: [{ coluna: "ativa", op: "eq", valor: true }],
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 2,
  });

  if (clinicas.length > 1) {
    registrar("erro", "Webhook sem canal cadastrado, e há mais de uma clínica.", {
      provedor,
      destinatario,
      detalhe:
        "Não dá para adivinhar de quem é a mensagem. Cadastre o canal em crc_canais_whatsapp.",
    });
    return null;
  }

  const unica = clinicas[0];
  if (unica === undefined) return null;

  if (destinatario !== null && destinatario.length > 0) {
    registrar("aviso", "Webhook recebido sem canal cadastrado; usando a clínica única.", {
      provedor,
      destinatario,
    });
  }

  return {
    organizationId: String(unica["organization_id"] ?? ""),
    clinicId: String(unica["id"] ?? ""),
  };
}

/* -------------------------------------------------------------------------- */
/* A repescagem — o lado que faltava do inbox pattern                        */
/* -------------------------------------------------------------------------- */

export type ResultadoDaRepescagem = {
  reservados: number;
  recuperados: number;
  falhados: number;
  descartados: number;
  presosLiberados: number;
};

/**
 * Reprocessa os envelopes que falharam.
 *
 * ========================================================================
 *  ESTA FUNÇÃO É O CONSERTO DE UM P0, e o defeito era a ausência dela.
 *
 *  O cabeçalho deste arquivo sempre prometeu: "se a interpretação falhar, o
 *  payload cru continua no banco e pode ser reprocessado depois". A gravação
 *  foi feita; a repescagem nunca existiu. `crc_webhook_inbox` era escrita e
 *  lida por ninguém.
 *
 *  O efeito, e ele é silencioso dos dois lados:
 *
 *      a Meta manda o webhook
 *      o CRC grava e começa a processar
 *      o banco pisca no meio
 *      a linha vira FALHOU, e o CRC responde 200
 *      a Meta considera entregue e NUNCA reenvia
 *      ninguém repesca
 *
 *  A mensagem do paciente some. Nenhum alerta dispara: do lado da Meta deu
 *  certo, e do nosso a linha está lá, parada, num estado que ninguém observa.
 * ========================================================================
 *
 * NUNCA LANÇA. Ela roda dentro do pulso; um envelope problemático não pode
 * impedir os outros — nem o resto da volta.
 */
export async function repescarWebhooks(
  opcoes: { limite?: number; quem?: string } = {},
): Promise<ResultadoDaRepescagem> {
  const { rpc } = await import("../servidor/banco");

  const resultado: ResultadoDaRepescagem = {
    reservados: 0,
    recuperados: 0,
    falhados: 0,
    descartados: 0,
    presosLiberados: 0,
  };

  // Primeiro os presos: PROCESSANDO com lease vencido e teto estourado não
  // aparece na fila nem na lista de falhas. Some.
  try {
    const linhas = await rpc("crc_liberar_webhooks_presos", {});
    const n = linhas[0];
    resultado.presosLiberados = n === undefined ? 0 : Number(Object.values(n)[0] ?? 0);
  } catch {
    // Higiene não pode impedir o trabalho do lote.
  }

  let reservados: Linha[] = [];
  try {
    reservados = await rpc("crc_reservar_webhooks", {
      limite: opcoes.limite ?? 10,
      lock_segundos: 120,
      quem: opcoes.quem ?? null,
      max_tentativas: MAX_TENTATIVAS_WEBHOOK,
    });
  } catch (erro) {
    registrar("erro", "Não foi possível reservar webhooks para repescagem.", {
      detalhe: descreverErro(erro),
    });
    return resultado;
  }

  resultado.reservados = reservados.length;

  for (const linha of reservados) {
    const id = String(linha["id"] ?? "");
    const tentativas = typeof linha["tentativas"] === "number" ? linha["tentativas"] : 1;

    try {
      const aplicado = await aplicarEnvelope(linha);
      if (aplicado) {
        await marcar(id, "PROCESSADO", null, tentativas);
        resultado.recuperados += 1;
      } else {
        /*
         * DESCARTADO, E NÃO FALHOU. O envelope não tem como ser aplicado nunca
         * — payload vazio de uma linha já concluída, ou forma que nenhum
         * provedor produz. Deixá-lo como FALHOU o faria voltar à fila cinco
         * vezes para falhar cinco vezes, e encheria a dead letter de coisa que
         * ninguém pode consertar.
         */
        await marcar(id, "DESCARTADO", "Envelope sem conteúdo aplicável.", tentativas);
        resultado.descartados += 1;
      }
    } catch (erro) {
      const detalhe = descreverErro(erro);
      await marcar(id, "FALHOU", detalhe, tentativas);
      resultado.falhados += 1;

      if (tentativas >= MAX_TENTATIVAS_WEBHOOK) {
        await mandarParaDeadLetter(linha, detalhe);
      }
    }
  }

  return resultado;
}

/** Cinco tentativas, como as outras filas do CRC. */
export const MAX_TENTATIVAS_WEBHOOK = 5;

/**
 * Aplica um envelope guardado.
 *
 * Devolve `false` quando não há nada aplicável — ver o comentário do
 * `DESCARTADO` acima.
 */
async function aplicarEnvelope(linha: Linha): Promise<boolean> {
  const payload = linha["payload"];
  if (typeof payload !== "object" || payload === null) return false;

  const envelope = payload as { mensagens?: unknown; entregas?: unknown };
  const mensagens = Array.isArray(envelope.mensagens) ? envelope.mensagens : [];
  const entregas = Array.isArray(envelope.entregas) ? envelope.entregas : [];

  if (mensagens.length === 0 && entregas.length === 0) return false;

  /*
   * O REPLAY ROTEIA PELO MESMO CAMINHO DO ORIGINAL, e isso não é detalhe.
   *
   * O `provedor` é coluna da linha e o `destinatario` viaja dentro do envelope
   * normalizado — então um webhook repescado três dias depois cai na MESMA
   * clínica em que teria caído na hora. Resolver de novo "pela primeira clínica"
   * faria a repescagem entregar a mensagem para o tenant errado, e seria pior
   * que não repescar: o dado atravessaria a fronteira sem ninguém perceber.
   */
  const escopo = await resolverEscopo(
    String(linha["provedor"] ?? ""),
    typeof (envelope as { destinatario?: unknown }).destinatario === "string"
      ? String((envelope as { destinatario?: unknown }).destinatario)
      : null,
  );
  if (escopo === null) {
    // Lança de propósito: sem organização, isto é falha de configuração e o
    // envelope deve voltar à fila, não ser descartado.
    throw new Error("Nenhuma organização configurada para este canal.");
  }

  for (const m of mensagens) {
    await receberMensagem(
      escopo.organizationId,
      escopo.clinicId,
      m as Parameters<typeof receberMensagem>[2],
    );
  }

  for (const e of entregas) {
    const entrega = e as { providerMessageId?: unknown; status?: unknown; erro?: unknown };
    await atualizarEntrega(
      escopo.organizationId,
      String(entrega.providerMessageId ?? ""),
      String(entrega.status ?? "") as Parameters<typeof atualizarEntrega>[2],
      typeof entrega.erro === "string" ? entrega.erro : null,
    );
  }

  return true;
}

/**
 * O envelope esgotou as tentativas.
 *
 * A DEAD LETTER É ESCRITA AQUI, e não deixada para alguém notar depois: um
 * webhook que esgotou as tentativas sai da fila de trabalho, e sem registro ele
 * sai do mundo. Do outro lado tem um paciente que escreveu e nunca foi
 * respondido — e a Meta não vai reenviar, porque para ela deu certo.
 */
async function mandarParaDeadLetter(linha: Linha, erro: string): Promise<void> {
  try {
    const { inserir } = await import("../servidor/banco");
    const escopo = await resolverEscopo(String(linha["provedor"] ?? ""), null);

    await inserir("crc_dead_letters", {
      organization_id: escopo?.organizationId ?? null,
      origem: "webhook",
      referencia: String(linha["id"] ?? ""),
      erro: erro.slice(0, 500),
      payload: {
        provedor: linha["provedor"],
        externalId: linha["external_id"],
        tentativas: linha["tentativas"],
      },
      status: "PENDENTE",
    });
  } catch (falha) {
    registrar("erro", "Webhook esgotou as tentativas e a dead letter falhou.", {
      detalhe: descreverErro(falha),
    });
  }
}
