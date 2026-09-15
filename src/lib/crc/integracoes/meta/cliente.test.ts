/**
 * O cliente da Graph API — §35, §38, §60, §61.
 *
 * ============================================================================
 *  QUATRO INVARIANTES, E CADA UM JÁ FOI UM INCIDENTE EM ALGUM SISTEMA.
 *
 *  1. O TOKEN VAI NO CABEÇALHO. A Graph aceita `?access_token=`, e a doc dela
 *     usa isso nos exemplos. Querystring aparece em log de proxy, de CDN, no
 *     `Referer` de redirecionamento. Um Page Access Token de System User NÃO
 *     EXPIRA: vazado em log, é acesso permanente à Página da clínica.
 *
 *  2. ERRO DENTRO DE UM 200. A Graph devolve `{"error": {...}}` com status 200.
 *     Um cliente que só olha o status trata como sucesso e entrega um objeto
 *     sem os campos esperados — e o defeito aparece três camadas acima, como
 *     "o lead veio sem telefone".
 *
 *  3. ESCRITA NUNCA É RETENTADA NO HTTP. Um POST que deu timeout PODE ter
 *     entregue. Repetir manda dois direct para o paciente. Quem retenta é a
 *     FILA, que passa pela chave de dedupe.
 *
 *  4. TODA CHAMADA REGISTRA. Uma chamada que não entra em
 *     `crc_integration_logs` não existe para a tela de saúde — e a integração
 *     aparece como "nunca foi usada" enquanto falha de hora em hora.
 * ============================================================================
 *
 * ============================================================================
 *  O QUE É FALSO AQUI É O `fetch`, E NÃO O CLIENTE.
 *
 *  `vi.mock` substitui `servidor/http`. Com isso o teste exercita a montagem da
 *  URL com a versão da Graph, a classificação de erro do `erros.ts` e a
 *  paginação por cursor — de verdade. Mockar o cliente testaria o mock.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type ChamadaHttp = {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  corpo: unknown;
  repetirEscrita: boolean | undefined;
};

type RespostaFalsa = { status: number; corpo: unknown } | { lanca: unknown };

const chamadas: ChamadaHttp[] = [];
const respostas: RespostaFalsa[] = [];

vi.mock("../../servidor/http", async () => {
  const real = await vi.importActual<typeof import("../../servidor/http")>("../../servidor/http");

  return {
    ...real,
    pedir: (
      url: string,
      opcoes: {
        metodo?: string;
        cabecalhos?: Record<string, string>;
        corpo?: unknown;
        repetirEscrita?: boolean;
        aoRegistrar?: (e: {
          metodo: string;
          caminho: string;
          statusHttp: number | null;
          sucesso: boolean;
          erro: string | null;
          duracaoMs: number;
          tentativa: number;
        }) => void;
      } = {},
    ) => {
      chamadas.push({
        url,
        metodo: opcoes.metodo ?? "GET",
        cabecalhos: opcoes.cabecalhos ?? {},
        corpo: opcoes.corpo,
        repetirEscrita: opcoes.repetirEscrita,
      });

      const r = respostas.shift() ?? { status: 200, corpo: {} };

      // O `aoRegistrar` é o que alimenta `crc_integration_logs`. O `pedir` real
      // o chama uma vez por TENTATIVA; aqui, uma vez — é o suficiente para
      // provar que o cliente registra, que é o invariante 4.
      opcoes.aoRegistrar?.({
        metodo: opcoes.metodo ?? "GET",
        caminho: real.caminhoParaLog(url),
        statusHttp: "status" in r ? r.status : null,
        sucesso: "status" in r && r.status < 400,
        erro: "lanca" in r ? "falhou" : null,
        duracaoMs: 12,
        tentativa: 1,
      });

      if ("lanca" in r) return Promise.reject(r.lanca);

      return Promise.resolve({
        status: r.status,
        corpo: r.corpo,
        texto: JSON.stringify(r.corpo),
        cabecalhos: new Headers(),
      });
    },
  };
});

type LinhaDeLog = {
  organizationId: string | null;
  integracao: string;
  operacao: string;
  caminho: string;
  statusHttp: number | null;
  sucesso: boolean;
};

const logs: LinhaDeLog[] = [];

vi.mock("../../servidor/registro", async () => {
  const real =
    await vi.importActual<typeof import("../../servidor/registro")>("../../servidor/registro");

  return {
    ...real,
    registrar: () => undefined,
    auditar: () => Promise.resolve(),
    registrarIntegracao: (p: LinhaDeLog) => {
      logs.push(p);
      return Promise.resolve();
    },
  };
});

import { ClienteDaGraph } from "./cliente";

const ORG = "11111111-1111-4111-8111-111111111111";
const TOKEN = "EAAG-um-page-access-token-que-nunca-pode-vazar";

function cliente(extra: Partial<{ login: "facebook" | "instagram"; versao: string }> = {}) {
  return new ClienteDaGraph({
    token: TOKEN,
    organizationId: ORG,
    integracao: "meta_instagram",
    ...extra,
  });
}

beforeEach(() => {
  chamadas.length = 0;
  respostas.length = 0;
  logs.length = 0;
  process.env["META_GRAPH_VERSION"] = "v26.0";
});

/* -------------------------------------------------------------------------- */

