/**
 * Replay — roda um caso de avaliação SEM nenhum efeito no mundo.
 *
 * A FRASE "sem efeito externo" É O CONTRATO INTEIRO DESTE ARQUIVO, e ela é
 * estrutural, não uma promessa:
 *
 *   Não chama `rodarTurno`. Aquela função grava trace, abre caso humano e
 *   entrega mensagem — é o caminho de produção, e é justamente o que não pode
 *   acontecer aqui. Chamá-la "com as flags desligadas" teria sido a escolha
 *   preguiçosa: bastaria uma flag lida errado para uma avaliação mandar
 *   mensagem a um paciente de verdade.
 *
 *   Não recebe porta de mensageria. Não existe o parâmetro.
 *
 *   Não toca no banco. O contexto do turno é MONTADO do caso, em memória, e não
 *   lido de `crc_conversations`. Nenhuma linha é gravada.
 *
 *   As ferramentas são servidas do caso, não do Dental Office. Um caso que quer
 *   testar "com estes horários livres, o que ele responde?" declara a saída da
 *   ferramenta; uma ferramenta não declarada responde que está indisponível.
 *
 * O QUE O REPLAY EXERCITA DE VERDADE, e vale dizer para ninguém achar que é
 * mais: o laço de ferramentas, a política de permissão e a cadeia de portões —
 * com o modelo real. O que ele NÃO exercita é a persistência, o envio e o
 * contexto vindo do banco. Esses estão nos testes de `turno.test.ts` e
 * `mensagens`, com banco em memória.
 */
import { conferir, type Expectativa, type Falha, type Observado } from "../dominio/avaliacao";
import { avaliarAntesDeEnviar, type ContextoPortao } from "../dominio/guardrails";
import type { PortaIa } from "../integracoes/ia/porta";

import type { EstadoPolitica } from "./ferramentas";
import { instrucoesDoLaco, rodarLaco, ESQUEMA_DECISAO } from "./laco";
import { textoDoContexto } from "./contexto";
import { INSTRUCOES_DO_AGENTE } from "./instrucoes";
import { PROMPT_TURNO_SOMBRA, type ContextoTurno, type MensagemDoTurno } from "./tipos";

/* -------------------------------------------------------------------------- */
/* O caso                                                                     */
/* -------------------------------------------------------------------------- */

export type CasoDeAvaliacao = {
  id: string;
  nome: string;
  categoria: string;
  /** A conversa até aqui. A última recebida é o que o agente vai responder. */
  mensagens: readonly MensagemDoTurno[];
  /** O paciente, quando o caso quer um identificado. */
  paciente?: { primeiroNome: string; situacao?: string | null; temOptOut?: boolean } | null;
  /** Memórias que o caso quer no contexto. */
  memorias?: readonly string[];
  /** Horários já oferecidos, para testar aceitação de oferta. */
  horariosOferecidos?: readonly string[];
  /** A janela de 24h está aberta? Fechada testa o bloqueio de template. */
  janelaAberta?: boolean;
  /** Quem é dono da conversa. `humano` testa a IA calar. */
  dono?: "ia" | "humano" | "ninguem";
  /**
   * As saídas de ferramenta que este caso serve.
   *
   * `{"agenda.horarios_livres": "Quinta 14h com a Dra. Ana"}`. Ferramenta pedida
   * e não declarada responde que está indisponível — o que é honesto e torna o
   * caso determinístico: nenhuma avaliação depende da agenda real da clínica no
   * momento em que a suíte rodou.
   */
  ferramentas?: Readonly<Record<string, string>>;
  /** A política vigente no caso. O padrão é tudo fechado. */
  politica?: Partial<EstadoPolitica>;
  esperado: Expectativa;
};

export type ResultadoDoReplay = {
  passou: boolean;
  falhas: readonly Falha[];
  observado: Observado;
  /** Custo desta execução, para a rodada somar. */
  custoEstimado: number | null;
  duracaoMs: number;
};

const POLITICA_FECHADA: EstadoPolitica = {
  escritaLiberada: false,
  writebackLiberado: false,
  agendamentoAutonomo: false,
  escritasDentalOfficePausadas: false,
  ferramentasUsadas: 0,
};

/* -------------------------------------------------------------------------- */
/* O contexto sintético                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Monta o contexto do turno a partir do caso. Puro, sem banco.
 *
 * Usa o MESMO tipo `ContextoTurno` e a MESMA serialização `textoDoContexto` da
 * produção. É o que faz a avaliação testar o prompt que o paciente recebe, e não
 * uma aproximação dele — se alguém mudar a ordem dos blocos do contexto, a suíte
 * roda sobre a ordem nova.
 */
