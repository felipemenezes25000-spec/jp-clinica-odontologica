/**
 * A entrada roteada por canal — a metade do multi-tenant que faltava.
 *
 * ============================================================================
 *  A SAÍDA JÁ ERA SEGURA; A ENTRADA NÃO.
 *
 *  Na saída o CRC sabe de quem é a mensagem: ele tem a conversa, e a conversa
 *  tem a clínica. Na ENTRADA não sabe — o corpo do webhook é justamente o que
 *  diz de quem é, e ele ainda não pode ser confiado, porque a assinatura não
 *  foi conferida.
 *
 *  E a assinatura precisa da credencial DAQUELE canal. Com dois Meta Apps:
 *
 *    o segredo de A não valida a assinatura de B  → mensagem legítima recusada;
 *    se só A estiver cadastrado                   → qualquer corpo assinado por
 *                                                   A passa, dizendo ser de quem
 *                                                   quiser.
 *
 *  O `:canal` da URL quebra a circularidade. Ele é um identificador PÚBLICO —
 *  um uuid que só diz qual linha ler. Quem o descobre ainda precisa assinar o
 *  corpo com o segredo daquele canal.
 * ============================================================================
 *
 * O QUE ESTES TESTES PRENDEM é a cadeia inteira: carregar o canal certo, montar
 * o adapter com a credencial dele, e recusar quando o corpo aponta para outro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return { ...fake };
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { limparBanco, semear } from "../testes/banco-memoria";
import { cifrar } from "../servidor/segredo";

import { canalPorId, _limparContagemDeTenants } from "./credenciais";
import { provedorDoCanal } from "./whatsapp/provedores";

const ORG_A = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_B = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CANAL_A = "aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CANAL_B = "bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const CHAVE_DA_CIFRA = Buffer.alloc(32, 7).toString("base64");

function doisTenants(): void {
  semear("crc_organizations", [
    { id: ORG_A, nome: "Clínica A", slug: "a" },
    { id: ORG_B, nome: "Odonto B", slug: "b" },
  ]);
  semear("crc_clinics", [
    { id: CLINICA_A, organization_id: ORG_A, nome: "A", slug: "matriz", ativa: true },
    { id: CLINICA_B, organization_id: ORG_B, nome: "B", slug: "matriz", ativa: true },
  ]);
  semear("crc_canais_whatsapp", [
    {
      id: CANAL_A,
      organization_id: ORG_A,
      clinic_id: CLINICA_A,
      provedor: "meta_cloud",
      identificador: "phone-A",
      segredo_cifrado: cifrar("token-de-envio-A"),
      // CADA TENANT COM O PRÓPRIO META APP: é o cenário que a rota do ambiente
      // não atende.
      config: { appSecret: "app-secret-A", verifyToken: "verify-A" },
      ativo: true,
    },
    {
      id: CANAL_B,
      organization_id: ORG_B,
      clinic_id: CLINICA_B,
      provedor: "meta_cloud",
      identificador: "phone-B",
      segredo_cifrado: cifrar("token-de-envio-B"),
      config: { appSecret: "app-secret-B", verifyToken: "verify-B" },
      ativo: true,
    },
  ]);
}

/**
 * Um cenario com UM canal so, montado do zero.
 *
 * `semear` ACRESCENTA — nao substitui. Ressemear o mesmo id em cima do anterior
 * deixaria duas linhas com o mesmo uuid, e a busca devolveria a primeira: o
 * teste passaria lendo o canal que ele achava ter substituido. Limpar e montar
 * de novo e a unica forma honesta.
 */
