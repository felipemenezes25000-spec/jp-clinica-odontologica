/**
 * O Centro de Autonomia, com banco.
 *
 * ============================================================================
 *  O QUE ESTE ARQUIVO IMPEDE, e é o risco inteiro de existir um segundo
 *  controle de autonomia no sistema:
 *
 *    que o nível vire um CAMINHO ALTERNATIVO para ligar envio automático.
 *
 *  Com dois controles, o kill switch de madrugada deixa de ser confiável —
 *  alguém precisaria lembrar de desligar os dois lugares, e a pessoa que está
 *  contendo um incidente às três da manhã não vai lembrar.
 *
 *  INJEÇÃO DE DEFEITO:
 *    tirar `flags` de `podeAgir()`              → "flag é teto" quebra;
 *    fazer o kill switch ser só o mestre        → "kill de envio" quebra;
 *    herdar a linha inteira em vez de por domínio → "herança por domínio" quebra;
 *    trocar o conflito do upsert por um só      → "padrão da org" quebra.
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

import { autorizar, definirNivel, lerNiveis, lerPainel, voltarAHerdar } from "./autonomia";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_2 = "aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

function ligar(chave: string, ligada = true): void {
  semear("crc_feature_flags", [
    { organization_id: ORG, chave, ligada, atualizado_em: AGORA.toISOString() },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

/* -------------------------------------------------------------------------- */

