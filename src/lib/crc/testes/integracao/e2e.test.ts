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
