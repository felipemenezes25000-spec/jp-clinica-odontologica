/**
 * Testes da fila do agente — Fase B.
 *
 * O QUE ELES PRECISAM PROVAR é o que o desenho anterior não tinha:
 *
 *   UM EVENTO ENFILEIRA UM JOB. Reprocessar não paga o modelo de novo.
 *
 *   DOIS WORKERS NÃO PEGAM O MESMO JOB. É constraint e reserva atômica, não
 *   sorte de agendamento.
 *
 *   CRASH É RECUPERÁVEL. O worker morre, o lease vence, outro retoma — e o
 *   paciente não fica sem resposta.
 *
 *   CRASH NÃO DUPLICA EFEITO. Esta é a que importa: o turno pode rodar duas
 *   vezes, e a mensagem sai UMA. A proteção é índice único, não cuidado.
 *
 *   ESGOTAR TENTATIVAS VIRA DEAD LETTER. Um job que some sem registro é um
 *   paciente esquecido.
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
import {
  concluirJob,
  descartarJob,
  enfileirarTurno,
  esperaDoRetry,
  falharJob,
  liberarPresos,
  panoramaDaFila,
  reservarJobs,
  MAX_TENTATIVAS,
} from "../aplicacao/agent-jobs";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "44444444-4444-4444-8444-444444444444";
const EVENTO = "55555555-5555-4555-8555-555555555555";
const AGORA = new Date("2026-09-11T14:00:00.000Z");

const enfileirar = (eventId = EVENTO) =>
  enfileirarTurno({ organizationId: ORG, conversationId: CONVERSA, eventId });

beforeEach(() => {
  limparBanco();
  definirRelogio(AGORA);
  semear("crc_organizations", [{ id: ORG, slug: "jp" }]);
  semear("crc_conversations", [
    { id: CONVERSA, organization_id: ORG, canal: "whatsapp", contato_externo: "5511999998888" },
  ]);
});

/* -------------------------------------------------------------------------- */

describe("enfileirar", () => {
  it("põe o turno na fila", async () => {
    expect(await enfileirar()).toBe(true);
    expect(conteudo("crc_agent_jobs")).toHaveLength(1);
    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("PENDENTE");
  });

  it("o MESMO evento não enfileira duas vezes", async () => {
    // É o caso real: o motor de eventos reprocessa depois de um restart. Sem a
    // constraint, o mesmo turno entraria duas vezes — duas chamadas de modelo
    // pagas para produzir a mesma resposta.
    expect(await enfileirar()).toBe(true);
    expect(await enfileirar()).toBe(false);
    expect(conteudo("crc_agent_jobs")).toHaveLength(1);
  });

  it("eventos diferentes enfileiram jobs diferentes", async () => {
    await enfileirar("evt-a");
    await enfileirar("evt-b");
    expect(conteudo("crc_agent_jobs")).toHaveLength(2);
  });

  it("o tenant vai na COLUNA, não no payload", async () => {
    // É a regra que impede uma injeção de prompt fazer o worker ler outra
    // clínica: o `organization_id` é gravado por quem enfileira.
    await enfileirar();
    expect(conteudo("crc_agent_jobs")[0]?.["organization_id"]).toBe(ORG);
  });
});

/* -------------------------------------------------------------------------- */

