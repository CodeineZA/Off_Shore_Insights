-- ════════════════════════════════════════════════════════════════════════════
-- Off_Shore_Insights — public seed (idempotent: existing rows are left alone)
-- Researched 2026-09-30 from secondary sources. DRAFT: Phase 2 re-verifies
-- every row against the official authority. Rates are percentages.
-- jurisdiction_note (sales angles, warnings) lives in the gitignored
-- db/seed-private.sql because this repo is public.
-- ════════════════════════════════════════════════════════════════════════════
set search_path = offshore_insights;

-- ---- tax types ----
insert into tax_type (code, label, category, applies_to, is_recurring, description, sort_order) values
('CGT_FINANCIAL',      'Capital gains: shares & funds',   'investment',   '{individual,trust,company}', false, 'Tax on gains when selling shares, ETFs, funds', 10),
('CGT_PROPERTY',       'Capital gains: property',         'investment',   '{individual,trust,company}', false, 'Tax on gains when selling real estate', 20),
('INCOME_TOP',         'Income tax: top rate',            'income',       '{individual,trust}',         true,  'Top marginal personal income tax rate', 30),
('WHT_DIVIDEND',       'Withholding: dividends',          'withholding',  '{individual,trust,company}', true,  'Domestic withholding on outbound dividends', 40),
('WHT_INTEREST',       'Withholding: interest',           'withholding',  '{individual,trust,company}', true,  'Domestic withholding on outbound interest', 50),
('INHERITANCE_DIRECT', 'Inheritance/estate: children',    'estate',       '{individual,trust}',         false, 'Inheritance or estate tax, direct line', 60),
('INHERITANCE_OTHER',  'Inheritance/estate: non-relatives','estate',      '{individual,trust}',         false, 'Inheritance or estate tax, unrelated heirs', 70),
('WEALTH_NET',         'Wealth tax: net wealth',          'wealth',       '{individual,trust}',         true,  'Annual tax on total net wealth', 80),
('WEALTH_SOLIDARITY',  'Wealth tax: solidarity surtax',   'wealth',       '{individual,trust}',         true,  'Additional national wealth levy on large fortunes', 85),
('WEALTH_PROPERTY',    'Wealth tax: real estate',         'wealth',       '{individual,trust}',         true,  'Annual tax on net property wealth', 90),
('SECURITIES_ACCOUNT', 'Securities account tax',          'wealth',       '{individual,trust,company}', true,  'Annual tax on value held in securities accounts', 95),
('FOREIGN_ASSET_TAX',  'Tax on foreign financial assets', 'anti_offshore','{individual,trust}',         true,  'Annual tax on assets held abroad; argues AGAINST offshore', 100),
('FOREIGN_PROPERTY',   'Tax on foreign real estate',      'anti_offshore','{individual,trust}',         true,  'Annual tax on property held abroad', 110)
on conflict (code) do nothing;

-- ---- jurisdictions ----
insert into jurisdiction (code, name, parent_code, kind, currency, tax_year_start, next_budget_date, is_offshore_hub) values
('MU', 'Mauritius',      null, 'country', 'MUR', '07-01', '2027-06-15', true),
('SC', 'Seychelles',     null, 'country', 'SCR', '01-01', null,         true),
('ZA', 'South Africa',   null, 'country', 'ZAR', '03-01', '2027-02-24', false),
('FR', 'France',         null, 'country', 'EUR', '01-01', '2026-10-15', false),
('DE', 'Germany',        null, 'country', 'EUR', '01-01', null,         false),
('BE', 'Belgium',        null, 'country', 'EUR', '01-01', null,         false),
('GB', 'United Kingdom', null, 'country', 'GBP', '04-06', null,         false),
('IT', 'Italy',          null, 'country', 'EUR', '01-01', null,         false),
('ES', 'Spain',          null, 'country', 'EUR', '01-01', null,         false),
('PT', 'Portugal',       null, 'country', 'EUR', '01-01', null,         false),
('CH', 'Switzerland',    null, 'country', 'CHF', '01-01', null,         false),
('ES-MD', 'Madrid (Community)', 'ES', 'region', 'EUR', '01-01', null, false),
('ES-AN', 'Andalucía',          'ES', 'region', 'EUR', '01-01', null, false),
('BE-VLG', 'Flanders',          'BE', 'region', 'EUR', '01-01', null, false),
('BE-BRU', 'Brussels',          'BE', 'region', 'EUR', '01-01', null, false),
('BE-WAL', 'Wallonia',          'BE', 'region', 'EUR', '01-01', null, false)
on conflict (code) do nothing;
-- Budget dates are approximate; confirm in Phase 2.

