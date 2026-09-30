// Shared tile building blocks: every tile is a Card named for its purpose, with a one-line
// "what it answers", optional controls, and a footnote that states its assumptions.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { GateStatus } from '../data/model';

/** 'compact' = the preview inside a grid tile; 'full' = the expanded view. Set by TileGrid. */
export const TileMode = createContext<'compact' | 'full'>('full');
export const useCompact = () => useContext(TileMode) === 'compact';

/** The tile's immediate metric: a headline value, what it is, and optional context. */
export interface Metric { value: ReactNode; label: ReactNode; sub?: ReactNode }

/**
 * legend: what every colour, mark and axis means. Shown ABOVE the chart, in the tile and in the
 * expanded view, so a reader never has to hunt for it. foot: model notes and sources only.
 */
export function Card({ title, purpose, controls, children, foot, id, metric, legend }: {
  title: string; purpose: string; controls?: ReactNode; children: ReactNode; foot?: ReactNode; full?: boolean; id: string; metric?: Metric; legend?: ReactNode;
}) {
  if (useCompact()) {
    return (
      <div className="tile-card">
        <h2 className="card-title">{title}</h2>
        {metric && (
          <div className="tile-metric">
            <div className="tile-value">{metric.value}</div>
            <div className="tile-label">{metric.label}{metric.sub && <span> · {metric.sub}</span>}</div>
          </div>
        )}
        {legend && <div className="legend tile-legend">{legend}</div>}
        <div className="tile-preview">{children}</div>
      </div>
    );
  }
  return (
    <article className="card-full" id={id} aria-labelledby={id + '-t'}>
      <header className="card-head">
        <div className="card-name">
          <h2 className="card-title" id={id + '-t'}>{title}</h2>
          <p className="card-purpose">{purpose}</p>
        </div>
        {controls && <div className="card-controls">{controls}</div>}
      </header>
      {legend && <div className="legend card-legend">{legend}</div>}
      <div className="card-body">{children}</div>
      {foot && <footer className="card-foot">{foot}</footer>}
    </article>
  );
}

export function Seg<T extends string | number>({ opts, cur, on, label }: { opts: [T, string][]; cur: T; on: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {opts.map(([v, l]) => <button key={String(v)} className={v === cur ? 'on' : ''} aria-pressed={v === cur} onClick={() => on(v)}>{l}</button>)}
    </div>
  );
}

/** true on the frame after mount: lets bars grow from 0 with a CSS transition. */
export function useGrown(deps: unknown[] = []) {
  const [g, setG] = useState(false);
  useEffect(() => { setG(false); const t = setTimeout(() => setG(true), 30); return () => clearTimeout(t); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return g;
}

/** Hover/tap tooltip anchored inside a relatively positioned box. */
export function useTip<T>() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ data: T; x: number; y: number } | null>(null);
  const show = (data: T) => (e: React.MouseEvent) => {
    const b = box.current?.getBoundingClientRect();
    if (b) setTip({ data, x: e.clientX - b.left, y: e.clientY - b.top });
  };
  const hide = () => setTip(null);
  const style = (w = 250) => tip ? { left: Math.max(0, Math.min(tip.x + 14, (box.current?.clientWidth ?? 400) - w)), top: tip.y + 14, width: w } : {};
  return { box, tip, show, hide, style };
}

export const GATE_COLOR: Record<GateStatus, string> = { green: '#9cc58f', amber: '#e0b25a', red: '#d9785f', unknown: 'transparent' };
export const fmtEur = (v: number) => (Math.abs(v) >= 1e6 ? `€${(v / 1e6).toFixed(2)}m` : `€${Math.round(v / 1000).toLocaleString('en')}k`);
export const HUB_COLOR: Record<string, string> = { MU: '#d8b07a', SC: '#8a6844' };
export const COUNTRY_COLOR = '#f3dcb2';

export function SourceLink({ url }: { url: string | null }) {
  if (!url) return <span className="muted">no source yet</span>;
  let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
  return <a href={url} target="_blank" rel="noreferrer">{host} ↗</a>;
}

export const Hatch = ({ className = '' }: { className?: string }) => <span className={'hatch ' + className} aria-label="unknown">?</span>;

/** A legend chip: colour swatch (or hatch for unknown) + meaning. */
export const Key = ({ color, hatch, line, children }: { color?: string; hatch?: boolean; line?: boolean; children: ReactNode }) => (
  <span><i className={(hatch ? 'hatch-dot' : '') + (line ? ' key-line' : '')} style={color ? { background: color } : undefined} />{children}</span>
);

/**
 * Axis row placed above a row chart: names the label column, says what the bar measures and its
 * scale ends, and (optionally) the value column. `row` = the chart's row class so columns align.
 */
export function AxisRow({ row, lead, label, min, max, value, pre, centred }: {
  row: string; lead?: string; label: ReactNode; min?: ReactNode; max?: ReactNode; value?: string; pre?: boolean; centred?: boolean;
}) {
  return (
    <div className={row + ' axis-row'} aria-hidden="true">
      {pre && <span />}
      <span className="axis-cap">{lead}</span>
      <span className={'axis-scale' + (centred ? ' centred' : '')}><b>{min}</b><em>{label}</em><b>{max}</b></span>
      {value !== undefined && <span className="axis-cap r">{value}</span>}
    </div>
  );
}
