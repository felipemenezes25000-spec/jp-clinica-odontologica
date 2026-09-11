/**
 * O turno do agente — Fatias 1 e 2 do CRC AI OS.
 *
 * FATIA 1 (sombra): a mensagem entra, o agente monta contexto, chama o modelo,
 * atravessa os portões e GRAVA a resposta candidata. Não envia nada.
 *
 * FATIA 2 (envio): a mesma função, com a flag `ai_agente_envio` ligada, entrega
 * a resposta a `aplicacao/mensagens.ts`. A diferença entre as duas fatias é uma
 * flag e um `if` — de propósito. Se o caminho de envio fosse outro código, a
 * sombra deixaria de provar o que ela existe para provar.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ, E NÃO PODE PASSAR A FAZER:
 *
 *   Não fala com Meta, Twilio, WAHA nem sandbox. Envio é sempre via
 *   `enviarMensagem`, que aplica opt-out, cooldown, teto, janela e dedupe
 *   (ADR-04).
 *
 *   Não fala com o Dental Office. Nem para ler. Na Fatia 1 não há Tool alguma;
 *   quando houver, ela chama o caso de uso, nunca a API.
 *
 *   Não decide sozinho se pode enviar. Quem decide é `dominio/guardrails.ts`,
 *   que é puro e testado sem isto aqui existir.
 */
import { avaliarAntesDeEnviar, type ContextoPortao } from "../dominio/guardrails";
import { estadoDaJanela } from "../dominio/janela-whatsapp";
import type { PortaIa } from "../integracoes/ia/porta";
import type { PortaMensageria } from "../integracoes/whatsapp/porta";

import type { EstadoPolitica } from "./ferramentas";
import { instrucoesDoLaco, rodarLaco, ESQUEMA_DECISAO } from "./laco";
import { montarContextoDoTurno, textoDoContexto } from "./contexto";
import { abrirTrace, type Trace } from "./tracing";
import { PROMPT_TURNO_SOMBRA, type ResultadoTurno } from "./tipos";

/**
 * As instruções do agente.
 *
 * Curtas de propósito. Instrução longa não torna o modelo mais obediente — ela
 * dilui o que importa e encarece cada turno. As proibições que realmente
 * importam não estão aqui: estão em `dominio/guardrails.ts`, onde o modelo não
 * pode negociá-las.
 */
const INSTRUCOES = `Você atende pelo WhatsApp da JP Clínica Integrada Odontológica.

Fale como a recepção fala: direto, gentil, em português do Brasil, sem formalidade
de carta. Uma ideia por mensagem. Nunca mais de três linhas.

O que você PODE fazer: responder sobre horário de funcionamento e localização,
entender o que a pessoa quer, confirmar o que ela disse, e dizer que vai passar
para a equipe quando for o caso.

O que você NÃO pode fazer, nunca:
- falar de diagnóstico, remédio, dose ou sintoma;
- afirmar horário disponível — você não consultou a agenda;
- prometer que alguém vai ligar, verificar ou retornar;
- citar preço, desconto ou negociação;
- mencionar sistema, ferramenta ou o fato de você ser um programa.

Quando a mensagem tocar em qualquer um desses pontos, responda algo curto e
acolhedor e marque precisaHumano = true com o motivo.`;

/* -------------------------------------------------------------------------- */
/* O pedido                                                                   */
/* -------------------------------------------------------------------------- */

export type PedidoTurno = {
  organizationId: string;
  conversationId: string;
  /** O evento que originou o turno — vira parte da chave de dedupe. */
  eventoId: string;
  agora: Date;
  porta: PortaIa | null;
  /** Só usada quando o envio está ligado. Na sombra, pode vir nula. */
  portaMensageria?: PortaMensageria | null;
  /** `ai_agente_envio` ligada E a automação em EXECUTAR. */
  podeEnviar: boolean;
  /**
   * O estado das travas que a política consulta. Vem do handler, já lido —
   * o laço não vai ao banco perguntar se pode.
   */
  politica: EstadoPolitica;
  /**
   * Monta o contexto de agendamento sob demanda. Só as ferramentas de agenda
   * precisam dele, e montá-lo exige falar com o Dental Office — caro demais
   * para fazer em todo turno.
   */
  contextoAgendamento?: () => Promise<
    import("../aplicacao/agendamento").ContextoAgendamento | null
  >;
  /**
   * `ai_supervisor` ligada. Roda a segunda leitura DEPOIS do desfecho, e é ela
   * quem propõe memória.
   *
   * Custa uma chamada de modelo por turno, então é flag própria e não um
   * detalhe da flag do agente: alguém pode querer o agente sem a supervisão, e
   * o inverso não faz sentido — supervisionar exige ter o que supervisionar.
   */
  supervisionar?: boolean;
  /**
   * A porta do supervisor, quando a clínica roteou essa finalidade para outro
   * modelo — Fatia 8. Ausente, usa a mesma da conversa.
   *
   * A separação vale dinheiro: o supervisor roda em todo turno, produz colunas e
   * não prosa, e o modelo pequeno faz isso bem. Pagar o modelo da conversa para
   * produzir uma nota de 0 a 10 dobraria o custo do turno sem melhorar nada que
   * um paciente leia.
   */
  portaSupervisor?: PortaIa | null;
  /**
   * A porta de embeddings, para `conhecimento.buscar`. Fatia 7.
   *
   * Separada da `porta` de conversa porque é outra capacidade, com outro modelo
   * e outra disponibilidade: o agente segue respondendo horário e agenda quando
   * a busca por significado está fora do ar.
   */
  portaEmbeddings?: import("../integracoes/ia/embeddings").PortaEmbeddings | null;
};

