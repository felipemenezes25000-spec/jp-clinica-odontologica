/**
 * As garantias que só o Postgres pode dar — Fase E, item 20.
 *
 * ESTE ARQUIVO É A RESPOSTA A UMA FRASE QUE APARECE EM TODAS AS FASES
 * ANTERIORES: "o fake reproduz os índices, mas reproduzir uma constraint é
 * diferente de executá-la". Aqui ela é executada.
 *
 * O que cada teste ataca:
 *
 *   TETO DE GASTO      vinte chamadas simultâneas contra um teto que cabe cinco.
 *                      No desenho antigo — ler, comparar, chamar, somar — as
 *                      vinte liam o mesmo zero e as vinte passavam.
 *
 *   RESERVA DE JOB     dez workers disputando os mesmos cinco jobs. Sem
 *                      `FOR UPDATE SKIP LOCKED`, o mesmo paciente é respondido
 *                      várias vezes e o modelo é pago várias vezes.
 *
 *   MENSAGEM ÚNICA     o retry da Fase B só é seguro porque o índice único
 *                      recusa a segunda gravação. Aqui ele recusa de verdade.
 *
 *   PUBLICAÇÃO         se a segunda etapa falha, a primeira TEM que voltar. É
 *                      rollback, e rollback não existe fora de uma transação.
 *
 * A CONCORRÊNCIA AQUI É REAL: cada `fetch` do PostgREST abre a própria conexão,
 * e o Postgres resolve a disputa. Não é `Promise.all` sobre um objeto em
 * memória, que é o máximo que o fake conseguia encenar.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { exigirBanco, limparTudo, semearDuasClinicas, sql, CLINICA_A, ORG_A } from "./apoio";

const AGORA = new Date("2026-09-11T14:00:00.000Z");
const DIA = "2026-09-11";

/** Micro-reais, como o resto do sistema. R$ 1,00 = 1.000.000. */
const reais = (n: number): number => Math.round(n * 1_000_000);

beforeAll(() => {
  exigirBanco();
});

beforeEach(async () => {
  await limparTudo();
  await semearDuasClinicas();
});

/* ========================================================================== */
/* 1. O teto de gasto sob concorrência                                        */
/* ========================================================================== */

describe("crc_reservar_orcamento", () => {
  async function reservar(micro: number, tetoDia: number): Promise<boolean> {
    const linhas = await sql<{ reservou: boolean }>(`
      select reservou from public.crc_reservar_orcamento(
        '${ORG_A}'::uuid, '${DIA}'::date, ${String(micro)}::bigint,
        ${String(tetoDia)}::bigint, 0::bigint
      )
    `);
    return linhas[0]?.reservou === true;
  }

  it("vinte chamadas simultâneas num teto que cabe cinco: passam CINCO", async () => {
    const teto = reais(5);
    const cada = reais(1);

    /*
     * ISTO É O TESTE QUE A FASE D NÃO PODIA ESCREVER.
     *
     * Vinte `fetch` disparados juntos viram vinte conexões no Postgres, e o
     * `for update` da função decide a ordem. No desenho anterior — ler, avaliar,
     * chamar, somar — as vinte leriam zero, as vinte achariam que cabia, e a
     * clínica pagaria R$ 20 num teto de R$ 5.
     */
    const resultados = await Promise.all(Array.from({ length: 20 }, () => reservar(cada, teto)));

    const passaram = resultados.filter(Boolean).length;
    expect(passaram).toBe(5);

    // E o contador bate exatamente com quem passou. Um a mais significaria
    // reserva perdida; um a menos, cobrança fantasma.
    const [balde] = await sql<{ micro_reais: number }>(
      `select micro_reais from public.crc_ai_gastos where organization_id = '${ORG_A}' and dia = '${DIA}'`,
    );
    expect(Number(balde?.micro_reais)).toBe(reais(5));
  });

  it("o teto do mês também segura sob concorrência", async () => {
    await sql(`
      insert into public.crc_ai_gastos (organization_id, dia, micro_reais, chamadas)
      values ('${ORG_A}', '2026-09-01', ${String(reais(9))}, 10)
    `);

    const resultados = await Promise.all(
      Array.from({ length: 10 }, () =>
        sql<{ reservou: boolean }>(`
          select reservou from public.crc_reservar_orcamento(
            '${ORG_A}'::uuid, '${DIA}'::date, ${String(reais(0.5))}::bigint,
            0::bigint, ${String(reais(10))}::bigint
          )
        `).then((l) => l[0]?.reservou === true),
      ),
    );

    // Sobrou R$ 1,00 no mês; R$ 0,50 por chamada. Duas cabem, oito não.
    expect(resultados.filter(Boolean).length).toBe(2);
  });

  it("teto zero significa SEM TETO, e não bloqueio total", async () => {
    const resultados = await Promise.all(Array.from({ length: 5 }, () => reservar(reais(1000), 0)));
    expect(resultados.every(Boolean)).toBe(true);
  });
});