describe("o token", () => {
  it("vai no cabeçalho Authorization, e NUNCA na URL", async () => {
    respostas.push({ status: 200, corpo: { id: "1" } });

    await cliente().obter("me", { fields: "id,name" });

    const c = chamadas[0]!;
    expect(c.cabecalhos["Authorization"]).toBe(`Bearer ${TOKEN}`);

    /*
     * ==========================================================================
     *  A ASSERÇÃO QUE IMPORTA: O TOKEN NÃO APARECE NA URL.
     *
     *  Não basta conferir que `access_token` não está na querystring — um
     *  cliente que passasse o token com outro nome de parâmetro passaria essa
     *  conferência. A busca é pelo VALOR.
     * ==========================================================================
     */
    expect(c.url).not.toContain(TOKEN);
    expect(c.url).not.toContain("access_token");
    expect(c.url).toBe("https://graph.facebook.com/v26.0/me?fields=id%2Cname");
  });

  it("nem no que vai para o log de integração", async () => {
    respostas.push({ status: 200, corpo: { id: "1" } });

    await cliente().obter("17841400000000099", { fields: "id,username" }, "testar");

    expect(logs).toHaveLength(1);
    const log = logs[0]!;

    // `caminhoParaLog` guarda as CHAVES da querystring e descarta os valores:
    // `fields` é útil para depurar, e o id do anúncio não precisa ir para o log.
    expect(log.caminho).toBe("/v26.0/17841400000000099");
    expect(log.caminho).not.toContain(TOKEN);
    expect(log.operacao).toBe("testar");
    expect(log.integracao).toBe("meta_instagram");
    expect(log.organizationId).toBe(ORG);
  });
});

describe("o erro que vem dentro de um 200", () => {
  it("é tratado como FALHA, e não como sucesso vazio", async () => {
    /*
     * A Graph faz isto em chamadas em lote e em alguns endpoints de leitura.
     * `ok: true` aqui entregaria `{ error: {...} }` para quem chamou, e o
     * `campo(dados, "field_data")` devolveria `null` — o lead chegaria sem
     * telefone, sem nenhum erro registrado em lugar nenhum.
     */
    respostas.push({
      status: 200,
      corpo: {
        error: {
          message: "(#190) Error validating access token: Session has expired",
          type: "OAuthException",
          code: 190,
        },
      },
    });

    const r = await cliente().obter("me");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.classe).toBe("permanente");
    expect(r.erro.exigeReconexao).toBe(true);
  });

  it("um 200 com `data` de verdade continua sendo sucesso", async () => {
    respostas.push({ status: 200, corpo: { data: [{ id: "1" }] } });

    const r = await cliente().obter<{ data: unknown[] }>("me/conversations");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dados.data).toHaveLength(1);
  });

  it("um 429 vira transitória com espera, e não permanente", async () => {
    respostas.push({
      status: 429,
      corpo: { error: { message: "rate limited", code: 4, type: "OAuthException" } },
    });

    const r = await cliente().obter("me");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.classe).toBe("transitoria");
    expect(r.erro.esperarMs).toBeGreaterThan(0);
  });
});

