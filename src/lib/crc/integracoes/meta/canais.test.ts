/**
 * De quem é esta conta da Meta — §31, §32, §33.
 *
 * ============================================================================
 *  TRÊS DECISÕES QUE ESTE ARQUIVO GUARDA, E O QUE CUSTA CADA UMA.
 *
 *  1. NÃO EXISTE "PRIMEIRA CLÍNICA ATIVA" NA ENTRADA. Um webhook de conta não
 *     cadastrada é RECUSADO, e não atribuído a alguém. O custo de errar é um
 *     lead da Clínica B aparecendo na Clínica A — e, do lado do paciente, uma
 *     clínica que ele não conhece respondendo o direct dele.
 *
 *  2. O TOKEN NÃO VAI PARA A TELA. `CanalMetaParaTela` não TEM o campo. A
 *     prova aqui é de comportamento, não de tipo: a função de tela devolve
 *     `dica` e `temToken`, e o token em claro não aparece em nenhuma chave.
 *
 *  3. SEGREDO QUE NÃO DECIFRA RECUSA, e não cai para o ambiente. Cair faria a
 *     Clínica B mandar direct pela conta da A — o token do ambiente é de UMA
 *     Página específica.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../servidor/banco", async () => {
  const fake = await import("../../testes/banco-memoria");
  return fake;
});

vi.mock("../../servidor/registro", async () => {
  const real =
    await vi.importActual<typeof import("../../servidor/registro")>("../../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { cifrar } from "../../servidor/segredo";
import { limparBanco, semear } from "../../testes/banco-memoria";

import {
  appSecretDoCanal,
  canaisMetaParaTela,
  canalMetaDaClinica,
  canalMetaPorId,
  humanAgentAprovado,
  resolverTenantDaMeta,
  verifyTokenDoCanal,
  type CanalMeta,
} from "./canais";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "33333333-3333-4333-8333-333333333333";
const CLINICA_A = "22222222-2222-4222-8222-222222222222";
const CLINICA_A2 = "24444444-2222-4222-8222-222222222222";
const CLINICA_B = "44444444-4444-4444-8444-444444444444";

const PAGE_A = "104000000000001";
const IGID_A = "17841400000000099";
const PAGE_B = "104000000000002";
const IGID_B = "17841400000000199";

const TOKEN_A = "EAAG-token-da-pagina-da-clinica-A";

const CHAVE = Buffer.alloc(32, 11).toString("base64");

function linhaDeCanal(p: Record<string, unknown>): Record<string, unknown> {
  return {
    provider: "meta",
    produtos: ["instagram", "messenger"],
    page_id: null,
    instagram_account_id: null,
    display_name: "JP Clinica",
    username: "jpclinica",
    segredo_cifrado: null,
    dica: "",
    config: {},
    token_expira_em: null,
    permissoes: {},
    ativo: true,
    criado_em: "2026-09-01T00:00:00.000Z",
    ultimo_webhook_em: null,
    ultima_mensagem_em: null,
    ultimo_lead_em: null,
    ultimo_erro: null,
    ultimo_erro_em: null,
    ...p,
  };
}

beforeEach(() => {
  limparBanco();
  process.env["CRC_SEGREDO_CHAVE"] = CHAVE;
  delete process.env["META_APP_SECRET"];
  delete process.env["META_APP_ID"];
  delete process.env["META_WEBHOOK_VERIFY_TOKEN"];

  semear("crc_organizations", [
    { id: ORG_A, slug: "jp" },
    { id: ORG_B, slug: "vizinha" },
  ]);
  semear("crc_clinics", [
    { id: CLINICA_A, organization_id: ORG_A, slug: "jp-matriz", ativa: true },
    { id: CLINICA_A2, organization_id: ORG_A, slug: "jp-centro", ativa: true },
    { id: CLINICA_B, organization_id: ORG_B, slug: "vizinha", ativa: true },
  ]);
});

/* -------------------------------------------------------------------------- */
/* A entrada — de quem é este webhook                                         */
/* -------------------------------------------------------------------------- */

