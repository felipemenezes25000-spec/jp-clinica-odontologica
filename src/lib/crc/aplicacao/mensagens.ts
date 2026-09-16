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
import type { DestinoCanal } from "../dominio/canais";
import { CONFIGURACAO_PADRAO, type ConfiguracaoCrc } from "../dominio/configuracao";
import { comoEnviar, estadoDaJanela } from "../dominio/janela-whatsapp";
import { pedeDescadastro, podeContatar, type ContextoContato } from "../dominio/regras";
import { normalizarTelefone, variacoesDeTelefone } from "../dominio/telefone";
import { truncar } from "../dominio/formatar";
import type { Conversa, Mensagem, Paciente } from "../dominio/tipos";
import type { PortaMensageria } from "../integracoes/whatsapp/porta";
import {
  agoraIso,
  atualizar,
  contar,
  ErroBanco,
  gravar,
  inserir,
  inserirIgnorandoDuplicata,
  rpc,
  selecionar,
  selecionarUm,
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

/* -------------------------------------------------------------------------- */
/* A conversa em QUALQUER canal — §6                                          */
/* -------------------------------------------------------------------------- */

export type ResolucaoNoCanal = {
  conversa: Conversa;
  precisaRevisao: boolean;
  /** `true` quando a conversa acabou de nascer. Quem chama usa para o backfill. */
  nova: boolean;
};

/**
 * Encontra (ou cria) a conversa de um contato em qualquer canal.
 *
 * ============================================================================
 *  POR QUE UMA FUNÇÃO NOVA, E NÃO UM PARÂMETRO A MAIS EM `resolverConversa`.
 *
 *  `resolverConversa` faz DUAS coisas que só valem para telefone, e as duas na
 *  primeira linha:
 *
 *      normalizarTelefone(telefoneBruto)
 *      buscarPacientesPorTelefone(org, variacoesDeTelefone(telefone))
 *
 *  `normalizarTelefone` de um IGSID de dezessete dígitos devolve… algo. E
 *  `variacoesDeTelefone` gera as variantes de DDI de um número que não é
 *  número — e casa, por acidente, com o paciente cujo telefone tenha aqueles
 *  dígitos.
 *
 *  Ou seja: reaproveitar a função não daria erro. Daria um direct do Instagram
 *  entrando no prontuário de um paciente escolhido por coincidência numérica.
 *
 *  A ASSINATURA DE `resolverConversa` FICA INTACTA porque ela é o caminho de
 *  todo o WhatsApp — motor de jornadas, campanha, IA, webhook. Um parâmetro a
 *  mais ali obrigaria a auditar cada chamador para saber se ele passa canal.
 * ============================================================================
 */
export async function resolverConversaNoCanal(
  organizationId: string,
  clinicId: string,
  destino: DestinoCanal,
  opcoes: { apelido?: string | null } = {},
): Promise<ResolucaoNoCanal> {
  // WHATSAPP CONTINUA PELO CAMINHO DE SEMPRE. Ver o cabeçalho: é o casamento
  // por telefone, com as variações de DDI, e ele está certo para telefone.
  if (destino.canal === "whatsapp") {
    const r = await resolverConversa(organizationId, clinicId, destino.contato.valor, "whatsapp");
    return { ...r, nova: false };
  }

  const canal = destino.canal;
  const contato = destino.contato.valor;
  const apelido = (opcoes.apelido ?? "").trim();

  const existente = await selecionarUm("crc_conversations", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "canal", op: "eq", valor: canal },
      { coluna: "contato_externo", op: "eq", valor: contato },
    ],
  });

  if (existente !== null) {
    const conversa = linhaParaConversa(existente);

    /*
     * O APELIDO É ATUALIZADO A CADA MENSAGEM, e é por isso que ele é rótulo.
     *
     * A pessoa troca o `@usuario`; a conversa continua a mesma, porque a chave
     * é o IGSID. Não atualizar deixaria a Inbox mostrando um nome que não existe
     * mais — e a recepção procuraria por ele no Instagram sem achar.
     */
    if (apelido.length > 0 && apelido !== (conversa.apelidoExterno ?? "")) {
      await atualizar(
        "crc_conversations",
        [
          { coluna: "id", op: "eq", valor: conversa.id },
          { coluna: "organization_id", op: "eq", valor: organizationId },
        ],
        { apelido_externo: apelido.slice(0, 120) },
      );
      return {
        conversa: { ...conversa, apelidoExterno: apelido.slice(0, 120) },
        precisaRevisao: conversa.revisaoPendente,
        nova: false,
      };
    }

    return { conversa, precisaRevisao: conversa.revisaoPendente, nova: false };
  }

  /*
   * ==========================================================================
   *  QUEM É ESTA PESSOA — pelo IGSID/PSID, com NAMESPACE (§10, §25).
   *
   *  `quemEPerfilDaMeta` consulta `crc_patient_identities` com
   *  `tipo = EXTERNAL_ID` e `namespace = instagram|messenger`. Sem o namespace,
   *  o IGSID `123` casaria com o paciente `123` do Dental Office — ver o
   *  cabeçalho de `dominio/identidade.ts`.
   *
   *  `UNICO` vincula. `AMBIGUO` e `NENHUM` NÃO vinculam, e a diferença entre
   *  os dois é o que a tela mostra:
   *
   *    NENHUM   é prospect. Normal, e é o caso da imensa maioria dos directs.
   *    AMBIGUO  é revisão. Duas pessoas com o mesmo perfil vinculado significa
   *             que um dos vínculos está errado, e escolher seria escrever no
   *             prontuário de quem não é.
   * ==========================================================================
   */
  const { quemEPerfilDaMeta } = await import("./omnichannel");
  const resolucao = await quemEPerfilDaMeta(organizationId, canal, contato);

  const patientId = resolucao.tipo === "UNICO" ? resolucao.patientId : null;
  const precisaRevisao = resolucao.tipo === "AMBIGUO";

  const criadas = await gravar(
    "crc_conversations",
    {
      organization_id: organizationId,
      clinic_id: clinicId,
      patient_id: patientId,
      canal,
      contato_externo: contato,
      ...(apelido.length > 0 ? { apelido_externo: apelido.slice(0, 120) } : {}),
      status: "ABERTA",
      revisao_pendente: precisaRevisao,
      candidatos:
        resolucao.tipo === "AMBIGUO"
          ? resolucao.candidatos.map((c) => ({ id: c.patientId, nome: c.nome }))
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
        { coluna: "contato_externo", op: "eq", valor: contato },
      ],
    });
    if (releitura === null) throw new Error("Não foi possível abrir a conversa.");
    return { conversa: linhaParaConversa(releitura), precisaRevisao, nova: false };
  }

  if (precisaRevisao) {
    registrar(
      "aviso",
      "Perfil externo casou com mais de um paciente — conversa foi para revisão.",
      {
        organizationId,
        canal,
      },
    );
  }

  return { conversa: linhaParaConversa(linha), precisaRevisao, nova: true };
}

