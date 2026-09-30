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
-- Users may sign in with their username, their login email or their contact email.
drop function if exists offshore_insights.login_directory();
create function offshore_insights.login_directory()
returns table (username text, auth_email text, contact_email text) language sql stable security definer set search_path = '' as $$
  select u.username, au.email::text, u.email
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

-- Map position (degrees) for the dashboard's coverage map.
alter table offshore_insights.jurisdiction add column if not exists lon numeric(7,3);
alter table offshore_insights.jurisdiction add column if not exists lat numeric(7,3);

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
-- Hash of the source page as observed by W1; stored into source_hash on ✅ confirm.
alter table offshore_insights.review_flag add column if not exists observed_hash text;

-- Gates: can a client from this country use the hub? (G2 "Open doors", C7, G1 ease of reach)
-- hub = 'MU'/'SC' for hub-specific gates (blacklist); null for hub-independent ones
-- (trust_recognition, marketing). The treaty gate is derived from `treaty`, not stored.
-- No row = unknown (grey).
create table if not exists offshore_insights.jurisdiction_gate (
  id                 bigint generated always as identity primary key,
  jurisdiction_code  text not null references offshore_insights.jurisdiction(code),
  hub                text references offshore_insights.jurisdiction(code),
  gate               text not null check (gate in ('blacklist', 'trust_recognition', 'marketing')),
  status             text not null check (status in ('green', 'amber', 'red')),
  label              text not null,          -- short text on the badge, e.g. 'Listed', 'Hague party'
  note               text,
  source_url         text,
  verified_on        date not null,
  next_check_on      date not null,
  needs_verification boolean not null default false
);
create unique index if not exists jurisdiction_gate_uq
  on offshore_insights.jurisdiction_gate (jurisdiction_code, coalesce(hub, ''), gate);

-- Exchange rates to convert local-currency thresholds into EUR (sample-client model).
create table if not exists offshore_insights.fx_rate (
  currency     char(3) primary key,
  eur_per_unit numeric(18,8) not null,
  as_of        date not null,
  source_url   text not null
);

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
with latest as (   -- newest non-null value per metric (each source fills different columns)
  select jurisdiction_code, metric, value, year from (
    select w.jurisdiction_code, m.metric, m.value, w.year,
           row_number() over (partition by w.jurisdiction_code, m.metric order by w.year desc, w.verified_on desc) as rn
    from offshore_insights.wealth_market w
    cross join lateral (values ('millionaires', w.millionaires), ('hnwi_count', w.hnwi_count),
                               ('uhnwi_count', w.uhnwi_count), ('business_owners', w.business_owners)) m(metric, value)
    where m.value is not null
  ) x where rn = 1
), wm as (
  select jurisdiction_code,
         max(value) filter (where metric = 'millionaires')    as millionaires,
         max(value) filter (where metric = 'hnwi_count')      as hnwi_count,
         max(year)  filter (where metric = 'hnwi_count')      as year,
         max(value) filter (where metric = 'uhnwi_count')     as uhnwi_count,
         max(value) filter (where metric = 'business_owners') as business_owners
  from latest group by jurisdiction_code
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

-- ═══════════════════ Dashboard payload (members, via their JWT) ══════════════
-- One call per page load returns everything the tiles need (PLAN.md §9).
-- SECURITY INVOKER: RLS applies, so a non-member gets empty arrays.
create or replace function offshore_insights.dashboard()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'generated_at', now(),
    'me', (select jsonb_build_object('username', u.username, 'display_name', u.display_name)
           from offshore_insights.app_user u where u.user_id = auth.uid()),
    'jurisdictions', coalesce((select jsonb_agg(to_jsonb(j) order by j.code) from offshore_insights.jurisdiction j), '[]'),
    'tax_types',     coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from offshore_insights.tax_type t), '[]'),
    'rates',         coalesce((select jsonb_agg(to_jsonb(r) order by r.jurisdiction_code, r.sort_order) from offshore_insights.v_current_rates r where r.headline_rate is not null), '[]'),  -- unknown = absent
    'rate_history',  coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'jurisdiction_code', h.jurisdiction_code,
                       'tax_type_code', h.tax_type_code, 'headline_rate', h.headline_rate, 'valid_from', h.valid_from,
                       'valid_to', h.valid_to, 'verified_on', h.verified_on, 'needs_verification', h.needs_verification)
                       order by h.valid_from) from offshore_insights.tax_rate h), '[]'),
    'treaties',      coalesce((select jsonb_agg(to_jsonb(t) order by t.country_a, t.country_b) from offshore_insights.treaty t), '[]'),
    'wealth',        coalesce((select jsonb_agg(to_jsonb(w) order by w.jurisdiction_code, w.year) from offshore_insights.wealth_market w), '[]'),
    'notes',         coalesce((select jsonb_agg(to_jsonb(n) order by n.jurisdiction_code, n.sort_order) from offshore_insights.jurisdiction_note n), '[]'),
    'gates',         coalesce((select jsonb_agg(to_jsonb(g) order by g.jurisdiction_code, g.gate, g.hub) from offshore_insights.jurisdiction_gate g), '[]'),
    'fx',            coalesce((select jsonb_agg(to_jsonb(x) order by x.currency) from offshore_insights.fx_rate x), '[]'),
    'signals',       coalesce((select jsonb_agg(to_jsonb(s) order by s.jurisdiction_code) from offshore_insights.v_market_signal s), '[]'),
    'flags',         coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'target_table', f.target_table,
                       'target_id', f.target_id, 'reason', f.reason, 'status', f.status, 'detail', f.detail,
                       'raised_on', f.raised_on, 'reviewed_on', f.reviewed_on) order by f.raised_on)
                       from offshore_insights.review_flag f), '[]'),
    'runs',          coalesce((select jsonb_agg(to_jsonb(x) order by x.workflow) from (
                       select distinct on (s.workflow) s.workflow, s.status, s.started_at, s.finished_at, s.rows
                       from offshore_insights.sync_run s order by s.workflow, s.started_at desc) x), '[]')
  );
