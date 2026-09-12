/**
 * Os handlers de evento — item 27.
 *
 * Cada função aqui responde a UM tipo de evento e faz UMA coisa: transformar um
 * fato ("o paciente faltou") em trabalho ("existe uma oportunidade, e uma
 * jornada está cuidando dela"). É o elo que faltava entre o Milestone 1
 * (sincronização) e o Milestone 4 (automação), e é o que faz o fluxo do item 49
 * ir do começo ao fim.
 *
 * A ORDEM DENTRO DE CADA HANDLER É SEMPRE A MESMA, e não por acaso:
 *   1. conferir se ainda faz sentido (o mundo pode ter mudado desde o evento);
 *   2. criar/reaproveitar a oportunidade — ela é o registro permanente;
 *   3. inscrever na jornada — ela é o esforço, e pode falhar sem perder o item 2.
 *
 * Se a inscrição na jornada falhar, a oportunidade continua lá e aparece na
 * fila do dia de alguém. É a diferença entre "a automação não rodou" e "o
 * paciente foi esquecido".
 */
import { CONFIGURACAO_PADRAO, type ConfiguracaoCrc } from "../dominio/configuracao";
import type { ContextoAgendamento } from "../aplicacao/agendamento";
import { avaliarRecall, fazAniversarioHoje, temConsultaFutura } from "../dominio/regras";
import { partesLocais } from "../dominio/configuracao";
import type { EventoCrc, TipoOportunidade } from "../dominio/tipos";
import {
  criarOportunidade,
  encerrarPorConversao,
  registrarFunil,
} from "../aplicacao/oportunidades";
import { registrarHandler } from "../aplicacao/eventos";
import { linhaParaPaciente } from "../aplicacao/repositorios";
import { rpc, selecionar, selecionarUm, type Filtro, type Linha } from "../servidor/banco";
import { registrar } from "../servidor/registro";

import { carregarAutomacao, inscrever } from "./motor";

/* -------------------------------------------------------------------------- */
/* Apoio                                                                      */
/* -------------------------------------------------------------------------- */

async function pacienteDoEvento(
  evento: EventoCrc,
): Promise<ReturnType<typeof linhaParaPaciente> | null> {
  const patientId = evento.payload["patientId"];
  if (typeof patientId !== "string" || patientId.length === 0) return null;

  const linha = await selecionarUm("crc_patients", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: evento.organizationId },
      { coluna: "id", op: "eq", valor: patientId },
    ],
  });
  return linha === null ? null : linhaParaPaciente(linha);
}

/**
 * Cria a oportunidade e tenta inscrever na jornada.
 *
 * Reunido numa função porque os quatro handlers de recuperação fazem
 * exatamente isto, mudando só o tipo, a chave e a automação. Repetir seria
 * como as regras se desencontrariam — um handler ganhando uma verificação que
 * o outro não tem.
 */
async function abrirTrabalho(dados: {
  evento: EventoCrc;
  tipo: TipoOportunidade;
  motivo: string;
  chaveDedupe: string;
  automacaoChave: string;
  patientId: string;
  clinicId: string;
  agora: Date;
}): Promise<void> {
  const { evento } = dados;

  const resultado = await criarOportunidade({
    organizationId: evento.organizationId,
    clinicId: dados.clinicId,
    patientId: dados.patientId,
    tipo: dados.tipo,
    motivo: dados.motivo,
    chaveDedupe: dados.chaveDedupe,
    ator: "automacao",
  });

  const oportunidade = resultado.criada ? resultado.oportunidade : resultado.oportunidade;

  const automacao = await carregarAutomacao(evento.organizationId, dados.automacaoChave);
  if (automacao === null) {
    // Automação não instalada ainda: a oportunidade sozinha já garante que o
    // paciente apareça na fila de alguém.
    registrar("info", "Oportunidade criada sem jornada: automação não instalada.", {
      organizationId: evento.organizationId,
      automacao: dados.automacaoChave,
    });
    return;
  }

  await inscrever({
    organizationId: evento.organizationId,
    clinicId: dados.clinicId,
    automacao,
    patientId: dados.patientId,
    opportunityId: oportunidade?.id ?? null,
    eventId: evento.id,
    // A chave da jornada acompanha a da oportunidade: o mesmo fato produz uma
    // jornada, quantas vezes o evento for reprocessado (item 84).
    chaveDedupe: dados.chaveDedupe,
    contexto: { eventoTipo: evento.tipo, motivo: dados.motivo },
    agora: dados.agora,
  });
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                   */
/* -------------------------------------------------------------------------- */

/** Item 49 — o fluxo E2E do faltante começa aqui. */
export async function aoFaltar(evento: EventoCrc, agora = new Date()): Promise<void> {
  const paciente = await pacienteDoEvento(evento);
  if (paciente === null) return;

  // O mundo mudou desde o evento? O paciente pode ter remarcado entre a falta e
  // o processamento. Sem esta conferência, a jornada nasceria e sairia no
  // primeiro passo — barulho no log e uma oportunidade fantasma no funil.
  if (temConsultaFutura(paciente.proximaConsultaEm, agora)) return;
  if (paciente.optOutEm !== null || paciente.telefone === null) return;

  const externalId = String(evento.payload["externalId"] ?? evento.entityId ?? "");

  await abrirTrabalho({
    evento,
    tipo: "MISSED_APPOINTMENT",
    motivo: "Faltou à consulta e não tem outra marcada.",
    chaveDedupe: `MISSED_APPOINTMENT:${externalId}`,
    automacaoChave: "recuperacao_faltas",
    patientId: paciente.id,
    clinicId: paciente.clinicId,
    agora,
  });
}

export async function aoCancelar(evento: EventoCrc, agora = new Date()): Promise<void> {
  const paciente = await pacienteDoEvento(evento);
  if (paciente === null) return;
  if (temConsultaFutura(paciente.proximaConsultaEm, agora)) return;
  if (paciente.optOutEm !== null || paciente.telefone === null) return;

  const externalId = String(evento.payload["externalId"] ?? evento.entityId ?? "");

  await abrirTrabalho({
    evento,
    tipo: "CANCELLED_APPOINTMENT",
    motivo: "Cancelou a consulta e não remarcou.",
    chaveDedupe: `CANCELLED_APPOINTMENT:${externalId}`,
    automacaoChave: "cancelamento_reagendamento",
    patientId: paciente.id,
    clinicId: paciente.clinicId,
    agora,
  });
}

/**
 * Consulta concluída fecha o ciclo — e é aqui que a receita recuperada nasce.
 *
 * Item 62: "só marcar como recuperada quando houver causalidade razoável". A
 * causalidade aqui é concreta e verificável: existia uma oportunidade ABERTA de
 * recuperação para este paciente, ele compareceu, e a oportunidade fecha por
 * isso. Sem oportunidade aberta, é um atendimento normal — e não entra em
 * nenhuma métrica de recuperação.
 */
export async function aoConcluirConsulta(evento: EventoCrc): Promise<void> {
  const paciente = await pacienteDoEvento(evento);
  if (paciente === null) return;

  // O INSTANTE DA CONSULTA, e não o do processamento. A primeira sincronização
  // de uma base real emite uma conclusão para CADA consulta do histórico; sem
  // esta linha, todas elas chegariam depois das oportunidades recém-abertas e
  // fechariam o funil inteiro como "recuperado" — receita que ninguém
  // recuperou, no primeiro dia de uso.
  const quandoAconteceu =
    evento.ocorridoEm.length > 0 ? evento.ocorridoEm : new Date().toISOString();

  const abertasDeRecuperacao = await selecionar("crc_opportunities", {
    colunas: "id,tipo,potential_value,origem",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: evento.organizationId },
      { coluna: "patient_id", op: "eq", valor: paciente.id },
      { coluna: "fechada_em", op: "is", valor: null },
      // A causalidade do item 62: a oportunidade precisa ser ANTERIOR à consulta.
      { coluna: "criado_em", op: "lte", valor: quandoAconteceu },
      {
        coluna: "tipo",
        op: "in",
        valor: [
          "MISSED_APPOINTMENT",
          "CANCELLED_APPOINTMENT",
          "RECALL",
          "INACTIVE_PATIENT",
          "ABANDONED_TREATMENT",
          "BUDGET_RECOVERY",
        ],
      },
    ],
  });

  if (abertasDeRecuperacao.length === 0) return;

  for (const linha of abertasDeRecuperacao) {
    await registrarFunil(evento.organizationId, {
      clinicId: paciente.clinicId,
      patientId: paciente.id,
      opportunityId: String(linha["id"] ?? ""),
      etapa: "consulta_recuperada",
      origem: typeof linha["origem"] === "string" ? linha["origem"] : null,
      valor: typeof linha["potential_value"] === "string" ? linha["potential_value"] : null,
      chaveDedupe: `consulta_recuperada:${String(linha["id"] ?? "")}:${String(evento.payload["externalId"] ?? "")}`,
    });
  }

  await encerrarPorConversao(
    evento.organizationId,
    paciente.id,
    "O paciente compareceu à consulta.",
    undefined,
    quandoAconteceu,
  );
}