function apenasOCanal(extras: Record<string, unknown>): void {
  limparBanco();
  _limparContagemDeTenants();
  semear("crc_organizations", [{ id: ORG_A, nome: "Clínica A", slug: "a" }]);
  semear("crc_clinics", [
    { id: CLINICA_A, organization_id: ORG_A, nome: "A", slug: "matriz", ativa: true },
  ]);
  semear("crc_canais_whatsapp", [
    {
      id: CANAL_A,
      organization_id: ORG_A,
      clinic_id: CLINICA_A,
      provedor: "meta_cloud",
      identificador: "phone-A",
      segredo_cifrado: cifrar("token-de-envio-A"),
      config: { appSecret: "app-secret-A" },
      ativo: true,
      ...extras,
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  _limparContagemDeTenants();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CRC_SEGREDO_CHAVE", CHAVE_DA_CIFRA);
  // O sandbox ligaria em toda montagem e esconderia o canal — aqui o que se
  // testa é justamente qual credencial sobe.
  vi.stubEnv("WHATSAPP_SANDBOX", "0");
  vi.stubEnv("WHATSAPP_PROVEDOR", "meta");
  doisTenants();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* -------------------------------------------------------------------------- */

describe("carregar o canal pelo id público", () => {
  it("devolve o tenant e a credencial DAQUELE canal", async () => {
    const a = await canalPorId(CANAL_A);

    expect(a?.organizationId).toBe(ORG_A);
    expect(a?.clinicId).toBe(CLINICA_A);
    expect(a?.identificador).toBe("phone-A");
    expect(a?.segredo).toBe("token-de-envio-A");
    expect(a?.config["appSecret"]).toBe("app-secret-A");
  });

  it("canais diferentes devolvem credenciais diferentes", async () => {
    const a = await canalPorId(CANAL_A);
    const b = await canalPorId(CANAL_B);

    // É a asserção inteira do multi-tenant de entrada: a assinatura de B nunca
    // é conferida com o segredo de A.
    expect(a?.segredo).not.toBe(b?.segredo);
    expect(a?.config["appSecret"]).not.toBe(b?.config["appSecret"]);
    expect(a?.organizationId).not.toBe(b?.organizationId);
  });

  it("canal DESATIVADO falha fechado", async () => {
    /*
     * O desligamento de um cliente tem que valer na porta de ENTRADA. Não
     * adianta parar de enviar e continuar aceitando mensagem: a conversa
     * continuaria crescendo, e a automação continuaria sendo acionada.
     */
    apenasOCanal({ ativo: false });

    expect(await canalPorId(CANAL_A)).toBeNull();
  });

  it("canal inexistente falha fechado", async () => {
    expect(await canalPorId("99999999-9999-4999-8999-999999999999")).toBeNull();
  });

  it("segredo que não decifra falha fechado — e não cai em outra credencial", async () => {
    /*
     * O PIOR DESFECHO SERIA CAIR NO AMBIENTE. A linha existe e diz de quem é;
     * verificar a assinatura com outra credencial qualquer é exatamente o
     * defeito que esta rota veio matar.
     */
    apenasOCanal({ segredo_cifrado: "v1:naoeisso:naoeisso:naoeisso" });

    expect(await canalPorId(CANAL_A)).toBeNull();
  });
});

describe("montar o provedor do canal", () => {
  it("cada canal sobe com o appSecret dele", async () => {
    const a = await provedorDoCanal(CANAL_A);
    const b = await provedorDoCanal(CANAL_B);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(a.canal.organizationId).toBe(ORG_A);
    expect(b.canal.organizationId).toBe(ORG_B);
    expect(a.canal.identificador).toBe("phone-A");
    expect(b.canal.identificador).toBe("phone-B");
    expect(a.porta.nome).toBe("meta_cloud");
  });

  it("um canal sem appSecret RECUSA — sem ele não dá para conferir assinatura", async () => {
    /*
     * Falhar fechado aqui é o ponto: um canal que recebe mensagem e não
     * consegue provar a origem dela é pior do que um canal desligado, porque a
     * automação obedeceria a qualquer um que descobrisse a URL.
     */
    apenasOCanal({ config: {} });

    const r = await provedorDoCanal(CANAL_A);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("appSecret");
  });

  it("canal desconhecido não monta provedor nenhum", async () => {
    const r = await provedorDoCanal("99999999-9999-4999-8999-999999999999");
    expect(r.ok).toBe(false);
  });

  it("o canal WAHA continua exigindo o aceite de risco, mesmo vindo do banco", async () => {
    /*
     * Cadastrar o canal no banco não pode virar um atalho para ligar o WAHA sem
     * alguém aceitar o risco: ele automatiza o WhatsApp Web e o número pode ser
     * banido, levando junto o histórico inteiro de conversas.
     */
    apenasOCanal({
      provedor: "waha",
      identificador: "sessao-A",
      config: { url: "https://waha.exemplo" },
    });

    const r = await provedorDoCanal(CANAL_A);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("WAHA_EU_ACEITO_O_RISCO");
  });
});
