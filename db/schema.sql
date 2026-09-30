-- ════════════════════════════════════════════════════════════════════════════
-- Off_Shore_Insights — full schema (idempotent: safe to re-apply)
-- Apply on the Pi:  bash db/apply.sh db/schema.sql
-- Everything lives in the `offshore_insights` Postgres schema on the shared
-- Supabase instance. Access = membership in offshore_insights.app_user (the
-- shared Auth realm has open signup, so "authenticated" alone means nothing).
-- ════════════════════════════════════════════════════════════════════════════

create schema if not exists offshore_insights;

-- ============ Enums ============
do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'offshore_insights' and t.typname = 'jurisdiction_kind') then
    create type offshore_insights.jurisdiction_kind as enum ('country', 'region');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'offshore_insights' and t.typname = 'tax_category') then
    create type offshore_insights.tax_category as enum ('investment', 'estate', 'wealth', 'withholding', 'income', 'anti_offshore');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'offshore_insights' and t.typname = 'treaty_status') then
    create type offshore_insights.treaty_status as enum ('in_force', 'signed_not_in_force', 'negotiating', 'none', 'unknown');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'offshore_insights' and t.typname = 'flag_reason') then
    create type offshore_insights.flag_reason as enum ('due', 'page_changed', 'fetch_failed');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'offshore_insights' and t.typname = 'flag_status') then
    create type offshore_insights.flag_status as enum ('pending', 'confirmed', 'needs_update', 'resolved');
  end if;
end $$;

-- ════════════════════════ Users (who may use this app) ═══════════════════════
create table if not exists offshore_insights.app_user (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9][a-z0-9._-]{1,31}$'),
  display_name  text,
  email         text,                 -- real contact email (optional, preferred)
  cell          text,                 -- real cell number (optional, preferred)
  disabled      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- True when the caller is an active member. SECURITY DEFINER so policies can
-- call it without granting members read access to every app_user row.
create or replace function offshore_insights.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from offshore_insights.app_user u
    where u.user_id = auth.uid() and not u.disabled
  );
$$;

-- Username → the Auth email to sign in with. Null unless an active member.
-- SERVICE ROLE ONLY: login never reaches the database pre-auth. The login
-- gateway (services/auth-gateway) caches login_directory() in memory instead.
create or replace function offshore_insights.resolve_login(p_username text)
returns text language sql stable security definer set search_path = '' as $$
  select au.email::text
  from offshore_insights.app_user u
  join auth.users au on au.id = u.user_id
  where u.username = lower(trim(p_username)) and not u.disabled;
$$;

-- Every active member's username → Auth email, for the gateway's in-memory
-- cache (refreshed on a timer, never per login attempt). SERVICE ROLE ONLY.
create or replace function offshore_insights.login_directory()
returns table (username text, auth_email text) language sql stable security definer set search_path = '' as $$
  select u.username, au.email::text
  from offshore_insights.app_user u
  join auth.users au on au.id = u.user_id
  where not u.disabled;
$$;

-- ════════════════════════════ Tax data ═══════════════════════════════════════
create table if not exists offshore_insights.jurisdiction (
  code             text primary key,            -- ISO 3166: 'FR', 'ES', 'ES-MD', 'BE-VLG'
  name             text not null,
  parent_code      text references offshore_insights.jurisdiction(code),
  kind             offshore_insights.jurisdiction_kind not null default 'country',
  currency         char(3) not null,
  tax_year_start   text,                        -- e.g. '01-01', '03-01', '04-06'
  next_budget_date date,
  is_offshore_hub  boolean not null default false,  -- true for MU, SC
  notes            text
);

create table if not exists offshore_insights.tax_type (
  code          text primary key,
  label         text not null,
  category      offshore_insights.tax_category not null,
  applies_to    text[] not null,               -- {'individual','trust','company'}
  is_recurring  boolean not null,              -- annual tax (compounds) vs one-off
  description   text,
  sort_order    int not null default 100
);