describe("a leitura dos níveis", () => {
  it("tudo que ninguém configurou nasce em ZERO", async () => {
    const niveis = await lerNiveis(ORG, CLINICA);

    expect(niveis).toHaveLength(10);
    expect(niveis.every((n) => n.nivel === 0)).toBe(true);
    expect(niveis.every((n) => n.herdado)).toBe(true);
  });

  it("a herança é POR DOMÍNIO, e não por linha inteira", async () => {
    /*
     * ============================================================================
     *  O ERRO COMUM: "a unidade tem configuração própria, logo ignore o padrão
     *  da organização".
     *
     *  O sintoma é uma unidade perdendo silenciosamente a configuração de nove
     *  domínios ao ajustar um. A rede configura `recall: 4` e `agenda: 2` no
     *  padrão; a unidade sobe só `agenda` para 4 — e volta a operar com
     *  `recall: 0`, sem ninguém pedir.
     * ============================================================================
     */
    await definirNivel(ORG, null, "recall", 4, null);
    await definirNivel(ORG, null, "agenda", 2, null);
    await definirNivel(ORG, CLINICA, "agenda", 4, null);

    const niveis = await lerNiveis(ORG, CLINICA);
    const porDominio = new Map(niveis.map((n) => [n.dominio, n]));

    expect(porDominio.get("agenda")?.nivel).toBe(4);
    expect(porDominio.get("agenda")?.herdado).toBe(false);

    expect(porDominio.get("recall")?.nivel).toBe(4);
    expect(porDominio.get("recall")?.herdado).toBe(true);
  });

  it("a configuração de uma clínica não vaza para a outra", async () => {
    await definirNivel(ORG, CLINICA, "recall", 5, null);

    const outra = await lerNiveis(ORG, CLINICA_2);
    expect(outra.find((n) => n.dominio === "recall")?.nivel).toBe(0);
  });

  it("o padrão da organização não cria duas linhas", async () => {
    await definirNivel(ORG, null, "recall", 3, null);
    await definirNivel(ORG, null, "recall", 5, null);

    const linhas = conteudo("crc_autonomia").filter(
      (l) => l["dominio"] === "recall" && l["clinic_id"] === null,
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.["nivel"]).toBe(5);
  });

  it("voltar a herdar é diferente de definir zero", async () => {
    /*
     * Zero CONGELA no zero; herdar SEGUE o padrão da organização quando ele
     * mudar. Sem a distinção, a única forma de voltar a herdar seria apagar a
     * linha no banco à mão.
     */
    await definirNivel(ORG, null, "recall", 4, null);
    await definirNivel(ORG, CLINICA, "recall", 0, null);

    expect((await lerNiveis(ORG, CLINICA)).find((n) => n.dominio === "recall")?.nivel).toBe(0);

    await voltarAHerdar(ORG, CLINICA, "recall", null);

    const depois = (await lerNiveis(ORG, CLINICA)).find((n) => n.dominio === "recall");
    expect(depois?.nivel).toBe(4);
    expect(depois?.herdado).toBe(true);
  });

  it("nível fora da faixa é recusado fechando", async () => {
    const gravado = await definirNivel(ORG, CLINICA, "recall", 99, null);
    expect(gravado).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("a autorização", () => {
  it("nível 5 com a flag DESLIGADA não age", async () => {
    /*
     * O TESTE QUE IMPEDE O BYPASS. Autonomia máxima, sem kill switch, risco
     * baixo — e continua recusando, porque `ai_agente_envio` é o teto.
     */
    await definirNivel(ORG, CLINICA, "mensagens", 5, null);

    const v = await autorizar({
      organizationId: ORG,
      clinicId: CLINICA,
      dominio: "mensagens",
      risco: "BAIXO",
    });

    expect(v.pode).toBe(false);
    if (v.pode) return;
    expect(v.motivo).toContain("ai_agente_envio");
  });

  it("com a flag ligada e o nível suficiente, age", async () => {
    ligar("ai_agente_envio");
    await definirNivel(ORG, CLINICA, "mensagens", 3, null);

    const v = await autorizar({
      organizationId: ORG,
      clinicId: CLINICA,
      dominio: "mensagens",
      risco: "BAIXO",
    });

    expect(v.pode).toBe(true);
  });

  it("o kill switch MESTRE para tudo", async () => {
    ligar("ai_agente_envio");
    ligar("kill_automacoes");
    await definirNivel(ORG, CLINICA, "mensagens", 5, null);

    const v = await autorizar({
      organizationId: ORG,
      clinicId: CLINICA,
      dominio: "mensagens",
      risco: "BAIXO",
    });

    expect(v.pode).toBe(false);
    if (v.pode) return;
    expect(v.motivo).toContain("Kill switch");
  });

  it("o kill de ENVIO para quem fala, e não o resto", async () => {
    /*
     * ============================================================================
     *  SE OS TRÊS KILL SWITCHES FOSSEM TRATADOS COMO UM, a clínica precisaria
     *  desligar o sistema inteiro para conter um problema de escrita — e, pior,
     *  religaria os três de uma vez para voltar a operar.
     *
     *  `marketing` fica de fora de propósito: ele só decide público e mensagem.
     *  Congelá-lo junto pararia o planejamento, que é justamente o trabalho que
     *  alguém quer fazer enquanto o envio está parado.
     * ============================================================================
     */
    ligar("ai_agente_envio");
    ligar("kill_envios");
    await definirNivel(ORG, CLINICA, "mensagens", 5, null);
    await definirNivel(ORG, CLINICA, "marketing", 5, null);

    const falando = await autorizar({
      organizationId: ORG,
      clinicId: CLINICA,
      dominio: "mensagens",
      risco: "BAIXO",
    });
    const planejando = await autorizar({
      organizationId: ORG,
      clinicId: CLINICA,
      dominio: "marketing",
      risco: "MEDIO",
    });

    expect(falando.pode).toBe(false);
    expect(planejando.pode).toBe(true);
  });

  it("o kill de ESCRITA para agenda e writeback", async () => {
    ligar("auto_scheduling");
    ligar("dental_office_writeback");
    ligar("kill_escritas_do");
    await definirNivel(ORG, CLINICA, "agenda", 5, null);
    await definirNivel(ORG, CLINICA, "writeback", 5, null);

    const agenda = await autorizar({
      organizationId: ORG,
      clinicId: CLINICA,
      dominio: "agenda",
      risco: "MEDIO",
    });
    const writeback = await autorizar({
      organizationId: ORG,
      clinicId: CLINICA,
      dominio: "writeback",
      risco: "ALTO",
    });

    expect(agenda.pode).toBe(false);
    expect(writeback.pode).toBe(false);
  });

  it("a autonomia é POR CLÍNICA na hora de agir", async () => {
    ligar("ai_agente_envio");
    await definirNivel(ORG, CLINICA, "mensagens", 5, null);

    const matriz = await autorizar({
      organizationId: ORG,
      clinicId: CLINICA,
      dominio: "mensagens",
      risco: "BAIXO",
    });
    const filial = await autorizar({
      organizationId: ORG,
      clinicId: CLINICA_2,
      dominio: "mensagens",
      risco: "BAIXO",
    });

    expect(matriz.pode).toBe(true);
    expect(filial.pode).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */

describe("o painel", () => {
  it("mostra o nível EFETIVO, e não só o configurado", async () => {
    /*
     * Um domínio no nível 5 com a flag desligada opera como 0. Mostrar só o 5 é
     * a forma mais fácil de alguém concluir que a automação está quebrada
     * quando ela está obedecendo.
     */
    await definirNivel(ORG, CLINICA, "recall", 5, null);

    const painel = await lerPainel(ORG, CLINICA);
    const recall = painel.find((p) => p.dominio === "recall");

    expect(recall?.nivel).toBe(5);
    expect(recall?.efetivo).toBe(0);
    expect(recall?.bloqueadoPor).toContain("automatic_whatsapp");
  });

  it("com o teto ligado, efetivo e configurado coincidem", async () => {
    ligar("automatic_whatsapp");
    await definirNivel(ORG, CLINICA, "recall", 4, null);

    const recall = (await lerPainel(ORG, CLINICA)).find((p) => p.dominio === "recall");

    expect(recall?.efetivo).toBe(4);
    expect(recall?.bloqueadoPor).toBeNull();
  });

  it("o kill switch aparece como o motivo, ganhando da flag", async () => {
    ligar("automatic_whatsapp");
    ligar("kill_envios");
    await definirNivel(ORG, CLINICA, "recall", 4, null);

    const recall = (await lerPainel(ORG, CLINICA)).find((p) => p.dominio === "recall");

    expect(recall?.efetivo).toBe(0);
    expect(recall?.bloqueadoPor).toBe("Kill switch acionado");
  });

  it("a voz aparece bloqueada — não há provedor", async () => {
    await definirNivel(ORG, CLINICA, "voz", 5, null);

    const voz = (await lerPainel(ORG, CLINICA)).find((p) => p.dominio === "voz");

    expect(voz?.efetivo).toBe(0);
    expect(voz?.teto?.chave).toBe("voice_ai");
    expect(voz?.teto?.ligada).toBe(false);
  });
});