/* -------------------------------------------------------------------------- */
/* O turno                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Roda um turno e devolve o desfecho.
 *
 * NUNCA LANÇA. Toda saída é um `ResultadoTurno` nomeado, incluindo as falhas —
 * porque quem chama é o handler de evento, e uma exceção ali derrubaria o
 * processamento do evento inteiro, que também classifica e também dispara
 * jornada. O agente falhando não pode calar o resto do sistema (ADR-11).
 */
export async function rodarTurno(pedido: PedidoTurno): Promise<ResultadoTurno> {
  const trace = abrirTrace(pedido.organizationId, pedido.conversationId);

  /*
   * O QUE O TURNO VIU, para o supervisor poder olhar depois.
   *
   * O supervisor roda DEPOIS do desfecho — é a definição dele — e o desfecho
   * sai por oito caminhos diferentes lá dentro. Fazer cada um desses caminhos
   * carregar contexto e resposta de volta significaria mudar oito assinaturas
   * para servir a um observador. Este objeto é o lugar onde o turno deixa o que
   * viu, e ele é só de leitura para quem vem depois.
   */
  const visto: VistoNoTurno = { ctx: null, resposta: null };

  const resultado = await decidirEEntregar(pedido, trace, visto);

  // Fora do try/catch do turno de propósito: `supervisionar` já não lança, e
  // envolvê-lo no tratamento de erro do turno daria a impressão de que uma
  // falha dele poderia mudar o desfecho. Não pode — o desfecho já foi devolvido.
  await supervisionar(pedido, trace, visto, resultado);

  return resultado;
}

/** O que o turno deixa registrado para o supervisor. */
type VistoNoTurno = { ctx: Ctx | null; resposta: string | null };

