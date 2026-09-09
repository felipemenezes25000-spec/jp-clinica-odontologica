/**
 * `aoReceberMensagem` — a trava que separa "a IA lê" de "a IA fala".
 *
 * ESTE ARQUIVO EXISTE POR CAUSA DE UM DEFEITO REAL. A tela de Configurações e o
 * comentário de `ModoAutomacao` descreviam `ai_autopilot` como "a IA pode agir
 * sozinha", e nenhuma linha de código lia a flag. Uma promessa documentada e não
 * cumprida é pior que um recurso ausente: alguém desliga o interruptor,
 * acredita que travou a automação, e ela continua falando com paciente.
 *
 * O QUE ESTES TESTES PROTEGEM é a fronteira, nos dois sentidos:
 *
 *   COM O AUTOPILOT DESLIGADO, a classificação ainda acontece — resumo,
 *   temperatura e escalonamento continuam alimentando a Inbox. Travar isso
 *   também seria cegar a operação humana para proteger dela mesma.
 *
 *   COM ELE DESLIGADO, NADA É ENVIADO e NADA É GRAVADO no Dental Office —
 *   inclusive quando já existe uma oferta aberta esperando resposta. Aceitar
 *   horário é a ação mais forte do fluxo, e é justamente a que passaria
 *   despercebida se a trava ficasse só antes de oferecer.
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

/**
 * O Dental Office responde pelo sandbox.
 *
 * SEM ISTO O TESTE NÃO TESTA NADA: `contextoDeAgendamento` devolve `null`
 * quando não há credencial, e o handler sai antes de chegar em qualquer trava.
 * Foi exatamente assim que a primeira versão deste arquivo passou também com a
 * trava REMOVIDA — um teste verde que não exercitava a linha em questão.
 */
vi.mock("../integracoes/dental-office/cliente", async () => {
  const real = await vi.importActual<typeof import("../integracoes/dental-office/cliente")>(
    "../integracoes/dental-office/cliente",
  );
  const { criarSandbox } = await import("../integracoes/dental-office/sandbox");
  return { ...real, criarClienteDentalOffice: () => ({ ok: true, cliente: criarSandbox() }) };
});

/** O WhatsApp responde pelo sandbox, para "não enviou" ser verificável. */
vi.mock("../integracoes/whatsapp/provedores", async () => {
  const real = await vi.importActual<typeof import("../integracoes/whatsapp/provedores")>(
    "../integracoes/whatsapp/provedores",
  );
  return {
    ...real,
    criarProvedorMensageria: () => ({ configurado: true, porta: real.obterSandboxMensageria() }),
  };
});

/** A leitura automática responde sempre "quer agendar", com confiança alta. */
vi.mock("../aplicacao/ia", async () => {
  const real = await vi.importActual<typeof import("../aplicacao/ia")>("../aplicacao/ia");
  return {
    ...real,
    classificarConversa: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        autonomia: "AUTOMATICA" as const,
        classificacao: {
          intencao: "AGENDAR",
          temperatura: "QUENTE",
          confianca: 0.95,
          resumo: "Quer marcar uma avaliação.",
          acaoSugerida: "SCHEDULE",
          exigeHumano: false,
          motivoEscalonamento: null,
        },
      }),
    ),
  };
});

import { CONFIGURACAO_PADRAO } from "../dominio/configuracao";
import type { EventoCrc } from "../dominio/tipos";
import {
  obterSandboxMensageria,
  _reiniciarSandboxMensageria,
} from "../integracoes/whatsapp/provedores";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { aoReceberMensagem } from "./handlers";

const ORG = "org-1";
const CLINICA = "clinica-1";
const PACIENTE = "pac-1";
const CONVERSA = "conv-1";

const AGORA = new Date("2026-09-08T17:00:00.000Z");

/**
 * A configuração do servidor, com as flags que cada teste quiser.
 *
 * `lerFlags` é o que o handler consulta; interceptá-la aqui é mais fiel do que
 * semear `crc_feature_flags` na mão, porque exercita o mesmo caminho que a
 * tela de Configurações usa para gravar.
 */
function comFlags(flags: Record<string, boolean>): void {
  vi.doMock("../servidor/configuracao", async () => {
    const real = await vi.importActual<typeof import("../servidor/configuracao")>(
      "../servidor/configuracao",
    );
    return {
      ...real,
      lerConfiguracao: () => Promise.resolve(CONFIGURACAO_PADRAO),
      lerFlags: () => Promise.resolve(flags),
      lerKillSwitches: () => Promise.resolve({}),
    };
  });
}

function evento(): EventoCrc {
  return {
    id: "ev-1",
    organizationId: ORG,
    clinicId: CLINICA,
    tipo: "message.received",
    entityType: "message",
    entityId: "msg-1",
    payload: { conversationId: CONVERSA, patientId: PACIENTE, texto: "quero marcar" },
    fingerprint: "message.received:1",
    status: "PENDENTE",
    tentativas: 0,
    ocorridoEm: AGORA.toISOString(),
    criadoEm: AGORA.toISOString(),
  } as EventoCrc;
}

