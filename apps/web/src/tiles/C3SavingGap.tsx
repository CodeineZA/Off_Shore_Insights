// C3 · The saving gap: country rate minus hub rate per tax type. Right (positive) = the
// country taxes more, i.e. what moving the asset to the hub could save. The sales argument.
import type { Dashboard } from '../data/types';
import { savingGap } from '../data/model';
import { explainOf, nameOf, shortLabel } from '../data/insights';
import { niceMax } from '../ui/geom';
import { AxisRow, Card, HUB_COLOR, Key, useCompact, useGrown } from './common';

export default function C3SavingGap({ d, code }: { d: Dashboard; code: string }) {
  const hubs = ['MU', 'SC'];
  const compact = useCompact();
  const allRows = savingGap(d, code, 'MU').map((m) => ({ t: m.t, gaps: hubs.map((h) => savingGap(d, code, h).find((x) => x.t.code === m.t.code)!) }));
  const top = (r: (typeof allRows)[number]) => Math.max(...r.gaps.map((g) => g.gap ?? -Infinity));
  const rows = compact ? [...allRows].sort((a, b) => top(b) - top(a)).slice(0, 4) : allRows;
  const known = rows.flatMap((r) => r.gaps.map((g) => g.gap)).filter((g): g is number => g != null);
  const max = niceMax(Math.max(5, ...known.map(Math.abs))); // values sit in their own column, so no headroom needed
  const grown = useGrown([code]);
  const biggest = [...allRows].map((r) => ({ r, g: Math.max(...r.gaps.map((g) => g.gap ?? -Infinity)) })).filter((x) => x.g > 0).sort((a, b) => b.g - a.g)[0];
  return (
    <Card id="c3" title="The saving gap"
      metric={biggest ? { value: `+${biggest.g.toFixed(1)}`, label: `points on ${shortLabel(biggest.r.t)}`, sub: 'biggest gap' } : undefined} purpose={`Where ${nameOf(d, code)} taxes more than the hubs: the bigger the bar, the stronger the case`}
      legend={<>{hubs.map((h) => <Key key={h} color={HUB_COLOR[h]}>vs {nameOf(d, h)}</Key>)}{!compact && <em>Bar to the right = {nameOf(d, code)} taxes more, in percentage points</em>}</>}
      foot={biggest && <div>Biggest gap: <b>{shortLabel(biggest.r.t)}</b>, {biggest.g.toFixed(1)} points.</div>}>
      <div className="gap">
        {compact
          ? <AxisRow row="gap-row" lead="Tax" centred min="← hub higher" label="0" max={`${code} higher →`} value="pts" />
          : <AxisRow row="gap-row" lead="Tax" centred min={`← −${max}`} label="0" max={`+${max} →`} value="Points" />}
        {rows.map((r) => (
          <div className="gap-row" key={r.t.code}>
            <div className="h2h-label">{shortLabel(r.t)}{!compact && <small className="tax-explain">{explainOf(r.t)}</small>}</div>
            <div className="gap-track">
              <span className="gap-axis" />
              {r.gaps.map((g, i) => (
                <div className="gap-line" key={hubs[i]} title={g.gap == null ? 'Unknown on one side' : `${g.country}% − ${g.hub}% = ${g.gap.toFixed(1)} pts`}>
                  {g.gap == null ? <span className="spread-unknown" style={{ left: '50%' }}>?</span> : (
                    <span className="gap-bar" style={{ background: HUB_COLOR[hubs[i]],
                      left: g.gap >= 0 ? '50%' : `${50 - (grown ? (Math.abs(g.gap) / max) * 50 : 0)}%`,
                      width: grown ? `${(Math.abs(g.gap) / max) * 50}%` : 0 }} />
                  )}
                </div>
              ))}
            </div>
            <div className="gap-vals">{r.gaps.map((g, i) => <span key={hubs[i]} style={{ color: HUB_COLOR[hubs[i]] }}>{g.gap == null ? '?' : (g.gap > 0 ? '+' : '') + g.gap.toFixed(1)}</span>)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
