// Graph 2: how much of the money tax took each year, kept local against through the trust. The figure is the effective tax of the
// year: capital gains tax plus wealth taxes as a share of the value the year started with (the trust's fee is a cost, not a tax, and is left out).
// Static SVG (no hooks, no animation) so it prints exactly as it looks on the page.
import { the, type ReportOk } from '../../data/report';
import { niceMax } from '../geom';

const W = 640, H = 230, L = 52, R = 76, T = 22, B = 30;
const pc = (v: number) => `${v.toFixed(v >= 10 ? 1 : 2)}%`;

export default function TaxTrendChart({ r }: { r: ReportOk }) {
  const e = r.effective, n = e.length, last = n - 1;
  const hi = Math.max(0.1, ...e.flatMap((p) => [p.home, p.trust]));
  const max = niceMax(hi * 1.12);
  const x = (i: number) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = (k: 'home' | 'trust') => e.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const ticks = [0, 1, 2, 3, 4].map((k) => (max * k) / 4);
  const dot = n > 8 ? 3 : 3.5;
  // end labels, kept apart when the two values are close
  const yh = y(e[last].home), yt = y(e[last].trust);
  const gap = Math.abs(yh - yt), push = gap < 26 ? (26 - gap) / 2 : 0;
  const th = yh >= yt ? yh + push : yh - push, tt = yh >= yt ? yt - push : yt + push;
  const first = e[0];
  const summary = n === 1
    ? `In ${first.year}, tax took ${pc(first.home)} of the value kept in ${the(r.homeName)} and ${pc(first.trust)} through the ${r.hubName} trust.`
    : `Kept in ${the(r.homeName)}, tax took ${pc(first.home)} of the value in ${first.year} and ${pc(e[last].home)} in ${e[last].year}. Through the ${r.hubName} trust: ${pc(first.trust)} in ${first.year} and ${pc(e[last].trust)} in ${e[last].year}.`;
  return (
    <figure className="valuechart taxtrend" aria-label={summary}>
      <figcaption className="vc-title">How much tax took each year</figcaption>
      <div className="legend card-legend" aria-label="Legend">
        <span><i className="vc-key home" />Kept in {the(r.homeName)}</span>
        <span><i className="vc-key trust" />Through a {r.hubName} trust</span>
        <span className="vc-note">Each point is one year: capital gains tax plus wealth taxes, as a percentage of the value that year started with. The trust's fee is not a tax and is not in it.</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="vc-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="vc-grid" />
            <text x={L - 8} y={y(t) + 3.5} textAnchor="end" className="vc-axis">{t.toFixed(max < 2 ? 2 : 1)}%</text>
          </g>
        ))}
        {e.map((p, i) => <text key={p.year} x={x(i)} y={H - 10} textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === last ? 'end' : 'middle'} className="vc-axis">{p.year}</text>)}
        <path d={line('home')} className="vc-line home" style={{ fill: 'none' }} />
        <path d={line('trust')} className="vc-line trust" style={{ fill: 'none' }} />
        {e.map((p, i) => <circle key={'h' + i} cx={x(i)} cy={y(p.home)} r={dot} className="vc-dot home" />)}
        {e.map((p, i) => <circle key={'t' + i} cx={x(i)} cy={y(p.trust)} r={dot} className="vc-dot trust" />)}
        {n > 1 && <text x={x(0)} y={y(first.home) - 9} textAnchor="start" className="vc-axis tt-first">{pc(first.home)}</text>}
        <text x={x(last) + 10} y={th + 4} className="vc-end home">{pc(e[last].home)}</text>
        <text x={x(last) + 10} y={tt + 4} className="vc-end trust">{pc(e[last].trust)}</text>
      </svg>
      <p className="rep-note tt-summary">{summary}</p>
    </figure>
  );
}
