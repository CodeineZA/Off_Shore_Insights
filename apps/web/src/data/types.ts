// Shape of offshore_insights.dashboard() (db/schema.sql). Numbers arrive as JSON numbers.
// Fields marked optional arrived with the country-first schema (2026-10-02); a payload from before
// it (an old .fixture.json) simply lacks them, and every helper treats "absent" as "unknown".

export type TreatyStatus = 'in_force' | 'signed_not_in_force' | 'negotiating' | 'none' | 'unknown';
export type TaxCategory = 'investment' | 'estate' | 'wealth' | 'withholding' | 'income' | 'anti_offshore';

export interface Jurisdiction {
  code: string; name: string; parent_code: string | null; kind: 'country' | 'region';
  currency: string; tax_year_start: string | null; next_budget_date: string | null;
  is_offshore_hub: boolean; notes: string | null; lon: number | null; lat: number | null;
  /** Taxes this country sets per region; its regions never inherit these national rates. */
  regional_tax_types?: string[];
  /** The capital, where the map pins its bars. */
  capital?: string | null; capital_lon?: number | null; capital_lat?: number | null; iso3?: string | null;
  /** Date it was last checked for taxes set below national level; null = not researched yet. */
  structure_checked_on?: string | null; structure_note?: string | null;
  sort_order?: number | null;
  /** 'heirs' = death tax on each heir's share, 'estate' = on the whole estate. */
  estate_basis?: 'heirs' | 'estate' | null;
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
/** Every rate row, current and closed: the row is in force on [valid_from, valid_to). */
export interface RateHistory {
  id: number; jurisdiction_code: string; tax_type_code: string; headline_rate: number | null;
  valid_from: string; valid_to: string | null; verified_on: string; needs_verification: boolean;
  rate_min?: number | null; rate_max?: number | null; threshold_amount?: number | null; threshold_note?: string | null;
  note?: string | null; source_url?: string | null; next_check_on?: string;
}
export interface Treaty {
  id: number; country_a: string; country_b: string; status: TreatyStatus;
  signed_on: string | null; in_force_on: string | null; mli_note: string | null;
  wht_dividend: number | null; wht_interest: number | null;
  source_url: string | null; verified_on: string; next_check_on: string;
}
export interface Wealth {
  id: number; jurisdiction_code: string; year: number; millionaires: number | null;
  uhnwi_count: number | null; business_owners: number | null;
  private_wealth_usd_bn?: number | null; trusts_count?: number | null; private_companies_count?: number | null;
  /** The date the figure is "as at"; it belongs to the tax year containing it. */
  ref_date?: string | null;
  source: string; source_url: string | null; verified_on: string;
}
export interface Note {
  id: number; jurisdiction_code: string; topic: string; text: string;
  source_url: string | null; verified_on: string | null; sort_order: number;
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
export interface Service { code: string; label: string; description: string | null; sort_order: number }
export interface ServiceTax { service_code: string; tax_type_code: string; note: string | null }
export interface ResearchItem {
  jurisdiction_code: string; item: string; status: 'have' | 'missing' | 'blocked' | 'stale';
  detail: string | null; where_to_get: string | null; checked_on: string;
}
export interface AdvisorCategory { code: string; label: string; sort_order: number }
/** The slim firm row the page lists (contact details stay in the table). */
export interface Advisor {
  id: number; name: string; category_code: string; categories: string[]; country_code: string; region_code: string | null;
  city: string | null; tax_topics: string[]; services: string[]; status: 'candidate' | 'verified' | 'excluded';
}

export interface Dashboard {
  generated_at: string;
  me: { username: string; display_name: string | null; is_admin?: boolean } | null;
  jurisdictions: Jurisdiction[]; tax_types: TaxType[]; rates: Rate[]; rate_history: RateHistory[];
  treaties: Treaty[]; wealth: Wealth[]; notes: Note[]; flags: Flag[]; runs: Run[];
  gates: Gate[]; fx: Fx[];
  services?: Service[]; service_tax?: ServiceTax[]; research_items?: ResearchItem[];
  advisor_categories?: AdvisorCategory[]; advisors?: Advisor[];
}