async function decidirEEntregar(
  pedido: PedidoTurno,
  trace: Trace,
  visto: VistoNoTurno,
): Promise<ResultadoTurno> {
  const chaveDedupe = `turno:${pedido.eventoId}`;

  try {
    // --- contexto ---------------------------------------------------------
    const ctx = await trace.medir("contexto", "contexto", () =>
      montarContextoDoTurno(pedido.organizationId, pedido.conversationId, pedido.agora),
    );

    if (ctx === null) {
      return await encerrar(trace, chaveDedupe, ctx, {
        tipo: "sem_acao",
        motivo: "Conversa não encontrada.",
      });
    }
    visto.ctx = ctx;

    // Quem pediu para sair não gasta um turno de modelo. A checagem é antes da
    // chamada, e não depois: o portão de opt-out também barraria o envio, mas
    // barrar depois significaria ter pago pelo turno.
    if (ctx.paciente?.temOptOut === true) {
      return await encerrar(trace, chaveDedupe, ctx, {
        tipo: "sem_acao",
        motivo: "O paciente pediu para não receber mensagens.",
      });
    }

    if (pedido.porta === null) {
      return await encerrar(trace, chaveDedupe, ctx, {
        tipo: "falha_segura",
        motivo: "Nenhum provedor de IA configurado.",
      });
    }
    // Capturada aqui para o TypeScript saber, dentro da closure do laço, que
    // ela não é nula — em vez de uma asserção espalhada em cada uso.

    // --- o laço: modelo decide, ferramenta roda, modelo decide de novo -----
    const porta = pedido.porta;
    const base = textoDoContexto(ctx);

    const resultado = await trace.medir("laco", "modelo", () =>
      rodarLaco({
        estado: pedido.politica,
        executor: {
          ctx,
          contextoAgendamento: pedido.contextoAgendamento ?? (() => Promise.resolve(null)),
          portaEmbeddings: pedido.portaEmbeddings ?? null,
        },
        decidir: async (observacoes) => {
          const entrada =
            observacoes.length === 0
              ? base
              : `${base}\n\n## O que você já descobriu neste turno\n${observacoes.join("\n\n")}`;

          const r = await porta.gerarEstruturado({
            promptVersao: PROMPT_TURNO_SOMBRA,
            instrucoes: `${INSTRUCOES}\n\n${instrucoesDoLaco(pedido.politica)}`,
            entrada,
            esquema: { nome: "decisao_do_agente", schema: ESQUEMA_DECISAO },
            maxTokens: 400,
          });

          // O custo se acumula a cada volta: um turno com três ferramentas faz
          // quatro chamadas, e o trace precisa somar todas.
          trace.uso(r.ok ? r.uso : null);
          return r.ok ? { ok: true, dados: r.dados } : { ok: false, detalhe: r.detalhe };
        },
      }),
    );

    trace.ferramentas(resultado.passos);

    if (resultado.tipo === "falha") {
      /*
       * TETO DE GASTO ESTOURADO VIRA GENTE, E NÃO ERRO (ADR-12).
       *
       * A distinção existe porque do outro lado tem um paciente que escreveu e
       * está esperando. "A IA acabou o orçamento" é um problema da clínica, não
       * dele — e o único desfecho aceitável é alguém da recepção ver a conversa.
       *
       * O reconhecimento é pelo prefixo estável que o gateway coloca, e não pelo
       * texto em português da mensagem. Ver `MOTIVO_ORCAMENTO`.
       */
      const { MOTIVO_ORCAMENTO } = await import("../integracoes/ia/gateway");
      if (resultado.motivo.includes(MOTIVO_ORCAMENTO)) {
        await abrirCasoPorOrcamento(pedido, ctx, resultado.motivo);
      }

      return await encerrar(trace, chaveDedupe, ctx, {
        tipo: "falha_segura",
        motivo: resultado.motivo.slice(0, 240),
      });
    }

    if (resultado.tipo === "humano") {
      await abrirCasoHumano(pedido, ctx, {
        codigo: "agente_pediu_humano",
        motivo: resultado.motivo,
        respostaBarrada: null,
      });
      return await encerrar(trace, chaveDedupe, ctx, {
        tipo: "humano",
        motivo: resultado.motivo.slice(0, 240),
      });
    }

    const candidata = {
      texto: resultado.texto,
      raciocinio: "",
      precisaHumano: resultado.precisaHumano,
    };
    visto.resposta = candidata.texto;

    // --- portões ----------------------------------------------------------
    const janela = estadoDaJanela(ultimaEntradaEm(ctx), pedido.agora);
    const { dono } = await import("../aplicacao/casos").then((m) =>
      m.donoDaConversa(pedido.organizationId, pedido.conversationId),
    );

    const ctxPortao: ContextoPortao = {
      texto: candidata.texto,
      // Sempre falso AQUI: o opt-out encerrou o turno lá em cima, antes de
      // gastar a chamada de modelo — o TypeScript inclusive prova isso. O
      // portão continua na cadeia porque a garantia é a cadeia, e não a ordem
      // das checagens deste arquivo.
      temOptOut: false,
      ultimaEntrada: ultimaEntradaTexto(ctx),
      // O ESTADO REAL, e não "ia" fixo. É o que faz a IA calar quando um
      // atendente assumiu — e é a razão de a Fatia 5 existir.
      dono,
      janelaAberta: janela.aberta,
      enviadosRecentes: ctx.mensagens.filter((m) => m.direcao === "enviada").map((m) => m.texto),
      pediuHumano: candidata.precisaHumano,
    };

    const veredicto = trace.medirSync(
      "portoes",
      "portao",
      () => avaliarAntesDeEnviar(ctxPortao),
      // Saber QUAL portão barrou é metade da investigação, e o código do portão
      // não é dado de paciente.
      (r) => ({ bloqueado: !r.passa, codigo: r.passa ? null : r.codigo }),
    );

    if (!veredicto.passa) {
      if (veredicto.destino === "humano") {
        await abrirCasoHumano(pedido, ctx, {
          codigo: veredicto.codigo,
          motivo: veredicto.motivo,
          // O QUE O AGENTE IA DIZER vai junto: serve de rascunho para a pessoa
          // e de evidência de por que ele foi barrado.
          respostaBarrada: candidata.texto,
        });
      }
      return await encerrar(
        trace,
        chaveDedupe,
        ctx,
        {
          tipo: veredicto.destino === "humano" ? "humano" : "sem_acao",
          motivo: veredicto.motivo,
        },
        { candidata, portao: veredicto.portao },
      );
    }

    // --- envio, quando liberado ------------------------------------------
    //
    // ESTE É O ÚNICO PONTO DE DIFERENÇA ENTRE A FATIA 1 E A 2. Sem a flag, o
    // turno termina aqui com a resposta gravada e nada enviado.
    if (!pedido.podeEnviar) {
      return await encerrar(
        trace,
        chaveDedupe,
        ctx,
        { tipo: "candidato", texto: candidata.texto, motivo: "Envio do agente desligado." },
        { candidata },
      );
    }

    const envio = await trace.medir("envio", "persistencia", () =>
      entregar(pedido, ctx, candidata.texto),
    );

    return await encerrar(trace, chaveDedupe, ctx, envio, { candidata });
  } catch (erro) {
    // A rede de segurança. Qualquer coisa inesperada vira desfecho nomeado.
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    await trace.gravar(chaveDedupe, null, {
      tipo: "falha_segura",
      motivo: `Erro inesperado no turno: ${detalhe}`.slice(0, 240),
    });
    return { tipo: "falha_segura", motivo: detalhe };
  }
}

