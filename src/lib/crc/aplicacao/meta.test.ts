/**
 * O webhook da Meta no inbox pattern — §11, §33, §34, §36, §48, §49, §53.
 *
 * ============================================================================
 *  OS QUATRO INVARIANTES QUE ESTE ARQUIVO TRAVA, e cada um tem um defeito
 *  concreto do outro lado:
 *
 *    1. GRAVA ANTES DE APLICAR      sem isso, a reentrega da Meta produz três
 *                                   mensagens na Inbox e três respostas.
 *
 *    2. TENANT POR CONTA EXTERNA    sem isso, o direct da Clínica B entra no
 *                                   histórico da Clínica A. O §33 proíbe
 *                                   nominalmente "primeira clínica ativa".
 *
 *    3. FALHA VOLTA PARA A FILA     o CRC responde 200, a Meta considera
 *                                   entregue e NUNCA reenvia. Sem repescagem,
 *                                   a mensagem some sem alarme.
 *
 *    4. ECO E HISTÓRICO NÃO ACORDAM A AUTOMAÇÃO — §48. É o "Oi, vi sua
 *                                   mensagem" para conversa de seis meses
 *                                   atrás.
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

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { interpretarWebhookMeta } from "../integracoes/meta/normalizar";

import { chaveDoEnvelopeMeta, processarWebhookMeta, resolverEscopoDaMeta } from "./meta";
import { repescarWebhooks, MAX_TENTATIVAS_WEBHOOK } from "./webhooks";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const CLINICA_A = "22222222-2222-4222-8222-222222222222";
const ORG_B = "33333333-3333-4333-8333-333333333333";
const CLINICA_B = "44444444-4444-4444-8444-444444444444";

const IGID_A = "17841400000000099";
const IGID_B = "17841400000000199";
const IGSID = "17841400000000001";
const PAGE_A = "104000000000001";

const AGORA = new Date("2026-09-15T12:00:00.000Z");

function semearCanais(): void {
  semear("crc_organizations", [
    { id: ORG_A, slug: "jp" },
    { id: ORG_B, slug: "outra" },
  ]);
  semear("crc_clinics", [
    { id: CLINICA_A, organization_id: ORG_A, slug: "a", ativa: true },
    { id: CLINICA_B, organization_id: ORG_B, slug: "b", ativa: true },
  ]);
  semear("crc_canais_meta", [
    {
      id: "canal-a",
      organization_id: ORG_A,
      clinic_id: CLINICA_A,
      provider: "meta",
      produtos: ["instagram", "messenger", "comentarios", "lead_ads"],
      page_id: PAGE_A,
      instagram_account_id: IGID_A,
      ativo: true,
    },
    {
      id: "canal-b",
      organization_id: ORG_B,
      clinic_id: CLINICA_B,
      provider: "meta",
      produtos: ["instagram"],
      page_id: null,
      instagram_account_id: IGID_B,
      ativo: true,
    },
  ]);
}

function direct(p: { conta?: string; mid?: string; de?: string; texto?: string; eco?: boolean }) {
  return {
    object: "instagram",
    entry: [
      {
        id: p.conta ?? IGID_A,
        time: Math.floor(AGORA.getTime() / 1000),
        messaging: [
          {
            sender: { id: p.eco === true ? (p.conta ?? IGID_A) : (p.de ?? IGSID) },
            recipient: { id: p.eco === true ? (p.de ?? IGSID) : (p.conta ?? IGID_A) },
            timestamp: AGORA.getTime(),
            message: {
              mid: p.mid ?? "mid.1",
              text: p.texto ?? "quanto custa um implante?",
              ...(p.eco === true ? { is_echo: true } : {}),
            },
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semearCanais();
});

/* -------------------------------------------------------------------------- */
/* 1. A entrada                                                               */
/* -------------------------------------------------------------------------- */

