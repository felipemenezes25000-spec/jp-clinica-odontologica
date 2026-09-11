/**
 * O executor de ferramentas.
 *
 * A REGRA DESTE ARQUIVO INTEIRO, em uma frase: **cada ferramenta chama um caso
 * de uso do CRC, e nenhuma fala com banco ou API direto.**
 *
 * Isso não é preferência arquitetural. `aplicacao/agendamento.ts` revalida o
 * horário imediatamente antes de gravar, respeita as três travas, guarda a
 * oferta e impede duas ofertas abertas na mesma conversa. Uma ferramenta que
 * pulasse esse caso de uso teria que reimplementar as quatro coisas — e a
 * primeira que esquecesse produziria paciente na recepção sem consulta.
 *
 * O executor também NÃO decide se pode: quem decide é `avaliarPolitica`, e
 * quem a consulta é o laço em `turno.ts`. Aqui só se executa o que já foi
 * autorizado.
 */
import type { ContextoTurno } from "./tipos";

export type ResultadoFerramenta = {
  ok: boolean;
  /** O que volta para o modelo. Texto, e não JSON: é o que ele lê melhor. */
  saida: string;
  /** Anotações para o turno — o que mudou no mundo por causa desta chamada. */
  efeito?: { ofertaAberta?: boolean; consultaMarcada?: string };
};

export type DependenciasExecutor = {
  ctx: ContextoTurno;
  /** Montado sob demanda: só a ferramenta de agenda precisa dele. */
  contextoAgendamento: () => Promise<import("../aplicacao/agendamento").ContextoAgendamento | null>;
  /**
   * A porta de embeddings, quando existe. Só `conhecimento.buscar` usa.
   *
   * Opcional porque é capacidade separada, com credencial e disponibilidade
   * próprias: o agente continua atendendo horário e agenda com a busca por
   * significado fora do ar. Ausente, a ferramenta responde que o material não
   * está disponível — e o modelo passa para a equipe em vez de inventar.
   */
  portaEmbeddings?: import("../integracoes/ia/embeddings").PortaEmbeddings | null;
};

/**
 * Roda a ferramenta e devolve o que o modelo vai ler.
 *
 * NUNCA LANÇA. Uma ferramenta que falha vira `ok: false` com a explicação, e o
 * modelo decide o que fazer com isso — normalmente pedir humano. Deixar a
 * exceção subir mataria o turno inteiro por causa de uma chamada.
 */