beforeEach(() => {
  vi.resetModules();
  limparBanco();
  definirRelogio(AGORA);
  _reiniciarSandboxMensageria();

  semear("crc_organizations", [{ id: ORG, nome: "JP", slug: "jp" }]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, nome: "JP", slug: "matriz", external_id: "clin-1" },
  ]);
  semear("crc_patients", [
    {
      id: PACIENTE,
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "dental_office",
      external_id: "pac-externo-1",
      nome: "Maria Souza Lima",
      telefone: "5511999990001",
    },
  ]);
  semear("crc_dentists", [
    {
      id: "d-1",
      organization_id: ORG,
      clinic_id: CLINICA,
      external_source: "dental_office",
      external_id: "dent-1",
      nome: "Dra. Juliana Pelisser",
      ativo: true,
    },
  ]);
  semear("crc_conversations", [
    {
      id: CONVERSA,
      organization_id: ORG,
      clinic_id: CLINICA,
      patient_id: PACIENTE,
      canal: "whatsapp",
      contato_externo: "5511999990001",
      telefone: "5511999990001",
      status: "ABERTA",
    },
  ]);
});

/* ========================================================================== */

describe("com o autopilot desligado", () => {
  it("classifica, mas não fala com o paciente", async () => {
    comFlags({ auto_scheduling: true, dental_office_writeback: true });
    const { aoReceberMensagem: handler } = await import("./handlers");

    await handler(evento());

    // A leitura aconteceu — o handler não abortou antes dela.
    const { classificarConversa } = await import("../aplicacao/ia");
    expect(vi.mocked(classificarConversa)).toHaveBeenCalledOnce();

    // E nada saiu. É a trava inteira em uma linha.
    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(0);
    expect(conteudo("crc_scheduling_offers")).toHaveLength(0);
  });

  it("não grava consulta nem quando já existe oferta aberta esperando", async () => {
    // O caso que a trava só antes de oferecer deixaria passar: a oferta é de
    // ontem, o autopilot foi desligado hoje, e o paciente responde agora.
    semear("crc_scheduling_offers", [
      {
        id: "of-1",
        organization_id: ORG,
        clinic_id: CLINICA,
        conversation_id: CONVERSA,
        patient_id: PACIENTE,
        opcoes: [
          {
            inicioEm: "2026-09-10T13:40:00.000Z",
            horaLocal: "10:40",
            diaLocal: "2026-09-10",
            dentistaExternoId: "dent-1",
            duracaoMinutos: 30,
            fimEm: "2026-09-10T14:10:00.000Z",
            dentistaNome: "Dra. Juliana",
            rotulo: "quinta, 10:40",
          },
        ],
        status: "ABERTA",
        expira_em: "2026-09-30T00:00:00.000Z",
      },
    ]);

    comFlags({ auto_scheduling: true, dental_office_writeback: true });
    const { aoReceberMensagem: handler } = await import("./handlers");

    const e = evento();
    e.payload["texto"] = "10:40 tá ótimo";
    await handler(e);

    expect(conteudo("crc_appointments")).toHaveLength(0);
    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(0);
    // A oferta continua aberta: ninguém a consumiu, e ela volta a valer quando
    // o autopilot for religado.
    expect(conteudo("crc_scheduling_offers")[0]?.["status"]).toBe("ABERTA");
  });
});

describe("o kill switch vence o autopilot", () => {
  it("com kill_ia_auto ligado, nada acontece mesmo com todas as flags ligadas", async () => {
    vi.doMock("../servidor/configuracao", async () => {
      const real = await vi.importActual<typeof import("../servidor/configuracao")>(
        "../servidor/configuracao",
      );
      return {
        ...real,
        lerConfiguracao: () => Promise.resolve(CONFIGURACAO_PADRAO),
        lerFlags: () =>
          Promise.resolve({
            ai_autopilot: true,
            auto_scheduling: true,
            dental_office_writeback: true,
          }),
        lerKillSwitches: () => Promise.resolve({ kill_ia_auto: true }),
      };
    });
    const { aoReceberMensagem: handler } = await import("./handlers");

    await handler(evento());

    expect(obterSandboxMensageria().listarEnviadas()).toHaveLength(0);
    expect(conteudo("crc_scheduling_offers")).toHaveLength(0);
  });
});

describe("o handler nunca derruba o processamento do evento", () => {
  it("payload sem conversa é ignorado em silêncio", async () => {
    comFlags({ ai_autopilot: true });
    const { aoReceberMensagem: handler } = await import("./handlers");

    const e = evento();
    e.payload = { texto: "oi" };
    await expect(handler(e)).resolves.toBeUndefined();
  });
});

/** Mantém o import direto em uso, para o arquivo falhar se o nome mudar. */
void aoReceberMensagem;