$$;

-- ═══════════════════ Automation RPCs (n8n, SERVICE ROLE ONLY) ════════════════
-- Next check date after a confirmation: the day after the jurisdiction's (or its
-- parent's) next budget if that is still ahead, otherwise ~6 months out.
create or replace function offshore_insights.next_cycle(p_jurisdiction text)
returns date language sql stable security definer set search_path = '' as $$
  select case when b > current_date then b + 1 else current_date + 182 end
  from (select coalesce(j.next_budget_date, p.next_budget_date) as b
        from offshore_insights.jurisdiction j
        left join offshore_insights.jurisdiction p on p.code = j.parent_code
        where j.code = p_jurisdiction) x;
$$;

-- W1: current rows due for a check that don't already have an open flag.
create or replace function offshore_insights.due_checks()
returns table (target_table text, target_id bigint, jurisdiction_code text, label text,
               current_value text, source_url text, source_hash text)
language sql stable security definer set search_path = '' as $$
  select 'tax_rate', r.id, r.jurisdiction_code, j.name || ': ' || t.label,
         coalesce(trim_scale(r.headline_rate)::text || '%', 'unknown')
           || case when r.rate_min is distinct from r.rate_max and r.rate_min is not null
                   then ' (' || trim_scale(r.rate_min) || '–' || trim_scale(r.rate_max) || '%)' else '' end,
         r.source_url, r.source_hash
  from offshore_insights.tax_rate r
  join offshore_insights.tax_type t on t.code = r.tax_type_code
  join offshore_insights.jurisdiction j on j.code = r.jurisdiction_code
  where r.valid_to is null and r.next_check_on <= current_date
    and not exists (select 1 from offshore_insights.review_flag f where f.target_table = 'tax_rate'
                    and f.target_id = r.id and f.status in ('pending', 'needs_update'))
  union all
  select 'treaty', tr.id, tr.country_b, a.name || ' – ' || b.name || ' treaty', tr.status::text,
         tr.source_url, tr.source_hash
  from offshore_insights.treaty tr
  join offshore_insights.jurisdiction a on a.code = tr.country_a
  join offshore_insights.jurisdiction b on b.code = tr.country_b
  where tr.next_check_on <= current_date
    and not exists (select 1 from offshore_insights.review_flag f where f.target_table = 'treaty'
                    and f.target_id = tr.id and f.status in ('pending', 'needs_update'))
  order by 1, 3, 2;
$$;

-- W2 ✅: the value is still correct. Idempotent: a second press reports the state.
create or replace function offshore_insights.confirm_flag(p_flag_id bigint, p_reviewer text)
returns text language plpgsql security definer set search_path = '' as $$
declare f offshore_insights.review_flag; nxt date;
begin
  select * into f from offshore_insights.review_flag where id = p_flag_id for update;
  if not found then return 'flag ' || p_flag_id || ' not found'; end if;
  if f.status <> 'pending' then return 'already ' || f.status::text; end if;
  if f.target_table = 'tax_rate' then
    update offshore_insights.tax_rate r
       set verified_on = current_date,
           next_check_on = offshore_insights.next_cycle(r.jurisdiction_code),
           source_hash = coalesce(f.observed_hash, r.source_hash)
     where r.id = f.target_id returning r.next_check_on into nxt;
  elsif f.target_table = 'treaty' then
    update offshore_insights.treaty t
       set verified_on = current_date, next_check_on = current_date + 182,
           source_hash = coalesce(f.observed_hash, t.source_hash)
     where t.id = f.target_id returning t.next_check_on into nxt;
  end if;
  update offshore_insights.review_flag
     set status = 'confirmed', reviewed_by = p_reviewer, reviewed_on = now() where id = p_flag_id;
  return 'confirmed; next check ' || coalesce(nxt::text, '?');
