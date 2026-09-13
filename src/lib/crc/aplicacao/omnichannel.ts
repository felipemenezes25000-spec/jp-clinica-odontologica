/**
 * Omnichannel — a linha do tempo única, a ligação e a identidade.
 *
 * ============================================================================
 *  O BURACO QUE ISTO FECHA é o mais antigo de qualquer clínica: a mesma pessoa
 *  conversa por WhatsApp, liga, e fala no balcão — e cada canal guarda um
 *  pedaço. Quem atende a ligação não sabe o que foi dito no WhatsApp ontem, e o
 *  paciente repete tudo de novo.
 * ============================================================================
 *
 * ============================================================================
 *  A VOZ ESTÁ `BLOCKED_EXTERNAL`, e este arquivo não finge o contrário.
 *
 *  Não há provedor de voz contratado. `registrarChamada` grava a ligação que
 *  UMA PESSOA atendeu e anotou — e é isso que faz a tabela ter uso hoje, em vez
 *  de esperar uma integração que pode não vir.
 *
 *  No dia em que houver provedor, ele escreve nas mesmas colunas com
 *  `provedor: 'twilio'` e `atendido_por: 'ia'`. Nada aqui muda.
 * ============================================================================
 */
import {
  avaliarChamada,
  mediana,
  observar,
  type ContextoDaChamada,
  type IntencaoDaChamada,
  type NumerosDoAtendimento,
  type Observacao,
} from "../dominio/atendimento";
import {
  compararCadastros,
  normalizar,
  resolver,
  type Candidato,
  type ParaComparar,
  type Resolucao,
  type SuspeitaDeDuplicata,
  type TipoDeIdentidade,
} from "../dominio/identidade";
import {
  agoraIso,
  inserir,
  inserirIgnorandoDuplicata,
  rpc,
  selecionar,
  type Filtro,
} from "../servidor/banco";
import { registrar } from "../servidor/registro";

/* -------------------------------------------------------------------------- */
/* A linha do tempo                                                           */
/* -------------------------------------------------------------------------- */

export type ItemDaLinhaDoTempo = {
  tipo: string;
  ocorridoEm: string;
  titulo: string;
  detalhe: string | null;
  canal: string;
  referencia: string;
};

/**
 * Tudo que aconteceu com esta pessoa, em ordem.
 *
 * A CONSULTA É UMA SÓ, no banco. Do lado da aplicação seriam cinco leituras e
 * uma ordenação em memória — e num paciente antigo, com 400 mensagens e 30
 * consultas, isso significa trazer 430 linhas para mostrar 30.
 */
export async function linhaDoTempo(
  organizationId: string,
  patientId: string,
  limite = 40,
): Promise<ItemDaLinhaDoTempo[]> {
  const linhas = await rpc<{
    tipo: string;
    ocorrido_em: string;
    titulo: string;
    detalhe: string | null;
    canal: string;
    referencia: string;
  }>("crc_linha_do_tempo", {
    p_organization_id: organizationId,
    p_patient_id: patientId,
    p_limite: limite,
  });

  return linhas.map((l) => ({
    tipo: l.tipo,
    ocorridoEm: l.ocorrido_em,
    titulo: l.titulo,
    detalhe: l.detalhe,
    canal: l.canal,
    referencia: l.referencia,
  }));
}

/* -------------------------------------------------------------------------- */
/* As chamadas                                                                */
/* -------------------------------------------------------------------------- */

export type NovaChamada = {
  organizationId: string;
  clinicId: string;
  patientId?: string | null;
  leadId?: string | null;
  conversationId?: string | null;
  direcao: "ENTRADA" | "SAIDA";
  telefone?: string | null;
  iniciadaEm?: string;
  duracaoS?: number | null;
  desfecho?: "ATENDIDA" | "NAO_ATENDIDA" | "OCUPADO" | "CAIXA_POSTAL" | "FALHOU";
  userId?: string | null;
  /** O que se entendeu que a pessoa queria. */
  intencao?: IntencaoDaChamada;
  resumo?: string | null;
  transcricao?: string | null;
  /* Os sinais que a avaliação usa. Vêm de quem anotou. */
  ofereceuHorario?: boolean;
  marcouConsulta?: boolean;
  deixouProximoPasso?: boolean;
  transferida?: boolean;
  provedor?: string;
  externalId?: string | null;
  chaveDedupe?: string | null;
};

