/**
 * O pulso — `/api/crc/pulso`.
 *
 * A ROTA QUE FAZ O CRC RESPONDER EM MINUTOS, e não no dia seguinte.
 *
 * `/api/crc/motor` continua existindo e continua diária: ela é a volta pesada —
 * sincronizar o Dental Office, rodar campanhas, varrer a base. Esta aqui é a
 * volta leve, e é a única que tem alguém esperando do outro lado: eventos,
 * turnos do agente e jornadas vencidas.
 *
 * ========================================================================
 *  POR QUE UMA ROTA SEPARADA E NÃO UM CRON MAIS FREQUENTE NA MESMA.
 *
 *  Duas razões, e as duas são concretas:
 *
 *  O PLANO. O cron da Vercel neste projeto é o do plano Hobby: uma vez por
 *  dia, e ponto. Já derrubamos um deploy inteiro tentando agendar mais denso.
 *  Quem bate este endereço é um agendador EXTERNO — ver
 *  `.github/workflows/crc-pulso.yml` — e o webhook do WhatsApp, que dá um
 *  toque assim que uma mensagem chega.
 *
 *  O CUSTO. Rodar a sincronização a cada cinco minutos seriam 288 idas ao
 *  Dental Office por dia para trazer quase nada, no passo mais caro e mais
 *  sujeito a limite de taxa. Separar não é arrumação: é o que torna a
 *  frequência possível.
 * ========================================================================
 *
 * SEGURANÇA: o mesmo `CRON_SECRET` do motor, comparado em tempo constante. Sem
 * a variável, 503 e nada acontece — falhar fechada é o único comportamento
 * aceitável numa rota que faz o agente falar com paciente.
 *
 * POST, E NÃO GET. O motor é GET porque o cron da Vercel usa GET. Este é
 * chamado por agendador externo e pelo webhook, e um verbo que MUDA ESTADO não
 * deve ser GET: qualquer pré-fetch de link, crawler ou proxy que resolva
 * "visitar" a URL dispararia um ciclo.
 */
import { createFileRoute } from "@tanstack/react-router";

function json(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/crc/pulso")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const segredo = process.env["CRON_SECRET"] ?? "";
        if (segredo.trim().length === 0) {
          return json({ erro: "CRON_SECRET não configurado; o pulso está desligado." }, 503);
        }

        const { autorizadoPorBearer } = await import("@/lib/crc/servidor/comparar");
        if (!(await autorizadoPorBearer(request, segredo))) {
          return json({ erro: "Não autorizado." }, 401);
        }

        const { registrar, descreverErro } = await import("@/lib/crc/servidor/registro");

        try {
          const { baterPulso } = await import("@/lib/crc/automacao/pulso");
          const r = await baterPulso();

          /*
           * SÓ REGISTRA QUANDO FEZ ALGO.
           *
           * Este endereço é chamado a cada poucos minutos, o dia inteiro. Uma
           * linha de log por volta seriam ~288 por dia dizendo "nada a fazer" —
           * e um log que é 95% ruído é um log que ninguém abre no dia do
           * incidente.
           */
          if (r.eventos.reservados > 0 || r.turnos.reservados > 0 || r.jornadas.length > 0) {
            registrar("info", "Pulso com trabalho.", {
              eventos: r.eventos.processados,
              turnos: r.turnos.concluidos,
              organizacoes: r.organizacoes,
            });
          }

          return json(r, 200);
        } catch (erro) {
          // 500 é correto: o agendador registra a falha e tenta de novo em
          // minutos. Repetir não causa dano — todo passo é idempotente.
          registrar("erro", "O pulso falhou.", { detalhe: descreverErro(erro) });
          return json({ erro: "O pulso falhou. O erro foi registrado." }, 500);
        }
      },
    },
  },
});
