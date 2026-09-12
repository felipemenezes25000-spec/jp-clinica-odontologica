/**
 * 100 por dia tem que significar 100 por dia.
 *
 * ============================================================================
 *  O DEFEITO, e a conta é curta.
 *
 *      limite: Math.min(restaHoje, ctx.limitePorVolta ?? 25)
 *
 *  com um chamador só — a volta pesada, que roda UMA VEZ POR DIA. A campanha
 *  configurada para 100 contatos diários mandava 25, e os 75 restantes
 *  esperavam o dia seguinte para virar mais 25. Uma campanha de 964 pessoas a
 *  "100 por dia" levaria 38 dias em vez de 10.
 *
 *  E ninguém veria erro: a tela mostraria a campanha RODANDO, com progresso.
 *
 *  O CONSERTO NÃO É UM LOTE DE 100. Cem mensagens às 8h05 é o padrão que
 *  derruba a reputação do número — e a partir daí nada chega, nem as boas. O
 *  conserto é MUITAS VOLTAS PEQUENAS, que é o que o pulso é, com a cota
 *  crescendo junto com a janela comercial.
 *
 *  INJEÇÃO DE DEFEITO: trocar `podeAgora` de volta por
 *  `Math.min(restaHoje, limitePorVolta ?? 25)` quebra "o dia inteiro converge
 *  para a meta" — param 25 em vez de 100. E tirar a cota, deixando só
 *  `restaHoje`, quebra "não dispara tudo na primeira volta".
 * ============================================================================
 *
 * O TESTE SIMULA UM DIA DE PULSOS, de meia em meia hora. É o único jeito de
 * provar convergência: uma chamada só mostraria a cota daquele instante, que é
 * exatamente o número que o defeito antigo também produziria em algum horário.
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

import { CONFIGURACAO_PADRAO } from "../dominio/configuracao";
import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import {
  _reiniciarSandboxMensageria,
  obterSandboxMensageria,
} from "../integracoes/whatsapp/provedores";

import {
  agendarCampanha,
  criarCampanha,
  mudarStatusCampanha,
  rodarCampanhas,
  FILTRO_PUBLICO_VAZIO,
} from "./campanhas";

const ORG = "11111111-1111-4111-8111-111111111111";
const CLINICA = "22222222-2222-4222-8222-222222222222";

/** Terça-feira. A janela padrão é 08h–19h em São Paulo. */
const ABERTURA = new Date("2026-09-08T11:00:00.000Z"); // 08h SP
const FECHAMENTO = new Date("2026-09-08T22:00:00.000Z"); // 19h SP

function contexto(agora: Date) {
  return {
    organizationId: ORG,
    porta: obterSandboxMensageria(),
    configuracao: CONFIGURACAO_PADRAO,
    enviosPausados: false,
    agora,
    // O freio de segurança do pulso: nenhuma volta manda um lote gigante.
    limitePorVolta: 10,
  };
}

async function campanhaDe(quantos: number, porDia: number): Promise<string> {
  for (let i = 1; i <= quantos; i += 1) {
    semear("crc_patients", [
      {
        id: `p-${String(i)}`,
        organization_id: ORG,
        clinic_id: CLINICA,
        external_source: "do",
        external_id: `p-${String(i)}`,
        nome: `Paciente ${String(i)}`,
        telefone: `5511${String(900000000 + i)}`,
        situacao: "EM_TRATAMENTO",
        ativo: true,
        arquivado: false,
      },
    ]);
  }

  const criada = await criarCampanha({
    organizationId: ORG,
    clinicId: CLINICA,
    nome: "Reativação",
    mensagem: "Oi, {{primeiroNome}}! Vamos marcar?",
    filtros: { ...FILTRO_PUBLICO_VAZIO },
    porDia,
    autorId: "u-1",
  });
  if (!criada.ok) throw new Error(criada.motivo);

  await agendarCampanha({ organizationId: ORG, campaignId: criada.id, autorId: "u-1" });
  return criada.id;
}

/** Roda o pulso de meia em meia hora entre dois instantes. */
async function pulsosEntre(de: Date, ate: Date, passoMin = 30): Promise<number[]> {
  const porVolta: number[] = [];
  for (let t = de.getTime(); t <= ate.getTime(); t += passoMin * 60_000) {
    const quando = new Date(t);
    definirRelogio(quando);
    const r = await rodarCampanhas(contexto(quando));
    porVolta.push(r.enviadas);
  }
  return porVolta;
}

beforeEach(() => {
  limparBanco();
  _reiniciarSandboxMensageria();
  semear("crc_organizations", [{ id: ORG, nome: "JP", slug: "jp" }]);
  semear("crc_clinics", [
    { id: CLINICA, organization_id: ORG, nome: "Matriz", slug: "matriz", ativa: true },
  ]);
});

/* -------------------------------------------------------------------------- */

