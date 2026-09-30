// The ten dashboard tiles (PLAN.md §9), in the Claude Design layout. Each tile has a
// compact face and an expanded view (controls + main chart + insight panel).
import type { ReactNode } from 'react';
import type { Dashboard } from '../data/types';
import {
  DEFAULT_SELECTION, STACK_CATS, STRUCTURE_COST, TOP_SEGMENTS, WEALTH_LABEL, compare, compareStats, compounding, countries,
  fmtCount, fmtDate, hostOf, kpis, lineSeries, mapPins, nameOf, pct, radar, reviewActivity, taxLabel, taxLoad, taxTypesWithData,
  topRates, wealthShare, type LineMode, type Range, type WealthMetric,
} from '../data/insights';
import { AreaChart, ColumnChart, CompoundChart, Donut, Legend, LineChart, STACK_COLORS, StackedChart } from '../ui/charts';
import { colorOf, niceMax, proj, r1, radarGeom, spark } from '../ui/geom';
import { useTween, type Vals } from '../ui/tween';
import { LAND_DOTS } from '../map/landDots';

// ── Shared types ─────────────────────────────────────────────────────────────
export interface Sel {
  cc: string[]; range: Range; kpi: 'rates' | 'flags'; top: string; topSel: number; radar: string; hub: 'MU' | 'SC';
  pin: string; line: LineMode; col: string; donut: WealthMetric; area: 'mon' | 'cum'; stack: 'abs' | 'pct';
  cr: number; ch: number; cpc: string;
}
export const initialSel = (d: Dashboard): Sel => {
  const all = countries(d).map((c) => c.code);
  const cc = DEFAULT_SELECTION.filter((c) => all.includes(c));
  return { cc: cc.length ? cc : all.slice(0, 6), range: '30d', kpi: 'rates', top: 'INHERITANCE_DIRECT', topSel: 0, radar: all.includes('FR') ? 'FR' : all[0],
    hub: 'MU', pin: 'FR', line: 'employers', col: 'CGT_FINANCIAL', donut: 'business_owners', area: 'cum', stack: 'abs', cr: 0.06, ch: 20, cpc: 'FR' };
};
export interface Ctx {
  d: Dashboard; sel: Sel; set: (p: Partial<Sel>) => void; replay: number;
  hover: number | null; setHover: (i: number | null) => void; hoverKey: string | null; setHoverKey: (k: string | null) => void;
}
export interface InsightRow { k: string; v: ReactNode; s?: ReactNode }
export interface Insight { kicker: string; title: ReactNode; rows: InsightRow[]; note: ReactNode }
export interface Seg<T = unknown> { opts: [T, string][]; cur: T; on: (v: T) => void }
export interface Expanded { title: string; segs?: Seg[]; pick?: Seg<string>; multi?: boolean; main: ReactNode; insight: Insight }
export interface TileDef { id: string; kpi?: boolean; compact: (c: Ctx) => ReactNode; expanded: (c: Ctx) => Expanded }

