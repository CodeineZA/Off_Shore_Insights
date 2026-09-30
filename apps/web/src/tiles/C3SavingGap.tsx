// C3 · The saving gap: country rate minus hub rate per tax type. Right (positive) = the
// country taxes more, i.e. what moving the asset to the hub could save. The sales argument.
import type { Dashboard } from '../data/types';
import { savingGap } from '../data/model';
import { nameOf, shortLabel } from '../data/insights';
import { niceMax } from '../ui/geom';
import { Card, HUB_COLOR, useGrown } from './common';

export default function C3SavingGap({ d, code }: { d: Dashboard; code: string }) {
  const hubs = ['MU', 'SC'];
  const rows = savingGap(d, code, 'MU').map((m) => ({ t: m.t, gaps: hubs.map((h) => savingGap(d, code, h).find((x) => x.t.code === m.t.code)!) }));
  const known = rows.flatMap((r) => r.gaps.map((g) => g.gap)).filter((g): g is number => g != null);
  const max = niceMax(Math.max(5, ...known.map(Math.abs)));
  const grown = useGrown([code]);
  const biggest = [...rows].map((r) => ({ r, g: Math.max(...r.gaps.map((g) => g.gap ?? -Infinity)) })).filter((x) => x.g > 0).sort((a, b) => b.g - a.g)[0];
  return (
    <Card id="c3" title="The saving gap" purpose={`Where ${nameOf(d, code)} taxes more than the hubs: the bigger the bar, the stronger the case`}
      foot={<>
        <div className="legend">{hubs.map((h) => <span key={h}><i style={{ background: HUB_COLOR[h] }} />vs {nameOf(d, h)}</span>)}<span className="muted">Percentage points · right = {nameOf(d, code)} higher</span></div>
        {biggest && <div>Biggest gap: <b>{shortLabel(biggest.r.t)}</b>, {biggest.g.toFixed(1)} points.</div>}
      </>}>
      <div className="gap">
        {rows.map((r) => (
          <div className="gap-row" key={r.t.code}>
            <div className="h2h-label">{shortLabel(r.t)}</div>
            <div className="gap-track">
              <span className="gap-axis" />
              {r.gaps.map((g, i) => (
                <div className="gap-line" key={hubs[i]} title={g.gap == null ? 'Unknown on one side' : `${g.country}% − ${g.hub}% = ${g.gap.toFixed(1)} pts`}>
                  {g.gap == null ? <span className="spread-unknown" style={{ left: '50%' }}>?</span> : (
                    <span className="gap-bar" style={{ background: HUB_COLOR[hubs[i]],
                      left: g.gap >= 0 ? '50%' : `${50 - (grown ? (Math.abs(g.gap) / max) * 50 : 0)}%`,
                      width: grown ? `${(Math.abs(g.gap) / max) * 50}%` : 0 }} />
                  )}
                  {g.gap != null && <span className="gap-val" style={g.gap >= 0 ? { left: `calc(${50 + (Math.abs(g.gap) / max) * 50}% + 6px)` } : { right: `calc(${50 + (Math.abs(g.gap) / max) * 50}% + 6px)` }}>{g.gap > 0 ? '+' : ''}{g.gap.toFixed(1)}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
