-- ============================================================================
-- CRC — reputação, indicação, experimento e aprendizado.  (FASE F)
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Reputação
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  A REGRA QUE GOVERNA ESTA TABELA, e ela é do §32:
--
--      NUNCA MANIPULAR AVALIAÇÃO.
--
--  Manipular é filtrar QUEM é convidado a avaliar com base na nota esperada —
--  perguntar só a quem vai dar cinco estrelas. Isso produz uma média alta e uma
--  clínica que não sabe o que está errado.
--
--  O QUE ESTE DESENHO FAZ é diferente e legítimo: pergunta a TODO MUNDO como
--  foi, e ROTEIA a resposta. Quem gostou recebe o convite para avaliar
--  publicamente; quem não gostou vira um caso interno para alguém resolver.
--
--  A diferença é que a insatisfação CHEGA à clínica em vez de ir direto para o
--  Google — e o paciente insatisfeito é ouvido em vez de ignorado.
-- ============================================================================
create table if not exists public.crc_feedback (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,
  patient_id      uuid references public.crc_patients(id) on delete cascade,
  appointment_id  uuid references public.crc_appointments(id) on delete set null,

  -- 0..10, escala NPS. Nulo enquanto a pessoa não responde.
  nota            integer,
  comentario      text,

  -- PERGUNTADO | RESPONDEU | CONVIDADO_A_AVALIAR | AVALIOU | RECUPERACAO | ENCERRADO
  status          text not null default 'PERGUNTADO',

  /*
   * A RECUPERAÇÃO INTERNA: quando a nota é baixa, isto vira TAREFA.
   *
   * ==========================================================================
   *  `crc_tasks`, E NÃO `crc_human_cases` — e a escolha foi corrigida depois de
   *  olhar o schema da segunda.
   *
   *  `crc_human_cases` parecia o lugar óbvio pelo nome. Não é: ela existe para o
   *  HANDOFF DO AGENTE, e o formato diz isso — `conversation_id` é NOT NULL,
   *  `run_id` aponta para o turno, `resposta_barrada` guarda o que o agente
   *  teria respondido.
   *
   *  Uma resposta de pesquisa de satisfação não tem conversa nem turno. Forçá-la
   *  ali exigiria tornar `conversation_id` nulável e desfigurar a tabela para
   *  acomodar um caso que não é o dela.
   *
   *  `crc_tasks` é a fila geral de trabalho humano — já tem responsável, prazo,
   *  prioridade e dedupe, e é onde a equipe já olha.
   * ==========================================================================
   */
  tarefa_id       uuid references public.crc_tasks(id) on delete set null,

  perguntado_em   timestamptz not null default now(),
  respondido_em   timestamptz,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  -- Uma pergunta por consulta. Sem isto, a varredura diária perguntaria de novo
  -- a cada volta — e nada irrita mais que a mesma pesquisa quatro vezes.
  chave_dedupe    text not null,

  constraint crc_feedback_nota_valida check (nota is null or (nota >= 0 and nota <= 10))
);

create unique index if not exists crc_feedback_dedupe
  on public.crc_feedback (organization_id, chave_dedupe);

create index if not exists idx_crc_feedback_periodo
  on public.crc_feedback (organization_id, clinic_id, respondido_em desc);

