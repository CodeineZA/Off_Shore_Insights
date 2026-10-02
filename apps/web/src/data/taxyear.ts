// Each country's own tax year. "Year 2025" always means the tax year that BEGINS in 2025:
// Belgium 1 Jan–31 Dec 2025, the UK 6 Apr 2025–5 Apr 2026 ("2025/26"), Mauritius 1 Jul 2025–30 Jun 2026.
// Mirrors research/checklist.mjs (the audit); both are tested against the same cases.
import type { Dashboard } from './types';
import { MONTHS } from './insights';

export interface TaxYear { startYear: number; start: string; end: string; label: string }
const pad = (n: number) => String(n).padStart(2, '0');

/** The tax year that begins in `startYear`, for a year starting on `startMD` ('01-01', '04-06', '07-01'). */
export function taxYearByStartYear(startMD: string | null | undefined, startYear: number): TaxYear {
  const [m, d] = (startMD || '01-01').split('-').map(Number);
  const start = `${startYear}-${pad(m)}-${pad(d)}`;
  const end = new Date(Date.UTC(startYear + 1, m - 1, d) - 86400000).toISOString().slice(0, 10);
  const calendar = (startMD || '01-01') === '01-01';
  return { startYear, start, end, label: calendar ? String(startYear) : `${startYear}/${String(startYear + 1).slice(2)}` };
}
/** The tax year containing the date `on` (ISO yyyy-mm-dd). */
export function taxYear(startMD: string | null | undefined, on: string): TaxYear {
  const [m, d] = (startMD || '01-01').split('-').map(Number);
  const y = Number(on.slice(0, 4));
  return taxYearByStartYear(startMD, on >= `${y}-${pad(m)}-${pad(d)}` ? y : y - 1);
}

/** The tax-year start (MM-DD) a jurisdiction follows: its own, else its country's. */
export const taxYearStartOf = (d: Dashboard, code: string): string | null => {
  const j = d.jurisdictions.find((x) => x.code === code);
  return j?.tax_year_start ?? d.jurisdictions.find((x) => x.code === j?.parent_code)?.tax_year_start ?? null;
};
export const taxYearOf = (d: Dashboard, code: string, on: string) => taxYear(taxYearStartOf(d, code), on);
export const taxYearFor = (d: Dashboard, code: string, startYear: number) => taxYearByStartYear(taxYearStartOf(d, code), startYear);

const day = (iso: string) => { const [, m, dd] = iso.split('-').map(Number); return `${dd} ${MONTHS[m - 1]}`; };
/** "6 Apr 2025–5 Apr 2026", or "1 Jan–31 Dec 2025" for a calendar year. */
export const spanText = (ty: TaxYear) => (ty.start.slice(5) === '01-01' ? `${day(ty.start)}–${day(ty.end)} ${ty.startYear}` : `${day(ty.start)} ${ty.start.slice(0, 4)}–${day(ty.end)} ${ty.end.slice(0, 4)}`);
/** "Tax year 2025/26 (6 Apr 2025–5 Apr 2026)" */
export const taxYearLine = (ty: TaxYear) => `Tax year ${ty.label} (${spanText(ty)})`;
