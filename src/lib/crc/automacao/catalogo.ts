/**
 * As automações iniciais — Milestone 7.
 *
 * O item 48 do Mega Prompt e o 259 do contrato definem a ORDEM do rollout:
 * faltantes, confirmações, recall, cancelados, aniversário, orçamento. Todas
 * nascem em `RASCUNHO` + `SHADOW` (item 95): elas calculam tudo e não mandam
 * nada até alguém, com permissão de gestor, decidir o contrário.
 *
 * POR QUE AS DEFINIÇÕES SÃO DADO E NÃO CÓDIGO
 * Porque o item 102 pede configuração sem programador e o item 28 exige
 * versionamento. Uma automação descrita como objeto vai para `crc_automation_
 * versions.definicao` em jsonb, ganha versão, e pode ser editada pela tela sem
 * deploy. Descrita como função, precisaria de deploy para mudar uma espera de
 * 2h para 3h.
 *
 * A ESTRUTURA DE CADA UMA SEGUE O ITEM 9: TRIGGER → CONDITIONS → ACTIONS →
 * WAIT → BRANCH → EXIT CONDITIONS.
 */
import type { DefinicaoAutomacao } from "../dominio/tipos";
import { gravar, inserirIgnorandoDuplicata, selecionar, selecionarUm } from "../servidor/banco";

export type AutomacaoPadrao = {
  chave: string;
  nome: string;
  descricao: string;
  definicao: DefinicaoAutomacao;
};

/**
 * A saída que TODA jornada de recuperação compartilha: o paciente resolveu
 * sozinho. É a mais importante do sistema — é ela que impede "sentimos sua
 * falta, quer remarcar?" chegar para quem remarcou pelo telefone há uma hora.
 *
 * POR QUE NÃO HÁ SAÍDA POR OPT-OUT AQUI
 * O vocabulário de condições não tem negação, de propósito (item 264: sem
 * inchaço). `SEM_OPT_OUT` é verdade para quem NÃO pediu para sair, e uma saída
 * dispara quando sua condição é verdadeira — usá-la encerraria a jornada de
 * todo mundo que está tudo certo. O desligamento por opt-out acontece onde ele
 * é realmente detectado: `registrarOptOut` encerra as jornadas do paciente na
 * mesma hora, sem esperar o motor acordar.
 */
const SAIDAS_RECUPERACAO: DefinicaoAutomacao["saidas"] = [
  { condicao: { tipo: "TEM_CONSULTA_FUTURA" }, motivo: "paciente_agendou" },
];

const CONDICOES_CONTATAVEL: DefinicaoAutomacao["condicoes"] = [
  { tipo: "PACIENTE_ATIVO" },
  { tipo: "SEM_OPT_OUT" },
  { tipo: "TEM_TELEFONE" },
];