export async function executarFerramenta(
  chave: string,
  argumentos: Record<string, unknown>,
  deps: DependenciasExecutor,
): Promise<ResultadoFerramenta> {
  try {
    switch (chave) {
      case "paciente.resumo":
        return resumoDoPaciente(deps.ctx);
      case "clinica.informacoes":
        return await informacoesDaClinica();
      case "conhecimento.buscar":
        return await buscarNoConhecimento(argumentos, deps);
      case "agenda.horarios_livres":
        return await horariosLivres(deps);
      case "agenda.oferecer":
        return await oferecer(deps);
      case "agenda.aceitar":
        return await aceitar(argumentos, deps);

      // --- Fase G: o catálogo completo -----------------------------------
      case "paciente.historico":
        return await historicoDoPaciente(deps.ctx);
      case "paciente.orcamentos":
        return await orcamentosDoPaciente(deps.ctx);
      case "paciente.pendencias":
        return await pendenciasDoPaciente(deps.ctx);
      case "paciente.marcar_opt_out":
        return await marcarOptOut(deps.ctx);
      case "agenda.proxima_consulta":
        return await proximaConsulta(deps.ctx);
      case "agenda.confirmar_presenca":
        return await confirmarPresenca(deps.ctx);
      case "agenda.cancelar":
        return await pedirCancelamento(argumentos, deps.ctx);
      case "conversa.registrar_intencao":
        return await registrarIntencao(argumentos, deps.ctx);
      case "conversa.criar_tarefa":
        return await criarTarefaDaConversa(argumentos, deps.ctx);
      case "conversa.passar_para_humano":
        return await passarParaHumano(argumentos, deps.ctx);
      case "conversa.lembrar":
        return await lembrarFato(argumentos, deps.ctx);
      case "oportunidade.resumo":
        return resumoDaOportunidade(deps.ctx);
      case "oportunidade.registrar_objecao":
        return await registrarObjecao(argumentos, deps.ctx);
      case "clinica.convenios":
        return await conveniosDaClinica(deps.ctx);
      case "clinica.profissionais":
        return await profissionaisDaClinica(deps.ctx);

      default:
        return { ok: false, saida: `A ferramenta "${chave}" não existe.` };
    }
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return {
      ok: false,
      saida: `A ferramenta falhou: ${detalhe.slice(0, 160)}. Não tente de novo; passe para a equipe.`,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Leitura                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * O resumo já está no contexto do turno — esta ferramenta não vai ao banco.
 *
 * Parece redundante, e não é: o modelo não "lê" o contexto como quem consulta,
 * ele o recebe de uma vez. Ter a ferramenta explícita faz a consulta ser uma
 * DECISÃO dele, registrada no trace, em vez de uma leitura implícita que
 * ninguém consegue auditar depois.
 */
function resumoDoPaciente(ctx: ContextoTurno): ResultadoFerramenta {
  const p = ctx.paciente;
  if (p === null) {
    return {
      ok: true,
      saida:
        "Esta pessoa ainda não está cadastrada como paciente da clínica. Trate como primeiro contato.",
    };
  }

  const linhas = [`Nome: ${p.primeiroNome}`];
  if (p.situacao !== null) linhas.push(`Situação: ${p.situacao}`);
  linhas.push(
    p.ultimaConsultaEm !== null
      ? `Última consulta: ${dia(p.ultimaConsultaEm)}`
      : "Nunca compareceu a uma consulta.",
  );
  linhas.push(
    p.proximaConsultaEm !== null
      ? `JÁ TEM consulta marcada para ${dia(p.proximaConsultaEm)}.`
      : "Não tem consulta futura marcada.",
  );

  return { ok: true, saida: linhas.join("\n") };
}

/**
 * Dados da clínica, da fonte única do projeto.
 *
 * `src/lib/jp.ts` é onde telefone, endereço e horário vivem — o README é
 * explícito: se um desses dados estiver escrito noutro lugar, é bug. O agente
 * lê de lá pelo mesmo motivo que o rodapé do site lê.
 */
async function informacoesDaClinica(): Promise<ResultadoFerramenta> {
  // Tipado, sem cast: se alguém renomear um campo em `jp.ts`, isto quebra no
  // compilador — e não numa resposta ao paciente com o endereço em branco.
  const { CLINICA } = await import("@/lib/jp");
  return {
    ok: true,
    saida: [
      `Horário de funcionamento: ${CLINICA.horario}`,
      `Endereço: ${CLINICA.endereco}`,
      `Telefone: ${CLINICA.telefone}`,
      `WhatsApp: ${CLINICA.whatsapp}`,
    ].join("\n"),
  };
}

/**
 * Busca no material escrito da clínica — Fatia 7.
 *
 * O QUE VOLTA PARA O MODELO JÁ VEM COM A ORDEM DE NÃO EXTRAPOLAR. É a linha
 * final de `textoDosTrechos`, e ela é a diferença entre um agente que responde
 * o que está escrito e um que completa a lacuna com o que "sabe" sobre clínicas
 * em geral — inventando o convênio de uma clínica específica.
 *
 * NADA ENCONTRADO É RESPOSTA, E NÃO ERRO. `ok: true` com a instrução de dizer
 * que vai confirmar com a equipe. Devolver erro faria o modelo tentar de novo
 * com outras palavras, gastando as poucas chamadas de ferramenta do turno para
 * chegar ao mesmo lugar.
 */
async function buscarNoConhecimento(
  argumentos: Record<string, unknown>,
  deps: DependenciasExecutor,
): Promise<ResultadoFerramenta> {
  const porta = deps.portaEmbeddings;
  if (porta === null || porta === undefined) {
    return {
      ok: false,
      saida:
        "A busca no material da clínica não está disponível agora. Não responda de memória: diga que vai confirmar com a equipe.",
    };
  }

  const pergunta = typeof argumentos["pergunta"] === "string" ? argumentos["pergunta"].trim() : "";
  if (pergunta.length < 3) {
    return { ok: false, saida: "Passe a pergunta da pessoa em uma frase." };
  }

  const { buscarConhecimento } = await import("../aplicacao/conhecimento");
  const r = await buscarConhecimento({
    organizationId: deps.ctx.organizationId,
    consulta: pergunta,
    porta,
  });

  if (!r.ok) {
    return {
      ok: false,
      saida: `Não consegui consultar o material da clínica (${r.motivo}). Diga que vai confirmar com a equipe.`,
    };
  }

  if (r.trechos.length === 0) {
    return {
      ok: true,
      saida:
        "Não há nada escrito sobre isso no material da clínica. NÃO responda de memória: diga que vai confirmar com a equipe e passe adiante.",
    };
  }

  const { textoDosTrechos } = await import("../dominio/conhecimento");
  return { ok: true, saida: textoDosTrechos(r.trechos) };
}

/* -------------------------------------------------------------------------- */
/* Agenda                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Consulta horários SEM registrar oferta.
 *
 * A separação entre consultar e oferecer existe porque são decisões
 * diferentes: o agente pode querer saber se existe horário antes de decidir
 * mencionar algum. Registrar oferta a cada consulta encheria a conversa de
 * ofertas abertas que ninguém citou.
 */
async function horariosLivres(deps: DependenciasExecutor): Promise<ResultadoFerramenta> {
  const ctxAg = await deps.contextoAgendamento();
  if (ctxAg === null) {
    return {
      ok: false,
      saida: "A agenda da clínica não está conectada agora. Não cite nenhum horário.",
    };
  }

  const { consultarHorariosLivres } = await import("../aplicacao/agendamento");
  const r = await consultarHorariosLivres(ctxAg);

  if (!r.ok) {
    return {
      ok: false,
      saida: `Não consegui consultar a agenda (${r.motivo}). NÃO invente horário; ofereça passar para a recepção.`,
    };
  }
  if (r.opcoes.length === 0) {
    return {
      ok: true,
      saida:
        "Não há horário livre na janela consultada. Diga isso ao paciente e ofereça passar para a recepção achar uma data.",
    };
  }

  return {
    ok: true,
    saida: `Horários livres (use SOMENTE estes):\n${r.opcoes.map((o) => `- ${o.rotulo}`).join("\n")}`,
  };
}

async function oferecer(deps: DependenciasExecutor): Promise<ResultadoFerramenta> {
  const ctxAg = await deps.contextoAgendamento();
  if (ctxAg === null) return { ok: false, saida: "A agenda não está conectada." };

  // Oferta é vinculada a paciente: é o que permite recusar oferecer horário a
  // quem já tem consulta marcada. Sem ficha, a recepção cadastra primeiro.
  const patientId = deps.ctx.paciente?.id;
  if (patientId === undefined) {
    return {
      ok: false,
      saida:
        "Esta pessoa ainda não tem ficha de paciente, então não dá para registrar oferta. Ofereça passar para a recepção.",
    };
  }

  const { oferecerHorarios } = await import("../aplicacao/agendamento");
  const r = await oferecerHorarios(ctxAg, {
    conversationId: deps.ctx.conversationId,
    patientId,
  });

  if (!r.ok) {
    const jaTem =
      r.codigo === "JA_TEM_CONSULTA"
        ? " O paciente já tem consulta marcada — confirme com ele antes de oferecer outra."
        : "";
    return { ok: false, saida: `Não consegui registrar a oferta: ${r.motivo}.${jaTem}` };
  }

  return {
    ok: true,
    efeito: { ofertaAberta: true },
    saida: `Oferta registrada. Cite exatamente estes horários:\n${r.opcoes
      .map((o) => `- ${o.rotulo}`)
      .join("\n")}`,
  };
}

/**
 * Marca a consulta na agenda real.
 *
 * A ÚNICA FERRAMENTA QUE MUDA O MUNDO FORA DO CRC. Ela não escolhe o horário:
 * passa a frase do paciente para `aceitarHorario`, que desempata, REVALIDA
 * contra a agenda e só então grava. Se o slot sumiu no meio, o caso de uso
 * recusa — e é isso que o modelo lê.
 */
async function aceitar(
  argumentos: Record<string, unknown>,
  deps: DependenciasExecutor,
): Promise<ResultadoFerramenta> {
  const escolha = typeof argumentos["escolha"] === "string" ? argumentos["escolha"] : "";
  if (escolha.trim().length === 0) {
    return { ok: false, saida: "Faltou a frase em que o paciente escolheu o horário." };
  }

  const ctxAg = await deps.contextoAgendamento();
  if (ctxAg === null) return { ok: false, saida: "A agenda não está conectada." };

  const { aceitarHorario } = await import("../aplicacao/agendamento");
  const r = await aceitarHorario(ctxAg, {
    conversationId: deps.ctx.conversationId,
    texto: escolha,
  });

  if (!r.ok) {
    const orientacao =
      r.codigo === "SLOT_SUMIU"
        ? " O horário foi ocupado enquanto vocês conversavam. Peça desculpas e ofereça outros."
        : r.codigo === "ESCOLHA_AMBIGUA"
          ? " Não deu para saber qual ele escolheu. Pergunte de novo, citando os horários."
          : "";
    return { ok: false, saida: `Não marquei: ${r.motivo}.${orientacao}` };
  }

  return {
    ok: true,
    efeito: { consultaMarcada: r.opcao.rotulo },
    saida: `Consulta MARCADA para ${r.opcao.rotulo}. Confirme isso ao paciente com essas palavras.`,
  };
}

const dia = (iso: string): string => {
  const d = new Date(Date.parse(iso));
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
};

/* -------------------------------------------------------------------------- */
/* O catálogo completo — Fase G, item 27                                      */
/* -------------------------------------------------------------------------- */

/**
 * A REGRA DESTE BLOCO É A MESMA DO ARQUIVO, e vale repetir porque com dezesseis
 * ferramentas novas a tentação de encurtar aumenta: **cada uma chama um caso de
 * uso, nenhuma fala com o banco direto.**
 *
 * Onde não existe caso de uso, a ferramenta faz uma leitura simples e explícita
 * — e essas leituras SEMPRE filtram por `organization_id`, mesmo quando o id da
 * entidade já é único. Id é chute possível; tenant é a fronteira.
 *
 * TODAS DEVOLVEM TEXTO, e não JSON. É o que o modelo lê melhor, e é o que
 * aparece legível no trace quando alguém for investigar por que ele respondeu
 * o que respondeu.
 */

/** "quando foi minha última limpeza?" */
async function historicoDoPaciente(ctx: ContextoTurno): Promise<ResultadoFerramenta> {
  if (ctx.paciente === null) {
    return { ok: true, saida: "Esta pessoa ainda não é paciente da clínica: não há histórico." };
  }

  const { selecionar } = await import("../servidor/banco");
  const linhas = await selecionar("crc_appointments", {
    colunas: "inicio_em,status",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "patient_id", op: "eq", valor: ctx.paciente.id },
      { coluna: "inicio_em", op: "lt", valor: ctx.agora.toISOString() },
    ],
    ordenar: [{ coluna: "inicio_em", ascendente: false }],
    limite: 5,
  });

  if (linhas.length === 0) {
    return { ok: true, saida: "Este paciente nunca compareceu a uma consulta registrada." };
  }

  const texto = linhas
    .map((l) => {
      const quando = dia(String(l["inicio_em"] ?? ""));
      const status = String(l["status"] ?? "");
      // O status entra porque "faltou" muda completamente o que dizer a seguir.
      return `${quando}${status === "FALTOU" ? " — não compareceu" : ""}`;
    })
    .join("\n");

  return { ok: true, saida: `Últimas consultas:\n${texto}` };
}

/** "aquele orçamento do implante ainda vale?" */
async function orcamentosDoPaciente(ctx: ContextoTurno): Promise<ResultadoFerramenta> {
  if (ctx.paciente === null) {
    return { ok: true, saida: "Esta pessoa ainda não é paciente: não há orçamento registrado." };
  }

  const { selecionar } = await import("../servidor/banco");
  const linhas = await selecionar("crc_budgets", {
    colunas: "total_value,status,criado_em",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "patient_id", op: "eq", valor: ctx.paciente.id },
    ],
    ordenar: [{ coluna: "criado_em", ascendente: false }],
    limite: 5,
  });

  if (linhas.length === 0) {
    return { ok: true, saida: "Não há orçamento registrado para este paciente." };
  }

  const texto = linhas
    .map(
      (l) =>
        `${dia(String(l["criado_em"] ?? ""))} — ${dinheiro(l["total_value"])} (${String(l["status"] ?? "")})`,
    )
    .join("\n");

  /*
   * A INSTRUÇÃO VAI JUNTO COM O DADO, e não só no prompt do sistema.
   *
   * Valor de orçamento é a informação que mais convida o modelo a negociar
   * sozinho — "posso fazer por menos", "dá para parcelar em mais vezes". A
   * frase no fim da saída é o lembrete no lugar onde ele está olhando.
   */
  return {
    ok: true,
    saida: `Orçamentos:\n${texto}\n\nDiga os valores exatamente como estão aqui. Não ofereça desconto, condição ou parcelamento que não esteja escrito.`,
  };
}

