/**
 * As regras que decidem quem entra em jornada, quem sai, e quem não pode ser
 * incomodado.
 *
 * Tudo aqui é função pura sobre dados já carregados. É o que o item 79 do
 * contrato manda testar primeiro — e o que se pode testar sem banco, sem rede e
 * sem relógio de parede, porque o "agora" sempre entra como argumento.
 */
import type { ConfiguracaoCrc, HorarioComercial } from "./configuracao";
import { dentroDoHorario, proximoInstanteUtil } from "./configuracao";
import type { CondicaoAutomacao, Paciente, SituacaoPaciente } from "./tipos";

export const DIA_MS = 24 * 60 * 60 * 1000;

export function diasEntre(deIso: string | null, ate: Date): number | null {
  if (deIso === null) return null;
  const t = Date.parse(deIso);
  if (!Number.isFinite(t)) return null;
  return Math.floor((ate.getTime() - t) / DIA_MS);
}

/* -------------------------------------------------------------------------- */
/* Recall e inatividade                                                       */
/* -------------------------------------------------------------------------- */

/** O contexto mínimo para julgar recall. Deliberadamente menor que `Paciente`. */
export type ContextoRecall = {
  ultimaConsultaEm: string | null;
  proximaConsultaEm: string | null;
  ativo: boolean;
  arquivado: boolean;
  optOutEm: string | null;
  telefone: string | null;
  situacao: SituacaoPaciente;
};

export type VeredictoRecall =
  | { elegivel: true; diasSemConsulta: number; tipo: "RECALL" | "INACTIVE_PATIENT" }
  | { elegivel: false; motivo: string };

/**
 * O paciente merece um recall hoje?
 *
 * A ordem das recusas importa: as baratas e definitivas vêm primeiro, para o
 * varredor diário sobre 20 mil pacientes descartar a maioria antes de calcular
 * qualquer data.
 *
 * `ABANDONO` é tratado como inatividade independentemente da data, porque o
 * item 10 do Mega Prompt lista abandono como jornada própria: quem abandonou
 * tratamento não está esperando o retorno de rotina, está com tratamento pela
 * metade.
 */
export function avaliarRecall(
  ctx: ContextoRecall,
  agora: Date,
  cfg: ConfiguracaoCrc,
): VeredictoRecall {
  if (ctx.arquivado) return { elegivel: false, motivo: "Paciente arquivado." };
  if (!ctx.ativo) return { elegivel: false, motivo: "Paciente inativo no cadastro." };
  if (ctx.optOutEm !== null)
    return { elegivel: false, motivo: "Paciente pediu para não receber mensagens." };
  if (ctx.telefone === null || ctx.telefone.length === 0) {
    return { elegivel: false, motivo: "Paciente sem telefone utilizável." };
  }

  if (temConsultaFutura(ctx.proximaConsultaEm, agora)) {
    return { elegivel: false, motivo: "Já tem consulta marcada." };
  }

  const dias = diasEntre(ctx.ultimaConsultaEm, agora);
  if (dias === null) {
    // Nunca veio: isso é lead, não recall. A jornada de lead cuida dele.
    return { elegivel: false, motivo: "Sem consulta anterior registrada." };
  }

  if (ctx.situacao === "ABANDONO") {
    return { elegivel: true, diasSemConsulta: dias, tipo: "INACTIVE_PATIENT" };
  }
  if (dias >= cfg.inatividadeDias) {
    return { elegivel: true, diasSemConsulta: dias, tipo: "INACTIVE_PATIENT" };
  }
  if (dias >= cfg.recallDias) {
    return { elegivel: true, diasSemConsulta: dias, tipo: "RECALL" };
  }

  return { elegivel: false, motivo: `Última consulta há ${String(dias)} dias.` };
}

/**
 * "Consulta futura" é o conceito mais consultado do sistema. Uma consulta que
 * começou há dez minutos ainda conta — o paciente está na cadeira, ninguém
 * deveria mandar recall para ele.
 */
export function temConsultaFutura(proximaIso: string | null, agora: Date): boolean {
  if (proximaIso === null) return false;
  const t = Date.parse(proximaIso);
  return Number.isFinite(t) && t >= agora.getTime() - 2 * 60 * 60 * 1000;
}

