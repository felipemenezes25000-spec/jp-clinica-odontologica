/**
 * A volta pesada — o trabalho de base, uma vez por dia.
 *
 * O PAR DO `pulso.ts`, e a divisão entre os dois é o desenho:
 *
 *   PULSO          eventos, turnos, jornadas vencidas. Tem gente esperando.
 *                  Roda a cada poucos minutos.
 *
 *   VOLTA PESADA   sincronizar o Dental Office, campanhas, varreduras,
 *                  recálculo de prioridade. Ninguém está esperando por elas
 *                  agora, e são caras. Roda uma vez por dia.
 *
 * ========================================================================
 *  O SEGUNDO DEFEITO QUE ESTE ARQUIVO CONSERTA: **uma clínica só.**
 *
 *  `/api/crc/motor` fazia, literalmente:
 *
 *      selecionarUm("crc_clinics", { filtros: [ativa = true],
 *                                    ordenar: [criado_em asc] })
 *
 *  Pegava a PRIMEIRA clínica ativa e trabalhava nela. Com uma organização,
 *  correto. Com duas, a segunda nunca tinha a agenda sincronizada, nunca
 *  recebia campanha e nunca era varrida — e o relatório do motor voltava
 *  verde, porque ele fez tudo o que se propôs a fazer: na clínica errada.
 *
 *  O laço aqui é o conserto. E ele é por CLÍNICA, não por organização, porque
 *  a sincronização é por clínica: cada uma tem o próprio `external_id` no
 *  Dental Office e o próprio cursor.
 * ========================================================================
 */
import { registrar } from "../servidor/registro";

export type ResultadoDaClinica = {
  organizationId: string;
  clinicId: string;
  sincronizacao: unknown;
  campanhas: unknown;
  varreduras: unknown[];
  /** Preenchido quando esta clínica falhou e as outras seguiram. */
  falhou?: string;
};

/**
 * Roda a volta pesada em todas as clínicas ativas.
 *
 * `varrerAgora` força as varreduras fora da janela da madrugada — é o que o
 * `?varrer=1` da rota usa para quem está investigando.
 */
export async function rodarVoltaPesada(opcoes: {
  varrerAgora?: boolean;
  agora?: Date;
}): Promise<ResultadoDaClinica[]> {
  const { selecionar } = await import("../servidor/banco");

  const clinicas = await selecionar("crc_clinics", {
    colunas: "id,organization_id,external_id",
    filtros: [{ coluna: "ativa", op: "eq", valor: true }],
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 200,
  });

  const agora = opcoes.agora ?? new Date();
  // 9h UTC ≈ 6h em São Paulo: as jornadas nascem antes do expediente e esperam
  // a abertura para falar com alguém.
  const naJanela = opcoes.varrerAgora === true || agora.getUTCHours() === 9;

  const resultados: ResultadoDaClinica[] = [];

  for (const clinica of clinicas) {
    const organizationId = String(clinica["organization_id"] ?? "");
    const clinicId = String(clinica["id"] ?? "");
    if (organizationId.length === 0 || clinicId.length === 0) continue;

    try {
      resultados.push(await umaClinica(organizationId, clinica, naJanela));
    } catch (erro) {
      /*
       * ENGOLE E SEGUE, igual ao pulso e pelo mesmo motivo: num SaaS, deixar o
       * erro subir seria a clínica com credencial vencida impedindo todas as
       * outras de sincronizar naquele dia. E a que quebra costuma ser a mais
       * nova — exatamente a que ninguém está olhando ainda.
       */
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      registrar("erro", "A volta pesada falhou numa clínica.", {
        organizationId,
        clinicId,
        detalhe,
      });
      resultados.push({
        organizationId,
        clinicId,
        sincronizacao: null,
        campanhas: null,
        varreduras: [],
        falhou: detalhe.slice(0, 300),
      });
    }
  }

  return resultados;
}

