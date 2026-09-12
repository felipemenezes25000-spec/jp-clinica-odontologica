-- ============================================================================
-- CRC — a ligação, a identidade e a linha do tempo única.  (FASE D)
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
-- ============================================================================
--
--  O PROBLEMA QUE ESTA MIGRATION ATACA é o mais antigo de qualquer clínica: a
--  mesma pessoa conversa por WhatsApp, liga, manda e-mail e fala no balcão — e
--  cada canal guarda um pedaço. Quem atende a ligação não sabe o que foi dito
--  no WhatsApp ontem, e o paciente repete tudo de novo.
--
--  A promessa do §21 é uma linha do tempo só. Para isso faltavam duas coisas:
--  um lugar para a LIGAÇÃO existir, e uma forma de saber que aquele telefone é
--  a mesma pessoa do e-mail.
--
-- ============================================================================
--  E A VOZ FICA `BLOCKED_EXTERNAL`, sem fingir o contrário.
--
--  O §22 pede um recepcionista de voz. Não há provedor contratado, e o §131
--  proíbe marcar como pronto o que depende de integração que não existe.
--
--  O que esta migration entrega é o LUGAR: a tabela de chamadas, com transcrição,
--  resumo, intenção e desfecho, agnóstica de provedor. Uma ligação registrada à
--  mão pela recepção usa as mesmas colunas que uma ligação atendida por robô no
--  dia em que existir robô — e a linha do tempo já mostra as duas hoje.
--
--  A diferença entre isto e um placeholder: a tabela é ESCRITA HOJE, pelo
--  registro manual. Ela não espera integração para ter uso.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. As chamadas
-- ----------------------------------------------------------------------------
create table if not exists public.crc_calls (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete set null,
  lead_id         uuid references public.crc_leads(id) on delete set null,
  -- A conversa de WhatsApp da mesma pessoa, quando existe. É o que costura os
  -- dois canais na mesma linha do tempo.
  conversation_id uuid references public.crc_conversations(id) on delete set null,

  -- ENTRADA | SAIDA
  direcao         text not null,
  -- 'manual' enquanto não houver provedor de voz. Depois: 'twilio', 'vonage'…
  provedor        text not null default 'manual',
  -- O id da chamada no provedor. Nulo no registro manual.
  external_id     text,

  telefone        text,

  iniciada_em     timestamptz not null default now(),
  duracao_s       integer,

  -- ATENDIDA | NAO_ATENDIDA | OCUPADO | CAIXA_POSTAL | FALHOU
  desfecho        text not null default 'ATENDIDA',

  /*
   * QUEM ATENDEU. `humano` é o caso de hoje; `ia` existe para o dia em que
   * houver provedor, e `misto` para a ligação que começou com robô e foi
   * transferida — que é o desenho realista de qualquer recepcionista de voz.
   */
  atendido_por    text not null default 'humano',
  user_id         uuid references public.crc_users(id) on delete set null,

  /* --------------------------------------------------- Call intelligence --- */

  /*
   * A TRANSCRIÇÃO É OPCIONAL E TEM RETENÇÃO.
   *
   * Gravar ligação de paciente é dado sensível: no Brasil exige aviso e base
   * legal, e a transcrição carrega conteúdo clínico que ninguém pediu para
   * guardar. A coluna existe porque sem ela não há inteligência de chamada — e
   * `transcricao_expira_em` existe porque guardar para sempre é o erro padrão.
   *
   * O §76 pede política de retenção; esta coluna é onde ela vive por linha, e a
   * faxina a usa.
   */
  transcricao     text,
  transcricao_expira_em timestamptz,

  -- O resumo sobrevive à transcrição. É o que a linha do tempo mostra depois de
  -- a transcrição ser podada.
  resumo          text,

  -- AGENDAR | REMARCAR | CANCELAR | DUVIDA | ORCAMENTO | RECLAMACAO |
  -- ADMINISTRATIVO | OUTRO
  intencao        text,
  -- 0..1
  confianca       numeric(4,3),

  /*
   * OPORTUNIDADE PERDIDA — a coluna que justifica a tabela inteira.
   *
   * Uma ligação em que a pessoa pediu horário e desligou sem marcar é dinheiro
   * saindo pela porta, e hoje ela não deixa rastro nenhum. Marcar isso permite
   * a pergunta do §24: "quantas ligações terminaram sem oferta de horário?".
   */
  oportunidade_perdida boolean not null default false,
  motivo_perda    text,

  -- 0..100, do modelo de `dominio/atendimento.ts`. Mede o ATENDIMENTO, e não a
  -- pessoa — ver o comentário lá.
  score_atendimento integer,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  chave_dedupe    text
);

