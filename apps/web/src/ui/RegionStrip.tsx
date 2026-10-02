// The regions of the selected country, each with its own bar chart of the taxes the country sets per region
// (one shared scale, so regions compare). Also a way to pick a region, for when its outline is not on the map.
import type { Dashboard } from '../data/types';
import { regionBars, type Focus, zoomTo } from '../data/mapdata';
import { taxYearFor } from '../data/taxyear';
import { pct, shortLabel } from '../data/insights';

export default function RegionStrip({ d, focus, onFocus, years }: { d: Dashboard; focus: Focus; onFocus: (f: Focus) => void; years: number[] }) {
  if (!focus.country) return null;
  const year = Math.max(...years);
  const regions = regionBars(d, focus.country, year);
  if (!regions.length) return null;
  const max = Math.max(1, ...regions.flatMap((r) => r.bars.map((b) => b.rate ?? 0)));
  const country = d.jurisdictions.find((j) => j.code === focus.country)!;
  return (
    <section className="regionstrip" aria-label={`Regions of ${country.name}`}>
      <div className="regionstrip-head">
        <h2 className="card-title">Regions of {country.name}</h2>
        <p>{country.name} sets {regions[0].bars.map((b) => { const t = d.tax_types.find((x) => x.code === b.taxType); return (t ? shortLabel(t) : b.label).toLowerCase(); }).join(' and ')} by region. Tax year {taxYearFor(d, country.code, year).label}, one shared scale. Click a region to narrow the page to it.</p>
      </div>
      <div className="regions">
        {regions.map((r) => (
          <button key={r.code} className={'region-card' + (focus.region === r.code ? ' on' : '')} aria-pressed={focus.region === r.code} onClick={() => onFocus(zoomTo(d, focus, r.code))}>
            <b>{r.name}</b>
            {r.bars.map((b, i) => (
              <div key={b.taxType} className="region-bar">
                <span>{(() => { const t = d.tax_types.find((x) => x.code === b.taxType); return t ? shortLabel(t) : b.label; })()}</span>
                {b.rate == null ? <i className="unknown" title="No figure" /> : <i className={i % 2 ? 'alt' : ''} style={{ width: `${Math.max(1, (b.rate / max) * 100)}%` }} />}
                <em>{b.rate == null ? '?' : pct(b.rate)}</em>
              </div>
            ))}
          </button>
        ))}
      </div>
    </section>
  );
}