/* -------------------------------------------------------------------------- */
/* Aniversário                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Compara mês e dia no fuso da clínica.
 *
 * 29 de fevereiro é o caso que quebra a comparação ingênua: em ano comum o
 * aniversariante simplesmente não existiria. Aqui ele cai no dia 28, que é a
 * convenção civil brasileira e evita um paciente nunca receber nada.
 */
export function fazAniversarioHoje(
  nascimentoIso: string | null,
  hoje: { mes: number; dia: number; ano: number },
): boolean {
  if (nascimentoIso === null || nascimentoIso.length < 10) return false;
  const mes = Number.parseInt(nascimentoIso.slice(5, 7), 10);
  const dia = Number.parseInt(nascimentoIso.slice(8, 10), 10);
  if (!Number.isFinite(mes) || !Number.isFinite(dia)) return false;

  if (mes === hoje.mes && dia === hoje.dia) return true;

  if (mes === 2 && dia === 29 && hoje.mes === 2 && hoje.dia === 28) {
    return !anoBissexto(hoje.ano);
  }
  return false;
}

function anoBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}

/* -------------------------------------------------------------------------- */
/* Opt-out (item 39)                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Detecta pedido de descadastro pelo texto, ANTES de a IA opinar.
 *
 * POR QUE NÃO DEIXAR SÓ COM A IA
 * Porque o custo dos dois erros é assimétrico. Um falso positivo cala o sistema
 * para alguém que não pediu — chato, reversível por um clique. Um falso
 * negativo continua mandando mensagem para quem pediu para parar — é quebra de
 * confiança, e no Brasil é problema de LGPD. Um regex previsível que erra para
 * o lado seguro vale mais aqui do que um modelo que acerta 97% das vezes.
 *
 * A IA continua rodando e pode marcar `DESCADASTRO` em frases que isto não
 * pega. As duas camadas somam; nenhuma substitui a outra.
 */
const PADROES_OPT_OUT: readonly RegExp[] = [
  /\bpar(e|ar)\s+de\s+(me\s+)?(mandar|enviar)\b/iu,
  /\bn(a|ã)o\s+quero\s+(mais\s+)?(receber|mensagens|nada)\b/iu,
  /\bn(a|ã)o\s+(me\s+)?(mande|manda|envie|envia)\s+mais\b/iu,
  /\b(remover|remove|tirar|tira|excluir|exclui)\s+(o\s+)?meu\s+(n(u|ú)mero|contato|cadastro)\b/iu,
  /\bme\s+(tira|tire|remova|remove)\s+d(a|essa|esta)\s+(lista|divulga(ç|c)(a|ã)o)\b/iu,
  /\bdescadastr(ar|e|o)\b/iu,
  /\bsair\s+da\s+lista\b/iu,
  /^\s*(parar|pare|stop|sair|cancelar)\s*[.!]?\s*$/iu,
];

export function pedeDescadastro(texto: string): boolean {
  const limpo = texto.trim();
  if (limpo.length === 0) return false;
  return PADROES_OPT_OUT.some((padrao) => padrao.test(limpo));
}

/* -------------------------------------------------------------------------- */
/* Política global de contato (item 34)                                       */
/* -------------------------------------------------------------------------- */

export type ContextoContato = {
  optOutEm: string | null;
  telefone: string | null;
  /** Quantos contatos proativos já saíram para este paciente hoje. */
  contatosHoje: number;
  /** Horas desde o último contato proativo. `null` = nunca houve. */
  horasDesdeUltimoContato: number | null;
  /** Existe outra jornada ativa falando com este paciente agora? */
  temJornadaAtivaConcorrente: boolean;
  /** Item 41: se um humano assumiu a conversa, a automação cala a boca. */
  conversaAtribuidaAHumano: boolean;
  /**
   * Quantas mensagens automáticas a CLÍNICA INTEIRA já mandou na última hora.
   *
   * É o único campo daqui que não é sobre este paciente, e o motivo é outro: os
   * demais limites protegem uma pessoa de ser incomodada demais; este protege
   * o NÚMERO da clínica. Uma varredura que encontra 800 inativos e dispara 800
   * mensagens em minutos é exatamente o padrão que faz a Meta derrubar a
   * qualidade do remetente — e aí nenhuma mensagem chega, nem as boas.
   */
  enviosNaUltimaHora: number;
};

