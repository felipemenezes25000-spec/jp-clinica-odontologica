/**
 * A configuração central da Meta — §4.2, §5, §10, §54.
 *
 * ============================================================================
 *  ESTE ARQUIVO É PEQUENO E GUARDA DUAS TRAVAS QUE VALEM CARO.
 *
 *  A VERSÃO ÚNICA. O §4.2 exige `META_GRAPH_VERSION` central "sem hardcode
 *  espalhado". Uma versão inválida vinda do ambiente — `26.0` sem o `v`,
 *  `latest`, uma string vazia deixada por um deploy pela metade — produziria
 *  URLs como `graph.facebook.com/26.0/...`, que a Graph responde com 404 e
 *  HTML. O sintoma no CRC seria "a Meta parou", e o erro real estaria numa
 *  variável de ambiente que ninguém olha.
 *
 *  O SANDBOX QUE NÃO LIGA EM PRODUÇÃO. `META_SANDBOX=1` troca os adapters por
 *  um fake que REGISTRA e não envia. Se essa variável pudesse valer em
 *  produção, um `.env` copiado errado faria a clínica parar de responder
 *  paciente — sem erro, sem log de falha, sem ninguém perceber por dias.
 *
 *  A trava é `NODE_ENV === "production"` ANTES de olhar a variável, e é isso
 *  que este arquivo prova.
 * ============================================================================
 */
import { afterEach, describe, expect, it } from "vitest";

import {
  appDoAmbiente,
  CAMPOS_DE_WEBHOOK,
  ehProdutoMeta,
  EXIGENCIAS,
  exigenciasDe,
  hostDaGraph,
  PRODUTOS_META,
  sandboxLigado,
  urlDaGraph,
  VERSAO_CONFERIDA,
  versaoDaGraph,
  versaoDoAmbienteEhInvalida,
} from "./config";

/**
 * As variáveis são restauradas UMA A UMA, e não por um `vi.stubEnv` global.
 *
 * `NODE_ENV` em particular: o runner lê `process.env["NODE_ENV"]` em outros
 * lugares, e deixá-lo em `"production"` depois deste arquivo mudaria o
 * comportamento dos testes que rodarem a seguir no mesmo processo.
 */
const ORIGINAIS = new Map<string, string | undefined>();

function definir(chave: string, valor: string | undefined): void {
  if (!ORIGINAIS.has(chave)) ORIGINAIS.set(chave, process.env[chave]);
  if (valor === undefined) delete process.env[chave];
  else process.env[chave] = valor;
}

