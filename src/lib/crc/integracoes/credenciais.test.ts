/**
 * Credencial de quem, exatamente — o isolamento entre tenants.
 *
 * ============================================================================
 *  O QUE ESTES TESTES PRENDEM, e o defeito era estrutural: não existia
 *  resolução por tenant. `crc_canais_whatsapp` e `crc_integracoes_clinica`
 *  foram criadas no `supabase/23` e nenhuma linha de runtime as lia. Todo
 *  provedor era montado a partir de `process.env` — UMA conta do Dental Office
 *  e UM número de WhatsApp para a instalação inteira.
 *
 *  Com um cliente, correto por acidente. Com dois, a Clínica B escreve na conta
 *  da A e responde pelo número da A — e nada falha: funciona, no lugar errado.
 *
 *  TRÊS PROTEÇÕES, TRÊS INJEÇÕES DE DEFEITO:
 *
 *    1. resolução por tenant     → ler só do ambiente faz A e B receberem a
 *                                  mesma credencial
 *    2. ambiente se auto-desliga → tirar a checagem de ambiguidade faz o
 *                                  ambiente atender duas organizações
 *    3. cache de token por chave → voltar ao `let cache` singleton faz B
 *                                  receber o token da A
 * ============================================================================
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

import {
  _limparContagemDeTenants,
  credenciaisDentalOffice,
  credenciaisWhatsapp,
} from "./credenciais";

const ORG_A = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_B = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** 32 bytes fixos: o teste precisa de determinismo, não de entropia. */
const CHAVE_DA_CIFRA = Buffer.alloc(32, 7).toString("base64");

function duasOrganizacoes(): void {
  semear("crc_organizations", [
    { id: ORG_A, nome: "Clínica A", slug: "a" },
    { id: ORG_B, nome: "Clínica B", slug: "b" },
  ]);
  semear("crc_clinics", [
    { id: CLINICA_A, organization_id: ORG_A, nome: "A", slug: "matriz", ativa: true },
    { id: CLINICA_B, organization_id: ORG_B, nome: "B", slug: "matriz", ativa: true },
  ]);
}