export function contextoDoCaso(caso: CasoDeAvaliacao, agora: Date): ContextoTurno {
  return {
    organizationId: "avaliacao",
    clinicId: null,
    conversationId: `caso:${caso.id}`,
    agora,
    paciente:
      caso.paciente === undefined || caso.paciente === null
        ? null
        : {
            id: "paciente-de-teste",
            primeiroNome: caso.paciente.primeiroNome,
            situacao: caso.paciente.situacao ?? null,
            ultimaConsultaEm: null,
            proximaConsultaEm: null,
            temOptOut: caso.paciente.temOptOut === true,
          },
    oportunidade: null,
    oferta:
      caso.horariosOferecidos === undefined || caso.horariosOferecidos.length === 0
        ? null
        : {
            id: "oferta-de-teste",
            expiraEm: new Date(agora.getTime() + 86_400_000).toISOString(),
            opcoes: caso.horariosOferecidos.map((inicioEm) => ({ inicioEm, dentista: null })),
          },
    mensagens: caso.mensagens,
    memorias: (caso.memorias ?? []).map((conteudo) => ({
      escopo: "paciente" as const,
      conteudo,
    })),
    resumo: null,
    intencao: null,
    temperatura: null,
  };
}

/* -------------------------------------------------------------------------- */
/* A execução                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Roda um caso e confere o resultado. NUNCA LANÇA.
 *
 * Uma exceção aqui pararia a rodada no meio e a pessoa veria "12 de 40 casos" sem
 * saber se os 28 restantes passariam. Caso que explode vira caso que falhou, com
 * o erro como falha — e a rodada termina.
 */
export async function rodarCaso(
  caso: CasoDeAvaliacao,
  opcoes: {
    porta: PortaIa;
    agora?: Date;
    /**
     * O texto do agente a avaliar — Fatia 10.
     *
     * ENTRA POR PARÂMETRO porque a avaliação tem que rodar sobre o RASCUNHO que
     * alguém quer publicar, e não sobre o que está no ar. Sem isto, a suíte
     * aprovaria o texto publicado e o gate liberaria a publicação de outro.
     *
     * O padrão é a constante do código, que é o que vale para quem nunca abriu o
     * Estúdio.
     */
    instrucoes?: string;
  },
): Promise<ResultadoDoReplay> {
  const comecou = Date.now();
  const agora = opcoes.agora ?? new Date();
  let custo: number | null = null;

  try {
    const ctx = contextoDoCaso(caso, agora);

    /*
     * OPT-OUT ENCERRA ANTES DO MODELO, como na produção.
     *
     * `rodarTurno` checa isto antes de pagar a chamada, e o replay tem que fazer
     * igual por dois motivos: o caso de opt-out ficaria dependendo do que o
     * modelo respondesse (às vezes "passar_para_humano", às vezes uma resposta), e
     * a suíte gastaria modelo para testar uma regra que não precisa dele.
     *
     * O código reportado é o do PORTÃO de opt-out, que é o que a cadeia produziria
     * se a checagem antecipada não existisse — a garantia é a cadeia, e não a
     * ordem das checagens.
     */
    if (ctx.paciente?.temOptOut === true) {
      const observado: Observado = {
        desfecho: "barrado",
        texto: null,
        portao: "opt_out",
        ferramentasUsadas: [],
        ferramentasBloqueadas: [],
      };
      const { passou, falhas } = conferir(caso.esperado, observado);
      return { passou, falhas, observado, custoEstimado: null, duracaoMs: Date.now() - comecou };
    }

    const base = textoDoContexto(ctx);
    const politica: EstadoPolitica = {
      ...POLITICA_FECHADA,
      ...caso.politica,
      ferramentasUsadas: 0,
    };

    const resultado = await rodarLaco({
      estado: politica,
      // O contexto vai porque o laço o repassa; nenhuma ferramenta do replay o
      // usa para ir ao banco.
      executor: { ctx, contextoAgendamento: () => Promise.resolve(null), portaEmbeddings: null },
      // A SUBSTITUIÇÃO QUE GARANTE O "sem efeito externo". Ver o cabeçalho: este
      // executor não conhece Dental Office, banco nem WhatsApp.
      executar: (ferramenta) => Promise.resolve(servirFerramenta(caso, ferramenta)),
      decidir: async (observacoes) => {
        const entrada =
          observacoes.length === 0
            ? base
            : `${base}\n\n## O que você já descobriu neste turno\n${observacoes.join("\n\n")}`;

        const r = await opcoes.porta.gerarEstruturado({
          promptVersao: PROMPT_TURNO_SOMBRA,
          instrucoes: `${opcoes.instrucoes ?? INSTRUCOES_DO_AGENTE}\n\n${instrucoesDoLaco(politica)}`,
          entrada,
          esquema: { nome: "decisao_do_agente", schema: ESQUEMA_DECISAO },
          maxTokens: 400,
        });

        if (r.ok && r.uso.custoEstimado !== null) {
          custo = (custo ?? 0) + r.uso.custoEstimado;
        }
        return r.ok ? { ok: true, dados: r.dados } : { ok: false, detalhe: r.detalhe };
      },
    });

    const usadas = resultado.passos
      .filter((p) => p.ok && p.bloqueadoPor === null)
      .map((p) => p.ferramenta);
    const bloqueadas = resultado.passos
      .filter((p) => p.bloqueadoPor !== null)
      .map((p) => p.ferramenta);

    const observado = observarDesfecho(caso, ctx, resultado, usadas, bloqueadas);
    const { passou, falhas } = conferir(caso.esperado, observado);

    return { passou, falhas, observado, custoEstimado: custo, duracaoMs: Date.now() - comecou };
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    return {
      passou: false,
      falhas: [{ codigo: "erro_no_replay", descricao: `O caso não pôde rodar: ${detalhe}` }],
      observado: {
        desfecho: "falha",
        texto: null,
        portao: null,
        ferramentasUsadas: [],
        ferramentasBloqueadas: [],
      },
      custoEstimado: custo,
      duracaoMs: Date.now() - comecou,
    };
  }
}

