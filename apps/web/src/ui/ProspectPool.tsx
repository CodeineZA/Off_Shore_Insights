// The prospect pool: how many potential clients the country has, by tier, one bar per selected tax year.
// Every tier shares one scale (a narrow tier reads as the sliver it is), tiers are never added up, and a tier with
// no figure is a dashed stub, never 0. A year without a figure of its own shows the newest earlier one as a paler bar.
import type { Dashboard } from '../data/types';
import { fmtDate } from '../data/insights';
import { poolMax, prospectPool, type PoolCell } from '../data/pool';
import { taxYearFor } from '../data/taxyear';
import { niceMax } from './geom';
import { shade } from './shade';

const count = (v: number) => Math.round(v).toLocaleString('en');
const paler = (c: string) => `color-mix(in srgb, ${c} 32%, transparent)`;
const cellTitle = (c: PoolCell) => c.value == null ? `${c.label}: no figure published`
  : `${c.label}: ${count(c.value)}${c.carried ? ` (the ${c.asAt} figure: none for this tax year)` : ''}\n${c.source ?? 'no source yet'}${c.refDate ? ` · as at ${fmtDate(c.refDate)}` : ''}`;

export default function ProspectPool({ d, code, years, filtered }: { d: Dashboard; code: string; years: number[]; filtered: boolean }) {
  const pool = prospectPool(d, code, years);
  if (!pool) return null;
  const name = d.jurisdictions.find((j) => j.code === code)?.name ?? code;
  const owner = d.jurisdictions.find((j) => j.code === pool.owner)?.name ?? pool.owner;
  const ys = [...years].sort((a, b) => a - b);
  const max = niceMax(poolMax(pool.rows));
  const anyCarried = pool.rows.some((r) => r.cells.some((c) => c.carried));
  const anyUnknown = pool.rows.some((r) => r.cells.some((c) => c.value == null));
  return (
    <section className="pool-panel" aria-label="Prospect pool">
      <header className="taxslicer-head">
        <div>
          <h2 className="card-title">Prospect pool</h2>
          <p className="card-purpose">
            How many potential clients {pool.inherited ? `${owner} has (country-wide: ${name} has no figures of its own)` : `${name} has`}, by tier.
            The tiers overlap and come from different reports, so they are not added up.
            {filtered ? ' These are people, not a tax, so the tax focus does not filter them.' : ''}
          </p>
        </div>
      </header>
      <div className="legend card-legend" aria-label="Legend">
        {ys.map((y, i) => <span key={y}><i style={{ background: shade(i, ys.length), borderRadius: 2 }} />{owner}, tax year {taxYearFor(d, pool.owner, y).label}</span>)}
        {anyCarried && <span><i style={{ background: paler('#d8b07a'), border: '1px solid #d8b07a', borderRadius: 2 }} />Paler: the newest earlier figure, none for that tax year</span>}
        {anyUnknown && <span><i style={{ background: 'transparent', border: '1px dashed #9a9185', borderRadius: 2 }} />Dashed: no figure published</span>}
      </div>
      <div className="poolrow axis-row" aria-hidden="true">
        <span className="axis-cap">Tier</span>
        <span className="axis-scale"><b>0</b><em>people (trusts: number of trusts)</em><b>{count(max)}</b></span>
        <span className="axis-cap r">{ys.length > 1 ? 'Latest' : 'Count'}</span>
      </div>
      {pool.rows.map((r) => (
        <div className="poolrow" key={r.key}>
          <span className="poolrow-label">
            <b><i style={{ background: r.color }} aria-hidden="true" />{r.label}</b>
            <small className="tax-explain">{r.what}</small>
            <small className="tax-explain">{r.latest.value == null ? 'No source yet' : `${r.latest.source ?? 'no source yet'}${r.latest.refDate ? ` · as at ${fmtDate(r.latest.refDate)}` : ''}`}</small>
          </span>
          <span className="pool-track">
            {r.cells.map((c, i) => c.value == null
              ? <i key={c.year} className="bar unknown" title={cellTitle(c)} />
              : <i key={c.year} className="bar"
                  style={{ width: `${Math.max(0.8, (c.value / max) * 100)}%`, background: c.carried ? paler(shade(i, ys.length)) : shade(i, ys.length), borderColor: shade(i, ys.length) }} title={cellTitle(c)} />)}
          </span>
          <span className="poolrow-val">
            {r.latest.value == null ? '?' : count(r.latest.value)}
            <small>{r.latest.value == null ? 'not published' : r.latest.carried ? `${r.latest.asAt} figure` : r.latest.asAt}</small>
          </span>
        </div>
      ))}
    </section>
  );
}
