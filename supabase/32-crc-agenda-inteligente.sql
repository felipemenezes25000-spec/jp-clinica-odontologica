-- ============================================================================
-- CRC — a cadeira vazia, a lista de espera e o risco de falta.  (FASE B)
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
-- ============================================================================
--
--  O PROBLEMA QUE ESTA MIGRATION ATACA tem um número: uma cadeira parada uma
--  hora custa o que aquela hora produziria, e não volta. Um cancelamento às 9h
--  para as 14h do mesmo dia é cinco horas de antecedência — tempo de sobra para
--  alguém ocupar, e tempo nenhum se ninguém perceber.
--
--  Hoje o CRC percebe o cancelamento (o sync marca `status = 'CANCELLED'`) e
--  não faz nada com o buraco que ele abriu.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O buraco na agenda
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  POR QUE UMA TABELA, e não uma consulta que calcula os buracos na hora.
--
--  Porque o buraco tem CICLO DE VIDA. Ele é detectado, avaliado, alguém é
--  contatado, alguém responde, e ele fecha — ou expira. Nada disso cabe numa
--  consulta derivada: a segunda execução não saberia que já contatou três
--  pessoas pelo mesmo horário.
--
--  E é justamente o "já contatou" que precisa ser lembrado. O §15 proíbe
--  broadcast grande, e a razão é concreta: oferecer o mesmo horário para
--  quarenta pessoas produz uma pessoa agendada e trinta e nove que responderam
--  "pode ser!" e ouviram "desculpe, já foi preenchido". Isso não é eficiência —
--  é queimar a lista inteira para preencher uma hora.
-- ============================================================================
create table if not exists public.crc_schedule_gaps (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,

  -- O dentista é do CRC (`crc_dentists`), e não o `dentista_externo_id` cru:
  -- o buraco precisa saber especialidade para achar candidato compatível.
  dentist_id      uuid references public.crc_dentists(id) on delete set null,

  -- A consulta que abriu o buraco, quando houve uma. Nulo quando o buraco é
  -- estrutural — uma janela que nunca foi preenchida.
  appointment_id  uuid references public.crc_appointments(id) on delete set null,

  inicio_em       timestamptz not null,
  fim_em          timestamptz not null,
  -- Redundante com as duas de cima, e guardada mesmo assim: é por ela que se
  -- filtra ("buracos de pelo menos 40 min"), e calcular na consulta impediria
  -- o índice de ajudar.
  duracao_min     integer not null,

  /*
   * O QUE CABE AQUI DENTRO.
   *
   * Uma janela de 30 minutos não serve para implante, e uma de duas horas
   * gasta com limpeza. Guardar a lista de procedimentos compatíveis é o que
   * permite achar candidato sem reabrir a tabela de duração a cada busca.
   */
  procedimentos   jsonb not null default '[]'::jsonb,

  -- Quanto esta hora produziria. Estimativa, e a coluna diz isso no nome do
  -- conceito: é `estimado`, nunca `confirmado`.
  valor_estimado  numeric(12,2),

  -- ABERTO | OFERECENDO | PREENCHIDO | EXPIRADO | DESCARTADO
  status          text not null default 'ABERTO',

  /*
   * QUANTAS PESSOAS JÁ FORAM CHAMADAS PARA ESTE BURACO.
   *
   * É o contador que faz o §15 valer. O motor oferece em lotes pequenos e
   * consulta este número antes de abrir o próximo — sem ele, cada execução do
   * pulso recomeçaria a contagem do zero e o "lote pequeno" viraria broadcast
   * parcelado.
   */
  oferecidos      integer not null default 0,
  -- Quando a última leva saiu. Serve para esperar antes da próxima.
  ofertado_em     timestamptz,

  preenchido_em   timestamptz,
  -- Qual consulta ocupou o buraco. Fecha a cadeia para a atribuição de valor.
  preenchido_por  uuid references public.crc_appointments(id) on delete set null,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  /*
   * UM BURACO POR JANELA, POR DENTISTA.
   *
   * A varredura roda várias vezes por dia sobre a mesma agenda. Sem a chave, a
   * terça-feira das 14h teria um buraco por execução — e o contador de
   * `oferecidos` se dividiria entre eles, desarmando a proteção contra
   * broadcast exatamente como se ela não existisse.
   */
  chave_dedupe    text not null,

  constraint crc_gaps_janela_valida check (fim_em > inicio_em)
);

