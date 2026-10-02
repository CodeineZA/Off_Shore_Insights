// Source of truth for HOW each figure is retrieved. Regenerates recipes.json:
//   node research/recipes.mjs
// method: 'api' → n8n (no AI) · 'page-extract' → /update-offshore-insights skill · 'manual' → human.
import { writeFileSync } from 'node:fs';

const P = (slug, page) => `https://taxsummaries.pwc.com/${slug}/${page}`;
const OTHER = ['INHERITANCE_DIRECT', 'INHERITANCE_OTHER', 'WEALTH_NET', 'WEALTH_SOLIDARITY', 'WEALTH_PROPERTY', 'SECURITIES_ACCOUNT', 'FOREIGN_ASSET_TAX', 'FOREIGN_PROPERTY'];

const pwc = (code, slug) => [
  { id: `pwc-${code}-pit`, method: 'page-extract', url: P(slug, 'individual/taxes-on-personal-income'), cells: [`${code}:INCOME_TOP`],
    extract: 'Top marginal personal income tax rate for residents, its threshold, and surcharges on top (solidarity, high-income, regional/municipal ranges). Tax year.' },
  { id: `pwc-${code}-cg`, method: 'page-extract', url: P(slug, 'individual/income-determination'), cells: [`${code}:CGT_FINANCIAL`, `${code}:CGT_PROPERTY`],
    extract: 'Capital gains of resident individuals: shares/funds (rate, annual exemption) and real estate (rate, holding-period relief, main-home exemption).' },
  { id: `pwc-${code}-other`, method: 'page-extract', url: P(slug, 'individual/other-taxes'), cells: OTHER.map((t) => `${code}:${t}`),
    extract: 'Inheritance/gift tax (top rate + allowance for children; top rate for unrelated heirs). Net wealth, large-fortune/solidarity, real-estate wealth, securities-account, foreign-asset and foreign-real-estate taxes (rate, threshold). Stated as non-existent = 0. Not mentioned at all = 0 with note "none listed in PwC Other taxes".' },
  { id: `pwc-${code}-wht`, method: 'page-extract', url: P(slug, 'corporate/withholding-taxes'), cells: [`${code}:WHT_DIVIDEND`, `${code}:WHT_INTEREST`],
    extract: 'Domestic withholding tax on dividends and on interest paid to NON-RESIDENT INDIVIDUALS: standard rate, higher rate for blacklisted/non-cooperative jurisdictions, main exceptions.' },
];

