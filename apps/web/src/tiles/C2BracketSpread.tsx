// C2 · Bracket spread: taxes with more than one rate. Line = rate_min → rate_max, dot = headline.
import type { Dashboard, TaxType } from '../data/types';
import { compareTypes } from '../data/model';
import { nameOf, rateOf, shortLabel } from '../data/insights';
import { niceMax } from '../ui/geom';
import { Card, useGrown, useTip } from './common';
import { RateTip, trio, trioColor } from './C1HeadToHead';

export default function C2BracketSpread({ d, code }: { d: Dashboard; code: string }) {
  const codes = trio(code);
  const types = compareTypes(d, codes);
  const max = niceMax(Math.max(10, ...types.flatMap((t) => codes.map((c) => { const r = rateOf(d, c, t.code); return r ? Math.max(r.rate_max ?? 0, r.headline_rate) : 0; }))));
  const x = (v: number) => `${(v / max) * 100}%`;
  const grown = useGrown([code]);
  const tip = useTip<{ t: TaxType; c: string }>();
  return (
    <Card id="c2" title="Bracket spread" purpose="How wide each tax's bands run: from the entry rate to the top rate"
      foot={<div className="legend">{codes.map((c) => <span key={c}><i style={{ background: trioColor(c) }} />{nameOf(d, c)}</span>)}<span className="muted">Dot = headline · 0–{max}%</span></div>}>
      <div className="spread" ref={tip.box} onMouseLeave={tip.hide}>
        {types.map((t) => (
          <div className="spread-row" key={t.code}>
            <div className="h2h-label">{shortLabel(t)}</div>
            <div className="spread-track">
              {codes.map((c, i) => {
                const r = rateOf(d, c, t.code);
                const lo = r ? (r.rate_min ?? r.headline_rate) : 0, hi = r ? (r.rate_max ?? r.headline_rate) : 0;
                return (
                  <div className="spread-line" key={c} style={{ top: `${22 + i * 28}%` }} onMouseMove={tip.show({ t, c })} onClick={tip.show({ t, c })}>
                    {r ? (<>
                      <span className="spread-range" style={{ left: x(lo), width: grown ? x(Math.max(hi - lo, 0)) : 0, background: trioColor(c) }} />
                      <span className="spread-dot" style={{ left: grown ? x(r.headline_rate) : x(lo), background: trioColor(c) }} />
                    </>) : <span className="spread-unknown">?</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {tip.tip && <div className="tip" style={tip.style(250)}><RateTip d={d} t={tip.tip.data.t} code={tip.tip.data.c} r={rateOf(d, tip.tip.data.c, tip.tip.data.t.code)} /></div>}
      </div>
    </Card>
  );
}
