/**
 * O cliente da Graph API — §38, §60, §61.
 *
 * ============================================================================
 *  UM CLIENTE, E NÃO UM `fetch` POR ARQUIVO.
 *
 *  Quatro produtos precisam falar com a Graph: direct, Messenger, comentários e
 *  Lead Ads. Escrever `fetch` em cada um espalharia quatro coisas que precisam
 *  ser idênticas:
 *
 *    a versão da API          §4.2 — já resolvida em `config.ts`
 *    o token no cabeçalho     nunca na querystring; ver abaixo
 *    a classificação de erro  §35 — permanente/transitória/INCERTA
 *    o log de integração      §60 — é ele que a tela de saúde mede
 *
 *  A quarta é a que se esquece, e é a que faz a tela de saúde mentir: uma
 *  chamada que não registra em `crc_integration_logs` não existe para
 *  `lerHub()`, e a integração aparece como "nunca foi usada" enquanto falha
 *  toda hora.
 * ============================================================================
 *
 * ============================================================================
 *  O TOKEN VAI NO CABEÇALHO, NUNCA EM `?access_token=`.
 *
 *  A Graph aceita os dois, e a documentação dela usa a querystring nos
 *  exemplos. Só que querystring aparece em log de proxy, em log de CDN, no
 *  `Referer` de qualquer redirecionamento, e em `caminhoParaLog` se alguém
 *  esquecer de mascarar.
 *
 *  Um Page Access Token de System User NÃO EXPIRA. Um token vazado em log é
 *  acesso permanente à Página da clínica — publicar, apagar, mandar mensagem
 *  como ela.
 * ============================================================================
 */
import { campo, ehObjeto, lista, textoOpcional } from "../../dominio/validar";
import { caminhoParaLog, pedir, type EventoHttp, type MetodoHttp } from "../../servidor/http";
import { registrarIntegracao, type NomeDaIntegracao } from "../../servidor/registro";

import { TIMEOUT_GRAPH_MS, urlDaGraph, type TipoDeLogin } from "./config";
import { classificarFalhaDeRede, classificarRespostaDaGraph, type ErroDaGraph } from "./erros";

export type ConfiguracaoDoCliente = {
  /** O Page Access Token, ou o token de usuário do Instagram. Já decifrado. */
  token: string;
  login?: TipoDeLogin;
  versao?: string;
  /** Para o log de integração. `null` no caminho de diagnóstico. */
  organizationId: string | null;
  /**
   * O nome que aparece em `crc_integration_logs.integracao`.
   *
   * SEPARADO POR PRODUTO — `meta_instagram`, `meta_messenger`,
   * `meta_lead_ads` — e não um `meta` só. A tela de saúde do §39 precisa
   * responder "o Lead Ads está chegando e o direct não", e com um nome só a
   * resposta seria "a Meta está mais ou menos".
   */
  integracao: NomeDaIntegracao;
};

export type RespostaDaGraph<T> = { ok: true; dados: T } | { ok: false; erro: ErroDaGraph };

/* -------------------------------------------------------------------------- */

export class ClienteDaGraph {
  private readonly cfg: ConfiguracaoDoCliente;

  constructor(cfg: ConfiguracaoDoCliente) {
    this.cfg = cfg;
  }

  /**
   * Um GET na Graph.
   *
   * `campos` é o `?fields=` — e ele NÃO é opcional na prática. A Graph devolve
   * um subconjunto mínimo sem ele, e o subconjunto mínimo muda entre versões:
   * pedir explicitamente é o que faz a integração sobreviver a um upgrade de
   * versão sem o dado sumir em silêncio.
   */
  async obter<T = unknown>(
    caminho: string,
    parametros: Readonly<Record<string, string>> = {},
    operacao = "obter",
  ): Promise<RespostaDaGraph<T>> {
    return this.chamar<T>("GET", caminho, parametros, undefined, operacao);
  }

  /**
   * Um POST na Graph.
   *
   * ============================================================================
   *  `repetirEscrita: false` — SEMPRE, e sem exceção configurável.
   *
   *  É a decisão do §35 e ela é do `servidor/http.ts`: um POST que deu timeout
   *  PODE ter entregue a mensagem. Repetir manda duas.
   *
   *  Quem precisa de retentativa de escrita é a FILA, que repesca com a chave
   *  de dedupe intacta — e aí a segunda tentativa é recusada pelo banco em vez
   *  de produzir um segundo direct. Retentativa no nível do HTTP não passa pela
   *  chave de dedupe: ela acontece dentro da mesma chamada.
   * ============================================================================
   */
  async postar<T = unknown>(
    caminho: string,
    corpo: unknown,
    operacao = "postar",
  ): Promise<RespostaDaGraph<T>> {
    return this.chamar<T>("POST", caminho, {}, corpo, operacao);
  }

