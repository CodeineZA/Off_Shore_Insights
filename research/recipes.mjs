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
  { id: 'eurostat-employers', method: 'api',
    url: 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/lfsa_egaps?format=JSON&lang=EN&wstatus=SELF_S&sex=T&age=Y15-74&unit=THS_PER',
    cells: ['wealth_market.business_owners'], automation: 'n8n workflow E1 (monthly) · n8n/src/e1-fetch-eurostat.js',
    extract: 'JSON-stat: value × 1000 per geo per year.' },
  { id: 'ubs-gwr-millionaires', method: 'manual', url: 'https://www.ubs.com/global/en/wealthmanagement/insights/global-wealth-report.html', cells: ['wealth_market.millionaires'],
    extract: 'UBS Global Wealth Report, latest edition (2026 edition published 30 June 2026): USD millionaires per country from the databook PDF (registration required). One row per country and year, source "UBS Global Wealth Report <edition>".' },
  { id: 'capgemini-hnwi', method: 'manual', url: 'https://www.capgemini.com/insights/research-library/world-wealth-report/', cells: ['wealth_market.hnwi_count'],
    extract: 'Capgemini World Wealth Report: HNWI population per country (largest markets only).' },
  { id: 'knightfrank-uhnwi', method: 'manual', url: 'https://www.knightfrank.com/wealthreport', cells: ['wealth_market.uhnwi_count'],
    extract: 'Knight Frank Wealth Report: UHNWI (> US$30m) population per country.' },
];

writeFileSync(new URL('./recipes.json', import.meta.url), JSON.stringify({ version: 1, updated: '2026-09-30', recipes }, null, 2) + '\n');
const n = (m) => recipes.filter((r) => r.method === m).length;
console.log(`${recipes.length} recipes: ${n('api')} api, ${n('page-extract')} page-extract, ${n('manual')} manual`);
