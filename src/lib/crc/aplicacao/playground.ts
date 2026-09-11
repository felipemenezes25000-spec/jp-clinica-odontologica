/**
 * O Playground — Fase G, item 30.
 *
 * O QUE ELE RESOLVE. Hoje, para saber como o agente responderia a uma mensagem,
 * é preciso esperar um paciente escrever aquela mensagem. Não há como testar uma
 * mudança de instruções sem soltá-la em cima de gente.
 *
 * O Playground roda um turno COMPLETO — contexto, modelo, ferramentas, portões,
 * supervisor — e mostra tudo que aconteceu. Com uma diferença que é o arquivo
 * inteiro:
 *
 * ========================================================================
 *  NADA SAI. NADA É GRAVADO. NENHUM PACIENTE RECEBE NADA.
 * ========================================================================
 *
 * COMO ESSA GARANTIA É FEITA, e por que não é "cuidado ao chamar":
 *
 *   `podeEnviar: false` — o turno não chega à entrega. É a mesma trava que
 *   separa a Fatia 1 da 2, e ela já é testada.
 *
 *   `portaMensageria: null` — mesmo que a primeira falhasse, não há porta por
 *   onde sair.
 *
 *   FERRAMENTAS DE ESCRITA SÃO DUBLADAS. O executor real é substituído por um
 *   que descreve o que FARIA. Esta é a trava que precisou ser construída: sem
 *   ela, `conversa.criar_tarefa` criaria tarefa de verdade na fila de alguém, e
 *   `agenda.aceitar` marcaria consulta na agenda real.
 *
 *   A RUN NÃO É GRAVADA. Um teste não polui a métrica de qualidade do agente
 *   nem o contador de turnos.
 *
 * O QUE **NÃO** É DUBLADO, de propósito: o modelo e as ferramentas de LEITURA.
 * O custo da chamada é real e entra no orçamento — é uma chamada de verdade — e
 * as leituras trazem os dados reais da clínica. Um playground que lê dados falsos
 * testa o prompt contra uma ficção, e a resposta que ele mostra não é a resposta
 * que o paciente receberia.
 */
import type { PortaIa } from "../integracoes/ia/porta";
import type { ResultadoFerramenta } from "../ia-platform/executor";
import { acharFerramenta } from "../ia-platform/ferramentas";

/**
 * O contador que torna cada execução única.
 *
 * O CARIMBO DE TEMPO NÃO BASTA: duas execuções no mesmo milissegundo — ou com o
 * mesmo `agora` injetado, que é o caso de todo teste — colidiriam na chave de
 * dedupe, e a segunda devolveria "outra execução já está cuidando deste turno".
 * Quem estivesse testando acharia que o sistema travou.
 */
let contador = 0;

export type PedidoPlayground = {
  organizationId: string;
  /** Uma conversa REAL da clínica, para o contexto ser o de verdade. */
  conversationId: string;
  /** A mensagem que se quer testar, como se o paciente tivesse escrito. */
  mensagem: string;
  /**
   * As instruções a testar. Ausente, usa a versão publicada.
   *
   * É O PONTO DO PLAYGROUND: escrever um texto novo no Estúdio e ver o efeito
   * ANTES de publicar. Sem isto, testar uma mudança exigiria publicá-la.
   */
  instrucoes?: string | null;
  agora?: Date;
};

export type PassoDoPlayground = {
  tipo: "ferramenta" | "portao" | "modelo" | "supervisor";
  nome: string;
  /** O que aconteceu, em português. */
  detalhe: string;
  /** `true` quando este passo teria mudado alguma coisa no mundo. */
  teriaEscrito: boolean;
};

export type ResultadoPlayground = {
  /** O que o paciente teria recebido. `null` quando nada sairia. */
  resposta: string | null;
  /** O desfecho do turno, com o mesmo vocabulário do sistema real. */
  desfecho: string;
  motivo: string;
  passos: PassoDoPlayground[];
  /** Custo REAL desta simulação. O modelo foi chamado de verdade. */
  custoEstimado: number | null;
  /** O que teria sido escrito, se isto não fosse um teste. */
  escritasSimuladas: string[];
};

