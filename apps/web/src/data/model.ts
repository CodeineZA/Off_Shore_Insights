// The red / green lists behind the country brief: a treaty with the hub, the hub's blacklist, trust recognition.
// Pure functions over the dashboard() payload.
import type { Dashboard, Gate, TreatyStatus } from './types';
import { countryOf } from './insights';

// No "marketing allowed" gate: it was never stored, only ever unknown, and is a legal call that is not ours.
export type GateKey = 'treaty' | 'blacklist' | 'trust_recognition';
export type GateStatus = 'green' | 'amber' | 'red' | 'unknown';
export const GATES: { key: GateKey; label: string; hubSpecific: boolean }[] = [
  { key: 'treaty', label: 'Tax treaty', hubSpecific: true },
  { key: 'blacklist', label: 'Blacklist', hubSpecific: true },
  { key: 'trust_recognition', label: 'Trust recognition', hubSpecific: false },
];
export interface GateCell { key: GateKey; status: GateStatus; label: string; note: string | null; source: string | null; check: boolean }
const TREATY_GATE: Record<TreatyStatus, { status: GateStatus; label: string }> = {
  in_force: { status: 'green', label: 'In force' }, signed_not_in_force: { status: 'amber', label: 'Signed' },
  negotiating: { status: 'amber', label: 'Negotiating' }, none: { status: 'red', label: 'No treaty' }, unknown: { status: 'unknown', label: 'Unknown' },
};
/** Structures are set up in Mauritius first and moved to Seychelles afterwards (Hentus, 2026-09-30),
 *  so the Mauritius treaty is the one that counts for both hubs. */
export const TREATY_HUB = 'MU';
export function gateCells(d: Dashboard, code: string, hub: string): GateCell[] {
  const country = countryOf(d, code);   // regions share their country's treaty and lists
  return GATES.map((g) => {
    if (g.key === 'treaty') {
      const t = d.treaties.find((x) => x.country_a === TREATY_HUB && x.country_b === country);
      const s = TREATY_GATE[t?.status ?? 'unknown'];
      const since = t?.in_force_on ? ` (in force ${t.in_force_on.slice(0, 4)})` : '';
      const via = hub === TREATY_HUB ? '' : 'Via Mauritius: structures are set up there first, then moved. ';
      return { key: g.key, ...s, note: via + (t ? (t.mli_note ?? s.label) + since : 'No treaty data yet'), source: t?.source_url ?? null, check: false };
    }
    const find = (c: string) => d.gates.find((x) => x.jurisdiction_code === c && x.gate === g.key && (g.hubSpecific ? x.hub === hub : x.hub == null));
    const row: Gate | undefined = find(code) ?? find(country);
    return row ? { key: g.key, status: row.status, label: row.label, note: row.note, source: row.source_url, check: row.needs_verification }
      : { key: g.key, status: 'unknown', label: 'Unknown', note: 'Not researched yet', source: null, check: false };
  });
}