end $$;

-- W2 ✏️: needs a human edit in Studio (close the row with valid_to, insert the
-- new one), then set the flag to 'resolved'.
create or replace function offshore_insights.flag_needs_update(p_flag_id bigint, p_reviewer text)
returns text language plpgsql security definer set search_path = '' as $$
declare f offshore_insights.review_flag;
begin
  select * into f from offshore_insights.review_flag where id = p_flag_id for update;
  if not found then return 'flag ' || p_flag_id || ' not found'; end if;
  if f.status <> 'pending' then return 'already ' || f.status::text; end if;
  update offshore_insights.review_flag
     set status = 'needs_update', reviewed_by = p_reviewer, reviewed_on = now() where id = p_flag_id;
  return 'marked needs update';
end $$;

-- W4: once a jurisdiction's budget date has passed, pull its current rows that
-- were last verified on/before that budget forward to today (W1 then flags them).
-- Rows verified after the budget are left alone, so this doesn't repeat daily.
create or replace function offshore_insights.apply_budget_dates()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update offshore_insights.tax_rate r
     set next_check_on = current_date
    from offshore_insights.jurisdiction j
    left join offshore_insights.jurisdiction p on p.code = j.parent_code
   where r.jurisdiction_code = j.code and r.valid_to is null
     and coalesce(j.next_budget_date, p.next_budget_date) <= current_date
     and r.verified_on <= coalesce(j.next_budget_date, p.next_budget_date)
     and r.next_check_on > current_date;
  get diagnostics n = row_count;
  return n;
end $$;

-- W3: numbers for the monthly Telegram summary.
create or replace function offshore_insights.monthly_summary()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'month', to_char(date_trunc('month', current_date) - interval '1 day', 'YYYY-MM'),
    'flags_raised', (select count(*) from offshore_insights.review_flag
                     where raised_on >= date_trunc('month', current_date) - interval '1 month'
                       and raised_on <  date_trunc('month', current_date)),
    'flags_by_status', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) from (
                          select status::text, count(*) n from offshore_insights.review_flag
                          where raised_on >= date_trunc('month', current_date) - interval '1 month'
                            and raised_on <  date_trunc('month', current_date) group by 1) s),
    'open_pending', (select count(*) from offshore_insights.review_flag where status = 'pending'),
    'open_needs_update', (select count(*) from offshore_insights.review_flag where status = 'needs_update'),
    'due_next_month', (select count(*) from offshore_insights.tax_rate where valid_to is null
                         and next_check_on >= date_trunc('month', current_date)
                         and next_check_on <  date_trunc('month', current_date) + interval '1 month')
                    + (select count(*) from offshore_insights.treaty
                         where next_check_on >= date_trunc('month', current_date)
                           and next_check_on <  date_trunc('month', current_date) + interval '1 month'),
    'needs_verification', (select count(*) from offshore_insights.tax_rate where valid_to is null and needs_verification),
    'needs_verification_list', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
                                  select r.jurisdiction_code || ' ' || r.tax_type_code as x
                                  from offshore_insights.tax_rate r where r.valid_to is null and r.needs_verification) v),
    'workflow_errors', (select count(*) from offshore_insights.sync_run where status = 'error'
                          and started_at >= date_trunc('month', current_date) - interval '1 month'
                          and started_at <  date_trunc('month', current_date))
  );
$$;

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
do $$
declare fn text;
begin
  foreach fn in array array['next_cycle(text)', 'due_checks()', 'confirm_flag(bigint, text)',
                            'flag_needs_update(bigint, text)', 'apply_budget_dates()', 'monthly_summary()'] loop
    execute format('revoke all on function offshore_insights.%s from public, anon, authenticated', fn);
    execute format('grant execute on function offshore_insights.%s to service_role', fn);
  end loop;
end $$;
revoke all on function offshore_insights.dashboard() from public, anon;
grant execute on function offshore_insights.dashboard() to authenticated, service_role;
-- Nothing in this schema is callable or readable by anon.
revoke usage on schema offshore_insights from anon;

do $$
declare t text;
begin
  foreach t in array array['jurisdiction','tax_type','tax_rate','treaty','wealth_market',
                           'jurisdiction_note','review_flag','sync_run','site_page','jurisdiction_gate','fx_rate',
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