/* -------------------------------------------------------------------------- */

export type MensagemDeCanal = {
  providerMessageId: string;
  destino: DestinoCanal;
  texto: string;
  ocorridoEm: string;
  apelido?: string | null;
  /**
   * `true` quando NÓS mandamos e a Meta devolveu como eco.
   *
   * Ver `EventoMensagemRecebida.eco`. A mensagem entra como `SAIDA` e NÃO
   * dispara nada: sem incremento de não lidas, sem reabrir conversa, sem
   * evento de domínio.
   */
  saida?: boolean;
  /**
   * `true` num backfill de histórico — §48.
   *
   * ========================================================================
   *  ESTA FLAG É A REGRA MAIS FÁCIL DE ERRAR DE TODO O PROMPT.
   *
   *  "Backfill não pode mandar 'Oi, vi sua mensagem' para conversa de seis
   *  meses atrás."
   *
   *  Sem ela, importar histórico emitiria centenas de `message.received` com
   *  data antiga — e o motor de automação responderia a todos, porque para ele
   *  um evento é um evento.
   *
   *  A mensagem entra no histórico e na linha do tempo. O que ela NÃO faz é
   *  incrementar não lidas, reabrir conversa resolvida, e emitir evento.
   * ========================================================================
   */
  historico?: boolean;
  /** Metadados do anexo, quando houver. Ver a política de mídia do §47. */
  anexos?: readonly { tipo: string; url: string | null; mime: string | null }[];
};

/**
 * Persiste uma mensagem de um canal qualquer.
 *
 * É `receberMensagem` generalizada, e a diferença entre as duas é o destino:
 * aqui ele é `DestinoCanal` em vez de `telefone: string`. Ver o cabeçalho de
 * `resolverConversaNoCanal` para por que não é a mesma função.
 */
