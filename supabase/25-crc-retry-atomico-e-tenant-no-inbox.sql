-- ============================================================================
-- CRC — o retry deixa de ter janela, e o inbox passa a saber de quem é.
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. Depois: `notify pgrst, 'reload schema';`
--
-- TRÊS DEFEITOS, e os três nascem do mesmo hábito: fazer em duas instruções o
-- que precisa ser uma.
--
--   1. O BACKOFF ERA GRAVADO DEPOIS DO STATUS.
--   2. A DEAD LETTER DE WEBHOOK NÃO SABIA O TENANT.
--   3. O PAYLOAD COM PII SOBREVIVIA AO FIM DA FILA.
--
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. O retry cercado vira UMA instrução
-- ----------------------------------------------------------------------------
--
-- A JANELA, e ela é pequena e real.
--
-- `falharJob` fazia assim:
--
--     rpc crc_encerrar_agent_job  →  status = 'REPETIR', travado_ate = null
--     update crc_agent_jobs       →  disponivel_em = agora + backoff
--
-- Entre as duas, a linha existe no banco como:
--
--     status = 'REPETIR'
--     disponivel_em = <o valor ANTIGO, quase sempre no passado>
--     travado_ate = null
--
-- E é exatamente o que `crc_reservar_agent_jobs` procura:
--
--     status in ('PENDENTE','REPETIR') and disponivel_em <= now()
--                                      and (travado_ate is null or ...)
--
-- Ou seja: durante o intervalo entre as duas instruções, o job que acabou de
-- falhar está ELEGÍVEL. Outro worker reserva imediatamente, e o backoff que o
-- primeiro estava prestes a escrever cai em cima de uma reserva alheia.
--
-- O QUE ISSO CUSTA NA PRÁTICA: o backoff existe porque a maior parte das falhas
-- é provedor fora do ar. Um retry imediato bate no mesmo provedor caído, queima
-- uma das cinco tentativas, e o job chega ao teto em segundos em vez de em
-- minutos — com a dead letter aberta antes de o provedor ter tido chance de
-- voltar. A proteção não some: ela se transforma no contrário do que promete.
--
-- POR QUE `drop` ANTES DO `create`: acrescentar um parâmetro com default NÃO
-- substitui a função — cria uma SOBRECARGA. As duas passariam a existir, e o
-- PostgREST recusaria a chamada por ambiguidade. É o mesmo tropeço do
-- `supabase/20`, e desta vez o `drop` já vem em cima.
drop function if exists public.crc_encerrar_agent_job(uuid, uuid, text, text, integer);

create or replace function public.crc_encerrar_agent_job(
  p_job_id        uuid,
  p_lease_token   uuid,
  p_status        text,
  p_erro          text default null,
  p_duracao_ms    integer default null,
  -- NOVO. Quando vem preenchido, o backoff é gravado NA MESMA instrução que
  -- muda o status — e não existe instante em que o job esteja REPETIR com o
  -- `disponivel_em` velho.
  p_disponivel_em timestamptz default null
)
returns boolean
language plpgsql
as $corpo$
declare
  afetados integer;
begin
  update public.crc_agent_jobs
     set status      = p_status,
         ultimo_erro = coalesce(p_erro, ultimo_erro),
         duracao_ms  = coalesce(p_duracao_ms, duracao_ms),
         terminou_em = now(),
         travado_ate = null,
         -- `coalesce` e não atribuição direta: a conclusão não mexe no
         -- `disponivel_em`, e zerá-lo ali seria mudar o significado de uma
         -- coluna que só o retry usa.
         disponivel_em = coalesce(p_disponivel_em, disponivel_em),
         atualizado_em = now()
   where id = p_job_id
     and lease_token = p_lease_token
     and status = 'RODANDO';

  get diagnostics afetados = row_count;
  return afetados > 0;
end $corpo$;

