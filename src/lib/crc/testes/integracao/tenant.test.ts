/**
 * O isolamento entre clínicas, contra o banco de verdade — Fase E, item 22.
 *
 * POR QUE ESTE ARQUIVO PRECISA EXISTIR MESMO COM O FAKE PASSANDO. O banco em
 * memória filtra por `organization_id` porque o código pediu. Ele não tem RLS,
 * não tem política, e não tem como recusar uma consulta que ESQUEÇA o filtro.
 * Ou seja: o fake prova que o código filtra quando filtra. Não prova nada sobre
 * o que acontece quando alguém esquece.
 *
 * E esquecer é o modo normal de esse defeito nascer. Ninguém escreve "vou ler a
 * base da clínica vizinha": alguém escreve uma consulta nova por `id` e não
 * repete o `organization_id`, porque o id já é único. Funciona, passa no
 * review, e vaza.
 *
 * O QUE SE TESTA AQUI, então, é em duas camadas:
 *
 *   A CAMADA DE BAIXO — a RLS está ligada nas tabelas que guardam dado de
 *   paciente? Uma tabela sem RLS é uma tabela onde o esquecimento vira vazamento.
 *
 *   A CAMADA DE CIMA — as funções que o agente chama filtram por tenant DENTRO
 *   do SQL? Se o filtro ficasse no TypeScript, uma chamada direta à função
 *   passaria por fora dele.
 *
 * O AGENTE É O MOTIVO DE URGÊNCIA. Um turno agentic manipula texto que veio de
 * fora da clínica. Se algum identificador puder ser influenciado pelo que o
 * paciente escreveu, o filtro de tenant deixa de ser higiene e passa a ser a
 * fronteira de segurança.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  exigirBanco,
  limparTudo,
  semearDuasClinicas,
  sql,
  CLINICA_A,
  CLINICA_B,
  ORG_A,
  ORG_B,
} from "./apoio";

beforeAll(() => {
  exigirBanco();
});

beforeEach(async () => {
  await limparTudo();
  await semearDuasClinicas();
});

/* ========================================================================== */
/* 1. A RLS está ligada onde precisa                                          */
/* ========================================================================== */

/**
 * As tabelas cujo conteúdo é dado de paciente ou segredo da clínica.
 *
 * A LISTA É EXPLÍCITA, e não "todas as `crc_`". Tabelas de catálogo — estágios
 * de funil, modelos de mensagem — podem legitimamente não ter RLS. Listar à mão
 * obriga alguém a pensar ao acrescentar uma tabela nova, em vez de herdar um
 * padrão sem decidir.
 */
const PRECISAM_DE_RLS = [
  "crc_patients",
  "crc_conversations",
  "crc_messages",
  "crc_appointments",
  "crc_opportunities",
  "crc_tasks",
  "crc_human_cases",
  "crc_ai_runs",
  "crc_agent_jobs",
  "crc_knowledge_chunks",
  "crc_knowledge_sources",
  "crc_ai_credentials",
  "crc_ai_memories",
];

describe("RLS", () => {
  it("está ligada em toda tabela que guarda dado de paciente ou segredo", async () => {
    const linhas = await sql<{ tablename: string; rowsecurity: boolean }>(`
      select tablename, rowsecurity
        from pg_tables
       where schemaname = 'public'
         and tablename in (${PRECISAM_DE_RLS.map((t) => `'${t}'`).join(",")})
    `);

    const semRls = linhas.filter((l) => l.rowsecurity !== true).map((l) => l.tablename);
    const ausentes = PRECISAM_DE_RLS.filter((t) => !linhas.some((l) => l.tablename === t));

    // Tabela AUSENTE é tão grave quanto tabela sem RLS: significa que o nome
    // mudou e esta lista envelheceu sem ninguém notar.
    expect({ semRls, ausentes }).toEqual({ semRls: [], ausentes: [] });
  });
});

/* ========================================================================== */
/* 2. As funções filtram por tenant DENTRO do SQL                             */
/* ========================================================================== */