describe("a escrita", () => {
  it("NUNCA pede retentativa ao HTTP — nem o GET, nem o POST", async () => {
    respostas.push({ status: 200, corpo: { message_id: "mid-1" } });
    respostas.push({ status: 200, corpo: { id: "1" } });

    await cliente().postar("me/messages", { recipient: { id: "x" } });
    await cliente().obter("me");

    // `repetirEscrita: false` é passado nos dois. Ver o cabeçalho de `postar`:
    // retentativa no nível do HTTP não passa pela chave de dedupe, porque
    // acontece DENTRO da mesma chamada.
    expect(chamadas.map((c) => c.repetirEscrita)).toEqual([false, false]);
  });

  it("o POST leva o corpo e o método certos", async () => {
    respostas.push({ status: 200, corpo: { message_id: "mid-1" } });

    await cliente().postar("me/messages", { recipient: { id: "x" }, message: { text: "oi" } });

    const c = chamadas[0]!;
    expect(c.metodo).toBe("POST");
    expect(c.corpo).toEqual({ recipient: { id: "x" }, message: { text: "oi" } });
    // Sem querystring: o corpo é JSON, e nada do payload vai para a URL.
    expect(c.url).toBe("https://graph.facebook.com/v26.0/me/messages");
  });

  it("uma falha de rede vira INCERTA, e a incerteza é registrada", async () => {
    /*
     * O §35 em uma linha: o POST saiu e a resposta não voltou. Não se sabe se
     * a mensagem foi entregue. `incerta` é o que impede a camada de cima de
     * reenviar — e o que faz a reserva de private reply NÃO ser liberada.
     */
    respostas.push({ lanca: new Error("socket hang up") });

    const r = await cliente().postar("me/messages", { recipient: { id: "x" } });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro.classe).toBe("incerta");

    // E a tentativa aparece no log mesmo tendo lançado: é o `finally`.
    expect(logs).toHaveLength(1);
    expect(logs[0]!.sucesso).toBe(false);
  });
});

describe("o host por tipo de login", () => {
  it("o Instagram Login usa graph.instagram.com", async () => {
    respostas.push({ status: 200, corpo: { id: "1" } });

    await cliente({ login: "instagram" }).obter("me");

    expect(chamadas[0]!.url).toBe("https://graph.instagram.com/v26.0/me");
  });
});

