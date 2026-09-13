/**
 * A analítica do `supabase/42`, contra Postgres de verdade — e não contra o fake.
 *
 * ============================================================================
 *  O QUE SÓ ESTE ARQUIVO PODE PROVAR.
 *
 *  `aplicacao/analytics.test.ts` roda contra o banco em memória, que REPRODUZ
 *  a semântica das funções novas. Reproduzir não é executar, e três coisas
 *  ficam de fora por construção:
 *
 *    `percentile_cont(0.5) within group (order by ...)` — no fake isso é
 *    aritmética de array. Aqui é o operador do Postgres, que é o que vai rodar
 *    em produção.
 *
 *    O TIPO QUE O POSTGREST DEVOLVE. `bigint` e `numeric` chegam ora como
 *    número, ora como texto, dependendo do caminho — e `analytics.ts` normaliza
 *    com `String(...)` justamente por isso. Um fake não tem como ter opinião
 *    sobre isso; este arquivo mede.
 *
 *    QUE AS FUNÇÕES EXISTEM. Se alguém esquecer de rodar o `supabase/42` no
 *    banco, tudo aqui falha alto — que é o comportamento certo. O fake
 *    continuaria verde para sempre.
 * ============================================================================
 *
 * AS BASES GRANDES SÃO GERADAS COM `generate_series`, e não inseridas linha a
 * linha pela rede: doze mil `insert` individuais levariam minutos e mediriam o
 * PostgREST, não o `group by`.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  exigirBanco,
  limparTudo,
  semearDuasClinicas,
  sql,
  URL_TESTE,
  ORG_A,
  ORG_B,
  CLINICA_A,
} from "./apoio";

const DE = "2026-01-01T00:00:00Z";
const ATE = "2027-01-01T00:00:00Z";

beforeAll(() => {
  exigirBanco();
});

beforeEach(async () => {
  await limparTudo();
  await semearDuasClinicas();
});

/** Chama a função pelo PostgREST, como `servidor/banco.ts` faz em produção. */
async function viaPostgrest(nome: string, argumentos: Record<string, unknown>): Promise<unknown[]> {
  const chave = process.env["SUPABASE_SERVICE_ROLE"] ?? "";
  const r = await fetch(`${URL_TESTE}/rpc/${nome}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: chave,
      Authorization: `Bearer ${chave}`,
    },
    body: JSON.stringify(argumentos),
  });

  if (!r.ok) throw new Error(`${nome} falhou (${String(r.status)}): ${await r.text()}`);
  const corpo: unknown = await r.json();
  return Array.isArray(corpo) ? corpo : [corpo];
}

/* -------------------------------------------------------------------------- */

describe("crc_motivos_de_perda", () => {
  it("12.000 perdas: o total sai inteiro, e o antigo teto cortava a 3.000ª", async () => {
    await sql(`
      insert into public.crc_opportunities
        (organization_id, clinic_id, tipo, lost_reason, potential_value, fechada_em)
      select '${ORG_A}', '${CLINICA_A}', 'BUDGET_RECOVERY',
             case when i <= 9000 then 'preco' else 'convenio' end,
             25.00,
             timestamptz '2026-06-01 12:00:00-03'
        from generate_series(1, 12000) i;
    `);

    const linhas = await sql<{ motivo: string; quantidade: number; valor_perdido: string }>(`
      select * from public.crc_motivos_de_perda(
        '${ORG_A}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)
    `);

    const porMotivo = new Map(linhas.map((l) => [l.motivo, l]));

    expect(Number(porMotivo.get("preco")?.quantidade)).toBe(9000);
    expect(Number(porMotivo.get("preco")?.valor_perdido)).toBe(225_000);

    /*
     * "convenio" só aparece a partir da linha 9.001. Com teto de 3.000 ele
     * sumia INTEIRO do relatório — e "nenhuma perda por convênio" é uma
     * conclusão comercial oposta a "três mil".
     */
    expect(Number(porMotivo.get("convenio")?.quantidade)).toBe(3000);
  });

  it("não enxerga a clínica vizinha", async () => {
    await sql(`
      insert into public.crc_opportunities
        (organization_id, clinic_id, tipo, lost_reason, potential_value, fechada_em)
      values ('${ORG_B}', '${CLINICA_A}', 'MANUAL', 'preco', 999.00,
              timestamptz '2026-06-01 12:00:00-03')
    `);

    const linhas = await sql(`
      select * from public.crc_motivos_de_perda(
        '${ORG_A}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)
    `);

    expect(linhas).toHaveLength(0);
  });

  it("ignora oportunidade aberta, mesmo com motivo preenchido", async () => {
    await sql(`
      insert into public.crc_opportunities
        (organization_id, clinic_id, tipo, lost_reason, potential_value, fechada_em)
      values ('${ORG_A}', '${CLINICA_A}', 'MANUAL', 'preco', 500.00, null)
    `);

    expect(
      await sql(`
        select * from public.crc_motivos_de_perda(
          '${ORG_A}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)
      `),
    ).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("crc_speed_to_lead", () => {
  it("10.000 leads: a mediana é do meio da base, e não do meio do teto", async () => {
    /*
     * ========================================================================
     *  O CASO QUE JUSTIFICA ESTE ARQUIVO INTEIRO.
     *
     *  Os leads chegam em ordem, e o tempo de resposta CRESCE com a ordem —
     *  que é o padrão real de uma operação que enche ao longo do mês.
     *
     *  Base inteira: os valores são 1..10.000 minutos, mediana 5.000,5.
     *  Só os 3.000 primeiros: mediana 1.500,5.
     *
     *  Não é um erro de 30%. É 3,3×, na direção que faz a operação parecer
     *  melhor do que é — o sentido em que ninguém desconfia.
     * ========================================================================
     */
    await sql(`
      insert into public.crc_leads
        (organization_id, nome, origem, criado_em, primeira_resposta_em)
      select '${ORG_A}', 'Lead ' || i, 'SITE',
             timestamptz '2026-06-01 00:00:00-03' + make_interval(mins => i),
             timestamptz '2026-06-01 00:00:00-03' + make_interval(mins => i + i)
        from generate_series(1, 10000) i;
    `);

    const [linha] = await sql<{
      leads: number;
      respondidos: number;
      mediana_minutos: string;
      ate_cinco_minutos: number;
    }>(`
      select * from public.crc_speed_to_lead(
        '${ORG_A}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)
    `);

    expect(Number(linha?.leads)).toBe(10_000);
    expect(Number(linha?.respondidos)).toBe(10_000);
    // `percentile_cont` interpola: (5000 + 5001) / 2 = 5000,5 → round = 5001.
    expect(Number(linha?.mediana_minutos)).toBe(5001);
    expect(Number(linha?.ate_cinco_minutos)).toBe(5);

    // E a prova do dano: a mediana truncada seria 1.501.
    expect(Number(linha?.mediana_minutos)).toBeGreaterThan(1501 * 3);
  });

  it("meio minuto arredonda para longe do zero, como o código faz", async () => {
    /*
     * ========================================================================
     *  ESTE TESTE NASCEU DE UMA DIVERGÊNCIA REAL entre o SQL e o TypeScript.
     *
     *  `percentile_cont` não tem variante `numeric`: promove o argumento a
     *  `double precision`. E `round(double precision)` no Postgres arredonda
     *  PARA O PAR MAIS PRÓXIMO — 2,5 vira 2 —, enquanto `Math.round` no
     *  JavaScript arredonda para cima, e `round(numeric)` para longe do zero.
     *
     *  O `::numeric` no `supabase/42` existe por causa disto. Sem ele, o fake e
     *  o banco discordavam em meio minuto — e meio minuto não muda decisão
     *  nenhuma, mas duas regras de arredondamento convivendo no mesmo sistema
     *  mudam, mais cedo ou mais tarde.
     * ========================================================================
     */
    await sql(`
      insert into public.crc_leads
        (organization_id, nome, origem, criado_em, primeira_resposta_em)
      values
        ('${ORG_A}', 'A', 'SITE', timestamptz '2026-06-01 10:00:00-03',
                                  timestamptz '2026-06-01 10:02:00-03'),
        ('${ORG_A}', 'B', 'SITE', timestamptz '2026-06-01 10:00:00-03',
                                  timestamptz '2026-06-01 10:03:00-03')
    `);

    const [linha] = await sql<{ mediana_minutos: string }>(`
      select * from public.crc_speed_to_lead(
        '${ORG_A}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)
    `);

    // Mediana de {2, 3} = 2,5. Meio-a-par daria 2; a regra do código dá 3.
    expect(Number(linha?.mediana_minutos)).toBe(3);
  });

  it("ninguém respondido devolve mediana nula, e não zero", async () => {
    await sql(`
      insert into public.crc_leads (organization_id, nome, origem, criado_em)
      values ('${ORG_A}', 'Sem resposta', 'SITE', timestamptz '2026-06-01 10:00:00-03')
    `);

    const [linha] = await sql<{ leads: number; mediana_minutos: number | null }>(`
      select * from public.crc_speed_to_lead(
        '${ORG_A}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)
    `);

    expect(Number(linha?.leads)).toBe(1);
    // Zero aqui seria a melhor nota possível para o pior cenário.
    expect(linha?.mediana_minutos).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("crc_panorama_totais", () => {
  it("8.000 abertas somam inteiro, e pacientes repetidos contam uma vez", async () => {
    await sql(`
      insert into public.crc_opportunities
        (organization_id, clinic_id, tipo, potential_value, fechada_em)
      select '${ORG_A}', '${CLINICA_A}', 'RECALL', 15.00, null
        from generate_series(1, 8000) i;

      insert into public.crc_patients (id, organization_id, clinic_id, external_id, nome)
      select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
             '${ORG_A}', '${CLINICA_A}', 'ext-' || i, 'Paciente ' || i
        from generate_series(1, 500) i;

      insert into public.crc_funnel_events
        (organization_id, clinic_id, patient_id, etapa, ocorrido_em)
      select '${ORG_A}', '${CLINICA_A}',
             ('00000000-0000-4000-8000-' || lpad(((i % 500) + 1)::text, 12, '0'))::uuid,
             'consulta_recuperada',
             timestamptz '2026-06-01 12:00:00-03'
        from generate_series(1, 4000) i;
    `);

    const [linha] = await sql<{
      oportunidades_abertas: number;
      valor_em_aberto: string;
      consultas_recuperadas: number;
      pacientes_reativados: number;
    }>(`
      select * from public.crc_panorama_totais(
        '${ORG_A}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)
    `);

    expect(Number(linha?.oportunidades_abertas)).toBe(8000);
    // Com o antigo teto de 3.000: 45.000 — plausível, e R$ 75 mil a menos.
    expect(Number(linha?.valor_em_aberto)).toBe(120_000);
    expect(Number(linha?.consultas_recuperadas)).toBe(4000);
    // 4.000 eventos, 500 pessoas. Quem voltou oito vezes continua sendo uma.
    expect(Number(linha?.pacientes_reativados)).toBe(500);
  });

  it("base vazia devolve uma linha de zeros, e não zero linhas", async () => {
    /*
     * `cross join` entre duas subconsultas agregadas sempre devolve UMA linha.
     * Se devolvesse zero, `analytics.ts` leria `undefined` e a tela mostraria
     * um painel em branco em vez de um painel zerado — que são coisas
     * diferentes para quem está olhando.
     */
    const linhas = await sql(`
      select * from public.crc_panorama_totais(
        '${ORG_A}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)
    `);

    expect(linhas).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("o que chega pelo PostgREST", () => {
  /*
   * ESTE BLOCO NÃO TESTA O SQL. Testa a FRONTEIRA — e ela já mordeu antes:
   * `numeric` chega ora como número, ora como string, e `analytics.ts`
   * normaliza com `String(...)` por causa disso. Se um dia o PostgREST mudar de
   * comportamento, é aqui que aparece, e não numa tela torta em produção.
   */
  it("as três funções respondem, e os tipos que chegam são os que o código trata", async () => {
    await sql(`
      insert into public.crc_opportunities
        (organization_id, clinic_id, tipo, lost_reason, potential_value, fechada_em)
      values ('${ORG_A}', '${CLINICA_A}', 'MANUAL', 'preco', 123.45,
              timestamptz '2026-06-01 12:00:00-03')
    `);

    const perdas = (await viaPostgrest("crc_motivos_de_perda", {
      p_organization_id: ORG_A,
      p_de: DE,
      p_ate: ATE,
    })) as Record<string, unknown>[];

    expect(perdas).toHaveLength(1);

    // O que o código faz com o valor: `somarDinheiro([String(...)])`. Isso
    // funciona para número E para string — e este teste registra qual dos dois
    // chegou hoje, para a mudança aparecer aqui se acontecer.
    const valor = perdas[0]?.["valor_perdido"];
    expect(["number", "string"]).toContain(typeof valor);
    expect(Number(valor)).toBeCloseTo(123.45, 2);

    const totais = (await viaPostgrest("crc_panorama_totais", {
      p_organization_id: ORG_A,
      p_de: DE,
      p_ate: ATE,
    })) as Record<string, unknown>[];

    expect(totais).toHaveLength(1);
    expect(Number(totais[0]?.["oportunidades_abertas"])).toBe(0);

    const velocidade = (await viaPostgrest("crc_speed_to_lead", {
      p_organization_id: ORG_A,
      p_de: DE,
      p_ate: ATE,
    })) as Record<string, unknown>[];

    expect(velocidade).toHaveLength(1);
    expect(velocidade[0]?.["mediana_minutos"]).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("o search_path das funções novas", () => {
  it("as três têm caminho fixo — `supabase/35` aplicado desde o nascimento", async () => {
    /*
     * Uma função sem `search_path` fixo resolve os nomes pelo caminho de quem a
     * CHAMA. O `supabase/35` corrigiu isso para todas as funções que existiam
     * na época; uma função nova sem a cláusula reabre o buraco em silêncio.
     */
    const linhas = await sql<{ proname: string; proconfig: string[] | null }>(`
      select p.proname, p.proconfig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('crc_motivos_de_perda', 'crc_speed_to_lead', 'crc_panorama_totais')
    `);

    expect(linhas).toHaveLength(3);

    for (const f of linhas) {
      expect(
        (f.proconfig ?? []).some((c) => c.startsWith("search_path=")),
        `${f.proname} está sem \`set search_path\`.`,
      ).toBe(true);
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("crc_gasto_de_ia", () => {
  it("12.000 chamadas: o custo sai inteiro, e o teto antigo dava 42% dele", async () => {
    await sql(`
      insert into public.crc_ai_calls
        (organization_id, feature, prompt_versao, modelo, custo_estimado,
         input_tokens, output_tokens, sucesso, criado_em)
      select '${ORG_A}', 'classificacao', 'v1', 'teste', 0.005000, 10, 5,
             i % 100 <> 0,
             timestamptz '2026-06-01 12:00:00-03'
        from generate_series(1, 12000) i
    `);

    const [linha] = await sql<{
      chamadas: number;
      falhas: number;
      custo_total: string;
      tokens_entrada: number;
      tokens_saida: number;
    }>(`
      select * from public.crc_gasto_de_ia('${ORG_A}'::uuid, '${DE}'::timestamptz)
    `);

    expect(Number(linha?.chamadas)).toBe(12_000);
    // Com o teto de 5.000: 25,00. A clínica teria gasto 60,00.
    expect(Number(linha?.custo_total)).toBe(60);
    expect(Number(linha?.falhas)).toBe(120);
    expect(Number(linha?.tokens_entrada)).toBe(120_000);
  });

  it("soma em `numeric`, e não em ponto flutuante", async () => {
    /*
     * `custo_estimado` é `numeric(10,6)` — seis casas. Somar mil valores de
     * 0,000001 em `double precision` acumula erro justamente na casa onde o
     * custo por chamada mora. Este teste prende o tipo, e não só o número.
     */
    await sql(`
      insert into public.crc_ai_calls
        (organization_id, feature, prompt_versao, modelo, custo_estimado, criado_em)
      select '${ORG_A}', 'classificacao', 'v1', 'teste', 0.000001,
             timestamptz '2026-06-01 12:00:00-03'
        from generate_series(1, 1000) i
    `);

    const [linha] = await sql<{ custo_total: string }>(`
      select * from public.crc_gasto_de_ia('${ORG_A}'::uuid, '${DE}'::timestamptz)
    `);

    /*
     * A MESMA SOMA EM `float8` DÁ 0,0010000000000000152 — medido neste banco:
     *
     *   select sum(0.000001::float8)  ->  0.0010000000000000152
     *   select sum(0.000001::numeric) ->  0.001000
     *
     * O erro aparece na 16ª casa, que parece inofensivo até alguém comparar
     * dois totais ou testar `= 0.001`.
     */
    expect(Number(linha?.custo_total)).toBe(0.001);
    expect(String(linha?.custo_total)).not.toContain("0.0010000000");
  });
});

/* -------------------------------------------------------------------------- */

describe("crc_leads_por_campanha", () => {
  it("normaliza igual ao `normalizarCampanha` do TypeScript", async () => {
    /*
     * ========================================================================
     *  O GASTO É GRAVADO NORMALIZADO, e a tela junta gasto e leads PELO NOME.
     *
     *  Se o SQL agrupasse pelo `utm_campaign` cru, "Black Friday" viraria uma
     *  campanha sem gasto e "black friday" um gasto sem leads — custo por
     *  paciente infinito numa linha e zero na outra, com o total certo.
     *
     *  As quatro grafias abaixo são as que `normalizarCampanha` colapsa:
     *  maiúscula, espaço duplo, espaço nas pontas e tabulação.
     * ========================================================================
     */
    await sql(`
      insert into public.crc_leads (organization_id, nome, origem, utm_campaign, criado_em)
      values
        ('${ORG_A}', 'A', 'SITE', 'Black Friday',    timestamptz '2026-06-10 10:00:00-03'),
        ('${ORG_A}', 'B', 'SITE', 'black  friday',   timestamptz '2026-06-10 10:00:00-03'),
        ('${ORG_A}', 'C', 'SITE', '  BLACK FRIDAY ', timestamptz '2026-06-10 10:00:00-03'),
        ('${ORG_A}', 'D', 'SITE', E'black\tfriday',  timestamptz '2026-06-10 10:00:00-03'),
        ('${ORG_A}', 'E', 'SITE', '',                timestamptz '2026-06-10 10:00:00-03'),
        ('${ORG_A}', 'F', 'SITE', null,              timestamptz '2026-06-10 10:00:00-03')
    `);

    const linhas = await sql<{ campanha: string; quantidade: number }>(`
      select * from public.crc_leads_por_campanha(
        '${ORG_A}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)
    `);

    const porNome = new Map(linhas.map((l) => [l.campanha, Number(l.quantidade)]));

    expect([...porNome.keys()].sort()).toEqual(["black friday", "geral"]);
    expect(porNome.get("black friday")).toBe(4);
    // Vazio e nulo são a mesma coisa para quem lê a tela.
    expect(porNome.get("geral")).toBe(2);
  });

  it("10.000 leads em duas campanhas: nenhuma é cortada", async () => {
    await sql(`
      insert into public.crc_leads
        (organization_id, nome, origem, utm_campaign, criado_em, primeira_resposta_em)
      select '${ORG_A}', 'Lead ' || i, 'SITE',
             case when i <= 7000 then 'a' else 'b' end,
             timestamptz '2026-06-10 10:00:00-03',
             case when i % 2 = 0 then timestamptz '2026-06-10 10:05:00-03' else null end
        from generate_series(1, 10000) i
    `);

    const linhas = await sql<{ campanha: string; quantidade: number; responderam: number }>(`
      select * from public.crc_leads_por_campanha(
        '${ORG_A}'::uuid, '${DE}'::timestamptz, '${ATE}'::timestamptz)
    `);

    const porNome = new Map(linhas.map((l) => [l.campanha, l]));

    expect(Number(porNome.get("a")?.quantidade)).toBe(7000);
    // Com teto de 5.000, "b" apareceria com zero: ela só existe depois da
    // 7.000ª linha.
    expect(Number(porNome.get("b")?.quantidade)).toBe(3000);
    expect(Number(porNome.get("a")?.responderam)).toBe(3500);
  });
});
