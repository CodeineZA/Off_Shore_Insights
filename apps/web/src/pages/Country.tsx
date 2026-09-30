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
import TileGrid from '../ui/TileGrid';

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
      {/* The country brief is read, not glanced at: it stays open in the centre with the tiles around it. */}
      <TileGrid key={code} items={[
        { id: 'c4', label: 'Same client, three homes', node: <C4ThreeHomes d={d} code={code} /> },
        { id: 'c7', label: 'Country brief', node: <C7CountryBrief d={d} code={code} />, fixed: true },
        { id: 'c3', label: 'The saving gap', node: <C3SavingGap d={d} code={code} /> },
        { id: 'c1', label: 'Head to head', node: <C1HeadToHead d={d} code={code} /> },
        { id: 'c5', label: 'Treaty bridge', node: <C5TreatyBridge d={d} code={code} /> },
        { id: 'c2', label: 'Bracket spread', node: <C2BracketSpread d={d} code={code} /> },
        { id: 'c6', label: 'Prospect pool', node: <C6ProspectPool d={d} code={code} /> },
      ]} />
    </>
  );
}
