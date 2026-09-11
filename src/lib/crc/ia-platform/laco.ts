/**
 * O laço do agente — modelo decide, ferramenta roda, modelo decide de novo.
 *
 * POR QUE UM LAÇO PRÓPRIO EM VEZ DE TOOL CALLING NATIVO. A `PortaIa` do CRC
 * tem um método só, `gerarEstruturado`, e essa estreiteza é deliberada (item
 * 43: saída estruturada obrigatória). Trocar a porta por uma que fale tool
 * calling nativo significaria trazer o AI SDK, um segundo contrato de provedor
 * e um novo caminho de erro — antes de existir um único turno usando
 * ferramenta.
 *
 * O laço aqui pede ao modelo uma DECISÃO estruturada: responder, usar
 * ferramenta, ou passar para humano. Executa o que ele escolheu, devolve o
 * resultado e pergunta de novo. É o mesmo comportamento com o contrato que já
 * existe — e quando o gateway multi-provider chegar (Fatia 8), este arquivo
 * troca de porta sem mudar de forma.
 *
 * O QUE IMPEDE O LAÇO DE SER INFINITO, em ordem de quem barra primeiro:
 *   teto de passos · teto de ferramentas · repetição da mesma chamada ·
 *   política · falha de ferramenta
 *
 * Nenhum deles é sugestão ao modelo. Todos são condição de código.
 */
import { avaliarPolitica, catalogoParaOModelo, type EstadoPolitica } from "./ferramentas";
import { executarFerramenta, type DependenciasExecutor } from "./executor";

/* -------------------------------------------------------------------------- */
/* A decisão que o modelo devolve                                             */
/* -------------------------------------------------------------------------- */

export type DecisaoAgente =
  | { acao: "responder"; texto: string }
  | { acao: "usar_ferramenta"; ferramenta: string; argumentos: Record<string, unknown> }
  | { acao: "passar_para_humano"; motivo: string };

export const ESQUEMA_DECISAO: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["acao"],
  properties: {
    acao: {
      type: "string",
      enum: ["responder", "usar_ferramenta", "passar_para_humano"],
      description:
        "responder = você já sabe o que dizer. usar_ferramenta = precisa consultar ou agir antes. passar_para_humano = isto exige uma pessoa da clínica.",
    },
    texto: {
      type: ["string", "null"],
      description: "Quando acao=responder: a mensagem ao paciente, em até três linhas.",
    },
    ferramenta: {
      type: ["string", "null"],
      description: "Quando acao=usar_ferramenta: a chave exata da ferramenta.",
    },
    escolha: {
      type: ["string", "null"],
      description:
        "Só para agenda.aceitar: a frase em que o paciente escolheu o horário, como ele escreveu.",
    },
    motivo: {
      type: ["string", "null"],
      description: "Quando acao=passar_para_humano: por quê, em poucas palavras.",
    },
    precisaHumano: {
      type: "boolean",
      description: "true quando a conversa exige uma pessoa, mesmo que você vá responder algo.",
    },
  },
};

export function interpretarDecisao(
  dados: Record<string, unknown>,
): { ok: true; decisao: DecisaoAgente; precisaHumano: boolean } | { ok: false; motivo: string } {
  const acao = dados["acao"];
  const precisaHumano = dados["precisaHumano"] === true;

  if (acao === "responder") {
    const texto = typeof dados["texto"] === "string" ? dados["texto"].trim() : "";
    if (texto.length === 0) return { ok: false, motivo: "respondeu sem texto" };
    return { ok: true, decisao: { acao: "responder", texto }, precisaHumano };
  }

  if (acao === "usar_ferramenta") {
    const f = typeof dados["ferramenta"] === "string" ? dados["ferramenta"].trim() : "";
    if (f.length === 0) return { ok: false, motivo: "pediu ferramenta sem nome" };
    const escolha = typeof dados["escolha"] === "string" ? dados["escolha"] : "";
    return {
      ok: true,
      decisao: {
        acao: "usar_ferramenta",
        ferramenta: f,
        argumentos: escolha.length > 0 ? { escolha } : {},
      },
      precisaHumano,
    };
  }

  if (acao === "passar_para_humano") {
    const motivo = typeof dados["motivo"] === "string" ? dados["motivo"].trim() : "";
    // Passar sem motivo deixa a recepção com uma tarefa sem enunciado.
    if (motivo.length === 0) return { ok: false, motivo: "pediu humano sem motivo" };
    return { ok: true, decisao: { acao: "passar_para_humano", motivo }, precisaHumano: true };
  }

  return { ok: false, motivo: `ação desconhecida: ${String(acao)}` };
}

/* -------------------------------------------------------------------------- */
/* O laço                                                                     */
/* -------------------------------------------------------------------------- */

/** Acima disso não é raciocínio, é laço. */
export const MAX_PASSOS = 5;

export type PassoDoLaco = {
  ferramenta: string;
  ok: boolean;
  bloqueadoPor: string | null;
};

export type ResultadoLaco =
  | { tipo: "responder"; texto: string; precisaHumano: boolean; passos: PassoDoLaco[] }
  | { tipo: "humano"; motivo: string; passos: PassoDoLaco[] }
  | { tipo: "falha"; motivo: string; passos: PassoDoLaco[] };

