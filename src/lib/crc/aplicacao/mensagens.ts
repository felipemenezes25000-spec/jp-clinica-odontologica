/**
 * MessagingService — itens 36 a 41, 120, 163, 167.
 *
 * TODO envio de mensagem passa por aqui. Não existe atalho: o motor de
 * automação, a IA e a tela de conversa chamam a mesma função, e é ela que
 * aplica opt-out, cooldown, limite diário, horário comercial e deduplicação.
 *
 * O DESENHO CENTRAL É "GRAVA ANTES DE MANDAR".
 * A mensagem é inserida em `crc_messages` com `status_entrega = QUEUED` ANTES
 * de o provedor ser chamado, e a `chave_dedupe` tem índice único. Consequência:
 * se duas execuções concorrentes tentarem o mesmo envio, a segunda falha no
 * INSERT e nunca chega a chamar o provedor. Se a ordem fosse inversa — mandar e
 * depois gravar — um timeout entre as duas coisas produziria mensagem enviada e
 * não registrada, que a jornada seguinte mandaria de novo.
 */
import { CONFIGURACAO_PADRAO, type ConfiguracaoCrc } from "../dominio/configuracao";
import { pedeDescadastro, podeContatar, type ContextoContato } from "../dominio/regras";
import { normalizarTelefone, variacoesDeTelefone } from "../dominio/telefone";
import { truncar } from "../dominio/formatar";
import type { Conversa, Mensagem, Paciente } from "../dominio/tipos";
import type { PortaMensageria } from "../integracoes/whatsapp/porta";
import {
  atualizar,
  contar,
  gravar,
  inserir,
  inserirIgnorandoDuplicata,
  rpc,
  selecionar,
  selecionarUm,
  ErroBanco,
  type Filtro,
  type Linha,
} from "../servidor/banco";
import { auditar, descreverErro, registrar } from "../servidor/registro";

import { emitir } from "./eventos";
import { buscarPacientesPorTelefone, linhaParaConversa, linhaParaMensagem } from "./repositorios";

/* -------------------------------------------------------------------------- */
/* Resolução de conversa e casamento de paciente (item 167)                   */
/* -------------------------------------------------------------------------- */

export type ResolucaoConversa = {
  conversa: Conversa;
  /** `true` quando o telefone casou com mais de um paciente. */
  precisaRevisao: boolean;
};

/**
 * Encontra (ou cria) a conversa de um telefone.
 *
 * O ITEM 167 EM CÓDIGO: quando o telefone casa com dois pacientes — irmãos que
 * usam o mesmo celular, mãe e filho, cadastro duplicado — o sistema NÃO
 * escolhe. Ele cria a conversa sem paciente, marca `revisao_pendente` e guarda
 * os candidatos. Escolher por chute significaria gravar a conversa de uma
 * pessoa no prontuário comercial de outra.
 */
export async function resolverConversa(
  organizationId: string,
  clinicId: string,
  telefoneBruto: string,
  canal = "whatsapp",
): Promise<ResolucaoConversa> {
  const telefone = normalizarTelefone(telefoneBruto) ?? telefoneBruto;

  const existente = await selecionarUm("crc_conversations", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "canal", op: "eq", valor: canal },
      { coluna: "contato_externo", op: "eq", valor: telefone },
    ],
  });

  if (existente !== null) {
    const conversa = linhaParaConversa(existente);
    return { conversa, precisaRevisao: conversa.revisaoPendente };
  }

  const candidatos = await buscarPacientesPorTelefone(
    organizationId,
    variacoesDeTelefone(telefone),
  );

  const unico = candidatos.length === 1 ? candidatos[0] : undefined;
  const precisaRevisao = candidatos.length > 1;

  const criadas = await gravar(
    "crc_conversations",
    {
      organization_id: organizationId,
      clinic_id: unico?.clinicId ?? clinicId,
      patient_id: unico?.id ?? null,
      canal,
      contato_externo: telefone,
      status: "ABERTA",
      revisao_pendente: precisaRevisao,
      candidatos: precisaRevisao
        ? candidatos.map((c) => ({ id: c.id, nome: c.nome, externalId: c.externalId }))
        : null,
    },
    "organization_id,canal,contato_externo",
  );

  const linha = criadas[0];
  if (linha === undefined) {
    // Corrida: outra requisição criou a conversa entre o SELECT e o UPSERT. O
    // upsert por conflito já resolveu do lado do banco; basta reler.
    const releitura = await selecionarUm("crc_conversations", {
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "canal", op: "eq", valor: canal },
        { coluna: "contato_externo", op: "eq", valor: telefone },
      ],
    });
    if (releitura === null) throw new Error("Não foi possível abrir a conversa.");
    return { conversa: linhaParaConversa(releitura), precisaRevisao };
  }

  if (precisaRevisao) {
    registrar("aviso", "Telefone casou com mais de um paciente — conversa foi para revisão.", {
      organizationId,
      candidatos: candidatos.length,
    });
  }

  return { conversa: linhaParaConversa(linha), precisaRevisao };
}

