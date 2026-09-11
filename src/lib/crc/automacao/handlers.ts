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
import { selecionar, selecionarUm, type Filtro } from "../servidor/banco";
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
  const provedor = criarProvedorMensageria(evento.organizationId);
  if (!provedor.configurado) return;

  const { lerConfiguracao, lerKillSwitches } = await import("../servidor/configuracao");
  const [cfg, switches] = await Promise.all([
    lerConfiguracao(evento.organizationId),
    lerKillSwitches(evento.organizationId),
  ]);
  if (switches["kill_envios"] === true || switches["kill_automacoes"] === true) return;

  const { renderizarTemplate } = await import("./templates");
  const texto = await renderizarTemplate(evento.organizationId, "lead_primeiro_contato", {
    primeiroNome:
      String(linha["nome"] ?? "")
        .trim()
        .split(/\s+/u)[0] ?? "",
    clinica: "JP Clínica Integrada Odontológica",
  });

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

  const contexto = await contextoDeAgendamento(evento, cfg, flags, interruptores);
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
  cfg: ConfiguracaoCrc,
  flags: Readonly<Record<string, boolean>>,
  interruptores: Readonly<Record<string, boolean>>,
): Promise<ContextoAgendamento | null> {
  const { criarClienteDentalOffice } = await import("../integracoes/dental-office/cliente");
  const cliente = criarClienteDentalOffice({ organizationId: evento.organizationId });
  if (!cliente.ok) return null;

  const clinica = await selecionarUm("crc_clinics", {
    colunas: "id,external_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: evento.organizationId },
      { coluna: "ativa", op: "eq", valor: true },
    ],
  });
  if (clinica === null) return null;

  return {
    organizationId: evento.organizationId,
    clinicId: String(clinica["id"] ?? ""),
    clinicaExternaId: String(clinica["external_id"] ?? ""),
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
  const provedor = criarProvedorMensageria(evento.organizationId);
  if (!provedor.configurado) return;

  const patientId = destino.patientId;
  const nome = await primeiroNomeDoPaciente(evento.organizationId, patientId);

  const { renderizarTemplate } = await import("./templates");
  const texto = await renderizarTemplate(evento.organizationId, template, {
    primeiroNome: nome,
    clinica: "JP Clínica Integrada Odontológica",
    ...variaveis,
  });

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

  const { lerFlags, lerKillSwitches } = await import("../servidor/configuracao");
  const [flags, interruptores] = await Promise.all([
    lerFlags(evento.organizationId),
    lerKillSwitches(evento.organizationId),
  ]);

  if (flags["ai_agente_sombra"] !== true) return;
  if (interruptores["kill_ia_auto"] === true || interruptores["kill_automacoes"] === true) return;

  /*
   * O GATEWAY, E NÃO A FÁBRICA DE AMBIENTE — Fatia 8.
   *
   * Três coisas vêm de graça na troca, e nenhuma delas aparece aqui como
   * código: a rota por finalidade (conversa e supervisor podem ser modelos
   * diferentes), a chave da própria clínica quando ela cadastrou uma, e o teto de
   * gasto verificado ANTES de cada chamada. O teto é um decorador da porta
   * justamente para não existir caminho de chamada que esqueça de checá-lo.
   */
  const { portaParaFinalidade, portaDeEmbeddingsDaOrganizacao } =
    await import("../integracoes/ia/gateway");
  const [provedor, supervisorIa] = await Promise.all([
    portaParaFinalidade(evento.organizationId, "conversa"),
    portaParaFinalidade(evento.organizationId, "supervisor"),
  ]);

  // A busca no material escrito é capacidade SEPARADA (Fatia 7): sem ela o
  // agente continua atendendo horário, endereço e agenda, e a ferramenta de
  // conhecimento responde que o material não está disponível — o que faz o
  // modelo passar para a equipe em vez de responder de memória.
  const busca = await portaDeEmbeddingsDaOrganizacao(evento.organizationId);

  // O envio exige a SEGUNDA flag. Sem ela o turno termina em `candidato`: a
  // resposta fica gravada em `crc_ai_runs` e ninguém a recebe.
  const podeEnviar = flags["ai_agente_envio"] === true && interruptores["kill_envios"] !== true;

  let portaMensageria = null;
  if (podeEnviar) {
    const { criarProvedorMensageria } = await import("../integracoes/whatsapp/provedores");
    const m = criarProvedorMensageria(evento.organizationId);
    portaMensageria = m.configurado ? m.porta : null;
  }

  /*
   * A POLÍTICA É LIDA AQUI, uma vez, e entregue pronta ao laço.
   *
   * O laço não vai ao banco perguntar se pode: ele recebe o estado e decide
   * com ele. Assim a mesma volta do laço não pode ver a flag mudar no meio —
   * e a política fica testável sem banco.
   */
  const politica = {
    escritaLiberada: flags["ai_agente_escrita"] === true,
    writebackLiberado: flags["dental_office_writeback"] === true,
    agendamentoAutonomo: flags["auto_scheduling"] === true,
    escritasDentalOfficePausadas: interruptores["kill_escritas_do"] === true,
    ferramentasUsadas: 0,
  };

  const { lerConfiguracao } = await import("../servidor/configuracao");
  const cfg = await lerConfiguracao(evento.organizationId);

  const { rodarTurno } = await import("../ia-platform/turno");
  await rodarTurno({
    organizationId: evento.organizationId,
    conversationId,
    politica,
    // Montado só quando alguma ferramenta de agenda for escolhida: construí-lo
    // exige falar com o Dental Office, e a maioria dos turnos não usa agenda.
    contextoAgendamento: () => contextoDeAgendamento(evento, cfg, flags, interruptores),
    // O ID DO EVENTO É A CHAVE DE DEDUPE. O motor pode reprocessar um evento
    // depois de um restart; sem isto, o mesmo turno rodaria de novo e pagaria
    // o modelo de novo.
    eventoId: evento.id,
    agora: new Date(),
    porta: provedor.configurado ? provedor.porta : null,
    portaSupervisor: supervisorIa.configurado ? supervisorIa.porta : null,
    portaEmbeddings: busca.configurado ? busca.porta : null,
    portaMensageria,
    podeEnviar,
    // A segunda leitura do turno, e a única coisa que propõe memória. Custa uma
    // chamada de modelo a mais por turno, então é flag separada.
    supervisionar: flags["ai_supervisor"] === true,
  });
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
 * O FILTRO PESADO É FEITO NO BANCO, e não em memória: `ultima_consulta_em <
 * limite` usa o índice parcial criado no schema. Trazer 20 mil pacientes para o
 * Node e filtrar aqui funcionaria com 500 e estouraria a memória da função com
 * 20 mil — e o item 87 é explícito sobre não carregar a base no processo.
 *
 * O teto por execução existe pelo mesmo motivo do recálculo de prioridade: uma
 * varredura que estoura o tempo da Vercel no meio deixa metade do trabalho
 * feito e nenhuma indicação de onde parou. Com teto, ela processa um lote por
 * dia e converge.
 */
export async function varrerRecall(
  organizationId: string,
  cfg: ConfiguracaoCrc = CONFIGURACAO_PADRAO,
  limite = 200,
  agora = new Date(),
): Promise<ResultadoVarredura> {
  const limiteRecall = new Date(agora.getTime() - cfg.recallDias * 86400_000).toISOString();

  const linhas = await selecionar("crc_patients", {
    filtros: [
      ...FILTROS_CONTATAVEL(organizationId),
      { coluna: "ultima_consulta_em", op: "lt", valor: limiteRecall },
      { coluna: "ultima_consulta_em", op: "not.is", valor: null },
    ],
    ordenar: [{ coluna: "ultima_consulta_em", ascendente: true }],
    limite,
  });

  const automacaoRecall = await carregarAutomacao(organizationId, "recall_seis_meses");
  const automacaoReativacao = await carregarAutomacao(organizationId, "reativacao_inativos");

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

  return { seletor: "RECALL", avaliados: linhas.length, elegiveis, inscritos };
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
 * O mês e o dia são comparados no fuso da clínica, e não no do servidor: às 21h
 * de São Paulo já é o dia seguinte em UTC, e a felicitação sairia um dia
 * adiantada para quem faz aniversário amanhã.
 *
 * O FILTRO NÃO É FEITO NO BANCO de propósito. `extract(month from nascimento)`
 * exigiria um índice de expressão, e a economia não compensa: com 20 mil
 * pacientes, são ~55 aniversariantes por dia, e o candidato precisa ser lido de
 * qualquer forma. O teto de leitura protege o caso patológico.
 */
export async function varrerAniversarios(
  organizationId: string,
  cfg: ConfiguracaoCrc = CONFIGURACAO_PADRAO,
  limite = 2000,
  agora = new Date(),
): Promise<ResultadoVarredura> {
  const hoje = partesLocais(agora, cfg.horarioComercial.fuso);

  const linhas = await selecionar("crc_patients", {
    colunas: "id,clinic_id,nascimento",
    filtros: [
      ...FILTROS_CONTATAVEL(organizationId),
      { coluna: "nascimento", op: "not.is", valor: null },
    ],
    limite,
  });

  const automacao = await carregarAutomacao(organizationId, "aniversario");
  let elegiveis = 0;
  let inscritos = 0;

  for (const linha of linhas) {
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
