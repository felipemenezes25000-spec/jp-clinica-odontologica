/**
 * O caminho crítico, ponta a ponta — Fase E, itens 32 a 34.
 *
 * O PERCURSO QUE ESTE ARQUIVO SEGUE é o do dia a dia da clínica:
 *
 *   mensagem chega  →  evento  →  job  →  worker reserva  →  turno  →  resposta
 *
 * Tudo contra o Postgres de verdade, pelo adaptador de produção. O que muda em
 * relação aos testes de unidade não é a lógica — é que aqui as transações são
 * transações, os índices recusam de fato, e um worker que "morre" deixa estado
 * real para outro encontrar.
 *
 * O QUE CONTINUA DUBLADO, e é honesto dizer: o provedor de IA e o de WhatsApp.
 * Nenhum dos dois tem contrato assinado — está na matriz como
 * `BLOCKED_EXTERNAL`. Um teste que fingisse chamá-los estaria testando a
 * própria fantasia. O que se prova aqui é tudo o que existe entre a mensagem do
 * paciente e a borda desses dois.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { exigirBanco, limparTudo, semearDuasClinicas, sql, CLINICA_A, ORG_A } from "./apoio";

const CONVERSA = "c0c0c0c0-c0c0-4c0c-8c0c-c0c0c0c0c0c0";
const PACIENTE = "d0d0d0d0-d0d0-4d0d-8d0d-d0d0d0d0d0d0";

beforeAll(() => {
  exigirBanco();
});

beforeEach(async () => {
  await limparTudo();
  await semearDuasClinicas();
  await sql(`
    insert into public.crc_patients
      (id, organization_id, clinic_id, external_id, nome, telefone)
    values ('${PACIENTE}', '${ORG_A}', '${CLINICA_A}', 'pac-externo-1',
            'Maria Souza', '5511988887777');

    insert into public.crc_conversations
      (id, organization_id, clinic_id, patient_id, canal, contato_externo, status, dono)
    values ('${CONVERSA}', '${ORG_A}', '${CLINICA_A}', '${PACIENTE}',
            'whatsapp', '5511988887777', 'ABERTA', 'ia');
  `);
});

/* ========================================================================== */
/* 1. Da mensagem ao job                                                      */
/* ========================================================================== */

describe("a mensagem do paciente vira trabalho durável", () => {
  async function chegarMensagem(eventoId: string): Promise<void> {
    await sql(`
      insert into public.crc_messages
        (organization_id, conversation_id, patient_id, direcao, remetente, conteudo, chave_dedupe)
      values ('${ORG_A}', '${CONVERSA}', '${PACIENTE}', 'ENTRADA', 'paciente',
              'Oi, consigo remarcar para quinta?', 'entrada:${eventoId}')
      -- SEM ALVO de propósito: crc_messages_dedupe é um índice PARCIAL (só vale
      -- quando chave_dedupe não é nula), e on conflict com lista de colunas
      -- exigiria repetir o predicado dele aqui. O teste quer "não duplique", e
      -- não "não duplique por esta constraint específica".
      on conflict do nothing;

      insert into public.crc_agent_jobs (organization_id, conversation_id, status, chave_dedupe)
      values ('${ORG_A}', '${CONVERSA}', 'PENDENTE', 'turno:${eventoId}')
      on conflict (organization_id, chave_dedupe) do nothing;
    `);
  }

  it("um evento reprocessado NÃO paga o modelo duas vezes", async () => {
    await chegarMensagem("evento-1");
    await chegarMensagem("evento-1");
    await chegarMensagem("evento-1");

    /*
     * O MOTOR DE EVENTOS REPROCESSA em restart — está no desenho, não é
     * acidente. Sem o índice único de `(organization_id, chave_dedupe)`, cada
     * restart enfileiraria o mesmo turno de novo, e cada job pago vira uma
     * chamada de modelo a mais para produzir a MESMA resposta.
     */
    const jobs = await sql(
      `select id from public.crc_agent_jobs where organization_id = '${ORG_A}'`,
    );
    expect(jobs).toHaveLength(1);
  });

  it("o job carrega o tenant, e o tenant não vem do texto do paciente", async () => {
    await chegarMensagem("evento-2");

    const [job] = await sql<{ organization_id: string; conversation_id: string }>(
      `select organization_id, conversation_id from public.crc_agent_jobs`,
    );

    // É a regra mais importante da tabela: o `organization_id` é COLUNA, gravada
    // por quem enfileirou. Um turno agentic manipula texto vindo de fora, e se o
    // tenant viesse de qualquer coisa que passou perto do modelo, uma injeção
    // bem escrita leria a base de outra clínica.
    expect(job?.organization_id).toBe(ORG_A);
    expect(job?.conversation_id).toBe(CONVERSA);
  });
});

