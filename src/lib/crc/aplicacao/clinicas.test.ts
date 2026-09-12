/**
 * Clínicas e escopo, com banco.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o da ORDEM DE `definirEscopo`: insere o
 *  que entrou ANTES de apagar o que saiu.
 *
 *  Na ordem contrária existe um instante em que a pessoa não alcança nada. Se
 *  a requisição morrer no meio — e requisições morrem —, ela fica trancada do
 *  lado de fora do CRC sem nenhum erro: entra, a sessão abre, e todas as listas
 *  vêm vazias.
 *
 *  INJEÇÃO DE DEFEITO:
 *    apagar antes de inserir          → "nunca fica sem nada" quebra;
 *    aceitar clinicId de outra org    → "só as da organização" quebra;
 *    apagar vínculo ao desativar      → "desativar preserva vínculo" quebra;
 *    regerar o slug ao renomear       → "o slug não muda" quebra.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import {
  criarClinica,
  definirEscopo,
  lerEscopo,
  listarClinicas,
  mudarSituacaoDaClinica,
  renomearClinica,
} from "./clinicas";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OUTRA_ORG = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADMIN = "aaaa9999-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

function clinica(
  id: string,
  nome: string,
  slug: string,
  p: { org?: string; ativa?: boolean } = {},
) {
  semear("crc_clinics", [
    {
      id,
      organization_id: p.org ?? ORG,
      nome,
      slug,
      external_id: null,
      fuso: "America/Sao_Paulo",
      ativa: p.ativa ?? true,
      criado_em: AGORA.toISOString(),
      atualizado_em: AGORA.toISOString(),
    },
  ]);
}

function pessoa(id: string, papel: string) {
  semear("crc_users", [
    {
      id,
      organization_id: ORG,
      nome: `Pessoa ${id}`,
      email: `${id}@exemplo.test`,
      senha_hash: null,
      papel,
      ativo: true,
      ultimo_acesso: null,
      criado_em: AGORA.toISOString(),
      atualizado_em: AGORA.toISOString(),
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

/* -------------------------------------------------------------------------- */