const recipes = [
  ...pwc('FR', 'france'), ...pwc('DE', 'germany'), ...pwc('BE', 'belgium'), ...pwc('GB', 'united-kingdom'), ...pwc('IT', 'italy'),
  ...pwc('ES', 'spain'), ...pwc('ZA', 'south-africa'), ...pwc('PT', 'portugal'), ...pwc('CH', 'switzerland'),
  { id: 'pwc-MU-pit', method: 'page-extract', url: P('mauritius', 'individual/taxes-on-personal-income'), cells: ['MU:INCOME_TOP'],
    extract: 'Resident income tax bands and top rate; Fair Share Contribution rate, threshold and the income years it applies to.' },
  { id: 'pwc-MU-other', method: 'page-extract', url: P('mauritius', 'individual/other-taxes'), cells: OTHER.map((t) => `MU:${t}`),
    extract: 'Whether Mauritius levies inheritance, estate, gift or net wealth taxes (quote the "there are no ..." sentences).' },
  { id: 'pwc-MU-cg', method: 'page-extract', url: P('mauritius', 'corporate/income-determination'), cells: ['MU:CGT_FINANCIAL'],
    extract: 'The sentence on capital gains tax in Mauritius and its exception.' },
  { id: 'pwc-MU-property', method: 'page-extract', url: P('mauritius', 'corporate/other-taxes'), cells: ['MU:CGT_PROPERTY'],
    extract: 'Land transfer tax (rate, who pays, changes for non-citizens) and registration duty on immovable property.' },
  { id: 'pwc-MU-wht', method: 'page-extract', url: P('mauritius', 'corporate/withholding-taxes'), cells: ['MU:WHT_DIVIDEND', 'MU:WHT_INTEREST', 'treaty:MU-*:wht'],
    extract: 'Domestic WHT on dividends and interest (residents / non-residents) and the treaty table (dividends / interest) for BE, FR, DE, IT, ZA, GB, SC.' },
  { id: 'src-SC-income', method: 'page-extract', url: 'https://src.gov.sc/income-and-non-monetary-benefits-tax/', cells: ['SC:INCOME_TOP'],
    extract: 'Monthly income tax bands on emoluments for citizens and non-citizens; top rate and threshold.' },
  { id: 'src-SC-system', method: 'page-extract', url: 'https://src.gov.sc/seychelles-tax-system/',
    cells: ['SC:WHT_DIVIDEND', 'SC:WHT_INTEREST', 'SC:WEALTH_PROPERTY', 'SC:CGT_FINANCIAL', 'SC:WEALTH_NET', 'SC:WEALTH_SOLIDARITY', 'SC:SECURITIES_ACCOUNT', 'SC:FOREIGN_ASSET_TAX', 'SC:FOREIGN_PROPERTY'],
    extract: 'Every rate listed: WHT to non-residents (dividends, interest, bank-interest exceptions), Immovable Property Tax. Taxes NOT listed (CGT, inheritance, gift, wealth) stay needs_verification until an official statement confirms they do not exist.' },
  { id: 'chambers-SC-realestate', method: 'page-extract', url: 'https://practiceguides.chambers.com/practice-guides/real-estate-2026/seychelles', cells: ['SC:CGT_PROPERTY'],
    extract: 'Stamp duty and fees when a non-Seychellois buys immovable property; any capital gains tax on sale.' },
  { id: 'secondary-SC-death-taxes', method: 'page-extract', url: 'https://www.expanship.com/sc/blog/seychelles-inheritance-and-estate-tax', cells: ['SC:INHERITANCE_DIRECT', 'SC:INHERITANCE_OTHER'],
    extract: 'Whether Seychelles levies inheritance/estate tax. Secondary source: keep needs_verification = true.' },
  { id: 'law-DE-erbstg', method: 'page-extract', url: 'https://www.gesetze-im-internet.de/erbstg_1974/__19.html', cells: ['DE:INHERITANCE_DIRECT', 'DE:INHERITANCE_OTHER'],
    extract: 'The full §19(1) ErbStG rate table, every row for classes I–III (do not summarise). Allowances from §16: https://www.gesetze-im-internet.de/erbstg_1974/__16.html.' },
  { id: 'gov-GB-cgt', method: 'page-extract', url: 'https://www.gov.uk/capital-gains-tax/rates', cells: ['GB:CGT_FINANCIAL', 'GB:CGT_PROPERTY'],
    extract: 'CGT rates for basic and higher/additional-rate taxpayers for the current tax year; annual exempt amount from https://www.gov.uk/capital-gains-tax/allowances.' },
  { id: 'pwcnews-BE-cgt', method: 'page-extract', url: 'https://news.pwc.be/belgiums-comprehensive-capital-gains-tax-changes-key-updates-and-implications-starting-january-2026/', cells: ['BE:CGT_FINANCIAL'],
    extract: 'The 2026 Belgian capital gains tax on financial assets: rate, exemption, internal-gains rate, law date and publication. (The PwC WWTS individual page was still outdated on 2026-09-30.)' },
  { id: 'region-BE-inheritance', method: 'page-extract', url: 'https://www.vlaanderen.be/belastingen-en-begroting/vlaamse-belastingen/erfbelasting',
    alt_urls: ['https://fiscalite.brussels/', 'https://finances.wallonie.be/'],
    cells: ['BE-VLG', 'BE-BRU', 'BE-WAL'].flatMap((r) => [`${r}:INHERITANCE_DIRECT`, `${r}:INHERITANCE_OTHER`]),
    extract: 'Official regional inheritance tariffs: direct line lowest/highest, unrelated lowest/highest, upcoming reforms (Wallonia 2028). The 2026-09-30 run used secondary sources (pia.be, Expatica): replace them and clear needs_verification.' },
  { id: 'mra-MU-dta', method: 'page-extract', url: 'https://www.mra.mu/taxes-duties/international-taxation/double-taxation-agreements', cells: ['treaty:MU-*:status'],
    extract: 'Per target country: in force / awaiting signature / awaiting ratification / under negotiation / not listed (= none). Dates are in the treaty PDFs linked from the page.' },
  { id: 'src-SC-dta', method: 'page-extract', url: 'https://src.gov.sc/agreements/', cells: ['treaty:SC-*:status'],
    extract: 'Which target countries have a DTA with Seychelles. Listed = agreement exists (confirm in-force date from the treaty text); not listed = none.' },
  // ── Gates (jurisdiction_gate) ──
  { id: 'eu-annex-i', method: 'page-extract', url: 'https://taxation-customs.ec.europa.eu/taxation/common-eu-list-third-country-jurisdictions-tax-purposes_en',
    alt_urls: ['https://taxation-customs.ec.europa.eu/news/eu-updates-list-non-cooperative-tax-jurisdictions-highlighting-commitment-global-tax-good-governance-2026-02-17_en'],
    cells: ['gate:DE:blacklist:*'], extract: 'Current Annex I (non-cooperative) and Annex II (state of play) lists and their date. Are Mauritius / Seychelles on either? Germany applies Annex I (StAbwG).' },
  { id: 'fr-etnc', method: 'page-extract', url: 'https://kpmg.com/av/fr/avocats/eclairages/2026/06/publication-de-l-arrete-annuel-2026-fixant-la-liste-noire-francaise-des-etnc.html',
    cells: ['gate:FR:blacklist:*'], extract: 'The French ETNC list from the latest annual arrêté (JO date). Are Maurice / Seychelles listed or removed (and when)? Prefer the Légifrance arrêté text when available.' },
  { id: 'es-no-cooperativas', method: 'page-extract', url: 'https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-tributacion-no-residentes/anexos/jurisdicciones-no-cooperativas.html',
    cells: ['gate:ES:blacklist:*'], extract: "Spain's current non-cooperative jurisdictions (Orden HFP/115/2023 as amended). Mauricio / Seychelles listed? Latest modification and date." },
  { id: 'pt-portaria-150-2004', method: 'page-extract', url: 'https://files.dre.pt/1s/2004/02/037b00/08600860.pdf',
    alt_urls: ['https://diariodarepublica.pt/dr/legislacao-consolidada/portaria/2004-105808897'],
    cells: ['gate:PT:blacklist:*'], extract: 'Portaria 150/2004 list (PDF: read it as a document). Entries for Maurícias and Seychelles, then check the consolidated version / later portarias (2011, 2016, 292/2025) for removals.' },
  { id: 'it-dm-1999', method: 'page-extract', url: 'https://www.agenziaentrate.gov.it/portale/documents/20143/369991/DM+4_5_1999.pdf/fcbaea6a-1cf2-23ec-4a40-9f8f92acdc6e',
    cells: ['gate:IT:blacklist:*'], extract: 'DM 4 May 1999 (privileged-tax states for individuals), as in force: is "Maurizio" / "Seicelle" listed? (PDF: read it as a document.)' },
  { id: 'be-tax-havens', method: 'manual', url: 'https://fin.belgium.be/',
    cells: ['gate:BE:blacklist:*'], extract: "Belgium's yearly Excel of tax-haven lists (art. 179 KB/WIB 92, art. 73/4quater, Global Forum non/partially compliant). Is Mauritius / Seychelles on any? Seychelles was on the reporting list from 2021; its 2026 Global Forum upgrade may have removed it." },
  { id: 'hcch-trusts', method: 'page-extract', url: 'https://www.hcch.net/en/instruments/conventions/status-table/?cid=59',
    cells: ['gate:*:trust_recognition'], extract: 'Hague Trusts Convention (1985) status: parties with entry-into-force date, signatories only. Party = green; signed only = amber; not a party = amber ("recognition depends on domestic law").' },
  { id: 'marketing-rules', method: 'manual', url: '',
    cells: ['gate:*:marketing'], extract: 'Whether cross-border marketing of offshore structures to residents is allowed. No objective public source: Justus decides per country.' },
  { id: 'fx-eur', method: 'api', url: 'https://open.er-api.com/v6/latest/EUR', cells: ['fx_rate'],
    automation: 'node research/fetch-fx.mjs (run by /update-offshore-insights)', extract: 'EUR per unit for EUR, GBP, ZAR, CHF, MUR, SCR.' },
  { id: 'eurostat-employers', method: 'api',
    url: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lfsa_egaps?format=JSON&lang=EN&wstatus=SELF_S&sex=T&age=Y15-74&unit=THS_PER',
    cells: ['wealth_market.business_owners'], automation: 'node research/fetch-eurostat.mjs (run by /update-offshore-insights); n8n E1 exists but is paused',
    extract: 'JSON-stat: value × 1000 per geo per year.' },
  { id: 'ubs-gwr-millionaires', method: 'manual', url: 'https://www.ubs.com/global/en/wealthmanagement/insights/global-wealth-report.html', cells: ['wealth_market.millionaires'],
    extract: 'UBS Global Wealth Report, latest edition (2026 edition published 30 June 2026): USD millionaires per country from the databook PDF (registration required). One row per country and year, source "UBS Global Wealth Report <edition>". '
      + '2026 edition: main report p.21 "The UBS Millionaire Index" (thousands, end 2025) lists 34 markets; extract every one, not only ours (a market missing from the table is not published, never 0). The upper bands (5-10m, 10-50m, 50-100m) are growth rates only.' },
  // No HNWI recipe: Capgemini (investable assets > US$1m) publishes only global and regional totals and a few markets in prose,
  // Henley's lists are top-20 and not a dataset, and Altrata's free report has no country table (checked 2026-09-30 and 2026-10-02).
  // The US$1m tier is the UBS millionaire count above; the US$30m tier is Knight Frank below.
  { id: 'knightfrank-uhnwi', method: 'manual', url: 'https://www.knightfrank.com/wealthreport', cells: ['wealth_market.uhnwi_count'],
    extract: 'Knight Frank Wealth Report: UHNWI (> US$30m) population per country. '
      + '2026 edition: Databank "Global wealth populations by market" (2021, 2026, 2031f). Read with pdftotext -table (the -layout text shifts rows) and check each row against its % change column. About 50 markets are listed (markets under 500 UHNWIs are not); extract every one. Belgium is not listed.' },
  { id: 'ilo-employers', method: 'api', url: 'https://sdmx.ilo.org/rest/data/ILO,DF_EMP_TEMP_SEX_STE_NB,1.0/', cells: ['wealth_market.business_owners:GB', 'wealth_market.business_owners:ZA'],
    extract: 'node research/fetch-ilo.mjs. Employers (ICSE-93 status 2) from the national labour force survey via the ILO SDMX API, for the countries Eurostat lacks. Same definition as Eurostat SELF_S (France 2024: 1,382k vs 1,375k). Needs an explicit Accept-Language header.' },
];

writeFileSync(new URL('./recipes.json', import.meta.url), JSON.stringify({ version: 1, updated: '2026-09-30', recipes }, null, 2) + '\n');
const n = (m) => recipes.filter((r) => r.method === m).length;
console.log(`${recipes.length} recipes: ${n('api')} api, ${n('page-extract')} page-extract, ${n('manual')} manual`);
