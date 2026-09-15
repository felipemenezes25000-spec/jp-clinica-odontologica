/**
 * A configuração da Meta pela tela — §31, §32, §66, §79.
 *
 * ============================================================================
 *  A TELA É O LUGAR ONDE AS TRAVAS SÃO MAIS FÁCEIS DE ESQUECER.
 *
 *  O motor tem teste de unidade, o banco tem índice, e o webhook tem
 *  assinatura. A tela é a parte que "só grava um formulário" — e é por ela que
 *  entram as três configurações que produzem silêncio em vez de erro:
 *
 *    TOKEN EM CLARO         sem `CRC_SEGREDO_CHAVE`, guardar "só por enquanto"
 *                           vira um Page Access Token em texto puro para
 *                           sempre, porque ninguém volta para consertar.
 *
 *    PRODUTO SEM CHAVE      "Lead Ads" numa linha sem `page_id` produz um canal
 *                           que NUNCA recebe nada. O sintoma é silêncio.
 *
 *    REGRA ATIVA SEM PALAVRA  aparece "Ativa" na tela e não casa comentário
 *                           nenhum. A pessoa passa a tarde tentando entender.
 * ============================================================================
 *
 * ============================================================================
 *  E A AÇÃO "TESTAR" NÃO ENVIA MENSAGEM — §31, literal.
 *
 *  Um teste que manda direct prova a mesma coisa que um GET e custa uma
 *  mensagem para uma pessoa de verdade. O teste aqui confere que NENHUM POST
 *  sai: a lista de chamadas é inspecionada método a método.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

type Auditoria = { acao: string; entityId: string | null; depois: unknown };
const auditorias: Auditoria[] = [];

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return {
    ...real,
    registrar: () => undefined,
    registrarIntegracao: () => Promise.resolve(),
    auditar: (p: Auditoria) => {
      auditorias.push(p);
      return Promise.resolve();
    },
  };
});

const chamadas: { url: string; metodo: string }[] = [];
const respostas: { status: number; corpo: unknown }[] = [];

vi.mock("../servidor/http", async () => {
  const real = await vi.importActual<typeof import("../servidor/http")>("../servidor/http");
  return {
    ...real,
    pedir: (url: string, opcoes: { metodo?: string } = {}) => {
      chamadas.push({ url, metodo: opcoes.metodo ?? "GET" });
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

import {
  canaisDoPaciente,
  canaisMetaCadastrados,
  conectarCanalMeta,
  desativarCanalMeta,
  listarRegrasSociais,
  removerRegraSocial,
  salvarRegraSocial,
  semearRegraDeExemplo,
  testarCanalMeta,
  type PedidoDeConexao,
  type PedidoDeRegra,
} from "./meta-config";

const ORG = "11111111-1111-4111-8111-111111111111";
const ORG_B = "33333333-3333-4333-8333-333333333333";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const CLINICA_2 = "24444444-2222-4222-8222-222222222222";
const USUARIO = "55555555-5555-4555-8555-555555555555";
const PACIENTE = "66666666-6666-4666-8666-666666666666";

const PAGE = "104000000000001";
const IGID = "17841400000000099";
const TOKEN = "EAAG-page-access-token-da-jp-que-nunca-pode-vazar";

const AGORA = new Date("2026-09-15T12:00:00.000Z");
const CHAVE = Buffer.alloc(32, 13).toString("base64");

function conexao(p: Partial<PedidoDeConexao> = {}): PedidoDeConexao {
  return {
    organizationId: ORG,
    clinicId: CLINICA,
    userId: USUARIO,
    pageId: PAGE,
    instagramAccountId: IGID,
    displayName: "JP Clínica Odontológica",
    username: "@jpclinica",
    produtos: ["instagram", "messenger", "comentarios", "lead_ads"],
    token: TOKEN,
    config: {},
    tokenExpiraEm: null,
    permissoes: ["instagram_basic", "instagram_manage_messages"],
    ...p,
  };
}

/**
 * A conta da organização VIZINHA.
 *
 * Página E conta do Instagram próprias — as duas. Reaproveitar o `IGID` da JP
 * aqui faria o índice único recusar a inserção, e o teste passaria a medir a
 * duplicata em vez do isolamento entre organizações.
 */
function conexaoDaVizinha(p: Partial<PedidoDeConexao> = {}): PedidoDeConexao {
  return conexao({
    organizationId: ORG_B,
    clinicId: CLINICA_2,
    pageId: "104000000000009",
    instagramAccountId: "17841400000000999",
    ...p,
  });
}

