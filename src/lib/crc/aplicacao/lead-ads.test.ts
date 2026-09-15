/**
 * Meta Lead Ads — §18, §19, §21, §34, §37, §52, §53.
 *
 * ============================================================================
 *  O INVARIANTE QUE MAIS VALE DINHEIRO: **NENHUM LEAD É PERDIDO.**
 *
 *  O custo de perder um lead de Lead Ads não é uma mensagem: é o valor pago
 *  pelo clique mais o tratamento que não aconteceu. E o webhook falha em
 *  silêncio de três formas — token rotacionado, app desassinado da Página, e o
 *  nosso próprio 500 durante um deploy. Nos três, a Meta considera entregue (ou
 *  desiste) e NUNCA reenvia.
 *
 *  Por isso a ordem é `persistir leadgen_id → buscar na Graph`, e por isso
 *  existe reconciliação. Os dois são testados aqui.
 * ============================================================================
 *
 * ============================================================================
 *  A CAMADA HTTP É FALSA, E O CLIENTE É REAL.
 *
 *  `vi.mock` substitui `servidor/http`, e não `integracoes/meta/cliente`. Com
 *  isso o teste exercita o cliente de verdade: a montagem da URL com a versão
 *  da Graph, a classificação de erro do `erros.ts`, e a paginação por cursor.
 *
 *  Mockar o cliente testaria o mock.
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
 * A fila de respostas que o HTTP falso devolve, em ordem.
 *
 * UMA FILA, e não um mapa por URL: a ORDEM das chamadas é parte do que se
 * testa. `listar formulários → listar leads` invertido produziria outro
 * comportamento, e um mapa por URL esconderia a inversão.
 */
type RespostaFalsa = { status: number; corpo: unknown };
const respostas: RespostaFalsa[] = [];
const chamadas: { url: string; metodo: string }[] = [];

vi.mock("../servidor/http", async () => {
  const real = await vi.importActual<typeof import("../servidor/http")>("../servidor/http");
  return {
    ...real,
    pedir: (url: string, opcoes: { metodo?: string } = {}) => {
      chamadas.push({ url, metodo: opcoes.metodo ?? "GET" });
      const r = respostas.shift();
      if (r === undefined) {
        return Promise.resolve({
          status: 200,
          corpo: {},
          texto: "{}",
          cabecalhos: new Headers(),
        });
      }
      return Promise.resolve({
        status: r.status,
        corpo: r.corpo,
        texto: JSON.stringify(r.corpo),
        cabecalhos: new Headers(),
      });
    },
  };
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { cifrar } from "../servidor/segredo";
import type { EventoLead } from "../integracoes/meta/tipos";

import { importarLeadDaMeta, reconciliarLeadAds, RECURSO_LEAD_ADS } from "./lead-ads";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const PAGE = "104000000000001";
const AGORA = new Date("2026-09-15T12:00:00.000Z");
const ESCOPO = { organizationId: ORG, clinicId: CLINICA };

function evento(p: Partial<EventoLead> = {}): EventoLead {
  return {
    tipo: "meta.lead.created",
    idExterno: "lead-777",
    contaExterna: PAGE,
    ocorridoEm: AGORA.toISOString(),
    leadgenId: "lead-777",
    formId: "form-1",
    pageId: PAGE,
    adId: "ad-9",
    adgroupId: "ad-9",
    ...p,
  };
}

const LEAD_COMPLETO = {
  id: "lead-777",
  created_time: "2026-09-15T11:58:00+0000",
  form_id: "form-1",
  ad_id: "ad-9",
  ad_name: "Implante — vídeo 15s",
  adset_id: "adset-3",
  adset_name: "Implante · 35-55",
  campaign_id: "camp-1",
  campaign_name: "Implante Setembro",
  platform: "ig",
  field_data: [
    { name: "full_name", values: ["Ana Maria Souza"] },
    { name: "phone_number", values: ["+55 11 99999-0000"] },
    { name: "email", values: ["ana@exemplo.com"] },
    { name: "O que você procura?", values: ["Implante"] },
  ],
};

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  respostas.length = 0;
  chamadas.length = 0;

  // A CIFRA PRECISA DE CHAVE: o token do canal é gravado cifrado, e sem ela
  // `canalMetaDaClinica` recusa — que é o comportamento certo em produção.
  process.env["CRC_SEGREDO_CHAVE"] = Buffer.alloc(32, 7).toString("base64");

  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, slug: "jp", ativa: true }]);
  semear("crc_opportunity_stages", [
    {
      id: "etapa-1",
      organization_id: ORG,
      chave: "contato_pendente",
      nome: "Contato pendente",
      ordem: 2,
    },
  ]);
  semear("crc_canais_meta", [
    {
      id: "canal-a",
      organization_id: ORG,
      clinic_id: CLINICA,
      provider: "meta",
      produtos: ["lead_ads"],
      page_id: PAGE,
      instagram_account_id: null,
      segredo_cifrado: cifrar("token-de-pagina"),
      ativo: true,
    },
  ]);
});

