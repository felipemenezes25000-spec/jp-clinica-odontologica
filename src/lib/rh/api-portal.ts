/**
 * As duas server functions do portal PÚBLICO de vagas.
 *
 * POR QUE ELAS MORAM SEPARADAS DE `api.ts`
 * `api.ts` reúne as ~25 server functions do painel. Importar esse módulo para
 * usar duas delas puxa as vinte e cinco para o grafo — e foi isso que derrubou a
 * produção com HTTP 500 em TODAS as rotas, inclusive a home: com o grafo daquele
 * tamanho, o fatiador do bundler passou a colocar helpers do próprio framework
 * num pedaço que o pedaço do framework importava de volta, formando um ciclo de
 * ESM. Ver docs/INCIDENTE-BUILD-500.md.
 *
 * A regra que fica: rota pública importa só o que usa. `/carreiras` não tem por
 * que carregar o código de importar currículo em massa nem o de gerar ficha de
 * entrevista.
 *
 * Nada aqui exige sessão — é o portal aberto. O filtro de vaga publicada é feito
 * no SERVIDOR de propósito: mandar rascunho para o navegador e esconder no CSS
 * publicaria o texto para quem abrisse o HTML.
 */
import { createServerFn } from "@tanstack/react-start";

import type { ConfiguracoesRh, Vaga } from "./tipos";
import { ordenarVagas, vagaAberta } from "./vagas";

/** Igual ao de `api.ts`: repetir três linhas é mais barato que reunir os grafos. */
function objeto(entrada: unknown): Record<string, unknown> {
  return entrada !== null && typeof entrada === "object"
    ? (entrada as Record<string, unknown>)
    : {};
}

function texto(valor: unknown, maximo: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

/**
 * `agoraIso` é o relógio do SERVIDOR no instante da carga, e vai junto de
 * propósito. "Publicada há 16 minutos" é calculado a partir dele: se a tela
 * chamasse `new Date()` no inicializador do estado, o valor nasceria no
 * servidor, renasceria diferente no navegador (relógio adiantado, ou só a
 * virada de um balde de minuto entre o SSR e a hidratação) e o React 19
 * trataria o texto divergente como erro de hidratação, repintando a raiz
 * inteira — justamente na página pública que precisa ser indexada.
 */
export type RespostaPortal = { vagas: Vaga[]; config: ConfiguracoesRh; agoraIso: string };

export const listarVagasPublicas = createServerFn({ method: "GET" }).handler(
  async (): Promise<RespostaPortal> => {
    const { lerConfiguracoes, listarVagas } = await import("./servidor/armazenamento");
    const [todas, config] = await Promise.all([listarVagas(), lerConfiguracoes()]);

    const agora = new Date();
    return {
      vagas: ordenarVagas(todas.filter((v) => vagaAberta(v, agora))),
      config,
      agoraIso: agora.toISOString(),
    };
  },
);

export type RespostaVagaPublica = {
  vaga: Vaga | null;
  config: ConfiguracoesRh;
  relacionadas: Vaga[];
  agoraIso: string;
};

export const obterVagaPublica = createServerFn({ method: "GET" })
  .validator((entrada: unknown): { slug: string } => {
    const bruto = objeto(entrada);
    // Slug vazio NÃO lança: `texto()` faz `trim()`, e um espaço não separável
    // colado do WhatsApp (`/carreiras/%C2%A0`) some ali. Lançar aqui caía no
    // error boundary — 500, com a mensagem técnica no payload — para uma URL
    // que precisa responder 404. Vazio simplesmente não casa com slug nenhum
    // (`gerarSlug` nunca devolve string vazia), o handler responde `vaga: null`
    // e o loader manda para a tela de vaga não encontrada.
    return { slug: texto(bruto["slug"], 120).toLowerCase() };
  })
  .handler(async ({ data }): Promise<RespostaVagaPublica> => {
    const { lerConfiguracoes, listarVagas } = await import("./servidor/armazenamento");
    const [todas, config] = await Promise.all([listarVagas(), lerConfiguracoes()]);

    const agora = new Date();
    const abertas = ordenarVagas(todas.filter((v) => vagaAberta(v, agora)));

    // Busca só entre as abertas: rascunho, vaga pausada e vaga vencida
    // respondem "não existe". Devolver o conteúdo com um aviso deixaria o
    // texto de uma vaga não publicada visível para quem adivinhasse o slug.
    const vaga = abertas.find((v) => v.slug === data.slug) ?? null;

    // Mesma área primeiro: quem se interessou por uma vaga de ASB tem muito
    // mais chance de servir para outra de ASB do que para o administrativo.
    const relacionadas =
      vaga === null
        ? []
        : [
            ...abertas.filter((v) => v.id !== vaga.id && v.area === vaga.area),
            ...abertas.filter((v) => v.id !== vaga.id && v.area !== vaga.area),
          ].slice(0, 3);

    return { vaga, config, relacionadas, agoraIso: agora.toISOString() };
  });