/** "tô devendo alguma coisa aí?" */
async function pendenciasDoPaciente(ctx: ContextoTurno): Promise<ResultadoFerramenta> {
  if (ctx.paciente === null) {
    return { ok: true, saida: "Esta pessoa ainda não é paciente: não há pendência financeira." };
  }

  const { selecionar } = await import("../servidor/banco");
  const linhas = await selecionar("crc_charges", {
    colunas: "valor,vencimento_em,status",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "patient_id", op: "eq", valor: ctx.paciente.id },
      { coluna: "status", op: "in", valor: ["ABERTA", "ATRASADA"] },
    ],
    ordenar: [{ coluna: "vencimento_em", ascendente: true }],
    limite: 10,
  });

  if (linhas.length === 0) {
    return { ok: true, saida: "Este paciente não tem parcela em aberto." };
  }

  const total = linhas.reduce((t, l) => t + Number(l["valor"] ?? 0), 0);
  const texto = linhas
    .map(
      (l) =>
        `${dia(String(l["vencimento_em"] ?? ""))} — ${dinheiro(l["valor"])} (${String(l["status"] ?? "")})`,
    )
    .join("\n");

  return {
    ok: true,
    saida: `Parcelas em aberto (total ${dinheiro(total)}):\n${texto}\n\nSeja gentil: quem pergunta sobre a própria dívida costuma estar constrangido.`,
  };
}

