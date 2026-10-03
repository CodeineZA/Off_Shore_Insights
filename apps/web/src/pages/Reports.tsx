// Reports: "what a million would have become". Pick a country (and region), a structure (a Trust in Mauritius or Seychelles)
// and a start year; the report is built live from the stored rates and index returns, shown exactly as the PDF will look,
// and can be emailed (PDF + Excel of the raw values) or downloaded. An incomplete data set gives a list of what is missing,
// never a number.
import { useMemo, useState } from 'react';
import type { Dashboard } from '../data/types';
import { CURRENCIES, CURRENCY_NAME, DEFAULT_FEE_PCT, HUB_NAME, INDEX, PRINCIPAL, STRUCTURES, buildReport, defaultStartYear, fmtMoney, perUnit, startYears, type HubCode, type ReportCurrency, type ReportOk } from '../data/report';
import { reportSheets } from '../data/reportsheets';
import { ReportMailError, AuthExpired, sendReportEmail } from '../api';
import ReportDocument from '../ui/report/ReportDocument';
import { pageCss, reportFileBase, reportHtml, reportSubject } from '../ui/report/reportHtml';

const today = () => new Date().toISOString().slice(0, 10);

export default function Reports({ d, onExpired }: { d: Dashboard; onExpired: () => void }) {
  const countries = useMemo(() => d.jurisdictions.filter((j) => j.kind === 'country' && !j.is_offshore_hub).sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name)), [d]);
  const base = (code: string, hub: HubCode, feePct: number, currency: ReportCurrency = 'EUR', principal = PRINCIPAL) => ({ code, structure: 'trust' as const, hub, principal, feePct, index: INDEX, currency });

  // Open on the first country that has a complete report.
  const initialCode = useMemo(() => countries.find((c) => startYears(d, base(c.code, 'MU', DEFAULT_FEE_PCT)).some((x) => x.ok))?.code ?? countries[0]?.code ?? '', [d, countries]);
  const [code, setCode] = useState(initialCode);
  const [hub, setHub] = useState<HubCode>('MU');
  const [currency, setCurrency] = useState<ReportCurrency>('EUR');
  // A start year the user clicked, kept only for the country it was clicked in.
  const [picked, setPicked] = useState<{ code: string; year: number } | null>(null);
  const [fee, setFee] = useState(String(DEFAULT_FEE_PCT));
  const [amountText, setAmountText] = useState(String(PRINCIPAL));
  const [busy, setBusy] = useState<null | 'mail' | 'pdf' | 'xlsx'>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const toEur = perUnit(d, currency, 'EUR');
  const feePct = Number.isFinite(parseFloat(fee)) ? Math.min(10, Math.max(0, parseFloat(fee))) : DEFAULT_FEE_PCT;
  // The amount invested, in the report currency. A million rand is a much smaller sum than a million euros, so it is a choice, not a constant.
  const amount = Number.isFinite(parseFloat(amountText)) ? Math.min(1_000_000_000, Math.max(10_000, Math.round(parseFloat(amountText)))) : PRINCIPAL;
  const inEur = toEur == null ? null : amount * toEur;
  const j = d.jurisdictions.find((x) => x.code === code);
  const country = j?.kind === 'region' ? d.jurisdictions.find((x) => x.code === j.parent_code) : j;
  const regions = country ? d.jurisdictions.filter((x) => x.parent_code === country.code) : [];
  const chips = useMemo(() => startYears(d, base(code, hub, feePct, currency, amount)), [d, code, hub, feePct, currency, amount]);
  // The report opens on the last ten years (it moves by itself as years close); a year the user clicked for this country wins.
  const lastYear = chips.length ? Math.max(...chips.map((c) => c.year)) : null;
  const year = picked && picked.code === code && chips.some((c) => c.year === picked.year) ? picked.year : defaultStartYear(chips) ?? chips[0]?.year ?? new Date().getFullYear() - 2;
  const result = useMemo(() => buildReport(d, { ...base(code, hub, feePct, currency, amount), startYear: year }), [d, code, hub, feePct, currency, amount, year]);
  const ok: ReportOk | null = result.ok ? result : null;

  const pick = (c: string) => { setCode(c); setMsg(null); };
  const fail = (e: unknown) => {
    if (e instanceof AuthExpired) { onExpired(); return; }
    setMsg({ ok: false, text: e instanceof ReportMailError ? e.message : 'Something went wrong building the files. Try again.' });
  };
  const files = async (r: ReportOk) => {
    const { buildWorkbook, toBase64 } = await import('../data/reportxlsx');
    const meta = { generatedOn: today(), dataAsOf: d.generated_at.slice(0, 10) };
    const xlsx = await buildWorkbook(reportSheets(d, r, meta), reportSubject(r));
    return { xlsx, xlsxBase64: toBase64(xlsx), meta };
  };

  const email = async () => {
    if (!ok) return;
    setBusy('mail'); setMsg(null);
    try {
      const f = await files(ok);
      const html = await reportHtml(d, ok, { generatedOn: f.meta.generatedOn, css: pageCss() });
      const out = await sendReportEmail({ html, xlsxBase64: f.xlsxBase64, filenameBase: reportFileBase(ok), subject: reportSubject(ok), summary: ok.summary });
      setMsg({ ok: true, text: out.sentTo.includes('example.com') ? `Preview only: nothing was sent. The files are in apps/web/.report-preview/.` : `Sent to ${out.sentTo}, with the PDF and the Excel attached. It can take a minute to arrive; if it does not, look in the spam folder.` });
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const pdf = async () => {
    if (!ok) return;
    const w = window.open('', '_blank');                       // opened first, inside the click, so it is not blocked as a pop-up
    if (!w) { setMsg({ ok: false, text: 'The browser blocked the new tab. Allow pop-ups for this site and try again.' }); return; }
    setBusy('pdf'); setMsg(null);
    try {
      w.document.write(await reportHtml(d, ok, { generatedOn: today(), autoPrint: true, css: pageCss() }));
      w.document.close();
      setMsg({ ok: true, text: 'The report opened in a new tab. Choose "Save as PDF" in the print window.' });
    } catch (e) { w.close(); fail(e); } finally { setBusy(null); }
  };
  const xlsx = async () => {
    if (!ok) return;
    setBusy('xlsx'); setMsg(null);
    try {
      const f = await files(ok);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([f.xlsx as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      a.download = reportFileBase(ok) + '.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  return (
    <>
      {d.preview_overlay?.length ? <p className="rep-preview" role="note">Preview data: {d.preview_overlay.join(', ')} are not in the database yet. Nothing here is live.</p> : null}
      <section className="rep-controls" aria-label="Report settings">
        <div className="filter-row"><span className="filter-k">Country</span>
          <div className="chips" role="group" aria-label="Country">
            {countries.map((c) => <button key={c.code} className={'chip' + (country?.code === c.code ? ' on' : '')} aria-pressed={country?.code === c.code} onClick={() => pick(c.code)}>{c.name}</button>)}
          </div>
        </div>
        {regions.length > 0 && (
          <div className="filter-row"><span className="filter-k">Region</span>
            <div className="chips" role="group" aria-label="Region">
              <button className={'chip' + (code === country?.code ? ' on' : '')} aria-pressed={code === country?.code} onClick={() => pick(country!.code)}>Whole country</button>
              {regions.map((c) => <button key={c.code} className={'chip' + (code === c.code ? ' on' : '')} aria-pressed={code === c.code} onClick={() => pick(c.code)}>{c.name}</button>)}
            </div>
          </div>
        )}
        <div className="filter-row"><span className="filter-k">Structure</span>
          <div className="chips" role="group" aria-label="Structure">
            {STRUCTURES.trust.hubs.map((h) => <button key={h} className={'chip' + (hub === h ? ' on' : '')} aria-pressed={hub === h} onClick={() => { setHub(h); setMsg(null); }}>{STRUCTURES.trust.label} · {HUB_NAME[h]}</button>)}
          </div>
        </div>
        <div className="filter-row"><span className="filter-k">Currency</span>
          <div className="chips" role="group" aria-label="Currency">
            {CURRENCIES.map((c) => <button key={c} className={'chip' + (currency === c ? ' on' : '')} aria-pressed={currency === c} title={CURRENCY_NAME[c]} onClick={() => { setCurrency(c); setMsg(null); }}>{c}</button>)}
          </div>
        </div>
        <div className="filter-row"><span className="filter-k">Invested at the start of</span>
          <div className="chips" role="group" aria-label="Start year">
            {chips.map((c) => <button key={c.year} className={'chip' + (year === c.year ? ' on' : '') + (c.ok ? '' : ' nodata')} aria-pressed={year === c.year} title={c.ok ? `Invested at the start of ${c.year}` : c.reason ?? undefined} onClick={() => { setPicked({ code, year: c.year }); setMsg(null); }}>{c.year}</button>)}
          </div>
          {lastYear != null && <small className="rep-yearnote">Runs to the end of {lastYear}, the last year closed. Opens on the last ten years; choose an earlier start for a longer history. A dashed year has data missing: click it to see what.</small>}
        </div>
        <div className="filter-row"><span className="filter-k">Amount invested</span>
          <label className="rep-fee"><input type="number" inputMode="numeric" min={10000} max={1000000000} step={50000} value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-label="Amount invested, in the report currency" style={{ width: 140 }} /> {currency}
            <small>{amount.toLocaleString('en')} {currency}{inEur != null && currency !== 'EUR' ? `, about €${Math.round(inEur).toLocaleString('en')} at today's rate` : ''}. Pick an amount that fits the client: allowances such as the Dutch Box 3 tax-free sum are in euros.</small></label>
        </div>
        <div className="filter-row"><span className="filter-k">Trust fee</span>
          <label className="rep-fee"><input type="number" inputMode="decimal" min={0} max={10} step={0.1} value={fee} onChange={(e) => setFee(e.target.value)} aria-label="Trust fee, percent of the value a year" /> % of the value a year
            <small>Placeholder until the real fee schedule is supplied. Shown in the report.</small></label>
        </div>
        <p className="rep-fixed">{fmtMoney(amount, currency)} invested in the {d.market_returns?.find((m) => m.index_code === INDEX)?.index_name ?? 'MSCI World Index'}, in {CURRENCY_NAME[currency]}.{currency !== 'USD' && ' The index is published in US dollars: this return is worked out from it and the ECB\'s year-end exchange rates, so it includes the dollar\'s move.'}</p>
      </section>

      {ok ? (
        <>
          <div className="rep-actions">
            <button className="pill" disabled={busy !== null} onClick={email}>{busy === 'mail' ? 'Sending…' : 'Email me this report'}</button>
            <button className="pill quiet" disabled={busy !== null} onClick={pdf}>{busy === 'pdf' ? 'Opening…' : 'Download PDF'}</button>
            <button className="pill quiet" disabled={busy !== null} onClick={xlsx}>{busy === 'xlsx' ? 'Building…' : 'Download Excel'}</button>
            <span className="rep-actions-note">The email carries the PDF and an Excel of the raw values, sent to your own address.</span>
          </div>
          {msg && <p className={'rep-msg ' + (msg.ok ? 'ok' : 'bad')} role="status">{msg.text}</p>}
          <div className="report-desk"><ReportDocument d={d} r={ok} generatedOn={today()} /></div>
        </>
      ) : (
        <section className="rep-missing" aria-label="Not enough data">
          <h2>No report yet for {j?.name ?? 'this selection'}</h2>
          <p>{result.ok ? '' : result.text} A comparison is only shown when every rate it needs is stored with a source and a date, so a gap is never counted as zero.</p>
          {!result.ok && result.missing.length > 0 && (
            <ul>{result.missing.slice(0, 14).map((m, i) => <li key={i}>{m.text}</li>)}{result.missing.length > 14 && <li>and {result.missing.length - 14} more</li>}</ul>
          )}
        </section>
      )}
    </>
  );
}
