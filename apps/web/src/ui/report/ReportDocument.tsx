// The report as a document: A4 pages in a light "paper" version of the theme. The same component is the preview on the
// Reports page and (rendered to static HTML) the PDF that is emailed, so what you see is what is sent.
// Reused from the Country page: the tax chart ("Where the tax hurts") in read-only mode. The lists use the banner's pills.
import type { Dashboard } from '../../data/types';
import { fmtDate } from '../../data/insights';
import { CURRENCY_NAME, MODEL_TAXES, STRUCTURES, fmtMoney, the, type ReportOk } from '../../data/report';
import { sourcesForReport } from '../../data/sources';
import TaxSlicer from '../TaxSlicer';
import ValueChart from './ValueChart';
import { LOGO_DATA_URI, LOGO_HEIGHT, LOGO_WIDTH } from './logo';

const money = (v: number) => Math.round(v).toLocaleString('en');
const noop = () => {};

/** The logo is defined once (an SVG <image>, no <img> and no URL) and drawn in every footer with <use>, so it is in the file once. */
function LogoDef() {
  return <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false"><defs><image id="vw-logo" href={LOGO_DATA_URI} width={LOGO_WIDTH} height={LOGO_HEIGHT} /></defs></svg>;
}
function Foot({ r, page }: { r: ReportOk; page: string }) {
  return (
    <footer className="rep-foot">
      <div className="rep-mark">
        <svg className="rep-logo" viewBox={`0 0 ${LOGO_WIDTH} ${LOGO_HEIGHT}`} role="img" aria-label="Van Wyk Auditors logo"><use href="#vw-logo" /></svg>
        <span className="rep-since"><b>Van Wyk Auditors</b> <i>since 1991</i></span>
      </div>
      <span className="rep-note">Indicative only, not tax advice. An illustration built from stored tax rates and published index returns; past performance does not predict future returns.</span>
      <span className="rep-where">{r.homeName} · {r.hubName} {STRUCTURES[r.params.structure].label.toLowerCase()} · {page} of 3</span>
    </footer>
  );
}
function Head({ generatedOn }: { generatedOn: string }) {
  return <header className="rep-head"><span className="rep-brand">Off_Shore_Insights</span><span>{fmtDate(generatedOn)}</span></header>;
}

