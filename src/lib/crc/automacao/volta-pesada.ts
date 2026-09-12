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
 *  DOIS ESCOPOS, E CONFUNDI-LOS CUSTA CARO.
 *
 *  Nem tudo aqui é por clínica, e a primeira versão deste arquivo tratava tudo
 *  como se fosse — iterava clínicas e, dentro do laço, rodava também o que é da
 *  organização inteira. Com três unidades:
 *
 *    PACIENTES sincronizados 3×. E pior que o desperdício: `listarPacientes`
 *    devolve a conta INTEIRA (não recebe clínica), e cada rodada regravava
 *    `clinic_id` com a clínica da vez. A base de pacientes MIGRAVA de unidade a
 *    cada volta, em silêncio.
 *
 *    CAMPANHAS disparadas 3×. A idempotência segura a maior parte do estrago,
 *    e não toda: o teto por hora é consumido três vezes mais rápido, e a
 *    cadência que alguém configurou deixa de valer.
 *
 *    VARREDURAS 3×, recálculo de prioridade 3×.
 *
 *  A separação abaixo é por pergunta: **isto é de um lugar, ou da empresa?**
 *
 *    POR ORGANIZAÇÃO   pacientes, campanhas, varreduras, prioridades
 *    POR CLÍNICA       dentistas e agenda — cada unidade tem os seus, com
 *                      `external_id` próprio e cursor próprio
 * ========================================================================
 */
import { registrar } from "../servidor/registro";

export type ResultadoDaOrganizacao = {
  organizationId: string;
  /** Uma entrada por clínica: só o que é local a ela. */
  clinicas: { clinicId: string; agenda: unknown; falhou?: string }[];
  pacientes: unknown;
  campanhas: unknown;
  varreduras: unknown[];
  falhou?: string;
};

/**
 * Roda a volta pesada em todas as organizações que têm clínica ativa.
 *
 * `varrerAgora` força as varreduras fora da janela da madrugada — é o que o
 * `?varrer=1` da rota usa para quem está investigando.
 */
export async function rodarVoltaPesada(opcoes: {
  varrerAgora?: boolean;
  agora?: Date;
}): Promise<ResultadoDaOrganizacao[]> {
  const { comBatimento, WORKER_MOTOR } = await import("../aplicacao/heartbeat");

  /*
   * A VOLTA PESADA TAMBEM BATE PONTO — e aqui o alarme util e de DIAS, nao de
   * minutos: ela roda uma vez ao dia. Sem registro, "o cron da Vercel parou" e
   * indistinguivel de "nao havia o que sincronizar", e o sintoma aparece
   * semanas depois como agenda desatualizada.
   */
  return await comBatimento(
    WORKER_MOTOR,
    () => umaVolta(opcoes),
    (r) => ({
      organizacoes: r.length,
      falhas: r.filter((o) => o.falhou !== undefined).length,
    }),
  );
}

async function umaVolta(opcoes: {
  varrerAgora?: boolean;
  agora?: Date;
}): Promise<ResultadoDaOrganizacao[]> {
  const { selecionar } = await import("../servidor/banco");

  const clinicas = await selecionar("crc_clinics", {
    colunas: "id,organization_id,external_id",
    filtros: [{ coluna: "ativa", op: "eq", valor: true }],
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 500,
  });

  // Agrupa por organização, preservando a ordem de criação: a primeira clínica
  // de cada organização é a que serve de referência quando um paciente não diz
  // a qual unidade pertence.
  const porOrganizacao = new Map<string, Record<string, unknown>[]>();
  for (const c of clinicas) {
    const org = String(c["organization_id"] ?? "");
    if (org.length === 0) continue;
    const lista = porOrganizacao.get(org) ?? [];
    lista.push(c);
    porOrganizacao.set(org, lista);
  }

  const agora = opcoes.agora ?? new Date();
  // 9h UTC ≈ 6h em São Paulo: as jornadas nascem antes do expediente e esperam
  // a abertura para falar com alguém.
  const naJanela = opcoes.varrerAgora === true || agora.getUTCHours() === 9;

  const resultados: ResultadoDaOrganizacao[] = [];

  for (const [organizationId, suas] of porOrganizacao) {
    try {
      resultados.push(await umaOrganizacao(organizationId, suas, naJanela));
    } catch (erro) {
      /*
       * ENGOLE E SEGUE. Num SaaS, deixar o erro subir seria a organização com
       * credencial vencida impedindo todas as outras de sincronizar naquele dia
       * — e a que quebra costuma ser a mais nova, exatamente a que ninguém está
       * olhando ainda.
       */
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      registrar("erro", "A volta pesada falhou numa organização.", { organizationId, detalhe });
      resultados.push({
        organizationId,
        clinicas: [],
        pacientes: null,
        campanhas: null,
        varreduras: [],
        falhou: detalhe.slice(0, 300),
      });
    }
  }

  return resultados;
}

