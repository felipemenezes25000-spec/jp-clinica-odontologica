/**
 * Health check — `/api/crc/saude`. Item 76.
 *
 * O QUE ELE VERIFICA, E O QUE ELE DELIBERADAMENTE NÃO VERIFICA
 *
 * Verifica: a aplicação responde, e o banco responde a uma consulta trivial.
 * São as duas coisas cuja ausência significa "o sistema está fora".
 *
 * NÃO verifica Dental Office, WhatsApp nem IA. Nenhum dos três precisa estar de
 * pé para o CRC atender — itens 117 e 118 são explícitos sobre isso. Um health
 * check que fica vermelho porque a API de um terceiro caiu treina a equipe a
 * ignorar o vermelho, e aí ele não serve para nada. O estado dessas integrações
 * aparece na tela de Integrações, que é onde ele é acionável.
 *
 * NÃO É AUTENTICADO, e por isso não conta nada. A resposta diz "ok" ou "banco
 * indisponível" — nunca versão, nome de tabela, contagem de registro ou motivo
 * técnico. Health check aberto que descreve a infraestrutura é reconhecimento
 * de graça para quem estiver sondando.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/crc/saude")({
  server: {
    handlers: {
      GET: async () => {
        const { bancoConfigurado } = await import("@/lib/crc/servidor/banco");

        const configurado = bancoConfigurado();
        if (!configurado.ok) {
          return json({ status: "degradado", app: "ok", banco: "nao_configurado" }, 503);
        }

        try {
          const { selecionar } = await import("@/lib/crc/servidor/banco");
          // A consulta mais barata possível: uma linha, uma coluna. O objetivo
          // é provar que a conexão e a autenticação funcionam, não medir dado.
          await selecionar("crc_organizations", { colunas: "id", limite: 1 });
          return json({ status: "ok", app: "ok", banco: "ok" }, 200);
        } catch {
          // O motivo NÃO vai na resposta — ver o cabeçalho. Ele já está no log
          // do driver, que é onde quem opera vai procurar.
          return json({ status: "degradado", app: "ok", banco: "indisponivel" }, 503);
        }
      },
    },
  },
});