/**
 * O paciente agendou: as jornadas de recuperação param.
 *
 * As saídas do motor já cobrem isso na próxima volta do worker, mas esperar
 * significaria até um minuto de janela em que uma mensagem pode sair para quem
 * acabou de agendar. Encerrar aqui fecha essa janela.
 */
export async function aoCriarAgendamento(evento: EventoCrc): Promise<void> {
  const paciente = await pacienteDoEvento(evento);
  if (paciente === null) return;

  // SÓ CONSULTA FUTURA encerra a recuperação. Um agendamento antigo que a
  // primeira carga traz pela primeira vez é histórico, não é um paciente que
  // acabou de marcar — e fechar a oportunidade por causa dele apagaria
  // exatamente o trabalho que a carga inicial acabou de descobrir.
  const inicio = Date.parse(String(evento.payload["inicioEm"] ?? evento.ocorridoEm));
  if (!Number.isFinite(inicio) || inicio <= Date.now()) return;

  await encerrarPorConversao(
    evento.organizationId,
    paciente.id,
    "O paciente marcou uma nova consulta.",
  );
}

/** Situação virou ABANDONO no Dental Office. */
/**
 * Lead novo — a promessa de responder em segundos, e não no dia seguinte.
 *
 * POR QUE ISTO NÃO É UMA JORNADA COMO AS OUTRAS
 * Porque jornada é do PACIENTE: `inscrever` carrega a ficha e avalia as
 * condições sobre ela. Um lead que preencheu o formulário não tem ficha — ele
 * existe em `crc_leads` e ainda não é ninguém no Dental Office.
 *
 * A saída óbvia seria criar um paciente local para ele. Foi recusada: isso
 * bifurca a identidade com o Dental Office, e no dia em que a pessoa virar
 * paciente de verdade a clínica teria dois cadastros — exatamente o que a
 * sincronização passa o tempo todo evitando.
 *
 * Então o primeiro contato sai daqui, direto, e a SEQUÊNCIA fica com o humano:
 * a oportunidade já nasceu atribuída a alguém em `registrarLead`. É o que o
 * negócio precisa — quem responde primeiro fica com o paciente — sem inventar
 * um cadastro que ninguém pediu.
 *
 * O ENVIO PASSA PELA POLÍTICA, pelo telefone. Formulário preenchido de
 * madrugada não autoriza WhatsApp de madrugada, e um número que já pediu para
 * parar continua valendo mesmo tendo chegado por outro caminho.
 */
export async function aoCriarLead(evento: EventoCrc): Promise<void> {
  const leadId = String(evento.payload["leadId"] ?? "");
  if (leadId.length === 0) return;

  const linha = await selecionarUm("crc_leads", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: evento.organizationId },
      { coluna: "id", op: "eq", valor: leadId },
    ],
  });
  if (linha === null) return;

  const telefone = typeof linha["telefone"] === "string" ? linha["telefone"] : "";
  // Sem telefone não há primeira resposta automática. A oportunidade continua
  // na fila de quem foi designado — e-mail e ligação são com a pessoa.
  if (telefone.length === 0) return;

  const clinicId = typeof linha["clinic_id"] === "string" ? linha["clinic_id"] : null;
  if (clinicId === null) return;

  const { criarProvedorMensageria } = await import("../integracoes/whatsapp/provedores");
  // O lead já traz a unidade; responder por ela é o mesmo princípio do turno.
  const provedor = await criarProvedorMensageria(evento.organizationId, clinicId);
  if (!provedor.configurado) return;

  const { lerConfiguracao, lerKillSwitches } = await import("../servidor/configuracao");
  const [cfg, switches] = await Promise.all([
    lerConfiguracao(evento.organizationId),
    lerKillSwitches(evento.organizationId),
  ]);
  if (switches["kill_envios"] === true || switches["kill_automacoes"] === true) return;

  const { renderizarTemplate } = await import("./templates");
  const texto = await renderizarTemplate(
    evento.organizationId,
    "lead_primeiro_contato",
    {
      primeiroNome:
        String(linha["nome"] ?? "")
          .trim()
          .split(/\s+/u)[0] ?? "",
    },
    clinicId,
  );

  const { enviarMensagem } = await import("../aplicacao/mensagens");
  const envio = await enviarMensagem({
    organizationId: evento.organizationId,
    clinicId,
    patientId: null,
    telefone,
    texto,
    // Uma resposta automática por lead, para sempre: se o evento for
    // reprocessado, o índice único recusa a segunda.
    chaveDedupe: `lead:${leadId}:primeiro_contato`,
    remetente: "automacao",
    proativo: true,
    porta: provedor.porta,
    configuracao: cfg,
  });

  if (!envio.ok) {
    registrar("info", "Primeira resposta ao lead não saiu.", {
      organizationId: evento.organizationId,
      leadId,
      codigo: envio.codigo,
    });
  }
}

