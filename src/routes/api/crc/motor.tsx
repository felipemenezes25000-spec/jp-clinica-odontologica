/**
 * O coração batendo — `/api/crc/motor`.
 *
 * É esta rota que faz o CRC funcionar sozinho. A Vercel a chama pelo cron
 * declarado em `vercel.json`, e cada chamada faz uma volta completa:
 *
 *   1. processa eventos pendentes  → oportunidades e jornadas nascem
 *   2. avança as jornadas vencidas → mensagens saem, tarefas são criadas
 *   3. cobra os jobs da fila       → sincronização e trabalho pesado
 *
 * POR QUE UMA ROTA, E NÃO UM WORKER RESIDENTE (item 268)
 * Porque o projeto roda em serverless. Não existe processo que fique de pé
 * entre requisições; um `while(true)` num handler seria morto pelo timeout da
 * função. O modelo correto aqui é "acorda, faz um lote, dorme" — e o estado que
 * sobrevive entre as voltas mora no banco.
 *
 * POR QUE ELA NÃO FAZ TUDO O QUE PODERIA
 * Cada passo tem teto. Uma função da Vercel tem limite de tempo, e uma volta
 * que estoura no meio deixa metade do trabalho feito sem indicação de onde
 * parou. Com teto, ela converge em várias voltas — e o `FOR UPDATE SKIP LOCKED`
 * garante que duas voltas sobrepostas não briguem pela mesma linha.
 *
 * SEGURANÇA: `CRON_SECRET`, comparado em tempo constante. Sem a variável, a
 * rota responde 503 e não faz nada — falhar fechada é o único comportamento
 * aceitável numa rota que manda mensagem para paciente.
 */
import { createFileRoute } from "@tanstack/react-router";

type Relatorio = {
  eventos: unknown;
  jornadas: unknown;
  varreduras: unknown[];
  duracaoMs: number;
};

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
          const { selecionarUm } = await import("@/lib/crc/servidor/banco");
          const clinica = await selecionarUm("crc_clinics", {
            colunas: "id,organization_id",
            filtros: [{ coluna: "ativa", op: "eq", valor: true }],
            ordenar: [{ coluna: "criado_em", ascendente: true }],
          });

          if (clinica === null) {
            return json({ aviso: "Nenhuma clínica cadastrada; nada a fazer." }, 200);
          }

          const organizationId = String(clinica["organization_id"] ?? "");

          // Os handlers precisam estar registrados ANTES de processar eventos.
          // Numa instância fria da Vercel o módulo é carregado do zero a cada
          // vez; a função é idempotente e não registra em dobro.
          const { instalarHandlers, varrerAniversarios, varrerConfirmacoes, varrerRecall } =
            await import("@/lib/crc/automacao/handlers");
          instalarHandlers();

          const { processarEventos } = await import("@/lib/crc/aplicacao/eventos");
          const eventos = await processarEventos(40);

          const { rodarCiclo } = await import("@/lib/crc/automacao/motor");
          const { lerConfiguracao, lerKillSwitches } =
            await import("@/lib/crc/servidor/configuracao");
          const { criarProvedorMensageria } =
            await import("@/lib/crc/integracoes/whatsapp/provedores");

          const configuracao = await lerConfiguracao(organizationId);
          const switches = await lerKillSwitches(organizationId);
          const provedor = criarProvedorMensageria(organizationId);

          const jornadas = await rodarCiclo(
            {
              organizationId,
              porta: provedor.configurado ? provedor.porta : null,
              configuracao,
              enviosPausados: switches["kill_envios"] === true,
              automacoesPausadas: switches["kill_automacoes"] === true,
            },
            30,
          );

          // As varreduras diárias só rodam na janela da madrugada. Rodá-las a
          // cada volta faria o mesmo trabalho vinte vezes por dia — e a
          // deduplicação seguraria o efeito, mas não o custo.
          const varreduras: unknown[] = [];
          const url = new URL(request.url);
          const forcar = url.searchParams.get("varrer") === "1";
          const hora = new Date().getUTCHours();

          if (forcar || hora === 9) {
            // 9h UTC ≈ 6h em São Paulo: as jornadas nascem antes do expediente e
            // esperam a abertura para falar com alguém.
            varreduras.push(await varrerRecall(organizationId, configuracao));
            varreduras.push(await varrerConfirmacoes(organizationId, configuracao));
            varreduras.push(await varrerAniversarios(organizationId, configuracao));

            const { varrerOrcamentosParados } = await import("@/lib/crc/aplicacao/orcamentos");
            varreduras.push(await varrerOrcamentosParados(organizationId, configuracao));

            const { varrerCobrancas } = await import("@/lib/crc/aplicacao/cobrancas");
            varreduras.push(await varrerCobrancas(organizationId));

            const { recalcularPrioridades } = await import("@/lib/crc/aplicacao/oportunidades");
            const { detectarOportunidadesParadas } = await import("@/lib/crc/aplicacao/tarefas");
            varreduras.push({
              prioridadesRecalculadas: await recalcularPrioridades(organizationId),
            });
            varreduras.push({
              oportunidadesParadas: await detectarOportunidadesParadas(organizationId),
            });
          }

          const relatorio: Relatorio = {
            eventos,
            jornadas,
            varreduras,
            duracaoMs: Date.now() - comecou,
          };

          registrar("info", "Ciclo do motor concluído.", { organizationId, ...eventos });
          return json(relatorio, 200);
        } catch (erro) {
          // 500 aqui é correto: o cron da Vercel registra a falha e o painel
          // mostra. Diferente do webhook, repetir NÃO causa dano — todo passo
          // é idempotente.
          registrar("erro", "Ciclo do motor falhou.", { detalhe: descreverErro(erro) });
          return json({ erro: "O ciclo falhou. O erro foi registrado." }, 500);
        }
      },
    },
  },
});