describe("o roteamento de tenant", () => {
  beforeEach(() => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-a",
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        page_id: PAGE_A,
        instagram_account_id: IGID_A,
      }),
      linhaDeCanal({
        id: "canal-b",
        organization_id: ORG_B,
        clinic_id: CLINICA_B,
        page_id: PAGE_B,
        instagram_account_id: IGID_B,
      }),
    ]);
  });

  it("acha pelo id da Página", async () => {
    const t = await resolverTenantDaMeta(PAGE_A);

    expect(t).toEqual({ canalId: "canal-a", organizationId: ORG_A, clinicId: CLINICA_A });
  });

  it("acha pelo id da conta do Instagram", async () => {
    // As duas colunas são consultadas, porque o envelope da Meta traz `entry.id`
    // como Página (`object: "page"`) ou como conta do Instagram
    // (`object: "instagram"`) — e o mesmo webhook pode chegar dos dois jeitos.
    const t = await resolverTenantDaMeta(IGID_A);

    expect(t?.organizationId).toBe(ORG_A);
    expect(t?.clinicId).toBe(CLINICA_A);
  });

  it("uma conta NÃO CADASTRADA é recusada — e não atribuída a ninguém", async () => {
    /*
     * ==========================================================================
     *  ESTE É O TESTE QUE `injetar-defeitos-meta.mjs` QUEBRA NO DEFEITO 2.
     *
     *  O §33 é explícito: se não conseguir resolver exatamente uma organização,
     *  FAIL CLOSED. `null` faz o envelope ir para `FALHOU` com motivo e esperar
     *  alguém cadastrar a conta.
     *
     *  A alternativa tentadora — "usa a primeira clínica ativa" — é exatamente
     *  o defeito que faz o lead de um cliente aparecer no CRM de outro.
     * ==========================================================================
     */
    expect(await resolverTenantDaMeta("999999999999999")).toBeNull();

    // E não é "achou a A porque ela é a primeira": a A existe e está ativa.
    expect(await resolverTenantDaMeta(PAGE_A)).not.toBeNull();
  });

  it("um canal DESATIVADO deixa de rotear — o desligamento vale na porta", async () => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-off",
        organization_id: ORG_A,
        clinic_id: CLINICA_A2,
        page_id: "104000000000009",
        ativo: false,
      }),
    ]);

    // Não adianta parar de enviar e continuar aceitando mensagem, criando
    // conversa e cobrando classificação de IA de um cliente desligado.
    expect(await resolverTenantDaMeta("104000000000009")).toBeNull();
  });

  it("conta vazia ou só espaço nem consulta o banco", async () => {
    expect(await resolverTenantDaMeta("")).toBeNull();
    expect(await resolverTenantDaMeta("   ")).toBeNull();
  });

  it("o canal da Clínica B nunca resolve para a organização A", async () => {
    const t = await resolverTenantDaMeta(PAGE_B);

    expect(t?.organizationId).toBe(ORG_B);
    expect(t?.organizationId).not.toBe(ORG_A);
  });
});

describe("o canal pelo id público da URL", () => {
  it("devolve o canal ativo, com o token já decifrado", async () => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-a",
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        page_id: PAGE_A,
        segredo_cifrado: cifrar(TOKEN_A),
        dica: "EAAG…A",
      }),
    ]);

    const canal = await canalMetaPorId("canal-a");

    expect(canal?.token).toBe(TOKEN_A);
    expect(canal?.organizationId).toBe(ORG_A);
  });

  it("canal desativado não é lido — nem para conferir assinatura", async () => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-off",
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        page_id: PAGE_A,
        ativo: false,
      }),
    ]);

    expect(await canalMetaPorId("canal-off")).toBeNull();
  });

  it("um segredo que não decifra RECUSA o canal, em vez de cair para o ambiente", async () => {
    /*
     * A chave do servidor mudou, ou alguém mexeu na coluna. Cair para o token
     * do ambiente aqui faria a Clínica B mandar direct pela conta da A — o
     * token da Meta é de UMA Página específica.
     */
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-quebrado",
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        page_id: PAGE_A,
        segredo_cifrado: "isto-nao-e-um-ciphertext-valido",
      }),
    ]);

    expect(await canalMetaPorId("canal-quebrado")).toBeNull();
  });

  it("id vazio nem consulta", async () => {
    expect(await canalMetaPorId("  ")).toBeNull();
  });
});

