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

import {
  conteudo,
  definirRelogio,
  falharProximaEscrita,
  limparBanco,
  semear,
} from "../testes/banco-memoria";
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
    expect((await enfileirar()).tipo).toBe("criado");
    expect(conteudo("crc_agent_jobs")).toHaveLength(1);
    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("PENDENTE");
  });

  it("o MESMO evento não enfileira duas vezes", async () => {
    // É o caso real: o motor de eventos reprocessa depois de um restart. Sem a
    // constraint, o mesmo turno entraria duas vezes — duas chamadas de modelo
    // pagas para produzir a mesma resposta.
    expect((await enfileirar()).tipo).toBe("criado");
    expect((await enfileirar()).tipo).toBe("duplicado");
    expect(conteudo("crc_agent_jobs")).toHaveLength(1);
  });

  it("DUPLICADO e ERRO são desfechos DIFERENTES", async () => {
    /*
     * O TESTE QUE EXISTE POR CAUSA DE UM TURNO PERDIDO.
     *
     * O retorno era `boolean`, e o `false` queria dizer as duas coisas: "o job
     * já existia" (normal) e "o banco caiu" (um paciente sem resposta). Quem
     * chamava era obrigado a tratar as duas como normal, porque não tinha como
     * separar — e o evento saía marcado como PROCESSADO sem job nenhum.
     *
     * Aqui o mesmo `enfileirar` é chamado duas vezes: uma com o banco de pé,
     * outra com ele falhando. Se os dois desfechos voltarem a colidir num valor
     * só, este teste quebra.
     */
    await enfileirar();
    expect((await enfileirar()).tipo).toBe("duplicado");

    falharProximaEscrita("crc_agent_jobs");
    const r = await enfileirar("evt-novo");

    expect(r.tipo).toBe("erro");
    // E o job NÃO entrou: sobra o do primeiro evento, e mais nada.
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
      interpretarWebhook: () => ({ mensagens: [], entregas: [], destinatario: null }),
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

/* -------------------------------------------------------------------------- */

describe("o reclaim da run", () => {
  const reservar = async (quem: string) => {
    const { abrirTrace } = await import("../ia-platform/tracing");
    return await abrirTrace(ORG, CONVERSA).reservar({
      chaveDedupe: `turno:${EVENTO}`,
      conversationId: CONVERSA,
      jobId: null,
      quem,
    });
  };

  it("o lease VIVO impede outro de assumir", async () => {
    const a = await reservar("worker-1");
    const b = await reservar("worker-2");

    expect(a.dono).toBe(true);
    // "ocupada", e não "terminal": alguém está nela AGORA. A distinção existe
    // porque só uma das duas justifica tentar de novo mais tarde.
    expect(b).toEqual({ dono: false, motivo: "ocupada" });
    expect(conteudo("crc_ai_runs")).toHaveLength(1);
  });

  it("o lease VENCIDO deixa a run ser retomada — e é o conserto do P0", async () => {
    /*
     * O DEFEITO QUE ESTE TESTE TRAVA.
     *
     * A reserva era `insert ... on conflict do nothing`: a linha existir
     * significava "outro é o dono". Só que o "outro" podia ser o EU DE ANTES,
     * morto no meio do turno. O job se recuperava pelo lease dele, tentava
     * reservar a run, batia no conflito, e o turno devolvia `sem_acao` — que o
     * worker lê como desfecho legítimo e usa para CONCLUIR o job.
     *
     * Resultado: o job saía da fila marcado como resolvido, e o paciente nunca
     * era respondido. O job se recuperava e a run não.
     */
    const antes = await reservar("worker-que-morreu");
    expect(antes.dono).toBe(true);

    // 💥 o processo morre aqui. O relógio anda além do lease.
    definirRelogio(new Date(AGORA.getTime() + 200_000));

    const depois = await reservar("worker-2");

    expect(depois.dono).toBe(true);
    if (depois.dono) {
      // MESMA linha, e não uma segunda: a idempotência continua valendo.
      expect(depois.runId).toBe(antes.dono ? antes.runId : "");
      // A tentativa soma. É o que separa "turno lento" de "turno que trava
      // sempre" quando alguém for investigar.
      expect(depois.tentativa).toBe(2);
    }
    expect(conteudo("crc_ai_runs")).toHaveLength(1);
  });

  it("run já TERMINADA não roda de novo", async () => {
    await reservar("worker-1");
    const linha = conteudo("crc_ai_runs")[0];
    if (linha !== undefined) linha["resultado"] = "enviado";

    // Mesmo com o lease vencido: o trabalho ACONTECEU. Repetir gastaria modelo
    // de novo para produzir a mesma resposta — e, pior, poderia reenviá-la.
    definirRelogio(new Date(AGORA.getTime() + 200_000));
    expect(await reservar("worker-2")).toEqual({ dono: false, motivo: "terminal" });
  });

  it("a reserva que FALHA não devolve dono — falha FECHADA", async () => {
    /*
     * O TERCEIRO P0.
     *
     * A versão anterior devolvia `dono: true` com runId vazio quando o banco
     * caía, e o comentário justificava: "não responder um paciente é pior que
     * pagar duas vezes". O raciocínio ignora o que vem depois — sem
     * idempotência, duas execuções do mesmo turno podem mandar DUAS MENSAGENS
     * ao paciente, ou marcar duas consultas. O gasto dobrado é o menor dano.
     *
     * E o turno não se perdia: `indefinido` faz o worker FALHAR o job, e um job
     * falho volta para a fila.
     */
    falharProximaEscrita("crc_reivindicar_ai_run");
    const r = await reservar("worker-1");

    expect(r.dono).toBe(false);
    expect(r.dono === false ? r.motivo : "").toBe("indefinido");
    expect(conteudo("crc_ai_runs")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */

describe("o evento não some quando o enfileiramento falha", () => {
  const evento = {
    id: EVENTO,
    organizationId: ORG,
    clinicId: null,
    tipo: "message.received" as const,
    entityType: null,
    entityId: null,
    payload: { conversationId: CONVERSA },
    fingerprint: `message.received:${EVENTO}`,
    status: "PROCESSANDO" as const,
    tentativas: 0,
    ocorridoEm: AGORA.toISOString(),
  };

  it("o handler LANÇA, e é o que devolve o evento para a fila", async () => {
    /*
     * O SEGUNDO P0, no ponto onde ele doía.
     *
     * `aoRodarTurnoDoAgente` ignorava o retorno de `enfileirarTurno` — e era
     * obrigado a ignorar, porque o retorno era um booleano em que "já existia" e
     * "o banco caiu" tinham o mesmo valor. O evento saía marcado como
     * PROCESSADO, o job nunca nascia, e do outro lado ficava um paciente que
     * escreveu e nunca foi respondido. Nada na fila indicava isso.
     *
     * O `throw` aqui é o que aciona a repescagem: `processarEventos` devolve o
     * evento para PENDENTE com backoff e, esgotadas as tentativas, o manda para
     * a dead letter — onde uma pessoa vê. Perder um turno deixou de ser mudo.
     */
    const { aoRodarTurnoDoAgente } = await import("./handlers");

    falharProximaEscrita("crc_agent_jobs");

    await expect(aoRodarTurnoDoAgente(evento)).rejects.toThrow(/enfileirar o turno/u);
    expect(conteudo("crc_agent_jobs")).toHaveLength(0);
  });

  it("mas o job DUPLICADO não lança: é o reprocessamento normal", async () => {
    /*
     * A outra metade, e sem ela o conserto seria pior que o defeito: o motor de
     * eventos reprocessa em restart, por desenho. Se duplicata lançasse, todo
     * restart encheria a dead letter de eventos saudáveis — e uma dead letter
     * cheia de coisa boa é uma dead letter que ninguém lê.
     */
    const { aoRodarTurnoDoAgente } = await import("./handlers");

    await aoRodarTurnoDoAgente(evento);
    await expect(aoRodarTurnoDoAgente(evento)).resolves.toBeUndefined();

    expect(conteudo("crc_agent_jobs")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("o heartbeat e o fencing", () => {
  const reservar = async (quem: string) => (await reservarJobs({ quem, limite: 1 }))[0];

  it("cada reserva emite um token DIFERENTE", async () => {
    /*
     * É o que separa "eu peguei este job" de "eu peguei este job AGORA". O
     * `travado_por` se repete entre invocações do mesmo cron; o token não —
     * e sem essa diferença o fencing seria uma comparação de nomes.
     */
    await enfileirar();
    const a = await reservar("worker-A");

    definirRelogio(new Date(AGORA.getTime() + 200_000));
    const b = await reservar("worker-B");

    expect(a?.leaseToken).toBeTruthy();
    expect(b?.leaseToken).toBeTruthy();
    expect(b?.leaseToken).not.toBe(a?.leaseToken);
  });

  it("quem tem a posse renova; quem perdeu recebe FALSE", async () => {
    /*
     * O DEFEITO QUE ISTO TRAVA é consequência do reclaim que eu mesmo
     * consertei: o lease é de 180s e um turno de cinco passos passa disso
     * ESTANDO VIVO. Sem heartbeat, outro worker o reivindica e o reclaim —
     * feito para recuperar crash — age contra quem não caiu.
     */
    const { renovarLease } = await import("../aplicacao/agent-jobs");

    await enfileirar();
    const a = await reservar("worker-A");
    expect(await renovarLease(a?.id ?? "", a?.leaseToken ?? null)).toBe(true);

    // O lease vence e outro assume.
    definirRelogio(new Date(AGORA.getTime() + 200_000));
    const b = await reservar("worker-B");
    expect(b?.id).toBe(a?.id);

    // Agora o antigo precisa DESCOBRIR que não é mais dono.
    expect(await renovarLease(a?.id ?? "", a?.leaseToken ?? null)).toBe(false);
    expect(await renovarLease(b?.id ?? "", b?.leaseToken ?? null)).toBe(true);
  });

  it("quem perdeu a posse NÃO grava o desfecho", async () => {
    /*
     * A metade que falta em quase toda implementação de lease. Sem fencing:
     *
     *   A perde o lease → B assume e responde o paciente → A acorda e grava
     *   CONCLUIDO por cima
     *
     * O job sai da fila com o desfecho do perdedor e o trabalho do B fica sem
     * registro. O último a escrever vence.
     */
    const { concluirJob } = await import("../aplicacao/agent-jobs");

    await enfileirar();
    const a = await reservar("worker-A");

    definirRelogio(new Date(AGORA.getTime() + 200_000));
    const b = await reservar("worker-B");

    expect(await concluirJob(a as NonNullable<typeof a>, 10)).toBe(false);
    // E o job continua RODANDO: o desfecho do perdedor não entrou.
    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("RODANDO");

    expect(await concluirJob(b as NonNullable<typeof b>, 10)).toBe(true);
    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("CONCLUIDO");
  });

  it("o heartbeat renova o lease da RUN junto", async () => {
    // Os dois precisam vencer juntos. Com o da run mais curto, ela é assumida
    // por outro worker enquanto o dono do job ainda está trabalhando.
    const { renovarLease } = await import("../aplicacao/agent-jobs");

    await enfileirar();
    const a = await reservar("worker-A");

    semear("crc_ai_runs", [
      {
        organization_id: ORG,
        conversation_id: CONVERSA,
        chave_dedupe: "turno:hb",
        resultado: "RODANDO",
        job_id: a?.id,
        travado_ate: new Date(AGORA.getTime() + 1000).toISOString(),
      },
    ]);

    await renovarLease(a?.id ?? "", a?.leaseToken ?? null, 300);

    const run = conteudo("crc_ai_runs")[0];
    const ate = Date.parse(String(run?.["travado_ate"]));
    expect(ate).toBeGreaterThan(AGORA.getTime() + 200_000);
  });

  it("sem token — banco sem a migração 22 — nada quebra", async () => {
    /*
     * Código novo entra em produção antes de alguém rodar o SQL à mão; é assim
     * neste projeto, por decisão. Sem token, o heartbeat responde `true` e o
     * encerramento cai no caminho antigo: sem fencing, e funcionando.
     */
    const { renovarLease, concluirJob } = await import("../aplicacao/agent-jobs");

    await enfileirar();
    const a = await reservar("worker-A");
    const semToken = { ...(a as NonNullable<typeof a>), leaseToken: null };

    expect(await renovarLease(semToken.id, null)).toBe(true);
    expect(await concluirJob(semToken, 10)).toBe(true);
    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("CONCLUIDO");
  });
});

/* -------------------------------------------------------------------------- */

describe("o crash na ÚLTIMA tentativa não some", () => {
  it("job preso no teto vira FALHOU e DEAD LETTER na mesma volta", async () => {
    /*
     * ========================================================================
     *  O BURACO QUE ISTO FECHA.
     *
     *      tentativa 5, worker processando
     *        ↓ 💥 o processo morre
     *        ↓ o lease vence
     *        ↓ a limpeza marca FALHOU
     *
     *  E acabava aí. A reserva só aceita `tentativas < 5`, então ele nunca
     *  voltava; e a dead letter era escrita pelo `catch` do worker — que nunca
     *  aconteceu, porque o worker morreu.
     *
     *  FALHOU, fora da fila, sem registro. Do outro lado tem um paciente que
     *  escreveu.
     *
     *  Por isso o registro sai da FUNÇÃO de limpeza, e não do worker: o worker
     *  é justamente quem não estava lá.
     * ========================================================================
     */
    await enfileirar();
    const linha = conteudo("crc_agent_jobs")[0];
    if (linha !== undefined) {
      linha["status"] = "RODANDO";
      linha["tentativas"] = MAX_TENTATIVAS;
      linha["travado_ate"] = new Date(AGORA.getTime() - 60_000).toISOString();
    }

    expect(await liberarPresos()).toBe(1);
    expect(conteudo("crc_agent_jobs")[0]?.["status"]).toBe("FALHOU");

    const mortas = conteudo("crc_dead_letters");
    expect(mortas).toHaveLength(1);
    expect(mortas[0]?.["origem"]).toBe("agent_job");
    expect(mortas[0]?.["status"]).toBe("PENDENTE");
  });

  it("rodar a limpeza de novo NÃO duplica a dead letter", async () => {
    /*
     * A limpeza roda a cada volta do worker. Sem a guarda, um job preso viraria
     * uma linha nova por volta — até a fila de falhas ter mais ruído que sinal,
     * que é como ela deixa de ser lida.
     */
    await enfileirar();
    const linha = conteudo("crc_agent_jobs")[0];
    if (linha !== undefined) {
      linha["status"] = "RODANDO";
      linha["tentativas"] = MAX_TENTATIVAS;
      linha["travado_ate"] = new Date(AGORA.getTime() - 60_000).toISOString();
    }

    await liberarPresos();
    // A segunda volta não acha nada preso (o status já é FALHOU), e mesmo que
    // achasse, a guarda de duplicata seguraria.
    await liberarPresos();

    expect(conteudo("crc_dead_letters")).toHaveLength(1);
  });
});