async function umaClinica(
  organizationId: string,
  clinica: Record<string, unknown>,
  naJanela: boolean,
): Promise<ResultadoDaClinica> {
  const { lerConfiguracao, lerKillSwitches } = await import("../servidor/configuracao");
  const { criarProvedorMensageria } = await import("../integracoes/whatsapp/provedores");

  const sincronizacao = await sincronizar(organizationId, clinica);

  const configuracao = await lerConfiguracao(organizationId);
  const switches = await lerKillSwitches(organizationId);
  const provedor = criarProvedorMensageria(organizationId);

  const { rodarCampanhas } = await import("../aplicacao/campanhas");
  const campanhas = await rodarCampanhas({
    organizationId,
    porta: provedor.configurado ? provedor.porta : null,
    configuracao,
    enviosPausados: switches["kill_envios"] === true || switches["kill_automacoes"] === true,
  });

  const varreduras: unknown[] = [];
  if (naJanela) {
    const { varrerAniversarios, varrerConfirmacoes, varrerRecall } = await import("./handlers");
    varreduras.push(await varrerRecall(organizationId, configuracao));
    varreduras.push(await varrerConfirmacoes(organizationId, configuracao));
    varreduras.push(await varrerAniversarios(organizationId, configuracao));

    const { varrerOrcamentosParados } = await import("../aplicacao/orcamentos");
    varreduras.push(await varrerOrcamentosParados(organizationId, configuracao));

    const { varrerCobrancas } = await import("../aplicacao/cobrancas");
    varreduras.push(await varrerCobrancas(organizationId));

    const { recalcularPrioridades } = await import("../aplicacao/oportunidades");
    const { detectarOportunidadesParadas } = await import("../aplicacao/tarefas");
    varreduras.push({ prioridadesRecalculadas: await recalcularPrioridades(organizationId) });
    varreduras.push({ oportunidadesParadas: await detectarOportunidadesParadas(organizationId) });
  }

  return {
    organizationId,
    clinicId: String(clinica["id"] ?? ""),
    sincronizacao,
    campanhas,
    varreduras,
  };
}

/**
 * Traz o que mudou no Dental Office, ou explica por que não trouxe.
 *
 * SEM CREDENCIAL NÃO É ERRO. Enquanto o Dental Office não liberar o acesso,
 * isto devolve "não configurado" e a volta segue. Tratar ausência de credencial
 * como falha encheria o log de erro todo dia com algo que já se sabe.
 *
 * PACIENTES ANTES DA AGENDA, e dentistas no meio: um agendamento precisa do
 * paciente para existir, e uma oferta de horário com a lista de dentistas vazia
 * devolve "SEM_DENTISTA".
 */
async function sincronizar(
  organizationId: string,
  clinica: Record<string, unknown>,
): Promise<unknown> {
  const { criarClienteDentalOffice } = await import("../integracoes/dental-office/cliente");
  const cliente = criarClienteDentalOffice({ organizationId });

  if (!cliente.ok) return { pulada: true, motivo: cliente.motivo, faltando: cliente.faltando };

  const { sincronizarPacientes, sincronizarAgendamentos, sincronizarDentistas } =
    await import("../aplicacao/sincronizacao");

  const contexto = {
    organizationId,
    clinicId: String(clinica["id"] ?? ""),
    clinicaExternaId: String(clinica["external_id"] ?? ""),
    cliente: cliente.cliente,
  };

  try {
    const pacientes = await sincronizarPacientes(contexto);
    await sincronizarDentistas(contexto);
    const agenda = await sincronizarAgendamentos(contexto);
    return { pacientes, agenda };
  } catch (erro) {
    const { descreverErro } = await import("../servidor/registro");
    const detalhe = descreverErro(erro);
    registrar("erro", "Sincronização falhou na volta pesada.", { organizationId, detalhe });
    return { falhou: true, detalhe };
  }
}
