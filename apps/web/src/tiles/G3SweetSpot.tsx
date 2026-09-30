// G3 · Sweet spot: market size (x) against tax pain (y = sample-client bill), bubble size =
// business owners, colour = treaty with the hub. Top right is the target.
import type { Dashboard } from '../data/types';
import { WEALTH_LABEL, gateCells, latestWealth, marketMetric, sampleBill } from '../data/model';
import { fmtCount, nameOf } from '../data/insights';
import { niceMax } from '../ui/geom';
import { Card, GATE_COLOR, Key, fmtEur, useGrown, useTip } from './common';

const W = 520, H = 290, L = 74, R = 20, T = 30, B = 40;

export default function G3SweetSpot({ d, cc, hub }: { d: Dashboard; cc: string[]; hub: string }) {
  const metric = marketMetric(d);
  const pts = cc.map((code) => {
    const w = latestWealth(d, code, metric), bo = latestWealth(d, code, 'business_owners');
    const bill = sampleBill(d, code), treaty = gateCells(d, code, hub)[0];
    return { code, name: nameOf(d, code), x: w?.value ?? null, y: bill.total, complete: bill.complete, size: bo?.value ?? null, treaty };
  });
  const shown = pts.filter((p) => p.x != null);
  const missing = pts.filter((p) => p.x == null).map((p) => p.name);
  const mx = niceMax(Math.max(1, ...shown.map((p) => p.x!)) * 1.08), my = niceMax(Math.max(1, ...shown.map((p) => p.y)) * 1.1);
  const maxS = Math.max(1, ...shown.map((p) => p.size ?? 0));
  const X = (v: number) => L + (v / mx) * (W - L - R), Y = (v: number) => H - B - (v / my) * (H - T - B);
  const midX = X(mx / 2), midY = Y(my / 2);
  const inTarget = shown.filter((p) => p.x! >= mx / 2 && p.y >= my / 2);
  const grown = useGrown([cc.join(), hub]);
  const t = useTip<(typeof pts)[number]>();
  return (
    <Card id="g3" title="Sweet spot"
      metric={{ value: inTarget.length, label: 'in the target corner', sub: inTarget.map((p) => p.code).join(', ') || 'none yet' }} purpose="Where a big market meets high tax pain: top right is the target"
      legend={<>
        <Key color={GATE_COLOR.green}>Treaty with Mauritius</Key><Key color={GATE_COLOR.amber}>Negotiating</Key>
        <Key color={GATE_COLOR.red}>No treaty</Key><em>Bubble size = business owners</em>
      </>}
      foot={<>
        {missing.length > 0 && <div>Not plotted (no {WEALTH_LABEL[metric].toLowerCase()} figure): {missing.join(', ')}.</div>}
      </>}>
      <div className="plot" ref={t.box} onMouseLeave={t.hide}>
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Market size against tax pain">
          <rect x={midX} y={T} width={W - R - midX} height={midY - T} fill="rgba(216,176,122,.06)" rx="6" />
          <text x={W - R - 6} y={T + 14} textAnchor="end" className="axis-note gold">Target</text>
          {[0, 0.5, 1].map((k) => (
            <g key={k}>
              <line x1={L} x2={W - R} y1={Y(my * k)} y2={Y(my * k)} className="grid-line" />
              <text x={L - 8} y={Y(my * k)} textAnchor="end" dominantBaseline="middle" className="axis-tick">{fmtEur(my * k)}</text>
              <text x={X(mx * k)} y={H - B + 16} textAnchor="middle" className="axis-tick">{fmtCount(mx * k)}</text>
            </g>
          ))}
          <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="axis-label">Market size: {WEALTH_LABEL[metric].toLowerCase()} →</text>
          <text x={8} y={14} className="axis-label">↑ Tax pain: what the sample client pays</text>
          {shown.map((p, i) => {
            const r = 8 + 18 * Math.sqrt((p.size ?? 0) / maxS);
            return (
              <g key={p.code} onMouseMove={t.show(p)} onClick={t.show(p)} style={{ cursor: 'default' }}>
                <circle cx={X(p.x!)} cy={Y(p.y)} r={grown ? r : 0} fill={GATE_COLOR[p.treaty.status === 'unknown' ? 'amber' : p.treaty.status]}
                  fillOpacity=".28" stroke={GATE_COLOR[p.treaty.status === 'unknown' ? 'amber' : p.treaty.status]} strokeDasharray={p.complete ? '0' : '3 3'}
                  style={{ transition: `r .7s cubic-bezier(.2,.8,.2,1) ${i * 60}ms` }} />
                <text x={X(p.x!)} y={Y(p.y) + 4} textAnchor="middle" className="bubble-label">{p.code}</text>
              </g>
            );
          })}
        </svg>
        {t.tip && (
          <div className="tip" style={t.style(230)}>
            <div className="tip-k">{t.tip.data.name}</div>
            <div className="tip-l">Market: {t.tip.data.x != null ? Math.round(t.tip.data.x).toLocaleString('en') : '—'} {WEALTH_LABEL[metric].toLowerCase()}</div>
            <div className="tip-l">Sample-client bill: {fmtEur(t.tip.data.y)}{t.tip.data.complete ? '' : ' (incomplete)'}</div>
            <div className="tip-l">Treaty with Mauritius: {t.tip.data.treaty.label}</div>
          </div>
        )}
      </div>
    </Card>
  );
}
