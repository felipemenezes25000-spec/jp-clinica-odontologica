/**
 * O coração batendo — `/api/crc/motor`.
 *
 * É esta rota que faz o CRC funcionar sozinho. A Vercel a chama pelo cron
 * declarado em `vercel.json`, e cada chamada faz uma volta completa:
 *
 *   1. sincroniza o Dental Office  → fatos novos viram eventos
 *   2. processa eventos pendentes  → oportunidades e jornadas nascem
 *   3. avança as jornadas vencidas → mensagens saem, tarefas são criadas
 *   4. envia a cota do dia das campanhas
 *   5. na madrugada, varre a base  → recall, confirmação, cobrança, orçamento
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
  sincronizacao: unknown;
  eventos: unknown;
  campanhas: unknown;
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

/**
 * Traz o que mudou no Dental Office, ou explica por que não trouxe.
 *
 * TRÊS DECISÕES, e as três existem para a mesma coisa: a sincronização não pode
 * derrubar o resto do ciclo.
 *
 *   SEM CREDENCIAL NÃO É ERRO. Enquanto o Dental Office não liberar o acesso,
 *   isto devolve "não configurado" e o motor segue processando eventos e
 *   avançando jornadas. Tratar ausência de credencial como falha encheria o log
 *   de erro todo dia com algo que a gente já sabe.
 *
 *   PACIENTES ANTES DA AGENDA, sempre: um agendamento precisa do paciente para
 *   ter dono. Na ordem inversa, a primeira carga grava a agenda inteira órfã.
 *
 *   A FALHA É CAPTURADA AQUI. Se a API do Dental Office estiver fora, as
 *   jornadas que já estão em voo precisam continuar andando — elas não dependem
 *   dele. O cursor não avança e a próxima volta tenta de novo.
 */
async function sincronizar(
  organizationId: string,
  clinica: Record<string, unknown>,
): Promise<unknown> {
  const { criarClienteDentalOffice } = await import("@/lib/crc/integracoes/dental-office/cliente");

  const cliente = criarClienteDentalOffice({ organizationId });
  if (!cliente.ok) return { pulada: true, motivo: cliente.motivo, faltando: cliente.faltando };

  const { sincronizarAgendamentos, sincronizarDentistas, sincronizarPacientes } =
    await import("@/lib/crc/aplicacao/sincronizacao");

  const contexto = {
    organizationId,
    clinicId: String(clinica["id"] ?? ""),
    clinicaExternaId: String(clinica["external_id"] ?? ""),
    cliente: cliente.cliente,
  };

  try {
    const pacientes = await sincronizarPacientes(contexto);
    // Dentistas ANTES da agenda: é por eles que se pergunta o horário livre,
    // e uma oferta de agendamento com a lista vazia devolve "SEM_DENTISTA".
    await sincronizarDentistas(contexto);
    const agenda = await sincronizarAgendamentos(contexto);
    return { pacientes, agenda };
  } catch (erro) {
    const { descreverErro, registrar } = await import("@/lib/crc/servidor/registro");
    const detalhe = descreverErro(erro);
    registrar("erro", "Sincronização falhou no ciclo do motor.", { organizationId, detalhe });
    return { falhou: true, detalhe };
  }
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
            colunas: "id,organization_id,external_id",
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

          // A SINCRONIZAÇÃO VEM PRIMEIRO, e vem aqui.
          //
          // Antes disso ela só acontecia quando alguém clicava em "Sincronizar
          // agora" na tela de Integrações. O efeito era silencioso e grave: as
          // varreduras diárias liam o espelho da agenda, e um espelho que
          // ninguém atualiza faz a confirmação de amanhã olhar para a agenda de
          // semana passada. O sistema parecia vivo e estava trabalhando sobre
          // dados velhos.
          //
          // Rodar a cada volta é barato porque a sincronização é INCREMENTAL:
          // depois da primeira carga ela pede só o que mudou desde o cursor
          // guardado em `crc_sync_state`.
          const sincronizacao = await sincronizar(organizationId, clinica);

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

          // As campanhas saem DEPOIS das jornadas, e a ordem é deliberada: uma
          // jornada é sobre um fato que aconteceu com aquela pessoa hoje; uma
          // campanha é sobre um recorte da base. Quando o teto por hora aperta,
          // quem tem motivo individual passa primeiro.
          const { rodarCampanhas } = await import("@/lib/crc/aplicacao/campanhas");
          const campanhas = await rodarCampanhas({
            organizationId,
            porta: provedor.configurado ? provedor.porta : null,
            configuracao,
            enviosPausados:
              switches["kill_envios"] === true || switches["kill_automacoes"] === true,
          });

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
            sincronizacao,
            eventos,
            campanhas,
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
