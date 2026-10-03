// Shared test data for the report engine, sheets and document: a tiny world with a country XX, hubs MU and SC, and two index years.
import type { Dashboard } from './types';
import { DEFAULT_FEE_PCT, PRINCIPAL, type ReportParams } from './report';

export const J = (code: string, extra = {}) => ({ code, name: code, parent_code: null, kind: 'country', currency: 'EUR', tax_year_start: '01-01', next_budget_date: null,
  is_offshore_hub: false, notes: null, lon: 1, lat: 2, regional_tax_types: [], ...extra });
export const H = (j: string, t: string, rate: number, from: string, extra: Record<string, unknown> = {}) => ({ id: Math.random(), jurisdiction_code: j, tax_type_code: t,
  headline_rate: rate, valid_from: from, valid_to: null, verified_on: '2026-09-30', needs_verification: false, threshold_amount: null, source_url: `https://src.example/${j}/${t}`, ...extra });
export const T = (code: string, category: string, label = code) => ({ code, label, category, applies_to: ['individual'], is_recurring: true, description: null, sort_order: 1 });
export const R = (year: number, total_return_pct: number, basis = 'gross', extra = {}) => ({ index_code: 'MSCI_WORLD', index_name: 'MSCI World Index', year, total_return_pct, basis, currency: 'USD',
  source: 'MSCI factsheet', source_url: 'https://msci.example', verified_on: '2026-10-02', ...extra });

// 1 USD = 0.9 EUR, so 1 EUR = 1/0.9 USD: a EUR 9,000 exemption is US$10,000 and a EUR 450,000 allowance is US$500,000.
export const base = () => ({
  jurisdictions: [J('XX'), J('MU', { is_offshore_hub: true, tax_year_start: '07-01', currency: 'MUR' }), J('SC', { is_offshore_hub: true })],
  tax_types: [T('CGT_FINANCIAL', 'investment', 'Capital gains'), T('WEALTH_NET', 'wealth', 'Net wealth'), T('WEALTH_SOLIDARITY', 'wealth', 'Solidarity'),
    T('SECURITIES_ACCOUNT', 'wealth', 'Securities account'), T('FOREIGN_ASSET_TAX', 'anti_offshore', 'Foreign assets'), T('FOREIGN_PROPERTY', 'anti_offshore')],
  service_tax: ['CGT_FINANCIAL', 'WEALTH_NET', 'WEALTH_SOLIDARITY', 'INHERITANCE_DIRECT'].map((t) => ({ service_code: 'trust', tax_type_code: t, note: null })),
  fx: [{ currency: 'EUR', eur_per_unit: 1, as_of: '2026-10-01', source_url: '' }, { currency: 'USD', eur_per_unit: 0.9, as_of: '2026-10-01', source_url: '' },
    { currency: 'MUR', eur_per_unit: 0.02, as_of: '2026-10-01', source_url: '' }],
  rate_history: [
    H('XX', 'CGT_FINANCIAL', 30, '2020-01-01', { threshold_amount: 9000, valid_to: '2025-01-01' }), H('XX', 'CGT_FINANCIAL', 25, '2025-01-01', { threshold_amount: 9000 }),
    H('XX', 'WEALTH_NET', 1, '2020-01-01', { threshold_amount: 450000 }), H('XX', 'WEALTH_SOLIDARITY', 0, '2020-01-01'), H('XX', 'SECURITIES_ACCOUNT', 0.2, '2020-01-01'),
    H('MU', 'CGT_FINANCIAL', 0, '2020-01-01'), H('MU', 'WEALTH_NET', 0, '2020-01-01'), H('MU', 'WEALTH_SOLIDARITY', 0, '2020-01-01'), H('MU', 'SECURITIES_ACCOUNT', 0, '2020-01-01'),
    H('SC', 'CGT_FINANCIAL', 0, '2020-01-01'), H('SC', 'WEALTH_NET', 0, '2020-01-01'), H('SC', 'WEALTH_SOLIDARITY', 0, '2020-01-01'), H('SC', 'SECURITIES_ACCOUNT', 0, '2020-01-01'),
  ],
  market_returns: [R(2024, 10), R(2025, 20)],
  treaties: [{ country_a: 'MU', country_b: 'XX', status: 'none', signed_on: null, in_force_on: null, mli_note: null, source_url: null }],
  gates: [{ jurisdiction_code: 'XX', hub: 'MU', gate: 'blacklist', status: 'green', label: 'Not listed', note: null, source_url: 'https://list.example', needs_verification: false },
    { jurisdiction_code: 'XX', hub: null, gate: 'trust_recognition', status: 'red', label: 'Not a party', note: null, source_url: null, needs_verification: false }],
  notes: [{ id: 1, jurisdiction_code: 'MU', topic: 'crs', text: 'Structures are reported to the home country.', source_url: null, verified_on: null, sort_order: 1 }],
});
export const mk = (over: Record<string, unknown> = {}) => ({ ...base(), ...over }) as unknown as Dashboard;
export const P = (extra: Partial<ReportParams> = {}): ReportParams => ({ code: 'XX', structure: 'trust', hub: 'MU', startYear: 2024, endYear: 2024, principal: PRINCIPAL, feePct: DEFAULT_FEE_PCT, index: 'MSCI_WORLD', ...extra });