/* ========================================================================== */
/* 2. A reserva de jobs                                                       */
/* ========================================================================== */

describe("crc_reservar_agent_jobs", () => {
  async function semearJobs(quantos: number): Promise<void> {
    const conversas = Array.from(
      { length: quantos },
      (_, i) =>
        `('${uuidSeq(i, "c")}', '${ORG_A}', '${CLINICA_A}', 'whatsapp', '551199999${String(i).padStart(4, "0")}')`,
    ).join(",");

    await sql(`
      insert into public.crc_conversations (id, organization_id, clinic_id, canal, contato_externo)
      values ${conversas};

      insert into public.crc_agent_jobs (organization_id, conversation_id, status, chave_dedupe)
      select '${ORG_A}', id, 'PENDENTE', 'turno:' || id
        from public.crc_conversations where organization_id = '${ORG_A}';
    `);
  }

  it("dez workers, cinco jobs: cada job vai para UM worker só", async () => {
    await semearJobs(5);

    /*
     * SEM `SKIP LOCKED`, dez workers pegariam os mesmos cinco jobs — e o mesmo
     * paciente receberia até dez respostas, com dez chamadas de modelo pagas.
     *
     * O fake sempre passou neste teste, e sempre passou por um motivo que não é
     * o motivo real: JavaScript não tem duas coisas acontecendo ao mesmo tempo.
     */
    const lotes = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        sql<{ id: string }>(
          `select id from public.crc_reservar_agent_jobs(5, 180, 'worker-${String(i)}')`,
        ),
      ),
    );

    const ids = lotes.flat().map((j) => j.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it("job com lease vencido é retomado — crash é recuperável", async () => {
    await semearJobs(1);

    // O worker pegou e morreu: RODANDO, com o prazo já no passado.
    await sql(`
      update public.crc_agent_jobs
         set status = 'RODANDO', travado_ate = now() - interval '1 minute',
             travado_por = 'worker-que-morreu', tentativas = 1
       where organization_id = '${ORG_A}'
    `);

    const retomados = await sql<{ id: string }>(
      `select id from public.crc_reservar_agent_jobs(5, 180, 'worker-novo')`,
    );

    // Este é o defeito que o teste da Fase B encontrou: a reserva só olhava
    // PENDENTE/REPETIR, e um job travado nunca mais era pego. O paciente ficava
    // sem resposta para sempre, sem registro nenhum.
    expect(retomados).toHaveLength(1);
  });

  it("job com lease VÁLIDO não é roubado de quem está trabalhando", async () => {
    await semearJobs(1);
    await sql(`
      update public.crc_agent_jobs
         set status = 'RODANDO', travado_ate = now() + interval '10 minutes',
             travado_por = 'worker-ocupado', tentativas = 1
       where organization_id = '${ORG_A}'
    `);

    const roubados = await sql(
      `select id from public.crc_reservar_agent_jobs(5, 180, 'worker-intrometido')`,
    );
    expect(roubados).toHaveLength(0);
  });

  it("a reserva não atravessa organizações", async () => {
    await semearJobs(3);
    const reservados = await sql<{ organization_id: string }>(
      `select organization_id from public.crc_reservar_agent_jobs(10, 180, 'w')`,
    );
    expect(reservados.every((j) => j.organization_id === ORG_A)).toBe(true);
  });

  /* ------------------------------------------------------------------------ */

  /**
   * O RETRY NÃO PODE TER MEIO-CAMINHO — `supabase/25`.
   *
   * `falharJob` gravava o desfecho em duas instruções: a RPC cercada mudava o
   * status para REPETIR, e um `update` separado escrevia o backoff. Entre as
   * duas, a linha fica assim no banco:
   *
   *     status = 'REPETIR'   disponivel_em = <valor antigo, no passado>
   *     travado_ate = null
   *
   * que é EXATAMENTE o que `crc_reservar_agent_jobs` procura.
   *
   * ESTE TESTE SÓ É POSSÍVEL AQUI. No banco em memória não existe "entre as
   * duas instruções": JavaScript roda uma coisa por vez, e o estado intermediário
   * nunca é observável. É a diferença entre reproduzir uma constraint e executá-la.
   */
  describe("o encerramento com backoff é uma instrução só", () => {
    async function jobRodandoComToken(): Promise<{ id: string; token: string }> {
      await semearJobs(1);
      const [linha] = await sql<{ id: string; lease_token: string }>(
        `select id, lease_token from public.crc_reservar_agent_jobs(1, 180, 'worker-A')`,
      );
      if (linha === undefined) throw new Error("a reserva não devolveu job");
      return { id: linha.id, token: linha.lease_token };
    }

    it("o job encerrado com backoff NÃO é reservável no instante seguinte", async () => {
      const job = await jobRodandoComToken();

      // Falha com retry, backoff de dois minutos, tudo numa chamada.
      const [r] = await sql<{ crc_encerrar_agent_job: boolean }>(`
        select public.crc_encerrar_agent_job(
          '${job.id}'::uuid, '${job.token}'::uuid, 'REPETIR',
          'o provedor caiu', null, now() + interval '2 minutes'
        )
      `);
      expect(r?.crc_encerrar_agent_job).toBe(true);

      /*
       * A RESERVA IMEDIATAMENTE DEPOIS. Com a gravação em dois passos, este
       * `select` — rodando no lugar do segundo worker — encontraria o job.
       */
      const roubados = await sql(
        `select id from public.crc_reservar_agent_jobs(5, 180, 'worker-B')`,
      );
      expect(roubados).toHaveLength(0);

      const [depois] = await sql<{ status: string; futuro: boolean }>(
        `select status, disponivel_em > now() as futuro
           from public.crc_agent_jobs where id = '${job.id}'`,
      );
      expect(depois?.status).toBe("REPETIR");
      expect(depois?.futuro).toBe(true);
    });

    it("SEM o backoff junto, o job volta a ser reservável na hora", async () => {
      /*
       * A INJEÇÃO DE DEFEITO, ESCRITA COMO TESTE. Chamar a mesma função sem
       * `p_disponivel_em` é literalmente o primeiro dos dois passos antigos — e
       * o resultado mostra a janela existindo: o worker B pega o job que acabou
       * de falhar, antes de qualquer backoff ser escrito.
       *
       * Ele documenta o defeito em vez de descrevê-lo, e quebraria se alguém
       * "consertasse" a função fazendo o backoff sempre, o que também estaria
       * errado: a conclusão não pode mexer no `disponivel_em`.
       */
      const job = await jobRodandoComToken();

      await sql(`
        select public.crc_encerrar_agent_job(
          '${job.id}'::uuid, '${job.token}'::uuid, 'REPETIR', 'caiu', null, null
        )
      `);

      const pegos = await sql(`select id from public.crc_reservar_agent_jobs(5, 180, 'worker-B')`);
      expect(pegos).toHaveLength(1);
    });

    it("quem perdeu a posse não escreve, nem com o backoff certo", async () => {
      const job = await jobRodandoComToken();

      const [r] = await sql<{ crc_encerrar_agent_job: boolean }>(`
        select public.crc_encerrar_agent_job(
          '${job.id}'::uuid, gen_random_uuid(), 'CONCLUIDO', null, 10, null
        )
      `);
      expect(r?.crc_encerrar_agent_job).toBe(false);

      const [depois] = await sql<{ status: string }>(
        `select status from public.crc_agent_jobs where id = '${job.id}'`,
      );
      expect(depois?.status).toBe("RODANDO");
    });
  });
});

/* ========================================================================== */
/* 3. O índice único que sustenta o retry                                     */
/* ========================================================================== */

describe("a mensagem não sai duas vezes", () => {
  it("dez gravações simultâneas da mesma chave: UMA linha", async () => {
    const conversa = uuidSeq(0, "m");
    await sql(`
      insert into public.crc_conversations
        (id, organization_id, clinic_id, canal, contato_externo)
      values ('${conversa}', '${ORG_A}', '${CLINICA_A}', 'whatsapp', '5511988887777')
    `);

    /*
     * TODA A SEGURANÇA DO RETRY DA FASE B DEPENDE DISTO.
     *
     * O worker pode rodar o mesmo turno duas vezes — está escrito em
     * `ENTREGA_AO_MENOS_UMA_VEZ` que pode. O que impede a mensagem de sair
     * duas vezes não é cuidado do código: é este índice.
     */
    const tentativas = await Promise.all(
      Array.from({ length: 10 }, () =>
        sql(`
          insert into public.crc_messages
            (organization_id, conversation_id, direcao, remetente, conteudo, chave_dedupe)
          values ('${ORG_A}', '${conversa}', 'SAIDA', 'ia', 'Oi!', 'agente:evento-1')
          on conflict do nothing
          returning id
        `).catch(() => []),
      ),
    );
    void tentativas;

    const linhas = await sql(
      `select id from public.crc_messages where organization_id = '${ORG_A}'`,
    );
    expect(linhas).toHaveLength(1);
  });

  it("chaves diferentes continuam gravando normalmente", async () => {
    const conversa = uuidSeq(1, "m");
    await sql(`
      insert into public.crc_conversations
        (id, organization_id, clinic_id, canal, contato_externo)
      values ('${conversa}', '${ORG_A}', '${CLINICA_A}', 'whatsapp', '5511988886666')
    `);

    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        sql(`
          insert into public.crc_messages
            (organization_id, conversation_id, direcao, remetente, conteudo, chave_dedupe)
          values ('${ORG_A}', '${conversa}', 'SAIDA', 'ia', 'Oi ${String(i)}', 'agente:evento-${String(i)}')
        `),
      ),
    );

    expect(
      await sql(`select id from public.crc_messages where organization_id = '${ORG_A}'`),
    ).toHaveLength(5);
  });
});

