# Advisors: the run-file format

Firms (law, tax, estate planning, real estate, citizenship, wealth, trust companies...) are collected per country
and loaded with `node research/apply-advisors.mjs research/advisors/<date>-<CC>.json`. **The same file is what a
scraper writes**, so a scraper built later and Claude's own collection end up in one importer.

```jsonc
{
  "run": "2026-10-05",
  "by": "claude /find-advisors NL",            // or "scraper nova-directory v1"
  "categories": [{ "code": "notary", "label": "Notary" }],     // optional: new categories (the list is open)
  "sources": [ { ...see below... } ],
  "advisors": [ { ...see below... } ]
}
```

## A source (a directory, register, ranking or search)

| field | meaning |
|---|---|
| `name`, `scope`, `country`, `list_url`, `kind` | what it is. `scope`: `country:NL`, `continent:EU` or `global`. `kind`: directory, register, ranking, association, search |
| `collection` | **`scrapeable`**: every required field (below) is on the listing or detail page and machine-readable, with no login or captcha. A scraper can take it. **`claude`**: fields are incomplete or the page is dynamic: Claude collects it through this interface. **`manual`**: login, captcha, PDF or paywall: `instructions` tell Hentus exactly what to export and where to put it |
| `access` | `open`, `login`, `captcha` or `blocked` |
| `fields_present` | which of the fields below the listing really exposes, found by sampling five entries |
| `pagination`, `detail_pattern`, `field_map` | for `scrapeable` only, and required there: the scraper contract. `field_map` maps each field to a CSS selector or JSON path |
| `instructions` | for `manual` only, and required there |

**Required to call a source `scrapeable`:** `name`, `registered_name` or `registration_number`, `category`, `country`, `city`,
`phone`, `website`, `email` or `contact_url`, and `source_url`. `completeness()` in `research/advisors-lib.mjs` decides; a source
that lacks any of them is `claude`, and its gaps are listed so Hentus can see what the scraper would still miss.

## A firm

| field | meaning |
|---|---|
| `name`, `registered_name`, `registration_number`, `legal_form`, `parent_group`, `founded_year` | identity. `registered_name` is the registered business name (from the company register where possible) |
| `category`, `categories[]` | main category (must exist; add under `categories` to create one) and any others |
| `country`, `region`, `city`, `address`, `postal_code`, `lat`, `lon`, `other_offices` | where. `region` is a jurisdiction code of that country (`BE-VLG`) |
| `phone`, `email`, `website`, `contact_url`, `linkedin_url` | business contact details only |
| `segment`, `tier`, `ranking_source`, `size_note`, `languages[]` | e.g. `private clients`, `Band 1`, `Chambers 2026`, `40 lawyers` |
| `practice_areas[]`, `tax_topics[]`, `services[]` | `tax_topics` are tax-type codes the firm handles (`INHERITANCE_DIRECT`...), `services` are service codes (`trust`...) |
| `mentions_hubs` | does its own site mention Mauritius, Seychelles or offshore? true / false / null (not checked) |
| `source` (a source `list_url`), `source_url`, `found_via`, `collected_by` | provenance. `found_via` is the search or filter used; `collected_by` is `scraper`, `claude` or `manual` |
| `found_on`, `verified_on`, `status` | `candidate` (default), `verified`, `excluded` |

A firm is identified by country + registered name (else name) + city. Loading it again updates it and never overwrites a
known value with a blank. People-level records and the Excel export are later steps; the columns already carry what the
export needs (name, country and region, registered name, phone, email, website).
