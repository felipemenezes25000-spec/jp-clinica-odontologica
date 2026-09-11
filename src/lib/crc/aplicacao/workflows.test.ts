/**
 * Testes da publicação de jornada.
 *
 * O QUE ELES PROTEGEM é o que só aparece com duas pessoas e com o tempo:
 *
 *   JORNADA EM VOO NÃO MUDA DE DEFINIÇÃO. Publicar uma versão nova não pode
 *   mexer em quem já está no meio do caminho — senão remover um passo move o
 *   ponteiro de todo mundo para o passo errado.
 *
 *   DUAS ABAS NÃO SE APAGAM. A segunda a salvar precisa ser recusada, e não
 *   sobrescrever em silêncio.
 *
 *   A VALIDAÇÃO DO SERVIDOR É A QUE VALE. A tela roda na máquina de quem usa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { lerJornadaParaEditar, publicarDefinicao, conferirDefinicao } from "./workflows";
import type { DefinicaoAutomacao } from "../dominio/tipos";

const ORG = "11111111-1111-4111-8111-111111111111";
const AUTO = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const DEF: DefinicaoAutomacao = {
  gatilho: { tipo: "EVENTO", evento: "appointment.missed" },
  condicoes: [{ tipo: "PACIENTE_ATIVO" }],
  passos: [
    { tipo: "ESPERAR", minutos: 120 },
    { tipo: "ENVIAR_TEMPLATE", template: "falta_primeiro_contato" },
  ],
  saidas: [{ condicao: { tipo: "TEM_CONSULTA_FUTURA" }, motivo: "agendou" }],
};

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_automations", [
    {
      id: AUTO,
      organization_id: ORG,
      chave: "falta",
      nome: "Recuperar faltantes",
      status: "ATIVA",
      modo: "SHADOW",
      versao_ativa: 1,
    },
  ]);
  semear("crc_automation_versions", [{ automation_id: AUTO, versao: 1, definicao: DEF }]);
  semear("crc_templates", [
    {
      organization_id: ORG,
      chave: "falta_primeiro_contato",
      versao: 1,
      nome: "1o contato",
      conteudo: "oi",
    },
    {
      organization_id: ORG,
      chave: "falta_segundo_contato",
      versao: 1,
      nome: "2o contato",
      conteudo: "oi de novo",
    },
  ]);
  semear("crc_opportunity_stages", [
    { organization_id: ORG, chave: "novo", nome: "Novo", ordem: 1 },
    { organization_id: ORG, chave: "agendado", nome: "Agendado", ordem: 2 },
  ]);
});

/* -------------------------------------------------------------------------- */