/**
 * Dias que a transcrição sobrevive.
 *
 * ============================================================================
 *  NOVENTA DIAS, E A RETENÇÃO NÃO É OPCIONAL.
 *
 *  Transcrição de ligação de paciente carrega conteúdo clínico que ninguém
 *  pediu para guardar — a pessoa descreveu um sintoma, mencionou um remédio,
 *  falou de um medo. Guardar isso para sempre é o erro padrão de todo sistema
 *  de call intelligence.
 *
 *  O RESUMO SOBREVIVE. É ele que a linha do tempo mostra depois, e ele é uma
 *  frase administrativa — "queria remarcar para a semana que vem" — em vez da
 *  conversa inteira.
 * ============================================================================
 */
export const RETENCAO_DA_TRANSCRICAO_DIAS = 90;

export async function registrarChamada(c: NovaChamada): Promise<string | null> {
  const agora = c.iniciadaEm ?? agoraIso();
  const atendida = (c.desfecho ?? "ATENDIDA") === "ATENDIDA";

  const ctx: ContextoDaChamada = {
    intencao: c.intencao ?? "OUTRO",
    atendida,
    duracaoS: c.duracaoS ?? null,
    ofereceuHorario: c.ofereceuHorario === true,
    marcouConsulta: c.marcouConsulta === true,
    deixouProximoPasso: c.deixouProximoPasso === true,
    transferida: c.transferida === true,
  };

  const avaliacao = avaliarChamada(ctx);

  const linha = await inserirIgnorandoDuplicata("crc_calls", {
    organization_id: c.organizationId,
    clinic_id: c.clinicId,
    patient_id: c.patientId ?? null,
    lead_id: c.leadId ?? null,
    conversation_id: c.conversationId ?? null,
    direcao: c.direcao,
    provedor: c.provedor ?? "manual",
    external_id: c.externalId ?? null,
    telefone: c.telefone ?? null,
    iniciada_em: agora,
    duracao_s: c.duracaoS ?? null,
    desfecho: c.desfecho ?? "ATENDIDA",
    atendido_por: "humano",
    user_id: c.userId ?? null,
    transcricao: c.transcricao ?? null,
    // A data de expiração é gravada JUNTO com a transcrição. Calculá-la depois,
    // numa varredura, deixaria uma janela em que a transcrição existe sem prazo
    // — e o que não tem prazo não é podado.
    transcricao_expira_em:
      typeof c.transcricao === "string" && c.transcricao.length > 0
        ? new Date(Date.parse(agora) + RETENCAO_DA_TRANSCRICAO_DIAS * 86_400_000).toISOString()
        : null,
    resumo: c.resumo ?? null,
    intencao: c.intencao ?? null,
    oportunidade_perdida: avaliacao.oportunidadePerdida,
    motivo_perda: avaliacao.motivoPerda,
    score_atendimento: avaliacao.score,
    chave_dedupe: c.chaveDedupe ?? null,
  });

  return linha === null ? null : String(linha["id"] ?? "");
}

/**
 * Poda as transcrições vencidas.
 *
 * APAGA O TEXTO E MANTÉM A LINHA. A chamada continua na linha do tempo com o
 * resumo, a duração e o desfecho — some só o conteúdo bruto, que era o que
 * exigia base legal para existir.
 */
export async function podarTranscricoes(
  organizationId: string,
  agora: Date = new Date(),
): Promise<number> {
  const { atualizar } = await import("../servidor/banco");

  const vencidas = await selecionar<{ id: string }>("crc_calls", {
    colunas: "id",
    filtros: [
      { coluna: "transcricao", op: "not.is", valor: null },
      { coluna: "transcricao_expira_em", op: "lte", valor: agora.toISOString() },
    ],
    limite: 500,
  });

  let podadas = 0;
  for (const v of vencidas) {
    await atualizar(
      "crc_calls",
      [
        { coluna: "id", op: "eq", valor: v.id },
        { coluna: "organization_id", op: "eq", valor: organizationId },
      ],
      {
        transcricao: null,
        transcricao_expira_em: null,
        atualizado_em: agora.toISOString(),
      },
    );
    podadas += 1;
  }

  if (podadas > 0) {
    registrar("info", "Transcrições de chamada podadas por retenção.", { podadas });
  }

  return podadas;
}