/* ========================================================================== */
/* 2. Recovery: o worker morre no meio                                        */
/* ========================================================================== */

describe("o worker morre e o paciente continua sendo respondido", () => {
  beforeEach(async () => {
    await sql(`
      insert into public.crc_agent_jobs (organization_id, conversation_id, status, chave_dedupe)
      values ('${ORG_A}', '${CONVERSA}', 'PENDENTE', 'turno:recovery')
    `);
  });

  it("lease vencido devolve o job para a fila", async () => {
    const pego = await sql<{ id: string }>(
      `select id from public.crc_reservar_agent_jobs(5, 1, 'worker-que-vai-morrer')`,
    );
    expect(pego).toHaveLength(1);

    // O worker morreu aqui: nunca marcou conclusão, e o lease expirou.
    await sql(`update public.crc_agent_jobs set travado_ate = now() - interval '1 second'`);

    const retomado = await sql<{ id: string; tentativas: number }>(
      `select id, tentativas from public.crc_reservar_agent_jobs(5, 180, 'worker-novo')`,
    );

    expect(retomado[0]?.id).toBe(pego[0]?.id);
    // A tentativa foi incrementada NA RESERVA, e não no fim: um job que derruba
    // o worker toda vez nunca chegaria ao teto se o incremento fosse no fim.
    expect(Number(retomado[0]?.tentativas)).toBe(2);
  });

  it("depois de cinco tentativas o job PARA, e vira registro", async () => {
    // Cinco reservas seguidas, cada uma com o worker morrendo em seguida.
    for (let i = 0; i < 5; i += 1) {
      await sql(`select id from public.crc_reservar_agent_jobs(5, 1, 'worker-${String(i)}')`);
      await sql(`update public.crc_agent_jobs set travado_ate = now() - interval '1 second'`);
    }

    const maisUma = await sql(`select id from public.crc_reservar_agent_jobs(5, 180, 'worker-6')`);
    // O teto existe para o job que quebra sempre parar de queimar modelo.
    expect(maisUma).toHaveLength(0);

    const liberados = await sql<{ crc_liberar_agent_jobs_presos: number }>(
      `select public.crc_liberar_agent_jobs_presos()`,
    );

    /*
     * SEM ESTA LIMPEZA, o job ficaria RODANDO para sempre: invisível na fila de
     * trabalho, porque o teto o exclui, e invisível na fila de falhas, porque o
     * status não é FALHOU. É o pior estado possível — some sem avisar, e do
     * outro lado tem alguém que escreveu.
     */
    expect(Number(liberados[0]?.crc_liberar_agent_jobs_presos)).toBe(1);

    const [job] = await sql<{ status: string }>(`select status from public.crc_agent_jobs`);
    expect(job?.status).toBe("FALHOU");
  });

  it("a run aberta antes do modelo aparece no painel de saúde", async () => {
    await sql(`
      insert into public.crc_ai_runs
        (organization_id, conversation_id, chave_dedupe, resultado, iniciado_em)
      values ('${ORG_A}', '${CONVERSA}', 'turno:travado', 'RODANDO', now() - interval '2 hours')
    `);

    const abertas = await sql<{ id: string }>(`
      select id from public.crc_ai_runs
       where organization_id = '${ORG_A}'
         and resultado = 'RODANDO'
         and iniciado_em < now() - interval '30 minutes'
    `);

    // A run nasce no começo do turno (Fase B). O preço disso é que uma run pode
    // ficar aberta — e é justamente ela que denuncia o worker que morreu.
    expect(abertas).toHaveLength(1);
  });

  it("a segunda execução do mesmo turno não abre uma segunda run", async () => {
    const inserir = () =>
      sql(`
        insert into public.crc_ai_runs
          (organization_id, conversation_id, chave_dedupe, resultado, iniciado_em)
        values ('${ORG_A}', '${CONVERSA}', 'turno:disputado', 'RODANDO', now())
        on conflict do nothing
        returning id
      `).catch(() => []);

    await Promise.all([inserir(), inserir(), inserir(), inserir()]);

    // A idempotência VEM ANTES DO GASTO (Fase B): quem perde a corrida aqui
    // devolve `sem_acao` sem ter chamado o modelo.
    const runs = await sql(
      `select id from public.crc_ai_runs where chave_dedupe = 'turno:disputado'`,
    );
    expect(runs).toHaveLength(1);
  });
});