-- ---- rates ----
insert into tax_rate (jurisdiction_code, tax_type_code, headline_rate, rate_min, rate_max, threshold_amount, threshold_note, note, valid_from, source_url, verified_on, next_check_on, needs_verification) values
-- South Africa
('ZA','CGT_FINANCIAL',     18,   0,    18,   null,     null, '40% inclusion rate at marginal income rates; effective top ~18%', '2026-03-01', null, '2026-09-30', '2027-02-25', true),
('ZA','INHERITANCE_DIRECT',20,   20,   25,   3500000,  'R3.5m abatement; 25% above R30m', 'Estate duty; spouse bequests exempt', '2026-03-01', null, '2026-09-30', '2027-02-25', true),
('ZA','INHERITANCE_OTHER', 20,   20,   25,   3500000,  'R3.5m abatement; 25% above R30m', 'Estate duty', '2026-03-01', null, '2026-09-30', '2027-02-25', true),
-- France
('FR','CGT_FINANCIAL',     31.4, 31.4, 31.4, null, null, 'Flat tax: 12.8% income tax + 18.6% social levies', '2026-01-01', 'https://advocateabroad.com/france/inheritance-tax-france/', '2026-09-30', '2026-12-31', false),
('FR','CGT_PROPERTY',      36.2, 36.2, 36.2, null, null, '19% + 17.2% social charges; holding-period relief applies', '2026-01-01', 'https://www.french-property.com/guides/france/finance-taxation/inheritance/taxes/liability', '2026-09-30', '2026-12-31', false),
('FR','WEALTH_PROPERTY',   1.5,  0.5,  1.5,  800000, 'Net property wealth over €800k', 'IFI; no broad wealth tax', '2026-01-01', null, '2026-09-30', '2026-12-31', false),
('FR','WEALTH_NET',        0,    0,    0,    null, null, 'No broad wealth tax (IFI covers property only)', '2026-01-01', null, '2026-09-30', '2026-12-31', false),
('FR','INHERITANCE_DIRECT',45,   5,    45,   100000, '€100k allowance per child; 45% above ~€1.8m', 'Spouse exempt', '2026-01-01', 'https://advocateabroad.com/france/inheritance-tax-france/', '2026-09-30', '2026-12-31', false),
('FR','INHERITANCE_OTHER', 60,   60,   60,   null, null, 'Non-relatives', '2026-01-01', 'https://advocateabroad.com/france/inheritance-tax-france/', '2026-09-30', '2026-12-31', false),
-- Germany
('DE','CGT_FINANCIAL',     26.375, 26.375, 26.375, null, null, 'Abgeltungsteuer 25% + 5.5% solidarity surcharge', '2026-01-01', 'https://www.taxesforexpats.com/country-guides/germany/us-tax-preparation-in-germany.html', '2026-09-30', '2026-12-31', false),
('DE','INHERITANCE_DIRECT',30,   7,    30,   400000, '€400k per child; €500k spouse; €200k grandchild', 'Class I scale', '2026-01-01', 'https://www.taxesforexpats.com/country-guides/germany/us-tax-preparation-in-germany.html', '2026-09-30', '2026-12-31', true),
('DE','INHERITANCE_OTHER', 50,   30,   50,   null, null, 'Class III scale', '2026-01-01', null, '2026-09-30', '2026-12-31', true),
('DE','WEALTH_NET',        0,    0,    0,    null, null, 'No wealth tax', '2026-01-01', null, '2026-09-30', '2026-12-31', false),
-- Belgium (inheritance is regional: fill BE-VLG / BE-BRU / BE-WAL in Phase 2)
('BE','CGT_FINANCIAL',     10,   10,   33,   10000, '€10k annual exemption; pre-2026 gains stepped up', '10% from 2026-01-01 (Law of 6 April 2026); 33% on internal gains', '2026-01-01', 'https://www.bfs.be/en/news/taxation-of-capital-gains-on-financial-investments-understanding-the-reform-and-protecting-your-historical-gains', '2026-09-30', '2026-12-31', false),
('BE','SECURITIES_ACCOUNT',0.15, 0.15, 0.30, 1000000, 'Average account value over €1m', 'CONFLICT: most sources 0.15%, one says 0.30%', '2026-01-01', 'https://finorum.com/belgium-tax-guide/', '2026-09-30', '2026-10-31', true),
-- United Kingdom
('GB','CGT_FINANCIAL',     24,   18,   24,   3000, '£3,000 annual exempt amount', '18% basic / 24% higher rate', '2026-04-06', 'https://salarytax.uk/guides/capital-gains-tax-2026-27', '2026-09-30', '2027-03-31', false),
('GB','INHERITANCE_DIRECT',40,   36,   40,   325000, '£325k nil-rate band + £175k residence band', '36% if 10%+ to charity', '2026-04-06', 'https://ibissandco.com/tax-tips/uk-inheritance-tax-guide/', '2026-09-30', '2027-03-31', false),
('GB','INHERITANCE_OTHER', 40,   36,   40,   325000, '£325k nil-rate band', null, '2026-04-06', 'https://ibissandco.com/tax-tips/uk-inheritance-tax-guide/', '2026-09-30', '2027-03-31', false),
-- Italy
('IT','CGT_FINANCIAL',     26,   12.5, 26,   null, null, '12.5% on government bonds; 33% crypto from 2026', '2026-01-01', 'https://taxsummaries.pwc.com/italy', '2026-09-30', '2026-12-31', false),
('IT','INHERITANCE_DIRECT',4,    4,    4,    1000000, '€1m per heir', 'Spouse and direct line', '2026-01-01', 'https://movingto.com/it/taxes-in-italy', '2026-09-30', '2026-12-31', false),
('IT','INHERITANCE_OTHER', 8,    6,    8,    100000, '€100k for siblings only', '6% siblings, 8% others', '2026-01-01', 'https://movingto.com/it/taxes-in-italy', '2026-09-30', '2026-12-31', false),
('IT','FOREIGN_ASSET_TAX', 0.4,  0.2,  0.4,  null, null, 'IVAFE: 0.4% for assets in privileged-tax jurisdictions', '2026-01-01', 'https://www.liveandinvestoverseas.com/country-hub/europe/italy/taxes-in-italy/', '2026-09-30', '2026-12-31', false),
('IT','FOREIGN_PROPERTY',  1.06, 1.06, 1.06, null, null, 'IVIE on foreign real estate', '2026-01-01', 'https://www.liveandinvestoverseas.com/country-hub/europe/italy/taxes-in-italy/', '2026-09-30', '2026-12-31', false),
-- Spain (national scale; regions override)
('ES','CGT_FINANCIAL',     30,   19,   30,   null, null, 'Savings income scale for residents', '2026-01-01', 'https://www.taxesforexpats.com/country-guides/spain/us-tax-preparation-in-spain.html', '2026-09-30', '2026-12-31', false),
('ES','WEALTH_NET',        3.5,  0.2,  3.5,  700000, '€700k exemption', 'Regional; national default scale', '2026-01-01', 'https://www.costaluzlawyers.com/resources/changes-to-spanish-wealth-tax-from-2023/', '2026-09-30', '2026-12-31', false),
('ES','WEALTH_SOLIDARITY', 3.5,  1.7,  3.5,  3000000, 'Over €3m', 'ITSGF, now indefinite: 1.7% / 2.1% / 3.5%', '2026-01-01', 'https://www.costaluzlawyers.com/resources/changes-to-spanish-wealth-tax-from-2023/', '2026-09-30', '2026-12-31', false),
('ES','INHERITANCE_DIRECT',34,   7.65, 34,   null, null, 'Before regional reliefs', '2026-01-01', 'https://www.pellicerheredia.com/en/inheritance-tax-spain/', '2026-09-30', '2026-12-31', false),
('ES-MD','WEALTH_NET',     0,    0,    0,    null, null, '100% regional relief; Solidarity Tax still applies', '2026-01-01', 'https://www.costaluzlawyers.com/resources/changes-to-spanish-wealth-tax-from-2023/', '2026-09-30', '2026-12-31', false),
('ES-AN','WEALTH_NET',     0,    0,    0,    null, null, '100% regional relief; Solidarity Tax still applies', '2026-01-01', 'https://www.costaluzlawyers.com/resources/changes-to-spanish-wealth-tax-from-2023/', '2026-09-30', '2026-12-31', false)
on conflict (jurisdiction_code, tax_type_code) where valid_to is null do nothing;
-- Not yet researched: MU, SC, CH, PT rates; ZA INCOME_TOP; all WHT rows; BE regional inheritance.