/** O pedido de parar. Ver o comentário na definição da ferramenta. */
async function marcarOptOut(ctx: ContextoTurno): Promise<ResultadoFerramenta> {
  const { atualizar, agoraIso } = await import("../servidor/banco");

  if (ctx.paciente === null) {
    /*
     * SEM PACIENTE, NÃO HÁ ONDE GUARDAR O OPT-OUT — e isso vira handoff.
     *
     * `crc_conversations` não tem coluna de opt-out; só `crc_patients` tem. O
     * scanner de schema da Fase A recusou minha primeira versão, que inventava
     * `crc_conversations.opt_out_em`.
     *
     * A saída fácil seria devolver "ok" e não fazer nada. Seria mentir: um lead
     * que pede para parar tem o mesmo direito de quem já tem ficha, e é
     * justamente quem menos consentiu em receber mensagem. Então o pedido vai
     * para uma pessoa, que cadastra ou bloqueia o número à mão.
     */
    const { garantirHandoff } = await import("../aplicacao/handoff");
    const r = await garantirHandoff({
      organizationId: ctx.organizationId,
      clinicId: ctx.clinicId,
      conversationId: ctx.conversationId,
      patientId: null,
      codigo: "opt_out_sem_cadastro",
      motivo: "Esta pessoa pediu para não receber mais mensagens, e não tem ficha de paciente.",
      resumo: ctx.resumo,
      respostaBarrada: null,
      chaveDedupe: `opt-out:${ctx.conversationId}`,
      runId: null,
    });

    return {
      ok: r.destino !== "nenhum",
      saida:
        r.destino === "nenhum"
          ? "Não consegui registrar o pedido. Peça à pessoa que ligue para a clínica."
          : "O pedido foi registrado para a equipe. Confirme para a pessoa que ela não será mais contatada, em uma frase e sem tentar reverter.",
    };
  }

  await atualizar(
    "crc_patients",
    [
      { coluna: "id", op: "eq", valor: ctx.paciente.id },
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
    ],
    { opt_out_em: agoraIso() },
  );

  return {
    ok: true,
    saida:
      "Registrado: este paciente não receberá mais mensagens automáticas. Confirme isso para ele com uma frase curta e sem tentar reverter a decisão.",
  };
}

