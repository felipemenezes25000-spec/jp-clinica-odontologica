/**
 * A sincronização com o Dental Office — Milestone 1, itens 14 a 18.
 *
 * O QUE ELA GARANTE, E POR QUÊ CADA UMA IMPORTA:
 *
 *   Pagina até o fim (item 15). Parar na página 1 deixaria pacientes fora do
 *   CRC, e a operação nunca saberia quais.
 *
 *   Falha individual não cancela o lote (item 16). Um paciente com data
 *   malformada entre 5.000 vai para `crc_sync_falhas` com o external_id, e os
 *   outros 4.999 entram.
 *
 *   É idempotente (item 13). Rodar duas vezes seguidas produz o mesmo estado —
 *   garantido por constraint no banco, não por cuidado do código.
 *
 *   Detecta a MUDANÇA, não o estado. `appointment.missed` é emitido quando o
 *   agendamento PASSA para MISSED. Sem isso, todo sync emitiria evento para
 *   toda falta histórica da base — e a primeira sincronização mandaria
 *   mensagem para pacientes que faltaram há três anos.
 *
 * O ÚLTIMO PONTO É O MAIS IMPORTANTE DO ARQUIVO. Ele é o que separa "o sistema
 * entrou no ar" de "o sistema entrou no ar e disparou 4.000 mensagens".
 */
import type { StatusAgendamento } from "../dominio/tipos";
import type { PortaDentalOffice } from "../integracoes/dental-office/cliente";
import type { AgendamentoExterno, PacienteExterno } from "../integracoes/dental-office/mapeadores";
import {
  atualizar,
  gravar,
  inserir,
  selecionar,
  selecionarUm,
  type Filtro,
  type Linha,
} from "../servidor/banco";
import { descreverErro, registrar } from "../servidor/registro";

import { emitir } from "./eventos";
import { calcularJanelaDeConsultas, linhaParaPaciente } from "./repositorios";

export type ResumoSync = {
  syncJobId: string;
  recurso: string;
  paginas: number;
  processados: number;
  criados: number;
  atualizados: number;
  falhados: number;
  eventosEmitidos: number;
  duracaoMs: number;
  erro: string | null;
};

export type ContextoSync = {
  organizationId: string;
  clinicId: string;
  clinicaExternaId: string;
  cliente: PortaDentalOffice;
  requestId?: string;
  /** Teto de páginas. Rede de segurança contra API que nunca diz "acabou". */
  maxPaginas?: number;
  tamanhoPagina?: number;
};

const TAMANHO_PAGINA_PADRAO = 100;
const MAX_PAGINAS_PADRAO = 200;

/* -------------------------------------------------------------------------- */
/* Diário de sincronização                                                    */
/* -------------------------------------------------------------------------- */

async function abrirSyncJob(
  ctx: ContextoSync,
  recurso: string,
  modo: "FULL" | "INCREMENTAL",
  cursorInicial: string | null,
): Promise<string> {
  const linhas = await inserir("crc_sync_jobs", {
    organization_id: ctx.organizationId,
    clinic_id: ctx.clinicId,
    recurso,
    modo,
    status: "RODANDO",
    cursor_inicial: cursorInicial,
  });
  return String(linhas[0]?.["id"] ?? "");
}

async function fecharSyncJob(
  organizationId: string,
  id: string,
  resumo: Omit<ResumoSync, "syncJobId">,
): Promise<void> {
  await atualizar(
    "crc_sync_jobs",
    [
      { coluna: "id", op: "eq", valor: id },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      status: resumo.erro === null ? "CONCLUIDO" : "FALHOU",
      paginas: resumo.paginas,
      processados: resumo.processados,
      criados: resumo.criados,
      atualizados: resumo.atualizados,
      falhados: resumo.falhados,
      ultimo_erro: resumo.erro,
      terminado_em: new Date().toISOString(),
    },
  );
}

async function registrarFalhaIndividual(
  syncJobId: string,
  externalId: string | null,
  erro: string,
): Promise<void> {
  await inserir("crc_sync_falhas", {
    sync_job_id: syncJobId,
    external_id: externalId,
    erro: erro.slice(0, 1000),
  });
}