/** Resolve a revisão do item 167: um humano diz de quem é a conversa. */
export async function vincularConversaAoPaciente(
  organizationId: string,
  conversationId: string,
  patientId: string,
  userId: string | null,
): Promise<void> {
  await atualizar(
    "crc_conversations",
    [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { patient_id: patientId, revisao_pendente: false, candidatos: null },
  );

  // As mensagens já recebidas ficaram sem paciente. Sem este passo, o histórico
  // do paciente começaria vazio justamente na conversa que motivou a revisão.
  await atualizar(
    "crc_messages",
    [
      { coluna: "conversation_id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { patient_id: patientId },
  );

  await auditar({
    organizationId,
    userId,
    ator: "humano",
    acao: "conversa.vinculada_ao_paciente",
    entityType: "conversation",
    entityId: conversationId,
    depois: { patientId },
  });
}

/* -------------------------------------------------------------------------- */
/* Recebimento (itens 36, 37, 39)                                             */
/* -------------------------------------------------------------------------- */

export type RecebimentoResultado =
  | { ok: true; mensagemId: string; conversationId: string; duplicada: false }
  | { ok: true; duplicada: true }
  | { ok: false; motivo: string };

/**
 * Persiste uma mensagem recebida e emite `message.received`.
 *
 * A DEDUPLICAÇÃO É POR `provider_message_id` COM ÍNDICE ÚNICO (item 37). O
 * provedor reenvia webhook quando não recebe 200 rápido o bastante, e sem esta
 * trava a mesma pergunta do paciente viraria três mensagens na Inbox e três
 * classificações de IA cobradas.
 *
 * O OPT-OUT É AVALIADO AQUI, antes de qualquer automação (item 39). Se o
 * paciente escreveu "pare de mandar", ele é marcado na mesma transação lógica
 * em que a mensagem entra — não depois, não pela IA, não na próxima varredura.
 */
export async function receberMensagem(
  organizationId: string,
  clinicId: string,
  dados: {
    providerMessageId: string;
    telefone: string;
    texto: string;
    recebidaEm: string;
    nomePerfil: string | null;
  },
): Promise<RecebimentoResultado> {
  const { conversa } = await resolverConversa(organizationId, clinicId, dados.telefone);

  const linha = await inserirIgnorandoDuplicata("crc_messages", {
    organization_id: organizationId,
    conversation_id: conversa.id,
    patient_id: conversa.patientId,
    direcao: "ENTRADA",
    remetente: "paciente",
    conteudo: dados.texto,
    status_entrega: "DELIVERED",
    provider_message_id: dados.providerMessageId,
    criado_em: dados.recebidaEm,
  });

  if (linha === null) return { ok: true, duplicada: true };

  const mensagem = linhaParaMensagem(linha);

  // Contador atômico: `nao_lidas + 1` via REST perderia uma de duas mensagens
  // simultâneas. A função no banco resolve numa instrução só.
  await rpc("crc_marcar_nao_lida", {
    conversa: conversa.id,
    trecho: truncar(dados.texto, 120),
    quando: dados.recebidaEm,
  });

  // A conversa volta a ser "aberta" quando o paciente escreve: uma conversa
  // marcada como resolvida que recebe resposta não pode sumir da Inbox.
  if (conversa.status === "RESOLVIDA") {
    await atualizar("crc_conversations", [{ coluna: "id", op: "eq", valor: conversa.id }], {
      status: "ABERTA",
    });
  }

  if (pedeDescadastro(dados.texto) && conversa.patientId !== null) {
    await registrarOptOut(organizationId, conversa.patientId, "Pedido do paciente por mensagem.");
  }

  await emitir({
    organizationId,
    clinicId: conversa.clinicId,
    tipo: "message.received",
    entityType: "message",
    entityId: mensagem.id,
    payload: {
      conversationId: conversa.id,
      patientId: conversa.patientId,
      texto: dados.texto,
      nomePerfil: dados.nomePerfil,
    },
    fingerprint: `message.received:${dados.providerMessageId}`,
    ocorridoEm: dados.recebidaEm,
  });

  return { ok: true, mensagemId: mensagem.id, conversationId: conversa.id, duplicada: false };
}

/**
 * Marca o opt-out — item 39.
 *
 * Registra o instante porque a LGPD exige poder provar QUANDO a pessoa pediu, e
 * porque sem isso não dá para investigar "por que ele recebeu mensagem depois
 * de ter pedido para parar".
 */
export async function registrarOptOut(
  organizationId: string,
  patientId: string,
  motivo: string,
): Promise<void> {
  const agora = new Date().toISOString();

  await atualizar(
    "crc_patients",
    [
      { coluna: "id", op: "eq", valor: patientId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
      // Não sobrescreve um opt-out anterior: a data que vale é a do PRIMEIRO
      // pedido.
      { coluna: "opt_out_em", op: "is", valor: null },
    ],
    { opt_out_em: agora, opt_out_motivo: motivo, atualizado_em: agora },
  );

  // Toda jornada ativa deste paciente para na hora. Esperar a próxima varredura
  // deixaria uma mensagem já agendada sair depois do pedido.
  await atualizar(
    "crc_automation_enrollments",
    [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
      { coluna: "status", op: "in", valor: ["ACTIVE", "WAITING"] },
    ],
    {
      status: "EXITED",
      saiu_por: "opt_out",
      resume_at: null,
      concluido_em: agora,
      atualizado_em: agora,
    },
  );

  await auditar({
    organizationId,
    userId: null,
    ator: "automacao",
    acao: "paciente.opt_out",
    entityType: "patient",
    entityId: patientId,
    depois: { motivo, em: agora },
  });

  registrar("info", "Paciente marcado como opt-out; jornadas encerradas.", {
    organizationId,
    patientId,
  });
}

/** Atualiza o status de entrega vindo do webhook (item 38). */
export async function atualizarEntrega(
  organizationId: string,
  providerMessageId: string,
  status: "SENT" | "DELIVERED" | "READ" | "FAILED",
  erro: string | null,
): Promise<void> {
  await atualizar(
    "crc_messages",
    [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "provider_message_id", op: "eq", valor: providerMessageId },
    ],
    { status_entrega: status, erro },
  );
}

/* -------------------------------------------------------------------------- */
/* Envio                                                                      */
/* -------------------------------------------------------------------------- */

export type PedidoEnvio = {
  organizationId: string;
  clinicId: string;
  patientId: string | null;
  conversationId?: string;
  telefone: string;
  texto: string;
  /** Item 120: a chave que impede a mesma mensagem sair duas vezes. */
  chaveDedupe: string;
  remetente: "atendente" | "automacao" | "ia";
  autorId?: string | null;
  templateId?: string | null;
  enrollmentId?: string | null;
  /**
   * Envio PROATIVO passa pela política de contato (opt-out, cooldura, horário).
   * Resposta a uma conversa em andamento NÃO passa: o paciente acabou de
   * escrever, e recusar a resposta por causa do horário comercial seria deixar
   * alguém falando sozinho.
   */
  proativo: boolean;
  porta: PortaMensageria;
  configuracao?: ConfiguracaoCrc;
};

export type ResultadoEnvioMensagem =
  | { ok: true; mensagemId: string; providerMessageId: string }
  | { ok: false; codigo: string; motivo: string; reagendarPara?: Date; permanente: boolean };

export async function enviarMensagem(pedido: PedidoEnvio): Promise<ResultadoEnvioMensagem> {
  const cfg = pedido.configuracao ?? CONFIGURACAO_PADRAO;

  if (pedido.proativo && pedido.patientId !== null) {
    const veredicto = await avaliarPoliticaDeContato(pedido.organizationId, pedido.patientId, cfg);
    if (!veredicto.pode) {
      return {
        ok: false,
        codigo: veredicto.codigo,
        motivo: veredicto.motivo,
        permanente: veredicto.codigo === "OPT_OUT" || veredicto.codigo === "SEM_TELEFONE",
        ...(veredicto.reagendarPara !== undefined
          ? { reagendarPara: veredicto.reagendarPara }
          : {}),
      };
    }
  }

  const conversationId =
    pedido.conversationId ??
    (await resolverConversa(pedido.organizationId, pedido.clinicId, pedido.telefone)).conversa.id;

  // GRAVA ANTES DE MANDAR. Ver o cabeçalho do arquivo: é o que impede envio
  // duplicado em execução concorrente.
  let linha: Linha | null;
  try {
    linha = await inserirIgnorandoDuplicata("crc_messages", {
      organization_id: pedido.organizationId,
      conversation_id: conversationId,
      patient_id: pedido.patientId,
      direcao: "SAIDA",
      remetente: pedido.remetente,
      autor_id: pedido.autorId ?? null,
      conteudo: pedido.texto,
      status_entrega: "QUEUED",
      template_id: pedido.templateId ?? null,
      automation_execution_id: pedido.enrollmentId ?? null,
      chave_dedupe: pedido.chaveDedupe,
    });
  } catch (erro) {
    if (erro instanceof ErroBanco && erro.ehConflitoDeUnicidade) linha = null;
    else throw erro;
  }

  if (linha === null) {
    return {
      ok: false,
      codigo: "JA_ENVIADA",
      motivo: "Esta mensagem já foi enviada.",
      permanente: true,
    };
  }

  const mensagemId = String(linha["id"] ?? "");

  const resultado = await pedido.porta.enviarTexto({
    destino: { telefone: pedido.telefone },
    texto: pedido.texto,
    chaveDedupe: pedido.chaveDedupe,
  });

  if (!resultado.ok) {
    await atualizar("crc_messages", [{ coluna: "id", op: "eq", valor: mensagemId }], {
      status_entrega: "FAILED",
      erro: `${resultado.codigo}: ${resultado.detalhe}`,
    });

    // FALHA TRANSITÓRIA LIBERA A CHAVE DE DEDUPE.
    // Sem isso, uma queda momentânea do provedor bloquearia a mensagem para
    // sempre: a linha ficaria em FAILED ocupando a chave única, e a retentativa
    // seria recusada como "já enviada". Falha permanente MANTÉM a chave — não
    // adianta insistir num número inválido.
    if (!resultado.permanente) {
      await atualizar("crc_messages", [{ coluna: "id", op: "eq", valor: mensagemId }], {
        chave_dedupe: null,
      });
    }

    registrar("aviso", "Envio de mensagem falhou.", {
      organizationId: pedido.organizationId,
      mensagemId,
      codigo: resultado.codigo,
      permanente: resultado.permanente,
    });

    return {
      ok: false,
      codigo: resultado.codigo,
      motivo: resultado.detalhe,
      permanente: resultado.permanente,
    };
  }

  const agora = new Date().toISOString();
  await atualizar("crc_messages", [{ coluna: "id", op: "eq", valor: mensagemId }], {
    status_entrega: "SENT",
    provider_message_id: resultado.providerMessageId,
    enviado_em: agora,
  });

  await atualizar("crc_conversations", [{ coluna: "id", op: "eq", valor: conversationId }], {
    ultima_mensagem_em: agora,
    ultima_mensagem_trecho: truncar(pedido.texto, 120),
    status: pedido.proativo ? "AGUARDANDO" : "ABERTA",
    atualizado_em: agora,
  });

  // ITEM 158: o relógio do speed to lead para aqui, na PRIMEIRA resposta.
  // A função só grava se o campo ainda estiver vazio, então chamá-la em todo
  // envio é seguro e evita ter que descobrir "esta é a primeira?" aqui.
  const { leadPendentePorTelefone, marcarPrimeiraResposta } = await import("./leads");
  const leadId = await leadPendentePorTelefone(pedido.organizationId, pedido.telefone);
  if (leadId !== null) {
    await marcarPrimeiraResposta(pedido.organizationId, leadId, new Date(agora));
  }

  await emitir({
    organizationId: pedido.organizationId,
    clinicId: pedido.clinicId,
    tipo: "message.sent",
    entityType: "message",
    entityId: mensagemId,
    payload: { conversationId, patientId: pedido.patientId, proativo: pedido.proativo },
    fingerprint: `message.sent:${mensagemId}`,
  });

  return { ok: true, mensagemId, providerMessageId: resultado.providerMessageId };
}

/**
 * Monta o contexto de política e chama a regra pura.
 *
 * A REGRA mora no domínio (`podeContatar`), testada sem banco. Aqui só se
 * carrega o que ela precisa saber. Essa separação é o que permite os testes do
 * item 79 cobrirem a política inteira sem subir Postgres.
 */
export async function avaliarPoliticaDeContato(
  organizationId: string,
  patientId: string,
  cfg: ConfiguracaoCrc,
  agora = new Date(),
): Promise<ReturnType<typeof podeContatar>> {
  const paciente = await selecionarUm("crc_patients", {
    colunas: "opt_out_em,telefone",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "eq", valor: patientId },
    ],
  });

  if (paciente === null) {
    return { pode: false, codigo: "SEM_TELEFONE", motivo: "Paciente não encontrado." };
  }

  const inicioDoDia = new Date(agora);
  inicioDoDia.setUTCHours(0, 0, 0, 0);

  const contatosHoje = await contar("crc_messages", [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "patient_id", op: "eq", valor: patientId },
    { coluna: "direcao", op: "eq", valor: "SAIDA" },
    { coluna: "remetente", op: "in", valor: ["automacao", "ia"] },
    { coluna: "criado_em", op: "gte", valor: inicioDoDia.toISOString() },
  ]);

  const ultima = await selecionarUm("crc_messages", {
    colunas: "criado_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
      { coluna: "direcao", op: "eq", valor: "SAIDA" },
      { coluna: "remetente", op: "in", valor: ["automacao", "ia"] },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
  });

  let horasDesdeUltimoContato: number | null = null;
  const quando = ultima?.["criado_em"];
  if (typeof quando === "string") {
    const t = Date.parse(quando);
    if (Number.isFinite(t)) horasDesdeUltimoContato = (agora.getTime() - t) / 3_600_000;
  }

  const conversa = await selecionarUm("crc_conversations", {
    colunas: "assigned_to",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
    ],
    ordenar: [{ coluna: "ultima_mensagem_em", ascendente: false }],
  });

  const jornadasAtivas = await contar("crc_automation_enrollments", [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "patient_id", op: "eq", valor: patientId },
    { coluna: "status", op: "in", valor: ["ACTIVE", "WAITING"] },
  ]);

  const ctx: ContextoContato = {
    optOutEm: typeof paciente["opt_out_em"] === "string" ? paciente["opt_out_em"] : null,
    telefone: typeof paciente["telefone"] === "string" ? paciente["telefone"] : null,
    contatosHoje,
    horasDesdeUltimoContato,
    // > 1 porque a jornada que está PERGUNTANDO também conta a si mesma.
    temJornadaAtivaConcorrente: jornadasAtivas > 1,
    conversaAtribuidaAHumano: typeof conversa?.["assigned_to"] === "string",
  };

  return podeContatar(ctx, agora, cfg, cfg.horarioComercial);
}

