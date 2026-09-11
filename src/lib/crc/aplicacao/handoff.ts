/**
 * O handoff que não pode falhar em silêncio — Fase C.
 *
 * O PROBLEMA, escrito sem rodeio: a criação do caso humano estava dentro de um
 * `catch {}`. O agente decidia "isto exige uma pessoa", a gravação falhava, e o
 * turno seguia como se nada tivesse acontecido. Do outro lado havia alguém que
 * perguntou sobre remédio, ou reclamou, ou pediu para falar com gente — e
 * ninguém na clínica ficava sabendo.
 *
 * Um `catch {}` num caminho de segurança é pior do que uma exceção: a exceção
 * pelo menos aparece.
 *
 * A CASCATA, e por que cada degrau existe:
 *
 *   1. CASO HUMANO       é o registro certo: uma conversa parada esperando
 *                        gente, com o contexto do que já aconteceu nela.
 *
 *   2. TAREFA            se a tabela de casos estiver indisponível, uma tarefa
 *                        aparece na fila do dia de alguém. Perde o contexto
 *                        rico, mantém a pessoa.
 *
 *   3. DEAD LETTER       se nem tarefa grava, o fato fica registrado onde a
 *                        operação procura o que quebrou.
 *
 *   4. LOG DE ERRO       último recurso, e severidade alta. Se os três
 *                        anteriores falharam, o banco está fora — e isso é um
 *                        incidente, não um detalhe do turno.
 *
 * O QUE NUNCA ACONTECE: os quatro falharem e o sistema seguir calado.
 */
export type PedidoHandoff = {
  organizationId: string;
  clinicId: string | null;
  conversationId: string;
  patientId: string | null;
  /** Estável, para métrica: conteudo_clinico, promessa_sem_acao, teto_de_passos… */
  codigo: string;
  /** Em português. É o enunciado que a recepção lê. */
  motivo: string;
  resumo: string | null;
  /** O que o agente teria dito. Rascunho para a pessoa, e evidência do bloqueio. */
  respostaBarrada: string | null;
  chaveDedupe: string;
  runId?: string | null;
};

/** Onde o handoff conseguiu pousar. `nenhum` é incidente. */
export type DestinoDoHandoff = "caso" | "tarefa" | "dead_letter" | "nenhum";

export type ResultadoHandoff = {
  destino: DestinoDoHandoff;
  /** Os degraus que falharam, em ordem. Vazio quando o primeiro funcionou. */
  falhas: readonly string[];
};

/**
 * Garante que a conversa chegue a uma pessoa. NUNCA LANÇA.
 *
 * Não lança porque o desfecho do turno já foi decidido quando isto é chamado, e
 * uma exceção aqui trocaria "precisa de gente, e registramos" por "o turno
 * inteiro explodiu". O que ela faz em vez disso é DEVOLVER onde pousou — e quem
 * chama pode registrar isso no trace.
 */