/* ========================================================================== */
/* 2b. O crash inteiro: job E run voltam                                      */
/* ========================================================================== */

/**
 * A SEQUÊNCIA COMPLETA, e ela é o teste que faltava:
 *
 *   reservar job → reservar run → 💥 → lease vence → retomar job → RETOMAR RUN
 *   → terminar
 *
 * O penúltimo passo é o que não existia. O job voltava e a run não: a
 * reivindicação era `insert ... on conflict do nothing`, então a run já criada
 * significava "outro é o dono" — mesmo quando o outro era o processo morto. O
 * turno devolvia `sem_acao`, o worker CONCLUÍA o job, e o paciente ficava sem
 * resposta com a fila marcada como resolvida.
 *
 * Os testes acima cobriam as duas metades separadas — o job que volta, a run que
 * não duplica. Nenhum percorria as duas juntas, que é onde estava o furo.
 */
describe("o crash recupera o job E a run", () => {
  const CHAVE = "turno:crash-completo";

  const reivindicar = (quem: string) =>
    sql<{ situacao: string; run_id: string; numero_tentativa: number }>(`
      select * from public.crc_reivindicar_ai_run(
        '${ORG_A}', '${CONVERSA}', '${CHAVE}', null, 180, '${quem}')
    `);

  beforeEach(async () => {
    await sql(`
      insert into public.crc_agent_jobs (organization_id, conversation_id, status, chave_dedupe)
      values ('${ORG_A}', '${CONVERSA}', 'PENDENTE', '${CHAVE}')
    `);
  });

  it("percorre crash, lease vencido e retomada até o desfecho", async () => {
    // --- 1. o primeiro worker pega o job e abre a run -----------------------
    const job1 = await sql<{ id: string }>(
      `select id from public.crc_reservar_agent_jobs(5, 1, 'worker-1')`,
    );
    expect(job1).toHaveLength(1);

    const run1 = await reivindicar("worker-1");
    expect(run1[0]?.situacao).toBe("nova");

    // --- 2. 💥 o processo morre entre a reserva e a chamada de modelo -------
    await sql(`
      update public.crc_agent_jobs set travado_ate = now() - interval '1 second';
      update public.crc_ai_runs     set travado_ate = now() - interval '1 second';
    `);

    // --- 3. outro worker retoma o job --------------------------------------
    const job2 = await sql<{ id: string; tentativas: number }>(
      `select id, tentativas from public.crc_reservar_agent_jobs(5, 180, 'worker-2')`,
    );
    expect(job2[0]?.id).toBe(job1[0]?.id);

    // --- 4. E RETOMA A RUN. Era aqui que parava. ---------------------------
    const run2 = await reivindicar("worker-2");

    expect(run2[0]?.situacao).toBe("reclaim");
    // MESMA linha: a idempotência continua valendo, e o histórico do turno não
    // se parte em dois.
    expect(run2[0]?.run_id).toBe(run1[0]?.run_id);
    expect(Number(run2[0]?.numero_tentativa)).toBe(2);

    // --- 5. o turno termina, e o desfecho fecha a run ----------------------
    await sql(`
      update public.crc_ai_runs set resultado = 'enviado', travado_ate = null
       where chave_dedupe = '${CHAVE}';
      update public.crc_agent_jobs set status = 'CONCLUIDO', travado_ate = null
       where chave_dedupe = '${CHAVE}';
    `);

    // --- 6. e um retry tardio NÃO roda de novo ------------------------------
    const tarde = await reivindicar("worker-3");
    // `terminal`, e não `reclaim`: o trabalho aconteceu. Repetir gastaria modelo
    // para produzir a mesma resposta — e poderia reenviá-la ao paciente.
    expect(tarde[0]?.situacao).toBe("terminal");

    const runs = await sql(`select id from public.crc_ai_runs where chave_dedupe = '${CHAVE}'`);
    expect(runs).toHaveLength(1);
  });

  it("o lease VIVO da run impede o roubo, mesmo com dois workers juntos", async () => {
    await reivindicar("worker-1");

    /*
     * SEM O PREDICADO DE LEASE no `do update`, este teste passaria devolvendo
     * `reclaim` — e o remédio seria pior que a doença: duas execuções do mesmo
     * turno ao mesmo tempo, duas chamadas de modelo, possivelmente duas
     * mensagens ao paciente.
     */
    const [a, b] = await Promise.all([reivindicar("worker-2"), reivindicar("worker-3")]);

    expect(a[0]?.situacao).toBe("ocupada");
    expect(b[0]?.situacao).toBe("ocupada");
  });

  it("duas retomadas SIMULTÂNEAS do lease vencido: só uma assume", async () => {
    await reivindicar("worker-1");
    await sql(`update public.crc_ai_runs set travado_ate = now() - interval '1 second'`);

    /*
     * A CORRIDA QUE O FAKE EM MEMÓRIA NUNCA PODERIA PROVAR — JavaScript é uma
     * thread só. Aqui são duas transações de verdade disputando a mesma linha.
     *
     * O `on conflict do update ... where` é o que fecha a corrida: a segunda
     * transação espera a primeira soltar a linha e SÓ ENTÃO avalia o predicado —
     * contra o `travado_ate` já renovado. Ler-decidir-escrever, que é a
     * alternativa óbvia, deixaria as duas lerem "vencido" e as duas assumirem.
     */
    const [a, b] = await Promise.all([reivindicar("worker-2"), reivindicar("worker-3")]);
    const situacoes = [a[0]?.situacao, b[0]?.situacao].sort();

    expect(situacoes).toEqual(["ocupada", "reclaim"]);

    const [run] = await sql<{ tentativa: number }>(
      `select tentativa from public.crc_ai_runs where chave_dedupe = '${CHAVE}'`,
    );
    // Somou UMA vez, e não duas: só uma retomada aconteceu de verdade.
    expect(Number(run?.tentativa)).toBe(2);
  });

  it("a run órfã de um job morto é FECHADA, e não fica aberta para sempre", async () => {
    await reivindicar("worker-1");

    /*
     * O ESTADO QUE NINGUÉM LIMPAVA. O job esgotou as tentativas e virou FALHOU;
     * ninguém mais vai retomá-lo, então ninguém mais vai retomar a run dele. Ela
     * fica RODANDO para sempre, e o painel de saúde passa a contar um "turno
     * aberto" que nunca vai fechar — que é como uma métrica deixa de significar
     * alguma coisa.
     */
    await sql(`
      update public.crc_agent_jobs set status = 'FALHOU';
      update public.crc_ai_runs
         set iniciado_em = now() - interval '2 hours',
             job_id = (select id from public.crc_agent_jobs limit 1);
    `);

    const [n] = await sql<{ crc_fechar_ai_runs_abandonadas: number }>(
      `select public.crc_fechar_ai_runs_abandonadas(30)`,
    );
    expect(Number(n?.crc_fechar_ai_runs_abandonadas)).toBe(1);

    const [run] = await sql<{ resultado: string; motivo: string }>(
      `select resultado, motivo from public.crc_ai_runs where chave_dedupe = '${CHAVE}'`,
    );
    expect(run?.resultado).toBe("falha_segura");
    expect(run?.motivo).toContain("não voltou");
  });

  it("NÃO fecha a run cujo job ainda pode voltar", async () => {
    await reivindicar("worker-1");

    // Job PENDENTE: ele ainda será reservado, e vai retomar esta run. Fechá-la
    // agora faria o worker encontrar `terminal` e desistir de um turno que
    // ninguém executou.
    await sql(`
      update public.crc_ai_runs
         set iniciado_em = now() - interval '2 hours',
             job_id = (select id from public.crc_agent_jobs limit 1);
    `);

    const [n] = await sql<{ crc_fechar_ai_runs_abandonadas: number }>(
      `select public.crc_fechar_ai_runs_abandonadas(30)`,
    );
    expect(Number(n?.crc_fechar_ai_runs_abandonadas)).toBe(0);
  });
});