/** O cursor entre execuções: até onde chegamos da última vez que deu certo. */
/**
 * O cursor DESTA clínica, para este recurso.
 *
 * ========================================================================
 *  O `clinicId` NÃO É DETALHE — é o conserto de um P0 que o `supabase/23`
 *  criou e o `24` terminou.
 *
 *  A chave era `(organization_id, recurso)`. Com duas unidades da mesma
 *  organização, as duas dividiam o cursor de `agendamentos`: a primeira a
 *  sincronizar o avançava, e a segunda pedia "o que mudou desde então" e
 *  recebia vazio. **A agenda da segunda unidade parava de atualizar, sem erro
 *  nenhum** — o pior tipo de falha, porque o relatório volta verde.
 *
 *  E a leitura sem clínica é metade do estrago: ela devolveria o cursor da
 *  unidade errada, fazendo a sincronização pular o período que a outra já
 *  tinha coberto.
 * ========================================================================
 */
async function lerCursor(
  organizationId: string,
  clinicId: string,
  recurso: string,
): Promise<string | null> {
  const linha = await selecionarUm("crc_sync_state", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "clinic_id", op: "eq", valor: clinicId },
      { coluna: "recurso", op: "eq", valor: recurso },
    ],
  });
  const cursor = linha?.["cursor"];
  return typeof cursor === "string" && cursor.length > 0 ? cursor : null;
}

async function gravarCursor(
  organizationId: string,
  clinicId: string,
  recurso: string,
  cursor: string | null,
  sucesso: boolean,
): Promise<void> {
  const agora = new Date().toISOString();
  await gravar(
    "crc_sync_state",
    {
      organization_id: organizationId,
      clinic_id: clinicId,
      recurso,
      // Cursor só avança quando a execução INTEIRA deu certo. Avançar depois de
      // uma falha parcial pularia justamente os registros que não entraram.
      ...(sucesso ? { cursor } : {}),
      last_sync_at: agora,
      ...(sucesso ? { last_successful_sync: agora } : {}),
      sync_status: sucesso ? "OK" : "FALHOU",
    },
    /*
     * O ALVO DO CONFLITO TEM QUE BATER COM A CHAVE DO BANCO, e foi aqui que o
     * `supabase/23` quebrou: ele trocou a PK e este texto continuou
     * `"organization_id,recurso"`. O Postgres responde
     * "there is no unique or exclusion constraint matching the ON CONFLICT
     * specification" — e a sincronização inteira morre na primeira gravação.
     */
    "organization_id,recurso,clinic_id",
  );
}

/* -------------------------------------------------------------------------- */
/* Pacientes                                                                  */
/* -------------------------------------------------------------------------- */

