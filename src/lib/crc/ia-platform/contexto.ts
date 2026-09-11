/**
 * O Context Builder — o que o agente sabe, e nada além.
 *
 * ESTE ARQUIVO É UMA LISTA DE OMISSÕES. Cada `colunas:` abaixo foi escrito
 * escolhendo o que NÃO vai: sem CPF, sem endereço, sem data de nascimento
 * completa, sem convênio, sem valor de orçamento, sem nota interna. A regra que
 * governa é simples — se o campo não muda o que o agente responde, ele não sai
 * do banco.
 *
 * A nota interna merece menção própria: ela é onde a recepção escreve
 * "ligou nervosa, tratar com cuidado". É conteúdo sobre o paciente, escrito
 * para a equipe, e mandá-la ao modelo é o caminho mais curto para ela voltar
 * parafraseada numa resposta.
 */
import { comoNoTurno } from "../dominio/direcao";
import { selecionar, selecionarUm } from "../servidor/banco";

import type { ContextoTurno, MensagemDoTurno } from "./tipos";

/** Últimas mensagens que entram no contexto. */
const LIMITE_MENSAGENS = 12;

/**
 * Monta o contexto do turno, ou `null` quando a conversa não existe.
 *
 * `null` em vez de exceção porque "a conversa sumiu" é um desfecho possível —
 * o evento pode chegar depois de alguém apagar a conversa — e quem chama
 * precisa poder tratá-lo como `sem_acao`, não como falha.
 */
