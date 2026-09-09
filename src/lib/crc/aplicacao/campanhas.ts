/**
 * Campanhas — falar com um grupo inteiro sem perder o jeito de falar com um.
 *
 * O QUE SEPARA ISTO DE UM DISPARO EM MASSA, e é a única coisa que separa:
 * **cada mensagem passa pela mesma política de contato de uma mensagem
 * individual**. Opt-out, limite do dia, cooldown, horário comercial e o teto
 * por hora da clínica valem igual. Uma campanha aqui não é um canal paralelo
 * que contorna as regras — é uma fila que as respeita uma pessoa por vez.
 *
 * TRÊS DECISÕES QUE DEFINEM O COMPORTAMENTO:
 *
 *   O PÚBLICO É CONGELADO NO AGENDAMENTO. O recorte muda embaixo da campanha:
 *   "quem não volta há 12 meses" no dia 1 não é o mesmo conjunto do dia 20.
 *   Recalcular todo dia mandaria mensagem para quem entrou no critério DEPOIS
 *   de alguém ter revisado o público — que é o que a revisão existe para
 *   impedir. Congelar faz sair exatamente o que foi revisado.
 *
 *   O ENVIO É ESPALHADO POR DIA. Falar com 964 pessoas numa tarde é o padrão
 *   que derruba a reputação do número; a partir daí nada chega, nem as boas.
 *
 *   NADA SAI SEM ALGUÉM APERTAR O BOTÃO. A campanha nasce em rascunho, mostra
 *   quantas pessoas entram no filtro antes de qualquer coisa, e só vira fila
 *   quando uma pessoa agenda. O sistema monta; quem decide é gente.
 */
import type { SituacaoPaciente } from "../dominio/tipos";
import { SITUACOES_PACIENTE } from "../dominio/tipos";
import {
  atualizar,
  contar,
  inserir,
  inserirIgnorandoDuplicata,
  selecionar,
  selecionarUm,
  type Filtro,
  type Linha,
} from "../servidor/banco";
import { auditar, descreverErro, registrar } from "../servidor/registro";

/* -------------------------------------------------------------------------- */
/* O recorte                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * O vocabulário do filtro. Pequeno de propósito — o mesmo princípio do motor de
 * automação: cada campo aqui é uma coluna que o banco sabe filtrar com índice.
 * Um construtor de consulta livre viraria varredura completa na primeira
 * combinação que alguém montasse.
 */
export type FiltroPublico = {
  /** Sem consulta concluída há pelo menos N dias — o piso da faixa. */
  diasSemVoltar: number | null;
  /**
   * E há no MÁXIMO N dias — o teto da faixa.
   *
   * É o que transforma "sumiu há mais de um ano" em "sumiu entre um e dois
   * anos". Sem ele, a primeira campanha de reativação consome a base inativa
   * inteira com a mesma mensagem para quem sumiu há sete meses e para quem
   * sumiu há sete anos — que são conversas diferentes.
   */
  diasSemVoltarAte: number | null;
  /** Só quem não tem consulta futura marcada. */
  semConsultaFutura: boolean;
  especialidade: string | null;
  /** O plano de saúde. Só existe quando o Dental Office informa o campo. */
  convenio: string | null;
  situacao: SituacaoPaciente | null;
};

export const FILTRO_PUBLICO_VAZIO: FiltroPublico = {
  diasSemVoltar: null,
  diasSemVoltarAte: null,
  semConsultaFutura: true,
  especialidade: null,
  convenio: null,
  situacao: null,
};

/** Teto de público por campanha. Acima disso, o recorte está largo demais. */
export const MAX_PUBLICO = 5000;

export function lerFiltroPublico(bruto: unknown): FiltroPublico {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return { ...FILTRO_PUBLICO_VAZIO };
  }
  const o = bruto as Record<string, unknown>;

  const dias = Number(o["diasSemVoltar"]);
  const diasAte = Number(o["diasSemVoltarAte"]);
  const situacao = String(o["situacao"] ?? "");
  const especialidade = String(o["especialidade"] ?? "").trim();
  const convenio = String(o["convenio"] ?? "").trim();

  const piso = Number.isFinite(dias) && dias > 0 ? Math.min(3650, Math.floor(dias)) : null;
  const teto = Number.isFinite(diasAte) && diasAte > 0 ? Math.min(3650, Math.floor(diasAte)) : null;

  return {
    diasSemVoltar: piso,
    // Teto abaixo do piso é faixa vazia, e faixa vazia numa campanha não
    // devolve "zero pacientes" — devolve uma tela que parece quebrada. Descartar
    // o teto inválido faz o filtro voltar a ser "de N dias para cima", que é o
    // comportamento anterior e é previsível.
    diasSemVoltarAte: teto !== null && piso !== null && teto <= piso ? null : teto,
    // O padrão é `true` e não `false`: falar com quem já tem consulta marcada é
    // o erro mais caro de uma campanha, e o padrão precisa ser o seguro.
    semConsultaFutura: o["semConsultaFutura"] !== false,
    especialidade: especialidade.length > 0 ? especialidade.slice(0, 80) : null,
    convenio: convenio.length > 0 ? convenio.slice(0, 80) : null,
    situacao: (SITUACOES_PACIENTE as readonly string[]).includes(situacao)
      ? (situacao as SituacaoPaciente)
      : null,
  };
}

