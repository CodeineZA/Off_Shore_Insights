// "Where the tax hurts": a bar chart of this entity's taxes by market, one bar per selected tax year, with the
// Mauritius and Seychelles rate beside each. Click a market or a tax to focus the whole page on it; click again to clear.
// Hover a bar for its range, threshold, note and source; the line under each tax spells out what it is.
// mode="report": the same chart, read-only (no clicks), limited to `only` taxes: this is the graph the report prints.
import type { ReactNode } from 'react';
import type { Dashboard } from '../data/types';
import { CATEGORY_LABEL, cellText, focusLabel, inFocus, scaleMax, taxBars, toggleFocus, type TaxFocus } from '../data/taxbars';
import { HUB_PAINT } from '../data/mapdata';
import { taxYearFor } from '../data/taxyear';
import { explainOf, pct } from '../data/insights';
import { shade } from './shade';

const WARN = '#d9785f';
const regionRange = (rs: { rate: number | null }[]) => {
  const v = rs.map((x) => x.rate).filter((x): x is number => x != null);
  return !v.length ? 'by region' : v.length === 1 || Math.min(...v) === Math.max(...v) ? `${pct(v[0])} by region` : `${pct(Math.min(...v))}–${pct(Math.max(...v))}`;
};

/** A clickable row on the page; a plain row in the printed report. */
function Press({ report, className, onClick, pressed, title, children }: { report: boolean; className: string; onClick: () => void; pressed: boolean; title?: string; children: ReactNode }) {
  return report ? <div className={className + ' static'} title={title}>{children}</div>
    : <button className={className} onClick={onClick} aria-pressed={pressed} title={title}>{children}</button>;
}