-- ---- treaties with Mauritius ----
insert into treaty (country_a, country_b, status, signed_on, in_force_on, mli_note, source_url, verified_on, next_check_on) values
('MU','FR','in_force',    '1980-12-11','1982-09-17','MLI in force 2020-02-01 (MU), 2019-01-01 (FR)','https://www.mra.mu/taxes-duties/international-taxation/double-taxation-agreements','2026-09-30','2027-03-31'),
('MU','DE','in_force',    '2011-10-07','2012-12-07',null,'https://www.mra.mu/taxes-duties/international-taxation/double-taxation-agreements','2026-09-30','2027-03-31'),
('MU','BE','in_force',    '1995-07-04','1999-01-28',null,'https://www.mra.mu/taxes-duties/international-taxation/double-taxation-agreements','2026-09-30','2027-03-31'),
('MU','IT','in_force',    '1990-03-09','1995-04-28',null,'https://www.mra.mu/taxes-duties/international-taxation/double-taxation-agreements','2026-09-30','2027-03-31'),
('MU','GB','in_force',    null,null,'Dates to confirm','https://www.mra.mu/taxes-duties/international-taxation/double-taxation-agreements','2026-09-30','2026-10-31'),
('MU','ZA','in_force',    null,null,'Dates to confirm','https://www.mra.mu/taxes-duties/international-taxation/double-taxation-agreements','2026-09-30','2026-10-31'),
('MU','ES','negotiating', null,null,'Listed by MRA as under negotiation','https://www.mra.mu/taxes-duties/international-taxation/double-taxation-agreements','2026-09-30','2026-12-31'),
('MU','PT','negotiating', null,null,'Listed by MRA as under negotiation','https://www.mra.mu/taxes-duties/international-taxation/double-taxation-agreements','2026-09-30','2026-12-31'),
('MU','CH','unknown',     null,null,'To research',null,'2026-09-30','2026-10-31')
on conflict (country_a, country_b) do nothing;
-- Seychelles treaties: all to research.


