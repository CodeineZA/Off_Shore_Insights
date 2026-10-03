import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildReport, fmtMoney, type ReportOk } from '../../data/report';
import { HISTORY_YEARS, P, longHistory, mk } from '../../data/report.testdata';
import type { Dashboard } from '../../data/types';
import { sourcesForReport, type SourceEntry, type SourceGroup } from '../../data/sources';
import { niceMax } from '../geom';
import { LOGO_DATA_URI } from './logo';
import { valueAxis } from './ValueChart';
import ReportDocument, { SOURCES_LINES_PER_PAGE, SOURCE_HEADING_LINES, entryLines, pageCount, paginateSources } from './ReportDocument';
import { reportHtml } from './reportHtml';
import { leadsOf } from './YearPage';

const render = (d: Dashboard, r: ReportOk) => renderToStaticMarkup(createElement(ReportDocument, { d, r, generatedOn: '2026-10-03' }));
const plain = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const pagesOf = (markup: string) => markup.split('<section class="report-page').slice(1);      // each chunk runs to the start of the next page (a page holds a nested banner <section>)
const footersOf = (markup: string) => markup.split('<footer').slice(1).map((f) => f.split('</footer>')[0]);

const d = mk();
const r = buildReport(d, P({ endYear: 2025 })) as ReportOk;
const markup = render(d, r);
const N = pageCount(r, paginateSources(sourcesForReport(d, r)).length);

