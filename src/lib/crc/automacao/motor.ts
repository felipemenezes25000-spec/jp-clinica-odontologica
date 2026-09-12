/**
 * O motor de jornadas — Milestone 4.
 *
 * COMO ELE FUNCIONA, EM UMA FRASE: uma jornada é um ponteiro (`passo_atual`)
 * dentro de uma lista de passos, mais uma data (`resume_at`) dizendo quando
 * voltar. O worker acorda, pega as jornadas vencidas, avança cada uma até
 * encontrar uma espera, e dorme.
 *
 * POR QUE ESPERA VIVE NO BANCO (item 30)
 * `setTimeout(24 * 60 * 60 * 1000)` numa função serverless morre junto com a
 * invocação. Mesmo num servidor residente, um deploy no meio da espera perderia
 * a jornada — e a jornada perdida aqui é um paciente que não foi contatado, sem
 * ninguém saber. `resume_at` sobrevive a deploy, a queda e a rollback.
 *
 * POR QUE A CONDIÇÃO DE SAÍDA É AVALIADA ANTES DE CADA PASSO (item 33)
 * Porque o mundo muda durante a espera. A jornada de falta espera duas horas
 * antes de mandar mensagem; nesse intervalo o paciente pode ter ligado e
 * remarcado. Avaliar só na entrada mandaria "sentimos sua falta, quer
 * remarcar?" para quem já remarcou.
 *
 * OS TRÊS MODOS (item 96 e 43)
 *   SHADOW     registra "teria feito X" e não faz. Toda automação nasce assim.
 *   RECOMENDAR executa ações internas (tarefa, etapa) e não fala com o paciente.
 *   EXECUTAR   manda mensagem de verdade.
 * O modo é lido a cada passo, e não no início da jornada: pausar uma automação
 * precisa surtir efeito nas jornadas que já estão em voo.
 */
import {
  CONFIGURACAO_PADRAO,
  proximoInstanteUtil,
  type ConfiguracaoCrc,
} from "../dominio/configuracao";
import { primeiroNome } from "../dominio/formatar";
import { avaliarCondicao, todasVerdadeiras, type ContextoCondicao } from "../dominio/regras";
import type {
  Automacao,
  CondicaoAutomacao,
  DefinicaoAutomacao,
  Jornada,
  ModoAutomacao,
  Paciente,
  PassoAutomacao,
} from "../dominio/tipos";
import type { PortaMensageria } from "../integracoes/whatsapp/porta";
import {
  atualizar,
  inserir,
  inserirIgnorandoDuplicata,
  rpc,
  selecionar,
  selecionarUm,
  type Linha,
} from "../servidor/banco";
import { descreverErro, mandarParaDeadLetter, registrar } from "../servidor/registro";
import { enviarMensagem } from "../aplicacao/mensagens";
import { definirProximaAcao, moverEtapa } from "../aplicacao/oportunidades";
import { criarTarefa } from "../aplicacao/tarefas";
import { linhaParaJornada, linhaParaPaciente } from "../aplicacao/repositorios";

import { renderizarTemplate } from "./templates";

/* -------------------------------------------------------------------------- */
/* Leitura de automações                                                      */
/* -------------------------------------------------------------------------- */

export async function carregarAutomacao(
  organizationId: string,
  chave: string,
): Promise<Automacao | null> {
  const linha = await selecionarUm("crc_automations", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "chave", op: "eq", valor: chave },
    ],
  });
  if (linha === null) return null;
  return montarAutomacao(organizationId, linha);
}

export async function carregarAutomacaoPorId(
  organizationId: string,
  id: string,
  versao?: number,
): Promise<Automacao | null> {
  const linha = await selecionarUm("crc_automations", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "eq", valor: id },
    ],
  });
  if (linha === null) return null;
  return montarAutomacao(organizationId, linha, versao);
}

/**
 * Junta a automação com a definição da versão pedida.
 *
 * ITEM 28 EM CÓDIGO: quem já está na v1 continua lendo a v1, mesmo depois de a
 * v2 virar a ativa. Sem isso, editar uma automação mudaria o comportamento de
 * jornadas no meio do caminho — um paciente receberia o passo 2 da versão
 * antiga e o passo 3 da nova, que podem nem fazer sentido juntos.
 */