export type DependenciasLaco = {
  /** Pede uma decisão ao modelo, dado o histórico de ferramentas já usadas. */
  decidir: (
    observacoes: readonly string[],
  ) => Promise<{ ok: true; dados: Record<string, unknown> } | { ok: false; detalhe: string }>;
  estado: EstadoPolitica;
  executor: DependenciasExecutor;
  /**
   * Quem roda a ferramenta. O padrão é `executarFerramenta`, que fala com os
   * casos de uso do CRC.
   *
   * EXISTE PARA O REPLAY (Fatia 9), e a troca é o que garante que uma avaliação
   * não tem efeito no mundo: o replay passa um executor que serve saídas
   * declaradas no caso e não conhece Dental Office, banco nem WhatsApp.
   *
   * A POLÍTICA CONTINUA SENDO AVALIADA ACIMA, antes desta chamada — de propósito.
   * Se a substituição pulasse a política, o replay deixaria de poder provar que
   * uma ferramenta proibida é barrada, que é justamente uma das categorias
   * bloqueantes do gate de publicação.
   */
  executar?: (
    ferramenta: string,
    argumentos: Record<string, unknown>,
    deps: DependenciasExecutor,
  ) => Promise<{ ok: boolean; saida: string }>;
};

/**
 * Roda o laço até o modelo responder, pedir humano, ou bater num teto.
 *
 * `observacoes` é o que volta para o modelo a cada volta: a saída de cada
 * ferramenta, em texto. Não é histórico de mensagens — é o que ele descobriu
 * neste turno, e some quando o turno acaba.
 */
export async function rodarLaco(deps: DependenciasLaco): Promise<ResultadoLaco> {
  const observacoes: string[] = [];
  const passos: PassoDoLaco[] = [];
  const jaChamadas = new Set<string>();
  let usadas = 0;

  for (let passo = 0; passo < MAX_PASSOS; passo += 1) {
    const r = await deps.decidir(observacoes);
    if (!r.ok) return { tipo: "falha", motivo: `O modelo não respondeu: ${r.detalhe}`, passos };

    const lida = interpretarDecisao(r.dados);
    if (!lida.ok) return { tipo: "falha", motivo: `Decisão inválida: ${lida.motivo}`, passos };

    if (lida.decisao.acao === "passar_para_humano") {
      return { tipo: "humano", motivo: lida.decisao.motivo, passos };
    }

    if (lida.decisao.acao === "responder") {
      return {
        tipo: "responder",
        texto: lida.decisao.texto,
        precisaHumano: lida.precisaHumano,
        passos,
      };
    }

    // --- é ferramenta ----------------------------------------------------
    const { ferramenta, argumentos } = lida.decisao;

    /*
     * A MESMA CHAMADA DUAS VEZES É LAÇO, NÃO INSISTÊNCIA.
     *
     * O padrão clássico: a ferramenta devolve "não achei horário", o modelo
     * não gosta da resposta e chama de novo esperando outra. A segunda chamada
     * custa o mesmo e devolve o mesmo.
     */
    const assinatura = `${ferramenta}:${JSON.stringify(argumentos)}`;
    if (jaChamadas.has(assinatura)) {
      observacoes.push(
        `Você já chamou ${ferramenta} com os mesmos argumentos neste turno e o resultado foi o mesmo. Decida com o que já tem.`,
      );
      passos.push({ ferramenta, ok: false, bloqueadoPor: "repeticao" });
      continue;
    }
    jaChamadas.add(assinatura);

    const politica = avaliarPolitica(ferramenta, { ...deps.estado, ferramentasUsadas: usadas });
    if (!politica.permite) {
      // O modelo PRECISA saber que foi barrado, e por quê: senão ele responde
      // como se a ferramenta tivesse funcionado.
      observacoes.push(`A ferramenta ${ferramenta} não pode ser usada: ${politica.motivo}`);
      passos.push({ ferramenta, ok: false, bloqueadoPor: politica.codigo });
      continue;
    }

    const rodar = deps.executar ?? executarFerramenta;
    const saida = await rodar(ferramenta, argumentos, deps.executor);
    usadas += 1;
    observacoes.push(`Resultado de ${ferramenta}:\n${saida.saida}`);
    passos.push({ ferramenta, ok: saida.ok, bloqueadoPor: null });
  }

  // Estourou o teto sem conclusão. Não é falha do modelo nem erro de código —
  // é um turno que não chegou a lugar nenhum, e isso é caso humano.
  return {
    tipo: "humano",
    motivo: `O agente usou ${String(MAX_PASSOS)} passos sem chegar a uma resposta.`,
    passos,
  };
}

/** O catálogo e as regras do laço, para entrar nas instruções do modelo. */
export function instrucoesDoLaco(estado: EstadoPolitica): string {
  return `## Ferramentas

${catalogoParaOModelo(estado)}

## Como decidir

A cada volta, escolha UMA ação:
- "usar_ferramenta" quando precisar consultar ou agir antes de falar;
- "responder" quando já souber o que dizer;
- "passar_para_humano" quando a conversa exigir uma pessoa.

Você tem no máximo ${String(MAX_PASSOS)} voltas. Chamar a mesma ferramenta com os
mesmos argumentos duas vezes devolve o mesmo resultado — decida com o que tem.

NUNCA cite horário que não tenha vindo de uma ferramenta nesta conversa.`;
}