/**
 * Traduz o recorte em filtros de consulta.
 *
 * As três condições de contatabilidade entram SEMPRE, e não como opção da tela:
 * arquivado, inativo e sem telefone nunca deveriam entrar numa fila de envio, e
 * deixar isso a cargo de quem monta a campanha é convidar o erro.
 */
function filtrosDoPublico(organizationId: string, f: FiltroPublico, agora: Date): Filtro[] {
  const filtros: Filtro[] = [
    { coluna: "organization_id", op: "eq", valor: organizationId },
    { coluna: "arquivado", op: "eq", valor: false },
    { coluna: "ativo", op: "eq", valor: true },
    { coluna: "opt_out_em", op: "is", valor: null },
    { coluna: "telefone", op: "not.is", valor: null },
  ];

  if (f.semConsultaFutura) {
    filtros.push({ coluna: "proxima_consulta_em", op: "is", valor: null });
  }
  if (f.diasSemVoltar !== null) {
    const limite = new Date(agora.getTime() - f.diasSemVoltar * 86400_000).toISOString();
    filtros.push({ coluna: "ultima_consulta_em", op: "lt", valor: limite });
  }
  if (f.diasSemVoltarAte !== null) {
    // O teto é o lado ANTIGO da faixa: "no máximo 24 meses sem voltar" quer
    // dizer que a última consulta é MAIS RECENTE que 24 meses atrás.
    const limite = new Date(agora.getTime() - f.diasSemVoltarAte * 86400_000).toISOString();
    filtros.push({ coluna: "ultima_consulta_em", op: "gte", valor: limite });
  }
  if (f.especialidade !== null) {
    filtros.push({ coluna: "especialidade", op: "eq", valor: f.especialidade });
  }
  if (f.convenio !== null) {
    filtros.push({ coluna: "convenio", op: "eq", valor: f.convenio });
  }
  if (f.situacao !== null) {
    filtros.push({ coluna: "situacao", op: "eq", valor: f.situacao });
  }

  return filtros;
}

/**
 * Quantas pessoas entram no filtro AGORA.
 *
 * É o número que a tela mostra antes de qualquer envio, e que muda quando se
 * mexe no filtro. Uma contagem, não uma amostra: "aproximadamente 900" numa
 * tela que vai disparar mensagem para gente de verdade não serve.
 */
export function contarPublico(
  organizationId: string,
  filtro: FiltroPublico,
  agora = new Date(),
): Promise<number> {
  return contar("crc_patients", filtrosDoPublico(organizationId, filtro, agora));
}

/**
 * As especialidades e os convênios que EXISTEM na base.
 *
 * A primeira versão desta tela pedia especialidade como texto livre, e isso era
 * uma armadilha: "Implantodontia" digitado como "implantodontia" casa com
 * ninguém, e a tela mostra zero sem explicar que o erro foi de digitação.
 *
 * Aqui a lista vem do banco. E o efeito colateral é o que resolve o convênio: se
 * o Dental Office não informar o campo, nenhum paciente tem convênio, a lista
 * volta vazia e a tela **não mostra o filtro**. Um filtro visível que nunca casa
 * com ninguém faz a clínica concluir que o sistema está quebrado.
 */
