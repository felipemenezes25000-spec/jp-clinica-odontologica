/**
 * O batimento, e o que o painel faz com ele.
 *
 * ============================================================================
 *  A PERGUNTA QUE NÃO TINHA RESPOSTA: **o pulso está vivo?**
 *
 *  O caminho rápido do CRC é webhook → `tocarPulso()` → `/api/crc/pulso`, com o
 *  GitHub Actions como rede. Os dois param em silêncio:
 *
 *    `CRON_SECRET` removido do repositório   → o workflow falha a cada 5 min
 *    `CRC_URL_PUBLICA` não configurada       → `tocarPulso()` volta sem fazer
 *                                              nada, de propósito e sem log
 *
 *  E o sintoma dos dois é NADA. O painel dizia "há pacientes esperando há 40
 *  minutos. Confira se o cron do motor está rodando" — o motor é o worker
 *  DIÁRIO, sem relação com o atraso. Mandar olhar o lugar errado custa mais
 *  tempo do que não dizer nada.
 *
 *  INJEÇÃO DE DEFEITO: tirar `olharPulso` da lista de verificações faz o painel
 *  voltar a mostrar só os sintomas — fila parada, webhook preso, runs
 *  penduradas — sem a causa que produz os três.
 * ============================================================================
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../servidor/banco", async () => {
  const fake = await import("../testes/banco-memoria");
  return fake;
});

vi.mock("../servidor/registro", async () => {
  const real = await vi.importActual<typeof import("../servidor/registro")>("../servidor/registro");
  return { ...real, registrar: () => undefined, auditar: () => Promise.resolve() };
});

import { conteudo, definirRelogio, limparBanco, semear } from "../testes/banco-memoria";

import { baterHeartbeat, comBatimento, lerHeartbeats, minutosDesdeOSucesso } from "./heartbeat";
import { panoramaDeSaude } from "./saude";

const ORG = "11111111-1111-4111-8111-111111111111";
const AGORA = new Date("2026-09-12T14:00:00.000Z");
const atras = (min: number): string => new Date(AGORA.getTime() - min * 60_000).toISOString();

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_schema_migrations", [
    { nome: "28-crc-configuracao-por-clinica.sql", presumido: false },
  ]);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("WHATSAPP_SANDBOX", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* -------------------------------------------------------------------------- */

describe("o batimento", () => {
  it("registra início e sucesso, com as métricas da volta", async () => {
    await baterHeartbeat("pulso", "inicio");
    await baterHeartbeat("pulso", "sucesso", { duracaoMs: 1200, metricas: { turnos: 3 } });

    const [h] = await lerHeartbeats();
    expect(h?.worker).toBe("pulso");
    expect(h?.ultimoSucessoEm).not.toBeNull();
    expect(h?.duracaoMs).toBe(1200);
    expect(h?.metricas).toEqual({ turnos: 3 });
  });

  it("um ERRO não apaga o último sucesso", async () => {
    /*
     * É O CAMPO QUE O PAINEL LÊ. Zerá-lo no primeiro soluço perderia a única
     * medida útil — "há quanto tempo isto funciona" —, e o painel passaria a
     * gritar a cada falha isolada de um worker que está bem.
     */
    await baterHeartbeat("pulso", "sucesso", { duracaoMs: 900 });
    await baterHeartbeat("pulso", "erro", { erro: "o banco piscou" });

    const [h] = await lerHeartbeats();
    expect(h?.ultimoSucessoEm).not.toBeNull();
    expect(h?.ultimoErro).toBe("o banco piscou");
  });

  it("`comBatimento` marca ERRO quando o trabalho lança — e deixa o erro subir", async () => {
    /*
     * Um `finally` genérico marcaria sucesso em toda saída, inclusive a de
     * exceção. É o tipo de detalhe que apaga justamente a informação que o
     * instrumento existe para capturar.
     */
    await expect(
      comBatimento("motor", () => Promise.reject(new Error("credencial vencida"))),
    ).rejects.toThrow("credencial vencida");

    const [h] = await lerHeartbeats();
    expect(h?.ultimoSucessoEm).toBeNull();
    expect(h?.ultimoErro).toBe("credencial vencida");
  });

  it("não derruba a volta quando o banco não tem a tabela", async () => {
    /*
     * O instrumento não pode quebrar o que mede. Sem `supabase/27`, a RPC não
     * existe — e o pulso tem que continuar consumindo a fila.
     */
    const { falharProximaEscrita } = await import("../testes/banco-memoria");
    falharProximaEscrita("crc_runtime_heartbeats", "relation does not exist");

    await expect(baterHeartbeat("pulso", "sucesso")).resolves.toBeUndefined();
  });
});

