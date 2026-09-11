-- ============================================================================
-- CRC AI OS — Fase E: o banco passa a recusar mistura de clínicas
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
--
-- ESTE ARQUIVO NASCEU DE UM TESTE DE INTEGRAÇÃO QUE FALHOU AO CONTRÁRIO.
--
-- O teste dizia: "não dá para pendurar uma conversa da clínica A numa clínica de
-- B". Ele esperava que o INSERT fosse recusado. O banco aceitou.
--
-- A CAUSA. Cada tabela tem duas chaves estrangeiras SEPARADAS:
--
--     organization_id  →  crc_organizations(id)
--     clinic_id        →  crc_clinics(id)
--
-- As duas são válidas isoladamente. Nenhuma das duas diz que a clínica precisa
-- PERTENCER àquela organização. Uma linha com `organization_id` da clínica A e
-- `clinic_id` da clínica B é, para o Postgres, perfeitamente consistente.
--
-- POR QUE ISSO IMPORTA MAIS AQUI DO QUE NA MAIORIA DOS SISTEMAS. O CRC é
-- multi-clínica e roda um agente que manipula texto vindo de fora. Toda a
-- separação entre pacientes de clínicas diferentes depende de o
-- `organization_id` estar certo em cada linha. Enquanto o banco não recusa a
-- combinação errada, essa separação é uma convenção do código — e convenção não
-- sobrevive ao primeiro `insert` escrito com pressa.
--
-- A SOLUÇÃO É UMA CHAVE ESTRANGEIRA COMPOSTA, e ela exige, antes, uma chave
-- única composta no lado pai. `(id)` já é primary key; `(organization_id, id)`
-- é redundante do ponto de vista de unicidade e é exatamente o que permite ao
-- filho referenciar o PAR.
--
-- O QUE ISTO NÃO FAZ: substituir RLS. RLS decide quem PODE LER; isto decide o
-- que PODE EXISTIR. São camadas diferentes, e um sistema multi-tenant sério
-- precisa das duas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O lado pai ganha a chave composta
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.crc_clinics'::regclass
       and conname = 'uq_crc_clinics_org_id'
  ) then
    alter table public.crc_clinics
      add constraint uq_crc_clinics_org_id unique (organization_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.crc_patients'::regclass
       and conname = 'uq_crc_patients_org_id'
  ) then
    alter table public.crc_patients
      add constraint uq_crc_patients_org_id unique (organization_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.crc_conversations'::regclass
       and conname = 'uq_crc_conversations_org_id'
  ) then
    alter table public.crc_conversations
      add constraint uq_crc_conversations_org_id unique (organization_id, id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. A limpeza ANTES da trava
-- ----------------------------------------------------------------------------
--
-- UMA CONSTRAINT NÃO PODE SER ADICIONADA SOBRE DADO QUE JÁ A VIOLA, e este
-- banco rodou meses sem ela. Se existir uma linha inconsistente, o `alter table`
-- falha — e falhar é o comportamento certo: significa que houve mistura de
-- verdade, e alguém precisa olhar antes de qualquer coisa ser apagada.
--
-- Este bloco NÃO CORRIGE NADA. Ele só levanta a mão com a lista, porque
-- "corrigir" aqui significaria escolher, sem contexto, se a conversa é da
-- clínica A ou da B — e essa escolha, num sistema de prontuário, não é do
-- script de migração.
do $$
declare
  bagunca integer;
begin
  select count(*) into bagunca
    from public.crc_conversations c
    join public.crc_clinics k on k.id = c.clinic_id
   where k.organization_id <> c.organization_id;

  if bagunca > 0 then
    raise exception
      'Existem % conversas cuja clínica é de outra organização. Investigue ANTES de aplicar esta migração: select c.id from crc_conversations c join crc_clinics k on k.id = c.clinic_id where k.organization_id <> c.organization_id;',
      bagunca;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. As chaves compostas nos filhos
-- ----------------------------------------------------------------------------
--
-- A ORDEM DAS COLUNAS na FK espelha a da unique do pai. Trocar a ordem cria uma
-- constraint que o Postgres aceita e que não usa o índice — e a diferença só
-- aparece quando a tabela fica grande.

-- Conversa ↔ clínica
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.crc_conversations'::regclass
       and conname = 'fk_crc_conversations_clinica_da_org'
  ) then
    alter table public.crc_conversations
      add constraint fk_crc_conversations_clinica_da_org
      foreign key (organization_id, clinic_id)
      references public.crc_clinics (organization_id, id)
      on delete cascade;
  end if;
end $$;

-- Paciente ↔ clínica
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.crc_patients'::regclass
       and conname = 'fk_crc_patients_clinica_da_org'
  ) then
    alter table public.crc_patients
      add constraint fk_crc_patients_clinica_da_org
      foreign key (organization_id, clinic_id)
      references public.crc_clinics (organization_id, id)
      on delete cascade;
  end if;
end $$;

-- Mensagem ↔ conversa. É a mais importante das três: `crc_messages` guarda o que
-- o paciente escreveu, e uma mensagem pendurada na conversa de outra clínica é
-- vazamento de conteúdo clínico, não erro de referência.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.crc_messages'::regclass
       and conname = 'fk_crc_messages_conversa_da_org'
  ) then
    alter table public.crc_messages
      add constraint fk_crc_messages_conversa_da_org
      foreign key (organization_id, conversation_id)
      references public.crc_conversations (organization_id, id)
      on delete cascade;
  end if;
end $$;

-- Job do agente ↔ conversa. O worker lê o `organization_id` DO JOB e passa a
-- agir em nome dele. Um job apontando para conversa de outra organização faria
-- o agente ler o histórico de uma clínica e responder na conversa de outra.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.crc_agent_jobs'::regclass
       and conname = 'fk_crc_agent_jobs_conversa_da_org'
  ) then
    alter table public.crc_agent_jobs
      add constraint fk_crc_agent_jobs_conversa_da_org
      foreign key (organization_id, conversation_id)
      references public.crc_conversations (organization_id, id)
      on delete cascade;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. RLS nas tabelas que ainda não tinham
-- ----------------------------------------------------------------------------
--
-- `crc_ai_credentials` guarda segredo de provedor cifrado; `crc_ai_memories`
-- guarda o que a IA aprendeu sobre cada paciente. As duas estavam sem RLS.
--
-- O ACESSO DO APP NÃO MUDA: ele usa a `service_role`, que ignora RLS. O que
-- muda é o que acontece quando alguém — um script, um painel, uma chave anon
-- vazada — chega pela porta lateral. Sem RLS, a porta lateral é a porta.
alter table public.crc_ai_credentials enable row level security;
alter table public.crc_ai_memories enable row level security;