export async function sincronizarPacientes(ctx: ContextoSync): Promise<ResumoSync> {
  const comecou = Date.now();
  const recurso = "customers";
  const cursor = await lerCursor(ctx.organizationId, ctx.clinicId, recurso);
  const modo = cursor === null ? "FULL" : "INCREMENTAL";
  const syncJobId = await abrirSyncJob(ctx, recurso, modo, cursor);

  // Antes da primeira página: o paciente traz `specialty_ids` em número, e sem
  // esta tabela o CRC gravaria "4" onde deveria estar "Endodontia".
  await carregarEspecialidades(ctx);

  const tamanho = ctx.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO;
  const maxPaginas = ctx.maxPaginas ?? MAX_PAGINAS_PADRAO;

  let paginas = 0;
  let processados = 0;
  let criados = 0;
  let atualizados = 0;
  let falhados = 0;
  let erroFatal: string | null = null;

  try {
    let pagina: number | null = 1;

    while (pagina !== null && paginas < maxPaginas) {
      const lote = await ctx.cliente.listarPacientes({
        pagina,
        tamanho,
        ...(cursor !== null ? { atualizadosDesde: cursor } : {}),
      });
      paginas += 1;

      for (const falha of lote.falhas) {
        falhados += 1;
        await registrarFalhaIndividual(syncJobId, falha.externalId, falha.erro);
      }

      for (const externo of lote.itens) {
        processados += 1;
        try {
          const novo = await gravarPaciente(ctx, externo);
          if (novo) criados += 1;
          else atualizados += 1;
        } catch (erro) {
          // AQUI ESTÁ O ITEM 16. Um paciente que estoura não leva o lote junto.
          falhados += 1;
          await registrarFalhaIndividual(syncJobId, externo.externalId, descreverErro(erro));
        }
      }

      pagina = lote.proximaPagina;
    }

    if (paginas >= maxPaginas && pagina !== null) {
      // Não é erro, mas não pode ser silencioso: o cursor não avança e a
      // próxima execução continua de onde parou (item 271).
      erroFatal = `A sincronização parou no teto de ${String(maxPaginas)} páginas. Ela continua na próxima execução.`;
      registrar("aviso", erroFatal, { organizationId: ctx.organizationId, recurso });
    }
  } catch (erro) {
    erroFatal = descreverErro(erro);
    registrar("erro", "Sincronização de pacientes falhou.", {
      organizationId: ctx.organizationId,
      detalhe: erroFatal,
      ...(ctx.requestId !== undefined ? { requestId: ctx.requestId } : {}),
    });
  }

  const resumo = {
    recurso,
    paginas,
    processados,
    criados,
    atualizados,
    falhados,
    eventosEmitidos: 0,
    duracaoMs: Date.now() - comecou,
    erro: erroFatal,
  };

  await fecharSyncJob(ctx.organizationId, syncJobId, resumo);
  await gravarCursor(
    ctx.organizationId,
    ctx.clinicId,
    recurso,
    new Date().toISOString(),
    erroFatal === null,
  );

  return { syncJobId, ...resumo };
}

/**
 * O id interno da clínica, a partir do id que o Dental Office usa.
 *
 * DEVOLVE `null` QUANDO NÃO SABE, e quem chama decide — não inventa a clínica da
 * rodada. A diferença importa: `null` significa "não tenho informação", e a
 * regra de cima usa a clínica JÁ GRAVADA nesse caso, que é mais confiável.
 *
 * O cache vive na rodada: são poucas clínicas e a mesma se repete em todas as
 * páginas de pacientes.
 */
const clinicasPorExternoId = new Map<string, string | null>();

async function resolverClinicaExterna(
  ctx: ContextoSync,
  externoId: string | null,
): Promise<string | null> {
  if (externoId === null || externoId.length === 0) return null;

  const chave = `${ctx.organizationId}:${externoId}`;
  const emCache = clinicasPorExternoId.get(chave);
  if (emCache !== undefined) return emCache;

  const linha = await selecionarUm("crc_clinics", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "external_id", op: "eq", valor: externoId },
    ],
  });

  const id = typeof linha?.["id"] === "string" ? linha["id"] : null;
  clinicasPorExternoId.set(chave, id);
  return id;
}

/** Só para teste: o cache acima é de módulo e atravessaria casos. */
export function _limparCacheDeClinicas(): void {
  clinicasPorExternoId.clear();
}

/**
 * Grava um paciente. Devolve `true` quando é novo.
 *
 * ITEM 234 (resolução de conflito) MORA AQUI. O Dental Office é a fonte da
 * verdade para nome, nascimento e situação; o CRC é dono de opt-out, tags e
 * arquivamento. Por isso o upsert lista os campos que sobrescreve, um a um, em
 * vez de mandar o objeto inteiro: mandar tudo apagaria o opt-out de um paciente
 * a cada sincronização, e ele voltaria a receber mensagem depois de ter pedido
 * para parar.
 */