describe("minutos desde o sucesso", () => {
  it("distingue NUNCA de FAZ TEMPO", () => {
    // As duas conversas são diferentes: a primeira é configuração que nunca foi
    // feita; a segunda é algo que quebrou.
    expect(minutosDesdeOSucesso(undefined, AGORA)).toBeNull();
    expect(
      minutosDesdeOSucesso(
        {
          worker: "pulso",
          ultimoInicioEm: null,
          ultimoSucessoEm: null,
          ultimoErroEm: null,
          ultimoErro: null,
          duracaoMs: null,
          metricas: {},
        },
        AGORA,
      ),
    ).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("o painel de saúde", () => {
  it("PULSO NUNCA BATEU é crítico, e a ação diz o que configurar", async () => {
    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "pulso_nunca_bateu");

    expect(sinal?.severidade).toBe("critico");
    expect(sinal?.acao).toContain("CRON_SECRET");
    expect(sinal?.acao).toContain("CRC_URL_PUBLICA");
  });

  it("pulso vivo não vira sinal", async () => {
    semear("crc_runtime_heartbeats", [
      { worker: "pulso", ultimo_inicio_em: atras(2), ultimo_sucesso_em: atras(2), metricas: {} },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    expect(p.sinais.find((s) => s.codigo?.startsWith("pulso"))).toBeUndefined();
  });

  it("parado há 15 min é ATENÇÃO; há 45, CRÍTICO", async () => {
    /*
     * O AGENDADOR PEDE A CADA 5 MINUTOS, E ISSO NÃO É UM SLA. O `schedule` do
     * GitHub é best-effort: sob carga, cinco minutos viram quinze. Alertar aos
     * seis produziria um alarme por dia que não significa nada — e é assim que
     * o próximo, verdadeiro, passa despercebido.
     */
    semear("crc_runtime_heartbeats", [
      { worker: "pulso", ultimo_inicio_em: atras(15), ultimo_sucesso_em: atras(15), metricas: {} },
    ]);
    const atencao = await panoramaDeSaude(ORG, AGORA);
    expect(atencao.sinais.find((s) => s.codigo === "pulso_parado")?.severidade).toBe("atencao");

    limparBanco();
    semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
    semear("crc_schema_migrations", [
      { nome: "28-crc-configuracao-por-clinica.sql", presumido: false },
    ]);
    semear("crc_runtime_heartbeats", [
      { worker: "pulso", ultimo_inicio_em: atras(45), ultimo_sucesso_em: atras(45), metricas: {} },
    ]);
    const critico = await panoramaDeSaude(ORG, AGORA);
    expect(critico.sinais.find((s) => s.codigo === "pulso_parado")?.severidade).toBe("critico");
  });

  it("a ação da FILA PARADA aponta para o pulso, e não para o motor", async () => {
    semear("crc_runtime_heartbeats", [
      { worker: "pulso", ultimo_inicio_em: atras(1), ultimo_sucesso_em: atras(1), metricas: {} },
    ]);
    semear("crc_conversations", [
      {
        id: "44444444-4444-4444-8444-444444444444",
        organization_id: ORG,
        canal: "whatsapp",
        contato_externo: "5511999998888",
      },
    ]);
    semear("crc_agent_jobs", [
      {
        organization_id: ORG,
        conversation_id: "44444444-4444-4444-8444-444444444444",
        status: "PENDENTE",
        chave_dedupe: "turno:1",
        criado_em: atras(90),
      },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "fila_parada");
    expect(sinal?.acao).toContain("pulso");
    expect(sinal?.acao).not.toContain("motor");
  });

  it("dead letter pendente é CRÍTICO e diz de onde veio", async () => {
    semear("crc_runtime_heartbeats", [
      { worker: "pulso", ultimo_inicio_em: atras(1), ultimo_sucesso_em: atras(1), metricas: {} },
    ]);
    semear("crc_dead_letters", [
      {
        organization_id: ORG,
        origem: "webhook",
        referencia: "x",
        erro: "estourou",
        status: "PENDENTE",
      },
      {
        organization_id: ORG,
        origem: "agent_job",
        referencia: "y",
        erro: "estourou",
        status: "PENDENTE",
      },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "dead_letters_pendentes");

    // Cada item é uma pessoa que escreveu e não foi respondida — e eles não saem
    // de lá sozinhos.
    expect(sinal?.severidade).toBe("critico");
    expect(sinal?.detalhe).toContain("webhook");
    expect(sinal?.detalhe).toContain("agent_job");
  });

  it("varredura que não fecha uma volta há dez dias vira sinal", async () => {
    /*
     * O NÚMERO EXISTIA E NINGUÉM OLHAVA. `ciclo` só incrementa quando a
     * varredura chega ao fim da base e recomeça — um ciclo parado significa que
     * a base cresceu mais que a capacidade de varrê-la, e o relatório diário
     * continua dizendo "avaliados: 200", que é a cara do defeito que o cursor
     * veio consertar.
     */
    semear("crc_runtime_heartbeats", [
      { worker: "pulso", ultimo_inicio_em: atras(1), ultimo_sucesso_em: atras(1), metricas: {} },
    ]);
    semear("crc_scan_state", [
      {
        organization_id: ORG,
        varredura: "recall",
        ciclo: 3,
        atualizado_em: new Date(AGORA.getTime() - 15 * 86_400_000).toISOString(),
      },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "varredura_parada");

    expect(sinal?.severidade).toBe("atencao");
    expect(sinal?.detalhe).toContain("recall");
  });

  it("varredura andando NÃO vira sinal — dias entre voltas são o desenho", async () => {
    semear("crc_runtime_heartbeats", [
      { worker: "pulso", ultimo_inicio_em: atras(1), ultimo_sucesso_em: atras(1), metricas: {} },
    ]);
    semear("crc_scan_state", [
      {
        organization_id: ORG,
        varredura: "recall",
        ciclo: 3,
        atualizado_em: new Date(AGORA.getTime() - 2 * 86_400_000).toISOString(),
      },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    expect(p.sinais.find((s) => s.codigo === "varredura_parada")).toBeUndefined();
  });

  it("banco sem a migração esperada vira sinal, e não erro no meio de um turno", async () => {
    limparBanco();
    semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
    semear("crc_runtime_heartbeats", [
      { worker: "pulso", ultimo_inicio_em: atras(1), ultimo_sucesso_em: atras(1), metricas: {} },
    ]);
    // Nenhuma linha em crc_schema_migrations: o banco está atrás do código.

    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "schema_atrasado");

    expect(sinal).toBeDefined();
    // A AÇÃO MANDA SONDAR, e não confiar no registro: a tabela é bookkeeping.
    expect(sinal?.acao).toContain("schema:status");
  });

  it("o painel registra o que está no banco quando o pulso roda de verdade", async () => {
    /*
     * O caminho inteiro, do jeito que acontece: a volta bate ponto, e o painel
     * lê a linha que ela escreveu. Testar `baterHeartbeat` isolado provaria a
     * função; isto prova a ligação.
     */
    await comBatimento(
      "pulso",
      () => Promise.resolve({ turnos: 2 }),
      (r) => r,
    );

    expect(conteudo("crc_runtime_heartbeats")[0]?.["metricas"]).toEqual({ turnos: 2 });

    const p = await panoramaDeSaude(ORG, AGORA);
    expect(p.sinais.find((s) => s.codigo?.startsWith("pulso"))).toBeUndefined();
  });
});