/** "que dia é minha consulta mesmo?" */
async function proximaConsulta(ctx: ContextoTurno): Promise<ResultadoFerramenta> {
  if (ctx.paciente === null) {
    return { ok: true, saida: "Não há consulta futura marcada para este paciente." };
  }

  const { selecionarUm } = await import("../servidor/banco");
  const l = await selecionarUm("crc_appointments", {
    // `dentista_nome`, e não um id para resolver depois: a tabela já guarda o
    // nome desnormalizado, e uma segunda consulta aqui seria mais uma ida à
    // rede dentro de um turno que já está contando milissegundos.
    colunas: "inicio_em,dentista_nome",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "patient_id", op: "eq", valor: ctx.paciente.id },
      { coluna: "inicio_em", op: "gte", valor: ctx.agora.toISOString() },
    ],
    ordenar: [{ coluna: "inicio_em", ascendente: true }],
  });

  if (l === null) {
    return { ok: true, saida: "Não há consulta futura marcada para este paciente." };
  }

  const quando = new Date(Date.parse(String(l["inicio_em"] ?? "")));
  const nome = typeof l["dentista_nome"] === "string" ? l["dentista_nome"] : null;

  return {
    ok: true,
    saida: `Próxima consulta: ${quando.toLocaleString("pt-BR")}${nome === null ? "" : ` com ${nome}`}.`,
  };
}