export default function ReportDocument({ d, r, generatedOn }: { d: Dashboard; r: ReportOk; generatedOn: string }) {
  const struct = STRUCTURES[r.params.structure].label;
  const ys = r.years.map((y) => y.year);
  const sources = sourcesForReport(d, r);
  const better = r.difference >= 0;
  const m = (v: number) => fmtMoney(v, r.currency);
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${m(Math.abs(v))}`;
  return (
    <article className="report-doc" aria-label={`Report: ${r.summary}`}>
      <LogoDef />
      <section className="report-page">
        <Head generatedOn={generatedOn} />
        <div className="rep-title">
          <p className="rep-kicker">{r.homeName} · {struct} in {r.hubName} · {r.startYear === r.endYear ? r.startYear : `${r.startYear} to ${r.endYear}`}</p>
          <h1>What {m(r.params.principal)} would have become</h1>
          <p className="rep-sub">Invested in global shares at the start of {r.startYear} and left until the end of {r.endYear}: kept personally in {the(r.homeName)}, against held through a {struct.toLowerCase()} in {r.hubName}.</p>
        </div>
        <section className="banner rep-headline" aria-label="Result">
          <div className="rep-big">
            <div><span>Kept in {the(r.homeName)}</span><b>{m(r.home.end)}</b><small>after {m(r.home.tax)} of tax</small></div>
            <div><span>Through a {r.hubName} {struct.toLowerCase()}</span><b>{m(r.trust.end)}</b><small>after {m(r.trust.tax + r.trust.fee)} of tax and fees</small></div>
            <div className={better ? 'ahead' : 'behind'}><span>{better ? 'Ahead by' : 'Behind by'}</span><b>{signed(r.difference)}</b><small>{r.differencePct >= 0 ? '+' : '−'}{Math.abs(r.differencePct).toFixed(1)}% of the amount kept at home</small></div>
          </div>
        </section>
        <ValueChart r={r} />
        <TaxSlicer d={d} code={r.params.code} years={ys} focus={null} onFocus={noop} mode="report" only={[...MODEL_TAXES]} />
        <Foot r={r} page="page 1" />
      </section>

      <section className="report-page">
        <Head generatedOn={generatedOn} />
        <h2 className="rep-h">Year by year</h2>
        <table className="rep-table">
          <thead>
            <tr><th rowSpan={2}>Year</th><th rowSpan={2}>Index return</th><th colSpan={3}>Kept in {the(r.homeName)}</th><th colSpan={4}>Through the {r.hubName} {struct.toLowerCase()}</th><th rowSpan={2}>Difference</th></tr>
            <tr><th>Start</th><th>Tax</th><th>End</th><th>Start</th><th>Tax</th><th>Fee</th><th>End</th></tr>
          </thead>
          <tbody>
            {r.years.map((y) => (
              <tr key={y.year}>
                <td>{y.year}</td><td>{y.returnPct.toFixed(2)}%</td>
                <td>{money(y.home.start)}</td><td>{money(y.home.cgt + y.home.wealth)}</td><td>{money(y.home.end)}</td>
                <td>{money(y.trust.start)}</td><td>{money(y.trust.cgt + y.trust.wealth)}</td><td>{money(y.trust.fee)}</td><td>{money(y.trust.end)}</td>
                <td className={y.trust.end >= y.home.end ? 'pos' : 'neg'}>{signed(y.trust.end - y.home.end)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="rep-note">Amounts in {CURRENCY_NAME[r.currency]}. Tax is capital gains tax plus the wealth taxes in the model. Index: {r.returns[0]?.index_name} total return, {r.basis}.</p>

        <h2 className="rep-h">Where the difference comes from</h2>
        <div className="rep-cards">
          <div><span>Tax paid kept in {the(r.homeName)}</span><b>{m(r.home.tax)}</b></div>
          <div><span>Tax paid through the {struct.toLowerCase()}</span><b>{m(r.trust.tax)}</b></div>
          <div><span>{struct} fees ({r.params.feePct}% a year)</span><b>{m(r.trust.fee)}</b></div>
          <div><span>Net difference</span><b>{signed(r.difference)}</b></div>
        </div>

        <h2 className="rep-h">What we hold on the lists</h2>
        <ul className="rep-flags">
          {r.flags.map((f, i) => <li key={i} className={f.level}><i aria-hidden="true" />{f.text}</li>)}
        </ul>

        <h2 className="rep-h">How this was worked out</h2>
        <ol className="rep-assume">{r.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ol>

        <Foot r={r} page="page 2" />
      </section>

      <section className="report-page">
        <Head generatedOn={generatedOn} />
        <h2 className="rep-h">Sources</h2>
        <p className="rep-note">Every rate and return in this report, by the page it was taken from. A dated copy is a saved snapshot of the page from the date shown; "checked" is the date we read it.</p>
        <div className="rep-sources">
          {sources.map((g) => (
            <div key={g.id} className="rep-src-group">
              <h3>{g.title}</h3>
              <ul>{g.entries.map((e) => (
                <li key={e.key}>
                  <b>{e.name}</b>{e.kind !== 'unknown' && <em> · {e.kind}</em>}
                  <span className="rep-url">{e.shown ? (e.archived ? `Dated copy (${e.archived.on}) of ${e.shown}` : e.shown) : 'no address recorded'}{e.verifiedOn ? ` · checked ${e.verifiedOn}` : ''}</span>
                </li>
              ))}</ul>
            </div>
          ))}
        </div>
        <Foot r={r} page="page 3" />
      </section>
    </article>
  );
}