async function gravarPaciente(ctx: ContextoSync, externo: PacienteExterno): Promise<boolean> {
  const existente = await selecionarUm("crc_patients", {
    colunas: "id,nome,situacao,ativo,telefone,clinic_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "external_source", op: "eq", valor: "dental_office" },
      { coluna: "external_id", op: "eq", valor: externo.externalId },
    ],
  });

  /*
   * ========================================================================
   *  O PACIENTE É DA ORGANIZAÇÃO, E A CLÍNICA É ONDE ELE FOI ATENDIDO.
   *
   *  Isto gravava `clinic_id: ctx.clinicId` sempre — a clínica da RODADA de
   *  sincronização, e não a do paciente. Como `listarPacientes` devolve a conta
   *  inteira (não recebe clínica) e a volta pesada chamava a sincronização uma
   *  vez por clínica, o efeito com três unidades era:
   *
   *      sync da clínica A  →  TODOS os pacientes viram clínica A
   *      sync da clínica B  →  os MESMOS pacientes viram clínica B
   *      sync da clínica C  →  os MESMOS pacientes viram clínica C
   *
   *  O upsert acha o paciente por `(organização, origem, id externo)` — sem
   *  clínica —, então cada rodada MOVIA a base inteira de unidade. Ninguém
   *  percebia: o paciente continuava existindo, com os dados certos, no lugar
   *  errado.
   *
   *  A REGRA AGORA, em ordem de confiança:
   *
   *    1. a clínica que o PRÓPRIO paciente declara, quando a API manda;
   *    2. a que ele já tinha, quando não manda — o que já está gravado é mais
   *       confiável que o palpite da rodada atual;
   *    3. a clínica da rodada, só para paciente NOVO sem informação nenhuma.
   *
   *  A regra 2 é a que impede o vaivém: sem ela, a segunda unidade a
   *  sincronizar continuaria levando a base junto.
   * ========================================================================
   */
  const clinicaDoPaciente =
    (await resolverClinicaExterna(ctx, externo.clinicaExternaId)) ??
    (typeof existente?.["clinic_id"] === "string" ? existente["clinic_id"] : null) ??
    ctx.clinicId;

  const campos: Linha = {
    organization_id: ctx.organizationId,
    clinic_id: clinicaDoPaciente,
    external_source: "dental_office",
    external_id: externo.externalId,
    nome: externo.nome,
    nascimento: externo.nascimento,
    genero: externo.genero,
    situacao: externo.situacao,
    especialidade: nomeDaEspecialidade(ctx, externo.especialidade),
    convenio: externo.convenio,
    ativo: externo.ativo,
    telefone: externo.telefone,
    telefone_bruto: externo.telefoneBruto,
    email: externo.email,
    sincronizado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };

  await gravar("crc_patients", campos, "organization_id,external_source,external_id");

  if (existente === null) {
    await emitir({
      organizationId: ctx.organizationId,
      clinicId: ctx.clinicId,
      tipo: "patient.created",
      entityType: "patient",
      payload: { externalId: externo.externalId, nome: externo.nome },
      fingerprint: `patient.created:${externo.externalId}`,
    });
    return true;
  }

  // Emite `patient.updated` só quando algo que IMPORTA mudou. Emitir a cada
  // sincronização encheria a tabela de eventos com ruído — e o item 156
  // (alert fatigue) vale também para o motor, não só para o usuário.
  const situacaoAntes = typeof existente["situacao"] === "string" ? existente["situacao"] : "";
  if (situacaoAntes !== externo.situacao) {
    await emitir({
      organizationId: ctx.organizationId,
      clinicId: ctx.clinicId,
      tipo: "patient.updated",
      entityType: "patient",
      entityId: String(existente["id"] ?? ""),
      payload: { de: situacaoAntes, para: externo.situacao, externalId: externo.externalId },
      // O fingerprint inclui a transição: mudar de EM_TRATAMENTO para ABANDONO
      // e voltar são dois fatos diferentes, e ambos precisam ser vistos.
      fingerprint: `patient.situacao:${externo.externalId}:${situacaoAntes}>${externo.situacao}`,
    });
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* Especialidades                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A tabela de especialidades da execução corrente.
 *
 * Vive no contexto da sincronização e não num cache global: uma sincronização
 * é uma unidade de trabalho, e carregar a tabela uma vez por execução é a
 * granularidade certa — cache global envelheceria sem ninguém notar, e uma
 * consulta por paciente consumiria a cota da API para traduzir uma palavra.
 */
const especialidadesDaExecucao = new WeakMap<ContextoSync, Map<string, string>>();

async function carregarEspecialidades(ctx: ContextoSync): Promise<void> {
  if (especialidadesDaExecucao.has(ctx)) return;
  try {
    especialidadesDaExecucao.set(ctx, await ctx.cliente.listarEspecialidades());
  } catch (erro) {
    // Falhar aqui não pode derrubar a sincronização de pacientes: sem a
    // tabela, a especialidade fica com o id, que é pior que o nome e melhor
    // que perder o paciente inteiro.
    registrar("aviso", "Não foi possível ler as especialidades; o id será mantido.", {
      organizationId: ctx.organizationId,
      detalhe: descreverErro(erro),
    });
    especialidadesDaExecucao.set(ctx, new Map());
  }
}

/**
 * Traduz o id para o nome, mantendo o id quando não conhece.
 *
 * Guardar o id cru é deliberado: ele ainda agrupa pacientes da mesma
 * especialidade, e no dia em que a tabela carregar a tradução acontece na
 * próxima sincronização sem migração nenhuma.
 */
function nomeDaEspecialidade(ctx: ContextoSync, valor: string | null): string | null {
  if (valor === null) return null;
  return especialidadesDaExecucao.get(ctx)?.get(valor) ?? valor;
}

/* -------------------------------------------------------------------------- */
/* Dentistas                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Traz a lista de dentistas da clínica.
 *
 * POR QUE ISSO PRECISA EXISTIR SEPARADO DA AGENDA
 * Porque a agenda do Dental Office é consultada POR DENTISTA: para perguntar
 * "que horários estão livres", é preciso já saber de quem. Até aqui o nome do
 * dentista existia só desnormalizado dentro de `crc_appointments` — bom para
 * mostrar na ficha, inútil para varrer disponibilidade, porque só conhece quem
 * já atendeu alguém.
 *
 * NÃO PAGINA, e é deliberado: uma clínica tem dezenas de dentistas, não
 * milhares. Paginar aqui seria maquinário para um caso que não acontece, e
 * `listarDentistas` da porta já devolve a lista inteira.
 *
 * NÃO EMITE EVENTO. Dentista entrando ou saindo não é fato sobre paciente, e
 * não abre oportunidade. A mudança aparece na próxima oferta de horário.
 */
export async function sincronizarDentistas(ctx: ContextoSync): Promise<ResumoSync> {
  const comecou = Date.now();
  const recurso = "dentists";
  const syncJobId = await abrirSyncJob(ctx, recurso, "FULL", null);

  let processados = 0;
  let criados = 0;
  let atualizados = 0;
  let falhados = 0;
  let erro: string | null = null;

  try {
    const externos = await ctx.cliente.listarDentistas(ctx.clinicaExternaId);
    const vistos = new Set<string>();

    for (const externo of externos) {
      processados += 1;
      vistos.add(externo.externalId);

      try {
        const existente = await selecionarUm("crc_dentists", {
          colunas: "id",
          filtros: [
            { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
            { coluna: "external_source", op: "eq", valor: "dental_office" },
            { coluna: "external_id", op: "eq", valor: externo.externalId },
          ],
        });

        await gravar(
          "crc_dentists",
          {
            organization_id: ctx.organizationId,
            clinic_id: ctx.clinicId,
            external_source: "dental_office",
            external_id: externo.externalId,
            nome: externo.nome,
            ativo: externo.ativo,
            sincronizado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString(),
          },
          "organization_id,external_source,external_id",
        );

        if (existente === null) criados += 1;
        else atualizados += 1;
      } catch (e) {
        falhados += 1;
        await registrarFalhaIndividual(syncJobId, externo.externalId, descreverErro(e));
      }
    }

    // Quem sumiu da lista é DESATIVADO, nunca apagado: as consultas passadas
    // apontam para ele, e apagar deixaria histórico órfão. Desativar tira a
    // agenda dele das ofertas e preserva o que já aconteceu.
    if (vistos.size > 0) {
      const nossos = await selecionar("crc_dentists", {
        colunas: "id,external_id,ativo",
        filtros: [
          { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
          { coluna: "clinic_id", op: "eq", valor: ctx.clinicId },
          { coluna: "ativo", op: "eq", valor: true },
        ],
        limite: 500,
      });
      for (const linha of nossos) {
        const id = String(linha["external_id"] ?? "");
        if (vistos.has(id)) continue;
        await atualizar(
          "crc_dentists",
          [
            { coluna: "id", op: "eq", valor: String(linha["id"] ?? "") },
            { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
          ],
          { ativo: false, atualizado_em: new Date().toISOString() },
        );
        atualizados += 1;
      }
    }
  } catch (e) {
    erro = descreverErro(e);
    registrar("erro", "Sincronização de dentistas falhou.", {
      organizationId: ctx.organizationId,
      detalhe: erro,
    });
  }

  const resumo = {
    recurso,
    paginas: 1,
    processados,
    criados,
    atualizados,
    falhados,
    eventosEmitidos: 0,
    duracaoMs: Date.now() - comecou,
    erro,
  };
  await fecharSyncJob(ctx.organizationId, syncJobId, resumo);
  return { syncJobId, ...resumo };
}

/* -------------------------------------------------------------------------- */
/* Agendamentos                                                               */
/* -------------------------------------------------------------------------- */

export type OpcoesSyncAgenda = {
  /** Dias para trás. O padrão cobre o fim de semana mais folga. */
  diasPassado?: number;
  /** Dias para frente. Precisa cobrir a antecedência da confirmação. */
  diasFuturo?: number;
};

export async function sincronizarAgendamentos(
  ctx: ContextoSync,
  opcoes: OpcoesSyncAgenda = {},
): Promise<ResumoSync> {
  const comecou = Date.now();
  const recurso = "schedules";
  const syncJobId = await abrirSyncJob(ctx, recurso, "INCREMENTAL", null);

  const diasPassado = opcoes.diasPassado ?? 10;
  const diasFuturo = opcoes.diasFuturo ?? 45;
  const agora = new Date();
  const de = new Date(agora.getTime() - diasPassado * 86400_000).toISOString();
  const ate = new Date(agora.getTime() + diasFuturo * 86400_000).toISOString();

  const tamanho = ctx.tamanhoPagina ?? TAMANHO_PAGINA_PADRAO;
  const maxPaginas = ctx.maxPaginas ?? MAX_PAGINAS_PADRAO;

  let paginas = 0;
  let processados = 0;
  let criados = 0;
  let atualizados = 0;
  let falhados = 0;
  let eventosEmitidos = 0;
  let erroFatal: string | null = null;

  /** Pacientes tocados nesta execução: só neles o espelho é recalculado. */
  const pacientesTocados = new Set<string>();

  try {
    let pagina: number | null = 1;

    while (pagina !== null && paginas < maxPaginas) {
      const lote = await ctx.cliente.listarAgendamentos({
        clinicaExternaId: ctx.clinicaExternaId,
        de,
        ate,
        pagina,
        tamanho,
      });
      paginas += 1;

      for (const falha of lote.falhas) {
        falhados += 1;
        await registrarFalhaIndividual(syncJobId, falha.externalId, falha.erro);
      }

      for (const externo of lote.itens) {
        processados += 1;
        try {
          const r = await gravarAgendamento(ctx, externo);
          if (r.criado) criados += 1;
          else atualizados += 1;
          eventosEmitidos += r.eventos;
          if (r.patientId !== null) pacientesTocados.add(r.patientId);
        } catch (erro) {
          falhados += 1;
          await registrarFalhaIndividual(syncJobId, externo.externalId, descreverErro(erro));
        }
      }

      pagina = lote.proximaPagina;
    }
  } catch (erro) {
    erroFatal = descreverErro(erro);
    registrar("erro", "Sincronização de agenda falhou.", {
      organizationId: ctx.organizationId,
      detalhe: erroFatal,
    });
  }

  // O espelho (`ultima_consulta_em` / `proxima_consulta_em`) é recalculado
  // DEPOIS de toda a agenda entrar. Fazer isso durante o laço leria uma agenda
  // pela metade e gravaria "sem consulta futura" para quem tem uma na página
  // seguinte — o que basta para disparar um recall indevido.
  for (const patientId of pacientesTocados) {
    try {
      await atualizarEspelhoDeConsultas(ctx.organizationId, patientId, agora);
    } catch (erro) {
      registrar("aviso", "Falha ao atualizar o espelho de consultas do paciente.", {
        organizationId: ctx.organizationId,
        patientId,
        detalhe: descreverErro(erro),
      });
    }
  }

  const resumo = {
    recurso,
    paginas,
    processados,
    criados,
    atualizados,
    falhados,
    eventosEmitidos,
    duracaoMs: Date.now() - comecou,
    erro: erroFatal,
  };

  await fecharSyncJob(ctx.organizationId, syncJobId, resumo);
  await gravarCursor(
    ctx.organizationId,
    ctx.clinicId,
    recurso,
    new Date().toISOString(),
    erroFatal === null,
  );

  return { syncJobId, ...resumo };
}

/**
 * Grava um agendamento e emite evento SÓ na transição de status.
 *
 * A comparação com o status anterior é o coração da coisa. Três cenários que
 * este código precisa acertar:
 *
 *   Primeira sincronização da base: o agendamento é NOVO e já vem MISSED.
 *   Emitir aqui mandaria mensagem para faltas de anos atrás. Por isso o evento
 *   de falta em registro novo só sai se a falta for RECENTE.
 *
 *   Sincronização de rotina: o agendamento existia como CONFIRMED e virou
 *   MISSED. É a transição de verdade — emite.
 *
 *   Sincronização repetida: já estava MISSED e continua MISSED. Não emite. E
 *   mesmo que emitisse, o fingerprint impediria o duplicado (item 26).
 */
async function gravarAgendamento(
  ctx: ContextoSync,
  externo: AgendamentoExterno,
): Promise<{ criado: boolean; eventos: number; patientId: string | null }> {
  const existente = await selecionarUm("crc_appointments", {
    colunas: "id,status,patient_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "external_source", op: "eq", valor: "dental_office" },
      { coluna: "external_id", op: "eq", valor: externo.externalId },
    ],
  });

  const patientId =
    externo.pacienteExternoId === null
      ? null
      : await idDoPacientePorExternalId(ctx.organizationId, externo.pacienteExternoId);

  await gravar(
    "crc_appointments",
    {
      organization_id: ctx.organizationId,
      clinic_id: ctx.clinicId,
      patient_id: patientId,
      external_source: "dental_office",
      external_id: externo.externalId,
      dentista_externo_id: externo.dentistaExternoId,
      dentista_nome: externo.dentistaNome,
      cadeira_externa_id: externo.cadeiraExternaId,
      inicio_em: externo.inicioEm,
      fim_em: externo.fimEm,
      descricao: externo.descricao,
      status: externo.status,
      status_externo: externo.statusExterno,
      sincronizado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
    },
    "organization_id,external_source,external_id",
  );

  const statusAntes =
    existente === null
      ? null
      : typeof existente["status"] === "string"
        ? (existente["status"] as StatusAgendamento)
        : null;

  const eventos = await emitirEventosDeAgenda(ctx, externo, statusAntes, patientId);

  return { criado: existente === null, eventos, patientId };
}

/**
 * Uma falta "recente" é a que ainda dá para recuperar.
 *
 * Sete dias é a janela escolhida: além disso, a conversa "você faltou" já soa
 * deslocada, e o caso é melhor tratado como recall. O número é generoso o
 * bastante para cobrir uma sincronização que ficou parada num fim de semana
 * prolongado.
 */
const JANELA_FALTA_RECUPERAVEL_MS = 7 * 86400_000;

async function emitirEventosDeAgenda(
  ctx: ContextoSync,
  externo: AgendamentoExterno,
  statusAntes: StatusAgendamento | null,
  patientId: string | null,
): Promise<number> {
  if (externo.status === statusAntes) return 0;

  const inicioMs = Date.parse(externo.inicioEm);
  const recente = Number.isFinite(inicioMs) && Date.now() - inicioMs <= JANELA_FALTA_RECUPERAVEL_MS;
  const primeiraVez = statusAntes === null;

  const base = {
    organizationId: ctx.organizationId,
    clinicId: ctx.clinicId,
    entityType: "appointment",
    payload: {
      externalId: externo.externalId,
      patientId,
      inicioEm: externo.inicioEm,
      statusAntes,
      dentistaExternoId: externo.dentistaExternoId,
    },
  } as const;

  const emitirSe = async (
    condicao: boolean,
    tipo: Parameters<typeof emitir>[0]["tipo"],
  ): Promise<number> => {
    if (!condicao) return 0;
    const evento = await emitir({
      ...base,
      tipo,
      fingerprint: `${tipo}:${externo.externalId}`,
      ocorridoEm: externo.inicioEm,
    });
    return evento === null ? 0 : 1;
  };

  switch (externo.status) {
    case "MISSED":
      // A trava contra a avalanche da primeira sincronização.
      return emitirSe(!primeiraVez || recente, "appointment.missed");
    case "CANCELLED":
      return emitirSe(!primeiraVez || recente, "appointment.cancelled");
    case "COMPLETED":
      return emitirSe(true, "appointment.completed");
    case "CONFIRMED":
      return emitirSe(!primeiraVez, "appointment.confirmed");
    case "TO_CONFIRM":
      return emitirSe(primeiraVez, "appointment.created");
    case "IN_PROGRESS":
      return 0;
    default: {
      const exaustivo: never = externo.status;
      void exaustivo;
      return 0;
    }
  }
}

async function idDoPacientePorExternalId(
  organizationId: string,
  externalId: string,
): Promise<string | null> {
  const linha = await selecionarUm("crc_patients", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "external_source", op: "eq", valor: "dental_office" },
      { coluna: "external_id", op: "eq", valor: externalId },
    ],
  });
  const id = linha?.["id"];
  return typeof id === "string" ? id : null;
}

