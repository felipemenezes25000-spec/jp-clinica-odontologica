/**
 * As três coisas que impediam um SEGUNDO cliente de existir.
 *
 * ============================================================================
 *  BRANDING. `clinica: "JP Clínica Integrada Odontológica"` estava escrito em
 *  seis pontos do runtime — template, resposta de agendamento, resposta de
 *  lead, passo de jornada, campanha, e a primeira linha do prompt do agente.
 *  Com um cliente é só um literal; com dois é uma clínica se apresentando com o
 *  nome de outra, para um paciente que não faz ideia de quem é a JP. E não dá
 *  erro: a mensagem sai, é entregue, e quem descobre é o paciente.
 *
 *  ONBOARDING. `instalar()` tinha `slugOrg = "jp"` e `slug: "matriz"` escritos
 *  dentro. Instalar o cliente B devolveria, em silêncio, o cliente A — porque o
 *  `select` por slug encontra a organização existente e devolve o id dela. O
 *  admin do B ganharia acesso à base do A.
 *
 *  CONFIGURAÇÃO. `crc_settings` tem chave `(organization_id, chave)`: horário
 *  comercial, fuso e feriados são da empresa inteira. Numa rede, a unidade do
 *  shopping fecha às 22h e a do centro às 18h — e a rede escolhe entre mandar
 *  mensagem para quem está dormindo ou calar quem ainda está atendendo.
 *
 *  INJEÇÃO DE DEFEITO:
 *    voltar `clinica:` para o literal → duas organizações assinam igual;
 *    fixar o slug da clínica em "matriz" → a segunda unidade não nasce;
 *    ignorar o override → o horário da unidade volta a ser o da matriz.
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

import { CONFIGURACAO_PADRAO } from "../dominio/configuracao";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { renderizarTemplate } from "../automacao/templates";
import { comOverrideDaClinica, _limparCacheDeConfiguracao } from "../servidor/configuracao";
import { criarClinica, criarOrganizacao } from "../servidor/instalacao";

import { _limparCacheDeMarca, nomeDaMarca } from "./marca";

const ORG_A = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_A2 = "aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_B = "bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AGORA = new Date("2026-09-08T14:00:00.000Z");

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  _limparCacheDeMarca();
  _limparCacheDeConfiguracao();
});

function duasEmpresas(): void {
  semear("crc_organizations", [
    { id: ORG_A, slug: "alfa", nome: "Clínica Alfa" },
    { id: ORG_B, slug: "beta", nome: "Odonto Beta" },
  ]);
  semear("crc_clinics", [
    { id: CLINICA_A, organization_id: ORG_A, slug: "centro", nome: "Alfa Centro", ativa: true },
    {
      id: CLINICA_A2,
      organization_id: ORG_A,
      slug: "shopping",
      nome: "Alfa Shopping",
      ativa: true,
    },
    { id: CLINICA_B, organization_id: ORG_B, slug: "matriz", nome: "Beta Matriz", ativa: true },
  ]);
}

/* -------------------------------------------------------------------------- */
/* Branding                                                                   */
/* -------------------------------------------------------------------------- */

