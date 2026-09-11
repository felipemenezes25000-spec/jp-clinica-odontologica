/**
 * Marcar consulta de verdade — a ponte que faltava.
 *
 * O ADAPTER DO DENTAL OFFICE JÁ SABIA FAZER ISSO. `horariosDisponiveis`,
 * `criarAgendamento` e `atualizarStatusAgendamento` estavam escritos, testados
 * e sem um único chamador acima deles. O sistema classificava a intenção
 * "AGENDAR" e parava ali, criando tarefa para um humano digitar na outra tela.
 * Este arquivo é o que transforma a intenção em horário ocupado.
 *
 * AS QUATRO REGRAS QUE ESTE MÓDULO EXISTE PARA GARANTIR:
 *
 *   NUNCA INVENTAR HORÁRIO. Toda opção oferecida vem de `horariosDisponiveis`.
 *   O sistema não tem modelo da agenda, não deduz "provavelmente tem vaga às
 *   10h" e não completa lacuna. Se o Dental Office não devolveu, não existe.
 *
 *   REVALIDAR ANTES DE CONFIRMAR. Entre oferecer e o paciente responder passam
 *   minutos ou horas, e nesse meio a recepção marca gente por telefone. Marcar
 *   sobre o que já foi ocupado gera consulta fantasma — dois pacientes, um
 *   horário, e a descoberta acontece na sala de espera. Por isso a reserva
 *   consulta a disponibilidade DE NOVO, imediatamente antes de gravar.
 *
 *   TRÊS TRAVAS ANTES DE ESCREVER NO SISTEMA DA CLÍNICA. Escrita no Dental
 *   Office é a única ação deste produto que altera dado de terceiro. Ela exige
 *   a flag `dental_office_writeback` ligada, o kill switch `kill_escritas_do`
 *   desligado, e — no caminho sem humano — a flag `auto_scheduling`. Qualquer
 *   uma delas barra, e a consequência é uma tarefa humana, nunca um silêncio.
 *
 *   UMA OFERTA ABERTA POR CONVERSA. Duas ofertas simultâneas fazem "pode ser às
 *   10:40" virar loteria entre dois conjuntos de opções. O índice parcial no
 *   banco recusa a segunda — a idempotência mora na tabela, não na disciplina
 *   de quem chama.
 */
import { interpretarEscolha, type Escolha, type OpcaoOferecida } from "../dominio/escolha";
import {
  CONFIGURACAO_PADRAO,
  FLAGS,
  KILL_SWITCHES,
  dentroDoHorario,
  partesLocais,
  type ConfiguracaoCrc,
} from "../dominio/configuracao";
import type { SlotDisponivel } from "../dominio/tipos";
import type { PortaDentalOffice } from "../integracoes/dental-office/cliente";
import {
  atualizar,
  gravar,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
} from "../servidor/banco";
import { auditar, registrar } from "../servidor/registro";

import { emitir } from "./eventos";
import { criarTarefa } from "./tarefas";

/* -------------------------------------------------------------------------- */
/* Contexto                                                                   */
/* -------------------------------------------------------------------------- */

export type ContextoAgendamento = {
  organizationId: string;
  clinicId: string;
  clinicaExternaId: string;
  cliente: PortaDentalOffice;
  configuracao: ConfiguracaoCrc;
  /** Estado das flags e dos kill switches, já lido. */
  flags: Readonly<Record<string, boolean>>;
  interruptores: Readonly<Record<string, boolean>>;
  agora: Date;
};

/** O que o paciente vê, já pronto para entrar na mensagem. */
export type OpcaoDeHorario = OpcaoOferecida & {
  dentistaExternoId: string;
  /** A cadeira em que este horário está livre. Exigida para criar a consulta. */
  cadeiraExternaId: string;
  duracaoMinutos: number;
  fimEm: string;
  dentistaNome: string | null;
  /** "quinta, 10:40" — o texto que vai na mensagem. */
  rotulo: string;
};

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"] as const;

/* -------------------------------------------------------------------------- */
/* Oferecer                                                                   */
/* -------------------------------------------------------------------------- */

export type ResultadoOferta =
  | { ok: true; opcoes: OpcaoDeHorario[]; offerId: string }
  | { ok: false; codigo: MotivoSemOferta; motivo: string };

