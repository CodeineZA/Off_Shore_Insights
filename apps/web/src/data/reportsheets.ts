// The raw values behind a report, as plain sheets: the Excel is built from exactly this, and from the same ReportOk the
// screen and the PDF show, so the three can never disagree. Pure: no Excel library in here. Every money column says its currency.
import type { Dashboard } from './types';
import { sourcesForReport } from './sources';
import { CURRENCY_NAME, STRUCTURES, fmtMoney, type ReportOk } from './report';

export type Cell = string | number | null;
export interface SheetColumn { header: string; width: number; fmt?: string }
export interface Sheet { name: string; columns: SheetColumn[]; rows: Cell[][] }
export interface ReportMeta { generatedOn: string; dataAsOf: string }

const MONEY = '#,##0', PCT = '0.00', RATE = '0.###';

export function reportSheets(d: Dashboard, r: ReportOk, meta: ReportMeta): Sheet[] {
  const p = r.params, struct = STRUCTURES[p.structure].label, U = r.currency;
  const name = (code: string) => d.jurisdictions.find((x) => x.code === code)?.name ?? code;
  const summary: Sheet = {
    name: 'Summary', columns: [{ header: 'Item', width: 38 }, { header: 'Value', width: 62 }],
    rows: [
      ['Report', `What ${fmtMoney(p.principal, U)} would have become, ${r.startYear} to ${r.endYear}`],
      ['Currency', `${U} (${CURRENCY_NAME[U]})`],
      ['Kept in', r.homeName], ['Country', r.countryName], ['Structure', `${struct} in ${r.hubName}`],
      ['Start of year', r.startYear], ['End of year', r.endYear], [`Principal (${U})`, p.principal],
      ['Index', r.returns[0]?.index_name ?? p.index], ['Index return basis', r.basis], ['Trust fee (% of value a year)', p.feePct],
      [`Value at end ${r.endYear}, kept in ${r.homeName} (${U})`, Math.round(r.home.end)],
      [`Value at end ${r.endYear}, through the ${r.hubName} ${struct.toLowerCase()} (${U})`, Math.round(r.trust.end)],
      [`Difference (${U})`, Math.round(r.difference)], ['Difference (% of the value kept at home)', Number(r.differencePct.toFixed(4))],
      [`Tax paid kept at home (${U})`, Math.round(r.home.tax)], [`Tax paid through the structure (${U})`, Math.round(r.trust.tax)], [`Fees paid through the structure (${U})`, Math.round(r.trust.fee)],
      ['Report built on', meta.generatedOn], ['Database as of', meta.dataAsOf], ['Statement', r.summary],
    ],
  };
  const yearly: Sheet = {
    name: 'Yearly',
    columns: [{ header: 'Year', width: 8 }, { header: `Index return % (${U})`, width: 19, fmt: PCT },
      { header: `Home: start of year (${U})`, width: 24, fmt: MONEY }, { header: `Home: gain (${U})`, width: 18, fmt: MONEY }, { header: `Home: capital gains tax (${U})`, width: 28, fmt: MONEY },
      { header: `Home: wealth taxes (${U})`, width: 24, fmt: MONEY }, { header: `Home: end of year (${U})`, width: 22, fmt: MONEY },
      { header: `Trust: start of year (${U})`, width: 24, fmt: MONEY }, { header: `Trust: gain (${U})`, width: 18, fmt: MONEY }, { header: `Trust: capital gains tax (${U})`, width: 28, fmt: MONEY },
      { header: `Trust: wealth taxes (${U})`, width: 24, fmt: MONEY }, { header: `Trust: fee (${U})`, width: 17, fmt: MONEY }, { header: `Trust: end of year (${U})`, width: 22, fmt: MONEY },
      { header: `Difference at year end (${U})`, width: 26, fmt: MONEY }],
    rows: r.years.map((y) => [y.year, y.returnPct, y.home.start, y.home.gain, y.home.cgt, y.home.wealth, y.home.end,
      y.trust.start, y.trust.gain, y.trust.cgt, y.trust.wealth, y.trust.fee, y.trust.end, y.trust.end - y.home.end].map((v, i) => (i < 2 || typeof v !== 'number' ? v : Math.round(v)))),
  };
  const rates: Sheet = {
    name: 'Rates used',
    columns: [{ header: 'Side', width: 8 }, { header: 'Year', width: 7 }, { header: 'Tax', width: 28 }, { header: 'Charged in', width: 18 },
      { header: 'Relieved by the structure', width: 24 }, { header: 'Rate %', width: 9, fmt: RATE }, { header: 'Allowance (local currency)', width: 24, fmt: MONEY },
      { header: 'Currency', width: 9 }, { header: `Allowance (${U})`, width: 17, fmt: MONEY }, { header: 'Allowance note', width: 40 }, { header: 'Note', width: 60 },
      { header: 'To verify', width: 10 }, { header: 'Source', width: 70 }, { header: 'Checked on', width: 12 }],
    rows: r.rates.map((x) => [x.side === 'home' ? 'Home' : 'Trust', x.year, x.label, name(x.jurisdiction) + (x.inherited ? ' (inherited)' : ''), x.relieved ? 'Yes' : 'No', x.rate,
      x.thresholdLocal, x.currency, x.thresholdConverted == null ? null : Math.round(x.thresholdConverted), x.thresholdNote, x.note, x.needsVerification ? 'Yes' : 'No', x.sourceUrl, x.verifiedOn]),
  };
  const returns: Sheet = {
    name: 'Index returns',
    columns: [{ header: 'Year', width: 7 }, { header: 'Index', width: 22 }, { header: 'Basis', width: 8 }, { header: 'Currency', width: 9 }, { header: 'Total return %', width: 15, fmt: PCT },
      { header: 'Source', width: 110 }, { header: 'Address', width: 70 }, { header: 'Checked on', width: 12 }],
    rows: r.returns.map((x) => [x.year, x.index_name, x.basis, x.currency, x.total_return_pct, x.source, x.source_url, x.verified_on]),
  };
  const flags: Sheet = {
    name: 'Flags', columns: [{ header: 'Level', width: 8 }, { header: 'What we hold', width: 110 }, { header: 'Source', width: 70 }],
    rows: r.flags.map((f) => [f.level, f.text, f.sourceUrl]),
  };
  const assumptions: Sheet = {
    name: 'Assumptions', columns: [{ header: '#', width: 5 }, { header: 'Assumption', width: 150 }],
    rows: r.assumptions.map((a, i) => [i + 1, a]),
  };
  const sources: Sheet = {
    name: 'Sources',
    columns: [{ header: 'Group', width: 22 }, { header: 'Source', width: 44 }, { header: 'Kind', width: 12 }, { header: 'Page', width: 70 }, { header: 'Dated copy taken', width: 17 },
      { header: 'Checked on', width: 12 }, { header: 'To verify', width: 10 }, { header: 'Supports', width: 90 }],
    rows: sourcesForReport(d, r).flatMap((g) => g.entries.map((e): Cell[] => [g.title, e.name, e.kind === 'unknown' ? '' : e.kind, e.url, e.archived?.on ?? null, e.verifiedOn, e.check ? 'Yes' : 'No', e.supports.join(' | ')])),
  };
  return [summary, yearly, rates, returns, flags, assumptions, sources];
}
