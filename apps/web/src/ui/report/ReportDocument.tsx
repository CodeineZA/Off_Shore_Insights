// The report as a document: A4 pages in a light "paper" version of the theme. The same component is the preview on the
// Reports page and (rendered to static HTML) the PDF that is emailed, so what you see is what is sent.
// Page 1: the result and the two graphs. Page 2: where the difference comes from, the rates behind it (the Country page's tax chart, read-only), the lists
// and the assumptions. Then one page per year, then the sources.
import type { Dashboard } from '../../data/types';
import { MODEL_TAXES, STRUCTURES, fmtMoney, the, type ReportOk } from '../../data/report';
import { sourcesForReport, type SourceEntry, type SourceGroup } from '../../data/sources';
import TaxSlicer from '../TaxSlicer';
import TaxTrendChart from './TaxTrendChart';
import ValueChart from './ValueChart';
import YearPage from './YearPage';
import { Foot, Head, LogoDef } from './pieces';

const noop = () => {};
/**
 * A page of sources is two columns of small type. Entries are budgeted by the LINES they take, not by how many there are: a dated copy of a long address wraps
 * to three lines, a short one to two. The budget is measured on a printed A4 page, with a margin; the first page also carries the introduction.
 */
export const SOURCES_LINES_PER_PAGE = 150;
export const SOURCES_INTRO_LINES = 6;
export const SOURCE_HEADING_LINES = 2.4;
const CHARS_PER_LINE = 58;

/** The address line of a source, as printed. */
export const entryText = (e: SourceEntry) => `${e.shown ? (e.archived ? `Dated copy (${e.archived.on}) of ${e.shown}` : e.shown) : 'no address recorded'}${e.verifiedOn ? ` · checked ${e.verifiedOn}` : ''}`;
/** Lines one source takes: its name, its wrapped address, and the gap before the next. */
export const entryLines = (e: SourceEntry) => 1.4 + Math.max(1, Math.ceil(entryText(e).length / CHARS_PER_LINE));

export interface SourcePart { id: string; title: string; entries: SourceEntry[]; continued: boolean }
/** The source groups cut into pages; a group that runs over a page is continued under its heading, and a heading is never left alone at the foot of a page. */
export function paginateSources(groups: SourceGroup[], budget = SOURCES_LINES_PER_PAGE, intro = SOURCES_INTRO_LINES): SourcePart[][] {
  const pages: SourcePart[][] = [[]];
  let used = intro;                                                           // the first page carries the introduction
  const next = () => { pages.push([]); used = 0; };
  for (const g of groups) {
    let rest = g.entries, continued = false;
    while (rest.length) {
      let take = 0, cost = SOURCE_HEADING_LINES;
      while (take < rest.length && used + cost + entryLines(rest[take]) <= budget) { cost += entryLines(rest[take]); take++; }
      if (take < Math.min(2, rest.length)) {
        if (used > (pages.length === 1 ? intro : 0)) { next(); continue; }    // no room for a heading and two entries here: start a fresh page
        take = 1; cost = SOURCE_HEADING_LINES + entryLines(rest[0]);          // an empty page that still cannot hold two: take what there is
      }
      pages[pages.length - 1].push({ id: g.id, title: g.title, entries: rest.slice(0, take), continued });
      used += cost; rest = rest.slice(take); continued = true;
      if (rest.length) next();
    }
  }
  return pages.filter((p) => p.length);
}

/** How many pages the document has: result, explanation, one per year, the sources. */
export const pageCount = (r: ReportOk, sourcePages: number) => 2 + r.years.length + sourcePages;

export default function ReportDocument({ d, r, generatedOn }: { d: Dashboard; r: ReportOk; generatedOn: string }) {
  const struct = STRUCTURES[r.params.structure].label;
  const sources = paginateSources(sourcesForReport(d, r));
  const pages = pageCount(r, sources.length);
  const better = r.difference >= 0;
  const m = (v: number) => fmtMoney(v, r.currency);
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${m(Math.abs(v))}`;
  const taxYears = [...new Set([r.startYear, r.endYear])];
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
        <TaxTrendChart r={r} />
        <Foot r={r} page={1} pages={pages} />
      </section>

      <section className="report-page">
        <Head generatedOn={generatedOn} />
        <h2 className="rep-h">Where the difference comes from</h2>
        <div className="rep-cards">
          <div><span>Tax paid kept in {the(r.homeName)}</span><b>{m(r.home.tax)}</b></div>
          <div><span>Tax paid through the {struct.toLowerCase()}</span><b>{m(r.trust.tax)}</b></div>
          <div><span>{struct} fees ({r.params.feePct}% a year)</span><b>{m(r.trust.fee)}</b></div>
          <div><span>Net difference</span><b>{signed(r.difference)}</b></div>
        </div>
        <p className="rep-note">Amounts in the report currency. Tax is capital gains tax plus the wealth taxes in the model. Each year is set out on its own page that follows. Index: {r.returns[0]?.index_name} total return, {r.basis}.</p>

        <TaxSlicer d={d} code={r.params.code} years={taxYears} focus={null} onFocus={noop} mode="report" only={[...MODEL_TAXES]} />

        <h2 className="rep-h">What we hold on the lists</h2>
        <ul className="rep-flags">
          {r.flags.map((f, i) => <li key={i} className={f.level}><i aria-hidden="true" />{f.text}</li>)}
        </ul>

        <h2 className="rep-h">How this was worked out</h2>
        <ol className="rep-assume">{r.assumptions.map((a, i) => <li key={i}>{a}</li>)}</ol>

        <Foot r={r} page={2} pages={pages} />
      </section>

      {r.years.map((_, i) => <YearPage key={r.years[i].year} r={r} i={i} generatedOn={generatedOn} page={3 + i} pages={pages} />)}

      {sources.map((part, k) => (
        <section className="report-page" key={'s' + k}>
          <Head generatedOn={generatedOn} />
          <h2 className="rep-h">Sources{sources.length > 1 ? ` (${k + 1} of ${sources.length})` : ''}</h2>
          {k === 0 && <p className="rep-note">Every rate and return in this report, by the page it was taken from. A dated copy is a saved snapshot of the page from the date shown; "checked" is the date we read it.</p>}
          <div className="rep-sources">
            {part.map((g) => (
              <div key={g.id} className="rep-src-group">
                <h3>{g.title}{g.continued ? ' (continued)' : ''}</h3>
                <ul>{g.entries.map((e) => (
                  <li key={e.key}>
                    <b>{e.name}</b>{e.kind !== 'unknown' && <em> · {e.kind}</em>}
                    <span className="rep-url">{entryText(e)}</span>
                  </li>
                ))}</ul>
              </div>
            ))}
          </div>
          <Foot r={r} page={3 + r.years.length + k} pages={pages} />
        </section>
      ))}
    </article>
  );
}