/* -------------------------------------------------------------------------- */
/* Auxiliares                                                                 */
/* -------------------------------------------------------------------------- */

type Ctx = NonNullable<Awaited<ReturnType<typeof montarContextoDoTurno>>>;

/**
 * O caso humano que nasce de um teto de gasto — Fatia 8.
 *
 * RESPEITA A ESCOLHA DA CLÍNICA. `crc_ai_orcamentos.abrir_caso` existe porque uma
 * clínica pode preferir que a IA simplesmente pare quando o teto acaba, sem
 * encher a fila da recepção — e uma coluna que não muda comportamento nenhum
 * seria pior do que não existir.
 *
 * NUNCA LANÇA, pela mesma razão de `abrirCasoHumano`.
 */
async function abrirCasoPorOrcamento(pedido: PedidoTurno, ctx: Ctx, motivo: string): Promise<void> {
  try {
    const { lerOrcamento } = await import("../aplicacao/orcamento");
    const orcamento = await lerOrcamento(pedido.organizationId);
    if (!orcamento.abrirCaso) return;

    await abrirCasoHumano(pedido, ctx, {
      codigo: "orcamento_estourado",
      // A frase que a recepção lê tem que dizer o que fazer, e não só o que
      // aconteceu: quem abre esta tarefa não configurou o teto.
      motivo: `${motivo.replace(/^[a-z_]+:\s*/u, "")} Responda esta pessoa à mão, e avise quem cuida das configurações.`,
      respostaBarrada: null,
    });
  } catch {
    // Ver o cabeçalho.
  }
}

/**
 * A segunda leitura do turno — Fatia 6.
 *
 * TRÊS CONDIÇÕES, E CADA UMA DESLIGA POR UM MOTIVO DIFERENTE:
 *
 *   sem flag         alguém não quer pagar uma segunda chamada por turno.
 *   sem contexto     o turno morreu antes de ter o que supervisionar.
 *   sem `runId`      não há run nova a que anexar — e, quando o id vem nulo por
 *                    dedupe, este evento já foi supervisionado numa passagem
 *                    anterior. É o que impede um reprocessamento de pagar o
 *                    supervisor de novo.
 *
 * NUNCA LANÇA: o desfecho do turno já foi decidido e devolvido. Uma leitura
 * posterior que estoura não pode alterá-lo.
 */
async function supervisionar(
  pedido: PedidoTurno,
  trace: Trace,
  visto: VistoNoTurno,
  resultado: ResultadoTurno,
): Promise<void> {
  if (pedido.supervisionar !== true) return;

  // A porta do supervisor, quando a clínica roteou essa finalidade para outro
  // modelo. Sem rota própria, a mesma da conversa.
  const porta = pedido.portaSupervisor ?? pedido.porta;
  if (porta === null) return;

  const ctx = visto.ctx;
  if (ctx === null) return;

  const runId = trace.runId();
  if (runId === null) return;

  try {
    const { supervisionarTurno } = await import("./supervisor");
    await supervisionarTurno({
      organizationId: pedido.organizationId,
      conversationId: pedido.conversationId,
      patientId: ctx.paciente?.id ?? null,
      runId,
      agora: pedido.agora,
      porta,
      resultado,
      respostaDoAgente: visto.resposta,
      mensagens: ctx.mensagens,
    });
  } catch {
    // Ver o cabeçalho.
  }
}