export async function garantirHandoff(pedido: PedidoHandoff): Promise<ResultadoHandoff> {
  const falhas: string[] = [];

  // --- 1. o caso humano ------------------------------------------------------
  try {
    const { abrirCaso } = await import("./casos");
    await abrirCaso({
      organizationId: pedido.organizationId,
      clinicId: pedido.clinicId,
      conversationId: pedido.conversationId,
      patientId: pedido.patientId,
      runId: pedido.runId ?? null,
      motivoCodigo: pedido.codigo,
      motivo: pedido.motivo,
      resumo: pedido.resumo,
      respostaBarrada: pedido.respostaBarrada,
      proximaAcao: null,
      chaveDedupe: pedido.chaveDedupe,
      // Conteúdo clínico é o único que entra como ALTA: os outros esperam.
      prioridade: prioridadeDe(pedido.codigo),
    });
    return { destino: "caso", falhas };
  } catch (erro) {
    falhas.push(`caso: ${descrever(erro)}`);
  }

  // --- 2. a tarefa -----------------------------------------------------------
  try {
    const { inserirIgnorandoDuplicata, agoraIso } = await import("../servidor/banco");

    // `crc_tasks.clinic_id` É NOT NULL. Quando o pedido veio sem clínica — o
    // contexto do turno nem sempre a resolve —, ela vem da conversa. Sem isto o
    // INSERT é recusado pelo banco e o degrau 2 nunca funciona, justamente nos
    // casos em que ele é a última rede antes da dead letter.
    const clinicId = pedido.clinicId ?? (await clinicaDaConversa(pedido));
    if (clinicId === null) throw new Error("A conversa não tem clínica.");

    await inserirIgnorandoDuplicata("crc_tasks", {
      organization_id: pedido.organizationId,
      clinic_id: clinicId,
      patient_id: pedido.patientId,
      // `RETORNAR` porque o enum de tarefa é fechado e este é o tipo que
      // descreve o que a pessoa precisa fazer: voltar nessa conversa.
      tipo: "RETORNAR",
      titulo: `A IA pediu ajuda numa conversa: ${pedido.motivo}`.slice(0, 200),
      motivo: pedido.codigo,
      // A CONVERSA VAI NAS NOTAS porque `crc_tasks` não tem FK para ela. É pior
      // do que o caso humano, e é exatamente por isso que é o degrau 2 — mas sem
      // o id aqui a recepção receberia "a IA pediu ajuda" sem saber com quem
      // falar, e o registro não teria destino.
      notas: [
        pedido.motivo,
        pedido.resumo === null ? null : `Resumo: ${pedido.resumo}`,
        pedido.respostaBarrada === null ? null : `O que a IA ia dizer: ${pedido.respostaBarrada}`,
        `Conversa: ${pedido.conversationId}`,
      ]
        .filter((l): l is string => l !== null)
        .join("\n"),
      status: "OPEN",
      prioridade: prioridadeDe(pedido.codigo) === "ALTA" ? 90 : 50,
      due_at: agoraIso(),
      chave_dedupe: pedido.chaveDedupe,
    });
    return { destino: "tarefa", falhas };
  } catch (erro) {
    falhas.push(`tarefa: ${descrever(erro)}`);
  }

  // --- 3. a dead letter ------------------------------------------------------
  try {
    const { inserir } = await import("../servidor/banco");
    await inserir("crc_dead_letters", {
      organization_id: pedido.organizationId,
      origem: "handoff",
      erro: `A IA pediu humano e não conseguiu registrar: ${falhas.join(" | ")}`.slice(0, 1000),
      payload: {
        conversationId: pedido.conversationId,
        patientId: pedido.patientId,
        codigo: pedido.codigo,
        motivo: pedido.motivo,
      },
      status: "PENDENTE",
    });
    return { destino: "dead_letter", falhas };
  } catch (erro) {
    falhas.push(`dead_letter: ${descrever(erro)}`);
  }

  // --- 4. o grito ------------------------------------------------------------
  //
  // Três caminhos de gravação falharam. O banco está fora, e uma pessoa precisa
  // saber disso agora — não amanhã, quando alguém notar que a fila está vazia.
  try {
    const { registrar } = await import("../servidor/registro");
    registrar("erro", "HANDOFF PERDIDO: a IA pediu humano e nenhum registro foi gravado.", {
      organizationId: pedido.organizationId,
      conversationId: pedido.conversationId,
      codigo: pedido.codigo,
      detalhe: falhas.join(" | "),
    });
  } catch {
    // Se nem o log funciona, não há mais nada a fazer daqui de dentro.
  }

  return { destino: "nenhum", falhas };
}

/** A clínica da conversa, quando o pedido não trouxe uma. */
async function clinicaDaConversa(pedido: PedidoHandoff): Promise<string | null> {
  const { selecionarUm } = await import("../servidor/banco");
  const l = await selecionarUm("crc_conversations", {
    colunas: "clinic_id",
    filtros: [
      { coluna: "id", op: "eq", valor: pedido.conversationId },
      // O TENANT ENTRA NO FILTRO mesmo sabendo o id da conversa. Id é chute
      // possível; `organization_id` é o que garante que a leitura fica na
      // clínica certa.
      { coluna: "organization_id", op: "eq", valor: pedido.organizationId },
    ],
  });
  return typeof l?.["clinic_id"] === "string" ? l["clinic_id"] : null;
}

const prioridadeDe = (codigo: string): "ALTA" | "NORMAL" =>
  codigo === "conteudo_clinico" ? "ALTA" : "NORMAL";

const descrever = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).slice(0, 200);
