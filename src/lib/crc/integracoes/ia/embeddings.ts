/**
 * A porta de embeddings — Fatia 7.
 *
 * POR QUE UMA PORTA NOVA, E NÃO UM MÉTODO EM `PortaIa`.
 *
 * `PortaIa` tem um método só, `gerarEstruturado`, e o cabeçalho dela diz que a
 * estreiteza é a decisão mais importante do arquivo: não existe caminho que
 * devolva texto solto. Embedding não é texto nem estrutura — é um vetor — e
 * enfiá-lo ali obrigaria todo adapter de conversa a implementar um método que
 * não tem nada a ver com conversa. O sandbox de conversa, por exemplo, é regras
 * por palavra-chave e não tem o que devolver.
 *
 * São capacidades diferentes, com modelos diferentes, preços diferentes e
 * disponibilidade diferente. Duas portas.
 *
 * A DIMENSÃO É PARTE DO CONTRATO. `crc_knowledge_chunks.embedding` é
 * `vector(1536)`, fixo no schema. Um modelo de outra dimensão não "funciona
 * pior": ele faz o Postgres recusar o insert no meio de uma ingestão, deixando
 * metade dos pedaços gravados. Por isso `dimensoes` é campo da porta e a
 * aplicação confere ANTES de começar.
 */
import { campo, ehObjeto, numeroOpcional, textoOpcional } from "../../dominio/validar";
import { pedir, type EventoHttp } from "../../servidor/http";
import { registrarIntegracao } from "../../servidor/registro";

/** O que a coluna do banco aceita. Mudar isto exige migração de schema. */
export const DIMENSOES_EMBEDDING = 1536;

export type UsoEmbeddings = {
  modelo: string;
  inputTokens: number | null;
  custoEstimado: number | null;
  duracaoMs: number;
};

export type RespostaEmbeddings =
  | { ok: true; vetores: readonly (readonly number[])[]; uso: UsoEmbeddings }
  | { ok: false; motivo: "indisponivel" | "recusada" | "invalida"; detalhe: string };

export type PortaEmbeddings = {
  readonly nome: string;
  readonly modelo: string;
  readonly dimensoes: number;
  /**
   * Um vetor por texto, na MESMA ORDEM da entrada.
   *
   * A ordem é contrato: quem chama associa `vetores[i]` a `textos[i]` para
   * gravar o pedaço certo com o vetor certo. Um adapter que reordenasse
   * misturaria conteúdo de um pedaço com o significado de outro, e o defeito
   * apareceria como "a busca traz coisa aleatória" muito longe daqui.
   */
  gerar(textos: readonly string[]): Promise<RespostaEmbeddings>;
};

export type EstadoEmbeddings =
  | { configurado: true; porta: PortaEmbeddings }
  | { configurado: false; motivo: string; faltando: string[] };

/** Preço por milhão de tokens, em dólar. Estimativa — ver `provedor.ts`. */
const PRECOS_USD_POR_MILHAO: Readonly<Record<string, number>> = {
  "text-embedding-3-small": 0.02,
  "text-embedding-3-large": 0.13,
};

function cambio(): number {
  const v = Number.parseFloat(process.env["CRC_USD_BRL"] ?? "");
  return Number.isFinite(v) && v > 0 ? v : 5.5;
}

/* -------------------------------------------------------------------------- */
/* OpenAI                                                                     */
/* -------------------------------------------------------------------------- */

class EmbeddingsOpenAi implements PortaEmbeddings {
  readonly nome = "openai";
  readonly modelo: string;
  readonly dimensoes = DIMENSOES_EMBEDDING;

  private readonly chave: string;
  private readonly organizationId: string | null;

  constructor(chave: string, modelo: string, organizationId: string | null) {
    this.chave = chave;
    this.modelo = modelo;
    this.organizationId = organizationId;
  }

  async gerar(textos: readonly string[]): Promise<RespostaEmbeddings> {
    if (textos.length === 0) {
      return {
        ok: true,
        vetores: [],
        uso: { modelo: this.modelo, inputTokens: 0, custoEstimado: 0, duracaoMs: 0 },
      };
    }

    const comecou = Date.now();
    const eventos: EventoHttp[] = [];

    try {
      const resposta = await pedir("https://api.openai.com/v1/embeddings", {
        metodo: "POST",
        cabecalhos: { Authorization: `Bearer ${this.chave}` },
        corpo: {
          model: this.modelo,
          input: [...textos],
          // Pedido explicitamente, e não deixado no padrão do modelo: o
          // `text-embedding-3-*` aceita reduzir dimensão, e o padrão do large
          // são 3072. Declarar aqui trava o contrato com a coluna do banco.
          dimensions: this.dimensoes,
        },
        timeoutMs: 30_000,
        // Ingestão é idempotente por `chave_dedupe`: repetir a chamada não
        // duplica pedaço, e um timeout de rede sem retry deixaria a fonte pela
        // metade.
        repetirEscrita: true,
        aoRegistrar: (e) => eventos.push(e),
      });

      const duracaoMs = Date.now() - comecou;
      await this.registrar(eventos);

      if (resposta.status >= 400) {
        const detalhe =
          textoOpcional(campo(resposta.corpo, "error.message")) ?? `HTTP ${String(resposta.status)}`;
        return { ok: false, motivo: resposta.status < 500 ? "recusada" : "indisponivel", detalhe };
      }

      const dados = campo(resposta.corpo, "data");
      if (!Array.isArray(dados) || dados.length !== textos.length) {
        return {
          ok: false,
          motivo: "invalida",
          detalhe: `Esperávamos ${String(textos.length)} vetores.`,
        };
      }

      /*
       * A ORDEM VEM DO CAMPO `index`, E NÃO DA POSIÇÃO NO ARRAY.
       *
       * A API documenta que pode devolver fora de ordem. Confiar na posição
       * funcionaria em todos os testes e produziria, em produção, pedaços
       * gravados com o significado do vizinho — um defeito que aparece como
       * "a busca traz resposta errada" e não tem nada que aponte para cá.
       */
      const vetores: number[][] = new Array<number[]>(textos.length);
      for (const item of dados) {
        if (!ehObjeto(item)) return { ok: false, motivo: "invalida", detalhe: "Item não é objeto." };
        const indice = numeroOpcional(item["index"]) ?? -1;
        const vetor = item["embedding"];
        if (indice < 0 || indice >= textos.length || !Array.isArray(vetor)) {
          return { ok: false, motivo: "invalida", detalhe: "Vetor sem índice válido." };
        }
        if (vetor.length !== this.dimensoes) {
          return {
            ok: false,
            motivo: "invalida",
            detalhe: `O modelo devolveu ${String(vetor.length)} dimensões; a coluna aceita ${String(this.dimensoes)}.`,
          };
        }
        vetores[indice] = vetor.map((n) => Number(n));
      }

      const tokens = numeroOpcional(campo(resposta.corpo, "usage.prompt_tokens"));
      const preco = PRECOS_USD_POR_MILHAO[this.modelo];
      return {
        ok: true,
        vetores,
        uso: {
          modelo: this.modelo,
          inputTokens: tokens,
          custoEstimado:
            preco === undefined || tokens === null
              ? null
              : Number((((tokens / 1_000_000) * preco * cambio()).toFixed(6))),
          duracaoMs,
        },
      };
    } catch (erro) {
      await this.registrar(eventos);
      return {
        ok: false,
        motivo: "indisponivel",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      };
    }
  }

