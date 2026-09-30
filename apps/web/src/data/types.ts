// Shape of offshore_insights.dashboard() (db/schema.sql). Numbers arrive as JSON numbers.

export type TreatyStatus = 'in_force' | 'signed_not_in_force' | 'negotiating' | 'none' | 'unknown';
export type TaxCategory = 'investment' | 'estate' | 'wealth' | 'withholding' | 'income' | 'anti_offshore';

export interface Jurisdiction {
  code: string; name: string; parent_code: string | null; kind: 'country' | 'region';
  currency: string; tax_year_start: string | null; next_budget_date: string | null;
  is_offshore_hub: boolean; notes: string | null; lon: number | null; lat: number | null;
}
export interface TaxType {
  code: string; label: string; category: TaxCategory; applies_to: string[];
  is_recurring: boolean; description: string | null; sort_order: number;
}
/** A known current rate (v_current_rates, headline_rate not null). Absent = unknown. */
export interface Rate {
  jurisdiction_code: string; name: string; parent_code: string | null; tax_type_code: string;
  label: string; category: TaxCategory; applies_to: string[]; is_recurring: boolean; sort_order: number;
  headline_rate: number; rate_min: number | null; rate_max: number | null;
  threshold_amount: number | null; threshold_note: string | null; note: string | null;
  source_url: string | null; verified_on: string | null; next_check_on: string | null;
  needs_verification: boolean; inherited: boolean; tax_rate_id: number;
}
export interface RateHistory {
  id: number; jurisdiction_code: string; tax_type_code: string; headline_rate: number | null;
  valid_from: string; valid_to: string | null; verified_on: string; needs_verification: boolean;
}
export interface Treaty {
  id: number; country_a: string; country_b: string; status: TreatyStatus;
  signed_on: string | null; in_force_on: string | null; mli_note: string | null;
  wht_dividend: number | null; wht_interest: number | null;
  source_url: string | null; verified_on: string; next_check_on: string;
}
export interface Wealth {
  id: number; jurisdiction_code: string; year: number; millionaires: number | null;
  hnwi_count: number | null; uhnwi_count: number | null; business_owners: number | null;
  source: string; source_url: string | null; verified_on: string;
}
export interface Note {
  id: number; jurisdiction_code: string; topic: string; text: string;
  source_url: string | null; verified_on: string | null; sort_order: number;
}
export interface Signal {
  jurisdiction_code: string; name: string; treaty_mu: TreatyStatus; treaty_sc: TreatyStatus;
  wealth_year: number | null; millionaires: number | null; hnwi_count: number | null;
  uhnwi_count: number | null; business_owners: number | null; recurring_taxes: number | null;
  top_inheritance_rate: number | null; top_wealth_rate: number | null;
  anti_offshore_taxes: number | null; known_rates: number | null; unverified_rates: number | null;
}
export interface Flag {
  id: number; target_table: 'tax_rate' | 'treaty' | 'wealth_market'; target_id: number;
  reason: 'due' | 'page_changed' | 'fetch_failed'; status: 'pending' | 'confirmed' | 'needs_update' | 'resolved';
  detail: string | null; raised_on: string; reviewed_on: string | null;
}
export interface Gate {
  id: number; jurisdiction_code: string; hub: string | null; gate: 'blacklist' | 'trust_recognition' | 'marketing';
  status: 'green' | 'amber' | 'red'; label: string; note: string | null; source_url: string | null;
  verified_on: string; next_check_on: string; needs_verification: boolean;
}
export interface Fx { currency: string; eur_per_unit: number; as_of: string; source_url: string }
export interface Run { workflow: string; status: 'running' | 'ok' | 'error'; started_at: string; finished_at: string | null; rows: number | null }

export interface Dashboard {
  generated_at: string;
  me: { username: string; display_name: string | null; is_admin?: boolean } | null;
  jurisdictions: Jurisdiction[]; tax_types: TaxType[]; rates: Rate[]; rate_history: RateHistory[];
  treaties: Treaty[]; wealth: Wealth[]; notes: Note[]; signals: Signal[]; flags: Flag[]; runs: Run[];
  gates: Gate[]; fx: Fx[];
}