/* -------------------------------------------------------------------------- */
/* 1. O caminho feliz                                                         */
/* -------------------------------------------------------------------------- */

describe("o lead do Instant Form entra no funil", () => {
  it("grava lead com a hierarquia de anúncio inteira — §9.3, §19", async () => {
    respostas.push({ status: 200, corpo: LEAD_COMPLETO });

    const r = await importarLeadDaMeta(ESCOPO, evento());
    expect(r.duplicado).toBe(false);
    expect(r.leadId).not.toBeNull();

    const lead = conteudo("crc_leads")[0]!;
    expect(lead["nome"]).toBe("Ana Maria Souza");
    // O TELEFONE É NORMALIZADO: `+55 11 99999-0000` → E.164 sem '+'.
    expect(lead["telefone"]).toBe("5511999990000");
    expect(lead["email"]).toBe("ana@exemplo.com");

    /*
     * É ESTA HIERARQUIA que responde a pergunta do §83 — "veio de qual
     * campanha, e quanto custou". Sem ela, "veio do Instagram" é tudo o que se
     * pode dizer.
     */
    expect(lead["meta_lead_id"]).toBe("lead-777");
    expect(lead["campaign_id"]).toBe("camp-1");
    expect(lead["campaign_nome"]).toBe("Implante Setembro");
    expect(lead["adset_nome"]).toBe("Implante · 35-55");
    expect(lead["ad_nome"]).toBe("Implante — vídeo 15s");
    expect(lead["form_id"]).toBe("form-1");
    expect(lead["plataforma"]).toBe("ig");
  });

  it("a ORIGEM é a plataforma, e é o canal de AQUISIÇÃO — §69", async () => {
    respostas.push({ status: 200, corpo: LEAD_COMPLETO });
    await importarLeadDaMeta(ESCOPO, evento());

    const lead = conteudo("crc_leads")[0]!;
    expect(lead["origem"]).toBe("INSTAGRAM");
    /*
     * `canal_conversao` NASCE VAZIO: ele é preenchido quando a conversa
     * continua em outro canal. Sem os dois separados, todo relatório credita o
     * WhatsApp e a conclusão é "corta o Instagram" — no mês seguinte ninguém
     * chega ao WhatsApp.
     */
    expect(lead["canal_conversao"] ?? null).toBeNull();
  });

  it("o interesse declarado entra em `campos`, e não como tipo de oportunidade", async () => {
    respostas.push({ status: 200, corpo: LEAD_COMPLETO });
    await importarLeadDaMeta(ESCOPO, evento());

    const campos = conteudo("crc_leads")[0]?.["campos"] as Record<string, unknown>;
    expect(campos["interesse"]).toBe("IMPLANTE");
    // A pergunta do formulário é guardada com o nome ORIGINAL — §18.2.
    expect(campos["O que você procura?"]).toBe("Implante");

    const op = conteudo("crc_opportunities")[0]!;
    // `NEW_LEAD`: a divergência do §20 está explicada em `lead-ads.ts`.
    expect(op["tipo"]).toBe("NEW_LEAD");
    expect(op["origem"]).toBe("meta_lead_ads");
    expect(String(op["motivo"])).toContain("IMPLANTE");
    expect(String(op["motivo"])).toContain("Implante Setembro");
  });

  it("o relógio do speed-to-lead é o do FORMULÁRIO — §21, §49", async () => {
    respostas.push({ status: 200, corpo: LEAD_COMPLETO });
    await importarLeadDaMeta(ESCOPO, evento());

    /*
     * ==========================================================================
     *  MEDIR POR `criado_em` MOSTRARIA "respondido em 12 segundos" para um lead
     *  que a reconciliação importou 14 horas depois de a pessoa preencher.
     *
     *  O §21 mede o tempo que a PESSOA esperou.
     * ==========================================================================
     */
    expect(conteudo("crc_leads")[0]?.["externo_criado_em"]).toBe("2026-09-15T11:58:00.000Z");
  });

  it("registra o toque de atribuição CONFIRMADO — §19, §41", async () => {
    respostas.push({ status: 200, corpo: LEAD_COMPLETO });
    await importarLeadDaMeta(ESCOPO, evento());

    const toques = conteudo("crc_attribution_events");
    expect(toques).toHaveLength(1);
    expect(toques[0]?.["elo"]).toBe("ACAO");
    expect(toques[0]?.["canal"]).toBe("instagram");
    expect(toques[0]?.["origem"]).toBe("Implante Setembro");
    /*
     * `CONFIRMADO` É HONESTO AQUI, ao contrário de quase todo lugar: a pessoa
     * preencheu um formulário DENTRO do anúncio. Não há inferência entre o
     * anúncio e o lead.
     */
    expect(toques[0]?.["confianca"]).toBe("CONFIRMADO");
  });

  it("emite `lead.created` com o relógio do formulário", async () => {
    respostas.push({ status: 200, corpo: LEAD_COMPLETO });
    await importarLeadDaMeta(ESCOPO, evento());

    const e = conteudo("crc_events").find((x) => x["tipo"] === "lead.created");
    expect(e).toBeDefined();
    expect(e?.["ocorrido_em"]).toBe("2026-09-15T11:58:00.000Z");
  });

  it("a Graph é chamada com `fields` explícito e a versão na URL", async () => {
    respostas.push({ status: 200, corpo: LEAD_COMPLETO });
    await importarLeadDaMeta(ESCOPO, evento());

    expect(chamadas).toHaveLength(1);
    /*
     * PEDIR `fields` EXPLICITAMENTE é o que faz a integração sobreviver a um
     * upgrade de versão: sem ele, a Graph devolve um subconjunto mínimo que
     * MUDA entre versões, e `campaign_name` desapareceria sem erro nenhum.
     */
    expect(chamadas[0]?.url).toContain("fields=");
    expect(chamadas[0]?.url).toContain("field_data");
    expect(chamadas[0]?.url).toMatch(/graph\.facebook\.com\/v\d+\.\d+\//u);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. A idempotência — §34                                                    */
/* -------------------------------------------------------------------------- */

describe("o mesmo `leadgen_id` NUNCA vira dois leads", () => {
  it("o segundo webhook é duplicado, e não chama a Graph de novo", async () => {
    respostas.push({ status: 200, corpo: LEAD_COMPLETO });
    await importarLeadDaMeta(ESCOPO, evento());
    expect(chamadas).toHaveLength(1);

    const segundo = await importarLeadDaMeta(ESCOPO, evento());
    expect(segundo.duplicado).toBe(true);
    expect(conteudo("crc_leads")).toHaveLength(1);
    /*
     * A CHECAGEM VEM ANTES DA CHAMADA, e economiza cota: a Graph permite 200
     * chamadas/hora por usuário, e reentrega de webhook é comum.
     */
    expect(chamadas).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. A Graph fora do ar — o lead NÃO é perdido                               */
/* -------------------------------------------------------------------------- */

describe("a Graph indisponível NÃO perde o lead — §18", () => {
  it("o lead entra com o `leadgen_id` e um nome provisório", async () => {
    /*
     * ==========================================================================
     *  A ORDEM É O §18 LITERAL: `persistir leadgen_id → buscar na Graph`.
     *
     *  Chamar a Graph primeiro e gravar depois perderia o lead junto com a
     *  falha — e ele nunca seria recuperado, porque o webhook não volta.
     *
     *  É feio na tela por alguns minutos, e é a diferença entre um lead
     *  atrasado e um lead perdido.
     * ==========================================================================
     */
    respostas.push({ status: 401, corpo: { error: { code: 190, message: "expired" } } });

    const r = await importarLeadDaMeta(ESCOPO, evento());
    expect(r.duplicado).toBe(false);
    expect(r.leadId).not.toBeNull();

    const lead = conteudo("crc_leads")[0]!;
    expect(lead["meta_lead_id"]).toBe("lead-777");
    expect(String(lead["nome"])).toContain("aguardando dados");
    // O ESTADO É DITO NO DADO, e não só no log: a tela mostra "incompleto".
    expect((lead["campos"] as Record<string, unknown>)["detalhes_pendentes"]).toBe("true");

    // O IDENTIFICADOR DO WEBHOOK é preservado para a reconciliação completar.
    expect(lead["form_id"]).toBe("form-1");
    expect(lead["ad_id"]).toBe("ad-9");
    expect(lead["page_id"]).toBe(PAGE);
  });

  it("a oportunidade é criada mesmo com o lead incompleto", async () => {
    respostas.push({ status: 500, corpo: {} });
    await importarLeadDaMeta(ESCOPO, evento());
    // SEM A OPORTUNIDADE, o lead não aparece na fila de ninguém — e o
    // speed-to-lead começa a contar sem ter para quem.
    expect(conteudo("crc_opportunities")).toHaveLength(1);
  });

  it("sem token de envio, o lead ainda entra", async () => {
    const canal = conteudo("crc_canais_meta")[0];
    if (canal !== undefined) canal["segredo_cifrado"] = null;

    const r = await importarLeadDaMeta(ESCOPO, evento());
    expect(r.leadId).not.toBeNull();
    // NENHUMA chamada foi feita: não havia com o que chamar.
    expect(chamadas).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. O telefone inválido — §52                                               */
/* -------------------------------------------------------------------------- */

describe("telefone inválido não descarta o lead", () => {
  it("a coluna fica nula e o valor cru é guardado", async () => {
    /*
     * ==========================================================================
     *  AS DUAS ALTERNATIVAS SÃO PIORES:
     *
     *    RECUSAR O LEAD   a pessoa preencheu, a clínica pagou pelo clique, e o
     *                     e-mail muitas vezes está certo.
     *
     *    GRAVAR CRU       um "11 9999" na coluna de telefone entra na busca por
     *                     telefone e casa com qualquer cadastro truncado — é o
     *                     que `normalizar()` de `dominio/identidade.ts` recusa.
     * ==========================================================================
     */
    respostas.push({
      status: 200,
      corpo: {
        ...LEAD_COMPLETO,
        field_data: [
          { name: "full_name", values: ["Ana"] },
          { name: "phone_number", values: ["9999"] },
          { name: "email", values: ["ana@exemplo.com"] },
        ],
      },
    });

    await importarLeadDaMeta(ESCOPO, evento());

    const lead = conteudo("crc_leads")[0]!;
    expect(lead["telefone"] ?? null).toBeNull();
    expect(lead["email"]).toBe("ana@exemplo.com");
    expect((lead["campos"] as Record<string, unknown>)["telefone_cru"]).toBe("9999");
  });

  it("formulário sem contato nenhum ainda grava o lead", async () => {
    /*
     * `registrarLead` em `leads.ts` recusa lead sem telefone e sem e-mail — e
     * está certa para o formulário do site. Aqui é diferente: o `leadgen_id`
     * existe, e ele é o que permite buscar os dados depois. Descartar seria
     * perder o rastro de um clique pago.
     */
    respostas.push({ status: 200, corpo: { ...LEAD_COMPLETO, field_data: [] } });

    const r = await importarLeadDaMeta(ESCOPO, evento());
    expect(r.leadId).not.toBeNull();
    expect(conteudo("crc_leads")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. A reconciliação — §18.1, §37                                            */
/* -------------------------------------------------------------------------- */

describe("a reconciliação recupera o lead que o webhook não trouxe", () => {
  it("importa o que falta e grava o cursor", async () => {
    // 1ª chamada: os formulários da Página.
    respostas.push({
      status: 200,
      corpo: { data: [{ id: "form-1", name: "Avaliação de Implante" }], paging: {} },
    });
    // 2ª chamada: os leads daquele formulário, com os detalhes JÁ dentro.
    respostas.push({ status: 200, corpo: { data: [LEAD_COMPLETO], paging: {} } });

    const r = await reconciliarLeadAds(ESCOPO);

    expect(r.vistos).toBe(1);
    expect(r.importados).toBe(1);
    expect(r.falhas).toBe(0);
    expect(conteudo("crc_leads")).toHaveLength(1);
    expect(conteudo("crc_leads")[0]?.["campaign_nome"]).toBe("Implante Setembro");

    /*
     * O CURSOR É O `created_time` MAIS NOVO LIDO, e ele só avança em sucesso —
     * a mesma disciplina de `gravarCursor` em `sincronizacao.ts`. Avançar
     * depois de falha parcial pularia justamente os leads que não entraram.
     */
    const estado = conteudo("crc_sync_state").find((s) => s["recurso"] === RECURSO_LEAD_ADS);
    expect(estado?.["sync_status"]).toBe("OK");
    // O CURSOR É ISO, e não o formato cru da Graph: ele é comparado como
    // STRING entre voltas, e misturar formatos o faria andar para trás.
    expect(estado?.["cursor"]).toBe("2026-09-15T11:58:00.000Z");
  });

  it("os detalhes vêm da LISTAGEM, e não de uma chamada por lead", async () => {
    /*
     * ECONOMIA DE COTA, e não atalho: `GET /{form_id}/leads?fields=…` devolve o
     * `field_data` inteiro. Chamar `GET /{leadgen_id}` por lead gastaria
     * cinquenta chamadas para cinquenta leads — e a cota é por hora.
     */
    respostas.push({ status: 200, corpo: { data: [{ id: "form-1" }], paging: {} } });
    respostas.push({
      status: 200,
      corpo: {
        data: [LEAD_COMPLETO, { ...LEAD_COMPLETO, id: "lead-778" }],
        paging: {},
      },
    });

    await reconciliarLeadAds(ESCOPO);

    expect(conteudo("crc_leads")).toHaveLength(2);
    // DUAS chamadas no total: formulários + leads. Nenhuma por lead.
    expect(chamadas).toHaveLength(2);
  });

  it("o lead que JÁ existe não é recriado", async () => {
    respostas.push({ status: 200, corpo: LEAD_COMPLETO });
    await importarLeadDaMeta(ESCOPO, evento());

    respostas.push({ status: 200, corpo: { data: [{ id: "form-1" }], paging: {} } });
    respostas.push({ status: 200, corpo: { data: [LEAD_COMPLETO], paging: {} } });

    const r = await reconciliarLeadAds(ESCOPO);

    expect(r.jaExistiam).toBe(1);
    expect(r.importados).toBe(0);
    expect(conteudo("crc_leads")).toHaveLength(1);
  });

  it("`importados` maior que zero é ALARME, e não vitória", async () => {
    /*
     * ==========================================================================
     *  ELE DEVERIA SER ZERO: o webhook deveria ter trazido tudo.
     *
     *  Quando sobe, é sinal de que o webhook está falhando — é o
     *  `meta_lead_reconciliation_missing` do §61. A frase do resultado diz isso
     *  em vez de comemorar.
     * ==========================================================================
     */
    respostas.push({ status: 200, corpo: { data: [{ id: "form-1" }], paging: {} } });
    respostas.push({ status: 200, corpo: { data: [LEAD_COMPLETO], paging: {} } });

    const r = await reconciliarLeadAds(ESCOPO);
    expect(r.motivo).toContain("recuperados");
  });

  it("429 na listagem NÃO avança o cursor", async () => {
    respostas.push({ status: 200, corpo: { data: [{ id: "form-1" }], paging: {} } });
    respostas.push({ status: 429, corpo: { error: { code: 4, message: "limit" } } });

    const r = await reconciliarLeadAds(ESCOPO);

    expect(r.falhas).toBeGreaterThan(0);
    const estado = conteudo("crc_sync_state").find((s) => s["recurso"] === RECURSO_LEAD_ADS);
    expect(estado?.["sync_status"]).toBe("FALHOU");
    // SEM CURSOR: a próxima volta relê o mesmo período em vez de pular leads.
    expect(estado?.["cursor"] ?? null).toBeNull();
  });

  it("a falha nos FORMULÁRIOS encerra a volta com motivo", async () => {
    respostas.push({ status: 401, corpo: { error: { code: 190, message: "expired" } } });

    const r = await reconciliarLeadAds(ESCOPO);

    expect(r.importados).toBe(0);
    expect(r.motivo).toContain("#190");
    // A AÇÃO ENTRA NO MOTIVO: "reconectar" é o que resolve, e o operador
    // precisa ler isso na tela.
    expect(r.motivo).toContain("reconectar");
  });

  it("sem canal de Lead Ads, a reconciliação diz o que falta", async () => {
    const canal = conteudo("crc_canais_meta")[0];
    if (canal !== undefined) canal["produtos"] = ["instagram"];

    const r = await reconciliarLeadAds(ESCOPO);

    expect(r.importados).toBe(0);
    expect(r.motivo.length).toBeGreaterThan(20);
    expect(chamadas).toHaveLength(0);
  });

  it("a página que não fechou devolve `fechou: false` e o cursor", async () => {
    /*
     * `fechou: true` com metade dos leads importados faria a reconciliação
     * marcar o recurso como sincronizado — e a outra metade nunca chegaria.
     */
    respostas.push({ status: 200, corpo: { data: [{ id: "form-1" }], paging: {} } });
    respostas.push({
      status: 200,
      corpo: {
        data: [LEAD_COMPLETO],
        paging: { next: "https://graph.facebook.com/proxima", cursors: { after: "cursor-2" } },
      },
    });
    // O teto de páginas é 3 por padrão: a 2ª e a 3ª leitura também respondem.
    respostas.push({
      status: 200,
      corpo: {
        data: [{ ...LEAD_COMPLETO, id: "lead-779" }],
        paging: { next: "https://graph.facebook.com/proxima", cursors: { after: "cursor-3" } },
      },
    });
    respostas.push({
      status: 200,
      corpo: {
        data: [{ ...LEAD_COMPLETO, id: "lead-780" }],
        paging: { next: "https://graph.facebook.com/proxima", cursors: { after: "cursor-4" } },
      },
    });

    const r = await reconciliarLeadAds(ESCOPO);

    expect(r.fechou).toBe(false);
    expect(r.motivo).toContain("próxima volta");
    expect(conteudo("crc_leads")).toHaveLength(3);
  });
});