/* -------------------------------------------------------------------------- */
/* Nota interna (item 163)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Nota interna NUNCA vai para o paciente.
 *
 * A separação não é só um campo booleano: esta função não toca o provedor de
 * jeito nenhum. Se a nota fosse "uma mensagem com flag", bastaria um `if`
 * esquecido no caminho de envio para ela vazar.
 */
export async function registrarNotaInterna(
  organizationId: string,
  conversationId: string,
  patientId: string | null,
  texto: string,
  autorId: string,
): Promise<Mensagem> {
  const linhas = await inserir("crc_messages", {
    organization_id: organizationId,
    conversation_id: conversationId,
    patient_id: patientId,
    direcao: "SAIDA",
    remetente: "atendente",
    autor_id: autorId,
    conteudo: texto,
    nota_interna: true,
    status_entrega: "SENT",
    enviado_em: new Date().toISOString(),
  });

  const linha = linhas[0];
  if (linha === undefined) throw new Error("Não foi possível gravar a nota interna.");
  return linhaParaMensagem(linha);
}

/* -------------------------------------------------------------------------- */
/* Inbox (itens 40, 41)                                                       */
/* -------------------------------------------------------------------------- */

export type FiltroInbox = {
  organizationId: string;
  clinicIds?: readonly string[];
  assignedTo?: string | null;
  apenasNaoLidas?: boolean;
  apenasRevisao?: boolean;
  limite?: number;
  deslocamento?: number;
};