describe("uma campanha de 100 alvos a 100 por dia", () => {
  it("manda os 100 ao longo do dia — e não 25", async () => {
    await campanhaDe(100, 100);

    const porVolta = await pulsosEntre(ABERTURA, FECHAMENTO);
    const total = porVolta.reduce((a, b) => a + b, 0);

    expect(total).toBe(100);

    // NENHUM DUPLICADO: a garantia é de índice, e a asserção precisa olhar a
    // tabela e não o contador, que poderia estar somando a mesma pessoa.
    const enviadas = conteudo("crc_campaign_targets").filter((a) => a["status"] === "ENVIADA");
    expect(enviadas).toHaveLength(100);
    expect(new Set(enviadas.map((a) => a["patient_id"])).size).toBe(100);
  });

  it("o envio ACOMPANHA a janela, em vez de esvaziar a fila no começo", async () => {
    /*
     * ========================================================================
     *  ESTE TESTE MEDE A FORMA DO DIA, e não o total — porque o total sozinho
     *  não discrimina.
     *
     *  Com um teto por volta e nenhuma cota, a campanha também entrega 100: ela
     *  manda 10 a cada volta desde as 8h e termina por volta das 13h. O
     *  resultado do dia é idêntico; o comportamento é o oposto do que o
     *  cabeçalho de `campanhas.ts` promete.
     *
     *  E a diferença é concreta: 100 mensagens numa manhã, do mesmo número,
     *  para pessoas que não escreveram, é o padrão que a Meta lê como disparo em
     *  massa. A partir daí a entrega cai para todas as mensagens daquele número.
     *
     *  Então a asserção é sobre PROPORÇÃO: às 10h de uma janela 08h–19h, dois
     *  terços de onze horas ainda não passaram, e a campanha não pode ter
     *  entregue metade.
     * ========================================================================
     */
    await campanhaDe(100, 100);

    definirRelogio(ABERTURA);
    const primeira = await rodarCampanhas(contexto(ABERTURA));
    expect(primeira.enviadas).toBeLessThanOrEqual(10);

    // Até as 10h SP: 2 de 11 horas da janela, com a folga de 10% — ~21%.
    const dezHoras = new Date("2026-09-08T13:00:00.000Z");
    await pulsosEntre(new Date(ABERTURA.getTime() + 30 * 60_000), dezHoras);

    const ateAs10 = conteudo("crc_campaign_targets").filter((a) => a["status"] === "ENVIADA");
    /*
     * 30 É O TETO DA ASSERÇÃO, e não a expectativa: a cota proporcional entrega
     * ~21 aqui, e o teto por volta sem cota entregaria 50. A folga entre 21 e 30
     * absorve arredondamento sem deixar o defeito passar.
     */
    expect(ateAs10.length).toBeLessThanOrEqual(30);
    // E ANDOU: uma campanha que não entrega nada de manhã também "passaria" num
    // teste que só olha o teto.
    expect(ateAs10.length).toBeGreaterThan(5);
  });

  it("o 101º NÃO sai no mesmo dia", async () => {
    await campanhaDe(150, 100);

    await pulsosEntre(ABERTURA, FECHAMENTO);

    const enviadas = conteudo("crc_campaign_targets").filter((a) => a["status"] === "ENVIADA");
    expect(enviadas).toHaveLength(100);

    const pendentes = conteudo("crc_campaign_targets").filter((a) => a["status"] === "PENDENTE");
    expect(pendentes).toHaveLength(50);
  });

  it("retomável depois de crash: o estado está no banco, não na função", async () => {
    /*
     * Em serverless não existe "a próxima invocação lembra". O teste derruba o
     * processo simbolicamente — zera o sandbox, que é a única memória — e
     * continua: o contador do dia é lido de `crc_campaign_targets`.
     */
    await campanhaDe(100, 100);

    const manha = new Date("2026-09-08T14:00:00.000Z"); // 11h SP
    await pulsosEntre(ABERTURA, manha);
    const antes = conteudo("crc_campaign_targets").filter((a) => a["status"] === "ENVIADA").length;
    expect(antes).toBeGreaterThan(0);

    _reiniciarSandboxMensageria();

    await pulsosEntre(new Date(manha.getTime() + 30 * 60_000), FECHAMENTO);

    const depois = conteudo("crc_campaign_targets").filter((a) => a["status"] === "ENVIADA").length;
    expect(depois).toBe(100);
  });
});

describe("pausar e retomar", () => {
  it("pausada, não sai nada; retomada, continua de onde parou", async () => {
    await campanhaDe(100, 100);

    const manha = new Date("2026-09-08T13:00:00.000Z"); // 10h SP
    await pulsosEntre(ABERTURA, manha);
    const naPausa = conteudo("crc_campaign_targets").filter(
      (a) => a["status"] === "ENVIADA",
    ).length;
    expect(naPausa).toBeGreaterThan(0);
    expect(naPausa).toBeLessThan(100);

    await mudarStatusCampanha({
      organizationId: ORG,
      campaignId: String(conteudo("crc_campaigns")[0]?.["id"] ?? ""),
      status: "PAUSADA",
      autorId: "u-1",
    });

    const meio = new Date("2026-09-08T17:00:00.000Z"); // 14h SP
    await pulsosEntre(new Date(manha.getTime() + 30 * 60_000), meio);

    // NADA ANDOU. A pausa é a válvula que alguém aciona quando a mensagem saiu
    // errada — ela precisa parar de verdade, e não só sumir da tela.
    expect(conteudo("crc_campaign_targets").filter((a) => a["status"] === "ENVIADA")).toHaveLength(
      naPausa,
    );

    await mudarStatusCampanha({
      organizationId: ORG,
      campaignId: String(conteudo("crc_campaigns")[0]?.["id"] ?? ""),
      status: "RODANDO",
      autorId: "u-1",
    });

    await pulsosEntre(new Date(meio.getTime() + 30 * 60_000), FECHAMENTO);

    // Retomada, ela recupera o atraso — porque a cota é ACUMULADA, e não um
    // teto por volta. Com teto por volta, as horas paradas seriam perdidas.
    const enviadas = conteudo("crc_campaign_targets").filter((a) => a["status"] === "ENVIADA");
    expect(enviadas).toHaveLength(100);
  });
});
