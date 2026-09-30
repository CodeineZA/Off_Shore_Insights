// C1 · Head to head: headline rate per tax type for the chosen country, Mauritius and Seychelles.
import type { Dashboard, Rate, TaxType } from '../data/types';
import { compareTypes } from '../data/model';
import { fmtDate, nameOf, pct, rateOf, shortLabel } from '../data/insights';
import { niceMax } from '../ui/geom';
import { AxisRow, COUNTRY_COLOR, Card, HUB_COLOR, Key, SourceLink, useCompact, useGrown, useTip } from './common';

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
  const compact = useCompact();
  const allTypes = compareTypes(d, codes);
  const both = allTypes.filter((t) => rateOf(d, code, t.code) && rateOf(d, 'MU', t.code));
  const higher = both.filter((t) => rateOf(d, code, t.code)!.headline_rate > rateOf(d, 'MU', t.code)!.headline_rate).length;
  const types = compact ? [...allTypes].sort((a, b) => (rateOf(d, code, b.code)?.headline_rate ?? -1) - (rateOf(d, code, a.code)?.headline_rate ?? -1)).slice(0, 4) : allTypes;
  const max = niceMax(Math.max(10, ...types.flatMap((t) => codes.map((c) => rateOf(d, c, t.code)?.headline_rate ?? 0))));
  const grown = useGrown([code]);
  const tip = useTip<{ t: TaxType; c: string }>();
  return (
    <Card id="c1" full title="Head to head"
      metric={{ value: higher, label: `taxes higher in ${nameOf(d, code)} than Mauritius`, sub: `of ${both.length} comparable` }} purpose={`${nameOf(d, code)} against Mauritius and Seychelles, tax by tax`}
      legend={<>{codes.map((c) => <Key key={c} color={trioColor(c)}>{nameOf(d, c)}</Key>)}<Key hatch>Unknown</Key></>}>
      <div className="h2h" ref={tip.box} onMouseLeave={tip.hide}>
        <AxisRow row="h2h-row" lead="Tax" min="0%" label="headline rate" max={`${max}%`} />
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