export async function listarConversas(f: FiltroInbox): Promise<Conversa[]> {
  const filtros: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: f.organizationId }];

  if (f.clinicIds !== undefined) {
    filtros.push({ coluna: "clinic_id", op: "in", valor: [...f.clinicIds] });
  }
  // `null` explícito = "sem responsável"; ausente = "qualquer responsável".
  if (f.assignedTo === null) filtros.push({ coluna: "assigned_to", op: "is", valor: null });
  else if (f.assignedTo !== undefined) {
    filtros.push({ coluna: "assigned_to", op: "eq", valor: f.assignedTo });
  }
  if (f.apenasNaoLidas === true) filtros.push({ coluna: "nao_lidas", op: "gt", valor: 0 });
  if (f.apenasRevisao === true) filtros.push({ coluna: "revisao_pendente", op: "eq", valor: true });

  const linhas = await selecionar("crc_conversations", {
    filtros,
    ordenar: [{ coluna: "ultima_mensagem_em", ascendente: false, nullsPrimeiro: false }],
    limite: f.limite ?? 40,
    ...(f.deslocamento !== undefined ? { deslocamento: f.deslocamento } : {}),
  });

  return linhas.map(linhaParaConversa);
}

export async function listarMensagens(
  organizationId: string,
  conversationId: string,
  limite = 100,
): Promise<Mensagem[]> {
  const linhas = await selecionar("crc_messages", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "conversation_id", op: "eq", valor: conversationId },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite,
  });
  return linhas.map(linhaParaMensagem);
}