export default function TaxSlicer({ d, code, years, focus, onFocus, mode = 'live', only }: {
  d: Dashboard; code: string; years: number[]; focus: TaxFocus; onFocus: (f: TaxFocus) => void; mode?: 'live' | 'report'; only?: string[];
}) {
  const report = mode === 'report';
  const groups = taxBars(d, code, years).map((g) => ({ ...g, rows: only ? g.rows.filter((r) => only.includes(r.type.code)) : g.rows })).filter((g) => g.rows.length);
  const ys = [...years].sort((a, b) => a - b);
  const max = scaleMax(groups);
  const j = d.jurisdictions.find((x) => x.code === code);
  const isRegion = j?.kind === 'region';
  const fl = focusLabel(d, focus);
  return (
    <section className="taxslicer" aria-label="Where the tax hurts">
      <header className="taxslicer-head">
        <div>
          <h2 className="card-title">Where the tax hurts</h2>
          <p className="card-purpose">{report ? 'The taxes that act on a share portfolio, with the Mauritius and Seychelles rate beside each.' : 'Click a market or a tax to focus the whole page on it. Click it again to clear.'}</p>
        </div>
        {fl && !report && <button className="chip on focus-chip" onClick={() => onFocus(null)} aria-label={`Clear focus on ${fl}`}>Focused on {fl} ✕</button>}
      </header>
      <div className="legend card-legend" aria-label="Legend">
        {ys.map((y, i) => <span key={y}><i style={{ background: shade(i, ys.length), borderRadius: 2 }} />{j?.name ?? code}, tax year {taxYearFor(d, code, y).label}</span>)}
        <span><i style={{ background: HUB_PAINT.MU, borderRadius: 1, width: 3, height: 12 }} />Mauritius rate</span>
        <span><i style={{ background: HUB_PAINT.SC, borderRadius: 1, width: 3, height: 12 }} />Seychelles rate</span>
        {isRegion && <span><i style={{ background: 'transparent', border: '1px solid #d8b07a', borderRadius: 2 }} />Hollow: taken from the country</span>}
        <span><i style={{ background: 'transparent', border: '1px dashed #9a9185', borderRadius: 2 }} />Dashed: no figure for that year</span>
        {groups.some((g) => g.rows.some((r) => r.regions)) && <span><i style={{ background: '#f3dcb2', borderRadius: '50%', width: 7, height: 7 }} />Dots: one per region (the country sets this tax by region)</span>}
        {groups.some((g) => g.category === 'anti_offshore') && <span><i style={{ background: WARN, borderRadius: 2 }} />Red: a tax that argues against going offshore</span>}
      </div>
      <div className="taxrow axis-row" aria-hidden="true">
        <span className="axis-cap">Tax</span>
        <span className="axis-scale"><b>0%</b><em>headline rate</em><b>{max}%</b></span>
        <span className="axis-cap r">{ys.length > 1 ? 'Latest' : 'Rate'}</span>
      </div>
      {!groups.length && <p className="empty">No tax figures for this selection yet.</p>}
      {groups.map((g) => {
        const gFocus = !!focus?.category && focus.category === g.category;
        const dim = !!focus && !g.rows.some((r) => inFocus(r.type, focus));
        return (
          <div key={g.category} className={'taxgroup' + (dim ? ' dim' : '')}>
            <Press report={report} className={'taxgroup-head' + (gFocus ? ' on' : '')} onClick={() => onFocus(toggleFocus(focus, { category: g.category }))} pressed={gFocus}>
              {CATEGORY_LABEL[g.category]}<small>{g.rows.length} {g.rows.length === 1 ? 'tax' : 'taxes'}</small>
            </Press>
            {g.rows.map((r) => {
              const rFocus = !!focus?.taxType && focus.taxType === r.type.code;
              const on = inFocus(r.type, focus);
              const warn = g.category === 'anti_offshore';
              const latest = r.years[r.years.length - 1];
              return (
                <Press key={r.type.code} report={report} className={'taxrow' + (rFocus ? ' on' : '') + (on ? '' : ' dim')} onClick={() => onFocus(toggleFocus(focus, { taxType: r.type.code }))} pressed={rFocus}
                  title={r.type.description ?? r.type.label}>
                  <span className="taxrow-label">{r.type.label}<small className="tax-explain">{explainOf(r.type)}</small></span>
                  <span className="taxrow-track">
                    {r.regions
                      ? <i className="bar regional" title={r.regions.map((x) => `${x.name}: ${x.rate == null ? 'no figure' : pct(x.rate)}`).join(' · ')}>
                          {r.regions.map((x) => <u key={x.code} className={x.rate == null ? 'unknown' : ''} style={{ left: `${x.rate == null ? 0 : (x.rate / max) * 100}%` }} title={`${x.name}: ${x.rate == null ? 'no figure' : pct(x.rate)}`} />)}
                        </i>
                      : null}
                    {r.years.map((c, i) => c.rate == null
                      ? (r.regions ? null : <i key={c.year} className="bar unknown" title={cellText(c)} />)
                      : <i key={c.year} className={'bar' + (c.inherited ? ' hollow' : '')} style={{ width: `${Math.max(0.8, (c.rate / max) * 100)}%`, background: c.inherited ? 'transparent' : warn ? WARN : shade(i, ys.length), borderColor: warn ? WARN : shade(i, ys.length) }}
                        title={cellText(c)} />)}
                    <b className="hubtick mu" style={{ left: `${r.hub.MU == null ? 0 : (r.hub.MU / max) * 100}%` }} hidden={r.hub.MU == null} title={`Mauritius: ${r.hub.MU == null ? 'no figure' : pct(r.hub.MU)}`} />
                    <b className="hubtick sc" style={{ left: `${r.hub.SC == null ? 0 : (r.hub.SC / max) * 100}%` }} hidden={r.hub.SC == null} title={`Seychelles: ${r.hub.SC == null ? 'no figure' : pct(r.hub.SC)}`} />
                  </span>
                  <span className="taxrow-val">
                    {r.regions && latest.rate == null ? regionRange(r.regions) : latest.rate == null ? '?' : pct(latest.rate)}
                    <small><span style={{ color: HUB_PAINT.MU }}>MU {r.hub.MU == null ? '?' : pct(r.hub.MU)}</span> <span style={{ color: HUB_PAINT.SC }}>SC {r.hub.SC == null ? '?' : pct(r.hub.SC)}</span></small>
                  </span>
                </Press>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
