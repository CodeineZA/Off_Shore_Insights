// Mode 1 · Global: all countries compared. Every tile is filtered by the country slicer
// and the tax-type toggles (PLAN.md §9).
import { useState } from 'react';
import type { Dashboard } from '../data/types';
import { CATEGORIES, countries, filterTaxTypes, type AppliesTo } from '../data/insights';
import G4Heatmap from '../tiles/G4Heatmap';

const APPLIES: [AppliesTo, string][] = [['all', 'All'], ['individual', 'Individual'], ['trust', 'Trust'], ['company', 'Company']];

export default function Global({ d }: { d: Dashboard }) {
  const all = countries(d);
  const [cc, setCc] = useState<string[]>(all.map((c) => c.code));
  const [cats, setCats] = useState<string[]>(CATEGORIES.map((c) => c.key));
  const [applies, setApplies] = useState<AppliesTo>('all');
  const toggle = (list: string[], v: string, order: string[]) => (list.includes(v) ? list.filter((x) => x !== v) : order.filter((x) => x === v || list.includes(x)));
  const types = filterTaxTypes(d, cats, applies);

  return (
    <>
      <section className="filters" aria-label="Filters">
        <div className="filter-row">
          <span className="filter-k">Countries</span>
          <div className="chips">
            {all.map((c) => (
              <button key={c.code} className={'chip' + (cc.includes(c.code) ? ' on' : '')} aria-pressed={cc.includes(c.code)}
                onClick={() => setCc(toggle(cc, c.code, all.map((x) => x.code)))}>{c.name}</button>
            ))}
            <button className="chip ghost" onClick={() => setCc(cc.length === all.length ? [] : all.map((c) => c.code))}>{cc.length === all.length ? 'None' : 'All'}</button>
          </div>
        </div>
        <div className="filter-row">
          <span className="filter-k">Taxes</span>
          <div className="chips">
            {CATEGORIES.map((c) => (
              <button key={c.key} className={'chip' + (cats.includes(c.key) ? ' on' : '')} aria-pressed={cats.includes(c.key)}
                onClick={() => setCats(toggle(cats, c.key, CATEGORIES.map((x) => x.key)))}>{c.label}</button>
            ))}
          </div>
          <div className="seg" role="group" aria-label="Applies to">
            {APPLIES.map(([v, l]) => <button key={v} className={applies === v ? 'on' : ''} onClick={() => setApplies(v)}>{l}</button>)}
          </div>
        </div>
      </section>
      <div className="cards">
        <G4Heatmap d={d} cc={cc} types={types} />
      </div>
    </>
  );
}
