/**
 * O backfill de conversas — §13, §48, §37, §53.
 *
 * ============================================================================
 *  O §48 CARREGA A REGRA MAIS FÁCIL DE ERRAR DE TODO O PROMPT:
 *
 *      "Backfill não pode mandar 'Oi, vi sua mensagem' para conversa de seis
 *       meses atrás."
 *
 *  E o caminho para errar é curto. `receberMensagemDoCanal` faz três coisas
 *  além de gravar: incrementa `nao_lidas`, reabre conversa resolvida, e emite
 *  `message.received` — que é o gatilho da IA e do motor de automação.
 *
 *  Importar seis meses de histórico por esse caminho produziria centenas de
 *  eventos com data antiga, e o motor responderia a TODOS: para ele, um evento
 *  é um evento. Trezentas pessoas receberiam "vi sua mensagem" sobre uma
 *  conversa que elas esqueceram.
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

type RespostaFalsa = { status: number; corpo: unknown };
const respostas: RespostaFalsa[] = [];
const chamadas: string[] = [];

vi.mock("../servidor/http", async () => {
  const real = await vi.importActual<typeof import("../servidor/http")>("../servidor/http");
  return {
    ...real,
    pedir: (url: string) => {
      chamadas.push(url);
      const r = respostas.shift() ?? { status: 200, corpo: {} };
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

import { importarHistoricoDaMeta, recursoDoHistorico } from "./meta-historico";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const PAGE = "104000000000001";
const IGID = "17841400000000099";
const IGSID = "17841400000000001";
const AGORA = new Date("2026-09-15T12:00:00.000Z");
const ESCOPO = { organizationId: ORG, clinicId: CLINICA };

/** Seis meses atrás — a conversa que ninguém quer acordar. */
const SEIS_MESES = "2026-03-15T09:00:00+0000";

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  respostas.length = 0;
  chamadas.length = 0;
  process.env["CRC_SEGREDO_CHAVE"] = Buffer.alloc(32, 9).toString("base64");

  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_clinics", [{ id: CLINICA, organization_id: ORG, slug: "jp", ativa: true }]);
  semear("crc_canais_meta", [
    {
      id: "canal-a",
      organization_id: ORG,
      clinic_id: CLINICA,
      provider: "meta",
      produtos: ["instagram", "messenger"],
      page_id: PAGE,
      instagram_account_id: IGID,
      segredo_cifrado: cifrar("token-de-pagina"),
      ativo: true,
    },
  ]);
});