describe("o appSecret e o verifyToken do canal", () => {
  function canal(config: Record<string, unknown>): CanalMeta {
    return {
      id: "canal-a",
      organizationId: ORG_A,
      clinicId: CLINICA_A,
      produtos: ["instagram"],
      pageId: PAGE_A,
      instagramAccountId: IGID_A,
      displayName: "JP",
      username: "jp",
      token: TOKEN_A,
      config,
      tokenExpiraEm: null,
      permissoes: {},
      ativo: true,
    };
  }

  it("o do CANAL vence o do ambiente", async () => {
    /*
     * ==========================================================================
     *  O DIA EM QUE DOIS CLIENTES TRAZEM OS PRÓPRIOS APLICATIVOS.
     *
     *  Com um app só, o segredo do ambiente está certo. No instante em que
     *  aparece o segundo, o segredo de A não valida a assinatura de B: a
     *  mensagem legítima de B é recusada, e — pior — qualquer corpo assinado com
     *  o segredo de A passa dizendo ser de quem quiser.
     * ==========================================================================
     */
    process.env["META_APP_ID"] = "app-do-ambiente";
    process.env["META_APP_SECRET"] = "segredo-do-ambiente";
    process.env["META_WEBHOOK_VERIFY_TOKEN"] = "verify-do-ambiente";

    expect(appSecretDoCanal(canal({ appSecret: "segredo-do-canal" }))).toBe("segredo-do-canal");
    expect(verifyTokenDoCanal(canal({ verifyToken: "verify-do-canal" }))).toBe("verify-do-canal");
  });

  it("sem o do canal, cai para o do ambiente — é a compatibilidade de hoje", async () => {
    process.env["META_APP_ID"] = "app";
    process.env["META_APP_SECRET"] = "segredo-do-ambiente";
    process.env["META_WEBHOOK_VERIFY_TOKEN"] = "verify-do-ambiente";

    expect(appSecretDoCanal(canal({}))).toBe("segredo-do-ambiente");
    expect(verifyTokenDoCanal(canal({}))).toBe("verify-do-ambiente");
  });

  it("o segredo NÃO depende de `META_APP_ID` — ele não participa do HMAC", async () => {
    /*
     * ==========================================================================
     *  REGRESSÃO, ENCONTRADA POR UM E2E.
     *
     *  Enquanto isto passava por `appDoAmbiente()` — que é tudo-ou-nada —, um
     *  deploy com o segredo CERTO e sem `META_APP_ID` recusava TODO webhook
     *  com `motivo: "sem_segredo"`.
     *
     *  O sintoma manda a pessoa conferir o segredo, que está certo. A variável
     *  que falta aparece agora com o próprio nome, em `appDoAmbiente().faltando`
     *  — e não disfarçada de segredo ausente.
     * ==========================================================================
     */
    delete process.env["META_APP_ID"];
    process.env["META_APP_SECRET"] = "segredo-do-ambiente";
    process.env["META_WEBHOOK_VERIFY_TOKEN"] = "verify-do-ambiente";

    expect(appSecretDoCanal(canal({}))).toBe("segredo-do-ambiente");
    expect(verifyTokenDoCanal(canal({}))).toBe("verify-do-ambiente");
  });

  it("sem nenhum dos dois, devolve VAZIO — e a assinatura falha fechada", async () => {
    // String vazia é o que `verificarAssinaturaMeta` recusa com
    // `motivo: "sem_segredo"`. Devolver um placeholder aqui faria a conferência
    // rodar contra um valor conhecido, que é pior que não conferir.
    expect(appSecretDoCanal(canal({}))).toBe("");
    expect(verifyTokenDoCanal(canal({}))).toBe("");
    expect(appSecretDoCanal(canal({ appSecret: "   " }))).toBe("");
  });

  it("Human Agent é FALSO por padrão — a feature exige App Review", async () => {
    // Um sistema que assume aprovação envia com a etiqueta fora das 24h, a Meta
    // recusa com `(#10) permission`, e o erro não parece com "falta App Review".
    expect(humanAgentAprovado(canal({}))).toBe(false);
    expect(humanAgentAprovado(canal({ humanAgentAprovado: "true" }))).toBe(false);
    expect(humanAgentAprovado(canal({ humanAgentAprovado: 1 }))).toBe(false);
    expect(humanAgentAprovado(canal({ humanAgentAprovado: true }))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* A saída — qual conta usar para enviar                                      */
/* -------------------------------------------------------------------------- */

describe("o canal da clínica, para enviar", () => {
  it("o produto ENTRA na busca: uma conta só de Lead Ads não manda direct", async () => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-lead",
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        produtos: ["lead_ads"],
        page_id: PAGE_A,
        segredo_cifrado: cifrar(TOKEN_A),
      }),
    ]);

    const r = await canalMetaDaClinica(ORG_A, CLINICA_A, "instagram");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Recusar aqui diz o que falta. A alternativa seria a Graph responder
    // `(#10)` — um erro correto com uma explicação inútil.
    expect(r.faltando).toEqual(["produtos.instagram"]);
    expect(r.motivo).toContain("instagram");
  });

  it("sem conta cadastrada, diz que a TABELA está vazia — e não que falta produto", async () => {
    const r = await canalMetaDaClinica(ORG_A, CLINICA_A, "instagram");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltando).toEqual(["crc_canais_meta"]);
  });

  it("DUAS contas ativas sem clínica informada é RECUSA, e não escolha", async () => {
    /*
     * ==========================================================================
     *  ESCOLHER A PRIMEIRA É O DEFEITO DE ORIGEM.
     *
     *  Uma organização com duas contas da Meta ativas e uma operação que não
     *  disse de qual clínica é não tem resposta certa. Do lado do paciente, o
     *  erro aparece como uma clínica que ele não conhece respondendo o direct
     *  dele.
     * ==========================================================================
     */
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-1",
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        page_id: PAGE_A,
        instagram_account_id: IGID_A,
        segredo_cifrado: cifrar(TOKEN_A),
        criado_em: "2026-09-01T00:00:00.000Z",
      }),
      linhaDeCanal({
        id: "canal-2",
        organization_id: ORG_A,
        clinic_id: CLINICA_A2,
        page_id: "104000000000003",
        instagram_account_id: "17841400000000299",
        segredo_cifrado: cifrar("outro-token"),
        criado_em: "2026-09-02T00:00:00.000Z",
      }),
    ]);

    const semClinica = await canalMetaDaClinica(ORG_A, null, "instagram");
    expect(semClinica.ok).toBe(false);
    if (!semClinica.ok) expect(semClinica.motivo).toContain("mais de uma");

    // Com a clínica, resolve — o grão é a clínica.
    const comClinica = await canalMetaDaClinica(ORG_A, CLINICA_A2, "instagram");
    expect(comClinica.ok).toBe(true);
    if (comClinica.ok) expect(comClinica.canal.id).toBe("canal-2");
  });

  it("canal SEM token recebe e não envia, com motivo que diz o que fazer", async () => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-so-recebe",
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        page_id: PAGE_A,
        instagram_account_id: IGID_A,
        segredo_cifrado: null,
      }),
    ]);

    const r = await canalMetaDaClinica(ORG_A, CLINICA_A, "instagram");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltando).toEqual(["token"]);
  });

  it("sem organização, recusa antes de consultar", async () => {
    const r = await canalMetaDaClinica("  ", CLINICA_A, "instagram");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltando).toEqual(["organizationId"]);
  });

  it("a conta da organização B nunca serve para a A", async () => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-b",
        organization_id: ORG_B,
        clinic_id: CLINICA_B,
        page_id: PAGE_B,
        instagram_account_id: IGID_B,
        segredo_cifrado: cifrar("token-da-b"),
      }),
    ]);

    const r = await canalMetaDaClinica(ORG_A, null, "instagram");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.faltando).toEqual(["crc_canais_meta"]);
  });
});

