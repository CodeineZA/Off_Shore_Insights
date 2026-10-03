// The report as one self-contained HTML page: the document rendered to static markup with the app's own CSS inlined.
// That page is what Gotenberg turns into the emailed PDF, and what the "Download PDF" tab prints. Loaded on demand
// (react-dom/server is not needed anywhere else).
import { createElement } from 'react';
import type { Dashboard } from '../../data/types';
import { STRUCTURES, fmtMoney, type ReportOk } from '../../data/report';
import ReportDocument from './ReportDocument';

/** Every same-origin stylesheet rule on the page. Google Fonts is cross-origin and skipped: Poppins is installed where the PDF is made. */
export function pageCss(): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try { for (const rule of Array.from(sheet.cssRules)) out.push(rule.cssText); } catch { /* cross-origin */ }
  }
  return out.join('\n');
}

/**
 * Poppins as inline @font-face rules (woff2, latin), so the report looks the same wherever it is turned into a PDF: the Pi's
 * renderer has no copy of the font and no reason to reach the internet for one. Loaded only when a report is built.
 */
export async function fontCss(): Promise<string> {
  const weights = await Promise.all([
    import('@fontsource/poppins/files/poppins-latin-300-normal.woff2?inline'), import('@fontsource/poppins/files/poppins-latin-400-normal.woff2?inline'),
    import('@fontsource/poppins/files/poppins-latin-500-normal.woff2?inline'), import('@fontsource/poppins/files/poppins-latin-600-normal.woff2?inline'),
  ]);
  return [300, 400, 500, 600].map((w, i) => `@font-face{font-family:Poppins;font-style:normal;font-weight:${w};font-display:block;src:url(${weights[i].default}) format('woff2')}`).join('');
}

export const reportFileBase = (r: ReportOk) =>
  `OffShore-Insights_${r.homeName}_${STRUCTURES[r.params.structure].label}-${r.hubName}_${r.startYear}-${r.endYear}_${r.currency}`.replace(/[^A-Za-z0-9._-]+/g, '-');
export const reportSubject = (r: ReportOk) =>
  `What ${fmtMoney(r.params.principal, r.currency)} would have become: ${r.homeName} against a ${r.hubName} ${STRUCTURES[r.params.structure].label.toLowerCase()}, ${r.startYear}${r.endYear > r.startYear ? ` to ${r.endYear}` : ''}`;

export async function reportHtml(d: Dashboard, r: ReportOk, opts: { generatedOn: string; autoPrint?: boolean; css?: string }): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const body = renderToStaticMarkup(createElement(ReportDocument, { d, r, generatedOn: opts.generatedOn }));
  const css = (await fontCss()) + (opts.css ?? pageCss());
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${reportSubject(r).replace(/[<>&]/g, '')}</title><style>${css}</style>`
    + `<style>html,body{margin:0;background:#fff !important;color:#1d1610}body{display:block}.report-doc{display:block}.report-page{margin:0 auto}</style></head>`
    + `<body class="report-body">${body}${opts.autoPrint ? '<script>addEventListener("load",function(){setTimeout(function(){print()},500)})</script>' : ''}</body></html>`;
}