export async function aoMudarSituacao(evento: EventoCrc, agora = new Date()): Promise<void> {
  if (evento.payload["para"] !== "ABANDONO") return;

  const externalId = String(evento.payload["externalId"] ?? "");
  const linha = await selecionarUm("crc_patients", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: evento.organizationId },
      { coluna: "external_id", op: "eq", valor: externalId },
    ],
  });
  if (linha === null) return;

  const paciente = linhaParaPaciente(linha);
  if (paciente.optOutEm !== null || paciente.telefone === null) return;
  if (temConsultaFutura(paciente.proximaConsultaEm, agora)) return;

  await abrirTrabalho({
    evento,
    tipo: "ABANDONED_TREATMENT",
    motivo: "Tratamento marcado como abandonado.",
    chaveDedupe: `ABANDONED_TREATMENT:${externalId}`,
    automacaoChave: "reativacao_inativos",
    patientId: paciente.id,
    clinicId: paciente.clinicId,
    agora,
  });
}

/**
 * Resposta do paciente numa conversa de cobranca.
 *
 * ESTE HANDLER EXISTE POR CAUSA DE UM PROBLEMA DE TEMPO. O arquivo do
 * financeiro chega ao CRC com um ou dois dias de atraso, entao "ja paguei" e
 * frequentemente VERDADE — e continuar cobrando quem pagou e o erro que mais
 * destroi confianca. Esperar a proxima importacao para descobrir e tarde.
 *
 * O mesmo vale para "consigo parcelar?": o art. 42 do CDC nao permite insistir
 * com quem ja pediu para conversar.
 *
 * Nos dois casos a decisao e por REGRA, antes da IA, pelo mesmo motivo do
 * opt-out: o custo dos erros e assimetrico, e um padrao previsivel que erra
 * para o lado seguro vale mais aqui do que um modelo que acerta quase sempre.
 */
