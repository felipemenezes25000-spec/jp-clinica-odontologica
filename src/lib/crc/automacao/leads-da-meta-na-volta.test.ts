/**
 * A reconciliação diária do Lead Ads, dentro da volta pesada — §21, §37.
 *
 * ============================================================================
 *  POR QUE ISTO EXISTE, E POR QUE COMEÇOU ERRADO.
 *
 *  A matriz de aceite registrou "reconciliação automática" como bloqueada pelo
 *  plano da Vercel — que dá dois cron jobs diários, ambos com dono. Era erro de
 *  escopo: a volta pesada JÁ roda uma vez ao dia e JÁ percorre organização por
 *  organização. A reconciliação cabe nela e custa zero slot.
 *
 *  `rodarVoltaPesada` não tem teste — ela toca Dental Office, campanhas e vinte
 *  varreduras. Por isso o pedaço novo saiu para uma função própria e exportada:
 *  um trecho dentro de um laço que ninguém consegue chamar é um trecho que
 *  ninguém consegue provar.
 * ============================================================================
 *
 * ============================================================================
 *  O QUE ELE GUARDA:
 *
 *    TODA CLÍNICA É VISITADA    a conta da Meta é por unidade. Reconciliar só a
 *                               primeira deixaria as outras perdendo lead — e o
 *                               sintoma é o pior possível: silêncio, na unidade
 *                               que ninguém está olhando.
 *
 *    `importados` É ALARME      se a reconciliação trouxe algo, um webhook se
 *                               perdeu. O número tem que chegar ao relatório.
 *
 *    O RELATÓRIO NÃO MENTE      clínica sem conta da Meta não vira linha. Numa
 *                               rede de dez onde duas usam Instagram, oito
 *                               linhas de "não configurado" por dia é o
 *                               relatório que se aprende a não ler.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return {
    ...real,
    registrar: () => undefined,
    auditar: () => Promise.resolve(),
    registrarIntegracao: () => Promise.resolve(),
  };
});

/**
 * A fila de respostas do HTTP falso, em ordem.
 *
 * O CLIENTE DA GRAPH É O REAL — o que é falso é o `fetch`. Assim o teste
 * exercita a montagem da URL, a paginação por cursor e a classificação de erro.
 * Mockar `reconciliarLeadAds` testaria o mock.
 */
type RespostaFalsa = { status: number; corpo: unknown };
const respostas: RespostaFalsa[] = [];
const chamadas: string[] = [];

vi.mock("../servidor/http", async () => {
  const real = await vi.importActual<typeof import("../servidor/http")>("../servidor/http");
  return {
    ...real,
    pedir: (url: string) => {
      chamadas.push(url);
      const r = respostas.shift() ?? { status: 200, corpo: { data: [] } };
      return Promise.resolve({
        status: r.status,
        corpo: r.corpo,
        texto: JSON.stringify(r.corpo),
        cabecalhos: new Headers(),
      });
    },
  };
});

import { cifrar } from "../servidor/segredo";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { reconciliarLeadsDaMeta } from "./volta-pesada";

const ORG = "11111111-1111-4111-8111-111111111111";
const MATRIZ = "22222222-2222-4222-8222-222222222222";
const CENTRO = "24444444-2222-4222-8222-222222222222";

const PAGE_MATRIZ = "104000000000001";
const PAGE_CENTRO = "104000000000002";

const AGORA = new Date("2026-09-15T12:00:00.000Z");

function canal(id: string, clinicId: string, pageId: string): Record<string, unknown> {
  return {
    id,
    organization_id: ORG,
    clinic_id: clinicId,
    provider: "meta",
    produtos: ["lead_ads"],
    page_id: pageId,
    instagram_account_id: null,
    segredo_cifrado: cifrar(`token-de-${id}`),
    ativo: true,
  };
}

/** Uma página de formulários e uma de leads — o que a reconciliação percorre. */
function respostasDeUmaPagina(leads: readonly Record<string, unknown>[]): void {
  respostas.push({ status: 200, corpo: { data: [{ id: "form-1" }] } });
  respostas.push({ status: 200, corpo: { data: leads } });
}

function lead(id: string): Record<string, unknown> {
  return {
    id,
    created_time: "2026-09-15T11:58:00+0000",
    form_id: "form-1",
    ad_id: "ad-9",
    campaign_name: "Implante Setembro",
    platform: "ig",
    field_data: [
      { name: "full_name", values: ["Ana Maria Souza"] },
      { name: "phone_number", values: ["+55 11 99999-0000"] },
    ],
  };
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  respostas.length = 0;
  chamadas.length = 0;
  process.env["CRC_SEGREDO_CHAVE"] = Buffer.alloc(32, 21).toString("base64");
  delete process.env["META_SANDBOX"];

  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_clinics", [
    { id: MATRIZ, organization_id: ORG, slug: "jp-matriz", ativa: true },
    { id: CENTRO, organization_id: ORG, slug: "jp-centro", ativa: true },
  ]);
  semear("crc_opportunity_stages", [
    {
      id: "etapa-1",
      organization_id: ORG,
      chave: "contato_pendente",
      nome: "Contato pendente",
      ordem: 2,
    },
  ]);
});

/* -------------------------------------------------------------------------- */

