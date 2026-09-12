-- ============================================================================
-- CRC — a unidade do shopping fecha às 22h, e a do centro às 18h.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
--
-- O QUE FALTAVA. `crc_settings` tem chave `(organization_id, chave)` — ou seja,
-- horário comercial, fuso, feriados, contatos por dia e envio por hora são da
-- ORGANIZAÇÃO inteira. Para uma clínica, certo. Para uma rede:
--
--   a unidade do shopping abre às 10h e fecha às 22h;
--   a do centro abre às 8h e fecha às 18h;
--   a da praia fecha na segunda.
--
-- Com um horário só, a rede escolhe entre mandar mensagem às 21h para quem está
-- dormindo ou parar de falar às 18h com quem ainda está atendendo. As duas
-- opções são erradas, e nenhuma delas dá erro.
--
-- ============================================================================
--  POR QUE UMA TABELA NOVA, E NÃO UMA COLUNA EM `crc_settings`.
--
--  A leitura óbvia seria `alter table crc_settings add column clinic_id` e
--  trocar a chave primária para incluí-la. Foi EXATAMENTE isso que o
--  `supabase/23` fez com `crc_sync_state` — e o custo está registrado no
--  `supabase/24`:
--
--    a chave primária mudou, o `on_conflict` do código continuou o antigo, e
--    TODA sincronização passou a falhar. Não quebrou em produção por acidente:
--    a integração que usaria aquele caminho estava desligada.
--
--  Mudar chave é mudar contrato. Uma tabela nova não muda contrato nenhum:
--  `crc_settings` continua com a mesma chave, o mesmo upsert e o mesmo
--  significado — "o padrão da organização". O override mora ao lado, e quem não
--  souber que ele existe continua funcionando exatamente como antes.
--
--  O preço é uma leitura a mais quando há clínica. É barato, e é pago só por
--  quem tem mais de uma unidade.
-- ============================================================================
create table if not exists public.crc_settings_clinica (
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  clinic_id       uuid not null,

  /*
   * AS MESMAS CHAVES DE `crc_settings`, e nenhuma validação de quais.
   *
   * Só algumas fazem sentido por unidade — horário, fuso, feriados, teto de
   * contato. Uma lista fechada aqui obrigaria uma migração a cada campo novo, e
   * a mesclagem por campo já dá o comportamento certo: o que não estiver aqui
   * herda a organização. Quem decide o que vale a pena sobrescrever é a tela.
   */
  chave           text not null,
  valor           jsonb not null,

  atualizado_por  uuid references public.crc_users(id) on delete set null,
  atualizado_em   timestamptz not null default now(),

  primary key (organization_id, clinic_id, chave),

  -- A FK composta do `supabase/19`: impede override de uma organização
  -- apontando para clínica de outra.
  foreign key (organization_id, clinic_id)
    references public.crc_clinics (organization_id, id) on delete cascade
);

alter table public.crc_settings_clinica enable row level security;

create index if not exists idx_crc_settings_clinica_org
  on public.crc_settings_clinica (organization_id, clinic_id);

insert into public.crc_schema_migrations (nome, presumido)
values ('28-crc-configuracao-por-clinica.sql', false)
on conflict (nome) do update set presumido = false, aplicado_em = now();

-- ----------------------------------------------------------------------------
-- Privilégios
-- ----------------------------------------------------------------------------
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
