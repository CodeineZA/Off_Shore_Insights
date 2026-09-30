// SVG charts ported from the Claude Design templates. Each chart animates its own values
// (useTween) and restarts from zero when `replay` changes. Hover is lifted to the parent so
// the expanded view's insight panel can follow it.
import type { ReactElement } from 'react';
import { BASE, PH, PL, PW, colorOf, cumsum, niceMax, r1, smooth, yTicks } from './geom';
import { useTween, type Vals } from './tween';
import { fmtCount } from '../data/insights';

type Hover = { hover: number | null; onHover: (i: number | null) => void };
const pct = (v: number) => Math.round(v) + '%';
const fmt1 = (v: number, raw: number) => (raw % 1 ? v.toFixed(1) : String(Math.round(v)));

function Axes({ yt, xt }: { yt: { y: number; l: string }[]; xt: { x: number; l: string | number }[] }) {
  return (
    <>
      {yt.map((t, i) => (
        <g key={'y' + i}>
          <line x1="34" x2="466" y1={t.y} y2={t.y} stroke="rgba(255,236,210,.06)" />
          <text x="28" y={t.y} textAnchor="end" dominantBaseline="middle" fill="#6f675d" style={{ font: '400 9px Poppins' }}>{t.l}</text>
        </g>
      ))}
      {xt.map((t, i) => (
        <text key={'x' + i} x={t.x} y="210" textAnchor="middle" fill="#6f675d" style={{ font: '400 9px Poppins' }}>{t.l}</text>
      ))}
    </>
  );
}
function hits(n: number, xf: (i: number) => number, { onHover }: Hover) {
  const w = r1(n > 1 ? PW / (n - 1) : PW);
  return [...Array(n)].map((_, i) => (
    <rect key={'h' + i} x={r1(xf(i) - w / 2)} y="14" width={w} height="180" fill="transparent"
      onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)} />
  ));
}
export function Legend({ items }: { items: { n: string; c: string }[] }) {
  return <div className="legend">{items.map((g) => <span key={g.n}><i style={{ background: g.c }} />{g.n}</span>)}</div>;
}

