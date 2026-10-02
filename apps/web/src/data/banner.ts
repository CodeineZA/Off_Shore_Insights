// The facts the banner states first for the entity you drilled to: both treaties with their dates, the tax year
// next to when the data was last updated, the red/green gates, and how the country is structured.
import type { Dashboard, Note, Treaty, TreatyStatus } from './types';
import { countryOf, fmtDate, shortLabel } from './insights';
import { gateCells, type GateStatus } from './model';
import { taxYearFor, taxYearLine, type TaxYear } from './taxyear';
import { treatyForYear, type TreatyAtYear } from './years';

export interface TreatyFact { hub: 'MU' | 'SC'; hubName: string; status: TreatyStatus; short: string; text: string; /** the date we hold, if any */ date: string | null; sourceUrl: string | null }
export interface GateFact { label: string; status: GateStatus; detail: string | null }
export interface BannerFacts {
  code: string; name: string; isRegion: boolean; countryName: string;
  headline: string; kicker: string; standfirst: string;
  treaties: TreatyFact[]; gates: GateFact[]; taxYears: TaxYear[]; updated: string | null;
}

const SHORT: Record<TreatyStatus, string> = { in_force: 'in force', signed_not_in_force: 'signed', negotiating: 'under negotiation', none: 'none', unknown: 'not yet known' };
const dmy = (iso: string | null) => (iso ? fmtDate(iso) : null);

export function treatyText(t: Treaty | undefined, at: TreatyAtYear | null): { status: TreatyStatus; short: string; text: string; date: string | null } {
  if (!t || !at) return { status: 'unknown', short: SHORT.unknown, text: 'No treaty data yet', date: null };
  const note = at.known ? '' : ' (today\'s status)';
  switch (at.status) {
    case 'in_force': return { status: 'in_force', short: SHORT.in_force, date: t.in_force_on, text: (t.in_force_on ? `In force since ${dmy(t.in_force_on)}` : 'In force, date to confirm') + note };
    case 'signed_not_in_force': return { status: at.status, short: SHORT.signed_not_in_force, date: t.signed_on, text: (t.signed_on ? `Signed ${dmy(t.signed_on)}, not yet in force` : 'Signed, date to confirm') + note };
    case 'negotiating': return { status: at.status, short: SHORT.negotiating, date: null, text: 'Under negotiation' + note };
    case 'none': return { status: at.status, short: SHORT.none, date: null, text: 'No treaty' + note };
    default: return { status: 'unknown', short: SHORT.unknown, date: null, text: 'Not researched yet' };
  }
}

/** Warnings first, then the rest in the order the research notes are kept. */
const TOPIC_ORDER = ['warning', 'anti_avoidance', 'residency', 'crs', 'sales_angle'];
const topicRank = (t: string) => { const i = TOPIC_ORDER.indexOf(t); return i < 0 ? TOPIC_ORDER.length : i; };
export interface BriefNotes { notes: Note[]; /** Tax types whose current rate for this entity still needs checking. */ toCheck: string[] }
/** The notes under the banner: the entity's own and its country's (a region shows both), plus what still needs verifying. */
export function briefNotes(d: Dashboard, code: string): BriefNotes {
  const country = countryOf(d, code);
  const notes = d.notes.filter((n) => n.jurisdiction_code === code || n.jurisdiction_code === country)
    .sort((a, b) => topicRank(a.topic) - topicRank(b.topic) || a.sort_order - b.sort_order);
  const toCheck = d.rates.filter((r) => r.jurisdiction_code === code && r.needs_verification && !r.inherited)
    .map((r) => shortLabel(d.tax_types.find((t) => t.code === r.tax_type_code)!));
  return { notes, toCheck };
}

export function bannerFacts(d: Dashboard, code: string, years: number[]): BannerFacts | null {
  const j = d.jurisdictions.find((x) => x.code === code);
  if (!j || !years.length) return null;
  const isRegion = j.kind === 'region';
  const country = isRegion ? d.jurisdictions.find((x) => x.code === j.parent_code)! : j;
  const ys = [...years].sort((a, b) => a - b);
  const latest = ys[ys.length - 1];
  const taxYears = ys.map((y) => taxYearFor(d, code, y));

  const treaties: TreatyFact[] = (['MU', 'SC'] as const).map((hub) => {
    const t = d.treaties.find((x) => x.country_a === hub && x.country_b === country.code);
    return { hub, hubName: hub === 'MU' ? 'Mauritius' : 'Seychelles', ...treatyText(t, treatyForYear(d, hub, country.code, latest)), sourceUrl: t?.source_url ?? null };
  });
  const [mu, sc] = [gateCells(d, code, 'MU'), gateCells(d, code, 'SC')];
  const gates: GateFact[] = [
    { label: 'Blacklist, Mauritius', status: mu.find((g) => g.key === 'blacklist')!.status, detail: mu.find((g) => g.key === 'blacklist')!.label },
    { label: 'Blacklist, Seychelles', status: sc.find((g) => g.key === 'blacklist')!.status, detail: sc.find((g) => g.key === 'blacklist')!.label },
    { label: 'Trust recognition', status: mu.find((g) => g.key === 'trust_recognition')!.status, detail: mu.find((g) => g.key === 'trust_recognition')!.label },
  ];

  // When the rates we show were last checked: the newest verification date among this entity's own current rows.
  const mine = d.rate_history.filter((r) => r.jurisdiction_code === code && r.valid_to == null);
  const rows = mine.length ? mine : d.rate_history.filter((r) => r.jurisdiction_code === country.code && r.valid_to == null);
  const updated = rows.length ? rows.reduce((m, r) => (r.verified_on > m ? r.verified_on : m), '') : null;

  const taxYearText = taxYears.length === 1 ? taxYearLine(taxYears[0]) : `Tax years ${taxYears.map((t) => t.label).join(', ')}`;
  const structure = isRegion
    ? `${j.name} sets its own ${(country.regional_tax_types ?? []).map((t) => { const x = d.tax_types.find((y) => y.code === t); return x ? shortLabel(x).toLowerCase() : t; }).join(' and ') || 'rates'}. Everything else, the treaties, the lists and the money figures, comes from ${country.name}.`
    : j.structure_checked_on ? (j.structure_note ?? 'One national regime: the same taxes everywhere in the country.') : 'Which taxes are set by regions has not been checked yet.';
  return {
    code, name: j.name, isRegion, countryName: country.name,
    headline: `${j.name}: treaty with Mauritius ${treaties[0].short}, with Seychelles ${treaties[1].short}`,
    kicker: `${taxYearText} · ${updated ? `rates last checked ${dmy(updated)}` : 'no rates checked yet'}`,
    standfirst: structure, treaties, gates, taxYears, updated,
  };
}
