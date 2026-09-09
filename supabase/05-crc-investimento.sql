-- ============================================================================
-- JP CRC OS — investimento em anúncios. Aditivo: rode depois do 02.
--
-- POR QUE ESTA TABELA EXISTE
-- O sistema já sabe de onde cada lead veio: `crc_leads` guarda utm_campaign,
-- gclid e fbclid desde o primeiro clique. O que faltava era o outro lado da
-- divisão — quanto se gastou. Sem ele dá para dizer "esta campanha trouxe 24
-- pacientes", e não dá para dizer se isso foi caro ou barato.
--
-- POR QUE LANÇADO À MÃO, E NÃO PUXADO DAS APIs DE ANÚNCIO
-- Porque puxar exige credencial do Google Ads e do Meta Ads, aprovação de app
-- e manutenção de dois conectores — para substituir uma digitação por mês. O
-- custo de manter isso é maior do que o trabalho que economiza, e o número que
-- interessa (quanto entrou de paciente por real gasto) não fica mais correto
-- por vir de API.
--
-- A GRANULARIDADE É MÊS + CAMPANHA, e não dia:
--   o lead de hoje pode virar consulta daqui a três semanas, então custo diário
--   dividido por conversão diária produz números que oscilam sem significar
--   nada. Mês é o período em que a conta fecha.
--
-- `campanha` casa com `crc_leads.utm_campaign`. Quando não houver campanha
-- identificada, a linha entra com 'geral' — o gasto continua contando no total
-- da clínica, que é o número que o gestor olha primeiro.
-- ============================================================================

create table if not exists public.crc_ad_spend (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.crc_organizations(id) on delete cascade,
  -- Sempre o dia 1 do mês, em data local da clínica. A aplicação normaliza.
  mes             date not null,
  campanha        text not null default 'geral',
  valor           numeric(12, 2) not null check (valor >= 0),
  canal           text not null default 'OUTRO',
  observacao      text,
  atualizado_por  uuid references public.crc_users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- Lançar o mesmo mês e a mesma campanha de novo ATUALIZA o valor, em vez de
-- somar uma segunda linha. Sem isto, corrigir um lançamento dobraria o gasto —
-- e o custo por paciente cairia pela metade sem ninguém entender por quê.
create unique index if not exists crc_ad_spend_unico
  on public.crc_ad_spend (organization_id, mes, campanha);

create index if not exists crc_ad_spend_periodo
  on public.crc_ad_spend (organization_id, mes desc);

alter table public.crc_ad_spend enable row level security;
