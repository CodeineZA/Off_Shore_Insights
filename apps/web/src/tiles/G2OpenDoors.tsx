// G2 · Open doors: which countries are blocked. Rows = countries, columns = gates
// (treaty and blacklist are per hub; trust recognition and marketing are per country).
import type { Dashboard } from '../data/types';
import { GATES, gateCells, type GateCell } from '../data/model';
import { nameOf } from '../data/insights';
import { Card, GATE_COLOR, Key, SourceLink, useTip } from './common';

export default function G2OpenDoors({ d, cc, hub }: { d: Dashboard; cc: string[]; hub: string }) {
  const t = useTip<{ name: string; cell: GateCell; gate: string }>();
  const hubName = hub === 'MU' ? 'Mauritius' : 'Seychelles';
  return (
    <Card id="g2" title="Open doors" purpose={`Which countries can use a ${hubName} structure, gate by gate`}
      legend={<>
        <Key color={GATE_COLOR.green}>Open</Key><Key color={GATE_COLOR.amber}>Caution</Key>
        <Key color={GATE_COLOR.red}>Blocked</Key><Key hatch>Unknown</Key><em>Dashed outline = still to verify</em><em>Tax treaty = with Mauritius for both hubs (set up there first)</em>
      </>}>
      {!cc.length ? <div className="empty">Select at least one country.</div> : (
        <div className="gates-wrap" ref={t.box} onMouseLeave={t.hide}>
          <table className="gates">
            <thead><tr><th />{GATES.map((g) => <th key={g.key}>{g.label}</th>)}</tr></thead>
            <tbody>
              {cc.map((code) => (
                <tr key={code}>
                  <th>{nameOf(d, code)}</th>
                  {gateCells(d, code, hub).map((c) => (
                    <td key={c.key} onMouseMove={t.show({ name: nameOf(d, code), cell: c, gate: GATES.find((g) => g.key === c.key)!.label })}
                      onClick={t.show({ name: nameOf(d, code), cell: c, gate: GATES.find((g) => g.key === c.key)!.label })}>
                      <span className={'gate-pill ' + c.status + (c.check ? ' check' : '')} style={{ ['--gc' as string]: GATE_COLOR[c.status] }}>{c.label}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {t.tip && (
            <div className="tip" style={t.style(260)}>
              <div className="tip-k">{t.tip.data.name} · {t.tip.data.gate}</div>
              <div className="tip-v" style={{ fontSize: 16 }}>{t.tip.data.cell.label}</div>
              {t.tip.data.cell.note && <div className="tip-l">{t.tip.data.cell.note}</div>}
              {t.tip.data.cell.check && <div className="tip-l warn">To verify: secondary source or uncertain.</div>}
              <div className="tip-l muted"><SourceLink url={t.tip.data.cell.source} /></div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
