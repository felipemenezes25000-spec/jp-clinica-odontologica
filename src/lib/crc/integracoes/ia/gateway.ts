/**
 * O gateway de modelos — Fatia 8.
 *
 * TRÊS COISAS, NESTA ORDEM:
 *
 *   1. QUAL MODELO. Cada finalidade — conversa, classificação, supervisor,
 *      embeddings — tem rota própria. Um modelo único para as quatro significa
 *      pagar o preço da conversa em toda classificação, ou aceitar a qualidade da
 *      classificação na conversa.
 *
 *   2. COM QUAL CHAVE. A da clínica, quando ela trouxe uma (BYOK); a da
 *      plataforma, quando não. A chave da clínica sai do banco cifrada e é
 *      decifrada aqui, no servidor, no momento do uso.
 *
 *   3. DENTRO DE QUAL ORÇAMENTO. E este é o ponto do arquivo.
 *
 * O ORÇAMENTO É UM DECORADOR DA PORTA, e não uma verificação que cada chamador
 * faz. A diferença é tudo: `turno.ts`, `supervisor.ts` e a classificação recebem
 * uma `PortaIa` e não sabem que existe teto. Não há como alguém adicionar um
 * quinto caminho de chamada e esquecer de verificar — porque não existe caminho
 * que não passe por aqui.
 *
 * A verificação acontece ANTES de `gerarEstruturado` (ADR-12) e o registro do
 * gasto DEPOIS. Checar depois só serviria para descobrir o prejuízo.
 */
import { type Finalidade, type VeredictoOrcamento } from "../../dominio/orcamento";

import { criarPortaAnthropic, precoAnthropic } from "./anthropic";
import {
  comOrcamentoEmbeddings,
  criarPortaEmbeddingsOpenAi,
  criarPortaEmbeddingsSandbox,
  type PortaEmbeddings,
} from "./embeddings";
import type { EstadoIa, PedidoIa, PortaIa, RespostaIa } from "./porta";
import { cambioUsdBrl, criarPortaOpenAi, criarPortaSandboxIa, precoDoModelo } from "./provedor";

/* -------------------------------------------------------------------------- */
/* A rota                                                                     */
/* -------------------------------------------------------------------------- */

export type Rota = {
  finalidade: Finalidade;
  provedor: string;
  modelo: string;
  credentialId: string | null;
  maxTokens: number | null;
};

/**
 * Os modelos padrão de cada finalidade, quando a clínica não configurou rota.
 *
 * O PADRÃO NÃO É O MELHOR MODELO, É O ADEQUADO. Supervisor e classificação rodam
 * em todo turno e produzem colunas, não prosa — o modelo pequeno faz isso bem. A
 * conversa é a única que um paciente lê.
 */
const PADRAO: Readonly<Record<Finalidade, { provedor: string; modelo: string }>> = {
  conversa: { provedor: "openai", modelo: "gpt-5.6-luna" },
  classificacao: { provedor: "openai", modelo: "gpt-5.6-luna" },
  supervisor: { provedor: "openai", modelo: "gpt-5.6-luna" },
  embeddings: { provedor: "openai", modelo: "text-embedding-3-small" },
};

export async function lerRota(organizationId: string, finalidade: Finalidade): Promise<Rota> {
  try {
    const { selecionarUm } = await import("../../servidor/banco");
    const l = await selecionarUm("crc_ai_bindings", {
      filtros: [
        { coluna: "organization_id", op: "eq", valor: organizationId },
        { coluna: "finalidade", op: "eq", valor: finalidade },
      ],
    });

    if (l !== null) {
      const maxTokens = Number(l["max_tokens"] ?? 0);
      return {
        finalidade,
        provedor: String(l["provedor"] ?? PADRAO[finalidade].provedor),
        modelo: String(l["modelo"] ?? PADRAO[finalidade].modelo),
        credentialId: typeof l["credential_id"] === "string" ? l["credential_id"] : null,
        maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.round(maxTokens) : null,
      };
    }
  } catch {
    // Tabela ainda não criada, banco fora do ar: cai no padrão. Uma rota que não
    // pôde ser lida não pode deixar a clínica sem IA.
  }

  const padrao = PADRAO[finalidade];
  return {
    finalidade,
    provedor: padrao.provedor,
    modelo: padrao.modelo,
    credentialId: null,
    maxTokens: null,
  };
}

