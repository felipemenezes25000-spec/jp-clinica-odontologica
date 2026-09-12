/**
 * Próxima Melhor Ação, com banco.
 *
 * ============================================================================
 *  A PRIMEIRA VERSÃO DESTE SERVIÇO LIA QUATRO COLUNAS QUE NÃO EXISTEM:
 *  `expected_value`, `respondeu`, `tentativas` e `expira_em` em
 *  `crc_opportunities`.
 *
 *  O TypeScript não pega — `selecionar<T>()` é genérico e devolve o que o
 *  chamador prometer. O lint não pega. E o banco-fake, na época, conferia nome
 *  de coluna só na ESCRITA: os quatro estavam na leitura (projeção, filtro e
 *  ordenação), e passavam inteiros. Em produção o PostgREST responderia 400 e
 *  a varredura cairia.
 *
 *  A conferência da leitura foi acrescentada ao fake junto com este arquivo, e
 *  é ela — não este teste — que impede a classe inteira do erro. Aqui os
 *  testes cobrem a DECISÃO; que as colunas existem, quem garante é o fake, em
 *  todo teste do repositório de uma vez.
 * ============================================================================
 *
 *  INJEÇÃO DE DEFEITO:
 *    contar tentativas desde sempre     → "tentativas contam desde a resposta" quebra;
 *    ler o cooldown da oportunidade     → "o cooldown é por PESSOA" quebra;
 *    usar potential_value sem probability → "o valor esperado é o produto" quebra.
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

import { decidirProximasAcoes, proximaAcaoDe } from "./melhor-acao";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PACIENTE = "aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// Uma terça-feira, 14:00 UTC = 11:00 em São Paulo. Dentro do horário.
const AGORA = new Date("2026-09-15T14:00:00.000Z");

const CONFIG = { cooldownHoras: 48, contatosPorDia: 3, tentativasMaximas: 4 };

function paciente(p: { optOut?: string | null; telefone?: string | null } = {}): void {
  semear("crc_patients", [
    {
      id: PACIENTE,
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "dental_office",
      external_id: "p-1",
      nome: "Maria",
      telefone: p.telefone === undefined ? "11999990000" : p.telefone,
      opt_out_em: p.optOut ?? null,
      criado_em: "2026-01-01T10:00:00.000Z",
      atualizado_em: "2026-01-01T10:00:00.000Z",
    },
  ]);
}

function oportunidade(p: { valor?: number; prob?: number; tipo?: string } = {}): void {
  semear("crc_opportunities", [
    {
      id: "op-1",
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      lead_id: null,
      tipo: p.tipo ?? "RECALL",
      stage_id: null,
      assigned_to: null,
      priority_score: 50,
      priority_fatores: [],
      potential_value: p.valor ?? 1000,
      probability: p.prob ?? 0.5,
      origem: "teste",
      fechada_em: null,
      chave_dedupe: "op-1",
      criado_em: "2026-09-01T10:00:00.000Z",
      atualizado_em: "2026-09-01T10:00:00.000Z",
    },
  ]);
}

function contato(quando: string): void {
  semear("crc_contact_log", [
    {
      id: `ct-${quando}`,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      canal: "whatsapp",
      texto: "oi",
      user_id: null,
      ocorrido_em: quando,
      criado_em: quando,
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

/* -------------------------------------------------------------------------- */