/**
 * Roda um turno de mentira com dados de verdade.
 *
 * NUNCA LANÇA. Um playground que explode não ensina nada sobre o agente: ensina
 * sobre o playground.
 */
export async function rodarPlayground(pedido: PedidoPlayground): Promise<ResultadoPlayground> {
  const agora = pedido.agora ?? new Date();
  const escritasSimuladas: string[] = [];
  const passos: PassoDoPlayground[] = [];

  try {
    const { portaParaFinalidade, portaDeEmbeddingsDaOrganizacao } =
      await import("../integracoes/ia/gateway");
    const { lerFlags, lerKillSwitches, lerConfiguracao } = await import("../servidor/configuracao");

    const [flags, interruptores, cfg] = await Promise.all([
      lerFlags(pedido.organizationId),
      lerKillSwitches(pedido.organizationId),
      lerConfiguracao(pedido.organizationId),
    ]);

    const [provedor, supervisorIa, busca] = await Promise.all([
      portaParaFinalidade(pedido.organizationId, "conversa"),
      portaParaFinalidade(pedido.organizationId, "supervisor"),
      portaDeEmbeddingsDaOrganizacao(pedido.organizationId),
    ]);

    if (!provedor.configurado) {
      return vazio("sem_provedor", provedor.motivo, passos, escritasSimuladas);
    }

    const { contextoDeAgendamentoParaJob } = await import("../automacao/handlers");
    const { rodarTurno } = await import("../ia-platform/turno");

    const r = await rodarTurno({
      organizationId: pedido.organizationId,
      conversationId: pedido.conversationId,
      /*
       * A CHAVE DE DEDUPE LEVA O CARIMBO DE TEMPO, e isso é o contrário do que
       * o resto do sistema faz.
       *
       * Em produção a chave é estável para o mesmo evento produzir um turno só.
       * Aqui, cada execução do playground PRECISA rodar de novo — é a função
       * dele. Uma chave estável faria a segunda tentativa devolver "outra
       * execução já está cuidando deste turno", e quem estivesse testando acharia
       * que o sistema travou.
       */
      eventoId: `playground:${String(agora.getTime())}:${String((contador += 1))}`,
      jobId: null,
      agora,
      porta: envelopar(provedor.porta, pedido.mensagem, pedido.instrucoes ?? null, passos),
      portaSupervisor: supervisorIa.configurado ? supervisorIa.porta : null,
      portaEmbeddings: busca.configurado ? busca.porta : null,
      // As duas travas que garantem que nada sai. Ver o cabeçalho.
      portaMensageria: null,
      podeEnviar: false,
      politica: {
        // As flags REAIS da clínica: testar com permissões que ela não tem
        // mostraria um agente que não existe.
        escritaLiberada: flags["ai_agente_escrita"] === true,
        writebackLiberado: flags["dental_office_writeback"] === true,
        agendamentoAutonomo: flags["auto_scheduling"] === true,
        escritasDentalOfficePausadas: interruptores["kill_escritas_do"] === true,
        ferramentasUsadas: 0,
      },
      contextoAgendamento: () =>
        contextoDeAgendamentoParaJob(
          pedido.organizationId,
          pedido.conversationId,
          cfg,
          flags,
          interruptores,
        ),
      supervisionar: flags["ai_supervisor"] === true,
      executar: dublarEscritas(escritasSimuladas, passos),
      // A QUARTA TRAVA. Ver o cabeçalho: sem ela, testar um prompt vinte vezes
      // derrubaria a taxa de acerto que autoriza ligar a flag de envio.
      semRegistro: true,
    });

    return {
      resposta: "texto" in r ? r.texto : null,
      desfecho: r.tipo,
      motivo: "motivo" in r ? r.motivo : "",
      passos,
      custoEstimado: null,
      escritasSimuladas,
    };
  } catch (erro) {
    return vazio(
      "erro",
      erro instanceof Error ? erro.message : String(erro),
      passos,
      escritasSimuladas,
    );
  }
}

