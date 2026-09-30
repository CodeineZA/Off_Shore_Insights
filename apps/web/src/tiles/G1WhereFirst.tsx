// G1 · Where to go first: countries ranked by opportunity = market size + tax pain + ease of
// reach (equal thirds, each scaled to the best country shown). Unknown parts count as 0, hatched.
import type { Dashboard } from '../data/types';
import { GATES, WEALTH_LABEL, marketMetric, opportunities, type Opportunity } from '../data/model';
import { Card, GATE_COLOR, useGrown, useTip } from './common';

const SEGS = [
  { key: 'market', label: 'Market size', color: '#f3dcb2' },
  { key: 'pain', label: 'Tax pain', color: '#d8b07a' },
  { key: 'ease', label: 'Ease of reach', color: '#8a6844' },
] as const;

export default function G1WhereFirst({ d, cc, hub }: { d: Dashboard; cc: string[]; hub: string }) {
  const rows = opportunities(d, cc, hub);
  const grown = useGrown([cc.join(), hub]);
  const t = useTip<Opportunity>();
  const hubName = hub === 'MU' ? 'Mauritius' : 'Seychelles';
  return (
    <Card id="g1" full title="Where to go first" purpose={`Countries ranked by how worth it they are for a ${hubName} structure: market size, tax pain and ease of reach`}
      foot={<>
        <div className="legend">{SEGS.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}<span><i className="hatch-dot" />Unknown (counts as 0)</span></div>
        <div>Each part is scaled 0–100 to the best country shown and weighted equally. Market = {WEALTH_LABEL[marketMetric(d)].toLowerCase()}; tax pain = the sample-client bill (G5); ease = the known gates (G2).</div>
      </>}>
      {!rows.length ? <div className="empty">Select at least one country.</div> : (
        <div className="rank" ref={t.box} onMouseLeave={t.hide}>
          {rows.map((r, i) => (
            <div className="rank-row" key={r.code} onMouseMove={t.show(r)} onClick={t.show(r)}>
              <div className="rank-no">{i + 1}</div>
              <div className="rank-name">{r.name}</div>
              <div className="rank-bar">
                {SEGS.map((s) => {
                  const seg = r[s.key];
                  return seg.known
                    ? <div key={s.key} className="rank-seg" style={{ width: grown ? `${(seg.v01 / 3) * 100}%` : 0, background: s.color }} />
                    : <div key={s.key} className="rank-seg unknown" style={{ width: grown ? '4%' : 0 }} title={`${s.label}: unknown`} />;
                })}
              </div>
              <div className="rank-score">{r.score}</div>
            </div>
          ))}
          {t.tip && (
            <div className="tip" style={t.style(270)}>
              <div className="tip-k">{t.tip.data.name} · score {t.tip.data.score}</div>
              {SEGS.map((s) => (
                <div className="tip-l" key={s.key}><b style={{ color: s.color }}>{s.label}</b> {Math.round(t.tip!.data[s.key].v01 * 100)}/100 · {t.tip!.data[s.key].note}</div>
              ))}
              <div className="gate-dots">
                {t.tip.data.gates.map((g) => (
                  <span key={g.key} title={g.note ?? ''}><i style={{ background: GATE_COLOR[g.status] }} className={g.status === 'unknown' ? 'hatch-dot' : ''} />{GATES.find((x) => x.key === g.key)!.label}: {g.label}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