/* -------------------------------------------------------------------------- */
/* O contato de balcão                                                        */
/* -------------------------------------------------------------------------- */

export async function registrarContato(c: {
  organizationId: string;
  clinicId: string;
  patientId: string;
  canal?: "BALCAO" | "EMAIL" | "PRESENCIAL" | "OUTRO";
  texto: string;
  userId?: string | null;
  ocorridoEm?: string;
}): Promise<void> {
  await inserir("crc_contact_log", {
    organization_id: c.organizationId,
    clinic_id: c.clinicId,
    patient_id: c.patientId,
    canal: c.canal ?? "BALCAO",
    texto: c.texto,
    user_id: c.userId ?? null,
    ocorrido_em: c.ocorridoEm ?? agoraIso(),
  });
}

/* -------------------------------------------------------------------------- */
/* A identidade                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Registra um identificador de um paciente.
 *
 * MARCA COMO COMPARTILHADO quando o mesmo valor já pertence a outra pessoa — e
 * marca NOS DOIS LADOS. É o caso do telefone de família, e ele só protege se
 * ambas as linhas souberem que são ambíguas: marcar apenas a nova deixaria a
 * antiga resolvendo sozinha para sempre.
 */
export async function registrarIdentidade(
  organizationId: string,
  patientId: string,
  tipo: TipoDeIdentidade,
  bruto: string,
): Promise<boolean> {
  const valor = normalizar(tipo, bruto);
  if (valor === null) return false;

  const outros = await selecionar<{ id: string; patient_id: string }>("crc_patient_identities", {
    colunas: "id,patient_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "tipo", op: "eq", valor: tipo },
      { coluna: "valor", op: "eq", valor },
    ],
    limite: 20,
  });

  const deOutraPessoa = outros.filter((o) => o.patient_id !== patientId);
  const compartilhada = deOutraPessoa.length > 0;

  const linha = await inserirIgnorandoDuplicata("crc_patient_identities", {
    organization_id: organizationId,
    patient_id: patientId,
    tipo,
    valor,
    compartilhada,
  });

  if (compartilhada) {
    const { atualizar } = await import("../servidor/banco");

    // Os que já existiam também passam a ser ambíguos. Sem isto, a linha antiga
    // continuaria resolvendo sozinha e a proteção valeria só para a nova.
    await atualizar(
      "crc_patient_identities",
      [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "tipo", op: "eq", valor: tipo },
        { coluna: "valor", op: "eq", valor },
      ],
      { compartilhada: true },
    );

    registrar("info", "Identificador compartilhado entre pacientes.", {
      organizationId,
      tipo,
      pacientes: deOutraPessoa.length + 1,
    });
  }

  return linha !== null;
}

/**
 * Quem é dono deste identificador?
 *
 * Devolve a resolução do domínio — que pode ser `AMBIGUO`, e frequentemente é.
 */
export async function quemE(
  organizationId: string,
  tipo: TipoDeIdentidade,
  bruto: string,
): Promise<Resolucao> {
  const valor = normalizar(tipo, bruto);
  if (valor === null) {
    return { tipo: "NENHUM", porque: "O identificador informado não é válido." };
  }

  const linhas = await selecionar<{
    patient_id: string;
    compartilhada: boolean;
    confirmada_em: string | null;
  }>("crc_patient_identities", {
    colunas: "patient_id,compartilhada,confirmada_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "tipo", op: "eq", valor: tipo },
      { coluna: "valor", op: "eq", valor },
    ],
    limite: 20,
  });

  if (linhas.length === 0) {
    return { tipo: "NENHUM", porque: "Nenhum paciente casa com este identificador." };
  }

  const nomes = await nomesDe(
    organizationId,
    linhas.map((l) => l.patient_id),
  );

  const candidatos: Candidato[] = linhas.map((l) => ({
    patientId: l.patient_id,
    nome: nomes.get(l.patient_id) ?? "Paciente sem nome",
    porQual: tipo,
    compartilhado: l.compartilhada,
    confirmado: l.confirmada_em !== null,
  }));

  return resolver(candidatos);
}