export async function receberMensagemDoCanal(
  organizationId: string,
  clinicId: string,
  dados: MensagemDeCanal,
): Promise<RecebimentoResultado> {
  const { conversa } = await resolverConversaNoCanal(organizationId, clinicId, dados.destino, {
    apelido: dados.apelido ?? null,
  });

  const ehSaida = dados.saida === true;
  const ehHistorico = dados.historico === true;
  /*
   * O RELÓGIO VEM DO ADAPTADOR, e não de `new Date()`.
   *
   * `agoraIso()` existe em `servidor/banco` justamente para os testes trocarem
   * o módulo inteiro por `testes/banco-memoria` e controlarem o tempo com
   * `definirRelogio`. Lendo o relógio real aqui, o teste que fixa o instante em
   * `AGORA` fixava só o do banco fake — e as duas datas divergiam a cada noite,
   * quando o UTC vira o dia antes do horário de Brasília.
   *
   * É o mesmo defeito que `automacao/pulso.ts` já tinha corrigido, pela mesma
   * razão: um teste com prazo de validade, que fica vermelho sozinho sem nada
   * ter quebrado.
   */
  const agora = agoraIso();

  const linha = await inserirIgnorandoDuplicata("crc_messages", {
    organization_id: organizationId,
    conversation_id: conversa.id,
    patient_id: conversa.patientId,
    direcao: ehSaida ? "SAIDA" : "ENTRADA",
    /*
     * O ECO É `atendente`, E NÃO `ia`.
     *
     * Ele é a mensagem que uma PESSOA mandou pelo app do celular — é assim que
     * a recepção trabalha hoje, e é justamente o que a Inbox precisa mostrar
     * para não parecer que o paciente foi ignorado. Marcar como `ia` faria a
     * auditoria atribuir à máquina o que uma pessoa escreveu.
     */
    remetente: ehSaida ? "atendente" : "paciente",
    conteudo: dados.texto,
    status_entrega: ehSaida ? "SENT" : "DELIVERED",
    provider_message_id: dados.providerMessageId,
    // §49: `criado_em` é quando ACONTECEU; `recebido_em` é quando chegou aqui.
    criado_em: dados.ocorridoEm,
    recebido_em: agora,
    historico_importado: ehHistorico,
  });

  if (linha === null) return { ok: true, duplicada: true };

  const mensagem = linhaParaMensagem(linha);

  /*
   * ==========================================================================
   *  OS TRÊS EFEITOS COLATERAIS SÃO PULADOS EM ECO E EM HISTÓRICO, e cada um
   *  por uma razão própria:
   *
   *    NÃO LIDAS   um eco é nossa resposta. Incrementar faria a recepção ver
   *                "1 nova" na conversa que ela mesma acabou de responder.
   *
   *    REABRIR     uma conversa resolvida não volta a abrir porque importamos
   *                o histórico dela.
   *
   *    EVENTO      é o gatilho da IA e da automação. É o §48 literal.
   * ==========================================================================
   */
  if (!ehSaida && !ehHistorico) {
    await rpc("crc_marcar_nao_lida", {
      conversa: conversa.id,
      trecho: truncar(dados.texto, 120),
      quando: dados.ocorridoEm,
    });

    if (conversa.status === "RESOLVIDA") {
      await atualizar(
        "crc_conversations",
        [
          { coluna: "id", op: "eq", valor: conversa.id },
          { coluna: "organization_id", op: "eq", valor: organizationId },
        ],
        { status: "ABERTA" },
      );
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
        canal: dados.destino.canal,
        texto: dados.texto,
        nomePerfil: dados.apelido ?? null,
        anexos: dados.anexos ?? [],
      },
      fingerprint: `message.received:${dados.providerMessageId}`,
      ocorridoEm: dados.ocorridoEm,
    });
  } else if (ehSaida) {
    /*
     * O ECO AINDA ATUALIZA A PRÉVIA DA CONVERSA.
     *
     * Sem isto, a Inbox mostraria a pergunta do paciente como última mensagem
     * de uma conversa que já foi respondida pelo celular — e a recepção
     * responderia de novo. A prévia é o que ela lê antes de abrir.
     */
    await atualizar(
      "crc_conversations",
      [
        { coluna: "id", op: "eq", valor: conversa.id },
        { coluna: "organization_id", op: "eq", valor: organizationId },
      ],
      {
        ultima_mensagem_em: dados.ocorridoEm,
        ultima_mensagem_trecho: truncar(dados.texto, 120),
        atualizado_em: agora,
      },
    );
  }

  return { ok: true, mensagemId: mensagem.id, conversationId: conversa.id, duplicada: false };
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
    await atualizar(
      "crc_conversations",
      [
        { coluna: "id", op: "eq", valor: conversa.id },
        { coluna: "organization_id", op: "eq", valor: organizationId },
      ],
      {
        status: "ABERTA",
      },
    );
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
  /**
   * O nome do modelo APROVADO NA META, quando este envio tem um.
   *
   * Fora da janela de 24 horas, texto livre é recusado pelo WhatsApp. Com este
   * nome, a mensagem sai como template; sem ele, ela é recusada aqui — com
   * motivo — em vez de ser recusada lá, em silêncio.
   *
   * Vem de `crc_templates.provider_nome`. Ter o modelo no CRC não basta: sem
   * aprovação, o nome não existe do outro lado.
   */
  providerNome?: string | null;
  /**
   * As variáveis do template, na ordem em que ele as espera.
   *
   * Só usadas quando a mensagem sai como template. O texto renderizado continua
   * sendo `texto`, e é ele que fica em `crc_messages` — a Inbox mostra o que o
   * paciente leu, não o nome do modelo.
   */
  variaveisTemplate?: readonly string[];
  porta: PortaMensageria;
  configuracao?: ConfiguracaoCrc;
  /**
   * O relógio da decisão. O motor de jornadas já recebe um "agora" para calcular
   * as esperas; se a política de contato usasse o relógio de parede em vez dele,
   * o mesmo passo poderia agendar para as 9h e, um instante depois, julgar o
   * horário comercial com outro "agora". Um só relógio por execução.
   */
  agora?: Date;
};

export type ResultadoEnvioMensagem =
  | { ok: true; mensagemId: string; providerMessageId: string }
  | {
      ok: false;
      codigo: string;
      motivo: string;
      reagendarPara?: Date;
      /** "Não tente de novo sozinho." Inclui a falha incerta — ver `classe`. */
      permanente: boolean;
      /**
       * A classificação fina, quando a falha veio do provedor.
       *
       * Ausente quando a recusa foi NOSSA — opt-out, cooldown, janela fechada,
       * dono da conversa. Nesses casos não houve pedido, então não há entrega
       * incerta possível, e inventar uma classe daria a impressão de que houve.
       */
      classe?: import("../integracoes/whatsapp/porta").ClasseDeFalha;
    };

/**
 * O instante da última mensagem RECEBIDA do paciente nesta conversa.
 *
 * Mensagem que NÓS enviamos não reabre a janela — por isso o filtro por direção.
 * Sem `conversationId` não há janela para consultar, e o envio é tratado como
 * fora dela: é o caso da campanha, que é proativa por definição.
 */
async function ultimaEntradaDaConversa(pedido: PedidoEnvio): Promise<string | null> {
  if (pedido.conversationId === undefined) return null;

  const l = await selecionarUm("crc_messages", {
    colunas: "criado_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
      { coluna: "conversation_id", op: "eq", valor: pedido.conversationId },
      // `ENTRADA`, e não `IN`: o filtro anterior nunca casava com linha nenhuma,
      // e o efeito era a janela de 24 horas SEMPRE parecer fechada. Num provedor
      // que exige template fora dela, isso é o agente nunca poder responder.
      { coluna: "direcao", op: "eq", valor: "ENTRADA" },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
  });

  return typeof l?.["criado_em"] === "string" ? l["criado_em"] : null;
}

/**
 * Relê o dono da conversa e recusa o envio da IA quando ela não manda mais.
 *
 * DEVOLVE RECUSA PERMANENTE de propósito. Um envio recusado por dono não deve
 * voltar para a fila: a conversa passou para uma pessoa, e reagendar significaria
 * a IA tentar de novo daqui a pouco — exatamente o que não pode acontecer.
 *
 * FALHA DE LEITURA NÃO LIBERA O ENVIO. Se a consulta quebrar, a resposta é
 * recusar: entre calar indevidamente e falar por cima de um atendente, calar é o
 * erro barato. A recusa fica registrada com o motivo.
 */
