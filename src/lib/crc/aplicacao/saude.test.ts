/**
 * O painel de saúde — Fase F.
 *
 * A PERGUNTA QUE ELE RESPONDE é operacional: **"o agente parou. É a gente ou é
 * eles?"** Sem isso, quem está na recepção às 19h de uma sexta vê a fila parar e
 * não tem como distinguir entre provedor fora do ar, teto de gasto estourado,
 * kill switch acionado por engano e worker que morreu. As quatro coisas têm a
 * mesma aparência: nada acontece.
 *
 * A ASSERÇÃO QUE SE REPETE em quase todo teste aqui é `acao`. Um sinal sem
 * próxima ação é ruído — e um painel cheio de ruído é um painel que ninguém
 * abre na segunda vez.
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

import { _limparDisjuntores, disjuntorDe, POLITICA_PADRAO } from "../dominio/disjuntor";
import { emMicro } from "../dominio/orcamento";
import { _limparCacheDeConfiguracao } from "../servidor/configuracao";
import { definirRelogio, limparBanco, semear } from "../testes/banco-memoria";
import { esquecerFusos } from "./orcamento";
import { panoramaDeSaude } from "./saude";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const atras = (min: number): string => new Date(AGORA.getTime() - min * 60_000).toISOString();

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  _limparDisjuntores();
  _limparCacheDeConfiguracao();
  esquecerFusos();
  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_conversations", [
    { id: CONVERSA, organization_id: ORG, canal: "whatsapp", contato_externo: "5511999998888" },
  ]);

  /*
   * A LINHA DE BASE SAUDÁVEL, e ela precisa ser montada de propósito.
   *
   * Depois que o painel passou a olhar batimento e credencial, "nenhum sinal"
   * deixou de ser o estado de um banco vazio: um ambiente sem pulso registrado e
   * sem WhatsApp configurado ESTÁ doente, e dizer o contrário seria o painel
   * mentindo. Então o cenário-base declara um sistema em funcionamento.
   */
  semear("crc_runtime_heartbeats", [
    {
      worker: "pulso",
      ultimo_inicio_em: atras(1),
      ultimo_sucesso_em: atras(1),
      metricas: {},
    },
  ]);
  semear("crc_schema_migrations", [
    { nome: "28-crc-configuracao-por-clinica.sql", presumido: false },
  ]);
  // O sandbox conta como canal configurado — é o provedor de desenvolvimento.
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("WHATSAPP_SANDBOX", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("quando está tudo bem", () => {
  it("não inventa sinal", async () => {
    const p = await panoramaDeSaude(ORG, AGORA);

    // Um painel que sempre mostra alguma coisa ensina a operação a ignorá-lo.
    expect(p.severidade).toBe("ok");
    expect(p.sinais).toEqual([]);
  });
});

describe("provedor fora do ar", () => {
  it("vira sinal crítico quando o disjuntor está aberto", async () => {
    const d = disjuntorDe(`ia:${ORG}:openai:conversa`);
    for (let i = 0; i < POLITICA_PADRAO.limite; i += 1) d.falha(AGORA);

    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "provedor_cortado");

    expect(sinal?.severidade).toBe("critico");
    // A ação diz o que fazer, e é acionável: trocar a rota é coisa que existe na
    // tela de configuração.
    expect(sinal?.acao).toContain("provedor");
  });

  it("meio-aberto é ATENÇÃO, e não crítico", async () => {
    const d = disjuntorDe(`ia:${ORG}:openai:conversa`);
    for (let i = 0; i < POLITICA_PADRAO.limite; i += 1) d.falha(AGORA);

    const depois = new Date(AGORA.getTime() + POLITICA_PADRAO.descansoMs + 1000);
    const p = await panoramaDeSaude(ORG, depois);
    const sinal = p.sinais.find((s) => s.codigo === "provedor_cortado");

    // O sistema já está tentando voltar sozinho. Vermelho aqui faria a recepção
    // agir quando não precisa — e agir, nesse caso, costuma piorar.
    expect(sinal?.severidade).toBe("atencao");
    expect(sinal?.acao).toContain("sozinho");
  });

  it("o disjuntor de OUTRA clínica não aparece neste painel", async () => {
    const outra = "22222222-2222-4222-8222-222222222222";
    const d = disjuntorDe(`ia:${outra}:openai:conversa`);
    for (let i = 0; i < POLITICA_PADRAO.limite; i += 1) d.falha(AGORA);

    const p = await panoramaDeSaude(ORG, AGORA);

    // Cada clínica pode ter a própria chave (BYOK). A cota estourada de uma não
    // pode aparecer como incidente da outra.
    expect(p.sinais.find((s) => s.codigo === "provedor_cortado")).toBeUndefined();
  });
});