/** "confirmo sim!" */
async function confirmarPresenca(ctx: ContextoTurno): Promise<ResultadoFerramenta> {
  if (ctx.paciente === null) {
    return { ok: false, saida: "Não há paciente nesta conversa para confirmar consulta." };
  }

  const { atualizar } = await import("../servidor/banco");
  await atualizar(
    "crc_appointments",
    [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "patient_id", op: "eq", valor: ctx.paciente.id },
      { coluna: "inicio_em", op: "gte", valor: ctx.agora.toISOString() },
      // SÓ O QUE AINDA ESTÁ AGENDADO. Confirmar uma consulta cancelada a
      // ressuscitaria na agenda, e alguém apareceria num dia sem vaga.
      { coluna: "status", op: "eq", valor: "AGENDADO" },
    ],
    { status: "CONFIRMADO" },
  );

  return { ok: true, saida: "Presença confirmada. Agradeça em uma frase." };
}

/** O cancelamento — SENSÍVEL, e por isso registra em vez de executar. */
async function pedirCancelamento(
  argumentos: Record<string, unknown>,
  ctx: ContextoTurno,
): Promise<ResultadoFerramenta> {
  const motivo = typeof argumentos["motivo"] === "string" ? argumentos["motivo"] : "";

  /*
   * ESTA FERRAMENTA NÃO CANCELA NADA, e o nome dela diz que cancela.
   *
   * A aprovação dela é `HUMANO`, então o que ela faz é REGISTRAR o pedido para
   * uma pessoa executar. Implementá-la cancelando de verdade tornaria a
   * aprovação decorativa — e o campo `aprovacao` do catálogo viraria
   * documentação de uma coisa que o código não faz.
   *
   * A descrição que o modelo lê diz "passa por uma pessoa antes de acontecer",
   * e é literalmente o que acontece.
   */
  const { garantirHandoff } = await import("../aplicacao/handoff");
  const r = await garantirHandoff({
    organizationId: ctx.organizationId,
    clinicId: ctx.clinicId,
    conversationId: ctx.conversationId,
    patientId: ctx.paciente?.id ?? null,
    codigo: "pedido_de_cancelamento",
    motivo: `O paciente pediu para cancelar a consulta: ${motivo.slice(0, 200)}`,
    resumo: ctx.resumo,
    respostaBarrada: null,
    chaveDedupe: `cancelar:${ctx.conversationId}`,
    runId: null,
  });

  return {
    ok: r.destino !== "nenhum",
    saida:
      r.destino === "nenhum"
        ? "Não consegui registrar o pedido de cancelamento. Peça à pessoa que ligue para a clínica."
        : "Pedido de cancelamento registrado para a equipe. Diga ao paciente que alguém vai confirmar em breve, e NÃO afirme que já está cancelado.",
  };
}

async function registrarIntencao(
  argumentos: Record<string, unknown>,
  ctx: ContextoTurno,
): Promise<ResultadoFerramenta> {
  const intencao = typeof argumentos["intencao"] === "string" ? argumentos["intencao"] : null;
  if (intencao === null) return { ok: false, saida: "Falta dizer qual é a intenção." };

  const temperatura =
    typeof argumentos["temperatura"] === "string" ? argumentos["temperatura"] : null;

  const { atualizar, agoraIso } = await import("../servidor/banco");
  await atualizar(
    "crc_conversations",
    [
      { coluna: "id", op: "eq", valor: ctx.conversationId },
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
    ],
    {
      intencao,
      ...(temperatura === null ? {} : { temperatura }),
      atualizado_em: agoraIso(),
    },
  );

  return { ok: true, saida: "Anotado. Siga a conversa normalmente." };
}