export async function montarContextoDoTurno(
  organizationId: string,
  conversationId: string,
  agora: Date,
): Promise<ContextoTurno | null> {
  const conversa = await selecionarUm("crc_conversations", {
    colunas: "id,patient_id,clinic_id,resumo_ia,intencao,temperatura",
    filtros: [
      { coluna: "id", op: "eq", valor: conversationId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  if (conversa === null) return null;

  const patientId = typeof conversa["patient_id"] === "string" ? conversa["patient_id"] : null;

  const [paciente, mensagens, oportunidade, oferta, memorias] = await Promise.all([
    carregarPaciente(organizationId, patientId),
    carregarMensagens(organizationId, conversationId),
    carregarOportunidade(organizationId, patientId),
    carregarOferta(organizationId, conversationId),
    carregarMemorias(organizationId, patientId, agora),
  ]);

  return {
    organizationId,
    clinicId: typeof conversa["clinic_id"] === "string" ? conversa["clinic_id"] : null,
    conversationId,
    agora,
    paciente,
    oportunidade,
    oferta,
    mensagens,
    memorias,
    resumo: texto(conversa["resumo_ia"]),
    intencao: texto(conversa["intencao"]),
    temperatura: texto(conversa["temperatura"]),
  };
}

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

async function carregarPaciente(
  organizationId: string,
  patientId: string | null,
): Promise<ContextoTurno["paciente"]> {
  if (patientId === null) return null;

  const l = await selecionarUm("crc_patients", {
    // Seis colunas de vinte e tantas. Ver o cabeçalho.
    colunas: "id,nome,situacao,ultima_consulta_em,proxima_consulta_em,opt_out_em",
    filtros: [
      { coluna: "id", op: "eq", valor: patientId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  if (l === null) return null;

  const nome = typeof l["nome"] === "string" ? l["nome"] : "";
  return {
    id: patientId,
    // Só o primeiro nome: é como a recepção chama, e o sobrenome não muda
    // nenhuma decisão do agente.
    primeiroNome: nome.trim().split(/\s+/u)[0] ?? "",
    situacao: texto(l["situacao"]),
    ultimaConsultaEm: texto(l["ultima_consulta_em"]),
    proximaConsultaEm: texto(l["proxima_consulta_em"]),
    temOptOut: l["opt_out_em"] !== null && l["opt_out_em"] !== undefined,
  };
}

async function carregarMensagens(
  organizationId: string,
  conversationId: string,
): Promise<MensagemDoTurno[]> {
  const linhas = await selecionar("crc_messages", {
    colunas: "direcao,conteudo,criado_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "conversation_id", op: "eq", valor: conversationId },
      // A nota interna NUNCA vai ao modelo. Ver o cabeçalho deste arquivo.
      { coluna: "nota_interna", op: "eq", valor: false },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: LIMITE_MENSAGENS,
  });

  return linhas
    .map((l) => ({
      // A coluna vale `ENTRADA | SAIDA`. Ler qualquer outra coisa aqui rotula a
      // mensagem do paciente como se fosse da clínica — ver `dominio/direcao.ts`,
      // que existe por causa desse bug.
      direcao: comoNoTurno(l["direcao"]),
      texto: typeof l["conteudo"] === "string" ? l["conteudo"] : "",
      em: typeof l["criado_em"] === "string" ? l["criado_em"] : "",
    }))
    .filter((m) => m.texto.length > 0)
    .reverse() as MensagemDoTurno[];
}

/**
 * As memórias vigentes desta pessoa e da clínica.
 *
 * NUNCA LANÇA, E É DE PROPÓSITO. A memória é um acréscimo ao contexto: o agente
 * atendia bem antes de ela existir. Se a leitura falhar — tabela ainda não
 * criada num ambiente, PostgREST fora do ar por um instante — o turno continua
 * com o contexto que sempre teve, em vez de virar `falha_segura` por causa de
 * um enfeite.
 */
async function carregarMemorias(
  organizationId: string,
  patientId: string | null,
  agora: Date,
): Promise<ContextoTurno["memorias"]> {
  try {
    const { memoriasDoContexto } = await import("../aplicacao/memoria");
    const vigentes = await memoriasDoContexto(organizationId, patientId, agora);
    return vigentes.map((m) => ({ escopo: m.escopo, conteudo: m.conteudo }));
  } catch {
    return [];
  }
}

/**
 * A oportunidade aberta do paciente.
 *
 * AS COLUNAS SÃO AS DO SCHEMA, e a lista anterior não era: pedia `etapa`,
 * `valor_potencial` e filtrava por `status = 'ABERTA'` — três nomes que não
 * existem em `crc_opportunities`. O PostgREST recusa a consulta inteira, e como
 * ela roda dentro do `Promise.all` que monta o contexto, TODO turno de paciente
 * com oportunidade morria em `falha_segura`.
 *
 * O QUE ABRE E FECHA UMA OPORTUNIDADE É `fechada_em`, não uma coluna `status`.
 * `is null` é o filtro correto, e é o mesmo que o resto do CRC usa.
 *
 * A ETAPA É UMA FK, e o nome dela vive em `crc_opportunity_stages`. A segunda
 * consulta só acontece quando existe oportunidade aberta — que é a minoria dos
 * turnos — e traz o nome que uma pessoa reconhece, em vez de um UUID que não
 * significa nada para o modelo.
 */
async function carregarOportunidade(
  organizationId: string,
  patientId: string | null,
): Promise<ContextoTurno["oportunidade"]> {
  if (patientId === null) return null;

  const l = await selecionarUm("crc_opportunities", {
    colunas: "id,tipo,stage_id,potential_value",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
      { coluna: "fechada_em", op: "is", valor: null },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
  });
  if (l === null) return null;

  return {
    id: typeof l["id"] === "string" ? l["id"] : "",
    tipo: typeof l["tipo"] === "string" ? l["tipo"] : "",
    etapa: await nomeDaEtapa(organizationId, l["stage_id"]),
    valorPotencial: texto(l["potential_value"]),
  };
}

/** O nome da etapa do funil. String vazia quando a oportunidade não tem etapa. */
async function nomeDaEtapa(organizationId: string, stageId: unknown): Promise<string> {
  if (typeof stageId !== "string" || stageId.length === 0) return "";

  const etapa = await selecionarUm("crc_opportunity_stages", {
    colunas: "nome",
    filtros: [
      { coluna: "id", op: "eq", valor: stageId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
  });
  return typeof etapa?.["nome"] === "string" ? etapa["nome"] : "";
}

async function carregarOferta(
  organizationId: string,
  conversationId: string,
): Promise<ContextoTurno["oferta"]> {
  const l = await selecionarUm("crc_scheduling_offers", {
    colunas: "id,expira_em,opcoes",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "conversation_id", op: "eq", valor: conversationId },
      { coluna: "status", op: "eq", valor: "ABERTA" },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
  });
  if (l === null) return null;

  const cruas = Array.isArray(l["opcoes"]) ? (l["opcoes"] as unknown[]) : [];
  return {
    id: typeof l["id"] === "string" ? l["id"] : "",
    expiraEm: typeof l["expira_em"] === "string" ? l["expira_em"] : "",
    opcoes: cruas
      .filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null)
      .map((o) => ({
        inicioEm: typeof o["inicioEm"] === "string" ? o["inicioEm"] : "",
        dentista: typeof o["dentista"] === "string" ? o["dentista"] : null,
      })),
  };
}

/* -------------------------------------------------------------------------- */
/* A serialização para o modelo                                               */
/* -------------------------------------------------------------------------- */

/**
 * O contexto em texto, na ordem em que uma pessoa leria.
 *
 * Rótulos em português e blocos nomeados, em vez de JSON. Modelo lida bem com
 * os dois, mas o texto rotulado é o que alguém consegue LER num trace quando
 * for investigar por que o agente respondeu o que respondeu — e essa leitura
 * acontece muito mais vezes do que se imagina.
 */
export function textoDoContexto(ctx: ContextoTurno): string {
  const partes: string[] = [];

  if (ctx.paciente !== null) {
    const p = ctx.paciente;
    const linhas = [`Nome: ${p.primeiroNome}`];
    if (p.situacao !== null) linhas.push(`Situação: ${p.situacao}`);
    if (p.ultimaConsultaEm !== null) linhas.push(`Última consulta: ${dia(p.ultimaConsultaEm)}`);
    if (p.proximaConsultaEm !== null) linhas.push(`Próxima consulta: ${dia(p.proximaConsultaEm)}`);
    partes.push(`## Paciente\n${linhas.join("\n")}`);
  } else {
    partes.push("## Paciente\nAinda não identificado na base da clínica.");
  }

  /*
   * A MEMÓRIA VEM ROTULADA COMO "dito antes", e não como verdade sobre a pessoa.
   *
   * A frase de fechamento do bloco existe para cobrir o pior uso possível de
   * memória: o agente abrir a conversa com "vi aqui que você prefere depois das
   * 17h". Isso soa a ficha, assusta, e a pessoa não se lembra de ter dito. A
   * memória serve para ESCOLHER melhor o que oferecer — não para ser recitada.
   */
  const daPessoa = ctx.memorias.filter((m) => m.escopo === "paciente");
  const daClinica = ctx.memorias.filter((m) => m.escopo === "organizacao");

  if (daPessoa.length > 0) {
    partes.push(
      `## O que esta pessoa já disse em outras conversas\n${daPessoa
        .map((m) => `- ${m.conteudo}`)
        .join("\n")}\n\nUse para escolher o que oferecer. NÃO cite que você tem isso anotado.`,
    );
  }

  // Bloco separado porque é outra coisa: isto vale para todo mundo, e pode ser
  // dito em voz alta sem soar a ficha.
  if (daClinica.length > 0) {
    partes.push(`## Sobre a clínica\n${daClinica.map((m) => `- ${m.conteudo}`).join("\n")}`);
  }

  if (ctx.oportunidade !== null) {
    partes.push(
      `## Oportunidade aberta\nTipo: ${ctx.oportunidade.tipo}\nEtapa: ${ctx.oportunidade.etapa}`,
    );
  }

  if (ctx.oferta !== null && ctx.oferta.opcoes.length > 0) {
    const opcoes = ctx.oferta.opcoes.map((o) => `- ${quando(o.inicioEm)}`).join("\n");
    partes.push(
      `## Horários já oferecidos a esta pessoa\n${opcoes}\n\nEstes são os ÚNICOS horários que você pode mencionar.`,
    );
  } else {
    partes.push(
      "## Horários\nNenhum horário foi consultado na agenda. Você não sabe o que está livre e não pode afirmar nada sobre disponibilidade.",
    );
  }

  if (ctx.resumo !== null) partes.push(`## Resumo da conversa até aqui\n${ctx.resumo}`);

  const conversa = ctx.mensagens
    .map((m) => `${m.direcao === "recebida" ? "Paciente" : "Clínica"}: ${m.texto}`)
    .join("\n");
  partes.push(`## Conversa\n${conversa}`);

  partes.push(`## Agora\n${quando(ctx.agora.toISOString())}`);

  return partes.join("\n\n");
}

const dia = (iso: string): string => {
  const d = new Date(Date.parse(iso));
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
};

const quando = (iso: string): string => {
  const d = new Date(Date.parse(iso));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};