describe("o nome que o paciente vê", () => {
  it("a UNIDADE vence a organização", async () => {
    // "Rede Sorriso — Unidade Centro" é o que o paciente reconhece; o nome da
    // holding não diz nada para ele.
    duasEmpresas();
    expect(await nomeDaMarca(ORG_A, CLINICA_A2)).toBe("Alfa Shopping");
    expect(await nomeDaMarca(ORG_A)).toBe("Clínica Alfa");
  });

  it("uma clínica de OUTRA organização não devolve nome nenhum", async () => {
    duasEmpresas();
    // O tenant está no filtro: um id vazado não entrega o nome de uma unidade
    // de outra empresa. Cai para o nome da organização de quem perguntou.
    expect(await nomeDaMarca(ORG_A, CLINICA_B)).toBe("Clínica Alfa");
  });

  it("duas organizações recebem mensagens com o NOME DE CADA UMA", async () => {
    duasEmpresas();
    semear("crc_templates", [
      {
        organization_id: ORG_A,
        chave: "recall",
        versao: 1,
        ativo: true,
        conteudo: "Oi! Aqui é da {{clinica}}.",
      },
      {
        organization_id: ORG_B,
        chave: "recall",
        versao: 1,
        ativo: true,
        conteudo: "Oi! Aqui é da {{clinica}}.",
      },
    ]);

    const deA = await renderizarTemplate(ORG_A, "recall", {}, CLINICA_A);
    const deB = await renderizarTemplate(ORG_B, "recall", {}, CLINICA_B);

    expect(deA).toBe("Oi! Aqui é da Alfa Centro.");
    expect(deB).toBe("Oi! Aqui é da Beta Matriz.");
    expect(deA).not.toContain("JP");
    expect(deB).not.toContain("Alfa");
  });

  it("quem passa `clinica` explicitamente continua vencendo", async () => {
    // É o que o preview de template usa: um exemplo fictício sem ir ao banco.
    duasEmpresas();
    semear("crc_templates", [
      {
        organization_id: ORG_A,
        chave: "recall",
        versao: 1,
        ativo: true,
        conteudo: "Aqui é da {{clinica}}.",
      },
    ]);

    expect(await renderizarTemplate(ORG_A, "recall", { clinica: "Outra" })).toBe(
      "Aqui é da Outra.",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                 */
/* -------------------------------------------------------------------------- */

describe("criar uma organização", () => {
  it("duas organizações são DUAS, e não a mesma devolvida duas vezes", async () => {
    /*
     * O DEFEITO ERA EXATAMENTE ESTE. Com `slugOrg = "jp"` fixo, a segunda
     * instalação caía no `select` por slug, encontrava a primeira, e devolvia o
     * id dela — sem erro. O admin do cliente B seria criado dentro do cliente A.
     */
    const a = await criarOrganizacao({ slug: "alfa", nome: "Clínica Alfa" });
    const b = await criarOrganizacao({ slug: "beta", nome: "Odonto Beta" });

    expect(a.organizationId).not.toBe(b.organizationId);
    expect(a.clinicId).not.toBe(b.clinicId);
    expect(conteudo("crc_organizations")).toHaveLength(2);
  });

  it("cada uma nasce com funil, templates e automações próprios", async () => {
    const a = await criarOrganizacao({ slug: "alfa", nome: "Clínica Alfa" });

    expect(a.etapas).toBeGreaterThan(0);
    expect(a.templates).toBeGreaterThan(0);
    expect(a.automacoes.criadas).toBeGreaterThan(0);

    const etapas = conteudo("crc_opportunity_stages");
    expect(etapas.every((e) => e["organization_id"] === a.organizationId)).toBe(true);
  });

  it("continua IDEMPOTENTE: rodar de novo não duplica nada", async () => {
    const primeira = await criarOrganizacao({ slug: "alfa", nome: "Clínica Alfa" });
    const segunda = await criarOrganizacao({ slug: "alfa", nome: "Clínica Alfa" });

    expect(segunda.organizationId).toBe(primeira.organizationId);
    expect(segunda.clinicId).toBe(primeira.clinicId);
    expect(conteudo("crc_organizations")).toHaveLength(1);
    expect(conteudo("crc_clinics")).toHaveLength(1);
  });

  it("sem admin, avisa em vez de falhar calado", async () => {
    // A instalação continua válida: o resto está pronto e o usuário pode ser
    // criado depois. Mas precisa APARECER, porque sem usuário ninguém entra.
    const r = await criarOrganizacao({ slug: "alfa", nome: "Clínica Alfa" });
    expect(r.usuarioAdmin).toBe("");
    expect(r.avisos.join(" ")).toContain("administrador");
  });

  it("a SEGUNDA unidade da mesma organização nasce de verdade", async () => {
    /*
     * Com o slug fixo em "matriz", `garantirClinica` encontrava a primeira e
     * devolvia o id dela — e abrir uma segunda unidade era impossível pela API.
     */
    const org = await criarOrganizacao({ slug: "alfa", nome: "Clínica Alfa" });

    const segunda = await criarClinica({
      organizationId: org.organizationId,
      nome: "Alfa Shopping",
      slug: "shopping",
    });

    expect(segunda).not.toBe(org.clinicId);
    expect(conteudo("crc_clinics")).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */
/* Configuração por clínica                                                   */
/* -------------------------------------------------------------------------- */

describe("a configuração da unidade", () => {
  it("sem override, devolve EXATAMENTE a configuração recebida", async () => {
    /*
     * O contrapeso da terceira camada: ligar o override não pode mudar nada
     * para quem não o usa. A asserção é de identidade de objeto de propósito —
     * ela prova que nem uma cópia foi feita.
     */
    duasEmpresas();
    const r = await comOverrideDaClinica(CONFIGURACAO_PADRAO, ORG_A, CLINICA_A);
    expect(r).toBe(CONFIGURACAO_PADRAO);
  });

  it("a unidade do shopping fecha mais tarde que a do centro", async () => {
    duasEmpresas();
    semear("crc_settings_clinica", [
      {
        organization_id: ORG_A,
        clinic_id: CLINICA_A2,
        chave: "horarioComercial",
        valor: {
          dias: [
            null,
            { inicio: "10:00", fim: "22:00" },
            { inicio: "10:00", fim: "22:00" },
            { inicio: "10:00", fim: "22:00" },
            { inicio: "10:00", fim: "22:00" },
            { inicio: "10:00", fim: "22:00" },
            { inicio: "10:00", fim: "22:00" },
          ],
          feriados: [],
          fuso: "America/Sao_Paulo",
        },
      },
    ]);

    const centro = await comOverrideDaClinica(CONFIGURACAO_PADRAO, ORG_A, CLINICA_A);
    const shopping = await comOverrideDaClinica(CONFIGURACAO_PADRAO, ORG_A, CLINICA_A2);

    expect(centro.horarioComercial.dias[1]?.fim).toBe("19:00");
    expect(shopping.horarioComercial.dias[1]?.fim).toBe("22:00");
  });

  it("a mesclagem é POR CAMPO: sobrescrever um não apaga os outros", async () => {
    /*
     * É o que permite um override PEQUENO. Substituir o objeto inteiro
     * obrigaria a unidade a recopiar `recallDias`, `cooldownHoras` e tudo mais
     * só para mudar o teto de contato — e a primeira mudança na organização
     * deixaria de valer para ela, sem ninguém perceber.
     */
    duasEmpresas();
    semear("crc_settings", [
      { organization_id: ORG_A, chave: "recallDias", valor: 150 },
      { organization_id: ORG_A, chave: "contatosPorDia", valor: 3 },
    ]);
    semear("crc_settings_clinica", [
      { organization_id: ORG_A, clinic_id: CLINICA_A2, chave: "contatosPorDia", valor: 1 },
    ]);

    const { lerConfiguracao } = await import("../servidor/configuracao");

    const daOrg = await lerConfiguracao(ORG_A);
    expect(daOrg.recallDias).toBe(150);
    expect(daOrg.contatosPorDia).toBe(3);

    const daUnidade = await lerConfiguracao(ORG_A, CLINICA_A2);
    // O que a unidade sobrescreveu:
    expect(daUnidade.contatosPorDia).toBe(1);
    // E o que ela NÃO sobrescreveu continua vindo da organização:
    expect(daUnidade.recallDias).toBe(150);
  });

  it("o override de uma unidade não vaza para a outra", async () => {
    duasEmpresas();
    semear("crc_settings_clinica", [
      { organization_id: ORG_A, clinic_id: CLINICA_A2, chave: "contatosPorDia", valor: 9 },
    ]);

    const { lerConfiguracao } = await import("../servidor/configuracao");

    expect((await lerConfiguracao(ORG_A, CLINICA_A2)).contatosPorDia).toBe(9);
    expect((await lerConfiguracao(ORG_A, CLINICA_A)).contatosPorDia).toBe(
      CONFIGURACAO_PADRAO.contatosPorDia,
    );
  });
});