describe("criar unidade", () => {
  it("deriva o slug do nome", async () => {
    const r = await criarClinica({
      organizationId: ORG,
      nome: "Unidade São João",
      fuso: "America/Sao_Paulo",
      externalId: null,
      autorId: ADMIN,
    });

    expect(r.ok).toBe(true);

    const linhas = conteudo("crc_clinics");
    expect(linhas[0]?.["slug"]).toBe("unidade-sao-joao");
    expect(linhas[0]?.["ativa"]).toBe(true);
  });

  it("recusa o nome que colidiria no identificador — com a frase certa", async () => {
    /*
     * "Unidade São João" e "Unidade Sao Joao" geram o MESMO slug. O banco
     * recusaria pela chave única, mas o erro chegaria na tela como "erro ao
     * salvar" e a pessoa não descobriria o motivo.
     */
    clinica("c1", "Unidade São João", "unidade-sao-joao");

    const r = await criarClinica({
      organizationId: ORG,
      nome: "Unidade Sao Joao",
      fuso: "America/Sao_Paulo",
      externalId: null,
      autorId: ADMIN,
    });

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toContain("Unidade São João");
      expect(r.motivo).toContain("unidade-sao-joao");
    }
  });

  it("nome inválido não chega ao banco", async () => {
    const r = await criarClinica({
      organizationId: ORG,
      nome: "!!!",
      fuso: "America/Sao_Paulo",
      externalId: null,
      autorId: ADMIN,
    });

    expect(r.ok).toBe(false);
    expect(conteudo("crc_clinics")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("renomear", () => {
  it("o slug NÃO muda junto com o nome", async () => {
    /*
     * ============================================================================
     *  O slug já entrou em link compartilhado, em log de auditoria e na
     *  correspondência com o sistema da clínica. Regerá-lo a cada renome
     *  quebraria tudo isso sem nenhum erro visível.
     * ============================================================================
     */
    clinica("c1", "Unidade Centro", "unidade-centro");

    const r = await renomearClinica({
      organizationId: ORG,
      clinicId: "c1",
      nome: "Unidade Paulista",
      fuso: "America/Sao_Paulo",
      autorId: ADMIN,
    });

    expect(r.ok).toBe(true);

    const c = conteudo("crc_clinics")[0];
    expect(c?.["nome"]).toBe("Unidade Paulista");
    expect(c?.["slug"]).toBe("unidade-centro");
  });

  it("unidade de outra organização não é encontrada", async () => {
    clinica("c1", "Alheia", "alheia", { org: OUTRA_ORG });

    const r = await renomearClinica({
      organizationId: ORG,
      clinicId: "c1",
      nome: "Minha Agora",
      fuso: "America/Sao_Paulo",
      autorId: ADMIN,
    });

    expect(r.ok).toBe(false);
    expect(conteudo("crc_clinics")[0]?.["nome"]).toBe("Alheia");
  });
});

/* -------------------------------------------------------------------------- */

describe("desativar", () => {
  it("a última unidade ativa é recusada", async () => {
    clinica("c1", "Centro", "centro");

    const r = await mudarSituacaoDaClinica({
      organizationId: ORG,
      clinicId: "c1",
      ativa: false,
      autorId: ADMIN,
    });

    expect(r.ok).toBe(false);
    expect(conteudo("crc_clinics")[0]?.["ativa"]).toBe(true);
  });

  it("com duas ativas, desativa uma", async () => {
    clinica("c1", "Centro", "centro");
    clinica("c2", "Norte", "norte");

    const r = await mudarSituacaoDaClinica({
      organizationId: ORG,
      clinicId: "c1",
      ativa: false,
      autorId: ADMIN,
    });

    expect(r.ok).toBe(true);
    expect(conteudo("crc_clinics").find((c) => c["id"] === "c1")?.["ativa"]).toBe(false);
  });

  it("desativar PRESERVA o vínculo de quem atendia", async () => {
    /*
     * Desativar é reversível; apagar o vínculo não é. Se a unidade reabrir em
     * março, quem atendia nela volta a atender — em vez de a organização ter
     * de redescobrir, pessoa por pessoa, quem estava onde.
     */
    clinica("c1", "Centro", "centro");
    clinica("c2", "Norte", "norte");
    pessoa("u1", "recepcao");
    semear("crc_user_clinics", [{ user_id: "u1", clinic_id: "c1" }]);

    await mudarSituacaoDaClinica({
      organizationId: ORG,
      clinicId: "c1",
      ativa: false,
      autorId: ADMIN,
    });

    expect(conteudo("crc_user_clinics")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("o escopo", () => {
  it("o admin alcança a unidade criada depois, sem vínculo nenhum", async () => {
    clinica("c1", "Centro", "centro");
    clinica("c2", "Norte", "norte");
    pessoa("u-admin", "admin");

    const e = await lerEscopo(ORG, "u-admin");

    expect(e?.vinculadas).toEqual([]);
    expect(e?.efetivas.sort()).toEqual(["c1", "c2"]);
  });

  it("quem não é admin alcança só o que está gravado", async () => {
    clinica("c1", "Centro", "centro");
    clinica("c2", "Norte", "norte");
    pessoa("u1", "recepcao");
    semear("crc_user_clinics", [{ user_id: "u1", clinic_id: "c1" }]);

    const e = await lerEscopo(ORG, "u1");

    expect(e?.efetivas).toEqual(["c1"]);
  });

  it("nunca fica sem nada no meio da troca: insere antes de apagar", async () => {
    /*
     * ============================================================================
     *  ESTE É O TESTE QUE JUSTIFICA A ORDEM DAS DUAS ESCRITAS.
     *
     *  A pessoa sai da Centro e entra na Norte. Se o apagar viesse primeiro,
     *  existiria um instante com zero vínculos — e uma requisição que morra ali
     *  a deixa trancada do lado de fora, sem erro nenhum.
     *
     *  O teste falha a escrita da Norte para congelar exatamente esse instante:
     *  com a ordem certa, a Centro ainda está lá.
     * ============================================================================
     */
    clinica("c1", "Centro", "centro");
    clinica("c2", "Norte", "norte");
    pessoa("u1", "recepcao");
    semear("crc_user_clinics", [{ user_id: "u1", clinic_id: "c1" }]);

    const { falharProximaEscrita } = await import("../testes/banco-memoria");
    falharProximaEscrita("crc_user_clinics", "queda no meio da troca");

    await expect(
      definirEscopo({
        organizationId: ORG,
        userId: "u1",
        clinicIds: ["c2"],
        autorId: ADMIN,
      }),
    ).rejects.toThrow();

    // A escrita que falhou foi a INSERÇÃO da Norte. Como ela vem primeiro, o
    // vínculo antigo continua de pé e a pessoa não perdeu o acesso.
    const vinculos = conteudo("crc_user_clinics");
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0]?.["clinic_id"]).toBe("c1");
  });

  it("troca completa: entra a nova, sai a antiga", async () => {
    clinica("c1", "Centro", "centro");
    clinica("c2", "Norte", "norte");
    pessoa("u1", "recepcao");
    semear("crc_user_clinics", [{ user_id: "u1", clinic_id: "c1" }]);

    const r = await definirEscopo({
      organizationId: ORG,
      userId: "u1",
      clinicIds: ["c2"],
      autorId: ADMIN,
    });

    expect(r.ok).toBe(true);

    const vinculos = conteudo("crc_user_clinics");
    expect(vinculos).toHaveLength(1);
    expect(vinculos[0]?.["clinic_id"]).toBe("c2");
  });

  it("só aceita unidade DESTA organização", async () => {
    /*
     * Sem esta conferência, um id de clínica alheia entraria em
     * `crc_user_clinics` — e o `in` do filtro de tenant passaria a alcançar
     * dado de outra organização. É o item 71 aplicado à tabela de ligação.
     */
    clinica("c1", "Centro", "centro");
    clinica("alheia", "Alheia", "alheia", { org: OUTRA_ORG });
    pessoa("u1", "recepcao");

    const r = await definirEscopo({
      organizationId: ORG,
      userId: "u1",
      clinicIds: ["c1", "alheia"],
      autorId: ADMIN,
    });

    expect(r.ok).toBe(false);
    // E NADA foi gravado: a recusa é da operação inteira, não de um item dela.
    expect(conteudo("crc_user_clinics")).toHaveLength(0);
  });

  it("lista vazia é permitida — mas é o que a tela precisa avisar", async () => {
    /*
     * O serviço não recusa zero clínicas: tirar alguém de todas as unidades é
     * uma ação legítima (a pessoa saiu da operação e ainda não foi desativada).
     * O que não pode é acontecer por engano — e é por isso que o aviso vive no
     * domínio, na tela, e não como recusa aqui.
     */
    clinica("c1", "Centro", "centro");
    pessoa("u1", "recepcao");
    semear("crc_user_clinics", [{ user_id: "u1", clinic_id: "c1" }]);

    const r = await definirEscopo({
      organizationId: ORG,
      userId: "u1",
      clinicIds: [],
      autorId: ADMIN,
    });

    expect(r.ok).toBe(true);
    expect(conteudo("crc_user_clinics")).toHaveLength(0);
  });

  it("repetir o mesmo escopo não escreve nada", async () => {
    clinica("c1", "Centro", "centro");
    pessoa("u1", "recepcao");
    semear("crc_user_clinics", [{ user_id: "u1", clinic_id: "c1" }]);

    const { falharProximaEscrita } = await import("../testes/banco-memoria");
    // Se houvesse qualquer escrita, ela falharia e o teste quebraria.
    falharProximaEscrita("crc_user_clinics", "não deveria escrever");

    const r = await definirEscopo({
      organizationId: ORG,
      userId: "u1",
      clinicIds: ["c1"],
      autorId: ADMIN,
    });

    expect(r.ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("a lista", () => {
  it("traz o tamanho de cada unidade", async () => {
    clinica("c1", "Centro", "centro");
    pessoa("u1", "recepcao");
    semear("crc_user_clinics", [{ user_id: "u1", clinic_id: "c1" }]);
    semear("crc_patients", [
      {
        id: "p1",
        organization_id: ORG,
        clinic_id: "c1",
        external_source: "dental_office",
        external_id: "p1",
        nome: "Paciente",
        criado_em: AGORA.toISOString(),
        atualizado_em: AGORA.toISOString(),
      },
    ]);

    const lista = await listarClinicas(ORG);

    expect(lista).toHaveLength(1);
    expect(lista[0]?.pacientes).toBe(1);
    expect(lista[0]?.pessoas).toBe(1);
    expect(lista[0]?.integrada).toBe(false);
  });

  it("a unidade de outra organização não aparece", async () => {
    clinica("c1", "Centro", "centro");
    clinica("alheia", "Alheia", "alheia", { org: OUTRA_ORG });

    const lista = await listarClinicas(ORG);
    expect(lista.map((c) => c.id)).toEqual(["c1"]);
  });
});