/* ========================================================================== */
/* 2b-bis. Heartbeat e fencing: o turno lento que não caiu                    */
/* ========================================================================== */

/**
 * O CENÁRIO QUE O RECLAIM CRIOU, e que só o heartbeat fecha.
 *
 * O lease é de 180s. Um turno com cinco passos, cada um com uma chamada de
 * modelo de até 25s e uma ida ao Dental Office no meio, passa disso ESTANDO
 * VIVO. Aí outro worker encontra o lease vencido e reivindica — e o reclaim,
 * que existe para recuperar crash, passa a agir contra quem não caiu.
 */
describe("o turno lento renova o lease em vez de ser roubado", () => {
  const CHAVE = "turno:heartbeat";

  beforeEach(async () => {
    await sql(`
      insert into public.crc_agent_jobs (organization_id, conversation_id, status, chave_dedupe)
      values ('${ORG_A}', '${CONVERSA}', 'PENDENTE', '${CHAVE}')
    `);
  });

  const reservar = (quem: string, lease = 1) =>
    sql<{ id: string; lease_token: string }>(
      `select id, lease_token from public.crc_reservar_agent_jobs(1, ${String(lease)}, '${quem}')`,
    );

  it("cada reserva emite um token diferente", async () => {
    const a = await reservar("A");
    await sql(`update public.crc_agent_jobs set travado_ate = now() - interval '1 second'`);
    const b = await reservar("B");

    expect(a[0]?.lease_token).toBeTruthy();
    expect(b[0]?.lease_token).not.toBe(a[0]?.lease_token);
  });

  it("o heartbeat mantém o lease — e o outro worker NÃO leva o job", async () => {
    const a = await reservar("A", 2);

    // O turno está demorando, mas está vivo: bate.
    const [ok] = await sql<{ crc_renovar_lease: boolean }>(
      `select public.crc_renovar_lease('${a[0]?.id ?? ""}', '${a[0]?.lease_token ?? ""}', 300)`,
    );
    expect(ok?.crc_renovar_lease).toBe(true);

    // Sem o batimento, os 2s teriam vencido e B levaria. Com ele, não há o que
    // levar.
    expect(await reservar("B")).toHaveLength(0);
  });

  it("perdida a posse, o heartbeat devolve false", async () => {
    const a = await reservar("A");
    await sql(`update public.crc_agent_jobs set travado_ate = now() - interval '1 second'`);
    await reservar("B");

    const [ok] = await sql<{ crc_renovar_lease: boolean }>(
      `select public.crc_renovar_lease('${a[0]?.id ?? ""}', '${a[0]?.lease_token ?? ""}', 300)`,
    );
    // É como o worker antigo DESCOBRE que precisa parar.
    expect(ok?.crc_renovar_lease).toBe(false);
  });

  it("o perdedor NÃO grava o desfecho por cima do vencedor", async () => {
    /*
     * A metade que falta em quase toda implementação de lease. Sem fencing, o
     * worker A acorda depois do reclaim e grava CONCLUIDO por cima do trabalho
     * do B — e o último a escrever vence, que é o pior critério possível.
     */
    const a = await reservar("A");
    await sql(`update public.crc_agent_jobs set travado_ate = now() - interval '1 second'`);
    const b = await reservar("B");

    const [perdedor] = await sql<{ crc_encerrar_agent_job: boolean }>(
      `select public.crc_encerrar_agent_job('${a[0]?.id ?? ""}', '${a[0]?.lease_token ?? ""}', 'CONCLUIDO')`,
    );
    expect(perdedor?.crc_encerrar_agent_job).toBe(false);

    const [aindaRodando] = await sql<{ status: string }>(
      `select status from public.crc_agent_jobs where chave_dedupe = '${CHAVE}'`,
    );
    expect(aindaRodando?.status).toBe("RODANDO");

    const [vencedor] = await sql<{ crc_encerrar_agent_job: boolean }>(
      `select public.crc_encerrar_agent_job('${b[0]?.id ?? ""}', '${b[0]?.lease_token ?? ""}', 'CONCLUIDO')`,
    );
    expect(vencedor?.crc_encerrar_agent_job).toBe(true);
  });

  it("o heartbeat renova o lease da RUN junto com o do job", async () => {
    // Os dois precisam vencer juntos: com o da run mais curto, ela é assumida
    // por outro worker enquanto o dono do job ainda trabalha.
    const a = await reservar("A", 300);
    await sql(`
      insert into public.crc_ai_runs
        (organization_id, conversation_id, chave_dedupe, resultado, iniciado_em, job_id, travado_ate)
      values ('${ORG_A}', '${CONVERSA}', '${CHAVE}', 'RODANDO', now(),
              '${a[0]?.id ?? ""}', now() + interval '1 second')
    `);

    await sql(
      `select public.crc_renovar_lease('${a[0]?.id ?? ""}', '${a[0]?.lease_token ?? ""}', 600)`,
    );

    const [run] = await sql<{ sobra: number }>(
      `select extract(epoch from (travado_ate - now())) as sobra
         from public.crc_ai_runs where chave_dedupe = '${CHAVE}'`,
    );
    expect(Number(run?.sobra)).toBeGreaterThan(500);
  });
});