describe("reservar", () => {
  it("reserva marca RODANDO e conta a tentativa", async () => {
    await enfileirar();
    const [job] = await reservarJobs({ quem: "worker-1" });

    expect(job).toBeDefined();
    expect(job?.tentativas).toBe(1);
    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("RODANDO");
    expect(conteudo("crc_agent_jobs")[0]?.["travado_por"]).toBe("worker-1");
  });

  it("dois workers NÃO pegam o mesmo job", async () => {
    await enfileirar();

    const primeiro = await reservarJobs({ quem: "worker-1" });
    const segundo = await reservarJobs({ quem: "worker-2" });

    expect(primeiro).toHaveLength(1);
    expect(segundo).toHaveLength(0);
  });

  it("a tentativa é contada na RESERVA, e não no fim", async () => {
    /*
     * Se fosse no fim, um job que derruba o worker antes de terminar nunca
     * incrementaria — e tentaria para sempre, queimando modelo a cada ciclo.
     */
    await enfileirar();
    await reservarJobs({});

    // O worker morreu sem marcar nada. O lease vence.
    definirRelogio(new Date(AGORA.getTime() + 10 * 60_000));
    const retomado = await reservarJobs({});

    expect(retomado[0]?.tentativas).toBe(2);
  });

  it("job agendado para o futuro não é reservado agora", async () => {
    await enfileirar();
    const [job] = await reservarJobs({});
    // O relógio vai por parâmetro, como no resto do CRC: sem isso o backoff
    // usaria a hora de parede e o teste dependeria de quando ele rodou.
    await falharJob(job!, "provedor fora do ar", AGORA);

    // O backoff empurrou para 30 segundos à frente.
    expect(await reservarJobs({})).toHaveLength(0);

    definirRelogio(new Date(AGORA.getTime() + 60_000));
    expect(await reservarJobs({})).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("crash e retomada", () => {
  it("o lease vencido deixa outro worker retomar", async () => {
    await enfileirar();
    await reservarJobs({ quem: "worker-que-morreu", leaseSegundos: 60 });

    // Dentro do lease, ninguém mais pega: o worker pode estar vivo e lento.
    definirRelogio(new Date(AGORA.getTime() + 30_000));
    expect(await reservarJobs({ quem: "worker-2" })).toHaveLength(0);

    // Passado o lease, o trabalho volta a estar disponível.
    definirRelogio(new Date(AGORA.getTime() + 120_000));
    const retomado = await reservarJobs({ quem: "worker-2" });
    expect(retomado).toHaveLength(1);
    expect(retomado[0]?.tentativas).toBe(2);
  });

  it("job preso com o teto estourado vira FALHOU, e não some", async () => {
    /*
     * O pior estado possível: RODANDO com lease vencido e tentativas no teto. A
     * reserva o ignora (passou de 5) e a fila de falhas não o mostra (o status é
     * RODANDO). Ele desaparece — e com ele, um paciente sem resposta.
     */
    await enfileirar();
    semear("crc_agent_jobs", []);
    const linha = conteudo("crc_agent_jobs")[0];
    if (linha !== undefined) {
      linha["status"] = "RODANDO";
      linha["tentativas"] = MAX_TENTATIVAS;
      linha["travado_ate"] = new Date(AGORA.getTime() - 60_000).toISOString();
    }

    expect(await liberarPresos()).toBe(1);
    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("FALHOU");
  });
});

/* -------------------------------------------------------------------------- */

describe("retry, teto e dead letter", () => {
  it("a espera cresce e tem teto", () => {
    // Insistir rápido num provedor que devolveu 429 é o que transforma um soluço
    // em tempestade de retries.
    expect(esperaDoRetry(1)).toBe(30);
    expect(esperaDoRetry(2)).toBe(120);
    expect(esperaDoRetry(3)).toBe(480);
    expect(esperaDoRetry(10)).toBe(30 * 60);
  });

  it("falhar antes do teto agenda nova tentativa", async () => {
    await enfileirar();
    const [job] = await reservarJobs({});
    await falharJob(job!, "504 do provedor");

    const linha = conteudo("crc_agent_jobs")[0];
    expect(linha?.["status"]).toBe("REPETIR");
    expect(linha?.["ultimo_erro"]).toContain("504");
    expect(conteudo("crc_dead_letters")).toHaveLength(0);
  });

  it("esgotar as tentativas vira FALHOU e escreve dead letter", async () => {
    await enfileirar();

    /*
     * O laço imita o worker de verdade: reserva, falha, espera o backoff,
     * reserva de novo. Chamar `falharJob` sem reservar seria testar um caminho
     * que a produção não tem — e foi assim que a primeira versão deste teste
     * produziu duas dead letters.
     */
    let volta = 0;
    for (;;) {
      const agora = new Date(AGORA.getTime() + volta * 60 * 60_000);
      definirRelogio(agora);

      const [job] = await reservarJobs({});
      if (job === undefined) break;

      await falharJob(job, `tentativa ${String(job.tentativas)}`, agora);
      volta += 1;
      if (volta > MAX_TENTATIVAS + 2) break;
    }

    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("FALHOU");
    expect(Number(conteudo("crc_agent_jobs")[0]?.["tentativas"])).toBe(MAX_TENTATIVAS);

    // O job some da fila de trabalho. Sem a dead letter, ele some do mundo.
    const mortos = conteudo("crc_dead_letters");
    expect(mortos).toHaveLength(1);
    expect(mortos[0]?.["origem"]).toBe("agent_job");
    expect(mortos[0]?.["organization_id"]).toBe(ORG);
  });
});

/* -------------------------------------------------------------------------- */

describe("descartar não é falhar", () => {
  it("turno sem o que fazer sai como DESCARTADO", async () => {
    // A conversa foi assumida, a flag caiu, o paciente pediu opt-out. Nada disso
    // é defeito — e misturar com erro faria a fila de falhas encher de coisa
    // saudável até ninguém mais olhar.
    await enfileirar();
    const [job] = await reservarJobs({});
    await descartarJob(job!, "Um atendente assumiu a conversa.");

    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("DESCARTADO");
    expect(conteudo("crc_dead_letters")).toHaveLength(0);
  });

  it("concluir marca CONCLUIDO e libera o lease", async () => {
    await enfileirar();
    const [job] = await reservarJobs({});
    await concluirJob(job!, 1234);

    const linha = conteudo("crc_agent_jobs")[0];
    expect(linha?.["status"]).toBe("CONCLUIDO");
    expect(linha?.["travado_ate"]).toBeNull();
    expect(Number(linha?.["duracao_ms"])).toBe(1234);
  });
});

/* -------------------------------------------------------------------------- */

describe("o panorama da fila", () => {
  it("conta por status e mostra a espera mais antiga", async () => {
    await enfileirar("evt-a");
    definirRelogio(new Date(AGORA.getTime() + 5 * 60_000));
    await enfileirar("evt-b");

    const p = await panoramaDaFila(ORG, new Date(AGORA.getTime() + 10 * 60_000));

    expect(p.pendentes).toBe(2);
    // O mais antigo espera há 10 minutos: é o número que responde "a fila está
    // parada?".
    expect(p.esperaMaisAntigaMin).toBe(10);
  });
});

/* -------------------------------------------------------------------------- */

describe("crash não duplica efeito", () => {
  it("o MESMO turno rodando duas vezes reserva a run UMA vez", async () => {
    /*
     * ESTE É O TESTE DA FASE B.
     *
     * A run passou a nascer ANTES da chamada de modelo, com `resultado =
     * RODANDO`. O índice único da chave de dedupe decide quem executa — e quem
     * perde a corrida para antes de gastar qualquer coisa.
     *
     * Antes, a mesma dedupe existia e acontecia no ENCERRAMENTO: as duas
     * execuções chamavam o modelo, e só então uma descobria que era duplicata.
     */
    const { abrirTrace } = await import("../ia-platform/tracing");

    const primeiro = abrirTrace(ORG, CONVERSA);
    const segundo = abrirTrace(ORG, CONVERSA);

    const a = await primeiro.reservar({
      chaveDedupe: `turno:${EVENTO}`,
      conversationId: CONVERSA,
      jobId: null,
    });
    const b = await segundo.reservar({
      chaveDedupe: `turno:${EVENTO}`,
      conversationId: CONVERSA,
      jobId: null,
    });

    expect(a.dono).toBe(true);
    // O segundo para aqui, sem ter chamado o modelo.
    expect(b.dono).toBe(false);

    // E existe UMA run, não duas.
    expect(conteudo("crc_ai_runs")).toHaveLength(1);
    expect(conteudo("crc_ai_runs")[0]?.["resultado"]).toBe("RODANDO");
  });

  it("a run reservada é ATUALIZADA no fim, e não duplicada", async () => {
    const { abrirTrace } = await import("../ia-platform/tracing");
    const trace = abrirTrace(ORG, CONVERSA);

    await trace.reservar({
      chaveDedupe: `turno:${EVENTO}`,
      conversationId: CONVERSA,
      jobId: null,
    });
    await trace.gravar(`turno:${EVENTO}`, null, {
      tipo: "candidato",
      texto: "oi",
      motivo: "sombra",
    });

    const runs = conteudo("crc_ai_runs");
    expect(runs).toHaveLength(1);
    // O desfecho substituiu o RODANDO na MESMA linha.
    expect(runs[0]?.["resultado"]).toBe("candidato");
    expect(runs[0]?.["iniciado_em"]).not.toBeNull();
  });

  it("a mensagem não sai duas vezes, mesmo com o turno repetido", async () => {
    /*
     * A fila é ao-menos-uma-vez: o modelo PODE ser pago duas vezes. O que não
     * pode é o paciente receber duas mensagens — e a proteção disso é o índice
     * único de `crc_messages`, não o cuidado do worker.
     */
    const { enviarMensagem } = await import("../aplicacao/mensagens");

    const enviadas: string[] = [];
    const porta = {
      nome: "sandbox" as const,
      exigeTemplateForaDaJanela: false,
      enviarTexto: (e: { texto: string }) => {
        enviadas.push(e.texto);
        return Promise.resolve({ ok: true as const, providerMessageId: "p-1" });
      },
      enviarTemplate: () => Promise.resolve({ ok: true as const, providerMessageId: "p-2" }),
      verificarAssinatura: () => true,
      interpretarWebhook: () => ({ mensagens: [], entregas: [] }),
    };

    const pedido = {
      organizationId: ORG,
      clinicId: "",
      patientId: null,
      conversationId: CONVERSA,
      telefone: "5511999998888",
      texto: "Certo, obrigada por avisar.",
      // A MESMA chave nas duas execuções: é o que o turno repetido produz.
      chaveDedupe: `agente:${EVENTO}`,
      remetente: "ia" as const,
      proativo: false,
      porta,
      agora: AGORA,
    };

    await enviarMensagem(pedido);
    await enviarMensagem(pedido);

    expect(enviadas).toHaveLength(1);
    expect(conteudo("crc_messages").filter((m) => m["direcao"] === "SAIDA")).toHaveLength(1);
  });
});
