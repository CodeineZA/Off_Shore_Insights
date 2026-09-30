// Tile grid with the Claude Design morph-expand: tiles show a compact preview; selecting one
// grows it into the full view while the others fly out. Esc or Back returns.
// Each tile's component renders twice: in TileMode 'compact' (grid) and 'full' (overlay).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { TileMode } from '../tiles/common';

type Phase = 0 | 1 | 2; // 0 = opening, 1 = open, 2 = closing
interface Rect { l: number; t: number; w: number; h: number }
/** fixed = shown in full on the page (a centre panel the tiles sit around), not a tile. */
export interface TileItem { id: string; label: string; node: ReactNode; fixed?: boolean; wide?: boolean }

const afterPaint = (fn: () => void) => {
  let done = false; const go = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(() => requestAnimationFrame(go)); setTimeout(go, 50);
};

export default function TileGrid({ items }: { items: TileItem[] }) {
  const [exp, setExp] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(0);
  const [from, setFrom] = useState<Rect>({ l: 0, t: 0, w: 0, h: 0 });
  const [dirs, setDirs] = useState<Record<string, { x: number; y: number }>>({});
  const [box, setBox] = useState({ W: 0, H: 0 });
  const [ready, setReady] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const tiles = useRef<Record<string, HTMLDivElement | null>>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const opener = useRef<string | null>(null);
  // Fixed panels take as many grid row units as their content needs (unit 150px + 16px gap; a tile is 2 units).
  const [panelRows, setPanelRows] = useState<Record<string, number>>({});
  const observers = useRef<Record<string, { el: HTMLDivElement; ro: ResizeObserver }>>({});
  const measure = useCallback((id: string, el: HTMLDivElement | null) => {
    const prev = observers.current[id];
    if (prev && prev.el === el) return;               // same element: keep its observer
    prev?.ro.disconnect(); delete observers.current[id];
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rows = Math.max(2, Math.ceil((el.scrollHeight + 40 + 16) / (150 + 16)));
      setPanelRows((p) => (p[id] === rows ? p : { ...p, [id]: rows }));
    });
    ro.observe(el);
    observers.current[id] = { el, ro };
  }, []);
  useEffect(() => () => Object.values(observers.current).forEach((o) => o.ro.disconnect()), []);

  const open = (id: string) => {
    if (exp || !boxRef.current || !tiles.current[id]) return;
    const c = boxRef.current.getBoundingClientRect(), t = tiles.current[id]!.getBoundingClientRect();
    const cx = t.left + t.width / 2, cy = t.top + t.height / 2, dd: Record<string, { x: number; y: number }> = {};
    for (const k in tiles.current) {
      if (k === id || !tiles.current[k]) continue;
      const r = tiles.current[k]!.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy, L = Math.hypot(dx, dy) || 1;
      dd[k] = { x: (dx / L) * 120, y: (dy / L) * 120 };
    }
    opener.current = id;
    setFrom({ l: t.left - c.left, t: t.top - c.top, w: t.width, h: t.height }); setDirs(dd);
    setBox({ W: c.width, H: t.height }); setPhase(0); setReady(false); setExp(id);
    afterPaint(() => setPhase(1));
    window.setTimeout(() => setReady(true), 300);
    if (c.top < 0) window.scrollTo({ top: window.scrollY + c.top - 16, behavior: 'smooth' });
  };
  const close = useCallback(() => {
    setPhase(2);
    window.setTimeout(() => {
      setExp(null); setPhase(0); setReady(false);
      if (opener.current) tiles.current[opener.current]?.focus();
    }, 560);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && exp) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exp, close]);

  // Keep the open overlay exactly as tall as its content.
  useLayoutEffect(() => {
    if (!exp || phase !== 1 || !contentRef.current) return;
    const el = contentRef.current;
    const fit = () => { const h = Math.ceil(el.scrollHeight); setBox((b) => (Math.abs(h - b.H) > 1 ? { ...b, H: h } : b)); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [exp, phase, ready]);

  const isOpen = phase === 1;
  const tileStyle = (id: string): CSSProperties => {
    if (!exp) return {};
    if (id === exp) return { opacity: phase === 2 ? 1 : 0 };
    const d = dirs[id] || { x: 0, y: 0 };
    return isOpen ? { transform: `translate(${d.x}px,${d.y}px) scale(.94)`, opacity: 0, pointerEvents: 'none' } : {};
  };
  const ov: CSSProperties = {
    left: isOpen ? 0 : from.l, top: isOpen ? 0 : from.t, width: isOpen ? box.W : from.w, height: isOpen ? Math.max(box.H, from.h) : from.h,
    transition: phase === 0 ? 'none' : ['left', 'top', 'width', 'height'].map((p) => `${p} .55s cubic-bezier(.2,.8,.2,1)`).join(','),
  };
  const cur = exp ? items.find((i) => i.id === exp) : null;

  return (
    <div ref={boxRef} className="tgrid" style={exp && isOpen ? { height: Math.max(box.H, from.h), overflow: 'hidden' } : undefined}>
      <TileMode.Provider value="compact">
        {items.map((it) => it.fixed ? (
          <div key={it.id} ref={(el) => { tiles.current[it.id] = el; }} className={'tile-panel' + (it.wide ? ' wide' : '')} style={{ ...tileStyle(it.id), gridRow: `span ${panelRows[it.id] ?? 4}` }}>
            <div ref={(el) => measure(it.id, el)}><TileMode.Provider value="full">{it.node}</TileMode.Provider></div>
          </div>
        ) : (
          <div key={it.id} ref={(el) => { tiles.current[it.id] = el; }} className="tile" role="button" tabIndex={exp ? -1 : 0}
            aria-label={`Open ${it.label}`} style={tileStyle(it.id)} onClick={() => open(it.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(it.id); } }}>
            {it.node}
          </div>
        ))}
      </TileMode.Provider>
      {cur && (
        <div className="overlay" style={ov} role="dialog" aria-label={cur.label}>
          <div ref={contentRef} className="overlay-body" style={{ opacity: isOpen ? 1 : 0, transition: isOpen ? 'opacity .3s .3s' : 'opacity .15s' }}>
            <button className="back" onClick={close} autoFocus>← Back</button>
            <TileMode.Provider value="full">{ready ? cur.node : <div style={{ minHeight: 240 }} />}</TileMode.Provider>
          </div>
        </div>
      )}
    </div>
  );
}