export async function opcoesDoPublico(
  organizationId: string,
): Promise<{ especialidades: string[]; convenios: string[] }> {
  const linhas = await selecionar("crc_patients", {
    colunas: "especialidade,convenio",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "arquivado", op: "eq", valor: false },
    ],
    // Teto alto e leitura de duas colunas: é uma consulta por abertura de
    // modal, e o distinct em memória evita uma RPC só para isso.
    limite: 5000,
  });

  const especialidades = new Set<string>();
  const convenios = new Set<string>();
  for (const l of linhas) {
    const e = typeof l["especialidade"] === "string" ? l["especialidade"].trim() : "";
    const c = typeof l["convenio"] === "string" ? l["convenio"].trim() : "";
    if (e.length > 0) especialidades.add(e);
    if (c.length > 0) convenios.add(c);
  }

  const ordenar = (s: Set<string>): string[] => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return { especialidades: ordenar(especialidades), convenios: ordenar(convenios) };
}

/* -------------------------------------------------------------------------- */
/* A campanha                                                                 */
/* -------------------------------------------------------------------------- */

export type StatusCampanha = "RASCUNHO" | "AGENDADA" | "RODANDO" | "PAUSADA" | "CONCLUIDA";

export type Campanha = {
  id: string;
  nome: string;
  mensagem: string;
  filtros: FiltroPublico;
  status: StatusCampanha;
  porDia: number;
  criadoEm: string;
};

export type ResumoCampanha = Campanha & {
  publico: number;
  enviadas: number;
  puladas: number;
  pendentes: number;
};

function linhaParaCampanha(l: Linha): Campanha {
  const status = String(l["status"] ?? "RASCUNHO");
  const validos: StatusCampanha[] = ["RASCUNHO", "AGENDADA", "RODANDO", "PAUSADA", "CONCLUIDA"];
  return {
    id: String(l["id"] ?? ""),
    nome: String(l["nome"] ?? ""),
    mensagem: String(l["mensagem"] ?? ""),
    filtros: lerFiltroPublico(l["filtros"]),
    status: (validos as string[]).includes(status) ? (status as StatusCampanha) : "RASCUNHO",
    porDia: typeof l["por_dia"] === "number" ? l["por_dia"] : 120,
    criadoEm: String(l["criado_em"] ?? ""),
  };
}

export async function listarCampanhas(organizationId: string): Promise<ResumoCampanha[]> {
  const linhas = await selecionar("crc_campaigns", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: 50,
  });

  const saida: ResumoCampanha[] = [];
  for (const l of linhas) {
    const campanha = linhaParaCampanha(l);
    const daCampanha: Filtro[] = [{ coluna: "campaign_id", op: "eq", valor: campanha.id }];

    const [publico, enviadas, puladas] = await Promise.all([
      contar("crc_campaign_targets", daCampanha),
      contar("crc_campaign_targets", [
        ...daCampanha,
        { coluna: "status", op: "eq", valor: "ENVIADA" },
      ]),
      contar("crc_campaign_targets", [
        ...daCampanha,
        { coluna: "status", op: "eq", valor: "PULADA" },
      ]),
    ]);

    saida.push({
      ...campanha,
      publico,
      enviadas,
      puladas,
      pendentes: publico - enviadas - puladas,
    });
  }

  return saida;
}

export type ResultadoCampanha = { ok: true; id: string } | { ok: false; motivo: string };

export async function criarCampanha(dados: {
  organizationId: string;
  clinicId: string | null;
  nome: string;
  mensagem: string;
  filtros: FiltroPublico;
  porDia: number;
  autorId: string;
}): Promise<ResultadoCampanha> {
  const nome = dados.nome.trim().slice(0, 120);
  if (nome.length < 3) return { ok: false, motivo: "Dê um nome para a campanha." };

  const mensagem = dados.mensagem.trim().slice(0, 900);
  if (mensagem.length < 10) return { ok: false, motivo: "Escreva a mensagem que vai ser enviada." };

  const porDia = Math.min(2000, Math.max(1, Math.floor(dados.porDia)));

  const linhas = await inserir("crc_campaigns", {
    organization_id: dados.organizationId,
    clinic_id: dados.clinicId,
    nome,
    mensagem,
    filtros: dados.filtros,
    status: "RASCUNHO",
    por_dia: porDia,
    criado_por: dados.autorId,
  });

  const id = String(linhas[0]?.["id"] ?? "");
  if (id.length === 0) return { ok: false, motivo: "Não conseguimos criar a campanha." };

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.autorId,
    ator: "humano",
    acao: "campanha.criada",
    entityType: "campaign",
    entityId: id,
    depois: { nome, porDia },
  });

  return { ok: true, id };
}

/**
 * Congela o público e põe a campanha na fila.
 *
 * É o "Revisar e agendar" da tela, e o momento em que a campanha deixa de ser
 * um rascunho. Depois disto o recorte não é mais consultado: o que está em
 * `crc_campaign_targets` é o que vai sair.
 */