create unique index if not exists crc_schedule_gaps_dedupe
  on public.crc_schedule_gaps (organization_id, chave_dedupe);

-- A pergunta do motor: "quais buracos desta clínica ainda dá para preencher?"
create index if not exists idx_crc_gaps_abertos
  on public.crc_schedule_gaps (organization_id, clinic_id, inicio_em)
  where status in ('ABERTO', 'OFERECENDO');

-- A varredura de expiração: buraco cuja hora passou e ninguém fechou.
create index if not exists idx_crc_gaps_vencem
  on public.crc_schedule_gaps (inicio_em)
  where status in ('ABERTO', 'OFERECENDO');

-- ----------------------------------------------------------------------------
-- 2. A quem oferecer, e o que já foi oferecido
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  SEM ESTA TABELA, O CONTADOR `oferecidos` MENTE.
--
--  Ele diz QUANTOS, e o motor precisa saber QUEM — senão a segunda leva
--  reoferece o mesmo horário para as mesmas pessoas que não responderam à
--  primeira, e a terceira faz de novo.
--
--  E ela guarda o DESFECHO, que é o que transforma o encaixe em aprendizado:
--  quem aceita encaixe de véspera, quem nunca responde, quem responde tarde.
--  Sem desfecho, o escore de candidato nunca sai do palpite inicial.
-- ============================================================================
create table if not exists public.crc_gap_offers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  gap_id          uuid not null references public.crc_schedule_gaps(id) on delete cascade,
  patient_id      uuid not null references public.crc_patients(id) on delete cascade,

  -- ENVIADA | ACEITOU | RECUSOU | SEM_RESPOSTA | CANCELADA
  -- CANCELADA = o buraco foi preenchido por outra pessoa antes de esta
  -- responder. É o estado que o §15 pede ("stop others") e que evita a segunda
  -- pessoa agendar em cima da primeira.
  status          text not null default 'ENVIADA',

  -- O escore que colocou esta pessoa no lote, com os fatores. Guardado para a
  -- tela responder "por que ela foi chamada e eu não".
  escore          integer not null default 0,
  fatores         jsonb not null default '[]'::jsonb,

  enviada_em      timestamptz not null default now(),
  respondida_em   timestamptz,

  criado_em       timestamptz not null default now(),

  -- Uma oferta por pessoa por buraco. É o que impede a segunda leva de
  -- reoferecer para quem já recebeu.
  unique (gap_id, patient_id)
);

create index if not exists idx_crc_gap_offers_paciente
  on public.crc_gap_offers (patient_id, enviada_em desc);