-- ----------------------------------------------------------------------------
-- 2. Indicações
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  A CADEIA DA INDICAÇÃO É O QUE TORNA ELA MENSURÁVEL:
--
--      quem indicou → quem entrou → virou consulta → compareceu → valor
--
--  Sem ela, "indicação" é uma caixa de texto no cadastro que ninguém soma. Com
--  ela, a clínica descobre que 30% dos pacientes novos vieram de oito pessoas —
--  e que vale muito a pena cuidar dessas oito.
--
--  O `codigo` existe para a indicação funcionar SEM app e SEM link: a pessoa
--  fala "fui indicada pela Ana" na recepção, e alguém digita o código da Ana.
--  Um sistema de indicação que exige link rastreado perde a maioria das
--  indicações reais, que acontecem numa conversa.
-- ============================================================================
create table if not exists public.crc_referrals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null references public.crc_clinics(id) on delete cascade,

  -- Quem indicou. Sempre um paciente existente.
  indicador_id    uuid not null references public.crc_patients(id) on delete cascade,
  -- Quem foi indicado. Nulo até a pessoa virar cadastro.
  indicado_id     uuid references public.crc_patients(id) on delete set null,
  lead_id         uuid references public.crc_leads(id) on delete set null,

  -- O nome de quem foi indicado, antes de existir cadastro.
  indicado_nome   text,
  indicado_telefone text,

  -- REGISTRADA | VIROU_LEAD | AGENDOU | COMPARECEU | CONVERTEU | PERDIDA
  status          text not null default 'REGISTRADA',

  /*
   * O VALOR ATRIBUÍDO, e ele só é preenchido quando existe produção de verdade.
   *
   * A mesma regra do Radar e da atribuição: valor que não aconteceu não se soma
   * com valor que aconteceu. Enquanto a pessoa indicada não gerar receita, isto
   * é nulo — e a tela mostra a contagem, não um número de dinheiro.
   */
  valor_gerado    numeric(12,2),

  -- A recompensa, quando a clínica tem programa. Texto porque pode ser
  -- desconto, brinde, ou nada — e cada clínica inventa o seu.
  recompensa      text,
  recompensa_em   timestamptz,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  chave_dedupe    text
);

create unique index if not exists crc_referrals_dedupe
  on public.crc_referrals (organization_id, chave_dedupe)
  where chave_dedupe is not null;

create index if not exists idx_crc_referrals_indicador
  on public.crc_referrals (indicador_id, criado_em desc);

/*
 * O CÓDIGO DE INDICAÇÃO, na própria pessoa.
 *
 * Coluna e não tabela: é um atributo do paciente, um por pessoa, lido sempre
 * junto do cadastro. Uma tabela separada seria um join em toda leitura de
 * paciente para guardar seis caracteres.
 */
alter table public.crc_patients
  add column if not exists codigo_indicacao text;

create unique index if not exists crc_patients_codigo_indicacao
  on public.crc_patients (organization_id, codigo_indicacao)
  where codigo_indicacao is not null;

-- ----------------------------------------------------------------------------
-- 3. Experimentos
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  O GUARDRAIL É A PARTE QUE IMPORTA, e o §36 é explícito: se a variante
--  aumentar opt-out ou reclamação, PARAR AUTOMATICAMENTE.
--
--  Sem isso, um teste A/B numa base de pacientes é um jeito estruturado de
--  queimar metade da lista: a variante ruim continua rodando até alguém olhar o
--  relatório na semana seguinte.
--
--  E os números de parada ficam NA LINHA DO EXPERIMENTO, e não numa constante
--  do código: quem cria o teste decide quanto está disposto a arriscar.
-- ============================================================================
create table if not exists public.crc_experiments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,

  nome            text not null,
  -- COPY | HORARIO | CANAL | CTA | SEQUENCIA
  dimensao        text not null,

  -- RASCUNHO | RODANDO | PAUSADO | CONCLUIDO | PARADO_POR_GUARDRAIL
  status          text not null default 'RASCUNHO',

  /*
   * OS GUARDRAILS, por experimento.
   *
   * `opt_out_max_pct`: acima disto a variante para. 2% já é alto para uma base
   * de pacientes — quem sai de uma lista de clínica costuma não voltar.
   */
  opt_out_max_pct numeric(5,2) not null default 2,
  -- Quantos precisam receber antes de o guardrail poder disparar. Sem isto, o
  -- primeiro opt-out numa amostra de 3 pararia o experimento.
  amostra_minima  integer not null default 50,

  iniciado_em     timestamptz,
  encerrado_em    timestamptz,
  parado_motivo   text,

  criado_por      uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  unique (organization_id, nome)
);

create table if not exists public.crc_experiment_variants (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  experiment_id   uuid not null references public.crc_experiments(id) on delete cascade,

  nome            text not null,
  -- `true` na variante de controle. Um experimento sem controle não mede nada.
  controle        boolean not null default false,
  -- O conteúdo da variante: texto, horário, canal. Forma livre porque depende
  -- da dimensão.
  conteudo        jsonb not null default '{}'::jsonb,

  /*
   * OS CONTADORES, desnormalizados na variante.
   *
   * A alternativa seria contar `crc_experiment_assignments` a cada leitura —
   * e a tela do experimento é aberta com frequência enquanto ele roda. Escrita
   * por um lugar só (`registrarDesfecho`), que é a condição para desnormalizar.
   */
  enviados        integer not null default 0,
  responderam     integer not null default 0,
  converteram     integer not null default 0,
  opt_outs        integer not null default 0,

  -- ATIVA | PARADA
  status          text not null default 'ATIVA',

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  unique (experiment_id, nome)
);