/**
 * Recalcula o espelho de consultas do paciente.
 *
 * O espelho existe porque "quem não tem consulta futura" é a condição mais
 * consultada do sistema (ver o comentário no schema). Ele é derivado — nunca a
 * verdade — e por isso é sempre recalculado a partir de `crc_appointments`, e
 * nunca atualizado incrementalmente. Incremental erra assim que uma consulta é
 * cancelada fora da janela do sync.
 */
export async function atualizarEspelhoDeConsultas(
  organizationId: string,
  patientId: string,
  agora: Date,
): Promise<void> {
  const janela = await calcularJanelaDeConsultas(organizationId, patientId, agora);
  await atualizar(
    "crc_patients",
    [
      { coluna: "id", op: "eq", valor: patientId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      ultima_consulta_em: janela.ultimaEm,
      proxima_consulta_em: janela.proximaEm,
      atualizado_em: agora.toISOString(),
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Estado para a tela de integrações (itens 135, 136, 77)                     */
/* -------------------------------------------------------------------------- */

export type EstadoSincronizacao = {
  recurso: string;
  ultimaEm: string | null;
  ultimaComSucessoEm: string | null;
  status: string;
};

export async function lerEstadoDeSincronizacao(
  organizationId: string,
): Promise<EstadoSincronizacao[]> {
  const linhas = await selecionar("crc_sync_state", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
  });
  return linhas.map((l) => ({
    recurso: String(l["recurso"] ?? ""),
    ultimaEm: typeof l["last_sync_at"] === "string" ? l["last_sync_at"] : null,
    ultimaComSucessoEm:
      typeof l["last_successful_sync"] === "string" ? l["last_successful_sync"] : null,
    status: String(l["sync_status"] ?? "NUNCA"),
  }));
}

export async function listarHistoricoDeSync(organizationId: string, limite = 20): Promise<Linha[]> {
  return selecionar("crc_sync_jobs", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [{ coluna: "iniciado_em", ascendente: false }],
    limite,
  });
}

/**
 * Os pacientes que este sync tocou e que precisam de reavaliação de regra.
 *
 * Exportado porque o varredor diário (recall, aniversário) usa o mesmo filtro,
 * e duplicar a definição de "paciente contatável" em dois lugares é como as
 * duas se separam com o tempo.
 */
export function filtrosDePacienteContatavel(organizationId: string): Filtro[] {
  return [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "arquivado", op: "eq", valor: false },
    { coluna: "ativo", op: "eq", valor: true },
    { coluna: "opt_out_em", op: "is", valor: null },
    { coluna: "telefone", op: "not.is", valor: null },
  ];
}

export { linhaParaPaciente };