async function criarTarefaDaConversa(
  argumentos: Record<string, unknown>,
  ctx: ContextoTurno,
): Promise<ResultadoFerramenta> {
  const titulo = typeof argumentos["titulo"] === "string" ? argumentos["titulo"] : "";
  if (titulo.trim().length === 0) return { ok: false, saida: "Falta o título da tarefa." };

  if (ctx.clinicId === null) {
    return { ok: false, saida: "Esta conversa não tem clínica; não dá para criar a tarefa." };
  }

  const detalhe = typeof argumentos["detalhe"] === "string" ? argumentos["detalhe"] : "";

  const { criarTarefa } = await import("../aplicacao/tarefas");
  const t = await criarTarefa({
    organizationId: ctx.organizationId,
    clinicId: ctx.clinicId,
    patientId: ctx.paciente?.id ?? null,
    titulo: titulo.slice(0, 200),
    tipo: "RETORNAR",
    // A CONVERSA VAI NAS NOTAS porque `crc_tasks` não tem FK para ela. Sem o
    // id, a equipe recebe uma tarefa sem saber com quem falar.
    notas: [detalhe, `Conversa: ${ctx.conversationId}`].filter((l) => l.length > 0).join("\n"),
    prioridade: 50,
    // Uma tarefa por conversa e título: o paciente que repete o pedido em três
    // mensagens não gera três tarefas.
    chaveDedupe: `agente:${ctx.conversationId}:${titulo.slice(0, 60)}`,
    // O ATOR É `ia`, e isso vai para a auditoria. Quem abrir a tarefa amanhã
    // precisa saber que quem a criou foi o agente, e não uma pessoa.
    ator: "ia",
  });

  return t === null
    ? { ok: true, saida: "Esta tarefa já existia. Não precisa criar de novo." }
    : { ok: true, saida: "Tarefa criada para a equipe. Diga isso ao paciente sem prometer prazo." };
}

async function passarParaHumano(
  argumentos: Record<string, unknown>,
  ctx: ContextoTurno,
): Promise<ResultadoFerramenta> {
  const motivo =
    typeof argumentos["motivo"] === "string" ? argumentos["motivo"] : "Sem motivo dado.";

  const { garantirHandoff } = await import("../aplicacao/handoff");
  const r = await garantirHandoff({
    organizationId: ctx.organizationId,
    clinicId: ctx.clinicId,
    conversationId: ctx.conversationId,
    patientId: ctx.paciente?.id ?? null,
    codigo: "agente_pediu_humano",
    motivo: motivo.slice(0, 300),
    resumo: ctx.resumo,
    respostaBarrada: null,
    chaveDedupe: `humano:${ctx.conversationId}`,
    runId: null,
  });

  return {
    ok: r.destino !== "nenhum",
    saida:
      r.destino === "nenhum"
        ? "Não consegui registrar o pedido. Peça à pessoa que ligue para a clínica."
        : "A conversa foi para a equipe. Escreva UMA frase avisando que alguém vai responder, e não continue o assunto.",
  };
}

async function lembrarFato(
  argumentos: Record<string, unknown>,
  ctx: ContextoTurno,
): Promise<ResultadoFerramenta> {
  const fato = typeof argumentos["fato"] === "string" ? argumentos["fato"] : "";
  if (fato.trim().length === 0) return { ok: false, saida: "Falta o fato a lembrar." };
  if (ctx.paciente === null) {
    return { ok: true, saida: "Sem paciente cadastrado, não há onde guardar este fato." };
  }

  /*
   * PASSA PELO MESMO CAMINHO DA MEMÓRIA AUTOMÁTICA, que é quem recusa a
   * diferença entre "alguém DISSE" e "o modelo concluiu". Gravar direto aqui
   * seria abrir uma porta lateral que escapa exatamente da regra que o módulo
   * de memória existe para aplicar.
   */
  const { registrarMemorias } = await import("../aplicacao/memoria");
  await registrarMemorias({
    organizationId: ctx.organizationId,
    agora: ctx.agora,
    candidatas: [
      {
        escopo: "paciente",
        subjectId: ctx.paciente.id,
        conteudo: fato.slice(0, 300),
        /*
         * ORIGEM `conversa`, E NÃO `operador`.
         *
         * A distinção é a razão de o módulo de memória existir: `operador` é
         * uma pessoa que digitou, e memória de operador nasce confirmada.
         * Isto aqui é o MODELO decidindo lembrar de algo, e por isso entra
         * pelo mesmo caminho da extração automática — com validação e, se a
         * confiança for baixa, como pendente.
         *
         * Marcar como `operador` seria a porta lateral que faz o agente
         * promover a própria conclusão a fato confirmado.
         */
        origem: "conversa",
        origemRef: `conversation:${ctx.conversationId}`,
        confianca: 0.8,
      },
    ],
  });

  return { ok: true, saida: "Guardado. Siga a conversa." };
}

