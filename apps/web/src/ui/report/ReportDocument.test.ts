import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildReport, type ReportOk } from '../../data/report';
import { P, mk } from '../../data/report.testdata';
import { LOGO_DATA_URI } from './logo';
import ReportDocument from './ReportDocument';
import { reportHtml } from './reportHtml';

const d = mk();
const r = buildReport(d, P({ endYear: 2025 })) as ReportOk;
const markup = renderToStaticMarkup(createElement(ReportDocument, { d, r, generatedOn: '2026-10-03' }));
const plain = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const footers = markup.split('<footer').slice(1).map((f) => f.split('</footer>')[0]);

// The gateway refuses report HTML that could load or run anything. Read its rule from the source so this test can never drift from it.
const gatewaySource = Object.values(import.meta.glob('../../../../../services/auth-gateway/server.mjs', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>)[0];
if (!gatewaySource) throw new Error('services/auth-gateway/server.mjs not found: the footer test needs the gateway\'s HTML screening rule');
const HTML_BAD: RegExp = new Function(`return ${/const HTML_BAD = (\/.*\/[a-z]*);/.exec(gatewaySource)![1]}`)();

describe('the report footer', () => {
  it('has three pages and each one carries the firm name and "since 1991"', () => {
    expect(footers).toHaveLength(3);
    for (const f of footers) expect(plain(f)).toContain('Van Wyk Auditors since 1991');
  });
  it('keeps the disclaimer and the page label beside the logo', () => {
    footers.forEach((f, i) => {
      expect(plain(f)).toContain('Indicative only, not tax advice');
      expect(plain(f)).toContain(`page ${i + 1} of 3`);
    });
  });
  it('embeds the logo once, as data, and draws it on every page', () => {
    expect(markup.split(LOGO_DATA_URI)).toHaveLength(2);                      // exactly one copy in the file
    expect(markup.match(/<use href="#vw-logo"/g)).toHaveLength(3);
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