create unique index if not exists crc_calls_dedupe
  on public.crc_calls (organization_id, chave_dedupe)
  where chave_dedupe is not null;

create index if not exists idx_crc_calls_paciente
  on public.crc_calls (patient_id, iniciada_em desc);

create index if not exists idx_crc_calls_periodo
  on public.crc_calls (organization_id, clinic_id, iniciada_em desc);

-- A faxina de transcrição: "quais já venceram".
create index if not exists idx_crc_calls_retencao
  on public.crc_calls (transcricao_expira_em)
  where transcricao is not null and transcricao_expira_em is not null;

-- ----------------------------------------------------------------------------
-- 2. Os contatos que não passam pelo sistema
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  A CONVERSA DE BALCÃO É O BURACO MAIOR DA LINHA DO TEMPO.
--
--  A pessoa vem à clínica, conversa sobre o tratamento na recepção, decide
--  pensar, e vai embora. Nada disso existe em lugar nenhum — e três dias depois
--  a automação manda "vamos retomar seu orçamento?" como se nunca tivessem
--  conversado.
--
--  Esta tabela é deliberadamente MAGRA: quem registra é uma pessoa com fila de
--  espera na frente, e um formulário de dez campos não é preenchido. Canal,
--  texto, e quem anotou.
-- ============================================================================
create table if not exists public.crc_contact_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid not null references public.crc_patients(id) on delete cascade,

  -- BALCAO | EMAIL | PRESENCIAL | OUTRO
  canal           text not null default 'BALCAO',
  texto           text not null,

  -- Quem anotou. Sem isto, "a clínica conversou" não tem dono.
  user_id         uuid references public.crc_users(id) on delete set null,

  ocorrido_em     timestamptz not null default now(),
  criado_em       timestamptz not null default now()
);

create index if not exists idx_crc_contact_log_paciente
  on public.crc_contact_log (patient_id, ocorrido_em desc);

-- ----------------------------------------------------------------------------
-- 3. A resolução de identidade
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  A REGRA DO §21, E ELA É INEGOCIÁVEL:
--
--      NUNCA FUNDIR SÓ POR NOME.
--
--  "Maria Silva" numa base de 8.000 pacientes são várias pessoas. Fundir por
--  nome junta prontuários de gente diferente — e o estrago é irreversível: não
--  há como saber depois qual histórico era de quem.
--
--  O que identifica é TELEFONE, E-MAIL e ID EXTERNO. Esta tabela guarda essas
--  chaves normalizadas, uma linha por chave, para o cruzamento ser um índice em
--  vez de uma varredura.
--
--  E `confianca` existe porque telefone de família é comum: mãe e filho
--  compartilham o número, e a resolução por telefone ali é AMBÍGUA. O sistema
--  marca e manda para revisão humana (o mesmo `revisao_pendente` que
--  `crc_conversations` já usa) em vez de escolher.
-- ============================================================================
create table if not exists public.crc_patient_identities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  patient_id      uuid not null references public.crc_patients(id) on delete cascade,

  -- TELEFONE | EMAIL | EXTERNAL_ID | DOCUMENTO
  tipo            text not null,
  /*
   * O VALOR NORMALIZADO, e é a normalização que faz a tabela funcionar:
   * telefone sem máscara e com DDI, e-mail em minúsculas. Guardar o valor cru
   * transformaria "(11) 99999-0000" e "5511999990000" em duas pessoas.
   */
  valor           text not null,

  /*
   * COMPARTILHADA: este identificador pertence a mais de uma pessoa.
   *
   * É o caso do telefone de família. Quando marcado, a resolução por ele NÃO
   * decide sozinha — devolve os candidatos e pede gente.
   */
  compartilhada   boolean not null default false,

  -- Confirmada por uma pessoa. Uma identidade confirmada vale mais que dez
  -- inferidas, e é o que permite desempatar.
  confirmada_em   timestamptz,
  confirmada_por  uuid references public.crc_users(id) on delete set null,

  criado_em       timestamptz not null default now(),

  -- Um valor por tipo por paciente. O mesmo telefone em dois pacientes é
  -- LEGÍTIMO (família), e por isso a chave inclui o paciente.
  unique (organization_id, patient_id, tipo, valor)
);

