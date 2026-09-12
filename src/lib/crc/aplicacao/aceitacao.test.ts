/**
 * Aceitação de tratamento, com banco.
 *
 * ============================================================================
 *  O ELO QUE ESTE ARQUIVO PROTEGE, e sem o qual toda a FASE C vira enfeite:
 *
 *      a objeção precisa ganhar DESFECHO.
 *
 *  Sem ele, a analítica responde "preço aparece em 58% das objeções" — que todo
 *  mundo já sabe e ninguém age. Com ele, responde "preço aparece em 58% E
 *  converte em 11%, enquanto tempo aparece em 14% e converte em 47%" — e essa
 *  segunda frase muda o que a clínica faz no mês seguinte.
 *
 *  INJEÇÃO DE DEFEITO:
 *    não gravar `texto` na objeção        → "guarda o original" quebra;
 *    não preencher desfecho ao fechar     → "a analítica sabe converter" quebra;
 *    sobrescrever `categoria_original`    → "mede o classificador" quebra;
 *    tratar APPROVED como STARTED         → "aceito e não marcado" quebra.
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

import { VERSAO_DA_ACEITACAO } from "../dominio/aceitacao";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import {
  AMOSTRA_MINIMA_DA_ANALITICA,
  analiticaDeObjecoes,
  listarFunil,
  marcarDesfecho,
  qualificarOrcamentos,
  registrarObjecao,
  revisarObjecao,
} from "./aceitacao";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_2 = "aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

function orcamento(p: {
  id: string;
  valor?: number;
  status?: string;
  emitidoEm?: string;
  funil?: string | null;
  paciente?: string | null;
  clinica?: string;
  org?: string;
  aprovado?: number | null;
}): void {
  semear("crc_budgets", [
    {
      id: p.id,
      organization_id: p.org ?? ORG,
      clinic_id: p.clinica ?? CLINICA,
      patient_id: p.paciente ?? null,
      provider: "DENTAL_OFFICE_API",
      fingerprint: p.id,
      total_value: p.valor ?? 5000,
      approved_value: p.aprovado ?? null,
      status: p.status ?? "OPEN",
      emitido_em: p.emitidoEm ?? "2026-09-05T10:00:00.000Z",
      funil: p.funil ?? null,
      tentativas: 0,
      criado_em: "2026-09-05T10:00:00.000Z",
      atualizado_em: "2026-09-05T10:00:00.000Z",
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

/* -------------------------------------------------------------------------- */