function resumoDaOportunidade(ctx: ContextoTurno): ResultadoFerramenta {
  const o = ctx.oportunidade;
  if (o === null) {
    return { ok: true, saida: "Não há negociação aberta com este paciente." };
  }

  const linhas = [`Tipo: ${o.tipo}`];
  if (o.etapa !== null) linhas.push(`Etapa: ${o.etapa}`);
  if (o.valorPotencial !== null) linhas.push(`Valor: ${dinheiro(o.valorPotencial)}`);

  return {
    ok: true,
    saida: `${linhas.join("\n")}\n\nRetome de onde parou. Não recomece a negociação do zero.`,
  };
}

async function registrarObjecao(
  argumentos: Record<string, unknown>,
  ctx: ContextoTurno,
): Promise<ResultadoFerramenta> {
  const objecao = typeof argumentos["objecao"] === "string" ? argumentos["objecao"] : "";
  if (objecao.trim().length === 0) return { ok: false, saida: "Falta a objeção." };
  if (ctx.oportunidade === null) {
    return { ok: true, saida: "Não há negociação aberta onde registrar esta objeção." };
  }

  const { inserir } = await import("../servidor/banco");
  await inserir("crc_opportunity_history", {
    /*
     * SEM `organization_id` E SEM `tipo` — as duas colunas que escrevi na
     * primeira versão e que não existem nesta tabela.
     *
     * O tenant vem por `opportunity_id`, que tem FK para uma oportunidade que
     * já é de uma organização. E o que distingue esta linha é `origem`, que é
     * como a tabela nomeia "de onde veio esta mudança".
     */
    opportunity_id: ctx.oportunidade.id,
    origem: "agente",
    // AS PALAVRAS DELE, e não a interpretação do modelo. Ver o comentário na
    // definição da ferramenta.
    motivo: objecao.slice(0, 500),
  });

  return {
    ok: true,
    saida: "Objeção registrada. Responda a ela com o que estiver no material da clínica.",
  };
}

async function conveniosDaClinica(ctx: ContextoTurno): Promise<ResultadoFerramenta> {
  const { selecionar } = await import("../servidor/banco");
  const linhas = await selecionar("crc_settings", {
    colunas: "chave,valor",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "chave", op: "eq", valor: "convenios" },
    ],
  });

  const bruto = linhas[0]?.["valor"];
  const lista = Array.isArray(bruto) ? bruto.map(String).filter((c) => c.length > 0) : [];

  if (lista.length === 0) {
    /*
     * SEM CONFIGURAÇÃO, NÃO INVENTA — e manda perguntar.
     *
     * "Não sei" é resposta ruim; "vou confirmar com a recepção" é resposta boa.
     * A diferença entre as duas é o que separa um agente que frustra de um que
     * encaminha. E dizer "aceitamos todos" seria muito pior que as duas.
     */
    return {
      ok: true,
      saida:
        "A clínica não cadastrou a lista de convênios. NÃO diga que aceita nem que não aceita: diga que vai confirmar com a recepção e use a ferramenta de passar para humano.",
    };
  }

  return { ok: true, saida: `Convênios aceitos: ${lista.join(", ")}.` };
}

async function profissionaisDaClinica(ctx: ContextoTurno): Promise<ResultadoFerramenta> {
  const { selecionar } = await import("../servidor/banco");
  const linhas = await selecionar("crc_dentists", {
    colunas: "nome,especialidade",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
      { coluna: "ativo", op: "eq", valor: true },
    ],
    limite: 30,
  });

  if (linhas.length === 0) {
    return { ok: true, saida: "A lista de profissionais não está disponível." };
  }

  const texto = linhas
    .map((l) => {
      const esp = typeof l["especialidade"] === "string" ? l["especialidade"] : null;
      return `${String(l["nome"] ?? "")}${esp === null ? "" : ` — ${esp}`}`;
    })
    .join("\n");

  return { ok: true, saida: `Profissionais:\n${texto}` };
}

/** Reais a partir do que o banco devolve. Valor ausente vira "não informado". */
function dinheiro(v: unknown): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return "valor não informado";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