async function recusarSeAIaPerdeuAConversa(
  pedido: PedidoEnvio,
): Promise<ResultadoEnvioMensagem | null> {
  if (pedido.remetente !== "ia") return null;
  // Sem conversa não há dono a consultar. Envio da IA sem conversa não existe
  // hoje — o turno sempre tem uma —, e se um dia existir, ele não é resposta a
  // ninguém e não tem como atropelar atendente nenhum.
  if (pedido.conversationId === undefined) return null;

  let dono: string;
  try {
    const { donoDaConversa } = await import("./casos");
    dono = (await donoDaConversa(pedido.organizationId, pedido.conversationId)).dono;
  } catch (erro) {
    registrar("erro", "Não foi possível reler o dono da conversa; envio da IA recusado.", {
      organizationId: pedido.organizationId,
      conversationId: pedido.conversationId,
      detalhe: descreverErro(erro),
    });
    return {
      ok: false,
      codigo: "DONO_INDISPONIVEL",
      motivo: "Não foi possível confirmar quem responde esta conversa.",
      permanente: true,
    };
  }

  if (dono === "ia") return null;

  registrar("aviso", "A IA tentou enviar numa conversa que não é mais dela.", {
    organizationId: pedido.organizationId,
    conversationId: pedido.conversationId,
    dono,
  });

  return {
    ok: false,
    codigo: dono === "humano" ? "CONVERSA_ASSUMIDA" : "IA_PAUSADA",
    motivo:
      dono === "humano"
        ? "Um atendente assumiu esta conversa enquanto a IA pensava."
        : "A IA está pausada nesta conversa.",
    permanente: true,
  };
}

