/**
 * O congelamento do público não pode perder ninguém.
 *
 * ============================================================================
 *  O DEFEITO ERA UM `limite:` NUMA CONSULTA.
 *
 *      const pessoas = await selecionar("crc_patients", {
 *        filtros: filtrosDoPublico(...),
 *        limite: MAX_PUBLICO,          // 5000
 *      });
 *      ...
 *      return { ok: true, publico: pessoas.length };
 *
 *  Com um filtro que casa 8.000 pessoas, o congelamento gravava 5.000 e as
 *  outras 3.000 sumiam. Sem erro, sem aviso, sem uma linha de log — e a tela
 *  dizia "público: 5000", que é um número e parece uma resposta.
 *
 *  É a TERCEIRA vez que o mesmo defeito aparece neste sistema: o recall lia 200
 *  e chamava de base, o aniversário lia 2.000 e chamava de base, a campanha
 *  lia 5.000 e chamava de público. Um `limite` escrito como proteção, lido como
 *  resultado.
 *
 *  INJEÇÃO DE DEFEITO: devolver o `limite: MAX_PUBLICO` faz "8.000 não perde
 *  ninguém" reprovar com 5.000 — o número exato do truncamento.
 * ============================================================================
 *
 * O TETO CONTINUA EXISTINDO e agora RECUSA em vez de cortar, dizendo quantas
 * pessoas casaram. Um recorte de 60 mil quase sempre é filtro mal montado, e a
 * resposta certa para isso é "revise", não "mandei para os 5.000 primeiros que
 * o banco devolveu".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Permite fingir um público gigante sem semear cinquenta mil linhas.
 *
 * O QUE SE TESTA É A DECISÃO — recusar e dizer o número —, e não a capacidade
 * do banco em memória. Semear 50.001 pacientes mediria o fake, levaria minutos,
 * e provaria a mesma coisa.
 */
const forcado = vi.hoisted(() => ({ total: null as number | null }));

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return {
    ...fake,
    contar: (tabela: string, filtros: never) =>
      forcado.total !== null && tabela === "crc_patients"
        ? Promise.resolve(forcado.total)
        : fake.contar(tabela, filtros),
  };
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import {
  agendarCampanha,
  criarCampanha,
  opcoesDoPublico,
  FILTRO_PUBLICO_VAZIO,
  MAX_PUBLICO,
} from "./campanhas";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";
const CLINICA_B = "33333333-3333-4333-8333-333333333333";
const AGORA = new Date("2026-09-08T14:00:00.000Z");

function pacientes(quantos: number, extras: (i: number) => Record<string, unknown> = () => ({})) {
  for (let i = 0; i < quantos; i += 1) {
    semear("crc_patients", [
      {
        id: `p-${String(i).padStart(6, "0")}`,
        organization_id: ORG,
        clinic_id: CLINICA,
        external_source: "do",
        external_id: `x-${String(i)}`,
        nome: `Paciente ${String(i)}`,
        telefone: `5511${String(900000000 + i)}`,
        situacao: "EM_TRATAMENTO",
        ativo: true,
        arquivado: false,
        ...extras(i),
      },
    ]);
  }
}

async function campanhaCom(): Promise<string> {
  const criada = await criarCampanha({
    organizationId: ORG,
    clinicId: CLINICA,
    nome: "Reativação",
    mensagem: "Oi, {{primeiroNome}}! Vamos marcar?",
    filtros: { ...FILTRO_PUBLICO_VAZIO },
    porDia: 100,
    autorId: "u-1",
  });
  if (!criada.ok) throw new Error(criada.motivo);
  return criada.id;
}

const alvos = (): number => conteudo("crc_campaign_targets").length;

beforeEach(() => {
  forcado.total = null;
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, nome: "JP", slug: "jp" }]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, nome: "Matriz", slug: "matriz", ativa: true },
    { id: CLINICA_B, organization_id: ORG, nome: "Sul", slug: "sul", ativa: true },
  ]);
});

/* -------------------------------------------------------------------------- */

