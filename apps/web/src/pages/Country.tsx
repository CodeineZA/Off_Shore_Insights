// Mode 2 · 1 : 2: one country against Mauritius and Seychelles (PLAN.md §9).
import { useState } from 'react';
import type { Dashboard } from '../data/types';
import { countries } from '../data/insights';
import { defaultCountry } from '../data/model';
import C1HeadToHead from '../tiles/C1HeadToHead';
import C2BracketSpread from '../tiles/C2BracketSpread';
import C3SavingGap from '../tiles/C3SavingGap';
import C4ThreeHomes from '../tiles/C4ThreeHomes';
import C5TreatyBridge from '../tiles/C5TreatyBridge';
import C6ProspectPool from '../tiles/C6ProspectPool';
import C7CountryBrief from '../tiles/C7CountryBrief';

export default function Country({ d }: { d: Dashboard }) {
  const [code, setCode] = useState(defaultCountry(d));
  return (
    <>
      <section className="filters" aria-label="Country">
        <div className="filter-row">
          <span className="filter-k">Country</span>
          <div className="chips">
            {countries(d).map((c) => (
              <button key={c.code} className={'chip' + (c.code === code ? ' on' : '')} aria-pressed={c.code === code} onClick={() => setCode(c.code)}>{c.name}</button>
            ))}
          </div>
        </div>
      </section>
      <div className="cards" key={code}>
        <C7CountryBrief d={d} code={code} />
        <C5TreatyBridge d={d} code={code} />
        <C1HeadToHead d={d} code={code} />
        <C3SavingGap d={d} code={code} />
        <C2BracketSpread d={d} code={code} />
        <C4ThreeHomes d={d} code={code} />
        <C6ProspectPool d={d} code={code} />
      </div>
    </>
  );
}