  private async registrar(eventos: EventoHttp[]): Promise<void> {
    const ultimo = eventos[eventos.length - 1];
    if (ultimo === undefined) return;
    await registrarIntegracao({
      organizationId: this.organizationId,
      integracao: "ia",
      operacao: "embeddings",
      metodo: "POST",
      caminho: "/v1/embeddings",
      statusHttp: ultimo.statusHttp,
      sucesso: ultimo.sucesso,
      erro: ultimo.erro,
      duracaoMs: ultimo.duracaoMs,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Sandbox                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Embeddings determinísticos por hash de palavra.
 *
 * O QUE ELE É DE VERDADE: um saco de palavras espalhado em 1536 posições. Duas
 * frases com as mesmas palavras ficam próximas; duas frases que dizem a mesma
 * coisa com palavras diferentes ficam longe. Isso NÃO é significado — é
 * coincidência de vocabulário.
 *
 * Ele existe para duas coisas honestas: rodar ingestão e busca ponta a ponta
 * sem gastar token, e provar que o sistema se comporta quando o provedor está
 * fora. Não existe para dar a impressão de que substitui o modelo: uma busca
 * por "posso pagar parcelado?" não vai achar "aceitamos cartão em 12 vezes",
 * e é por isso que o nome do provedor aparece na tela.
 */
class EmbeddingsSandbox implements PortaEmbeddings {
  readonly nome = "sandbox";
  readonly modelo = "sandbox-hash";
  readonly dimensoes = DIMENSOES_EMBEDDING;

  gerar(textos: readonly string[]): Promise<RespostaEmbeddings> {
    const vetores = textos.map((t) => vetorDeHash(t, this.dimensoes));
    return Promise.resolve({
      ok: true,
      vetores,
      uso: { modelo: this.modelo, inputTokens: 0, custoEstimado: 0, duracaoMs: 0 },
    });
  }
}

/** FNV-1a. Pequeno, determinístico e sem dependência. */
function hash(palavra: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < palavra.length; i += 1) {
    h ^= palavra.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function vetorDeHash(texto: string, dimensoes: number): number[] {
  const vetor = new Array<number>(dimensoes).fill(0);
  const palavras = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/u)
    .filter((p) => p.length > 2);

  for (const p of palavras) {
    const h = hash(p);
    // Duas posições por palavra, uma positiva e uma negativa: com uma só, todos
    // os vetores ficariam no mesmo octante e a similaridade de cosseno entre
    // textos sem nenhuma palavra em comum ainda daria um número alto.
    vetor[h % dimensoes] = (vetor[h % dimensoes] ?? 0) + 1;
    const outra = (h >>> 16) % dimensoes;
    vetor[outra] = (vetor[outra] ?? 0) - 1;
  }

  // Normalizado: a busca compara direção, não tamanho. Sem isto, um pedaço
  // longo pareceria mais parecido com tudo só por ter mais palavras.
  const norma = Math.sqrt(vetor.reduce((s, v) => s + v * v, 0));
  return norma === 0 ? vetor : vetor.map((v) => v / norma);
}

/* -------------------------------------------------------------------------- */
/* A fábrica                                                                  */
/* -------------------------------------------------------------------------- */

export function criarProvedorEmbeddings(organizationId: string | null): EstadoEmbeddings {
  const producao = process.env["NODE_ENV"] === "production";
  if ((process.env["CRC_IA_SANDBOX"] ?? "").trim() === "1" && !producao) {
    return { configurado: true, porta: new EmbeddingsSandbox() };
  }

  const chave = (process.env["OPENAI_API_KEY"] ?? "").trim();
  if (chave.length === 0) {
    return {
      configurado: false,
      motivo: "A busca por significado no conhecimento ainda não foi configurada.",
      faltando: ["OPENAI_API_KEY"],
    };
  }

  const modelo = (process.env["OPENAI_EMBEDDING_MODEL_CRC"] ?? "text-embedding-3-small").trim();
  return { configurado: true, porta: new EmbeddingsOpenAi(chave, modelo, organizationId) };
}
