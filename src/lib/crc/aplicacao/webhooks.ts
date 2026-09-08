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
import { atualizar, inserirIgnorandoDuplicata, selecionarUm, type Linha } from "../servidor/banco";
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
    // O payload cru é mascarado antes de ir para o banco: ele contém telefone
    // e o texto da mensagem, e a tabela de inbox não é o lugar de guardar uma
    // segunda cópia disso (item 75).
    payload: mascarar(payload),
    status: "PENDENTE",
  });

  if (inbox === null) {
    resultado.duplicadas += 1;
    return resultado;
  }

  const inboxId = String(inbox["id"] ?? "");

  // A organização e a clínica: hoje o CRC atende uma organização, e o webhook
  // não carrega esse dado. Quando houver multi-tenant de verdade, a resolução
  // passa a ser pelo `phone_number_id` do provedor — que já vem no payload.
  const escopo = await resolverEscopo();
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
  );

  return resultado;
}

async function marcar(id: string, status: string, erro: string | null): Promise<void> {
  const mudancas: Linha = { status, ultimo_erro: erro };
  if (status === "PROCESSADO") mudancas["processado_em"] = new Date().toISOString();
  await atualizar("crc_webhook_inbox", [{ coluna: "id", op: "eq", valor: id }], mudancas);
}

/**
 * A organização e a clínica ativa.
 *
 * Uma consulta simples porque hoje há uma organização. Fica isolada numa função
 * de propósito: quando o produto virar multi-clínica de verdade (item 288), é
 * aqui que a resolução por `phone_number_id` entra, e nada mais muda.
 */
async function resolverEscopo(): Promise<{ organizationId: string; clinicId: string } | null> {
  const clinica = await selecionarUm("crc_clinics", {
    colunas: "id,organization_id",
    filtros: [{ coluna: "ativa", op: "eq", valor: true }],
    ordenar: [{ coluna: "criado_em", ascendente: true }],
  });
  if (clinica === null) return null;

  return {
    organizationId: String(clinica["organization_id"] ?? ""),
    clinicId: String(clinica["id"] ?? ""),
  };
}