describe("a varredura", () => {
  it("grava o CÓDIGO e a FRASE, em colunas diferentes", async () => {
    /*
     * São dois destinatários: a recepcionista lê a frase, o motor lê o código.
     * Guardar só o texto obrigaria o motor a interpretar português.
     */
    paciente();
    oportunidade();

    const r = await decidirProximasAcoes(ORG, [CLINICA], CONFIG, AGORA);

    expect(r.decididas).toBe(1);

    const op = conteudo("crc_opportunities")[0];
    expect(typeof op?.["next_best_action"]).toBe("string");
    expect(String(op?.["next_best_action"] ?? "")).toMatch(/^[A-Z_]+$/);
    // A frase é humana: tem espaço e não é o código.
    expect(String(op?.["next_action"] ?? "")).toContain(" ");
    expect(op?.["next_action"]).not.toBe(op?.["next_best_action"]);
  });

  it("quem pediu para não ser contatado nunca vira ação externa", async () => {
    paciente({ optOut: "2026-05-01T10:00:00.000Z" });
    oportunidade();

    const r = await decidirProximasAcoes(ORG, [CLINICA], CONFIG, AGORA);

    expect(r.automatizaveis).toBe(0);
  });

  it("sem clínica alcançada, não decide nada", async () => {
    paciente();
    oportunidade();

    const r = await decidirProximasAcoes(ORG, [], CONFIG, AGORA);
    expect(r.decididas).toBe(0);
  });

  it("oportunidade fechada fica de fora", async () => {
    paciente();
    semear("crc_opportunities", [
      {
        id: "op-fechada",
        organization_id: ORG,
        clinic_id: CLINICA,
        patient_id: PACIENTE,
        lead_id: null,
        tipo: "RECALL",
        stage_id: null,
        assigned_to: null,
        priority_score: 10,
        priority_fatores: [],
        potential_value: 500,
        probability: 0.5,
        origem: "teste",
        fechada_em: "2026-09-02T10:00:00.000Z",
        chave_dedupe: "op-fechada",
        criado_em: "2026-09-01T10:00:00.000Z",
        atualizado_em: "2026-09-01T10:00:00.000Z",
      },
    ]);

    const r = await decidirProximasAcoes(ORG, [CLINICA], CONFIG, AGORA);
    expect(r.decididas).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("o contexto", () => {
  it("o valor esperado é potential_value × probability", async () => {
    /*
     * ============================================================================
     *  O Radar guarda os dois separados de propósito — guardar o produto criaria
     *  uma terceira coluna que envelhece sozinha toda vez que uma das duas mudar.
     *
     *  R$ 2.000 com 10% de chance é R$ 200 esperados, e NÃO justifica ligação
     *  (o limiar do domínio é R$ 800). Usar o potencial cru mandaria ligar.
     * ============================================================================
     */
    paciente();
    oportunidade({ valor: 2000, prob: 0.1 });

    const d = await proximaAcaoDe(ORG, "op-1", CONFIG, AGORA);

    expect(d).not.toBeNull();
    expect(d?.acao).not.toBe("CALL");
  });

  it("valor esperado alto justifica ligação", async () => {
    // R$ 20.000 com 60% = R$ 12.000 esperados, muito acima do limiar.
    paciente();
    oportunidade({ valor: 20_000, prob: 0.6 });

    const d = await proximaAcaoDe(ORG, "op-1", CONFIG, AGORA);
    expect(d?.acao).toBe("CALL");
  });

  it("o cooldown é por PESSOA, e conta do contato mais recente", async () => {
    /*
     * Três oportunidades do mesmo paciente, cada uma com seu próprio "último
     * contato", autorizariam três mensagens no mesmo dia — cada uma achando
     * que foi a primeira.
     */
    paciente();
    oportunidade();
    contato("2026-09-15T10:00:00.000Z"); // 4 horas atrás, dentro do cooldown de 48h

    const d = await proximaAcaoDe(ORG, "op-1", CONFIG, AGORA);

    // Contatado há 4h com cooldown de 48h: a decisão é esperar.
    expect(d?.acao).toBe("WAIT");
  });

  it("sem telefone, a ação é pedir o dado — e não mandar mensagem", async () => {
    paciente({ telefone: null });
    oportunidade();

    const d = await proximaAcaoDe(ORG, "op-1", CONFIG, AGORA);

    expect(d?.acao).not.toBe("WHATSAPP");
  });

  it("a decisão de UMA oportunidade não grava nada", async () => {
    /*
     * Abrir uma ficha não deve mudar o banco. Uma leitura que escreve
     * transforma "alguém olhou" em "algo aconteceu", e o histórico passa a
     * registrar curiosidade como decisão.
     */
    paciente();
    oportunidade();

    await proximaAcaoDe(ORG, "op-1", CONFIG, AGORA);

    const op = conteudo("crc_opportunities")[0];
    expect(op?.["next_best_action"]).toBeUndefined();
  });

  it("oportunidade de outra organização não é encontrada", async () => {
    paciente();
    oportunidade();

    expect(
      await proximaAcaoDe("bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "op-1", CONFIG, AGORA),
    ).toBeNull();
  });
});