describe("registrar objeção", () => {
  it("guarda o TEXTO ORIGINAL, e não só a categoria", async () => {
    /*
     * ============================================================================
     *  "Tá caro pra mim agora, mês que vem eu consigo" e "tá caro, achei mais
     *  barato na outra clínica" viram a mesma linha em PRECO — e são conversas
     *  opostas. A categoria é um índice para contar, não um substituto.
     * ============================================================================
     */
    orcamento({ id: "orc-1" });

    const r = await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "tá caro, achei metade disso na clínica do bairro",
      chaveDedupe: "o1",
    });

    expect(r?.categoria).toBe("PRECO");

    const linha = conteudo("crc_objections")[0];
    expect(linha?.["texto"]).toContain("achei metade disso");
    expect(linha?.["padrao"]).not.toBeNull();
  });

  it("move o funil do orçamento para a etapa da objeção", async () => {
    orcamento({ id: "orc-1" });

    await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "tenho medo de dentista",
      chaveDedupe: "o1",
    });

    const b = conteudo("crc_budgets")[0];
    expect(b?.["funil"]).toBe("FEAR_OBJECTION");
    expect(b?.["objecao_atual"]).toBe("MEDO");
    expect(b?.["ultimo_contato_em"]).toBe(AGORA.toISOString());
  });

  it("a objeção MUDA, e o histórico guarda a sequência", async () => {
    /*
     * Quatro conversas, quatro objeções, uma pessoa. Guardar só a última apaga
     * a sequência — e é a sequência que diz se a clínica está avançando ou
     * rodando em círculo.
     */
    orcamento({ id: "orc-1" });

    await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "vou pensar",
      chaveDedupe: "o1",
    });
    await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "tá caro",
      chaveDedupe: "o2",
    });
    await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "vou ver com meu marido",
      chaveDedupe: "o3",
    });

    expect(conteudo("crc_objections")).toHaveLength(3);
    // E a coluna desnormalizada tem a MAIS RECENTE.
    expect(conteudo("crc_budgets")[0]?.["objecao_atual"]).toBe("TERCEIRO");
  });

  it("a mesma objeção não entra duas vezes", async () => {
    orcamento({ id: "orc-1" });

    const a = await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "tá caro",
      chaveDedupe: "conv-1:msg-9",
    });
    const b = await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "tá caro",
      chaveDedupe: "conv-1:msg-9",
    });

    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(conteudo("crc_objections")).toHaveLength(1);
  });

  it("objeção sem orçamento é aceita — nem toda queixa tem orçamento atrás", async () => {
    const r = await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      texto: "não tenho tempo agora",
      chaveDedupe: "solta",
    });

    expect(r?.categoria).toBe("TEMPO");
    expect(r?.etapa).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("revisar a classificação", () => {
  it("guarda a categoria ORIGINAL — é ela que mede o classificador", async () => {
    /*
     * O par (automática, corrigida) é a única forma de saber se os padrões
     * acertam. Sobrescrever apagaria justamente a informação que a correção
     * produz.
     */
    orcamento({ id: "orc-1" });
    const r = await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "não sei, acho que não",
      chaveDedupe: "o1",
    });

    const original = conteudo("crc_objections")[0]?.["categoria"];

    await revisarObjecao(ORG, r?.id ?? "", "CONFIANCA", "user-1");

    const depois = conteudo("crc_objections")[0];
    expect(depois?.["categoria"]).toBe("CONFIANCA");
    expect(depois?.["categoria_original"]).toBe(original);
    expect(depois?.["revisada_em"]).toBe(AGORA.toISOString());
  });

  it("a SEGUNDA correção não sobrescreve a original", async () => {
    orcamento({ id: "orc-1" });
    const r = await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "tá caro",
      chaveDedupe: "o1",
    });

    await revisarObjecao(ORG, r?.id ?? "", "CONVENIO", "user-1");
    await revisarObjecao(ORG, r?.id ?? "", "TEMPO", "user-1");

    expect(conteudo("crc_objections")[0]?.["categoria_original"]).toBe("PRECO");
    expect(conteudo("crc_objections")[0]?.["categoria"]).toBe("TEMPO");
  });

  it("não revisa objeção de outro tenant", async () => {
    orcamento({ id: "orc-b", org: ORG_B, clinica: CLINICA_2 });
    const r = await registrarObjecao({
      organizationId: ORG_B,
      clinicId: CLINICA_2,
      budgetId: "orc-b",
      texto: "tá caro",
      chaveDedupe: "ob",
    });

    await revisarObjecao(ORG, r?.id ?? "", "TEMPO", "user-1");

    expect(conteudo("crc_objections")[0]?.["categoria"]).toBe("PRECO");
  });
});

/* -------------------------------------------------------------------------- */

describe("o desfecho", () => {
  it("fechar o orçamento dá desfecho às objeções dele", async () => {
    orcamento({ id: "orc-1" });
    await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "tá caro",
      chaveDedupe: "o1",
    });

    await marcarDesfecho(ORG, "orc-1", "CONVERTEU");

    expect(conteudo("crc_objections")[0]?.["desfecho"]).toBe("CONVERTEU");
    expect(conteudo("crc_budgets")[0]?.["funil"]).toBe("ACCEPTED");
    expect(conteudo("crc_budgets")[0]?.["aceito_em"]).toBe(AGORA.toISOString());
  });

  it("reprocessar NÃO reescreve o desfecho de uma objeção já resolvida", async () => {
    orcamento({ id: "orc-1" });
    await registrarObjecao({
      organizationId: ORG,
      clinicId: CLINICA,
      budgetId: "orc-1",
      texto: "tá caro",
      chaveDedupe: "o1",
    });

    await marcarDesfecho(ORG, "orc-1", "CONVERTEU");
    await marcarDesfecho(ORG, "orc-1", "PERDEU", "desistiu");

    // A objeção mantém o desfecho original: o segundo `marcarDesfecho` só
    // alcança as que ainda estavam nulas.
    expect(conteudo("crc_objections")[0]?.["desfecho"]).toBe("CONVERTEU");
  });

  it("perder registra o motivo", async () => {
    orcamento({ id: "orc-1" });
    await marcarDesfecho(ORG, "orc-1", "PERDEU", "foi para outra clínica");

    const b = conteudo("crc_budgets")[0];
    expect(b?.["funil"]).toBe("LOST");
    expect(b?.["perdido_motivo"]).toBe("foi para outra clínica");
  });
});