create table if not exists public.crc_experiment_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  experiment_id   uuid not null references public.crc_experiments(id) on delete cascade,
  variant_id      uuid not null references public.crc_experiment_variants(id) on delete cascade,
  patient_id      uuid not null references public.crc_patients(id) on delete cascade,

  -- ENVIADO | RESPONDEU | CONVERTEU | OPT_OUT
  desfecho        text not null default 'ENVIADO',

  atribuido_em    timestamptz not null default now(),
  desfecho_em     timestamptz,

  /*
   * UMA PESSOA, UMA VARIANTE, POR EXPERIMENTO — e esta chave é o experimento
   * inteiro.
   *
   * Sem ela, a mesma pessoa poderia cair em duas variantes e o resultado não
   * mediria nada: não haveria como dizer qual mensagem produziu a conversão.
   */
  unique (experiment_id, patient_id)
);

create index if not exists idx_crc_assignments_variante
  on public.crc_experiment_assignments (variant_id, desfecho);

-- ----------------------------------------------------------------------------
-- 4. Aprendizado
-- ----------------------------------------------------------------------------
--
-- ============================================================================
--  O §37 PEDE UM MOTOR DE APRENDIZADO. O RISCO DELE É ÓBVIO: um sistema que
--  muda a própria política a partir de correlação fraca acaba fazendo besteira
--  com confiança.
--
--  POR ISSO NADA AQUI É APLICADO SOZINHO. Um aprendizado nasce `CANDIDATO`,
--  precisa de amostra e período para virar `VALIDADO`, e só uma PESSOA o move
--  para `APLICADO`. O §37 diz: "não alterar política crítica silenciosamente".
--
--  E `efeito` guarda o TAMANHO, não só a direção. "Recall às 18h converte
--  melhor" sem número não permite decidir se vale reorganizar a operação: 18%
--  melhor vale, 2% melhor é ruído.
-- ============================================================================
create table if not exists public.crc_learnings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid references public.crc_clinics(id) on delete cascade,

  -- Uma frase, em português: "Recall enviado entre 17h e 19h converte 18% mais."
  afirmacao       text not null,
  -- HORARIO | CANAL | COPY | CADENCIA | PUBLICO | OUTRO
  dimensao        text not null default 'OUTRO',

  -- CANDIDATO | VALIDADO | REJEITADO | APLICADO | EXPIRADO
  status          text not null default 'CANDIDATO',

  /* --------------------------------------------------------- a evidência --- */
  amostra         integer not null default 0,
  -- Em pontos percentuais, com sinal. Negativo é um aprendizado sobre o que
  -- NÃO fazer, e vale tanto quanto o positivo.
  efeito_pct      numeric(6,2),
  -- 0..1
  confianca       numeric(4,3) not null default 0,
  periodo_inicio  timestamptz,
  periodo_fim     timestamptz,
  -- De onde veio: o id do experimento, quando veio de um.
  experiment_id   uuid references public.crc_experiments(id) on delete set null,

  /* ------------------------------------------------- a decisão de alguém --- */
  decidido_por    uuid references public.crc_users(id) on delete set null,
  decidido_em     timestamptz,
  decisao_nota    text,

  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),

  chave_dedupe    text
);

create unique index if not exists crc_learnings_dedupe
  on public.crc_learnings (organization_id, chave_dedupe)
  where chave_dedupe is not null;

create index if not exists idx_crc_learnings_ativos
  on public.crc_learnings (organization_id, status, criado_em desc);

insert into public.crc_schema_migrations (nome, presumido)
values ('38-crc-growth.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();

-- ----------------------------------------------------------------------------
-- RLS e privilégios
-- ----------------------------------------------------------------------------
do $rls$
declare t text;
begin
  foreach t in array array[
    'crc_feedback','crc_referrals','crc_experiments','crc_experiment_variants',
    'crc_experiment_assignments','crc_learnings'
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
end $privilegios$;
