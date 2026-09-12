/**
 * A unidade do agendamento vem da CONVERSA — e antes vinha da ordem de cadastro.
 *
 * ============================================================================
 *  O DEFEITO QUE ESTES TESTES PRENDEM.
 *
 *  `contextoDeAgendamentoParaJob` recebia `conversationId` e o ignorava. A
 *  clínica saía de `selecionarUm("crc_clinics", { ativa = true })` — a primeira
 *  que o banco devolvesse.
 *
 *      organização com Clínica A e Clínica B
 *        ↓  paciente escreve no WhatsApp da B
 *        ↓  o webhook roteia certo: conversa com clinic_id = B
 *        ↓  o agente decide oferecer horário
 *        ↓  o contexto devolve a A
 *      horário da A oferecido ao paciente, agendamento GRAVADO na A
 *
 *  O roteamento de ENTRADA tinha sido consertado no `supabase/23`. O de SAÍDA
 *  não — e meia fronteira não é fronteira. O paciente recebe o endereço errado,
 *  e a agenda de uma unidade ganha alguém que nunca esteve lá.
 *
 *  INJEÇÃO DE DEFEITO: voltar a ignorar o `conversationId` — trocar
 *  `clinicaDaConversa(...)` por `selecionarUm("crc_clinics", { ativa })` —
 *  quebra "a clínica é a da conversa, e não a primeira cadastrada".
 * ============================================================================
 *
 * POR QUE O TESTE CADASTRA A **A** PRIMEIRO. Porque é o que torna o resultado
 * discriminante: com a B primeiro, o código velho acertaria por acaso e o teste
 * ficaria verde protegendo nada.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return { ...fake };
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { CONFIGURACAO_PADRAO } from "../dominio/configuracao";
import { limparBanco, semear } from "../testes/banco-memoria";
import { clinicaDaConversa } from "../aplicacao/conversas";

import { contextoDeAgendamentoParaJob } from "./handlers";

const ORG = "11111111-1111-4111-8111-111111111111";
const OUTRA_ORG = "1e1e1e1e-1111-4111-8111-111111111111";
const CLINICA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINICA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONVERSA_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const SEM_FLAGS: Readonly<Record<string, boolean>> = {};

function cenarioDeDuasUnidades(): void {
  semear("crc_organizations", [
    { id: ORG, nome: "Rede", slug: "rede" },
    { id: OUTRA_ORG, nome: "Outra", slug: "outra" },
  ]);

  // A **A** PRIMEIRO, de propósito: é o que faz o código velho errar.
  semear("crc_clinics", [
    {
      id: CLINICA_A,
      organization_id: ORG,
      nome: "Unidade Centro",
      slug: "centro",
      external_id: "ext-A",
      ativa: true,
      criado_em: "2026-01-01T00:00:00.000Z",
    },
    {
      id: CLINICA_B,
      organization_id: ORG,
      nome: "Unidade Sul",
      slug: "sul",
      external_id: "ext-B",
      ativa: true,
      criado_em: "2026-02-01T00:00:00.000Z",
    },
  ]);

  semear("crc_conversations", [
    {
      id: CONVERSA_B,
      organization_id: ORG,
      clinic_id: CLINICA_B,
      canal: "whatsapp",
      contato_externo: "5511999990000",
      status: "ABERTA",
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  // O sandbox do Dental Office dispensa credencial: este arquivo testa QUAL
  // unidade é escolhida, e não como a credencial dela é resolvida.
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("DENTAL_OFFICE_SANDBOX", "1");
  cenarioDeDuasUnidades();
});

/* -------------------------------------------------------------------------- */

describe("de qual unidade é a conversa", () => {
  it("devolve a clínica da CONVERSA, e não a primeira cadastrada", async () => {
    const r = await clinicaDaConversa(ORG, CONVERSA_B);
    expect(r?.clinicId).toBe(CLINICA_B);
    expect(r?.clinicaExternaId).toBe("ext-B");
  });

  it("uma conversa de outra organização NÃO devolve a clínica desta", async () => {
    // O uuid é real e existe — o que muda é quem pergunta. Sem o tenant no
    // filtro, um id vazado entregaria a unidade de outra empresa.
    expect(await clinicaDaConversa(OUTRA_ORG, CONVERSA_B)).toBeNull();
  });

  it("clínica desativada NÃO serve, mesmo com a conversa apontando para ela", async () => {
    // Uma unidade que fechou ainda tem conversas antigas. Oferecer horário nela
    // marcaria consulta numa sala que não existe mais.
    limparBanco();
    cenarioDeDuasUnidades();
    semear("crc_clinics", [
      {
        id: CLINICA_B,
        organization_id: ORG,
        nome: "Unidade Sul",
        slug: "sul",
        external_id: "ext-B",
        ativa: false,
      },
    ]);

    expect(await clinicaDaConversa(ORG, CLINICA_B)).toBeNull();
  });

  it("sem conversa, não há palpite", async () => {
    expect(await clinicaDaConversa(ORG, "")).toBeNull();
    expect(await clinicaDaConversa("", CONVERSA_B)).toBeNull();
  });
});

describe("o contexto de agendamento do turno", () => {
  it("usa a clínica da conversa — A cadastrada primeiro, B é quem escreve", async () => {
    const ctx = await contextoDeAgendamentoParaJob(
      ORG,
      CONVERSA_B,
      CONFIGURACAO_PADRAO,
      SEM_FLAGS,
      SEM_FLAGS,
    );

    /*
     * AS DUAS ASSERÇÕES SÃO NECESSÁRIAS, e a segunda é a que importa para o
     * Dental Office: `clinicId` é a chave interna, `clinicaExternaId` é o que
     * vai no corpo do POST que cria a consulta lá.
     */
    expect(ctx).not.toBeNull();
    expect(ctx?.clinicId).toBe(CLINICA_B);
    expect(ctx?.clinicaExternaId).toBe("ext-B");
  });

  it("FALHA FECHADO quando a clínica não pode ser determinada", async () => {
    /*
     * Sem conversa, o código velho devolvia contexto — o da primeira clínica
     * ativa — e o agente seguia agendando. Recusar é a única resposta certa:
     * escrever no Dental Office com o tenant ambíguo é pior do que não escrever.
     */
    const ctx = await contextoDeAgendamentoParaJob(
      ORG,
      "",
      CONFIGURACAO_PADRAO,
      SEM_FLAGS,
      SEM_FLAGS,
    );
    expect(ctx).toBeNull();
  });

  it("uma conversa de outra organização não monta contexto nesta", async () => {
    const ctx = await contextoDeAgendamentoParaJob(
      OUTRA_ORG,
      CONVERSA_B,
      CONFIGURACAO_PADRAO,
      SEM_FLAGS,
      SEM_FLAGS,
    );
    expect(ctx).toBeNull();
  });
});
