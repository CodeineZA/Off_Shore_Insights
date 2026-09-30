// C2 · Bracket spread: taxes with more than one rate. Line = rate_min → rate_max, dot = headline.
import type { Dashboard, TaxType } from '../data/types';
import { compareTypes } from '../data/model';
import { nameOf, pct, rateOf, shortLabel } from '../data/insights';
import { niceMax } from '../ui/geom';
import { AxisRow, Card, Key, useCompact, useGrown, useTip } from './common';
import { RateTip, trio, trioColor } from './C1HeadToHead';

export default function C2BracketSpread({ d, code }: { d: Dashboard; code: string }) {
  const codes = trio(code);
  const compact = useCompact();
  const width = (tc: string) => { const r = rateOf(d, code, tc); return r ? (r.rate_max ?? r.headline_rate) - (r.rate_min ?? r.headline_rate) : -1; };
  const allTypes = compareTypes(d, codes);
  const widest = [...allTypes].sort((a, b) => width(b.code) - width(a.code));
  const w0 = widest[0] && width(widest[0].code) > 0 ? rateOf(d, code, widest[0].code)! : null;
  const types = compact ? widest.slice(0, 4) : allTypes;
  const max = niceMax(Math.max(10, ...types.flatMap((t) => codes.map((c) => { const r = rateOf(d, c, t.code); return r ? Math.max(r.rate_max ?? 0, r.headline_rate) : 0; }))));
  const x = (v: number) => `${(v / max) * 100}%`;
  const grown = useGrown([code]);
  const tip = useTip<{ t: TaxType; c: string }>();
  return (
    <Card id="c2" title="Bracket spread"
      metric={w0 ? { value: `${pct(w0.rate_min ?? w0.headline_rate)}–${pct(w0.rate_max ?? w0.headline_rate)}`, label: `widest: ${shortLabel(widest[0])}`, sub: nameOf(d, code) } : undefined} purpose="How wide each tax's bands run: from the entry rate to the top rate"
      legend={<>{codes.map((c) => <Key key={c} color={trioColor(c)}>{nameOf(d, c)}</Key>)}<em>Line = entry band → top band · dot = headline rate</em></>}>
      <div className="spread" ref={tip.box} onMouseLeave={tip.hide}>
        <AxisRow row="spread-row" lead="Tax" min="0%" label="rate" max={`${max}%`} />
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
