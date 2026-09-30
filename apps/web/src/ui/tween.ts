// The design's animation engine as a hook: every numeric key eases (cubic out) from its
// current value to the target, keys staggered in order. `replay` changing restarts from 0
// (keys starting "__m" start at their target: they are scale maxima, not drawn values).
import { useEffect, useRef, useState } from 'react';

export const MOTION = { scale: 1 };
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export type Vals = Record<string, number>;
export interface TweenOpts { dur?: number; delay?: number; stagger?: number }

export function useTween(target: Vals, { dur = 900, delay = 0, stagger = 0 }: TweenOpts, replay = 0): Vals {
  const [vals, setVals] = useState<Vals>(() => zeroed(target));
  const cur = useRef<Vals>(vals);
  const lastReplay = useRef<number | null>(null);
  const sig = JSON.stringify(target);

  useEffect(() => {
    const reset = lastReplay.current !== replay;
    lastReplay.current = replay;
    const from: Vals = {};
    for (const k in target) from[k] = !reset && k in cur.current ? cur.current[k] : k.startsWith('__m') ? target[k] : 0;
    const keys = Object.keys(target);
    const sc = reduced() ? 0 : MOTION.scale;
    const D = Math.max(1, dur * sc), t0 = performance.now() + delay * sc, st = stagger * sc;
    const total = delay * sc + D + st * keys.length;
    let raf = 0, done = false;
    const frame = (now: number) => {
      const o: Vals = {};
      let live = false;
      keys.forEach((k, i) => {
        let t = (now - t0 - i * st) / D; t = t < 0 ? 0 : t > 1 ? 1 : t; if (t < 1) live = true;
        o[k] = from[k] + (target[k] - from[k]) * (1 - Math.pow(1 - t, 3));
      });
      cur.current = o; setVals(o);
      if (live && !done) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // Guarantee the final state even where rAF is throttled (hidden tabs, headless previews).
    const fin = window.setTimeout(() => { done = true; cancelAnimationFrame(raf); cur.current = { ...target }; setVals({ ...target }); }, total + 80);
    return () => { cancelAnimationFrame(raf); clearTimeout(fin); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, replay]);

  return vals;
}

function zeroed(t: Vals): Vals { const o: Vals = {}; for (const k in t) o[k] = k.startsWith('__m') ? t[k] : 0; return o; }