/* ========================================================================== */
/* 2c. A inbox de webhook: crash e replay                                     */
/* ========================================================================== */

/**
 * O CENÁRIO QUE A AUDITORIA PEDIU, e que não existia em teste nenhum:
 *
 *     Meta manda o webhook → CRC grava → 💥 → linha FALHOU → 200 para a Meta
 *     → a Meta NUNCA reenvia → alguém tem que repescar
 *
 * Enquanto ninguém repescava, a mensagem do paciente sumia em silêncio. Aqui a
 * fila é exercitada contra o Postgres de verdade, onde `FOR UPDATE SKIP LOCKED`
 * é `FOR UPDATE SKIP LOCKED` e não uma imitação.
 */
describe("a inbox de webhook repesca o que falhou", () => {
  const inserir = (externalId: string, extra = "") =>
    sql(`
      insert into public.crc_webhook_inbox
        (provedor, external_id, payload, status ${extra.length > 0 ? ", " + extra.split("=")[0] : ""})
      values ('meta_cloud', '${externalId}', '{"mensagens":[],"entregas":[]}'::jsonb, 'FALHOU'
              ${extra.length > 0 ? ", " + (extra.split("=")[1] ?? "") : ""})
    `);

  beforeEach(async () => {
    await sql(`delete from public.crc_webhook_inbox`);
  });

  it("o envelope que falhou é reservado de volta", async () => {
    await inserir("wamid.CAIU");

    const pego = await sql<{ external_id: string; tentativas: number }>(
      `select external_id, tentativas from public.crc_reservar_webhooks(10, 120, 'w1', 5)`,
    );

    expect(pego).toHaveLength(1);
    // Incrementada NA RESERVA: um envelope que derruba o worker toda vez nunca
    // chegaria ao teto se o incremento fosse no fim.
    expect(Number(pego[0]?.tentativas)).toBe(1);
  });

  it("dois workers simultâneos NÃO pegam o mesmo envelope", async () => {
    /*
     * A corrida que o banco em memória não pode provar — JavaScript é uma
     * thread só. Aqui são duas transações de verdade disputando as linhas.
     */
    for (let i = 0; i < 6; i += 1) await inserir(`wamid.C${String(i)}`);

    const [a, b] = await Promise.all([
      sql<{ id: string }>(`select id from public.crc_reservar_webhooks(3, 120, 'wa', 5)`),
      sql<{ id: string }>(`select id from public.crc_reservar_webhooks(3, 120, 'wb', 5)`),
    ]);

    const ids = [...a.map((x) => x.id), ...b.map((x) => x.id)];
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
  });

  it("o backoff segura: envelope com `disponivel_em` no futuro não volta", async () => {
    await inserir("wamid.ESPERA");
    await sql(`update public.crc_webhook_inbox set disponivel_em = now() + interval '10 minutes'`);

    expect(await sql(`select id from public.crc_reservar_webhooks(10, 120, 'w1', 5)`)).toHaveLength(
      0,
    );
  });

  it("passado o teto, sai da fila — e a limpeza o torna visível", async () => {
    await inserir("wamid.DESISTIU");
    await sql(`update public.crc_webhook_inbox set tentativas = 5`);

    // Invisível na fila de trabalho...
    expect(await sql(`select id from public.crc_reservar_webhooks(10, 120, 'w1', 5)`)).toHaveLength(
      0,
    );

    // ...e o pior estado é ficar PROCESSANDO com o lease vencido: some das duas
    // filas ao mesmo tempo. A limpeza o devolve para FALHOU, onde alguém vê.
    await sql(`
      update public.crc_webhook_inbox
         set status = 'PROCESSANDO', travado_ate = now() - interval '1 second'
    `);

    const [n] = await sql<{ crc_liberar_webhooks_presos: number }>(
      `select public.crc_liberar_webhooks_presos(5)`,
    );
    expect(Number(n?.crc_liberar_webhooks_presos)).toBe(1);

    const [linha] = await sql<{ status: string }>(`select status from public.crc_webhook_inbox`);
    expect(linha?.status).toBe("FALHOU");
  });

  it("a limpeza de retenção só apaga PROCESSADO antigo", async () => {
    await inserir("wamid.VELHA");
    await sql(`
      update public.crc_webhook_inbox
         set status = 'PROCESSADO', processado_em = now() - interval '60 days'
    `);
    await inserir("wamid.RECENTE");

    const [n] = await sql<{ crc_limpar_webhooks_antigos: number }>(
      `select public.crc_limpar_webhooks_antigos(30)`,
    );
    expect(Number(n?.crc_limpar_webhooks_antigos)).toBe(1);

    // A falha recente continua lá: ela ainda tem trabalho a fazer.
    const restantes = await sql<{ external_id: string }>(
      `select external_id from public.crc_webhook_inbox`,
    );
    expect(restantes.map((r) => r.external_id)).toEqual(["wamid.RECENTE"]);
  });
});