/** Uma thread com uma mensagem da pessoa e uma resposta da clínica. */
function thread(p: { texto?: string; quando?: string } = {}) {
  return {
    id: "thread-1",
    messages: {
      data: [
        // A GRAPH DEVOLVE DO MAIS NOVO PARA O MAIS ANTIGO. O importador inverte.
        {
          id: "m.resposta",
          created_time: p.quando ?? SEIS_MESES,
          from: { id: IGID, username: "jpclinica" },
          to: { data: [{ id: IGSID }] },
          message: "Bom dia! Pode vir às 14h?",
        },
        {
          id: "m.pergunta",
          created_time: p.quando ?? SEIS_MESES,
          from: { id: IGSID, username: "joao_ig" },
          to: { data: [{ id: IGID }] },
          message: p.texto ?? "tem horário hoje?",
        },
      ],
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 1. O §48 — o backfill não acorda a automação                                */
/* -------------------------------------------------------------------------- */

describe("o backfill importa o histórico e NÃO dispara nada", () => {
  beforeEach(() => {
    respostas.push({ status: 200, corpo: { data: [{ id: "thread-1" }], paging: {} } });
    respostas.push({ status: 200, corpo: thread() });
  });

  it("importa as mensagens e marca `historico_importado`", async () => {
    const r = await importarHistoricoDaMeta(ESCOPO, "instagram");

    expect(r.conversas).toBe(1);
    expect(r.mensagens).toBe(2);
    expect(r.falhas).toBe(0);

    const mensagens = conteudo("crc_messages");
    expect(mensagens).toHaveLength(2);
    /*
     * A FLAG É O QUE IMPEDE. Sem ela, o backfill precisaria de um SEGUNDO
     * caminho de gravação — e um segundo caminho é uma segunda chance de
     * divergir do primeiro.
     */
    expect(mensagens.every((m) => m["historico_importado"] === true)).toBe(true);
  });

  it("o backfill NÃO emite `message.received`", async () => {
    /*
     * ==========================================================================
     *  ESTE É O TESTE DO §48, e é o alvo do script de injeção de defeito.
     *
     *  `crc_events` é o gatilho da IA e do motor de automação. Trezentos eventos
     *  `message.received` com data antiga fariam o motor responder a todos.
     * ==========================================================================
     */
    await importarHistoricoDaMeta(ESCOPO, "instagram");

    const eventos = conteudo("crc_events").filter((e) => e["tipo"] === "message.received");
    expect(eventos).toHaveLength(0);
  });

  it("o backfill NÃO incrementa não lidas", async () => {
    await importarHistoricoDaMeta(ESCOPO, "instagram");
    // Seis meses de histórico importado não é "300 mensagens novas esperando".
    expect(Number(conteudo("crc_conversations")[0]?.["nao_lidas"] ?? 0)).toBe(0);
  });

  it("o backfill NÃO reabre conversa resolvida", async () => {
    semear("crc_conversations", [
      {
        id: "conversa-resolvida",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: null,
        canal: "instagram",
        contato_externo: IGSID,
        status: "RESOLVIDA",
        revisao_pendente: false,
      },
    ]);

    await importarHistoricoDaMeta(ESCOPO, "instagram");

    // UMA CONVERSA RESOLVIDA NÃO VOLTA A ABRIR porque importamos o histórico
    // dela.
    expect(conteudo("crc_conversations")[0]?.["status"]).toBe("RESOLVIDA");
  });

  it("a data gravada é a da MENSAGEM, e não a de hoje", async () => {
    await importarHistoricoDaMeta(ESCOPO, "instagram");

    const m = conteudo("crc_messages")[0];
    expect(String(m?.["criado_em"]).startsWith("2026-03-15")).toBe(true);
    // E `recebido_em` é HOJE: é quando a linha nasceu aqui — §49.
    expect(String(m?.["recebido_em"]).startsWith("2026-09-15")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Quem é a clínica e quem é a pessoa                                      */
/* -------------------------------------------------------------------------- */

describe("as duas pontas da thread são distinguidas", () => {
  it("a resposta da clínica entra como SAIDA", async () => {
    respostas.push({ status: 200, corpo: { data: [{ id: "thread-1" }], paging: {} } });
    respostas.push({ status: 200, corpo: thread() });

    await importarHistoricoDaMeta(ESCOPO, "instagram");

    const mensagens = conteudo("crc_messages");
    const daClinica = mensagens.find((m) => m["provider_message_id"] === "m.resposta");
    const daPessoa = mensagens.find((m) => m["provider_message_id"] === "m.pergunta");

    /*
     * ==========================================================================
     *  SEM ESTA DISTINÇÃO, a resposta da recepção entraria como se o paciente a
     *  tivesse escrito — e a janela de 24 horas seria calculada a partir da
     *  NOSSA própria mensagem, abrindo uma janela que não existe.
     * ==========================================================================
     */
    expect(daClinica?.["direcao"]).toBe("SAIDA");
    expect(daPessoa?.["direcao"]).toBe("ENTRADA");
  });

  it("a conversa é do IGSID da PESSOA, e não da conta da clínica", async () => {
    respostas.push({ status: 200, corpo: { data: [{ id: "thread-1" }], paging: {} } });
    respostas.push({ status: 200, corpo: thread() });

    await importarHistoricoDaMeta(ESCOPO, "instagram");

    const conversas = conteudo("crc_conversations");
    expect(conversas).toHaveLength(1);
    expect(conversas[0]?.["contato_externo"]).toBe(IGSID);
  });

  it("a prévia da conversa é a mensagem MAIS RECENTE", async () => {
    /*
     * ==========================================================================
     *  A GRAPH DEVOLVE DO MAIS NOVO PARA O MAIS ANTIGO, e o importador inverte.
     *
     *  Sem inverter, a última gravação seria a mensagem MAIS ANTIGA — e a Inbox
     *  mostraria, como prévia, a primeira frase de uma conversa de seis meses.
     * ==========================================================================
     */
    respostas.push({ status: 200, corpo: { data: [{ id: "thread-1" }], paging: {} } });
    respostas.push({
      status: 200,
      corpo: {
        id: "thread-1",
        messages: {
          data: [
            {
              id: "m.nova",
              created_time: "2026-09-10T10:00:00+0000",
              from: { id: IGID },
              to: { data: [{ id: IGSID }] },
              message: "MAIS RECENTE",
            },
            {
              id: "m.velha",
              created_time: "2026-03-01T10:00:00+0000",
              from: { id: IGID },
              to: { data: [{ id: IGSID }] },
              message: "mais antiga",
            },
          ],
        },
      },
    });

    await importarHistoricoDaMeta(ESCOPO, "instagram");
    expect(conteudo("crc_conversations")[0]?.["ultima_mensagem_trecho"]).toBe("MAIS RECENTE");
  });
});

/* -------------------------------------------------------------------------- */
/* 3. A idempotência — §13                                                    */
/* -------------------------------------------------------------------------- */

describe("rodar o backfill duas vezes NÃO duplica nada", () => {
  it("a segunda volta conta duplicadas e não grava", async () => {
    /*
     * A GARANTIA É O ÍNDICE de `crc_messages.provider_message_id` — e é por isso
     * que a ORDEM de ativação não importa: conectar a conta, ligar o webhook e
     * depois importar o histórico produz o mesmo resultado que o inverso.
     */
    respostas.push({ status: 200, corpo: { data: [{ id: "thread-1" }], paging: {} } });
    respostas.push({ status: 200, corpo: thread() });
    const primeira = await importarHistoricoDaMeta(ESCOPO, "instagram");
    expect(primeira.mensagens).toBe(2);

    respostas.push({ status: 200, corpo: { data: [{ id: "thread-1" }], paging: {} } });
    respostas.push({ status: 200, corpo: thread() });
    const segunda = await importarHistoricoDaMeta(ESCOPO, "instagram");

    expect(segunda.mensagens).toBe(0);
    expect(segunda.duplicadas).toBe(2);
    expect(conteudo("crc_messages")).toHaveLength(2);
  });

  it("a mensagem que o WEBHOOK já trouxe não é duplicada pelo backfill", async () => {
    semear("crc_conversations", [
      {
        id: "conversa-1",
        organization_id: ORG,
        clinic_id: CLINICA,
        canal: "instagram",
        contato_externo: IGSID,
        status: "ABERTA",
        revisao_pendente: false,
      },
    ]);
    semear("crc_messages", [
      {
        id: "msg-do-webhook",
        organization_id: ORG,
        conversation_id: "conversa-1",
        direcao: "ENTRADA",
        remetente: "paciente",
        conteudo: "tem horário hoje?",
        status_entrega: "DELIVERED",
        provider_message_id: "m.pergunta",
      },
    ]);

    respostas.push({ status: 200, corpo: { data: [{ id: "thread-1" }], paging: {} } });
    respostas.push({ status: 200, corpo: thread() });

    const r = await importarHistoricoDaMeta(ESCOPO, "instagram");

    expect(r.duplicadas).toBe(1);
    expect(r.mensagens).toBe(1);
    expect(conteudo("crc_messages")).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Os tetos e o cursor — §37                                               */
/* -------------------------------------------------------------------------- */

describe("o backfill não derruba o trabalho da frente", () => {
  it("pede a plataforma certa e o `fields` explícito", async () => {
    respostas.push({ status: 200, corpo: { data: [], paging: {} } });

    await importarHistoricoDaMeta(ESCOPO, "instagram");

    /*
     * `platform` É OBRIGATÓRIO e separa as duas caixas. Sem ele a Graph devolve
     * só Messenger, e o direct do Instagram nunca apareceria — um backfill
     * "completo" que importa metade.
     */
    expect(chamadas[0]).toContain("platform=instagram");
    expect(chamadas[0]).toContain(`${PAGE}/conversations`);
  });

  it("o Messenger usa a MESMA Página e a outra plataforma", async () => {
    respostas.push({ status: 200, corpo: { data: [], paging: {} } });
    await importarHistoricoDaMeta(ESCOPO, "messenger");
    expect(chamadas[0]).toContain("platform=messenger");
  });

  it("grava o cursor e diz que ainda há conversas", async () => {
    /*
     * ==========================================================================
     *  A ORDEM DAS RESPOSTAS É A ORDEM REAL DAS CHAMADAS, e ela importa.
     *
     *  `paginar` esgota o TETO DE PÁGINAS de conversas ANTES de qualquer detalhe
     *  de thread ser buscado — duas listagens seguidas, e só depois as threads.
     *
     *  Uma fila montada como `listagem → thread → listagem → thread` faria a
     *  resposta da thread ser lida como a segunda página de conversas. E o teste
     *  passaria por acidente num cenário que não existe.
     * ==========================================================================
     */
    respostas.push({
      status: 200,
      corpo: {
        data: [{ id: "thread-1" }],
        paging: { next: "https://graph.facebook.com/proxima", cursors: { after: "cursor-2" } },
      },
    });
    respostas.push({
      status: 200,
      corpo: {
        data: [{ id: "thread-2" }],
        paging: { next: "https://graph.facebook.com/proxima", cursors: { after: "cursor-3" } },
      },
    });
    // Agora os detalhes das duas threads, na ordem em que elas foram listadas.
    respostas.push({ status: 200, corpo: thread() });
    respostas.push({ status: 200, corpo: { id: "thread-2", messages: { data: [] } } });

    const r = await importarHistoricoDaMeta(ESCOPO, "instagram");

    expect(r.fechou).toBe(false);
    expect(r.motivo).toContain("próxima volta");

    const estado = conteudo("crc_sync_state").find(
      (s) => s["recurso"] === recursoDoHistorico("instagram"),
    );
    expect(estado?.["cursor"]).toBe("cursor-3");
  });

  it("a falha na listagem encerra a volta com o motivo da Graph", async () => {
    respostas.push({ status: 401, corpo: { error: { code: 190, message: "expired" } } });

    const r = await importarHistoricoDaMeta(ESCOPO, "instagram");

    expect(r.mensagens).toBe(0);
    expect(r.motivo).toContain("#190");
    const estado = conteudo("crc_sync_state").find(
      (s) => s["recurso"] === recursoDoHistorico("instagram"),
    );
    expect(estado?.["sync_status"]).toBe("FALHOU");
  });

  it("sem Página vinculada, diz por que não dá", async () => {
    const canal = conteudo("crc_canais_meta")[0];
    if (canal !== undefined) canal["page_id"] = null;

    const r = await importarHistoricoDaMeta(ESCOPO, "instagram");

    expect(r.conversas).toBe(0);
    expect(r.motivo).toContain("Conversations API");
    expect(chamadas).toHaveLength(0);
  });

  it("uma thread que falha não impede as outras", async () => {
    respostas.push({
      status: 200,
      corpo: { data: [{ id: "thread-ruim" }, { id: "thread-1" }], paging: {} },
    });
    respostas.push({ status: 500, corpo: {} });
    respostas.push({ status: 200, corpo: thread() });

    const r = await importarHistoricoDaMeta(ESCOPO, "instagram");

    expect(r.falhas).toBe(1);
    // AS DUAS FORAM TENTADAS, e a boa entrou.
    expect(r.mensagens).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Mensagem sem texto                                                      */
/* -------------------------------------------------------------------------- */

describe("mensagem sem texto no histórico não vira bolha vazia — §13", () => {
  it("recebe um marcador honesto", async () => {
    respostas.push({ status: 200, corpo: { data: [{ id: "thread-1" }], paging: {} } });
    respostas.push({
      status: 200,
      corpo: {
        id: "thread-1",
        messages: {
          data: [
            {
              id: "m.midia",
              created_time: SEIS_MESES,
              from: { id: IGSID },
              to: { data: [{ id: IGID }] },
            },
          ],
        },
      },
    });

    await importarHistoricoDaMeta(ESCOPO, "instagram");

    const conteudoDaMensagem = String(conteudo("crc_messages")[0]?.["conteudo"] ?? "");
    expect(conteudoDaMensagem.trim().length).toBeGreaterThan(0);
    expect(conteudoDaMensagem).toContain("histórico");
  });
});
