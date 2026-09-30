// Landing page: tile grid + the design's morph-expand into a detail view.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Dashboard as Data } from '../data/types';
import { countries, fmtDate } from '../data/insights';
import { TILES, initialSel, type Ctx, type Expanded, type Sel } from '../tiles/tiles';

type Phase = 0 | 1 | 2; // 0 = starting to open, 1 = open, 2 = closing
interface Rect { l: number; t: number; w: number; h: number }
const afterPaint = (fn: () => void) => { let done = false; const go = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(() => requestAnimationFrame(go)); setTimeout(go, 50); };

export default function Dashboard({ data, onSignOut }: { data: Data; onSignOut: () => void }) {
  const [sel, setSel] = useState<Sel>(() => initialSel(data));
  const set = useCallback((p: Partial<Sel>) => setSel((s) => ({ ...s, ...p })), []);
  const [replay, setReplay] = useState(0);
  const [hover, setHoverState] = useState<{ id: string; i: number | null; k: string | null }>({ id: '', i: null, k: null });
  const [exp, setExp] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(0);
  const [from, setFrom] = useState<Rect>({ l: 0, t: 0, w: 0, h: 0 });
  const [dirs, setDirs] = useState<Record<string, { x: number; y: number }>>({});
  const [box, setBox] = useState({ W: 0, H: 0 });
  const [ready, setReady] = useState(false);
  const [pop, setPop] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const tiles = useRef<Record<string, HTMLDivElement | null>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  const open = (id: string) => {
    if (exp || !boxRef.current || !tiles.current[id]) return;
    const c = boxRef.current.getBoundingClientRect(), t = tiles.current[id]!.getBoundingClientRect();
    const cx = t.left + t.width / 2, cy = t.top + t.height / 2, dd: typeof dirs = {};
    for (const k in tiles.current) {
      if (k === id || !tiles.current[k]) continue;
      const r = tiles.current[k]!.getBoundingClientRect(); const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy, L = Math.hypot(dx, dy) || 1;
      dd[k] = { x: (dx / L) * 120, y: (dy / L) * 120 };
    }
    setFrom({ l: t.left - c.left, t: t.top - c.top, w: t.width, h: t.height }); setDirs(dd);
    setBox({ W: c.width, H: c.height }); setPhase(0); setReady(false); setHoverState({ id: '', i: null, k: null }); setExp(id);
    afterPaint(() => setPhase(1));
    window.setTimeout(() => setReady(true), 300);
    if (c.top < 0) window.scrollTo({ top: window.scrollY + c.top - 16, behavior: 'smooth' });
  };
  const close = useCallback(() => {
    setPhase(2); setPop(false); setHoverState({ id: '', i: null, k: null });
    window.setTimeout(() => { setExp(null); setPhase(0); setReady(false); }, 560);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && exp) close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exp, close]);

  // Keep the overlay as tall as its content while open.
  useLayoutEffect(() => {
    if (!exp || phase !== 1 || !contentRef.current) return;
    const el = contentRef.current;
    const fit = () => { const h = Math.ceil(el.scrollHeight); setBox((b) => (Math.abs(h - b.H) > 1 ? { ...b, H: h } : b)); };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [exp, phase, ready]);

  const ctx = (id: string): Ctx => ({
    d: data, sel, set, replay,
    hover: hover.id === id ? hover.i : null, hoverKey: hover.id === id ? hover.k : null,
    setHover: (i) => setHoverState({ id, i, k: null }), setHoverKey: (k) => setHoverState({ id, i: null, k }),
  });
  const tileStyle = (id: string): CSSProperties => {
    if (!exp) return {};
    if (id === exp) return { opacity: phase === 2 ? 1 : 0 };
    const d = dirs[id] || { x: 0, y: 0 };
    return phase === 1 ? { transform: `translate(${d.x}px,${d.y}px) scale(.94)`, opacity: 0 } : {};
  };

  const def = exp ? TILES.find((t) => t.id === exp)! : null;
  const X: Expanded | null = def ? def.expanded({ ...ctx(def.id), replay }) : null;
  const isOpen = phase === 1;
  const ov: CSSProperties = {
    left: isOpen ? 0 : from.l, top: isOpen ? 0 : from.t, width: isOpen ? box.W : from.w, height: isOpen ? box.H : from.h,
    transition: phase === 0 ? 'none' : ['left', 'top', 'width', 'height'].map((p) => `${p} .55s cubic-bezier(.2,.8,.2,1)`).join(','),
  };
  const all = useMemo(() => countries(data), [data]);
  const toggleCC = (c: string) => {
    const cc = sel.cc.includes(c) ? sel.cc.filter((x) => x !== c) : all.map((x) => x.code).filter((x) => x === c || sel.cc.includes(x));
    if (cc.length) set({ cc });
  };

  const name = data.me?.display_name || data.me?.username || 'there';
  const hr = new Date().getHours(), greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const w1 = data.runs.find((r) => r.workflow === 'W1_recheck');

  return (
    <div className="page" onClick={() => pop && setPop(false)}>
      <div className="wrap">
        <header style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="kicker">Off_Shore_Insights · Dashboard</div>
            <h1 className="h1">{greet}, {name}</h1>
            <p className="lead">Select any tile for the detail. Esc or Back to return.</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="pill" onClick={() => setReplay((r) => r + 1)}>Replay animations</button>
            <button className="pill quiet" onClick={onSignOut}>Sign out</button>
          </div>
        </header>

        <div ref={boxRef} className="grid" style={{ height: exp && isOpen ? box.H : 'auto', overflow: exp && isOpen ? 'hidden' : 'visible', transition: 'height .3s' }}>
          {TILES.map((t) => (
            <div key={t.id} ref={(el) => { tiles.current[t.id] = el; }} className={'tile' + (t.kpi ? ' kpi' : '')} role="button" tabIndex={exp ? -1 : 0}
              aria-label={`Open ${t.id}`} style={tileStyle(t.id)} onClick={() => open(t.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(t.id); } }}>
              {t.compact(ctx(t.id))}
            </div>
          ))}

          {X && def && (
            <div className="overlay" style={ov} onClick={(e) => e.stopPropagation()}>
              <div ref={contentRef} className="overlay-body" style={{ opacity: isOpen ? 1 : 0, transition: isOpen ? 'opacity .3s .3s' : 'opacity .15s' }}>
                <div className="x-head">
                  <button className="back" onClick={close}>← Back</button>
                  <div className="x-title">{X.title}</div>
                  <div style={{ flex: 1 }} />
                  {X.pick && (
                    <div className="select">
                      <select value={String(X.pick.cur)} onChange={(e) => X.pick!.on(e.target.value)} aria-label="Choose">
                        {X.pick.opts.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
                      </select><span>▾</span>
                    </div>
                  )}
                  {X.multi && (
                    <div className="multi">
                      <button onClick={(e) => { e.stopPropagation(); setPop((p) => !p); }}>Countries · {sel.cc.length}<span style={{ fontSize: 10, color: '#d8b07a' }}>▾</span></button>
                      {pop && (
                        <div className="multi-pop" onClick={(e) => e.stopPropagation()}>
                          {all.map((c) => { const on = sel.cc.includes(c.code); return (
                            <button key={c.code} onClick={() => toggleCC(c.code)}><span className={'check' + (on ? ' on' : '')}>{on ? '✓' : ''}</span>{c.name}</button>); })}
                        </div>
                      )}
                    </div>
                  )}
                  {X.segs?.map((s, i) => (
                    <div className="seg" key={i}>
                      {s.opts.map(([v, l]) => <button key={String(v)} className={v === s.cur ? 'on' : ''} onClick={() => s.on(v)}>{l}</button>)}
                    </div>
                  ))}
                </div>
                <div className="x-body">
                  <div className="x-main">{ready ? X.main : <div style={{ minHeight: 260 }} />}</div>
                  <aside className="insight">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div className="ins-kicker">{X.insight.kicker}</div>
                      <div className="ins-title">{X.insight.title}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {X.insight.rows.map((r, i) => (
                        <div className="ins-row" key={i}><div className="k">{r.k}</div><div className="v"><b>{r.v}</b>{r.s ? <small>{r.s}</small> : null}</div></div>
                      ))}
                    </div>
                    <div className="ins-note">{X.insight.note}</div>
                  </aside>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="foot" style={{ textAlign: 'left', display: 'flex', flexWrap: 'wrap', gap: '4px 18px', justifyContent: 'space-between' }}>
          <span>Indicative only, not tax advice.</span>
          <span>Data as of {fmtDate(data.generated_at)}{w1 ? ` · last source re-check ${fmtDate(w1.started_at)}` : ''}</span>
        </footer>
      </div>
    </div>
  );
}
