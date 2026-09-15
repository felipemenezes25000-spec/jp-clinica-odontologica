/**
 * Webhook da Meta POR CANAL — `/api/crc/meta/:canal`. §11.
 *
 * ============================================================================
 *  UMA ENTRADA, QUATRO PRODUTOS — e é assim que a Meta funciona.
 *
 *  Instagram Direct, Messenger, comentários e Lead Ads chegam TODOS no mesmo
 *  POST, no mesmo app, com a mesma assinatura. Quatro rotas seriam quatro
 *  verificações de assinatura idênticas e quatro chances de uma divergir.
 *
 *  A discriminação é do normalizador (`integracoes/meta/normalizar.ts`), que lê
 *  `object` e `field` e devolve eventos tipados.
 * ============================================================================
 *
 * ============================================================================
 *  SÓ EXISTE A ROTA POR CANAL, e não há a versão "sem canal".
 *
 *  O WhatsApp tem as duas — `/api/crc/whatsapp` e `/api/crc/whatsapp/:canal` —
 *  porque a primeira já estava em produção quando a tabela de canais nasceu, e
 *  derrubá-la interromperia o recebimento da JP.
 *
 *  AQUI NADA ESTÁ EM PRODUÇÃO AINDA. Uma rota de transição sem instalação para
 *  não quebrar é só uma porta a mais para manter — e a porta sem canal é
 *  exatamente a que não sabe qual `appSecret` usar quando aparece o segundo
 *  app. Ver o cabeçalho de `/api/crc/whatsapp/:canal`.
 * ============================================================================
 *
 * A CIRCULARIDADE, E COMO ELA É QUEBRADA — a mesma do WhatsApp:
 *
 *     RAW BODY
 *       ↓  canal da URL   (não confiável; só seleciona a linha)
 *       ↓  carrega crc_canais_meta
 *       ↓  pega o appSecret DAQUELE canal
 *       ↓  verifica a assinatura sobre o RAW BODY     ← aqui nasce a confiança
 *       ↓  normaliza
 *       ↓  confere que as contas do payload SÃO deste canal
 *       ↓  grava o inbox com o tenant já provado
 *       ↓  processa
 *
 * A PENÚLTIMA LINHA É A QUE FECHA O BURACO. A assinatura prova que o corpo é
 * autêntico — não que ele é DESTE canal. Sem a conferência, alguém com acesso
 * ao segredo do próprio app poderia mandar um corpo dizendo ser de outra
 * Página: assinatura válida, tenant errado.
 */
import { createFileRoute } from "@tanstack/react-router";