export async function agendarCampanha(dados: {
  organizationId: string;
  campaignId: string;
  autorId: string;
  agora?: Date;
}): Promise<{ ok: true; publico: number } | { ok: false; motivo: string }> {
  const agora = dados.agora ?? new Date();

  const linha = await selecionarUm("crc_campaigns", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
      { coluna: "id", op: "eq", valor: dados.campaignId },
    ],
  });
  if (linha === null) return { ok: false, motivo: "Campanha não encontrada." };

  const campanha = linhaParaCampanha(linha);
  if (campanha.status !== "RASCUNHO") {
    return { ok: false, motivo: "Esta campanha já foi agendada." };
  }

  const pessoas = await selecionar("crc_patients", {
    colunas: "id",
    filtros: filtrosDoPublico(dados.organizationId, campanha.filtros, agora),
    limite: MAX_PUBLICO,
  });

  if (pessoas.length === 0) {
    return { ok: false, motivo: "Nenhuma pessoa entra neste filtro hoje." };
  }

  for (const p of pessoas) {
    // `inserirIgnorandoDuplicata` e não `inserir`: agendar duas vezes por um
    // clique duplo não pode criar dois alvos para a mesma pessoa. O índice
    // único é quem garante, e não o cuidado de quem chama.
    await inserirIgnorandoDuplicata("crc_campaign_targets", {
      campaign_id: campanha.id,
      organization_id: dados.organizationId,
      patient_id: String(p["id"] ?? ""),
      status: "PENDENTE",
    });
  }

  await atualizar(
    "crc_campaigns",
    [
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
      { coluna: "id", op: "eq", valor: campanha.id },
    ],
    {
      status: "RODANDO",
      inicia_em: agora.toISOString().slice(0, 10),
      atualizado_em: agora.toISOString(),
    },
  );

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.autorId,
    ator: "humano",
    acao: "campanha.agendada",
    entityType: "campaign",
    entityId: campanha.id,
    depois: { publico: pessoas.length, porDia: campanha.porDia },
  });

  return { ok: true, publico: pessoas.length };
}

export async function mudarStatusCampanha(dados: {
  organizationId: string;
  campaignId: string;
  status: "RODANDO" | "PAUSADA";
  autorId: string;
}): Promise<void> {
  await atualizar(
    "crc_campaigns",
    [
      { coluna: "organization_id", op: "eq", valor: dados.organizationId },
      { coluna: "id", op: "eq", valor: dados.campaignId },
      // Só sai de/para estes dois: uma campanha CONCLUIDA não volta a rodar, e
      // uma RASCUNHO precisa passar pelo agendamento para ter público.
      { coluna: "status", op: "in", valor: ["RODANDO", "PAUSADA"] },
    ],
    { status: dados.status, atualizado_em: new Date().toISOString() },
  );

  await auditar({
    organizationId: dados.organizationId,
    userId: dados.autorId,
    ator: "humano",
    acao: dados.status === "PAUSADA" ? "campanha.pausada" : "campanha.retomada",
    entityType: "campaign",
    entityId: dados.campaignId,
  });
}

/* -------------------------------------------------------------------------- */
/* O envio                                                                    */
/* -------------------------------------------------------------------------- */

export type ResultadoCiclo = {
  campanhas: number;
  enviadas: number;
  puladas: number;
};

/**
 * Uma volta de envio de campanhas, chamada pelo motor.
 *
 * O TETO DIÁRIO É CONTADO DO QUE JÁ SAIU HOJE, e não distribuído por ciclo: o
 * motor pode rodar dez vezes ou uma só, dependendo do plano da Vercel e do
 * pinger, e um teto por ciclo mandaria dez vezes mais num caso do que no outro.
 *
 * CADA ALVO PASSA POR `enviarMensagem`, que aplica a política inteira. O alvo
 * bloqueado vira PULADA com o motivo — e não some. "312 enviadas de 964" sem
 * explicar os 652 restantes é o tipo de número que faz a equipe desconfiar da
 * ferramenta inteira.
 */