export type VeredictoContato =
  { pode: true } | { pode: false; codigo: MotivoBloqueio; motivo: string; reagendarPara?: Date };

export type MotivoBloqueio =
  | "OPT_OUT"
  | "SEM_TELEFONE"
  | "FORA_DO_HORARIO"
  | "LIMITE_DIARIO"
  | "COOLDOWN"
  | "OUTRA_JORNADA"
  | "ATENDIMENTO_HUMANO"
  | "TETO_POR_HORA";

/**
 * Pode mandar mensagem proativa para este paciente agora?
 *
 * Esta função é o guarda-costas do item 286 ("o paciente não se sentir
 * assediado" vem ANTES de receita, na lista de prioridades do produto). Toda
 * ação de envio passa por aqui — não existe caminho alternativo, e é por isso
 * que ela vive no domínio e não dentro do motor de automação.
 *
 * A distinção entre bloqueio DEFINITIVO e ADIÁVEL importa: fora de horário a
 * jornada é reagendada; opt-out encerra a jornada. Devolver só `false` faria o
 * motor tratar os dois igual.
 */
export function podeContatar(
  ctx: ContextoContato,
  agora: Date,
  cfg: ConfiguracaoCrc,
  horario: HorarioComercial,
): VeredictoContato {
  if (ctx.optOutEm !== null) {
    return { pode: false, codigo: "OPT_OUT", motivo: "Paciente pediu para não receber mensagens." };
  }
  if (ctx.telefone === null || ctx.telefone.length === 0) {
    return { pode: false, codigo: "SEM_TELEFONE", motivo: "Paciente sem telefone utilizável." };
  }
  if (ctx.conversaAtribuidaAHumano) {
    return {
      pode: false,
      codigo: "ATENDIMENTO_HUMANO",
      motivo: "Um atendente está cuidando desta conversa.",
    };
  }
  if (ctx.temJornadaAtivaConcorrente) {
    return {
      pode: false,
      codigo: "OUTRA_JORNADA",
      motivo: "Outra automação já está falando com este paciente.",
    };
  }
  if (ctx.contatosHoje >= cfg.contatosPorDia) {
    return {
      pode: false,
      codigo: "LIMITE_DIARIO",
      motivo: "Limite de contatos do dia já atingido.",
      reagendarPara: new Date(agora.getTime() + DIA_MS),
    };
  }
  if (ctx.horasDesdeUltimoContato !== null && ctx.horasDesdeUltimoContato < cfg.cooldownHoras) {
    const faltam = cfg.cooldownHoras - ctx.horasDesdeUltimoContato;
    return {
      pode: false,
      codigo: "COOLDOWN",
      motivo: "Este paciente foi contatado há pouco.",
      reagendarPara: new Date(agora.getTime() + faltam * 60 * 60 * 1000),
    };
  }
  // O teto da clínica vem por ÚLTIMO entre os adiáveis, e isso é deliberado: se
  // esta pessoa já estava bloqueada por opt-out ou por cooldown, o veredicto
  // dela não deve depender do quanto a clínica falou com OUTRAS pessoas. Trocar
  // a ordem faria o motivo exibido na tela mudar conforme o movimento do dia.
  if (ctx.enviosNaUltimaHora >= cfg.envioPorHora) {
    return {
      pode: false,
      codigo: "TETO_POR_HORA",
      motivo: "A clínica já atingiu o teto de mensagens automáticas desta hora.",
      // Meia hora, e não uma hora cheia: a janela é deslizante, então parte do
      // teto já vence antes disso e a fila volta a andar mais cedo.
      reagendarPara: new Date(agora.getTime() + 30 * 60 * 1000),
    };
  }
  if (!dentroDoHorario(agora, horario)) {
    // REAGENDA, e não apenas recusa. Sem a data de retorno o chamador não
    // consegue distinguir "espere até amanhã às 9h" de "o provedor falhou", e
    // trata as duas como falha transitória: uma jornada bloqueada às 23h
    // tentaria de quinze em quinze minutos a noite inteira, enchendo o log de
    // erro com algo que não é erro nenhum.
    return {
      pode: false,
      codigo: "FORA_DO_HORARIO",
      motivo: "Fora do horário de atendimento.",
      reagendarPara: proximoInstanteUtil(agora, horario),
    };
  }
  return { pode: true };
}