const vazio = (
  desfecho: string,
  motivo: string,
  passos: PassoDoPlayground[],
  escritas: string[],
): ResultadoPlayground => ({
  resposta: null,
  desfecho,
  motivo,
  passos,
  custoEstimado: null,
  escritasSimuladas: escritas,
});

/* -------------------------------------------------------------------------- */
/* As duas dublagens                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Injeta a mensagem de teste e as instruções alternativas na chamada do modelo.
 *
 * POR QUE ENVELOPAR A PORTA, e não passar a mensagem por parâmetro: porque o
 * contexto do turno é montado a partir do BANCO, e a mensagem de teste não está
 * lá — nem deve estar, senão o playground gravaria mensagem de paciente que
 * ninguém escreveu.
 *
 * O envelope substitui o texto no último instante, depois de o contexto real
 * ter sido montado. O resultado é: histórico verdadeiro, mensagem nova.
 */
function envelopar(
  porta: PortaIa,
  mensagem: string,
  instrucoes: string | null,
  passos: PassoDoPlayground[],
): PortaIa {
  return {
    nome: porta.nome,
    modelo: porta.modelo,
    gerarEstruturado: async (p) => {
      const entrada = `${p.entrada}\n\nPaciente: ${mensagem}`;
      const r = await porta.gerarEstruturado({
        ...p,
        entrada,
        ...(instrucoes === null ? {} : { instrucoes }),
      });

      passos.push({
        tipo: "modelo",
        nome: `${porta.nome}/${porta.modelo}`,
        detalhe: r.ok ? "O modelo respondeu." : `Falhou: ${r.detalhe}`,
        teriaEscrito: false,
      });

      return r;
    },
  };
}

/**
 * O executor do playground: LEITURA roda de verdade, ESCRITA é descrita.
 *
 * ESTA É A TRAVA QUE PRECISOU SER CONSTRUÍDA. As outras duas — `podeEnviar` e
 * porta nula — já existiam e protegem só o ENVIO. Sem esta, o playground
 * marcaria consulta na agenda real, criaria tarefa na fila de alguém e gravaria
 * opt-out de um paciente que não pediu nada.
 *
 * E AS LEITURAS RODAM DE VERDADE de propósito: um playground que lê dados falsos
 * testa o prompt contra uma ficção. A resposta que ele mostra não seria a
 * resposta que o paciente receberia, e a pessoa ajustaria o texto para acertar
 * um alvo que não existe.
 */
function dublarEscritas(
  escritas: string[],
  passos: PassoDoPlayground[],
): (
  chave: string,
  argumentos: Record<string, unknown>,
  deps: import("../ia-platform/executor").DependenciasExecutor,
) => Promise<ResultadoFerramenta> {
  return async (chave, argumentos, deps) => {
    const def = acharFerramenta(chave);

    if (def !== null && def.permissao !== "LEITURA") {
      const descricao = `${chave}(${JSON.stringify(argumentos).slice(0, 200)})`;
      escritas.push(descricao);
      passos.push({
        tipo: "ferramenta",
        nome: chave,
        detalhe: `NÃO executada — em produção isto teria escrito: ${descricao}`,
        teriaEscrito: true,
      });

      /*
       * A SAÍDA DUBLADA DIZ "DEU CERTO", e isso é uma escolha discutível que
       * vale explicar.
       *
       * Se ela dissesse "falhou", o modelo reagiria à falha: pediria humano,
       * tentaria outro caminho, e o teste mostraria um comportamento de
       * exceção em vez do comportamento normal. Quem está ajustando o prompt
       * quer ver o caminho feliz.
       *
       * O preço é que o playground não exercita o tratamento de erro de
       * ferramenta. É um limite honesto, e está escrito aqui.
       */
      return { ok: true, saida: "Feito. (simulado — nada foi gravado)" };
    }

    const { executarFerramenta } = await import("../ia-platform/executor");
    const r = await executarFerramenta(chave, argumentos, deps);

    passos.push({
      tipo: "ferramenta",
      nome: chave,
      detalhe: r.ok ? r.saida.slice(0, 300) : `Falhou: ${r.saida.slice(0, 200)}`,
      teriaEscrito: false,
    });

    return r;
  };
}