-- ---- map coordinates (approximate centroids, degrees) ----
update jurisdiction j set lon = v.lon, lat = v.lat
from (values ('MU', 57.55, -20.25), ('SC', 55.45, -4.68), ('ZA', 24.70, -29.00), ('FR', 2.30, 46.60),
             ('DE', 10.40, 51.10), ('BE', 4.50, 50.60), ('GB', -2.50, 53.50), ('IT', 12.50, 42.80),
             ('ES', -3.70, 40.30), ('PT', -8.20, 39.60), ('CH', 8.20, 46.80), ('ES-MD', -3.70, 40.40),
             ('ES-AN', -4.60, 37.50), ('BE-VLG', 4.40, 51.00), ('BE-BRU', 4.35, 50.85), ('BE-WAL', 4.80, 50.40)
     ) v(code, lon, lat)
where j.code = v.code and (j.lon is null or j.lat is null);

reset search_path;

-- Taxes set per region: regions never inherit the national rate for these.
update offshore_insights.jurisdiction set regional_tax_types = '{INHERITANCE_DIRECT,INHERITANCE_OTHER}' where code = 'BE';
update offshore_insights.jurisdiction set regional_tax_types = '{INHERITANCE_DIRECT,INHERITANCE_OTHER,WEALTH_NET}' where code = 'ES';

-- ═════ Country-first additions (2026-10-02) ═════
-- Capitals (where the map pins its bars), ISO3 (map geometry), display order, and whether the
-- death tax is charged on each heir's share ('heirs') or on the whole estate ('estate').
update offshore_insights.jurisdiction j set
  capital      = coalesce(j.capital, v.capital),
  capital_lon  = coalesce(j.capital_lon, v.lon),
  capital_lat  = coalesce(j.capital_lat, v.lat),
  iso3         = coalesce(j.iso3, v.iso3),
  sort_order   = coalesce(j.sort_order, v.ord),
  estate_basis = coalesce(j.estate_basis, v.basis)
from (values
  ('FR', 'Paris',      2.352, 48.857, 'FRA', 1, 'heirs'),  ('DE', 'Berlin',   13.405,  52.520, 'DEU', 2, 'heirs'),
  ('BE', 'Brussels',   4.352, 50.847, 'BEL', 3, 'heirs'),  ('GB', 'London',   -0.128,  51.507, 'GBR', 4, 'estate'),
  ('IT', 'Rome',      12.496, 41.903, 'ITA', 5, 'heirs'),  ('ES', 'Madrid',   -3.704,  40.417, 'ESP', 6, 'heirs'),
  ('ZA', 'Pretoria',  28.188, -25.747, 'ZAF', 7, 'estate'), ('PT', 'Lisbon',  -9.139,  38.722, 'PRT', 8, 'heirs'),
  ('CH', 'Bern',       7.447, 46.948, 'CHE', 9, 'heirs'),  ('MU', 'Port Louis', 57.502, -20.162, 'MUS', null, null),
  ('SC', 'Victoria',  55.455, -4.620, 'SYC', null, null)
) v(code, capital, lon, lat, iso3, ord, basis)
where j.code = v.code;

