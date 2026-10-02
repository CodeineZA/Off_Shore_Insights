// One country at a time. The world map is the slicer: pick a country (or a region) and the page narrows to it.
// Top to bottom: 1 the world map (with its country list, layers and legend), 2 the tax year (and the Sources button),
// 3 where the tax hurts, 4 the country brief, 5 the prospect pool. A country that sets taxes per region also lists its
// regions, each with its own bar chart, between the tax year and the tax chart.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { Dashboard } from '../data/types';
import { WORLD, focusCode, zoomTo, type Focus, type MoneyKey } from '../data/mapdata';
import { type TaxFocus } from '../data/taxbars';
import { latestYear, yearsWithData } from '../data/years';
import type { ViewName } from '../ui/WorldMap';
import CountryBrief from '../ui/CountryBrief';
import MapControls from '../ui/MapControls';
import ProspectPool from '../ui/ProspectPool';
import RegionStrip from '../ui/RegionStrip';
import SourcesButton from '../ui/SourcesButton';
import TaxSlicer from '../ui/TaxSlicer';
import YearSlicer from '../ui/YearSlicer';

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
      <MapControls d={d} focus={focus} onFocus={move} treaty={treaty} setTreaty={setTreaty} money={money} setMoney={setMoney} metrics={metrics} setMetrics={setMetrics} year={year} />
      <Suspense fallback={<div className="worldmap loading" aria-busy="true">Loading the map…</div>}>
        <WorldMap d={d} focus={focus} onFocus={move} years={sel} treaty={treaty} money={money} metrics={metrics} view={view} onView={setView} />
      </Suspense>
      <YearSlicer d={d} years={years} value={sel} code={code} hasData={hasData} onChange={setSel}>
        <SourcesButton d={d} code={code} years={sel} taxFocus={taxFocus} metrics={metrics} treaty={treaty} money={money} />
      </YearSlicer>

      {!code && <p className="map-hint">Pick a country on the map or from the list. The page narrows to it: where its tax hurts, its country brief and its prospect pool.</p>}
      {code && (
        <>
          <RegionStrip d={d} focus={focus} onFocus={move} years={sel} />
          <TaxSlicer d={d} code={code} years={sel} focus={taxFocus} onFocus={setTaxFocus} />
          <CountryBrief d={d} code={code} years={sel} />
          <ProspectPool d={d} code={code} years={sel} filtered={taxFocus != null} />
        </>
      )}
    </>
  );
}