function texto(corpo: string, status: number): Response {
  return new Response(corpo, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/crc/meta/$canal")({
  server: {
    handlers: {
      /**
       * O handshake de verificação, por canal.
       *
       * O token sai do `config` do canal quando existe e cai no do ambiente
       * quando não — é o mesmo degrau de compatibilidade das credenciais. A
       * comparação é em tempo constante: ver `responderDesafio`.
       */
      GET: async ({ request, params }) => {
        const url = new URL(request.url);

        const { canalMetaPorId, verifyTokenDoCanal } =
          await import("@/lib/crc/integracoes/meta/canais");
        const canal = await canalMetaPorId(params.canal);
        if (canal === null) return texto("Canal não encontrado.", 404);

        const { responderDesafio } = await import("@/lib/crc/integracoes/meta/assinatura");
        const r = await responderDesafio({
          modo: url.searchParams.get("hub.mode"),
          token: url.searchParams.get("hub.verify_token") ?? "",
          desafio: url.searchParams.get("hub.challenge") ?? "",
          esperado: verifyTokenDoCanal(canal),
        });

        // O DESAFIO VOLTA COMO TEXTO PURO. A Meta compara byte a byte; JSON com
        // aspas falha com "The URL couldn't be validated".
        return r.ok ? texto(r.resposta, 200) : texto(r.motivo, r.status);
      },

      POST: async ({ request, params }) => {
        const { registrar, descreverErro } = await import("@/lib/crc/servidor/registro");

        // O CORPO CRU, antes de qualquer parse. A assinatura é HMAC sobre os
        // bytes exatos: `JSON.parse` + `stringify` muda ordem de chave e
        // espaçamento, e a conferência falharia SEMPRE.
        const corpoCru = await request.text();

        const { canalMetaPorId, appSecretDoCanal } =
          await import("@/lib/crc/integracoes/meta/canais");
        const canal = await canalMetaPorId(params.canal);

        if (canal === null) {
          /*
           * 404 E NÃO 503. Canal inexistente ou desativado não é falha de
           * configuração que se resolve sozinha — é uma URL que não corresponde
           * a nada, e 503 faria a Meta reenviar para sempre.
           *
           * E a mensagem não distingue "não existe" de "desativado": as duas
           * respostas juntas contariam, para quem sonda, quais uuids existem.
           */
          registrar("aviso", "Webhook da Meta para canal desconhecido ou inativo.", {
            canal: params.canal,
          });
          return texto("Canal não encontrado.", 404);
        }

        const { verificarAssinaturaMeta } = await import("@/lib/crc/integracoes/meta/assinatura");
        const assinatura = verificarAssinaturaMeta(
          { corpoCru, cabecalhos: request.headers },
          appSecretDoCanal(canal),
        );

        if (!assinatura.valida) {
          registrar("aviso", "Webhook da Meta com assinatura inválida foi recusado.", {
            canal: canal.id,
            organizationId: canal.organizationId,
            // O MOTIVO VAI SÓ PARA O LOG. A resposta é sempre a mesma frase —
            // ver `ResultadoDaAssinatura.motivo`.
            motivo: assinatura.motivo,
          });
          /*
           * 503 QUANDO FALTA O SEGREDO, 401 no resto.
           *
           * "Não há appSecret configurado" é falha NOSSA, e ela desaparece
           * quando alguém configura — a Meta deve reenviar. "A assinatura não
           * confere" é recusa definitiva daquele corpo.
           */
          return assinatura.motivo === "sem_segredo"
            ? texto("Canal sem app secret configurado.", 503)
            : texto("Assinatura inválida.", 401);
        }

        // Daqui para baixo o corpo é confiável: ele foi assinado com o segredo
        // do app deste canal.
        let payload: unknown;
        try {
          payload = JSON.parse(corpoCru);
        } catch {
          return texto("Corpo inválido.", 400);
        }

        const { interpretarWebhookMeta } = await import("@/lib/crc/integracoes/meta/normalizar");
        const envelope = interpretarWebhookMeta(payload);

        /*
         * AS CONTAS DO PAYLOAD TÊM QUE SER DESTE CANAL.
         *
         * ====================================================================
         *  A assinatura prova que o corpo é autêntico — não que ele é DESTA
         *  Página. Um tenant com acesso ao próprio app secret poderia assinar
         *  um corpo dizendo ser de outra conta, e sem esta conferência o direct
         *  entraria na Inbox do vizinho.
         *
         *  `contas` VAZIO É ACEITO: é o webhook de mudança de configuração, que
         *  não tem `entry` e não tem nada a rotear. O que não é aceito é uma
         *  conta existir e APONTAR PARA OUTRA.
         * ====================================================================
         */
        const conhecidas = new Set(
          [canal.pageId, canal.instagramAccountId].filter((c): c is string => c !== null),
        );
        const intrusa = envelope.contas.find((c) => !conhecidas.has(c));

        if (intrusa !== undefined) {
          registrar("erro", "Webhook da Meta assinado por um canal, endereçado a outro.", {
            canal: canal.id,
            organizationId: canal.organizationId,
            esperado: [...conhecidas].join(","),
            recebido: intrusa,
          });
          return texto("Conta não confere com o canal.", 401);
        }

        try {
          const { processarWebhookMeta } = await import("@/lib/crc/aplicacao/meta");
          const resultado = await processarWebhookMeta(envelope, {
            organizationId: canal.organizationId,
            clinicId: canal.clinicId,
          });

          /*
           * O TOQUE NO PULSO, só quando chegou MENSAGEM ou LEAD.
           *
           * ==================================================================
           *  SÃO OS DOIS QUE TÊM ALGUÉM ESPERANDO.
           *
           *  Mensagem: uma pessoa escreveu e está olhando a tela.
           *  Lead: o §21 mede o speed-to-lead em SEGUNDOS, e sem o toque o lead
           *        esperaria a próxima volta do agendador — que, com o cron
           *        diário deste projeto, quer dizer no dia seguinte.
           *
           *  Status de entrega e comentário não entram: ninguém está esperando
           *  resposta, e tocar neles multiplicaria as chamadas sem nada em
           *  troca.
           * ==================================================================
           */
          if (resultado.mensagens > 0 || resultado.leads > 0) {
            const { tocarPulso } = await import("@/lib/crc/automacao/pulso");
            await tocarPulso();
          }

          return texto("ok", 200);
        } catch (erro) {
          /*
           * 200 MESMO EM FALHA. Um 500 faz a Meta reenviar, e reenviar não
           * conserta um defeito nosso — só multiplica o efeito dele. O que
           * falhou ficou em `crc_webhook_inbox` e é repescado pelo pulso.
           */
          registrar("erro", "Falha ao processar webhook da Meta.", {
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
