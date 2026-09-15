import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CLINICA_A, exigirBanco, limparTudo, ORG_A, semearDuasClinicas, sql } from "./apoio";

const PACIENTE_A = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1";
const PACIENTE_B = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const CONVERSA = "c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2";
const LEAD = "1eade000-0000-4000-8000-000000000001";
const ETAPA = "57a9e000-0000-4000-8000-000000000001";
const OPORTUNIDADE = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";

beforeAll(() => {
  exigirBanco();
});

beforeEach(async () => {
  await limparTudo();
  await semearDuasClinicas();
});

describe("fechamento da integração Meta", () => {
  it("o banco remove appSecret e verifyToken do JSONB antes de persistir", async () => {
    await sql(`
      insert into public.crc_canais_meta
        (organization_id, clinic_id, page_id, produtos, config)
      values
        ('${ORG_A}', '${CLINICA_A}', 'page-segredo', array['messenger'],
         '{"appSecret":"nao-pode-ficar","verifyToken":"nem-este","humanAgentAprovado":true}'::jsonb)
    `);

    const linhas = await sql<{
      tem_app_secret: string;
      tem_verify: string;
      human_agent: string;
    }>(`
      select
        (config ? 'appSecret')::text as tem_app_secret,
        (config ? 'verifyToken')::text as tem_verify,
        (config->>'humanAgentAprovado') as human_agent
      from public.crc_canais_meta
      where organization_id = '${ORG_A}'
    `);

    expect(linhas[0]).toEqual({
      tem_app_secret: "false",
      tem_verify: "false",
      human_agent: "true",
    });
  });

  it("a exclusão automática apaga somente o vínculo social inequívoco", async () => {
    const ator = "ig-delete-123";

    await sql(`
      insert into public.crc_patients
        (id, organization_id, clinic_id, nome, external_source, external_id)
      values
        ('${PACIENTE_A}', '${ORG_A}', '${CLINICA_A}', 'Paciente Social', 'dental_office', 'do-delete-1');

      insert into public.crc_patient_identities
        (organization_id, patient_id, tipo, namespace, valor)
      values
        ('${ORG_A}', '${PACIENTE_A}', 'EXTERNAL_ID', 'instagram', '${ator}');

      insert into public.crc_conversations
        (id, organization_id, clinic_id, patient_id, canal, contato_externo)
      values
        ('${CONVERSA}', '${ORG_A}', '${CLINICA_A}', '${PACIENTE_A}', 'instagram', '${ator}');

      insert into public.crc_social_events
        (organization_id, clinic_id, canal, event_type, external_event_id,
         external_actor_id, patient_id, ocorrido_em)
      values
        ('${ORG_A}', '${CLINICA_A}', 'instagram', 'comment.created', 'evt-delete-1',
         '${ator}', '${PACIENTE_A}', now());

      insert into public.crc_private_replies
        (organization_id, clinic_id, external_actor_id, chave_reserva)
      values
        ('${ORG_A}', '${CLINICA_A}', '${ator}', 'regra:${ator}:midia:janela');

      insert into public.crc_leads
        (id, organization_id, clinic_id, patient_id, nome, origem, meta_lead_id)
      values
        ('${LEAD}', '${ORG_A}', '${CLINICA_A}', '${PACIENTE_A}', 'Paciente Social', 'META', 'lead-delete-1');

      select public.crc_meta_registrar_exclusao(
        'confirmation-delete-1234567890', '${ator}'
      );
      select public.crc_meta_processar_exclusao('confirmation-delete-1234567890');
    `);

    const linhas = await sql<{
      status: string;
      identidades: string;
      conversas: string;
      eventos: string;
      replies: string;
      leads: string;
    }>(`
      select
        (select status from public.crc_meta_data_deletion_requests
          where confirmation_code = 'confirmation-delete-1234567890') as status,
        (select count(*)::text from public.crc_patient_identities
          where organization_id = '${ORG_A}' and valor = '${ator}') as identidades,
        (select count(*)::text from public.crc_conversations
          where organization_id = '${ORG_A}' and contato_externo = '${ator}') as conversas,
        (select count(*)::text from public.crc_social_events
          where organization_id = '${ORG_A}' and external_actor_id = '${ator}') as eventos,
        (select count(*)::text from public.crc_private_replies
          where organization_id = '${ORG_A}' and external_actor_id = '${ator}') as replies,
        (select count(*)::text from public.crc_leads
          where organization_id = '${ORG_A}' and meta_lead_id = 'lead-delete-1') as leads
    `);

    expect(linhas[0]).toEqual({
      status: "CONCLUIDO",
      identidades: "0",
      conversas: "0",
      eventos: "0",
      replies: "0",
      leads: "0",
    });
  });

  it("identificador ambíguo vira REVISÃO e não apaga ninguém", async () => {
    const ator = "social-ambiguo-99";

    await sql(`
      insert into public.crc_patients
        (id, organization_id, clinic_id, nome, external_source, external_id) values
        ('${PACIENTE_A}', '${ORG_A}', '${CLINICA_A}', 'Pessoa A', 'dental_office', 'amb-a'),
        ('${PACIENTE_B}', '${ORG_A}', '${CLINICA_A}', 'Pessoa B', 'dental_office', 'amb-b');

      insert into public.crc_patient_identities
        (organization_id, patient_id, tipo, namespace, valor) values
        ('${ORG_A}', '${PACIENTE_A}', 'EXTERNAL_ID', 'instagram', '${ator}'),
        ('${ORG_A}', '${PACIENTE_B}', 'EXTERNAL_ID', 'messenger', '${ator}');

      select public.crc_meta_registrar_exclusao(
        'confirmation-ambiguo-123456789', '${ator}'
      );
      select public.crc_meta_processar_exclusao('confirmation-ambiguo-123456789');
    `);

    const linhas = await sql<{ status: string; identidades: string }>(`
      select
        (select status from public.crc_meta_data_deletion_requests
          where confirmation_code = 'confirmation-ambiguo-123456789') as status,
        (select count(*)::text from public.crc_patient_identities
          where organization_id = '${ORG_A}' and valor = '${ator}') as identidades
    `);

    expect(linhas[0]).toEqual({ status: "REVISAO", identidades: "2" });
  });

  it("a analítica devolve aquisição, conversa, conversão, gasto e receita do mesmo canal", async () => {
    await sql(`
      insert into public.crc_leads
        (id, organization_id, clinic_id, nome, origem, meta_lead_id,
         campaign_nome, externo_criado_em, primeira_resposta_em)
      values
        ('${LEAD}', '${ORG_A}', '${CLINICA_A}', 'Lead Meta', 'META', 'lead-analytics-1',
         'Implante Setembro', now() - interval '10 minutes', now() - interval '8 minutes');

      insert into public.crc_conversations
        (id, organization_id, clinic_id, canal, contato_externo, ultima_mensagem_em)
      values
        ('${CONVERSA}', '${ORG_A}', '${CLINICA_A}', 'instagram', 'igsid-analytics', now());

      insert into public.crc_messages
        (organization_id, conversation_id, direcao, remetente, conteudo, status_entrega)
      values
        ('${ORG_A}', '${CONVERSA}', 'ENTRADA', 'paciente', 'oi', 'DELIVERED'),
        ('${ORG_A}', '${CONVERSA}', 'SAIDA', 'atendente', 'olá', 'SENT');

      insert into public.crc_opportunity_stages
        (id, organization_id, chave, nome, categoria)
      values
        ('${ETAPA}', '${ORG_A}', 'GANHA_TESTE', 'Ganha', 'GANHA');

      insert into public.crc_opportunities
        (id, organization_id, clinic_id, lead_id, tipo, stage_id, potential_value)
      values
        ('${OPORTUNIDADE}', '${ORG_A}', '${CLINICA_A}', '${LEAD}', 'NEW_LEAD', '${ETAPA}', 9000);

      insert into public.crc_revenue_events
        (organization_id, clinic_id, opportunity_id, natureza, valor, motivo)
      values
        ('${ORG_A}', '${CLINICA_A}', '${OPORTUNIDADE}', 'CONFIRMADA', 5000, 'tratamento fechado');

      insert into public.crc_ad_spend
        (organization_id, mes, campanha, valor, canal)
      values
        ('${ORG_A}', date_trunc('month', current_date)::date, 'Implante Setembro', 1000, 'META');
    `);

    const linhas = await sql<{
      leads: string;
      conversas: string;
      entradas: string;
      ganhas: string;
      gasto: string;
      receita: string;
      resposta: string;
    }>(`
      with p as (
        select public.crc_meta_analytics(
          '${ORG_A}', array['${CLINICA_A}']::uuid[], 30
        ) as j
      )
      select
        (select x->>'leads' from p, jsonb_array_elements(j->'leads') x
          where x->>'canal' = 'meta') as leads,
        (select x->>'conversas' from p, jsonb_array_elements(j->'conversas') x
          where x->>'canal' = 'instagram') as conversas,
        (select x->>'entradas' from p, jsonb_array_elements(j->'conversas') x
          where x->>'canal' = 'instagram') as entradas,
        (select x->>'ganhas' from p, jsonb_array_elements(j->'oportunidades') x
          where x->>'canal' = 'meta') as ganhas,
        (select x->>'valor' from p, jsonb_array_elements(j->'gasto') x
          where x->>'canal' = 'meta') as gasto,
        (select x->>'receitaConfirmada' from p, jsonb_array_elements(j->'oportunidades') x
          where x->>'canal' = 'meta') as receita,
        (select x->>'primeiraRespostaSegundos' from p, jsonb_array_elements(j->'leads') x
          where x->>'canal' = 'meta') as resposta
    `);

    expect(linhas[0]?.leads).toBe("1");
    expect(linhas[0]?.conversas).toBe("1");
    expect(linhas[0]?.entradas).toBe("1");
    expect(linhas[0]?.ganhas).toBe("1");
    expect(Number(linhas[0]?.gasto)).toBe(1000);
    expect(Number(linhas[0]?.receita)).toBe(5000);
    expect(Number(linhas[0]?.resposta)).toBe(120);
  });
});