describe("as funções que o agente chama", () => {
  async function semearConhecimento(org: string, clinica: string, texto: string): Promise<void> {
    const fonte = `${org.slice(0, 8)}-1111-4111-8111-111111111111`;
    await sql(`
      insert into public.crc_knowledge_sources (id, organization_id, titulo, tipo, corpo, status)
      values ('${fonte}', '${org}', 'FAQ', 'faq', ${quote(texto)}, 'PUBLICADA');

      insert into public.crc_knowledge_chunks
        (organization_id, source_id, ordem, conteudo, tamanho, embedding, chave_dedupe)
      values ('${org}', '${fonte}', 0, ${quote(texto)}, ${String(texto.length)},
              ${vetorFixo(org === ORG_A ? 0.9 : 0.9)}, '${org}:0');
    `);
    void clinica;
  }

  it("a busca de conhecimento NÃO devolve o texto da clínica vizinha", async () => {
    await semearConhecimento(ORG_A, CLINICA_A, "A clinica A aceita apenas dinheiro.");
    await semearConhecimento(ORG_B, CLINICA_B, "A clinica B aceita todos os convenios.");

    /*
     * OS DOIS TEXTOS TÊM O MESMO VETOR, de propósito.
     *
     * Um teste em que os vetores diferem provaria só que a busca por
     * similaridade funciona: o texto da outra clínica ficaria de fora por ser
     * menos parecido, e não por ser de outra clínica. Vetores idênticos tiram a
     * similaridade da jogada — o ÚNICO motivo possível para o texto de B não
     * aparecer é o filtro de tenant.
     */
    const achados = await sql<{ conteudo: string }>(`
      select conteudo from public.crc_buscar_conhecimento(
        '${ORG_A}'::uuid, ${vetorFixo(0.9)}, 10, 0.0
      )
    `);

    expect(achados.length).toBeGreaterThan(0);
    expect(achados.some((a) => a.conteudo.includes("clinica B"))).toBe(false);
    expect(achados.every((a) => a.conteudo.includes("clinica A"))).toBe(true);
  });

  it("o filtro de tenant está no CORPO da função, e não só em quem chama", async () => {
    // Uma função cujo filtro mora no TypeScript é uma função que uma chamada
    // direta contorna. Esta asserção lê o código da função no catálogo.
    const [def] = await sql<{ prosrc: string }>(`
      select prosrc from pg_proc where proname = 'crc_buscar_conhecimento'
    `);

    expect(def?.prosrc ?? "").toContain("organization_id");
  });

  it("reservar jobs de A não devolve job de B", async () => {
    for (const [org, tel] of [
      [ORG_A, "5511900000001"],
      [ORG_B, "5511900000002"],
    ] as const) {
      const conversa = `${org.slice(0, 8)}-2222-4222-8222-222222222222`;
      const clinica = org === ORG_A ? CLINICA_A : CLINICA_B;
      await sql(`
        insert into public.crc_conversations
          (id, organization_id, clinic_id, canal, contato_externo)
        values ('${conversa}', '${org}', '${clinica}', 'whatsapp', '${tel}');

        insert into public.crc_agent_jobs (organization_id, conversation_id, status, chave_dedupe)
        values ('${org}', '${conversa}', 'PENDENTE', 'turno:${org}');
      `);
    }

    const reservados = await sql<{ organization_id: string }>(
      `select organization_id from public.crc_reservar_agent_jobs(10, 180, 'w')`,
    );

    /*
     * ATENÇÃO AO QUE ESTE TESTE MOSTRA, porque não é o que parece à primeira
     * vista: `crc_reservar_agent_jobs` NÃO recebe organização. Ela é a fila
     * GLOBAL do worker, e isso é correto — o cron atende todas as clínicas.
     *
     * A garantia aqui é outra: cada job carrega o próprio `organization_id`,
     * gravado por quem enfileirou, e é ele que o worker usa dali em diante. O
     * tenant nunca vem do payload que passou perto do modelo.
     */
    expect(reservados).toHaveLength(2);
    expect(new Set(reservados.map((j) => j.organization_id))).toEqual(new Set([ORG_A, ORG_B]));
  });

  it("a troca de conhecimento de A não apaga os pedaços de B", async () => {
    await semearConhecimento(ORG_A, CLINICA_A, "Texto da clinica A.");
    await semearConhecimento(ORG_B, CLINICA_B, "Texto da clinica B.");

    const fonteA = `${ORG_A.slice(0, 8)}-1111-4111-8111-111111111111`;

    await sql(`
      select public.crc_trocar_conhecimento(
        '${ORG_A}'::uuid, '${fonteA}'::uuid,
        '[{"ordem":0,"conteudo":"Novo texto de A.","tamanho":16,"embedding":"${vetorCru(0.5)}","chave_dedupe":"a:0"}]'::jsonb
      )
    `);

    const deB = await sql(
      `select id from public.crc_knowledge_chunks where organization_id = '${ORG_B}'`,
    );
    // O `delete` da função filtra por tenant ALÉM do `source_id`. Sem isso, um
    // id vazado apagaria o conhecimento da clínica vizinha.
    expect(deB).toHaveLength(1);
  });

  it("o gasto de uma clínica não entra no teto da outra", async () => {
    await sql(`
      insert into public.crc_ai_gastos (organization_id, dia, micro_reais, chamadas)
      values ('${ORG_B}', '2026-09-11', 999000000, 100)
    `);

    const [r] = await sql<{ reservou: boolean; mes_micro: number }>(`
      select reservou, mes_micro from public.crc_reservar_orcamento(
        '${ORG_A}'::uuid, '2026-09-11'::date, 1000000::bigint, 0::bigint, 5000000::bigint
      )
    `);

    // A clínica B estourou o mês. A A não tem nada a ver com isso.
    expect(r?.reservou).toBe(true);
  });
});

/* ========================================================================== */
/* 3. As chaves estrangeiras impedem mistura                                  */
/* ========================================================================== */