async function umaOrganizacao(
  organizationId: string,
  clinicas: readonly Record<string, unknown>[],
  naJanela: boolean,
): Promise<ResultadoDaOrganizacao> {
  const { lerConfiguracao, lerKillSwitches } = await import("../servidor/configuracao");
  const { criarProvedorMensageria } = await import("../integracoes/whatsapp/provedores");
  const { criarClienteDentalOffice } = await import("../integracoes/dental-office/cliente");

  const cliente = await criarClienteDentalOffice({ organizationId });
  const referencia = clinicas[0];

  /* --- o que é da organização: uma vez ---------------------------------- */

  let pacientes: unknown = { pulada: true, motivo: "Sem clínica de referência." };

  if (cliente.ok && referencia !== undefined) {
    /*
     * PACIENTES UMA VEZ SÓ, e com a clínica de referência no contexto.
     *
     * `listarPacientes` não recebe clínica — ela devolve a conta inteira. Quem
     * decide a unidade de cada paciente é `gravarPaciente`, pelo campo que o
     * próprio paciente traz. A clínica daqui é só o último recurso, para
     * paciente novo que não diz nada.
     */
    const { sincronizarPacientes, _limparCacheDeClinicas } =
      await import("../aplicacao/sincronizacao");
    _limparCacheDeClinicas();

    pacientes = await comCaptura(organizationId, "pacientes", () =>
      sincronizarPacientes({
        organizationId,
        clinicId: String(referencia["id"] ?? ""),
        clinicaExternaId: String(referencia["external_id"] ?? ""),
        cliente: cliente.cliente,
      }),
    );
  } else if (!cliente.ok) {
    pacientes = { pulada: true, motivo: cliente.motivo, faltando: cliente.faltando };
  }

  /* --- o que é de cada clínica ------------------------------------------ */

  const porClinica: ResultadoDaOrganizacao["clinicas"] = [];

  for (const c of clinicas) {
    const clinicId = String(c["id"] ?? "");
    if (clinicId.length === 0) continue;

    if (!cliente.ok) {
      porClinica.push({ clinicId, agenda: { pulada: true, motivo: cliente.motivo } });
      continue;
    }

    const ctx = {
      organizationId,
      clinicId,
      clinicaExternaId: String(c["external_id"] ?? ""),
      cliente: cliente.cliente,
    };

    try {
      const { sincronizarAgendamentos, sincronizarDentistas } =
        await import("../aplicacao/sincronizacao");

      // Dentistas ANTES da agenda: é por eles que se pergunta o horário livre,
      // e uma oferta com a lista vazia devolve "SEM_DENTISTA".
      await sincronizarDentistas(ctx);
      porClinica.push({ clinicId, agenda: await sincronizarAgendamentos(ctx) });
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro);
      registrar("erro", "A sincronização falhou numa clínica.", {
        organizationId,
        clinicId,
        detalhe,
      });
      porClinica.push({ clinicId, agenda: null, falhou: detalhe.slice(0, 300) });
    }
  }

  /* --- de novo o que é da organização ------------------------------------ */

  const configuracao = await lerConfiguracao(organizationId);
  const switches = await lerKillSwitches(organizationId);
  const provedor = await criarProvedorMensageria(organizationId);

  const { rodarCampanhas } = await import("../aplicacao/campanhas");
  const campanhas = await rodarCampanhas({
    organizationId,
    porta: provedor.configurado ? provedor.porta : null,
    configuracao,
    enviosPausados: switches["kill_envios"] === true || switches["kill_automacoes"] === true,
  });

  const varreduras: unknown[] = [];
  if (naJanela) {
    /*
     * ========================================================================
     *  CADA VARREDURA É INDEPENDENTE, e antes elas eram uma sequência.
     *
     *  Um `await` que lança aqui abortava TODAS as seguintes: recall quebrado
     *  significava nenhuma confirmação de consulta, nenhum aniversário, nenhum
     *  recálculo de prioridade e nenhuma faxina — naquele dia, naquela
     *  organização.
     *
     *  O risco deixou de ser teórico quando o recall passou a chamar uma RPC
     *  (`supabase/26`): entre o deploy do código e a aplicação do SQL à mão,
     *  existe uma janela em que a função não existe. A falha é legítima; levar
     *  seis rotinas saudáveis junto não é.
     *
     *  `comCaptura` transforma a exceção em resultado. O relatório da volta
     *  mostra `{ falhou: true, detalhe }` no lugar da varredura que caiu — e o
     *  que estava certo continua acontecendo.
     * ========================================================================
     */
    const { varrerAniversarios, varrerConfirmacoes, varrerRecall } = await import("./handlers");
    const { varrerOrcamentosParados } = await import("../aplicacao/orcamentos");
    const { varrerCobrancas } = await import("../aplicacao/cobrancas");
    const { recalcularPrioridades } = await import("../aplicacao/oportunidades");
    const { detectarOportunidadesParadas } = await import("../aplicacao/tarefas");

    varreduras.push(
      await comCaptura(organizationId, "recall", () => varrerRecall(organizationId, configuracao)),
      await comCaptura(organizationId, "confirmações", () =>
        varrerConfirmacoes(organizationId, configuracao),
      ),
      await comCaptura(organizationId, "aniversários", () =>
        varrerAniversarios(organizationId, configuracao),
      ),
      await comCaptura(organizationId, "orçamentos parados", () =>
        varrerOrcamentosParados(organizationId, configuracao),
      ),
      await comCaptura(organizationId, "cobranças", () => varrerCobrancas(organizationId)),
      await comCaptura(organizationId, "prioridades", async () => ({
        prioridadesRecalculadas: await recalcularPrioridades(organizationId),
      })),
      await comCaptura(organizationId, "oportunidades paradas", async () => ({
        oportunidadesParadas: await detectarOportunidadesParadas(organizationId),
      })),
      /*
       * A FAXINA, junto com as varreduras e pelo mesmo motivo: é trabalho de
       * manutenção, cara, e que ninguém está esperando. Ver `faxina()`.
       */
      await faxina(),
    );
  }

  return { organizationId, clinicas: porClinica, pacientes, campanhas, varreduras };
}