function regra(p: Partial<PedidoDeRegra> = {}): PedidoDeRegra {
  return {
    organizationId: ORG,
    userId: USUARIO,
    nome: "Implante",
    clinicId: null,
    canal: "instagram",
    evento: "comment.created",
    contem: ["implante"],
    naoContem: ["capilar"],
    exigirCaptacao: true,
    midias: [],
    criarLead: true,
    criarOportunidade: true,
    enviarPrivateReply: true,
    intencao: "INTERESSE",
    copy: null,
    cooldownHoras: 168,
    ativa: true,
    ...p,
  };
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  auditorias.length = 0;
  chamadas.length = 0;
  respostas.length = 0;
  process.env["CRC_SEGREDO_CHAVE"] = CHAVE;
  process.env["META_GRAPH_VERSION"] = "v26.0";

  semear("crc_organizations", [
    { id: ORG, slug: "jp" },
    { id: ORG_B, slug: "vizinha" },
  ]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, slug: "jp-matriz", ativa: true },
    { id: CLINICA_2, organization_id: ORG, slug: "jp-centro", ativa: true },
  ]);
});

/* -------------------------------------------------------------------------- */
/* Conectar                                                                   */
/* -------------------------------------------------------------------------- */

describe("conectar uma conta", () => {
  it("grava o token CIFRADO e devolve só a dica", async () => {
    const r = await conectarCanalMeta(conexao());

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const linhas = conteudo("crc_canais_meta");
    expect(linhas).toHaveLength(1);

    // O token em claro não está em lugar nenhum da linha.
    expect(JSON.stringify(linhas[0])).not.toContain(TOKEN);
    expect(String(linhas[0]!["segredo_cifrado"])).not.toContain(TOKEN);
    expect(r.dica).not.toContain(TOKEN);
    expect(r.dica.length).toBeGreaterThan(0);
  });

  it("a auditoria leva a DICA, e nunca o token", async () => {
    await conectarCanalMeta(conexao());

    const a = auditorias.find((x) => x.acao === "meta.canal_conectado");
    expect(a).toBeDefined();
    // `crc_audit_log` é consultável por muita gente. Um token ali é o mesmo
    // vazamento de um token em log, com a agravante de ser permanente.
    expect(JSON.stringify(a)).not.toContain(TOKEN);
  });

  it("SEM chave de cifra, RECUSA — e não grava em claro", async () => {
    /*
     * ==========================================================================
     *  A alternativa é gravar em claro "só por enquanto". O resultado conhecido
     *  é um Page Access Token em texto puro numa tabela, para sempre.
     * ==========================================================================
     */
    delete process.env["CRC_SEGREDO_CHAVE"];

    const r = await conectarCanalMeta(conexao());

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltando).toEqual(["CRC_SEGREDO_CHAVE"]);
    expect(conteudo("crc_canais_meta")).toHaveLength(0);
  });

  it("sem chave de cifra mas TAMBÉM sem token, aceita — é canal só de recepção", async () => {
    // O degrau legítimo: cadastrar a conta para o webhook saber de quem é a
    // mensagem, antes de existir token de envio. Sem token não há o que cifrar.
    delete process.env["CRC_SEGREDO_CHAVE"];

    const r = await conectarCanalMeta(conexao({ token: "" }));

    expect(r.ok).toBe(true);
    expect(conteudo("crc_canais_meta")).toHaveLength(1);
  });

  it("sem Página e sem Instagram, recusa: nada rotearia o webhook", async () => {
    const r = await conectarCanalMeta(conexao({ pageId: "", instagramAccountId: null }));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltando).toEqual(["page_id", "instagram_account_id"]);
  });

  it("Lead Ads sem `page_id` é RECUSADO — senão vira um canal que nunca recebe", async () => {
    /*
     * Messenger e Lead Ads roteiam por `page_id`; Instagram e comentários, pelo
     * id da conta do Instagram. Salvar "Lead Ads" sem Página produz uma linha
     * que parece certa na tela e nunca casa com nenhum webhook — e o sintoma é
     * silêncio, não erro.
     */
    const r = await conectarCanalMeta(
      conexao({ pageId: null, produtos: ["instagram", "lead_ads"] }),
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltando).toEqual(["page_id"]);
  });

  it("comentários sem id do Instagram é RECUSADO pelo mesmo motivo", async () => {
    const r = await conectarCanalMeta(
      conexao({ instagramAccountId: null, produtos: ["messenger", "comentarios"] }),
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltando).toEqual(["instagram_account_id"]);
  });

  it("produto inválido é descartado; nenhum produto válido é recusa", async () => {
    const r = await conectarCanalMeta(conexao({ produtos: ["whatsapp", "telegram"] }));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltando).toEqual(["produtos"]);
  });

  it("a MESMA Página em um segundo canal é recusada, com o que fazer", async () => {
    /*
     * É a proteção do §33 funcionando: dois canais com a mesma conta deixariam
     * o webhook com dois donos possíveis. "Já cadastrado" sozinho faria a
     * pessoa tentar de novo — a mensagem diz para editar o existente.
     */
    await conectarCanalMeta(conexao());

    const r = await conectarCanalMeta(
      conexao({ clinicId: CLINICA_2, instagramAccountId: "17841400000000299" }),
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("Edite o canal existente");
    expect(conteudo("crc_canais_meta")).toHaveLength(1);
  });

  it("editar sem mexer no token MANTÉM o token — vazio é `não mexi`", async () => {
    /*
     * Tratar vazio como "apague o token" faria uma edição de rótulo
     * desconectar a conta, e a pessoa não saberia por quê: a tela nunca mostra
     * o token, então ela não teria como notar que ele sumiu.
     */
    const primeiro = await conectarCanalMeta(conexao());
    expect(primeiro.ok).toBe(true);
    if (!primeiro.ok) return;

    const antes = String(conteudo("crc_canais_meta")[0]!["segredo_cifrado"]);

    const r = await conectarCanalMeta(
      conexao({ canalId: primeiro.canalId, token: "", displayName: "JP Odonto" }),
    );

    expect(r.ok).toBe(true);
    const linha = conteudo("crc_canais_meta")[0]!;
    expect(String(linha["segredo_cifrado"])).toBe(antes);
    expect(linha["display_name"]).toBe("JP Odonto");
    expect(auditorias.some((a) => a.acao === "meta.canal_atualizado")).toBe(true);
  });

  it("o @ do username é retirado — ele é enfeite da tela, não do dado", async () => {
    await conectarCanalMeta(conexao());

    expect(conteudo("crc_canais_meta")[0]!["username"]).toBe("jpclinica");
  });

  it("as permissões são gravadas com a DATA em que foram declaradas", async () => {
    // O §5 pede saber quando aquela permissão foi concedida. Uma lista sem data
    // não responde "isto ainda vale?" depois de um App Review.
    await conectarCanalMeta(conexao());

    expect(conteudo("crc_canais_meta")[0]!["permissoes"]).toEqual({
      instagram_basic: "2026-09-15",
      instagram_manage_messages: "2026-09-15",
    });
  });

  it("um canal de OUTRA organização não é editável por id", async () => {
    const daB = await conectarCanalMeta(conexaoDaVizinha());
    expect(daB.ok).toBe(true);
    if (!daB.ok) return;

    // Pedir para editar o canal da B a partir da A não edita: o `existente`
    // é procurado com a organização no filtro, então a A cria o próprio.
    const r = await conectarCanalMeta(conexao({ canalId: daB.canalId }));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.canalId).not.toBe(daB.canalId);
    expect(conteudo("crc_canais_meta")).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Desativar                                                                  */
/* -------------------------------------------------------------------------- */

describe("desativar", () => {
  it("DESATIVA, e não apaga — a linha continua, com o token cifrado", async () => {
    /*
     * Três coisas dependem da linha existir depois de desligada: o histórico de
     * "por qual conta isto entrou", a auditoria do §63 ("quem desconectou e
     * quando"), e o religar sem refazer o OAuth inteiro.
     */
    const criado = await conectarCanalMeta(conexao());
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;

    expect(
      await desativarCanalMeta({ organizationId: ORG, canalId: criado.canalId, userId: USUARIO }),
    ).toBe(true);

    const linhas = conteudo("crc_canais_meta");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!["ativo"]).toBe(false);
    expect(String(linhas[0]!["segredo_cifrado"]).length).toBeGreaterThan(0);
    expect(auditorias.some((a) => a.acao === "meta.canal_desativado")).toBe(true);
  });

  it("o canal de OUTRA organização não é desativável", async () => {
    const daB = await conectarCanalMeta(conexaoDaVizinha());
    expect(daB.ok).toBe(true);
    if (!daB.ok) return;

    expect(
      await desativarCanalMeta({ organizationId: ORG, canalId: daB.canalId, userId: USUARIO }),
    ).toBe(false);
    expect(conteudo("crc_canais_meta")[0]!["ativo"]).toBe(true);
  });

  it("um id que não existe devolve `false`, e não finge sucesso", async () => {
    expect(
      await desativarCanalMeta({ organizationId: ORG, canalId: "nao-existe", userId: USUARIO }),
    ).toBe(false);
    expect(auditorias).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Testar                                                                     */
/* -------------------------------------------------------------------------- */

describe("testar a conexão", () => {
  async function canalPronto(): Promise<string> {
    const r = await conectarCanalMeta(conexao());
    if (!r.ok) throw new Error(r.motivo);
    return r.canalId;
  }

  it("faz GET no objeto da conta, e NENHUM POST sai", async () => {
    /*
     * ==========================================================================
     *  O §31 É LITERAL: "a ação Testar não pode enviar mensagem para paciente
     *  real sem confirmação explícita e alvo de teste seguro".
     *
     *  Um GET prova o que interessa — o token existe e não venceu (#190), o app
     *  tem acesso à conta (#200/#10), a versão responde (#2500) — e é gratuito
     *  em risco.
     * ==========================================================================
     */
    const canalId = await canalPronto();
    respostas.push({ status: 200, corpo: { id: IGID, name: "JP Clínica", username: "jpclinica" } });

    const r = await testarCanalMeta({ organizationId: ORG, canalId });

    expect(r.ok).toBe(true);
    expect(r.detalhe).toContain("@jpclinica");

    expect(chamadas.every((c) => c.metodo === "GET")).toBe(true);
    expect(chamadas.some((c) => c.url.includes("/messages"))).toBe(false);
    expect(chamadas[0]!.url).toContain(`/v26.0/${IGID}`);
  });

  it("um token vencido vira detalhe com o código e a ação", async () => {
    const canalId = await canalPronto();
    respostas.push({
      status: 400,
      corpo: {
        error: { message: "(#190) Session has expired", code: 190, type: "OAuthException" },
      },
    });

    const r = await testarCanalMeta({ organizationId: ORG, canalId });

    expect(r.ok).toBe(false);
    // O código bruto é o que permite procurar na doc da Meta; a ação é o que a
    // recepção consegue executar. Os dois, e não um ou outro.
    expect(r.detalhe).toContain("190");
    expect(r.detalhe.length).toBeGreaterThan(30);
  });

  it("canal sem token diz isso, sem chamar a Graph", async () => {
    delete process.env["CRC_SEGREDO_CHAVE"];
    const criado = await conectarCanalMeta(conexao({ token: "" }));
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;
    process.env["CRC_SEGREDO_CHAVE"] = CHAVE;

    const r = await testarCanalMeta({ organizationId: ORG, canalId: criado.canalId });

    expect(r.ok).toBe(false);
    expect(r.detalhe).toContain("só para receber");
    expect(chamadas).toHaveLength(0);
  });

  it("canal de outra organização não é testável — e não vaza que existe", async () => {
    const daB = await conectarCanalMeta(conexaoDaVizinha());
    expect(daB.ok).toBe(true);
    if (!daB.ok) return;

    const r = await testarCanalMeta({ organizationId: ORG, canalId: daB.canalId });

    expect(r.ok).toBe(false);
    expect(chamadas).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* As regras de comentário                                                    */
/* -------------------------------------------------------------------------- */

describe("as regras de comentário", () => {
  it("uma regra ATIVA sem palavra em `contém` é recusada na gravação", async () => {
    /*
     * `casarRegra` já não casaria nada. Mas deixar salvar produziria uma regra
     * que aparece "Ativa" na tela e não faz nada — e a pessoa passaria a tarde
     * tentando entender por quê.
     */
    const r = await salvarRegraSocial(regra({ contem: [], ativa: true }));

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("pelo menos uma palavra");
    expect(conteudo("crc_regras_sociais")).toHaveLength(0);
  });

  it("uma regra INATIVA sem palavra pode ser salva — é um rascunho", async () => {
    const r = await salvarRegraSocial(regra({ contem: [], ativa: false }));

    expect(r.ok).toBe(true);
    expect(conteudo("crc_regras_sociais")).toHaveLength(1);
  });

  it("private reply com cooldown ZERO grava, e AVISA em vez de consertar calado", async () => {
    /*
     * ==========================================================================
     *  `cooldown_horas = 0` com private reply manda um direct por comentário, e
     *  dez comentários da mesma pessoa viram dez directs. A Meta trata isso
     *  como spam, e a penalidade é a conta.
     *
     *  A regra é gravada como a pessoa pediu — ela pode ter motivo. O que NÃO
     *  acontece é o sistema mudar o valor em silêncio.
     * ==========================================================================
     */
    const r = await salvarRegraSocial(regra({ enviarPrivateReply: true, cooldownHoras: 0 }));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.aviso).not.toBeNull();
    expect(r.aviso).toContain("spam");
    expect(conteudo("crc_regras_sociais")[0]!["cooldown_horas"]).toBe(0);
  });

  it("sem private reply, cooldown zero não avisa nada", async () => {
    const r = await salvarRegraSocial(regra({ enviarPrivateReply: false, cooldownHoras: 0 }));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.aviso).toBeNull();
  });

  it("palavras repetidas e espaços são normalizados na gravação", async () => {
    const r = await salvarRegraSocial(
      regra({ contem: [" implante ", "implante", "", "  ", "IMPLANTES"] }),
    );

    expect(r.ok).toBe(true);
    // A deduplicação evita uma regra com 40 sinônimos iguais que ninguém revisa.
    // O caixa alto é preservado: quem normaliza para comparar é `regras-sociais`.
    expect(conteudo("crc_regras_sociais")[0]!["contem"]).toEqual(["implante", "IMPLANTES"]);
  });

  it("o cooldown é preso entre 0 e um ano", async () => {
    await salvarRegraSocial(regra({ nome: "A", cooldownHoras: -50 }));
    await salvarRegraSocial(regra({ nome: "B", cooldownHoras: 999_999 }));

    expect(conteudo("crc_regras_sociais").map((l) => l["cooldown_horas"])).toEqual([0, 8760]);
  });

  it("nome vazio é recusado", async () => {
    const r = await salvarRegraSocial(regra({ nome: "   " }));

    expect(r.ok).toBe(false);
  });

  it("listar respeita o acesso por unidade — e a regra da organização é de todos", async () => {
    await salvarRegraSocial(regra({ nome: "Da organização", clinicId: null }));
    await salvarRegraSocial(regra({ nome: "Só da matriz", clinicId: CLINICA }));
    await salvarRegraSocial(regra({ nome: "Só do centro", clinicId: CLINICA_2 }));

    const todas = await listarRegrasSociais(ORG, null);
    expect(todas.map((r) => r.nome)).toEqual(["Da organização", "Só da matriz", "Só do centro"]);

    const daMatriz = await listarRegrasSociais(ORG, [CLINICA]);
    expect(daMatriz.map((r) => r.nome)).toEqual(["Da organização", "Só da matriz"]);
  });

  it("a organização B não vê as regras da A", async () => {
    await salvarRegraSocial(regra({ nome: "Da A" }));

    expect(await listarRegrasSociais(ORG_B, null)).toEqual([]);
  });

  it("remover só apaga dentro da própria organização", async () => {
    const daA = await salvarRegraSocial(regra({ nome: "Da A" }));
    expect(daA.ok).toBe(true);
    if (!daA.ok) return;

    await removerRegraSocial({ organizationId: ORG_B, id: daA.id, userId: USUARIO });
    expect(conteudo("crc_regras_sociais")).toHaveLength(1);

    await removerRegraSocial({ organizationId: ORG, id: daA.id, userId: USUARIO });
    expect(conteudo("crc_regras_sociais")).toHaveLength(0);
  });
});

describe("a regra de exemplo", () => {
  it("nasce INATIVA, com o veto de `capilar`, e sem private reply", async () => {
    /*
     * ==========================================================================
     *  O §79 monta o rollout em degraus, e "private reply automático" é o
     *  quarto. Uma regra que nascesse ativa atropelaria os três primeiros.
     *
     *  O valor dela é mostrar a FORMA — e `naoContem: ["capilar"]` é o falso
     *  positivo que acontece de verdade numa clínica odontológica.
     * ==========================================================================
     */
    const id = await semearRegraDeExemplo({ organizationId: ORG, clinicId: CLINICA, userId: null });

    expect(id).not.toBeNull();
    const linha = conteudo("crc_regras_sociais")[0]!;
    expect(linha["ativa"]).toBe(false);
    expect(linha["enviar_private_reply"]).toBe(false);
    expect(linha["nao_contem"]).toContain("capilar");
    expect(linha["exigir_captacao"]).toBe(true);
  });

  it("não semeia de novo se a organização já tem regra", async () => {
    // Semear a cada abertura da tela encheria a lista de exemplos iguais.
    await salvarRegraSocial(regra({ nome: "A minha" }));

    expect(
      await semearRegraDeExemplo({ organizationId: ORG, clinicId: CLINICA, userId: null }),
    ).toBeNull();
    expect(conteudo("crc_regras_sociais")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Os canais do paciente                                                      */
/* -------------------------------------------------------------------------- */

describe("os canais do paciente", () => {
  beforeEach(() => {
    semear("crc_patients", [
      {
        id: PACIENTE,
        organization_id: ORG,
        clinic_id: CLINICA,
        nome: "Ana Souza",
        external_source: "dental_office",
        external_id: "123",
      },
    ]);
    semear("crc_conversations", [
      {
        id: "conv-wa",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        canal: "whatsapp",
        contato_externo: "5511999990000",
        apelido_externo: null,
        status: "ABERTA",
        nao_lidas: 0,
        criado_em: "2026-09-01T10:00:00.000Z",
        ultima_mensagem_em: "2026-09-10T10:00:00.000Z",
      },
      {
        id: "conv-ig",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        canal: "instagram",
        contato_externo: "17841400000000001",
        apelido_externo: "ana.souza",
        status: "ABERTA",
        nao_lidas: 2,
        criado_em: "2026-09-05T10:00:00.000Z",
        ultima_mensagem_em: "2026-09-14T10:00:00.000Z",
      },
    ]);
  });

  it("mostra UMA linha por canal — e NUNCA o id de 17 dígitos", async () => {
    /*
     * ==========================================================================
     *  §24: o IGSID não é nome de gente. Mostrá-lo faria a recepção falar com
     *  "17841400000000001" na tela, e conferir identidade com o paciente pelo
     *  número seria impossível.
     *
     *  As conversas NÃO são fundidas: são janelas e políticas diferentes, e
     *  juntá-las faria a recepção responder no canal errado.
     * ==========================================================================
     */
    const canais = await canaisDoPaciente(ORG, PACIENTE);

    expect(canais).toHaveLength(2);
    // A mais recente primeiro: é por onde a pessoa está falando agora.
    expect(canais.map((c) => c.canal)).toEqual(["instagram", "whatsapp"]);

    const ig = canais[0]!;
    expect(ig.contato).toBe("@ana.souza");
    expect(ig.contato).not.toContain("17841400000000001");
    expect(ig.naoLidas).toBe(2);

    // O telefone é formatado por quem sabe formatar telefone.
    expect(canais[1]!.contato).toContain("(11)");
  });

  it("sem apelido, o Instagram mostra um rótulo humano — e ainda não o id", async () => {
    semear("crc_conversations", [
      {
        id: "conv-ig2",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        canal: "instagram",
        contato_externo: "17841400000000777",
        apelido_externo: null,
        status: "ABERTA",
        nao_lidas: 0,
        criado_em: "2026-09-06T10:00:00.000Z",
        ultima_mensagem_em: "2026-09-15T10:00:00.000Z",
      },
    ]);

    const canais = await canaisDoPaciente(ORG, PACIENTE);

    expect(canais[0]!.contato).not.toContain("17841400000000777");
    expect(canais[0]!.contato.length).toBeGreaterThan(0);
  });

  it("a conversa de outra organização não aparece", async () => {
    semear("crc_conversations", [
      {
        id: "conv-b",
        organization_id: ORG_B,
        clinic_id: CLINICA_2,
        patient_id: PACIENTE,
        canal: "instagram",
        contato_externo: "17841400000000888",
        status: "ABERTA",
        nao_lidas: 0,
        criado_em: "2026-09-06T10:00:00.000Z",
        ultima_mensagem_em: "2026-09-15T11:00:00.000Z",
      },
    ]);

    const canais = await canaisDoPaciente(ORG, PACIENTE);

    expect(canais.map((c) => c.conversationId)).toEqual(["conv-ig", "conv-wa"]);
  });
});

describe("a contagem de canais cadastrados", () => {
  it("conta só os ATIVOS da própria organização", async () => {
    const criado = await conectarCanalMeta(conexao());
    expect(criado.ok).toBe(true);
    if (!criado.ok) return;

    await conectarCanalMeta(conexaoDaVizinha());

    expect(await canaisMetaCadastrados(ORG)).toBe(1);

    await desativarCanalMeta({ organizationId: ORG, canalId: criado.canalId, userId: USUARIO });
    expect(await canaisMetaCadastrados(ORG)).toBe(0);
  });
});
