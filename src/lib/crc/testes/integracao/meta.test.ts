/**
 * A integração Meta contra Postgres de VERDADE — §53.
 *
 * ============================================================================
 *  O QUE SÓ AQUI PODE SER PROVADO.
 *
 *  `banco-memoria.ts` reproduz os índices únicos, e isso já pegou defeito de
 *  verdade. Mas reproduzir uma constraint é diferente de EXECUTÁ-LA — e a
 *  idempotência inteira desta integração é constraint de banco, não cuidado de
 *  código: nada em `receberMensagemDoCanal` compara ids.
 *
 *  As cinco coisas que o fake nunca vai poder provar:
 *
 *    1. O ÍNDICE ÚNICO EXISTE de fato, com as colunas que o código supõe.
 *    2. O ÍNDICE PARCIAL aplica a condição — `where page_id is not null`.
 *    3. A FK COMPOSTA impede canal de uma organização apontar para clínica de
 *       outra. O fake não tem chave estrangeira nenhuma.
 *    4. A CHAVE ANTIGA FOI REMOVIDA. A migração dropa uma constraint pelo nome
 *       gerado pelo Postgres, num `do $$` — e se esse bloco falhar em silêncio,
 *       o banco fica com DUAS chaves: a nova e a velha. A velha recusaria o
 *       IGSID `123` como duplicata do paciente `123` do Dental Office.
 *    5. A CONCORRÊNCIA REAL. JavaScript é uma thread só; nenhum teste do fake
 *       jamais provou — nem poderia — que dois processos tentando reservar o
 *       mesmo private reply produzem UM envio.
 * ============================================================================
 *
 * O CAMINHO É O DO `apoio.ts`: SQL cru pelo PostgREST, e não pelo adaptador.
 * Ver o cabeçalho dele para por que — e para o que isso NÃO prova.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  CLINICA_A,
  CLINICA_B,
  exigirBanco,
  limparTudo,
  ORG_A,
  ORG_B,
  semearDuasClinicas,
  sql,
} from "./apoio";

const PAGE_A = "104000000000001";
const IGID_A = "17841400000000099";

/** O valor que colide: existe no Dental Office E parece um IGSID curto. */
const COLIDENTE = "123";

const PACIENTE_A = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
const PACIENTE_B = "d1d1d1d1-d1d1-4d1d-8d1d-d1d1d1d1d1d1";

beforeAll(() => {
  exigirBanco();
});

beforeEach(async () => {
  await limparTudo();
  await semearDuasClinicas();
});

/* -------------------------------------------------------------------------- */
/* 1. O schema do supabase/45 está de pé                                      */
/* -------------------------------------------------------------------------- */