-- ----------------------------------------------------------------------------
-- 3. A lista de espera
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  A WAITLIST NÃO É UMA FILA, E CHAMÁ-LA DE FILA É O ERRO DE DESENHO.
--
--  Fila implica ordem de chegada: o primeiro que entrou é o primeiro a ser
--  chamado. Só que a pergunta real não é "quem chegou antes" — é "para quem
--  ESTA janela, com ESTE dentista, nesta terça às 14h, serve".
--
--  Alguém que só pode de manhã não deve ser chamado para as 14h por ter
--  entrado primeiro; ser chamado para um horário impossível ensina a pessoa a
--  ignorar as próximas mensagens.
--
--  Então isto é uma tabela de PREFERÊNCIAS, consultada como filtro, e a ordem
--  sai do escore de compatibilidade.
-- ============================================================================
create table if not exists public.crc_waitlist_preferences (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,
  patient_id      uuid not null references public.crc_patients(id) on delete cascade,

  /*
   * OS DIAS, como array de inteiros 0..6 (0 = domingo).
   *
   * Vazio significa QUALQUER DIA, e não NENHUM. A diferença é a que decide se
   * uma pessoa que não informou preferência é chamada para tudo ou para nada —
   * e "para nada" transformaria a waitlist numa lista de gente que nunca é
   * chamada.
   */
  dias            integer[] not null default '{}',

  -- 'HH:MM'. Nulos = o dia inteiro.
  hora_inicio     text,
  hora_fim        text,

  dentist_id      uuid references public.crc_dentists(id) on delete set null,
  procedimento    text,

  -- Aceita encaixe de última hora? Quem marca `false` só é chamado com a
  -- antecedência mínima abaixo respeitada.
  aceita_encaixe  boolean not null default true,
  -- Horas mínimas de antecedência. 0 = aceita para daqui a pouco.
  antecedencia_h  integer not null default 0,

  -- Aceita ser atendido em OUTRA unidade da rede. Nasce `false`: mandar alguém
  -- para o outro bairro sem perguntar é a forma mais rápida de um "não" virar
  -- uma reclamação.
  outra_unidade   boolean not null default false,

  ativo           boolean not null default true,
  observacao      text,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  -- Uma preferência por paciente. Editar substitui; não acumula.
  unique (organization_id, patient_id)
);

create index if not exists idx_crc_waitlist_ativa
  on public.crc_waitlist_preferences (organization_id, clinic_id)
  where ativo = true;

-- ----------------------------------------------------------------------------
-- 4. O risco de falta, na própria consulta
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  COLUNA NA CONSULTA, E NÃO TABELA SEPARADA.
--
--  O risco é um atributo DAQUELA consulta, calculado a partir do histórico do
--  paciente e das características do horário. Ele nasce e morre com ela, e
--  toda leitura que o quer já está lendo a consulta — uma tabela separada
--  seria um join em todo lugar para nunca ganhar nada.
--
--  `risco_fatores` guarda o POR QUÊ. O §17 exige heurística explicável, e a
--  explicação tem que viajar junto do número: "risco alto" sozinho é um rótulo
--  que ninguém pode contestar, e a recepção precisa poder discordar.
--
--  O QUE NÃO ENTRA, e está escrito no código: idade, gênero, bairro, convênio.
--  Nenhum deles prevê falta; o que prevê é comportamento — já faltou, remarcou
--  duas vezes, marcou com dois meses de antecedência, não confirmou.
-- ============================================================================
alter table public.crc_appointments
  add column if not exists risco_falta text;

alter table public.crc_appointments
  add column if not exists risco_fatores jsonb not null default '[]'::jsonb;

alter table public.crc_appointments
  add column if not exists risco_calculado_em timestamptz;

-- A varredura pergunta "consultas futuras desta organização ainda sem risco".
create index if not exists idx_crc_appointments_risco
  on public.crc_appointments (organization_id, inicio_em)
  where status in ('TO_CONFIRM', 'CONFIRMED');