function ultimaEntradaEm(ctx: Ctx): string | null {
  for (let i = ctx.mensagens.length - 1; i >= 0; i -= 1) {
    const m = ctx.mensagens[i];
    if (m !== undefined && m.direcao === "recebida") return m.em;
  }
  return null;
}

function ultimaEntradaTexto(ctx: Ctx): string | null {
  for (let i = ctx.mensagens.length - 1; i >= 0; i -= 1) {
    const m = ctx.mensagens[i];
    if (m !== undefined && m.direcao === "recebida") return m.texto;
  }
  return null;
}

/** Entrega ao chokepoint de mensagens. Nunca à porta de mensageria. */
async function entregar(pedido: PedidoTurno, ctx: Ctx, texto: string): Promise<ResultadoTurno> {
  const porta = pedido.portaMensageria;
  if (porta === null || porta === undefined) {
    return { tipo: "falha_segura", motivo: "Envio ligado sem provedor de WhatsApp configurado." };
  }

  const { selecionarUm } = await import("../servidor/banco");
  const conversa = await selecionarUm("crc_conversations", {
    colunas: "telefone,clinic_id,patient_id",
    filtros: [
      { coluna: "id", op: "eq", valor: ctx.conversationId },
      { coluna: "organization_id", op: "eq", valor: ctx.organizationId },
    ],
  });

  if (conversa === null) {
    return { tipo: "falha_segura", motivo: "Conversa não encontrada na hora do envio." };
  }
  const telefone = typeof conversa["telefone"] === "string" ? conversa["telefone"] : "";
  if (telefone.length === 0) {
    return { tipo: "falha_segura", motivo: "Conversa sem telefone." };
  }

  const { enviarMensagem } = await import("../aplicacao/mensagens");
  const r = await enviarMensagem({
    organizationId: ctx.organizationId,
    clinicId: typeof conversa["clinic_id"] === "string" ? conversa["clinic_id"] : "",
    patientId: ctx.paciente?.id ?? null,
    conversationId: ctx.conversationId,
    telefone,
    texto,
    chaveDedupe: `agente:${pedido.eventoId}`,
    remetente: "ia",
    // RESPOSTA, não contato proativo: o paciente acabou de escrever. Marcar
    // como proativo faria a política de horário comercial recusar uma resposta
    // legítima às 20h — e deixaria a pessoa falando sozinha.
    proativo: false,
    porta,
    agora: pedido.agora,
  });

  return r.ok
    ? { tipo: "enviado", mensagemId: r.mensagemId }
    : { tipo: "falha_segura", motivo: `${r.codigo}: ${r.motivo}`.slice(0, 240) };
}

/**
 * Abre o caso humano deste turno.
 *
 * NUNCA LANÇA: um caso que não pôde ser aberto é ruim, mas um turno que morre
 * porque o caso não abriu é pior — o desfecho já está decidido, e engoli-lo
 * transformaria "precisa de gente" em silêncio.
 */
async function abrirCasoHumano(
  pedido: PedidoTurno,
  ctx: Ctx,
  dados: { codigo: string; motivo: string; respostaBarrada: string | null },
): Promise<void> {
  try {
    const { abrirCaso } = await import("../aplicacao/casos");
    await abrirCaso({
      organizationId: pedido.organizationId,
      clinicId: ctx.clinicId,
      conversationId: pedido.conversationId,
      patientId: ctx.paciente?.id ?? null,
      motivoCodigo: dados.codigo,
      motivo: dados.motivo,
      resumo: ctx.resumo,
      respostaBarrada: dados.respostaBarrada,
      proximaAcao: null,
      // Mesma chave do turno: reprocessar o evento não coloca a mesma pessoa
      // duas vezes na fila.
      chaveDedupe: `turno:${pedido.eventoId}`,
      // Conteúdo clínico é o único que entra como ALTA: os outros esperam.
      prioridade: dados.codigo === "conteudo_clinico" ? "ALTA" : "NORMAL",
    });
  } catch {
    // Ver o cabeçalho.
  }
}

/** Grava o trace e devolve o desfecho. Um único ponto de saída. */
async function encerrar(
  trace: Trace,
  chaveDedupe: string,
  ctx: Ctx | null,
  resultado: ResultadoTurno,
  extras?: {
    candidata?: { texto: string; raciocinio: string; precisaHumano: boolean };
    portao?: string;
  },
): Promise<ResultadoTurno> {
  await trace.gravar(chaveDedupe, ctx, resultado, extras);
  return resultado;
}