/** Roda algo e transforma a exceção em resultado, sem derrubar a volta. */
async function comCaptura<T>(
  organizationId: string,
  o_que: string,
  fn: () => Promise<T>,
): Promise<T | { falhou: true; detalhe: string }> {
  try {
    return await fn();
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    registrar("erro", `A sincronização de ${o_que} falhou.`, { organizationId, detalhe });
    return { falhou: true, detalhe };
  }
}

/* -------------------------------------------------------------------------- */
/* Faxina                                                                     */
/* -------------------------------------------------------------------------- */

export type ResultadoDaFaxina = {
  webhooksApagados: number;
  jobsApagados: number;
  runsFechadas: number;
};

/**
 * A limpeza periódica das filas.
 *
 * ========================================================================
 *  AS FUNÇÕES DE LIMPEZA EXISTIAM, ERAM TESTADAS, E NINGUÉM AS CHAMAVA.
 *
 *  `crc_limpar_webhooks_antigos`, `limparConcluidos` e
 *  `crc_fechar_ai_runs_abandonadas` estavam escritas e cobertas por teste — e
 *  sem chamador no runtime. Uma função de limpeza que nunca roda é pior do que
 *  não existir: ela dá a impressão de que a retenção está resolvida.
 *
 *  O QUE ISSO ACUMULA, e é o motivo de a faxina ser aqui e não "quando alguém
 *  lembrar": um envelope de webhook que esgota as tentativas fica `FALHOU` com
 *  o payload normalizado dentro — telefone e texto da mensagem do paciente. A
 *  limpeza de retenção só olhava `PROCESSADO`. Ou seja, o caso de FALHA, que é
 *  justamente o que ninguém revisita, guardava PII para sempre.
 * ========================================================================
 *
 * NUNCA LANÇA. Faxina é higiene: ela não pode impedir a volta de acontecer.
 */
export async function faxina(dias = 30): Promise<ResultadoDaFaxina> {
  const r: ResultadoDaFaxina = { webhooksApagados: 0, jobsApagados: 0, runsFechadas: 0 };

  try {
    const { rpc } = await import("../servidor/banco");
    const linhas = await rpc("crc_limpar_webhooks_antigos", { p_dias: dias });
    const n = linhas[0];
    r.webhooksApagados = n === undefined ? 0 : Number(Object.values(n)[0] ?? 0);
  } catch {
    // Segue: cada passo é independente.
  }

  try {
    const { limparConcluidos } = await import("../aplicacao/agent-jobs");
    const antes = new Date(Date.now() - dias * 86_400_000);
    await limparConcluidos(antes);
  } catch {
    // idem
  }

  try {
    const { fecharRunsAbandonadas } = await import("../aplicacao/agent-jobs");
    r.runsFechadas = await fecharRunsAbandonadas();
  } catch {
    // idem
  }

  return r;
}