-- Main fact table. Keep history: close a row with valid_to, insert a new one.
-- Missing row = unknown. headline_rate 0 = no such tax.
create table if not exists offshore_insights.tax_rate (
  id                 bigint generated always as identity primary key,
  jurisdiction_code  text not null references offshore_insights.jurisdiction(code),
  tax_type_code      text not null references offshore_insights.tax_type(code),
  headline_rate      numeric(6,3),
  rate_min           numeric(6,3),
  rate_max           numeric(6,3),
  threshold_amount   numeric(18,2),             -- in jurisdiction currency
  threshold_note     text,
  note               text,
  valid_from         date not null,
  valid_to           date,                      -- null = current
  source_url         text,
  source_hash        text,                      -- page hash from the last n8n check
  verified_on        date not null,
  next_check_on      date not null,
  needs_verification boolean not null default false,
  check (rate_min is null or rate_max is null or rate_min <= rate_max)
);
-- At most one current row per jurisdiction + tax type.
create unique index if not exists tax_rate_current_uq
  on offshore_insights.tax_rate (jurisdiction_code, tax_type_code) where valid_to is null;
create index if not exists tax_rate_next_check_idx
  on offshore_insights.tax_rate (next_check_on) where valid_to is null;

create table if not exists offshore_insights.treaty (
  id             bigint generated always as identity primary key,
  country_a      text not null references offshore_insights.jurisdiction(code),  -- the hub (MU/SC)
  country_b      text not null references offshore_insights.jurisdiction(code),
  status         offshore_insights.treaty_status not null,
  signed_on      date,
  in_force_on    date,
  mli_note       text,
  wht_dividend   numeric(6,3),
  wht_interest   numeric(6,3),
  wht_royalty    numeric(6,3),
  source_url     text,
  source_hash    text,
  verified_on    date not null,
  next_check_on  date not null,
  unique (country_a, country_b)
);
alter table offshore_insights.treaty add column if not exists source_hash text;

create table if not exists offshore_insights.wealth_market (
  id                 bigint generated always as identity primary key,
  jurisdiction_code  text not null references offshore_insights.jurisdiction(code),
  year               int not null,
  millionaires       int,        -- net worth > US$1m (UBS Global Wealth Report)
  hnwi_count         int,        -- investable assets > US$1m (Capgemini World Wealth Report)
  uhnwi_count        int,        -- > US$30m (Knight Frank Wealth Report)
  business_owners    int,        -- self-employed with employees (Eurostat)
  source             text not null,
  source_url         text,
  verified_on        date not null,
  unique (jurisdiction_code, year, source)
);

create table if not exists offshore_insights.jurisdiction_note (
  id                 bigint generated always as identity primary key,
  jurisdiction_code  text not null references offshore_insights.jurisdiction(code),
  topic              text not null,  -- 'anti_avoidance', 'residency', 'crs', 'sales_angle', 'warning'
  text               text not null,
  source_url         text,
  verified_on        date,
  sort_order         int not null default 100,
  unique (jurisdiction_code, topic, sort_order)
);

create table if not exists offshore_insights.review_flag (
  id              bigint generated always as identity primary key,
  target_table    text not null check (target_table in ('tax_rate', 'treaty', 'wealth_market')),
  target_id       bigint not null,
  reason          offshore_insights.flag_reason not null,
  detail          text,
  raised_on       timestamptz not null default now(),
  status          offshore_insights.flag_status not null default 'pending',
  reviewed_by     text,
  reviewed_on     timestamptz,
  telegram_msg_id bigint
);
create index if not exists review_flag_pending_idx
  on offshore_insights.review_flag (target_table, target_id) where status = 'pending';

-- ════════════════════════════ Operations ═════════════════════════════════════
-- Every n8n workflow writes one row per run.
create table if not exists offshore_insights.sync_run (
  id           bigint generated always as identity primary key,
  workflow     text not null,          -- 'W0_gitsync', 'W1_recheck', …
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  rows         int,
  status       text not null default 'running' check (status in ('running', 'ok', 'error')),
  error        text
);
create index if not exists sync_run_workflow_idx on offshore_insights.sync_run (workflow, started_at desc);

-- ═══════════ Website insight tables — FILLED BY ANOTHER PROJECT (TODO) ═══════
-- Nothing in this project writes these. The website/analytics project's own
-- n8n workflow will feed them later (see Off_Shore_Trust/PLAN.md). Columns are
-- a first draft; that project may reshape them.
create table if not exists offshore_insights.site_page (
  path         text primary key,              -- '/fr/...'
  language     text not null,
  market_code  text references offshore_insights.jurisdiction(code),
  label        text,
  created_at   timestamptz not null default now()
);