export async function rodarCampanhas(ctx: {
  organizationId: string;
  porta: unknown;
  configuracao: unknown;
  enviosPausados: boolean;
  agora?: Date;
  limitePorVolta?: number;
}): Promise<ResultadoCiclo> {
  const agora = ctx.agora ?? new Date();
  const resultado: ResultadoCiclo = { campanhas: 0, enviadas: 0, puladas: 0 };

  if (ctx.enviosPausados || ctx.porta === null) return resultado;

  const campanhas = await selecionar("crc_campaigns", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "status", op: "eq", valor: "RODANDO" },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 10,
  });

  const { enviarMensagem } = await import("./mensagens");
  const { aplicarVariaveis } = await import("../automacao/templates");
  const inicioDoDia = new Date(agora);
  inicioDoDia.setHours(0, 0, 0, 0);

  for (const linha of campanhas) {
    const campanha = linhaParaCampanha(linha);
    resultado.campanhas += 1;

    const daCampanha: Filtro[] = [{ coluna: "campaign_id", op: "eq", valor: campanha.id }];

    const jaHoje = await contar("crc_campaign_targets", [
      ...daCampanha,
      { coluna: "status", op: "eq", valor: "ENVIADA" },
      { coluna: "processado_em", op: "gte", valor: inicioDoDia.toISOString() },
    ]);

    const restaHoje = Math.max(0, campanha.porDia - jaHoje);
    if (restaHoje === 0) continue;

    const alvos = await selecionar("crc_campaign_targets", {
      filtros: [...daCampanha, { coluna: "status", op: "eq", valor: "PENDENTE" }],
      ordenar: [{ coluna: "criado_em", ascendente: true }],
      limite: Math.min(restaHoje, ctx.limitePorVolta ?? 25),
    });

    if (alvos.length === 0) {
      // Sem pendente: a campanha terminou. Marcar aqui é o que faz a tela
      // parar de mostrá-la como ativa sem ninguém precisar conferir.
      await atualizar("crc_campaigns", [{ coluna: "id", op: "eq", valor: campanha.id }], {
        status: "CONCLUIDA",
        atualizado_em: agora.toISOString(),
      });
      continue;
    }

    for (const alvo of alvos) {
      const patientId = String(alvo["patient_id"] ?? "");
      const alvoId = String(alvo["id"] ?? "");

      try {
        const paciente = await selecionarUm("crc_patients", {
          colunas: "id,nome,telefone,clinic_id",
          filtros: [{ coluna: "id", op: "eq", valor: patientId }],
        });

        const telefone = typeof paciente?.["telefone"] === "string" ? paciente["telefone"] : "";
        if (paciente === null || telefone.length === 0) {
          await marcarAlvo(alvoId, "PULADA", "sem_telefone", null, agora);
          resultado.puladas += 1;
          continue;
        }

        const primeiroNome =
          String(paciente["nome"] ?? "")
            .trim()
            .split(/\s+/u)[0] ?? "";
        const texto = aplicarVariaveis(campanha.mensagem, {
          primeiroNome,
          clinica: "JP Clínica Integrada Odontológica",
        });

        const envio = await enviarMensagem({
          organizationId: ctx.organizationId,
          clinicId: String(paciente["clinic_id"] ?? ""),
          patientId,
          telefone,
          texto,
          // Uma mensagem por pessoa por campanha, garantida por índice.
          chaveDedupe: `campanha:${campanha.id}:${patientId}`,
          remetente: "automacao",
          proativo: true,
          porta: ctx.porta as never,
          configuracao: ctx.configuracao as never,
          agora,
        });

        if (envio.ok) {
          await marcarAlvo(alvoId, "ENVIADA", null, envio.mensagemId, agora);
          resultado.enviadas += 1;
        } else if (envio.permanente) {
          await marcarAlvo(alvoId, "PULADA", envio.codigo.toLowerCase(), null, agora);
          resultado.puladas += 1;
        } else {
          // Bloqueio adiável — teto por hora, cooldown, fora do horário. O alvo
          // FICA PENDENTE e volta na próxima volta. Marcar como pulada aqui
          // faria a clínica perder a pessoa por causa do relógio.
          break;
        }
      } catch (erro) {
        registrar("erro", "Falha ao enviar mensagem de campanha.", {
          organizationId: ctx.organizationId,
          campanha: campanha.id,
          detalhe: descreverErro(erro),
        });
        await marcarAlvo(alvoId, "PULADA", "erro", null, agora);
        resultado.puladas += 1;
      }
    }
  }

  return resultado;
}

async function marcarAlvo(
  id: string,
  status: "ENVIADA" | "PULADA",
  motivo: string | null,
  messageId: string | null,
  agora: Date,
): Promise<void> {
  await atualizar("crc_campaign_targets", [{ coluna: "id", op: "eq", valor: id }], {
    status,
    motivo,
    message_id: messageId,
    processado_em: agora.toISOString(),
  });
}