-- ----------------------------------------------------------------------------
-- 2. O inbox de webhook passa a carregar o tenant
-- ----------------------------------------------------------------------------
--
-- `mandarParaDeadLetter()` resolvia o escopo assim:
--
--     resolverEscopo(provedor, null)
--                              ^^^^
--
-- `null` no lugar do destinatário. E `resolverEscopo` com destinatário nulo cai
-- direto no caminho da clínica única — que, com duas clínicas, devolve `null`
-- de propósito. Resultado: `organization_id = null` na dead letter.
--
-- Numa instalação de uma clínica, certo por acidente. Num SaaS com dezenas, a
-- fila de falhas vira um monte sem dono: não dá para dizer qual cliente perdeu
-- mensagem, nem para mostrar a ele o que foi perdido, nem para separar o que é
-- problema de um do que é problema de todos.
--
-- A INFORMAÇÃO EXISTIA E ERA JOGADA FORA. `resolverEscopo` já tinha resolvido
-- certo quando o envelope chegou. Ela só não era gravada.
alter table public.crc_webhook_inbox
  add column if not exists organization_id uuid references public.crc_organizations(id) on delete cascade;

alter table public.crc_webhook_inbox
  add column if not exists clinic_id uuid;

-- NULO CONTINUA VÁLIDO, e é o que permite aplicar isto sem reprocessar nada:
-- as linhas antigas não têm tenant, e um envelope que chega antes de qualquer
-- canal cadastrado também não terá. O que muda é que, quando o escopo É
-- conhecido, ele fica registrado.

-- A FK composta do `supabase/19`: impede envelope de uma organização apontando
-- para clínica de outra. Condicional porque `clinic_id` é nulo com frequência,
-- e o Postgres aceita FK composta parcialmente nula por padrão (MATCH SIMPLE).
do $fk$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'crc_webhook_inbox_tenant_fk'
  ) then
    alter table public.crc_webhook_inbox
      add constraint crc_webhook_inbox_tenant_fk
      foreign key (organization_id, clinic_id)
      references public.crc_clinics (organization_id, id) on delete set null;
  end if;
end $fk$;

create index if not exists idx_crc_webhook_inbox_tenant
  on public.crc_webhook_inbox (organization_id, status);

-- ----------------------------------------------------------------------------
-- 3. O reconciliador de webhook preso também aprende o tenant
-- ----------------------------------------------------------------------------
--
-- A versão do `supabase/24` escrevia `null` como organização — porque naquele
-- momento a coluna não existia. Agora existe, e a dead letter nasce com dono.
--
-- E ELE APAGA O PAYLOAD. Ver a seção 4: um envelope que a limpeza marca como
-- FALHOU terminal não vai ser reprocessado nunca, e o telefone e o texto do
-- paciente não têm por que continuar numa tabela de fila.
create or replace function public.crc_liberar_webhooks_presos(
  max_tentativas integer default 5
)
returns integer
language plpgsql
as $corpo$
declare
  quantos integer;
begin
  /*
   * UMA INSTRUÇÃO SÓ, com dois CTEs que escrevem e um `select` que conta. A
   * lição do `supabase/24` continua valendo: `get diagnostics` depois do
   * `insert` conta o INSERT; contar a tabela depois dá o total acumulado.
   */
  with presos as (
    update public.crc_webhook_inbox
       set status = 'FALHOU',
           travado_ate = null,
           ultimo_erro = coalesce(ultimo_erro, 'O worker não terminou o webhook e o lease venceu.'),
           -- TERMINAL: não volta para a fila, então o conteúdo sai junto.
           payload = '{}'::jsonb
     where status = 'PROCESSANDO'
       and travado_ate is not null
       and travado_ate < now()
       and tentativas >= max_tentativas
    returning id, provedor, external_id, tentativas, ultimo_erro, organization_id, clinic_id
  ),
  mortas as (
    insert into public.crc_dead_letters (organization_id, origem, referencia, erro, payload, status)
    select
      -- O TENANT, e não `null`. É a razão desta função ser reescrita aqui.
      p.organization_id,
      'webhook',
      p.id,
      coalesce(p.ultimo_erro, 'Esgotou as tentativas com o worker morto.'),
      /*
       * SÓ METADADO. A dead letter existe para alguém INVESTIGAR, e para isso
       * bastam provedor, id externo, tenant e contagem. Copiar o texto da
       * mensagem para cá criaria um terceiro lugar com PII e uma terceira
       * política de retenção — e a referência para a linha original já permite
       * achar tudo enquanto ela existir.
       */
      jsonb_build_object('provedor', p.provedor, 'externalId', p.external_id,
                         'tentativas', p.tentativas, 'clinicId', p.clinic_id),
      'PENDENTE'
    from presos p
    where not exists (
      select 1 from public.crc_dead_letters d
       where d.origem = 'webhook' and d.referencia = p.id
    )
    returning 1
  )
  select count(*) into quantos from presos;

  return quantos;
