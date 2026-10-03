-- USD only (the report principal and the index are in US dollars). From research/fetch-fx.mjs, recipe fx-eur; the other currencies are left as they are.
set search_path = offshore_insights;
insert into fx_rate (currency, eur_per_unit, as_of, source_url) values ('USD', 0.88729885, '2026-10-02', 'https://open.er-api.com/v6/latest/EUR') on conflict (currency) do update set eur_per_unit = excluded.eur_per_unit, as_of = excluded.as_of, source_url = excluded.source_url;
reset search_path;