  private async chamar<T>(
    metodo: MetodoHttp,
    caminho: string,
    parametros: Readonly<Record<string, string>>,
    corpo: unknown,
    operacao: string,
  ): Promise<RespostaDaGraph<T>> {
    const base = urlDaGraph(caminho, this.cfg.login ?? "facebook", this.cfg.versao);
    const url = comParametros(base, parametros);
    const eventos: EventoHttp[] = [];

    try {
      const resposta = await pedir(url, {
        metodo,
        cabecalhos: { Authorization: `Bearer ${this.cfg.token}` },
        ...(corpo === undefined ? {} : { corpo }),
        // Ver o cabeçalho de `postar`. Vale para GET também: um GET repetido é
        // seguro, e `pedir` já repete métodos idempotentes por conta própria.
        repetirEscrita: false,
        timeoutMs: TIMEOUT_GRAPH_MS,
        aoRegistrar: (e) => eventos.push(e),
      });

      if (resposta.status >= 400) {
        return {
          ok: false,
          erro: classificarRespostaDaGraph({
            status: resposta.status,
            corpo: resposta.corpo,
            texto: resposta.texto,
            cabecalhos: resposta.cabecalhos,
          }),
        };
      }

      /*
       * ERRO DENTRO DE UM 200 — a Graph faz isso.
       *
       * `{"error": {...}}` com status 200 acontece em chamadas em lote e em
       * alguns endpoints de leitura. Um cliente que só olha o status trata isso
       * como sucesso e devolve um objeto sem os campos esperados — e o defeito
       * aparece três camadas acima, como "o lead veio sem telefone".
       */
      if (ehObjeto(resposta.corpo) && ehObjeto(resposta.corpo["error"])) {
        return {
          ok: false,
          erro: classificarRespostaDaGraph({
            status: 400,
            corpo: resposta.corpo,
            texto: resposta.texto,
          }),
        };
      }

      return { ok: true, dados: resposta.corpo as T };
    } catch (erro) {
      return { ok: false, erro: classificarFalhaDeRede(erro) };
    } finally {
      const ultimo = eventos[eventos.length - 1];
      if (ultimo !== undefined) {
        await registrarIntegracao({
          organizationId: this.cfg.organizationId,
          integracao: this.cfg.integracao,
          operacao,
          metodo,
          // `caminhoParaLog` mascara querystring. O token nunca esteve nela —
          // ver o cabeçalho — mas `fields` e ids de anúncio também não precisam
          // ir para o log.
          caminho: caminhoParaLog(base),
          statusHttp: ultimo.statusHttp,
          sucesso: ultimo.sucesso,
          erro: ultimo.erro,
          duracaoMs: ultimo.duracaoMs,
        });
      }
    }
  }

  /**
   * Percorre uma coleção paginada — §37, §38.
   *
   * ============================================================================
   *  O TETO DE PÁGINAS NÃO É DEFENSIVO: É A REGRA.
   *
   *  A Graph pagina por cursor e uma coleção grande tem centenas de páginas.
   *  Um laço `while (proxima !== null)` sem teto é exatamente o que o §38
   *  proíbe — "não chamar Graph API em loops irrestritos" — e o efeito é duplo:
   *  estoura a cota de 200 chamadas/hora por usuário, e trava o job por
   *  minutos.
   *
   *  O CURSOR É DEVOLVIDO JUNTO com as páginas lidas. É o que faz a
   *  reconciliação RETOMAR na volta seguinte em vez de recomeçar — e é por isso
   *  que `crc_sync_state.cursor` existe.
   * ============================================================================
   */
  async paginar<T = unknown>(
    caminho: string,
    parametros: Readonly<Record<string, string>> = {},
    opcoes: { maxPaginas?: number; cursor?: string | null; operacao?: string } = {},
  ): Promise<
    | { ok: true; itens: T[]; proximoCursor: string | null; paginas: number; fechou: boolean }
    | { ok: false; erro: ErroDaGraph; itens: T[]; proximoCursor: string | null }
  > {
    const maxPaginas = Math.max(1, Math.min(opcoes.maxPaginas ?? 5, 50));
    const itens: T[] = [];
    let cursor = opcoes.cursor ?? null;
    let paginas = 0;

    while (paginas < maxPaginas) {
      const r = await this.obter<unknown>(
        caminho,
        cursor === null ? parametros : { ...parametros, after: cursor },
        opcoes.operacao ?? "paginar",
      );

      if (!r.ok) {
        /*
         * A FALHA DEVOLVE O QUE JÁ LEU, e o cursor de onde parou.
         *
         * Descartar as páginas boas porque a quinta falhou faria o job
         * recomeçar do zero na volta seguinte — e num 429 isso é garantia de
         * nunca terminar: cada volta gasta cota relendo o que já tinha lido.
         */
        return { ok: false, erro: r.erro, itens, proximoCursor: cursor };
      }

      paginas += 1;
      for (const item of lista(campo(r.dados, "data"))) itens.push(item as T);

      const proxima = textoOpcional(campo(r.dados, "paging.cursors.after"));
      const temMais = textoOpcional(campo(r.dados, "paging.next")) !== null;

      if (!temMais || proxima === null) {
        return { ok: true, itens, proximoCursor: null, paginas, fechou: true };
      }
      cursor = proxima;
    }

    /*
     * O TETO FOI ATINGIDO E AINDA HÁ PÁGINA.
     *
     * `fechou: false` com cursor é o desfecho honesto: "leu até aqui, continua
     * daqui". O job grava o cursor e volta na próxima rodada. Devolver
     * `fechou: true` faria a reconciliação marcar o recurso como sincronizado
     * com metade dos leads importados.
     */
    return { ok: true, itens, proximoCursor: cursor, paginas, fechou: false };
  }
}

function comParametros(url: string, parametros: Readonly<Record<string, string>>): string {
  const entradas = Object.entries(parametros).filter(([, v]) => v.length > 0);
  if (entradas.length === 0) return url;

  const qs = new URLSearchParams();
  for (const [k, v] of entradas) qs.set(k, v);
  return `${url}?${qs.toString()}`;
}