describe("as tabelas e colunas do supabase/45 existem", () => {
  it("as quatro tabelas novas nasceram", async () => {
    const linhas = await sql<{ tablename: string }>(`
      select tablename from pg_tables
       where schemaname = 'public'
         and tablename in ('crc_canais_meta','crc_social_events','crc_regras_sociais','crc_private_replies')
       order by tablename
    `);
    expect(linhas.map((l) => l.tablename)).toEqual([
      "crc_canais_meta",
      "crc_private_replies",
      "crc_regras_sociais",
      "crc_social_events",
    ]);
  });

  it("`crc_patient_identities` ganhou `namespace` NOT NULL", async () => {
    const linhas = await sql<{ is_nullable: string; column_default: string | null }>(`
      select is_nullable, column_default
        from information_schema.columns
       where table_name = 'crc_patient_identities' and column_name = 'namespace'
    `);
    expect(linhas).toHaveLength(1);
    /*
     * `NOT NULL` É O QUE FAZ O ÍNDICE SEMPRE VALER.
     *
     * Em Postgres, nulo não participa de índice único — uma coluna nulável
     * deixaria duas linhas idênticas conviverem sempre que o namespace fosse
     * nulo, que é exatamente a colisão que a migração veio matar.
     */
    expect(linhas[0]?.is_nullable).toBe("NO");
  });

  it("`crc_leads` ganhou a hierarquia de anúncio", async () => {
    const linhas = await sql<{ column_name: string }>(`
      select column_name from information_schema.columns
       where table_name = 'crc_leads'
         and column_name in ('meta_lead_id','form_id','ad_id','adset_id','campaign_id','campos','externo_criado_em','canal_conversao')
    `);
    expect(linhas).toHaveLength(8);
  });

  it("`crc_messages` ganhou `historico_importado` e `recebido_em` — §48, §49", async () => {
    const linhas = await sql<{ column_name: string }>(`
      select column_name from information_schema.columns
       where table_name = 'crc_messages'
         and column_name in ('historico_importado','recebido_em')
    `);
    expect(linhas).toHaveLength(2);
  });

  it("`crc_autonomia` ganhou `canal` — §27", async () => {
    const linhas = await sql<{ column_name: string }>(`
      select column_name from information_schema.columns
       where table_name = 'crc_autonomia' and column_name = 'canal'
    `);
    expect(linhas).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. A chave ANTIGA foi removida — o teste que o fake não faz                */
/* -------------------------------------------------------------------------- */

describe("a chave antiga de identidade NÃO sobreviveu à migração", () => {
  it("não há constraint única de quatro colunas sem `namespace`", async () => {
    /*
     * ==========================================================================
     *  ESTE É O TESTE MAIS IMPORTANTE DO ARQUIVO.
     *
     *  A migração dropa a constraint antiga por DESCOBERTA: um `do $$` que a
     *  encontra pelas COLUNAS, porque o nome dela foi gerado pelo Postgres.
     *
     *  Se esse bloco não achar nada — nome diferente, ordem de coluna
     *  diferente, migração rodada pela metade — o banco fica com DUAS chaves. E
     *  a velha recusa `EXTERNAL_ID / instagram / 123` como duplicata de
     *  `EXTERNAL_ID / dental-office / 123`, que é a colisão inteira de volta.
     *
     *  O fake não pode provar isto: ele não tem a constraint velha para
     *  sobreviver.
     * ==========================================================================
     */
    const linhas = await sql<{ conname: string }>(`
      select con.conname
        from pg_constraint con
        join pg_class cls on cls.oid = con.conrelid
       where cls.relname = 'crc_patient_identities'
         and con.contype = 'u'
         and not exists (
           select 1 from unnest(con.conkey) as k
             join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
            where att.attname = 'namespace'
         )
    `);
    expect(linhas).toEqual([]);
  });

  it("a chave nova, COM namespace, existe", async () => {
    const linhas = await sql<{ indexname: string }>(`
      select indexname from pg_indexes
       where tablename = 'crc_patient_identities'
         and indexdef ilike '%unique%'
         and indexdef ilike '%namespace%'
    `);
    expect(linhas.length).toBeGreaterThan(0);
  });

  it("o MESMO valor em namespaces diferentes CONVIVE no banco", async () => {
    await sql(`
      insert into public.crc_patients
        (id, organization_id, clinic_id, nome, external_source, external_id) values
        ('${PACIENTE_A}', '${ORG_A}', '${CLINICA_A}', 'Ana do Prontuario', 'dental_office', 'do-1'),
        ('${PACIENTE_B}', '${ORG_A}', '${CLINICA_A}', 'Carlos do Instagram', 'dental_office', 'do-2');

      insert into public.crc_patient_identities
        (organization_id, patient_id, tipo, namespace, valor) values
        ('${ORG_A}', '${PACIENTE_A}', 'EXTERNAL_ID', 'dental-office', '${COLIDENTE}'),
        ('${ORG_A}', '${PACIENTE_B}', 'EXTERNAL_ID', 'instagram', '${COLIDENTE}');
    `);

    const linhas = await sql<{ n: string }>(
      `select count(*)::text as n from public.crc_patient_identities where valor = '${COLIDENTE}'`,
    );
    expect(linhas[0]?.n).toBe("2");
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Os índices parciais aplicam a condição                                  */
/* -------------------------------------------------------------------------- */

describe("os índices de `crc_canais_meta` são parciais e aplicam a condição", () => {
  it("duas contas com o MESMO `page_id` são recusadas", async () => {
    await sql(`
      insert into public.crc_canais_meta (organization_id, clinic_id, page_id, produtos)
      values ('${ORG_A}', '${CLINICA_A}', '${PAGE_A}', array['messenger'])
    `);

    /*
     * DUAS LINHAS COM O MESMO `page_id` significaria um webhook com dois donos
     * possíveis — e a escolha voltaria a ser arbitrária, que é o defeito que o
     * `supabase/23` existiu para matar.
     */
    await expect(
      sql(`
        insert into public.crc_canais_meta (organization_id, clinic_id, page_id, produtos)
        values ('${ORG_B}', '${CLINICA_B}', '${PAGE_A}', array['messenger'])
      `),
    ).rejects.toThrow();
  });

  it("DUAS contas SEM `page_id` convivem — a condição do índice é aplicada", async () => {
    /*
     * ==========================================================================
     *  É AQUI QUE O `where ... is not null` PROVA SEU VALOR.
     *
     *  Uma clínica pode ter Instagram sem Página. Sem a condição, o índice
     *  existiria e — em Postgres, onde dois NULL não são iguais — não
     *  protegeria nada. Declarar a condição deixa isso explícito em vez de
     *  depender do comportamento.
     * ==========================================================================
     */
    await sql(`
      insert into public.crc_canais_meta (organization_id, clinic_id, instagram_account_id, produtos)
      values ('${ORG_A}', '${CLINICA_A}', '${IGID_A}', array['instagram']);

      insert into public.crc_canais_meta (organization_id, clinic_id, instagram_account_id, produtos)
      values ('${ORG_B}', '${CLINICA_B}', '${IGID_A}9', array['instagram']);
    `);

    const linhas = await sql<{ n: string }>(
      `select count(*)::text as n from public.crc_canais_meta where page_id is null`,
    );
    expect(linhas[0]?.n).toBe("2");
  });

  it("a FK COMPOSTA impede canal de uma organização apontar para clínica de outra", async () => {
    /*
     * A MESMA PROTEÇÃO DO `supabase/19`, e o fake não tem chave estrangeira
     * nenhuma: este teste só existe aqui.
     */
    await expect(
      sql(`
        insert into public.crc_canais_meta (organization_id, clinic_id, page_id, produtos)
        values ('${ORG_A}', '${CLINICA_B}', '${PAGE_A}', array['messenger'])
      `),
    ).rejects.toThrow();
  });
});

describe("`crc_leads.meta_lead_id` é único por organização", () => {
  it("o mesmo `leadgen_id` duas vezes é recusado", async () => {
    await sql(`
      insert into public.crc_leads (organization_id, clinic_id, nome, meta_lead_id)
      values ('${ORG_A}', '${CLINICA_A}', 'Lead 1', 'lead-777')
    `);

    await expect(
      sql(`
        insert into public.crc_leads (organization_id, clinic_id, nome, meta_lead_id)
        values ('${ORG_A}', '${CLINICA_A}', 'Lead 1 de novo', 'lead-777')
      `),
    ).rejects.toThrow();
  });

  it("o mesmo `leadgen_id` em OUTRA organização é aceito", async () => {
    /*
     * O ESCOPO INCLUI A ORGANIZAÇÃO de propósito: ids de provedor são únicos
     * globalmente, mas a fronteira de tenant não se apoia nessa promessa.
     */
    await sql(`
      insert into public.crc_leads (organization_id, clinic_id, nome, meta_lead_id) values
        ('${ORG_A}', '${CLINICA_A}', 'Lead A', 'lead-777'),
        ('${ORG_B}', '${CLINICA_B}', 'Lead B', 'lead-777')
    `);

    const linhas = await sql<{ n: string }>(
      `select count(*)::text as n from public.crc_leads where meta_lead_id = 'lead-777'`,
    );
    expect(linhas[0]?.n).toBe("2");
  });

  it("MUITOS leads SEM `meta_lead_id` convivem", async () => {
    // O índice é parcial: a imensa maioria dos leads não vem da Meta.
    await sql(`
      insert into public.crc_leads (organization_id, clinic_id, nome) values
        ('${ORG_A}', '${CLINICA_A}', 'Do site 1'),
        ('${ORG_A}', '${CLINICA_A}', 'Do site 2'),
        ('${ORG_A}', '${CLINICA_A}', 'Do site 3')
    `);

    const linhas = await sql<{ n: string }>(
      `select count(*)::text as n from public.crc_leads where meta_lead_id is null`,
    );
    expect(linhas[0]?.n).toBe("3");
  });
});

describe("`crc_social_events` deduplica por id do provedor", () => {
  it("o mesmo comentário duas vezes é recusado", async () => {
    await sql(`
      insert into public.crc_social_events
        (organization_id, clinic_id, canal, event_type, external_event_id, ocorrido_em)
      values ('${ORG_A}', '${CLINICA_A}', 'instagram', 'comment.created', 'comment-1', now())
    `);

    await expect(
      sql(`
        insert into public.crc_social_events
          (organization_id, clinic_id, canal, event_type, external_event_id, ocorrido_em)
        values ('${ORG_A}', '${CLINICA_A}', 'instagram', 'comment.created', 'comment-1', now())
      `),
    ).rejects.toThrow();
  });

  it("criar e APAGAR o mesmo comentário são dois eventos", async () => {
    /*
     * A chave do evento inclui o verbo (`comment-1` e `comment-1:removido`).
     * Sem isso, o apagamento seria descartado como duplicata da criação — e o
     * CRC continuaria achando que o comentário existe.
     */
    await sql(`
      insert into public.crc_social_events
        (organization_id, clinic_id, canal, event_type, external_event_id, ocorrido_em) values
        ('${ORG_A}', '${CLINICA_A}', 'instagram', 'comment.created', 'comment-1', now()),
        ('${ORG_A}', '${CLINICA_A}', 'instagram', 'comment.deleted', 'comment-1:removido', now())
    `);

    const linhas = await sql<{ n: string }>(
      `select count(*)::text as n from public.crc_social_events`,
    );
    expect(linhas[0]?.n).toBe("2");
  });
});

/* -------------------------------------------------------------------------- */
/* 4. A CONCORRÊNCIA REAL — o que o fake nunca pode provar                    */
/* -------------------------------------------------------------------------- */

describe("a reserva do private reply sob CONCORRÊNCIA — §17, §34", () => {
  it("vinte tentativas simultâneas produzem UMA reserva", async () => {
    /*
     * ==========================================================================
     *  JAVASCRIPT É UMA THREAD SÓ.
     *
     *  Nenhum teste do fake jamais provou — nem poderia — que dois processos
     *  tentando reservar o mesmo private reply produzem UM envio. Aqui as vinte
     *  chamadas vão juntas para o Postgres, e é ELE que decide.
     *
     *  É o cenário real: a Meta reentrega o mesmo comentário quando não recebe
     *  200 rápido, e duas execuções concorrentes avaliariam política e
     *  autonomia, passariam as duas, e mandariam as duas.
     * ==========================================================================
     */
    const chave = "regra-1:ator-1:midia-1:4321";

    const tentativas = Array.from({ length: 20 }, () =>
      sql(`
        insert into public.crc_private_replies
          (organization_id, clinic_id, chave_reserva, external_actor_id)
        values ('${ORG_A}', '${CLINICA_A}', '${chave}', 'ator-1')
      `).then(
        () => "ok" as const,
        () => "recusado" as const,
      ),
    );

    const resultados = await Promise.all(tentativas);

    expect(resultados.filter((r) => r === "ok")).toHaveLength(1);
    expect(resultados.filter((r) => r === "recusado")).toHaveLength(19);

    const linhas = await sql<{ n: string }>(
      `select count(*)::text as n from public.crc_private_replies where chave_reserva = '${chave}'`,
    );
    expect(linhas[0]?.n).toBe("1");
  });

  it("chaves de JANELAS diferentes convivem — o cooldown vira de balde", async () => {
    await sql(`
      insert into public.crc_private_replies
        (organization_id, clinic_id, chave_reserva, external_actor_id) values
        ('${ORG_A}', '${CLINICA_A}', 'regra-1:ator-1:midia-1:4321', 'ator-1'),
        ('${ORG_A}', '${CLINICA_A}', 'regra-1:ator-1:midia-1:4322', 'ator-1')
    `);

    const linhas = await sql<{ n: string }>(
      `select count(*)::text as n from public.crc_private_replies`,
    );
    expect(linhas[0]?.n).toBe("2");
  });

  it("dez webhooks iguais produzem UMA linha de inbox", async () => {
    /*
     * A MESMA PROVA, no envelope. `unique (provedor, external_id)` é o que
     * impede a reentrega da Meta virar dez mensagens na Inbox e dez respostas.
     */
    const tentativas = Array.from({ length: 10 }, () =>
      sql(`
        insert into public.crc_webhook_inbox (provedor, external_id, payload, organization_id)
        values ('meta', 'instagram.message.received:mid.1:1', '{}'::jsonb, '${ORG_A}')
      `).then(
        () => "ok" as const,
        () => "recusado" as const,
      ),
    );

    const resultados = await Promise.all(tentativas);
    expect(resultados.filter((r) => r === "ok")).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. O isolamento de tenant no banco                                         */
/* -------------------------------------------------------------------------- */

describe("o tenant é resolvido pela conta externa, e a FK o prende", () => {
  it("o roteamento por `page_id` devolve a organização certa", async () => {
    await sql(`
      insert into public.crc_canais_meta
        (organization_id, clinic_id, page_id, instagram_account_id, produtos) values
        ('${ORG_A}', '${CLINICA_A}', '${PAGE_A}', '${IGID_A}', array['instagram','messenger']),
        ('${ORG_B}', '${CLINICA_B}', '${PAGE_A}9', '${IGID_A}9', array['instagram'])
    `);

    const porPagina = await sql<{ organization_id: string }>(
      `select organization_id from public.crc_canais_meta where page_id = '${PAGE_A}' and ativo`,
    );
    expect(porPagina).toHaveLength(1);
    expect(porPagina[0]?.organization_id).toBe(ORG_A);

    const porInstagram = await sql<{ organization_id: string }>(
      `select organization_id from public.crc_canais_meta
        where instagram_account_id = '${IGID_A}9' and ativo`,
    );
    expect(porInstagram).toHaveLength(1);
    expect(porInstagram[0]?.organization_id).toBe(ORG_B);
  });

  it("a RLS está ligada nas tabelas novas", async () => {
    /*
     * `enable row level security` não faz nada sozinho — as políticas são
     * declaradas em outro lugar, e o service role as ignora. O que este teste
     * prova é que a tabela nasceu com a flag, que é a condição para qualquer
     * política futura valer.
     */
    const linhas = await sql<{ relname: string; relrowsecurity: boolean }>(`
      select cls.relname, cls.relrowsecurity
        from pg_class cls
        join pg_namespace ns on ns.oid = cls.relnamespace
       where ns.nspname = 'public'
         and cls.relname in ('crc_canais_meta','crc_social_events','crc_regras_sociais','crc_private_replies')
    `);

    expect(linhas).toHaveLength(4);
    expect(linhas.every((l) => l.relrowsecurity)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 6. A cadeia completa, em SQL                                               */
/* -------------------------------------------------------------------------- */

describe("comentário → lead → oportunidade → atribuição, com as FKs de pé", () => {
  it("a cadeia inteira grava e as chaves se ligam", async () => {
    const leadId = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
    const etapaId = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
    const opId = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2";

    await sql(`
      insert into public.crc_opportunity_stages (id, organization_id, chave, nome, ordem)
      values ('${etapaId}', '${ORG_A}', 'contato_pendente', 'Contato pendente', 2);

      insert into public.crc_leads
        (id, organization_id, clinic_id, nome, origem, utm_source, utm_medium, utm_content, campos)
      values ('${leadId}', '${ORG_A}', '${CLINICA_A}', '@joao_ig', 'INSTAGRAM',
              'instagram', 'comentario', 'media-1',
              '{"comentario":"quero implante","interesse":"IMPLANTE"}'::jsonb);

      insert into public.crc_opportunities
        (id, organization_id, clinic_id, lead_id, tipo, stage_id, origem, motivo, chave_dedupe)
      values ('${opId}', '${ORG_A}', '${CLINICA_A}', '${leadId}', 'NEW_LEAD', '${etapaId}',
              'instagram:comentario', 'Comentou no Instagram', 'NEW_LEAD:${leadId}');

      insert into public.crc_attribution_events
        (organization_id, clinic_id, opportunity_id, elo, canal, origem, confianca, chave_dedupe)
      values ('${ORG_A}', '${CLINICA_A}', '${opId}', 'ACAO', 'instagram', 'Implante Setembro',
              'CONFIRMADO', 'meta_lead:lead-777');

      insert into public.crc_social_events
        (organization_id, clinic_id, canal, event_type, external_event_id,
         external_media_id, lead_id, opportunity_id, ocorrido_em, processing_status)
      values ('${ORG_A}', '${CLINICA_A}', 'instagram', 'comment.created', 'comment-1',
              'media-1', '${leadId}', '${opId}', now(), 'PROCESSADO');
    `);

    const cadeia = await sql<{
      lead: string;
      oportunidade: string;
      canal: string;
      origem: string;
    }>(`
      select s.lead_id::text as lead,
             s.opportunity_id::text as oportunidade,
             a.canal,
             a.origem
        from public.crc_social_events s
        join public.crc_opportunities o on o.id = s.opportunity_id
        join public.crc_attribution_events a on a.opportunity_id = o.id
       where s.organization_id = '${ORG_A}'
    `);

    expect(cadeia).toHaveLength(1);
    expect(cadeia[0]?.lead).toBe(leadId);
    expect(cadeia[0]?.canal).toBe("instagram");
    expect(cadeia[0]?.origem).toBe("Implante Setembro");
  });

  it("a atribuição de conteúdo tem índice para a pergunta do §19", async () => {
    /*
     * "QUANTO ESTE POST RENDEU?" sem índice é uma varredura da tabela inteira —
     * e ela cresce com cada ação do CRC, para sempre.
     */
    const linhas = await sql<{ indexname: string }>(`
      select indexname from pg_indexes
       where tablename = 'crc_attribution_events'
         and indexdef ilike '%origem%'
    `);
    expect(linhas.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. A mesma fila                                                            */
/* -------------------------------------------------------------------------- */

describe("a Meta usa a MESMA fila do WhatsApp — §36", () => {
  it("`crc_reservar_webhooks` reserva envelope de `meta` junto com os outros", async () => {
    /*
     * ==========================================================================
     *  A FUNÇÃO NÃO FILTRA POR PROVEDOR, e é isso que faz a fila ser UMA.
     *
     *  Se ela filtrasse, a Meta precisaria de um segundo repescador — e com ele
     *  um segundo teto de tentativas, uma segunda dead letter e um segundo lugar
     *  na tela de saúde. Quatro coisas que envelhecem em paralelo, e a que
     *  envelhece primeiro é a que ninguém olha.
     * ==========================================================================
     */
    await sql(`
      insert into public.crc_webhook_inbox
        (provedor, external_id, payload, organization_id, clinic_id, status, disponivel_em) values
        ('meta', 'chave-meta', '{"eventos":[]}'::jsonb, '${ORG_A}', '${CLINICA_A}', 'PENDENTE', now()),
        ('meta_cloud', 'chave-zap', '{"mensagens":[]}'::jsonb, '${ORG_A}', '${CLINICA_A}', 'PENDENTE', now())
    `);

    const reservados = await sql<{ provedor: string }>(
      `select provedor from public.crc_reservar_webhooks(10, 120, 'teste', 5)`,
    );

    const provedores = reservados.map((r) => r.provedor).sort();
    expect(provedores).toEqual(["meta", "meta_cloud"]);
  });

  it("o mesmo `external_id` em provedores diferentes convive", async () => {
    // A chave é `(provedor, external_id)`: o id de um provedor não colide com o
    // de outro. É a mesma disciplina do namespace na identidade.
    await sql(`
      insert into public.crc_webhook_inbox (provedor, external_id, payload, organization_id) values
        ('meta', 'mid.1', '{}'::jsonb, '${ORG_A}'),
        ('meta_cloud', 'mid.1', '{}'::jsonb, '${ORG_A}')
    `);

    const linhas = await sql<{ n: string }>(
      `select count(*)::text as n from public.crc_webhook_inbox where external_id = 'mid.1'`,
    );
    expect(linhas[0]?.n).toBe("2");
  });
});

/* -------------------------------------------------------------------------- */
/* 8. A autonomia por canal                                                   */
/* -------------------------------------------------------------------------- */

describe("a autonomia por canal convive com a do domínio — §27", () => {
  it("domínio e canal são DUAS linhas, e não uma sobrescrevendo a outra", async () => {
    await sql(`
      insert into public.crc_autonomia (organization_id, clinic_id, dominio, canal, nivel) values
        ('${ORG_A}', null, 'mensagens', '', 4),
        ('${ORG_A}', null, 'mensagens', 'instagram', 2)
    `);

    const linhas = await sql<{ canal: string; nivel: number }>(
      `select canal, nivel from public.crc_autonomia
        where organization_id = '${ORG_A}' and dominio = 'mensagens' order by canal`,
    );

    expect(linhas).toHaveLength(2);
    expect(linhas[0]?.canal).toBe("");
    expect(linhas[0]?.nivel).toBe(4);
    expect(linhas[1]?.canal).toBe("instagram");
    expect(linhas[1]?.nivel).toBe(2);
  });

  it("a MESMA combinação duas vezes é recusada", async () => {
    await sql(`
      insert into public.crc_autonomia (organization_id, clinic_id, dominio, canal, nivel)
      values ('${ORG_A}', null, 'mensagens', 'instagram', 2)
    `);

    await expect(
      sql(`
        insert into public.crc_autonomia (organization_id, clinic_id, dominio, canal, nivel)
        values ('${ORG_A}', null, 'mensagens', 'instagram', 5)
      `),
    ).rejects.toThrow();
  });

  it("os índices ANTIGOS, sem canal, foram removidos", async () => {
    /*
     * Se eles sobrevivessem, gravar o teto do Instagram seria recusado como
     * duplicata do nível do domínio — e o §27 não funcionaria de jeito nenhum.
     */
    const linhas = await sql<{ indexname: string }>(`
      select indexname from pg_indexes
       where tablename = 'crc_autonomia'
         and indexname in ('crc_autonomia_por_clinica', 'crc_autonomia_padrao_da_org')
    `);
    expect(linhas).toEqual([]);
  });
});