// The gateway refuses report HTML that could load or run anything. Read its rule from the source so this test can never drift from it.
const gatewaySource = Object.values(import.meta.glob('../../../../../services/auth-gateway/server.mjs', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>)[0];
if (!gatewaySource) throw new Error('services/auth-gateway/server.mjs not found: the footer test needs the gateway\'s HTML screening rule');
const HTML_BAD: RegExp = new Function(`return ${/const HTML_BAD = (\/.*\/[a-z]*);/.exec(gatewaySource)![1]}`)();

describe('the report footer', () => {
  it('every page carries the firm name and "since 1991", and says which page of how many it is', () => {
    const f = footersOf(markup);
    expect(f).toHaveLength(N);
    f.forEach((x, i) => {
      expect(plain(x)).toContain('Van Wyk Auditors since 1991');
      expect(plain(x)).toContain('Indicative only, not tax advice');
      expect(plain(x)).toContain(`page ${i + 1} of ${N}`);
    });
  });
  it('embeds the logo once, as data, and draws it on every page', () => {
    expect(markup.split(LOGO_DATA_URI)).toHaveLength(2);                      // exactly one copy in the file
    expect(markup.match(/<use href="#vw-logo"/g)).toHaveLength(N);
    expect(markup).toContain('id="vw-logo"');
    expect(LOGO_DATA_URI.startsWith('data:image/png;base64,')).toBe(true);
  });
  it('is something the gateway will accept: no <img>, no script, no external fetch', () => {
    expect(markup).not.toMatch(/<img\b/i);
    expect(HTML_BAD.test(markup)).toBe(false);
  });
  it('the whole page (fonts and all) passes the same screening, and is a complete document', async () => {
    const html = await reportHtml(d, r, { generatedOn: '2026-10-03', css: '' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(HTML_BAD.test(html)).toBe(false);
    expect(html.length).toBeLessThan(1_500_000);
  });
  it('the screening rule itself still catches what it should (so the checks above mean something)', () => {
    expect(HTML_BAD.test('<img src="data:image/png;base64,AAAA">')).toBe(true);
    expect(HTML_BAD.test('<div style="background:url(https://x.test/a.png)">')).toBe(true);
    expect(HTML_BAD.test('<script>1</script>')).toBe(true);
  });
});

describe('the pages of a two-year report', () => {
  const pages = pagesOf(markup);
  it('result and both graphs first, then the explanation, then a page per year, then the sources', () => {
    expect(pages).toHaveLength(N);
    expect(N).toBe(2 + r.years.length + 1);
    expect(plain(pages[0])).toContain('What US$1,000,000 would have become');
    expect(plain(pages[0])).toContain('What the money became');
    expect(plain(pages[0])).toContain('How much tax took each year');
    expect(plain(pages[1])).toContain('Where the difference comes from');
    expect(plain(pages[1])).toContain('How this was worked out');
    expect(pages[1]).toContain('taxslicer');                                   // the Country page's tax chart, reused read-only
    expect(plain(pages[pages.length - 1])).toContain('Sources');
  });
  it('the old year-by-year table is gone: each year has its own page instead', () => {
    expect(plain(markup)).not.toContain('Year by year');
    expect(pages.filter((p) => p.includes('rep-year'))).toHaveLength(2);
  });
  it('each year page shows that year, its start and end values for both sides, and the rates in force', () => {
    r.years.forEach((y, i) => {
      const t = plain(pages[2 + i]);
      expect(t).toContain(`${y.year} The index returned`);
      expect(t).toContain(`year ${i + 1} of 2`);
      for (const v of [y.home.start, y.home.end, y.trust.start, y.trust.end]) expect(t).toContain(fmtMoney(v, 'USD'));
      expect(t).toContain(`Rates in force for ${y.year}`);
      expect(t).toContain('Net wealth');
    });
  });
});

describe('an eleven-year document (2015 to 2025)', () => {
  const dl = longHistory();
  const rl = buildReport(dl, P({ startYear: 2015, endYear: 2025, currency: 'EUR' })) as ReportOk;
  const ml = render(dl, rl);
  const pages = pagesOf(ml);
  it('has the two graphs, a page for every year in order, and consecutive page numbers', () => {
    expect(rl.ok).toBe(true);
    const NL = pageCount(rl, paginateSources(sourcesForReport(dl, rl)).length);
    expect(pages).toHaveLength(NL);
    HISTORY_YEARS.forEach((year, i) => {
      expect(plain(pages[2 + i])).toContain(`${year} The index returned`);
      expect(plain(pages[2 + i])).toContain(`year ${i + 1} of 11`);
      expect(plain(footersOf(ml)[2 + i])).toContain(`page ${3 + i} of ${NL}`);
    });
  });
  it('the steps the trust adds each year add up to the lead at the end, which is the difference on page 1', () => {
    const leads = leadsOf(rl);
    const steps = leads.map((l, i) => l - (i ? leads[i - 1] : 0));
    expect(steps.reduce((a, b) => a + b, 0)).toBeCloseTo(rl.difference, 6);
    expect(leads[leads.length - 1]).toBeCloseTo(rl.difference, 6);
    const last = plain(pages[2 + 10]);
    expect(last).toContain(fmtMoney(Math.abs(rl.difference), 'EUR'));
    expect(last).toContain(`at the end of 2025`);
  });
  it('a year with a loss says so, and pays no capital gains tax on its page', () => {
    const t = plain(pages[2 + 1]);                                              // 2016, -5 %
    expect(t).toContain('The index returned −5.00%');
    expect(rl.years[1].home.cgt).toBe(0);
  });
  it('every point of every graph lies inside its plot, so nothing is cut off at the top of the page', () => {
    const figs = ml.match(/<figure class="valuechart[\s\S]*?<\/figure>/g) ?? [];
    expect(figs.length).toBeGreaterThanOrEqual(2 + 11);                                  // the two graphs of page 1, and a lead strip on each year page
    for (const f of figs) {
      const h = Number(/viewBox="0 0 \d+ (\d+)"/.exec(f)![1]);
      const cys = [...f.matchAll(/<circle[^>]* cy="([\d.]+)"/g)].map((m) => Number(m[1]));
      for (const cy of cys) { expect(cy).toBeGreaterThanOrEqual(10); expect(cy).toBeLessThanOrEqual(h - 28); }
    }
    expect(figs.filter((f) => f.includes('<circle')).length).toBe(2);
  });
  it('the effective-tax graph carries the first and last year and the sentence is computed from the data', () => {
    const t = plain(pages[0]);
    expect(t).toContain(`tax took ${rl.effective[0].home.toFixed(2)}% of the value in 2015`);
    expect(t).toContain(`${rl.effective[10].home.toFixed(2)}% in 2025`);
  });
});

describe('the value axis', () => {
  it('always starts at or below the lowest value and reaches at or above the highest, for any range', () => {
    let grew = 0;
    for (const lo of [1_000_000, 950_000, 870_000, 1_234_567, 400_000, 60_000_000]) {
      for (let m = 1.0005; m < 9; m *= 1.07) {
        const hi = lo * m, { min, max } = valueAxis(lo, hi);
        expect(min, `lo=${lo} hi=${hi}`).toBeLessThanOrEqual(lo);
        expect(max, `lo=${lo} hi=${hi}`).toBeGreaterThanOrEqual(hi);
        expect(min).toBeGreaterThanOrEqual(0);
        if (max - min > 4 * niceMax((hi - lo) / 4) * 1.0001) grew++;
      }
    }
    expect(grew).toBeGreaterThan(0);                                                      // the sweep does reach the case where the first round step is not enough
  });
});

describe('the lines of the graphs', () => {
  it('are strokes only, whatever the stylesheet says: the colour rule for the legend key and the dots also set a fill, which filled the area under an 11-point line', () => {
    const lines = markup.match(/<path [^>]*class="vc-line[^>]*>/g) ?? [];
    expect(lines).toHaveLength(4);                                                        // home and trust, in each of the two graphs
    for (const l of lines) expect(l).toContain('style="fill:none"');
  });
});

describe('the sources are cut into pages', () => {
  const entry = (n: number) => ({ key: 'k' + n, name: 'Source ' + n, kind: 'unknown', shown: 'example.org/' + n, archived: null, verifiedOn: '2026-10-03' });
  const groups = (a: number, b: number) => [{ id: 'rates', title: 'Tax rates', entries: Array.from({ length: a }, (_, i) => entry(i)) }, { id: 'lists', title: 'Lists', entries: Array.from({ length: b }, (_, i) => entry(100 + i)) }] as unknown as SourceGroup[];
  const cost = (page: ReturnType<typeof paginateSources>[number]) => page.reduce((a, p) => a + SOURCE_HEADING_LINES + p.entries.reduce((s, e) => s + entryLines(e), 0), 0);
  it('keeps every source once and in order, and never overfills a page', () => {
    const pages = paginateSources(groups(50, 7), 30, 0);
    const keys = pages.flat().flatMap((p) => p.entries.map((e) => e.key));
    expect(keys).toEqual([...Array.from({ length: 50 }, (_, i) => 'k' + i), ...Array.from({ length: 7 }, (_, i) => 'k' + (100 + i))]);
    for (const page of pages) expect(cost(page)).toBeLessThanOrEqual(30);
  });
  it('leaves room on the first page for the introduction', () => {
    const pages = paginateSources(groups(50, 7), 30, 10);
    expect(cost(pages[0])).toBeLessThanOrEqual(20);
    expect(cost(pages[1])).toBeGreaterThan(20);                                 // later pages use the whole budget
  });
  it('marks a group that runs over as continued, and never leaves a heading with a single entry at the foot of a page', () => {
    const pages = paginateSources(groups(50, 7), 30, 0);
    expect(pages[0][0].continued).toBe(false);
    expect(pages[1][0]).toMatchObject({ id: 'rates', continued: true });
    for (const part of pages.flat()) if (part.entries.length === 1) expect(part.continued).toBe(true);            // only the tail of a group can be one entry
    const small = paginateSources(groups(10, 7), 30, 0);                        // the first group nearly fills page 1: no room for a heading and two more
    expect(small[1][0]).toMatchObject({ id: 'lists', continued: false });
  });
  it('a long address costs more lines than a short one, so a page of long ones holds fewer', () => {
    const long = { ...entry(1), shown: 'taxsummaries.pwc.com/netherlands/individual/income-determination/other-taxes-and-levies', archived: { on: '2024-09-17', original: 'x' } } as unknown as SourceEntry;
    expect(entryLines(long)).toBeGreaterThan(entryLines(entry(1) as unknown as SourceEntry));
    const mk2 = (e: unknown, n: number) => [{ id: 'rates', title: 'Tax rates', entries: Array.from({ length: n }, (_, i) => ({ ...(e as object), key: 'k' + i })) }] as unknown as SourceGroup[];
    expect(paginateSources(mk2(long, 40), 40, 0).length).toBeGreaterThan(paginateSources(mk2(entry(1), 40), 40, 0).length);
  });
  it('a short list stays on one page, and nothing gives no pages', () => {
    expect(paginateSources(groups(5, 3))).toHaveLength(1);
    expect(paginateSources([])).toEqual([]);
    expect(SOURCES_LINES_PER_PAGE).toBeGreaterThan(60);
  });
  it('the page budget is a MEASURED value: it kept realistic pages at about 77% of an A4 page (CLAUDE.md, "Checking the layout"); re-measure before moving it', () => {
    expect(SOURCES_LINES_PER_PAGE).toBeGreaterThanOrEqual(100);
    expect(SOURCES_LINES_PER_PAGE).toBeLessThanOrEqual(170);                    // 400 here would overflow every sources page onto an extra, footer-less sheet
  });
});