/* -------------------------------------------------------------------------- */
/* A chave                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A chave que a rota manda usar.
 *
 * `null` significa "use a da plataforma", e é diferente de erro. Uma credencial
 * que existe mas não decifra devolve `{ erro }` — porque nesse caso usar a chave
 * da plataforma seria cobrar da plataforma um consumo que a clínica pediu para
 * cobrar dela, calado.
 */
async function chaveDaRota(
  organizationId: string,
  rota: Rota,
): Promise<{ chave: string | null; erro: string | null }> {
  if (rota.credentialId === null) return { chave: null, erro: null };

  try {
    const { selecionarUm } = await import("../../servidor/banco");
    const l = await selecionarUm("crc_ai_credentials", {
      colunas: "segredo_cifrado,status",
      filtros: [
        { coluna: "id", op: "eq", valor: rota.credentialId },
        { coluna: "organization_id", op: "eq", valor: organizationId },
      ],
    });

    if (l === null) return { chave: null, erro: "A chave configurada não existe mais." };
    if (l["status"] !== "ATIVA") return { chave: null, erro: "A chave configurada foi revogada." };

    const { decifrar } = await import("../../servidor/segredo");
    const segredo = decifrar(String(l["segredo_cifrado"] ?? ""));
    if (segredo === null) {
      return {
        chave: null,
        erro: "A chave da clínica não pôde ser lida. Cadastre-a de novo.",
      };
    }
    // "Esta chave ainda está em uso?" é a pergunta que impede alguém de revogar
    // uma chave esquecida por medo de quebrar algo. Sem este registro, chave
    // ativa e chave morta têm a mesma aparência na tela.
    const { marcarUsoDaCredencial } = await import("../../aplicacao/modelos");
    void marcarUsoDaCredencial(organizationId, rota.credentialId);

    return { chave: segredo, erro: null };
  } catch (erro) {
    return { chave: null, erro: erro instanceof Error ? erro.message : String(erro) };
  }
}

/* -------------------------------------------------------------------------- */
/* A estimativa                                                              */
/* -------------------------------------------------------------------------- */

/**
 * O custo previsto de uma chamada, em reais.
 *
 * É ESTIMATIVA GROSSEIRA, E DE PROPÓSITO: não existe como saber o custo antes de
 * saber quantos tokens o modelo vai gerar. O que ela serve para fazer é impedir
 * que uma chamada cara seja iniciada com o teto praticamente estourado.
 *
 * Modelo sem preço na tabela devolve `null`, que o domínio trata como zero — o
 * teto continua valendo sobre o que JÁ foi gasto. Inventar número aqui produziria
 * bloqueio por um custo que ninguém sabe se é real (item 205: não inventar
 * número).
 */
export function estimarCustoDaChamada(
  provedor: string,
  modelo: string,
  maxTokens: number,
): number | null {
  const preco = provedor === "anthropic" ? precoAnthropic(modelo) : precoDoModelo(modelo);
  if (preco === null) return null;

  // Entrada suposta: o contexto de um turno fica na casa de 1.500 tokens. Saída:
  // o teto pedido, que é o pior caso real.
  const usd = (1500 / 1_000_000) * preco.entrada + (maxTokens / 1_000_000) * preco.saida;
  return Number((usd * cambioUsdBrl()).toFixed(6));
}

/* -------------------------------------------------------------------------- */
/* O decorador de orçamento                                                   */
/* -------------------------------------------------------------------------- */

/** O código que a porta devolve quando o teto barrou. Estável, para o handler. */
export const MOTIVO_ORCAMENTO = "orcamento_estourado";

export type PortaComOrcamento = PortaIa & {
  /** O último veredicto de orçamento, para quem quiser abrir caso humano. */
  ultimoVeredicto: () => VeredictoOrcamento | null;
};

/**
 * Embrulha uma porta com verificação de teto antes e registro de gasto depois.
 *
 * A RECUSA VEM COMO `RespostaIa` NORMAL, e não como exceção. Quem chama já sabe
 * tratar `{ ok: false, motivo: "recusada" }` — é o mesmo caminho de um 400 do
 * provedor — e o turno termina em desfecho nomeado em vez de explodir (ADR-11).
 */