describe("a fila", () => {
  it("paciente esperando há muito tempo vira sinal", async () => {
    semear("crc_agent_jobs", [
      {
        organization_id: ORG,
        conversation_id: CONVERSA,
        status: "PENDENTE",
        chave_dedupe: "turno:1",
        criado_em: atras(90),
      },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "fila_parada");

    expect(sinal?.severidade).toBe("critico");
    /*
     * A AÇÃO PRECISA APONTAR PARA O PULSO. Ela dizia "confira se o cron do motor
     * está rodando" — o motor é o worker DIÁRIO, que sincroniza o Dental Office;
     * ele não tem relação nenhuma com turno parado. Mandar olhar o lugar errado
     * custa mais tempo do que não dizer nada.
     */
    expect(sinal?.acao).toContain("pulso");
    expect(sinal?.acao).not.toContain("motor");
  });

  it("espera curta não vira sinal", async () => {
    semear("crc_agent_jobs", [
      {
        organization_id: ORG,
        conversation_id: CONVERSA,
        status: "PENDENTE",
        chave_dedupe: "turno:2",
        criado_em: atras(3),
      },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    expect(p.sinais.find((s) => s.codigo === "fila_parada")).toBeUndefined();
  });

  it("job que esgotou tentativas é sempre crítico", async () => {
    semear("crc_agent_jobs", [
      {
        organization_id: ORG,
        conversation_id: CONVERSA,
        status: "FALHOU",
        chave_dedupe: "turno:3",
        criado_em: atras(10),
      },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "jobs_falhos");

    // Cada um destes é uma pessoa que escreveu e não foi respondida. Não existe
    // "atenção" para isso.
    expect(sinal?.severidade).toBe("critico");
    expect(sinal?.acao).toContain("paciente");
  });
});

describe("runs penduradas", () => {
  it("run aberta há horas denuncia o worker que morreu", async () => {
    semear("crc_ai_runs", [
      {
        organization_id: ORG,
        conversation_id: CONVERSA,
        chave_dedupe: "turno:travado",
        resultado: "RODANDO",
        iniciado_em: atras(120),
      },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "runs_penduradas");

    /*
     * ESTE SINAL SÓ EXISTE POR CAUSA DA FASE B.
     *
     * A run passou a nascer ANTES da chamada de modelo, para a idempotência vir
     * antes do gasto. O preço é que uma run pode ficar aberta — e o preço virou
     * benefício: é exatamente ela que denuncia o worker que morreu no meio.
     */
    expect(sinal).toBeDefined();
    expect(sinal?.acao).toContain("worker");
  });

  it("run recém-aberta é turno normal, e não sinal", async () => {
    semear("crc_ai_runs", [
      {
        organization_id: ORG,
        conversation_id: CONVERSA,
        chave_dedupe: "turno:normal",
        resultado: "RODANDO",
        iniciado_em: atras(2),
      },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    expect(p.sinais.find((s) => s.codigo === "runs_penduradas")).toBeUndefined();
  });
});

describe("orçamento", () => {
  it("teto estourado é crítico — do lado do paciente, ninguém responde", async () => {
    semear("crc_ai_orcamentos", [
      { organization_id: ORG, teto_dia_micro: emMicro(1), teto_mes_micro: null, abrir_caso: true },
    ]);
    semear("crc_ai_gastos", [
      { organization_id: ORG, dia: "2026-09-11", micro_reais: emMicro(1), chamadas: 10 },
    ]);

    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "teto_estourado");

    // É comportamento CORRETO do sistema, e mesmo assim crítico: a régua do
    // painel é o efeito sobre o paciente, não a intenção do código.
    expect(sinal?.severidade).toBe("critico");
  });
});

describe("interruptores", () => {
  it("kill switch acionado é ATENÇÃO, e não crítico", async () => {
    semear("crc_feature_flags", [{ organization_id: ORG, chave: "kill_ia_auto", ligada: true }]);

    const p = await panoramaDeSaude(ORG, AGORA);
    const sinal = p.sinais.find((s) => s.codigo === "interruptor_kill_ia_auto");

    /*
     * A DISTINÇÃO MAIS SUTIL DESTE ARQUIVO.
     *
     * Alguém ligou isso DE PROPÓSITO, e vermelho faria a recepção tratar uma
     * decisão como incidente. O que este sinal existe para evitar é o oposto: o
     * interruptor acionado às pressas numa terça e esquecido ligado por duas
     * semanas, com todo mundo achando que o agente quebrou.
     */
    expect(sinal?.severidade).toBe("atencao");
    expect(sinal?.acao).toContain("de propósito");
  });
});

describe("quando a própria leitura falha", () => {
  it("isso VIRA sinal, e não silêncio", async () => {
    const banco = await import("../servidor/banco");
    vi.spyOn(banco, "selecionar").mockRejectedValue(new Error("PostgREST fora do ar"));

    const p = await panoramaDeSaude(ORG, AGORA);

    /*
     * Se o banco não responde, isso É a notícia — provavelmente a mesma coisa
     * que está travando o atendimento. Engolir o erro faria o painel dizer
     * "tudo bem" no meio de um incidente de banco, que é a pior mentira que um
     * painel de saúde pode contar.
     */
    expect(p.severidade).toBe("critico");
    expect(p.sinais.some((s) => s.codigo === "leitura_falhou")).toBe(true);

    vi.restoreAllMocks();
  });
});