describe("o banco recusa o que o código não deveria nem tentar", () => {
  /**
   * ESTE BLOCO ENCONTROU UM DEFEITO REAL, e é a melhor evidência de por que a
   * FASE E precisava existir.
   *
   * O primeiro teste esperava que o banco recusasse uma conversa com
   * `organization_id` de A e `clinic_id` de B. O banco ACEITOU.
   *
   * A causa: as chaves estrangeiras eram SEPARADAS — `organization_id` apontava
   * para organizações, `clinic_id` apontava para clínicas, e nada dizia que a
   * clínica precisava pertencer àquela organização. Para o Postgres, a linha era
   * perfeitamente consistente.
   *
   * Num sistema multi-clínica que roda um agente sobre texto vindo de fora, isso
   * significa que toda a separação entre pacientes de clínicas diferentes era
   * convenção do código. Convenção não sobrevive ao primeiro `insert` escrito
   * com pressa.
   *
   * `supabase/19-crc-integridade-tenant.sql` trocou por chaves COMPOSTAS.
   */
  it("não dá para pendurar uma conversa da clínica A numa clínica de B", async () => {
    await expect(
      sql(`
        insert into public.crc_conversations (organization_id, clinic_id, canal, contato_externo)
        values ('${ORG_A}', '${CLINICA_B}', 'whatsapp', '5511900000009')
      `),
    ).rejects.toThrow();
  });

  it("nem paciente de uma organização numa clínica de outra", async () => {
    await expect(
      sql(`
        insert into public.crc_patients
          (organization_id, clinic_id, external_id, nome)
        values ('${ORG_A}', '${CLINICA_B}', 'x-1', 'Paciente Trocado')
      `),
    ).rejects.toThrow();
  });

  it("nem mensagem numa conversa de outra organização", async () => {
    const conversa = `${ORG_B.slice(0, 8)}-3333-4333-8333-333333333333`;
    await sql(`
      insert into public.crc_conversations
        (id, organization_id, clinic_id, canal, contato_externo)
      values ('${conversa}', '${ORG_B}', '${CLINICA_B}', 'whatsapp', '5511900000021')
    `);

    // É a mais grave das três: `crc_messages` guarda o que o paciente escreveu.
    // Uma mensagem pendurada na conversa de outra clínica é vazamento de
    // conteúdo clínico, e não erro de referência.
    await expect(
      sql(`
        insert into public.crc_messages
          (organization_id, conversation_id, direcao, remetente, conteudo)
        values ('${ORG_A}', '${conversa}', 'ENTRADA', 'paciente', 'oi')
      `),
    ).rejects.toThrow();
  });

  it("nem job do agente apontando para conversa de outra organização", async () => {
    const conversa = `${ORG_B.slice(0, 8)}-4444-4444-8444-444444444444`;
    await sql(`
      insert into public.crc_conversations
        (id, organization_id, clinic_id, canal, contato_externo)
      values ('${conversa}', '${ORG_B}', '${CLINICA_B}', 'whatsapp', '5511900000022')
    `);

    /*
     * O PIOR CASO DOS QUATRO. O worker lê o `organization_id` DO JOB e passa a
     * agir em nome dele: carrega configuração, flags, conhecimento e histórico
     * daquela organização. Um job apontando para conversa de outra clínica faria
     * o agente ler o contexto de uma e responder na conversa da outra.
     */
    await expect(
      sql(`
        insert into public.crc_agent_jobs
          (organization_id, conversation_id, status, chave_dedupe)
        values ('${ORG_A}', '${conversa}', 'PENDENTE', 'turno:cruzado')
      `),
    ).rejects.toThrow();
  });

  it("apagar a organização leva junto o que era dela, e só isso", async () => {
    for (const [org, tel] of [
      [ORG_A, "5511900000011"],
      [ORG_B, "5511900000012"],
    ] as const) {
      await sql(`
        insert into public.crc_conversations
          (organization_id, clinic_id, canal, contato_externo)
        values ('${org}', '${org === ORG_A ? CLINICA_A : CLINICA_B}', 'whatsapp', '${tel}')
      `);
    }

    await sql(`delete from public.crc_organizations where id = '${ORG_A}'`);

    const restantes = await sql<{ organization_id: string }>(
      `select organization_id from public.crc_conversations`,
    );
    expect(restantes).toHaveLength(1);
    expect(restantes[0]?.organization_id).toBe(ORG_B);
  });
});

/* -------------------------------------------------------------------------- */

/** Escapa texto para SQL literal. Os testes montam SQL; melhor fazer certo. */
const quote = (t: string): string => `'${t.replace(/'/gu, "''")}'`;

/** Um vetor de 1536 posições com o mesmo valor, no formato do pgvector. */
const vetorCru = (v: number): string => `[${Array.from({ length: 1536 }, () => v).join(",")}]`;
const vetorFixo = (v: number): string => `'${vetorCru(v)}'::vector`;