/* -------------------------------------------------------------------------- */

describe("a qualificação do funil", () => {
  it("pontua e grava a versão", async () => {
    orcamento({ id: "orc-1", valor: 4000 });

    const r = await qualificarOrcamentos(ORG, null, AGORA);

    expect(r.pontuados).toBe(1);
    const b = conteudo("crc_budgets")[0];
    expect(Number(b?.["conversao_prob"])).toBeGreaterThan(0);
    expect(b?.["conversao_versao"]).toBe(VERSAO_DA_ACEITACAO);
    expect(b?.["proxima_acao"]).not.toBeNull();
  });

  it("APROVADO vira ACEITOU, e NÃO iniciado", async () => {
    /*
     * ============================================================================
     *  O Dental Office diz que o orçamento foi APROVADO. Isso não quer dizer que
     *  o tratamento começou — quer dizer que a pessoa disse sim.
     *
     *  Tratar os dois como a mesma coisa esconderia exatamente o caso que mais
     *  se perde: aceito, aprovado no sistema, e nunca marcado. Ninguém procura
     *  por ele, porque o sistema mostra "aprovado".
     * ============================================================================
     */
    orcamento({ id: "orc-1", status: "APPROVED" });

    await qualificarOrcamentos(ORG, null, AGORA);

    expect(conteudo("crc_budgets")[0]?.["funil"]).toBe("ACCEPTED");
    expect(conteudo("crc_budgets")[0]?.["proxima_acao"]).toBe("AGENDAR");
  });

  it("a base histórica entra como PROPOSED, e a idade a empurra para baixo", async () => {
    orcamento({ id: "novo", emitidoEm: "2026-09-10T10:00:00.000Z" });
    orcamento({ id: "antigo", emitidoEm: "2025-01-10T10:00:00.000Z" });

    await qualificarOrcamentos(ORG, null, AGORA);

    const linhas = conteudo("crc_budgets");
    const pNovo = Number(linhas.find((l) => l["id"] === "novo")?.["conversao_prob"]);
    const antigo = linhas.find((l) => l["id"] === "antigo");

    expect(pNovo).toBeGreaterThan(0.3);
    // Mais de seis meses: a ação vira encerrar, para não inflar o funil.
    expect(antigo?.["proxima_acao"]).toBe("ENCERRAR");
  });

  it("não repontua o que já está na versão corrente", async () => {
    orcamento({ id: "orc-1" });
    await qualificarOrcamentos(ORG, null, AGORA);
    const segunda = await qualificarOrcamentos(ORG, null, AGORA);

    expect(segunda.lidos).toBe(1);
    expect(segunda.pontuados).toBe(0);
  });

  it("não atravessa tenant", async () => {
    orcamento({ id: "orc-b", org: ORG_B, clinica: CLINICA_2 });

    const r = await qualificarOrcamentos(ORG, null, AGORA);
    expect(r.lidos).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("a fila do funil", () => {
  it("ordena por VALOR, e não por probabilidade", async () => {
    /*
     * A fila do funil é trabalho de venda, e o que decide onde gastar a próxima
     * hora é quanto está em jogo. Ordenar por probabilidade poria no topo os
     * casos fáceis e baratos — que fecham sozinhos.
     */
    orcamento({ id: "grande", valor: 20000, funil: "PRICE_OBJECTION" });
    orcamento({ id: "facil", valor: 400, funil: "PROPOSED" });

    const fila = await listarFunil(ORG, [CLINICA], AGORA);

    expect(fila[0]?.id).toBe("grande");
  });

  it("o que já fechou ou morreu some da fila", async () => {
    orcamento({ id: "vivo", funil: "PROPOSED" });
    orcamento({ id: "morto", funil: "LOST" });
    orcamento({ id: "andando", funil: "STARTED" });

    const fila = await listarFunil(ORG, [CLINICA], AGORA);

    expect(fila.map((f) => f.id)).toEqual(["vivo"]);
  });

  it("respeita as clínicas alcançadas", async () => {
    orcamento({ id: "aqui", funil: "PROPOSED", clinica: CLINICA });
    orcamento({ id: "la", funil: "PROPOSED", clinica: CLINICA_2 });

    expect(await listarFunil(ORG, [CLINICA], AGORA)).toHaveLength(1);
    expect(await listarFunil(ORG, [CLINICA, CLINICA_2], AGORA)).toHaveLength(2);
    expect(await listarFunil(ORG, [], AGORA)).toHaveLength(0);
  });

  it("orçamento que o CRC nunca olhou não aparece na fila", async () => {
    // `funil` nulo = base histórica ainda não avaliada. Ela entra quando a
    // varredura passar, e não antes — senão a fila nasce com 8.000 linhas.
    orcamento({ id: "cru", funil: null });

    expect(await listarFunil(ORG, [CLINICA], AGORA)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("a analítica de objeções", () => {
  async function objecoes(
    categoria: string,
    quantas: number,
    desfecho: string | null,
  ): Promise<void> {
    for (let i = 0; i < quantas; i += 1) {
      semear("crc_objections", [
        {
          id: `${categoria}-${String(i)}`,
          organization_id: ORG,
          clinic_id: CLINICA,
          categoria,
          texto: "texto original",
          confianca: 0.9,
          desfecho,
          ocorrido_em: AGORA.toISOString(),
          criado_em: AGORA.toISOString(),
        },
      ]);
    }
  }

  it("a taxa é NULL abaixo da amostra mínima — e não zero", async () => {
    /*
     * ============================================================================
     *  Com três objeções resolvidas, "33% de conversão" é ruído apresentado como
     *  medida — e é o tipo de número que alguém leva para uma reunião.
     *
     *  `null` faz a tela escrever "ainda sem dados suficientes", que é a verdade.
     * ============================================================================
     */
    await objecoes("PRECO", 3, "CONVERTEU");

    const a = await analiticaDeObjecoes(ORG, null);
    expect(a[0]?.taxaDeConversao).toBeNull();
    expect(a[0]?.total).toBe(3);
  });

  it("com amostra suficiente, a taxa aparece", async () => {
    await objecoes("PRECO", AMOSTRA_MINIMA_DA_ANALITICA, "CONVERTEU");
    await objecoes("PRECO_perdidas", 0, null);

    const a = await analiticaDeObjecoes(ORG, null);
    const preco = a.find((x) => x.categoria === "PRECO");

    expect(preco?.taxaDeConversao).toBe(1);
  });

  it("separa convertidas, perdidas e sem desfecho", async () => {
    await objecoes("TEMPO", 5, "CONVERTEU");
    await objecoes("TEMPO_perdeu", 0, null);

    semear("crc_objections", [
      {
        id: "t-perdida",
        organization_id: ORG,
        clinic_id: CLINICA,
        categoria: "TEMPO",
        texto: "x",
        confianca: 0.9,
        desfecho: "PERDEU",
        ocorrido_em: AGORA.toISOString(),
        criado_em: AGORA.toISOString(),
      },
      {
        id: "t-aberta",
        organization_id: ORG,
        clinic_id: CLINICA,
        categoria: "TEMPO",
        texto: "x",
        confianca: 0.9,
        desfecho: null,
        ocorrido_em: AGORA.toISOString(),
        criado_em: AGORA.toISOString(),
      },
    ]);

    const a = await analiticaDeObjecoes(ORG, null);
    const tempo = a.find((x) => x.categoria === "TEMPO");

    expect(tempo?.convertidas).toBe(5);
    expect(tempo?.perdidas).toBe(1);
    expect(tempo?.semDesfecho).toBe(1);
  });

  it("não atravessa tenant", async () => {
    semear("crc_objections", [
      {
        id: "b1",
        organization_id: ORG_B,
        clinic_id: CLINICA_2,
        categoria: "PRECO",
        texto: "x",
        confianca: 0.9,
        desfecho: "CONVERTEU",
        ocorrido_em: AGORA.toISOString(),
        criado_em: AGORA.toISOString(),
      },
    ]);

    expect(await analiticaDeObjecoes(ORG, null)).toHaveLength(0);
  });
});