end $corpo$;

-- ----------------------------------------------------------------------------
-- 4. A retenção de PII passa a cobrir o estado TERMINAL
-- ----------------------------------------------------------------------------
--
-- A POLÍTICA, dita inteira:
--
--   PENDENTE                    guarda o envelope. É o que o replay precisa.
--   PROCESSANDO                 idem — pode voltar pelo lease.
--   FALHOU com tentativa sobrando   idem — o pulso vai repescar.
--   -----------------------------------------------------------------------
--   PROCESSADO                  payload zerado. O conteúdo já está em
--                               `crc_messages`, com as regras de acesso de lá.
--   DESCARTADO                  payload zerado. Não é aplicável nunca.
--   FALHOU terminal + DLQ       payload zerado. Ninguém vai repescar.
--
-- O QUE FALTAVA ERAM AS DUAS ÚLTIMAS LINHAS. `crc_limpar_webhooks_antigos` só
-- olhava `PROCESSADO`, e o código só zerava o payload nesse caso. Ou seja: o
-- caso de FALHA — justamente o que ninguém revisita — guardava telefone e texto
-- do paciente para sempre, numa tabela de fila.
--
-- ESTA FUNÇÃO É A REDE, e não a política. Quem zera na hora certa é o código
-- (`marcar()` em `aplicacao/webhooks.ts`); isto aqui pega o que passou por
-- versões antigas, por crash, ou por caminho que ninguém previu. Uma política
-- de retenção que depende de todo caminho lembrar de aplicá-la não é política.
create or replace function public.crc_limpar_webhooks_antigos(
  p_dias integer default 30
)
returns integer
language plpgsql
as $corpo$
declare
  quantos integer;
begin
  /*
   * PRIMEIRO O CONTEÚDO, DEPOIS A LINHA, e a ordem é o ponto.
   *
   * Apagar a linha inteira depois de 30 dias já resolveria a retenção — em 30
   * dias. Zerar o payload assim que o envelope vira terminal reduz a janela de
   * exposição de um mês para uma volta do pulso, e mantém a linha (com o
   * `external_id`) para o dedupe do provedor continuar funcionando.
   */
  update public.crc_webhook_inbox
     set payload = '{}'::jsonb
   where payload <> '{}'::jsonb
     and (
       status in ('PROCESSADO', 'DESCARTADO')
       or (status = 'FALHOU' and tentativas >= 5)
     );

  delete from public.crc_webhook_inbox
   where status in ('PROCESSADO', 'DESCARTADO', 'FALHOU')
     and coalesce(processado_em, criado_em) < now() - make_interval(days => p_dias)
     /*
      * FALHOU COM TENTATIVA SOBRANDO NÃO É APAGADO, mesmo velho: ele ainda está
      * na fila de repescagem. Trinta dias de idade com tentativa sobrando
      * significa que o pulso parou — e apagar a evidência disso seria apagar
      * justamente o que denuncia o problema.
      */
     and (status <> 'FALHOU' or tentativas >= 5);

  get diagnostics quantos = row_count;
  return quantos;
end $corpo$;

-- ----------------------------------------------------------------------------
-- Privilégios
-- ----------------------------------------------------------------------------
--
-- Idempotente e repetido em toda migração: tabela ou função criada DEPOIS dos
-- `grant` de instalação nasce sem privilégio para `service_role`, e o sintoma é
-- `permission denied` aparecendo só quando alguém exercita o caminho novo.
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