export const AUTOMACOES_PADRAO: readonly AutomacaoPadrao[] = [
  /* ---------------------------------------------------------------------- */
  {
    chave: "recuperacao_faltas",
    nome: "Recuperação de faltas",
    descricao:
      "Quando um paciente falta e não tem outra consulta marcada, oferece remarcação. Se ele não responder, a equipe recebe uma tarefa.",
    definicao: {
      gatilho: { tipo: "EVENTO", evento: "appointment.missed" },
      condicoes: [...CONDICOES_CONTATAVEL, { tipo: "SEM_CONSULTA_FUTURA" }],
      passos: [
        // Duas horas: tempo de o paciente ligar por conta própria, e de a
        // recepção registrar uma remarcação feita no balcão. Mandar na hora
        // pega gente que já resolveu.
        { tipo: "ESPERAR", minutos: 120, rotulo: "Esperar 2 horas" },
        { tipo: "ENVIAR_TEMPLATE", template: "falta_primeiro_contato", rotulo: "Primeiro contato" },
        { tipo: "ESPERAR", minutos: 60 * 24, rotulo: "Esperar 24 horas" },
        {
          tipo: "SAIR_SE",
          condicao: { tipo: "PACIENTE_RESPONDEU" },
          motivo: "paciente_respondeu",
          rotulo: "Parar se o paciente respondeu",
        },
        { tipo: "ENVIAR_TEMPLATE", template: "falta_segundo_contato", rotulo: "Segundo contato" },
        { tipo: "ESPERAR", minutos: 60 * 48, rotulo: "Esperar 48 horas" },
        {
          tipo: "SAIR_SE",
          condicao: { tipo: "PACIENTE_RESPONDEU" },
          motivo: "paciente_respondeu",
          rotulo: "Parar se o paciente respondeu",
        },
        // O sistema desistiu de resolver sozinho. Isso NUNCA pode virar
        // "paciente esquecido" — vira tarefa humana.
        {
          tipo: "CRIAR_TAREFA",
          titulo: "Ligar para o paciente que faltou e não respondeu",
          tipoTarefa: "LIGAR",
          prazoHoras: 24,
          rotulo: "Passar para a equipe",
        },
        { tipo: "DEFINIR_PROXIMA_ACAO", acao: "Ligar para o paciente", emHoras: 24 },
      ],
      saidas: SAIDAS_RECUPERACAO,
    },
  },

  /* ---------------------------------------------------------------------- */
  {
    chave: "confirmacao_consulta",
    nome: "Confirmação de consulta",
    descricao: "Pede confirmação das consultas de amanhã que ainda estão como 'a confirmar'.",
    definicao: {
      gatilho: { tipo: "VARREDURA", seletor: "CONFIRMACAO" },
      condicoes: CONDICOES_CONTATAVEL,
      passos: [
        { tipo: "ENVIAR_TEMPLATE", template: "confirmacao_consulta", rotulo: "Pedir confirmação" },
        { tipo: "ESPERAR", minutos: 60 * 5, rotulo: "Esperar 5 horas" },
        {
          tipo: "SAIR_SE",
          condicao: { tipo: "PACIENTE_RESPONDEU" },
          motivo: "paciente_respondeu",
          rotulo: "Parar se respondeu",
        },
        {
          tipo: "CRIAR_TAREFA",
          titulo: "Confirmar consulta por telefone",
          tipoTarefa: "CONFIRMAR",
          prazoHoras: 12,
          rotulo: "Confirmar por telefone",
        },
      ],
      // Sem `TEM_CONSULTA_FUTURA` como saída aqui: nesta jornada, ter consulta
      // futura é a PREMISSA. Usar a saída comum encerraria toda jornada de
      // confirmação no primeiro passo — é o tipo de erro que faz a automação
      // parecer que "simplesmente não funciona".
      saidas: [],
    },
  },

  /* ---------------------------------------------------------------------- */
  {
    chave: "recall_seis_meses",
    nome: "Retorno de rotina",
    descricao:
      "Convida para a avaliação de rotina quem está sem consulta há mais que o limite configurado.",
    definicao: {
      gatilho: { tipo: "VARREDURA", seletor: "RECALL" },
      condicoes: [...CONDICOES_CONTATAVEL, { tipo: "SEM_CONSULTA_FUTURA" }],
      passos: [
        { tipo: "ENVIAR_TEMPLATE", template: "recall_seis_meses", rotulo: "Convite de retorno" },
        { tipo: "ESPERAR", minutos: 60 * 72, rotulo: "Esperar 3 dias" },
        {
          tipo: "SAIR_SE",
          condicao: { tipo: "PACIENTE_RESPONDEU" },
          motivo: "paciente_respondeu",
          rotulo: "Parar se respondeu",
        },
        {
          tipo: "CRIAR_TAREFA",
          titulo: "Retomar contato para agendar retorno",
          tipoTarefa: "WHATSAPP",
          prazoHoras: 48,
          rotulo: "Passar para a equipe",
        },
      ],
      saidas: SAIDAS_RECUPERACAO,
    },
  },

  /* ---------------------------------------------------------------------- */
  {
    chave: "cancelamento_reagendamento",
    nome: "Reagendamento de cancelados",
    descricao: "Oferece novo horário a quem cancelou e não remarcou.",
    definicao: {
      gatilho: { tipo: "EVENTO", evento: "appointment.cancelled" },
      condicoes: [...CONDICOES_CONTATAVEL, { tipo: "SEM_CONSULTA_FUTURA" }],
      passos: [
        // Uma hora, e não duas: quem cancela costuma já estar decidindo a nova
        // data, então a janela útil é mais curta que a da falta.
        { tipo: "ESPERAR", minutos: 60, rotulo: "Esperar 1 hora" },
        {
          tipo: "ENVIAR_TEMPLATE",
          template: "cancelamento_reagendar",
          rotulo: "Oferecer horários",
        },
        { tipo: "ESPERAR", minutos: 60 * 48, rotulo: "Esperar 2 dias" },
        {
          tipo: "SAIR_SE",
          condicao: { tipo: "PACIENTE_RESPONDEU" },
          motivo: "paciente_respondeu",
          rotulo: "Parar se respondeu",
        },
        {
          tipo: "CRIAR_TAREFA",
          titulo: "Oferecer novo horário para quem cancelou",
          tipoTarefa: "LIGAR",
          prazoHoras: 24,
          rotulo: "Passar para a equipe",
        },
      ],
      saidas: SAIDAS_RECUPERACAO,
    },
  },

  /* ---------------------------------------------------------------------- */
  {
    chave: "reativacao_inativos",
    nome: "Reativação de inativos",
    descricao: "Convida de volta quem está sem consulta há muito tempo ou abandonou o tratamento.",
    definicao: {
      gatilho: { tipo: "VARREDURA", seletor: "ABANDONO" },
      condicoes: [...CONDICOES_CONTATAVEL, { tipo: "SEM_CONSULTA_FUTURA" }],
      passos: [
        { tipo: "ENVIAR_TEMPLATE", template: "reativacao_inativo", rotulo: "Convite de retorno" },
        { tipo: "ESPERAR", minutos: 60 * 96, rotulo: "Esperar 4 dias" },
        {
          tipo: "SAIR_SE",
          condicao: { tipo: "PACIENTE_RESPONDEU" },
          motivo: "paciente_respondeu",
          rotulo: "Parar se respondeu",
        },
        // Sem tarefa humana no fim, de propósito: a base de inativos é grande,
        // e gerar tarefa para cada um afogaria a equipe (item 156, fadiga de
        // alerta). Quem responde vira oportunidade; quem não responde fica
        // registrado e volta no ciclo seguinte.
        { tipo: "DEFINIR_PROXIMA_ACAO", acao: "Reavaliar no próximo ciclo", emHoras: 24 * 90 },
      ],
      saidas: SAIDAS_RECUPERACAO,
    },
  },

  /* ---------------------------------------------------------------------- */
  {
    chave: "aniversario",
    nome: "Aniversário",
    descricao: "Manda uma felicitação simples no dia do aniversário.",
    definicao: {
      gatilho: { tipo: "VARREDURA", seletor: "ANIVERSARIO" },
      condicoes: CONDICOES_CONTATAVEL,
      passos: [
        // Às 10h: cedo o bastante para o dia, tarde o bastante para não ser a
        // primeira notificação de alguém.
        { tipo: "ESPERAR_ATE", hora: "10:00", rotulo: "Esperar as 10h" },
        { tipo: "ENVIAR_TEMPLATE", template: "aniversario", rotulo: "Felicitar" },
      ],
      // Nenhuma saída: é mensagem única, sem cobrança e sem próxima etapa. Uma
      // felicitação que vira funil comercial é exatamente o que o item 286
      // proíbe.
      saidas: [],
    },
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Instalação                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Cria as automações que ainda não existem, em RASCUNHO + SHADOW.
 *
 * `inserirIgnorandoDuplicata` na automação e upsert na versão: rodar de novo
 * não muda o status nem o modo de uma automação que o gestor já ativou — o que
 * seria o pior efeito colateral possível de um seed.
 */
export async function semearAutomacoes(
  organizationId: string,
): Promise<{ criadas: number; existentes: number }> {
  let criadas = 0;
  let existentes = 0;

  for (const padrao of AUTOMACOES_PADRAO) {
    const linha = await inserirIgnorandoDuplicata("crc_automations", {
      organization_id: organizationId,
      chave: padrao.chave,
      nome: padrao.nome,
      descricao: padrao.descricao,
      status: "RASCUNHO",
      modo: "SHADOW",
      versao_ativa: 1,
    });

    if (linha === null) {
      existentes += 1;
      continue;
    }
    criadas += 1;

    await gravar(
      "crc_automation_versions",
      {
        automation_id: String(linha["id"] ?? ""),
        versao: 1,
        definicao: padrao.definicao,
      },
      "automation_id,versao",
    );
  }

  return { criadas, existentes };
}

export async function listarAutomacoes(organizationId: string): Promise<
  {
    id: string;
    chave: string;
    nome: string;
    descricao: string | null;
    status: string;
    modo: string;
    versaoAtiva: number;
  }[]
> {
  const linhas = await selecionar("crc_automations", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [{ coluna: "nome", ascendente: true }],
  });

  return linhas.map((l) => ({
    id: String(l["id"] ?? ""),
    chave: String(l["chave"] ?? ""),
    nome: String(l["nome"] ?? ""),
    descricao: typeof l["descricao"] === "string" ? l["descricao"] : null,
    status: String(l["status"] ?? "RASCUNHO"),
    modo: String(l["modo"] ?? "SHADOW"),
    versaoAtiva: typeof l["versao_ativa"] === "number" ? l["versao_ativa"] : 1,
  }));
}

/** Devolve o id de uma automação pela chave, para os handlers de evento. */
export async function idDaAutomacao(organizationId: string, chave: string): Promise<string | null> {
  const linha = await selecionarUm("crc_automations", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "chave", op: "eq", valor: chave },
    ],
  });
  const id = linha?.["id"];
  return typeof id === "string" ? id : null;
}
