/**
 * A volta diária — `/api/crc/motor`.
 *
 * ========================================================================
 *  ESTA ROTA DEIXOU DE SER O CORAÇÃO DO CRC, e a mudança é o conserto de um
 *  defeito que anulava boa parte do sistema.
 *
 *  Ela fazia TUDO: sincronizar, processar eventos, rodar turnos do agente,
 *  avançar jornadas, campanhas e varreduras. E era chamada pelo cron da
 *  Vercel — que neste plano roda **uma vez por dia**. O resultado:
 *
 *      14:03  paciente escreve "quero remarcar"
 *      09:00  do dia seguinte, o agente responde
 *
 *  Uma fila durável excelente, consumida em cadência de batch noturno.
 *
 *  O trabalho quente mudou para `/api/crc/pulso`, chamado a cada poucos
 *  minutos por um agendador externo e pelo próprio webhook do WhatsApp. O que
 *  ficou aqui é o que pode esperar o dia seguinte — e que NÃO pode rodar a
 *  cada cinco minutos, porque bateria 288 vezes por dia no Dental Office.
 * ========================================================================
 *
 * ELA AINDA BATE O PULSO NO FIM. Não para dar velocidade — para ser
 * autossuficiente: se o agendador externo parar, a volta diária continua
 * drenando a fila uma vez por dia. Devagar é muito melhor que nunca, e um
 * sistema que depende de UM agendador tem um ponto único de falha a mais.
 *
 * SEGURANÇA: `CRON_SECRET`, comparado em tempo constante. Sem a variável, 503 e
 * nada acontece — falhar fechada é o único comportamento aceitável numa rota
 * que manda mensagem para paciente.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/crc/motor")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const segredo = process.env["CRON_SECRET"] ?? "";
        if (segredo.trim().length === 0) {
          return json({ erro: "CRON_SECRET não configurado; o motor está desligado." }, 503);
        }

        const { autorizadoPorBearer } = await import("@/lib/crc/servidor/comparar");
        if (!(await autorizadoPorBearer(request, segredo))) {
          return json({ erro: "Não autorizado." }, 401);
        }

        const comecou = Date.now();
        const { registrar, descreverErro } = await import("@/lib/crc/servidor/registro");

        try {
          // Os handlers precisam estar registrados antes de qualquer coisa que
          // emita evento. Numa instância fria da Vercel o módulo carrega do
          // zero; a função é idempotente e não registra em dobro.
          const { instalarHandlers } = await import("@/lib/crc/automacao/handlers");
          instalarHandlers();

          const url = new URL(request.url);

          const { rodarVoltaPesada } = await import("@/lib/crc/automacao/volta-pesada");
          const clinicas = await rodarVoltaPesada({
            varrerAgora: url.searchParams.get("varrer") === "1",
          });

          /*
           * O PULSO POR ÚLTIMO, e é isso que torna a volta diária completa.
           *
           * A sincronização acabou de trazer fatos novos do Dental Office, e
           * cada fato novo virou evento. Bater o pulso agora consome esses
           * eventos na mesma volta — na ordem inversa, tudo o que a
           * sincronização trouxesse esperaria o próximo pulso.
           */
          const { baterPulso } = await import("@/lib/crc/automacao/pulso");
          const pulso = await baterPulso({ quem: `motor:${new Date().toISOString()}` });

          const relatorio = {
            clinicas,
            pulso,
            duracaoMs: Date.now() - comecou,
          };

          registrar("info", "Volta diária concluída.", {
            clinicas: clinicas.length,
            falhas: clinicas.filter((c) => c.falhou !== undefined).length,
            eventos: pulso.eventos.processados,
          });

          return json(relatorio, 200);
        } catch (erro) {
          // 500 aqui é correto: o cron da Vercel registra a falha e o painel
          // mostra. Diferente do webhook, repetir NÃO causa dano — todo passo é
          // idempotente.
          registrar("erro", "A volta diária falhou.", { detalhe: descreverErro(erro) });
          return json({ erro: "A volta falhou. O erro foi registrado." }, 500);
        }
      },
    },
  },
});