create table if not exists offshore_insights.search_daily (
  date         date not null,
  page         text not null,
  country      text not null,                 -- as reported by the source
  device       text not null,
  clicks       int not null default 0,
  impressions  int not null default 0,
  ctr          numeric(7,4),
  position     numeric(7,2),
  primary key (date, page, country, device)
);

create table if not exists offshore_insights.search_query_monthly (
  month        date not null,                 -- first day of month
  page         text not null,
  query        text not null,
  clicks       int not null default 0,
  impressions  int not null default 0,
  position     numeric(7,2),
  primary key (month, page, query)
);

create table if not exists offshore_insights.analytics_daily (
  date              date not null,
  page_path         text not null,
  country           text not null,
  source            text not null default '(direct)',
  medium            text not null default '(none)',
  sessions          int not null default 0,
  engaged_sessions  int not null default 0,
  contact_submits   int not null default 0,
  phone_clicks      int not null default 0,
  email_clicks      int not null default 0,
  primary key (date, page_path, country, source, medium)
);

-- ════════════════════════════ Views ══════════════════════════════════════════
drop view if exists offshore_insights.v_data_health;
drop view if exists offshore_insights.v_market_signal;
drop view if exists offshore_insights.v_hub_treaties;
drop view if exists offshore_insights.v_current_rates;

-- Current rates; regions fall back to their parent country's rates.
create view offshore_insights.v_current_rates with (security_invoker = on) as
with cur as (
  select * from offshore_insights.tax_rate where valid_to is null
)
select j.code as jurisdiction_code, j.name, j.parent_code, t.code as tax_type_code,
       t.label, t.category, t.applies_to, t.is_recurring, t.sort_order,
       coalesce(r.headline_rate, p.headline_rate) as headline_rate,
       coalesce(r.rate_min, p.rate_min)           as rate_min,
       coalesce(r.rate_max, p.rate_max)           as rate_max,
       coalesce(r.threshold_amount, p.threshold_amount) as threshold_amount,
       coalesce(r.threshold_note, p.threshold_note) as threshold_note,
       coalesce(r.note, p.note)                   as note,
       coalesce(r.source_url, p.source_url)       as source_url,
       coalesce(r.verified_on, p.verified_on)     as verified_on,
       coalesce(r.next_check_on, p.next_check_on) as next_check_on,
       coalesce(r.needs_verification, p.needs_verification, false) as needs_verification,
       (r.id is null and p.id is not null)        as inherited,
       coalesce(r.id, p.id)                       as tax_rate_id
from offshore_insights.jurisdiction j
cross join offshore_insights.tax_type t
left join cur r on r.jurisdiction_code = j.code and r.tax_type_code = t.code
left join cur p on p.jurisdiction_code = j.parent_code and p.tax_type_code = t.code;

create view offshore_insights.v_hub_treaties with (security_invoker = on) as
select * from offshore_insights.treaty where country_a in ('MU', 'SC');

-- The three "worth marketing to?" signals per country, side by side. Raw
-- signals only: a combined score is on hold until the data is verified.
create view offshore_insights.v_market_signal with (security_invoker = on) as
with wm as (
  select distinct on (jurisdiction_code) jurisdiction_code, year, millionaires, hnwi_count, uhnwi_count, business_owners
  from offshore_insights.wealth_market
  order by jurisdiction_code, year desc, verified_on desc
), taxes as (
  select jurisdiction_code,
         count(*) filter (where is_recurring and headline_rate > 0)                         as recurring_taxes,
         max(headline_rate) filter (where category = 'estate')                              as top_inheritance_rate,
         max(headline_rate) filter (where category = 'wealth')                              as top_wealth_rate,
         count(*) filter (where category = 'anti_offshore' and headline_rate > 0)            as anti_offshore_taxes,
         count(*) filter (where headline_rate is not null)                                  as known_rates,
         count(*) filter (where needs_verification)                                         as unverified_rates
  from offshore_insights.v_current_rates
  group by jurisdiction_code
)
select j.code as jurisdiction_code, j.name,
       coalesce(tm.status, 'unknown') as treaty_mu,
       coalesce(ts.status, 'unknown') as treaty_sc,
       wm.year as wealth_year, wm.millionaires, wm.hnwi_count, wm.uhnwi_count, wm.business_owners,
       x.recurring_taxes, x.top_inheritance_rate, x.top_wealth_rate, x.anti_offshore_taxes,
       x.known_rates, x.unverified_rates