/* ========================================================================== */
/* 3. Carga                                                                   */
/* ========================================================================== */

describe("sob carga", () => {
  it("cem eventos viram cem jobs, e cada worker pega um lote disjunto", async () => {
    const valores = Array.from(
      { length: 100 },
      (_, i) => `('${ORG_A}', '${CONVERSA}', 'PENDENTE', 'turno:carga-${String(i)}')`,
    ).join(",");

    await sql(`
      insert into public.crc_agent_jobs (organization_id, conversation_id, status, chave_dedupe)
      values ${valores}
    `);

    // Dez workers, lote de cinco. Cabem cinquenta; os outros cinquenta esperam a
    // próxima rodada do cron, que é exatamente o desenho.
    const lotes = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        sql<{ id: string }>(
          `select id from public.crc_reservar_agent_jobs(5, 180, 'w-${String(i)}')`,
        ),
      ),
    );

    const todos = lotes.flat().map((j) => j.id);
    expect(todos).toHaveLength(50);
    // Nenhum job em dois lotes: é o `SKIP LOCKED` fazendo o trabalho dele.
    expect(new Set(todos).size).toBe(50);
  });

  it("cinquenta reservas de orçamento não passam do teto por um centavo", async () => {
    const teto = 10_000_000; // R$ 10,00
    const cada = 1_000_000; // R$ 1,00

    await Promise.all(
      Array.from({ length: 50 }, () =>
        sql(`
          select reservou from public.crc_reservar_orcamento(
            '${ORG_A}'::uuid, '2026-09-11'::date, ${String(cada)}::bigint,
            ${String(teto)}::bigint, 0::bigint
          )
        `).catch(() => []),
      ),
    );

    const [balde] = await sql<{ micro_reais: number }>(
      `select micro_reais from public.crc_ai_gastos where organization_id = '${ORG_A}'`,
    );

    /*
     * `toBeLessThanOrEqual`, e não `toBe`. A promessa do teto é "não passa", e
     * não "chega exatamente". Escrever `toBe(10)` transformaria uma reserva
     * perdida por timeout de conexão em falha de teste — ruído, não sinal.
     *
     * O que seria falha de verdade: qualquer número ACIMA de 10.
     */
    expect(Number(balde?.micro_reais)).toBeLessThanOrEqual(teto);
    expect(Number(balde?.micro_reais)).toBeGreaterThan(teto / 2);
  });

  it("mil mensagens na mesma conversa não derrubam a leitura do contexto", async () => {
    const valores = Array.from(
      { length: 1000 },
      (_, i) =>
        `('${ORG_A}', '${CONVERSA}', '${i % 2 === 0 ? "ENTRADA" : "SAIDA"}', '${i % 2 === 0 ? "paciente" : "ia"}', 'mensagem ${String(i)}', 'carga:${String(i)}')`,
    ).join(",");

    await sql(`
      insert into public.crc_messages
        (organization_id, conversation_id, direcao, remetente, conteudo, chave_dedupe)
      values ${valores}
    `);

    const comecou = performance.now();
    const ultimas = await sql(`
      select conteudo from public.crc_messages
       where organization_id = '${ORG_A}' and conversation_id = '${CONVERSA}'
       order by criado_em desc
       limit 20
    `);
    const levou = performance.now() - comecou;

    expect(ultimas).toHaveLength(20);
    /*
     * O NÚMERO É FROUXO DE PROPÓSITO. Isto não é benchmark: é uma rede contra
     * varredura sequencial. Se alguém remover o índice de `conversation_id`,
     * uma conversa longa passa de milissegundos para segundos — e dois segundos
     * dentro de um turno serverless é o turno inteiro estourando o tempo.
     */
    expect(levou).toBeLessThan(2000);
  });
});
