// The value of the money over time, kept at home against through the trust: two lines from the start of the first year
// to the end of the last. Static SVG (no hooks, no animation) so it prints exactly as it looks on the page.
import type { ReportOk } from '../../data/report';
import { CURRENCY_NAME, CURRENCY_SYMBOL, fmtMoney, the, type ReportCurrency } from '../../data/report';
import { niceMax } from '../geom';

const W = 640, H = 270, L = 62, R = 118, T = 18, B = 38;
const short = (v: number, cur: ReportCurrency) => (v >= 1e6 ? `${CURRENCY_SYMBOL[cur]}${(v / 1e6).toFixed(v >= 1e7 ? 0 : 2).replace(/\.?0+$/, '')}m` : `${CURRENCY_SYMBOL[cur]}${Math.round(v / 1e3)}k`);

export default function ValueChart({ r }: { r: ReportOk }) {
  const labels = ['Start ' + r.startYear, ...r.years.map((y) => 'End ' + y.year)];
  const home = [r.params.principal, ...r.years.map((y) => y.home.end)];
  const trust = [r.params.principal, ...r.years.map((y) => y.trust.end)];
  const all = [...home, ...trust];
  const lo = Math.min(...all), hi = Math.max(...all);
  // The axis starts below the lowest value so the gap between the lines is readable; the stated principal is still the first point.
  const span = niceMax(Math.max(hi - lo, hi * 0.02));
  const min = Math.max(0, Math.floor((lo - span * 0.25) / (span / 4)) * (span / 4)), max = min + span * 1.15;
  const x = (i: number) => L + (labels.length === 1 ? 0 : (i * (W - L - R)) / (labels.length - 1));
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const line = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const ticks = [0, 1, 2, 3, 4].map((k) => min + ((max - min) * k) / 4);
  const last = labels.length - 1;
  return (
    <figure className="valuechart" aria-label={r.summary}>
      <div className="legend card-legend" aria-label="Legend">
        <span><i className="vc-key home" />Kept in {the(r.homeName)}</span>
        <span><i className="vc-key trust" />Through a {r.hubName} trust, after a {r.params.feePct}% yearly fee</span>
        <span className="vc-note">Value at the end of each year, in {CURRENCY_NAME[r.currency]}. The shaded band is the gap between the two.</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={r.summary} className="vc-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="vc-grid" />
            <text x={L - 8} y={y(t) + 3.5} textAnchor="end" className="vc-axis">{short(t, r.currency)}</text>
          </g>
        ))}
        {labels.map((l, i) => <text key={l} x={x(i)} y={H - 14} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="vc-axis">{l}</text>)}
        <path d={`${line(trust)} ${home.map((_, i) => `L${x(home.length - 1 - i).toFixed(1)},${y(home[home.length - 1 - i]).toFixed(1)}`).join(' ')} Z`} className={'vc-gap ' + (trust[last] >= home[last] ? 'ahead' : 'behind')} />
        <path d={line(home)} className="vc-line home" />
        <path d={line(trust)} className="vc-line trust" />
        {home.map((v, i) => <circle key={'h' + i} cx={x(i)} cy={y(v)} r="3.5" className="vc-dot home" />)}
        {trust.map((v, i) => <circle key={'t' + i} cx={x(i)} cy={y(v)} r="3.5" className="vc-dot trust" />)}
        {/* end labels, kept apart when the two values are close */}
        {(() => {
          const yh = y(home[last]), yt = y(trust[last]);
          const gap = Math.abs(yh - yt), push = gap < 30 ? (30 - gap) / 2 : 0;
          const th = yh >= yt ? yh + push : yh - push, tt = yh >= yt ? yt - push : yt + push;
          return (<>
            <text x={x(last) + 10} y={th + 4} className="vc-end home">{fmtMoney(home[last], r.currency)}</text>
            <text x={x(last) + 10} y={tt + 4} className="vc-end trust">{fmtMoney(trust[last], r.currency)}</text>
          </>);
        })()}
      </svg>
    </figure>
  );
}