beforeEach(() => {
  limparBanco();
  _limparContagemDeTenants();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("CRC_SEGREDO_CHAVE", CHAVE_DA_CIFRA);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/* -------------------------------------------------------------------------- */
/* Dental Office                                                              */
/* -------------------------------------------------------------------------- */

describe("as credenciais do Dental Office", () => {
  it("A recebe as de A e B as de B — nunca as do ambiente", async () => {
    duasOrganizacoes();
    // O ambiente está configurado COM UMA TERCEIRA CONTA, de propósito: se
    // qualquer um dos dois cair nele, a asserção denuncia.
    vi.stubEnv("DENTAL_OFFICE_BASE_URL", "https://ambiente.example.com");
    vi.stubEnv("DENTAL_OFFICE_CLIENT_ID", "cliente-do-ambiente");
    vi.stubEnv("DENTAL_OFFICE_SECRET", "segredo-do-ambiente");

    semear("crc_integracoes_clinica", [
      {
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        sistema: "dental_office",
        base_url: "https://a.example.com",
        client_id: "cli-A",
        segredo_cifrado: cifrar("segredo-A"),
        ativo: true,
      },
      {
        organization_id: ORG_B,
        clinic_id: CLINICA_B,
        sistema: "dental_office",
        base_url: "https://b.example.com",
        client_id: "cli-B",
        segredo_cifrado: cifrar("segredo-B"),
        ativo: true,
      },
    ]);

    const a = await credenciaisDentalOffice(ORG_A, CLINICA_A);
    const b = await credenciaisDentalOffice(ORG_B, CLINICA_B);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    expect(a.credenciais).toEqual({
      baseUrl: "https://a.example.com",
      clientId: "cli-A",
      secret: "segredo-A",
    });
    expect(b.credenciais.secret).toBe("segredo-B");

    // A CHAVE DE CACHE PRECISA DIFERIR, senão o token de um serve o outro.
    expect(a.chave).not.toBe(b.chave);
    // E ela NUNCA carrega o segredo em claro — ver `impressao()`.
    expect(a.chave).not.toContain("segredo-A");
  });

  it("o ambiente SE DESLIGA quando existe mais de uma organização", async () => {
    duasOrganizacoes();
    vi.stubEnv("DENTAL_OFFICE_BASE_URL", "https://ambiente.example.com");
    vi.stubEnv("DENTAL_OFFICE_CLIENT_ID", "cliente-do-ambiente");
    vi.stubEnv("DENTAL_OFFICE_SECRET", "segredo-do-ambiente");
    // Nenhuma linha cadastrada: o único caminho restante é o ambiente.

    const r = await credenciaisDentalOffice(ORG_A, CLINICA_A);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("mais de uma organização");
  });

  it("com UMA organização, o ambiente continua valendo — a JP não quebra", async () => {
    /*
     * ESTE TESTE É O CONTRAPESO DO ANTERIOR. Um isolamento que exige cadastrar
     * credencial no banco antes de qualquer coisa derrubaria a instalação que
     * já funciona — e "mais seguro" que impede a clínica de atender não é mais
     * seguro, é desligado.
     */
    semear("crc_organizations", [{ id: ORG_A, nome: "Clínica A", slug: "a" }]);
    semear("crc_clinics", [
      { id: CLINICA_A, organization_id: ORG_A, nome: "A", slug: "matriz", ativa: true },
    ]);
    vi.stubEnv("DENTAL_OFFICE_BASE_URL", "https://ambiente.example.com");
    vi.stubEnv("DENTAL_OFFICE_CLIENT_ID", "cliente-do-ambiente");
    vi.stubEnv("DENTAL_OFFICE_SECRET", "segredo-do-ambiente");

    const r = await credenciaisDentalOffice(ORG_A, CLINICA_A);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.origem).toBe("ambiente");
  });

  it("segredo que não decifra RECUSA — não cai para o ambiente", async () => {
    /*
     * A linha existe e diz de quem é. Cair no ambiente aqui faria a Clínica B
     * escrever na conta do ambiente, que é a da A — exatamente o defeito que
     * este arquivo existe para matar, entrando pela porta do tratamento de erro.
     */
    duasOrganizacoes();
    vi.stubEnv("DENTAL_OFFICE_BASE_URL", "https://ambiente.example.com");
    vi.stubEnv("DENTAL_OFFICE_CLIENT_ID", "cliente-do-ambiente");
    vi.stubEnv("DENTAL_OFFICE_SECRET", "segredo-do-ambiente");

    semear("crc_integracoes_clinica", [
      {
        organization_id: ORG_B,
        clinic_id: CLINICA_B,
        sistema: "dental_office",
        base_url: "https://b.example.com",
        client_id: "cli-B",
        segredo_cifrado: "v1:naoeisso:naoeisso:naoeisso",
        ativo: true,
      },
    ]);

    const r = await credenciaisDentalOffice(ORG_B, CLINICA_B);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("decifrada");
  });

  it("duas contas na mesma organização e nenhuma clínica dita: RECUSA", async () => {
    semear("crc_organizations", [{ id: ORG_A, nome: "Rede", slug: "rede" }]);
    semear("crc_clinics", [
      { id: CLINICA_A, organization_id: ORG_A, nome: "A", slug: "a", ativa: true },
      { id: CLINICA_B, organization_id: ORG_A, nome: "B", slug: "b", ativa: true },
    ]);
    semear("crc_integracoes_clinica", [
      {
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        sistema: "dental_office",
        base_url: "https://a.example.com",
        client_id: "cli-A",
        segredo_cifrado: cifrar("segredo-A"),
        ativo: true,
      },
      {
        organization_id: ORG_A,
        clinic_id: CLINICA_B,
        sistema: "dental_office",
        base_url: "https://b.example.com",
        client_id: "cli-B",
        segredo_cifrado: cifrar("segredo-B"),
        ativo: true,
      },
    ]);

    // Trabalho da organização inteira (sincronização de pacientes) com duas
    // contas: não existe resposta certa, e escolher uma é o defeito de origem.
    const r = await credenciaisDentalOffice(ORG_A, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("mais de uma conta");
  });
});

/* -------------------------------------------------------------------------- */
/* WhatsApp                                                                   */
/* -------------------------------------------------------------------------- */

describe("o canal de WhatsApp", () => {
  it("cada clínica responde pelo próprio número", async () => {
    semear("crc_organizations", [{ id: ORG_A, nome: "Rede", slug: "rede" }]);
    semear("crc_clinics", [
      { id: CLINICA_A, organization_id: ORG_A, nome: "A", slug: "a", ativa: true },
      { id: CLINICA_B, organization_id: ORG_A, nome: "B", slug: "b", ativa: true },
    ]);
    semear("crc_canais_whatsapp", [
      {
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        provedor: "meta_cloud",
        identificador: "phone-A",
        segredo_cifrado: cifrar("token-A"),
        config: { appSecret: "app-A" },
        ativo: true,
      },
      {
        organization_id: ORG_A,
        clinic_id: CLINICA_B,
        provedor: "meta_cloud",
        identificador: "phone-B",
        segredo_cifrado: cifrar("token-B"),
        config: { appSecret: "app-B" },
        ativo: true,
      },
    ]);

    const a = await credenciaisWhatsapp(ORG_A, CLINICA_A);
    const b = await credenciaisWhatsapp(ORG_A, CLINICA_B);

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    // O `identificador` é a MESMA chave que o webhook usa para rotear a
    // entrada. Entrada e saída pelo mesmo número, ou o paciente recebe resposta
    // de uma clínica que não é a que ele procurou.
    expect(a.credenciais.identificador).toBe("phone-A");
    expect(b.credenciais.identificador).toBe("phone-B");
    expect(a.credenciais.segredo).toBe("token-A");
    expect(b.credenciais.segredo).toBe("token-B");
  });

  it("dois canais ativos e nenhuma clínica dita: RECUSA em vez de escolher", async () => {
    semear("crc_organizations", [{ id: ORG_A, nome: "Rede", slug: "rede" }]);
    semear("crc_clinics", [
      { id: CLINICA_A, organization_id: ORG_A, nome: "A", slug: "a", ativa: true },
      { id: CLINICA_B, organization_id: ORG_A, nome: "B", slug: "b", ativa: true },
    ]);
    semear("crc_canais_whatsapp", [
      {
        organization_id: ORG_A,
        clinic_id: CLINICA_A,
        provedor: "meta_cloud",
        identificador: "phone-A",
        segredo_cifrado: cifrar("token-A"),
        config: { appSecret: "app-A" },
        ativo: true,
      },
      {
        organization_id: ORG_A,
        clinic_id: CLINICA_B,
        provedor: "meta_cloud",
        identificador: "phone-B",
        segredo_cifrado: cifrar("token-B"),
        config: { appSecret: "app-B" },
        ativo: true,
      },
    ]);

    const r = await credenciaisWhatsapp(ORG_A, null);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("mais de um canal");
  });

  it("o ambiente se desliga com mais de uma CLÍNICA — o grão do número é a unidade", async () => {
    semear("crc_organizations", [{ id: ORG_A, nome: "Rede", slug: "rede" }]);
    semear("crc_clinics", [
      { id: CLINICA_A, organization_id: ORG_A, nome: "A", slug: "a", ativa: true },
      { id: CLINICA_B, organization_id: ORG_A, nome: "B", slug: "b", ativa: true },
    ]);

    const r = await credenciaisWhatsapp(ORG_A, CLINICA_A);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("mais de uma clínica");
  });
});

/* -------------------------------------------------------------------------- */
/* O cache de token                                                           */
/* -------------------------------------------------------------------------- */

describe("o cache de token do Dental Office", () => {
  it("NÃO serve o token de A para uma chamada de B", async () => {
    /*
     * ESTE É O TESTE DO SINGLETON. A versão anterior guardava `let cache` — um
     * token para o processo inteiro. Com credencial por clínica, a segunda
     * chamada receberia o token da primeira e a requisição FUNCIONARIA,
     * escrevendo na conta errada. É o pior modo de falha de um cache: correto
     * no HTTP, errado no dono do dado.
     */
    const pedidos: string[] = [];
    vi.stubGlobal("fetch", (url: string, init: { body?: string }) => {
      const corpo = JSON.parse(String(init.body ?? "{}")) as { client_id?: string };
      pedidos.push(String(corpo.client_id ?? ""));
      return Promise.resolve(
        new Response(
          JSON.stringify({ token: `tok-${String(corpo.client_id)}`, expires_in: 3600 }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    });

    const { _limparCacheDeToken, obterToken } = await import("./dental-office/auth");
    _limparCacheDeToken();

    const credA = { baseUrl: "https://a.example.com", clientId: "cli-A", secret: "sA" };
    const credB = { baseUrl: "https://b.example.com", clientId: "cli-B", secret: "sB" };

    const tokenA = await obterToken("chave-A", credA);
    const tokenB = await obterToken("chave-B", credB);

    expect(tokenA).toBe("tok-cli-A");
    expect(tokenB).toBe("tok-cli-B");
    // Duas autenticações, uma por credencial. Com o singleton seria UMA.
    expect(pedidos).toEqual(["cli-A", "cli-B"]);
  });

  it("a MESMA chave reaproveita — o cache continua sendo um cache", async () => {
    let autenticacoes = 0;
    vi.stubGlobal("fetch", () => {
      autenticacoes += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ token: "tok", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });

    const { _limparCacheDeToken, obterToken } = await import("./dental-office/auth");
    _limparCacheDeToken();

    const cred = { baseUrl: "https://a.example.com", clientId: "cli-A", secret: "sA" };
    await obterToken("mesma", cred);
    await obterToken("mesma", cred);

    expect(autenticacoes).toBe(1);
  });
});
