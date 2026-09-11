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
  contextoAgendamento: () => Promise<
    import("../aplicacao/agendamento").ContextoAgendamento | null
  >;
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
      case "agenda.horarios_livres":
        return await horariosLivres(deps);
      case "agenda.oferecer":
        return await oferecer(deps);
      case "agenda.aceitar":
        return await aceitar(argumentos, deps);
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