export async function aoResponderSobreCobranca(evento: EventoCrc): Promise<void> {
  const patientId = evento.payload["patientId"];
  const texto = evento.payload["texto"];
  if (typeof patientId !== "string" || typeof texto !== "string") return;

  const { reagirARespostaDeCobranca } = await import("../aplicacao/cobrancas");
  const reacao = await reagirARespostaDeCobranca(evento.organizationId, patientId, texto);

  if (reacao.tipo !== "nenhuma") {
    registrar("info", "Cobranca pausada pela resposta do paciente.", {
      organizationId: evento.organizationId,
      patientId,
      reacao: reacao.tipo,
      cobrancas: reacao.cobrancas,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Leitura da resposta e agendamento                                          */
/* -------------------------------------------------------------------------- */

/**
 * O paciente respondeu — entender e, quando couber, marcar.
 *
 * ESTE HANDLER É O ELO QUE FALTAVA. A classificação de conversa estava escrita
 * e testada, e nada a chamava; a camada de agendamento existia no adapter, e
 * nada a chamava. O sistema entendia intenção nenhuma e marcava consulta
 * nenhuma — apenas criava tarefa para um humano fazer as duas coisas na mão.
 *
 * A ORDEM DAS DECISÕES É A PRÓPRIA POLÍTICA DE SEGURANÇA:
 *
 *   1. CLASSIFICAR SEMPRE. Mesmo quando nada mais vai acontecer, o resumo e a
 *      temperatura alimentam a Inbox, e o escalonamento obrigatório (dor,
 *      reclamação, dúvida clínica) precisa rodar antes de qualquer automação.
 *
 *   2. AUTONOMIA "HUMANO" ENCERRA AQUI. A tarefa já foi criada lá dentro. Ir
 *      adiante seria a máquina agir exatamente onde ela mesma disse que não
 *      deveria.
 *
 *   3. OFERTA ABERTA VENCE INTENÇÃO NOVA. Se acabamos de oferecer horários, a
 *      resposta é quase certamente a escolha — e tratá-la como pedido novo
 *      geraria uma segunda oferta por cima da primeira.
 *
 *   4. SÓ ENTÃO, AGENDAR. E ainda assim atrás de duas flags desligadas por
 *      padrão.
 *
 * NADA AQUI LANÇA. Um erro na leitura automática não pode impedir a mensagem de
 * aparecer na Inbox — o evento já foi gravado, e a conversa é o que importa.
 */
export async function aoReceberMensagem(evento: EventoCrc): Promise<void> {
  const conversationId = evento.payload["conversationId"];
  const texto = evento.payload["texto"];
  if (typeof conversationId !== "string" || typeof texto !== "string") return;

  const { lerConfiguracao, lerFlags, lerKillSwitches } = await import("../servidor/configuracao");
  const [cfg, flags, interruptores] = await Promise.all([
    lerConfiguracao(evento.organizationId),
    lerFlags(evento.organizationId),
    lerKillSwitches(evento.organizationId),
  ]);

  // --- 1. Classificar ---
  //
  // Pelo gateway, na finalidade `classificacao`: é a chamada de maior VOLUME do
  // CRC — uma por mensagem recebida — e a que mais se beneficia de um modelo
  // pequeno. Também é a que mais precisa do teto de gasto, pelo mesmo motivo.
  const { portaParaFinalidade } = await import("../integracoes/ia/gateway");
  const provedor = await portaParaFinalidade(evento.organizationId, "classificacao");
  const { classificarConversa } = await import("../aplicacao/ia");

  const leitura = await classificarConversa(
    evento.organizationId,
    conversationId,
    provedor.configurado ? provedor.porta : null,
    cfg,
  );

  // `ok: false` já criou a tarefa humana lá dentro. A conversa segue na Inbox.
  if (!leitura.ok) return;

  // --- 2. Autonomia ---
  if (leitura.autonomia === "HUMANO") return;
  if (interruptores["kill_ia_auto"] === true || interruptores["kill_automacoes"] === true) return;

  // A LINHA QUE SEPARA "a IA lê" DE "a IA fala".
  //
  // Tudo acima já aconteceu e continua acontecendo com o autopilot desligado:
  // a conversa foi classificada, o resumo e a temperatura estão na Inbox, e o
  // escalonamento obrigatório já criou tarefa se era o caso. É o nível 1–2 do
  // Autopilot — recomendar e criar tarefa.
  //
  // Daqui para baixo a máquina ESCREVE para o paciente e pode gravar consulta
  // no Dental Office. A trava vem antes de aceitar horário, e não só antes de
  // oferecer: aceitar é a ação mais forte do fluxo, e deixá-la passar seria
  // trancar a porta da frente e esquecer a dos fundos.
  if (flags["ai_autopilot"] !== true) return;

  const contexto = await contextoDeAgendamento(evento, conversationId, cfg, flags, interruptores);
  if (contexto === null) return;

  const { aceitarHorario, oferecerHorarios } = await import("../aplicacao/agendamento");

  // --- 3. Oferta aberta: a resposta provavelmente é a escolha ---
  const aceite = await aceitarHorario(contexto, { conversationId, texto });
  if (aceite.ok) {
    await responderNaConversa(evento, contexto, conversationId, "agendamento_confirmado", {
      quando: aceite.opcao.rotulo,
    });
    return;
  }

  // Escolha ambígua ou horário que sumiu: os dois pedem outra oferta, e não
  // silêncio. "SEM_OFERTA" é o caso normal de quem não estava escolhendo nada.
  const precisaReoferecer = aceite.codigo === "SLOT_SUMIU" || aceite.codigo === "ESCOLHA_AMBIGUA";
  const querAgendar =
    leitura.classificacao.intencao === "AGENDAR" || leitura.classificacao.intencao === "REMARCAR";

  if (!precisaReoferecer && !querAgendar) return;

  // --- 4. Agendar ---
  if (flags["auto_scheduling"] !== true) return;

  const patientId = evento.payload["patientId"];
  if (typeof patientId !== "string" || patientId.length === 0) return;

  const oferta = await oferecerHorarios(contexto, { conversationId, patientId });

  if (oferta.ok) {
    await responderNaConversa(evento, contexto, conversationId, "agendamento_oferta", {
      opcoes: oferta.opcoes.map((o) => o.rotulo).join(", "),
    });
    return;
  }

  // "JA_TEM_CONSULTA" e "OFERTA_ABERTA" não são problema: são o sistema
  // funcionando. Só a ausência real de horário merece aviso ao paciente.
  if (oferta.codigo === "SEM_SLOT" || oferta.codigo === "SEM_DENTISTA") {
    await responderNaConversa(evento, contexto, conversationId, "agendamento_sem_horario", {});
    const { criarTarefa } = await import("../aplicacao/tarefas");
    await criarTarefa({
      organizationId: evento.organizationId,
      clinicId: contexto.clinicId,
      patientId,
      titulo: "Achar horário para paciente que pediu agendamento",
      tipo: "LIGAR",
      prazoHoras: 4,
      prioridade: 15,
      motivo: oferta.motivo,
      chaveDedupe: `sem_horario:${conversationId}`,
      ator: "ia",
    });
  }
}

/**
 * Monta o contexto de agendamento, ou devolve `null` quando não dá.
 *
 * Devolve `null` em silêncio de propósito: sem credencial do Dental Office não
 * existe agenda para consultar, e isso é o estado NORMAL antes da integração
 * ser ligada. Logar erro a cada mensagem recebida encheria o diário de um fato
 * que já está visível no painel de integrações.
 */
async function contextoDeAgendamento(
  evento: EventoCrc,
  conversationId: string,
  cfg: ConfiguracaoCrc,
  flags: Readonly<Record<string, boolean>>,
  interruptores: Readonly<Record<string, boolean>>,
): Promise<ContextoAgendamento | null> {
  return contextoDeAgendamentoParaJob(
    evento.organizationId,
    conversationId,
    cfg,
    flags,
    interruptores,
  );
}

/**
 * O contexto de agendamento do turno — Fase B.
 *
 * ========================================================================
 *  A CLÍNICA VEM DA CONVERSA, e antes vinha de `selecionarUm(ativa = true)`.
 *
 *  A versão anterior recebia `conversationId` e o ignorava, com um comentário
 *  que assumia isso — "hoje não usa, e é honesto dizer". Honesto e errado: o
 *  parâmetro não estava sobrando, estava FALTANDO ser usado.
 *
 *      organização com Clínica A e Clínica B
 *        ↓  paciente escreve no número da B
 *        ↓  o webhook roteia certo — conversa com clinic_id = B
 *        ↓  o agente resolve oferecer horário
 *        ↓  este contexto devolve a A
 *      horário da A oferecido, agendamento GRAVADO na A
 *
 *  Consertar o roteamento de entrada (`supabase/23`) e deixar o de saída
 *  escolhendo pela ordem de cadastro é ter meia fronteira. Ver
 *  `clinicaDaConversa`.
 * ========================================================================
 *
 * A ORDEM DAS DUAS CHECAGENS IMPORTA: a clínica PRIMEIRO, o cliente depois. É a
 * clínica que decide qual credencial do Dental Office usar — perguntar pelo
 * cliente antes seria montar a conexão sem saber de quem ela é.
 *
 * `null` EM SILÊNCIO continua sendo o normal para "sem credencial": é o estado
 * de toda instalação antes de a integração ser ligada, e logar erro a cada
 * mensagem recebida encheria o diário de um fato já visível no painel.
 */
export async function contextoDeAgendamentoParaJob(
  organizationId: string,
  conversationId: string,
  cfg: ConfiguracaoCrc,
  flags: Readonly<Record<string, boolean>>,
  interruptores: Readonly<Record<string, boolean>>,
): Promise<ContextoAgendamento | null> {
  const { clinicaDaConversa } = await import("../aplicacao/conversas");
  const clinica = await clinicaDaConversa(organizationId, conversationId);

  /*
   * FALHA FECHADO, E COM REGISTRO — ao contrário do caso "sem credencial".
   *
   * Sem credencial é estado esperado. Uma conversa cuja clínica não dá para
   * determinar é anomalia: conversa de outro tenant, unidade desativada, ou
   * chamada sem conversa. Cair calado aqui faria o agente parar de agendar sem
   * ninguém saber por quê.
   */
  if (clinica === null) {
    registrar("aviso", "Agendamento recusado: não dá para dizer de qual clínica é a conversa.", {
      organizationId,
      conversationId,
    });
    return null;
  }

  const { criarClienteDentalOffice } = await import("../integracoes/dental-office/cliente");
  const cliente = await criarClienteDentalOffice({
    organizationId,
    clinicId: clinica.clinicId,
  });
  if (!cliente.ok) return null;

  return {
    organizationId,
    clinicId: clinica.clinicId,
    clinicaExternaId: clinica.clinicaExternaId,
    cliente: cliente.cliente,
    configuracao: cfg,
    flags,
    interruptores,
    agora: new Date(),
  };
}

/**
 * Responde dentro da conversa.
 *
 * `proativo: false` porque o paciente ACABOU de escrever. Aplicar horário
 * comercial aqui deixaria alguém falando sozinho às 19h05 — e a política existe
 * para não incomodar quem está em silêncio, não para calar quem perguntou.
 */
async function responderNaConversa(
  evento: EventoCrc,
  contexto: ContextoAgendamento,
  conversationId: string,
  template: string,
  variaveis: Record<string, string>,
): Promise<void> {
  // Mesmo motivo do turno do agente: `crc_conversations.telefone` não existe, e
  // pedi-la fazia o PostgREST recusar a consulta inteira. Ver
  // `aplicacao/conversas.ts`.
  const { destinoDaConversa } = await import("../aplicacao/conversas");
  const destino = await destinoDaConversa(evento.organizationId, conversationId);
  if (destino === null) return;

  const telefone = destino.contato;

  const { criarProvedorMensageria } = await import("../integracoes/whatsapp/provedores");
  // Pelo número da unidade DA CONVERSA — a mesma que o contexto de agendamento
  // usou para consultar a agenda.
  const provedor = await criarProvedorMensageria(evento.organizationId, contexto.clinicId);
  if (!provedor.configurado) return;

  const patientId = destino.patientId;
  const nome = await primeiroNomeDoPaciente(evento.organizationId, patientId);

  const { renderizarTemplate } = await import("./templates");
  const texto = await renderizarTemplate(
    evento.organizationId,
    template,
    { primeiroNome: nome, ...variaveis },
    contexto.clinicId,
  );

  const { enviarMensagem } = await import("../aplicacao/mensagens");
  await enviarMensagem({
    organizationId: evento.organizationId,
    clinicId: contexto.clinicId,
    patientId,
    conversationId,
    telefone,
    texto,
    // A chave inclui o id do evento: duas mensagens do paciente merecem duas
    // respostas, mas o reprocessamento do MESMO evento não pode gerar a
    // segunda.
    chaveDedupe: `ia_resposta:${evento.id}:${template}`,
    remetente: "ia",
    proativo: false,
    porta: provedor.porta,
    configuracao: contexto.configuracao,
  });
}

async function primeiroNomeDoPaciente(
  organizationId: string,
  patientId: string | null,
): Promise<string> {
  if (patientId === null) return "";
  const linha = await selecionarUm("crc_patients", {
    colunas: "nome",
    filtros: [
      { coluna: "id", op: "eq", valor: patientId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  const nome = typeof linha?.["nome"] === "string" ? linha["nome"] : "";
  return nome.trim().split(/\s+/u)[0] ?? "";
}

/**
 * Registra todos os handlers.
 *
 * Chamado uma vez por invocação do worker/rota. Idempotente por construção
 * (`_limparHandlers` antes), porque numa instância reaproveitada da Vercel o
 * módulo já pode ter sido carregado — e registrar duas vezes faria cada evento
 * ser processado em dobro.
 */
let registrados = false;

export function instalarHandlers(): void {
  if (registrados) return;
  registrados = true;

  registrarHandler("appointment.missed", aoFaltar);
  registrarHandler("appointment.cancelled", aoCancelar);
  registrarHandler("appointment.completed", aoConcluirConsulta);
  registrarHandler("appointment.created", aoCriarAgendamento);
  registrarHandler("patient.updated", aoMudarSituacao);
  registrarHandler("message.received", aoResponderSobreCobranca);
  registrarHandler("message.received", aoReceberMensagem);
  registrarHandler("message.received", aoRodarTurnoDoAgente);
  registrarHandler("lead.created", aoCriarLead);
}

/* -------------------------------------------------------------------------- */
/* O turno do agente — Fatias 1 e 2 do CRC AI OS                              */
/* -------------------------------------------------------------------------- */

/**
 * Roda o agente sobre a mensagem que acabou de chegar.
 *
 * É UM HANDLER SEPARADO, e não mais um trecho dentro de `aoReceberMensagem`.
 * Os dois observam o mesmo evento e não se conhecem: a classificação continua
 * acontecendo com o agente desligado, e o agente falhando não impede a
 * classificação nem a jornada de agendamento. Acoplá-los economizaria uma
 * leitura de flag e custaria a independência — que é justamente o que permite
 * ligar um sem arriscar o outro.
 *
 * A ORDEM DAS TRAVAS, de fora para dentro:
 *
 *   `ai_agente_sombra`  o agente sequer pensa sem isto. Nasce desligada.
 *   kill switches       incidente desliga tudo, sem passar por flag.
 *   `ai_agente_envio`   separa "pensou e gravou" de "o paciente recebeu".
 *
 * Com só a primeira ligada, o sistema inteiro roda e nada sai — que é o
 * objetivo declarado da Fatia 1.
 */
export async function aoRodarTurnoDoAgente(evento: EventoCrc): Promise<void> {
  const conversationId = evento.payload["conversationId"];
  if (typeof conversationId !== "string") return;

  /*
   * ELE SÓ ENFILEIRA — Fase B.
   *
   * Antes, este handler rodava o turno INTEIRO: montava contexto, chamava o
   * modelo, esperava, aplicava portões e respondia. Numa função serverless isso
   * amarra o trabalho ao ciclo de vida da requisição — um deploy no meio, um
   * timeout, um 5xx do provedor, e o turno some sem registro de que faltou
   * responder alguém. Não havia retry porque não havia o que retomar.
   *
   * AS TRAVAS NÃO SÃO LIDAS AQUI, e isso é deliberado. Entre a mensagem chegar
   * e o worker rodar pode passar um minuto, e nesse minuto alguém pode desligar
   * o agente ou assumir a conversa. Quem lê a flag é quem vai agir — o worker —
   * senão o sistema agiria com uma decisão já revogada.
   *
   * O custo da escolha: a fila ganha jobs que serão descartados sem fazer nada.
   * É barato: uma linha, e o descarte é registrado com o motivo.
   */
  const { enfileirarTurno } = await import("../aplicacao/agent-jobs");
  const r = await enfileirarTurno({
    organizationId: evento.organizationId,
    conversationId,
    eventId: evento.id,
  });

  /*
   * FALHOU AO ENFILEIRAR: LANÇA, E O EVENTO VOLTA PARA A FILA.
   *
   * Este `throw` é o conserto de um turno que se perdia em silêncio. Antes, o
   * retorno era ignorado — e ignorar era a única opção honesta, porque o
   * retorno era um booleano em que "já existia" e "o banco caiu" tinham o mesmo
   * valor. O evento era marcado PROCESSADO, o job nunca nascia, e do outro lado
   * ficava um paciente que escreveu e nunca foi respondido. Nada na fila
   * indicava isso, porque a fila achava que tinha terminado.
   *
   * `processarEventos` devolve o evento para PENDENTE e repete com backoff;
   * esgotadas as tentativas, ele vai para a dead letter, onde uma pessoa vê.
   * Perder um turno deixou de ser silencioso.
   *
   * O PREÇO, e ele é real: os handlers de `message.received` que já rodaram
   * antes deste — a classificação, a cobrança, as jornadas — rodam de novo na
   * repescagem. É o contrato de entrega ao-menos-uma-vez que o sistema inteiro
   * assume, e é por isso que cada efeito desses handlers é idempotente por
   * constraint de banco, e não por verificação prévia. A alternativa — engolir o
   * erro para não repetir os outros — troca trabalho repetido e barato por um
   * paciente sem resposta.
   *
   * `duplicado` NÃO lança: o job já existe, que é exatamente o que se queria.
   */
  if (r.tipo === "erro") {
    throw new Error(`Não foi possível enfileirar o turno do agente: ${r.detalhe}`);
  }
}

/** Só para teste. */
export function _resetarInstalacao(): void {
  registrados = false;
}

/* -------------------------------------------------------------------------- */
/* Varredura diária (itens 52, 53)                                            */
/* -------------------------------------------------------------------------- */

export type ResultadoVarredura = {
  seletor: string;
  avaliados: number;
  elegiveis: number;
  inscritos: number;
};

const FILTROS_CONTATAVEL = (organizationId: string): Filtro[] => [
  { coluna: "organization_id", op: "eq", valor: organizationId },
  { coluna: "arquivado", op: "eq", valor: false },
  { coluna: "ativo", op: "eq", valor: true },
  { coluna: "opt_out_em", op: "is", valor: null },
  { coluna: "telefone", op: "not.is", valor: null },
];

/**
 * Recall e inatividade — item 52.
 *
 * ============================================================================
 *  A VARREDURA RELIA O COMECO DA BASE, TODO DIA, PARA SEMPRE.
 *
 *  A versao anterior era:
 *
 *      order by ultima_consulta_em asc  limit 200
 *
 *  sem cursor. E o comentario dizia, com todas as letras: "ela processa um lote
 *  por dia e converge". Nao convergia — ela processava O MESMO LOTE por dia.
 *
 *  As 200 linhas mais antigas continuam sendo as 200 mais antigas na execucao
 *  seguinte, porque quem nao respondeu ao recall nao mudou
 *  `ultima_consulta_em`. O dedupe por ciclo impede o efeito duplicado, e e por
 *  isso que o defeito e invisivel: nada acontece duas vezes, nada da erro, e o
 *  relatorio diz "avaliados: 200" todo dia.
 *
 *  O que acontece e que os pacientes 201 em diante NUNCA SAO AVALIADOS. Com
 *  8.000 pacientes, 97,5% da base fica fora do recall — e com 500, tudo
 *  funciona, que e o motivo de isso nunca ter aparecido.
 * ============================================================================
 *
 * O CURSOR E PERSISTIDO (`crc_scan_state`) porque a funcao e serverless: nao
 * existe "a proxima execucao lembra". Ele guarda `(ultima_consulta_em, id)` —
 * a data sozinha nao e unica, e numa base importada dezenas de pacientes
 * compartilham o mesmo instante.
 *
 * QUANDO A PAGINA VEM INCOMPLETA, O CICLO FECHOU: o cursor volta a nulo e
 * `ciclo` incrementa. E o que faz a varredura ser uma volta, e nao um prefixo.
 */
export async function varrerRecall(
  organizationId: string,
  cfg: ConfiguracaoCrc = CONFIGURACAO_PADRAO,
  limite = TAMANHO_DA_PAGINA_DE_RECALL,
  agora = new Date(),
  opcoes: { tetoPorVolta?: number; orcamentoMs?: number } = {},
): Promise<ResultadoVarredura> {
  const limiteRecall = new Date(agora.getTime() - cfg.recallDias * 86400_000).toISOString();

  const teto = opcoes.tetoPorVolta ?? TETO_DE_RECALL_POR_VOLTA;
  const orcamentoMs = opcoes.orcamentoMs ?? ORCAMENTO_DA_VARREDURA_MS;
  const comecou = Date.now();

  const automacaoRecall = await carregarAutomacao(organizationId, "recall_seis_meses");
  const automacaoReativacao = await carregarAutomacao(organizationId, "reativacao_inativos");

  let avaliados = 0;
  let elegiveis = 0;
  let inscritos = 0;

  /*
   * ========================================================================
   *  VARIAS PAGINAS POR VOLTA, ATE O TETO OU ATE O TEMPO.
   *
   *  Uma pagina de 200 por dia atravessa 8.000 pacientes em QUARENTA DIAS. O
   *  cursor consertou a convergencia — a varredura deixou de reler o comeco —,
   *  e sobrou a velocidade: um paciente que sumiu ha seis meses esperava mais
   *  um mes para ser notado.
   *
   *  O teto e por ITENS e por TEMPO, e os dois precisam existir. So por itens,
   *  uma base com handlers lentos estoura o tempo da funcao; so por tempo, uma
   *  base rapida dispararia milhares de jornadas numa volta e consumiria o teto
   *  de contato da clinica inteiro de madrugada.
   * ========================================================================
   */
  for (;;) {
    const cursor = await lerCursorDeVarredura(organizationId, "recall");

    const linhas = await rpc("crc_pagina_de_recall", {
      p_organization_id: organizationId,
      p_limite_data: limiteRecall,
      p_cursor_data: cursor.data,
      p_cursor_id: cursor.id,
      p_limite: limite,
    });

    const r = await processarPaginaDeRecall(
      organizationId,
      linhas,
      { recall: automacaoRecall, reativacao: automacaoReativacao },
      cfg,
      agora,
    );
    avaliados += linhas.length;
    elegiveis += r.elegiveis;
    inscritos += r.inscritos;

    /*
     * O CURSOR AVANCA DEPOIS DO TRABALHO, e a versao anterior avancava antes.
     *
     * Antes havia um motivo: com UMA pagina por volta, um lote que estourasse o
     * tempo seria relido para sempre. Com o laco, o corte acontece ENTRE
     * paginas — entao a pagina ou termina (e o cursor anda) ou a volta morre no
     * meio dela (e o cursor fica, e ela e relida).
     *
     * Reler e seguro: a chave de dedupe inclui o ciclo, entao a oportunidade
     * nao nasce duas vezes. Pular nao seria.
     */
    const ultima = linhas[linhas.length - 1];
    const fechou = linhas.length < limite || ultima === undefined;

    await gravarCursorDeVarredura(
      organizationId,
      "recall",
      fechou
        ? { data: null, id: null, fechouCiclo: true }
        : {
            data:
              typeof ultima["ultima_consulta_em"] === "string"
                ? ultima["ultima_consulta_em"]
                : null,
            id: typeof ultima["id"] === "string" ? ultima["id"] : null,
            fechouCiclo: false,
          },
    );

    // A VOLTA FECHOU: parar aqui, e nao recomecar o ciclo na mesma execucao.
    // Recomecar faria a varredura reprocessar a base inteira de novo, e o teto
    // por itens seria a unica coisa segurando.
    if (fechou) break;
    if (avaliados >= teto) break;
    if (Date.now() - comecou >= orcamentoMs) break;
  }

  return { seletor: "RECALL", avaliados, elegiveis, inscritos };
}

/** Quantos pacientes cabem numa pagina do recall. */
const TAMANHO_DA_PAGINA_DE_RECALL = 200;

/**
 * Quantos pacientes uma volta pesada avalia, no maximo.
 *
 * MIL E DUZENTOS ATRAVESSA 8.000 EM SETE DIAS — a janela que a operacao de
 * recuperacao precisa. Com os 200 de antes eram quarenta.
 *
 * O numero nao e magico e e o menor que resolve: subir mais aproxima o ciclo de
 * um dia e faz a volta disparar jornadas suficientes para consumir o teto de
 * contato da clinica de uma vez — e ai quem segura passa a ser a politica de
 * envio, na madrugada, sem ninguem decidir isso.
 */
const TETO_DE_RECALL_POR_VOLTA = 1200;

/**
 * Quanto tempo a varredura pode gastar antes de ceder a vez.
 *
 * CURTO EM RELACAO AO LIMITE DA PLATAFORMA de proposito. A volta pesada roda
 * varias varreduras em sequencia; se a primeira consumir o orcamento inteiro da
 * funcao, as outras nao rodam — e o sintoma seria "o aniversario parou", sem
 * relacao aparente com o recall.
 *
 * Ser cortado aqui nao custa nada: o cursor esta gravado, e a proxima volta
 * continua do mesmo ponto.
 */
const ORCAMENTO_DA_VARREDURA_MS = 20_000;

/** Uma pagina do recall, avaliada e inscrita. */
async function processarPaginaDeRecall(
  organizationId: string,
  linhas: readonly Linha[],
  automacoes: {
    recall: Awaited<ReturnType<typeof carregarAutomacao>>;
    reativacao: Awaited<ReturnType<typeof carregarAutomacao>>;
  },
  cfg: ConfiguracaoCrc,
  agora: Date,
): Promise<{ elegiveis: number; inscritos: number }> {
  const automacaoRecall = automacoes.recall;
  const automacaoReativacao = automacoes.reativacao;

  let elegiveis = 0;
  let inscritos = 0;

  for (const linha of linhas) {
    const paciente = linhaParaPaciente(linha);
    const veredicto = avaliarRecall(
      {
        ultimaConsultaEm: paciente.ultimaConsultaEm,
        proximaConsultaEm: paciente.proximaConsultaEm,
        ativo: paciente.ativo,
        arquivado: paciente.arquivado,
        optOutEm: paciente.optOutEm,
        telefone: paciente.telefone,
        situacao: paciente.situacao,
      },
      agora,
      cfg,
    );

    if (!veredicto.elegivel) continue;
    elegiveis += 1;

    // A chave inclui o CICLO, não a data exata: um paciente que continua sem
    // agendar não pode receber recall todo dia, mas deve poder receber de novo
    // no ciclo seguinte.
    const ciclo = Math.floor(veredicto.diasSemConsulta / cfg.recallDias);
    const chave = `${veredicto.tipo}:${paciente.id}:c${String(ciclo)}`;

    const resultado = await criarOportunidade({
      organizationId,
      clinicId: paciente.clinicId,
      patientId: paciente.id,
      tipo: veredicto.tipo,
      motivo:
        veredicto.tipo === "RECALL"
          ? `Sem consulta há ${String(veredicto.diasSemConsulta)} dias.`
          : `Paciente inativo há ${String(veredicto.diasSemConsulta)} dias.`,
      chaveDedupe: chave,
      ator: "automacao",
    });

    const automacao = veredicto.tipo === "RECALL" ? automacaoRecall : automacaoReativacao;
    if (automacao === null) continue;

    const inscricao = await inscrever({
      organizationId,
      clinicId: paciente.clinicId,
      automacao,
      patientId: paciente.id,
      opportunityId: resultado.oportunidade?.id ?? null,
      chaveDedupe: chave,
      contexto: { diasSemConsulta: veredicto.diasSemConsulta },
      agora,
    });
    if (inscricao.inscrito) inscritos += 1;
  }

  return { elegiveis, inscritos };
}

/**
 * As datas `MMDD` que contam como "hoje" para aniversario.
 *
 * Quase sempre uma so. Duas no dia 28 de fevereiro de ano comum, porque quem
 * nasceu em 29/02 e felicitado nesse dia — a convencao civil brasileira, ja
 * decidida e testada em `fazAniversarioHoje`.
 */
function datasDeAniversario(hoje: { mes: number; dia: number; ano: number }): number[] {
  const base = hoje.mes * 100 + hoje.dia;
  const bissexto = (hoje.ano % 4 === 0 && hoje.ano % 100 !== 0) || hoje.ano % 400 === 0;
  return hoje.mes === 2 && hoje.dia === 28 && !bissexto ? [base, 229] : [base];
}

/* -------------------------------------------------------------------------- */
/* O cursor das varreduras                                                    */
/* -------------------------------------------------------------------------- */

type CursorDeVarredura = { data: string | null; id: string | null };

/**
 * Onde a varredura parou.
 *
 * NUNCA LANCA: um cursor ilegivel devolve "comece do inicio", que e o
 * comportamento de antes deste arquivo existir. Derrubar a volta pesada porque
 * a tabela de estado ficou estranha seria trocar uma varredura imperfeita por
 * nenhuma.
 */
async function lerCursorDeVarredura(
  organizationId: string,
  varredura: string,
): Promise<CursorDeVarredura> {
  try {
    const linha = await selecionarUm("crc_scan_state", {
      colunas: "cursor_data,cursor_id",
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "varredura", op: "eq", valor: varredura },
      ],
    });
    if (linha === null) return { data: null, id: null };
    return {
      data: typeof linha["cursor_data"] === "string" ? linha["cursor_data"] : null,
      id: typeof linha["cursor_id"] === "string" ? linha["cursor_id"] : null,
    };
  } catch {
    return { data: null, id: null };
  }
}

async function gravarCursorDeVarredura(
  organizationId: string,
  varredura: string,
  onde: CursorDeVarredura & { fechouCiclo: boolean },
): Promise<void> {
  const { gravar } = await import("../servidor/banco");

  const anterior = await selecionarUm("crc_scan_state", {
    colunas: "ciclo,ciclo_iniciado_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "varredura", op: "eq", valor: varredura },
    ],
  });

  const ciclo = typeof anterior?.["ciclo"] === "number" ? anterior["ciclo"] : 0;
  const iniciadoEm =
    typeof anterior?.["ciclo_iniciado_em"] === "string" ? anterior["ciclo_iniciado_em"] : null;
  const completoEm =
    typeof anterior?.["ultimo_ciclo_completo_em"] === "string"
      ? anterior["ultimo_ciclo_completo_em"]
      : null;
  const agoraIso = new Date().toISOString();

  /*
   * ========================================================================
   *  DUAS DATAS, PORQUE UMA NAO DISTINGUE OS TRES ESTADOS.
   *
   *  `atualizado_em` muda a cada pagina. Foi com ele que o alerta do
   *  `supabase/27` tentou dizer "a varredura nao fecha uma volta ha dez dias" —
   *  e nao dizia nada: uma varredura rastejando 200/dia numa base de 8.000 tem
   *  `atualizado_em` sempre fresco e nunca dispara.
   *
   *    PARADA        `atualizado_em` antigo             → o cursor nao anda
   *    CICLO LENTO   `ciclo_iniciado_em` antigo         → anda, e nao fecha
   *    SAUDAVEL      `ultimo_ciclo_completo_em` recente → fecha na cadencia
   *
   *  Sem `ciclo_iniciado_em`, a segunda e a terceira sao indistinguiveis — que
   *  era exatamente o buraco do alerta anterior.
   * ========================================================================
   */
  await gravar(
    "crc_scan_state",
    {
      organization_id: organizationId,
      varredura,
      cursor_data: onde.data,
      cursor_id: onde.id,
      ...(onde.fechouCiclo
        ? {
            ciclo: ciclo + 1,
            ultimo_ciclo_completo_em: agoraIso,
            // O PROXIMO CICLO COMECA AGORA. Deixar nulo faria a volta seguinte
            // parecer que nunca comecou, e o alerta de ciclo lento nunca
            // dispararia.
            ciclo_iniciado_em: agoraIso,
          }
        : {
            /*
             * TODA COLUNA VAI NO PAYLOAD, INCLUSIVE AS QUE NAO MUDAM.
             *
             * `gravar` e um upsert de LINHA INTEIRA no PostgREST
             * (`resolution=merge-duplicates`): coluna ausente do corpo volta ao
             * DEFAULT, e nao ao valor anterior. Omitir `ciclo` aqui zeraria o
             * contador a cada pagina — e o numero que responde "a varredura
             * esta andando?" ficaria preso em zero para sempre.
             *
             * O fake pegou isto antes da producao. Foi o unico motivo.
             */
            ciclo,
            ultimo_ciclo_completo_em: completoEm,
            // A PRIMEIRA PAGINA DE UMA VOLTA e a que marca o inicio. As
            // seguintes preservam a marca — senao cada pagina reiniciaria o
            // relogio e o ciclo lento continuaria invisivel.
            ciclo_iniciado_em: iniciadoEm ?? agoraIso,
          }),
      atualizado_em: agoraIso,
    },
    "organization_id,varredura",
  );
}

/**
 * Confirmação de consultas — item 50.
 *
 * Pega o que começa dentro da antecedência configurada e ainda está como "a
 * confirmar". O índice parcial `crc_appointments_confirmar` sustenta isso.
 */
export async function varrerConfirmacoes(
  organizationId: string,
  cfg: ConfiguracaoCrc = CONFIGURACAO_PADRAO,
  limite = 200,
  agora = new Date(),
): Promise<ResultadoVarredura> {
  const ate = new Date(agora.getTime() + cfg.confirmacaoAntecedenciaHoras * 3_600_000);

  const linhas = await selecionar("crc_appointments", {
    colunas: "id,patient_id,clinic_id,inicio_em,external_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "eq", valor: "TO_CONFIRM" },
      { coluna: "inicio_em", op: "gte", valor: agora.toISOString() },
      { coluna: "inicio_em", op: "lte", valor: ate.toISOString() },
      { coluna: "patient_id", op: "not.is", valor: null },
    ],
    ordenar: [{ coluna: "inicio_em", ascendente: true }],
    limite,
  });

  const automacao = await carregarAutomacao(organizationId, "confirmacao_consulta");
  if (automacao === null) {
    return { seletor: "CONFIRMACAO", avaliados: linhas.length, elegiveis: 0, inscritos: 0 };
  }

  let inscritos = 0;
  for (const linha of linhas) {
    const patientId = String(linha["patient_id"] ?? "");
    if (patientId.length === 0) continue;

    const inscricao = await inscrever({
      organizationId,
      clinicId: String(linha["clinic_id"] ?? ""),
      automacao,
      patientId,
      // Por AGENDAMENTO, e não por paciente: quem tem duas consultas na semana
      // deve receber duas confirmações.
      chaveDedupe: `CONFIRMACAO:${String(linha["external_id"] ?? linha["id"] ?? "")}`,
      contexto: { inicioEm: String(linha["inicio_em"] ?? "") },
      agora,
    });
    if (inscricao.inscrito) inscritos += 1;
  }

  return { seletor: "CONFIRMACAO", avaliados: linhas.length, elegiveis: linhas.length, inscritos };
}

/**
 * Aniversariantes — item 53.
 *
 * ============================================================================
 *  A CONTA ESTAVA CERTA E A CONCLUSAO ESTAVA ERRADA.
 *
 *  A versao anterior lia `limit 2000` e comparava mes/dia em memoria, com esta
 *  justificativa no comentario: "com 20 mil pacientes sao ~55 aniversariantes
 *  por dia, e o candidato precisa ser lido de qualquer forma".
 *
 *  Os 55 estao entre os 20 MIL. A consulta lia 2.000 — e sem `order by`, QUAIS
 *  2.000 e decisao do planejador, que muda. Com 8.000 pacientes, tres em cada
 *  quatro aniversariantes nao eram vistos, e quais tres mudava a cada execucao.
 *
 *  O relatorio dizia "avaliados: 2000" como se fosse a base inteira. Ninguem
 *  recebia erro. O paciente so nao recebia mensagem.
 * ============================================================================
 *
 * AGORA QUEM PROCURA E O BANCO, por indice de expressao (`supabase/26`). O mes
 * e o dia continuam calculados no FUSO DA CLINICA: as 21h de Sao Paulo ja e o
 * dia seguinte em UTC, e a felicitacao sairia adiantada.
 *
 * O 29 DE FEVEREIRO CONTINUA SENDO REGRA DE DOMINIO. `datasDeAniversario` monta
 * a lista que vai ao banco a partir de `fazAniversarioHoje` — a mesma funcao
 * testada em `dominio/regras.ts`. Ensinar o SQL o que e ano bissexto seria ter
 * a regra em dois lugares, e um deles sem teste.
 */
export async function varrerAniversarios(
  organizationId: string,
  cfg: ConfiguracaoCrc = CONFIGURACAO_PADRAO,
  limite = 500,
  agora = new Date(),
): Promise<ResultadoVarredura> {
  const hoje = partesLocais(agora, cfg.horarioComercial.fuso);

  const linhas = await rpc("crc_aniversariantes", {
    p_organization_id: organizationId,
    p_datas: datasDeAniversario(hoje),
    p_limite: limite,
  });

  const automacao = await carregarAutomacao(organizationId, "aniversario");
  let elegiveis = 0;
  let inscritos = 0;

  for (const linha of linhas) {
    /*
     * A CONFERENCIA EM MEMORIA CONTINUA, e nao e redundancia: o banco devolve
     * quem nasceu em 29/02 junto com quem nasceu em 28/02, e so a regra de
     * dominio sabe se hoje o 29 conta. Sem isto, num ano BISSEXTO o pessoal do
     * dia 29 receberia felicitacao no dia 28 tambem.
     */
    const nascimento = typeof linha["nascimento"] === "string" ? linha["nascimento"] : null;
    if (!fazAniversarioHoje(nascimento, { mes: hoje.mes, dia: hoje.dia, ano: hoje.ano })) continue;
    elegiveis += 1;
    if (automacao === null) continue;

    const inscricao = await inscrever({
      organizationId,
      clinicId: String(linha["clinic_id"] ?? ""),
      automacao,
      patientId: String(linha["id"] ?? ""),
      // O ANO entra na chave: uma felicitação por ano, e não uma na vida.
      chaveDedupe: `ANIVERSARIO:${String(linha["id"] ?? "")}:${String(hoje.ano)}`,
      agora,
    });
    if (inscricao.inscrito) inscritos += 1;
  }

  return { seletor: "ANIVERSARIO", avaliados: linhas.length, elegiveis, inscritos };
}