from offshore_insights.jurisdiction j
left join offshore_insights.treaty tm on tm.country_a = 'MU' and tm.country_b = j.code
left join offshore_insights.treaty ts on ts.country_a = 'SC' and ts.country_b = j.code
left join wm on wm.jurisdiction_code = j.code
left join taxes x on x.jurisdiction_code = j.code
where j.kind = 'country' and not j.is_offshore_hub;

-- One row per thing that needs attention, plus the last run of each workflow.
create view offshore_insights.v_data_health with (security_invoker = on) as
select 'flag_pending'::text as kind, f.target_table as ref_table, f.target_id as ref_id,
       null::text as jurisdiction_code, f.reason::text || coalesce(': ' || f.detail, '') as detail,
       f.raised_on::date as on_date
from offshore_insights.review_flag f where f.status = 'pending'
union all
select 'overdue', 'tax_rate', r.id, r.jurisdiction_code, r.tax_type_code, r.next_check_on
from offshore_insights.tax_rate r where r.valid_to is null and r.next_check_on < current_date
union all
select 'overdue', 'treaty', t.id, t.country_b, t.country_a || '-' || t.country_b, t.next_check_on
from offshore_insights.treaty t where t.next_check_on < current_date
union all
select 'needs_verification', 'tax_rate', r.id, r.jurisdiction_code, r.tax_type_code, r.verified_on
from offshore_insights.tax_rate r where r.valid_to is null and r.needs_verification
union all
select * from (
  select distinct on (s.workflow) 'last_run', 'sync_run', s.id, null::text,
         s.workflow || ' ' || s.status || coalesce(': ' || s.error, ''), s.started_at::date
  from offshore_insights.sync_run s order by s.workflow, s.started_at desc
) lr;

-- ════════════════════════════ Grants + RLS ═══════════════════════════════════
revoke all on schema offshore_insights from public;
grant usage on schema offshore_insights to authenticated, service_role;

revoke all on all tables in schema offshore_insights from anon, authenticated;
grant select on all tables in schema offshore_insights to authenticated;
grant all on all tables in schema offshore_insights to service_role;
grant usage, select on all sequences in schema offshore_insights to service_role;
alter default privileges in schema offshore_insights grant all on tables to service_role;
alter default privileges in schema offshore_insights grant usage, select on sequences to service_role;

revoke all on function offshore_insights.is_member() from public;
grant execute on function offshore_insights.is_member() to authenticated, service_role;
revoke all on function offshore_insights.resolve_login(text) from public, anon, authenticated;
grant execute on function offshore_insights.resolve_login(text) to service_role;
revoke all on function offshore_insights.login_directory() from public, anon, authenticated;
grant execute on function offshore_insights.login_directory() to service_role;
-- Nothing in this schema is callable or readable by anon.
revoke usage on schema offshore_insights from anon;

do $$
declare t text;
begin
  foreach t in array array['jurisdiction','tax_type','tax_rate','treaty','wealth_market',
                           'jurisdiction_note','review_flag','sync_run','site_page',
                           'search_daily','search_query_monthly','analytics_daily'] loop
    execute format('alter table offshore_insights.%I enable row level security', t);
    execute format('drop policy if exists members_read on offshore_insights.%I', t);
    execute format('create policy members_read on offshore_insights.%I for select to authenticated using (offshore_insights.is_member())', t);
  end loop;
end $$;

alter table offshore_insights.app_user enable row level security;
drop policy if exists own_row on offshore_insights.app_user;
create policy own_row on offshore_insights.app_user
  for select to authenticated using (user_id = auth.uid());

-- Tell PostgREST to reload its schema cache.
notify pgrst, 'reload schema';