// ── Line (tile 5) ────────────────────────────────────────────────────────────
export interface LineProps extends Hover { years: number[]; series: { code: string; values: (number | null)[] }[]; unit: 'pct' | 'count'; replay: number; id: string }
export function LineChart({ years, series, unit, replay, hover, onHover, id }: LineProps) {
  const target: Vals = { p: 1 };
  let mx = 0;
  series.forEach((s) => s.values.forEach((v, i) => { if (v != null) { target[s.code + i] = v; mx = Math.max(mx, v); } }));
  target.__max = niceMax(mx * 1.1);
  const T = useTween(target, { dur: 1100 }, replay);
  const n = years.length, lx = (i: number) => r1(n > 1 ? PL + (i * PW) / (n - 1) : PL + PW / 2), M = T.__max || 1;
  const di = hover ?? n - 1;
  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => (v == null ? null : [lx(i), r1(BASE - ((T[s.code + i] || 0) / M) * PH)] as [number, number]));
    let d = '', pen = false;
    pts.forEach((p) => { if (!p) { pen = false; return; } d += (pen ? ' L' : ' M') + p.join(','); pen = true; });
    return { code: s.code, c: colorOf(s.code), d, pts };
  });
  const fy = unit === 'pct' ? pct : fmtCount;
  return (
    <svg viewBox="0 0 480 220" className="chart">
      <defs><clipPath id={id + 'c'}><rect x="0" y="0" height="220" width={r1(PL + (T.p || 0) * (PW + 30))} /></clipPath></defs>
      <Axes yt={yTicks(M, fy)} xt={years.map((y, i) => ({ x: lx(i), l: y }))} />
      <g clipPath={`url(#${id}c)`}>
        {lines.map((q) => <path key={q.code} d={q.d} fill="none" stroke={q.c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {lines.map((q) => q.pts.map((p, i) => p && (q.pts.filter(Boolean).length === 1 || i === di) ? (
          <circle key={q.code + i} cx={p[0]} cy={p[1]} r="3.5" fill={q.c} stroke="#1b1a18" strokeWidth="1.5" />) : null))}
      </g>
      <line x1={lx(di)} x2={lx(di)} y1="14" y2="194" stroke="rgba(243,220,178,.35)" strokeDasharray="3 3" style={{ opacity: hover != null ? 1 : 0 }} />
      {hits(n, lx, { hover, onHover })}
    </svg>
  );
}

// ── Columns (tile 6) ─────────────────────────────────────────────────────────
export interface ColumnsProps extends Hover { items: { code: string; value: number | null }[]; replay: number }
export function ColumnChart({ items, replay, hover, onHover }: ColumnsProps) {
  const target: Vals = { __max: niceMax(Math.max(1, ...items.map((i) => i.value ?? 0)) * 1.1) };
  items.forEach((i) => { target[i.code] = i.value ?? 0; });
  const T = useTween(target, { stagger: 60 }, replay);
  const M = T.__max || 1, n = Math.max(1, items.length), band = PW / n, bw = Math.min(18, band * 0.42);
  return (
    <svg viewBox="0 0 480 220" className="chart">
      <defs><linearGradient id="barG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f3d7a6" /><stop offset="1" stopColor="#8a6844" /></linearGradient></defs>
      <Axes yt={yTicks(M, pct)} xt={items.map((it, i) => ({ x: r1(PL + (i + 0.5) * band), l: it.code }))} />
      {items.map((it, i) => {
        const u = it.value == null, v = T[it.code] || 0, cx = r1(PL + (i + 0.5) * band);
        const h = u ? 8 : Math.max(2, (v / M) * PH), y = r1(BASE - h);
        return (
          <g key={it.code} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}>
            <rect x={r1(cx - bw / 2)} y="14" width={r1(bw)} height="180" rx={r1(bw / 2)} fill="rgba(255,255,255,.035)" />
            <rect x={r1(cx - bw / 2)} y={y} width={r1(bw)} height={r1(h)} rx={r1(bw / 2)} fill={u ? 'transparent' : 'url(#barG)'}
              stroke={u ? '#6d675f' : 'none'} strokeDasharray={u ? '3 3' : '0'} style={{ opacity: hover != null && hover !== i ? 0.4 : 1, transition: 'opacity .2s' }} />
            {!u && h > bw && <circle cx={cx} cy={r1(y + bw / 2)} r={r1(Math.min(3, bw / 4))} fill="#fff3dc" />}
            <text x={cx} y={r1(y - 8)} textAnchor="middle" fill="#ece6dc" style={{ font: '500 10px Poppins' }}>{u ? '?' : fmt1(v, it.value!) + '%'}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Donut (tile 7) ───────────────────────────────────────────────────────────
export interface DonutProps extends Hover { items: { code: string; name: string; value: number }[]; caption: string; replay: number; big?: boolean }
export function Donut({ items, caption, replay, hover, onHover, big }: DonutProps) {
  const target: Vals = { __p: 1 };
  items.forEach((i) => { target[i.code] = i.value; });
  const T = useTween(target, { dur: 1100 }, replay);
  const tot = items.reduce((a, i) => a + (T[i.code] || 0), 0) || 1, P = T.__p || 0, CR = 2 * Math.PI * 76;
  let acc = 0;
  const segs = items.map((it, i) => {
    const len = ((T[it.code] || 0) / tot) * CR * P;
    const o = { c: colorOf(it.code), da: `${r1(Math.max(0, len - 2))} ${r1(CR)}`, dof: r1(-acc), sw: hover === i ? 26 : 18, i };
    acc += len; return o;
  });
  const center = hover != null && items[hover] ? pct(((T[items[hover].code] || 0) / tot) * 100) : fmtCount(tot * P);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 1, minHeight: 0 }}>
      <svg viewBox="0 0 220 220" style={{ width: '46%', maxWidth: big ? 320 : 280, flex: 'none', overflow: 'visible' }}>
        <circle cx="110" cy="110" r="76" fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="18" />
        {segs.map((g) => (
          <circle key={g.i} cx="110" cy="110" r="76" fill="none" stroke={g.c} strokeWidth={g.sw} strokeDasharray={g.da} strokeDashoffset={g.dof}
            transform="rotate(-90 110 110)" onMouseEnter={() => onHover(g.i)} onMouseLeave={() => onHover(null)} style={{ transition: 'stroke-width .2s' }} />
        ))}
        <text x="110" y="112" textAnchor="middle" fill="#ece6dc" style={{ font: '400 28px Poppins' }}>{center}</text>
        <text x="110" y="134" textAnchor="middle" fill="#9a9185" style={{ font: '400 11px Poppins' }}>{hover != null && items[hover] ? items[hover].name : caption}</text>
      </svg>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {items.map((it, i) => (
          <div key={it.code} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(255,236,210,.06)', font: '400 12px Poppins',
              color: '#ece6dc', opacity: hover != null && hover !== i ? 0.4 : 1, transition: 'opacity .2s' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colorOf(it.code), flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</span>
            <span>{pct(((T[it.code] || 0) / tot) * 100)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Area (tile 8) ────────────────────────────────────────────────────────────
export interface AreaProps extends Hover { labels: string[]; values: number[]; cumulative: boolean; replay: number; id: string }
export function AreaChart({ labels, values, cumulative, replay, hover, onHover, id }: AreaProps) {
  const vals = cumulative ? cumsum(values) : values;
  const target: Vals = { __max: niceMax(Math.max(...vals, 1) * 1.1), p: 1 };
  vals.forEach((v, i) => { target['a' + i] = v; });
  const T = useTween(target, { dur: 1100 }, replay);
  const n = labels.length, ax = (i: number) => r1(PL + (i * PW) / (n - 1)), M = T.__max || 1, di = hover ?? n - 1;
  const pts = labels.map((_, i) => [ax(i), r1(BASE - ((T['a' + i] || 0) / M) * PH)] as [number, number]);
  const line = smooth(pts);
  return (
    <svg viewBox="0 0 480 220" className="chart">
      <defs>
        <linearGradient id={id + 'g'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d8b07a" stopOpacity=".45" /><stop offset="1" stopColor="#d8b07a" stopOpacity="0" /></linearGradient>
        <clipPath id={id + 'c'}><rect x="0" y="0" height="220" width={r1(PL + (T.p || 0) * (PW + 30))} /></clipPath>
      </defs>
      <Axes yt={yTicks(M, (v) => String(Math.round(v)))} xt={labels.map((l, i) => ({ x: ax(i), l }))} />
      <g clipPath={`url(#${id}c)`}>
        <path d={`${line} L${ax(n - 1)},${BASE} L${PL},${BASE} Z`} fill={`url(#${id}g)`} />
        <path d={line} fill="none" stroke="#d8b07a" strokeWidth="2" />
      </g>
      <g style={{ opacity: (T.p || 0) > 0.97 || hover != null ? 1 : 0 }}>
        <circle cx={pts[di][0]} cy={pts[di][1]} r="9" fill="rgba(243,220,178,.18)" />
        <circle cx={pts[di][0]} cy={pts[di][1]} r="4" fill="#f3dcb2" />
        <text x={pts[di][0]} y={r1(pts[di][1] - 14)} textAnchor="middle" fill="#f3dcb2" style={{ font: '500 11px Poppins' }}>{Math.round(T['a' + di] || 0)}</text>
      </g>
      {hits(n, ax, { hover, onHover })}
    </svg>
  );
}

// ── Stacked (tile 9) ─────────────────────────────────────────────────────────
export const STACK_COLORS = ['#f1d6a8', '#d8b07a', '#a97f50', '#6f5a43'];
export interface StackedProps { items: { code: string; parts: number[] }[]; share: boolean; replay: number; hover: string | null; onHover: (k: string | null) => void }
export function StackedChart({ items, share, replay, hover, onHover }: StackedProps) {
  const target: Vals = {};
  let mx = 0;
  items.forEach((it) => {
    const tot = it.parts.reduce((a, b) => a + b, 0); mx = Math.max(mx, tot);
    it.parts.forEach((v, j) => { target[it.code + '|' + j] = share ? (tot ? (v / tot) * 100 : 0) : v; });
  });
  target.__max = share ? 100 : niceMax(mx * 1.05);
  const T = useTween(target, { stagger: 18 }, replay);
  const M = T.__max || 1, n = Math.max(1, items.length), band = PW / n, sw = Math.min(26, band * 0.5);
  const rects: ReactElement[] = [];
  items.forEach((it, i) => {
    let y = BASE; const cx = PL + (i + 0.5) * band;
    it.parts.forEach((_, j) => {
      const k = it.code + '|' + j, h = ((T[k] || 0) / M) * PH;
      if (h < 0.5) return; y -= h;
      rects.push(<rect key={k} x={r1(cx - sw / 2)} y={r1(y + 0.75)} width={r1(sw)} height={r1(Math.max(0, h - 1.5))} rx="2" fill={STACK_COLORS[j]}
        onMouseEnter={() => onHover(k)} onMouseLeave={() => onHover(null)} style={{ opacity: hover && hover !== k ? 0.35 : 1, transition: 'opacity .2s' }} />);
    });
  });
  return (
    <svg viewBox="0 0 480 220" className="chart">
      <Axes yt={yTicks(M, share ? pct : (v) => String(Math.round(v)))} xt={items.map((it, i) => ({ x: r1(PL + (i + 0.5) * band), l: it.code }))} />
      {rects}
    </svg>
  );
}

// ── Compounding (tile 10) ────────────────────────────────────────────────────
export interface CompoundProps extends Hover { home: (t: number) => number; struct: (t: number) => number; years: number; replay: number; id: string }
export function CompoundChart({ home, struct, years, replay, hover, onHover, id }: CompoundProps) {
  const target: Vals = { __max: niceMax(Math.max(struct(years), home(years)) / 1e6 * 1.08), p: 1 };
  for (let i = 0; i <= 10; i++) { const t = (years * i) / 10; target['h' + i] = home(t) / 1e6; target['s' + i] = struct(t) / 1e6; }
  const T = useTween(target, { dur: 1200 }, replay);
  const M = T.__max || 1, px = (i: number) => r1(PL + (i * PW) / 10), di = hover ?? 10;
  const hp = [...Array(11)].map((_, i) => [px(i), r1(BASE - ((T['h' + i] || 0) / M) * PH)]);
  const sp = [...Array(11)].map((_, i) => [px(i), r1(BASE - ((T['s' + i] || 0) / M) * PH)]);
  const J = (a: number[][]) => a.map((p) => p.join(',')).join(' ');
  const lx = di > 7 ? sp[di][0] - 8 : sp[di][0] + 8, la = di > 7 ? 'end' : 'start';
  return (
    <svg viewBox="0 0 480 220" className="chart">
      <defs><clipPath id={id + 'c'}><rect x="0" y="0" height="220" width={r1(PL + (T.p || 0) * (PW + 60))} /></clipPath></defs>
      <Axes yt={yTicks(M, (v) => '€' + v.toFixed(1) + 'm')} xt={[0, 2, 4, 6, 8, 10].map((i) => ({ x: px(i), l: 'Y' + Math.round((years * i) / 10) }))} />
      <g clipPath={`url(#${id}c)`}>
        <polygon points={J(sp) + ' ' + J(hp.slice().reverse())} fill="rgba(216,176,122,.12)" />
        <path d={'M' + J(hp).replace(/ /g, ' L')} fill="none" stroke="#8f877c" strokeWidth="1.6" strokeDasharray="4 4" />
        <path d={'M' + J(sp).replace(/ /g, ' L')} fill="none" stroke="#e6c28c" strokeWidth="2.2" />
      </g>
      <line x1={px(di)} x2={px(di)} y1="14" y2="194" stroke="rgba(243,220,178,.35)" strokeDasharray="3 3" style={{ opacity: hover != null ? 1 : 0 }} />
      <g style={{ opacity: (T.p || 0) > 0.97 || hover != null ? 1 : 0 }}>
        <circle cx={sp[di][0]} cy={sp[di][1]} r="4" fill="#f3dcb2" />
        <circle cx={sp[di][0]} cy={hp[di][1]} r="3.5" fill="#8f877c" />
        <text x={lx} y={r1(sp[di][1] - 8)} textAnchor={la} fill="#f3dcb2" style={{ font: '500 11px Poppins' }}>€{(T['s' + di] || 0).toFixed(2)}m</text>
        <text x={lx} y={r1(hp[di][1] + 16)} textAnchor={la} fill="#9a9185" style={{ font: '500 11px Poppins' }}>€{(T['h' + di] || 0).toFixed(2)}m</text>
      </g>
      {hits(11, px, { hover, onHover })}
    </svg>
  );
}
