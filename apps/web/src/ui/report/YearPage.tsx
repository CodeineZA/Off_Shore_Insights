// One page for one year: what the money did that year kept at home and through the trust, the step the trust added or lost against keeping it local,
// the running lead, and the rates in force that year with the pages they came from. Every number is read from the same ReportOk as the rest of the document.
import { pct } from '../../data/insights';
import { CURRENCY_NAME, MODEL_TAXES, STRUCTURES, fmtMoney, the, type RateUsed, type ReportOk } from '../../data/report';
import { describeAddress } from '../../data/sources';
import { Foot, Head } from './pieces';

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** The trust's lead over keeping it local at the end of each year: trust end − home end. */
export const leadsOf = (r: ReportOk) => r.years.map((y) => y.trust.end - y.home.end);

/** Bars of the lead at the end of every year, this year drawn darker. */
function LeadStrip({ r, i }: { r: ReportOk; i: number }) {
  const ls = leadsOf(r), n = ls.length;
  const W = 640, H = 118, L = 6, R = 6, T = 20, B = 20;
  const lo = Math.min(0, ...ls), hi = Math.max(0, ...ls) === lo ? lo + 1 : Math.max(0, ...ls);
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const slot = (W - L - R) / n, bw = Math.min(40, slot * 0.6), y0 = y(0);
  const m = (v: number) => `${v >= 0 ? '+' : '−'}${fmtMoney(Math.abs(v), r.currency)}`;
  return (
    <figure className="valuechart leadstrip" aria-label="The trust's lead over keeping it local at the end of each year">
      <figcaption className="vc-title">The lead at the end of each year</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" className="vc-svg">
        <line x1={L} x2={W - R} y1={y0} y2={y0} className="vc-grid" />
        {ls.map((v, j) => {
          const bx = L + slot * j + (slot - bw) / 2, yv = y(v);
          return (
            <g key={r.years[j].year}>
              <rect x={bx} y={Math.min(y0, yv)} width={bw} height={Math.max(1, Math.abs(y0 - yv))} rx="2" className={`ls-bar ${v >= 0 ? 'ahead' : 'behind'}${j === i ? ' now' : ''}`} />
              {(n <= 12 || j % 2 === 0 || j === i) && <text x={bx + bw / 2} y={H - 6} textAnchor="middle" className={'vc-axis' + (j === i ? ' ls-now' : '')}>{r.years[j].year}</text>}
              {j === i && <text x={bx + bw / 2} y={v >= 0 ? yv - 5 : yv + 11} textAnchor="middle" className="vc-end ls-val">{m(v)}</text>}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export default function YearPage({ r, i, generatedOn, page, pages }: { r: ReportOk; i: number; generatedOn: string; page: number; pages: number }) {
  const y = r.years[i], cur = r.currency, struct = STRUCTURES[r.params.structure].label, hub = r.hubName;
  const m = (v: number) => fmtMoney(v, cur);
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${m(Math.abs(v))}`;
  const less = (v: number) => (Math.round(v) === 0 ? m(0) : `−${m(v)}`);
  const ls = leadsOf(r), lead = ls[i], step = lead - (i ? ls[i - 1] : 0);
  const eff = r.effective[i];
  const rate = (side: 'home' | 'trust', t: string): RateUsed | undefined => r.rates.find((x) => x.year === y.year && x.side === side && x.taxType === t);
  const cell = (x: RateUsed | undefined, side: 'home' | 'trust') => {
    if (!x) return <td>—</td>;
    const bits: string[] = [];
    if (side === 'trust') bits.push(x.relieved ? `charged in ${hub}` : `still charged in ${the(r.homeName)}`);
    if (x.thresholdConverted != null) bits.push(`threshold ${m(x.thresholdConverted)}${x.currency !== cur && x.thresholdLocal != null ? ` (${x.currency} ${Math.round(x.thresholdLocal).toLocaleString('en')})` : ''}`);
    return <td><b>{pct(x.rate)}</b>{bits.length > 0 && <small>{bits.join(' · ')}</small>}{x.needsVerification && <em className="tv"> to verify</em>}</td>;
  };
  const used = r.rates.filter((x) => x.year === y.year);
  const srcs = [...new Map(used.filter((x) => x.sourceUrl).map((x) => [x.sourceUrl as string, x])).values()].map((x) => ({ ...describeAddress(x.sourceUrl), verifiedOn: x.verifiedOn, check: x.needsVerification }));
  const notes = [...new Map(used.flatMap((x) => [x.note, x.thresholdNote].filter((t): t is string => !!t).map((t) => [`${x.label}|${t}`, `${x.label}: ${clip(t, 200)}`] as const))).values()].slice(0, 6);
  return (
    <section className="report-page rep-year">
      <Head generatedOn={generatedOn} />
      <div className="rep-title">
        <p className="rep-kicker">{r.homeName} · {struct} in {hub} · year {i + 1} of {r.years.length}</p>
        <h1>{y.year}</h1>
        <p className="rep-sub">The index returned {y.returnPct >= 0 ? '+' : '−'}{Math.abs(y.returnPct).toFixed(2)}% in {CURRENCY_NAME[cur]} ({r.basis} total return). Amounts in {CURRENCY_NAME[cur]}.</p>
      </div>
      <table className="rep-table rep-statement">
        <thead><tr><th /><th>Kept in {the(r.homeName)}</th><th>Through the {hub} {struct.toLowerCase()}</th></tr></thead>
        <tbody>
          <tr><td>Value at the start of {y.year}</td><td>{m(y.home.start)}</td><td>{m(y.trust.start)}</td></tr>
          <tr><td>Growth of the index</td><td>{signed(y.home.gain)}</td><td>{signed(y.trust.gain)}</td></tr>
          <tr><td>Capital gains tax</td><td>{less(y.home.cgt)}</td><td>{less(y.trust.cgt)}</td></tr>
          <tr><td>Wealth tax <small>(net-wealth or solidarity, the larger)</small></td><td>{less(y.home.wealthTax)}</td><td>{less(y.trust.wealthTax)}</td></tr>
          <tr><td>Securities-account tax</td><td>{less(y.home.secTax)}</td><td>{less(y.trust.secTax)}</td></tr>
          <tr><td>{struct} fee <small>({r.params.feePct}% of the value after tax)</small></td><td>—</td><td>{less(y.trust.fee)}</td></tr>
          <tr className="total"><td>Value at the end of {y.year}</td><td>{m(y.home.end)}</td><td>{m(y.trust.end)}</td></tr>
        </tbody>
      </table>
      <div className="rep-cards three">
        <div><span>This year the {struct.toLowerCase()} {step >= 0 ? 'gained' : 'lost'}, against keeping it local</span><b className={step >= 0 ? 'pos' : 'neg'}>{signed(step)}</b></div>
        <div><span>{lead >= 0 ? 'Ahead' : 'Behind'} since the start of {r.startYear}, at the end of {y.year}</span><b className={lead >= 0 ? 'pos' : 'neg'}>{signed(lead)}</b></div>
        <div><span>Tax as a share of the year's starting value: kept in {the(r.homeName)}, then through the {struct.toLowerCase()}</span><b>{eff.home.toFixed(2)}% <small>then</small> {eff.trust.toFixed(2)}%</b></div>
      </div>
      <LeadStrip r={r} i={i} />
      <h2 className="rep-h">Rates in force for {y.year}</h2>
      <table className="rep-table rep-rates">
        <thead><tr><th>Tax</th><th>Kept in {the(r.homeName)}</th><th>Through the {hub} {struct.toLowerCase()}</th></tr></thead>
        <tbody>
          {MODEL_TAXES.map((t) => <tr key={t}><td>{rate('home', t)?.label ?? t}</td>{cell(rate('home', t), 'home')}{cell(rate('trust', t), 'trust')}</tr>)}
        </tbody>
      </table>
      {notes.length > 0 && <ul className="rep-ynotes">{notes.map((t) => <li key={t}>{t}</li>)}</ul>}
      <div className="rep-ysrc">
        <b>Sources for {y.year}</b>
        <ul>{srcs.map((s, k) => <li key={k}>{s.name} · {s.archivedOn ? `dated copy (${s.archivedOn}) of ` : ''}{s.shown ?? 'no address recorded'} · checked {s.verifiedOn}{s.check ? ' · to verify' : ''}</li>)}</ul>
      </div>
      <Foot r={r} page={page} pages={pages} />
    </section>
  );
}
