// One country at a time. The world map is the slicer: pick a country (or a region) and the page narrows to it.
// Top to bottom: year slicer, country list + layers + legend, the map, then (once something is picked) the banner,
// the tax slicer chart, and the tiles. The tiles are replaced one at a time as each is agreed (PLAN.md).
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { Dashboard } from '../data/types';
import { WORLD, focusCode, zoomTo, type Focus, type MoneyKey } from '../data/mapdata';
import { type TaxFocus } from '../data/taxbars';
import { latestYear, yearsWithData } from '../data/years';
import type { ViewName } from '../ui/WorldMap';
import Banner from '../ui/Banner';
import MapControls from '../ui/MapControls';
import RegionStrip from '../ui/RegionStrip';
import TaxSlicer from '../ui/TaxSlicer';
import TileGrid from '../ui/TileGrid';
import YearSlicer from '../ui/YearSlicer';
import C1HeadToHead from '../tiles/C1HeadToHead';
import C2BracketSpread from '../tiles/C2BracketSpread';
import C3SavingGap from '../tiles/C3SavingGap';
import C4ThreeHomes from '../tiles/C4ThreeHomes';
import C5TreatyBridge from '../tiles/C5TreatyBridge';
import C6ProspectPool from '../tiles/C6ProspectPool';
import C7CountryBrief from '../tiles/C7CountryBrief';

const WorldMap = lazy(() => import('../ui/WorldMap'));   // the shapes are ~1 MB of path data: load them when the page opens, not with the login

const fromHash = (d: Dashboard): Focus => {
  const m = location.hash.match(/^#\/country\/([A-Za-z0-9-]+)/);
  return m ? zoomTo(d, WORLD, m[1].toUpperCase()) : WORLD;
};

export default function Country({ d }: { d: Dashboard }) {
  const allCodes = useMemo(() => d.jurisdictions.map((j) => j.code), [d]);
  const years = useMemo(() => yearsWithData(d, allCodes), [d, allCodes]);
  const [sel, setSel] = useState<number[]>(() => [latestYear(d, allCodes) ?? new Date().getFullYear()]);
  const [focus, setFocus] = useState<Focus>(() => fromHash(d));
  const [treaty, setTreaty] = useState(true);
  const [money, setMoney] = useState(true);
  const [metrics, setMetrics] = useState<MoneyKey[]>(['millionaires', 'uhnwi_count', 'business_owners']);
  const [taxFocus, setTaxFocus] = useState<TaxFocus>(null);
  const [view, setView] = useState<ViewName>('world');
  const code = focusCode(focus);

  // The tax focus survives moving between regions (Flanders vs Wallonia on inheritance) and resets back at the world.
  const move = (f: Focus) => { setFocus(f); if (!focusCode(f)) setTaxFocus(null); };
  useEffect(() => { history.replaceState(null, '', code ? `#/country/${code}` : '#/country'); }, [code]);
  // A link or an edited address bar moves the focus too (replaceState above does not fire this, so there is no loop).
  useEffect(() => {
    const on = () => { const f = fromHash(d); if (focusCode(f) !== focusCode(focus)) move(f); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  });

  const hasData = useMemo(() => {
    const j = code ? d.jurisdictions.find((x) => x.code === code) : null;
    return new Set(yearsWithData(d, code ? [code, ...(j?.parent_code ? [j.parent_code] : [])] : allCodes));
  }, [d, code, allCodes]);
  const year = Math.max(...sel);

  return (
    <>
      <YearSlicer d={d} years={years} value={sel} code={code} hasData={hasData} onChange={setSel} />
      <MapControls d={d} focus={focus} onFocus={move} treaty={treaty} setTreaty={setTreaty} money={money} setMoney={setMoney} metrics={metrics} setMetrics={setMetrics} year={year} />
      <Suspense fallback={<div className="worldmap loading" aria-busy="true">Loading the map…</div>}>
        <WorldMap d={d} focus={focus} onFocus={move} years={sel} treaty={treaty} money={money} metrics={metrics} view={view} onView={setView} />
      </Suspense>

      {!code && <p className="map-hint">Pick a country on the map or from the list. The page narrows to it: its treaties, its money, where its tax hurts and who to talk to.</p>}
      {code && (
        <>
          <Banner d={d} code={code} years={sel} />
          <RegionStrip d={d} focus={focus} onFocus={move} years={sel} />
          <TaxSlicer d={d} code={code} years={sel} focus={taxFocus} onFocus={setTaxFocus} />
          {/* The tiles below are the earlier country views, kept until each is redesigned and agreed. No key on the grid:
              changing country must keep an open tile open, showing the new country. */}
          <TileGrid items={[
            { id: 'c4', label: 'Same client, three homes', node: <C4ThreeHomes d={d} code={code} /> },
            { id: 'c7', label: 'Country brief', node: <C7CountryBrief d={d} code={code} />, fixed: true },
            { id: 'c3', label: 'The saving gap', node: <C3SavingGap d={d} code={code} /> },
            { id: 'c1', label: 'Head to head', node: <C1HeadToHead d={d} code={code} /> },
            { id: 'c5', label: 'Treaty bridge', node: <C5TreatyBridge d={d} code={code} /> },
            { id: 'c2', label: 'Bracket spread', node: <C2BracketSpread d={d} code={code} /> },
            { id: 'c6', label: 'Prospect pool', node: <C6ProspectPool d={d} code={code} /> },
          ]} />
        </>
      )}
    </>
  );
}