describe("sem conta da Meta", () => {
  it("não vira linha no relatório, e não chama a Graph", async () => {
    /*
     * O CASO MAIS COMUM, e por isso o mais importante de não poluir: a clínica
     * que não usa Instagram. Se cada volta diária escrevesse "não configurado"
     * para ela, o relatório viraria ruído — e o dia em que a unidade que USA
     * Instagram falhasse, a linha dela estaria no meio das outras.
     */
    const r = await reconciliarLeadsDaMeta(ORG, [MATRIZ, CENTRO]);

    expect(r.leadsDaMetaRecuperados).toBe(0);
    expect(r.porClinica).toEqual({});
    expect(chamadas).toHaveLength(0);
  });

  it("clinicId vazio é ignorado sem explodir", async () => {
    // `String(c["id"] ?? "")` no chamador pode devolver vazio se a linha vier
    // torta. Explodir aqui derrubaria a volta pesada inteira daquela
    // organização — e por uma linha de banco malformada.
    const r = await reconciliarLeadsDaMeta(ORG, ["", MATRIZ]);

    expect(r.porClinica).toEqual({});
  });
});

describe("com conta da Meta", () => {
  it("percorre TODAS as clínicas, e não só a primeira", async () => {
    /*
     * ==========================================================================
     *  A conta da Meta é POR UNIDADE — é isso que o roteamento de entrada usa
     *  para saber de quem é cada lead. Reconciliar só a primeira clínica
     *  deixaria as outras perdendo lead todos os dias, em silêncio.
     * ==========================================================================
     */
    semear("crc_canais_meta", [
      canal("canal-matriz", MATRIZ, PAGE_MATRIZ),
      canal("canal-centro", CENTRO, PAGE_CENTRO),
    ]);

    respostasDeUmaPagina([lead("lead-matriz")]);
    respostasDeUmaPagina([lead("lead-centro")]);

    const r = await reconciliarLeadsDaMeta(ORG, [MATRIZ, CENTRO]);

    expect(r.leadsDaMetaRecuperados).toBe(2);
    expect(Object.keys(r.porClinica).sort()).toEqual([MATRIZ, CENTRO].sort());

    // E cada uma foi buscada pela SUA Página — trocar isso importaria o lead de
    // uma unidade para a ficha da outra.
    expect(chamadas.some((u) => u.includes(PAGE_MATRIZ))).toBe(true);
    expect(chamadas.some((u) => u.includes(PAGE_CENTRO))).toBe(true);
  });

  it("`importados` sobe até o relatório — é alarme, e não estatística", async () => {
    /*
     * Se a reconciliação trouxe lead, um webhook se perdeu: token rotacionado,
     * app desassinado da Página, ou o nosso próprio 500 durante um deploy. Nas
     * três a Meta considera entregue e nunca reenvia.
     *
     * O número no relatório da volta é o que transforma isso em algo que alguém
     * pode ver. Ver `docs/crc/META-RUNBOOK.md`.
     */
    semear("crc_canais_meta", [canal("canal-matriz", MATRIZ, PAGE_MATRIZ)]);
    respostasDeUmaPagina([lead("l-1"), lead("l-2"), lead("l-3")]);

    const r = await reconciliarLeadsDaMeta(ORG, [MATRIZ]);

    expect(r.leadsDaMetaRecuperados).toBe(3);
    expect(r.porClinica[MATRIZ]?.importados).toBe(3);
    expect(conteudo("crc_leads")).toHaveLength(3);
  });

  it("a segunda volta não duplica, e SAI do relatório", async () => {
    /*
     * ==========================================================================
     *  O DESFECHO QUE SE QUER TODO DIA: "vi três, já tinha três, importei zero".
     *
     *  A idempotência é do índice único em `crc_leads.meta_lead_id`. E a
     *  ausência no relatório é o outro lado da moeda: uma linha por dia dizendo
     *  "zero importados" é exatamente o ruído que faz ninguém ler o relatório no
     *  dia em que o número não é zero.
     * ==========================================================================
     */
    semear("crc_canais_meta", [canal("canal-matriz", MATRIZ, PAGE_MATRIZ)]);

    respostasDeUmaPagina([lead("l-1"), lead("l-2")]);
    const primeira = await reconciliarLeadsDaMeta(ORG, [MATRIZ]);
    expect(primeira.leadsDaMetaRecuperados).toBe(2);

    respostasDeUmaPagina([lead("l-1"), lead("l-2")]);
    const segunda = await reconciliarLeadsDaMeta(ORG, [MATRIZ]);

    expect(segunda.leadsDaMetaRecuperados).toBe(0);
    expect(segunda.porClinica).toEqual({});
    expect(conteudo("crc_leads")).toHaveLength(2);
  });

  it("uma clínica que falha não impede a outra, e a falha aparece", async () => {
    /*
     * Mesmo princípio do "engole e segue" da volta pesada, um nível abaixo: a
     * organização com token vencido numa unidade não pode deixar as outras sem
     * reconciliação. E a falha tem que ficar visível — silêncio aqui é
     * indistinguível de "não havia nada para trazer".
     */
    semear("crc_canais_meta", [
      canal("canal-matriz", MATRIZ, PAGE_MATRIZ),
      canal("canal-centro", CENTRO, PAGE_CENTRO),
    ]);

    // A matriz falha na listagem de formulários; o centro vai bem.
    respostas.push({
      status: 400,
      corpo: { error: { message: "(#190) Session has expired", code: 190 } },
    });
    respostasDeUmaPagina([lead("lead-centro")]);

    const r = await reconciliarLeadsDaMeta(ORG, [MATRIZ, CENTRO]);

    expect(r.leadsDaMetaRecuperados).toBe(1);
    expect(r.porClinica[CENTRO]?.importados).toBe(1);
    // A matriz entra no relatório com o motivo, e não desaparece.
    expect(r.porClinica[MATRIZ]).toBeDefined();
    expect(r.porClinica[MATRIZ]?.motivo.length).toBeGreaterThan(0);
  });
});
