/**
 * Os dois tetos de 5.000 que a varredura do `supabase/42` encontrou depois.
 *
 * ============================================================================
 *  ELES ERRAVAM EM DIREÇÕES OPOSTAS, e é isso que torna a classe difícil de
 *  ver olhando a tela.
 *
 *  `resumoDeCustoIa` lia 5.000 chamadas e somava o custo. Acima disso, a
 *  CONTA DE IA SAÍA MENOR do que a que a clínica vai pagar — e é justamente o
 *  número que existe para segurar o teto de gasto. Um teto que lê gasto
 *  subnotificado não falha aberto nem fechado: falha exatamente quando a
 *  clínica está gastando muito.
 *
 *  `custoPorEtapa` lia 5.000 leads e dividia o investido pela quantidade.
 *  Truncar a quantidade encolhe o DENOMINADOR, então o CUSTO POR LEAD SAÍA
 *  MAIOR. A campanha aparece pior do que foi, e alguém desliga um anúncio que
 *  estava funcionando.
 *
 *  Dois erros, dois sentidos, zero avisos, e os dois plausíveis.
 * ============================================================================
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => import("../testes/banco-memoria"));
vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { limparBanco, semear } from "../testes/banco-memoria";

import { resumoDeCustoIa } from "./ia";
import { panoramaDeInvestimento } from "./investimento";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "22222222-2222-4222-8222-222222222222";
const CLINICA = "33333333-3333-4333-8333-333333333333";

const PERIODO = {
  de: "2026-06-01T00:00:00.000Z",
  ate: "2026-07-01T00:00:00.000Z",
  rotulo: "jun/26",
};
const DESDE = new Date("2026-06-01T00:00:00.000Z");

beforeEach(() => {
  limparBanco();
});

/* -------------------------------------------------------------------------- */

