// C1 · Head to head: headline rate per tax type for the chosen country, Mauritius and Seychelles.
import type { Dashboard, Rate, TaxType } from '../data/types';
import { compareTypes } from '../data/model';
import { fmtDate, nameOf, pct, rateOf, shortLabel } from '../data/insights';
import { niceMax } from '../ui/geom';
import { COUNTRY_COLOR, Card, HUB_COLOR, SourceLink, useGrown, useTip } from './common';

export const trio = (code: string) => [code, 'MU', 'SC'];
export const trioColor = (c: string) => HUB_COLOR[c] ?? COUNTRY_COLOR;

export function RateTip({ d, t, code, r }: { d: Dashboard; t: TaxType; code: string; r: Rate | undefined }) {
  return (<>
    <div className="tip-k">{nameOf(d, code)} · {t.label}</div>
    {r ? (<>
      <div className="tip-v">{pct(r.headline_rate)}{r.rate_min != null && r.rate_max != null && r.rate_min !== r.rate_max ? <small> range {pct(r.rate_min)}–{pct(r.rate_max)}</small> : null}</div>
      {r.threshold_note && <div className="tip-l">{r.threshold_note}</div>}
      {r.note && <div className="tip-l">{r.note}</div>}
      {r.needs_verification && <div className="tip-l warn">To verify.</div>}
      <div className="tip-l muted"><SourceLink url={r.source_url} />{r.verified_on ? ` · verified ${fmtDate(r.verified_on)}` : ''}</div>
    </>) : <div className="tip-l">Unknown: not researched yet.</div>}
  </>);
}

export default function C1HeadToHead({ d, code }: { d: Dashboard; code: string }) {
  const codes = trio(code);
  const types = compareTypes(d, codes);
  const max = niceMax(Math.max(10, ...types.flatMap((t) => codes.map((c) => rateOf(d, c, t.code)?.headline_rate ?? 0))));
  const grown = useGrown([code]);
  const tip = useTip<{ t: TaxType; c: string }>();
  return (
    <Card id="c1" full title="Head to head" purpose={`${nameOf(d, code)} against Mauritius and Seychelles, tax by tax`}
      foot={<div className="legend">{codes.map((c) => <span key={c}><i style={{ background: trioColor(c) }} />{nameOf(d, c)}</span>)}<span><i className="hatch-dot" />Unknown</span><span className="muted">Scale 0–{max}%</span></div>}>
      <div className="h2h" ref={tip.box} onMouseLeave={tip.hide}>
        {types.map((t) => (
          <div className="h2h-row" key={t.code}>
            <div className="h2h-label">{shortLabel(t)}</div>
            <div className="h2h-bars">
              {codes.map((c) => {
                const r = rateOf(d, c, t.code);
                return (
                  <div className="h2h-line" key={c} onMouseMove={tip.show({ t, c })} onClick={tip.show({ t, c })}>
                    {r ? <div className="h2h-bar" style={{ width: grown ? `${Math.max(0.6, (r.headline_rate / max) * 100)}%` : 0, background: trioColor(c) }} />
                      : <div className="h2h-bar unknown" style={{ width: grown ? '6%' : 0 }} />}
                    <span className="h2h-val">{r ? pct(r.headline_rate) : '?'}</span>
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
