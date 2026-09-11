import { CLINICA, HISTORIA } from "@/lib/jp";

/**
 * Título e descrição dentro do que o Google mostra.
 *
 * Medido nas 12 rotas do site antes desta mudança: TODO title tinha entre 65 e
 * 75 caracteres e TODA description entre 164 e 228. O Google corta o título por
 * volta de 60 e a descrição por volta de 155 — então a clínica estava escrevendo
 * um final de frase que ninguém lia, e pior: o corte caía no meio do nome dela.
 *
 * Aqui não se inventa texto. O que existe é uma regra de montagem: a intenção de
 * busca vem na frente, a marca no fim, e a marca encolhe se não couber.
 */

/** O que o Google exibe antes de cortar. */
const LIMITE_TITULO = 60;
const LIMITE_DESCRICAO = 155;

/**
 * A marca em três tamanhos, do mais completo ao mais curto.
 *
 * A montagem tenta na ordem e fica com a primeira que couber — em vez de
 * escolher a curta sempre, ou de deixar a longa estourar. "Limpeza" sobra espaço
 * e leva o nome inteiro; "Harmonização orofacial" não sobra, e leva o curto.
 */
const MARCAS = [CLINICA.nome, "JP Clínica Odontológica", "JP Clínica"];

/**
 * `<título da página> na <região> | <marca>`.
 *
 * A ordem é a decisão. Quem procura dentista digita "implante dentário na
 * Freguesia do Ó", não o nome de uma clínica que ainda não conhece — então é o
 * procedimento e o bairro que ocupam o começo, que é a parte que sempre aparece.
 * O nome da clínica fecha, para quem já conhece reconhecer.
 */
export function tituloLocal(assunto: string, comRegiao = true): string {
  const base = comRegiao ? `${assunto} na ${HISTORIA.regiaoAtual}` : assunto;
  for (const marca of MARCAS) {
    const t = `${base} | ${marca}`;
    if (t.length <= LIMITE_TITULO) return t;
  }
  // Assunto longo demais para caber com marca nenhuma: entrega ele sozinho, em
  // vez de devolver um título cortado no meio de uma palavra.
  return base.length <= LIMITE_TITULO ? base : assunto;
}

/**
 * Junta as frases que couberem inteiras dentro do limite.
 *
 * Corta por frase e nunca no meio de uma: descrição que termina em "atendimento
 * odontoló…" lê pior do que uma frase a menos. Por isso recebe uma lista, e não
 * um texto único já concatenado.
 */
export function descricaoLocal(...frases: string[]): string {
  let saida = "";
  for (const f of frases) {
    const bruta = f.trim();
    if (!bruta) continue;
    const proxima = saida ? `${saida} ${bruta}` : bruta;
    if (proxima.length > LIMITE_DESCRICAO) break;
    saida = proxima;
  }
  return saida;
}

/**
 * O fecho de localização, curto porque é ele que costuma estourar o limite.
 * "Vila Bruna, região da Freguesia do Ó, São Paulo." em vez de repetir o nome
 * completo da clínica, que já está no título ao lado.
 */
export const FECHO_LOCAL = `${CLINICA.local.bairro}, região da ${HISTORIA.regiaoAtual}, ${CLINICA.local.cidade}.`;