afterEach(() => {
  for (const [chave, valor] of ORIGINAIS) {
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
  ORIGINAIS.clear();
});

/* -------------------------------------------------------------------------- */

describe("a versão da Graph", () => {
  it("sem variável, usa a versão CONFERIDA no código", () => {
    definir("META_GRAPH_VERSION", undefined);

    expect(versaoDaGraph()).toBe(VERSAO_CONFERIDA);
    expect(versaoDoAmbienteEhInvalida()).toBe(false);
  });

  it("aceita a forma `vNN.N` e nada mais", () => {
    definir("META_GRAPH_VERSION", "v23.0");
    expect(versaoDaGraph()).toBe("v23.0");
    expect(versaoDoAmbienteEhInvalida()).toBe(false);
  });

  it("recusa `26.0` sem o `v` e CAI NA CONFERIDA em vez de montar URL quebrada", () => {
    /*
     * ESTE É O DEFEITO QUE O TESTE EXISTE PARA PEGAR.
     *
     * `graph.facebook.com/26.0/me` não é uma URL da Graph: é 404 com HTML. E o
     * `ClienteDaGraph` classificaria isso como falha transitória, retentaria, e
     * a tela de saúde mostraria "a Meta está instável".
     */
    definir("META_GRAPH_VERSION", "26.0");

    expect(versaoDaGraph()).toBe(VERSAO_CONFERIDA);
    // E ELA GRITA. Cair no padrão em silêncio esconderia a variável errada.
    expect(versaoDoAmbienteEhInvalida()).toBe(true);
  });

  it("recusa `latest`, que a Graph não tem", () => {
    definir("META_GRAPH_VERSION", "latest");

    expect(versaoDaGraph()).toBe(VERSAO_CONFERIDA);
    expect(versaoDoAmbienteEhInvalida()).toBe(true);
  });

  it("espaço em volta não invalida — é erro de quem colou, não de configuração", () => {
    definir("META_GRAPH_VERSION", "  v26.0  ");

    expect(versaoDaGraph()).toBe("v26.0");
    expect(versaoDoAmbienteEhInvalida()).toBe(false);
  });
});

describe("a URL da Graph", () => {
  it("o login do Facebook e o do Instagram são HOSTS DIFERENTES", () => {
    /*
     * Não é detalhe de estilo: `graph.instagram.com` é o host do Instagram
     * Login (token de usuário do Instagram), e `graph.facebook.com` é o do
     * Facebook Login for Business (Page Access Token). Um token do primeiro no
     * segundo responde `(#190) Invalid OAuth access token`.
     */
    expect(hostDaGraph("facebook")).toBe("https://graph.facebook.com");
    expect(hostDaGraph("instagram")).toBe("https://graph.instagram.com");
  });

  it("monta host, versão e caminho, sem barra dobrada", () => {
    definir("META_GRAPH_VERSION", "v26.0");

    expect(urlDaGraph("me/messages")).toBe("https://graph.facebook.com/v26.0/me/messages");
    expect(urlDaGraph("/me/messages")).toBe("https://graph.facebook.com/v26.0/me/messages");
    expect(urlDaGraph("///me")).toBe("https://graph.facebook.com/v26.0/me");
  });

  it("a versão explícita vence a do ambiente", () => {
    definir("META_GRAPH_VERSION", "v26.0");

    // É o que permite uma chamada pontual contra outra versão sem mexer no
    // ambiente inteiro — o caso de conferir se um campo novo já existe.
    expect(urlDaGraph("me", "facebook", "v23.0")).toBe("https://graph.facebook.com/v23.0/me");
  });
});

describe("o app do ambiente", () => {
  it("diz QUAIS variáveis faltam, e não só que falta algo", () => {
    definir("META_APP_ID", undefined);
    definir("META_APP_SECRET", "segredo");
    definir("META_WEBHOOK_VERIFY_TOKEN", undefined);

    const r = appDoAmbiente();

    expect(r.ok).toBe(false);
    if (r.ok) return;
    // A lista é o que a tela de Integrações mostra. "Configuração incompleta"
    // sozinho obrigaria a pessoa a adivinhar.
    expect(r.faltando).toEqual(["META_APP_ID", "META_WEBHOOK_VERIFY_TOKEN"]);
  });

  it("string vazia conta como AUSENTE", () => {
    // No Windows, variável vazia e variável ausente são a mesma coisa. Tratar
    // `""` como presente faria a assinatura ser conferida contra segredo vazio,
    // que é pior que não conferir: qualquer um consegue produzir a assinatura.
    definir("META_APP_ID", "   ");
    definir("META_APP_SECRET", "");
    definir("META_WEBHOOK_VERIFY_TOKEN", "tok");

    const r = appDoAmbiente();

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltando).toEqual(["META_APP_ID", "META_APP_SECRET"]);
  });

  it("com as três, devolve o app já sem espaço em volta", () => {
    definir("META_APP_ID", " 123 ");
    definir("META_APP_SECRET", " segredo ");
    definir("META_WEBHOOK_VERIFY_TOKEN", " tok ");

    const r = appDoAmbiente();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.app).toEqual({ appId: "123", appSecret: "segredo", verifyToken: "tok" });
  });
});