async function nomesDe(
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const linhas = await selecionar<{ id: string; nome: string }>("crc_patients", {
    colunas: "id,nome",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "in", valor: [...new Set(ids)] },
    ],
    limite: 50,
  });

  return new Map(linhas.map((p) => [p.id, p.nome]));
}

/* -------------------------------------------------------------------------- */
/* Duplicados                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Procura cadastros suspeitos de serem a mesma pessoa.
 *
 * ============================================================================
 *  NUNCA FUNDE. Devolve suspeitas para alguém olhar.
 *
 *  O §64 pede "não merge automático de baixa confiança". A leitura correta é
 *  mais dura: não há merge automático de confiança NENHUMA. Uma fusão errada
 *  junta dois prontuários e apaga a fronteira entre eles, e não há desfazer; um
 *  clique a mais custa três segundos.
 * ============================================================================
 *
 * A COMPARAÇÃO É AOS PARES DENTRO DA PÁGINA, e não contra a base inteira: o
 * custo cresce com o quadrado. A página é pequena e o cursor avança — a
 * varredura completa acontece ao longo de várias voltas, e isso é aceitável
 * para um trabalho que nunca é urgente.
 */
export async function procurarDuplicados(
  organizationId: string,
  cursor: string | null,
  pagina = 200,
): Promise<{ suspeitas: SuspeitaDeDuplicata[]; ultimoId: string | null; fechou: boolean }> {
  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "arquivado", op: "eq", valor: false },
  ];
  if (cursor !== null) filtros.push({ coluna: "id", op: "gt", valor: cursor });

  const linhas = await selecionar<{
    id: string;
    nome: string;
    telefone: string | null;
    email: string | null;
    external_id: string | null;
  }>("crc_patients", {
    colunas: "id,nome,telefone,email,external_id",
    filtros,
    ordenar: [{ coluna: "id", ascendente: true }],
    limite: pagina,
  });

  const cadastros: ParaComparar[] = linhas.map((l) => ({
    patientId: l.id,
    nome: l.nome,
    telefone: l.telefone === null ? null : normalizar("TELEFONE", l.telefone),
    email: l.email === null ? null : normalizar("EMAIL", l.email),
    // A base ainda não tem coluna de documento; quando tiver, entra aqui.
    documento: null,
    externalId: l.external_id,
  }));

  const suspeitas: SuspeitaDeDuplicata[] = [];

  for (let i = 0; i < cadastros.length; i += 1) {
    for (let j = i + 1; j < cadastros.length; j += 1) {
      const a = cadastros[i];
      const b = cadastros[j];
      if (a === undefined || b === undefined) continue;

      const s = compararCadastros(a, b);
      if (s !== null) suspeitas.push(s);
    }
  }

  suspeitas.sort((x, y) => y.confianca - x.confianca);

  return {
    suspeitas,
    ultimoId: linhas[linhas.length - 1]?.id ?? null,
    fechou: linhas.length < pagina,
  };
}

/* -------------------------------------------------------------------------- */
/* O painel da recepção                                                       */
/* -------------------------------------------------------------------------- */

export type PainelDoAtendimento = {
  numeros: NumerosDoAtendimento;
  observacoes: Observacao[];
};

/**
 * Os números do atendimento no período.
 *
 * TUDO POR CLÍNICA E PERÍODO, NUNCA POR PESSOA. Ver o cabeçalho de
 * `dominio/atendimento.ts`: um agregado com nome vira ranking, e ranking de
 * atendente numa clínica pequena faz a pessoa parar de registrar o que correu
 * mal.
 */