async function montarAutomacao(
  organizationId: string,
  linha: Linha,
  versaoPedida?: number,
): Promise<Automacao | null> {
  const id = String(linha["id"] ?? "");
  const versao =
    versaoPedida ?? (typeof linha["versao_ativa"] === "number" ? linha["versao_ativa"] : 1);

  const versaoLinha = await selecionarUm("crc_automation_versions", {
    filtros: [
      { coluna: "automation_id", op: "eq", valor: id },
      { coluna: "versao", op: "eq", valor: versao },
    ],
  });
  if (versaoLinha === null) return null;

  const definicao = versaoLinha["definicao"];
  if (typeof definicao !== "object" || definicao === null) return null;

  const modo = String(linha["modo"] ?? "SHADOW");
  const status = String(linha["status"] ?? "RASCUNHO");

  return {
    id,
    organizationId,
    chave: String(linha["chave"] ?? ""),
    nome: String(linha["nome"] ?? ""),
    descricao: typeof linha["descricao"] === "string" ? linha["descricao"] : null,
    status: status === "ATIVA" || status === "PAUSADA" ? status : "RASCUNHO",
    modo: modo === "EXECUTAR" || modo === "RECOMENDAR" ? modo : "SHADOW",
    versaoAtiva: versao,
    definicao: definicao as DefinicaoAutomacao,
  };
}

/* -------------------------------------------------------------------------- */
/* Inscrição                                                                  */
/* -------------------------------------------------------------------------- */

export type PedidoInscricao = {
  organizationId: string;
  clinicId: string;
  automacao: Automacao;
  patientId: string;
  opportunityId?: string | null;
  eventId?: string | null;
  /** Item 84: o mesmo evento processado duas vezes gera UMA jornada. */
  chaveDedupe: string;
  contexto?: Record<string, unknown>;
  /**
   * O instante da inscrição — explícito, como em todo o `dominio/`.
   *
   * `new Date()` aqui dentro leria um relógio DIFERENTE do que o chamador já
   * usou para decidir inscrever, e a diferença não é acadêmica: o `resume_at`
   * que nasce alguns milissegundos à frente do `agora` do worker faz a jornada
   * não ser reservada na volta seguinte. Ela fica ACTIVE, parada, sem erro
   * nenhum no log — o pior tipo de defeito de relógio, porque parece
   * intermitente. Recebendo o instante de fora, a inscrição e a reserva falam
   * do mesmo agora.
   */
  agora: Date;
};

export type ResultadoInscricao =
  | { inscrito: true; jornada: Jornada }
  | {
      inscrito: false;
      motivo: "duplicada" | "automacao_inativa" | "condicoes_nao_batem" | "sem_paciente";
    };

/**
 * Inscreve o paciente na jornada, se ele passar nas condições de entrada.
 *
 * A jornada nasce com `resume_at = agora`: o worker a pega na próxima volta e
 * executa o primeiro passo. Executar aqui, dentro do handler de evento, seria
 * mais rápido — e faria uma falha de rede do WhatsApp derrubar o processamento
 * do evento, que então seria repetido e tentaria inscrever de novo.
 */
export async function inscrever(pedido: PedidoInscricao): Promise<ResultadoInscricao> {
  const { automacao } = pedido;

  if (automacao.status !== "ATIVA") return { inscrito: false, motivo: "automacao_inativa" };

  const paciente = await carregarPaciente(pedido.organizationId, pedido.patientId);
  if (paciente === null) return { inscrito: false, motivo: "sem_paciente" };

  const ctx: ContextoCondicao = {
    paciente,
    pacienteRespondeu: false,
    agora: pedido.agora,
  };

  if (!todasVerdadeiras(automacao.definicao.condicoes, ctx)) {
    return { inscrito: false, motivo: "condicoes_nao_batem" };
  }

  const linha = await inserirIgnorandoDuplicata("crc_automation_enrollments", {
    organization_id: pedido.organizationId,
    automation_id: automacao.id,
    versao: automacao.versaoAtiva,
    patient_id: pedido.patientId,
    opportunity_id: pedido.opportunityId ?? null,
    event_id: pedido.eventId ?? null,
    status: "ACTIVE",
    passo_atual: 0,
    resume_at: pedido.agora.toISOString(),
    contexto: pedido.contexto ?? {},
    chave_dedupe: pedido.chaveDedupe,
  });

  if (linha === null) return { inscrito: false, motivo: "duplicada" };

  const jornada = linhaParaJornada(linha);
  await anotar(
    jornada.id,
    null,
    "entrou",
    `Entrou em "${automacao.nome}" (v${String(automacao.versaoAtiva)}).`,
  );

  return { inscrito: true, jornada };
}