/* -------------------------------------------------------------------------- */
/* Condições de automação (itens 33 e 27)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Tudo que uma condição pode consultar. É pequeno de propósito: cada campo aqui
 * é uma consulta que o motor precisa fazer ANTES de avaliar, e um contexto
 * gordo transforma cada passo de jornada em cinco viagens ao banco.
 */
export type ContextoCondicao = {
  paciente: Pick<
    Paciente,
    | "ativo"
    | "arquivado"
    | "optOutEm"
    | "telefone"
    | "situacao"
    | "ultimaConsultaEm"
    | "proximaConsultaEm"
  >;
  /** O paciente respondeu DEPOIS que a jornada começou? */
  pacienteRespondeu: boolean;
  agora: Date;
};

/**
 * Avalia uma condição. `switch` exaustivo de propósito: quando alguém acrescenta
 * um membro em `CondicaoAutomacao`, o TypeScript quebra a compilação aqui em vez
 * de deixar a condição nova sempre falsa em silêncio.
 */
export function avaliarCondicao(condicao: CondicaoAutomacao, ctx: ContextoCondicao): boolean {
  switch (condicao.tipo) {
    case "SEMPRE":
      return true;
    case "SEM_CONSULTA_FUTURA":
      return !temConsultaFutura(ctx.paciente.proximaConsultaEm, ctx.agora);
    case "TEM_CONSULTA_FUTURA":
      return temConsultaFutura(ctx.paciente.proximaConsultaEm, ctx.agora);
    case "PACIENTE_RESPONDEU":
      return ctx.pacienteRespondeu;
    case "PACIENTE_NAO_RESPONDEU":
      return !ctx.pacienteRespondeu;
    case "PACIENTE_ATIVO":
      return ctx.paciente.ativo && !ctx.paciente.arquivado;
    case "SEM_OPT_OUT":
      return ctx.paciente.optOutEm === null;
    case "TEM_TELEFONE":
      return ctx.paciente.telefone !== null && ctx.paciente.telefone.length > 0;
    case "SITUACAO_E":
      return ctx.paciente.situacao === condicao.situacao;
    case "DIAS_DESDE_ULTIMA_CONSULTA_MAIOR_QUE": {
      const d = diasEntre(ctx.paciente.ultimaConsultaEm, ctx.agora);
      return d !== null && d > condicao.dias;
    }
    default: {
      // Se isto deixar de compilar, é porque `CondicaoAutomacao` ganhou um
      // membro que ninguém avaliou. É intencional.
      const exaustivo: never = condicao;
      void exaustivo;
      return false;
    }
  }
}

export function todasVerdadeiras(
  condicoes: readonly CondicaoAutomacao[],
  ctx: ContextoCondicao,
): boolean {
  return condicoes.every((c) => avaliarCondicao(c, ctx));
}

/* -------------------------------------------------------------------------- */
/* Orçamento (item 58)                                                        */
/* -------------------------------------------------------------------------- */

export type ContextoOrcamento = {
  status: string;
  emitidoEm: string | null;
  expiraEm: string | null;
  temConsultaFutura: boolean;
  optOut: boolean;
};

export function orcamentoElegivelParaRecuperacao(
  ctx: ContextoOrcamento,
  agora: Date,
  cfg: ConfiguracaoCrc,
): boolean {
  if (ctx.optOut) return false;
  if (ctx.temConsultaFutura) return false;
  if (ctx.status !== "OPEN" && ctx.status !== "PARTIALLY_APPROVED") return false;

  if (ctx.expiraEm !== null) {
    const t = Date.parse(ctx.expiraEm);
    if (Number.isFinite(t) && t < agora.getTime()) return false;
  }

  const dias = diasEntre(ctx.emitidoEm, agora);
  return dias !== null && dias >= cfg.orcamentoParadoDias;
}
