/**
 * Testes do pulso.
 *
 * O QUE ELES PROTEGEM é o que só aparece com mais de uma clínica e com o
 * agendador rodando o dia inteiro:
 *
 *   O PULSO ATENDE TODAS AS ORGANIZAÇÕES. O motor pegava a PRIMEIRA clínica
 *   ativa e trabalhava só nela. Num SaaS, isso é a segunda clínica em diante
 *   nunca ter uma jornada avançada.
 *
 *   UMA ORGANIZAÇÃO QUE FALHA NÃO DERRUBA AS OUTRAS. É a diferença entre um
 *   incidente numa clínica e um incidente em todas.
 *
 *   ELE SÓ VISITA QUEM TEM TRABALHO. A cada cinco minutos, o dia inteiro:
 *   varrer cinquenta organizações para descobrir que quarenta e oito não têm
 *   nada é um custo que se multiplica por 288.
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

import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { baterPulso, tocarPulso } from "./pulso";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

/** Uma jornada pronta para avançar, na organização dada. */
function jornadaVencida(organizationId: string, id: string, quando = AGORA): void {
  semear("crc_automation_enrollments", [
    {
      id,
      organization_id: organizationId,
      automation_id: `auto-${organizationId}`,
      versao: 1,
      status: "ACTIVE",
      passo_atual: 0,
      resume_at: new Date(quando.getTime() - 60_000).toISOString(),
      tentativas: 0,
    },
  ]);
}

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [
    { id: ORG_A, slug: "clinica-a", nome: "Clínica A" },
    { id: ORG_B, slug: "clinica-b", nome: "Clínica B" },
  ]);
});

/* -------------------------------------------------------------------------- */

describe("quem o pulso visita", () => {
  it("visita TODAS as organizações com jornada vencida, e não a primeira", async () => {
    /*
     * O DEFEITO QUE ESTE TESTE TRAVA.
     *
     * `/api/crc/motor` fazia `selecionarUm("crc_clinics")` ordenado por data de
     * criação e trabalhava naquela clínica. A segunda organização em diante
     * nunca tinha uma jornada avançada — e nada no sistema dizia isso: o
     * relatório do motor voltava verde, sobre o tenant errado.
     */
    jornadaVencida(ORG_A, "j-a");
    jornadaVencida(ORG_B, "j-b");

    const r = await baterPulso();

    expect(r.organizacoes).toBe(2);
  });

  it("NÃO visita quem não tem jornada vencida", async () => {
    // A cada cinco minutos, o dia inteiro. Visitar cinquenta organizações para
    // descobrir que quarenta e oito não têm nada são 48 idas ao banco × 288.
    jornadaVencida(ORG_A, "j-a");
    semear("crc_automation_enrollments", [
      {
        id: "j-b-futura",
        organization_id: ORG_B,
        automation_id: "auto-b",
        versao: 1,
        status: "WAITING",
        passo_atual: 0,
        // Só amanhã.
        resume_at: new Date(AGORA.getTime() + 86_400_000).toISOString(),
        tentativas: 0,
      },
    ]);

    expect((await baterPulso()).organizacoes).toBe(1);
  });

  it("jornada CONCLUÍDA não faz o pulso visitar a organização", async () => {
    semear("crc_automation_enrollments", [
      {
        id: "j-a-pronta",
        organization_id: ORG_A,
        automation_id: "auto-a",
        versao: 1,
        status: "COMPLETED",
        passo_atual: 3,
        resume_at: new Date(AGORA.getTime() - 60_000).toISOString(),
        tentativas: 0,
      },
    ]);

    expect((await baterPulso()).organizacoes).toBe(0);
  });

  it("sem nada pendente, o pulso não faz nada e não quebra", async () => {
    const r = await baterPulso();

    expect(r.organizacoes).toBe(0);
    expect(r.jornadas).toEqual([]);
    expect(r.eventos.reservados).toBe(0);
    expect(r.turnos.reservados).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("uma organização não derruba as outras", () => {
  it("segue para a próxima quando uma falha", async () => {
    /*
     * Num SaaS, deixar o erro subir seria uma clínica impedindo o atendimento
     * das vizinhas — e a que quebra costuma ser a que está com configuração
     * pela metade, ou seja, a nova.
     *
     * O teste derruba a leitura de configuração da PRIMEIRA organização
     * visitada e confere que a outra ainda foi atendida.
     */
    jornadaVencida(ORG_A, "j-a");
    jornadaVencida(ORG_B, "j-b");

    /*
     * A RESERVA DE JORNADAS, e não a configuração — e a escolha custou duas
     * tentativas erradas, que vale registrar porque a armadilha é sutil.
     *
     * A primeira versão armava falha de ESCRITA em `crc_settings`; o caminho é
     * `lerConfiguracao`, que só LÊ, e a falha nunca disparava. A segunda armou
     * LEITURA na mesma tabela — e também não disparou, porque `lerConfiguracao`
     * tem cache de módulo: num arquivo de teste com vários casos, a primeira
     * leitura enche o cache e as seguintes nem chegam ao banco.
     *
     * Nas duas, o teste ficava verde com o `catch` do `baterPulso` REMOVIDO.
     * `crc_reservar_jornadas` é RPC, roda a cada volta e não tem cache.
     */
    const { falharProximaEscrita } = await import("../testes/banco-memoria");
    falharProximaEscrita("crc_reservar_jornadas", "banco indisponível para esta organização");

    const r = await baterPulso();

    // As duas foram VISITADAS, mesmo com uma delas explodindo no meio.
    expect(r.organizacoes).toBe(2);
  });
});

/* -------------------------------------------------------------------------- */

describe("o toque do webhook", () => {
  it("não faz nada sem segredo ou sem endereço, e não lança", async () => {
    // Em desenvolvimento nenhum dos dois existe. Um erro aqui apareceria a cada
    // webhook recebido, e o toque é aceleração — não garantia.
    const antesSegredo = process.env["CRON_SECRET"];
    const antesUrl = process.env["CRC_URL_PUBLICA"];
    delete process.env["CRON_SECRET"];
    delete process.env["CRC_URL_PUBLICA"];

    const chamou = vi.fn();
    vi.stubGlobal("fetch", chamou);

    await expect(tocarPulso()).resolves.toBeUndefined();
    expect(chamou).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    if (antesSegredo !== undefined) process.env["CRON_SECRET"] = antesSegredo;
    if (antesUrl !== undefined) process.env["CRC_URL_PUBLICA"] = antesUrl;
  });

  it("chama o pulso com o segredo, e ENGOLE o timeout", async () => {
    /*
     * O TIMEOUT É O CASO ESPERADO, e não o excepcional: o pulso demora mais que
     * dois segundos porque roda um turno de agente. Esperar por ele faria a
     * Meta esperar junto — e webhook lento é webhook que a Meta repete e depois
     * desliga.
     */
    process.env["CRON_SECRET"] = "segredo-de-teste";
    process.env["CRC_URL_PUBLICA"] = "https://exemplo.test/";

    const chamadas: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return Promise.reject(new DOMException("aborted", "TimeoutError"));
    });

    await expect(tocarPulso()).resolves.toBeUndefined();

    expect(chamadas).toHaveLength(1);
    // A barra do fim do endereço não vira barra dupla.
    expect(chamadas[0]?.url).toBe("https://exemplo.test/api/crc/pulso");
    expect(chamadas[0]?.init.method).toBe("POST");
    expect((chamadas[0]?.init.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer segredo-de-teste",
    );

    vi.unstubAllGlobals();
    delete process.env["CRON_SECRET"];
    delete process.env["CRC_URL_PUBLICA"];
  });
});