async function carregarPaciente(
  organizationId: string,
  patientId: string,
): Promise<Paciente | null> {
  const linha = await selecionarUm("crc_patients", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "id", op: "eq", valor: patientId },
    ],
  });
  return linha === null ? null : linhaParaPaciente(linha);
}

/* -------------------------------------------------------------------------- */
/* Log da jornada (item 179, 180)                                             */
/* -------------------------------------------------------------------------- */

/**
 * Registra o que aconteceu no passo.
 *
 * Item 180: "nunca ser caixa preta". É este log que faz a tela do debugger de
 * jornada conseguir mostrar "Entrou 08/09 14:30 · Passo 1 concluído ·
 * Aguardando até 09/09 10:00" — e que responde "por que este paciente não
 * recebeu nada?" sem ninguém precisar ler código.
 */
async function anotar(
  enrollmentId: string,
  passo: number | null,
  tipo: "entrou" | "condicao" | "espera" | "acao" | "saida" | "erro" | "shadow",
  descricao: string,
  detalhe?: unknown,
): Promise<void> {
  try {
    await inserir("crc_automation_logs", {
      enrollment_id: enrollmentId,
      passo,
      tipo,
      descricao,
      detalhe: detalhe === undefined ? null : detalhe,
    });
  } catch (erro) {
    // Mesma decisão da auditoria: o log não pode derrubar a jornada que ele
    // deveria estar documentando.
    registrar("aviso", "Falha ao gravar log de jornada.", {
      enrollmentId,
      detalhe: descreverErro(erro),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Execução                                                                   */
/* -------------------------------------------------------------------------- */

export type ContextoExecucao = {
  organizationId: string;
  porta: PortaMensageria | null;
  configuracao: ConfiguracaoCrc;
  /** Item 96 (kill switch): quando ligado, nenhuma mensagem sai. */
  enviosPausados: boolean;
  automacoesPausadas: boolean;
  agora?: Date;
};

export type ResultadoCiclo = {
  reservadas: number;
  avancadas: number;
  concluidas: number;
  saidas: number;
  falhadas: number;
  mensagensEnviadas: number;
  tarefasCriadas: number;
  simuladas: number;
};

const MAX_PASSOS_POR_CICLO = 20;
const MAX_TENTATIVAS_JORNADA = 4;

/**
 * Uma volta do worker de automação.
 *
 * A reserva atômica (`crc_reservar_jornadas`) é o que permite o cron da Vercel
 * se sobrepor a uma execução manual sem duas instâncias tratarem a mesma
 * jornada — o que produziria mensagem duplicada mesmo com todo o resto certo.
 */
export async function rodarCiclo(ctx: ContextoExecucao, limite = 25): Promise<ResultadoCiclo> {
  const resultado: ResultadoCiclo = {
    reservadas: 0,
    avancadas: 0,
    concluidas: 0,
    saidas: 0,
    falhadas: 0,
    mensagensEnviadas: 0,
    tarefasCriadas: 0,
    simuladas: 0,
  };

  if (ctx.automacoesPausadas) {
    registrar("aviso", "Ciclo de automação ignorado: kill switch ligado.", {
      organizationId: ctx.organizationId,
    });
    return resultado;
  }

  const linhas = await rpc("crc_reservar_jornadas", { limite, lock_segundos: 180 });
  resultado.reservadas = linhas.length;

  for (const linha of linhas) {
    const jornada = linhaParaJornada(linha);
    try {
      const r = await avancarJornada(ctx, jornada);
      resultado.avancadas += 1;
      resultado.mensagensEnviadas += r.mensagens;
      resultado.tarefasCriadas += r.tarefas;
      resultado.simuladas += r.simuladas;
      if (r.terminou === "COMPLETED") resultado.concluidas += 1;
      if (r.terminou === "EXITED") resultado.saidas += 1;
    } catch (erro) {
      resultado.falhadas += 1;
      await tratarFalhaDeJornada(jornada, erro);
    }
  }

  return resultado;
}

type ResultadoAvanco = {
  terminou: "COMPLETED" | "EXITED" | null;
  mensagens: number;
  tarefas: number;
  simuladas: number;
};

/**
 * Avança uma jornada até encontrar uma espera, uma saída ou o fim.
 *
 * O teto de passos por ciclo (`MAX_PASSOS_POR_CICLO`) é rede de segurança: uma
 * definição malformada com um laço — ou uma sequência longa de passos
 * instantâneos — não pode prender o worker numa jornada só enquanto as outras
 * esperam.
 */
async function avancarJornada(
  ctx: ContextoExecucao,
  jornadaInicial: Jornada,
): Promise<ResultadoAvanco> {
  const agora = ctx.agora ?? new Date();
  const saida: ResultadoAvanco = { terminou: null, mensagens: 0, tarefas: 0, simuladas: 0 };

  const automacao = await carregarAutomacaoPorId(
    ctx.organizationId,
    jornadaInicial.automationId,
    jornadaInicial.versao,
  );

  if (automacao === null) {
    await encerrar(jornadaInicial.id, "FAILED", "definicao_ausente");
    await anotar(jornadaInicial.id, null, "erro", "A versão desta automação não foi encontrada.");
    return saida;
  }

  // Pausar a automação para as jornadas em voo também — item 100 (o humano
  // sempre pode pausar). Elas não são canceladas: voltam se ela for religada.
  if (automacao.status === "PAUSADA") {
    await adiar(jornadaInicial.id, new Date(agora.getTime() + 6 * 3_600_000), "PAUSED");
    await anotar(
      jornadaInicial.id,
      jornadaInicial.passoAtual,
      "espera",
      "Automação pausada; jornada suspensa.",
    );
    return saida;
  }

  let jornada = jornadaInicial;
  const passos = automacao.definicao.passos;

  for (let volta = 0; volta < MAX_PASSOS_POR_CICLO; volta += 1) {
    const paciente = await carregarPaciente(ctx.organizationId, jornada.patientId ?? "");
    if (paciente === null) {
      await encerrar(jornada.id, "FAILED", "paciente_ausente");
      await anotar(jornada.id, jornada.passoAtual, "erro", "Paciente não encontrado.");
      return saida;
    }

    const contextoCondicao: ContextoCondicao = {
      paciente,
      pacienteRespondeu: await pacienteRespondeuDepoisDe(
        ctx.organizationId,
        paciente.id,
        jornada.criadoEm,
      ),
      agora,
    };

    // ITEM 33: saídas ANTES do passo. O mundo mudou durante a espera.
    const motivoSaida = primeiraSaidaSatisfeita(automacao.definicao, contextoCondicao);
    if (motivoSaida !== null) {
      await encerrar(jornada.id, "EXITED", motivoSaida);
      await anotar(jornada.id, jornada.passoAtual, "saida", `Jornada encerrada: ${motivoSaida}.`);
      saida.terminou = "EXITED";
      return saida;
    }

    const passo = passos[jornada.passoAtual];
    if (passo === undefined) {
      await encerrar(jornada.id, "COMPLETED", "fim_dos_passos");
      await anotar(jornada.id, jornada.passoAtual, "saida", "Jornada concluída.");
      saida.terminou = "COMPLETED";
      return saida;
    }

    const r = await executarPasso(
      ctx,
      automacao,
      jornada,
      passo,
      paciente,
      contextoCondicao,
      agora,
    );

    saida.mensagens += r.mensagens;
    saida.tarefas += r.tarefas;
    saida.simuladas += r.simuladas;

    if (r.tipo === "esperar") {
      await adiar(jornada.id, r.ate, "WAITING", jornada.passoAtual + (r.consomePasso ? 1 : 0));
      return saida;
    }

    if (r.tipo === "sair") {
      await encerrar(jornada.id, "EXITED", r.motivo);
      await anotar(jornada.id, jornada.passoAtual, "saida", `Jornada encerrada: ${r.motivo}.`);
      saida.terminou = "EXITED";
      return saida;
    }

    // Avança o ponteiro e continua na mesma volta do worker: passos
    // instantâneos (mover etapa, definir próxima ação) não precisam esperar o
    // próximo minuto do cron.
    jornada = { ...jornada, passoAtual: jornada.passoAtual + 1 };
    await atualizar("crc_automation_enrollments", [{ coluna: "id", op: "eq", valor: jornada.id }], {
      passo_atual: jornada.passoAtual,
      status: "ACTIVE",
      tentativas: 0,
      ultimo_erro: null,
      atualizado_em: agora.toISOString(),
    });
  }

  // Bateu no teto sem terminar: volta daqui a pouco em vez de girar.
  await adiar(jornada.id, new Date(agora.getTime() + 60_000), "ACTIVE");
  return saida;
}

function primeiraSaidaSatisfeita(
  definicao: DefinicaoAutomacao,
  ctx: ContextoCondicao,
): string | null {
  for (const saida of definicao.saidas) {
    if (avaliarCondicao(saida.condicao, ctx)) return saida.motivo;
  }
  return null;
}

type ResultadoPasso =
  | { tipo: "seguir"; mensagens: number; tarefas: number; simuladas: number }
  | {
      tipo: "esperar";
      ate: Date;
      consomePasso: boolean;
      mensagens: number;
      tarefas: number;
      simuladas: number;
    }
  | { tipo: "sair"; motivo: string; mensagens: number; tarefas: number; simuladas: number };

const NADA = { mensagens: 0, tarefas: 0, simuladas: 0 };

/**
 * Executa UM passo.
 *
 * `switch` exaustivo sobre a união discriminada: quando alguém adiciona um tipo
 * de passo, o TypeScript quebra aqui em vez de deixá-lo silenciosamente sem
 * efeito. Item 122 — regras explícitas em vez de `if` espalhado.
 */
async function executarPasso(
  ctx: ContextoExecucao,
  automacao: Automacao,
  jornada: Jornada,
  passo: PassoAutomacao,
  paciente: Paciente,
  contextoCondicao: ContextoCondicao,
  agora: Date,
): Promise<ResultadoPasso> {
  const modo: ModoAutomacao = automacao.modo;
  const rotulo = passo.rotulo ?? passo.tipo;

  switch (passo.tipo) {
    case "ESPERAR": {
      const ate = new Date(agora.getTime() + passo.minutos * 60_000);
      await anotar(
        jornada.id,
        jornada.passoAtual,
        "espera",
        `${rotulo}: aguardando até ${ate.toISOString()}.`,
      );
      return { tipo: "esperar", ate, consomePasso: true, ...NADA };
    }

    case "ESPERAR_ATE": {
      const ate = proximaOcorrenciaDaHora(agora, passo.hora, ctx.configuracao);
      await anotar(
        jornada.id,
        jornada.passoAtual,
        "espera",
        `${rotulo}: aguardando até ${passo.hora} (${ate.toISOString()}).`,
      );
      return { tipo: "esperar", ate, consomePasso: true, ...NADA };
    }

    case "ENVIAR_TEMPLATE": {
      // Fora do horário: ADIA, não cancela. O paciente recebe às 8h como se
      // nada tivesse acontecido, e a jornada não perde o passo.
      const janela = proximoInstanteUtil(agora, ctx.configuracao.horarioComercial);
      if (janela.getTime() > agora.getTime() + 60_000) {
        await anotar(
          jornada.id,
          jornada.passoAtual,
          "espera",
          `Fora do horário de atendimento; envio adiado para ${janela.toISOString()}.`,
        );
        return { tipo: "esperar", ate: janela, consomePasso: false, ...NADA };
      }

      const texto = await renderizarTemplate(
        ctx.organizationId,
        passo.template,
        { primeiroNome: primeiroNome(paciente.nome), nome: paciente.nome },
        // A unidade DO PACIENTE: numa rede, quem fala é a unidade em que ele é
        // atendido, e não a holding.
        paciente.clinicId,
      );

      if (modo !== "EXECUTAR" || ctx.enviosPausados || ctx.porta === null) {
        // MODO SOMBRA (item 96): registra exatamente o que teria sido enviado.
        const razao = ctx.enviosPausados
          ? "envios pausados pelo kill switch"
          : ctx.porta === null
            ? "provedor de WhatsApp não configurado"
            : `automação em modo ${modo}`;
        await anotar(jornada.id, jornada.passoAtual, "shadow", `Teria enviado (${razao}).`, {
          template: passo.template,
          texto,
          telefone: paciente.telefone,
        });
        return { tipo: "seguir", mensagens: 0, tarefas: 0, simuladas: 1 };
      }

      if (paciente.telefone === null) {
        return { tipo: "sair", motivo: "sem_telefone", ...NADA };
      }

      const envio = await enviarMensagem({
        organizationId: ctx.organizationId,
        clinicId: paciente.clinicId,
        patientId: paciente.id,
        telefone: paciente.telefone,
        texto,
        // A chave amarra jornada + passo: reprocessar a jornada não reenvia, e
        // uma jornada NOVA do mesmo tipo (o paciente faltou de novo) tem id
        // diferente e portanto pode enviar.
        chaveDedupe: `jornada:${jornada.id}:passo:${String(jornada.passoAtual)}`,
        remetente: "automacao",
        enrollmentId: jornada.id,
        proativo: true,
        porta: ctx.porta,
        configuracao: ctx.configuracao,
        agora,
      });

      if (envio.ok) {
        await anotar(jornada.id, jornada.passoAtual, "acao", `Mensagem enviada.`, {
          template: passo.template,
        });
        return { tipo: "seguir", mensagens: 1, tarefas: 0, simuladas: 0 };
      }

      // Bloqueio adiável (cooldown, limite diário) reagenda; bloqueio
      // definitivo (opt-out) encerra. É a distinção que `podeContatar` produz.
      if (envio.reagendarPara !== undefined) {
        await anotar(jornada.id, jornada.passoAtual, "espera", `Envio adiado: ${envio.motivo}`);
        return { tipo: "esperar", ate: envio.reagendarPara, consomePasso: false, ...NADA };
      }

      if (envio.permanente) {
        await anotar(jornada.id, jornada.passoAtual, "saida", `Envio bloqueado: ${envio.motivo}`);
        return { tipo: "sair", motivo: envio.codigo.toLowerCase(), ...NADA };
      }

      // Falha transitória do provedor: tenta de novo em quinze minutos.
      await anotar(
        jornada.id,
        jornada.passoAtual,
        "erro",
        `Falha temporária no envio: ${envio.motivo}`,
      );
      return {
        tipo: "esperar",
        ate: new Date(agora.getTime() + 15 * 60_000),
        consomePasso: false,
        ...NADA,
      };
    }

    case "CRIAR_TAREFA": {
      if (modo === "SHADOW") {
        await anotar(jornada.id, jornada.passoAtual, "shadow", "Teria criado uma tarefa.", {
          titulo: passo.titulo,
        });
        return { tipo: "seguir", mensagens: 0, tarefas: 0, simuladas: 1 };
      }

      const tarefa = await criarTarefa({
        organizationId: ctx.organizationId,
        clinicId: paciente.clinicId,
        patientId: paciente.id,
        opportunityId: jornada.opportunityId,
        titulo: passo.titulo,
        tipo: passo.tipoTarefa,
        prazoHoras: passo.prazoHoras,
        motivo: `Automação "${automacao.nome}".`,
        chaveDedupe: `jornada:${jornada.id}:tarefa:${String(jornada.passoAtual)}`,
        ator: "automacao",
      });

      await anotar(
        jornada.id,
        jornada.passoAtual,
        "acao",
        tarefa === null ? "Tarefa já existia." : "Tarefa criada para a equipe.",
      );
      return { tipo: "seguir", mensagens: 0, tarefas: tarefa === null ? 0 : 1, simuladas: 0 };
    }

    case "MOVER_ETAPA": {
      if (jornada.opportunityId === null) {
        await anotar(
          jornada.id,
          jornada.passoAtual,
          "acao",
          "Sem oportunidade ligada; etapa não alterada.",
        );
        return { tipo: "seguir", ...NADA };
      }
      if (modo === "SHADOW") {
        await anotar(
          jornada.id,
          jornada.passoAtual,
          "shadow",
          `Teria movido para "${passo.etapa}".`,
        );
        return { tipo: "seguir", mensagens: 0, tarefas: 0, simuladas: 1 };
      }

      await moverEtapa({
        organizationId: ctx.organizationId,
        opportunityId: jornada.opportunityId,
        paraEtapaChave: passo.etapa,
        motivo: `Automação "${automacao.nome}".`,
        ator: "automacao",
      });
      await anotar(
        jornada.id,
        jornada.passoAtual,
        "acao",
        `Oportunidade movida para "${passo.etapa}".`,
      );
      return { tipo: "seguir", ...NADA };
    }

    case "DEFINIR_PROXIMA_ACAO": {
      if (jornada.opportunityId === null) return { tipo: "seguir", ...NADA };
      if (modo === "SHADOW") {
        await anotar(jornada.id, jornada.passoAtual, "shadow", `Teria definido: ${passo.acao}.`);
        return { tipo: "seguir", mensagens: 0, tarefas: 0, simuladas: 1 };
      }

      await definirProximaAcao(
        ctx.organizationId,
        jornada.opportunityId,
        passo.acao,
        new Date(agora.getTime() + passo.emHoras * 3_600_000),
      );
      await anotar(jornada.id, jornada.passoAtual, "acao", `Próxima ação definida: ${passo.acao}.`);
      return { tipo: "seguir", ...NADA };
    }

    case "SAIR_SE": {
      const bate = avaliarCondicao(passo.condicao, contextoCondicao);
      await anotar(
        jornada.id,
        jornada.passoAtual,
        "condicao",
        `${rotulo}: ${bate ? "condição satisfeita, encerrando" : "condição não satisfeita, seguindo"}.`,
      );
      return bate ? { tipo: "sair", motivo: passo.motivo, ...NADA } : { tipo: "seguir", ...NADA };
    }

    default: {
      const exaustivo: never = passo;
      void exaustivo;
      return { tipo: "seguir", ...NADA };
    }
  }
}

/**
 * A próxima vez que der "HH:mm" no fuso da clínica, dentro do horário útil.
 *
 * Se já passou hoje, vai para amanhã; se cair fora da janela (feriado, domingo),
 * `proximoInstanteUtil` empurra para a abertura seguinte.
 */
function proximaOcorrenciaDaHora(agora: Date, hora: string, cfg: ConfiguracaoCrc): Date {
  const [h, m] = hora.split(":");
  const alvoHora = Number.parseInt(h ?? "9", 10);
  const alvoMin = Number.parseInt(m ?? "0", 10);

  // Constrói o instante em UTC a partir da hora local pretendida. O
  // deslocamento sai da diferença entre o relógio local da clínica e o UTC no
  // MESMO instante, o que já embute horário de verão quando existir.
  const localAgora = new Date(
    agora.toLocaleString("en-US", { timeZone: cfg.horarioComercial.fuso }),
  );
  const deslocamentoMs = agora.getTime() - localAgora.getTime();

  const alvoLocal = new Date(localAgora);
  alvoLocal.setHours(alvoHora, alvoMin, 0, 0);
  if (alvoLocal.getTime() <= localAgora.getTime()) {
    alvoLocal.setDate(alvoLocal.getDate() + 1);
  }

  return proximoInstanteUtil(new Date(alvoLocal.getTime() + deslocamentoMs), cfg.horarioComercial);
}

async function pacienteRespondeuDepoisDe(
  organizationId: string,
  patientId: string,
  desdeIso: string,
): Promise<boolean> {
  const linha = await selecionarUm("crc_messages", {
    colunas: "id",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
      { coluna: "direcao", op: "eq", valor: "ENTRADA" },
      { coluna: "criado_em", op: "gt", valor: desdeIso },
    ],
  });
  return linha !== null;
}

/* -------------------------------------------------------------------------- */
/* Transições de estado                                                       */
/* -------------------------------------------------------------------------- */

async function adiar(
  enrollmentId: string,
  ate: Date,
  status: "ACTIVE" | "WAITING" | "PAUSED",
  passoAtual?: number,
): Promise<void> {
  const mudancas: Linha = {
    status,
    resume_at: ate.toISOString(),
    // Libera o lock: a jornada volta a ser reservável na hora marcada.
    travado_ate: null,
    tentativas: 0,
    ultimo_erro: null,
    atualizado_em: new Date().toISOString(),
  };
  if (passoAtual !== undefined) mudancas["passo_atual"] = passoAtual;

  await atualizar(
    "crc_automation_enrollments",
    [{ coluna: "id", op: "eq", valor: enrollmentId }],
    mudancas,
  );
}

async function encerrar(
  enrollmentId: string,
  status: "COMPLETED" | "EXITED" | "FAILED" | "CANCELLED",
  motivo: string,
): Promise<void> {
  await atualizar("crc_automation_enrollments", [{ coluna: "id", op: "eq", valor: enrollmentId }], {
    status,
    saiu_por: motivo,
    resume_at: null,
    travado_ate: null,
    concluido_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  });
}

/**
 * Uma jornada que estourou volta com espera crescente; depois de quatro
 * tentativas vira dead letter e para de consumir worker.
 */
async function tratarFalhaDeJornada(jornada: Jornada, erro: unknown): Promise<void> {
  const detalhe = descreverErro(erro);
  const linha = await selecionarUm("crc_automation_enrollments", {
    colunas: "tentativas",
    filtros: [{ coluna: "id", op: "eq", valor: jornada.id }],
  });
  const tentativas = (typeof linha?.["tentativas"] === "number" ? linha["tentativas"] : 0) + 1;

  registrar("erro", "Jornada falhou.", {
    organizationId: jornada.organizationId,
    enrollmentId: jornada.id,
    tentativas,
    detalhe,
  });
  await anotar(jornada.id, jornada.passoAtual, "erro", detalhe);

  if (tentativas >= MAX_TENTATIVAS_JORNADA) {
    await encerrar(jornada.id, "FAILED", "erros_repetidos");
    await mandarParaDeadLetter({
      organizationId: jornada.organizationId,
      origem: "jornada",
      referencia: jornada.id,
      erro: detalhe,
      payload: { passo: jornada.passoAtual, automationId: jornada.automationId },
    });
    return;
  }

  await atualizar("crc_automation_enrollments", [{ coluna: "id", op: "eq", valor: jornada.id }], {
    tentativas,
    ultimo_erro: detalhe.slice(0, 1000),
    travado_ate: null,
    resume_at: new Date(Date.now() + Math.pow(3, tentativas) * 60_000).toISOString(),
  });
}

/* -------------------------------------------------------------------------- */
/* Intervenção humana (item 100)                                              */
/* -------------------------------------------------------------------------- */

export async function pausarJornada(organizationId: string, enrollmentId: string): Promise<void> {
  await atualizar(
    "crc_automation_enrollments",
    [
      { coluna: "id", op: "eq", valor: enrollmentId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    { status: "PAUSED", resume_at: null, travado_ate: null },
  );
  await anotar(enrollmentId, null, "espera", "Pausada manualmente.");
}

export async function retomarJornada(organizationId: string, enrollmentId: string): Promise<void> {
  await atualizar(
    "crc_automation_enrollments",
    [
      { coluna: "id", op: "eq", valor: enrollmentId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "status", op: "eq", valor: "PAUSED" },
    ],
    { status: "ACTIVE", resume_at: new Date().toISOString() },
  );
  await anotar(enrollmentId, null, "espera", "Retomada manualmente.");
}

export async function encerrarJornadaManualmente(
  organizationId: string,
  enrollmentId: string,
  motivo: string,
): Promise<void> {
  await atualizar(
    "crc_automation_enrollments",
    [
      { coluna: "id", op: "eq", valor: enrollmentId },
      { coluna: "organization_id", op: "eq", valor: organizationId },
    ],
    {
      status: "CANCELLED",
      saiu_por: motivo,
      resume_at: null,
      travado_ate: null,
      concluido_em: new Date().toISOString(),
    },
  );
  await anotar(enrollmentId, null, "saida", `Encerrada manualmente: ${motivo}.`);
}

/** Item 179: o que a tela do debugger de jornada mostra. */
export async function historicoDaJornada(enrollmentId: string): Promise<Linha[]> {
  return selecionar("crc_automation_logs", {
    filtros: [{ coluna: "enrollment_id", op: "eq", valor: enrollmentId }],
    ordenar: [{ coluna: "criado_em", ascendente: true }],
    limite: 200,
  });
}

export async function jornadasDoPaciente(
  organizationId: string,
  patientId: string,
): Promise<Jornada[]> {
  const linhas = await selecionar("crc_automation_enrollments", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "patient_id", op: "eq", valor: patientId },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: 20,
  });
  return linhas.map(linhaParaJornada);
}

export { CONFIGURACAO_PADRAO };
export type { CondicaoAutomacao };
