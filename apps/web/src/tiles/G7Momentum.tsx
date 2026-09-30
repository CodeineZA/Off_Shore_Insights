// G7 · Rate momentum: is the pain rising? Direction of each key rate from the rate history.
import type { Dashboard } from '../data/types';
import { MOMENTUM_TYPES, momentum } from '../data/model';
import { fmtDate, nameOf, pct, shortLabel } from '../data/insights';
import { Card } from './common';

const ARROW = { up: '▲', down: '▼', flat: '→', unknown: '·' };

export default function G7Momentum({ d, cc }: { d: Dashboard; cc: string[] }) {
  const types = MOMENTUM_TYPES.map((c) => d.tax_types.find((t) => t.code === c)).filter((t): t is NonNullable<typeof t> => !!t);
  const firstRecorded = d.rate_history.map((h) => h.valid_from).sort()[0];
  const anyChange = cc.some((c) => types.some((t) => { const m = momentum(d, c, t.code); return m.dir === 'up' || m.dir === 'down'; }));
  return (
    <Card id="g7" title="Rate momentum" purpose="Is the tax pain rising? A rising rate means a warming market"
      foot={<div>{anyChange ? '▲ rate went up at its last change · ▼ went down · → no change recorded.'
        : `No rate changes recorded yet: the history starts ${firstRecorded ? fmtDate(firstRecorded) : 'with the first check'}. Arrows appear as refreshes find changes.`}</div>}>
      <table className="momentum">
        <thead><tr><th />{types.map((t) => <th key={t.code}>{shortLabel(t)}</th>)}</tr></thead>
        <tbody>
          {cc.map((c) => (
            <tr key={c}>
              <th>{nameOf(d, c)}</th>
              {types.map((t) => {
                const m = momentum(d, c, t.code);
                return (
                  <td key={t.code} className={'mom ' + m.dir} title={m.prev != null ? `${pct(m.prev)} → ${pct(m.now!)} (${fmtDate(m.since!)})` : m.now != null ? `Unchanged since ${fmtDate(m.since!)}` : 'Unknown'}>
                    <span className="mom-arrow">{ARROW[m.dir]}</span>{m.now != null ? pct(m.now) : '?'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