export async function enviarMensagem(pedido: PedidoEnvio): Promise<ResultadoEnvioMensagem> {
  /*
   * ========================================================================
   *  O HORÁRIO É O DA UNIDADE, e é resolvido AQUI — no chokepoint.
   *
   *  Todo envio do sistema passa por esta função. Resolver a configuração de
   *  clínica no chamador protegeria aquele chamador; aqui, protege também o
   *  próximo — a campanha, o reprocessamento, a tela que ainda vai existir.
   *  É o mesmo argumento da releitura de dono, algumas linhas abaixo.
   *
   *  SEM `clinicId`, NADA MUDA: a configuração que o chamador passou vale como
   *  sempre valeu, e não há leitura extra. O custo da terceira camada é pago só
   *  por quem tem mais de uma unidade.
   * ========================================================================
   */
  const { comOverrideDaClinica } = await import("../servidor/configuracao");
  const cfg = await comOverrideDaClinica(
    pedido.configuracao ?? CONFIGURACAO_PADRAO,
    pedido.organizationId,
    pedido.clinicId,
  );

  /*
   * O DONO É RELIDO AQUI, no último instante antes de gravar — Fase C.
   *
   * NÃO É A PRIMEIRA CHECAGEM, e é importante ser exato sobre isso: o turno já
   * relê o dono na hora de avaliar os portões, depois da chamada de modelo. O
   * que esta aqui acrescenta são duas coisas diferentes.
   *
   * A PRIMEIRA é a janela que sobra entre aquela leitura e a gravação: a busca
   * do destino, a política de contato, as idas e voltas ao PostgREST. É estreita
   * — e uma janela estreita numa Inbox movimentada continua sendo uma janela.
   *
   * A SEGUNDA, que vale mais: aqui é o chokepoint. Todo envio do sistema passa
   * por esta função. Uma regra escrita no chamador protege aquele chamador;
   * escrita aqui, protege também o próximo — a campanha, o reprocessamento, a
   * tela que alguém ainda vai construir e que não vai lembrar de conferir dono.
   *
   * SÓ VALE PARA `ia`. `atendente` é a pessoa que assumiu, e `automacao` é
   * jornada agendada, que roda por outra decisão e tem outros portões.
   */
  const recusa = await recusarSeAIaPerdeuAConversa(pedido);
  if (recusa !== null) return recusa;

  if (pedido.proativo) {
    // ATENÇÃO À CONDIÇÃO. Antes ela era `patientId !== null`, e o efeito era um
    // buraco: qualquer envio proativo sem paciente — um lead que acabou de
    // preencher o formulário, por exemplo — passava por FORA da política
    // inteira. Sem opt-out, sem horário comercial, sem teto. Quem não tem ficha
    // de paciente é justamente quem menos consentiu em receber mensagem.
    const veredicto =
      pedido.patientId !== null
        ? await avaliarPoliticaDeContato(
            pedido.organizationId,
            pedido.patientId,
            cfg,
            pedido.agora ?? new Date(),
          )
        : await avaliarPoliticaPorTelefone(
            pedido.organizationId,
            pedido.telefone,
            cfg,
            pedido.agora ?? new Date(),
          );
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

  /*
   * A JANELA DE 24 HORAS — a regra que este arquivo ignorava.
   *
   * Até aqui, TODO envio chamava `enviarTexto`. `enviarTemplate` existia na
   * porta e nos três adapters e nunca era chamado. O efeito em produção seria
   * este: campanha e automação proativa produzindo mensagem que a Meta recusa
   * com 131047, sem nada aparecer na tela — porque do nosso lado o envio
   * "funcionou".
   *
   * A decisão é do domínio (`dominio/janela-whatsapp.ts`, puro e testado); aqui
   * só se executa o que ela mandou.
   */
  //
  // A CAPACIDADE É DO CANAL. Sandbox e canais não-oficiais não aplicam a janela
  // da Meta; inventar a restrição para eles recusaria envio que funcionaria.
  const ultimaEntrada = pedido.porta.exigeTemplateForaDaJanela
    ? await ultimaEntradaDaConversa(pedido)
    : null;
  const forma = pedido.porta.exigeTemplateForaDaJanela
    ? comoEnviar({
        // O relógio do pedido, e não o de parede: o motor de jornadas já decide a
        // espera com um "agora" próprio, e julgar a janela com outro instante
        // produziria duas verdades no mesmo envio.
        janela: estadoDaJanela(ultimaEntrada, pedido.agora ?? new Date()),
        providerNome: pedido.providerNome ?? null,
      })
    : ({ forma: "texto" } as const);

  if (forma.forma === "recusado") {
    await atualizar(
      "crc_messages",
      [
        { coluna: "id", op: "eq", valor: mensagemId },
        { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
      ],
      {
        status_entrega: "FAILED",
        erro: `${forma.codigo}: ${forma.motivo}`,
      },
    );
    return {
      ok: false,
      codigo: forma.codigo,
      motivo: forma.motivo,
      // PERMANENTE: insistir não abre a janela. O que resolve é um modelo
      // aprovado, e isso é decisão de gente, não retentativa.
      permanente: true,
    };
  }

  const resultado =
    forma.forma === "template"
      ? await pedido.porta.enviarTemplate({
          destino: { telefone: pedido.telefone },
          template: forma.providerNome,
          variaveis: [...(pedido.variaveisTemplate ?? [])],
          textoRenderizado: pedido.texto,
          chaveDedupe: pedido.chaveDedupe,
        })
      : await pedido.porta.enviarTexto({
          destino: { telefone: pedido.telefone },
          texto: pedido.texto,
          chaveDedupe: pedido.chaveDedupe,
        });

  if (!resultado.ok) {
    /*
     * ========================================================================
     *  O ESTADO QUE FALTAVA: `DESCONHECIDO`.
     *
     *  `FAILED` diz "não foi". Quando o POST saiu e a resposta não voltou, isso
     *  é mentira — pode ter ido. Marcar como falha faz a Inbox mostrar "não
     *  enviada" para uma mensagem que o paciente talvez tenha recebido, e é a
     *  partir dessa leitura errada que alguém manda de novo à mão.
     * ========================================================================
     */
    const incerta = resultado.classe === "incerta";

    await atualizar(
      "crc_messages",
      [
        { coluna: "id", op: "eq", valor: mensagemId },
        { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
      ],
      {
        status_entrega: incerta ? "DESCONHECIDO" : "FAILED",
        erro: `${resultado.codigo}: ${resultado.detalhe}`,
      },
    );

    /*
     * SÓ A FALHA TRANSITÓRIA LIBERA A CHAVE DE DEDUPE, e a palavra "só" é o
     * conserto.
     *
     * Sem liberar, uma queda momentânea do provedor bloquearia a mensagem para
     * sempre: a linha ficaria ocupando a chave única e a retentativa seria
     * recusada como "já enviada".
     *
     * Mas liberar na falha INCERTA reabre a porta que o HTTP tinha fechado: o
     * pedido saiu, a Meta pode ter aceitado, e a próxima tentativa manda a
     * segunda mensagem. Entre "o paciente talvez não receba" e "o paciente
     * recebe duas vezes", o segundo é pior — ele é visível, parece descuido, e
     * não há como desfazer.
     *
     * A mensagem incerta não fica órfã: ela está `DESCONHECIDO` na Inbox, com o
     * erro, para uma pessoa decidir. É uma decisão que exige olhar a conversa, e
     * é por isso que ela é de gente.
     */
    if (resultado.classe === "transitoria") {
      await atualizar(
        "crc_messages",
        [
          { coluna: "id", op: "eq", valor: mensagemId },
          { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
        ],
        {
          chave_dedupe: null,
        },
      );
    }

    registrar(incerta ? "erro" : "aviso", "Envio de mensagem falhou.", {
      organizationId: pedido.organizationId,
      mensagemId,
      codigo: resultado.codigo,
      classe: resultado.classe,
    });

    return {
      ok: false,
      codigo: resultado.codigo,
      motivo: resultado.detalhe,
      /*
       * INCERTA CONTA COMO PERMANENTE para quem chama, e isso é deliberado:
       * `permanente` aqui significa "não tente de novo sozinho", que é
       * exatamente o que se quer. Quem precisa da distinção fina lê `classe`.
       */
      permanente: resultado.classe !== "transitoria",
      classe: resultado.classe,
    };
  }

  const agora = new Date().toISOString();
  await atualizar(
    "crc_messages",
    [
      { coluna: "id", op: "eq", valor: mensagemId },
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
    ],
    {
      status_entrega: "SENT",
      provider_message_id: resultado.providerMessageId,
      enviado_em: agora,
    },
  );

  await atualizar(
    "crc_conversations",
    [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
    ],
    {
      ultima_mensagem_em: agora,
      ultima_mensagem_trecho: truncar(pedido.texto, 120),
      status: pedido.proativo ? "AGUARDANDO" : "ABERTA",
      atualizado_em: agora,
    },
  );

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
/**
 * A mesma política, para quem ainda não é paciente.
 *
 * O caso que existe hoje é o lead: alguém preencheu o formulário e deu o
 * telefone, mas não tem ficha no Dental Office. A tentação seria mandar a
 * primeira resposta direto, "porque ele pediu contato". Duas coisas impedem:
 *
 *   O TELEFONE PODE SER DE UM PACIENTE QUE PEDIU PARA PARAR. Um opt-out vale
 *   para o número, não para o cadastro — e ignorar isso porque o formulário
 *   chegou por outro caminho seria contornar o pedido dele por tecnicalidade.
 *
 *   ÀS 2H DA MANHÃ CONTINUA SENDO 2H DA MANHÃ. Formulário preenchido de
 *   madrugada não autoriza WhatsApp de madrugada.
 *
 * Por isso ela monta o MESMO `ContextoContato` e chama a MESMA `podeContatar`.
 * Uma política, duas portas de entrada — duas implementações divergiriam no
 * primeiro ajuste que alguém fizesse só de um lado.
 */
export async function avaliarPoliticaPorTelefone(
  organizationId: string,
  telefoneBruto: string,
  cfg: ConfiguracaoCrc,
  agora = new Date(),
): Promise<ReturnType<typeof podeContatar>> {
  const telefone = normalizarTelefone(telefoneBruto);
  if (telefone === null) {
    return { pode: false, codigo: "SEM_TELEFONE", motivo: "Telefone inválido." };
  }

  // Qualquer paciente com este número, em qualquer variação do nono dígito.
  const candidatos = await buscarPacientesPorTelefone(
    organizationId,
    variacoesDeTelefone(telefone),
  );
  const comOptOut = candidatos.find((p) => p.optOutEm !== null);
  if (comOptOut !== undefined) {
    return {
      pode: false,
      codigo: "OPT_OUT",
      motivo: "Este número pediu para não receber mensagens.",
    };
  }

  const conversa = await selecionarUm("crc_conversations", {
    colunas: "id,assigned_to",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "contato_externo", op: "in", valor: variacoesDeTelefone(telefone) },
    ],
    ordenar: [{ coluna: "ultima_mensagem_em", ascendente: false }],
  });

  const conversaId = typeof conversa?.["id"] === "string" ? conversa["id"] : null;

  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);

  const contatosHoje =
    conversaId === null
      ? 0
      : await contar("crc_messages", [
          { coluna: "organization_id", op: "eq", valor: organizationId },
          { coluna: "conversation_id", op: "eq", valor: conversaId },
          { coluna: "direcao", op: "eq", valor: "SAIDA" },
          { coluna: "remetente", op: "in", valor: ["automacao", "ia"] },
          { coluna: "criado_em", op: "gte", valor: inicioDoDia.toISOString() },
        ]);

  const umaHoraAtras = new Date(agora.getTime() - 3_600_000).toISOString();
  const enviosNaUltimaHora = await contar("crc_messages", [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "direcao", op: "eq", valor: "SAIDA" },
    { coluna: "remetente", op: "in", valor: ["automacao", "ia"] },
    { coluna: "criado_em", op: "gte", valor: umaHoraAtras },
  ]);

  return podeContatar(
    {
      optOutEm: null,
      telefone,
      contatosHoje,
      // Sem histórico de contato próprio: o cooldown por pessoa não se aplica a
      // quem está sendo respondido pela primeira vez.
      horasDesdeUltimoContato: null,
      temJornadaAtivaConcorrente: false,
      conversaAtribuidaAHumano:
        typeof conversa?.["assigned_to"] === "string" && conversa["assigned_to"].length > 0,
      enviosNaUltimaHora,
    },
    agora,
    cfg,
    cfg.horarioComercial,
  );
}

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

  // O único contador que NÃO filtra por paciente. Janela deslizante de uma hora
  // sobre a organização inteira: é o teto que impede uma varredura de 800
  // inativos virar 800 mensagens em minutos.
  const umaHoraAtras = new Date(agora.getTime() - 3_600_000).toISOString();
  const enviosNaUltimaHora = await contar("crc_messages", [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "direcao", op: "eq", valor: "SAIDA" },
    { coluna: "remetente", op: "in", valor: ["automacao", "ia"] },
    { coluna: "criado_em", op: "gte", valor: umaHoraAtras },
  ]);

  const ctx: ContextoContato = {
    optOutEm: typeof paciente["opt_out_em"] === "string" ? paciente["opt_out_em"] : null,
    telefone: typeof paciente["telefone"] === "string" ? paciente["telefone"] : null,
    contatosHoje,
    enviosNaUltimaHora,
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
  /**
   * Os canais a mostrar — §22.
   *
   * ==========================================================================
   *  O FILTRO E POR CANAL, E A INBOX CONTINUA SENDO UMA.
   *
   *  O §22 proibe "Inbox Instagram": a lista e a mesma, e o canal e um FILTRO
   *  dentro dela. A diferenca importa na operacao — quem atende trabalha por
   *  ordem de chegada, e nao por aplicativo. Tres telas fariam a mensagem mais
   *  antiga ficar escondida na aba que ninguem abriu.
   *
   *  Ausente = todos. Lista vazia tambem = todos, e nao "nenhum": uma lista
   *  vazia chega quando a tela desmarca o ultimo filtro, e mostrar zero
   *  conversas ali pareceria defeito.
   * ==========================================================================
   */
  canais?: readonly string[];
  /** Quem manda na conversa: `ia`, `humano` ou `ninguem`. Ausente = todos. */
  donos?: readonly string[];
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

  // Ver o comentario em `FiltroInbox.canais`: lista vazia e "todos".
  if (f.canais !== undefined && f.canais.length > 0) {
    filtros.push({ coluna: "canal", op: "in", valor: [...f.canais] });
  }
  if (f.donos !== undefined && f.donos.length > 0) {
    filtros.push({ coluna: "dono", op: "in", valor: [...f.donos] });
  }

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

/* -------------------------------------------------------------------------- */
/* O envio nos canais da Meta — §7, §15, §22                                  */
/* -------------------------------------------------------------------------- */

/**
 * Responde numa conversa de Instagram ou Messenger.
 *
 * ============================================================================
 *  POR QUE ESTA FUNÇÃO EXISTE, EM VEZ DE UM `if` DENTRO DE `enviarMensagem`.
 *
 *  `enviarMensagem` recebe `telefone: string` e `porta: PortaMensageria`, e
 *  decide a janela com `dominio/janela-whatsapp.ts`. Os três são do WhatsApp:
 *  o destino é um número, a porta fala `{ destino: { telefone } }`, e a janela
 *  resolve template aprovado — que no Instagram não existe.
 *
 *  Enfiar um canal com IGSID ali dentro significaria passar um id de dezessete
 *  dígitos no campo `telefone` e confiar que nenhuma das três camadas o trate
 *  como número. `normalizarTelefone` o trataria: ele tem dígitos suficientes
 *  para parecer um telefone com DDI.
 *
 *  ESTA FUNÇÃO ESPELHA A ESTRUTURA de `enviarMensagem` de propósito — grava
 *  antes de mandar, mesma chave de dedupe, mesmos três estados de falha — e
 *  troca as três peças do WhatsApp pelas equivalentes do canal:
 *
 *    destino     `DestinoCanal` discriminado, de `dominio/canais.ts`
 *    porta       `PortaCanal`, de `integracoes/canais/porta.ts`
 *    política    `avaliarPoliticaDoCanal`, de `dominio/politica-de-canal.ts`
 * ============================================================================
 *
 * ============================================================================
 *  GRAVA ANTES DE MANDAR — a mesma ordem, pela mesma razão.
 *
 *  A linha em `crc_messages` com `chave_dedupe` sob índice único é o que
 *  impede o segundo envio quando dois cliques, duas abas ou duas retentativas
 *  acontecem juntos. A Meta não oferece idempotência de envio: a garantia é
 *  nossa, e ela mora no banco.
 * ============================================================================
 */
export type PedidoNoCanal = {
  organizationId: string;
  clinicId: string;
  conversationId: string;
  patientId: string | null;
  destino: DestinoCanal;
  texto: string;
  /** `atendente` responde; `ia` e `automacao` nunca usam etiqueta humana. */
  quem: "atendente" | "ia" | "automacao";
  autorId: string | null;
  chaveDedupe: string;
  agora?: Date;
};

export async function enviarNoCanal(pedido: PedidoNoCanal): Promise<ResultadoEnvioMensagem> {
  const agora = pedido.agora ?? new Date();

  if (pedido.destino.canal === "whatsapp") {
    /*
     * O WHATSAPP NÃO PASSA POR AQUI, e a recusa é explícita.
     *
     * Ele tem `enviarMensagem`, com janela, template aprovado e política de
     * contato por telefone. Deixar os dois caminhos aceitarem WhatsApp criaria
     * duas verdades sobre a janela de 24 horas — e a divergência apareceria
     * como "a campanha manda template e a Inbox manda texto".
     */
    return {
      ok: false,
      codigo: "CANAL_ERRADO",
      motivo: "WhatsApp é enviado por `enviarMensagem`, que tem a janela e o modelo aprovado.",
      permanente: true,
    };
  }

  const canal = pedido.destino.canal;

  /* ---------------------------------------------------------------------- */
  /* 1. A PORTA — e ela pode não existir                                    */
  /* ---------------------------------------------------------------------- */

  const { criarPortaDaMeta } = await import("../integracoes/meta/provedores");
  const estado = await criarPortaDaMeta(canal, pedido.organizationId, pedido.clinicId);

  if (!estado.configurado) {
    return {
      ok: false,
      codigo: "INTEGRACAO_NAO_CONFIGURADA",
      motivo: `${estado.motivo} Falta configurar: ${estado.faltando.join(", ")}.`,
      permanente: true,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 2. A POLÍTICA DO CANAL — §15                                           */
  /* ---------------------------------------------------------------------- */

  const { avaliarPoliticaDoCanal } = await import("../dominio/politica-de-canal");
  const { humanAgentAprovado } = await import("../integracoes/meta/canais");

  const ultimaEntrada = await ultimaEntradaDaConversaPorId(
    pedido.organizationId,
    pedido.conversationId,
  );

  const decisao = avaliarPoliticaDoCanal({
    canal,
    ultimaMensagemDoUsuario: ultimaEntrada,
    agora,
    tipo: "resposta",
    quem: pedido.quem,
    /*
     * A APROVAÇÃO É DO CANAL CADASTRADO, e `false` quando não há linha.
     *
     * `estado.canal` é `null` no sandbox — e ali `humanAgentAprovado` seria uma
     * afirmação sobre um App Review que não existe. Fora da janela, o sandbox
     * recusa com o mesmo motivo que a produção recusaria sem a feature: é o
     * comportamento que o teste precisa exercitar.
     */
    humanAgentAprovado: estado.canal === null ? false : humanAgentAprovado(estado.canal),
  });

  if (decisao.forma === "PERMITIDO_TEMPLATE") {
    /*
     * TEMPLATE NUM CANAL DA META É CONTRADIÇÃO, e ela é recusada com nome.
     *
     * `avaliarPoliticaDoCanal` só devolve `PERMITIDO_TEMPLATE` para WhatsApp —
     * e o WhatsApp já foi recusado no começo desta função. O tipo não sabe
     * disso, e a saída honesta é dizer o que aconteceu em vez de um `default`
     * silencioso: se isto algum dia disparar, a política mudou e alguém precisa
     * ler o porquê.
     */
    return {
      ok: false,
      codigo: "FORMA_INCOMPATIVEL",
      motivo: `A política devolveu modelo aprovado para ${canal}, que não tem modelos. ${decisao.porque}`,
      permanente: true,
    };
  }

  if (
    decisao.forma !== "PERMITIDO_TEXTO" &&
    decisao.forma !== "PERMITIDO_ETIQUETA_HUMANA" &&
    decisao.forma !== "PERMITIDO_PRIVATE_REPLY"
  ) {
    /*
     * A RECUSA NÃO GRAVA MENSAGEM NENHUMA.
     *
     * Uma linha `FAILED` aqui poluiria a conversa com uma bolha que o paciente
     * nunca recebeu, e a recepção veria "não enviada" sem entender que o
     * problema é a janela. O motivo volta para a tela, que é onde a pessoa pode
     * agir — ligando para o paciente, ou esperando ele escrever.
     */
    return {
      ok: false,
      codigo: decisao.codigo,
      motivo: decisao.porque,
      // Insistir não abre janela. O que abre é a pessoa escrever de novo.
      permanente: true,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* 3. GRAVA, DEPOIS MANDA                                                 */
  /* ---------------------------------------------------------------------- */

  let linha: Linha | null;
  try {
    linha = await inserirIgnorandoDuplicata("crc_messages", {
      organization_id: pedido.organizationId,
      conversation_id: pedido.conversationId,
      patient_id: pedido.patientId,
      direcao: "SAIDA",
      remetente: pedido.quem,
      autor_id: pedido.autorId,
      conteudo: pedido.texto,
      status_entrega: "QUEUED",
      /*
       * O CANAL NÃO VAI NA MENSAGEM, e a ausência é deliberada.
       *
       * `crc_messages` não tem coluna `canal` — ele mora em
       * `crc_conversations.canal`, e uma conversa nunca troca de canal. Copiar o
       * valor para cada mensagem criaria uma segunda verdade, e o dia em que as
       * duas divergissem seria o dia em que uma resposta sai pelo canal errado.
       */
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

  const resultado = await estado.porta.enviar({
    destino: pedido.destino,
    texto: pedido.texto,
    forma:
      decisao.forma === "PERMITIDO_ETIQUETA_HUMANA"
        ? { forma: "etiqueta_humana" }
        : { forma: "texto" },
    chaveDedupe: pedido.chaveDedupe,
  });

  /* ---------------------------------------------------------------------- */
  /* 4. O DESFECHO — e os TRÊS estados, não dois                            */
  /* ---------------------------------------------------------------------- */

  if (!resultado.ok) {
    /*
     * ======================================================================
     *  `DESCONHECIDO` EXISTE PORQUE `FAILED` MENTIRIA — §35.
     *
     *  O POST saiu e a resposta não voltou: a Meta PODE ter entregue. Escrever
     *  "não enviada" na Inbox é a leitura a partir da qual alguém manda de novo
     *  à mão — e o paciente recebe duas vezes.
     *
     *  E SÓ A FALHA TRANSITÓRIA LIBERA A CHAVE DE DEDUPE. Liberar na incerta
     *  reabriria a porta que o HTTP fechou. É a mesma decisão, palavra por
     *  palavra, de `enviarMensagem`.
     * ======================================================================
     */
    const incerta = resultado.classe === "incerta";

    await atualizar(
      "crc_messages",
      [
        { coluna: "id", op: "eq", valor: mensagemId },
        { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
      ],
      {
        status_entrega: incerta ? "DESCONHECIDO" : "FAILED",
        erro: `${resultado.codigo}: ${resultado.detalhe}`,
        ...(resultado.classe === "transitoria" ? { chave_dedupe: null } : {}),
      },
    );

    registrar(incerta ? "erro" : "aviso", "Envio no canal da Meta falhou.", {
      organizationId: pedido.organizationId,
      mensagemId,
      canal,
      codigo: resultado.codigo,
      classe: resultado.classe,
    });

    return {
      ok: false,
      codigo: resultado.codigo,
      motivo: resultado.detalhe,
      permanente: resultado.classe !== "transitoria",
      classe: resultado.classe,
    };
  }

  const quando = agora.toISOString();

  await atualizar(
    "crc_messages",
    [
      { coluna: "id", op: "eq", valor: mensagemId },
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
    ],
    {
      status_entrega: "SENT",
      provider_message_id: resultado.providerMessageId,
      enviado_em: quando,
    },
  );

  await atualizar(
    "crc_conversations",
    [
      { coluna: "id", op: "eq", valor: pedido.conversationId },
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
    ],
    {
      ultima_mensagem_em: quando,
      ultima_mensagem_trecho: truncar(pedido.texto, 120),
      status: "ABERTA",
      atualizado_em: quando,
    },
  );

  await emitir({
    organizationId: pedido.organizationId,
    clinicId: pedido.clinicId,
    tipo: "message.sent",
    entityType: "message",
    entityId: mensagemId,
    payload: { conversationId: pedido.conversationId, patientId: pedido.patientId, canal },
    fingerprint: `message.sent:${mensagemId}`,
  });

  return { ok: true, mensagemId, providerMessageId: resultado.providerMessageId };
}

/**
 * A última mensagem RECEBIDA nesta conversa — a que abre a janela.
 *
 * Gêmea de `ultimaEntradaDaConversa`, que recebe um `PedidoEnvio` inteiro. Aqui
 * o pedido é de outro tipo, e passar um objeto de mentira só para reaproveitar
 * a função esconderia o que de fato é lido.
 *
 * `historico_importado` FICA DE FORA, e isso é o §48 na prática: uma conversa
 * trazida por backfill não abre janela de 24 horas. A Meta conta a janela pelo
 * que a PESSOA mandou de verdade, não pelo que nós importamos depois.
 */
async function ultimaEntradaDaConversaPorId(
  organizationId: string,
  conversationId: string,
): Promise<string | null> {
  const l = await selecionarUm("crc_messages", {
    colunas: "recebido_em,criado_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "conversation_id", op: "eq", valor: conversationId },
      { coluna: "direcao", op: "eq", valor: "ENTRADA" },
      { coluna: "historico_importado", op: "eq", valor: false },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
  });

  if (l === null) return null;

  /*
   * `recebido_em` VENCE `criado_em`, e a diferença importa.
   *
   * `criado_em` é quando NÓS gravamos; `recebido_em` é o `timestamp` que a Meta
   * mandou no webhook. Numa reentrega — que acontece — os dois divergem em
   * horas, e julgar a janela pelo nosso relógio faria uma conversa de ontem
   * parecer recém-aberta.
   */
  const recebido = l["recebido_em"];
  if (typeof recebido === "string" && recebido.length > 0) return recebido;
  return typeof l["criado_em"] === "string" ? l["criado_em"] : null;
}

export { descreverErro };