describe("o custo de IA", () => {
  it("soma custo, tokens e falhas de uma base pequena", async () => {
    semear("crc_ai_calls", [
      chamada({ custo_estimado: "0.001200", input_tokens: 100, output_tokens: 50 }),
      chamada({ custo_estimado: "0.002400", input_tokens: 200, output_tokens: 80, sucesso: false }),
    ]);

    expect(await resumoDeCustoIa(ORG, DESDE)).toEqual({
      chamadas: 2,
      falhas: 1,
      custoTotal: 0.0036,
      tokensEntrada: 300,
      tokensSaida: 130,
    });
  });

  it("12.000 chamadas: o custo sai inteiro, e não 42% dele", async () => {
    semear(
      "crc_ai_calls",
      Array.from({ length: 12_000 }, () => chamada({ custo_estimado: "0.005000" })),
    );

    const r = await resumoDeCustoIa(ORG, DESDE);

    expect(r.chamadas).toBe(12_000);
    // Com o teto de 5.000: 25,00 — e a clínica teria gasto 60,00.
    expect(r.custoTotal).toBe(60);
  });

  it("8.000 chamadas: os tokens também param de ser subnotificados", async () => {
    semear(
      "crc_ai_calls",
      Array.from({ length: 8000 }, () =>
        chamada({ custo_estimado: "0.001000", input_tokens: 10, output_tokens: 5 }),
      ),
    );

    const r = await resumoDeCustoIa(ORG, DESDE);

    expect(r.tokensEntrada).toBe(80_000);
    expect(r.tokensSaida).toBe(40_000);
  });

  it("não soma a chamada de outra clínica", async () => {
    semear("crc_ai_calls", [
      chamada({ custo_estimado: "1.000000" }),
      chamada({ custo_estimado: "9.000000", organization_id: OUTRA_ORG }),
    ]);

    expect((await resumoDeCustoIa(ORG, DESDE)).custoTotal).toBe(1);
  });

  it("não soma chamada anterior à janela", async () => {
    semear("crc_ai_calls", [
      chamada({ custo_estimado: "1.000000" }),
      chamada({ custo_estimado: "9.000000", criado_em: "2026-05-31T23:59:59.000Z" }),
    ]);

    const r = await resumoDeCustoIa(ORG, DESDE);
    expect(r.chamadas).toBe(1);
    expect(r.custoTotal).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("o custo por etapa", () => {
  it("10.000 leads: o custo por lead não é inflado pelo teto", async () => {
    semear("crc_ad_spend", [
      {
        organization_id: ORG,
        mes: "2026-06-01",
        campanha: "implantes",
        canal: "GOOGLE",
        valor: "10000.00",
      },
    ]);

    semear(
      "crc_leads",
      Array.from({ length: 10_000 }, (_, i) => lead(i, "implantes")),
    );

    const r = await panoramaDeInvestimento(ORG, PERIODO);
    const contatos = r.etapas.find((e) => e.chave === "contatos");

    expect(contatos?.quantidade).toBe(10_000);
    // R$ 10.000 / 10.000 leads = R$ 1,00.
    expect(contatos?.custoUnitario).toBe("1.00");

    /*
     * COM O TETO, ISTO DARIA "2.00" — o dobro. E "R$ 2,00 por contato" é um
     * número perfeitamente crível: ninguém olha para ele e desconfia. A
     * decisão que ele muda é desligar ou manter a campanha.
     */
    expect(contatos?.custoUnitario).not.toBe("2.00");
  });

  it("agrupa por campanha normalizada — maiúscula e espaço não criam grupo novo", async () => {
    /*
     * O gasto é gravado normalizado (`normalizarCampanha`), e a tela junta
     * gasto e leads PELO NOME. Se o agrupamento dos leads usasse o
     * `utm_campaign` cru, "Black Friday" viraria uma campanha sem gasto e
     * "black friday" um gasto sem leads — custo por paciente infinito numa
     * linha e zero na outra, com o total certo.
     */
    semear("crc_ad_spend", [
      {
        organization_id: ORG,
        mes: "2026-06-01",
        campanha: "black friday",
        canal: "META",
        valor: "300.00",
      },
    ]);

    semear("crc_leads", [
      lead(1, "Black Friday"),
      lead(2, "black  friday"),
      lead(3, "  BLACK FRIDAY  "),
    ]);

    const r = await panoramaDeInvestimento(ORG, PERIODO);
    const nomes = r.campanhas.map((c) => c.campanha);

    expect(nomes).toEqual(["black friday"]);
    expect(r.campanhas[0]?.leads).toBe(3);
  });

  it("lead sem campanha cai em `geral`, junto com o gasto sem campanha", async () => {
    semear("crc_leads", [lead(1, ""), lead(2, null)]);

    const r = await panoramaDeInvestimento(ORG, PERIODO);
    expect(r.campanhas.map((c) => c.campanha)).toEqual(["geral"]);
    expect(r.campanhas[0]?.leads).toBe(2);
  });

  it("6.000 leads em duas campanhas: a proporção do rateio usa a base inteira", async () => {
    semear(
      "crc_leads",
      Array.from({ length: 6000 }, (_, i) => lead(i, i < 4500 ? "a" : "b")),
    );

    const r = await panoramaDeInvestimento(ORG, PERIODO);
    const porNome = new Map(r.campanhas.map((c) => [c.campanha, c]));

    expect(porNome.get("a")?.leads).toBe(4500);
    // Com teto de 5.000, "b" apareceria com 500 em vez de 1.500.
    expect(porNome.get("b")?.leads).toBe(1500);
  });

  it("sem investimento lançado, não inventa custo", async () => {
    semear("crc_leads", [lead(1, "implantes")]);

    const r = await panoramaDeInvestimento(ORG, PERIODO);

    expect(r.temInvestimento).toBe(false);
    // Custo calculado sobre investimento zero daria "0.00", que é a leitura
    // mais perigosa possível.
    expect(r.etapas.find((e) => e.chave === "contatos")?.custoUnitario).toBeNull();
  });

  it("não conta lead de outra clínica", async () => {
    semear("crc_leads", [
      lead(1, "implantes"),
      { ...lead(2, "implantes"), organization_id: OUTRA_ORG },
    ]);

    expect(
      (await panoramaDeInvestimento(ORG, PERIODO)).etapas.find((e) => e.chave === "contatos")
        ?.quantidade,
    ).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

function chamada(campos: Record<string, unknown>): Record<string, unknown> {
  return {
    organization_id: ORG,
    feature: "classificacao",
    prompt_versao: "v1",
    modelo: "teste",
    sucesso: true,
    criado_em: "2026-06-15T12:00:00.000Z",
    ...campos,
  };
}

function lead(i: number, campanha: string | null): Record<string, unknown> {
  return {
    organization_id: ORG,
    clinic_id: CLINICA,
    nome: `Lead ${String(i)}`,
    origem: "SITE",
    utm_campaign: campanha,
    criado_em: "2026-06-10T12:00:00.000Z",
  };
}