describe("ler para editar", () => {
  it("traz a definição ATIVA, e as escolhas possíveis", async () => {
    const j = await lerJornadaParaEditar(ORG, AUTO);

    expect(j?.versao).toBe(1);
    expect(j?.definicao.passos).toHaveLength(2);
    expect(j?.templatesDisponiveis).toEqual(["falta_primeiro_contato", "falta_segundo_contato"]);
    expect(j?.etapasDisponiveis).toEqual(["novo", "agendado"]);
  });

  it("a mesma chave de modelo em várias VERSÕES aparece UMA vez", async () => {
    /*
     * `crc_templates` tem uma linha por versão do modelo. Sem o `Set`, o seletor
     * da tela mostraria "recall_seis_meses" três vezes — e escolher entre três
     * opções idênticas é uma tela quebrada.
     */
    semear("crc_templates", [
      {
        organization_id: ORG,
        chave: "falta_primeiro_contato",
        versao: 2,
        nome: "1o contato",
        conteudo: "v2",
      },
      {
        organization_id: ORG,
        chave: "falta_primeiro_contato",
        versao: 3,
        nome: "1o contato",
        conteudo: "v3",
      },
    ]);

    const j = await lerJornadaParaEditar(ORG, AUTO);
    expect(j?.templatesDisponiveis.filter((c) => c === "falta_primeiro_contato")).toHaveLength(1);
  });

  it("conta quem está no meio da jornada AGORA", async () => {
    // Vai para a tela porque muda o peso da decisão: editar com zero pessoas
    // dentro é experimentar; com quarenta, é mexer em algo em andamento.
    semear("crc_automation_enrollments", [
      { organization_id: ORG, automation_id: AUTO, versao: 1, status: "ACTIVE", passo_atual: 0 },
      { organization_id: ORG, automation_id: AUTO, versao: 1, status: "WAITING", passo_atual: 1 },
      { organization_id: ORG, automation_id: AUTO, versao: 1, status: "COMPLETED", passo_atual: 2 },
    ]);

    // A concluída NÃO conta: ela não está no meio de nada.
    expect((await lerJornadaParaEditar(ORG, AUTO))?.emJornada).toBe(2);
  });

  it("automação de OUTRA organização não é encontrada", async () => {
    const outra = "99999999-9999-4999-8999-999999999999";
    expect(await lerJornadaParaEditar(outra, AUTO)).toBeNull();
  });

  it("definição corrompida no jsonb devolve null em vez de quebrar a tela", async () => {
    // A coluna é `jsonb` sem schema de propósito. O preço é que o que sai de lá
    // é `unknown` de verdade — e confiar quebraria na cara de quem editava.
    const v = conteudo("crc_automation_versions")[0];
    if (v !== undefined) v["definicao"] = "isto não é uma definição";

    expect(await lerJornadaParaEditar(ORG, AUTO)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("publicar", () => {
  const nova: DefinicaoAutomacao = {
    ...DEF,
    passos: [
      { tipo: "ESPERAR", minutos: 240 },
      { tipo: "ENVIAR_TEMPLATE", template: "falta_segundo_contato" },
    ],
  };

  it("cria a versão SEGUINTE e move o ponteiro", async () => {
    const r = await publicarDefinicao({
      organizationId: ORG,
      automationId: AUTO,
      definicao: nova,
      versaoEsperada: 1,
    });

    expect(r.ok).toBe(true);
    expect(r.ok && r.versao).toBe(2);
    expect(conteudo("crc_automation_versions")).toHaveLength(2);
    expect(conteudo("crc_automations")[0]?.["versao_ativa"]).toBe(2);
  });

  it("a versão ANTIGA continua existindo, inteira", async () => {
    /*
     * É O QUE FAZ JORNADA EM VOO NÃO QUEBRAR. `crc_automation_enrollments.versao`
     * grava em qual versão o paciente entrou, e o motor lê a definição DAQUELA
     * versão. Apagar ou sobrescrever a antiga moveria o ponteiro de passo de
     * todo mundo para o passo errado — o de índice 1 vira outro passo, e a
     * jornada continua achando que está no 1.
     */
    await publicarDefinicao({
      organizationId: ORG,
      automationId: AUTO,
      definicao: nova,
      versaoEsperada: 1,
    });

    const v1 = conteudo("crc_automation_versions").find((v) => v["versao"] === 1);
    expect(v1?.["definicao"]).toEqual(DEF);
  });

  it("recusa a SEGUNDA aba, e não sobrescreve em silêncio", async () => {
    // Duas abas abertas na mesma automação é o caso comum, não o raro.
    await publicarDefinicao({
      organizationId: ORG,
      automationId: AUTO,
      definicao: nova,
      versaoEsperada: 1,
    });

    const segunda = await publicarDefinicao({
      organizationId: ORG,
      automationId: AUTO,
      definicao: DEF,
      // Ela abriu quando a ativa ainda era a 1.
      versaoEsperada: 1,
    });

    expect(segunda.ok).toBe(false);
    expect(!segunda.ok && segunda.codigo).toBe("conflito");
    expect(!segunda.ok && segunda.motivo).toContain("enquanto você editava");
    // E o trabalho da primeira continua de pé.
    expect(conteudo("crc_automations")[0]?.["versao_ativa"]).toBe(2);
  });

  it("a validação do SERVIDOR recusa o que a tela deixaria passar", async () => {
    /*
     * A tela é código que roda na máquina de quem usa, e a função de servidor
     * aceita qualquer JSON. Este teste manda uma definição que nenhuma tela
     * montaria — é o caminho que existe de verdade.
     */
    const r = await publicarDefinicao({
      organizationId: ORG,
      automationId: AUTO,
      definicao: { ...DEF, saidas: [{ condicao: { tipo: "SEMPRE" }, motivo: "x" }] },
      versaoEsperada: 1,
    });

    expect(r.ok).toBe(false);
    expect(!r.ok && r.codigo).toBe("invalida");
    expect(!r.ok && r.achados[0]?.mensagem).toContain("antes do primeiro passo");
    // E NADA foi gravado.
    expect(conteudo("crc_automation_versions")).toHaveLength(1);
    expect(conteudo("crc_automations")[0]?.["versao_ativa"]).toBe(1);
  });

  it("modelo que existe na tela e não no banco é recusado no servidor", async () => {
    const r = await publicarDefinicao({
      organizationId: ORG,
      automationId: AUTO,
      definicao: {
        ...DEF,
        passos: [{ tipo: "ENVIAR_TEMPLATE", template: "apagado_por_outra_aba" }],
      },
      versaoEsperada: 1,
    });

    expect(!r.ok && r.codigo).toBe("invalida");
  });

  it("automação de outra organização não publica", async () => {
    const r = await publicarDefinicao({
      organizationId: "99999999-9999-4999-8999-999999999999",
      automationId: AUTO,
      definicao: nova,
      versaoEsperada: 1,
    });

    expect(!r.ok && r.codigo).toBe("nao_encontrada");
    expect(conteudo("crc_automation_versions")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("conferir sem gravar", () => {
  it("devolve os achados e não escreve nada", async () => {
    const achados = await conferirDefinicao(ORG, AUTO, {
      ...DEF,
      passos: [{ tipo: "ENVIAR_TEMPLATE", template: "nao_existe" }],
    });

    expect(achados.some((a) => a.severidade === "erro")).toBe(true);
    expect(conteudo("crc_automation_versions")).toHaveLength(1);
    expect(conteudo("crc_automations")[0]?.["versao_ativa"]).toBe(1);
  });

  it("a jornada boa não acusa nada", async () => {
    expect(await conferirDefinicao(ORG, AUTO, DEF)).toEqual([]);
  });
});