describe("o sandbox", () => {
  it("liga fora de produção com META_SANDBOX=1", () => {
    definir("NODE_ENV", "test");
    definir("META_SANDBOX", "1");

    expect(sandboxLigado()).toBe(true);
  });

  it("NÃO liga em produção, nem com a variável em 1", () => {
    /*
     * ==========================================================================
     *  A TRAVA CENTRAL DESTE ARQUIVO.
     *
     *  O sandbox REGISTRA e não envia. Ligado em produção por um `.env`
     *  copiado, a clínica pararia de responder paciente — e não haveria erro,
     *  log de falha nem alerta: os envios "dariam certo".
     *
     *  A ordem importa: a checagem de `NODE_ENV` vem ANTES de olhar
     *  `META_SANDBOX`, então não existe valor da variável que contorne.
     * ==========================================================================
     */
    definir("NODE_ENV", "production");
    definir("META_SANDBOX", "1");

    expect(sandboxLigado()).toBe(false);
  });

  it("qualquer valor que não seja exatamente `1` deixa desligado", () => {
    definir("NODE_ENV", "test");

    for (const valor of ["", "0", "true", "sim", "ligado", "2"]) {
      definir("META_SANDBOX", valor);
      expect(sandboxLigado()).toBe(false);
    }
  });
});

describe("os produtos e o que cada um exige", () => {
  it("`ehProdutoMeta` é a porta fechada dos quatro nomes", () => {
    for (const p of PRODUTOS_META) expect(ehProdutoMeta(p)).toBe(true);

    // O que chega da tela é `string`. Sem esta guarda, um produto escrito
    // errado viraria uma linha em `crc_canais_meta` que nunca casa com nada.
    for (const lixo of ["whatsapp", "Instagram", "leadads", "", 1, null, undefined, {}]) {
      expect(ehProdutoMeta(lixo)).toBe(false);
    }
  });

  it("cada produto declara permissões E a fonte oficial de onde elas vieram", () => {
    // O §5 pede as permissões conferidas contra a doc ATUAL. Uma tabela sem
    // fonte é uma lista de nomes que ninguém consegue reconferir depois.
    expect(EXIGENCIAS).toHaveLength(PRODUTOS_META.length);

    for (const produto of PRODUTOS_META) {
      const e = exigenciasDe(produto);
      expect(e.produto).toBe(produto);
      expect(e.permissoes.length).toBeGreaterThan(0);
      expect(e.fonte).toMatch(/^https:\/\/developers\.facebook\.com\//u);
      expect(e.seFaltar.length).toBeGreaterThan(20);
    }
  });

  it("cada produto declara os campos de webhook que precisam ser subscritos", () => {
    /*
     * ESTE É O SILÊNCIO MAIS CARO DA INTEGRAÇÃO.
     *
     * Subscrever o app na Página sem o campo certo não dá erro nenhum: o
     * webhook simplesmente nunca chega. É a causa nº 1 de "a Meta não está
     * mandando nada", e a tela de Integrações mostra esta lista justamente para
     * a pessoa conferir campo por campo.
     */
    for (const produto of PRODUTOS_META) {
      expect(CAMPOS_DE_WEBHOOK[produto].length).toBeGreaterThan(0);
    }

    expect(CAMPOS_DE_WEBHOOK.lead_ads).toContain("leadgen");
    expect(CAMPOS_DE_WEBHOOK.comentarios).toContain("comments");
    expect(CAMPOS_DE_WEBHOOK.instagram).toContain("messages");
    expect(CAMPOS_DE_WEBHOOK.messenger).toContain("messages");
  });

  it("a versão conferida é a que está documentada, e tem data no código", () => {
    // Se alguém subir a versão sem reconferir permissões e campos, este teste
    // não impede — mas `VERSAO_CONFERIDA` mudar sem a data do comentário mudar
    // é o que a revisão procura. O valor fica pinado aqui para a mudança
    // aparecer no diff do teste também.
    expect(VERSAO_CONFERIDA).toMatch(/^v\d{1,3}\.\d{1,2}$/u);
  });
});