describe("a paginação", () => {
  function pagina(itens: readonly unknown[], cursor: string | null) {
    return {
      status: 200,
      corpo: {
        data: itens,
        ...(cursor === null ? {} : { paging: { cursors: { after: cursor }, next: "https://x" } }),
      },
    };
  }

  it("segue o cursor até a última página e devolve `fechou: true`", async () => {
    respostas.push(pagina([{ id: "1" }, { id: "2" }], "cur-1"));
    respostas.push(pagina([{ id: "3" }], null));

    const r = await cliente().paginar<{ id: string }>("me/conversations", { fields: "id" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens.map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(r.paginas).toBe(2);
    expect(r.fechou).toBe(true);
    expect(r.proximoCursor).toBeNull();

    // O cursor foi para a URL da SEGUNDA chamada, e não da primeira.
    expect(chamadas[0]!.url).not.toContain("after");
    expect(chamadas[1]!.url).toContain("after=cur-1");
  });

  it("o teto de páginas é a REGRA, e o cursor volta para continuar depois", async () => {
    /*
     * O §38 proíbe laço irrestrito na Graph. O efeito de não ter teto é duplo:
     * estoura a cota de 200 chamadas/hora e trava o job por minutos.
     *
     * `fechou: false` com cursor é o desfecho honesto — "leu até aqui, continua
     * daqui". Devolver `fechou: true` faria a reconciliação marcar o recurso
     * como sincronizado com metade dos leads importados.
     */
    respostas.push(pagina([{ id: "1" }], "cur-1"));
    respostas.push(pagina([{ id: "2" }], "cur-2"));
    respostas.push(pagina([{ id: "3" }], "cur-3"));

    const r = await cliente().paginar<{ id: string }>("me/conversations", {}, { maxPaginas: 2 });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(chamadas).toHaveLength(2);
    expect(r.itens).toHaveLength(2);
    expect(r.fechou).toBe(false);
    expect(r.proximoCursor).toBe("cur-2");
  });

  it("o teto tem teto: 50 páginas é o máximo, mesmo pedindo 5.000", async () => {
    for (let i = 0; i < 60; i += 1) respostas.push(pagina([{ id: String(i) }], `cur-${String(i)}`));

    const r = await cliente().paginar("me/conversations", {}, { maxPaginas: 5000 });

    expect(r.ok).toBe(true);
    expect(chamadas).toHaveLength(50);
  });

  it("uma falha na terceira página DEVOLVE as duas boas e o cursor de onde parou", async () => {
    /*
     * Descartar as páginas lidas porque a terceira falhou faria o job recomeçar
     * do zero na volta seguinte — e num 429 isso é garantia de nunca terminar:
     * cada volta gasta cota relendo o que já tinha lido.
     */
    respostas.push(pagina([{ id: "1" }], "cur-1"));
    respostas.push(pagina([{ id: "2" }], "cur-2"));
    respostas.push({ status: 429, corpo: { error: { message: "limite", code: 4 } } });

    const r = await cliente().paginar<{ id: string }>("me/conversations");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.itens.map((i) => i.id)).toEqual(["1", "2"]);
    expect(r.proximoCursor).toBe("cur-2");
    expect(r.erro.classe).toBe("transitoria");
  });

  it("`paging.next` ausente encerra, mesmo com cursor presente", async () => {
    // A Graph devolve `cursors.after` na última página também. Seguir o cursor
    // sem olhar `next` produziria uma chamada a mais por coleção — e, em
    // algumas coleções, um laço que relê a mesma página para sempre.
    respostas.push({
      status: 200,
      corpo: { data: [{ id: "1" }], paging: { cursors: { after: "cur-1" } } },
    });

    const r = await cliente().paginar("me/conversations");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(chamadas).toHaveLength(1);
    expect(r.fechou).toBe(true);
  });
});

describe("o log de integração", () => {
  it("uma chamada por página paginada, e todas com o mesmo nome de operação", async () => {
    // É o que faz a tela de saúde responder "o Lead Ads está chegando e o
    // direct não" — em vez de "a Meta está mais ou menos".
    respostas.push({
      status: 200,
      corpo: { data: [], paging: { cursors: { after: "c" }, next: "https://x" } },
    });
    respostas.push({ status: 200, corpo: { data: [] } });

    await cliente().paginar("me/conversations", {}, { operacao: "sincronizar_conversas" });

    expect(logs).toHaveLength(2);
    expect(logs.every((l) => l.operacao === "sincronizar_conversas")).toBe(true);
  });

  it("sem organização, registra com `null` — é o caminho de diagnóstico", async () => {
    respostas.push({ status: 200, corpo: { id: "1" } });

    await new ClienteDaGraph({
      token: TOKEN,
      organizationId: null,
      integracao: "meta_lead_ads",
    }).obter("me");

    expect(logs[0]!.organizationId).toBeNull();
    expect(logs[0]!.integracao).toBe("meta_lead_ads");
  });
});
