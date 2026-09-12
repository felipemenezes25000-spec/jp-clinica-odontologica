/**
 * Webhook do WhatsApp POR CANAL — `/api/crc/whatsapp/:canal`.
 *
 * ============================================================================
 *  A ROTA SEM CANAL NÃO SERVE A UM SAAS DE VERDADE, e o motivo é a assinatura.
 *
 *  `/api/crc/whatsapp` monta o adapter a partir do AMBIENTE e verifica a
 *  assinatura com ele. Isso funciona enquanto todos os números vivem dentro do
 *  mesmo Meta App — o `app secret` é do APLICATIVO, e um aplicativo atende
 *  vários números, de vários tenants.
 *
 *  Deixa de funcionar no instante em que dois clientes trazem os próprios
 *  aplicativos:
 *
 *      Tenant A → Meta App A        Tenant A → Meta
 *      Tenant B → Meta App B        Tenant B → Twilio
 *
 *  Com um segredo só cadastrado, a mensagem legítima de B é recusada. Pior: se
 *  só A estiver configurado, qualquer payload assinado com o segredo de A passa
 *  — e o corpo dele pode dizer que é de quem quiser.
 * ============================================================================
 *
 * A CIRCULARIDADE, E COMO ELA É QUEBRADA.
 *
 * Para verificar a assinatura é preciso saber o canal. Para saber o canal pelo
 * corpo, seria preciso confiar no corpo — que é justamente o que a assinatura
 * existe para decidir.
 *
 * O `:canal` da URL quebra isso. Ele é um **identificador público**: um uuid que
 * só diz QUAL LINHA LER. Não é credencial, não autoriza nada, e quem o descobrir
 * ainda precisa assinar o corpo com o segredo daquele canal — que continua no
 * banco, cifrado.
 *
 *     RAW BODY
 *       ↓  canal da URL  (não confiável, só seleciona a linha)
 *       ↓  carrega crc_canais_whatsapp
 *       ↓  monta o adapter DAQUELE canal
 *       ↓  verifica a assinatura sobre o RAW BODY      ← aqui nasce a confiança
 *       ↓  interpreta
 *       ↓  confere que o destinatário do payload É este canal
 *       ↓  grava o inbox com o tenant já provado
 *       ↓  processa
 *
 * A PENÚLTIMA LINHA É A QUE FECHA O BURACO. Sem ela, alguém com acesso ao
 * segredo do próprio canal poderia mandar um corpo dizendo ser de outro número —
 * assinatura válida, tenant errado. Conferir o destinatário transforma "o corpo
 * está autêntico" em "o corpo é DESTE canal".
 */
import { createFileRoute } from "@tanstack/react-router";

