// The world map: treaty colours per country, money bars at each capital, and it is the slicer for the whole page.
// World → click a country → it zooms (its regions appear with their own bars) → click a region → zoom again.
// Back (or Esc) zooms out one step. Shapes are pre-computed (scripts/gen-world.mjs), so no map library ships.
import { memo, useEffect, useMemo, useState } from 'react';
import type { Dashboard } from '../data/types';
import { HUB_PAINT, MONEY, capitalBars, regionBars, treatyPaint, treatyStatuses, zoomOut, zoomTo,
  type Focus, type MoneyKey, type Paint } from '../data/mapdata';
import { taxYearFor, taxYearLine } from '../data/taxyear';
import { SHAPES, WORLD_VIEW, type CountryShape } from '../map/world';
import { project } from '../map/project';
import { useTween } from './tween';

type Box = [number, number, number, number];
const ASPECT = WORLD_VIEW[2] / WORLD_VIEW[3];
/** A viewBox around a bounding box, with room around it; never tighter than `minW` map units. */
export function boxView([x0, y0, x1, y1]: Box, pad = 2.4, minW = 14): Box {
  const w = Math.max((x1 - x0) * pad, (y1 - y0) * pad * ASPECT, minW), h = w / ASPECT;
  return [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
}

/** Preset views of the world map. Europe is where most of our capitals sit, too close together at world zoom. */
export const VIEWS = { world: WORLD_VIEW, europe: boxView([...project(-12, 66), ...project(36, 35)] as Box, 1.04, 10) } as const;
export type ViewName = keyof typeof VIEWS;

export interface RegionShape { d: string; bbox: Box }
const REGION_FILES = import.meta.glob<{ REGIONS: Record<string, RegionShape> }>('../map/regions/*.ts');

const NEUTRAL = '#2b2927', DIM = '#22211f', LAND_LINE = 'rgba(255, 236, 210, .16)';
const TREATY_LABEL: Record<string, string> = { in_force: 'in force', signed_not_in_force: 'signed', negotiating: 'negotiating', none: 'none', unknown: 'unknown' };

/** The land: memoised so a zoom animation redraws only the viewBox, not 240 paths per frame. */
const Land = memo(function Land({ shapes, paint, clickable, focusIso, underlay, onPick, onHover, dimOthers }: {
  shapes: CountryShape[]; paint: Record<string, Paint | undefined>; clickable: Set<string>; focusIso: string | null; underlay: string | null;
  onPick: (iso: string) => void; onHover: (iso: string | null, e?: React.PointerEvent) => void; dimOthers: boolean;
}) {
  return (
    <g>
      {shapes.map((s, i) => {
        const p = s.iso2 ? paint[s.iso2] : undefined;
        const can = !!s.iso2 && clickable.has(s.iso2);
        const fill = !p ? NEUTRAL : p.fill === 'mu' ? HUB_PAINT.MU : p.fill === 'sc' ? HUB_PAINT.SC : p.fill === 'both' ? 'url(#osi-stripes)' : p.fill === 'unknown' ? 'url(#osi-hatch)' : NEUTRAL;
        const outline = p && (p.outlineMu || p.outlineSc);
        const isFocus = s.iso2 === focusIso;
        const op = s.iso2 === underlay ? 0.18 : dimOthers && !isFocus ? 0.38 : 1;   // on the paint itself: a <g opacity> makes the browser allocate a layer per country
        return (
          <g key={i}>
            <path d={s.d} fill={fill} fillOpacity={op * (p && (p.fill === 'mu' || p.fill === 'sc') ? 0.82 : 1)} stroke={isFocus ? '#f3dcb2' : LAND_LINE} strokeOpacity={op} strokeWidth={isFocus ? 1.4 : 0.5} vectorEffect="non-scaling-stroke"
              className={can ? 'map-land can' : 'map-land'} role={can ? 'button' : undefined} tabIndex={can ? 0 : undefined} aria-label={can ? `${s.name}: open` : undefined}
              onClick={can ? () => onPick(s.iso2) : undefined} onKeyDown={can ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(s.iso2); } } : undefined}
              onPointerMove={(e) => onHover(s.iso2 || s.name, e)} onPointerLeave={() => onHover(null)} />
            {outline && p!.outlineSc && <path d={s.d} fill="none" stroke={HUB_PAINT.SC} strokeOpacity={op} strokeWidth={p!.outlineMu ? 3 : 1.8} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
            {outline && p!.outlineMu && <path d={s.d} fill="none" stroke={HUB_PAINT.MU} strokeOpacity={op} strokeWidth={1.4} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
          </g>
        );
      })}
    </g>
  );
});

export default function WorldMap({ d, focus, onFocus, years, treaty, money, metrics, view, onView }: {
  d: Dashboard; focus: Focus; onFocus: (f: Focus) => void; years: number[]; treaty: boolean; money: boolean; metrics: MoneyKey[]; view: ViewName; onView: (v: ViewName) => void;
}) {
  const year = years.length ? Math.max(...years) : new Date().getFullYear();
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const [regionShapes, setRegionShapes] = useState<Record<string, RegionShape>>({});

  const countries = useMemo(() => d.jurisdictions.filter((j) => j.kind === 'country'), [d]);
  const clickable = useMemo(() => new Set(countries.filter((j) => !j.is_offshore_hub).map((j) => j.code)), [countries]);
  const paint = useMemo(() => {
    const out: Record<string, Paint | undefined> = {};
    if (!treaty) return out;
    for (const j of countries) { if (j.is_offshore_hub) continue; const s = treatyStatuses(d, j.code, year); out[j.code] = treatyPaint(s.MU, s.SC); }
    return out;
  }, [d, countries, treaty, year]);

  // Region outlines for the selected country, if the research step produced them (src/map/regions/<ISO2>.ts).
  useEffect(() => {
    const c = focus.country;
    if (!c) return;
    const file = REGION_FILES[`../map/regions/${c}.ts`];
    if (!file || regionShapes[`__loaded_${c}`]) return;
    file().then((m) => setRegionShapes((s) => ({ ...s, ...m.REGIONS, [`__loaded_${c}`]: { d: '', bbox: [0, 0, 0, 0] } })));
  }, [focus.country, regionShapes]);

  const regionsDrawn = !!focus.country && Object.keys(regionShapes).some((k) => !k.startsWith('__') && k.startsWith(focus.country + '-'));
  const countryShape = focus.country ? SHAPES.find((s) => s.iso2 === focus.country) : undefined;
  const regionShape = focus.region ? regionShapes[focus.region] : undefined;
  const target: Box = regionShape ? boxView(regionShape.bbox, 1.6, 4) : countryShape ? boxView(countryShape.focus) : [...VIEWS[view]] as Box;
  const vb = useTween({ __mx: target[0], __my: target[1], __mw: target[2], __mh: target[3] }, { dur: 750 });
  // Map units per nominal pixel: marks keep a constant on-screen size (a little larger once you are zoomed onto one country).
  const s = (vb.__mw / WORLD_VIEW[2]) * (focus.country ? 1.5 : view === 'europe' ? 1.15 : 1);

  const pins = useMemo(() => (money ? capitalBars(d, metrics, year, true) : []), [d, money, metrics, year]);
  const hubs = useMemo(() => countries.filter((j) => j.is_offshore_hub && j.capital_lon != null), [countries]);
  const regionsHere = useMemo(() => (focus.country ? regionBars(d, focus.country, year) : []), [d, focus.country, year]);
  const regionMax = Math.max(1, ...regionsHere.flatMap((r) => r.bars.map((b) => b.rate ?? 0)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]') && (focus.country || focus.region)) onFocus(zoomOut(focus)); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, onFocus]);

  const pick = (iso: string) => onFocus(zoomTo(d, focus, iso));
  const hoverCode = hover && clickable.has(hover.key) ? hover.key : null;
  const hj = hover ? d.jurisdictions.find((j) => j.code === hover.key) : undefined;
  const hoverName = hj?.name ?? SHAPES.find((x) => x.iso2 === hover?.key || x.name === hover?.key)?.name ?? hover?.key;
  const st = hoverCode ? treatyStatuses(d, hoverCode, year) : null;
  const back = focus.region ? `Back to ${d.jurisdictions.find((j) => j.code === focus.country)?.name ?? 'country'}` : 'Back to world';

  return (
    <div className="worldmap">
      {(focus.country || focus.region) && <button className="map-back" onClick={() => onFocus(zoomOut(focus))}>← {back}</button>}
      {!focus.country && (
        <div className="seg map-views" role="group" aria-label="Map view">
          {(['world', 'europe'] as ViewName[]).map((v) => <button key={v} className={v === view ? 'on' : ''} aria-pressed={v === view} onClick={() => onView(v)}>{v === 'world' ? 'World' : 'Europe'}</button>)}
        </div>
      )}
      <svg viewBox={`${vb.__mx} ${vb.__my} ${vb.__mw} ${vb.__mh}`} role="img" aria-label="World map: treaties with Mauritius and Seychelles, and money at each capital. Select a country to focus the page on it.">
        {/* Diagonal stripes as repeating gradients (a shader), not rotated <pattern> tiles: tiles are re-rasterised on every frame of the zoom */}
        <defs>
          <linearGradient id="osi-stripes" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={10 * s} y2="0" spreadMethod="repeat" gradientTransform="rotate(45)">
            <stop offset="0" stopColor={HUB_PAINT.MU} /><stop offset="0.5" stopColor={HUB_PAINT.MU} /><stop offset="0.5" stopColor={HUB_PAINT.SC} /><stop offset="1" stopColor={HUB_PAINT.SC} />
          </linearGradient>
          <linearGradient id="osi-hatch" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={6 * s} y2="0" spreadMethod="repeat" gradientTransform="rotate(45)">
            <stop offset="0" stopColor={DIM} /><stop offset="0.72" stopColor={DIM} /><stop offset="0.72" stopColor="#3b3a38" /><stop offset="1" stopColor="#3b3a38" />
          </linearGradient>
        </defs>
        <Land shapes={SHAPES} paint={paint} clickable={clickable} focusIso={focus.country} underlay={regionsDrawn ? focus.country : null} dimOthers={!!focus.country}
          onPick={pick} onHover={(k, e) => setHover(k && e ? { key: k, x: e.clientX, y: e.clientY } : null)} />

        {/* Regions of the selected country: the country's own treaty colour, dark seams, the chosen one outlined */}
        {focus.country && Object.entries(regionShapes).filter(([k]) => !k.startsWith('__') && k.startsWith(focus.country + '-')).map(([code, r]) => {
          const p = paint[focus.country!]; const on = focus.region === code; const dim = !!focus.region && !on;
          const fill = !p ? NEUTRAL : p.fill === 'mu' ? HUB_PAINT.MU : p.fill === 'sc' ? HUB_PAINT.SC : p.fill === 'both' ? 'url(#osi-stripes)' : p.fill === 'unknown' ? 'url(#osi-hatch)' : NEUTRAL;
          return (
            <path key={code} d={r.d} className="map-region can" fill={fill} fillOpacity={dim ? 0.35 : 0.9} stroke={on ? '#f3dcb2' : '#121110'} strokeWidth={on ? 2.2 : 1.4}
              vectorEffect="non-scaling-stroke" role="button" tabIndex={0} aria-label={`${d.jurisdictions.find((j) => j.code === code)?.name ?? code}: open`}
              onClick={() => pick(code)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(code); } }}
              onPointerMove={(e) => setHover({ key: code, x: e.clientX, y: e.clientY })} onPointerLeave={() => setHover(null)} />
          );
        })}

        {/* The two hubs, drawn as rings in their own colour (the islands are specks) */}
        {hubs.map((h) => { const [x, y] = project(h.capital_lon!, h.capital_lat!); const c = h.code === 'MU' ? HUB_PAINT.MU : HUB_PAINT.SC; return (
          <g key={h.code} transform={`translate(${x} ${y}) scale(${s})`} pointerEvents="none">
            <circle r={6} fill="none" stroke={c} strokeWidth={2} /><circle r={2} fill={c} />
            <text y={-10} textAnchor="middle" className="map-hublabel" fill={c}>{h.name}</text>
          </g>); })}

        {/* Money: one bar per metric at each capital, each metric scaled to its own highest country */}
        {pins.map((p) => { const [x, y] = project(p.lon, p.lat); const n = p.bars.length; const W = 6, G = 1.5; return (
          <g key={p.code} transform={`translate(${x} ${y}) scale(${s})`} className="map-pin" pointerEvents="none" opacity={focus.country && focus.country !== p.code ? 0.4 : undefined}>
            <circle r={1.6} fill="#f3dcb2" />
            <g transform={`translate(${-(n * (W + G) - G) / 2} 0)`}>
              {p.bars.map((b, i) => { const color = MONEY.find((m) => m.key === b.key)!.color; const hgt = Math.max(2, b.norm * 34); return b.value == null
                ? <rect key={b.key} x={i * (W + G)} y={-6} width={W} height={6} fill="none" stroke={color} strokeOpacity={0.7} strokeDasharray="2 1.5" strokeWidth={0.9} />
                : <rect key={b.key} x={i * (W + G)} y={-hgt} width={W} height={hgt} rx={1} fill={color} fillOpacity={b.carried ? 0.5 : 1} />; })}
            </g>
            <text y={9} textAnchor="middle" className="map-pinlabel">{p.code}</text>
          </g>); })}

        {/* Regions of the selected country: their regional taxes as bars (shared scale, so regions compare) */}
        {regionsHere.filter((r) => r.lon != null && r.lat != null).map((r) => { const [x, y] = project(r.lon!, r.lat!); const n = r.bars.length; const W = 7, G = 2; return (
          <g key={r.code} transform={`translate(${x} ${y}) scale(${s})`} pointerEvents="none">
            <g transform={`translate(${-(n * (W + G) - G) / 2} 0)`}>
              {r.bars.map((b, i) => b.rate == null
                ? <rect key={b.taxType} x={i * (W + G)} y={-7} width={W} height={7} fill="none" stroke="#e0b25a" strokeDasharray="2 1.5" strokeWidth={0.9} />
                : <rect key={b.taxType} x={i * (W + G)} y={-Math.max(2, (b.rate / regionMax) * 40)} width={W} height={Math.max(2, (b.rate / regionMax) * 40)} rx={1} fill={i % 2 ? '#e0775f' : '#f3dcb2'} />)}
            </g>
          </g>); })}
      </svg>

      {hover && hj?.kind === 'region' && (
        <div className="map-tip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
          <b>{hj.name}</b>
          {regionsHere.find((r) => r.code === hj.code)?.bars.map((b) => <span key={b.taxType}>{b.label}: {b.rate == null ? 'no figure' : `${b.rate}%`}</span>)}
          <small>Click to narrow the page to this region</small>
        </div>
      )}
      {hover && hoverName && hj?.kind !== 'region' && (
        <div className="map-tip" style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
          <b>{hoverName}</b>
          {st ? <>
            <span style={{ color: HUB_PAINT.MU }}>Mauritius: {st.MU ? TREATY_LABEL[st.MU] : 'no data'}</span>
            <span style={{ color: HUB_PAINT.SC }}>Seychelles: {st.SC ? TREATY_LABEL[st.SC] : 'no data'}</span>
            <small>{taxYearLine(taxYearFor(d, hoverCode!, year))}</small>
            <small>Click to focus the page on it</small>
          </> : <small>Not researched yet</small>}
        </div>
      )}
    </div>
  );
}