const Head = ({ title, sub }: { title: ReactNode; sub?: ReactNode }) => (
  <div className="tile-head"><div className="tile-title">{title}</div>{sub != null && <div className="tile-sub">{sub}</div>}</div>
);
const signed = (v: number, dp = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(dp);
const arrow = (v: number) => (v > 0 ? '▲' : v < 0 ? '▼' : '±');
const Src = ({ url }: { url: string | null }) => (url ? <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{hostOf(url)} ↗</a> : <span>no source yet</span>);
const seg = <T,>(opts: [T, string][], cur: T, on: (v: T) => void): Seg => ({ opts, cur, on: on as (v: unknown) => void });

// ── 1. KPI · data health ─────────────────────────────────────────────────────
function KpiSpark({ values, W, H, top, replay, id, big, hover, onHover, labels, raw }: {
  values: number[]; W: number; H: number; top: number; replay: number; id: string; big?: boolean;
  hover?: number | null; onHover?: (i: number | null) => void; labels?: string[]; raw?: number[];
}) {
  const target: Vals = { __m: niceMax(Math.max(...values, 1) * 1.25), p: 1 };
  values.forEach((v, i) => { target['a' + i] = v; });
  const T = useTween(target, { dur: 1000 }, replay);
  const sp = spark(values.map((_, i) => T['a' + i] || 0), T.__m, W, H, top);
  return (
    <svg viewBox={`0 0 ${W} ${big ? H + 22 : H + 4}`} style={{ width: '100%', marginTop: 'auto', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id + 'g'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d8b07a" stopOpacity={big ? '.4' : '.45'} /><stop offset="1" stopColor="#d8b07a" stopOpacity="0" /></linearGradient>
        <clipPath id={id + 'c'}><rect x="-10" y="-20" height={H + 40} width={(T.p || 0) * (W + 10)} /></clipPath>
      </defs>
      {big && [12, 64, 116, 168].map((g) => <line key={g} x1="0" x2={W} y1={g} y2={g} stroke="rgba(255,236,210,.06)" />)}
      <g clipPath={`url(#${id}c)`}><path d={sp.area} fill={`url(#${id}g)`} /><path d={sp.line} fill="none" stroke="#d8b07a" strokeWidth={big ? 2 : 1.6} /></g>
      {sp.p.map(([x, y], i) => big ? (
        <g key={i} onMouseEnter={() => onHover?.(i)} onMouseLeave={() => onHover?.(null)}>
          <circle cx={x} cy={y} r="12" fill="transparent" />
          <circle cx={x} cy={y} r={hover === i ? 5 : 3} fill="#f1d6a8" style={{ opacity: (T.p || 0) > 0.95 ? 1 : 0, transition: 'r .15s' }} />
          <text x={x} y={y - 12} textAnchor="middle" fill="#f3dcb2" style={{ font: '500 11px Poppins', opacity: hover === i ? 1 : 0, transition: 'opacity .15s' }}>{raw?.[i]}</text>
          <text x={x} y={H + 18} textAnchor="middle" fill="#6f675d" style={{ font: '400 10px Poppins' }}>{labels?.[i]}</text>
        </g>
      ) : i % 2 === 1 || i === sp.p.length - 1 ? <circle key={i} cx={x} cy={y} r="2.2" fill="#f1d6a8" /> : null)}
    </svg>
  );
}
function CountUp({ value, replay }: { value: number; replay: number }) {
  const T = useTween({ v: value }, { dur: 1000 }, replay);
  return <>{Math.round(T.v || 0)}</>;
}
const kpiTile: TileDef = {
  id: 'kpi', kpi: true,
  compact: ({ d, sel, replay }) => {
    const k = kpis(d, sel.range);
    return [k.rates, k.flags].map((s, j) => (
      <div key={s.label} style={{ padding: '22px 20px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderLeft: j ? '1px solid rgba(255,236,210,.07)' : 0, minWidth: 0 }}>
        <div style={{ font: '600 11px/1 Poppins', letterSpacing: '.06em', textTransform: 'uppercase', color: '#ece6dc' }}>{s.label}</div>
        <div style={{ font: '400 40px/1 Poppins', color: '#ece6dc' }}><CountUp value={s.val} replay={replay} /></div>
        <div style={{ font: '400 12px Poppins', color: '#9a9185', display: 'flex', flexWrap: 'wrap', gap: '2px 6px' }}><span style={{ color: '#d8b07a', whiteSpace: 'nowrap' }}>{arrow(s.delta)} {Math.abs(s.delta)}</span><span>{s.note}</span></div>
        <KpiSpark values={s.values} W={200} H={86} top={6} replay={replay} id={'ks' + j} />
      </div>
    ));
  },
  expanded: ({ d, sel, set, replay, hover, setHover }) => {
    const k = kpis(d, sel.range), cur = sel.kpi === 'rates' ? k.rates : k.flags;
    const avg = cur.values.reduce((a, b) => a + b, 0) / cur.values.length, peak = Math.max(...cur.values), low = Math.min(...cur.values);
    return {
      title: 'Data health',
      segs: [seg<Range>([['7d', '7 days'], ['30d', '30 days'], ['12m', '12 months']], sel.range, (v) => set({ range: v }))],
      main: (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, flex: 1 }}>
          {(['rates', 'flags'] as const).map((id) => { const s = k[id]; return (
            <div key={id} onClick={() => set({ kpi: id })} style={{ padding: 20, borderRadius: 14, border: `1px solid ${sel.kpi === id ? 'rgba(216,176,122,.45)' : 'rgba(255,236,210,.07)'}`,
              background: 'rgba(255,255,255,.02)', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', transition: 'border-color .2s' }}>
              <div style={{ font: '600 11px/1 Poppins', letterSpacing: '.06em', textTransform: 'uppercase', color: '#ece6dc' }}>{s.label}</div>
              <div style={{ font: '400 52px/1 Poppins', color: '#ece6dc' }}><CountUp value={s.val} replay={replay} /></div>
              <div style={{ font: '400 12px Poppins', color: '#9a9185', display: 'flex', flexWrap: 'wrap', gap: '2px 6px' }}><span style={{ color: '#d8b07a', whiteSpace: 'nowrap' }}>{arrow(s.delta)} {Math.abs(s.delta)}</span><span>{s.note}</span></div>
              <KpiSpark values={s.values} raw={s.values} labels={s.labels} W={400} H={168} top={12} replay={replay} id={'kb' + id} big
                hover={sel.kpi === id ? hover : null} onHover={(i) => { if (sel.kpi !== id) set({ kpi: id }); setHover(i); }} />
            </div>); })}
        </div>
      ),
      insight: {
        kicker: 'Selected series', title: hover != null ? `${cur.label} · ${cur.labels[hover]}` : cur.label,
        rows: hover != null ? [{ k: sel.kpi === 'rates' ? 'Rates tracked' : 'Flags raised', v: cur.values[hover] }] : [
          { k: 'Peak', v: peak, s: cur.labels[cur.values.indexOf(peak)] }, { k: 'Average', v: avg.toFixed(1), s: 'per period' },
          { k: 'Low', v: low }, { k: 'Change', v: `${arrow(cur.delta)} ${Math.abs(cur.delta)}`, s: cur.note }],
        note: sel.kpi === 'rates'
          ? 'Current rate rows with a known headline rate, counted from the date each became valid. Grows as Phase 2 fills in the missing countries.'
          : `Review flags raised by the daily re-check (W1). ${k.flags.val} open now; answer them with the ✅ / ✏️ buttons in Telegram.`,
      },
    };
  },
};

// ── 2. Top rates ─────────────────────────────────────────────────────────────
const topTile: TileDef = {
  id: 'top',
  compact: ({ d, sel, replay }) => <TopRows d={d} sel={sel} replay={replay} />,
  expanded: ({ d, sel, set, replay }) => {
    const segDef = TOP_SEGMENTS.find((s) => s.key === sel.top)!;
    const rows = topRates(d, sel.top), r = rows[Math.min(sel.topSel, rows.length - 1)];
    const avg = rows.reduce((a, x) => a + x.headline_rate, 0) / (rows.length || 1);
    return {
      title: 'Top rates · ' + segDef.title,
      segs: [seg(TOP_SEGMENTS.map((s) => [s.key, s.short] as [string, string]), sel.top, (v) => set({ top: v as string, topSel: 0 }))],
      main: <TopRows d={d} sel={sel} replay={replay} big onPick={(i) => set({ topSel: i })} />,
      insight: r ? {
        kicker: segDef.title, title: r.name,
        rows: [
          { k: 'Rate', v: pct(r.headline_rate), s: r.rate_min != null && r.rate_max != null && r.rate_min !== r.rate_max ? `range ${pct(r.rate_min)}–${pct(r.rate_max)}` : '' },
          { k: 'Vs average of top ' + rows.length, v: signed(r.headline_rate - avg), s: 'pts' },
          { k: 'Rank', v: '#' + (rows.indexOf(r) + 1), s: 'of ' + rows.length },
          { k: 'Threshold', v: <span style={{ font: '400 13px/1.4 Poppins' }}>{r.threshold_note ?? 'None recorded'}</span> },
          { k: 'Source', v: <span style={{ font: '400 13px Poppins' }}><Src url={r.source_url} /></span>, s: r.verified_on ? 'verified ' + fmtDate(r.verified_on) : '' },
        ],
        note: <>{r.note}{r.needs_verification && <span className="badge">conflicting sources</span>}</>,
      } : { kicker: segDef.title, title: 'No data yet', rows: [], note: 'No country has a known rate for this tax yet.' },
    };
  },
};
function TopRows({ d, sel, replay, big, onPick }: { d: Dashboard; sel: Sel; replay: number; big?: boolean; onPick?: (i: number) => void }) {
  const rows = topRates(d, sel.top), segDef = TOP_SEGMENTS.find((s) => s.key === sel.top)!;
  const scale = niceMax(Math.max(1, ...rows.map((r) => r.headline_rate)) * 1.15);
  const target: Vals = {}; rows.forEach((r, i) => { target['c' + i] = r.headline_rate; });
  const T = useTween(target, { stagger: 70 }, replay);
  const body = rows.length ? rows.map((r, i) => {
    const v = T['c' + i] || 0, w = (v / scale) * 100;
    return (
      <div key={r.jurisdiction_code} onClick={onPick ? (e) => { e.stopPropagation(); onPick(i); } : undefined}
        style={big ? { display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
          background: sel.topSel === i ? 'rgba(216,176,122,.08)' : 'transparent', transition: 'background .2s' } : { display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', font: `400 ${big ? 15 : 13}px/1 Poppins`, color: '#ece6dc' }}>
          <span>{r.name}{r.needs_verification && big && <span className="badge">check</span>}</span><span>{(Math.round(v * 10) / 10).toString()}%</span>
        </div>
        <div className="bar2" style={big ? { height: 3 } : undefined}>
          <div className="fill" style={{ width: w + '%' }} />
          <div className="knob" style={{ left: w + '%', ...(big ? { width: 8, height: 8, margin: '-4px 0 0 -4px' } : {}) }} />
        </div>
      </div>
    );
  }) : <div className="empty">No country has a known rate for this tax yet.</div>;
  if (big) return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{body}</div>;
  return (
    <>
      <div className="tile-title">Top rates · {segDef.title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: rows.length >= 4 ? 'space-between' : 'flex-start', gap: rows.length >= 4 ? 0 : 18, flex: 1, marginTop: 4 }}>{body}</div>
    </>
  );
}

// ── 3. Market signal radar ───────────────────────────────────────────────────
function RadarSvg({ d, sel, replay, big, hover, onHover }: { d: Dashboard; sel: Sel; replay: number; big?: boolean; hover?: number | null; onHover?: (i: number | null) => void }) {
  const r = radar(d, sel.radar, sel.hub);
  const target: Vals = {}; r.axes.forEach((a, i) => { target['r' + i] = a.v01; });
  const T = useTween(target, { stagger: 60 }, replay);
  const g = big ? radarGeom(r.axes.map((_, i) => T['r' + i] || 0), r.axes.map((a) => a.label), 220, 185, 130, 0.16)
    : radarGeom(r.axes.map((_, i) => T['r' + i] || 0), r.axes.map((a) => a.label), 160, 128, 88, 0.2);
  const id = big ? 'rgE' : 'rgT';
  return (
    <svg viewBox={big ? '0 0 440 360' : '0 0 320 240'} style={big ? { width: '100%', maxHeight: 480 } : { width: '100%', flex: 1, minHeight: 0 }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e6c28c" stopOpacity=".75" /><stop offset="1" stopColor="#8a6844" stopOpacity=".45" /></linearGradient></defs>
      {g.rings.map((p, i) => <polygon key={i} points={p} fill="none" stroke="rgba(255,236,210,.12)" strokeWidth="1" />)}
      {g.spokes.map((s, i) => <line key={i} x1={g.cx} y1={g.cy} x2={s.x} y2={s.y} stroke="rgba(255,236,210,.1)" />)}
      <polygon points={g.poly} fill={`url(#${id})`} stroke="#e6c28c" strokeWidth={big ? 1.5 : 1.2} />
      {g.dots.map((p) => big ? (
        <g key={p.i} onMouseEnter={() => onHover?.(p.i)} onMouseLeave={() => onHover?.(null)}>
          <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
          <circle cx={p.x} cy={p.y} r={hover === p.i ? 6 : 3.5} fill={r.axes[p.i].known ? '#f3dcb2' : 'none'} stroke={r.axes[p.i].known ? 'none' : '#8f877c'} strokeDasharray="2 2" style={{ transition: 'r .15s' }} />
        </g>
      ) : <circle key={p.i} cx={p.x} cy={p.y} r="2.6" fill={r.axes[p.i].known ? '#f3dcb2' : '#6f675d'} />)}
      {g.labels.map((l) => (
        <text key={l.i} x={l.x} y={l.y} textAnchor={l.a} dominantBaseline="middle" fill={big && hover === l.i ? '#f3dcb2' : r.axes[l.i].known ? '#ece6dc' : '#6f675d'}
          style={{ font: `400 ${big ? 13 : 11}px Poppins` }}>{l.t}{r.axes[l.i].known ? '' : ' ?'}</text>
      ))}
    </svg>
  );
}
const radarTile: TileDef = {
  id: 'radar',
  compact: ({ d, sel, replay }) => (<><div className="tile-title">Market signal · {nameOf(d, sel.radar)}</div><RadarSvg d={d} sel={sel} replay={replay} /></>),
  expanded: ({ d, sel, set, replay, hover, setHover }) => {
    const r = radar(d, sel.radar, sel.hub);
    return {
      title: 'Market signal · ' + nameOf(d, sel.radar),
      pick: seg(countries(d).map((c) => [c.code, c.name] as [string, string]), sel.radar, (v) => set({ radar: v as string })) as Seg<string>,
      segs: [seg<'MU' | 'SC'>([['MU', 'Mauritius'], ['SC', 'Seychelles']], sel.hub, (v) => set({ hub: v }))],
      main: <RadarSvg d={d} sel={sel} replay={replay} big hover={hover} onHover={setHover} />,
      insight: {
        kicker: 'Signals · 0 to 100', title: nameOf(d, sel.radar),
        rows: r.axes.map((a, i) => ({ k: a.label + (hover === i ? ' ◆' : ''), v: a.known ? Math.round(a.v01 * 100) : '—', s: a.display })),
        note: <>Each signal is scaled to the strongest country, so 100 means "the most of what we track". Treaty is with {sel.hub === 'MU' ? 'Mauritius' : 'Seychelles'}. Wealth uses {r.wealthMetric}. <b style={{ color: '#ece6dc', fontWeight: 500 }}>No combined score</b> until the data is verified.</>,
      },
    };
  },
};

// ── 4. Coverage map ──────────────────────────────────────────────────────────
function MapSvg({ d, sel, replay, big, onPick }: { d: Dashboard; sel: Sel; replay: number; big?: boolean; onPick?: (c: string) => void }) {
  const pins = mapPins(d);
  const T = useTween({ p: 1 }, { dur: big ? 1200 : 1400 }, replay);
  const mp = T.p || 0, id = big ? 'E' : 'T';
  return (
    <svg viewBox="0 0 720 276" style={big ? { width: '100%' } : { width: '100%', flex: 1, minHeight: 0 }}>
      <defs>
        <radialGradient id={'glow' + id}><stop offset="0" stopColor="#ffd9a0" stopOpacity=".9" /><stop offset=".35" stopColor="#d8a65f" stopOpacity=".35" /><stop offset="1" stopColor="#d8a65f" stopOpacity="0" /></radialGradient>
        <clipPath id={'mclip' + id}><rect x="0" y="0" height="276" width={mp * 730} /></clipPath>
      </defs>
      <path d={LAND_DOTS} fill="rgba(216,190,150,.42)" clipPath={`url(#mclip${id})`} />
      {pins.map((p) => {
        const [x, y] = proj(p.lon, p.lat), on = sel.pin === p.code, g = 0.25 + 0.75 * p.glow01;
        return (
          <g key={p.code} onClick={onPick ? (e) => { e.stopPropagation(); onPick(p.code); } : undefined}
            style={{ cursor: onPick ? 'pointer' : undefined, opacity: mp > x / 720 ? 1 : 0, transition: 'opacity .3s' }}>
            <circle cx={x} cy={y} r={big ? (on ? 48 : 30) * (0.7 + 0.3 * g) : 34 * (0.6 + 0.4 * g)} fill={`url(#glow${id})`} style={{ opacity: g, transition: 'r .3s' }} />
            {big && <circle cx={x} cy={y} r="4" fill="none" stroke="#ffd9a0" strokeWidth="1" style={{ animation: 'pinPulse 2s ease-out infinite' }} />}
            <circle cx={x} cy={y} r={big && on ? 6 : 4} fill="#fff0d6" style={{ transition: 'r .3s' }} />
            {big && <title>{p.name}</title>}
            {/* European pins sit too close to label them all: label the selected one, plus pins outside Europe. */}
            {big && (on || !(p.lat > 35 && p.lon > -12 && p.lon < 30)) && (
              <text x={x + 10} y={p.code === 'MU' || p.code === 'ZA' ? y + 16 : y - 10} fill={on ? '#f3dcb2' : '#9a9185'}
                style={{ font: '500 11px Poppins', transition: 'fill .3s', paintOrder: 'stroke', stroke: '#1b1a18', strokeWidth: 3 }}>{p.name}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
const LowHigh = ({ big }: { big?: boolean }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: `400 ${big ? 11 : 10}px Poppins`, color: '#9a9185', marginTop: big ? 10 : 0 }}>
    <span>Fewer rates</span><span style={{ width: big ? 70 : 60, height: 2, borderRadius: 2, background: 'linear-gradient(90deg,#5a4630,#ffd9a0)' }} /><span>More</span>
    {big && <span style={{ marginLeft: 14, color: '#6f675d' }}>Click a pin</span>}
  </div>
);
const mapTile: TileDef = {
  id: 'map',
  compact: ({ d, sel, replay }) => (<><div className="tile-title">Coverage map</div><MapSvg d={d} sel={sel} replay={replay} /><LowHigh /></>),
  expanded: ({ d, sel, set, replay }) => {
    const pins = mapPins(d), p = pins.find((x) => x.code === sel.pin) ?? pins[0];
    const I = p.rows;
    return {
      title: 'Coverage map',
      pick: seg(pins.map((x) => [x.code, x.name] as [string, string]), p.code, (v) => set({ pin: v as string })) as Seg<string>,
      main: (
        <>
          <MapSvg d={d} sel={{ ...sel, pin: p.code }} replay={replay} big onPick={(c) => set({ pin: c })} />
          <LowHigh big />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255,236,210,.07)' }}>
              <div className="tile-title" style={{ fontSize: 11 }}>Notes &amp; changes · {p.name}</div>
              <div style={{ font: '400 10px Poppins', color: '#6f675d' }}>{p.feed.length} item{p.feed.length === 1 ? '' : 's'}</div>
            </div>
            {p.feed.length ? p.feed.map((n, i) => (
              <a key={p.code + i} className="feed-row" href={n.href ?? undefined} target="_blank" rel="noreferrer" style={{ animationDelay: `${i * 90}ms`, cursor: n.href ? 'pointer' : 'default' }}
                onClick={(e) => { if (!n.href) e.preventDefault(); e.stopPropagation(); }}>
                <span style={{ font: '400 11px Poppins', color: '#6f675d' }}>{n.date}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ font: '500 13px/1.35 Poppins', color: '#ece6dc', textWrap: 'pretty' }}>{n.title}</span>
                  <span style={{ font: '400 11px/1.4 Poppins', color: '#9a9185' }}>{n.src}</span>
                </span>
                <span className="tag">{n.tag}</span>
              </a>
            )) : <div className="feed-row" style={{ gridTemplateColumns: '1fr', color: '#9a9185', font: '400 12px Poppins' }}>No notes or review activity for {p.name} yet.</div>}
          </div>
        </>
      ),
      insight: { kicker: p.role, title: p.name, rows: I.map((r) => ({ k: r.k, v: r.v, s: r.s })), note: p.note },
    };
  },
};

// ── 5. Line · employers / rate history ───────────────────────────────────────
const LINE_SEGS: [LineMode, string][] = [['employers', 'Employers'], ['CGT_FINANCIAL', 'CGT'], ['INHERITANCE_DIRECT', 'Inheritance']];
const lineTile: TileDef = {
  id: 'line',
  compact: ({ d, sel, replay, hover, setHover }) => {
    const l = lineSeries(d, sel.line, sel.cc);
    return (<><Head title={sel.line === 'employers' ? 'Line · employers over time' : 'Line · rates over time'} sub={l.title} />
      {l.series.length ? <LineChart id="lnT" {...l} replay={replay} hover={hover} onHover={setHover} /> : <div className="empty">No data for the selected countries.</div>}
      <Legend items={l.series.map((s) => ({ n: s.code, c: colorOf(s.code) }))} /></>);
  },
  expanded: ({ d, sel, set, replay, hover, setHover }) => {
    const l = lineSeries(d, sel.line, sel.cc), yi = hover ?? l.years.length - 1;
    const fv = (v: number | null) => (v == null ? '—' : l.unit === 'pct' ? pct(v) : fmtCount(v));
    return {
      title: sel.line === 'employers' ? 'Line · employers over time' : 'Line · rates over time', multi: true,
      segs: [seg(LINE_SEGS, sel.line, (v) => set({ line: v as LineMode }))],
      main: (<>{l.series.length ? <LineChart id="lnE" {...l} replay={replay} hover={hover} onHover={setHover} /> : <div className="empty">No data for the selected countries.</div>}
        <Legend items={l.series.map((s) => ({ n: nameOf(d, s.code), c: colorOf(s.code) }))} /></>),
      insight: {
        kicker: l.title, title: String(l.years[yi] ?? '—'),
        rows: l.series.map((s) => {
          const a = s.values[yi], b = yi > 0 ? s.values[yi - 1] : null;
          const ch = a != null && b != null && a !== b ? (l.unit === 'pct' ? `${arrow(a - b)} ${signed(a - b)} pts` : `${arrow(a - b)} ${signed(((a - b) / b) * 100)}%`) + ` vs ${l.years[yi - 1]}` : '';
          return { k: nameOf(d, s.code), v: fv(a), s: ch };
        }),
        note: sel.line === 'employers'
          ? 'Self-employed people with employees (Eurostat lfsa_egaps), a proxy for business owners until HNWI figures are entered. Refreshed monthly by E1. Hover to read a year.'
          : 'Headline rate per year from the rate history. History starts when rates were first recorded (2026) and grows as rates change; nothing is back-filled.',
      },
    };
  },
};

// ── 6. Columns · compare countries ───────────────────────────────────────────
const colsTile: TileDef = {
  id: 'cols',
  compact: ({ d, sel, replay, hover, setHover }) => (<><Head title="Columns · compare countries" sub={taxLabel(d, sel.col)} />
    <ColumnChart items={compare(d, sel.col, sel.cc)} replay={replay} hover={hover} onHover={setHover} /></>),
  expanded: ({ d, sel, set, replay, hover, setHover }) => {
    const items = compare(d, sel.col, sel.cc), st = compareStats(items), h = hover != null ? items[hover] : null;
    return {
      title: 'Columns · compare countries', multi: true,
      pick: seg(taxTypesWithData(d).map((t) => [t.code, t.label] as [string, string]), sel.col, (v) => set({ col: v as string })) as Seg<string>,
      main: <ColumnChart items={items} replay={replay} hover={hover} onHover={setHover} />,
      insight: {
        kicker: taxLabel(d, sel.col), title: h ? h.name : 'Selection',
        rows: h ? [
          { k: 'Rate', v: h.value == null ? 'Unknown' : pct(h.value), s: h.rate?.inherited ? 'inherited from parent' : '' },
          { k: 'Vs average', v: h.value == null || st.avg == null ? '—' : signed(h.value - st.avg), s: 'pts' },
          { k: 'Rank', v: h.value == null ? '—' : '#' + (st.sorted.findIndex((x) => x.code === h.code) + 1), s: 'of ' + st.sorted.length },
          { k: 'Source', v: <span style={{ font: '400 13px Poppins' }}>{h.rate ? <Src url={h.rate.source_url} /> : '—'}</span>, s: h.rate?.verified_on ? 'verified ' + fmtDate(h.rate.verified_on) : '' },
        ] : [
          { k: 'Highest', v: st.highest ? pct(st.highest.value) : '—', s: st.highest?.name },
          { k: 'Lowest', v: st.lowest ? pct(st.lowest.value) : '—', s: st.lowest?.name },
          { k: 'Average', v: st.avg == null ? '—' : pct(st.avg) },
          { k: 'Unknown', v: st.unknown, s: 'countries' },
        ],
        note: 'Pick a tax type and countries above. Dashed grey columns are unknown; a flat line means there is no such tax.',
      },
    };
  },
};

// ── 7. Donut · wealth share ──────────────────────────────────────────────────
const DONUT_SEGS: [WealthMetric, string][] = [['business_owners', 'Employers'], ['hnwi_count', 'HNWI'], ['millionaires', 'Millionaires']];
const noWealth = (m: WealthMetric) => `No ${WEALTH_LABEL[m].toLowerCase()} figures yet. Phase 2 fills them from the ${m === 'hnwi_count' ? 'Capgemini World Wealth' : 'UBS Global Wealth'} Report.`;
const donutTile: TileDef = {
  id: 'donut',
  compact: ({ d, sel, replay, hover, setHover }) => {
    const w = wealthShare(d, sel.donut, sel.cc);
    return (<><Head title="Donut · wealth share" sub={WEALTH_LABEL[sel.donut]} />
      {w.empty ? <div className="empty">{noWealth(sel.donut)}</div> : <Donut items={w.items} caption={WEALTH_LABEL[sel.donut]} replay={replay} hover={hover} onHover={setHover} />}</>);
  },
  expanded: ({ d, sel, set, replay, hover, setHover }) => {
    const w = wealthShare(d, sel.donut, sel.cc), h = hover != null ? w.items[hover] : null, srt = [...w.items].sort((a, b) => b.value - a.value);
    return {
      title: 'Donut · wealth share', multi: true,
      segs: [seg(DONUT_SEGS, sel.donut, (v) => set({ donut: v as WealthMetric }))],
      main: w.empty ? <div className="empty" style={{ minHeight: 220 }}>{noWealth(sel.donut)}</div>
        : <Donut items={w.items} caption={WEALTH_LABEL[sel.donut]} replay={replay} hover={hover} onHover={setHover} big />,
      insight: {
        kicker: WEALTH_LABEL[sel.donut], title: h ? h.name : 'Selection',
        rows: w.empty ? [] : h ? [{ k: 'Count', v: fmtCount(h.value), s: String(h.year) }, { k: 'Share', v: pct((h.value / w.total) * 100), s: 'of selection' }, { k: 'Source', v: <span style={{ font: '400 13px Poppins' }}>{h.source}</span> }]
          : [{ k: 'Total', v: fmtCount(w.total) }, { k: 'Largest', v: srt[0]?.name ?? '—', s: srt[0] ? pct((srt[0].value / w.total) * 100) : '' },
            { k: 'No data', v: w.missing.length, s: w.missing.join(', ') || 'countries' }],
        note: sel.donut === 'business_owners'
          ? 'Employers (self-employed with employees), latest Eurostat year per country: the closest available proxy for the target client until HNWI figures are entered.'
          : 'Latest year per country from the wealth reports, entered in Phase 2.',
      },
    };
  },
};

// ── 8. Review activity (repurposed "structures set up") ──────────────────────
const areaTile: TileDef = {
  id: 'area',
  compact: ({ d, sel, replay, hover, setHover }) => {
    const a = reviewActivity(d);
    return (<><Head title="Area · review activity" sub={sel.area === 'cum' ? 'Cumulative' : 'Monthly'} />
      <AreaChart id="arT" labels={a.labels} values={a.raised} cumulative={sel.area === 'cum'} replay={replay} hover={hover} onHover={setHover} /></>);
  },
  expanded: ({ d, sel, set, replay, hover, setHover }) => {
    const a = reviewActivity(d), i = hover ?? a.labels.length - 1, mx = Math.max(...a.raised), tot = a.raised.reduce((x, y) => x + y, 0);
    return {
      title: 'Area · review activity',
      segs: [seg<'mon' | 'cum'>([['mon', 'Monthly'], ['cum', 'Cumulative']], sel.area, (v) => set({ area: v }))],
      main: <AreaChart id="arE" labels={a.labels} values={a.raised} cumulative={sel.area === 'cum'} replay={replay} hover={hover} onHover={setHover} />,
      insight: {
        kicker: 'Month', title: a.labels[i],
        rows: [{ k: 'Flags raised', v: a.raised[i] }, { k: 'Confirmed / resolved', v: a.confirmed[i] },
          { k: 'Running total', v: a.raised.slice(0, i + 1).reduce((x, y) => x + y, 0) },
          { k: 'Busiest month', v: mx, s: mx ? a.labels[a.raised.indexOf(mx)] : '' }, { k: '12-month total', v: tot }],
        note: 'Review flags raised by the daily source re-check. The design showed "structures set up": that needs a structures table the firm does not keep yet (PLAN.md §8).',
      },
    };
  },
};

// ── 9. Stacked · tax load by category ────────────────────────────────────────
const stackTile: TileDef = {
  id: 'stack',
  compact: ({ d, sel, replay, hoverKey, setHoverKey }) => (<><Head title="Stacked · tax load by category" sub={sel.stack === 'abs' ? 'Index points' : 'Share of total'} />
    <StackedChart items={taxLoad(d, sel.cc)} share={sel.stack === 'pct'} replay={replay} hover={hoverKey} onHover={setHoverKey} />
    <Legend items={STACK_CATS.map((c, j) => ({ n: c.label, c: STACK_COLORS[j] }))} /></>),
  expanded: ({ d, sel, set, replay, hoverKey, setHoverKey }) => {
    const items = taxLoad(d, sel.cc);
    let title: ReactNode = 'Selection', rows: InsightRow[];
    if (hoverKey) {
      const [c, j] = hoverKey.split('|'), it = items.find((x) => x.code === c)!, v = it.parts[+j];
      title = it.name;
      rows = [{ k: STACK_CATS[+j].label, v: r1(v), s: 'pts' }, { k: 'Share of country', v: pct((v / (it.total || 1)) * 100) }, { k: 'Country total', v: r1(it.total), s: 'pts' }];
    } else rows = items.map((it) => ({ k: it.name, v: r1(it.total), s: it.known ? `pts · ${it.known} known rates` : 'no rates yet' }));
    return {
      title: 'Stacked · tax load by category', multi: true,
      segs: [seg<'abs' | 'pct'>([['abs', 'Absolute'], ['pct', '100%']], sel.stack, (v) => set({ stack: v }))],
      main: (<><StackedChart items={items} share={sel.stack === 'pct'} replay={replay} hover={hoverKey} onHover={setHoverKey} />
        <Legend items={STACK_CATS.map((c, j) => ({ n: c.label, c: STACK_COLORS[j] }))} /></>),
      insight: { kicker: 'Tax load by category', title, rows,
        note: 'The sum of known headline rates per category. This is an index for comparing countries, not a tax bill: it counts one-off and annual taxes alike. Missing rates add nothing, so sparse countries look lighter than they are.' },
    };
  },
};

// ── 10. Compounding ──────────────────────────────────────────────────────────
const compTile: TileDef = {
  id: 'comp',
  compact: ({ d, sel, replay, hover, setHover }) => {
    const c = compounding(d, sel.cpc, sel.cr);
    return (<><Head title="Cumulative · compounded growth" sub={`${Math.round(sel.cr * 100)}% · ${sel.ch} yrs · ${sel.cpc}`} />
      <CompoundChart id="cpT" home={(t) => c.at(c.homeDrag, t)} struct={(t) => c.at(c.structDrag, t)} years={sel.ch} replay={replay} hover={hover} onHover={setHover} />
      <Legend items={[{ n: 'In structure', c: '#e6c28c' }, { n: 'Held at home', c: '#8f877c' }]} /></>);
  },
  expanded: ({ d, sel, set, replay, hover, setHover }) => {
    const c = compounding(d, sel.cpc, sel.cr), t = Math.round((sel.ch * (hover ?? 10)) / 10);
    const fm = (v: number) => '€' + (v / 1e6).toFixed(2) + 'm', s = c.at(c.structDrag, t), h = c.at(c.homeDrag, t);
    return {
      title: 'Cumulative · compounded growth · ' + nameOf(d, sel.cpc),
      pick: seg(countries(d).map((x) => [x.code, x.name] as [string, string]), sel.cpc, (v) => set({ cpc: v as string })) as Seg<string>,
      segs: [seg<number>([[0.04, '4%'], [0.06, '6%'], [0.08, '8%']], sel.cr, (v) => set({ cr: v })),
        seg<number>([[10, '10y'], [20, '20y'], [30, '30y']], sel.ch, (v) => set({ ch: v }))],
      main: (<><CompoundChart id="cpE" home={(x) => c.at(c.homeDrag, x)} struct={(x) => c.at(c.structDrag, x)} years={sel.ch} replay={replay} hover={hover} onHover={setHover} />
        <Legend items={[{ n: 'In structure', c: '#e6c28c' }, { n: 'Held at home', c: '#8f877c' }]} /></>),
      insight: {
        kicker: `€1m invested · year ${t}`, title: fm(s),
        rows: [{ k: 'In structure', v: fm(s), s: `−${(c.structDrag * 100).toFixed(2)}%/yr` }, { k: 'Held at home', v: fm(h), s: `−${(c.homeDrag * 100).toFixed(2)}%/yr` },
          { k: 'Difference', v: fm(s - h) }],
        note: <>Assumptions: {c.assumptions.join('; ')}. Structure cost {(STRUCTURE_COST * 100).toFixed(1)}% is a placeholder until real costs are supplied. Indicative only.</>,
      },
    };
  },
};

export const TILES: TileDef[] = [kpiTile, topTile, radarTile, mapTile, lineTile, colsTile, donutTile, areaTile, stackTile, compTile];