export type MotivoSemOferta =
  "SEM_DENTISTA" | "SEM_SLOT" | "JA_TEM_CONSULTA" | "OFERTA_ABERTA" | "FALHA_INTEGRACAO";

/**
 * Formata um slot para leitura humana no fuso da clínica.
 *
 * O paciente lê "quinta, 10:40". Ele NUNCA lê ISO, e nunca lê o fuso do
 * servidor — a Vercel roda em UTC, e "13:40" numa mensagem sobre uma consulta
 * das 10:40 é o tipo de erro que ninguém reporta, só deixa de aparecer.
 */
function descreverSlot(slot: SlotDisponivel, fuso: string): OpcaoOferecida & { rotulo: string } {
  const p = partesLocais(new Date(slot.inicioEm), fuso);
  const horaLocal = `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
  const diaLocal = `${String(p.ano)}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
  return {
    inicioEm: slot.inicioEm,
    horaLocal,
    diaLocal,
    rotulo: `${DIAS[p.diaSemana] ?? "dia"}, ${horaLocal}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Consultar                                                                  */
/* -------------------------------------------------------------------------- */

export type ResultadoConsulta =
  | { ok: true; opcoes: OpcaoDeHorario[] }
  | { ok: false; codigo: MotivoSemOferta; motivo: string };

/**
 * O que está livre na agenda, SEM registrar oferta nenhuma.
 *
 * EXTRAÍDA DE `oferecerHorarios` quando o agente ganhou ferramentas: ele
 * precisa poder perguntar "existe horário?" antes de decidir se vai oferecer.
 * Se cada consulta registrasse oferta, a conversa acumularia ofertas abertas
 * que ninguém citou — e a regra de "uma oferta aberta por conversa" passaria a
 * barrar a oferta de verdade.
 *
 * Os dois chamadores compartilham esta função de propósito: o que é "horário
 * livre" precisa ser uma resposta só. Duas implementações divergiriam no
 * primeiro ajuste de janela ou de filtro.
 */
export async function consultarHorariosLivres(
  ctx: ContextoAgendamento,
  pedido: { janelaDias?: number; maximo?: number } = {},
): Promise<ResultadoConsulta> {
  const maximo = Math.min(3, Math.max(1, pedido.maximo ?? 3));

  const dentistas = await dentistasDaClinica(ctx);
  if (dentistas.length === 0) {
    return {
      ok: false,
      codigo: "SEM_DENTISTA",
      motivo: "Nenhum dentista sincronizado para consultar a agenda.",
    };
  }

  /*
   * DIAS À FRENTE, e não um intervalo de datas.
   *
   * A API do Dental Office aceita só `dentist_id` e `next` em
   * `available_hours` — não existe "de 10 a 20 de outubro". Guardar o
   * horizonte como número de dias é o que o adapter consegue cumprir de
   * verdade; um `de`/`ate` aqui seria uma promessa que morre na borda.
   */
  const diasAFrente = pedido.janelaDias ?? 14;

  const encontrados: SlotDisponivel[] = [];
  for (const dentistaExternoId of dentistas) {
    try {
      const slots = await ctx.cliente.horariosDisponiveis({
        clinicaExternaId: ctx.clinicaExternaId,
        dentistaExternoId,
        diasAFrente,
        clinicId: ctx.clinicId,
      });
      encontrados.push(...slots);
    } catch (erro) {
      // Um dentista com agenda indisponível não pode derrubar a consulta
      // inteira: os outros ainda têm horário, e o paciente está esperando.
      registrar("aviso", "Agenda de um dentista não pôde ser lida.", {
        organizationId: ctx.organizationId,
        dentistaExternoId,
        erro: erro instanceof Error ? erro.message : String(erro),
      });
    }
    if (encontrados.length >= maximo * 4) break;
  }

  // Só horário dentro da janela em que a clínica atende. A API pode devolver
  // vaga às 7h de sábado porque a cadeira está livre — não porque a clínica
  // queira marcar ali.
  const validos = encontrados
    .filter((s) => dentroDoHorario(new Date(s.inicioEm), ctx.configuracao.horarioComercial))
    .sort((a, b) => a.inicioEm.localeCompare(b.inicioEm));

  // Um horário por dia, para as opções não serem "10:00, 10:30 e 11:00 da
  // mesma terça" — três variações da mesma resposta.
  const porDia = new Map<string, SlotDisponivel>();
  for (const s of validos) {
    const dia = descreverSlot(s, ctx.configuracao.horarioComercial.fuso).diaLocal;
    if (!porDia.has(dia)) porDia.set(dia, s);
    if (porDia.size >= maximo) break;
  }

  if (porDia.size === 0) {
    return { ok: false, codigo: "SEM_SLOT", motivo: "A agenda não tem horário livre na janela." };
  }

  const nomes = await nomesDosDentistas(ctx);
  return {
    ok: true,
    opcoes: [...porDia.values()].map((s) => ({
      ...descreverSlot(s, ctx.configuracao.horarioComercial.fuso),
      dentistaExternoId: s.dentistaExternoId,
      cadeiraExternaId: s.cadeiraExternaId,
      duracaoMinutos: s.duracaoMinutos,
      fimEm: s.fimEm,
      dentistaNome: nomes.get(s.dentistaExternoId) ?? null,
    })),
  };
}

/**
 * Busca horários reais e registra a oferta.
 *
 * O RECORTE DAS OPÇÕES É PEQUENO DE PROPÓSITO — no máximo três. Uma lista de
 * dez horários numa mensagem de WhatsApp não é escolha, é formulário: o
 * paciente não responde, ou responde "qualquer um", e o ganho de flexibilidade
 * vira perda de resposta. Três cabem numa frase e são fáceis de desempatar
 * quando ele responde só com a hora.
 */
export async function oferecerHorarios(
  ctx: ContextoAgendamento,
  pedido: {
    conversationId: string;
    patientId: string;
    opportunityId?: string | null;
    /** Quantos dias à frente procurar. */
    janelaDias?: number;
    maximo?: number;
  },
): Promise<ResultadoOferta> {
  const maximo = Math.min(3, Math.max(1, pedido.maximo ?? 3));

  // Quem já tem consulta futura não recebe oferta de outra. É o mesmo princípio
  // do peso −20 na fila: oferecer horário a quem já tem é o erro que faz o
  // paciente achar que a clínica não sabe quem ele é.
  const futura = await selecionarUm("crc_appointments", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "patient_id", op: "eq", valor: pedido.patientId },
      { coluna: "inicio_em", op: "gte", valor: ctx.agora.toISOString() },
      { coluna: "status", op: "in", valor: ["TO_CONFIRM", "CONFIRMED", "IN_PROGRESS"] },
    ],
  });
  if (futura !== null) {
    return { ok: false, codigo: "JA_TEM_CONSULTA", motivo: "O paciente já tem consulta marcada." };
  }

  // `exactOptionalPropertyTypes`: passar `janelaDias: undefined` não é o mesmo
  // que omitir a chave, e o compilador está certo em reclamar.
  const consulta = await consultarHorariosLivres(ctx, {
    ...(pedido.janelaDias === undefined ? {} : { janelaDias: pedido.janelaDias }),
    maximo,
  });
  if (!consulta.ok) return consulta;
  const opcoes = consulta.opcoes;

  const linha = await inserirIgnorandoDuplicata("crc_scheduling_offers", {
    organization_id: ctx.organizationId,
    clinic_id: ctx.clinicId,
    conversation_id: pedido.conversationId,
    patient_id: pedido.patientId,
    opportunity_id: pedido.opportunityId ?? null,
    opcoes,
    status: "ABERTA",
    // A oferta vence: horário oferecido há três dias já não vale, e aceitar um
    // vencido produziria exatamente a marcação sobre agenda ocupada que a
    // revalidação existe para evitar.
    expira_em: new Date(ctx.agora.getTime() + 48 * 3_600_000).toISOString(),
  });

  if (linha === null) {
    return {
      ok: false,
      codigo: "OFERTA_ABERTA",
      motivo: "Já existe uma oferta de horário aberta nesta conversa.",
    };
  }

  await auditar({
    organizationId: ctx.organizationId,
    userId: null,
    ator: "automacao",
    acao: "agendamento.oferecido",
    entityType: "conversation",
    entityId: pedido.conversationId,
    depois: { opcoes: opcoes.map((o) => o.inicioEm) },
  });

  return { ok: true, opcoes, offerId: String(linha["id"] ?? "") };
}

/* -------------------------------------------------------------------------- */
/* Aceitar                                                                    */
/* -------------------------------------------------------------------------- */

export type ResultadoReserva =
  | { ok: true; appointmentId: string; externalId: string; opcao: OpcaoDeHorario }
  | { ok: false; codigo: MotivoSemReserva; motivo: string; opcao?: OpcaoDeHorario };

export type MotivoSemReserva =
  | "SEM_OFERTA"
  | "OFERTA_VENCIDA"
  | "ESCOLHA_AMBIGUA"
  | "ESCOLHA_RECUSADA"
  | "NAO_ESCOLHEU"
  | "SLOT_SUMIU"
  | "ESCRITA_DESLIGADA"
  | "RECUSADO_PELA_API";

/**
 * O paciente respondeu; se deu para entender qual horário, marca.
 *
 * O CAMINHO DE FALHA IMPORTA MAIS QUE O DE SUCESSO. Quatro desfechos ruins,
 * todos terminando em gente e nenhum em silêncio: escolha ambígua vira
 * pergunta, recusa vira tarefa, slot ocupado vira nova oferta, e escrita
 * desligada vira tarefa para a recepção marcar na mão.
 */
export async function aceitarHorario(
  ctx: ContextoAgendamento,
  pedido: { conversationId: string; texto: string },
): Promise<ResultadoReserva> {
  const oferta = await selecionarUm("crc_scheduling_offers", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "conversation_id", op: "eq", valor: pedido.conversationId },
      { coluna: "status", op: "eq", valor: "ABERTA" },
    ],
  });
  if (oferta === null) {
    return { ok: false, codigo: "SEM_OFERTA", motivo: "Não há oferta de horário aberta." };
  }

  const expira = String(oferta["expira_em"] ?? "");
  if (expira.length > 0 && new Date(expira).getTime() < ctx.agora.getTime()) {
    await fecharOferta(ctx, String(oferta["id"] ?? ""), "EXPIRADA", null, null);
    return { ok: false, codigo: "OFERTA_VENCIDA", motivo: "A oferta de horário venceu." };
  }

  const opcoes = lerOpcoes(oferta["opcoes"]);
  const escolha: Escolha = interpretarEscolha(pedido.texto, opcoes);

  if (escolha.tipo === "ambigua") {
    return {
      ok: false,
      codigo: "ESCOLHA_AMBIGUA",
      motivo: "Deu para ver que quer marcar, mas não qual horário.",
    };
  }
  if (escolha.tipo === "recusa") {
    await fecharOferta(ctx, String(oferta["id"] ?? ""), "CANCELADA", null, null);
    return { ok: false, codigo: "ESCOLHA_RECUSADA", motivo: "Nenhum dos horários serve." };
  }
  if (escolha.tipo === "nenhuma") {
    return { ok: false, codigo: "NAO_ESCOLHEU", motivo: "A resposta não escolheu um horário." };
  }

  const opcao = opcoes[escolha.indice];
  if (opcao === undefined) {
    return { ok: false, codigo: "NAO_ESCOLHEU", motivo: "Índice fora da oferta." };
  }

  return reservar(ctx, {
    offerId: String(oferta["id"] ?? ""),
    patientId: typeof oferta["patient_id"] === "string" ? oferta["patient_id"] : null,
    opportunityId: typeof oferta["opportunity_id"] === "string" ? oferta["opportunity_id"] : null,
    conversationId: pedido.conversationId,
    opcao,
  });
}

/**
 * Revalida e grava. É a única função do sistema que cria consulta.
 *
 * A REVALIDAÇÃO NÃO É PARANOIA: entre a oferta e o aceite existe uma recepção
 * marcando gente por telefone. A janela é estreita — pede-se a disponibilidade
 * do mesmo dentista no minuto exato — para a chamada ser barata e a resposta,
 * inequívoca.
 */
async function reservar(
  ctx: ContextoAgendamento,
  dados: {
    offerId: string;
    conversationId: string;
    patientId: string | null;
    opportunityId: string | null;
    opcao: OpcaoDeHorario;
  },
): Promise<ResultadoReserva> {
  const { opcao } = dados;

  if (
    ctx.interruptores[KILL_SWITCHES.escritasDentalOffice] === true ||
    ctx.flags[FLAGS.dentalOfficeWriteback] !== true
  ) {
    await tarefaParaMarcarNaMao(ctx, dados, "A escrita no Dental Office está desligada.");
    return {
      ok: false,
      codigo: "ESCRITA_DESLIGADA",
      motivo: "A escrita no Dental Office está desligada.",
      opcao,
    };
  }

  const pacienteExternoId = await externalIdDoPaciente(ctx, dados.patientId);
  if (pacienteExternoId === null) {
    await tarefaParaMarcarNaMao(ctx, dados, "O paciente não tem vínculo com o Dental Office.");
    return { ok: false, codigo: "RECUSADO_PELA_API", motivo: "Paciente sem external_id.", opcao };
  }

  // --- Revalidação ---
  const aindaExiste = await slotAindaLivre(ctx, opcao);
  if (!aindaExiste) {
    await fecharOferta(ctx, dados.offerId, "CANCELADA", null, null);
    return {
      ok: false,
      codigo: "SLOT_SUMIU",
      motivo: "O horário foi ocupado entre a oferta e a resposta.",
      opcao,
    };
  }

  const criado = await ctx.cliente.criarAgendamento({
    clinicaExternaId: ctx.clinicaExternaId,
    pacienteExternoId,
    dentistaExternoId: opcao.dentistaExternoId,
    // A cadeira não é escolha nossa: ela veio junto do horário livre, e a API
    // do Dental Office a exige para criar a consulta.
    cadeiraExternaId: opcao.cadeiraExternaId,
    inicioEm: opcao.inicioEm,
    duracaoMinutos: opcao.duracaoMinutos,
    descricao: "Agendado pelo JP CRC",
  });

  if (!criado.ok) {
    // `SLOT_OCUPADO` é a corrida que a revalidação não pegou — a janela entre
    // conferir e gravar. Rara, mas existe, e o desfecho é o mesmo: nova oferta.
    const codigo = criado.codigo === "SLOT_OCUPADO" ? "SLOT_SUMIU" : "RECUSADO_PELA_API";
    await fecharOferta(ctx, dados.offerId, "CANCELADA", null, null);
    if (codigo === "RECUSADO_PELA_API") {
      await tarefaParaMarcarNaMao(ctx, dados, `O Dental Office recusou: ${criado.detalhe}`);
    }
    return { ok: false, codigo, motivo: criado.detalhe, opcao };
  }

  const gravadas = await gravar(
    "crc_appointments",
    {
      organization_id: ctx.organizationId,
      clinic_id: ctx.clinicId,
      patient_id: dados.patientId,
      external_source: "dental_office",
      external_id: criado.externalId,
      dentista_externo_id: opcao.dentistaExternoId,
      dentista_nome: opcao.dentistaNome,
      inicio_em: opcao.inicioEm,
      fim_em: opcao.fimEm,
      descricao: "Agendado pelo JP CRC",
      status: "TO_CONFIRM",
      sincronizado_em: ctx.agora.toISOString(),
      atualizado_em: ctx.agora.toISOString(),
    },
    "organization_id,external_source,external_id",
  );

  const appointmentId = String(gravadas[0]?.["id"] ?? "");
  await fecharOferta(ctx, dados.offerId, "ACEITA", appointmentId, opcao.inicioEm);

  // `proxima_consulta_em` é o que sustenta o peso −20 da fila. Sem atualizar
  // aqui, o paciente que acabou de marcar continuaria sendo oferecido.
  if (dados.patientId !== null) {
    await atualizar("crc_patients", [{ coluna: "id", op: "eq", valor: dados.patientId }], {
      proxima_consulta_em: opcao.inicioEm,
    });
  }

  await emitir({
    organizationId: ctx.organizationId,
    clinicId: ctx.clinicId,
    tipo: "appointment.created",
    entityType: "appointment",
    entityId: appointmentId,
    payload: {
      patientId: dados.patientId,
      inicioEm: opcao.inicioEm,
      origem: "crc",
      conversationId: dados.conversationId,
    },
    fingerprint: `appointment.created:${criado.externalId}`,
    ocorridoEm: ctx.agora.toISOString(),
  });

  await auditar({
    organizationId: ctx.organizationId,
    userId: null,
    ator: "ia",
    acao: "agendamento.criado",
    entityType: "appointment",
    entityId: appointmentId,
    depois: { inicioEm: opcao.inicioEm, dentista: opcao.dentistaNome },
  });

  return { ok: true, appointmentId, externalId: criado.externalId, opcao };
}

/**
 * O horário oferecido continua livre?
 *
 * Pergunta uma janela de um minuto em torno do início. Mais largo devolveria
 * vizinhos e daria falso positivo; mais estreito arrisca o servidor arredondar
 * o intervalo e devolver vazio.
 */
async function slotAindaLivre(ctx: ContextoAgendamento, opcao: OpcaoDeHorario): Promise<boolean> {
  try {
    /*
     * A REVALIDAÇÃO PEDE A JANELA ATÉ O DIA DA CONSULTA.
     *
     * Não dá para perguntar "este minuto ainda está livre?": a API só aceita
     * "os próximos N dias". Então pede-se até o dia do horário e procura-se o
     * instante exato na resposta. Custa alguns kilobytes a mais e preserva a
     * garantia que importa — só grava o que a agenda ainda oferece.
     */
    const diasAte = Math.ceil((Date.parse(opcao.inicioEm) - ctx.agora.getTime()) / 86_400_000);
    const slots = await ctx.cliente.horariosDisponiveis({
      clinicaExternaId: ctx.clinicaExternaId,
      dentistaExternoId: opcao.dentistaExternoId,
      diasAFrente: Math.max(1, diasAte + 1),
      clinicId: ctx.clinicId,
    });
    return slots.some((s) => s.inicioEm === opcao.inicioEm);
  } catch (erro) {
    // Falha de rede na revalidação NÃO pode virar "pode marcar". Diante da
    // dúvida, a resposta é não: perder uma marcação automática custa uma
    // tarefa; marcar sobre agenda ocupada custa a confiança na automação.
    registrar("aviso", "Revalidação de horário falhou; a reserva não seguiu.", {
      organizationId: ctx.organizationId,
      inicioEm: opcao.inicioEm,
      erro: erro instanceof Error ? erro.message : String(erro),
    });
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Cancelar e remarcar                                                        */
/* -------------------------------------------------------------------------- */

export type ResultadoStatus = { ok: true } | { ok: false; motivo: string };

/**
 * Cancela no Dental Office e reflete aqui.
 *
 * Remarcar é cancelar e oferecer de novo, e não uma terceira operação: a API
 * não tem "mover", e simular isso com criar-antes-de-cancelar deixaria o
 * paciente com duas consultas se a segunda chamada falhasse.
 */
export async function cancelarConsulta(
  ctx: ContextoAgendamento,
  appointmentId: string,
  motivo: string,
): Promise<ResultadoStatus> {
  if (
    ctx.interruptores[KILL_SWITCHES.escritasDentalOffice] === true ||
    ctx.flags[FLAGS.dentalOfficeWriteback] !== true
  ) {
    return { ok: false, motivo: "A escrita no Dental Office está desligada." };
  }

  const linha = await selecionarUm("crc_appointments", {
    colunas: "id,external_id,patient_id",
    filtros: [
      { coluna: "id", op: "eq", valor: appointmentId },
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
    ],
  });
  if (linha === null) return { ok: false, motivo: "Agendamento não encontrado." };

  const resposta = await ctx.cliente.atualizarStatusAgendamento(
    ctx.clinicaExternaId,
    String(linha["external_id"] ?? ""),
    "CANCELLED",
  );
  if (!resposta.ok) return { ok: false, motivo: resposta.detalhe };

  await atualizar("crc_appointments", [{ coluna: "id", op: "eq", valor: appointmentId }], {
    status: "CANCELLED",
    atualizado_em: ctx.agora.toISOString(),
  });

  await auditar({
    organizationId: ctx.organizationId,
    userId: null,
    ator: "automacao",
    acao: "agendamento.cancelado",
    entityType: "appointment",
    entityId: appointmentId,
    depois: { motivo },
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Apoio                                                                      */
/* -------------------------------------------------------------------------- */

function lerOpcoes(bruto: unknown): OpcaoDeHorario[] {
  if (!Array.isArray(bruto)) return [];
  const saida: OpcaoDeHorario[] = [];
  for (const item of bruto) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const inicioEm = typeof o["inicioEm"] === "string" ? o["inicioEm"] : null;
    const horaLocal = typeof o["horaLocal"] === "string" ? o["horaLocal"] : null;
    if (inicioEm === null || horaLocal === null) continue;
    saida.push({
      inicioEm,
      horaLocal,
      diaLocal: typeof o["diaLocal"] === "string" ? o["diaLocal"] : inicioEm.slice(0, 10),
      dentistaExternoId: String(o["dentistaExternoId"] ?? ""),
      cadeiraExternaId: String(o["cadeiraExternaId"] ?? ""),
      duracaoMinutos: Number(o["duracaoMinutos"] ?? 30),
      fimEm: typeof o["fimEm"] === "string" ? o["fimEm"] : inicioEm,
      dentistaNome: typeof o["dentistaNome"] === "string" ? o["dentistaNome"] : null,
      rotulo: typeof o["rotulo"] === "string" ? o["rotulo"] : horaLocal,
    });
  }
  return saida;
}

async function fecharOferta(
  ctx: ContextoAgendamento,
  offerId: string,
  status: "ACEITA" | "EXPIRADA" | "CANCELADA",
  appointmentId: string | null,
  aceitoEm: string | null,
): Promise<void> {
  if (offerId.length === 0) return;
  await atualizar("crc_scheduling_offers", [{ coluna: "id", op: "eq", valor: offerId }], {
    status,
    appointment_id: appointmentId,
    aceito_em: aceitoEm,
    atualizado_em: ctx.agora.toISOString(),
  });
}

async function tarefaParaMarcarNaMao(
  ctx: ContextoAgendamento,
  dados: { conversationId: string; patientId: string | null; opcao: OpcaoDeHorario },
  porque: string,
): Promise<void> {
  await criarTarefa({
    organizationId: ctx.organizationId,
    clinicId: ctx.clinicId,
    patientId: dados.patientId,
    titulo: `Marcar consulta: ${dados.opcao.rotulo}`,
    tipo: "LIGAR",
    prazoHoras: 4,
    prioridade: 20,
    motivo: `${porque} O paciente aceitou ${dados.opcao.rotulo}.`,
    chaveDedupe: `agendar_na_mao:${dados.conversationId}:${dados.opcao.inicioEm}`,
    ator: "sistema",
  });
}

async function externalIdDoPaciente(
  ctx: ContextoAgendamento,
  patientId: string | null,
): Promise<string | null> {
  if (patientId === null) return null;
  const linha = await selecionarUm("crc_patients", {
    colunas: "external_id",
    filtros: [
      { coluna: "id", op: "eq", valor: patientId },
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
    ],
  });
  const bruto = linha?.["external_id"];
  return typeof bruto === "string" && bruto.length > 0 ? bruto : null;
}

async function dentistasDaClinica(ctx: ContextoAgendamento): Promise<string[]> {
  const linhas = await selecionar("crc_dentists", {
    colunas: "external_id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "clinic_id", op: "eq", valor: ctx.clinicId },
      { coluna: "ativo", op: "eq", valor: true },
    ],
    limite: 25,
  });
  return linhas.map((l) => String(l["external_id"] ?? "")).filter((id) => id.length > 0);
}

async function nomesDosDentistas(ctx: ContextoAgendamento): Promise<Map<string, string>> {
  const linhas = await selecionar("crc_dentists", {
    colunas: "external_id,nome",
    filtros: [{ coluna: "organization_id", op: "eq", valor: ctx.organizationId }],
    limite: 100,
  });
  const mapa = new Map<string, string>();
  for (const l of linhas) {
    const id = String(l["external_id"] ?? "");
    const nome = typeof l["nome"] === "string" ? l["nome"] : "";
    if (id.length > 0 && nome.length > 0) mapa.set(id, nome);
  }
  return mapa;
}

/** A configuração padrão, para chamadores que ainda não leram a da organização. */
export const CONFIGURACAO_DE_AGENDAMENTO = CONFIGURACAO_PADRAO;
