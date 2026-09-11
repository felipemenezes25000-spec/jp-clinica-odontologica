/**
 * O login quando o mesmo e-mail existe em duas organizações.
 *
 * ========================================================================
 *  O SCHEMA E O LOGIN DEFENDIAM MODELOS DIFERENTES.
 *
 *  `crc_users` tem `unique (organization_id, email)`: o mesmo e-mail PODE
 *  existir em duas organizações, e isso é intencional num SaaS — um dentista
 *  que atende em duas clínicas.
 *
 *  Só que `entrar()` buscava com `selecionarUm` filtrando SÓ por e-mail, sem
 *  ordenação. Pegava uma linha arbitrária, e conferia a senha DELA. Quem tem
 *  duas contas com senhas diferentes entrava ou não dependendo de qual linha o
 *  banco devolvesse — com a mensagem "e-mail ou senha incorretos", que manda a
 *  pessoa procurar no lugar errado.
 * ========================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("./registro", async () => {
  const real = await vi.importActual<typeof import("./registro")>("./registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { criarUsuario, entrar } from "./sessao";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

/**
 * Cria o usuário pelo caminho de produção.
 *
 * `criarUsuario` é quem sabe embaralhar a senha, e usá-lo aqui garante que o
 * teste confere o MESMO formato de hash que o sistema grava — um `semear` com
 * hash montado à mão testaria contra um formato que talvez já tenha mudado.
 */
async function usuario(organizationId: string, senha: string): Promise<void> {
  await criarUsuario({
    organizationId,
    nome: "Dr. João",
    email: "dentista@exemplo.com",
    senha,
    papel: "gestor",
    clinicIds: [],
  });
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [
    { id: ORG_A, slug: "clinica-a", nome: "Clínica A" },
    { id: ORG_B, slug: "clinica-b", nome: "Clínica B" },
  ]);
});

/* -------------------------------------------------------------------------- */

describe("o mesmo e-mail em duas organizações", () => {
  it("entra na organização cuja SENHA bate, e não na primeira cadastrada", async () => {
    /*
     * A Clínica A é a mais antiga — a que a versão anterior escolheria. A senha
     * correta é a da B. Antes, isto devolvia "e-mail ou senha incorretos".
     */
    await usuario(ORG_A, "senha-da-clinica-a");
    await usuario(ORG_B, "senha-da-clinica-b");

    const r = await entrar("dentista@exemplo.com", "senha-da-clinica-b");

    expect(r.ok).toBe(true);
    expect(r.ok && r.sessao.organizationId).toBe(ORG_B);
  });

  it("e na outra, com a outra senha", async () => {
    // O controle: sem ele, "sempre entra na B" passaria no teste acima.
    await usuario(ORG_A, "senha-da-clinica-a");
    await usuario(ORG_B, "senha-da-clinica-b");

    const r = await entrar("dentista@exemplo.com", "senha-da-clinica-a");

    expect(r.ok).toBe(true);
    expect(r.ok && r.sessao.organizationId).toBe(ORG_A);
  });

  it("senha errada continua sendo recusada, com a mensagem genérica", async () => {
    // Mensagens diferentes para "e-mail não existe" e "senha errada"
    // transformam a tela de login num verificador de quais e-mails têm conta.
    await usuario(ORG_A, "senha-da-clinica-a");
    await usuario(ORG_B, "senha-da-clinica-b");

    const r = await entrar("dentista@exemplo.com", "chute");

    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toBe("E-mail ou senha incorretos.");
  });

  it("usuário INATIVO numa das organizações não entra por ela", async () => {
    await usuario(ORG_A, "mesma-senha");
    await usuario(ORG_B, "mesma-senha");

    const { conteudo } = await import("../testes/banco-memoria");
    const b = conteudo("crc_users").find((u) => u["organization_id"] === ORG_B);
    if (b !== undefined) b["ativo"] = false;

    const r = await entrar("dentista@exemplo.com", "mesma-senha");

    expect(r.ok).toBe(true);
    expect(r.ok && r.sessao.organizationId).toBe(ORG_A);
  });

  it("e-mail que não existe é recusado sem quebrar", async () => {
    const r = await entrar("ninguem@exemplo.com", "qualquer");
    expect(r.ok).toBe(false);
  });
});