export async function painelDoAtendimento(
  organizationId: string,
  clinicIds: readonly string[] | null,
  desde: string,
): Promise<PainelDoAtendimento> {
  if (clinicIds !== null && clinicIds.length === 0) {
    return {
      numeros: {
        chamadas: 0,
        naoAtendidas: 0,
        semOferta: 0,
        marcadas: 0,
        medianaDeResposta: null,
        semResposta: 0,
        leadsParados: 0,
      },
      observacoes: observar({
        chamadas: 0,
        naoAtendidas: 0,
        semOferta: 0,
        marcadas: 0,
        medianaDeResposta: null,
        semResposta: 0,
        leadsParados: 0,
      }),
    };
  }

  const escopo: Filtro[] = [{ coluna: "organization_id", op: "eq", valor: organizationId }];
  if (clinicIds !== null) escopo.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  const chamadas = await selecionar<{
    desfecho: string;
    oportunidade_perdida: boolean;
    intencao: string | null;
  }>("crc_calls", {
    colunas: "desfecho,oportunidade_perdida,intencao",
    filtros: [...escopo, { coluna: "iniciada_em", op: "gte", valor: desde }],
    limite: 2000,
  });

  const numeros: NumerosDoAtendimento = {
    chamadas: chamadas.length,
    naoAtendidas: chamadas.filter((c) => c.desfecho !== "ATENDIDA").length,
    semOferta: chamadas.filter((c) => c.oportunidade_perdida).length,
    marcadas: chamadas.filter((c) => !c.oportunidade_perdida && c.desfecho === "ATENDIDA").length,
    medianaDeResposta: await medianaDeResposta(organizationId, clinicIds, desde),
    semResposta: await contarSemResposta(organizationId, clinicIds),
    leadsParados: await contarLeadsParados(organizationId, clinicIds),
  };

  return { numeros, observacoes: observar(numeros) };
}

/**
 * A mediana do tempo até a primeira resposta.
 *
 * ============================================================================
 *  A CONTA É FEITA POR CONVERSA, e não por mensagem.
 *
 *  "Tempo de resposta" num fio de vinte mensagens não é a média dos vinte
 *  intervalos: é quanto a pessoa esperou da PRIMEIRA mensagem dela até a
 *  primeira resposta nossa. O resto é conversa acontecendo.
 * ============================================================================
 */
async function medianaDeResposta(
  organizationId: string,
  clinicIds: readonly string[] | null,
  desde: string,
): Promise<number | null> {
  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "criado_em", op: "gte", valor: desde },
  ];

  const mensagens = await selecionar<{
    conversation_id: string;
    direcao: string;
    criado_em: string;
    nota_interna: boolean;
  }>("crc_messages", {
    colunas: "conversation_id,direcao,criado_em,nota_interna",
    filtros,
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 5000,
  });

  const primeiraEntrada = new Map<string, number>();
  const esperas: number[] = [];

  for (const m of mensagens) {
    if (m.nota_interna) continue;

    if (m.direcao === "ENTRADA") {
      // Só a PRIMEIRA de cada conversa: as seguintes são a conversa andando.
      if (!primeiraEntrada.has(m.conversation_id)) {
        primeiraEntrada.set(m.conversation_id, Date.parse(m.criado_em));
      }
      continue;
    }

    const entrada = primeiraEntrada.get(m.conversation_id);
    if (entrada === undefined) continue;

    esperas.push((Date.parse(m.criado_em) - entrada) / 60_000);
    // Consumida: a segunda resposta não conta de novo.
    primeiraEntrada.delete(m.conversation_id);
  }

  // `clinicIds` não filtra aqui porque `crc_messages` não tem `clinic_id` — a
  // clínica está na conversa. O recorte por organização é o que existe, e está
  // dito em vez de simulado.
  void clinicIds;

  return mediana(esperas);
}

async function contarSemResposta(
  organizationId: string,
  clinicIds: readonly string[] | null,
): Promise<number> {
  const { contar } = await import("../servidor/banco");

  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "status", op: "eq", valor: "ABERTA" },
    { coluna: "nao_lidas", op: "gt", valor: 0 },
  ];
  if (clinicIds !== null) filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  return contar("crc_conversations", filtros);
}

async function contarLeadsParados(
  organizationId: string,
  clinicIds: readonly string[] | null,
): Promise<number> {
  const { contar } = await import("../servidor/banco");

  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "status", op: "eq", valor: "NOVO" },
  ];
  if (clinicIds !== null) filtros.push({ coluna: "clinic_id", op: "in", valor: [...clinicIds] });

  return contar("crc_leads", filtros);
}