/**
 * O desfecho, já passado pelos portões de verdade.
 *
 * A CADEIA DE PORTÕES É A MESMA DA PRODUÇÃO — `avaliarAntesDeEnviar`, sem cópia
 * nem versão de teste. Um portão reimplementado aqui é um portão que divergiria
 * do real, e a suíte passaria a garantir o comportamento de um sistema que não
 * existe.
 */
function observarDesfecho(
  caso: CasoDeAvaliacao,
  ctx: ContextoTurno,
  resultado: Awaited<ReturnType<typeof rodarLaco>>,
  usadas: readonly string[],
  bloqueadas: readonly string[],
): Observado {
  if (resultado.tipo === "humano") {
    return {
      desfecho: "humano",
      texto: null,
      portao: null,
      ferramentasUsadas: usadas,
      ferramentasBloqueadas: bloqueadas,
    };
  }
  /*
   * O REPLAY NUNCA PERDE POSSE, porque não há job: ele não passa `bater` ao
   * laço. Este ramo existe para o compilador — e o compilador está certo em
   * exigi-lo, porque é assim que um desfecho novo do laço não passa
   * despercebido por aqui no dia em que o replay ganhar um job.
   *
   * Mapeado para `falha` e não para `humano`: se um dia acontecer, é um estado
   * que a avaliação não sabe interpretar, e o lado seguro é contar como não
   * tendo respondido.
   */
  if (resultado.tipo === "falha" || resultado.tipo === "perdeu_posse") {
    return {
      desfecho: "falha",
      texto: null,
      portao: null,
      ferramentasUsadas: usadas,
      ferramentasBloqueadas: bloqueadas,
    };
  }

  const ultimaEntrada = [...ctx.mensagens].reverse().find((m) => m.direcao === "recebida") ?? null;

  const ctxPortao: ContextoPortao = {
    texto: resultado.texto,
    temOptOut: ctx.paciente?.temOptOut === true,
    ultimaEntrada: ultimaEntrada?.texto ?? null,
    dono: caso.dono ?? "ia",
    janelaAberta: caso.janelaAberta !== false,
    enviadosRecentes: ctx.mensagens.filter((m) => m.direcao === "enviada").map((m) => m.texto),
    pediuHumano: resultado.precisaHumano,
  };

  const veredicto = avaliarAntesDeEnviar(ctxPortao);

  if (veredicto.passa) {
    return {
      desfecho: "respondeu",
      texto: resultado.texto,
      portao: null,
      ferramentasUsadas: usadas,
      ferramentasBloqueadas: bloqueadas,
    };
  }

  return {
    // O portão manda para gente ou descarta, e a diferença importa no relatório:
    // "barrado" é a máquina calando; "humano" é a conversa chegando na recepção.
    desfecho: veredicto.destino === "humano" ? "humano" : "barrado",
    // O TEXTO BARRADO CONTINUA DISPONÍVEL, e é o que permite um caso afirmar
    // "não pode conter 'dipirona'" mesmo quando o portão já barrou a resposta.
    texto: resultado.texto,
    portao: veredicto.codigo,
    ferramentasUsadas: usadas,
    ferramentasBloqueadas: bloqueadas,
  };
}

/**
 * Serve as saídas que o caso declarou, e nada mais.
 *
 * FERRAMENTA NÃO DECLARADA RESPONDE "indisponível", e não é limitação — é o que
 * torna a suíte determinística. Um executor que falasse com o Dental Office faria
 * a mesma avaliação passar hoje e falhar amanhã porque a agenda da clínica mudou,
 * e ninguém saberia se o agente piorou ou se a quinta-feira lotou.
 *
 * A resposta de indisponível é a MESMA forma que o executor real usa nesse caso,
 * inclusive a instrução de não responder de memória — senão o caso mediria a
 * reação do modelo a uma mensagem que a produção nunca manda.
 */
export function servirFerramenta(
  caso: CasoDeAvaliacao,
  ferramenta: string,
): { ok: boolean; saida: string } {
  const declarada = (caso.ferramentas ?? {})[ferramenta];
  if (declarada !== undefined) return { ok: true, saida: declarada };

  return {
    ok: false,
    saida: `A ferramenta ${ferramenta} não está disponível agora. Não responda de memória: diga que vai confirmar com a equipe.`,
  };
}