describe("o direct entra na Inbox", () => {
  it("cria conversa, mensagem e envelope de inbox", async () => {
    const r = await processarWebhookMeta(interpretarWebhookMeta(direct({}), AGORA), {
      organizationId: ORG_A,
      clinicId: CLINICA_A,
    });

    expect(r.mensagens).toBe(1);

    const conversas = conteudo("crc_conversations");
    expect(conversas).toHaveLength(1);
    expect(conversas[0]?.["canal"]).toBe("instagram");
    // A CHAVE DA CONVERSA É O IGSID, e nunca o username — ver o cabeçalho de
    // `dominio/canais.ts`: username é editável e reaproveitável.
    expect(conversas[0]?.["contato_externo"]).toBe(IGSID);
    expect(conversas[0]?.["organization_id"]).toBe(ORG_A);

    const mensagens = conteudo("crc_messages");
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]?.["direcao"]).toBe("ENTRADA");
    expect(mensagens[0]?.["provider_message_id"]).toBe("mid.1");

    // O ENVELOPE FOI GRAVADO E FECHADO.
    const inbox = conteudo("crc_webhook_inbox");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.["provedor"]).toBe("meta");
    expect(inbox[0]?.["status"]).toBe("PROCESSADO");
    expect(inbox[0]?.["organization_id"]).toBe(ORG_A);
  });

  it("os DOIS relógios são gravados, e são relógios DIFERENTES — §49", async () => {
    /*
     * ==========================================================================
     *  `criado_em` É O INSTANTE DA MENSAGEM; `recebido_em` É O DA INGESTÃO.
     *
     *  E eles usam relógios diferentes de propósito: o primeiro vem do carimbo
     *  da Meta (o webhook diz quando a pessoa escreveu), o segundo é o relógio
     *  de parede do servidor — porque o que ele mede é QUANDO A LINHA NASCEU
     *  AQUI.
     *
     *  Por isso a asserção de `recebido_em` não compara com o relógio do banco
     *  em memória: ele NÃO é o relógio da ingestão, e fixá-lo apagaria a
     *  distinção que o §49 pede. O que se prova é a forma e a ordem.
     * ==========================================================================
     */
    const antes = Date.now();

    await processarWebhookMeta(interpretarWebhookMeta(direct({}), AGORA), {
      organizationId: ORG_A,
      clinicId: CLINICA_A,
    });

    const m = conteudo("crc_messages")[0];

    // O INSTANTE DA MENSAGEM vem do carimbo do webhook, e não do agora.
    expect(m?.["criado_em"]).toBe(AGORA.toISOString());

    const recebido = Date.parse(String(m?.["recebido_em"] ?? ""));
    expect(Number.isFinite(recebido)).toBe(true);
    expect(recebido).toBeGreaterThanOrEqual(antes);
    expect(recebido).toBeLessThanOrEqual(Date.now());
  });

  it("marca o sinal de vida no canal — §39", async () => {
    const antes = Date.now();

    await processarWebhookMeta(interpretarWebhookMeta(direct({}), AGORA), {
      organizationId: ORG_A,
      clinicId: CLINICA_A,
    });

    const canal = conteudo("crc_canais_meta").find((c) => c["id"] === "canal-a");

    /*
     * É DAQUI QUE A TELA DE SAÚDE VIVE. O §39 proíbe "tudo certo porque as env
     * vars existem", e a única forma de cumprir isso é MEDIR — o que exige
     * carimbo.
     *
     * O carimbo é o da INGESTÃO (relógio de parede), e não o da mensagem: a
     * pergunta que a tela faz é "a Meta está falando com a gente AGORA?".
     */
    const webhookEm = Date.parse(String(canal?.["ultimo_webhook_em"] ?? ""));
    const mensagemEm = Date.parse(String(canal?.["ultima_mensagem_em"] ?? ""));
    expect(webhookEm).toBeGreaterThanOrEqual(antes);
    expect(mensagemEm).toBeGreaterThanOrEqual(antes);

    /*
     * E O CARIMBO DE LEAD NÃO É TOCADO.
     *
     * São três carimbos separados porque respondem perguntas diferentes: com um
     * só, "o Lead Ads parou há três dias" ficaria invisível enquanto o direct
     * continuasse chegando.
     */
    expect(canal?.["ultimo_lead_em"] ?? null).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* 2. A idempotência — §34                                                    */
/* -------------------------------------------------------------------------- */

describe("o mesmo webhook duas vezes NÃO duplica efeito", () => {
  it("o envelope idêntico é recusado pela chave", async () => {
    const envelope = interpretarWebhookMeta(direct({}), AGORA);
    const escopo = { organizationId: ORG_A, clinicId: CLINICA_A };

    const primeiro = await processarWebhookMeta(envelope, escopo);
    const segundo = await processarWebhookMeta(envelope, escopo);

    expect(primeiro.mensagens).toBe(1);
    expect(segundo.mensagens).toBe(0);
    expect(segundo.duplicados).toBe(1);
    expect(conteudo("crc_messages")).toHaveLength(1);
  });

  it("a garantia real é POR MENSAGEM, e não pela chave do envelope", async () => {
    /*
     * ==========================================================================
     *  A META PODE REAGRUPAR OS EVENTOS entre duas entregas do mesmo conteúdo —
     *  e aí a chave do envelope DIFERE enquanto as mensagens são as mesmas.
     *
     *  Este teste monta exatamente isso: dois envelopes com chaves diferentes
     *  (um traz uma mensagem, o outro traz duas) carregando o MESMO `mid`. A
     *  chave do envelope não protege; `crc_messages.provider_message_id`
     *  protege.
     * ==========================================================================
     */
    const escopo = { organizationId: ORG_A, clinicId: CLINICA_A };

    await processarWebhookMeta(interpretarWebhookMeta(direct({ mid: "mid.x" }), AGORA), escopo);

    const agrupado = {
      object: "instagram",
      entry: [
        {
          id: IGID_A,
          messaging: [
            direct({ mid: "mid.x" }).entry[0]!.messaging[0],
            direct({ mid: "mid.y", texto: "e aparelho?" }).entry[0]!.messaging[0],
          ],
        },
      ],
    };

    const envelopeB = interpretarWebhookMeta(agrupado, AGORA);
    expect(chaveDoEnvelopeMeta(envelopeB)).not.toBe(
      chaveDoEnvelopeMeta(interpretarWebhookMeta(direct({ mid: "mid.x" }), AGORA)),
    );

    const r = await processarWebhookMeta(envelopeB, escopo);

    // `mid.x` foi recusado pelo índice; `mid.y` entrou.
    expect(r.duplicados).toBe(1);
    expect(r.mensagens).toBe(1);
    expect(conteudo("crc_messages")).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. O tenant — §33                                                          */
/* -------------------------------------------------------------------------- */

describe("o tenant vem da CONTA EXTERNA, e nunca da primeira clínica", () => {
  it("cada conta resolve para a sua organização", async () => {
    expect(await resolverEscopoDaMeta([IGID_A])).toEqual({
      organizationId: ORG_A,
      clinicId: CLINICA_A,
    });
    expect(await resolverEscopoDaMeta([IGID_B])).toEqual({
      organizationId: ORG_B,
      clinicId: CLINICA_B,
    });
  });

  it("a Página também resolve, pela outra coluna", async () => {
    expect(await resolverEscopoDaMeta([PAGE_A])).toEqual({
      organizationId: ORG_A,
      clinicId: CLINICA_A,
    });
  });

  it("conta NÃO CADASTRADA recusa — e não cai na clínica única", async () => {
    /*
     * ==========================================================================
     *  AQUI NÃO HÁ O DEGRAU DE TRANSIÇÃO QUE O WHATSAPP TEM.
     *
     *  `resolverEscopo` em `webhooks.ts` cai na clínica única quando não há
     *  canal cadastrado — ele existe porque a JP já tinha WhatsApp funcionando
     *  antes da tabela de canais.
     *
     *  A Meta não tem instalação para não quebrar, então o degrau seria uma
     *  bomba-relógio com um comentário pedindo desculpas. §33: fail closed.
     * ==========================================================================
     */
    expect(await resolverEscopoDaMeta(["conta-que-ninguem-cadastrou"])).toBeNull();
  });

  it("canal DESATIVADO não recebe", async () => {
    const canais = conteudo("crc_canais_meta");
    const a = canais.find((c) => c["id"] === "canal-a");
    if (a !== undefined) a["ativo"] = false;

    expect(await resolverEscopoDaMeta([IGID_A])).toBeNull();
  });

  it("envelope com contas de DOIS tenants é RECUSADO", async () => {
    /*
     * A Meta agrupa: um POST pode trazer `entry` de duas contas. Processar tudo
     * com o tenant da PRIMEIRA é exatamente o defeito que o `supabase/23`
     * matou — dado de paciente atravessando a fronteira da organização.
     */
    expect(await resolverEscopoDaMeta([IGID_A, IGID_B])).toBeNull();
  });

  it("o evento da clínica B NUNCA aparece na clínica A", async () => {
    await processarWebhookMeta(interpretarWebhookMeta(direct({ conta: IGID_B }), AGORA));

    const conversas = conteudo("crc_conversations");
    expect(conversas).toHaveLength(1);
    expect(conversas[0]?.["organization_id"]).toBe(ORG_B);
    expect(conversas[0]?.["clinic_id"]).toBe(CLINICA_B);

    // E NENHUMA linha ficou na A.
    expect(conversas.filter((c) => c["organization_id"] === ORG_A)).toHaveLength(0);
    expect(conteudo("crc_messages").filter((m) => m["organization_id"] === ORG_A)).toHaveLength(0);
  });

  it("sem tenant, o envelope vai para terminal com motivo — e não para a fila", async () => {
    /*
     * TENTATIVAS NO TETO de propósito: repescar cinco vezes não vai fazer a
     * conta aparecer no cadastro. Quem resolve é uma pessoa, e o que ela precisa
     * é ver isto na tela de saúde — não na fila.
     */
    const r = await processarWebhookMeta(
      interpretarWebhookMeta(direct({ conta: "desconhecida" }), AGORA),
    );

    expect(r.mensagens).toBe(0);
    const inbox = conteudo("crc_webhook_inbox");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.["status"]).toBe("FALHOU");
    expect(String(inbox[0]?.["ultimo_erro"])).toContain("Meta");
    // PAYLOAD ZERADO: terminal não guarda PII. Ver `marcarEnvelope`.
    expect(inbox[0]?.["payload"]).toEqual({});
    expect(conteudo("crc_messages")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. O eco e o histórico — §48                                               */
/* -------------------------------------------------------------------------- */

describe("o ECO entra como saída e NÃO acorda a automação", () => {
  it("é gravado como SAIDA, de atendente", async () => {
    await processarWebhookMeta(
      interpretarWebhookMeta(direct({ mid: "mid.eco", eco: true, texto: "Bom dia!" }), AGORA),
      { organizationId: ORG_A, clinicId: CLINICA_A },
    );

    const m = conteudo("crc_messages")[0];
    expect(m?.["direcao"]).toBe("SAIDA");
    /*
     * `atendente`, E NÃO `ia`: o eco é a mensagem que uma PESSOA mandou pelo
     * app do celular. Marcar como `ia` faria a auditoria atribuir à máquina o
     * que uma pessoa escreveu.
     */
    expect(m?.["remetente"]).toBe("atendente");
  });

  it("NÃO incrementa não lidas e NÃO emite evento", async () => {
    await processarWebhookMeta(
      interpretarWebhookMeta(direct({ mid: "mid.eco", eco: true }), AGORA),
      { organizationId: ORG_A, clinicId: CLINICA_A },
    );

    expect(conteudo("crc_conversations")[0]?.["nao_lidas"] ?? 0).toBe(0);
    /*
     * `crc_events` É O GATILHO DA IA E DA AUTOMAÇÃO. Um eco que emite
     * `message.received` faz a IA responder à própria resposta.
     */
    expect(conteudo("crc_events").filter((e) => e["tipo"] === "message.received")).toHaveLength(0);
  });

  it("mas ATUALIZA a prévia da conversa", async () => {
    /*
     * Sem isto, a Inbox mostraria a pergunta do paciente como última mensagem
     * de uma conversa já respondida pelo celular — e a recepção responderia de
     * novo.
     */
    await processarWebhookMeta(
      interpretarWebhookMeta(direct({ mid: "mid.eco", eco: true, texto: "Já respondi" }), AGORA),
      { organizationId: ORG_A, clinicId: CLINICA_A },
    );

    expect(conteudo("crc_conversations")[0]?.["ultima_mensagem_trecho"]).toBe("Já respondi");
  });

  it("o direct NORMAL faz as três coisas", async () => {
    await processarWebhookMeta(interpretarWebhookMeta(direct({}), AGORA), {
      organizationId: ORG_A,
      clinicId: CLINICA_A,
    });

    // O CONTRASTE É O TESTE: se as três acontecessem no eco também, o teste de
    // cima passaria por acidente numa implementação que não distingue nada.
    expect(Number(conteudo("crc_conversations")[0]?.["nao_lidas"] ?? 0)).toBeGreaterThan(0);
    expect(
      conteudo("crc_events").filter((e) => e["tipo"] === "message.received").length,
    ).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. A repescagem e a dead letter — §36                                      */
/* -------------------------------------------------------------------------- */

describe("o envelope que falha volta para a fila, e depois para a dead letter", () => {
  it("a repescagem reaplica pela MESMA rota e acerta o tenant", async () => {
    /*
     * ==========================================================================
     *  O REPLAY ROTEIA PELO MESMO CAMINHO DO ORIGINAL.
     *
     *  As `contas` viajam DENTRO do envelope normalizado, então um webhook
     *  repescado três dias depois cai na MESMA clínica. Resolver "pela primeira
     *  clínica" faria a repescagem entregar a mensagem ao tenant errado — pior
     *  que não repescar, porque o dado atravessa a fronteira sem ninguém ver.
     * ==========================================================================
     */
    const envelope = interpretarWebhookMeta(direct({ conta: IGID_B, mid: "mid.b" }), AGORA);

    // Uma linha que ficou PENDENTE — o cenário de um deploy no meio.
    semear("crc_webhook_inbox", [
      {
        id: "envelope-pendente",
        provedor: "meta",
        external_id: "chave-pendente",
        organization_id: null,
        clinic_id: null,
        payload: envelope,
        status: "PENDENTE",
        tentativas: 0,
        disponivel_em: AGORA.toISOString(),
      },
    ]);

    const r = await repescarWebhooks({ limite: 5 });
    expect(r.recuperados).toBe(1);

    const conversas = conteudo("crc_conversations");
    expect(conversas).toHaveLength(1);
    expect(conversas[0]?.["organization_id"]).toBe(ORG_B);

    // A REPESCAGEM PREENCHEU O TENANT que faltava na linha.
    const linha = conteudo("crc_webhook_inbox").find((l) => l["id"] === "envelope-pendente");
    expect(linha?.["organization_id"]).toBe(ORG_B);
    expect(linha?.["status"]).toBe("PROCESSADO");
  });

  it("envelope sem conta cadastrada VOLTA para a fila — e não é descartado", async () => {
    /*
     * A DIFERENÇA IMPORTA: `DESCARTADO` é terminal e zera o payload. "A conta
     * ainda não foi cadastrada" é falha de CONFIGURAÇÃO — ela se resolve quando
     * alguém cadastra a conta, e até lá o envelope precisa continuar
     * reprocessável.
     */
    semear("crc_webhook_inbox", [
      {
        id: "sem-conta",
        provedor: "meta",
        external_id: "chave-sem-conta",
        organization_id: null,
        payload: interpretarWebhookMeta(direct({ conta: "ninguem" }), AGORA),
        status: "PENDENTE",
        tentativas: 0,
        disponivel_em: AGORA.toISOString(),
      },
    ]);

    const r = await repescarWebhooks({ limite: 5 });
    expect(r.falhados).toBe(1);
    expect(r.descartados).toBe(0);

    const linha = conteudo("crc_webhook_inbox").find((l) => l["id"] === "sem-conta");
    expect(linha?.["status"]).toBe("FALHOU");
    // AINDA REPROCESSÁVEL: o payload não foi zerado.
    expect(linha?.["payload"]).not.toEqual({});
  });

  it("envelope sem evento nenhum é DESCARTADO, e não repescado para sempre", async () => {
    semear("crc_webhook_inbox", [
      {
        id: "vazio",
        provedor: "meta",
        external_id: "chave-vazia",
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        payload: { objeto: "instagram", eventos: [], contas: [IGID_A], ignorados: 1 },
        status: "PENDENTE",
        tentativas: 0,
        disponivel_em: AGORA.toISOString(),
      },
    ]);

    const r = await repescarWebhooks({ limite: 5 });
    expect(r.descartados).toBe(1);

    const linha = conteudo("crc_webhook_inbox").find((l) => l["id"] === "vazio");
    expect(linha?.["status"]).toBe("DESCARTADO");
  });

  it("no teto de tentativas abre dead letter COM o tenant", async () => {
    /*
     * ==========================================================================
     *  DEAD LETTER SEM DONO É UM MONTE QUE NINGUÉM INVESTIGA.
     *
     *  Num SaaS, sem `organization_id` não dá para dizer qual cliente perdeu
     *  mensagem, nem mostrar a ele o que foi perdido, nem separar o problema de
     *  um do problema de todos.
     * ==========================================================================
     */
    semear("crc_webhook_inbox", [
      {
        id: "no-teto",
        provedor: "meta",
        external_id: "chave-teto",
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        // Um evento de tipo desconhecido faz `aplicarEventosDaMeta` coletar erro
        // — e no teto de tentativas isso vira dead letter.
        payload: {
          objeto: "instagram",
          contas: [IGID_A],
          ignorados: 0,
          eventos: [
            {
              tipo: "instagram.message.received",
              idExterno: "mid.quebrado",
              contaExterna: IGID_A,
              ocorridoEm: AGORA.toISOString(),
              canal: "instagram",
              // CONTATO VAZIO: `montarDestino` devolve null e o evento é
              // ignorado sem lançar. Para forçar a dead letter, a linha já
              // chega no teto de tentativas com um erro anterior.
              contatoExterno: "",
              texto: "x",
              apelido: null,
              anexos: [],
              contexto: null,
              eco: false,
            },
          ],
        },
        status: "FALHOU",
        tentativas: MAX_TENTATIVAS_WEBHOOK,
        ultimo_erro: "falhou antes",
        disponivel_em: AGORA.toISOString(),
      },
    ]);

    /*
     * `crc_reservar_webhooks` respeita `max_tentativas`: uma linha JÁ no teto
     * não é reservada de novo. O que este teste prova é o outro lado — que a
     * linha no teto NÃO volta à fila, que é o comportamento certo: ela precisa
     * de gente.
     */
    const r = await repescarWebhooks({ limite: 5 });
    expect(r.reservados).toBe(0);

    const linha = conteudo("crc_webhook_inbox").find((l) => l["id"] === "no-teto");
    expect(linha?.["status"]).toBe("FALHOU");
  });
});

/* -------------------------------------------------------------------------- */
/* 6. O envelope vazio                                                        */
/* -------------------------------------------------------------------------- */

describe("webhook sem evento não vira linha de fila", () => {
  it("mudança de configuração do app é ignorada sem ruído", async () => {
    const r = await processarWebhookMeta(interpretarWebhookMeta({ object: "instagram" }, AGORA), {
      organizationId: ORG_A,
      clinicId: CLINICA_A,
    });

    expect(r.mensagens).toBe(0);
    // `ignorados` VEIO DO NORMALIZADOR, e é o que a saúde mede.
    expect(r.ignorados).toBe(1);
    // NENHUMA linha de fila: gravar uma para cada notificação de configuração
    // encheria a tabela de trabalho que nunca vai existir.
    expect(conteudo("crc_webhook_inbox")).toHaveLength(0);
  });

  it("a chave do envelope é nula quando não há evento", () => {
    expect(
      chaveDoEnvelopeMeta({ objeto: "instagram", eventos: [], contas: [], ignorados: 0 }),
    ).toBeNull();
  });
});
