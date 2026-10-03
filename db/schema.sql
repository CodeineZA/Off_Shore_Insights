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
-- is_admin: may manage users (User management page). Only Hentus.
-- created_here: the login was made by this app (deleting the user deletes the login).
-- A linked login (shared Auth realm, e.g. Hentus's Neil's Way account) only loses access here.
alter table offshore_insights.app_user add column if not exists is_admin boolean not null default false;
alter table offshore_insights.app_user add column if not exists created_here boolean not null default false;

-- The password as last set through this app, shown on the User management page
-- (Hentus: "not sensitive in this context"). Its own table so that no member, not
-- even the user themself, can read it through PostgREST: RLS on, no policy.
-- Only service_role (the login gateway's admin endpoints) reads or writes it.
create table if not exists offshore_insights.app_user_password (
  user_id     uuid primary key references offshore_insights.app_user(user_id) on delete cascade,
  password    text not null,
  set_at      timestamptz not null default now()
);

-- User management list for the gateway's admin endpoints. SERVICE ROLE ONLY.
create or replace function offshore_insights.admin_users()
returns table (user_id uuid, username text, display_name text, email text, cell text, disabled boolean,
               is_admin boolean, created_here boolean, created_at timestamptz, auth_email text,
               last_sign_in_at timestamptz, password text, password_set_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select u.user_id, u.username, u.display_name, u.email, u.cell, u.disabled, u.is_admin, u.created_here,
         u.created_at, au.email::text, au.last_sign_in_at, p.password, p.set_at
  from offshore_insights.app_user u
  join auth.users au on au.id = u.user_id
  left join offshore_insights.app_user_password p on p.user_id = u.user_id
  order by u.username;
$$;

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
returns table (username text, auth_email text, contact_email text, user_id uuid, is_admin boolean) language sql stable security definer set search_path = '' as $$
  select u.username, au.email::text, u.email, u.user_id, u.is_admin
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
-- Taxes this country sets per region (e.g. Belgian and Spanish inheritance). Its regions
-- never inherit the national rate for these: a missing regional rate stays unknown.
alter table offshore_insights.jurisdiction add column if not exists regional_tax_types text[] not null default '{}';

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
-- The ECB euro reference rate at the END of each calendar year, per currency: what a report converts the allowances of THAT year at
-- (fx_rate above holds only today's rate, which is wrong for a ten-year history). A year with no row is unknown, never today's rate.
create table if not exists offshore_insights.fx_rate_year (
  currency     char(3) not null,
  year         int     not null check (year between 1999 and 2100),
  eur_per_unit numeric(18,8) not null check (eur_per_unit > 0),
  source       text not null,
  source_url   text not null,
  verified_on  date not null,
  primary key (currency, year)
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

-- ═══════════════════ Country-first additions (2026-10-02, PLAN.md §2–§5) ═══════
-- Capital and structure: what the map pins, and whether the country has been checked
-- for taxes set below national level (structure_checked_on is null = not researched yet).
alter table offshore_insights.jurisdiction
  add column if not exists capital              text,
  add column if not exists capital_lon          numeric(7,3),
  add column if not exists capital_lat          numeric(7,3),
  add column if not exists iso3                 char(3),
  add column if not exists structure_checked_on date,
  add column if not exists structure_note       text,
  add column if not exists sort_order           int,
  add column if not exists estate_basis         text;   -- 'heirs' (each heir's share) | 'estate' (the whole estate)
alter table offshore_insights.jurisdiction drop constraint if exists jurisdiction_estate_basis_chk;
alter table offshore_insights.jurisdiction add constraint jurisdiction_estate_basis_chk
  check (estate_basis is null or estate_basis in ('heirs', 'estate'));

-- Money. HNWI (investable assets over US$1m) has no per-country source, so it is gone.
-- ref_date is the date a figure is "as at": a stock count belongs to the tax year containing it.
alter table offshore_insights.wealth_market
  add column if not exists private_wealth_usd_bn   numeric(14,2),
  add column if not exists trusts_count            bigint,
  add column if not exists private_companies_count bigint,
  add column if not exists ref_date                date;
alter table offshore_insights.wealth_market drop column if exists hnwi_count;
update offshore_insights.wealth_market
   set ref_date = case when business_owners is not null then make_date(year, 6, 30) else make_date(year, 12, 31) end
 where ref_date is null;   -- annual averages (Eurostat/ILO) mid-year, stock counts (UBS, Knight Frank) at year end

-- A rate row covers [valid_from, valid_to). Two rows for the same jurisdiction + tax type may never
-- cover the same day, so "the rate in force on day X" always has one answer (the partial unique index
-- above only guards the current row). An AFTER trigger, so `on conflict do nothing` seed rows that are skipped never reach it.
create or replace function offshore_insights.tax_rate_no_overlap() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from offshore_insights.tax_rate r
              where r.jurisdiction_code = new.jurisdiction_code and r.tax_type_code = new.tax_type_code
                and r.id is distinct from new.id
                and daterange(r.valid_from, r.valid_to, '[)') && daterange(new.valid_from, new.valid_to, '[)')) then
    raise exception 'tax_rate % % overlaps an existing row for the same dates', new.jurisdiction_code, new.tax_type_code
      using errcode = '23P01';
  end if;
  return new;
end $$;
drop trigger if exists tax_rate_no_overlap_trg on offshore_insights.tax_rate;
create trigger tax_rate_no_overlap_trg after insert or update on offshore_insights.tax_rate
  for each row execute function offshore_insights.tax_rate_no_overlap();

-- Services Mauritius/Seychelles offer, and the taxes each one can relieve. A candidate list we
-- maintain (editable data, not a claim about any one client); the page shows it beside the hub rate.
create table if not exists offshore_insights.service (
  code        text primary key,
  label       text not null,
  description text,
  sort_order  int not null default 100
);
create table if not exists offshore_insights.service_tax (
  service_code  text not null references offshore_insights.service(code) on delete cascade,
  tax_type_code text not null references offshore_insights.tax_type(code) on delete cascade,
  note          text,
  primary key (service_code, tax_type_code)
);

-- What is still missing for a country or region, and where to get it (written by research/audit-country.mjs).
create table if not exists offshore_insights.research_item (
  jurisdiction_code text not null references offshore_insights.jurisdiction(code) on delete cascade,
  item              text not null,      -- 'treaty:MU', 'tax:INHERITANCE_DIRECT', 'wealth:millionaires', 'advisors'...
  status            text not null check (status in ('have', 'missing', 'blocked', 'stale')),
  detail            text,
  where_to_get      text,               -- the instruction for Hentus when status = 'blocked'
  checked_on        date not null default current_date,
  primary key (jurisdiction_code, item)
);

-- Calendar-year returns of a market index: what the "what a million would have become" report compounds on.
-- One row per index, year, basis (gross or net of dividend withholding) and currency; every row carries its source and date.
-- A year that has not closed has no row (never a year-to-date figure).
create table if not exists offshore_insights.market_return (
  id               bigint generated always as identity primary key,
  index_code       text not null,                   -- 'MSCI_WORLD'
  index_name       text not null,                   -- 'MSCI World Index'
  year             int  not null check (year between 1990 and 2100),
  total_return_pct numeric(8,4) not null,           -- percent for the calendar year, e.g. 19.19
  basis            text not null check (basis in ('gross', 'net')),
  currency         char(3) not null,                -- the currency the index is quoted in
  source           text not null,
  source_url       text not null,
  verified_on      date not null,
  unique (index_code, year, basis, currency)
);

-- Firms (law, tax, real estate, citizenship, wealth...). The category list is open: add rows, not code.
create table if not exists offshore_insights.advisor_category (
  code       text primary key,
  label      text not null,
  sort_order int not null default 100
);
-- Where firms are found. `collection` says how they get collected: 'scrapeable' (every required field is
-- on the listing, machine-readable: a scraper can take it), 'claude' (Claude collects it here), 'manual'
-- (Hentus exports it; `instructions` says how).
create table if not exists offshore_insights.advisor_source (
  id                 bigint generated always as identity primary key,
  name               text not null,
  scope              text not null,     -- 'country:BE', 'continent:EU', 'global'
  country_code       text references offshore_insights.jurisdiction(code),
  list_url           text not null unique,
  kind               text,              -- directory | register | ranking | association | search
  collection         text not null check (collection in ('scrapeable', 'claude', 'manual')),
  access             text not null default 'open' check (access in ('open', 'login', 'captcha', 'blocked')),
  fields_present     text[] not null default '{}',   -- which required fields the listing exposes
  pagination         text,
  detail_pattern     text,
  field_map          jsonb,             -- field -> selector / JSON path (the scraper contract)
  instructions       text,
  notes              text,
  sampled_on         date,
  last_collected_on  date
);
create table if not exists offshore_insights.advisor (
  id                  bigint generated always as identity primary key,
  name                text not null,
  registered_name     text,
  registration_number text,
  legal_form          text,
  parent_group        text,
  founded_year        int,
  category_code       text not null references offshore_insights.advisor_category(code),
  categories          text[] not null default '{}',   -- further categories the firm also works in
  country_code        text not null references offshore_insights.jurisdiction(code),
  region_code         text references offshore_insights.jurisdiction(code),
  city                text,
  address             text,
  postal_code         text,
  lat                 numeric(8,5),
  lon                 numeric(8,5),
  other_offices       text,
  phone               text,
  email               text,
  website             text,
  contact_url         text,
  linkedin_url        text,
  segment             text,               -- e.g. private clients, corporate, mixed
  tier                text,               -- ranking / band, with ranking_source
  ranking_source      text,
  size_note           text,
  languages           text[] not null default '{}',
  practice_areas      text[] not null default '{}',
  tax_topics          text[] not null default '{}',   -- tax_type codes the firm handles
  services            text[] not null default '{}',   -- service codes
  mentions_hubs       boolean,            -- names Mauritius / Seychelles / offshore on its own pages
  notes               text,
  source_id           bigint references offshore_insights.advisor_source(id),
  source_url          text,
  found_via           text,               -- the search filter / query that found it
  collected_by        text not null check (collected_by in ('scraper', 'claude', 'manual')),
  found_on            date not null default current_date,
  verified_on         date,
  status              text not null default 'candidate' check (status in ('candidate', 'verified', 'excluded'))
);
create unique index if not exists advisor_identity_uq on offshore_insights.advisor
  (country_code, lower(coalesce(registered_name, name)), coalesce(lower(city), ''));
create index if not exists advisor_region_idx on offshore_insights.advisor (country_code, region_code);


-- Current rates; regions fall back to their parent country's rates, except for the taxes
-- the parent sets per region (jurisdiction.regional_tax_types): those stay unknown until researched.
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
left join offshore_insights.jurisdiction pj on pj.code = j.parent_code
left join cur p on p.jurisdiction_code = j.parent_code and p.tax_type_code = t.code
                and not (t.code = any(pj.regional_tax_types));

create view offshore_insights.v_hub_treaties with (security_invoker = on) as
select * from offshore_insights.treaty where country_a in ('MU', 'SC');

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
    'me', (select jsonb_build_object('username', u.username, 'display_name', u.display_name, 'is_admin', u.is_admin)
           from offshore_insights.app_user u where u.user_id = auth.uid()),
    'jurisdictions', coalesce((select jsonb_agg(to_jsonb(j) order by j.code) from offshore_insights.jurisdiction j), '[]'),
    'tax_types',     coalesce((select jsonb_agg(to_jsonb(t) order by t.sort_order) from offshore_insights.tax_type t), '[]'),
    'rates',         coalesce((select jsonb_agg(to_jsonb(r) order by r.jurisdiction_code, r.sort_order) from offshore_insights.v_current_rates r where r.headline_rate is not null), '[]'),  -- unknown = absent
    'rate_history',  coalesce((select jsonb_agg(to_jsonb(h) - 'source_hash' order by h.valid_from, h.id) from offshore_insights.tax_rate h), '[]'),
    'treaties',      coalesce((select jsonb_agg(to_jsonb(t) order by t.country_a, t.country_b) from offshore_insights.treaty t), '[]'),
    'wealth',        coalesce((select jsonb_agg(to_jsonb(w) order by w.jurisdiction_code, w.year) from offshore_insights.wealth_market w), '[]'),
    'notes',         coalesce((select jsonb_agg(to_jsonb(n) order by n.jurisdiction_code, n.sort_order) from offshore_insights.jurisdiction_note n), '[]'),
    'gates',         coalesce((select jsonb_agg(to_jsonb(g) order by g.jurisdiction_code, g.gate, g.hub) from offshore_insights.jurisdiction_gate g), '[]'),
    'fx',            coalesce((select jsonb_agg(to_jsonb(x) order by x.currency) from offshore_insights.fx_rate x), '[]'),
    'services',      coalesce((select jsonb_agg(to_jsonb(v) order by v.sort_order, v.code) from offshore_insights.service v), '[]'),
    'service_tax',   coalesce((select jsonb_agg(to_jsonb(v) order by v.service_code, v.tax_type_code) from offshore_insights.service_tax v), '[]'),
    'research_items', coalesce((select jsonb_agg(to_jsonb(v) order by v.jurisdiction_code, v.item) from offshore_insights.research_item v), '[]'),
    'market_returns', coalesce((select jsonb_agg(to_jsonb(v) - 'id' order by v.index_code, v.year, v.basis, v.currency) from offshore_insights.market_return v), '[]'),
    'fx_history',    coalesce((select jsonb_agg(to_jsonb(x) order by x.currency, x.year) from offshore_insights.fx_rate_year x), '[]'),
    'advisor_categories', coalesce((select jsonb_agg(to_jsonb(v) order by v.sort_order, v.label) from offshore_insights.advisor_category v), '[]'),
    -- Slim rows only: the page lists names by category and region. Contact details stay in the table.
    'advisors',      coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'category_code', a.category_code,
                       'categories', a.categories, 'country_code', a.country_code, 'region_code', a.region_code, 'city', a.city,
                       'tax_topics', a.tax_topics, 'services', a.services, 'status', a.status)
                       order by a.country_code, a.name) from offshore_insights.advisor a where a.status <> 'excluded'), '[]'),
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
revoke all on function offshore_insights.admin_users() from public, anon, authenticated;
grant execute on function offshore_insights.admin_users() to service_role;
-- Passwords: not even a SELECT grant for members (RLS below is the second lock).
revoke all on offshore_insights.app_user_password from anon, authenticated;
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
                           'jurisdiction_note','review_flag','sync_run','site_page','jurisdiction_gate','fx_rate','fx_rate_year',
                           'service','service_tax','research_item','market_return','advisor_category','advisor_source','advisor',
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
-- RLS on with no policy: nobody but service_role sees a row.
alter table offshore_insights.app_user_password enable row level security;

-- Tell PostgREST to reload its schema cache.
notify pgrst, 'reload schema';