/* -------------------------------------------------------------------------- */
/* A tela                                                                     */
/* -------------------------------------------------------------------------- */

describe("o que vai para a tela", () => {
  beforeEach(() => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-a",
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        page_id: PAGE_A,
        instagram_account_id: IGID_A,
        segredo_cifrado: cifrar(TOKEN_A),
        dica: "EAAG…A",
        permissoes: { instagram_basic: "2026-09-15", pages_messaging: "2026-09-15" },
      }),
    ]);
  });

  it("leva a DICA e NUNCA o token — em nenhuma chave do objeto", async () => {
    /*
     * ==========================================================================
     *  A PROVA É POR VARREDURA, E NÃO POR CAMPO.
     *
     *  Conferir `canal.token === undefined` provaria só que aquele nome não
     *  está lá. O serializado inteiro é varrido: se o token aparecer sob
     *  qualquer chave — `segredo_cifrado` incluído, que decifrado é o token —
     *  o teste falha.
     * ==========================================================================
     */
    const canais = await canaisMetaParaTela(ORG_A, null);

    expect(canais).toHaveLength(1);
    const serializado = JSON.stringify(canais[0]);

    expect(serializado).not.toContain(TOKEN_A);
    expect(serializado).not.toContain("segredo_cifrado");
    expect(canais[0]!.dica).toBe("EAAG…A");
    expect(canais[0]!.temToken).toBe(true);
    expect(canais[0]!.permissoes).toEqual(["instagram_basic", "pages_messaging"]);
  });

  it("um canal sem token aparece com `temToken: false`, e não escondido", async () => {
    // O estado "cadastrado para receber, sem token de envio" é legítimo e
    // precisa ser VISÍVEL: é o que explica por que a resposta não sai.
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-sem",
        organization_id: ORG_A,
        clinic_id: CLINICA_A2,
        page_id: "104000000000003",
        segredo_cifrado: null,
        criado_em: "2026-09-03T00:00:00.000Z",
      }),
    ]);

    const canais = await canaisMetaParaTela(ORG_A, null);

    expect(canais.map((c) => c.temToken)).toEqual([true, false]);
  });

  it("o canal DESATIVADO aparece na tela — é ele que explica o silêncio", async () => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-off",
        organization_id: ORG_A,
        clinic_id: CLINICA_A2,
        page_id: "104000000000004",
        ativo: false,
        criado_em: "2026-09-04T00:00:00.000Z",
      }),
    ]);

    const canais = await canaisMetaParaTela(ORG_A, null);

    expect(canais).toHaveLength(2);
    expect(canais.map((c) => c.ativo)).toEqual([true, false]);
  });

  it("um acesso restrito a UMA unidade não enxerga a conta da outra", async () => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-a2",
        organization_id: ORG_A,
        clinic_id: CLINICA_A2,
        page_id: "104000000000003",
        criado_em: "2026-09-03T00:00:00.000Z",
      }),
    ]);

    expect(await canaisMetaParaTela(ORG_A, [CLINICA_A2])).toHaveLength(1);
    expect((await canaisMetaParaTela(ORG_A, [CLINICA_A2]))[0]!.id).toBe("canal-a2");
  });

  it("acesso a NENHUMA unidade devolve lista vazia, e não a lista toda", async () => {
    // `[]` significa "este usuário não tem unidade nenhuma". Tratá-lo como
    // "sem filtro" é o defeito clássico de escopo — e devolveria tudo.
    expect(await canaisMetaParaTela(ORG_A, [])).toEqual([]);
  });

  it("a organização B não aparece na lista da A", async () => {
    semear("crc_canais_meta", [
      linhaDeCanal({
        id: "canal-b",
        organization_id: ORG_B,
        clinic_id: CLINICA_B,
        page_id: PAGE_B,
      }),
    ]);

    const canais = await canaisMetaParaTela(ORG_A, null);

    expect(canais.map((c) => c.id)).toEqual(["canal-a"]);
  });
});