export async function marcarConversaLida(
  organizationId: string,
  conversationId: string,
): Promise<void> {
  await atualizar(
    "crc_conversations",
    [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { nao_lidas: 0 },
  );
}

/**
 * Assume a conversa — item 41.
 *
 * O bloqueio é por TEMPO, e não permanente: um atendente que fecha a aba sem
 * liberar deixaria a conversa travada para sempre. Quinze minutos é longo o
 * bastante para uma resposta e curto o bastante para não emperrar a operação.
 */
const BLOQUEIO_CONVERSA_MS = 15 * 60 * 1000;

export async function assumirConversa(
  organizationId: string,
  conversationId: string,
  userId: string,
): Promise<{ ok: boolean; bloqueadaPor: string | null }> {
  const atual = await selecionarUm("crc_conversations", {
    colunas: "bloqueada_por,bloqueada_ate",
    filtros: [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });

  const dono = typeof atual?.["bloqueada_por"] === "string" ? atual["bloqueada_por"] : null;
  const ate = typeof atual?.["bloqueada_ate"] === "string" ? Date.parse(atual["bloqueada_ate"]) : 0;

  if (dono !== null && dono !== userId && Number.isFinite(ate) && ate > Date.now()) {
    return { ok: false, bloqueadaPor: dono };
  }

  await atualizar(
    "crc_conversations",
    [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      assigned_to: userId,
      bloqueada_por: userId,
      bloqueada_ate: new Date(Date.now() + BLOQUEIO_CONVERSA_MS).toISOString(),
    },
  );

  return { ok: true, bloqueadaPor: userId };
}

export async function buscarConversaDoPaciente(
  organizationId: string,
  paciente: Pick<Paciente, "id">,
): Promise<Conversa | null> {
  const linha = await selecionarUm("crc_conversations", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: paciente.id },
    ],
    ordenar: [{ coluna: "ultima_mensagem_em", ascendente: false }],
  });
  return linha === null ? null : linhaParaConversa(linha);
}

export { descreverErro };