-- The two countries whose regional taxes were researched: say what is regional.
update offshore_insights.jurisdiction set structure_checked_on = coalesce(structure_checked_on, '2026-09-30'),
  structure_note = coalesce(structure_note, 'Inheritance tax is set by the 3 regions (Flanders, Brussels, Wallonia)') where code = 'BE';
update offshore_insights.jurisdiction set structure_checked_on = coalesce(structure_checked_on, '2026-09-30'),
  structure_note = coalesce(structure_note, 'Inheritance tax and net wealth tax are set by the autonomous communities') where code = 'ES';

-- Services Mauritius/Seychelles offer, and the taxes each can relieve. A candidate list we maintain for the
-- sales view; edit the rows, not the code. Anti-offshore taxes are warnings, never "relieved" by a service.
insert into offshore_insights.service (code, label, description, sort_order) values
('trust',              'Trust',                 'Assets held in a Mauritius or Seychelles trust',                     10),
('foundation',         'Foundation',            'Assets held in a foundation',                                        20),
('holding_company',    'Holding company',       'Investments and dividends held through a hub company',               30),
('investment_portfolio','Investment portfolio', 'Portfolio custodied and managed in the hub',                         40),
('real_estate',        'Real estate',           'Property held or bought through the hub',                            50),
('bank_account',       'Bank account',          'Deposits and interest held in the hub',                              60),
('residency',          'Residency',             'Moving tax residence to the hub',                                    70)
on conflict (code) do nothing;
insert into offshore_insights.service_tax (service_code, tax_type_code) values
('trust', 'INHERITANCE_DIRECT'), ('trust', 'INHERITANCE_OTHER'), ('trust', 'CGT_FINANCIAL'), ('trust', 'WEALTH_NET'), ('trust', 'WEALTH_SOLIDARITY'),
('foundation', 'INHERITANCE_DIRECT'), ('foundation', 'INHERITANCE_OTHER'), ('foundation', 'CGT_FINANCIAL'), ('foundation', 'WEALTH_NET'), ('foundation', 'WEALTH_SOLIDARITY'),
('holding_company', 'WHT_DIVIDEND'), ('holding_company', 'WHT_INTEREST'), ('holding_company', 'CGT_FINANCIAL'), ('holding_company', 'INCOME_TOP'),
('investment_portfolio', 'CGT_FINANCIAL'), ('investment_portfolio', 'SECURITIES_ACCOUNT'), ('investment_portfolio', 'WHT_DIVIDEND'), ('investment_portfolio', 'WHT_INTEREST'),
('real_estate', 'CGT_PROPERTY'), ('real_estate', 'WEALTH_PROPERTY'),
('bank_account', 'WHT_INTEREST'), ('bank_account', 'SECURITIES_ACCOUNT'),
('residency', 'INCOME_TOP'), ('residency', 'CGT_FINANCIAL'), ('residency', 'CGT_PROPERTY'), ('residency', 'WEALTH_NET'), ('residency', 'WEALTH_SOLIDARITY'),
('residency', 'INHERITANCE_DIRECT'), ('residency', 'INHERITANCE_OTHER')
on conflict do nothing;

-- Firm categories (open list: add rows to add a category).
insert into offshore_insights.advisor_category (code, label, sort_order) values
('law_firm',             'Law firm',                      10),
('estate_planning',      'Trust & estate planning',       20),
('tax_advisor',          'Tax adviser',                   30),
('accounting',           'Accounting & audit',            40),
('notary',               'Notary',                        50),
('real_estate',          'Real estate',                   60),
('citizenship_residency','Citizenship & residency',       70),
('wealth_manager',       'Wealth manager',                80),
('family_office',        'Family office',                 90),
('trust_company',        'Trust & corporate services',   100),
('private_bank',         'Private bank',                 110),
('insurance',            'Insurance',                    120),
('other',                'Other',                        999)
on conflict (code) do nothing;