export function comOrcamento(
  porta: PortaIa,
  contexto: { organizationId: string; finalidade: Finalidade; agora?: () => Date },
): PortaComOrcamento {
  let ultimo: VeredictoOrcamento | null = null;

  return {
    nome: porta.nome,
    modelo: porta.modelo,
    ultimoVeredicto: () => ultimo,

    async gerarEstruturado(pedido: PedidoIa): Promise<RespostaIa> {
      const agora = contexto.agora?.() ?? new Date();
      const { liquidarGasto, reservarOrcamento, verificarOrcamento } =
        await import("../../aplicacao/orcamento");

      const estimativa =
        estimarCustoDaChamada(porta.nome, porta.modelo, pedido.maxTokens ?? 500) ?? 0;

      /*
       * RESERVA, E NÃO CONSULTA — Fase D.
       *
       * `verificarOrcamento` lia o gasto e comparava com o teto; a soma só vinha
       * depois da chamada. Dois turnos simultâneos liam o mesmo número, os dois
       * achavam que cabia, e os dois chamavam. Com cinco workers por minuto — o
       * desenho da Fase B — o teto de R$ 50 virava R$ 50 mais o que coubesse
       * entre a leitura e a escrita.
       *
       * Agora a decisão e o incremento acontecem na mesma transação do Postgres.
       * Quem perde a corrida não chama.
       */
      const reserva = await reservarOrcamento(contexto.organizationId, agora, estimativa);

      /*
       * O VEREDICTO CONTINUA EXISTINDO, e por dois motivos que não são o mesmo.
       *
       * A tela lê `ultimoVeredicto()` para mostrar "quanto falta do teto" — isso
       * é consulta, e consulta pode ser feita depois da decisão.
       *
       * E `turno.ts` reconhece a recusa pelo prefixo estável do detalhe, não
       * pelo veredicto. Por isso a recusa da reserva é traduzida para o MESMO
       * formato: quem lê daqui para baixo não precisa saber que a decisão mudou
       * de lugar.
       */
      const veredicto: VeredictoOrcamento = reserva.reservou
        ? await verificarOrcamento(contexto.organizationId, agora, 0)
        : {
            pode: false,
            codigo: reserva.codigo === "teto_mes" ? "teto_do_mes" : "teto_do_dia",
            motivo: reserva.motivo,
          };
      ultimo = veredicto;

      if (!veredicto.pode) {
        /*
         * O PREFIXO ESTÁVEL É O QUE PERMITE `turno.ts` RECONHECER ESTA RECUSA
         * sem casar texto em português. A alternativa — procurar "limite de
         * gasto" na frase — quebraria na primeira vez que alguém melhorasse a
         * redação da mensagem, e quebraria calada: o teto continuaria barrando e
         * pararia de abrir caso humano.
         *
         * `uso: null` porque não houve chamada. É a única falha do sistema em que
         * isso é verdade, e é o que distingue "não gastei" de "gastei e deu erro".
         */
        return {
          ok: false,
          motivo: "recusada",
          detalhe: `${MOTIVO_ORCAMENTO}: ${veredicto.motivo}`,
          uso: null,
        };
      }

      const r = await porta.gerarEstruturado(pedido);

      /*
       * O AJUSTE SUBSTITUI O REGISTRO, porque a reserva já somou a estimativa.
       * Somar de novo aqui contaria a mesma chamada duas vezes.
       *
       * O delta é frequentemente NEGATIVO: a estimativa usa `maxTokens`, e a
       * resposta quase sempre é menor. Um contador que só sobe acumularia erro
       * para cima até o teto virar ficção.
       *
       * O AJUSTE ACONTECE MESMO QUANDO A CHAMADA FALHA: um 500 depois de o
       * provedor processar o prompt foi cobrado, e ignorar isso faria o contador
       * divergir da fatura justamente nos dias ruins.
       */
      const uso = r.ok ? r.uso : r.uso;
      await liquidarGasto(contexto.organizationId, reserva, uso?.custoEstimado ?? null, agora);

      return r;
    },
  };
}

/* -------------------------------------------------------------------------- */
/* A fábrica                                                                  */
/* -------------------------------------------------------------------------- */

export type EstadoGateway =
  | { configurado: true; porta: PortaComOrcamento; rota: Rota; usandoChaveDaClinica: boolean }
  | { configurado: false; motivo: string; faltando: string[] };