-- ----------------------------------------------------------------------------
-- 5. Os candidatos a um buraco, em uma ida ao banco
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  ISTO PRECISA SER SQL, e a razão é a mesma da `supabase/29`.
--
--  Achar candidato é cruzar quatro condições sobre a base inteira de pacientes:
--  tem waitlist compatível, não tem consulta futura, não está em opt-out, e não
--  recebeu oferta deste buraco. Do lado da aplicação isso seria ler todos os
--  pacientes ativos e filtrar em memória — 8.000 linhas para preencher uma hora.
--
--  O `limite` é pequeno de propósito: o motor oferece em LOTE PEQUENO (§15), e
--  trazer cem candidatos para usar cinco é trabalho jogado fora.
-- ============================================================================
create or replace function public.crc_candidatos_para_buraco(
  p_organization_id uuid,
  p_gap_id          uuid,
  p_limite          integer default 20
)
returns table (
  patient_id       uuid,
  nome             text,
  telefone         text,
  -- Os sinais que o escore usa. Calculados aqui porque já custaram o join.
  tem_waitlist     boolean,
  aceita_encaixe   boolean,
  dia_bate         boolean,
  hora_bate        boolean,
  dentista_bate    boolean,
  ultima_consulta  timestamptz,
  consultas_feitas bigint
)
language sql
stable
as $corpo$
  with buraco as (
    select g.* from public.crc_schedule_gaps g
     where g.id = p_gap_id and g.organization_id = p_organization_id
  ),
  -- O dia da semana e a hora LOCAIS da clínica. `at time zone` sobre o fuso
  -- guardado nas configurações seria o ideal; enquanto ele não chega até aqui,
  -- America/Sao_Paulo cobre o caso real e está explícito em vez de implícito.
  janela as (
    select
      b.*,
      extract(dow from (b.inicio_em at time zone 'America/Sao_Paulo'))::int as dow_local,
      to_char(b.inicio_em at time zone 'America/Sao_Paulo', 'HH24:MI')      as hora_local
    from buraco b
  )
  select
      p.id,
      p.nome,
      p.telefone,
      (w.id is not null)                                                   as tem_waitlist,
      coalesce(w.aceita_encaixe, true)                                     as aceita_encaixe,
      (w.dias is null or cardinality(w.dias) = 0 or j.dow_local = any(w.dias)) as dia_bate,
      (w.hora_inicio is null or (j.hora_local >= w.hora_inicio and j.hora_local <= coalesce(w.hora_fim, '23:59'))) as hora_bate,
      (w.dentist_id is null or w.dentist_id = j.dentist_id)                as dentista_bate,
      p.ultima_consulta_em,
      (select count(*) from public.crc_appointments a
        where a.patient_id = p.id and a.status = 'COMPLETED')              as consultas_feitas
    from janela j
    join public.crc_patients p
      on p.organization_id = p_organization_id
     and p.clinic_id = j.clinic_id
    left join public.crc_waitlist_preferences w
      on w.patient_id = p.id and w.ativo = true
   where p.arquivado = false
     and p.ativo = true
     -- OPT-OUT É EXCLUSÃO, e não rebaixamento. Quem pediu silêncio não entra
     -- na lista nem no fim dela: num dia devagar alguém chegaria lá.
     and p.opt_out_em is null
     and p.telefone is not null
     -- Quem já tem consulta futura não precisa de encaixe.
     and not exists (
       select 1 from public.crc_appointments a
        where a.patient_id = p.id
          and a.inicio_em > now()
          and a.status in ('TO_CONFIRM', 'CONFIRMED')
     )
     -- E quem já foi chamado para ESTE buraco não é chamado de novo.
     and not exists (
       select 1 from public.crc_gap_offers o
        where o.gap_id = p_gap_id and o.patient_id = p.id
     )
   order by
     -- Waitlist primeiro, sempre: são as pessoas que PEDIRAM para ser chamadas.
     (w.id is not null) desc,
     p.ultima_consulta_em desc nulls last
   limit greatest(1, least(p_limite, 100));
$corpo$;

insert into public.crc_schema_migrations (nome, presumido)
values ('32-crc-agenda-inteligente.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();

-- ----------------------------------------------------------------------------
-- RLS e privilégios
-- ----------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array[
    'crc_schedule_gaps','crc_gap_offers','crc_waitlist_preferences'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $rls$;

do $privilegios$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on all tables in schema public to service_role';
    execute 'grant all on all sequences in schema public to service_role';
    execute 'grant all on all functions in schema public to service_role';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant select on all tables in schema public to anon';
  end if;
end $privilegios$;