/*
 * O ÍNDICE DA BUSCA: dado um telefone, quem é?
 *
 * Não é único de propósito — ver o comentário acima. Dois pacientes com o mesmo
 * telefone é o caso da família, e a consulta devolve os dois.
 */
create index if not exists idx_crc_identities_busca
  on public.crc_patient_identities (organization_id, tipo, valor);

-- ----------------------------------------------------------------------------
-- 4. A linha do tempo única
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  ISTO PRECISA SER SQL, e a razão é a forma do dado.
--
--  A linha do tempo cruza CINCO tabelas com formatos diferentes: mensagem,
--  ligação, contato de balcão, consulta e orçamento. Do lado da aplicação
--  seriam cinco consultas, cinco mapeamentos e uma ordenação em memória — para
--  mostrar as últimas trinta linhas.
--
--  Com `union all` no banco, o Postgres ordena e corta antes de mandar. A
--  diferença aparece no paciente antigo, que tem 400 mensagens e 30 consultas:
--  a versão em memória traz as 430 para mostrar 30.
-- ============================================================================
create or replace function public.crc_linha_do_tempo(
  p_organization_id uuid,
  p_patient_id      uuid,
  p_limite          integer default 40
)
returns table (
  tipo        text,
  ocorrido_em timestamptz,
  titulo      text,
  detalhe     text,
  canal       text,
  referencia  uuid
)
language sql
stable
as $corpo$
  with tudo as (
    -- Mensagens de WhatsApp e afins.
    select
        'MENSAGEM'::text                                              as tipo,
        m.criado_em                                                   as ocorrido_em,
        (case when m.direcao = 'ENTRADA' then 'Recebida' else 'Enviada' end)::text as titulo,
        -- O TRECHO, e não a mensagem inteira: a linha do tempo é para ler
        -- rápido, e uma mensagem de 800 caracteres arrebenta a tela.
        left(m.conteudo, 180)                                         as detalhe,
        coalesce(c.canal, 'whatsapp')::text                           as canal,
        m.id                                                          as referencia
      from public.crc_messages m
      left join public.crc_conversations c on c.id = m.conversation_id
     where m.organization_id = p_organization_id
       and m.patient_id = p_patient_id
       -- NOTA INTERNA NÃO ENTRA. Ela é conversa da equipe sobre o paciente, e
       -- misturá-la com o que o paciente disse é o caminho mais curto para
       -- alguém ler em voz alta para a pessoa errada.
       and m.nota_interna = false

    union all

    select
        'LIGACAO'::text,
        l.iniciada_em,
        (case
           when l.direcao = 'ENTRADA' then 'Ligou para a clínica'
           else 'A clínica ligou'
         end)::text,
        coalesce(l.resumo, l.desfecho),
        'voz'::text,
        l.id
      from public.crc_calls l
     where l.organization_id = p_organization_id
       and l.patient_id = p_patient_id

    union all

    select
        'CONTATO'::text,
        k.ocorrido_em,
        'Conversa registrada'::text,
        left(k.texto, 180),
        lower(k.canal),
        k.id
      from public.crc_contact_log k
     where k.organization_id = p_organization_id
       and k.patient_id = p_patient_id

    union all

    select
        'CONSULTA'::text,
        a.inicio_em,
        a.status::text,
        coalesce(a.descricao, a.dentista_nome),
        'agenda'::text,
        a.id
      from public.crc_appointments a
     where a.organization_id = p_organization_id
       and a.patient_id = p_patient_id

    union all

    select
        'ORCAMENTO'::text,
        coalesce(b.emitido_em, b.criado_em),
        ('Orçamento ' || b.status)::text,
        to_char(b.total_value, 'FM999G999G999D00'),
        'financeiro'::text,
        b.id
      from public.crc_budgets b
     where b.organization_id = p_organization_id
       and b.patient_id = p_patient_id
  )
  select * from tudo
   order by ocorrido_em desc
   limit greatest(1, least(p_limite, 200));
$corpo$;

insert into public.crc_schema_migrations (nome, presumido)
values ('36-crc-omnichannel-e-voz.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();

-- ----------------------------------------------------------------------------
-- RLS e privilégios
-- ----------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array['crc_calls','crc_contact_log','crc_patient_identities']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $rls$;

-- `search_path` fixo desde o nascimento, pela regra do `supabase/35`.
alter function public.crc_linha_do_tempo(uuid, uuid, integer) set search_path = '';

do $privilegios$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant all on all functions in schema public to service_role';
  end if;
end $privilegios$;
