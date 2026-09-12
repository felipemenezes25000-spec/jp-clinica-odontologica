/**
 * A timeline "o que a IA está fazendo agora".
 *
 * ============================================================================
 *  A INVARIANTE QUE VALE MAIS QUE TODAS AQUI: registrar atividade NUNCA pode
 *  derrubar quem estava agindo.
 *
 *  A timeline é um confortável; enviar a mensagem é o trabalho. Um `insert` que
 *  falha por indisponibilidade do banco não pode transformar "a mensagem saiu"
 *  em "a operação caiu" — e esse é exatamente o risco de um `await` a mais no
 *  meio de um caminho crítico.
 *
 *  INJEÇÃO DE DEFEITO: tirar o `try/catch` de `registrarAtividade` → o teste
 *  "falha de banco não derruba quem chamou" quebra.
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

import {
  conteudo,
  definirRelogio,
  falharProximaEscrita,
  limparBanco,
} from "../testes/banco-memoria";

import { lerAtividade, lerPendencias, registrarAtividade } from "./atividade";

const ORG = "aaaa0000-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbb0000-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CLINICA = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_2 = "aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGORA = new Date("2026-09-12T14:00:00.000Z");

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
});

/* -------------------------------------------------------------------------- */

describe("registrar", () => {
  it("grava o passo e o marca concluído", async () => {
    const ok = await registrarAtividade({
      organizationId: ORG,
      clinicId: CLINICA,
      tipo: "DETECTOU",
      titulo: "Detectou cancelamento de 14h",
      motivo: "A consulta de quinta foi cancelada pelo paciente.",
      chaveDedupe: "detectou:ag-2001",
    });

    expect(ok).toBe(true);

    const linha = conteudo("crc_ai_activity")[0];
    expect(linha?.["activity_type"]).toBe("DETECTOU");
    expect(linha?.["status"]).toBe("CONCLUIDA");
    expect(linha?.["completed_at"]).toBe(AGORA.toISOString());
  });

  it("passo PLANEJADO fica sem data de conclusão", async () => {
    /*
     * E é essa ausência que denuncia um passo travado no meio: uma linha antiga
     * com `completed_at` nulo é a assinatura de algo que começou e não terminou.
     */
    await registrarAtividade({
      organizationId: ORG,
      tipo: "ESCOLHEU",
      titulo: "Vai oferecer horários",
      status: "PLANEJADA",
      chaveDedupe: "p1",
    });

    expect(conteudo("crc_ai_activity")[0]?.["completed_at"]).toBeNull();
  });

  it("o mesmo passo não entra duas vezes", async () => {
    const a = await registrarAtividade({
      organizationId: ORG,
      tipo: "ENVIOU",
      titulo: "Enviou o primeiro contato",
      chaveDedupe: "enviou:op-1:tentativa-1",
    });
    const b = await registrarAtividade({
      organizationId: ORG,
      tipo: "ENVIOU",
      titulo: "Enviou o primeiro contato",
      chaveDedupe: "enviou:op-1:tentativa-1",
    });

    expect(a).toBe(true);
    expect(b).toBe(false);
    expect(conteudo("crc_ai_activity")).toHaveLength(1);
  });

  it("dois passos SEM chave de dedupe convivem", async () => {
    /*
     * Nem todo passo tem de onde tirar chave. O índice é parcial justamente
     * para isso — e sem o `where`, o segundo passo sem chave seria recusado
     * como duplicata, e a timeline perderia metade dos registros manuais.
     */
    await registrarAtividade({ organizationId: ORG, tipo: "AVALIOU", titulo: "Um" });
    await registrarAtividade({ organizationId: ORG, tipo: "AVALIOU", titulo: "Dois" });

    expect(conteudo("crc_ai_activity")).toHaveLength(2);
  });

  it("falha de banco NÃO derruba quem chamou", async () => {
    /*
     * ============================================================================
     *  O TESTE MAIS IMPORTANTE DESTE ARQUIVO.
     *
     *  `registrarAtividade` é chamada no meio do caminho que envia mensagem. Se
     *  ela propagasse a exceção, um banco momentaneamente indisponível
     *  transformaria uma falha de OBSERVABILIDADE numa falha de OPERAÇÃO — e a
     *  clínica pararia de falar com pacientes porque a timeline caiu.
     * ============================================================================
     */
    falharProximaEscrita("crc_ai_activity", "banco indisponível");

    const ok = await registrarAtividade({
      organizationId: ORG,
      tipo: "ENVIOU",
      titulo: "Enviou",
      chaveDedupe: "x",
    });

    expect(ok).toBe(false);
    expect(conteudo("crc_ai_activity")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("ler", () => {
  async function trespassos(): Promise<void> {
    await registrarAtividade({
      organizationId: ORG,
      clinicId: CLINICA,
      tipo: "DETECTOU",
      titulo: "Primeiro",
      chaveDedupe: "a",
    });
    await registrarAtividade({
      organizationId: ORG,
      clinicId: CLINICA_2,
      tipo: "ENVIOU",
      titulo: "De outra unidade",
      chaveDedupe: "b",
    });
    await registrarAtividade({
      organizationId: ORG_B,
      clinicId: CLINICA,
      tipo: "ENVIOU",
      titulo: "De outro tenant",
      chaveDedupe: "c",
    });
  }

  it("não atravessa tenant", async () => {
    await trespassos();

    const linhas = await lerAtividade({ organizationId: ORG });
    expect(linhas).toHaveLength(2);
    expect(linhas.every((l) => l.titulo !== "De outro tenant")).toBe(true);
  });

  it("filtra por clínica quando pedido", async () => {
    await trespassos();

    const linhas = await lerAtividade({ organizationId: ORG, clinicId: CLINICA });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.titulo).toBe("Primeiro");
  });

  it("o teto da timeline é rígido — um limite absurdo não vira leitura da tabela", async () => {
    /*
     * Sem o teto, um `limite` vindo de parâmetro de URL viraria uma leitura da
     * tabela inteira numa tela que atualiza sozinha.
     */
    for (let i = 0; i < 20; i += 1) {
      await registrarAtividade({
        organizationId: ORG,
        tipo: "AVALIOU",
        titulo: `Passo ${String(i)}`,
        chaveDedupe: `t${String(i)}`,
      });
    }

    const linhas = await lerAtividade({ organizationId: ORG, limite: 100_000 });
    expect(linhas.length).toBeLessThanOrEqual(200);
  });

  it("pendências trazem SÓ o que espera decisão ou está bloqueado", async () => {
    /*
     * A Home tem uma seção "o que precisa de você", e ela só vale se for
     * exceção. Uma Home que lista tudo que aconteceu é uma Home que ninguém lê,
     * e o item que precisava de decisão fica enterrado.
     */
    await registrarAtividade({
      organizationId: ORG,
      clinicId: CLINICA,
      tipo: "ENVIOU",
      titulo: "Rotina",
      chaveDedupe: "r",
    });
    await registrarAtividade({
      organizationId: ORG,
      clinicId: CLINICA,
      tipo: "ESCOLHEU",
      titulo: "Precisa de aprovação",
      status: "AGUARDANDO_APROVACAO",
      chaveDedupe: "ap",
    });
    await registrarAtividade({
      organizationId: ORG,
      clinicId: CLINICA,
      tipo: "BLOQUEOU",
      titulo: "Bloqueada por guardrail",
      status: "BLOQUEADA",
      chaveDedupe: "bl",
    });

    const p = await lerPendencias(ORG, CLINICA);

    expect(p).toHaveLength(2);
    expect(p.every((x) => x.titulo !== "Rotina")).toBe(true);
  });

  it("confiança não medida continua nula, e não vira zero", async () => {
    /*
     * `Number(null)` é 0, e um 0 aqui seria lido na tela como "confiança zero"
     * — que é uma afirmação — em vez de "não medida", que é a verdade.
     */
    await registrarAtividade({
      organizationId: ORG,
      tipo: "AVALIOU",
      titulo: "Sem confiança medida",
      chaveDedupe: "sc",
    });

    expect((await lerAtividade({ organizationId: ORG }))[0]?.confianca).toBeNull();
  });
});
