// Year slicer: any combination of tax years. A chip is the tax year that BEGINS in that year, in each country's own
// calendar (UK 2025 = 6 Apr 2025–5 Apr 2026), and the caption spells the dates out for whatever is in focus.
import type { Dashboard } from '../data/types';
import { taxYearFor, taxYearLine } from '../data/taxyear';
import { toggleYear } from '../data/years';

export default function YearSlicer({ d, years, value, code, hasData, onChange }: {
  d: Dashboard; years: number[]; value: number[]; code: string | null; hasData: Set<number>; onChange: (v: number[]) => void;
}) {
  const name = code ? d.jurisdictions.find((j) => j.code === code)?.name : null;
  const caption = code
    ? `${name}: ${[...value].sort().map((y) => taxYearLine(taxYearFor(d, code, y)).replace('Tax year ', '')).join(' · ')}`
    : 'Each country uses its own tax year that begins in the year you pick (for the UK, 2025 is 6 Apr 2025–5 Apr 2026).';
  return (
    <div className="filter-row yearbar">
      <span className="filter-k">Tax year</span>
      <div className="chips" role="group" aria-label="Tax years">
        <button className="chip" onClick={() => onChange(years.slice(-1))} aria-pressed={value.length === 1 && value[0] === years[years.length - 1]}>Latest</button>
        <button className="chip" onClick={() => onChange(years)} aria-pressed={value.length === years.length}>All</button>
        <span className="chip-sep" aria-hidden="true" />
        {years.map((y) => (
          <button key={y} className={'chip' + (value.includes(y) ? ' on' : '') + (hasData.has(y) ? '' : ' nodata')} aria-pressed={value.includes(y)}
            title={code ? (hasData.has(y) ? taxYearLine(taxYearFor(d, code, y)) : `No figures for ${taxYearLine(taxYearFor(d, code, y))}`) : `The tax year that begins in ${y}`}
            onClick={() => onChange(toggleYear(value, y))}>{y}</button>
        ))}
      </div>
      <p className="yearbar-caption">{caption}</p>
    </div>
  );
}