/* ========================================================================== */
/* 4. O rollback                                                              */
/* ========================================================================== */

describe("crc_publicar_versao_agente", () => {
  async function semearVersoes(): Promise<{ publicada: string; rascunho: string }> {
    const publicada = uuidSeq(0, "v");
    const rascunho = uuidSeq(1, "v");
    await sql(`
      insert into public.crc_agent_versions (id, organization_id, versao, instrucoes, status)
      values ('${publicada}', '${ORG_A}', 1, 'texto antigo', 'PUBLICADA'),
             ('${rascunho}', '${ORG_A}', 2, 'texto novo', 'RASCUNHO')
    `);
    return { publicada, rascunho };
  }

  it("publica e arquiva numa transação só", async () => {
    const { publicada, rascunho } = await semearVersoes();

    await sql(
      `select public.crc_publicar_versao_agente('${ORG_A}'::uuid, '${rascunho}'::uuid, null, null)`,
    );

    const linhas = await sql<{ id: string; status: string }>(
      `select id, status from public.crc_agent_versions where organization_id = '${ORG_A}'`,
    );
    expect(linhas.find((v) => v.id === rascunho)?.status).toBe("PUBLICADA");
    expect(linhas.find((v) => v.id === publicada)?.status).toBe("ARQUIVADA");
  });

  it("quando o rascunho sumiu, o ARQUIVAMENTO VOLTA ATRÁS", async () => {
    const { publicada } = await semearVersoes();
    const inexistente = uuidSeq(9, "v");

    /*
     * O TESTE MAIS IMPORTANTE DESTE ARQUIVO, e o único impossível de encenar no
     * fake.
     *
     * A função arquiva a publicada e SÓ DEPOIS tenta publicar o rascunho. Se a
     * segunda etapa não encontra nada, ela levanta exceção — e a primeira tem
     * que ser desfeita.
     *
     * Sem rollback, o resultado seria uma clínica SEM versão publicada. E
     * `turno.ts` não quebra nesse estado: ele cai no texto que vem no código,
     * em silêncio. O agente passa a falar com outra personalidade e ninguém é
     * avisado.
     */
    await expect(
      sql(
        `select public.crc_publicar_versao_agente('${ORG_A}'::uuid, '${inexistente}'::uuid, null, null)`,
      ),
    ).rejects.toThrow();

    const [antiga] = await sql<{ status: string }>(
      `select status from public.crc_agent_versions where id = '${publicada}'`,
    );
    expect(antiga?.status).toBe("PUBLICADA");
  });

  it("duas abas publicando o MESMO rascunho: uma vence, a outra é recusada", async () => {
    const { publicada, rascunho } = await semearVersoes();

    /*
     * O SCHEMA SÓ PERMITE UM RASCUNHO POR ORGANIZAÇÃO — descobri isso aqui, com
     * `uq_crc_agent_versions_rascunho` recusando o segundo insert. A primeira
     * versão deste teste criava dois rascunhos, o que nunca poderia acontecer.
     *
     * A corrida REAL, então, é outra e é mais comum: duas abas do Estúdio
     * abertas, as duas mandando publicar o mesmo rascunho.
     */
    const [x, y] = await Promise.all([
      sql(
        `select public.crc_publicar_versao_agente('${ORG_A}'::uuid, '${rascunho}'::uuid, null, null)`,
      ).then(
        () => "ok",
        () => "recusada",
      ),
      sql(
        `select public.crc_publicar_versao_agente('${ORG_A}'::uuid, '${rascunho}'::uuid, null, null)`,
      ).then(
        () => "ok",
        () => "recusada",
      ),
    ]);

    // Uma passa, a outra encontra o rascunho já publicado e é recusada com nome.
    expect([x, y].sort()).toEqual(["ok", "recusada"]);

    const publicadas = await sql<{ id: string }>(
      `select id from public.crc_agent_versions
        where organization_id = '${ORG_A}' and status = 'PUBLICADA'`,
    );
    // Uma, exatamente. Duas violariam o índice parcial; zero deixaria o agente
    // sem texto — e o `turno.ts` cairia no texto do código, em silêncio.
    expect(publicadas).toHaveLength(1);
    expect(publicadas[0]?.id).toBe(rascunho);
    void publicada;
  });
});

/**
 * uuid v4 determinístico e legível.
 *
 * A PRIMEIRA VERSÃO MONTAVA OS BLOCOS POR CONCATENAÇÃO e produzia coisas como
 * `6300063000-63000-4000-...` — com o número errado de dígitos em cada bloco. O
 * Postgres recusou na hora, com `invalid input syntax for type uuid`.
 *
 * Contar os dígitos à mão é justamente o tipo de coisa que se erra; montar uma
 * string longa e FATIAR nos comprimentos certos não tem como dar outro tamanho.
 */
function uuidSeq(i: number, prefixo: string): string {
  const semente = `${prefixo}${String(i).padStart(4, "0")}`;
  const hex = [...semente]
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
    .padEnd(32, "0")
    .slice(0, 32);

  // 8-4-4-4-12, com a versão 4 e a variante 8 nos lugares que a spec exige.
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}