describe("o congelamento do público", () => {
  it("100 pacientes: congela os 100", async () => {
    pacientes(100);
    const id = await campanhaCom();

    const r = await agendarCampanha({ organizationId: ORG, campaignId: id, autorId: "u-1" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.publico).toBe(100);
    expect(alvos()).toBe(100);
  });

  it("964 pacientes: congela os 964", async () => {
    // O número da campanha real que motivou a cadência. Ele atravessa duas
    // páginas de 500, que é onde a paginação começa a valer.
    pacientes(964);
    const id = await campanhaCom();

    const r = await agendarCampanha({ organizationId: ORG, campaignId: id, autorId: "u-1" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.publico).toBe(964);
    expect(alvos()).toBe(964);
  });

  it("5.000 pacientes: o antigo teto não corta mais nada", async () => {
    /*
     * EXATAMENTE NO LIMITE ANTIGO. Antes, `limite: 5000` devolvia 5.000 aqui e
     * parecia certo — o defeito só aparecia em 5.001. Este caso existe para
     * fixar a fronteira: 5.000 continua sendo 5.000, e não é mais um teto.
     */
    pacientes(5000);
    const id = await campanhaCom();

    const r = await agendarCampanha({ organizationId: ORG, campaignId: id, autorId: "u-1" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.publico).toBe(5000);
    expect(alvos()).toBe(5000);
  }, 120_000);

  it("8.000 pacientes: NINGUÉM some", async () => {
    /*
     * ========================================================================
     *  O TESTE QUE PEGA O DEFEITO. Com `limite: MAX_PUBLICO` de volta, este
     *  número é 5.000 — e a diferença de 3.000 são pessoas que a clínica achou
     *  que tinha contatado.
     * ========================================================================
     */
    pacientes(8000);
    const id = await campanhaCom();

    const r = await agendarCampanha({ organizationId: ORG, campaignId: id, autorId: "u-1" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.publico).toBe(8000);
    expect(alvos()).toBe(8000);

    // E CADA UM APARECE UMA VEZ SÓ: a paginação por keyset não repete a
    // fronteira entre páginas.
    const distintos = new Set(conteudo("crc_campaign_targets").map((a) => a["patient_id"]));
    expect(distintos.size).toBe(8000);
  }, 180_000);

  it("acima do teto, RECUSA e diz o número — nunca corta em silêncio", async () => {
    /*
     * A alternativa seria truncar, e truncar é o defeito com outro nome. Quem
     * lê "casaram 50.001 pacientes" entende na hora que o filtro está largo
     * demais — informação que nenhum corte silencioso dá.
     *
     * O cenário usa a contagem, e não 50 mil linhas semeadas: o que se testa é
     * a DECISÃO, e semear 50.001 pacientes no fake mediria o fake.
     */
    pacientes(10);
    const id = await campanhaCom();

    forcado.total = MAX_PUBLICO + 1;
    const r = await agendarCampanha({ organizationId: ORG, campaignId: id, autorId: "u-1" });
    forcado.total = null;

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("50.001");
    expect(r.motivo).toContain("teto");
    // E NADA FOI CONGELADO: recusar é recusar.
    expect(alvos()).toBe(0);
  });

  it("agendar duas vezes não duplica ninguém", async () => {
    // A idempotência é do índice `(campaign_id, patient_id)`, e o lote usa
    // `ignore-duplicates`. Um clique duplo regrava o que faltava.
    pacientes(600);
    const id = await campanhaCom();

    await agendarCampanha({ organizationId: ORG, campaignId: id, autorId: "u-1" });
    const depoisDaPrimeira = alvos();

    // A segunda recusa por status, mas o congelamento em si é idempotente —
    // este teste prova as duas coisas ao mesmo tempo.
    const segunda = await agendarCampanha({ organizationId: ORG, campaignId: id, autorId: "u-1" });

    expect(depoisDaPrimeira).toBe(600);
    expect(alvos()).toBe(600);
    expect(segunda.ok).toBe(false);
  });

  it("quem optou por não receber fica de fora do congelamento", async () => {
    pacientes(100, (i) => (i < 30 ? { opt_out_em: "2026-01-01T00:00:00.000Z" } : {}));
    const id = await campanhaCom();

    const r = await agendarCampanha({ organizationId: ORG, campaignId: id, autorId: "u-1" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // O opt-out é filtro de ENTRADA, e não de envio: quem pediu para não
    // receber não entra na lista, em vez de entrar e ser pulado depois.
    expect(r.publico).toBe(70);
  });

  it("quem já tem consulta marcada fica de fora", async () => {
    pacientes(100, (i) => (i < 40 ? { proxima_consulta_em: "2026-10-01T10:00:00.000Z" } : {}));
    const id = await campanhaCom();

    const r = await agendarCampanha({ organizationId: ORG, campaignId: id, autorId: "u-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.publico).toBe(60);
  });

  it("filtro que não casa com ninguém recusa, e não cria campanha vazia", async () => {
    pacientes(50, () => ({ opt_out_em: "2026-01-01T00:00:00.000Z" }));
    const id = await campanhaCom();

    const r = await agendarCampanha({ organizationId: ORG, campaignId: id, autorId: "u-1" });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("Nenhuma pessoa");
  });
});

/* -------------------------------------------------------------------------- */

describe("as opções do filtro", () => {
  it("acha especialidade que só existe DEPOIS da linha 5.000", async () => {
    /*
     * ========================================================================
     *  `opcoesDoPublico` lia 5.000 pacientes e fazia `Set` em memória. O
     *  comentário chamava isso de "teto alto".
     *
     *  O efeito é pior do que uma lista incompleta: o filtro não mostra
     *  "Endodontia", a pessoa conclui que a clínica não tem esse recorte, e
     *  monta a campanha sem ele. O dado existe; a interface jura que não.
     * ========================================================================
     */
    pacientes(6000, (i) => ({
      especialidade: i === 5999 ? "Endodontia" : "Clínica Geral",
      convenio: i === 5998 ? "Amil" : null,
    }));

    const r = await opcoesDoPublico(ORG);

    expect(r.especialidades).toContain("Endodontia");
    expect(r.convenios).toContain("Amil");
  }, 120_000);

  it("respeita a unidade quando a campanha é de uma clínica", async () => {
    semear("crc_patients", [
      {
        id: "p-a",
        organization_id: ORG,
        clinic_id: CLINICA,
        external_source: "do",
        external_id: "a",
        nome: "A",
        telefone: "5511900000001",
        especialidade: "Ortodontia",
      },
      {
        id: "p-b",
        organization_id: ORG,
        clinic_id: CLINICA_B,
        external_source: "do",
        external_id: "b",
        nome: "B",
        telefone: "5511900000002",
        especialidade: "Implante",
      },
    ]);

    const daMatriz = await opcoesDoPublico(ORG, CLINICA);

    expect(daMatriz.especialidades).toEqual(["Ortodontia"]);
    // A especialidade da outra unidade NÃO aparece: a tela da matriz não pode
    // oferecer um recorte que, ali, não casa com ninguém.
    expect(daMatriz.especialidades).not.toContain("Implante");
  });

  it("valor em branco não vira opção", async () => {
    pacientes(5, (i) => ({ especialidade: i === 0 ? "  " : "Clínica Geral" }));

    const r = await opcoesDoPublico(ORG);
    expect(r.especialidades).toEqual(["Clínica Geral"]);
  });
});