/**
 * A porta pronta para uma finalidade: rota resolvida, chave escolhida, teto
 * aplicado.
 *
 * O SANDBOX CONTINUA GANHANDO DE TUDO quando `CRC_IA_SANDBOX=1` fora de
 * produção. Ele existe para provar que o CRC opera com a IA fora, e uma rota
 * configurada no banco não pode furar esse teste.
 */
export async function portaParaFinalidade(
  organizationId: string,
  finalidade: Finalidade,
): Promise<EstadoGateway> {
  const producao = process.env["NODE_ENV"] === "production";
  const rota = await lerRota(organizationId, finalidade);

  if ((process.env["CRC_IA_SANDBOX"] ?? "").trim() === "1" && !producao) {
    return {
      configurado: true,
      porta: comOrcamento(criarPortaSandboxIa(), { organizationId, finalidade }),
      rota,
      usandoChaveDaClinica: false,
    };
  }

  const daClinica = await chaveDaRota(organizationId, rota);
  if (daClinica.erro !== null) {
    return { configurado: false, motivo: daClinica.erro, faltando: [] };
  }

  const variavel = rota.provedor === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const chave = daClinica.chave ?? (process.env[variavel] ?? "").trim();

  if (chave.length === 0) {
    return {
      configurado: false,
      motivo: `Falta a chave do provedor ${rota.provedor} para “${finalidade}”. Cadastre a chave da clínica ou configure ${variavel} no servidor.`,
      faltando: [variavel],
    };
  }

  const bruta =
    rota.provedor === "anthropic"
      ? criarPortaAnthropic(chave, rota.modelo, organizationId)
      : criarPortaOpenAi(chave, rota.modelo, organizationId);

  return {
    configurado: true,
    porta: comOrcamento(bruta, { organizationId, finalidade }),
    rota,
    usandoChaveDaClinica: daClinica.chave !== null,
  };
}

/**
 * A porta de embeddings da organização: rota, chave da clínica e teto.
 *
 * Separada de `portaParaFinalidade` porque o contrato é outro — ver
 * `comOrcamentoEmbeddings`. A finalidade que ela lê é `embeddings`, e é a mesma
 * tabela de rotas: uma clínica pode usar a chave dela para busca e a da
 * plataforma para conversa, ou o contrário.
 */
export async function portaDeEmbeddingsDaOrganizacao(
  organizationId: string,
): Promise<
  | { configurado: true; porta: PortaEmbeddings; rota: Rota; usandoChaveDaClinica: boolean }
  | { configurado: false; motivo: string; faltando: string[] }
> {
  const producao = process.env["NODE_ENV"] === "production";
  const rota = await lerRota(organizationId, "embeddings");

  if ((process.env["CRC_IA_SANDBOX"] ?? "").trim() === "1" && !producao) {
    return {
      configurado: true,
      porta: comOrcamentoEmbeddings(criarPortaEmbeddingsSandbox(), { organizationId }),
      rota,
      usandoChaveDaClinica: false,
    };
  }

  const daClinica = await chaveDaRota(organizationId, rota);
  if (daClinica.erro !== null) {
    return { configurado: false, motivo: daClinica.erro, faltando: [] };
  }

  const chave = daClinica.chave ?? (process.env["OPENAI_API_KEY"] ?? "").trim();
  if (chave.length === 0) {
    return {
      configurado: false,
      motivo:
        "A busca por significado no material da clínica ainda não foi configurada. Cadastre a chave da clínica ou configure OPENAI_API_KEY no servidor.",
      faltando: ["OPENAI_API_KEY"],
    };
  }

  return {
    configurado: true,
    porta: comOrcamentoEmbeddings(criarPortaEmbeddingsOpenAi(chave, rota.modelo, organizationId), {
      organizationId,
    }),
    rota,
    usandoChaveDaClinica: daClinica.chave !== null,
  };
}

/**
 * A forma antiga do estado, para quem já consumia `criarProvedorIa`.
 *
 * Existe para a migração ser um `await` e não uma reescrita de cada chamador: o
 * `EstadoIa` tem a mesma união de `configurado`.
 */
export function comoEstadoIa(estado: EstadoGateway): EstadoIa {
  return estado.configurado
    ? { configurado: true, porta: estado.porta }
    : { configurado: false, motivo: estado.motivo, faltando: estado.faltando };
}