function texto(corpo: string, status: number): Response {
  return new Response(corpo, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/crc/whatsapp/$canal")({
  server: {
    handlers: {
      /**
       * Handshake de verificação, por canal.
       *
       * O token de verificação sai do `config` do canal quando existe, e cai no
       * do ambiente quando não — é o mesmo degrau de compatibilidade das
       * credenciais. A comparação é em tempo constante: `===` vaza o
       * comprimento do prefixo correto pelo tempo de resposta.
       */
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const modo = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token") ?? "";
        const desafio = url.searchParams.get("hub.challenge") ?? "";

        const { canalPorId } = await import("@/lib/crc/integracoes/credenciais");
        const canal = await canalPorId(params.canal);
        if (canal === null) return texto("Canal não encontrado.", 404);

        const doCanal = canal.config["verifyToken"];
        const esperado = (
          typeof doCanal === "string" && doCanal.length > 0
            ? doCanal
            : (process.env["WHATSAPP_VERIFY_TOKEN"] ?? "")
        ).trim();

        if (esperado.length === 0) {
          return texto("Token de verificação não configurado para este canal.", 503);
        }

        const { iguaisEmTempoConstante } = await import("@/lib/crc/servidor/comparar");
        if (modo === "subscribe" && (await iguaisEmTempoConstante(token, esperado))) {
          return texto(desafio, 200);
        }
        return texto("Não autorizado.", 403);
      },

      POST: async ({ request, params }) => {
        const { registrar, descreverErro } = await import("@/lib/crc/servidor/registro");

        // O CORPO CRU, antes de qualquer parse. A assinatura é calculada sobre
        // os bytes exatos: `JSON.parse` seguido de `stringify` muda ordem de
        // chave e espaçamento, e a conferência falharia sempre.
        const corpoCru = await request.text();

        const { provedorDoCanal } = await import("@/lib/crc/integracoes/whatsapp/provedores");
        const escolhido = await provedorDoCanal(params.canal);

        if (!escolhido.ok) {
          /*
           * 404 E NÃO 503. Canal inexistente ou desativado não é falha de
           * configuração nossa que vai se resolver sozinha — é uma URL que não
           * corresponde a nada. Devolver 503 faria a Meta reenviar para sempre.
           *
           * E a mensagem não distingue "não existe" de "desativado": as duas
           * respostas juntas contariam, para quem está sondando, quais uuids
           * existem.
           */
          registrar("aviso", "Webhook para canal desconhecido ou inativo.", {
            canal: params.canal,
            detalhe: escolhido.motivo,
          });
          return texto("Canal não encontrado.", 404);
        }

        const { porta, canal } = escolhido;

        if (
          !porta.verificarAssinatura({
            corpoCru,
            cabecalhos: request.headers,
            url: request.url,
          })
        ) {
          registrar("aviso", "Webhook de WhatsApp com assinatura inválida foi recusado.", {
            canal: canal.id,
            organizationId: canal.organizationId,
            provedor: canal.provedor,
          });
          return texto("Assinatura inválida.", 401);
        }

        // Daqui para baixo o corpo é confiável: ele foi assinado com o segredo
        // deste canal.
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

        /*
         * O DESTINATÁRIO DO PAYLOAD TEM QUE SER ESTE CANAL.
         *
         * A assinatura prova que o corpo é autêntico — não que ele é DESTE
         * número. Um tenant com acesso ao próprio segredo poderia assinar um
         * corpo dizendo ser de outro `phone_number_id`, e sem esta conferência
         * a mensagem entraria na conversa do vizinho.
         *
         * `destinatario` ausente é aceito: o sandbox tem um canal só, e o
         * Twilio nem sempre informa. O que não é aceito é ele existir e APONTAR
         * PARA OUTRO.
         */
        const interpretado = porta.interpretarWebhook(payload);
        const destinatario = interpretado.destinatario;

        if (
          destinatario !== null &&
          destinatario.length > 0 &&
          destinatario !== canal.identificador
        ) {
          registrar("erro", "Webhook assinado por um canal, endereçado a outro.", {
            canal: canal.id,
            organizationId: canal.organizationId,
            esperado: canal.identificador,
            recebido: destinatario,
          });
          return texto("Destinatário não confere com o canal.", 401);
        }

        try {
          const { processarWebhookWhatsapp } = await import("@/lib/crc/aplicacao/webhooks");
          const resultado = await processarWebhookWhatsapp(porta, payload, {
            organizationId: canal.organizationId,
            clinicId: canal.clinicId,
          });

          // O TOQUE NO PULSO, só quando CHEGOU MENSAGEM: um status de entrega
          // não tem ninguém esperando resposta.
          if (resultado.mensagens > 0) {
            const { tocarPulso } = await import("@/lib/crc/automacao/pulso");
            await tocarPulso();
          }

          return texto("ok", 200);
        } catch (erro) {
          /*
           * 200 MESMO EM FALHA. Um 500 faz o provedor reenviar, e reenviar não
           * conserta um defeito nosso — só multiplica o efeito dele. O que
           * falhou ficou em `crc_webhook_inbox` e é repescado pelo pulso.
           */
          registrar("erro", "Falha ao processar webhook de WhatsApp.", {
            canal: canal.id,
            organizationId: canal.organizationId,
            detalhe: descreverErro(erro),
          });
          return texto("ok", 200);
        }
      },
    },
  },
});
