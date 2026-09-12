/**
 * Webhook do WhatsApp — `/api/crc/whatsapp`.
 *
 * DUAS RESPONSABILIDADES, E A ORDEM ENTRE ELAS É O QUE IMPORTA:
 *
 *   GET  responde ao handshake de verificação do provedor.
 *   POST recebe mensagens e status de entrega.
 *
 * O POST SEGUE O INBOX PATTERN (item 126): o payload é gravado em
 * `crc_webhook_inbox` ANTES de qualquer processamento, com `unique(provedor,
 * external_id)`. Só depois ele é interpretado. A razão é concreta: o provedor
 * reenvia o webhook se não receber 200 em poucos segundos, e um processamento
 * lento produziria a mesma mensagem três vezes na Inbox, três classificações de
 * IA cobradas e três respostas automáticas para o paciente.
 *
 * A ASSINATURA É CONFERIDA ANTES DE TUDO (item 195). Sem isso, qualquer pessoa
 * que descubra a URL pode inventar "o paciente X disse que quer cancelar" — e a
 * automação obedeceria. A conferência usa o corpo CRU, porque a assinatura é
 * calculada sobre os bytes exatos: `JSON.parse` seguido de `stringify` muda
 * ordem de chave e espaçamento, e a conferência falharia sempre.
 *
 * RESPONDE 200 MESMO QUANDO O PROCESSAMENTO FALHA. Não é indulgência: um 500
 * faz o provedor reenviar, e reenviar não conserta um bug nosso — só multiplica
 * o efeito dele. O que falhou fica em `crc_webhook_inbox` como PENDENTE e é
 * repescado.
 */
import { createFileRoute } from "@tanstack/react-router";

function texto(corpo: string, status: number): Response {
  return new Response(corpo, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/crc/whatsapp")({
  server: {
    handlers: {
      /**
       * Handshake de verificação da Meta.
       *
       * A comparação do token é em tempo constante pelo mesmo motivo da rota de
       * cron do RH: `===` vaza o comprimento do prefixo correto pelo tempo de
       * resposta.
       */
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const modo = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token") ?? "";
        const desafio = url.searchParams.get("hub.challenge") ?? "";

        const esperado = process.env["WHATSAPP_VERIFY_TOKEN"] ?? "";
        if (esperado.trim().length === 0) {
          return texto("WHATSAPP_VERIFY_TOKEN não configurado.", 503);
        }

        const { iguaisEmTempoConstante } = await import("@/lib/crc/servidor/comparar");
        if (modo === "subscribe" && (await iguaisEmTempoConstante(token, esperado))) {
          return texto(desafio, 200);
        }
        return texto("Não autorizado.", 403);
      },

      POST: async ({ request }) => {
        const { registrar, descreverErro } = await import("@/lib/crc/servidor/registro");
        const { provedorParaWebhook } = await import("@/lib/crc/integracoes/whatsapp/provedores");

        // O corpo CRU, antes de qualquer parse. Ver o cabeçalho.
        const corpoCru = await request.text();

        /*
         * O PROVEDOR DE ENTRADA VEM DO AMBIENTE, e tem que ser assim: é este
         * `interpretarWebhook` que extrai o destinatário de onde sai o tenant.
         * Pedir a credencial da clínica antes de ler o corpo seria circular.
         * Ver `provedorParaWebhook`.
         */
        const provedor = provedorParaWebhook();
        if (!provedor.configurado) {
          // 503 e não 200: aqui o provedor DEVE reenviar, porque a falha é de
          // configuração nossa e some assim que ela for corrigida.
          return texto("WhatsApp não configurado neste servidor.", 503);
        }

        if (
          !provedor.porta.verificarAssinatura({
            corpoCru,
            cabecalhos: request.headers,
            url: request.url,
          })
        ) {
          registrar("aviso", "Webhook de WhatsApp com assinatura inválida foi recusado.", {
            provedor: provedor.porta.nome,
          });
          return texto("Assinatura inválida.", 401);
        }

        // Os dois provedores falam formatos diferentes: a Meta manda JSON, o
        // Twilio manda formulário. Decidir pelo `content-type` e não pelo nome
        // do provedor é o que faz o sandbox aceitar os dois — ele precisa
        // aceitar, porque é como se simula resposta de paciente com um curl.
        const tipo = request.headers.get("content-type") ?? "";
        let payload: unknown;

        if (tipo.includes("application/x-www-form-urlencoded")) {
          payload = Object.fromEntries(new URLSearchParams(corpoCru).entries());
        } else {
          try {
            payload = JSON.parse(corpoCru);
          } catch {
            return texto("Corpo inválido.", 400);
          }
        }

        try {
          const { processarWebhookWhatsapp } = await import("@/lib/crc/aplicacao/webhooks");
          const resultado = await processarWebhookWhatsapp(provedor.porta, payload);

          /*
           * O TOQUE NO PULSO — o que faz a resposta sair em segundos.
           *
           * Sem ele, a mensagem entrava na fila e ficava lá até a próxima volta
           * do agendador. Com o cron diário que este projeto tinha, "até a
           * próxima volta" queria dizer no dia seguinte.
           *
           * Só toca quando CHEGOU MENSAGEM. Um webhook de status de entrega
           * ("lida", "entregue") não tem ninguém esperando resposta, e tocar
           * nele multiplicaria as chamadas por três sem nada em troca.
           */
          if (resultado.mensagens > 0) {
            const { tocarPulso } = await import("@/lib/crc/automacao/pulso");
            await tocarPulso();
          }

          return texto(
            `ok: ${String(resultado.mensagens)} mensagem(ns), ${String(resultado.entregas)} status.`,
            200,
          );
        } catch (erro) {
          // 200 de propósito. Ver o cabeçalho: reenviar não conserta bug nosso.
          registrar("erro", "Falha ao processar webhook do WhatsApp.", {
            detalhe: descreverErro(erro),
          });
          return texto("Recebido; o processamento será repetido.", 200);
        }
      },
    },
  },
});
