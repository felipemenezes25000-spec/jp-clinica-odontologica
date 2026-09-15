import { TRATAMENTOS } from "@/lib/jp";

/**
 * QUAL TRATAMENTO ESTÁ NESTA URL — a fonte única.
 *
 * ============================================================================
 *  O DEFEITO QUE ESTE ARQUIVO FECHA.
 *
 *  O rastreio decidia "isto é uma página de tratamento" com um teste só:
 *
 *      pathname.startsWith("/tratamentos/")
 *
 *  Que é verdadeiro para a URL orgânica e FALSO para a URL de anúncio. Medido
 *  em 14/09/2026, com o site rodando: abrir `/tratamentos/implantes-dentarios`
 *  disparava `treatment_view`; abrir `/implante-dentario` deixava o `dataLayer`
 *  vazio.
 *
 *  Ou seja: a única rota que a clínica vai pagar para trazer gente era a única
 *  que o funil não enxergava.
 * ============================================================================
 *
 * POR QUE UM MAPA EXPLÍCITO, E NÃO UMA REGRA.
 *
 * Tentar derivar o slug do caminho ("implante-dentario" → "implantes-dentarios")
 * exigiria singular/plural, sinônimo e exceção: a LP de harmonização é
 * `/harmonizacao-facial` porque é assim que se busca, e o tratamento é
 * `harmonizacao-orofacial` porque é assim que se chama. Nenhuma regra acerta as
 * duas coisas. Oito linhas de mapa acertam, e erram alto quando alguém edita só
 * um lado — `rotas.test.ts` confere cada slug contra `TRATAMENTOS`.
 */

/** A URL de anúncio → o slug do tratamento que ela serve. */
export const ROTAS_PAGAS: Readonly<Record<string, string>> = {
  "/implante-dentario": "implantes-dentarios",
  "/protese-dentaria": "proteses-dentarias",
  "/ortodontia": "ortodontia",
  "/clareamento-dental": "clareamento-dental",
  "/odontopediatria": "odontopediatria",
  "/restauracao-dentaria": "restauracoes",
  "/limpeza-dental": "limpeza-profilaxia",
  "/harmonizacao-facial": "harmonizacao-orofacial",
};

const PREFIXO_ORGANICO = "/tratamentos/";

/** Tira a barra final, para `/ortodontia/` e `/ortodontia` serem a mesma rota. */
function normalizar(pathname: string): string {
  const semBarra = pathname.replace(/\/+$/u, "");
  return semBarra.length === 0 ? "/" : semBarra;
}

/**
 * O slug do tratamento desta URL, ou `null` se ela não for de tratamento.
 *
 * As duas rotas do mesmo procedimento devolvem o MESMO slug, que é o ponto:
 * o relatório não pode ter "implantes" numa linha e "implante-dentario" noutra
 * só porque o tráfego veio pago.
 */
export function tratamentoDaRota(pathname: string): string | null {
  const rota = normalizar(pathname);

  const pago = ROTAS_PAGAS[rota];
  if (pago !== undefined) return pago;

  if (rota.startsWith(PREFIXO_ORGANICO)) {
    const slug = rota.slice(PREFIXO_ORGANICO.length);
    // Só devolve o que existe de verdade: `/tratamentos/qualquer-coisa` é 404,
    // e um 404 não pode entrar no funil como se fosse página de procedimento.
    return TRATAMENTOS.some((t) => t.slug === slug) ? slug : null;
  }

  return null;
}

/** Se esta URL é uma das oito de anúncio. */
export function ehRotaPaga(pathname: string): boolean {
  return ROTAS_PAGAS[normalizar(pathname)] !== undefined;
}

/** O título do tratamento desta URL — o que entra na mensagem do WhatsApp. */
export function tituloDaRota(pathname: string): string | null {
  const slug = tratamentoDaRota(pathname);
  if (slug === null) return null;
  return TRATAMENTOS.find((t) => t.slug === slug)?.titulo ?? null;
}
